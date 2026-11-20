const choice = (label, value, choices) => ({ label, value, choices })
const range = (label, value, min, max, step = 1, unit = '') => ({ label, value, min, max, step, unit })
const flag = (label, value = false) => ({ label, value })
const color = (label, value) => ({ label, value, color: true })
const image = (label, value = '') => ({ label, value, image: true })
const text = (label, value = '') => ({ label, value, text: true })
const palettes = [
  ['custom', '自定义'], ['steelblue', '钢蓝'], ['orangered', '橙红'],
  ['classic', '经典'], ['prism', '棱镜'], ['rainbow', '彩虹'],
]
const sidePalettes = [['', '跟随主渐变'], ...palettes]

// Named visual presets applied from the Display tab. Each entry only overrides
// the options it names; the remaining values stay as the user had them.
export const presets = [
  {
    id: 'soft', label: '默认柔光',
    values: { mode: 4, channelLayout: 'single', gradient: 'custom', colorStart: '#487cb7', colorEnd: '#84c2c3', colorMode: 'gradient', fillAlpha: 0.55, barSpace: 0.26, lineWidth: 2, roundBars: true, radial: false, radialInvert: false, mirror: 0, reflexRatio: 0, ledBars: false, showPeaks: false },
  },
  {
    id: 'curve', label: '极简曲线',
    values: { mode: 10, gradient: 'steelblue', colorMode: 'gradient', fillAlpha: 0.2, barSpace: 0.5, lineWidth: 2, roundBars: true, radial: false, radialInvert: false, mirror: 0, reflexRatio: 0, ledBars: false, showPeaks: false },
  },
  {
    id: 'ring', label: '圆环脉冲',
    values: { mode: 4, gradient: 'prism', colorMode: 'bar-level', fillAlpha: 0.45, barSpace: 0.24, roundBars: true, radial: true, radialInvert: true, radius: 0.32, spinSpeed: 3, mirror: 0, reflexRatio: 0, ledBars: false, showPeaks: false },
  },
  {
    id: 'mirror', label: '镜像声波',
    values: { mode: 0, gradient: 'classic', colorMode: 'gradient', fillAlpha: 0.6, barSpace: 0.3, roundBars: true, mirror: 1, radial: false, radialInvert: false, reflexRatio: 0, ledBars: false },
  },
  {
    id: 'dual', label: '双声道对置',
    values: { mode: 0, channelLayout: 'dual-horizontal', splitGradient: true, gradientLeft: 'steelblue', gradientRight: 'orangered', colorMode: 'gradient', fillAlpha: 0.6, barSpace: 0.22, roundBars: true, mirror: -1, radial: false, reflexRatio: 0 },
  },
  {
    id: 'neon', label: '霓虹棱镜',
    values: { mode: 4, gradient: 'prism', colorMode: 'bar-level', fillAlpha: 0.7, barSpace: 0.18, roundBars: true, ledBars: true, trueLeds: false, reflexRatio: 0.25, reflexAlpha: 0.25, reflexBright: 1.1, radial: false, radialInvert: false, mirror: 0, showPeaks: true, peakLine: false },
  },
  {
    id: 'retro', label: '复古 LED',
    values: { mode: 0, gradient: 'classic', ledBars: true, trueLeds: true, roundBars: false, barSpace: 0.18, fillAlpha: 0.85, reflexRatio: 0, radial: false, radialInvert: false, mirror: 0, showPeaks: false },
  },
  {
    id: 'rainbow', label: '彩虹律动',
    values: { mode: 5, gradient: 'rainbow', colorMode: 'bar-index', fillAlpha: 0.5, barSpace: 0.26, roundBars: true, radial: true, radialInvert: false, radius: 0.28, spinSpeed: 8, reflexRatio: 0, ledBars: false, mirror: 0 },
  },
  {
    id: 'bass', label: '低频聚焦',
    values: { mode: 6, minFreq: 30, maxFreq: 4000, linearAmplitude: true, linearBoost: 1.6, gravity: 8, gradient: 'orangered', colorMode: 'gradient', fillAlpha: 0.6, barSpace: 0.26, roundBars: true, radial: false, reflexRatio: 0, mirror: 0, showPeaks: false },
  },
  {
    id: 'quiet', label: '静谧曲线',
    values: { mode: 10, gradient: 'steelblue', colorMode: 'gradient', fillAlpha: 0.15, lineWidth: 3, roundBars: true, showPeaks: true, peakLine: true, fadePeaks: true, reflexRatio: 0.15, reflexAlpha: 0.12, radial: false, radialInvert: false, mirror: 0 },
  },
  {
    id: 'echo', label: '声场反射',
    values: { mode: 4, gradient: 'custom', colorStart: '#3b6eff', colorEnd: '#8ddfda', colorMode: 'gradient', fillAlpha: 0.5, barSpace: 0.26, roundBars: true, reflexRatio: 0.45, reflexAlpha: 0.35, reflexBright: 1.1, reflexFit: true, radial: false, radialInvert: false, mirror: 0, ledBars: false },
  },
  {
    id: 'deepsea', label: '深海幻境',
    values: { mode: 4, gradient: 'custom', colorStart: '#1e5f8a', colorEnd: '#5ce1d3', colorMode: 'gradient', fillAlpha: 0.42, barSpace: 0.28, roundBars: true, radial: true, radialInvert: true, radius: 0.4, spinSpeed: -3, reflexRatio: 0.2, reflexAlpha: 0.18, ledBars: false, mirror: 0, showPeaks: false },
  },
  {
    id: 'starr', label: '星环闪耀',
    values: { mode: 4, gradient: 'prism', colorMode: 'bar-level', fillAlpha: 0.22, barSpace: 0.4, lineWidth: 1, roundBars: true, radial: true, radialInvert: false, radius: 0.5, spinSpeed: 5, reflexRatio: 0, ledBars: false, showPeaks: true, peakLine: true, mirror: 0 },
  },
  {
    id: 'aurora', label: '极光流线',
    values: { mode: 10, gradient: 'custom', colorStart: '#7a5cff', colorEnd: '#35e0c0', colorMode: 'gradient', fillAlpha: 0.35, barSpace: 0.3, lineWidth: 3, roundBars: true, reflexRatio: 0.3, reflexAlpha: 0.2, radial: false, radialInvert: false, mirror: 0, ledBars: false },
  },
  {
    id: 'pixel', label: '像素方块',
    values: { mode: 4, channelLayout: 'single', gradient: 'rainbow', colorMode: 'bar-index', fillAlpha: 0.92, barSpace: 0.25, roundBars: false, ledBars: true, trueLeds: true, lumiBars: false, alphaBars: false, outlineBars: false, loRes: true, showBgColor: false, smoothing: 0.2, reflexRatio: 0, radial: false, radialInvert: false, mirror: 0, showPeaks: false },
  },
  {
    id: 'city', label: '城市脉冲',
    values: { mode: 3, gradient: 'custom', colorStart: '#ff7a3d', colorEnd: '#ffd166', colorMode: 'gradient', fillAlpha: 0.72, barSpace: 0.2, roundBars: true, ledBars: true, trueLeds: false, reflexRatio: 0, radial: false, radialInvert: false, mirror: 0, showPeaks: false },
  },
  {
    id: 'neonnight', label: '暗夜荧光',
    values: { mode: 0, gradient: 'custom', colorStart: '#00e5ff', colorEnd: '#7c4dff', colorMode: 'bar-level', fillAlpha: 0.78, barSpace: 0.18, roundBars: true, ledBars: true, trueLeds: true, mirror: 1, radial: false, radialInvert: false, reflexRatio: 0, showPeaks: false },
  },
]
const presetChoices = [['custom', '自定义'], ...presets.map(preset => [preset.id, preset.label])]
// Every key any preset can write. A preset application resets these keys to
// their defaults first, so switching presets cannot inherit stale values from
// the previous one.
export const presetKeys = Object.freeze([...new Set(presets.flatMap(preset => Object.keys(preset.values)))])

export const general = {
  enabled: flag('启用音频响应', true),
  preset: choice('效果预设', 'soft', presetChoices),
  opacity: range('效果能见度', 18, 5, 60, 1, '%'),
  immersive: flag('无操作时进入沉浸模式', true),
  idleSeconds: range('无操作触发时间', 15, 1, 600, 1, '秒'),
  immersiveUnfocused: flag('失去焦点时保持沉浸模式', true),
  fadeMs: range('淡入淡出时长', 360, 0, 1500, 10, '毫秒'),
  immersiveOpacity: range('背景透明度', 90, 0, 100, 1, '%'),
  immersiveBlur: range('背景模糊', 5, 0, 60, 1, '像素'),
  immersiveImage: image('自定义背景图'),
  immersiveFit: choice('背景铺放方式', 'cover', [
    ['cover', '铺满裁切'], ['contain', '完整显示'], ['fill', '拉伸铺满'], ['center', '原始大小居中'], ['tile', '平铺'],
  ]),
  immersiveScale: range('背景缩放', 100, 50, 200, 1, '%'),
}

// Source-selection flags live in the Source tab. They are normal persisted
// booleans so they survive reloads, but they are not part of the Display tab.
export const source = {
  sourceTts: flag('流式朗读（dsh-xiaomi-tts）', true),
  sourceMusic: flag('音乐面板（dsh-music-panel）', true),
  sourceDictation: flag('语音输入（听写）', true),
  micEnabled: flag('麦克风', false),
  micDevice: text('麦克风设备', ''),
}

export const groups = [
  ['频谱声道', {
    mode: choice('显示模式', 4, [
      [10, '连续曲线'], [0, '逐频点柱形'], [1, '1/24 倍频程'], [2, '1/12 倍频程'],
      [3, '1/8 倍频程'], [4, '1/6 倍频程'], [5, '1/4 倍频程'],
      [6, '1/3 倍频程'], [7, '1/2 倍频程'], [8, '整倍频程'],
    ]),
    channelLayout: choice('声道布局', 'single', [
      ['single', '单声道'], ['dual-horizontal', '双声道左右'],
      ['dual-vertical', '双声道上下'], ['dual-combined', '双声道叠加'],
    ]),
    frequencyScale: choice('频率刻度', 'log', [['log', '对数'], ['linear', '线性'], ['bark', '巴克'], ['mel', '梅尔']]),
    weightingFilter: choice('频率加权', '', [['', '无'], ['A', 'A 加权'], ['B', 'B 加权'], ['C', 'C 加权'], ['D', 'D 加权'], ['468', 'ITU-R 468']]),
    minFreq: range('最低频率', 55, 20, 20000, 1, 'Hz'),
    maxFreq: range('最高频率', 10000, 21, 22000, 1, 'Hz'),
    minDecibels: range('最低电平', -85, -120, -1, 1, 'dB'),
    maxDecibels: range('最高电平', -25, -119, 0, 1, 'dB'),
    smoothing: range('频谱平滑', 0.75, 0, 0.99, 0.01),
    ansiBands: flag('ANSI 标准频段'),
    linearAmplitude: flag('线性振幅'),
    linearBoost: range('线性增益', 1, 1, 5, 0.1, '倍'),
  }],
  ['外观色彩', {
    gradient: choice('主渐变', 'custom', palettes),
    gradientLeft: choice('左声道渐变', '', sidePalettes),
    gradientRight: choice('右声道渐变', '', sidePalettes),
    colorStart: color('自定义渐变起点', '#487cb7'),
    colorEnd: color('自定义渐变终点', '#84c2c3'),
    colorMode: choice('着色方式', 'gradient', [['gradient', '连续渐变'], ['bar-index', '按柱序号'], ['bar-level', '按柱高度']]),
    splitGradient: flag('分隔声道渐变'),
    showBgColor: flag('显示频谱底色'),
    bgAlpha: range('频谱底色透明度', 0.35, 0, 1, 0.01),
    fillAlpha: range('填充透明度', 0.55, 0, 1, 0.01),
    barSpace: range('柱间距比例', 0.26, 0, 0.99, 0.01),
    lineWidth: range('线宽', 2, 0, 12, 1, 'px'),
    roundBars: flag('圆角柱形', true),
    outlineBars: flag('柱形描边'),
    alphaBars: flag('柱形透明度随振幅变化'),
    lumiBars: flag('柱形亮度随振幅变化'),
    ledBars: flag('LED 柱形'),
    trueLeds: flag('LED 分级着色'),
    mirror: choice('镜像方向', 0, [[0, '无'], [-1, '向左'], [1, '向右']]),
    radial: flag('径向显示'),
    radialInvert: flag('径向反转'),
    radius: range('径向半径比例', 0.3, 0, 1, 0.01),
    spinSpeed: range('旋转速度', 0, -30, 30, 1, '转/分'),
    reflexRatio: range('反射比例', 0, 0, 0.9, 0.01),
    reflexAlpha: range('反射透明度', 0.15, 0, 1, 0.01),
    reflexBright: range('反射亮度', 1, 0, 1, 0.01),
    reflexFit: flag('反射适应容器', true),
  }],
  ['高级设置', {
    showPeaks: flag('显示峰值'),
    peakLine: flag('峰值连线'),
    fadePeaks: flag('峰值淡出'),
    peakHoldTime: range('峰值保持', 500, 0, 5000, 10, '毫秒'),
    peakFadeTime: range('峰值淡出时间', 750, 0, 5000, 10, '毫秒'),
    gravity: range('峰值下落速度', 3.8, 0.1, 20, 0.1),
    showScaleX: flag('显示频率刻度'),
    showScaleY: flag('显示电平刻度'),
    noteLabels: flag('用音名标记频率'),
    fftSize: choice('FFT 采样点数', 4096, [512, 1024, 2048, 4096, 8192, 16384, 32768].map(n => [n, String(n)])),
    maxFPS: range('绘制帧率上限', 30, 15, 60, 1, '帧/秒'),
    showFPS: flag('显示绘制帧率'),
    loRes: flag('降低画布分辨率'),
  }],
]
const analyzerFields = Object.assign({}, ...groups.map(([, fields]) => fields))
const fields = { ...general, ...source, ...analyzerFields }
export const defaults = Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])))

/** Apply a named preset without inheriting any value from the previous preset. */
export function applyPreset(current, id) {
  const preset = presets.find(item => item.id === id)
  if (!preset) return { ...current, preset: 'custom' }
  return applyPresetValues(current, preset.values, id)
}

/** Apply a preset value map, resetting every preset-controlled key first. */
export function applyPresetValues(current, values, id = 'custom') {
  const reset = Object.fromEntries(presetKeys.map(key => [key, defaults[key]]))
  return { ...current, ...reset, ...values, preset: id }
}

export function normalize(input = {}) {
  const result = { ...defaults }
  for (const [key, field] of Object.entries(fields)) {
    const value = input?.[key]
    if (field.choices) {
      if (field.choices.some(([allowed]) => allowed === value)
        || (key === 'preset' && typeof value === 'string' && /^user:.{1,40}$/.test(value))) result[key] = value
    } else if (field.image) {
      if (typeof value === 'string' && (value === '' || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value))) result[key] = value
    } else if (field.text) {
      if (typeof value === 'string' && value.length <= 256) result[key] = value
    } else if (field.color) {
      if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) result[key] = value
    } else if (typeof field.value === 'boolean') {
      if (typeof value === 'boolean') result[key] = value
    } else if (Number.isFinite(value)) {
      const clamped = Math.max(field.min, Math.min(field.max, value))
      result[key] = Number((field.min + Math.round((clamped - field.min) / field.step) * field.step).toFixed(2))
    }
  }
  if (result.minFreq >= result.maxFreq) result.maxFreq = result.minFreq + 1
  if (result.minDecibels >= result.maxDecibels) result.maxDecibels = result.minDecibels + 1
  return result
}

export function configureAnalyzer(analyzer, settings) {
  const { colorStart, colorEnd, gradient, gradientLeft, gradientRight, ...options } = Object.fromEntries(
    Object.keys(analyzerFields).map(key => [key, settings[key]]),
  )
  analyzer.registerGradient('custom', { colorStops: [colorStart, colorEnd], bgColor: '#111d29' })
  analyzer.setOptions({ ...options, overlay: true, gradient, gradientLeft: gradientLeft || gradient, gradientRight: gradientRight || gradient })
}
