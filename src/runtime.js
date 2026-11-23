import { defaults, normalize } from './options.js'
import { createDeviceInput, createMicInput, createMusicInput, supportsNativeDevice } from './audio-inputs.js'

const STORAGE_KEY = 'dsh-audio-reactive:settings:v1'
const DEFAULTS_KEY = 'dsh-audio-reactive:defaults:v2'
const CHAT = '[data-conversation-content][data-conversation-region="chat"]'
const CAPTURE = '[data-composer-seat] [data-voice-activity]'
const HOST_DIALOG = '[role="dialog"][aria-modal="true"], dialog[open]:not([data-dsh-ar-immersive])'
const ACTIVE_CAPTURE = new Set(['requesting', 'recording', 'transcribing'])
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']
const SKIP_SIDEBAR_COL = '[data-sidebar-mask], [data-rightbar-col], [data-shell-bottom], [data-shell-overlay], [data-shell-leading], [data-side]'
const EMPTY_CHATS = []

function visibleChats(win, doc) {
  return [...doc.querySelectorAll(CHAT)].filter(node =>
    !node.closest('[hidden], [inert]')
    && node.getClientRects().length
    && win.getComputedStyle?.(node)?.visibility !== 'hidden')
}

function sameNodes(a, b) {
  return a.length === b.length && a.every((node, index) => node === b[index])
}

function findSidebar(win, doc, frame) {
  if (!frame) return null
  // The host's slot anchor uses display: contents. Mount on its rendered child.
  const slot = frame.querySelector(':scope > * > [data-slot="sidebar"]')
  let col = slot?.parentElement
  if (!col) {
    const children = [...frame.children]
    const toggle = doc.querySelector('[data-sidebar-toggle]')
    col = (toggle && children.find(child => child.contains?.(toggle)))
      || children.find(child => !child.matches?.(SKIP_SIDEBAR_COL)
        && !child.querySelector?.('[data-global-panel], [data-conversation-content]'))
  }
  if (!col?.clientWidth) return null
  const root = (slot ?? col).firstElementChild
  if (!root || root.closest?.('[hidden], [inert]') || !root.getClientRects?.().length
    || win.getComputedStyle?.(root)?.visibility === 'hidden') return null
  return root
}

function loadSettings(win) {
  try {
    const settings = normalize(JSON.parse(win.localStorage.getItem(STORAGE_KEY)))
    // The v2 defaults turn immersion on with a 15 second trigger. Apply that
    // once to settings saved under the earlier defaults without discarding the
    // user's other customisations.
    try {
      if (!win.localStorage.getItem(DEFAULTS_KEY)) {
        settings.immersive = true
        settings.idleSeconds = 15
        win.localStorage.setItem(DEFAULTS_KEY, '1')
      }
    } catch { /* Storage can be unavailable; defaults still apply. */ }
    return settings
  } catch { return { ...defaults } }
}

export function createRuntime(win, doc) {
  const listeners = new Set()
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)')
  let playback
  let timer
  let armedAt
  let started = false
  let snapshot = {
    settings: loadSettings(win), chats: EMPTY_CHATS, sidebar: null, frame: null, source: null, sourceKind: '', phase: '',
    deviceStatus: 'off', micStatus: 'off', musicWaiting: false,
    nativeDevice: supportsNativeDevice(win, doc),
    immersive: false, previewing: false, reducedMotion: motion.matches, saveFailed: false,
  }
  const music = createMusicInput(win, doc)
  const device = createDeviceInput(win, deviceStatus => publish({ deviceStatus }))
  const mic = createMicInput(win, micStatus => publish({ micStatus }))

  function publish(next) {
    if (Object.keys(next).every(key => next[key] === snapshot[key])) return
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }

  function refresh() {
    if (!started) return
    const { settings } = snapshot
    if (!settings.enabled || doc.hidden) {
      armedAt = undefined
      mic.read({})
      publish({ chats: EMPTY_CHATS, sidebar: null, frame: null, source: null, sourceKind: '', phase: '', immersive: false, reducedMotion: motion.matches })
      return
    }
    const foundChats = visibleChats(win, doc)
    const chats = foundChats.length === 0 ? EMPTY_CHATS : sameNodes(foundChats, snapshot.chats) ? snapshot.chats : foundChats
    const frame = doc.querySelector('[data-shell-overlay]')?.parentElement ?? null
    const sidebar = settings.showInSidebar ? findSidebar(win, doc, frame) : null
    const capture = chats.map(node => node.querySelector(CAPTURE)?.getAttribute('data-voice-activity'))
      .find(value => ACTIVE_CAPTURE.has(value))
    const phase = capture ?? ''
    let source = null
    let sourceKind = ''
    const panel = music.read()
    if (!phase) {
      source = device.read()
      if (source) sourceKind = 'device'
      if (!source && settings.sourceTts) {
        try { source = playback?.getPcmPlaybackSource?.() ?? null }
        catch { /* The optional producer can disappear during a host reload. */ }
        if (source) sourceKind = 'tts'
      }
      if (!source && settings.sourceMusic && panel.source) { source = panel.source; sourceKind = 'music' }
    }
    // The host's dictation keeps its recording stream private, so a shared
    // microphone capture follows it while recording. The standalone microphone
    // visualiser is a fallback after device, TTS and music.
    const dictation = settings.sourceDictation && phase === 'recording' && !motion.matches
    const manual = settings.micEnabled && !phase && !source && !motion.matches
    const micSource = mic.read({ dictation, manual, device: settings.micDevice })
    if (dictation && micSource) { source = micSource; sourceKind = 'dictation' }
    else if (manual && micSource) { source = micSource; sourceKind = 'mic' }
    // Losing window focus only blocks immersion unless the user opts into
    // keeping it while working in another app. A hidden page still stops it:
    // the overlay could not be seen and background capture should wind down.
    const blocked = !settings.immersive || !source || !!phase || motion.matches
      || (!settings.immersiveUnfocused && !doc.hasFocus())
      || !!doc.querySelector(HOST_DIALOG)
    if (blocked) armedAt = undefined
    const now = win.performance.now()
    if (!blocked && (armedAt === undefined || source !== snapshot.source)) armedAt = now
    publish({
      chats, sidebar, frame, source, sourceKind, phase, musicWaiting: panel.waiting,
      reducedMotion: motion.matches, previewing: !!doc.querySelector('[data-dsh-ar-settings]'),
      immersive: armedAt !== undefined && now - armedAt >= settings.idleSeconds * 1000,
    })
  }

  function syncTimer() {
    if (started && snapshot.settings.enabled) timer ??= win.setInterval(refresh, 100)
    else if (timer !== undefined) {
      win.clearInterval(timer)
      timer = undefined
      music.dispose()
      device.stop()
      mic.dispose()
    }
    refresh()
  }

  function dismiss() {
    armedAt = undefined
    if (snapshot.immersive) publish({ immersive: false })
  }

  function onVisibility() { dismiss(); refresh() }
  // Switching apps blurs the window. With the option on, keep the current
  // overlay and idle count instead of treating the blur as user activity;
  // visibilitychange (tab hidden / minimized) still dismisses through onVisibility.
  function onBlur() {
    if (!snapshot.settings.immersiveUnfocused) dismiss()
    refresh()
  }
  function onActivity(event) {
    dismiss()
    if (event.type === 'keydown' || event.type === 'pointerdown') music.unlock()
  }
  function onStorage(event) {
    if (event.key !== null && event.key !== STORAGE_KEY) return
    dismiss()
    publish({ settings: loadSettings(win), saveFailed: false })
    syncTimer()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setPlayback(service) {
      playback = service
      refresh()
      return () => { if (playback === service) { playback = undefined; refresh() } }
    },
    startDevice(kind) { if (started && snapshot.settings.enabled) void device.start(kind) },
    stopDevice() { device.stop(); refresh() },
    setSettings(value) {
      const settings = normalize(value)
      let saveFailed = false
      try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) }
      catch { saveFailed = true }
      dismiss()
      publish({ settings, saveFailed })
      syncTimer()
    },
    dismiss,
    start() {
      started = true
      for (const event of ACTIVITY_EVENTS) win.addEventListener(event, onActivity, { capture: true, passive: true })
      doc.addEventListener('visibilitychange', onVisibility)
      win.addEventListener('blur', onBlur)
      win.addEventListener('storage', onStorage)
      motion.addEventListener('change', onVisibility)
      syncTimer()
      return () => {
        started = false
        syncTimer()
        for (const event of ACTIVITY_EVENTS) win.removeEventListener(event, onActivity, true)
        doc.removeEventListener('visibilitychange', onVisibility)
        win.removeEventListener('blur', onBlur)
        win.removeEventListener('storage', onStorage)
        motion.removeEventListener('change', onVisibility)
        dismiss()
        publish({ chats: EMPTY_CHATS, sidebar: null, frame: null, source: null, sourceKind: '', phase: '' })
      }
    },
  }
}
