import { registerActionChatRenderer, type ToolRendererProps } from '@agent-native/toolkit/app/chat'
import { IconArrowRight, IconShieldCheck } from '@tabler/icons-react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/skeleton'
import { useSingleChatCard } from '@/lib/single-chat-card'

type CitedRedline = {
  id: string
  sheetId: string
  zoneId: string
  sectionRef: string
  measuredBefore: number
  predictedValue: number | null
  requiredValue: number | null
  predictedSeverity: string | null
  sheetNumber: string
  zoneLabel: string
  clauseTitle: string
  unit: string
  violationReceiptId: string
  clauseHash: string
  baseGeometryHash: string
  rationale: string
}

function isCitedRedline(value: unknown): value is CitedRedline {
  return !!value && typeof value === 'object' && 'sectionRef' in value && 'clauseHash' in value && 'violationReceiptId' in value
}

function mark(unit: string): string {
  return unit === 'in' ? '″' : unit === 'ft' ? '′' : unit === 'sqft' ? ' sf' : ` ${unit}`
}

function severityTone(severity: string | null): string {
  if (severity === 'PASS') return 'text-[hsl(var(--bp-pass))]'
  if (severity === 'WARNING') return 'text-[hsl(var(--bp-warn))]'
  return 'text-[hsl(var(--bp-redline))]'
}

// A redline the firewall accepted, drawn like a margin note on a plan check: what was cited, what it predicts, who decides.
export function CitedRedlineCard({ context }: ToolRendererProps) {
  if (!useSingleChatCard(context.widgetId)) return null
  if (context.isRunning) {
    return (
      <div className="my-2 w-full max-w-md border border-border bg-[hsl(var(--bp-paper))] p-3" aria-busy="true">
        <Skeleton className="h-3 w-32 rounded-md" />
        <Skeleton className="mt-3 h-6 w-48 rounded-md" />
        <Skeleton className="mt-3 h-10 w-full rounded-md" />
      </div>
    )
  }
  const r = context.resultJson
  if (!isCitedRedline(r)) return null
  const u = mark(r.unit)
  const cured = r.predictedSeverity === 'PASS' || r.predictedSeverity === 'WARNING'
  const sheetLink = `/sheets/${encodeURIComponent(r.sheetId)}?zone=${encodeURIComponent(r.zoneId)}&violation=${encodeURIComponent(r.violationReceiptId)}`

  return (
    <article className="my-2 w-full max-w-md border border-[hsl(var(--bp-ink)/0.35)] bg-[hsl(var(--bp-paper))] text-[hsl(var(--bp-ink))]">
      <header className="flex items-center justify-between border-b border-[hsl(var(--bp-ink)/0.2)] px-3 py-1.5">
        <span className="bp-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--bp-redline))]">Cited redline · staged</span>
        <span className="bp-mono text-[11px] text-muted-foreground">{r.sheetNumber}</span>
      </header>

      <div className="px-3 pt-2.5">
        <p className="bp-mono text-xs text-[hsl(var(--bp-redline))]">{r.sectionRef}</p>
        <h3 className="bp-serif text-lg leading-tight">{r.zoneLabel}</h3>
        <p className="text-[11px] text-muted-foreground">{r.clauseTitle}</p>
      </div>

      <dl className="mx-3 mt-2.5 grid grid-cols-3 border-y border-[hsl(var(--bp-ink)/0.2)]">
        <div className="px-2 py-1.5">
          <dt className="bp-mono text-[11px] uppercase text-muted-foreground">Measured</dt>
          <dd className="bp-mono text-sm text-[hsl(var(--bp-redline))] line-through decoration-1">{r.measuredBefore}{u}</dd>
        </div>
        <div className="border-x border-[hsl(var(--bp-ink)/0.2)] px-2 py-1.5">
          <dt className="bp-mono text-[11px] uppercase text-muted-foreground">Predicted</dt>
          <dd className={`bp-mono text-sm font-medium ${severityTone(r.predictedSeverity)}`}>
            {r.predictedValue !== null ? `${r.predictedValue}${u}` : '—'}
          </dd>
        </div>
        <div className="px-2 py-1.5">
          <dt className="bp-mono text-[11px] uppercase text-muted-foreground">Required</dt>
          <dd className="bp-mono text-sm">{r.requiredValue !== null ? `${r.requiredValue}${u}` : '—'}</dd>
        </div>
      </dl>

      <p className="px-3 pt-2 text-xs leading-relaxed">{r.rationale}</p>

      <p className="bp-mono flex items-start gap-1.5 px-3 pt-2 text-[11px] leading-snug text-muted-foreground">
        <IconShieldCheck className="mt-px size-3 shrink-0 text-[hsl(var(--bp-pass))]" aria-hidden="true" />
        <span>
          receipt {r.violationReceiptId.slice(0, 8)} · clause sha256 {r.clauseHash.slice(0, 12)}… · geometry {r.baseGeometryHash.slice(0, 10)}
        </span>
      </p>

      <footer className="mt-2.5 flex items-center justify-between gap-2 border-t border-[hsl(var(--bp-ink)/0.2)] px-3 py-2">
        <span className="text-[11px] text-muted-foreground">
          {cured ? 'Engine predicts the citation clears.' : 'Engine predicts it still fails.'} Only the architect can apply it.
        </span>
        <Link
          to={sheetLink}
          className="bp-mono inline-flex shrink-0 items-center gap-1 border border-[hsl(var(--bp-ink))] px-2 py-1 text-[11px] hover:bg-[hsl(var(--bp-ink))] hover:text-[hsl(var(--bp-paper))]"
        >
          Review on sheet <IconArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </footer>
    </article>
  )
}

registerActionChatRenderer({
  id: 'blueprintos.cited-redline',
  renderer: 'blueprintos.cited-redline',
  Component: CitedRedlineCard,
})
