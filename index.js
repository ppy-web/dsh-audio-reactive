import { registerDeviceAudio } from './native/device-route.js'

export const name = 'audio-reactive'
export function apply(ctx) {
  ctx.inject(['webServer', 'connection'], child => {
    child.effect(() => registerDeviceAudio(child.webServer, child.connection), 'audio-reactive: local device capture')
  })
}
