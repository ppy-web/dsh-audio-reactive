import { registerDeviceAudio } from './native/device-route.js'

export const name = 'audio-reactive'
export function apply(ctx) {
  ctx.inject(['webServer'], child => {
    child.effect(() => registerDeviceAudio(child.webServer), 'audio-reactive: local device capture')
  })
}
