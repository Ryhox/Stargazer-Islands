import { useFrame, useThree } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type * as THREE from 'three'

// Skips DETAIL (ground cover, fireflies, light shafts…) of the home isle once the
// camera is far out at sea: too small to read at that range, yet tens of thousands
// of instances + a shadow pass per frame. The isle itself, its trees and props
// stay drawn, so it still reads on the horizon. Hidden subtrees also skip their
// per-frame world-matrix updates.
export const HOME_DETAIL_R = 200

export function FarCull({ children, radius = HOME_DETAIL_R }: { children: ReactNode; radius?: number }) {
  const ref = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const far = Math.hypot(camera.position.x, camera.position.z) > radius
    if (g.visible === far) {
      g.visible = !far
      g.matrixWorldAutoUpdate = !far
    }
  })
  return <group ref={ref}>{children}</group>
}
