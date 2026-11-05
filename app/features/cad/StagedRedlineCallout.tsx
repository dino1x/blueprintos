import { IconCheck, IconListDetails, IconX } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import type { SheetDetail } from '@/features/compliance/ComplianceDesk'

type Props = {
  detail: SheetDetail
  busy: boolean
  onApply: (redlineId: string) => void
  onReject: (redlineId: string) => void
  onDetails: () => void
}

// The agent's staged redline, reviewed where it is drawn: what it cites, what it measures now, what it predicts, and the
// architect's two decisions. The Redlines tab stays the full list.
export function StagedRedlineCallout({ detail, busy, onApply, onReject, onDetails }: Props) {
  const staged = detail.redlines.filter((r) => r.status === 'STAGED' && !r.isStale)
  const r = staged[0]
  if (!r) return null
  const receipt = detail.receipts.find((x) => x.id === r.violationReceiptId)
  const clause = detail.clauses.find((c) => c.id === r.clauseId)
  const zone = detail.zones.find((z) => z.id === r.zoneId)
  const u = clause?.unit === 'in' ? '″' : clause?.unit === 'ft' ? '′' : clause?.unit === 'sqft' ? ' sf' : ''
  const required = receipt?.requiredValue ?? null
  const predicted = r.predictedValue
  // A failing receipt below its requirement is a minimum (clear width); above it, a maximum (travel distance).
  const isMinimum = receipt ? receipt.measuredValue < receipt.requiredValue : true
  const clears = predicted !== null && required !== null && (isMinimum ? predicted >= required : predicted <= required)

  return (
    <section
      aria-label="Staged redline awaiting review"
      className="absolute right-3 top-3 z-10 w-72 border border-[hsl(var(--bp-redline))] bg-[hsl(var(--bp-paper))] text-[hsl(var(--bp-ink))] shadow-[4px_4px_0_hsl(var(--bp-ink)/0.12)]"
    >
      <header className="flex items-center justify-between border-b border-[hsl(var(--bp-ink)/0.2)] px-3 py-1.5">
        <span className="bp-mono text-[11px] uppercase tracking-[0.12em] text-[hsl(var(--bp-redline))]">
          Waiting on you · redline
        </span>
        <span className="bp-mono text-[11px] text-muted-foreground">
          {r.authorRole}
          {staged.length > 1 ? ` · 1 of ${staged.length}` : ''}
        </span>
      </header>
      <div className="px-3 pt-2">
        <p className="bp-mono text-xs text-[hsl(var(--bp-redline))]">{clause?.sectionRef ?? 'Cited clause'}</p>
        <p className="bp-serif text-base leading-tight">{zone?.label ?? 'Zone'}</p>
      </div>
      <dl className="bp-mono mx-3 mt-2 grid grid-cols-3 border-y border-[hsl(var(--bp-ink)/0.2)] text-center">
        <div className="py-1.5">
          <dt className="text-[11px] uppercase text-muted-foreground">Now</dt>
          <dd className="text-sm text-[hsl(var(--bp-redline))] line-through decoration-1">{receipt ? `${receipt.measuredValue}${u}` : '—'}</dd>
        </div>
        <div className="border-x border-[hsl(var(--bp-ink)/0.2)] py-1.5">
          <dt className="text-[11px] uppercase text-muted-foreground">Predicted</dt>
          <dd className={`text-sm font-medium ${clears ? 'text-[hsl(var(--bp-pass))]' : 'text-[hsl(var(--bp-redline))]'}`}>
            {predicted !== null ? `${predicted}${u}` : '—'}
          </dd>
        </div>
        <div className="py-1.5">
          <dt className="text-[11px] uppercase text-muted-foreground">Required</dt>
          <dd className="text-sm">{required !== null ? `${required}${u}` : '—'}</dd>
        </div>
      </dl>
      <div className="flex items-center gap-1.5 p-2">
        <Button size="sm" className="h-8 flex-1 rounded-md" disabled={busy} onClick={() => onApply(r.id)}>
          <IconCheck className="size-4" /> Apply
        </Button>
        <Button size="sm" variant="outline" className="h-8 rounded-md" disabled={busy} onClick={() => onReject(r.id)} aria-label="Reject redline">
          <IconX className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 rounded-md" onClick={onDetails} aria-label="Open in Redlines tab">
          <IconListDetails className="size-4" />
        </Button>
      </div>
    </section>
  )
}
