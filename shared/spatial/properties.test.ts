// Invariants the spatial engine must keep on any drawing: measurements do not
// depend on where the plan sits, how it is rotated or how its polygons wind,
// and widening a space can only clear findings, never add them.
import { describe, expect, it } from 'vitest'

import { SEED_SHEETS } from '../../server/seed/sheets'
import { STATUTORY_CORPUS } from '../../server/seed/statutory-corpus'
import { type ClauseRow, analyzeSheet } from './analysis'
import {
  type Door,
  type Point,
  type Zone,
  centroid,
  clearanceRect,
  closestPointOnSegment,
  doorCenter,
  doorLatch,
  maneuveringDepth,
  minOpposingWidth,
  perimeter,
  pointInPolygon,
  segmentsCross,
  shoelaceArea,
} from './geometry'

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
const shift = (poly: Point[], dx: number, dy: number) => poly.map((p) => ({ x: p.x + dx, y: p.y + dy }))
const rot90 = (poly: Point[]) => poly.map((p) => ({ x: -p.y, y: p.x }))
const rotate = (poly: Point[], deg: number) => {
  const r = (deg * Math.PI) / 180
  return poly.map((p) => ({ x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) }))
}

// Random simple polygons: a star-shaped polygon around a centre, vertices sorted by angle.
function randomPolygon(r: () => number): Point[] {
  const n = 4 + Math.floor(r() * 7)
  const angles = Array.from({ length: n }, () => r() * Math.PI * 2).sort((a, b) => a - b)
  return angles.map((a) => {
    const rad = 60 + r() * 180
    return { x: 400 + rad * Math.cos(a), y: 400 + rad * Math.sin(a) }
  })
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

describe('area and perimeter are properties of the shape, not its placement', () => {
  it('survive translation, rotation and reversed winding', () => {
    for (const seed of SEEDS) {
      const poly = randomPolygon(rng(seed))
      const a = shoelaceArea(poly)
      const p = perimeter(poly)
      for (const moved of [shift(poly, 1234, -567), rotate(poly, 37), [...poly].reverse()]) {
        expect(shoelaceArea(moved)).toBeCloseTo(a, 6)
        expect(perimeter(moved)).toBeCloseTo(p, 6)
      }
    }
  })

  it('scale area by k² and perimeter by k', () => {
    for (const seed of SEEDS) {
      const poly = randomPolygon(rng(seed))
      const scaled = poly.map((q) => ({ x: q.x * 3, y: q.y * 3 }))
      expect(shoelaceArea(scaled)).toBeCloseTo(shoelaceArea(poly) * 9, 4)
      expect(perimeter(scaled)).toBeCloseTo(perimeter(poly) * 3, 6)
    }
  })

  it('puts the centroid of a star-shaped polygon inside it', () => {
    for (const seed of SEEDS) {
      const poly = randomPolygon(rng(seed))
      expect(pointInPolygon(centroid(poly), poly)).toBe(true)
    }
  })
})

describe('clear width', () => {
  it('is the short side of any rectangle, in any position or quarter turn', () => {
    const r = rng(99)
    for (let k = 0; k < 40; k++) {
      const w = 24 + Math.round(r() * 200)
      const h = 24 + Math.round(r() * 200)
      const box = shift(rect(0, 0, w, h), Math.round(r() * 900), Math.round(r() * 900))
      expect(minOpposingWidth(box).widthIn).toBeCloseTo(Math.min(w, h), 6)
      expect(minOpposingWidth(rot90(box)).widthIn).toBeCloseTo(Math.min(w, h), 6)
    }
  })

  it('never exceeds the shorter side of the bounding box', () => {
    for (const seed of SEEDS) {
      const poly = randomPolygon(rng(seed))
      const xs = poly.map((p) => p.x)
      const ys = poly.map((p) => p.y)
      const bound = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
      expect(minOpposingWidth(poly).widthIn).toBeLessThanOrEqual(bound + 1e-6)
    }
  })
})

describe('containment and crossings', () => {
  it('puts random points of a rectangle inside it and points beyond it outside', () => {
    const r = rng(7)
    const box = rect(100, 100, 400, 300)
    for (let k = 0; k < 200; k++) {
      expect(pointInPolygon({ x: 101 + r() * 298, y: 101 + r() * 198 }, box)).toBe(true)
      expect(pointInPolygon({ x: 401 + r() * 300, y: r() * 600 }, box)).toBe(false)
    }
  })

  it('counts a proper X as a crossing, symmetrically', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 10 }
    const c = { x: 0, y: 10 }
    const d = { x: 10, y: 0 }
    expect(segmentsCross(a, b, c, d)).toBe(true)
    expect(segmentsCross(c, d, a, b)).toBe(true)
    expect(segmentsCross(b, a, d, c)).toBe(true)
  })

  it('does not count touching endpoints, collinear overlap or parallel segments as crossing', () => {
    expect(segmentsCross({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 0 })).toBe(false)
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBe(false)
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false)
  })

  it('projects onto a segment and clamps to its ends', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    expect(closestPointOnSegment({ x: 40, y: 25 }, a, b)).toEqual({ x: 40, y: 0 })
    expect(closestPointOnSegment({ x: -30, y: 5 }, a, b)).toEqual(a)
    expect(closestPointOnSegment({ x: 130, y: -5 }, a, b)).toEqual(b)
    expect(closestPointOnSegment({ x: 9, y: 9 }, a, a)).toEqual(a)
  })
})

describe('doors', () => {
  const door = (angle: number, width = 36): Door => ({ id: 'd', label: 'D', hingeX: 50, hingeY: 80, widthIn: width, swingAngleDeg: angle, swingSide: 1, exterior: false })

  it('puts the latch one leaf from the hinge and the centre halfway, at any angle', () => {
    for (const angle of [0, 30, 90, 135, 180, 270]) {
      const d = door(angle)
      const latch = doorLatch(d)
      const c = doorCenter(d)
      expect(Math.hypot(latch.x - d.hingeX, latch.y - d.hingeY)).toBeCloseTo(36, 9)
      expect(c.x).toBeCloseTo((d.hingeX + latch.x) / 2, 9)
      expect(c.y).toBeCloseTo((d.hingeY + latch.y) / 2, 9)
    }
  })

  it('sizes the pull-side clearance rectangle to (leaf + latch side) × depth', () => {
    for (const angle of [0, 90, 45]) {
      const area = shoelaceArea(clearanceRect(door(angle), 18, 60))
      expect(area).toBeCloseTo((36 + 18 - 1) * (60 - 0.5), 6)
    }
  })

  it('gets deeper, never shallower, as the room in front of the door gets deeper', () => {
    // A door on the top wall of a room, swinging into it.
    const d: Door = { id: 'd', label: 'D', hingeX: 20, hingeY: 0, widthIn: 32, swingAngleDeg: 0, swingSide: 1, exterior: false }
    let last = 0
    for (const depth of [20, 30, 40, 50, 60, 80]) {
      const got = maneuveringDepth(d, rect(0, 0, 120, depth), 18, 60)
      expect(got).toBeGreaterThanOrEqual(last - 1e-6)
      expect(got).toBeLessThanOrEqual(Math.min(depth, 60) + 1e-6)
      last = got
    }
    expect(last).toBe(60)
  })
})

describe('audit invariants on the seeded sheets', () => {
  const clauses: ClauseRow[] = STATUTORY_CORPUS.map((c) => ({ ...c, id: c.sectionRef, clauseHash: 'h' }))
  const zonesOf = (title: string): Zone[] =>
    SEED_SHEETS.find((s) => s.title === title)!.zones.map((z) => ({ id: z.key, label: z.label, zoneType: z.zoneType, vertices: z.vertices, doors: z.doors }))
  const verdicts = (zones: Zone[], sprinklered = false) =>
    analyzeSheet(zones, sprinklered, clauses)
      .evaluations.map((e) => `${e.sectionRef}|${e.subjectRef}|${e.severity}`)
      .sort()

  it('is deterministic: the same drawing always gives the same findings', () => {
    for (const title of ['ADU Residential Plan', 'Medical Clinic Suite']) {
      expect(verdicts(zonesOf(title))).toEqual(verdicts(zonesOf(title)))
    }
  })

  it('does not change when the whole sheet is moved', () => {
    for (const title of ['ADU Residential Plan', 'Medical Clinic Suite']) {
      const zones = zonesOf(title)
      const moved = zones.map((z) => ({
        ...z,
        vertices: shift(z.vertices, 600, 240),
        doors: z.doors.map((d) => ({ ...d, hingeX: d.hingeX + 600, hingeY: d.hingeY + 240 })),
      }))
      expect(verdicts(moved)).toEqual(verdicts(zones))
    }
  })

  it('clears the ADA 403.5.1 hall finding when the hall is widened to 36 in, and adds no new criticals', () => {
    const zones = zonesOf('ADU Residential Plan')
    const before = verdicts(zones).filter((v) => v.endsWith('CRITICAL'))
    // Push the hall's south wall down 4 in, moving the bath and study walls (and their doors) with it.
    const widened = zones.map((z) => {
      if (z.id === 'hall') return { ...z, vertices: rect(204, 108, 360, 144) }
      if (z.id === 'bath' || z.id === 'study') {
        return {
          ...z,
          vertices: z.vertices.map((p) => (p.y === 140 ? { ...p, y: 144 } : p)),
          doors: z.doors.map((d) => (d.hingeY === 140 ? { ...d, hingeY: 144 } : d)),
        }
      }
      return z
    })
    const after = verdicts(widened).filter((v) => v.endsWith('CRITICAL'))
    expect(before).toContain('ADA-403.5.1|zone:hall|CRITICAL')
    expect(after).not.toContain('ADA-403.5.1|zone:hall|CRITICAL')
    for (const v of after) expect(before).toContain(v)
  })

  it('never adds criticals when the building is sprinklered', () => {
    for (const title of ['ADU Residential Plan', 'Medical Clinic Suite']) {
      const zones = zonesOf(title)
      const dry = verdicts(zones, false).filter((v) => v.endsWith('CRITICAL'))
      const wet = verdicts(zones, true).filter((v) => v.endsWith('CRITICAL'))
      for (const v of wet) expect(dry).toContain(v)
    }
  })
})
