import type { Door, Point, ZoneType } from '../../shared/spatial/geometry.js'

// Two starter drawings, coordinates in inches. Violations are not flagged in
// the data; they emerge when check-clearances measures the geometry.

type ZoneSeed = { key: string; label: string; zoneType: ZoneType; vertices: Point[]; doors: Door[] }
export type SheetSeed = { sheetNumber: string; title: string; projectCode: string; sprinklered: boolean; zones: ZoneSeed[] }

function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

function door(id: string, label: string, hingeX: number, hingeY: number, widthIn: number, swingAngleDeg: number, swingSide: 1 | -1, exterior = false): Door {
  return { id, label, hingeX, hingeY, widthIn, swingAngleDeg, swingSide, exterior }
}

export const SEED_SHEETS: SheetSeed[] = [
  {
    sheetNumber: 'A-101',
    title: 'ADU Residential Plan',
    projectCode: 'ADU-2417',
    sprinklered: false,
    zones: [
      {
        key: 'living',
        label: 'Living / Kitchen',
        zoneType: 'office',
        vertices: rect(0, 0, 204, 288),
        doors: [door('front', 'Front entry', 0, 126, 36, 90, -1, true)],
      },
      {
        key: 'hall',
        label: 'Hall',
        zoneType: 'corridor',
        vertices: rect(204, 108, 360, 140),
        doors: [door('hall-open', 'Hall opening', 204, 108, 32, 90, 1)],
      },
      {
        key: 'bed',
        label: 'Bedroom',
        zoneType: 'office',
        vertices: rect(204, 0, 360, 108),
        doors: [door('bed-door', 'Bedroom door', 288, 108, 30, 0, 1)],
      },
      {
        key: 'bath',
        label: 'Bath',
        zoneType: 'restroom',
        vertices: rect(204, 140, 282, 288),
        doors: [door('bath-door', 'Bath door', 214, 140, 28, 0, 1)],
      },
      {
        key: 'study',
        label: 'Study',
        zoneType: 'office',
        vertices: rect(282, 140, 360, 288),
        doors: [door('study-door', 'Study door', 292, 140, 32, 0, 1)],
      },
    ],
  },
  {
    sheetNumber: 'A-201',
    title: 'Medical Clinic Suite',
    projectCode: 'MED-0932',
    sprinklered: false,
    zones: [
      {
        key: 'lobby',
        label: 'Lobby / Waiting',
        zoneType: 'lobby',
        vertices: rect(0, 0, 480, 540),
        doors: [door('main', 'Main entrance (pair)', 0, 234, 72, 90, -1, true)],
      },
      {
        key: 'corr',
        label: 'Clinic corridor',
        zoneType: 'corridor',
        vertices: [
          { x: 480, y: 240 },
          { x: 1200, y: 240 },
          { x: 1200, y: 266 },
          { x: 1320, y: 266 },
          { x: 1320, y: 240 },
          { x: 2640, y: 240 },
          { x: 2640, y: 300 },
          { x: 480, y: 300 },
        ],
        doors: [door('corr-entry', 'Corridor entry', 480, 240, 60, 90, 1)],
      },
      { key: 'exam1', label: 'Exam 1', zoneType: 'office', vertices: rect(480, 0, 720, 240), doors: [door('exam1-door', 'Exam 1 door', 504, 240, 36, 0, -1)] },
      { key: 'exam2', label: 'Exam 2', zoneType: 'office', vertices: rect(720, 0, 960, 240), doors: [door('exam2-door', 'Exam 2 door', 744, 240, 36, 0, -1)] },
      { key: 'lounge', label: 'Staff lounge', zoneType: 'assembly', vertices: rect(1440, 0, 1800, 240), doors: [door('lounge-door', 'Lounge door', 1464, 240, 36, 0, -1)] },
      { key: 'exam3', label: 'Exam 3', zoneType: 'office', vertices: rect(2400, 0, 2640, 240), doors: [door('exam3-door', 'Exam 3 door', 2424, 240, 36, 0, -1)] },
      { key: 'wc', label: 'Restroom', zoneType: 'restroom', vertices: rect(480, 300, 600, 540), doors: [door('wc-door', 'Restroom door', 490, 300, 30, 0, -1)] },
      { key: 'proc', label: 'Procedure room', zoneType: 'assembly', vertices: rect(600, 300, 1080, 540), doors: [door('proc-door', 'Procedure door', 624, 300, 36, 0, 1)] },
      { key: 'records', label: 'Records', zoneType: 'office', vertices: rect(1080, 300, 1440, 540), doors: [door('records-door', 'Records door', 1104, 300, 36, 0, 1)] },
      { key: 'exam4', label: 'Exam 4', zoneType: 'office', vertices: rect(2400, 300, 2640, 540), doors: [door('exam4-door', 'Exam 4 door', 2424, 300, 36, 0, 1)] },
    ],
  },
]
