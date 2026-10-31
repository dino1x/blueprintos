import {
  type Door,
  type Point,
  type Zone,
  type ZoneType,
  centroid,
  dist,
  distanceToBoundary,
  doorAxis,
  doorCenter,
  interiorPoint,
  maneuveringDepth,
  minOpposingWidth,
  perimeter,
  pointInPolygon,
  round,
  segmentInside,
  shoelaceArea,
} from './geometry'

// IBC Table 1004.5 occupant load factors (sq ft per occupant). Spaces that
// are accessory to occupied rooms (corridors, restrooms, stairs) add no
// occupants of their own.
export const LOAD_FACTORS: Record<ZoneType, number | null> = {
  office: 150,
  assembly: 15,
  lobby: 15,
  restroom: null,
  corridor: null,
  exit_stair: null,
}

export type ClauseRow = {
  id: string
  sectionRef: string
  thresholdMetric: string
  thresholdOperator: '>=' | '<='
  thresholdValue: number
  sprinkleredThresholdValue: number | null
  perOccupantIn: number | null
  latchSideIn: number | null
  unit: string
  clauseHash: string
}

export type ZoneMetrics = {
  zoneId: string
  areaSqft: number
  perimeterFt: number
  minDimensionIn: number
  clearWidthAt: Point
  occupantLoad: number
  egressDistanceFt: number | null
  egressPath: Point[]
  doorWidthIn: number | null
  deadEndFt: number | null
}

export type DoorMetrics = {
  doorId: string
  zoneId: string
  label: string
  center: Point
  clearWidthIn: number
  servedLoad: number
  maneuveringDepthIn: number | null
  isExit: boolean
}

export type Evaluation = {
  clauseId: string
  clauseHash: string
  sectionRef: string
  zoneId: string
  subjectRef: string
  measuredValue: number
  requiredValue: number
  severity: 'CRITICAL' | 'WARNING' | 'PASS'
  pin: Point
  detail: string
}

export type SheetAnalysis = {
  zones: ZoneMetrics[]
  doors: DoorMetrics[]
  evaluations: Evaluation[]
}

const DOOR_TOUCH_IN = 6

type Node = { id: string; at: Point }

function nudgeInto(p: Point, poly: Point[], toward: Point): Point {
  if (pointInPolygon(p, poly) && distanceToBoundary(p, poly) > 0.5) return p
  const len = dist(p, toward) || 1
  const step = { x: (toward.x - p.x) / len, y: (toward.y - p.y) / len }
  for (const k of [1, 2, 4]) {
    const q = { x: p.x + step.x * k, y: p.y + step.y * k }
    if (pointInPolygon(q, poly)) return q
  }
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const q = { x: p.x + dx, y: p.y + dy }
    if (pointInPolygon(q, poly)) return q
  }
  return p
}

function doorTouches(door: Door, zone: Zone): boolean {
  return distanceToBoundary(doorCenter(door), zone.vertices) <= DOOR_TOUCH_IN
}

export function analyzeSheet(zones: Zone[], sprinklered: boolean, clauses: ClauseRow[]): SheetAnalysis {
  const allDoors = zones.flatMap((z) => z.doors.map((d) => ({ door: d, owner: z })))

  // ---- egress graph: visibility graph per zone, multi-source Dijkstra from exits
  const nodes = new Map<string, Node>()
  const adj = new Map<string, { to: string; w: number; zone: string }[]>()
  const addNode = (n: Node) => {
    nodes.set(n.id, n)
    if (!adj.has(n.id)) adj.set(n.id, [])
  }
  const exits = new Set<string>()
  for (const { door } of allDoors) {
    addNode({ id: `d:${door.id}`, at: doorCenter(door) })
    if (door.exterior) exits.add(`d:${door.id}`)
  }
  for (const zone of zones) {
    const inner = interiorPoint(zone.vertices)
    const local: { id: string; probe: Point }[] = []
    addNode({ id: `c:${zone.id}`, at: inner })
    local.push({ id: `c:${zone.id}`, probe: inner })
    zone.vertices.forEach((v, i) => {
      const id = `v:${zone.id}:${i}`
      const probe = nudgeInto(v, zone.vertices, inner)
      addNode({ id, at: probe })
      local.push({ id, probe })
    })
    for (const { door } of allDoors) {
      if (!doorTouches(door, zone)) continue
      local.push({ id: `d:${door.id}`, probe: nudgeInto(doorCenter(door), zone.vertices, inner) })
      if (zone.zoneType === 'exit_stair') exits.add(`d:${door.id}`)
    }
    for (let i = 0; i < local.length; i++) {
      for (let j = i + 1; j < local.length; j++) {
        const a = local[i]!
        const b = local[j]!
        if (!segmentInside(a.probe, b.probe, zone.vertices)) continue
        const w = dist(nodes.get(a.id)!.at, nodes.get(b.id)!.at)
        adj.get(a.id)!.push({ to: b.id, w, zone: zone.id })
        adj.get(b.id)!.push({ to: a.id, w, zone: zone.id })
      }
    }
  }
  const D = new Map<string, number>()
  const pred = new Map<string, { node: string; zone: string }>()
  const queue: [number, string][] = []
  for (const e of exits) {
    D.set(e, 0)
    queue.push([0, e])
  }
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0])
    const [d, u] = queue.shift()!
    if (d > (D.get(u) ?? Infinity)) continue
    for (const edge of adj.get(u) ?? []) {
      const nd = d + edge.w
      if (nd < (D.get(edge.to) ?? Infinity)) {
        D.set(edge.to, nd)
        pred.set(edge.to, { node: u, zone: edge.zone })
        queue.push([nd, edge.to])
      }
    }
  }

  // ---- per-zone metrics
  const metrics: ZoneMetrics[] = zones.map((zone) => {
    const areaSqft = shoelaceArea(zone.vertices) / 144
    const clear = minOpposingWidth(zone.vertices)
    const factor = LOAD_FACTORS[zone.zoneType]
    const occupantLoad = factor ? Math.ceil(areaSqft / factor - 1e-9) : 0
    const start = `c:${zone.id}`
    const total = zone.zoneType === 'exit_stair' ? 0 : D.get(start)
    const path: Point[] = []
    if (total !== undefined && zone.zoneType !== 'exit_stair') {
      let cur: string | undefined = start
      while (cur) {
        path.push(nodes.get(cur)!.at)
        cur = pred.get(cur)?.node
      }
    }
    const widths = allDoors.filter(({ door }) => doorTouches(door, zone)).map(({ door }) => door.widthIn)
    return {
      zoneId: zone.id,
      areaSqft: round(areaSqft, 2),
      perimeterFt: round(perimeter(zone.vertices) / 12, 2),
      minDimensionIn: round(clear.widthIn, 1),
      clearWidthAt: clear.at,
      occupantLoad,
      egressDistanceFt: total === undefined ? null : round(total / 12, 1),
      egressPath: path,
      doorWidthIn: widths.length ? Math.min(...widths) : null,
      deadEndFt: null,
    }
  })
  const metricOf = new Map(metrics.map((m) => [m.zoneId, m]))

  // ---- door capacity: every zone's load flows through the doors on its path
  const served = new Map<string, number>()
  for (const zone of zones) {
    const load = metricOf.get(zone.id)!.occupantLoad
    if (!load) continue
    let cur: string | undefined = `c:${zone.id}`
    while (cur) {
      if (cur.startsWith('d:')) served.set(cur, (served.get(cur) ?? 0) + load)
      cur = pred.get(cur)?.node
    }
  }

  // ---- dead ends along each corridor's principal axis
  for (const zone of zones) {
    if (zone.zoneType !== 'corridor') continue
    let longest = { len: 0, ux: 1, uy: 0 }
    zone.vertices.forEach((v, i) => {
      const w = zone.vertices[(i + 1) % zone.vertices.length]!
      const len = dist(v, w)
      if (len > longest.len) longest = { len, ux: (w.x - v.x) / len, uy: (w.y - v.y) / len }
    })
    const project = (p: Point) => p.x * longest.ux + p.y * longest.uy
    const extent = zone.vertices.map(project)
    const lo = Math.min(...extent)
    const hi = Math.max(...extent)
    const egressPositions = allDoors
      .filter(({ door }) => doorTouches(door, zone))
      .filter(({ door }) => {
        const id = `d:${door.id}`
        return exits.has(id) || (pred.get(id) !== undefined && pred.get(id)!.zone !== zone.id)
      })
      .map(({ door }) => project(doorCenter(door)))
    const deadIn = egressPositions.length
      ? Math.max(Math.min(...egressPositions) - lo, hi - Math.max(...egressPositions))
      : hi - lo
    metricOf.get(zone.id)!.deadEndFt = round(Math.max(0, deadIn) / 12, 1)
  }

  // ---- door metrics incl. maneuvering clearance on the pull (swing) side
  const latchSide = clauses.find((c) => c.thresholdMetric === 'door_maneuvering_depth_in')?.latchSideIn ?? 18
  // measure past the threshold so a comfortable door does not read as borderline
  const maxDepth = (clauses.find((c) => c.thresholdMetric === 'door_maneuvering_depth_in')?.thresholdValue ?? 60) * 1.5
  const doorMetrics: DoorMetrics[] = allDoors.map(({ door, owner }) => {
    const center = doorCenter(door)
    const { n } = doorAxis(door)
    const probe = { x: center.x + n.x * 3, y: center.y + n.y * 3 }
    const region = zones.find((z) => pointInPolygon(probe, z.vertices))
    return {
      doorId: door.id,
      zoneId: owner.id,
      label: door.label,
      center,
      clearWidthIn: door.widthIn,
      servedLoad: served.get(`d:${door.id}`) ?? 0,
      maneuveringDepthIn: region ? round(maneuveringDepth(door, region.vertices, latchSide, maxDepth), 1) : null,
      isExit: exits.has(`d:${door.id}`),
    }
  })

  // ---- clause evaluation
  const evaluations: Evaluation[] = []
  const judge = (c: ClauseRow, measured: number, required: number): Evaluation['severity'] => {
    if (c.thresholdOperator === '>=') {
      if (measured < required) return 'CRITICAL'
      return measured < required * 1.05 ? 'WARNING' : 'PASS'
    }
    if (measured > required) return 'CRITICAL'
    return measured > required * 0.95 ? 'WARNING' : 'PASS'
  }
  const push = (c: ClauseRow, zoneId: string, subjectRef: string, measured: number, required: number, pin: Point, detail: string) => {
    evaluations.push({
      clauseId: c.id,
      clauseHash: c.clauseHash,
      sectionRef: c.sectionRef,
      zoneId,
      subjectRef,
      measuredValue: round(measured, 1),
      requiredValue: round(required, 1),
      severity: judge(c, measured, required),
      pin: { x: round(pin.x, 1), y: round(pin.y, 1) },
      detail,
    })
  }
  for (const c of clauses) {
    for (const zone of zones) {
      const m = metricOf.get(zone.id)!
      const label = zone.label
      switch (c.thresholdMetric) {
        case 'corridor_clear_width_in':
          if (zone.zoneType === 'corridor') push(c, zone.id, `zone:${zone.id}`, m.minDimensionIn, c.thresholdValue, m.clearWidthAt, `${label}: narrowest opposing-wall clear width`)
          break
        case 'habitable_area_sqft':
          if (zone.zoneType === 'office') push(c, zone.id, `zone:${zone.id}`, m.areaSqft, c.thresholdValue, centroid(zone.vertices), `${label}: net floor area`)
          break
        case 'habitable_min_dimension_in':
          if (zone.zoneType === 'office') push(c, zone.id, `zone:${zone.id}`, m.minDimensionIn, c.thresholdValue, m.clearWidthAt, `${label}: minimum plan dimension`)
          break
        case 'exit_access_travel_ft':
          if (zone.zoneType !== 'corridor' && zone.zoneType !== 'exit_stair') {
            const limit = sprinklered && c.sprinkleredThresholdValue ? c.sprinkleredThresholdValue : c.thresholdValue
            push(c, zone.id, `zone:${zone.id}`, m.egressDistanceFt ?? 9999, limit, centroid(zone.vertices), `${label}: shortest path to an exit${m.egressDistanceFt === null ? ' (no path)' : ''}`)
          }
          break
        case 'dead_end_ft':
          if (zone.zoneType === 'corridor' && m.deadEndFt !== null) push(c, zone.id, `zone:${zone.id}`, m.deadEndFt, c.thresholdValue, centroid(zone.vertices), `${label}: longest dead-end run`)
          break
      }
    }
    for (const d of doorMetrics) {
      if (c.thresholdMetric === 'door_clear_width_in') {
        const required = Math.max(c.thresholdValue, (c.perOccupantIn ?? 0) * d.servedLoad)
        push(c, d.zoneId, `door:${d.doorId}`, d.clearWidthIn, required, d.center, `${d.label}: clear opening serving ${d.servedLoad} occupants`)
      }
      if (c.thresholdMetric === 'door_maneuvering_depth_in' && d.maneuveringDepthIn !== null) {
        push(c, d.zoneId, `door:${d.doorId}`, d.maneuveringDepthIn, c.thresholdValue, d.center, `${d.label}: pull-side clearance depth (${c.latchSideIn ?? 18} in latch side)`)
      }
    }
  }
  return { zones: metrics, doors: doorMetrics, evaluations }
}
