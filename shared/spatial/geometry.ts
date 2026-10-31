// Exact 2D computational geometry for floorplans. All coordinates are inches
// in sheet space (x right, y down). Nothing here is approximated by lookup.

export type Point = { x: number; y: number }

export type Door = {
  id: string
  label: string
  hingeX: number
  hingeY: number
  widthIn: number
  swingAngleDeg: number
  swingSide: 1 | -1
  exterior: boolean
}

export type Zone = {
  id: string
  label: string
  zoneType: ZoneType
  vertices: Point[]
  doors: Door[]
}

export const ZONE_TYPES = [
  'corridor',
  'office',
  'assembly',
  'restroom',
  'exit_stair',
  'lobby',
] as const
export type ZoneType = (typeof ZONE_TYPES)[number]

export const EPS = 1e-9

export function shoelaceArea(poly: Point[]): number {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function signedArea(poly: Point[]): number {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function perimeter(poly: Point[]): number {
  let total = 0
  for (let i = 0; i < poly.length; i++) {
    total += dist(poly[i]!, poly[(i + 1) % poly.length]!)
  }
  return total
}

export function centroid(poly: Point[]): Point {
  const a = signedArea(poly)
  if (Math.abs(a) < EPS) {
    const n = poly.length || 1
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < EPS) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

export function edges(poly: Point[]): [Point, Point][] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]!] as [Point, Point])
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export function distanceToBoundary(p: Point, poly: Point[]): number {
  return Math.min(...edges(poly).map(([a, b]) => pointSegmentDistance(p, a, b)))
}

function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

// True only for a proper crossing (interiors intersect at a single point).
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  return o1 * o2 < -EPS && o3 * o4 < -EPS
}

// A segment is walkable inside a polygon if it crosses no wall and its
// midpoint is inside (or on) the polygon.
export function segmentInside(a: Point, b: Point, poly: Point[]): boolean {
  for (const [c, d] of edges(poly)) {
    if (segmentsCross(a, b, c, d)) return false
  }
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return pointInPolygon(mid, poly) || distanceToBoundary(mid, poly) < 0.5
}

// A point guaranteed to be inside the polygon: the centroid when it is
// inside, otherwise the midpoint of the widest interior scanline.
export function interiorPoint(poly: Point[]): Point {
  const c = centroid(poly)
  if (pointInPolygon(c, poly)) return c
  const ys = poly.map((p) => p.y)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  let best: Point = poly[0]!
  let bestSpan = -1
  for (let k = 1; k < 32; k++) {
    const y = minY + ((maxY - minY) * k) / 32
    const xs: number[] = []
    for (const [a, b] of edges(poly)) {
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
    xs.sort((p, q) => p - q)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const span = xs[i + 1]! - xs[i]!
      if (span > bestSpan) {
        bestSpan = span
        best = { x: (xs[i]! + xs[i + 1]!) / 2, y }
      }
    }
  }
  return best
}

export type ClearWidth = { widthIn: number; at: Point; a: Point; b: Point }

// Minimum perpendicular clear width between opposing (anti-parallel,
// overlapping) walls. For a rectangle it is the short side; for a corridor
// with a jog it is the pinch.
export function minOpposingWidth(poly: Point[]): ClearWidth {
  const es = edges(poly)
  let best: ClearWidth = { widthIn: Infinity, at: poly[0]!, a: poly[0]!, b: poly[0]! }
  const cosTol = Math.cos((10 * Math.PI) / 180)
  for (let i = 0; i < es.length; i++) {
    const [a1, a2] = es[i]!
    const ux = a2.x - a1.x
    const uy = a2.y - a1.y
    const ulen = Math.hypot(ux, uy)
    if (ulen < EPS) continue
    for (let j = 0; j < es.length; j++) {
      if (i === j) continue
      const [b1, b2] = es[j]!
      const vx = b2.x - b1.x
      const vy = b2.y - b1.y
      const vlen = Math.hypot(vx, vy)
      if (vlen < EPS) continue
      const dot = (ux * vx + uy * vy) / (ulen * vlen)
      if (dot > -cosTol) continue
      // project b onto a's axis and keep the overlapping interval
      const tx = ux / ulen
      const ty = uy / ulen
      const proj = (p: Point) => (p.x - a1.x) * tx + (p.y - a1.y) * ty
      const lo = Math.max(0, Math.min(proj(b1), proj(b2)))
      const hi = Math.min(ulen, Math.max(proj(b1), proj(b2)))
      if (hi - lo < 1) continue
      for (const s of [lo, hi, (lo + hi) / 2]) {
        const p = { x: a1.x + tx * s, y: a1.y + ty * s }
        const d = pointSegmentDistance(p, b1, b2)
        const foot = closestPointOnSegment(p, b1, b2)
        // the gap must open across the interior, not across the outside
        const mid = { x: (p.x + foot.x) / 2, y: (p.y + foot.y) / 2 }
        if (!pointInPolygon(mid, poly)) continue
        if (d < best.widthIn && d > 0.5) {
          best = { widthIn: d, at: { x: (p.x + foot.x) / 2, y: (p.y + foot.y) / 2 }, a: p, b: foot }
        }
      }
    }
  }
  if (!Number.isFinite(best.widthIn)) {
    const c = centroid(poly)
    return { widthIn: 0, at: c, a: c, b: c }
  }
  return best
}

export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < EPS) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

// ---------- doors ----------

export function doorAxis(door: Door): { u: Point; n: Point } {
  const r = (door.swingAngleDeg * Math.PI) / 180
  const u = { x: Math.cos(r), y: Math.sin(r) }
  return { u, n: { x: -u.y * door.swingSide, y: u.x * door.swingSide } }
}

export function doorCenter(door: Door): Point {
  const { u } = doorAxis(door)
  return { x: door.hingeX + (u.x * door.widthIn) / 2, y: door.hingeY + (u.y * door.widthIn) / 2 }
}

export function doorLatch(door: Door): Point {
  const { u } = doorAxis(door)
  return { x: door.hingeX + u.x * door.widthIn, y: door.hingeY + u.y * door.widthIn }
}

// Rectangle [0, len] along u and [0.5, depth] along n anchored at the hinge.
export function clearanceRect(door: Door, latchSideIn: number, depthIn: number): Point[] {
  const { u, n } = doorAxis(door)
  const h = { x: door.hingeX, y: door.hingeY }
  const len = door.widthIn + latchSideIn
  const at = (s: number, t: number) => ({ x: h.x + u.x * s + n.x * t, y: h.y + u.y * s + n.y * t })
  return [at(0.5, 0.5), at(len - 0.5, 0.5), at(len - 0.5, depthIn), at(0.5, depthIn)]
}

// Largest depth (≤ maxDepth) of the maneuvering clearance on the swing side
// before a wall intrudes, found by bisection on the exact containment test.
export function maneuveringDepth(door: Door, region: Point[], latchSideIn: number, maxDepth: number): number {
  const fits = (d: number) => {
    const rect = clearanceRect(door, latchSideIn, d)
    if (!rect.every((c) => pointInPolygon(c, region) || distanceToBoundary(c, region) < 0.25)) return false
    for (let i = 0; i < rect.length; i++) {
      const a = rect[i]!
      const b = rect[(i + 1) % rect.length]!
      for (const [c, e] of edges(region)) if (segmentsCross(a, b, c, e)) return false
    }
    return true
  }
  if (fits(maxDepth)) return maxDepth
  if (!fits(1)) return 0
  let lo = 1
  let hi = maxDepth
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

export function round(n: number, digits = 1): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
