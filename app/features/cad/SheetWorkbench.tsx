import { actionErrorMessage, useActionMutation, useActionQuery } from '@agent-native/core/client/hooks'
import { defineClientAction } from '@agent-native/core/client/host'
import { createAgentNativeWebMcpRegistration } from '@agent-native/core/client/webmcp'
import { AgentToggleButton } from '@agent-native/toolkit/app/chat'
import { IconArrowLeft, IconCertificate, IconFileExport, IconRulerMeasure, IconSparkles, IconVectorTriangle } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import type { Point } from '@shared/spatial/geometry'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ComplianceDesk, type SheetDetail } from '@/features/compliance/ComplianceDesk'
import { sendToAgent } from '@/lib/send-to-agent'

import { BlueprintCanvas, type CanvasGhost, type CanvasPin } from './BlueprintCanvas'
import { StagedRedlineCallout } from './StagedRedlineCallout'
import { TitleBlock } from './TitleBlock'

function readErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('errorCode' in err)) return undefined
  return typeof err.errorCode === 'string' ? err.errorCode : undefined
}

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function SheetWorkbench({ sheetId }: { sheetId: string }) {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const args = useMemo(() => ({ id: sheetId }), [sheetId])
  const queryKey = useMemo(() => ['action', 'get-sheet-detail', args], [args])
  const { data, isPending, error } = useActionQuery('get-sheet-detail', args)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [tab, setTab] = useState('pins')
  // The zone outline just before the architect applied a redline: drawn as a quiet "before" until the next edit.
  const [beforeApply, setBeforeApply] = useState<{ sheetId: string; zoneId: string; vertices: Point[] } | null>(null)

  const selectedZoneId = params.get('zone')
  const selectedReceiptId = params.get('violation')
  const activeClauseId = params.get('clause')

  const setSelection = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  function rollback(context: unknown) {
    queryClient.setQueryData(queryKey, (context as { previous?: unknown } | undefined)?.previous)
  }

  const audit = useActionMutation('check-clearances', {
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => toast.error(actionErrorMessage(e) ?? 'Audit failed.'),
  })

  const move = useActionMutation('move-vertex', {
    onMutate: async (input) => {
      setBeforeApply(null)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old: SheetDetail | undefined) => {
        if (!old) return old
        return {
          ...old,
          sheet: { ...old.sheet, auditCurrent: false },
          zones: old.zones.map((z) => {
            if (z.id !== input.zoneId) return z
            const vertices =
              input.vertexIndex !== undefined && input.x !== undefined && input.y !== undefined
                ? z.vertices.map((p, i) => (i === input.vertexIndex ? { x: input.x!, y: input.y! } : p))
                : (input.vertices ?? z.vertices)
            const doors = input.door
              ? z.doors.map((d) => (d.id === input.door!.doorId && input.door!.widthIn !== undefined ? { ...d, widthIn: input.door!.widthIn } : d))
              : z.doors
            return { ...z, vertices, doors }
          }),
        }
      })
      return { previous }
    },
    onError: (e, _input, context) => {
      rollback(context)
      toast.error(actionErrorMessage(e) ?? 'Edit failed.')
    },
    onSuccess: (r) => {
      if (r.sealInvalidated) toast.warning('Seal voided: geometry changed after sealing.')
      // Pins must reflect the drawing; re-audit after every hand edit.
      audit.mutate({ id: sheetId })
    },
  })

  const apply = useActionMutation('apply-redline', {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old: SheetDetail | undefined) => {
        if (!old) return old
        const redline = old.redlines.find((r) => r.id === input.redlineId)
        const zone = redline ? old.zones.find((z) => z.id === redline.zoneId) : undefined
        if (zone) setBeforeApply({ sheetId: input.sheetId, zoneId: zone.id, vertices: zone.vertices })
        return {
          ...old,
          zones: old.zones.map((z) => (redline && z.id === redline.zoneId ? { ...z, vertices: redline.proposedVertices } : z)),
          redlines: old.redlines.map((r) => (r.id === input.redlineId ? { ...r, status: 'APPLIED' as const } : r)),
        }
      })
      return { previous }
    },
    onError: (e, _input, context) => {
      rollback(context)
      toast.error(readErrorCode(e) === 'STALE_REDLINE' ? 'The drawing changed after this redline was proposed.' : (actionErrorMessage(e) ?? 'Apply failed.'))
    },
    onSuccess: (r) => {
      const walls = r.adjustedZones.length ? ` Shared wall moved with ${r.adjustedZones.join(', ')}.` : ''
      toast.success((r.citedSubjectCured ? `Applied — cited violation cured (${r.critical} critical left).` : `Applied — cited violation still open (${r.critical} critical).`) + walls)
    },
  })

  const reject = useActionMutation('reject-redline', {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old: SheetDetail | undefined) =>
        old ? { ...old, redlines: old.redlines.map((r) => (r.id === input.redlineId ? { ...r, status: 'REJECTED' as const } : r)) } : old,
      )
      return { previous }
    },
    onError: (e, _input, context) => {
      rollback(context)
      toast.error(actionErrorMessage(e) ?? 'Reject failed.')
    },
  })

  // Browser-only tools for an external agent driving this tab: pin focus and the live drawing.
  const dataRef = useRef(data)
  dataRef.current = data
  const selectRef = useRef(setSelection)
  selectRef.current = setSelection
  useEffect(() => {
    const registration = createAgentNativeWebMcpRegistration({
      actions: [
        defineClientAction<{ receiptId: string }, unknown>({
          name: 'focus-violation-pin',
          title: 'Focus a violation pin on the open sheet',
          description:
            'Select a violation receipt on the open BlueprintOS sheet so the architect sees its pin, zone and clause highlighted. Returns the receipt with its clause hash for a cited redline.',
          schema: {
            type: 'object',
            properties: { receiptId: { type: 'string', description: 'violation_receipts.id from get-sheet-detail' } },
            required: ['receiptId'],
          },
          run: async ({ receiptId }) => {
            const detail = dataRef.current
            if (!detail) return { error: 'No sheet is open.' }
            const receipt = detail.receipts.find((r) => r.id === receiptId)
            if (!receipt) return { error: 'No receipt with that id on the current audit.' }
            const clause = detail.clauses.find((c) => c.id === receipt.clauseId)
            selectRef.current({ zone: receipt.zoneId, violation: receipt.id, clause: receipt.clauseId })
            return {
              receiptId: receipt.id,
              zoneId: receipt.zoneId,
              sectionRef: receipt.sectionRef,
              severity: receipt.severity,
              measured: receipt.measuredValue,
              required: receipt.requiredValue,
              clauseHash: clause?.clauseHash ?? null,
              geometryHash: detail.sheet.geometryHash,
            }
          },
        }),
        defineClientAction<Record<string, never>, unknown>({
          name: 'export-sheet-svg',
          title: 'Export the drawn sheet as SVG',
          description:
            'Serialize the floorplan exactly as drawn in this tab (zones, dimension strings, violation pins, staged redline ghosts) to SVG markup.',
          schema: { type: 'object', properties: {} },
          readOnly: true,
          run: async () => {
            const svg = svgRef.current
            const detail = dataRef.current
            if (!svg || !detail) return { error: 'The canvas is not mounted.' }
            return { sheetNumber: detail.sheet.sheetNumber, geometryHash: detail.sheet.geometryHash, svg: new XMLSerializer().serializeToString(svg) }
          },
        }),
      ],
      getContext: () => ({ route: { name: window.location.pathname } }),
    })
    void registration.start()
    return () => registration.stop()
  }, [sheetId])

  // Redlines already learned this session, so Teach can't write the same rule twice.
  const [learnedRedlineIds, setLearnedRedlineIds] = useState<Set<string>>(() => new Set())
  const learn = useActionMutation('learn-compliance-rule', {
    onSuccess: (r, input) => {
      if (input.redlineId) setLearnedRedlineIds((prev) => new Set(prev).add(input.redlineId!))
      toast.success(r.skillFileWritten ? 'Rule learned — saved and added to the agent skill.' : 'Rule learned and saved.')
    },
    onError: (e) => toast.error(actionErrorMessage(e) ?? 'Nothing to learn yet.'),
  })

  const seal = useActionMutation('seal-sheet', {
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old: SheetDetail | undefined) => (old ? { ...old, sheet: { ...old.sheet, sealStatus: 'SEALED' as const } } : old))
      return { previous }
    },
    onError: (e, _input, context) => {
      rollback(context)
      const code = readErrorCode(e)
      toast.error(
        code === 'UNRESOLVED_VIOLATIONS'
          ? 'Cannot seal: CRITICAL violations remain on this geometry.'
          : code === 'AUDIT_REQUIRED'
            ? 'Cannot seal: re-audit the current geometry first.'
            : (actionErrorMessage(e) ?? 'Seal failed.'),
      )
    },
    onSuccess: () => toast.success('Sheet sealed.'),
  })

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-muted-foreground">{actionErrorMessage(error) ?? 'Sheet not found.'}</p>
        <Link to="/sheets" className="mt-2 inline-block text-sm underline">Back to the drawing register</Link>
      </main>
    )
  }
  if (isPending || !data) return <WorkbenchSkeleton />

  const unitMark = (clauseId: string): string => {
    const u = data.clauses.find((c) => c.id === clauseId)?.unit
    return u === 'in' ? '″' : u === 'ft' ? '′' : u === 'sqft' ? ' sf' : ''
  }
  // Same ordering as the Pins list so tag numbers match it.
  const pins: CanvasPin[] = data.receipts
    .filter((r) => r.severity !== 'PASS')
    .sort((a, b) => (a.severity === b.severity ? a.sectionRef.localeCompare(b.sectionRef) : a.severity === 'CRITICAL' ? -1 : 1))
    .map((r) => ({
      id: r.id,
      zoneId: r.zoneId,
      clauseId: r.clauseId,
      sectionRef: r.sectionRef,
      severity: r.severity,
      x: r.pinX,
      y: r.pinY,
      label: `${r.measuredValue}${unitMark(r.clauseId)} / ${r.requiredValue}${unitMark(r.clauseId)}`,
    }))
  const ghosts: CanvasGhost[] = data.redlines
    .filter((r) => r.status === 'STAGED' && !r.isStale)
    .map((r) => ({
      id: r.id,
      zoneId: r.zoneId,
      vertices: r.proposedVertices,
      label: r.rationale,
      tag: r.predictedValue !== null ? `PREDICTED ${r.predictedValue}${unitMark(r.clauseId)}` : null,
    }))
  if (beforeApply && beforeApply.sheetId === sheetId) {
    ghosts.push({ id: `before-${beforeApply.zoneId}`, zoneId: beforeApply.zoneId, vertices: beforeApply.vertices, label: 'Before', tag: 'BEFORE', kind: 'before' })
  }

  function askAgent(receipt: SheetDetail['receipts'][number] | null) {
    if (!data) return
    const zone = data.zones.find((z) => z.id === (receipt?.zoneId ?? selectedZoneId))
    const clause = data.clauses.find((c) => c.id === receipt?.clauseId)
    const message = receipt && clause
      ? `Cure ${clause.sectionRef} on "${zone?.label ?? 'this zone'}": ${receipt.detail} measures ${receipt.measuredValue} vs required ${receipt.requiredValue} ${clause.unit}. Propose a redline citing receipt ${receipt.id} and clause hash ${clause.clauseHash}.`
      : zone
        ? `Review "${zone.label}" on ${data.sheet.sheetNumber} and propose cited redlines for its CRITICAL violations.`
        : `Review sheet ${data.sheet.sheetNumber} and propose cited redlines for the CRITICAL violations, highest life-safety impact first.`
    void sendToAgent({
      message,
      context: JSON.stringify({
        sheetId: data.sheet.id,
        geometryHash: data.sheet.geometryHash,
        selectedZoneId: zone?.id ?? null,
        selectedViolationId: receipt?.id ?? null,
        clauseId: receipt?.clauseId ?? null,
        pin: receipt ? { x: receipt.pinX, y: receipt.pinY } : null,
      }),
      submit: true,
      openSidebar: true,
    })
  }

  function exportJson() {
    if (!data) return
    const body = {
      sheetNumber: data.sheet.sheetNumber,
      title: data.sheet.title,
      projectCode: data.sheet.projectCode,
      sprinklered: data.sheet.sprinklered,
      zones: data.zones.map((z) => ({ label: z.label, zoneType: z.zoneType, vertices: z.vertices, doors: z.doors })),
    }
    download(`${data.sheet.sheetNumber}.json`, 'application/json', JSON.stringify(body, null, 2))
  }

  function exportSvg() {
    const svg = svgRef.current
    if (!svg || !data) return
    download(`${data.sheet.sheetNumber}.svg`, 'image/svg+xml', new XMLSerializer().serializeToString(svg))
  }

  const criticalCount = data.receipts.filter((r) => r.severity === 'CRITICAL').length
  const audited = !!data.sheet.auditedGeometryHash

  return (
    <div className="bp-desk relative h-full min-h-0 overflow-hidden max-lg:flex max-lg:flex-col max-lg:overflow-y-auto">
      {/* Floating title bar: the sheet, and the one fact that matters about it. */}
      <header className="pointer-events-none z-20 flex items-start justify-between gap-3 p-3 lg:absolute lg:left-0 lg:right-[404px] lg:top-0">
        <div className="bp-float pointer-events-auto flex min-w-0 items-center gap-3 py-2 pl-2 pr-4">
          <Link
            to="/sheets"
            aria-label="Back to the drawing register"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight">
              <span className="bp-mono mr-1.5 font-normal text-muted-foreground">{data.sheet.sheetNumber}</span>
              {data.sheet.title}
            </h1>
            <p className="truncate text-[13px] text-muted-foreground">
              {!audited ? (
                'Not audited yet'
              ) : criticalCount ? (
                <>
                  <span className="text-[hsl(var(--bp-redline))]">{criticalCount} critical</span> {data.sheet.auditCurrent ? 'on the current drawing' : '· drawing changed since the audit'}
                </>
              ) : (
                <span className="text-[hsl(var(--bp-pass))]">Every clause passes</span>
              )}
              {data.sheet.sealStatus === 'SEALED' ? ' · sealed' : ''}
            </p>
          </div>
        </div>
        <div className="bp-float pointer-events-auto flex shrink-0 items-center gap-0.5 p-1">
          <Button size="sm" className="h-8 rounded-lg bg-[hsl(var(--bp-redline))] px-3.5 text-white hover:bg-[hsl(var(--bp-redline)/0.9)]" onClick={() => askAgent(data.receipts.find((r) => r.id === selectedReceiptId) ?? null)}>
            <IconSparkles className="size-4" /> Ask agent
          </Button>
          <AgentToggleButton />
        </div>
      </header>

        <div className="relative min-h-[420px] max-lg:flex-1 lg:absolute lg:bottom-0 lg:left-0 lg:right-[404px] lg:top-[64px]">
          <BlueprintCanvas
            zones={data.zones}
            pins={pins}
            ghosts={ghosts}
            stale={!data.sheet.auditCurrent}
            selectedZoneId={selectedZoneId}
            selectedPinId={selectedReceiptId}
            svgRef={svgRef}
            onSelectZone={(zoneId) => setSelection({ zone: zoneId, violation: null, px: null, py: null })}
            onSelectPin={(pin) => {
              setSelection({ zone: pin.zoneId, violation: pin.id, clause: pin.clauseId, px: String(pin.x), py: String(pin.y) })
              setTab('pins')
            }}
            onCommitVertex={(zoneId, vertexIndex, p: Point) => move.mutate({ sheetId, zoneId, vertexIndex, x: p.x, y: p.y })}
          />
          {/* Tool rail: the sheet's own tools, kept on the canvas edge. */}
          <nav aria-label="Sheet tools" className="bp-float absolute left-3 top-3 z-10 hidden flex-col gap-0.5 p-1 lg:flex">
            {[
              { label: audited ? 'Re-run clearance audit' : 'Run clearance audit', Icon: IconRulerMeasure, onClick: () => audit.mutate({ id: sheetId }), busy: audit.isPending },
              { label: 'Export JSON', Icon: IconFileExport, onClick: exportJson },
              { label: 'Export SVG', Icon: IconVectorTriangle, onClick: exportSvg },
              { label: 'Seal the drawing', Icon: IconCertificate, onClick: () => setTab('seal') },
            ].map((t) => (
              <button
                key={t.label}
                type="button"
                title={t.label}
                aria-label={t.label}
                onClick={t.onClick}
                disabled={t.busy}
                className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <t.Icon className={t.busy ? 'size-[18px] animate-pulse' : 'size-[18px]'} />
              </button>
            ))}
          </nav>
          <StagedRedlineCallout
            detail={data}
            busy={apply.isPending || reject.isPending}
            onApply={(redlineId) => apply.mutate({ sheetId, redlineId })}
            onReject={(redlineId) => reject.mutate({ sheetId, redlineId })}
            onDetails={() => setTab('redlines')}
          />
          <div className="pointer-events-none absolute bottom-3 left-3 hidden lg:block">
            <TitleBlock
              sheetNumber={data.sheet.sheetNumber}
              title={data.sheet.title}
              projectCode={data.sheet.projectCode}
              sprinklered={data.sheet.sprinklered}
              geometryHash={data.sheet.geometryHash}
              sealStatus={data.sheet.sealStatus}
              sealedBy={data.sheet.sealedBy}
              sealedAt={data.sheet.sealedAt}
            />
          </div>
        </div>
        <aside className="bp-float z-10 m-3 overflow-hidden lg:absolute lg:bottom-3 lg:right-3 lg:top-3 lg:m-0 lg:flex lg:w-[380px] lg:flex-col">
          <ComplianceDesk
            detail={data}
            tab={tab}
            onTab={setTab}
            selectedZoneId={selectedZoneId}
            selectedReceiptId={selectedReceiptId}
            activeClauseId={activeClauseId}
            busy={{ audit: audit.isPending, apply: apply.isPending, seal: seal.isPending, learn: learn.isPending }}
            onSelectReceipt={(r) => setSelection({ zone: r.zoneId, violation: r.id, clause: r.clauseId, px: String(r.pinX), py: String(r.pinY) })}
            onSelectClause={(clauseId) => setSelection({ clause: clauseId })}
            onAudit={() => audit.mutate({ id: sheetId })}
            onAskAgent={askAgent}
            onApply={(r) => apply.mutate({ sheetId, redlineId: r.id })}
            onReject={(r, note) => reject.mutate({ sheetId, redlineId: r.id, ...(note.trim() ? { architectNote: note.trim() } : {}) })}
            learnedRedlineIds={learnedRedlineIds}
            onLearn={(r, note) => learn.mutate({ sheetId, zoneId: r.zoneId, redlineId: r.id, ...(note.trim() ? { architectNote: note.trim() } : {}) })}
            onDoorWidth={(zoneId, doorId, widthIn) => move.mutate({ sheetId, zoneId, door: { doorId, widthIn } })}
            onSeal={() => seal.mutate({ sheetId, attestation: true })}
          />
        </aside>
    </div>
  )
}

function WorkbenchSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Skeleton className="size-4 rounded-md" />
        <Skeleton className="h-6 w-72 rounded-md" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="bp-canvas relative min-h-[420px] flex-1 p-10">
          <Skeleton className="h-full w-full rounded-md opacity-40" />
          <Skeleton className="absolute bottom-3 right-3 h-24 w-[300px] rounded-md" />
        </div>
        <div className="w-full space-y-2 p-4 lg:w-[380px]">
          <Skeleton className="h-6 w-40 rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
        </div>
      </div>
    </div>
  )
}
