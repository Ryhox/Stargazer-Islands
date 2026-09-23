import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

// Live frame stats for the "Show FPS" debug overlay. Filled inside the Canvas by
// PerfProbe; read by the DOM overlay (FpsOverlay) on its own timer — kept off
// React state so measuring never re-renders anything.
export const PERF = { fps: 0, ms: 0, calls: 0, tris: 0 }

// Post-processing renders several passes per frame and three's renderer.info
// resets on every render() call, so counting is switched to manual: totals are
// read at the START of each frame (= the whole previous frame) and then reset.
export function PerfProbe() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const acc = useRef({ frames: 0, t0: performance.now() })

  useEffect(() => {
    gl.info.autoReset = false
    // Dev-only handles for profiling from the console / test harness.
    if (import.meta.env.DEV) Object.assign(window, { __gl: gl, __scene: scene, __camera: camera, __perf: PERF })
    return () => {
      gl.info.autoReset = true
    }
  }, [gl, scene, camera])

  useFrame(() => {
    const now = performance.now()
    const a = acc.current
    PERF.calls = gl.info.render.calls
    PERF.tris = gl.info.render.triangles
    gl.info.reset()
    a.frames++
    // smooth fps / frame time over ~0.5s windows
    if (now - a.t0 >= 500) {
      PERF.fps = Math.round((a.frames * 1000) / (now - a.t0))
      PERF.ms = (now - a.t0) / a.frames
      a.frames = 0
      a.t0 = now
    }
  }, -1000) // runs before everything else in the frame

  return null
}
