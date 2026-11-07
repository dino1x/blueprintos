import { describe, expect, it } from 'vitest'

import { SEED_SHEETS } from '../../server/seed/sheets'
import { STATUTORY_CORPUS } from '../../server/seed/statutory-corpus'
import { type ClauseRow, analyzeSheet } from './analysis'

const clauses: ClauseRow[] = STATUTORY_CORPUS.map((c) => ({ ...c, id: c.sectionRef, clauseHash: 'h' }))

function run(title: string) {
  const sheet = SEED_SHEETS.find((s) => s.title === title)!
  const zones = sheet.zones.map((z) => ({ id: z.key, label: z.label, zoneType: z.zoneType, vertices: z.vertices, doors: z.doors }))
  const result = analyzeSheet(zones, sheet.sprinklered, clauses)
  const critical = (section: string) =>
    result.evaluations.filter((e) => e.sectionRef === section && e.severity === 'CRITICAL').map((e) => e.subjectRef)
  return { result, critical }
}

describe('ADU Residential Plan', () => {
  const { result, critical } = run('ADU Residential Plan')

  it('measures the hall at 32 in clear — below ADA 403.5.1', () => {
    expect(result.zones.find((z) => z.zoneId === 'hall')?.minDimensionIn).toBe(32)
    expect(critical('ADA-403.5.1')).toEqual(['zone:hall'])
  })

  it('flags the 30 in bedroom and 28 in bath doors under IBC 1005.1', () => {
    expect(critical('IBC-1005.1').sort()).toEqual(['door:bath-door', 'door:bed-door'])
  })

  it('finds only 32 in of pull-side clearance at the bedroom door', () => {
    expect(result.doors.find((d) => d.doorId === 'bed-door')?.maneuveringDepthIn).toBeCloseTo(32, 0)
    expect(critical('ADA-404.2.4')).toEqual(['door:bed-door'])
  })

  it('flags the 78 in wide study under IBC 1208.1 but passes its area', () => {
    expect(critical('IBC-1208.1')).toEqual(['zone:study'])
    expect(critical('IBC-1208.3')).toEqual([])
  })

  it('routes every room to the front exit well within 200 ft', () => {
    for (const z of result.zones) expect(z.egressDistanceFt).not.toBeNull()
    expect(critical('IBC-1017.2')).toEqual([])
  })
})

describe('Medical Clinic Suite', () => {
  const { result, critical } = run('Medical Clinic Suite')

  it('finds the 34 in corridor pinch and a 180 ft dead end', () => {
    expect(result.zones.find((z) => z.zoneId === 'corr')?.minDimensionIn).toBe(34)
    expect(result.zones.find((z) => z.zoneId === 'corr')?.deadEndFt).toBe(180)
    expect(critical('NFPA-101-7.2')).toEqual(['zone:corr'])
  })

  it('puts the far exam rooms past the 200 ft travel limit', () => {
    expect(critical('IBC-1017.2').sort()).toEqual(['zone:exam3', 'zone:exam4'])
    const exam3 = result.zones.find((z) => z.zoneId === 'exam3')!
    expect(exam3.egressDistanceFt).toBeGreaterThan(200)
    expect(exam3.egressPath.length).toBeGreaterThan(2)
  })

  it('computes IBC 1004.5 occupant loads and sends them through the exits', () => {
    expect(result.zones.find((z) => z.zoneId === 'lobby')?.occupantLoad).toBe(120)
    expect(result.zones.find((z) => z.zoneId === 'proc')?.occupantLoad).toBe(54)
    const main = result.doors.find((d) => d.doorId === 'main')!
    const total = result.zones.reduce((s, z) => s + z.occupantLoad, 0)
    expect(main.isExit).toBe(true)
    expect(main.servedLoad).toBe(total)
  })

  it('relaxes the travel limit to 250 ft when sprinklered', () => {
    const sheet = SEED_SHEETS.find((s) => s.title === 'Medical Clinic Suite')!
    const zones = sheet.zones.map((z) => ({ id: z.key, label: z.label, zoneType: z.zoneType, vertices: z.vertices, doors: z.doors }))
    const sprinklered = analyzeSheet(zones, true, clauses)
    expect(sprinklered.evaluations.filter((e) => e.sectionRef === 'IBC-1017.2' && e.severity === 'CRITICAL')).toEqual([])
  })
})
