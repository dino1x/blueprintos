import { IconCheck, IconSchool, IconRosette, IconX } from '@tabler/icons-react'
import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type SheetDetail = AgentNativeActionRegistry['get-sheet-detail']['result']
type Receipt = SheetDetail['receipts'][number]
type Redline = SheetDetail['redlines'][number]

// Plan-review categories, the way reviewers sort findings: what kind of requirement failed.
function categoryOf(r: { sectionRef: string; detail: string }): string {
  const d = r.detail.toLowerCase()
  if (d.includes('exit') || d.includes('dead-end') || d.includes('egress')) return 'Egress'
  if (d.includes('door') || d.includes('opening') || r.sectionRef.startsWith('ADA-404')) return 'Doors'
  if (d.includes('clear width') || d.includes('opposing-wall')) return 'Clear width'
  if (d.includes('area') || d.includes('dimension')) return 'Room size'
  return 'Other'
}

type Props = {
  detail: SheetDetail
  tab: string
  onTab: (tab: string) => void
  selectedZoneId: string | null
  selectedReceiptId: string | null
  activeClauseId: string | null
  busy: { audit: boolean; apply: boolean; seal: boolean; learn: boolean }
  onSelectReceipt: (receipt: Receipt) => void
  onSelectClause: (clauseId: string) => void
  onAudit: () => void
  onAskAgent: (receipt: Receipt | null) => void
  onApply: (redline: Redline) => void
  onReject: (redline: Redline, note: string) => void
  onLearn: (redline: Redline, note: string) => void
  /** Redlines whose architect adjustment is already a learned rule this session. */
  learnedRedlineIds?: Set<string>
  onDoorWidth: (zoneId: string, doorId: string, widthIn: number) => void
  onSeal: () => void
}

const SEVERITY_TEXT: Record<string, string> = {
  CRITICAL: 'text-[hsl(var(--bp-redline))]',
  WARNING: 'text-[hsl(var(--bp-warn))]',
  PASS: 'text-[hsl(var(--bp-pass))]',
}

function unitOf(sectionRef: string, clauses: SheetDetail['clauses']): string {
  const u = clauses.find((c) => c.sectionRef === sectionRef)?.unit ?? ''
  return u === 'in' ? '″' : u === 'ft' ? '′' : u === 'sqft' ? ' sf' : u
}

export function ComplianceDesk(props: Props) {
  const { detail, selectedZoneId, selectedReceiptId, activeClauseId, busy } = props
  const [rejecting, setRejecting] = useState<Redline | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [learning, setLearning] = useState<Redline | null>(null)
  const [learnNote, setLearnNote] = useState('')
  const [sealOpen, setSealOpen] = useState(false)

  const failing = detail.receipts
    .filter((r) => r.severity !== 'PASS')
    .sort((a, b) => (a.severity === b.severity ? a.sectionRef.localeCompare(b.sectionRef) : a.severity === 'CRITICAL' ? -1 : 1))
  const critical = detail.receipts.filter((r) => r.severity === 'CRITICAL').length
  const zone = detail.zones.find((z) => z.id === selectedZoneId) ?? null
  const zoneDoors = zone ? detail.doors.filter((d) => d.zoneId === zone.id) : []
  const selectedReceipt = detail.receipts.find((r) => r.id === selectedReceiptId) ?? null
  const zoneLabel = (id: string) => detail.zones.find((z) => z.id === id)?.label ?? 'zone'
  const staged = detail.redlines.filter((r) => r.status === 'STAGED')

  return (
    <div className="flex h-full min-h-0 flex-col">
      {zone ? (
        <section className="border-b border-border px-4 py-3">
          <p className="bp-serif text-lg leading-tight">{zone.label}</p>
          <p className="bp-mono text-[11px] uppercase text-muted-foreground">{zone.zoneType.replace('_', ' ')}</p>
          <dl className="bp-mono mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
            <div><dt className="text-muted-foreground">area</dt><dd>{zone.areaSqft.toFixed(1)} sf</dd></div>
            <div><dt className="text-muted-foreground">min dim</dt><dd>{zone.minDimensionIn.toFixed(1)}″</dd></div>
            <div><dt className="text-muted-foreground">perimeter</dt><dd>{zone.perimeterFt.toFixed(1)}′</dd></div>
            <div><dt className="text-muted-foreground">occupants</dt><dd>{zone.occupantLoad}</dd></div>
            <div><dt className="text-muted-foreground">to exit</dt><dd>{zone.egressDistanceFt === null ? 'no path' : `${zone.egressDistanceFt.toFixed(1)}′`}</dd></div>
            <div><dt className="text-muted-foreground">dead end</dt><dd>{zone.deadEndFt === null ? '—' : `${zone.deadEndFt.toFixed(1)}′`}</dd></div>
          </dl>
          {zoneDoors.map((d) => (
            <label key={d.doorId} className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{d.label} <span className="bp-mono text-muted-foreground">· serves {d.servedLoad}</span></span>
              <span className="bp-mono flex items-center gap-1">
                <input
                  type="number"
                  min={20}
                  max={96}
                  step={1}
                  defaultValue={d.clearWidthIn}
                  key={`${d.doorId}:${d.clearWidthIn}`}
                  aria-label={`${d.label} clear width in inches`}
                  className="h-7 w-14 border border-input bg-transparent px-1 text-right"
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v) && v !== d.clearWidthIn) props.onDoorWidth(d.zoneId, d.doorId, v)
                  }}
                />
                ″
              </span>
            </label>
          ))}
        </section>
      ) : null}

      <Tabs value={props.tab} onValueChange={props.onTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 grid grid-cols-4 rounded-md">
          <TabsTrigger value="pins" className="rounded-md text-xs">Pins{failing.length ? ` ${failing.length}` : ''}</TabsTrigger>
          <TabsTrigger value="code" className="rounded-md text-xs">Code</TabsTrigger>
          <TabsTrigger value="redlines" className="rounded-md text-xs">Redlines{staged.length ? ` ${staged.length}` : ''}</TabsTrigger>
          <TabsTrigger value="seal" className="rounded-md text-xs">Seal</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
          <TabsContent value="pins" className="mt-0 space-y-3">
            {!detail.sheet.auditedGeometryHash ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-[13px] text-muted-foreground">Run the audit to measure this drawing against the code.</p>
                <Button size="sm" className="h-8 rounded-lg bg-[hsl(var(--bp-redline))] px-4 text-white hover:bg-[hsl(var(--bp-redline)/0.9)]" disabled={busy.audit} onClick={props.onAudit}>
                  {busy.audit ? 'Auditing…' : 'Run clearance audit'}
                </Button>
              </div>
            ) : failing.length === 0 ? (
              <p className="bp-serif py-6 text-center text-[hsl(var(--bp-pass))]">Every clause passes on this geometry.</p>
            ) : (
              <div className="space-y-3">
                {(
                  [
                    { title: 'Critical', tone: 'text-[hsl(var(--bp-redline))]', items: failing.filter((r) => r.severity === 'CRITICAL') },
                    { title: 'At limit', tone: 'text-[hsl(var(--bp-warn))]', items: failing.filter((r) => r.severity !== 'CRITICAL') },
                  ] as const
                )
                  .filter((g) => g.items.length)
                  .map((group) => (
                    <section key={group.title} aria-label={`${group.title} findings`}>
                      <h3 className={cn('bp-mono flex items-baseline justify-between px-2 pb-1 text-[11px] uppercase tracking-[0.12em]', group.tone)}>
                        {group.title}
                        <span className="text-muted-foreground">{group.items.length}</span>
                      </h3>
                      <ol className="divide-y divide-border border-y border-border">
                {group.items.map((r) => {
                  // Numbers match the pins on the drawing, so they come from the full list, not the group.
                  const index = failing.indexOf(r)
                  const staged = detail.redlines.some((x) => x.violationReceiptId === r.id && x.status === 'STAGED' && !x.isStale)
                  return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => props.onSelectReceipt(r)}
                      className={cn('grid w-full grid-cols-[22px_1fr] gap-x-2 px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring', r.id === selectedReceiptId && 'bg-accent')}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'bp-mono mt-0.5 grid size-[18px] place-items-center rounded-full text-[11px] text-[hsl(var(--bp-paper))]',
                          r.severity === 'CRITICAL' ? 'bg-[hsl(var(--bp-redline))]' : 'bg-[hsl(var(--bp-warn))]',
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('bp-mono text-[11px] font-medium', SEVERITY_TEXT[r.severity])}>{r.sectionRef}</span>
                        <span className="bp-mono text-[11px]">
                          {r.measuredValue}{unitOf(r.sectionRef, detail.clauses)} <span className="text-muted-foreground">/ {r.requiredValue}{unitOf(r.sectionRef, detail.clauses)}</span>
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs">{r.detail}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="bp-mono border border-border px-1 text-[11px] text-muted-foreground">{categoryOf(r)}</span>
                        {staged ? <span className="bp-mono border border-[hsl(var(--bp-redline))] px-1 text-[11px] text-[hsl(var(--bp-redline))]">redline staged</span> : null}
                        <span className="bp-mono text-[11px] text-muted-foreground">receipt {r.id.slice(0, 8)} · {zoneLabel(r.zoneId)}</span>
                      </span>
                      </span>
                    </button>
                  </li>
                  )
                })}
                      </ol>
                    </section>
                  ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="code" className="mt-0 space-y-4">
            {detail.clauses.map((c) => (
              <article
                key={c.id}
                className={cn('border-l-2 pl-3', c.id === activeClauseId ? 'border-[hsl(var(--bp-redline))]' : 'border-border')}
              >
                <button type="button" onClick={() => props.onSelectClause(c.id)} className="text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <p className="bp-mono text-[11px] text-[hsl(var(--bp-redline))]">{c.sectionRef}</p>
                  <p className="bp-serif text-[15px] leading-snug">{c.title}</p>
                </button>
                <p className="mt-1 text-xs leading-relaxed text-foreground/85">{c.verbatimText}</p>
                <p className="bp-mono mt-1 text-[11px] text-muted-foreground">
                  {c.thresholdMetric} {c.thresholdOperator} {c.thresholdValue}
                  {c.sprinkleredThresholdValue ? ` (sprinklered ${c.sprinkleredThresholdValue})` : ''} {c.unit}
                </p>
                <p className="bp-mono break-all text-[11px] text-muted-foreground">sha256 {c.clauseHash}</p>
              </article>
            ))}
          </TabsContent>

          <TabsContent value="redlines" className="mt-0 space-y-3">
            {detail.redlines.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No redlines yet. Select a red pin and ask the agent — it must cite the receipt and clause hash.
              </p>
            ) : (
              detail.redlines.map((r) => {
                const clause = detail.clauses.find((c) => c.id === r.clauseId)
                const draftZone = detail.zones.find((z) => z.id === r.zoneId)
                return (
                  <article key={r.id} className="border border-border p-3">
                    <header className="flex items-baseline justify-between gap-2">
                      <span className="bp-mono text-[11px] text-[hsl(var(--bp-redline))]">{clause?.sectionRef ?? 'clause'}</span>
                      <span className={cn('bp-mono text-[11px]', r.status === 'APPLIED' ? 'text-[hsl(var(--bp-pass))]' : r.status === 'REJECTED' ? 'text-muted-foreground line-through' : r.isStale ? 'text-[hsl(var(--bp-warn))]' : '')}>
                        {r.isStale ? 'STALE' : r.status} · {r.authorRole}
                      </span>
                    </header>
                    <p className="mt-1 text-sm">{zoneLabel(r.zoneId)}</p>
                    {r.predictedValue !== null ? (
                      <p className="bp-mono text-[11px] text-muted-foreground">predicted {r.predictedValue}{unitOf(clause?.sectionRef ?? '', detail.clauses)}</p>
                    ) : null}
                    <p className="mt-1 text-xs leading-relaxed">{r.rationale}</p>
                    {r.architectNote ? <p className="mt-1 border-l-2 border-[hsl(var(--bp-ink))] pl-2 text-xs italic">{r.architectNote}</p> : null}
                    {r.status === 'STAGED' ? (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" className="h-7 rounded-md" disabled={busy.apply || r.isStale} onClick={() => props.onApply(r)}>
                          <IconCheck className="size-3.5" /> Apply
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 rounded-md" onClick={() => { setRejecting(r); setRejectNote('') }}>
                          <IconX className="size-3.5" /> Reject
                        </Button>
                      </div>
                    ) : r.status === 'APPLIED' && r.authorRole === 'agent' && draftZone?.agentDraftVertices && props.learnedRedlineIds?.has(r.id) ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <IconSchool className="size-3.5" /> Learned into the spatial rules
                      </p>
                    ) : r.status === 'APPLIED' && r.authorRole === 'agent' && draftZone?.agentDraftVertices ? (
                      <Button size="sm" variant="outline" className="mt-2 h-7 rounded-md" onClick={() => { setLearning(r); setLearnNote(r.architectNote ?? r.rationale) }}>
                        <IconSchool className="size-3.5" /> Teach from my adjustment
                      </Button>
                    ) : null}
                  </article>
                )
              })
            )}
            {detail.learnedRules.length ? (
              <section aria-label="Learned constraints" className="border-t border-border pt-3">
                <h3 className="bp-mono mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Learned from your hand edits</h3>
                <ol className="space-y-2">
                  {detail.learnedRules.slice(0, 6).map((rule) => (
                    <li key={rule.id} className="border-l-2 border-[hsl(var(--bp-ink))] pl-2">
                      <span className="bp-mono text-[11px] text-muted-foreground">{rule.zoneType} · {rule.createdAt.slice(0, 10)}</span>
                      <p className="whitespace-pre-line text-xs leading-relaxed">{rule.rule.replace(/^- /gm, '').replace(/`/g, '')}</p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </TabsContent>

          <TabsContent value="seal" className="mt-0 space-y-3">
            <p className="bp-serif text-lg">{detail.sheet.sealStatus === 'SEALED' ? 'Sealed' : detail.sheet.sealStatus === 'STALE_REQUIRES_REAUDIT' ? 'Seal is stale' : 'Not sealed'}</p>
            <p className="text-xs text-muted-foreground">
              Only a licensed architect can seal, from this screen. Sealing requires an audit of the exact current geometry with zero CRITICAL receipts. Any later edit voids the seal.
            </p>
            <ul className="bp-mono space-y-1 text-[11px]">
              <li>audit current: {detail.sheet.auditCurrent ? 'yes' : 'no'}</li>
              <li className={critical ? SEVERITY_TEXT.CRITICAL : SEVERITY_TEXT.PASS}>critical receipts: {critical}</li>
              {detail.sheet.sealedBy ? <li>sealed by {detail.sheet.sealedBy} {detail.sheet.sealedAt?.slice(0, 16).replace('T', ' ')}</li> : null}
            </ul>
            <Button
              className="h-9 w-full rounded-md bg-[hsl(var(--bp-redline))] text-[hsl(var(--bp-paper))] hover:bg-[hsl(var(--bp-redline)/0.9)]"
              disabled={busy.seal || detail.sheet.sealStatus === 'SEALED'}
              onClick={() => setSealOpen(true)}
            >
              <IconRosette className="size-4" /> Seal sheet {detail.sheet.sheetNumber}
            </Button>
          </TabsContent>
        </div>
      </Tabs>

      <AlertDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="bp-serif">Reject this redline?</AlertDialogTitle>
            <AlertDialogDescription>Optionally note why; the agent reads rejected notes.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} aria-label="Rejection note" className="rounded-md" />
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Keep staged</AlertDialogCancel>
            <AlertDialogAction className="rounded-md" onClick={() => rejecting && props.onReject(rejecting, rejectNote)}>Reject</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!learning} onOpenChange={(o) => !o && setLearning(null)}>
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="bp-serif">Teach the agent from your adjustment</AlertDialogTitle>
            <AlertDialogDescription>
              BlueprintOS measures the difference between the agent's draft polygon and your current walls. Edit the note to say what the agent should have done.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={learnNote} onChange={(e) => setLearnNote(e.target.value)} aria-label="Architect note" className="h-28 rounded-md" />
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-md" disabled={busy.learn} onClick={() => learning && props.onLearn(learning, learnNote)}>Write rule</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={sealOpen} onOpenChange={setSealOpen}>
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="bp-serif">Seal {detail.sheet.sheetNumber} — {detail.sheet.title}</AlertDialogTitle>
            <AlertDialogDescription>
              You attest that you reviewed geometry <span className="bp-mono">{detail.sheet.geometryHash.slice(0, 16)}…</span> and its audit. The seal is recorded under your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Not yet</AlertDialogCancel>
            <AlertDialogAction className="rounded-md bg-[hsl(var(--bp-redline))] text-[hsl(var(--bp-paper))]" onClick={props.onSeal}>Apply seal</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
