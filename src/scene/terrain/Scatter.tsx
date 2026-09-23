import { useMemo } from 'react'
import * as THREE from 'three'
import { type Placed, getNormal } from './terrain'
import { type Part, useNature } from './loadNature'
import { ROCK_MODELS, TREE_MODELS, getPlacements } from './placement'
import { FarCull } from '../core/FarCull'

const UP = new THREE.Vector3(0, 1, 0)

// Culling cells for big instanced sets (see Instanced).
const CELL = 40 // metres per patch
const CHUNK_MIN = 160 // sets at or below this stay one mesh
const BOUNDS_PAD = 2.5 // metres of slack for wind sway + the player push

// Draws one InstancedMesh per model part. The model's intrinsic size is scaled
// to a target height, multiplied by each item's variation, and seated on the
// ground (offset by the model's minY).
export function Instanced({
  parts,
  items,
  targetH,
  sizeY,
  minY,
  cast,
  recv,
  align,
  tilt,
  tint,
  sink,
}: {
  parts: Part[]
  items: Placed[]
  targetH: number
  sizeY: number
  minY: number
  cast?: boolean
  recv?: boolean
  align?: boolean
  tilt?: number // max random lean (radians) — breaks up rigid-vertical foliage
  tint?: THREE.Color // per-instance multiplicative recolour (biome tint)
  sink?: number // metres to embed the base below the ground (hides slope/facet gaps)
}) {
  const meshes = useMemo(() => {
    const baseScale = targetH / (sizeY || 1)
    const q = new THREE.Quaternion()
    const qYaw = new THREE.Quaternion()
    const qTilt = new THREE.Quaternion()
    const tiltAxis = new THREE.Vector3()
    const eul = new THREE.Euler()
    const n = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const fract = (x: number) => x - Math.floor(x)

    // Instance transforms, computed once and shared by every part.
    const mats = items.map((it) => {
      const m4 = new THREE.Matrix4()
      const fs = baseScale * it.scale
      if (align) {
        // tilt so the prop's up-axis follows the ground, then yaw around it
        getNormal(it.x, it.z, n)
        q.setFromUnitVectors(UP, n)
        qYaw.setFromAxisAngle(n, it.rotY)
        q.premultiply(qYaw)
      } else {
        eul.set(0, it.rotY, 0)
        q.setFromEuler(eul)
      }
      if (tilt) {
        // deterministic per-position lean about a random horizontal axis
        const r1 = fract(Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5453)
        const r2 = fract(Math.sin(it.x * 39.346 + it.z * 11.135) * 24634.6345)
        tiltAxis.set(Math.cos(r1 * 6.2831853), 0, Math.sin(r1 * 6.2831853))
        qTilt.setFromAxisAngle(tiltAxis, (r2 - 0.5) * 2 * tilt)
        q.premultiply(qTilt)
      }
      pos.set(it.x, it.y - minY * fs - (sink ?? 0), it.z)
      scl.set(fs, fs, fs)
      return m4.compose(pos, q, scl)
    })

    // Spatial patches, like a game engine's culling cells: big sets are split on a
    // CELL grid so each patch gets a tight bounding sphere and the renderer skips
    // every patch outside the camera's view — and, for the shadow pass, outside
    // the sun's shadow frustum. Small sets stay one mesh (with real bounds, so a
    // whole off-screen set is skipped too). Nothing visible changes: bounds are
    // padded for wind sway / the player push so a patch never pops at the edge.
    const groups: number[][] = []
    if (items.length <= CHUNK_MIN) {
      groups.push(items.map((_, i) => i))
    } else {
      const cells = new Map<string, number[]>()
      items.forEach((it, i) => {
        const key = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL)
        let g = cells.get(key)
        if (!g) cells.set(key, (g = []))
        g.push(i)
      })
      groups.push(...cells.values())
    }

    const out: THREE.InstancedMesh[] = []
    for (const p of parts) {
      for (const idx of groups) {
        const im = new THREE.InstancedMesh(p.geometry, p.material, idx.length)
        im.castShadow = !!cast
        im.receiveShadow = !!recv
        idx.forEach((src, i) => {
          im.setMatrixAt(i, mats[src])
          if (tint) im.setColorAt(i, tint)
        })
        im.instanceMatrix.needsUpdate = true
        if (im.instanceColor) im.instanceColor.needsUpdate = true
        im.computeBoundingSphere()
        if (im.boundingSphere) im.boundingSphere.radius += BOUNDS_PAD
        im.frustumCulled = true
        // Static: never recompose its (identity) local matrix every frame.
        im.matrixAutoUpdate = false
        im.updateMatrix()
        out.push(im)
      }
    }
    return out
  }, [parts, items, targetH, sizeY, minY, cast, recv, align, tilt, tint, sink])

  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

export function NatureField() {
  const nature = useNature()
  const entries = useMemo(() => getPlacements(), [])
  // Trees + rocks shape the isle's silhouette, so they're always drawn; the dense
  // ground cover (grass, flowers, clover, ferns…) is culled far out at sea.
  const big = (m: string) => TREE_MODELS.has(m) || ROCK_MODELS.has(m)
  const render = (keep: boolean) =>
    entries.map((e, i) => {
        if (big(e.model) !== keep) return null
        const model = nature[e.model]
        if (!model || e.items.length === 0) return null
        return (
          <Instanced
            key={i}
            parts={model.parts}
            items={e.items}
            targetH={e.targetH}
            sizeY={model.size.y}
            minY={model.minY}
            cast={e.cast}
            recv={e.recv}
            align={e.align}
            tilt={e.tilt}
          />
        )
      })
  return (
    <>
      {render(true)}
      <FarCull>{render(false)}</FarCull>
    </>
  )
}
