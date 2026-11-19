import { createRuntime } from './runtime.js'
import { Settings } from './settings.jsx'
import { Surface } from './spectrum.jsx'
import css from './style.css'

export const name = 'audio-reactive'
export const inject = ['slots']

export function apply(ctx) {
  const runtime = createRuntime(window, document)
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    const stop = runtime.start()
    return () => { stop(); style.remove() }
  }, 'audio-reactive: browser lifecycle')
  ctx.inject(['xiaomiMimoTts'], child => {
    child.effect(() => runtime.setPlayback(child.xiaomiMimoTts), 'audio-reactive: optional PCM source')
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'audio-reactive',
    inject: () => ({ runtime }),
  }, Surface))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'audio-reactive',
    order: 21,
    label: '音频响应',
    inject: () => ({ runtime }),
  }, Settings))
}
