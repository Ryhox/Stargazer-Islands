import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSky } from '../core/palette'
import { useWorld } from '../../state/useWorld'
import { WATER_LEVEL } from '../terrain/terrain'
import { createWaterMaterial, ISLE_FOAM_MAX } from './waterMaterial'
import { RIPPLE } from './rippleField'
import { SWIM } from './swimState'
import { NAV } from '../boat/boatState'
import { foamIslands } from '../archipelago/archipelago'

export function Water() {
  const material = useMemo(() => createWaterMaterial(), [])
  const meshRef  = useRef<THREE.Mesh>(null)
  const foamTimer = useRef(0)
  // Large enough that its edge sits far beyond the fog distance, so the sea
  // reads as endless. The mesh FOLLOWS the camera and its vertices are packed
  // densely around the centre (~1m apart, ~17m at the far fogged rim): with an
  // even grid (9m cells) the ~20m swells were smoothed away on screen while the
  // boat/swimmer ride the exact wave height — so they dipped under the drawn sea.
  const geometry = useMemo(() => {
    const HALF = 1300
    const g = new THREE.PlaneGeometry(2, 2, 280, 280)
    g.rotateX(-Math.PI / 2)
    const warp = (u: number) => HALF * u * (0.12 + 0.88 * Math.abs(u))
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, warp(pos.getX(i)))
      pos.setZ(i, warp(pos.getZ(i)))
    }
    g.computeBoundingSphere()
    return g
  }, [])

  useFrame((state, delta) => {
    const { worldVisible, started } = useWorld.getState()
    const m = meshRef.current
    if (m) {
      m.visible = worldVisible
      // Follow the camera (snapped to a small step so the dense core doesn't swim).
      m.position.x = Math.round(state.camera.position.x * 2) / 2
      m.position.z = Math.round(state.camera.position.z * 2) / 2
    }
    if (!worldVisible) return

    const s = getSky(useWorld.getState().t)
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    // Stay fully present the moment the sea appears — no slow see-through fade-in on
    // the idle "click to start" screen. (Mesh visibility is still gated by worldVisible.)
    u.uOpacity.value = 0.96  // mostly opaque, stylized
    u.uUnder.value = THREE.MathUtils.smoothstep(SWIM.depth, 0, 0.5) // smooth surface→underside
    // shore foam stays hidden on the idle "click to start" screen, ramps in once playing
    u.uShoreFoam.value += ((started ? 1 : 0) - u.uShoreFoam.value) * Math.min(1, delta * 1.5)
    u.uDeep.value.copy(s.waterDeep)
    u.uShallow.value.copy(s.waterShallow)
    u.uSky.value.copy(s.skyBottom)
    u.uSunDir.value.copy(s.sunDir)
    u.uSunColor.value.copy(s.sunColor)
    // night sky / star reflection (fades in with the stars)
    u.uNight.value = s.starsOpacity
    u.uMoonDir.value.copy(s.moonDir)

    // live ripple field — RippleSim swaps RIPPLE.texture each frame
    u.uRipple.value = RIPPLE.texture
    u.uRippleOn.value = RIPPLE.enabled ? 1 : 0
    u.uRippleCenter.value.copy(RIPPLE.center)
    u.uRippleSize.value = RIPPLE.size

    // foam: the home isle keeps its baked shore ring, and each stargazer isle near
    // you gets its own ring (they share one sea).
    u.uHomeFoamOn.value = 1
    {
      foamTimer.current += delta
      if (foamTimer.current > 0.15) {
        foamTimer.current = 0
        const near = foamIslands(NAV.px, NAV.pz, ISLE_FOAM_MAX)
        const slots = u.uIslands.value as THREE.Vector4[]
        for (let i = 0; i < ISLE_FOAM_MAX; i++) {
          const isl = near[i]
          if (isl) slots[i].set(isl.cx, isl.cz, isl.radius, isl.seed)
          else slots[i].set(0, 0, 0, 0)
        }
        u.uIslandCount.value = near.length
      }
    }
  })

  return <mesh ref={meshRef} geometry={geometry} material={material} position={[0, WATER_LEVEL - 0.03, 0]} renderOrder={2} frustumCulled={false} />
}
