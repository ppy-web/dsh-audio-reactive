import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { allowsDeviceAudio, registerDeviceAudio } from '../native/device-route.js'

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
  assert.equal(allowsDeviceAudio(desktop), false)
  desktop.headers.cookie = 'dsh-auth-test=host-issued'
  assert.equal(allowsDeviceAudio(desktop), true)
  desktop.headers.origin = 'https://elsewhere.test'
  assert.equal(allowsDeviceAudio(desktop), false)
})

test('the native stream has one owner and disconnecting stops its helper', async () => {
  let handler
  let child
  const stopped = Promise.withResolvers()
  const unregister = registerDeviceAudio({
    register(value) { handler = value.handler; return () => {} },
  }, () => {
    child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), exitCode: null, signalCode: null })
    child.kill = () => { child.signalCode = 'SIGTERM'; stopped.resolve(); return true }
    const bytes = Buffer.alloc(8)
    bytes.writeUInt32LE(48000)
    child.stdout.write(bytes)
    return child
  }, 'win32')
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const headers = { origin, 'sec-fetch-site': 'same-origin', 'x-dsh-audio-reactive': 'device' }
  try {
    const response = await fetch(origin, { method: 'POST', headers })
    assert.equal(response.status, 200)
    const reader = response.body.getReader()
    assert.equal(Buffer.from((await reader.read()).value).readUInt32LE(), 48000)
    assert.equal((await fetch(origin, { method: 'POST', headers })).status, 409)
    await reader.cancel()
    await stopped.promise
    assert.equal(child.signalCode, 'SIGTERM')
  } finally {
    unregister()
    await new Promise(resolve => server.close(resolve))
  }
})
