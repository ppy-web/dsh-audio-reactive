const MUSIC = '[data-shell-overlay] audio.mp-audio-host, audio.mp-audio-host'
const DEVICE_ROUTE = 'plugins/dsh-audio-reactive/device-audio'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

function desktopOrigin(win) { return win.location?.protocol === 'dsh-app:' && win.location.hostname === 'app' }

export function supportsNativeDevice(win, doc) {
  if (desktopOrigin(win)) return doc.documentElement?.dataset.platform === 'win32'
  return LOOPBACK.has(win.location?.hostname) && /^Win/i.test(win.navigator?.platform ?? '')
}

export function monitorSignal(context, input, clock) {
  const meter = context.createAnalyser()
  meter.fftSize = 1024
  input.connect(meter)
  const samples = new Float32Array(meter.fftSize)
  let lastSound = -Infinity
  return {
    read() {
      if (context.state !== 'running') return null
      meter.getFloatTimeDomainData(samples)
      const energy = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
      const now = clock.now()
      if (energy > 0.000004) lastSound = now
      return now - lastSound < 850 ? input : null
    },
    dispose() { try { input.disconnect(meter) } catch {} },
  }
}

export function createMusicInput(win, doc) {
  let context
  let mix
  let meter
  const media = new Map()
  const unsupported = new WeakSet()

  function release(element, { stream, input, retire }) {
    retire()
    input?.disconnect()
    for (const track of stream.getTracks()) track.stop()
    media.delete(element)
  }

  function track(element) {
    const capture = element.captureStream ?? element.mozCaptureStream
    if (typeof capture !== 'function') { unsupported.add(element); return }
    let stream
    try {
      stream = capture.call(element)
      if (!context) {
        context = new win.AudioContext()
        mix = context.createGain()
        meter = monitorSignal(context, mix, win.performance)
        void context.resume().catch(() => {})
      }
      const entry = { stream, input: null, audioTrack: null, retire: () => {} }
      const connect = () => {
        const next = stream.getAudioTracks().find(track => track.readyState === 'live')
        if (entry.audioTrack === next) return
        entry.input?.disconnect()
        entry.input = null
        entry.audioTrack = next
        if (next) {
          try {
            entry.input = context.createMediaStreamSource(new win.MediaStream([next]))
            entry.input.connect(mix)
          } catch { /* Chromium may withhold a cross-origin track. */ }
        }
      }
      stream.addEventListener('addtrack', connect)
      stream.addEventListener('removetrack', connect)
      entry.retire = () => {
        stream.removeEventListener('addtrack', connect)
        stream.removeEventListener('removetrack', connect)
      }
      media.set(element, entry)
      connect()
    } catch {
      for (const track of stream?.getTracks() ?? []) track.stop()
      unsupported.add(element)
    }
  }

  function dispose() {
    for (const [element, entry] of media) release(element, entry)
    meter?.dispose()
    meter = undefined
    mix = undefined
    if (context && context.state !== 'closed') void context.close().catch(() => {})
    context = undefined
  }

  return {
    read() {
      const playing = new Set([...doc.querySelectorAll(MUSIC)].filter(audio =>
        !audio.paused && !audio.ended && !audio.muted && audio.volume > 0 && audio.readyState >= 2))
      for (const [audio, entry] of media) if (!playing.has(audio)) release(audio, entry)
      for (const audio of playing) if (!media.has(audio) && !unsupported.has(audio)) track(audio)
      if (!playing.size) {
        dispose()
        return { source: null, waiting: false }
      }
      const source = meter?.read() ?? null
      return { source, waiting: !source }
    },
    unlock() { if (context?.state === 'suspended') void context.resume().catch(() => {}) },
    dispose,
  }
}

// Browser microphone capture for the host's dictation flow and for an optional
// standalone microphone visualiser. The host keeps its recording stream private,
// so when dictation starts this opens a second shared capture of the same default
// input device. Browsers share the microphone between consumers, and permission
// is already granted while the host is recording.
export function createMicInput(win, publish = () => {}) {
  let context
  let stream
  let meter
  let desired = null
  let status = 'off'
  let revision = 0
  let failed = false
  let currentDevice = ''

  function setStatus(next) {
    if (next === status) return
    status = next
    publish(next)
  }

  function teardown(reason = 'off') {
    const activeContext = context
    meter?.dispose()
    meter = undefined
    context = undefined
    for (const track of stream?.getTracks?.() ?? []) { try { track.stop() } catch { /* Already stopped. */ } }
    stream = undefined
    if (activeContext && activeContext.state !== 'closed') void activeContext.close().catch(() => {})
    setStatus(reason)
  }

  async function open(device) {
    const run = ++revision
    setStatus('starting')
    let acquired
    try {
      const devices = win.navigator?.mediaDevices
      if (!devices?.getUserMedia) throw failure('unavailable')
      acquired = await devices.getUserMedia({
        audio: {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          ...(device ? { deviceId: { exact: device } } : {}),
        },
        video: false,
      })
    } catch (error) {
      if (run !== revision || desired === null) return
      failed = true
      setStatus(error?.name === 'NotAllowedError' || error?.code === 'denied' ? 'denied' : 'unavailable')
      return
    }
    if (run !== revision || desired === null) {
      for (const track of acquired.getTracks()) { try { track.stop() } catch { /* Already stopped. */ } }
      return
    }
    try {
      const nextContext = new win.AudioContext()
      context = nextContext
      stream = acquired
      const resume = nextContext.resume?.()
      void resume?.catch?.(() => {})
      const input = nextContext.createMediaStreamSource(acquired)
      meter = monitorSignal(nextContext, input, win.performance)
      await resume
      if (run !== revision || desired === null) { teardown('off'); return }
      setStatus('live')
    } catch {
      if (run === revision) { teardown('unavailable'); failed = true }
    }
  }

  return {
    /**
     * Drive and read the microphone according to the current need.
     * @param dictation - the host is recording speech; the microphone is the primary source.
     * @param manual - the user enabled the standalone microphone visualiser.
     * @returns the analyser branch while sound is present, otherwise null.
     */
    read({ dictation = false, manual = false, device = '' } = {}) {
      const need = dictation ? 'dictation' : manual ? 'manual' : null
      if (need !== desired || (need !== null && device !== currentDevice)) {
        revision++
        desired = need
        currentDevice = device
        failed = false
        if (stream || context) teardown('off')
        if (need) void open(device)
        else setStatus('off')
      }
      return meter?.read() ?? null
    },
    status: () => status,
    dispose() { revision++; desired = null; currentDevice = ''; failed = false; teardown('off') },
  }
}

function failure(code) { return Object.assign(new Error(code), { code }) }
function stopTracks(stream) { for (const track of stream?.getTracks() ?? []) track.stop() }

async function sharedInput(win, signal, context, ended) {
  const devices = win.navigator.mediaDevices
  if (!devices?.getDisplayMedia) throw failure('unsupported')
  const stream = await devices.getDisplayMedia({
    video: true, audio: { suppressLocalAudioPlayback: false }, systemAudio: 'include',
  })
  if (signal.aborted) { stopTracks(stream); signal.throwIfAborted() }
  const tracks = stream.getAudioTracks()
  if (!tracks.length) { stopTracks(stream); throw failure('no-audio-track') }
  try {
    const input = context.createMediaStreamSource(new win.MediaStream(tracks))
    const end = () => ended('sharing-ended')
    for (const track of stream.getTracks()) track.addEventListener('ended', end, { once: true })
    return { input, dispose() {
      for (const track of stream.getTracks()) track.removeEventListener('ended', end)
      input.disconnect()
      stopTracks(stream)
    } }
  } catch (error) {
    stopTracks(stream)
    throw error
  }
}

async function nativeInput(win, signal, context, ended) {
  const url = new URL(DEVICE_ROUTE, win.document.baseURI)
  const response = await win.fetch(url, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'x-dsh-audio-reactive': desktopOrigin(win) ? 'desktop' : 'device' },
  })
  if (!response.ok) throw failure(response.status === 409 ? 'device-busy' : 'native-unavailable')
  if (response.headers.get('content-type') !== 'application/x-dsh-loopback' || !response.body) throw failure('native-unavailable')
  const reader = response.body.getReader()
  const input = context.createGain()
  const sources = new Set()
  let scheduled = 0
  let rate = 0
  let carry = new Uint8Array()

  function enqueue(chunk) {
    const bytes = new Uint8Array(carry.length + chunk.length)
    bytes.set(carry)
    bytes.set(chunk, carry.length)
    const view = new DataView(bytes.buffer)
    let offset = 0
    if (!rate && bytes.length >= 4) {
      rate = view.getUint32(0, true)
      if (rate < 8000 || rate > 192000) throw failure('native-unavailable')
      offset = 4
    }
    const frames = Math.floor((bytes.length - offset) / 4)
    carry = bytes.slice(offset + frames * 4)
    if (!frames || context.state !== 'running') return
    if (scheduled > context.currentTime + 0.35) return
    const audio = context.createBuffer(2, frames, rate)
    const left = audio.getChannelData(0)
    const right = audio.getChannelData(1)
    for (let frame = 0; frame < frames; frame++, offset += 4) {
      left[frame] = view.getInt16(offset, true) / 32768
      right[frame] = view.getInt16(offset + 2, true) / 32768
    }
    const source = context.createBufferSource()
    source.buffer = audio
    source.connect(input)
    sources.add(source)
    source.onended = () => { sources.delete(source); source.disconnect() }
    const at = Math.max(context.currentTime + 0.025, scheduled)
    source.start(at)
    scheduled = at + audio.duration
  }

  void (async () => {
    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        enqueue(value)
      }
      if (!signal.aborted) ended('device-ended')
    } catch {
      if (!signal.aborted) ended('device-ended')
    } finally {
      reader.releaseLock()
    }
  })()
  return {
    input,
    dispose() {
      for (const source of sources) { try { source.stop() } catch {} source.disconnect() }
      sources.clear()
      input.disconnect()
    },
  }
}

export function createDeviceInput(win, publish) {
  let session
  function stop(status = 'off') {
    const active = session
    session = undefined
    active?.abort.abort()
    active?.meter?.dispose()
    active?.device?.dispose()
    if (active?.context?.state && active.context.state !== 'closed') void active.context.close().catch(() => {})
    publish(status)
  }

  return {
    async start(kind) {
      stop()
      const active = { abort: new AbortController() }
      session = active
      publish('starting')
      try {
        const context = active.context = new win.AudioContext()
        const resume = context.resume()
        void resume.catch(() => {})
        const open = kind === 'native' ? nativeInput : sharedInput
        const device = await open(win, active.abort.signal, context, reason => { if (session === active) stop(reason) })
        if (session !== active) { device.dispose(); return }
        active.device = device
        await resume
        if (session !== active) return
        active.meter = monitorSignal(context, device.input, win.performance)
        publish(kind === 'native' ? 'native' : 'shared')
      } catch (error) {
        if (session !== active) return
        stop(error.code && typeof error.code === 'string'
          ? error.code : error.name === 'NotAllowedError' || error.name === 'AbortError' ? 'denied' : 'unavailable')
      }
    },
    read() { return session?.meter?.read() ?? null },
    stop,
  }
}
