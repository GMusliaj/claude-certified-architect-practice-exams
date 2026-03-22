import { useState, useEffect, useRef } from 'react'
import { getTheme, setTheme, THEMES } from '../lib/theme'

const LABELS = { light: 'Light', dark: 'Dark', system: 'System' }
const ICONS  = { light: '☀', dark: '☽', system: '⊡' }

export default function ThemeToggle() {
  const [current, setCurrent] = useState(getTheme)
  const [open, setOpen]       = useState(false)
  const ref                   = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function pick(t) {
    setTheme(t)
    setCurrent(t)
    setOpen(false)
  }

  return (
    <div className="theme-toggle" ref={ref}>
      <button className="theme-btn" onClick={() => setOpen(o => !o)} title="Theme">
        <span className="theme-btn-icon">{ICONS[current]}</span>
      </button>
      {open && (
        <div className="theme-dropdown">
          {THEMES.map(t => (
            <button key={t} className={`theme-option${current === t ? ' active' : ''}`} onClick={() => pick(t)}>
              <span className="theme-opt-icon">{ICONS[t]}</span>
              <span>{LABELS[t]}</span>
              {current === t && <span className="theme-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
