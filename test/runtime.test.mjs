import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { applyPreset, defaults, general, groups, normalize, presetKeys, presets } from '../src/options.js'
import { createRuntime } from '../src/runtime.js'

function browserFixture() {
  let now = 0
  let level = 0
  let interval
  let voicePhase
  let hostDialog
  let micAllowed = false
  const storage = new Map()
  const motion = Object.assign(new EventTarget(), { matches: false })
  const win = Object.assign(new EventTarget(), {
    matchMedia: () => motion,
    performance: { now: () => now },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    setInterval: callback => { interval = callback; return 1 },
    clearInterval: () => { interval = undefined },
  })
  win.MediaStream = class extends EventTarget {
    constructor(owned) { super(); this.owned = owned }
    getTracks() { return this.owned }
    getAudioTracks() { return this.owned }
  }
  win.AudioContext = class {
    state = 'suspended'
    resume() { this.state = 'running'; return Promise.resolve() }
    close() { this.state = 'closed'; return Promise.resolve() }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createAnalyser() {
      return { fftSize: 1024, getFloatTimeDomainData(values) { values.fill(level) } }
    }
  }
  win.navigator = {
    mediaDevices: {
      getUserMedia: async () => {
        if (!micAllowed) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
        const track = Object.assign(new EventTarget(), {
          kind: 'audio', readyState: 'live', stop() { this.readyState = 'ended' },
        })
        win.lastTrack = track
        return new win.MediaStream([track])
      },
    },
  }
  const chat = {
    getClientRects: () => [{}],
    closest: () => null,
    querySelector: () => ({ getAttribute: () => voicePhase }),
  }
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    hasFocus: () => true,
    querySelectorAll: () => [chat],
    querySelector: selector => selector.startsWith('[role=') ? hostDialog : null,
  })
  return {
    win, doc, chat, motion,
    phase: value => { voicePhase = value },
    dialog: value => { hostDialog = value },
    grantMic: () => { micAllowed = true },
    at: (time, sample = 0) => { now = time; level = sample; interval?.() },
  }
}

test('the browser bundle supplies a Cordis plugin through the DSH module factory', async () => {
  let entry
  const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  runInNewContext(code, { window: { __ModuleLoader__: { load: value => { entry = value } } } })
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(entry.id, packageJson.name)
  const plugin = entry.factory(dependency => {
    assert.ok(['react', 'react-dom'].includes(dependency), `unexpected runtime import ${dependency}`)
    return {}
  })
  assert.equal(typeof plugin.apply, 'function')
})

test('immersion requires continuous PCM and idle time, and exits on activity, pause or recording', () => {
  const fixture = browserFixture()
  const runtime = createRuntime(fixture.win, fixture.doc)
  const dispose = runtime.start()
  const source = {}
  let active = null
  runtime.setPlayback({ getPcmPlaybackSource: () => active })
  runtime.setSettings({ ...defaults, immersive: true, idleSeconds: 5 })
  fixture.at(20_000)
  assert.equal(runtime.getSnapshot().immersive, false)

  active = source
  fixture.at(21_000)
  assert.equal(runtime.getSnapshot().source, source)
  fixture.at(25_999)
  assert.equal(runtime.getSnapshot().immersive, false)
  fixture.at(26_000)
  assert.equal(runtime.getSnapshot().immersive, true)
  fixture.win.dispatchEvent(new Event('keydown'))
  assert.equal(runtime.getSnapshot().immersive, false)

  fixture.at(27_000)
  fixture.at(32_000)
  assert.equal(runtime.getSnapshot().immersive, true)
  active = null
  fixture.at(32_100)
  assert.equal(runtime.getSnapshot().immersive, false)
  assert.equal(runtime.getSnapshot().source, null)

  active = source
  fixture.phase('recording')
  fixture.at(33_000)
  assert.equal(runtime.getSnapshot().phase, 'recording')
  assert.equal(runtime.getSnapshot().source, null)
  assert.equal(runtime.getSnapshot().immersive, false)
  dispose()
  assert.equal(runtime.getSnapshot().chat, null)
  assert.equal(runtime.getSnapshot().phase, '')
})

test('the microphone follows host dictation while recording and keeps immersion closed', async () => {
  const fixture = browserFixture()
  fixture.grantMic()
  const runtime = createRuntime(fixture.win, fixture.doc)
  const dispose = runtime.start()
  runtime.setSettings({ ...defaults, sourceDictation: true, immersive: true, idleSeconds: 5 })
  fixture.phase('recording')
  fixture.at(1_000, 0.2)
  await new Promise(resolve => setTimeout(resolve, 0))
  fixture.at(1_100, 0.2)
  const snapshot = runtime.getSnapshot()
  assert.equal(snapshot.phase, 'recording')
  assert.ok(snapshot.source)
  assert.equal(snapshot.sourceKind, 'dictation')
  assert.equal(snapshot.micStatus, 'live')
  assert.equal(snapshot.immersive, false)

  fixture.phase('transcribing')
  fixture.at(1_200)
  assert.equal(runtime.getSnapshot().source, null)
  assert.equal(runtime.getSnapshot().sourceKind, '')
  dispose()
  assert.equal(fixture.win.lastTrack.readyState, 'ended')
})

test('host settings and reduced motion keep the idle overlay closed', () => {  const { win, doc, motion, dialog, at } = browserFixture()
  const runtime = createRuntime(win, doc)
  const source = {}
  const dispose = runtime.start()
  runtime.setSettings({ immersive: true, idleSeconds: 5 })
  runtime.setPlayback({ getPcmPlaybackSource: () => source })
  dialog({})
  at(6_000)
  assert.equal(runtime.getSnapshot().immersive, false)
  dialog(null)
  motion.matches = true
  at(12_000)
  assert.equal(runtime.getSnapshot().immersive, false)
  assert.equal(runtime.getSnapshot().reducedMotion, true)
  dispose()
})

test('immersion can keep running while another app has focus, unless the option is off', () => {
  const fixture = browserFixture()
  const runtime = createRuntime(fixture.win, fixture.doc)
  const source = {}
  const dispose = runtime.start()
  runtime.setPlayback({ getPcmPlaybackSource: () => source })
  runtime.setSettings({ ...defaults, immersive: true, idleSeconds: 5, immersiveUnfocused: true })
  fixture.at(1_000)
  fixture.doc.hasFocus = () => false
  fixture.win.dispatchEvent(new Event('blur'))
  fixture.at(6_500)
  assert.equal(runtime.getSnapshot().immersive, true)

  runtime.setSettings({ ...defaults, immersive: true, idleSeconds: 5, immersiveUnfocused: false })
  fixture.doc.hasFocus = () => true
  fixture.at(7_000)
  fixture.doc.hasFocus = () => false
  fixture.win.dispatchEvent(new Event('blur'))
  fixture.at(20_000)
  assert.equal(runtime.getSnapshot().immersive, false)

  // A hidden page (minimized / tab hidden) still dismisses, even with the option on.
  runtime.setSettings({ ...defaults, immersive: true, idleSeconds: 5, immersiveUnfocused: true })
  fixture.doc.hasFocus = () => true
  fixture.at(21_000)
  fixture.at(27_000)
  assert.equal(runtime.getSnapshot().immersive, true)
  fixture.doc.hidden = true
  fixture.doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(runtime.getSnapshot().immersive, false)
  dispose()
})

test('every capsule-select field has a label, a usable default and labeled options', () => {
  const fields = { ...general, ...Object.assign({}, ...groups.map(([, entries]) => entries)) }
  const choiceFields = Object.entries(fields).filter(([, field]) => field.choices)
  assert.ok(choiceFields.length >= 12)
  for (const [key, field] of choiceFields) {
    assert.ok(field.label, `${key} has a visible label`)
    assert.ok(field.choices.some(([value]) => value === field.value), `${key} default belongs to its choices`)
    assert.ok(field.choices.every(([, title]) => typeof title === 'string' && title.length > 0), `${key} options are named`)
  }
  const ids = presets.map(preset => preset.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const preset of presets) {
    assert.equal(normalize({ ...defaults, ...preset.values, preset: preset.id }).preset, preset.id)
  }
})

test('switching between presets never leaks a value from the previous preset', () => {
  const ids = presets.map(preset => preset.id)
  for (const from of ids) {
    const start = normalize(applyPreset({ ...defaults }, from))
    for (const to of ids) {
      const switched = normalize(applyPreset(start, to))
      const target = presets.find(preset => preset.id === to)
      const expected = normalize({ ...defaults, ...target.values, preset: to })
      for (const key of presetKeys) {
        assert.equal(switched[key], expected[key], `${from} -> ${to} leaked ${key}`)
      }
      assert.equal(switched.preset, to)
    }
  }
})

test('valid Chinese UI choices persist, and invalid limits stay safe for Web Audio', () => {
  const { win, doc } = browserFixture()
  const runtime = createRuntime(win, doc)
  runtime.setSettings({ mode: 10, radial: true, colorStart: '#123456', minFreq: 5000, maxFreq: 1000 })
  const reloaded = createRuntime(win, doc).getSnapshot().settings
  assert.equal(reloaded.mode, 10)
  assert.equal(reloaded.radial, true)
  assert.equal(reloaded.colorStart, '#123456')
  assert.ok(reloaded.minFreq < reloaded.maxFreq)
  const repaired = normalize({ fftSize: 123, minDecibels: -10, maxDecibels: -30 })
  assert.equal(repaired.fftSize, defaults.fftSize)
  assert.ok(repaired.minDecibels < repaired.maxDecibels)
  assert.equal(defaults.immersiveOpacity, 90)
  assert.equal(defaults.immersiveBlur, 5)
  assert.equal(defaults.immersiveFit, 'cover')
  assert.equal(defaults.immersiveScale, 100)
  assert.equal(defaults.immersiveImage, '')
  assert.equal(defaults.immersive, true)
  assert.equal(defaults.idleSeconds, 15)
  assert.equal(defaults.immersiveUnfocused, true)
  assert.equal(defaults.preset, 'custom')
  assert.equal(defaults.sourceTts, true)
  assert.equal(defaults.sourceMusic, true)
  assert.equal(defaults.sourceDictation, true)
  assert.equal(defaults.micEnabled, false)
  assert.equal(defaults.micDevice, '')
  assert.equal(general.opacity.label, '效果能见度')
  assert.equal(general.opacity.min, 5)
  assert.equal(general.opacity.max, 60)
  assert.equal(defaults.opacity, 18)
  assert.ok(presets.length >= 10)
  assert.equal(normalize({ preset: 'nope' }).preset, 'custom')
  const preset = presets.find(item => item.id === 'neon')
  const applied = normalize({ ...defaults, ...preset.values, preset: preset.id })
  assert.equal(applied.preset, 'neon')
  assert.equal(applied.mode, 4)
  assert.equal(applied.ledBars, true)
  const immersive = normalize({ immersiveOpacity: 999, immersiveBlur: -3, immersiveScale: 999, immersiveFit: 'nope', immersiveImage: 'javascript:alert(1)' })
  assert.equal(immersive.immersiveOpacity, 100)
  assert.equal(immersive.immersiveBlur, 0)
  assert.equal(immersive.immersiveScale, 200)
  assert.equal(immersive.immersiveFit, 'cover')
  assert.equal(immersive.immersiveImage, '')
  assert.equal(normalize({ immersiveImage: 'data:image/webp;base64,AAAA' }).immersiveImage, 'data:image/webp;base64,AAAA')
  assert.equal(normalize({ micDevice: 'mic-123' }).micDevice, 'mic-123')
  assert.equal(normalize({ micDevice: 123 }).micDevice, '')
  assert.equal(normalize({ micDevice: 'x'.repeat(300) }).micDevice, '')
})
