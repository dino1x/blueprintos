import { describe, expect, it } from 'vitest'

import {
  type Door,
  centroid,
  doorCenter,
  maneuveringDepth,
  minOpposingWidth,
  perimeter,
  pointInPolygon,
  segmentInside,
  shoelaceArea,
} from './geometry'

function rect(x0: number, y0: number, x1: number, y1: number) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

describe('Shoelace area and perimeter', () => {
  it('measures a 12 ft × 10 ft room exactly', () => {
    const room = rect(0, 0, 144, 120)
    expect(shoelaceArea(room) / 144).toBe(120)
    expect(perimeter(room)).toBe(528)
  })

  it('handles an L-shaped polygon in either winding', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 60 },
      { x: 60, y: 60 },
      { x: 60, y: 120 },
      { x: 0, y: 120 },
    ]
    expect(shoelaceArea(l)).toBe(10800)
    expect(shoelaceArea([...l].reverse())).toBe(10800)
  })

  it('puts the centroid of a rectangle at its middle', () => {
    expect(centroid(rect(0, 0, 100, 40))).toEqual({ x: 50, y: 20 })
  })
})

describe('opposing-wall clear width', () => {
  it('is the short side of a rectangular corridor', () => {
    expect(minOpposingWidth(rect(0, 0, 600, 44)).widthIn).toBeCloseTo(44, 6)
  })

  it('finds the 34 in pinch at a nurse-station notch', () => {
    const corridor = [
      { x: 480, y: 240 },
      { x: 1200, y: 240 },
      { x: 1200, y: 266 },
      { x: 1320, y: 266 },
      { x: 1320, y: 240 },
      { x: 2640, y: 240 },
      { x: 2640, y: 300 },
      { x: 480, y: 300 },
    ]
    const clear = minOpposingWidth(corridor)
    expect(clear.widthIn).toBeCloseTo(34, 6)
    expect(clear.at.x).toBeGreaterThanOrEqual(1200)
    expect(clear.at.x).toBeLessThanOrEqual(1320)
  })
})

describe('containment and walkability', () => {
  const room = rect(0, 0, 100, 100)
  it('classifies points inside and outside', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, room)).toBe(true)
    expect(pointInPolygon({ x: 150, y: 50 }, room)).toBe(false)
  })

  it('refuses a straight walk that cuts through a wall', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ]
    expect(segmentInside({ x: 10, y: 90 }, { x: 90, y: 10 }, l)).toBe(false)
    expect(segmentInside({ x: 10, y: 90 }, { x: 10, y: 10 }, l)).toBe(true)
  })
})

describe('door maneuvering clearance', () => {
  const door: Door = { id: 'd', label: 'd', hingeX: 20, hingeY: 0, widthIn: 30, swingAngleDeg: 0, swingSide: 1, exterior: false }

  it('is capped by the far wall of a 32 in hall', () => {
    expect(maneuveringDepth(door, rect(0, 0, 200, 32), 18, 90)).toBeCloseTo(32, 0)
  })

  it('reaches the cap when the room is deep enough', () => {
    expect(maneuveringDepth(door, rect(0, 0, 200, 200), 18, 90)).toBe(90)
  })

  it('places the door centre half a leaf from the hinge', () => {
    expect(doorCenter(door)).toEqual({ x: 35, y: 0 })
  })
})
