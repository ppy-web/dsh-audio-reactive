import { spawn } from 'node:child_process'
import { win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const PATH = '/plugins/dsh-audio-reactive/device-audio'
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOCAL_HOSTNAME = new Set(['localhost', '127.0.0.1', '[::1]'])
const PROXY_HEADERS = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip']

export function allowsDeviceAudio(req) {
  if (req.method !== 'POST' || !LOOPBACK.has(req.socket?.remoteAddress)
    || PROXY_HEADERS.some(key => key in req.headers)) return false
  try {
    if (typeof req.headers.host !== 'string' || !LOCAL_HOSTNAME.has(new URL(`http://${req.headers.host}`).hostname)) return false
    if (req.headers['x-dsh-audio-reactive'] === 'desktop') {
      // DSH Desktop strips Origin and Sec-Fetch-Site and attaches its private host session cookie;
      // real session credential verification is enforced separately via webServer auth + connection.admit().
      return req.headers.origin === undefined && req.headers['sec-fetch-site'] === undefined
    }
    if (req.headers['x-dsh-audio-reactive'] !== 'device' || req.headers['sec-fetch-site'] !== 'same-origin') return false
    const origin = new URL(req.headers.origin)
    return ['http:', 'https:'].includes(origin.protocol) && LOCAL_HOSTNAME.has(origin.hostname) && origin.host === req.headers.host
      && origin.origin === req.headers.origin
  } catch { return false }
}

/** Verify the real DSH session credential (Web token cookie or Desktop session cookie) and require an active owner Peer. */
export function admitDeviceAudio(req, connection, peer) {
  if (typeof connection?.admit !== 'function') return { status: 503 }
  const admission = connection.admit(req)
  if (!admission || 'rejection' in admission) return { status: admission?.rejection ?? 401 }
  const resolved = admission.peer
  if (!resolved || resolved.signal?.aborted) return { status: 401 }
  if (peer !== undefined && (peer.signal?.aborted || peer.principal?.kind !== 'owner')) {
    return { status: peer.signal?.aborted ? 401 : 403 }
  }
  if (resolved.principal?.kind !== 'owner') return { status: 403 }
  return { status: 200, peer: resolved }
}

function status(res, code) {
  res.statusCode = code
  res.setHeader('cache-control', 'no-store')
  res.end()
}

function startCapture() {
  const source = fileURLToPath(new URL('./WindowsLoopback.cs', import.meta.url)).replaceAll("'", "''")
  const ps = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return spawn(ps, ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference='Stop'; Add-Type -Path '${source}'; [DshAudioReactive.Loopback]::Stream()`], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  })
}

export function registerDeviceAudio(webServer, connection, launch = startCapture, platform = process.platform) {
  let active
  const unregister = webServer.register({
    kind: 'exact', path: PATH, auth: 'required',
    handler(req, res, peer) {
      const auth = admitDeviceAudio(req, connection, peer)
      if (auth.status !== 200) { status(res, auth.status); return }
      if (!allowsDeviceAudio(req)) { status(res, 403); return }
      if (platform !== 'win32') { status(res, 501); return }
      if (active) { status(res, 409); return }
      let child
      try { child = launch() } catch { status(res, 503); return }
      const timeout = setTimeout(() => finish(503), 8000)
      const close = () => finish()
      active = close
      const peerSignal = auth.peer?.signal
      peerSignal?.addEventListener?.('abort', close, { once: true })
      function finish(errorCode) {
        if (active !== close) return
        active = undefined
        clearTimeout(timeout)
        peerSignal?.removeEventListener?.('abort', close)
        req.off('aborted', close)
        res.off('close', close)
        if (child.exitCode === null && child.signalCode === null) child.kill()
        if (res.destroyed || res.writableEnded) return
        if (!res.headersSent) status(res, errorCode ?? 503)
        else res.end()
      }
      req.once('aborted', close)
      res.once('close', close)
      child.once('error', () => finish(503))
      child.once('close', () => finish(503))
      child.stdout.on('data', chunk => {
        if (active !== close) return
        if (!res.headersSent) {
          clearTimeout(timeout)
          res.setHeader('content-type', 'application/x-dsh-loopback')
          res.setHeader('cache-control', 'no-store')
          res.setHeader('x-content-type-options', 'nosniff')
        }
        if (res.writableLength > 192000) { finish(); return }
        res.write(chunk)
      })
    },
  })
  return () => { active?.(); unregister() }
}
