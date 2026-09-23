// Device capability + viewport helpers shared across the UI and scene.
//
// IS_TOUCH is the one source of truth for "show touch controls instead of
// keyboard hints". It's a load-time constant (it also sets scatter density when
// the world is built). Only a device whose PRIMARY input is a finger — coarse
// pointer, no hover: phones and tablets — counts as touch. A laptop with a
// touchscreen still has a mouse/trackpad as its primary pointer, and a narrow
// desktop window is still a desktop, so both get keyboard + mouse controls.
import { useEffect, useState } from 'react'

const hasWindow = typeof window !== 'undefined'
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

export const IS_TOUCH = hasWindow && (window.matchMedia?.(TOUCH_QUERY).matches ?? false)

// If the primary input changes while the page is open (e.g. toggling the browser
// dev tools' phone emulation, or docking a tablet into a keyboard), reload so the
// controls AND the world density match the new device instead of getting stuck.
if (hasWindow && window.matchMedia) {
  window.matchMedia(TOUCH_QUERY).addEventListener?.('change', (e) => {
    if (e.matches !== IS_TOUCH) window.location.reload()
  })
}

// A small phone (used to thin particles / shrink HUD a touch further). Based on
// the *shorter* edge so it's orientation-independent.
export const IS_PHONE =
  IS_TOUCH && hasWindow && Math.min(window.innerWidth, window.innerHeight) < 600

export function useIsTouch() {
  return IS_TOUCH
}

export type Viewport = { w: number; h: number; short: number; portrait: boolean }

function read(): Viewport {
  const w = hasWindow ? window.innerWidth : 1280
  const h = hasWindow ? window.innerHeight : 720
  return { w, h, short: Math.min(w, h), portrait: h >= w }
}

// Reactive viewport for HUD layout. One throttled (rAF) resize/orientation
// listener; components that genuinely need to branch on size read this. Prefer
// CSS clamp()/min()/vw where a value can just scale without React re-render.
export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read)
  useEffect(() => {
    if (!hasWindow) return
    let raf = 0
    const onResize = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setVp(read())
      })
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return vp
}

// True below a width where the desktop HUD should start compacting. Derived from
// useViewport so it updates live as the window is dragged narrower.
export function useCompact(threshold = 760): boolean {
  return useViewport().w < threshold
}
