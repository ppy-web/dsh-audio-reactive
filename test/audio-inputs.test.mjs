import assert from 'node:assert/strict'
import test from 'node:test'
import { createDeviceInput, createMicInput, createMusicInput, supportsNativeDevice } from '../src/audio-inputs.js'

function audioFixture() {
  let level = 0
  let now = 0
  const contexts = []
  const tracks = []
  const win = {
    performance: { now: () => now },
    navigator: { mediaDevices: {} },
    MediaStream: class extends EventTarget {
      constructor(owned) { super(); this.owned = owned }
      getTracks() { return this.owned }
      getAudioTracks() { return this.owned.filter(track => track.kind === 'audio') }
    },
    AudioContext: class {
      state = 'suspended'
      constructor() { contexts.push(this) }
      resume() { this.state = 'running'; return Promise.resolve() }
      close() { this.state = 'closed'; return Promise.resolve() }
      createGain() { return { context: this, connect() {}, disconnect() {} } }
      createAnalyser() { return { getFloatTimeDomainData(values) { values.fill(level) } } }
      createMediaStreamSource() { return this.createGain() }
    },
  }
  const track = (kind = 'audio') => {
    const value = Object.assign(new EventTarget(), {
      kind, readyState: 'live', stop() { this.readyState = 'ended' },
    })
    tracks.push(value)
    return value
  }
  return { win, track, contexts, tracks, at(time, sample = 0) { now = time; level = sample } }
}

test('device sharing publishes the signal only when sound plays and releases every track on revocation', async () => {
  const { win, contexts, track, at } = audioFixture()
  const audio = track()
  const video = track('video')
  const statuses = []
  win.navigator.mediaDevices.getDisplayMedia = async options => {
    assert.equal(options.systemAudio, 'include')
    assert.equal(options.audio.suppressLocalAudioPlayback, false)
    return new win.MediaStream([audio, video])
  }
  const device = createDeviceInput(win, status => statuses.push(status))
  await device.start('shared')
  assert.equal(statuses.at(-1), 'shared')
  assert.equal(device.read(), null)
  at(100, 0.1)
  assert.ok(device.read())
  at(1100)
  assert.equal(device.read(), null)
  video.dispatchEvent(new Event('ended'))
  assert.equal(audio.readyState, 'ended')
  assert.equal(video.readyState, 'ended')
  assert.equal(contexts[0].state, 'closed')
  assert.equal(statuses.at(-1), 'sharing-ended')
})

test('cancelled or video-only share grants do not leave any capture running', async () => {
  const { win, track, contexts } = audioFixture()
  const statuses = []
  const device = createDeviceInput(win, state => statuses.push(state))
  const videoOnly = track('video')
  win.navigator.mediaDevices.getDisplayMedia = async () => new win.MediaStream([videoOnly])
  await device.start('shared')
  assert.equal(statuses.at(-1), 'no-audio-track')
  assert.equal(videoOnly.readyState, 'ended')

  const grant = Promise.withResolvers()
  const lateAudio = track()
  win.navigator.mediaDevices.getDisplayMedia = () => grant.promise
  const pending = device.start('shared')
  device.stop()
  grant.resolve(new win.MediaStream([lateAudio]))
  await pending
  assert.equal(statuses.at(-1), 'off')
  assert.equal(lateAudio.readyState, 'ended')
  assert.ok(contexts.every(ctx => ctx.state === 'closed'))
})

test('both music panel decks contribute and pausing retires only the captured copies', () => {
  const { win, contexts, track, at } = audioFixture()
  const first = track()
  const second = track()
  const audio = audioTrack => ({
    paused: false, ended: false, muted: false, volume: 1, readyState: 4,
    captureStream: () => new win.MediaStream([audioTrack]),
  })
  const one = audio(first), two = audio(second)
  const music = createMusicInput(win, { querySelectorAll: () => [one, two] })
  at(0, 0.1)
  assert.ok(music.read().source)
  assert.equal(contexts.length, 1)
  one.paused = true
  assert.ok(music.read().source)
  assert.equal(first.readyState, 'ended')
  assert.equal(second.readyState, 'live')
  two.paused = true
  assert.equal(music.read().source, null)
  assert.equal(second.readyState, 'ended')
  assert.equal(contexts[0].state, 'closed')
})

test('the microphone follows dictation or manual needs and releases capture when idle', async () => {
  const { win, contexts, track, at } = audioFixture()
  const micTrack = track()
  let calls = 0
  win.navigator.mediaDevices.getUserMedia = async constraints => {
    calls++
    assert.equal(constraints.video, false)
    assert.ok(constraints.audio && typeof constraints.audio === 'object')
    return new win.MediaStream([micTrack])
  }
  const statuses = []
  const mic = createMicInput(win, status => statuses.push(status))

  assert.equal(mic.read({}), null)
  assert.equal(mic.status(), 'off')

  assert.equal(mic.read({ dictation: true }), null)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(statuses.at(-1), 'live')
  at(100, 0.1)
  assert.ok(mic.read({ dictation: true }))
  at(1200)
  assert.equal(mic.read({ dictation: true }), null)

  // Leaving dictation releases the shared microphone capture.
  assert.equal(mic.read({}), null)
  assert.equal(micTrack.readyState, 'ended')
  assert.equal(contexts[0].state, 'closed')
  assert.equal(statuses.at(-1), 'off')
  assert.equal(calls, 1)

  // A permission failure is reported and does not retry inside the same need.
  win.navigator.mediaDevices.getUserMedia = async () => {
    calls++
    throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
  }
  mic.read({ manual: true })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(statuses.at(-1), 'denied')
  assert.equal(mic.read({ manual: true }), null)
  assert.equal(calls, 2)
  mic.read({})
  assert.equal(statuses.at(-1), 'off')
})

test('the Windows Desktop app origin can use local capture without exposing it to remote pages', () => {
  const document = { documentElement: { dataset: { platform: 'win32' } } }
  assert.equal(supportsNativeDevice({ location: new URL('dsh-app://app/') }, document), true)
  assert.equal(supportsNativeDevice({ location: new URL('https://remote.example/'), navigator: { platform: 'Win32' } }, document), false)
})
