import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Host-styled controls. A plugin cannot import another Harness Client package,
// so these are reduced copies of the host's ui-primitives atoms
// (`Button`, `Switch`, `SegmentedTabs`/`Pill`) and of its settings-form field
// layout, renamed under this plugin's `dsh-ar-` prefix. Only `--dsw-alias-*`
// theme tokens are referenced, so the controls follow light/dark and the
// active brand palette exactly like the host.

const cx = (...names) => names.filter(Boolean).join(' ')

/** Standard button: `variant` picks the host fill family, `size` its control height. */
export function Button({ variant = 'ghost', size = 'md', icon, className, children, type = 'button', ...rest }) {
  return <button type={type} className={cx('dsh-ar-button', `dsh-ar-button-${variant}`, `dsh-ar-button-${size}`, className)} {...rest}>
    {icon != null ? <span className="dsh-ar-button-icon">{icon}</span> : null}
    {children}
  </button>
}

/** Two-state toggle; `label` is the accessible name, as the host primitive requires. */
export function Switch({ id, checked, onChange, label, disabled = false, title, className }) {
  return <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={title}
    disabled={disabled}
    className={cx('dsh-ar-switch', className)}
    onClick={() => { onChange(!checked) }}
  >
    <span className="dsh-ar-switch-thumb" />
  </button>
}

/** Equal-width controlled tabs with the host's sliding indicator and keyboard walk. */
export function SegmentedTabs({ items, value, onChange, label, className, size = 'md' }) {
  const selectedIndex = items.findIndex(item => item.value === value)
  const onKeyDown = (event, index) => {
    let next
    switch (event.key) {
      case 'ArrowLeft': next = (index + items.length - 1) % items.length; break
      case 'ArrowRight': next = (index + 1) % items.length; break
      case 'Home': next = 0; break
      case 'End': next = items.length - 1; break
      default: return
    }
    event.preventDefault()
    event.stopPropagation()
    const tablist = event.currentTarget.parentElement
    const nextItem = items[next]
    if (tablist === null || nextItem === undefined) return
    tablist.querySelectorAll('[role="tab"]').item(next).focus()
    onChange(nextItem.value)
  }
  return <div
    role="tablist"
    data-size={size}
    aria-label={label}
    className={cx('dsh-ar-segmented-tabs', className)}
    style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
  >
    <span
      className="dsh-ar-segmented-indicator"
      aria-hidden="true"
      style={{ width: `calc((100% - 2 * var(--dsh-ar-tabs-inset)) / ${items.length})`, transform: `translateX(${selectedIndex * 100}%)` }}
    />
    {items.map((item, index) => <button
      key={item.value}
      id={item.id}
      type="button"
      role="tab"
      className="dsh-ar-segmented-tab"
      aria-selected={value === item.value}
      aria-controls={item.panelId}
      tabIndex={value === item.value ? 0 : -1}
      onClick={() => { onChange(item.value) }}
      onKeyDown={event => { onKeyDown(event, index) }}
    >
      {item.label}
    </button>)}
  </div>
}

/** One settings row: label (and optional description) on the left, control on the right. */
export function Row({ label, description, children }) {
  return <div className="dsh-ar-row">
    <div className="dsh-ar-row-text">
      <div className="dsh-ar-row-title">{label}</div>
      {description ? <span className="dsh-ar-row-desc">{description}</span> : null}
    </div>
    <div className="dsh-ar-row-control">{children}</div>
  </div>
}

/** Boolean row backed by the host-style Switch. */
export function SwitchField({ id, label, description, value, disabled, onChange }) {
  return <Row id={id} label={label} description={description}>
    <Switch id={id} checked={value} disabled={disabled} label={label} onChange={onChange} />
  </Row>
}

/** Number row that keeps an in-progress draft until blur or Enter, like the host fields. */
export function NumberField({ id, label, description, value, min, max, step, unit, disabled, onChange }) {
  const [draft, setDraft] = useState(null)
  return <Row id={id} label={label} description={description}>
    <input
      id={id}
      type="number"
      aria-label={label}
      className="dsh-ar-number"
      value={draft ?? value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={event => { setDraft(event.target.value) }}
      onBlur={event => {
        if (Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber)
        setDraft(null)
      }}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    />
    {unit ? <span className="dsh-ar-unit">{unit}</span> : null}
  </Row>
}

/** Capsule select backed by a portalled popover, matching the host menu material. */
export function SelectField({ id, label, description, value, choices, disabled, onChange }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const selectedIndex = Math.max(0, choices.findIndex(([option]) => option === value))
  const selected = choices[selectedIndex]

  const close = returnFocus => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const openMenu = () => {
    if (disabled || !triggerRef.current) return
    const trigger = triggerRef.current
    const box = trigger.getBoundingClientRect()
    const panel = trigger.closest('[data-shortcut-modal="settings"], [role="dialog"]')
    const bounds = panel
      ? panel.getBoundingClientRect()
      : { top: 8, bottom: window.innerHeight - 8, left: 8, right: window.innerWidth - 8 }
    const margin = 12
    const width = Math.max(box.width, 160)
    const maxAllowed = Math.max(80, Math.min(320, bounds.bottom - bounds.top - margin * 2))
    const desired = choices.length * 34 + 8
    const below = bounds.bottom - margin - (box.bottom + 4)
    const above = (box.top - 4) - (bounds.top + margin)
    const useBelow = below >= above
    const available = Math.max(0, useBelow ? below : above)
    const maxHeight = Math.max(80, Math.min(desired, maxAllowed, available))
    setRect({
      left: Math.max(bounds.left + margin, Math.min(box.left, bounds.right - margin - width)),
      top: useBelow ? box.bottom + 4 : box.top - 4 - maxHeight,
      width,
      maxHeight,
    })
    setActive(selectedIndex)
    setOpen(true)
  }

  const choose = index => {
    const entry = choices[index]
    if (!entry) return
    onChange(entry[0])
    close(true)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = event => {
      if (triggerRef.current?.contains(event.target) || listRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const onScroll = event => {
      if (listRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const onResize = () => { setOpen(false) }
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, id])

  const onListKeyDown = event => {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); setActive(index => Math.min(choices.length - 1, index + 1)); break
      case 'ArrowUp': event.preventDefault(); setActive(index => Math.max(0, index - 1)); break
      case 'Home': event.preventDefault(); setActive(0); break
      case 'End': event.preventDefault(); setActive(choices.length - 1); break
      case 'Enter':
      case ' ': event.preventDefault(); choose(active); break
      case 'Escape': event.preventDefault(); event.stopPropagation(); close(true); break
      case 'Tab': setOpen(false); break
      default: break
    }
  }

  return <Row id={id} label={label} description={description}>
    <span className="dsh-ar-select-wrap">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="dsh-ar-popup-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        disabled={disabled}
        onClick={() => { open ? close(true) : openMenu() }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openMenu()
          }
        }}
      >
        <span className="dsh-ar-popup-value">{selected?.[1] ?? ''}</span>
        <svg className="dsh-ar-popup-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && rect && createPortal(
        <div
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-opt-${active}`}
          tabIndex={-1}
          className="dsh-ar-popup"
          style={{ left: rect.left, top: rect.top, width: rect.width, maxHeight: rect.maxHeight }}
          onKeyDown={onListKeyDown}
        >
          {choices.map(([option, title], index) => <button
            key={String(option)}
            id={`${id}-opt-${index}`}
            type="button"
            role="option"
            aria-selected={option === value}
            tabIndex={-1}
            className={cx('dsh-ar-popup-item', index === active && 'is-active', option === value && 'is-selected')}
            onMouseEnter={() => { setActive(index) }}
            onClick={() => { choose(index) }}
          >
            <span className="dsh-ar-popup-item-label">{title}</span>
            {option === value ? <svg className="dsh-ar-popup-check" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg> : null}
          </button>)}
        </div>,
        document.body,
      )}
    </span>
  </Row>
}

/** Downscale an uploaded image into a data URL that fits local storage. */
function imageDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => { reject(new Error('read')) }
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => { reject(new Error('decode')) }
      image.onload = () => {
        const max = 1920
        const ratio = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
        const context = canvas.getContext('2d')
        if (!context) { reject(new Error('canvas')); return }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/webp', 0.85))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/** Image row: upload, preview and remove a custom immersive background. */
export function ImageField({ id, label, description, value, disabled, onChange }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pick = async file => {
    setBusy(true)
    setError('')
    try {
      onChange(await imageDataUrl(file))
    } catch {
      setError('图片无法读取，请换一张试试。')
    } finally {
      setBusy(false)
    }
  }
  return <Row id={id} label={label} description={error || description}>
    <div className="dsh-ar-image-control">
      {value
        ? <img className="dsh-ar-image-thumb" src={value} alt="" />
        : <span className="dsh-ar-image-empty">未选择</span>}
      <input ref={inputRef} type="file" accept="image/*" hidden id={id} aria-label={label}
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void pick(file)
        }} />
      <Button variant="outline" size="sm" disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}>{value ? '更换图片' : '选择图片'}</Button>
      {value ? <Button variant="ghost" size="sm" disabled={disabled || busy} onClick={() => onChange('')}>移除</Button> : null}
    </div>
  </Row>
}

/** Color row using a native color well inside the shared input chrome. */
export function ColorField({ id, label, description, value, disabled, onChange }) {
  return <Row id={id} label={label} description={description}>
    <input
      id={id}
      type="color"
      aria-label={label}
      className="dsh-ar-color"
      value={value}
      disabled={disabled}
      onChange={event => { onChange(event.target.value) }}
    />
  </Row>
}
