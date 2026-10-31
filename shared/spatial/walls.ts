// Shared walls. Zones that touch share a wall line, so when a redline moves
// one zone's wall, the neighbour's corners and the doors hung on that wall
// have to move with it; otherwise the rooms overlap or open a gap.
import { type Door, type Point, type Zone, pointSegmentDistance } from './geometry'

const ON_WALL_IN = 0.5
const EPS = 1e-6

type Shift = { a: Point; b: Point; dx: number; dy: number }

// Edges of the original polygon that the proposal moved rigidly (both ends by
// the same offset). Stretched or rotated edges are not shared-wall moves.
export function translatedEdges(original: Point[], proposed: Point[]): Shift[] {
  if (original.length !== proposed.length || original.length < 3) return []
  const shifts: Shift[] = []
  for (let i = 0; i < original.length; i++) {
    const j = (i + 1) % original.length
    const a = original[i]!
    const b = original[j]!
    const da = { x: proposed[i]!.x - a.x, y: proposed[i]!.y - a.y }
    const db = { x: proposed[j]!.x - b.x, y: proposed[j]!.y - b.y }
    const moved = Math.abs(da.x) > EPS || Math.abs(da.y) > EPS
    if (moved && Math.abs(da.x - db.x) < EPS && Math.abs(da.y - db.y) < EPS) shifts.push({ a, b, dx: da.x, dy: da.y })
  }
  return shifts
}

function shifted(p: Point, shifts: Shift[]): Point | null {
  for (const s of shifts) {
    if (pointSegmentDistance(p, s.a, s.b) <= ON_WALL_IN) return { x: p.x + s.dx, y: p.y + s.dy }
  }
  return null
}

function moveDoors(doors: Door[], shifts: Shift[]): { doors: Door[]; moved: number } {
  let moved = 0
  const next = doors.map((d) => {
    const to = shifted({ x: d.hingeX, y: d.hingeY }, shifts)
    if (!to) return d
    moved++
    return { ...d, hingeX: to.x, hingeY: to.y }
  })
  return { doors: next, moved }
}

export type WallMove = {
  /** The redlined zone's own doors, carried along with its moved walls. */
  ownDoors: Door[]
  /** Neighbouring zones whose corners or doors sat on a moved wall, updated. */
  neighbours: Zone[]
}

export function moveSharedWalls(zoneId: string, original: Point[], proposed: Point[], zones: Zone[]): WallMove {
  const shifts = translatedEdges(original, proposed)
  const own = zones.find((z) => z.id === zoneId)
  if (!shifts.length) return { ownDoors: own?.doors ?? [], neighbours: [] }
  const neighbours: Zone[] = []
  for (const z of zones) {
    if (z.id === zoneId) continue
    let touched = false
    const vertices = z.vertices.map((p) => {
      const to = shifted(p, shifts)
      if (to) touched = true
      return to ?? p
    })
    const { doors, moved } = moveDoors(z.doors, shifts)
    if (touched || moved) neighbours.push({ ...z, vertices, doors })
  }
  return { ownDoors: moveDoors(own?.doors ?? [], shifts).doors, neighbours }
}
