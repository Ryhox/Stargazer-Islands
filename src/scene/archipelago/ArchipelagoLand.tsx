import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { patchReveal } from '../terrain/patchReveal'
import { ArchipelagoScatter } from './ArchipelagoScatter'
import { useLoadStatus } from '../../ui/intro/loadStatus'
import { useWorld } from '../../state/useWorld'
import { LITE } from '../core/config'
import { archColorAt, islandHeightAt, useArchipelago, type IslandInstance } from './archipelago'

// One displaced, biome-coloured terrain patch per island. World coordinates are
// baked into the geometry (so islandHeightAt/archColorAt sample directly), and
// the reveal-ring shader is patched in like the home island.
function IslandMesh({ isl }: { isl: IslandInstance }) {
  const geometry = useMemo(() => {
    const size = isl.radius * 2 * 1.7 // dome + a margin that sinks into the sea
    const seg = Math.max(24, Math.min(96, Math.round(isl.radius * 3)))
    const g = new THREE.PlaneGeometry(size, size, seg, seg)
    g.rotateX(-Math.PI / 2)
    g.translate(isl.cx, 0, isl.cz)

    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, islandHeightAt(isl, pos.getX(i), pos.getZ(i)))
    }
    g.computeVertexNormals()

    const normal = g.attributes.normal as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      archColorAt(isl, pos.getX(i), pos.getY(i), pos.getZ(i), normal.getY(i), tmp)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [isl])

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 })
    patchReveal(m)
    return m
  }, [])

  return <mesh geometry={geometry} material={material} receiveShadow castShadow />
}

export function ArchipelagoLand() {
  const islands = useArchipelago((s) => s.islands)
  const ensureLoaded = useArchipelago((s) => s.ensureLoaded)

  // The stargazer isles share the world with the home isle (getHeight blends the
  // two fields), so they just load and stay mounted.
  useEffect(() => {
    ensureLoaded()
  }, [ensureLoaded])

  // The stargazer list usually lands AFTER the loading-screen warm-up, so its
  // isles would compile their shaders synchronously the first time they're drawn
  // (up to ~0.7s freezes mid-sail). Whenever the isles' meshes change after the
  // warm-up, hide them for the moment it takes to compile in the background.
  const group = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const watch = useRef({ count: -1, compiling: false })
  useFrame(() => {
    const g = group.current
    const w = watch.current
    if (!g || w.compiling || !useLoadStatus.getState().warmReady) return
    let count = 0
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) count++
    })
    if (count === w.count) return
    w.count = count
    const r = gl as unknown as {
      compileAsync?: (o: THREE.Object3D, c: THREE.Camera, target: THREE.Scene) => Promise<unknown>
    }
    if (!r.compileAsync) return
    w.compiling = true
    // Post-processing renders into a render target (programs are keyed on that).
    const q = useWorld.getState().quality
    const prevRT = gl.getRenderTarget()
    const tmpRT = !LITE && q !== 'Low' ? new THREE.WebGLRenderTarget(1, 1) : null
    let done: Promise<unknown>
    try {
      if (tmpRT) gl.setRenderTarget(tmpRT)
      g.visible = true // compile() walks visible objects only
      done = r.compileAsync(g, camera, scene) // lights come from the real scene
    } finally {
      gl.setRenderTarget(prevRT)
      tmpRT?.dispose()
    }
    g.visible = false
    const show = () => {
      g.visible = true
      w.compiling = false
    }
    done.then(show, show)
  })

  return (
    <group ref={group}>
      {islands.map((isl) => (
        <IslandMesh key={isl.id} isl={isl} />
      ))}
      <Suspense fallback={null}>
        <ArchipelagoScatter islands={islands} />
      </Suspense>
    </group>
  )
}
