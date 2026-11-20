import { defaults, normalize, presetKeys } from './options.js'

export const USER_PRESET_STORAGE_KEY = 'dsh-audio-reactive:presets:v1'
export const PRESET_FILE_TYPE = 'dsh-audio-reactive/presets'
export const PRESET_FILE_VERSION = 1
const NAME_LIMIT = 40

const cleanName = value => typeof value === 'string' ? value.trim().slice(0, NAME_LIMIT) : ''

/** Snapshot only the preset-controlled values of a full settings object. */
export function presetValuesFromSettings(settings) {
  const clean = normalize(settings)
  return Object.fromEntries(presetKeys.map(key => [key, clean[key]]))
}

/** Accept only well-formed, in-range presets; names are unique by last entry. */
export function sanitizePresetList(input) {
  if (!Array.isArray(input)) return []
  const byName = new Map()
  for (const item of input) {
    const name = cleanName(item?.name)
    if (!name || !item?.values || typeof item.values !== 'object') continue
    const clean = normalize({ ...defaults, ...item.values, preset: 'custom' })
    byName.set(name, {
      name,
      values: Object.fromEntries(presetKeys.map(key => [key, clean[key]])),
    })
  }
  return [...byName.values()]
}

/** Merge imported presets by name; an existing name is replaced. */
export function mergePresets(current, incoming) {
  const merged = sanitizePresetList(current)
  for (const preset of sanitizePresetList(incoming)) {
    const index = merged.findIndex(item => item.name === preset.name)
    if (index >= 0) merged[index] = preset
    else merged.push(preset)
  }
  return merged
}

/** Read the simple JSON export format. */
export function parsePresetFile(text) {
  const data = JSON.parse(text)
  if (data?.type !== PRESET_FILE_TYPE || data.version !== PRESET_FILE_VERSION || !Array.isArray(data.presets)) {
    throw new Error('unsupported preset file')
  }
  return sanitizePresetList(data.presets)
}

/** Write the simple JSON export format. */
export function serializePresets(list) {
  return JSON.stringify({
    type: PRESET_FILE_TYPE,
    version: PRESET_FILE_VERSION,
    presets: sanitizePresetList(list),
  }, null, 2)
}
