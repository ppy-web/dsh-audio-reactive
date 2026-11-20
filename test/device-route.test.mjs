import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { admitDeviceAudio, allowsDeviceAudio, registerDeviceAudio } from '../native/device-route.js'

function ownerPeer(controller = new AbortController()) {
  return { id: 'owner-peer', principal: { kind: 'owner' }, signal: controller.signal }
}

test('loopback capture rejects remote, proxied and cross-origin clients', () => {
  const request = {
    method: 'POST', socket: { remoteAddress: '127.0.0.1' },
    headers: {
      host: '127.0.0.1:8000', origin: 'http://127.0.0.1:8000',
      'sec-fetch-site': 'same-origin', 'x-dsh-audio-reactive': 'device',
    },
  }
  assert.equal(allowsDeviceAudio(request), true)
  assert.equal(allowsDeviceAudio({ ...request, method: 'GET' }), false)
  assert.equal(allowsDeviceAudio({ ...request, socket: { remoteAddress: '192.168.1.2' } }), false)
  assert.equal(allowsDeviceAudio({ ...request, headers: { ...request.headers, origin: 'https://elsewhere.test' } }), false)
  assert.equal(allowsDeviceAudio({ ...request, headers: { ...request.headers, 'x-forwarded-for': '192.168.1.8' } }), false)
  const desktop = { ...request, headers: { host: request.headers.host, 'x-dsh-audio-reactive': 'desktop' } }
  assert.equal(allowsDeviceAudio(desktop), true)
  desktop.headers.origin = 'https://elsewhere.test'
  assert.equal(allowsDeviceAudio(desktop), false)
})

test('session admission verifies real DSH credentials and fails closed', () => {
  const validCookie = 'dsh-desktop-session=real-secret'
  const peer = ownerPeer()
  const connection = {
    admit(req) {
      return req.headers.cookie === validCookie ? { peer } : { rejection: 401 }
    },
  }
  const req = { headers: { cookie: validCookie } }
  assert.equal(admitDeviceAudio(req, null).status, 503)
  assert.equal(admitDeviceAudio({ headers: { cookie: 'dsh-auth-fake=forged' } }, connection).status, 401)
  assert.equal(admitDeviceAudio({ headers: { cookie: 'dsh-desktop-session=forged' } }, connection).status, 401)
  assert.equal(admitDeviceAudio(req, connection).status, 200)
  assert.equal(admitDeviceAudio(req, { admit: () => ({ peer: { principal: { kind: 'guest' }, signal: new AbortController().signal } }) }).status, 403)
  const revoked = new AbortController()
  revoked.abort()
  assert.equal(admitDeviceAudio(req, { admit: () => ({ peer: ownerPeer(revoked) }) }).status, 401)
})

test('route registers auth required, rejects forged cookies, and stops helper on disconnect or peer revoke', async () => {
  let route
  let child
  let stopped
  const validWebCookie = 'dsh-auth-real=signed-web-token'
  const validDesktopCookie = 'dsh-desktop-session=real-desktop-secret'
  let currentPeerController = new AbortController()
  const connection = {
    admit(req) {
      const cookie = req.headers.cookie
      if (cookie === validWebCookie || cookie === validDesktopCookie) {
        return { peer: ownerPeer(currentPeerController) }
      }
      return { rejection: 401 }
    },
  }
  const unregister = registerDeviceAudio({
    register(value) { route = value; return () => {} },
  }, connection, () => {
    stopped = Promise.withResolvers()
    child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), exitCode: null, signalCode: null })
    child.kill = () => { child.signalCode = 'SIGTERM'; stopped.resolve(); return true }
    const bytes = Buffer.alloc(8)
    bytes.writeUInt32LE(48000)
    child.stdout.write(bytes)
    return child
  }, 'win32')
  assert.equal(route.auth, 'required')

  const server = createServer((req, res) => route.handler(req, res))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const webHeaders = {
    origin, 'sec-fetch-site': 'same-origin', 'x-dsh-audio-reactive': 'device',
    cookie: validWebCookie,
  }
  try {
    // Unauthenticated or forged desktop/web cookies must be rejected with 401
    assert.equal((await fetch(origin, {
      method: 'POST', headers: { 'x-dsh-audio-reactive': 'desktop', cookie: 'dsh-auth-test=forged' },
    })).status, 401)
    assert.equal((await fetch(origin, {
      method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin', 'x-dsh-audio-reactive': 'device' },
    })).status, 401)

    // Authenticated Web session succeeds, holds single owner lock, and cleans up on cancel
    const response = await fetch(origin, { method: 'POST', headers: webHeaders })
    assert.equal(response.status, 200)
    const reader = response.body.getReader()
    assert.equal(Buffer.from((await reader.read()).value).readUInt32LE(), 48000)
    assert.equal((await fetch(origin, { method: 'POST', headers: webHeaders })).status, 409)
    await reader.cancel()
    await stopped.promise
    assert.equal(child.signalCode, 'SIGTERM')

    // Authenticated Desktop forwarded request succeeds and stops if session peer is revoked
    const desktopRes = await fetch(origin, {
      method: 'POST', headers: { 'x-dsh-audio-reactive': 'desktop', cookie: validDesktopCookie },
    })
    assert.equal(desktopRes.status, 200)
    const desktopReader = desktopRes.body.getReader()
    assert.equal(Buffer.from((await desktopReader.read()).value).readUInt32LE(), 48000)
    currentPeerController.abort()
    await stopped.promise
    assert.equal(child.signalCode, 'SIGTERM')
    await desktopReader.cancel()
  } finally {
    unregister()
    await new Promise(resolve => server.close(resolve))
  }
})
