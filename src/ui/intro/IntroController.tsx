/**
 * Cinematic intro sequence:
 *
 * Step 0 (loading complete, +200ms):
 *   1. worldVisible=true — water is solid at once; sky/horizon fade in fast (~1.2s)
 *   2. Progress overlay fades out (0.45s)
 *   3. +150ms: the world map opens as the start screen — pick where to begin
 *
 * handleEnter (map: home isle / close; or a stargazer island via `after`):
 *   1. Expand reveal: white shockwave (0→3, 0.35s) then ring sweeps to 50 (3.5s)
 *   2. Camera flies into character (3s power2.out) — always the home spawn, on foot
 *   3. Audio fades in simultaneously
 *   4. At camera arrival: pointer lock + game active, then `after` runs (e.g. set
 *      sail to the stargazer island that was picked on the map)
 */
import { useCallback, useEffect, useRef } from 'react'
import gsap from 'gsap'
import { startAmbience, setVol as setAudioVol } from '../../audio/useAmbience'
import { requestLock } from '../../scene/core/pointerLock'
import { FLY, useWorld } from '../../state/useWorld'
import { introActions } from './introActions'
import { useLoadStatus } from './loadStatus'

export function IntroController() {
  // Overall load progress drives the ring fill; warmReady (GPU warm-up done) is
  // what actually unlocks the reveal — so the world is never shown until every
  // shader/texture/mesh is on the GPU and the first look-around is hitch-free.
  const progress  = useLoadStatus((s) => s.progress)
  const warmReady = useLoadStatus((s) => s.warmReady)
  const step0Fired = useRef(false)
  const entering   = useRef(false)

  useEffect(() => {
    useWorld.getState().setIntroProgress(progress)
  }, [progress])

  useEffect(() => {
    if (!warmReady || step0Fired.current) return
    step0Fired.current = true

    const id = setTimeout(() => {
      // Start world fade as the iris begins closing — scene fades in while overlay shrinks
      useWorld.getState().setWorldVisible(true)

      // Iris-close: overlay fades out, then the world map opens right behind it as
      // the start screen (stargazers first; the home isle sits in the middle).
      introActions.collapseProgress?.(() => {
        const mapId = setTimeout(() => {
          introActions.ready = true
          useWorld.getState().setMapOpen(true)
        }, 150)

        return () => clearTimeout(mapId)
      })
    }, 200)

    return () => {
      clearTimeout(id)
      // Reset flag so StrictMode's unmount/remount cycle can re-fire correctly
      step0Fired.current = false
    }
  }, [warmReady])

  const handleEnter = useCallback((after?: () => void) => {
    if (!introActions.ready || entering.current) return
    entering.current = true

    document.body.style.cursor = 'default'
    introActions.onHoverLeave?.()

    void startAmbience()
    setAudioVol('master', 0)

    // Ring expands independently — no callback needed, cleanup is internal
    introActions.expandReveal?.()

    // Fly-in runs in parallel; game goes live the moment camera arrives
    FLY.startPos = null
    const tl = gsap.timeline()
    tl.to(FLY, { progress: 1, duration: 3.0, ease: 'power2.out' }, 0)

    // Audio fades in alongside
    const proxy = { v: 0 }
    tl.to(proxy, {
      v: useWorld.getState().volMaster,
      duration: 2.5,
      ease: 'power1.out',
      onUpdate: () => setAudioVol('master', proxy.v),
    }, 0.3)

    // Game goes live exactly when camera arrives at spawn
    tl.call(() => {
      requestLock()
      useWorld.getState().setPaused(false)
      useWorld.getState().setStarted(true)
      after?.()
    }, [], 3.0)
  }, [])

  useEffect(() => {
    introActions.handleEnter = handleEnter
    return () => { introActions.handleEnter = null }
  }, [handleEnter])

  return null
}
