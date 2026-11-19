import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { defaults, general, groups, presets } from './options.js'
import { phaseLabels, PreviewIdle, Spectrum } from './spectrum.jsx'
import { Button, ColorField, ImageField, NumberField, SelectField, SegmentedTabs, SwitchField } from './ui.jsx'

const deviceMessages = {
  off: '手动开启后，频谱会跟随设备播放的声音。',
  starting: '正在启动音频采集…',
  native: '正在采集 Windows 默认输出设备。',
  shared: '音频共享已开启。',
  'no-audio-track': '未收到音轨。请在共享窗口里勾选共享音频。',
  denied: '共享未授权，请重新选择要共享的音频。',
  unsupported: '这个窗口不支持浏览器音频共享。',
  'sharing-ended': '音频共享已结束。',
  'device-ended': '设备采集已结束。切换输出设备后可重新开启。',
  'device-busy': '另一个 DSH 页面正在采集设备声音。',
  'native-unavailable': '本机采集未能启动。请确认默认输出设备可用，或在浏览器里使用音频共享。',
  unavailable: '音频采集未能启动。',
}
const sources = { tts: '流式朗读', music: '音乐面板', device: '设备声音', dictation: '语音输入', mic: '麦克风' }
const micMessages = {
  off: '开启后采集默认输入设备，可作为独立音源',
  starting: '正在开启麦克风…',
  live: '正在采集默认输入设备',
  denied: '麦克风未授权，请在系统设置中允许后重试',
  unavailable: '无法访问麦克风，请检查输入设备',
}

const PeekIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M1.5 8S3.9 4 8 4s6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
  <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
</svg>
const ResetIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M3 7a5 5 0 1 1 1.6 3.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  <path d="M3 3.6V7h3.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
</svg>

const TAB_DEFINITIONS = [
  { value: 'display', label: '显示效果' },
  { value: 'source', label: '声源设置' },
  { value: 'spectrum', label: '频谱声道', fields: groups[0][1] },
  { value: 'appearance', label: '外观色彩', fields: groups[1][1] },
  { value: 'advanced', label: '高级设置', fields: groups[2][1] },
]
const TABS = TAB_DEFINITIONS.map(tab => ({
  ...tab,
  id: `dsh-ar-tab-${tab.value}`,
  panelId: `dsh-ar-panel-${tab.value}`,
}))

// Immersive-only controls stay disabled until the immersive mode is on.
const IMMERSIVE_KEYS = new Set([
  'idleSeconds', 'fadeMs', 'immersiveOpacity', 'immersiveBlur',
  'immersiveImage', 'immersiveFit', 'immersiveScale',
])
const IMAGE_KEYS = new Set(['immersiveFit', 'immersiveScale'])
// Analyzer fields alone reset the named preset to 自定义; source choices do not.
const ANALYZER_KEYS = new Set(Object.keys(Object.assign({}, ...groups.map(([, fields]) => fields))))

export function Settings({ runtime }) {
  const { settings, source, sourceKind, deviceStatus, micStatus, nativeDevice, musicWaiting, phase, reducedMotion, saveFailed } =
    useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const [tab, setTab] = useState('display')
  const [previewError, setPreviewError] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const [micDevices, setMicDevices] = useState([])

  // Microphone labels appear only after permission, so refresh the list while
  // the Source tab is open and whenever the capture status changes.
  useEffect(() => {
    if (tab !== 'source') return
    const media = navigator.mediaDevices
    if (!media?.enumerateDevices) return
    let cancelled = false
    const load = async () => {
      try {
        const list = await media.enumerateDevices()
        if (cancelled) return
        setMicDevices(list.filter(device => device.kind === 'audioinput')
          .map((device, index) => [device.deviceId, device.label || `麦克风 ${index + 1}`]))
      } catch { /* Enumeration can fail before permission; the default entry remains. */ }
    }
    void load()
    media.addEventListener?.('devicechange', load)
    return () => {
      cancelled = true
      media.removeEventListener?.('devicechange', load)
    }
  }, [tab, micStatus])

  // Holding the peek button hides the host settings dialog so the live chat
  // background can be inspected. The attribute is removed too, so the runtime
  // stops treating the settings preview as the active surface.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dsh-ar-peeking', peeking)
    if (!peeking) return
    // The peek button itself becomes invisible with the settings dialog, so end
    // on the next release or press anywhere, a key release, or window blur.
    const startedAt = performance.now()
    const end = event => {
      // Hiding the focused control can emit an immediate pointercancel; ignore
      // that one and wait for the actual release.
      if (event?.type === 'pointercancel' && performance.now() - startedAt < 250) return
      setPeeking(false)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keyup', end)
    window.addEventListener('blur', end)
    // A later press also ends the peek; defer so the press that started it
    // cannot immediately terminate it.
    const timer = window.setTimeout(() => { window.addEventListener('pointerdown', end) }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('pointerdown', end)
      window.removeEventListener('keyup', end)
      window.removeEventListener('blur', end)
      root.classList.remove('dsh-ar-peeking')
    }
  }, [peeking])

  const peekHandlers = {
    onPointerDown: event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setPeeking(true)
    },
    onPointerUp: () => { setPeeking(false) },
    onKeyDown: event => {
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setPeeking(true) }
    },
    onKeyUp: event => { if (event.key === ' ' || event.key === 'Enter') setPeeking(false) },
  }

  const status = !settings.enabled ? '音频响应已关闭'
    : phase && !source ? phaseLabels[phase]
      : reducedMotion ? '系统已启用减少动态效果'
        : source ? (previewError ? '频谱暂时无法显示' : `正在响应${sources[sourceKind] ?? ''}`)
          : musicWaiting ? '音乐面板正在播放，等待可用音轨。'
            : '等待朗读、音乐面板、听写或共享音频。'

  const deviceActive = ['starting', 'native', 'shared'].includes(deviceStatus)

  const update = (key, value) => {
    runtime.setSettings({ ...runtime.getSnapshot().settings, [key]: value })
  }

  const changeSetting = (key, next) => {
    const current = runtime.getSnapshot().settings
    if (key === 'preset') {
      const preset = presets.find(item => item.id === next)
      if (!preset) { update('preset', 'custom'); return }
      // Clear side-channel gradient state unless the preset defines its own,
      // so switching away from a dual-channel preset cannot leave it behind.
      runtime.setSettings({
        ...current,
        splitGradient: false,
        gradientLeft: '',
        gradientRight: '',
        ...preset.values,
        preset: next,
      })
      return
    }
    runtime.setSettings({
      ...current,
      [key]: next,
      ...(ANALYZER_KEYS.has(key) && current.preset !== 'custom' ? { preset: 'custom' } : {}),
    })
  }

  const renderFields = fields => <div className="dsh-ar-rows">
    {Object.entries(fields).map(([key, field]) => {
      const id = `dsh-ar-field-${key}`
      const off = IMMERSIVE_KEYS.has(key) && !settings.immersive
      const noImage = IMAGE_KEYS.has(key) && !settings.immersiveImage
      const disabled = off || noImage
      const hint = key === 'immersiveOpacity' ? '数值越高，背景越透明'
        : key === 'immersiveBlur' ? '模糊背景画面' : undefined
      const description = off
        ? '开启「无操作时进入沉浸模式」后可调'
        : noImage ? '上传背景图后可调' : hint
      const value = settings[key]
      const onChange = next => { changeSetting(key, next) }
      if (typeof field.value === 'boolean') {
        return <SwitchField key={key} id={id} label={field.label} description={description} value={value} disabled={disabled} onChange={onChange} />
      }
      if (field.image) {
        return <ImageField key={key} id={id} label={field.label} description={description} value={value} disabled={disabled} onChange={onChange} />
      }
      if (field.color) {
        return <ColorField key={key} id={id} label={field.label} description={description} value={value} disabled={disabled} onChange={onChange} />
      }
      if (field.choices) {
        return <SelectField key={key} id={id} label={field.label} description={description} value={value} choices={field.choices} disabled={disabled} onChange={onChange} />
      }
      return <NumberField key={key} id={id} label={field.label} description={description} value={value}
        min={field.min} max={field.max} step={field.step} unit={field.unit} disabled={disabled} onChange={onChange} />
    })}
  </div>

  const dictationDesc = !settings.sourceDictation ? '已关闭，不跟随宿主听写'
    : sourceKind === 'dictation' ? '正在响应语音输入'
      : phase === 'recording' ? (micStatus === 'denied' ? micMessages.denied
        : micStatus === 'unavailable' ? micMessages.unavailable : '正在录音，等待麦克风音频')
        : phase ? phaseLabels[phase]
          : '使用宿主听写录音时，频谱跟随麦克风'
  const micDesc = !settings.micEnabled ? micMessages.off
    : micStatus === 'off' ? '待命中：当前由其他音源驱动，无其他音源时自动采集'
      : micMessages[micStatus] ?? micMessages.unavailable
  const micChoices = [['', '系统默认'], ...micDevices]
  if (settings.micDevice && !micDevices.some(([id]) => id === settings.micDevice)) {
    micChoices.push([settings.micDevice, '已选设备（可能不可用）'])
  }

  const sourcePanel = <div className="dsh-ar-rows">
    {!settings.enabled && <div className="dsh-ar-row">
      <div className="dsh-ar-row-text">
        <div className="dsh-ar-row-title">音频响应已关闭</div>
        <div className="dsh-ar-row-desc">先在「显示效果」中启用，设备采集和频谱才会工作。</div>
      </div>
      <div className="dsh-ar-row-control">
        <Button variant="outline" size="sm" onClick={() => setTab('display')}>去开启</Button>
      </div>
    </div>}
    <div className="dsh-ar-group-label">音源</div>
    <SwitchField id="dsh-ar-field-sourceTts" label="流式朗读（dsh-xiaomi-tts）" value={settings.sourceTts}
      disabled={!settings.enabled} onChange={next => changeSetting('sourceTts', next)}
      description={sourceKind === 'tts' ? '正在响应流式朗读' : settings.sourceTts ? '朗读回复时自动接入 TTS 音频' : '已关闭'} />
    <SwitchField id="dsh-ar-field-sourceMusic" label="音乐面板（dsh-music-panel）" value={settings.sourceMusic}
      disabled={!settings.enabled} onChange={next => changeSetting('sourceMusic', next)}
      description={sourceKind === 'music' ? '正在响应音乐面板'
        : musicWaiting ? '音乐面板正在播放，等待可用音轨'
          : settings.sourceMusic ? '播放音乐面板曲目时自动接入' : '已关闭'} />
    <SwitchField id="dsh-ar-field-sourceDictation" label="语音输入（听写）" value={settings.sourceDictation}
      disabled={!settings.enabled} onChange={next => changeSetting('sourceDictation', next)}
      description={dictationDesc} />
    <SwitchField id="dsh-ar-field-micEnabled" label="麦克风" value={settings.micEnabled}
      disabled={!settings.enabled} onChange={next => changeSetting('micEnabled', next)}
      description={micDesc} />
    <SelectField id="dsh-ar-field-micDevice" label="麦克风设备" value={settings.micDevice}
      choices={micChoices} disabled={!settings.enabled || !(settings.micEnabled || settings.sourceDictation)}
      description="听写与麦克风可视化使用的输入设备"
      onChange={next => changeSetting('micDevice', next)} />
    <div className="dsh-ar-group-label">设备声音</div>
    <div className="dsh-ar-row">
      <div className="dsh-ar-row-text">
        <div className="dsh-ar-row-title">采集播放输出</div>
        <div className="dsh-ar-row-desc">{deviceMessages[deviceStatus] ?? deviceMessages.unavailable}</div>
      </div>
      <div className="dsh-ar-row-control dsh-ar-buttons">
        {deviceActive ? <Button variant="outline" size="sm" onClick={runtime.stopDevice}>停止采集</Button> : <>
          {nativeDevice && <Button variant="primary" size="sm" disabled={!settings.enabled} onClick={() => runtime.startDevice('native')}>采集本机声音</Button>}
          <Button variant="outline" size="sm" disabled={!settings.enabled} onClick={() => runtime.startDevice('shared')}>共享音频</Button>
        </>}
      </div>
    </div>
    <p className="dsh-ar-note">同一时刻只显示一个来源：听写和手动设备采集优先，其次是流式朗读、音乐面板和麦克风，避免同一段声音被重复计算。听写时插件会共享默认输入设备，不会干扰宿主录音。</p>
  </div>

  return <section className="dsh-ar-settings" {...(peeking ? {} : { 'data-dsh-ar-settings': '' })}>
    <div className="dsh-ar-top">
      <div className="dsh-ar-preview">
        {source && !reducedMotion ? <Spectrum source={source} settings={settings} reportError={setPreviewError} /> : <PreviewIdle />}
        <p className="dsh-ar-preview-status" role="status">{status}</p>
        <div className="dsh-ar-preview-actions">
          <Button variant="ghost" size="sm" className="dsh-ar-preview-button" icon={<PeekIcon />} title="按住查看对话区的实时效果" {...peekHandlers}>按住透视</Button>
          <Button variant="ghost" size="sm" className="dsh-ar-preview-button" icon={<ResetIcon />} title="恢复默认设置" onClick={() => runtime.setSettings(defaults)}>恢复默认</Button>
        </div>
      </div>
      <div className="dsh-ar-tabbar">
        <SegmentedTabs items={TABS} value={tab} onChange={setTab} label="音频响应设置分组" className="dsh-ar-tabs" />
      </div>
    </div>
    {saveFailed && <p className="dsh-ar-alert" role="alert">设置已临时生效，浏览器未能保存。重载后将恢复上次保存的设置。</p>}
    {TABS.map(entry => <div key={entry.value} className="dsh-ar-panel" id={entry.panelId} role="tabpanel"
      aria-labelledby={entry.id} hidden={entry.value !== tab}>
      {entry.value === 'source' ? sourcePanel : renderFields(entry.value === 'display' ? general : entry.fields)}
    </div>)}
  </section>
}
