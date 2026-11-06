import { actionErrorMessage, useActionMutation, useActionQuery } from '@agent-native/core/client/hooks'
import { AgentToggleButton } from '@agent-native/toolkit/app/chat'
import { IconArrowRight, IconFileImport } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { RestoreRegisterModal } from './RestoreRegisterModal'

type ImportArgs = AgentNativeActionRegistry['import-floorplan']['params']
type Outline = { x: number; y: number }[][]

// A miniature of the drawing, white linework fitted to its frame.
function SheetThumb({ outline, className }: { outline: Outline; className?: string }) {
  const pts = outline.flat()
  if (!pts.length) return <span className={cn('block', className)} />
  const minX = Math.min(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const w = Math.max(...pts.map((p) => p.x)) - minX || 1
  const h = Math.max(...pts.map((p) => p.y)) - minY || 1
  const pad = Math.max(w, h) * 0.08
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" className={cn('block', className)}>
      {outline.map((poly, i) => (
        <polygon
          key={i}
          points={poly.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="rgb(255 255 255 / 0.03)"
          stroke="rgb(255 255 255 / 0.85)"
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

// Fixed brand colours for the register's colour-block layout (they read the same in light and dark).
const INK = '#0B061B'
const BLUE = '#3426E8'
const ORANGE = '#FF4800'
const LILAC = '#FCE5FC'

export function DrawingRegister() {
  const navigate = useNavigate()
  const { data, isPending } = useActionQuery('list-sheets', {})
  const [importing, setImporting] = useState(false)
  const [json, setJson] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const importPlan = useActionMutation('import-floorplan', {
    onMutate: () => setImporting(false),
    onError: (e) => {
      setImporting(true)
      toast.error(actionErrorMessage(e) ?? 'Import failed.')
    },
    onSuccess: (r) => {
      setJson('')
      navigate(`/sheets/${r.id}`)
    },
  })

  function submitImport() {
    try {
      const parsed = JSON.parse(json) as ImportArgs
      setParseError(null)
      importPlan.mutate(parsed)
    } catch {
      setParseError('That is not valid JSON.')
    }
  }

  const first = data?.sheets[0]

  return (
    <main className="bp-geist min-h-full text-white" style={{ backgroundColor: INK }}>
      {/* Top bar, split by hairlines. */}
      <nav aria-label="BlueprintOS" className="flex h-14 items-stretch whitespace-nowrap border-b border-white/10 text-[14px]">
        <Link to="/sheets" className="flex items-center border-r border-white/10 px-5 text-[17px] font-extrabold tracking-tight">
          Blueprint<span style={{ color: ORANGE }}>OS</span>
        </Link>
        <a href="#sheets" className="hidden items-center border-r sm:flex border-white/10 px-5 text-white/75 hover:text-white">register</a>
        <Link to="/chat" className="hidden items-center border-r sm:flex border-white/10 px-5 text-white/75 hover:text-white">chat</Link>
        <RestoreRegisterModal className="hidden border-r border-white/10 px-5 text-white/75 hover:text-white sm:flex" />
        <div className="ml-auto flex items-center gap-2 px-3">
          <button
            type="button"
            aria-label="Import floorplan"
            onClick={() => setImporting(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-white/10 px-3.5 text-[14px] font-medium hover:bg-white/15"
          >
            <IconFileImport className="size-4" /> <span className="hidden sm:inline">import floorplan</span>
          </button>
          <AgentToggleButton />
        </div>
      </nav>

      {/* Colour-block hero: a two-tone headline on electric blue, crossed by a dashed guide. */}
      <section className="relative overflow-hidden px-6 py-24 sm:px-16" style={{ backgroundColor: BLUE }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.10) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.10) 1px, transparent 1px)',
            backgroundSize: '96px 96px',
          }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[58%] border-t-2 border-dashed" style={{ borderColor: ORANGE }} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[68%] border-l-2 border-dashed" style={{ borderColor: ORANGE }} />
        <div className="relative max-w-4xl">
          <h1 className="text-5xl font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-[80px]">
            <span style={{ color: LILAC }}>Check every clearance.</span>
            <br />
            Seal it with proof.
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/85">
            The engine measures the drawing against the code, the agent proposes cited redlines, and only you can apply them or seal the sheet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {first ? (
              <Link to={`/sheets/${first.id}`} className="inline-flex h-11 items-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white" style={{ backgroundColor: ORANGE }}>
                open {first.sheetNumber} <IconArrowRight className="size-4" />
              </Link>
            ) : null}
            <a href="#sheets" className="inline-flex h-11 items-center rounded-md bg-white/15 px-5 text-[15px] font-semibold text-white hover:bg-white/20">
              all sheets
            </a>
          </div>
        </div>
      </section>

      {/* Plan-review sequence across A-101. */}
      {first ? (
        <section aria-labelledby="tour" className="border-b border-white/10 px-6 py-16 sm:px-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="tour" className="text-4xl font-extrabold tracking-[-0.04em] sm:text-[48px]">
              Plan review in three steps<span style={{ color: ORANGE }}>.</span>
            </h2>
            <p className="text-[15px] text-white/55">both sheets are pre-seeded on the drafting table</p>
          </div>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 md:grid-cols-3">
            {[
              { n: '01', title: 'Run the clearance audit', body: 'Open A-101 and press Run clearance audit: five critical findings, each pinned on the drawing with its clause.' },
              { n: '02', title: 'Ask the agent for a fix', body: 'Select the hall pin and press Ask agent. It may only propose a redline that cites the finding and the clause hash.' },
              { n: '03', title: 'Apply it, then try to cheat', body: 'Apply the redline, then ask the agent to widen a room without a citation and watch the server refuse it.' },
            ].map((step) => (
              <li key={step.n} className="bg-[#0B061B]">
                <Link to={`/sheets/${first.id}`} className="group flex h-full flex-col p-7 transition-colors hover:bg-[#120B26]">
                  <span className="font-mono text-[13px]" style={{ color: ORANGE }}>{step.n}</span>
                  <span className="mt-4 text-[22px] font-extrabold leading-tight tracking-[-0.03em]">{step.title}</span>
                  <span className="mt-2 text-[15px] leading-relaxed text-white/60">{step.body}</span>
                  {step.n === '01' ? (
                    <span className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: ORANGE }}>
                      start with {first.sheetNumber} <IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* The register as a bento of drawings. */}
      <section id="sheets" className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <h2 className="text-4xl font-extrabold tracking-[-0.04em] sm:text-[56px]">
          The register<span className="text-white/40">, every sheet.</span>
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {isPending
            ? [0, 1].map((i) => <Skeleton key={i} className="h-96 rounded-lg bg-white/5" />)
            : data?.sheets.map((s) => (
                <Link
                  key={s.id}
                  to={`/sheets/${s.id}`}
                  className="group flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#120B26] outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-white"
                >
                  <div
                    className="relative grid h-60 place-items-center border-b border-white/10 p-8"
                    style={{
                      backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.05) 1px, transparent 1px)',
                      backgroundSize: '32px 32px',
                    }}
                  >
                    <SheetThumb outline={s.outline} className="h-full w-full" />
                    <span className="absolute left-4 top-4 rounded bg-white/10 px-2 py-0.5 font-mono text-[12px] text-white/80">{s.sheetNumber}</span>
                    {s.auditCurrent && s.critical ? (
                      <span className="absolute right-4 top-4 rounded px-2 py-0.5 text-[12px] font-semibold text-white" style={{ backgroundColor: ORANGE }}>
                        {s.critical} critical
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-end justify-between gap-4 p-6">
                    <div className="min-w-0">
                      <h3 className="truncate text-[28px] font-extrabold leading-tight tracking-[-0.03em]">{s.title}</h3>
                      <p className="mt-1 text-[14px] text-white/60">
                        {s.projectCode} · {s.zoneCount} zones · {s.sprinklered ? 'sprinklered' : 'non-sprinklered'} ·{' '}
                        {s.sealStatus === 'SEALED' ? 'sealed' : s.sealStatus === 'STALE_REQUIRES_REAUDIT' ? 'seal stale' : 'unsealed'}
                      </p>
                    </div>
                    <span className="grid size-10 shrink-0 place-items-center rounded-md border border-white/20 transition-colors group-hover:border-white/50">
                      <IconArrowRight className="size-4" />
                    </span>
                  </div>
                </Link>
              ))}
        </div>
      </section>
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="max-w-2xl rounded-md">
          <DialogHeader>
            <DialogTitle className="bp-serif">Import a floorplan</DialogTitle>
            <DialogDescription>Paste JSON exported from a BlueprintOS sheet (inches; zones with vertices and doors).</DialogDescription>
          </DialogHeader>
          <Textarea value={json} onChange={(e) => setJson(e.target.value)} aria-label="Floorplan JSON" className="bp-mono h-64 rounded-md text-xs" />
          {parseError ? <p className="text-xs text-[hsl(var(--bp-redline))]">{parseError}</p> : null}
          <DialogFooter>
            <Button className="rounded-md" disabled={!json.trim() || importPlan.isPending} onClick={submitImport}>
              Import sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
