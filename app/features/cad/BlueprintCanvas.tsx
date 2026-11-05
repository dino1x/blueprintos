import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  type Door,
  type Point,
  doorAxis,
  doorCenter,
  minOpposingWidth,
  pointInPolygon,
  shoelaceArea,
} from '@shared/spatial/geometry'

// EXIT tag sits outside the building, beyond the door leaf, so it never collides with the room label.
function exitTagAt(door: Door, room: Point[], offset: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const c = doorCenter(door)
  const { n } = doorAxis(door)
  let p = { x: c.x + n.x * offset, y: c.y + n.y * offset }
  if (pointInPolygon(p, room)) p = { x: c.x - n.x * offset, y: c.y - n.y * offset }
  const dx = p.x - c.x
  return { x: p.x, y: p.y, anchor: Math.abs(dx) < offset * 0.5 ? 'middle' : dx < 0 ? 'end' : 'start' }
}

export type CanvasZone = {
  id: string
  label: string
  zoneType: string
  vertices: Point[]
  doors: Door[]
  areaSqft: number
  minDimensionIn: number
  egressPath: Point[]
}

export type CanvasPin = {
  id: string
  zoneId: string
  clauseId: string
  sectionRef: string
  severity: 'CRITICAL' | 'WARNING' | 'PASS'
  x: number
  y: number
  label: string
}

export type CanvasGhost = { id: string; zoneId: string; vertices: Point[]; label: string; tag?: string | null; kind?: 'proposed' | 'before' }

type Props = {
  zones: CanvasZone[]
  pins: CanvasPin[]
  ghosts: CanvasGhost[]
  stale: boolean
  selectedZoneId: string | null
  selectedPinId: string | null
  svgRef: React.RefObject<SVGSVGElement | null>
  onSelectZone: (zoneId: string | null) => void
  onSelectPin: (pin: CanvasPin) => void
  onCommitVertex: (zoneId: string, index: number, point: Point) => void
}

const SNAP_IN = 1

function toPoints(vertices: Point[]): string {
  return vertices.map((p) => `${p.x},${p.y}`).join(' ')
}

function extentsOf(zones: CanvasZone[]): { x: number; y: number; w: number; h: number } {
  const pts = zones.flatMap((z) => z.vertices)
  if (!pts.length) return { x: 0, y: 0, w: 480, h: 360 }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(...xs) - minX
  const h = Math.max(...ys) - minY
  const pad = Math.max(w, h) * 0.08 + 24
  return { x: minX - pad, y: minY - pad, w: w + pad * 2, h: h + pad * 2 }
}

// Architectural feet-inches: 160.5 -> 13'-4 1/2"
function feetInches(inches: number): string {
  const totalHalves = Math.round(inches * 2)
  const ft = Math.floor(totalHalves / 24)
  const restHalves = totalHalves - ft * 24
  const whole = Math.floor(restHalves / 2)
  const half = restHalves % 2 === 1 ? ' 1/2' : ''
  return ft > 0 ? `${ft}'-${whole}${half}"` : `${whole}${half}"`
}

type Dim = { a: Point; b: Point; offset: number; text: string; tone: 'ink' | 'red' }

// A dimension string: extension lines, a dimension line with slash ticks,
// and the measurement set upright along the line.
function DimensionLine({ dim, unit }: { dim: Dim; unit: number }) {
  const dx = dim.b.x - dim.a.x
  const dy = dim.b.y - dim.a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const a = { x: dim.a.x + nx * dim.offset, y: dim.a.y + ny * dim.offset }
  const b = { x: dim.b.x + nx * dim.offset, y: dim.b.y + ny * dim.offset }
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI
  if (angle > 90 || angle < -90) angle += 180
  const mid = { x: (a.x + b.x) / 2 + nx * unit * 0.7, y: (a.y + b.y) / 2 + ny * unit * 0.7 }
  const color = dim.tone === 'red' ? 'hsl(var(--bp-redline))' : 'hsl(var(--bp-ink) / 0.75)'
  const tick = unit * 0.55
  const tx = (dx / len + nx) * tick
  const ty = (dy / len + ny) * tick
  return (
    <g className="pointer-events-none" stroke={color}>
      {dim.offset !== 0 ? (
        <>
          <line x1={dim.a.x} y1={dim.a.y} x2={a.x + nx * unit * 0.4} y2={a.y + ny * unit * 0.4} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          <line x1={dim.b.x} y1={dim.b.y} x2={b.x + nx * unit * 0.4} y2={b.y + ny * unit * 0.4} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        </>
      ) : null}
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
      <line x1={a.x - tx} y1={a.y - ty} x2={a.x + tx} y2={a.y + ty} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      <line x1={b.x - tx} y1={b.y - ty} x2={b.x + tx} y2={b.y + ty} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {dim.tone === 'red' ? (
        // An out-of-tolerance dimension reads as a solid accent chip, like a measured value on a CAD canvas.
        <g transform={`rotate(${angle} ${mid.x} ${mid.y})`} stroke="none">
          <rect
            x={mid.x - (dim.text.length * unit * 0.58 + unit * 1.2) / 2}
            y={mid.y - unit * 0.85}
            width={dim.text.length * unit * 0.58 + unit * 1.2}
            height={unit * 1.7}
            rx={unit * 0.45}
            fill="hsl(var(--bp-redline))"
          />
          <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" className="bp-mono" fontSize={unit * 0.95} fill="white">
            {dim.text}
          </text>
        </g>
      ) : (
        <text
          x={mid.x}
          y={mid.y}
          transform={`rotate(${angle} ${mid.x} ${mid.y})`}
          textAnchor="middle"
          dominantBaseline="middle"
          className="bp-mono"
          fontSize={unit * 0.95}
          fill={color}
          stroke="hsl(var(--bp-paper))"
          strokeWidth={unit * 0.35}
          paintOrder="stroke"
        >
          {dim.text}
        </text>
      )}
    </g>
  )
}

const LEADER_DIRS: [number, number][] = [
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
]

function swingArcPath(door: Door): string {
  const { u, n } = doorAxis(door)
  const r = door.widthIn
  const latch = { x: door.hingeX + u.x * r, y: door.hingeY + u.y * r }
  const open = { x: door.hingeX + n.x * r, y: door.hingeY + n.y * r }
  const sweep = door.swingSide === 1 ? 1 : 0
  return `M ${door.hingeX} ${door.hingeY} L ${open.x} ${open.y} M ${latch.x} ${latch.y} A ${r} ${r} 0 0 ${sweep} ${open.x} ${open.y}`
}

const SEVERITY_FILL: Record<string, string> = {
  CRITICAL: 'hsl(var(--bp-redline))',
  WARNING: 'hsl(var(--bp-warn))',
  PASS: 'hsl(var(--bp-pass))',
}

export function BlueprintCanvas({
  zones,
  pins,
  ghosts,
  stale,
  selectedZoneId,
  selectedPinId,
  svgRef,
  onSelectZone,
  onSelectPin,
  onCommitVertex,
}: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const readoutRef = useRef<HTMLDivElement | null>(null)
  const view = useRef({ tx: 0, ty: 0, k: 1 })
  const [zoomLabel, setZoomLabel] = useState(100)
  const box = useMemo(() => extentsOf(zones), [zones])
  const unit = Math.max(box.w, box.h) / 100

  const applyView = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    const { tx, ty, k } = view.current
    el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`
  }, [])

  useEffect(() => {
    view.current = { tx: 0, ty: 0, k: 1 }
    applyView()
    setZoomLabel(100)
  }, [box.x, box.y, box.w, box.h, applyView])

  // pointer → sheet inches, valid under any CSS transform on the stage
  const toSheet = useCallback(
    (clientX: number, clientY: number): Point => {
      // The rect includes CSS pan/zoom; "meet" letterboxes the viewBox inside it.
      const rect = svgRef.current!.getBoundingClientRect()
      const scale = Math.min(rect.width / box.w, rect.height / box.h)
      const offX = (rect.width - box.w * scale) / 2
      const offY = (rect.height - box.h * scale) / 2
      return {
        x: box.x + (clientX - rect.left - offX) / scale,
        y: box.y + (clientY - rect.top - offY) / scale,
      }
    },
    [box, svgRef],
  )

  const onWheel = useCallback((e: WheelEvent) => {
    const frame = frameRef.current
    if (!frame) return
    e.preventDefault()
    const rect = frame.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const { tx, ty, k } = view.current
    const nk = Math.min(12, Math.max(0.4, k * Math.exp(-e.deltaY * 0.0015)))
    view.current = { k: nk, tx: cx - ((cx - tx) * nk) / k, ty: cy - ((cy - ty) * nk) / k }
    applyView()
    setZoomLabel(Math.round(nk * 100))
  }, [applyView])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    frame.addEventListener('wheel', onWheel, { passive: false })
    return () => frame.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // ---- background pan
  const pan = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null)
  function onBackgroundDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    pan.current = { x: e.clientX, y: e.clientY, tx: view.current.tx, ty: view.current.ty, moved: false }
  }
  function onBackgroundMove(e: React.PointerEvent) {
    const p = pan.current
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true
    view.current.tx = p.tx + dx
    view.current.ty = p.ty + dy
    applyView()
  }
  function onBackgroundUp() {
    if (pan.current && !pan.current.moved) onSelectZone(null)
    pan.current = null
  }

  // ---- vertex drag: write SVG attributes directly at pointer rate
  const drag = useRef<{ zoneId: string; index: number; vertices: Point[] } | null>(null)
  function onHandleDown(e: React.PointerEvent, zone: CanvasZone, index: number) {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { zoneId: zone.id, index, vertices: zone.vertices.map((p) => ({ ...p })) }
  }
  function onHandleMove(e: React.PointerEvent) {
    const d = drag.current
    const svg = svgRef.current
    if (!d || !svg) return
    const raw = toSheet(e.clientX, e.clientY)
    const p = { x: Math.round(raw.x / SNAP_IN) * SNAP_IN, y: Math.round(raw.y / SNAP_IN) * SNAP_IN }
    d.vertices[d.index] = p
    svg.querySelector(`[data-zone-poly="${d.zoneId}"]`)?.setAttribute('points', toPoints(d.vertices))
    const handle = svg.querySelector(`[data-handle="${d.zoneId}:${d.index}"]`)
    handle?.setAttribute('cx', String(p.x))
    handle?.setAttribute('cy', String(p.y))
    const readout = readoutRef.current
    if (readout) {
      const area = shoelaceArea(d.vertices) / 144
      const width = minOpposingWidth(d.vertices).widthIn
      readout.textContent = `(${p.x}″, ${p.y}″)  ·  ${area.toFixed(1)} sf  ·  clear ${width.toFixed(1)}″`
      readout.style.opacity = '1'
    }
  }
  function onHandleUp() {
    const d = drag.current
    drag.current = null
    if (readoutRef.current) readoutRef.current.style.opacity = '0'
    if (!d) return
    const original = zones.find((z) => z.id === d.zoneId)?.vertices[d.index]
    const next = d.vertices[d.index]!
    if (original && (original.x !== next.x || original.y !== next.y)) onCommitVertex(d.zoneId, d.index, next)
  }

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null

  // Dimensions: every corridor shows its measured pinch; the selected room
  // shows a full set of wall dimensions, offset outside its outline.
  const dims: Dim[] = []
  for (const z of zones) {
    if (z.zoneType !== 'corridor') continue
    const clear = minOpposingWidth(z.vertices)
    if (clear.widthIn > 0) dims.push({ a: clear.a, b: clear.b, offset: 0, text: feetInches(clear.widthIn), tone: 'red' })
  }
  if (selectedZone) {
    const c = selectedZone.vertices.reduce((acc, p) => ({ x: acc.x + p.x / selectedZone.vertices.length, y: acc.y + p.y / selectedZone.vertices.length }), { x: 0, y: 0 })
    selectedZone.vertices.forEach((a, i) => {
      const b = selectedZone.vertices[(i + 1) % selectedZone.vertices.length]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 12) return
      // push the dimension line away from the room's centre
      const nx = -(b.y - a.y) / len
      const ny = (b.x - a.x) / len
      const side = (a.x + b.x) / 2 - c.x
      const sideY = (a.y + b.y) / 2 - c.y
      const outward = nx * side + ny * sideY >= 0 ? 1 : -1
      dims.push({ a, b, offset: outward * unit * 2.4, text: feetInches(len), tone: 'ink' })
    })
  }
  const gridMinor = 12
  const gridMajor = 120

  return (
    <div ref={frameRef} className="bp-canvas relative h-full min-h-[420px] w-full overflow-hidden">
      <div
        ref={stageRef}
        className="absolute inset-0 origin-top-left"
        style={{ willChange: 'transform', transform: 'translate3d(0,0,0) scale(1)' }}
      >
        <svg
          ref={svgRef}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          className="h-full w-full select-none"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Floorplan sheet"
          onPointerDown={onBackgroundDown}
          onPointerMove={onBackgroundMove}
          onPointerUp={onBackgroundUp}
        >
          <defs>
            <pattern id="bp-grid-minor" width={gridMinor} height={gridMinor} patternUnits="userSpaceOnUse">
              <path d={`M ${gridMinor} 0 L 0 0 0 ${gridMinor}`} fill="none" stroke="hsl(var(--bp-grid) / 0.07)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
            </pattern>
            <pattern id="bp-grid-major" width={gridMajor} height={gridMajor} patternUnits="userSpaceOnUse">
              <rect width={gridMajor} height={gridMajor} fill="url(#bp-grid-minor)" />
              <path d={`M ${gridMajor} 0 L 0 0 0 ${gridMajor}`} fill="none" stroke="hsl(var(--bp-grid) / 0.14)" strokeWidth={0.8} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            </pattern>
            <pattern id="bp-hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={8} stroke="hsl(var(--bp-redline) / 0.35)" strokeWidth={1.5} />
            </pattern>
          </defs>
          {/* The sheet: paper with a hairline edge and a soft shadow, lying on the desk. */}
          <rect x={box.x + unit * 0.3} y={box.y + unit * 0.5} width={box.w} height={box.h} fill="hsl(var(--bp-ink) / 0.08)" />
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="hsl(var(--bp-paper))" stroke="hsl(var(--bp-ink) / 0.14)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#bp-grid-major)" />

          {zones.map((zone) => {
            const selected = zone.id === selectedZoneId
            const c = zone.vertices.reduce((acc, p) => ({ x: acc.x + p.x / zone.vertices.length, y: acc.y + p.y / zone.vertices.length }), { x: 0, y: 0 })
            // Fit labels inside the room: roughly 0.6 em per glyph of the longest line.
            const zoneW = Math.max(...zone.vertices.map((p) => p.x)) - Math.min(...zone.vertices.map((p) => p.x))
            const zoneH = Math.max(...zone.vertices.map((p) => p.y)) - Math.min(...zone.vertices.map((p) => p.y))
            // Two stacked lines must fit the room's height as well as its width.
            const labelSize = Math.min(unit * 1.5, (zoneW * 0.9) / Math.max(4, zone.label.length * 0.6), zoneH * 0.32)
            const metricSize = Math.min(unit * 1.05, (zoneW * 0.9) / (18 * 0.62), zoneH * 0.22)
            return (
              <g key={zone.id}>
                <polygon
                  data-zone-poly={zone.id}
                  points={toPoints(zone.vertices)}
                  fill={selected ? 'hsl(var(--bp-redline) / 0.06)' : zone.zoneType === 'corridor' ? 'hsl(var(--bp-fill) / 0.7)' : 'hsl(var(--bp-fill) / 0.35)'}
                  stroke="hsl(var(--bp-ink))"
                  strokeWidth={selected ? 2.4 : 1.6}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSelectZone(zone.id)}
                />
                <text x={c.x} y={c.y - labelSize * 0.4} textAnchor="middle" className="bp-serif pointer-events-none" fontSize={labelSize} fill="hsl(var(--bp-ink))">
                  {zone.label}
                </text>
                <text x={c.x} y={c.y + metricSize * 1.2} textAnchor="middle" className="bp-mono pointer-events-none" fontSize={metricSize} fill="hsl(var(--bp-ink) / 0.7)">
                  {zone.areaSqft.toFixed(0)} sf · {zone.minDimensionIn.toFixed(0)}″ min
                </text>
                {zone.doors.map((door) => {
                  return (
                    <g key={door.id} className="pointer-events-none">
                      <path d={swingArcPath(door)} fill="none" stroke="hsl(var(--bp-ink) / 0.75)" strokeWidth={1} strokeDasharray={door.exterior ? undefined : '3 2'} vectorEffect="non-scaling-stroke" />
                      <line
                        x1={door.hingeX}
                        y1={door.hingeY}
                        x2={door.hingeX + doorAxis(door).u.x * door.widthIn}
                        y2={door.hingeY + doorAxis(door).u.y * door.widthIn}
                        stroke="hsl(var(--bp-paper))"
                        strokeWidth={4}
                        vectorEffect="non-scaling-stroke"
                      />
                      {door.exterior ? (() => {
                        const tag = exitTagAt(door, zone.vertices, unit * 1.4)
                        return (
                          <text x={tag.x} y={tag.y} dominantBaseline="middle" textAnchor={tag.anchor} className="bp-mono" fontSize={unit * 0.95} fill="hsl(var(--bp-pass))">
                            EXIT
                          </text>
                        )
                      })() : null}
                    </g>
                  )
                })}
              </g>
            )
          })}

          {ghosts.map((g) => (
            <g key={g.id} className="pointer-events-none">
              {g.kind === 'before' ? (
                <polygon points={toPoints(g.vertices)} fill="none" stroke="hsl(var(--bp-ink) / 0.45)" strokeWidth={1.2} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              ) : (
                <polygon points={toPoints(g.vertices)} fill="url(#bp-hatch)" stroke="hsl(var(--bp-redline))" strokeWidth={1.6} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />
              )}
              {g.tag ? (
                <text
                  x={Math.max(...g.vertices.map((p) => p.x)) + unit * 0.8}
                  y={Math.min(...g.vertices.map((p) => p.y)) - unit * 0.6}
                  className="bp-mono"
                  fontSize={unit * 1.15}
                  fill={g.kind === 'before' ? 'hsl(var(--bp-ink) / 0.55)' : 'hsl(var(--bp-redline))'}
                  stroke="hsl(var(--bp-paper))"
                  strokeWidth={unit * 0.35}
                  paintOrder="stroke"
                >
                  {g.tag}
                </text>
              ) : null}
            </g>
          ))}

          {selectedZone && selectedZone.egressPath.length > 1 ? (
            <polyline
              points={toPoints(selectedZone.egressPath)}
              fill="none"
              stroke="hsl(var(--bp-pass))"
              strokeWidth={2}
              strokeDasharray="10 6"
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
              markerEnd="none"
            />
          ) : null}

          {selectedZone
            ? selectedZone.vertices.map((p, i) => (
                <circle
                  key={`${selectedZone.id}:${i}`}
                  data-handle={`${selectedZone.id}:${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={unit * 0.9}
                  fill="hsl(var(--bp-paper))"
                  stroke="hsl(var(--bp-redline))"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-move"
                  onPointerDown={(e) => onHandleDown(e, selectedZone, i)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                />
              ))
            : null}

          {dims.map((d, i) => (
            <DimensionLine key={`dim-${i}`} dim={d} unit={unit} />
          ))}

          {(() => {
            // Guides: dashed accent lines across the sheet through the selected finding, so the eye lands on it.
            const sel = pins.find((p) => p.id === selectedPinId)
            if (!sel) return null
            return (
              <g className="pointer-events-none" stroke="hsl(var(--bp-redline) / 0.7)" strokeWidth={1} strokeDasharray="6 5">
                <line x1={box.x} x2={box.x + box.w} y1={sel.y} y2={sel.y} vectorEffect="non-scaling-stroke" />
                <line y1={box.y} y2={box.y + box.h} x1={sel.x} x2={sel.x} vectorEffect="non-scaling-stroke" />
              </g>
            )
          })()}

          {pins.map((pin, index) => {
            const selected = pin.id === selectedPinId
            const [dx, dy] = LEADER_DIRS[index % LEADER_DIRS.length]!
            const reach = unit * 3.2
            const tag = { x: pin.x + dx * reach, y: pin.y + dy * reach }
            const fill = SEVERITY_FILL[pin.severity]
            const callout = `${pin.sectionRef}  ${pin.label}`
            const calloutW = callout.length * unit * 0.62 + unit * 1.6
            return (
              <g
                key={pin.id}
                className="cursor-pointer"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelectPin(pin)}
                opacity={stale ? 0.45 : 1}
              >
                <line x1={pin.x} y1={pin.y} x2={tag.x} y2={tag.y} stroke={fill} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                <circle cx={pin.x} cy={pin.y} r={unit * 0.45} fill={fill} />
                <circle cx={tag.x} cy={tag.y} r={unit * (selected ? 1.35 : 1.1)} fill={stale ? 'hsl(var(--bp-paper))' : fill} stroke={selected ? 'hsl(var(--bp-ink))' : fill} strokeWidth={selected ? 2.2 : 1.2} vectorEffect="non-scaling-stroke" />
                <text x={tag.x} y={tag.y} textAnchor="middle" dominantBaseline="central" className="bp-mono" fontSize={unit * 1.05} fill={stale ? fill : 'hsl(var(--bp-paper))'}>
                  {index + 1}
                </text>
                {selected ? (
                  <g>
                    <rect
                      x={dx > 0 ? tag.x + unit * 1.6 : tag.x - unit * 1.6 - calloutW}
                      y={tag.y - unit * 1.1}
                      width={calloutW}
                      height={unit * 2.2}
                      fill="hsl(var(--bp-paper))"
                      stroke="hsl(var(--bp-ink))"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={dx > 0 ? tag.x + unit * 2.4 : tag.x - unit * 2.4}
                      y={tag.y}
                      textAnchor={dx > 0 ? 'start' : 'end'}
                      dominantBaseline="central"
                      className="bp-mono"
                      fontSize={unit * 1.0}
                      fill="hsl(var(--bp-ink))"
                    >
                      {callout}
                    </text>
                  </g>
                ) : null}
                <title>{`${index + 1}. ${pin.sectionRef} · ${pin.label} · ${pin.severity}`}</title>
              </g>
            )
          })}
        </svg>
      </div>
      <div
        ref={readoutRef}
        aria-live="polite"
        className="bp-mono pointer-events-none absolute left-3 top-3 border border-[hsl(var(--bp-ink))] bg-[hsl(var(--bp-paper))] px-2 py-1 text-[11px] text-[hsl(var(--bp-ink))] opacity-0 transition-opacity"
      />
      <div className="bp-mono pointer-events-none absolute bottom-3 left-3 text-[11px] text-[hsl(var(--bp-ink)/0.6)]">
        {zoomLabel}% · scroll to zoom · drag to pan · 1 sq = 1′
      </div>
    </div>
  )
}
