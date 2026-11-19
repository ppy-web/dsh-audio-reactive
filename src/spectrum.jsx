import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import AudioMotionAnalyzer from 'audiomotion-analyzer'
import { configureAnalyzer } from './options.js'

export const phaseLabels = {
  requesting: '正在请求麦克风',
  recording: '正在录音',
  transcribing: '正在转写',
}

// Decorative idle artwork for the settings preview: a soft rainbow wave instead
// of an empty dark panel. It is purely CSS/SVG, has no audio dependency, and
// freezes under prefers-reduced-motion.
export function PreviewIdle() {
  const wave = 'M0,120 C60,74 120,74 180,120 S300,166 360,120 S480,74 540,120 S660,166 720,120 S840,74 900,120 S1020,166 1080,120 S1200,74 1200,120'
  return <div className="dsh-ar-preview-idle" aria-hidden="true">
    <svg viewBox="0 0 1200 240" preserveAspectRatio="none">
      <defs>
        <linearGradient id="dsh-ar-idle-rainbow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="0.2" stopColor="#ffb84d" />
          <stop offset="0.4" stopColor="#f5f17a" />
          <stop offset="0.6" stopColor="#6ee7a8" />
          <stop offset="0.8" stopColor="#5bc0eb" />
          <stop offset="1" stopColor="#b388ff" />
        </linearGradient>
        <filter id="dsh-ar-idle-glow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g className="dsh-ar-preview-idle-line">
        <path d={wave} fill="none" stroke="url(#dsh-ar-idle-rainbow)" strokeWidth="9"
          strokeLinecap="round" opacity="0.35" filter="url(#dsh-ar-idle-glow)" vectorEffect="non-scaling-stroke" />
        <path d={wave} fill="none" stroke="url(#dsh-ar-idle-rainbow)" strokeWidth="2.4"
          strokeLinecap="round" opacity="0.9" vectorEffect="non-scaling-stroke" />
      </g>
      <g transform="translate(0 40)">
        <path d={wave} fill="none" stroke="url(#dsh-ar-idle-rainbow)" strokeWidth="1.6"
          strokeLinecap="round" opacity="0.22" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  </div>
}

export function Spectrum({ source, settings, reducedMotion, reportError }) {
  const container = useRef(null)
  const analyzer = useRef(null)

  useEffect(() => {
    if (!source || reducedMotion) return
    let input
    try {
      input = source.context.createGain()
      source.connect(input)
      analyzer.current = new AudioMotionAnalyzer(container.current, {
        audioCtx: source.context,
        source: input,
        connectSpeakers: false,
        start: false,
        overlay: true,
      })
    } catch {
      reportError?.(true)
    }
    return () => {
      try { analyzer.current?.destroy() }
      finally {
        analyzer.current = null
        if (input) {
          // A producer may have disconnected its outgoing branches before this surface unmounts.
          try { source.disconnect(input) } catch { /* The branch is already detached. */ }
          input.disconnect()
        }
      }
    }
  }, [source, reducedMotion, reportError])

  useEffect(() => {
    const instance = analyzer.current
    if (!instance) return
    try {
      configureAnalyzer(instance, settings)
      instance.start()
      reportError?.(false)
    } catch {
      instance.stop()
      reportError?.(true)
    }
  }, [source, settings, reducedMotion, reportError])

  return <div className="dsh-ar-spectrum" ref={container} aria-hidden="true" />
}

function Immersive({ runtime, active, source, settings, reducedMotion }) {
  const ref = useRef(null)
  const fadeTimer = useRef(null)
  const [heldSource, setHeldSource] = useState(null)
  const fade = reducedMotion ? 0 : settings.fadeMs

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!active && !dialog.open) return
    const opening = !dialog.open
    if (active) {
      if (opening) {
        try { dialog.showModal() } catch { runtime.dismiss(); return }
      }
      dialog.setAttribute('data-visible', '')
    } else dialog.removeAttribute('data-visible')

    const from = opening ? 0 : Number(dialog.style.opacity || 0)
    const to = active ? 1 : 0
    clearInterval(fadeTimer.current)
    const finish = () => {
      clearInterval(fadeTimer.current)
      fadeTimer.current = null
      dialog.style.opacity = String(to)
      if (!active) { dialog.close(); setHeldSource(null) }
    }
    if (!fade || from === to || document.hidden) { finish(); return }
    const startedAt = performance.now()
    dialog.style.opacity = String(from)
    // Keep exit bounded even when the Desktop compositor stops delivering animation frames.
    fadeTimer.current = setInterval(() => {
      const progress = Math.min((performance.now() - startedAt) / fade, 1)
      if (progress === 1) { finish(); return }
      dialog.style.opacity = String(from + (to - from) * (1 - (1 - progress) ** 3))
    }, 16)
  }, [active, fade, runtime])

  useLayoutEffect(() => {
    if (active) setHeldSource(source)
  }, [active, source])

  useEffect(() => {
    const dialog = ref.current
    return () => { clearInterval(fadeTimer.current); if (dialog.open) dialog.close() }
  }, [])
  // Immersive background: the host's page background color (or the user's
  // uploaded image) with an adjustable visibility and blur. No exit button:
  // any pointer, key, wheel, touch or scroll event dismisses it, and Escape is
  // handled by the dialog's cancel event.
  const image = settings.immersiveImage
  const fit = settings.immersiveFit
  // The setting is transparency: 90 means a 90%-transparent background veil.
  // The veil tints the blurred page (or the uploaded image) without washing the
  // image itself out.
  const veilPercent = 100 - settings.immersiveOpacity
  const surface = {
    backgroundColor: image ? 'var(--dsw-alias-bg-base, #fff)' : 'transparent',
    backdropFilter: image ? 'none' : `blur(${settings.immersiveBlur}px)`,
    WebkitBackdropFilter: image ? 'none' : `blur(${settings.immersiveBlur}px)`,
  }
  const imageStyle = image ? {
    backgroundImage: `url("${image}")`,
    backgroundSize: fit === 'fill' ? '100% 100%' : fit === 'center' || fit === 'tile' ? 'auto' : fit,
    backgroundRepeat: fit === 'tile' ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center',
    filter: settings.immersiveBlur > 0 ? `blur(${settings.immersiveBlur}px)` : undefined,
    transform: `scale(${settings.immersiveScale / 100})`,
  } : undefined
  const veilStyle = {
    backgroundColor: `color-mix(in srgb, var(--dsw-alias-bg-base, #fff) ${veilPercent}%, transparent)`,
  }
  return <dialog ref={ref} className="dsh-ar-immersive" data-dsh-ar-immersive="" aria-label="音频响应沉浸模式"
    style={surface} onCancel={event => { event.preventDefault(); runtime.dismiss() }}>
    {image ? <div className="dsh-ar-immersive-image" aria-hidden="true" style={imageStyle} /> : null}
    <div className="dsh-ar-immersive-veil" aria-hidden="true" style={veilStyle} />
    {(active || heldSource) && <Spectrum source={active ? source : heldSource} settings={settings} reducedMotion={reducedMotion} />}
  </dialog>
}

export function Surface({ runtime }) {
  const { settings, chat, frame, source, phase, immersive, previewing, reducedMotion } =
    useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const props = { source, settings, reducedMotion }
  const target = chat ?? frame
  const active = immersive && !!source
  return <>
    <Immersive runtime={runtime} active={active} {...props} />
    {target && !active && !previewing && (source || phase) && createPortal(
      <div data-dsh-ar-background="" aria-hidden="true" data-voice-phase={phase || undefined}
        style={{ '--dsh-ar-strength': settings.opacity / 100 }}>
        {source && !reducedMotion ? <Spectrum {...props} /> : <div className="dsh-ar-static" />}
      </div>, target,
    )}
  </>
}
