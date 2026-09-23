import { type CSSProperties, useEffect, useRef } from 'react'
import { useWorld } from '../../state/useWorld'
import { PERF } from '../../scene/core/perfProbe'

// Debug readout toggled by Settings → "Show FPS": frames per second, frame time,
// draw calls and triangles for the whole frame (all render passes). Updates its
// text directly a few times a second — no React re-renders.
export function FpsOverlay() {
  const show = useWorld((s) => s.showFps)
  const started = useWorld((s) => s.started)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return
    const id = window.setInterval(() => {
      const el = ref.current
      if (!el) return
      const k = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 1e5 ? 0 : 1) + 'k' : String(n))
      el.textContent = `${PERF.fps} FPS · ${PERF.ms.toFixed(1)} ms · ${k(PERF.calls)} calls · ${k(PERF.tris)} tris`
      el.style.color = PERF.fps >= 55 ? '#9be08f' : PERF.fps >= 30 ? '#f5d36b' : '#f28b7b'
    }, 250)
    return () => window.clearInterval(id)
  }, [show])

  if (!show || !started) return null
  return <div ref={ref} style={sBox}>…</div>
}

const sBox: CSSProperties = {
  position: 'fixed',
  top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
  left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
  zIndex: 130,
  padding: '4px 9px',
  borderRadius: 6,
  background: 'rgba(20,16,10,0.72)',
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.3,
  pointerEvents: 'none',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}
