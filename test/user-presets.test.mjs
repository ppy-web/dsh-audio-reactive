import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPreset, applyPresetValues, defaults, normalize, presetKeys, presets } from '../src/options.js'
import {
  mergePresets, parsePresetFile, presetValuesFromSettings,
  sanitizePresetList, serializePresets,
} from '../src/user-presets.js'

test('a saved preset snapshots every preset-controlled value', () => {
  const saved = presetValuesFromSettings(defaults)
  assert.deepEqual(Object.keys(saved).sort(), [...presetKeys].sort())
  assert.equal(saved.mode, defaults.mode)
})

test('saved and imported presets keep only valid preset values', () => {
  const list = sanitizePresetList([
    { name: '  我的夜晚  ', values: { mode: 10, ledBars: true, bogus: 1 } },
    { name: '', values: { mode: 0 } },
    { values: { mode: 0 } },
    { name: '坏值', values: { mode: 999, mirror: 'x' } },
  ])
  assert.deepEqual(list.map(item => item.name), ['我的夜晚', '坏值'])
  assert.equal(list[0].values.mode, 10)
  assert.equal(list[0].values.ledBars, true)
  assert.equal('bogus' in list[0].values, false)
  assert.equal(list[1].values.mode, defaults.mode)
})

test('merging presets replaces a same-name entry', () => {
  const merged = mergePresets(
    [{ name: 'A', values: { mode: 4 } }, { name: 'B', values: { mode: 5 } }],
    [{ name: 'A', values: { mode: 10 } }, { name: 'C', values: { mode: 0 } }],
  )
  assert.deepEqual(merged.map(item => item.name), ['A', 'B', 'C'])
  assert.equal(merged[0].values.mode, 10)
})

test('the JSON export format round-trips and rejects foreign files', () => {
  const list = [{ name: '我的夜晚', values: { mode: 10, gradient: 'prism' } }]
  const file = serializePresets(list)
  const parsed = parsePresetFile(file)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].name, '我的夜晚')
  assert.equal(parsed[0].values.mode, 10)
  assert.throws(() => parsePresetFile('{"type":"other","version":1,"presets":[]}'))
  assert.throws(() => parsePresetFile('not json'))
})

test('applying a user preset resets keys it does not define', () => {
  const bass = normalize(applyPreset({ ...defaults }, 'bass'))
  const user = normalize(applyPresetValues(bass, { mode: 10 }, 'user:我的夜晚'))
  assert.equal(user.preset, 'user:我的夜晚')
  assert.equal(user.mode, 10)
  assert.equal(user.minFreq, defaults.minFreq)
  assert.equal(user.maxFreq, defaults.maxFreq)
  assert.equal(normalize({ ...defaults, preset: 'user:我的夜晚' }).preset, 'user:我的夜晚')
})

test('the built-in default preset is 默认柔光 and matches its values', () => {
  const soft = presets.find(item => item.id === 'soft')
  assert.equal(defaults.preset, 'soft')
  for (const [key, value] of Object.entries(soft.values)) assert.equal(defaults[key], value)
})
