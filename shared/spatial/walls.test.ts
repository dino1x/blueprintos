import { describe, expect, it } from 'vitest'

import { SEED_SHEETS } from '../../server/seed/sheets'
import { STATUTORY_CORPUS } from '../../server/seed/statutory-corpus'
import { type ClauseRow, analyzeSheet } from './analysis'
import { type Point, type Zone, shoelaceArea } from './geometry'
import { moveSharedWalls, translatedEdges } from './walls'

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

const adu = (): Zone[] =>
  SEED_SHEETS.find((s) => s.title === 'ADU Residential Plan')!.zones.map((z) => ({ id: z.key, label: z.label, zoneType: z.zoneType, vertices: z.vertices, doors: z.doors }))

describe('translated edges', () => {
  it('finds the one wall that moved rigidly and ignores the walls it stretched', () => {
    const shifts = translatedEdges(rect(204, 108, 360, 140), rect(204, 104, 360, 140))
    expect(shifts).toHaveLength(1)
    expect(shifts[0]).toMatchObject({ dx: 0, dy: -4 })
  })

  it('finds nothing when the vertex count changes or nothing moved', () => {
    expect(translatedEdges(rect(0, 0, 10, 10), rect(0, 0, 10, 10))).toEqual([])
    expect(translatedEdges(rect(0, 0, 10, 10), rect(0, 0, 10, 10).slice(0, 3))).toEqual([])
  })
})

describe('moving a shared wall', () => {
  it('moves the bedroom wall and its door with the hall, so nothing overlaps', () => {
    const zones = adu()
    const hall = zones.find((z) => z.id === 'hall')!
    const proposed = rect(204, 104, 360, 140)
    const { neighbours, ownDoors } = moveSharedWalls('hall', hall.vertices, proposed, zones)

    const bed = neighbours.find((z) => z.id === 'bed')!
    expect(bed.vertices.filter((p) => p.y === 104)).toHaveLength(2)
    expect(bed.doors[0]).toMatchObject({ hingeX: 288, hingeY: 104 })
    expect(shoelaceArea(bed.vertices)).toBeCloseTo(shoelaceArea(zones.find((z) => z.id === 'bed')!.vertices) - 156 * 4, 6)
    // The living room's wall is not on the moved edge; bath and study sit on the other wall.
    expect(neighbours.map((z) => z.id).sort()).toEqual(['bed'])
    expect(ownDoors[0]).toMatchObject({ hingeX: 204, hingeY: 104 })
  })

  it('cures the hall finding without creating any new critical once the wall moves with it', () => {
    const clauses: ClauseRow[] = STATUTORY_CORPUS.map((c) => ({ ...c, id: c.sectionRef, clauseHash: 'h' }))
    const zones = adu()
    const before = analyzeSheet(zones, false, clauses).evaluations.filter((e) => e.severity === 'CRITICAL').map((e) => `${e.sectionRef}|${e.subjectRef}`)
    const hall = zones.find((z) => z.id === 'hall')!
    const proposed = rect(204, 104, 360, 140)
    const move = moveSharedWalls('hall', hall.vertices, proposed, zones)
    const after = zones.map((z) => (z.id === 'hall' ? { ...z, vertices: proposed, doors: move.ownDoors } : move.neighbours.find((n) => n.id === z.id) ?? z))
    const crit = analyzeSheet(after, false, clauses).evaluations.filter((e) => e.severity === 'CRITICAL').map((e) => `${e.sectionRef}|${e.subjectRef}`)
    expect(before).toContain('ADA-403.5.1|zone:hall')
    expect(crit).not.toContain('ADA-403.5.1|zone:hall')
    for (const c of crit) expect(before).toContain(c)
  })

  it('leaves every zone alone when the redline does not move a wall rigidly', () => {
    const zones = adu()
    const hall = zones.find((z) => z.id === 'hall')!
    const skewed = [hall.vertices[0]!, { x: 362, y: 108 }, hall.vertices[2]!, hall.vertices[3]!]
    expect(moveSharedWalls('hall', hall.vertices, skewed, zones).neighbours).toEqual([])
  })
})
