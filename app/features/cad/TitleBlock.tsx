type Props = {
  sheetNumber: string
  title: string
  projectCode: string
  sprinklered: boolean
  geometryHash: string
  sealStatus: 'UNSEALED' | 'SEALED' | 'STALE_REQUIRES_REAUDIT'
  sealedBy: string | null
  sealedAt: string | null
}

export function TitleBlock({ sheetNumber, title, projectCode, sprinklered, geometryHash, sealStatus, sealedBy, sealedAt }: Props) {
  return (
    <div className="bp-double-rule pointer-events-auto grid w-[300px] grid-cols-[1fr_84px] bg-[hsl(var(--bp-paper))] text-[hsl(var(--bp-ink))]">
      <div className="border-b border-r border-[hsl(var(--bp-ink)/0.5)] px-3 py-2">
        <p className="bp-mono text-[11px] uppercase tracking-wider opacity-60">Project {projectCode}</p>
        <p className="bp-serif text-[15px] leading-tight">{title}</p>
      </div>
      <div className="flex items-center justify-center border-b border-[hsl(var(--bp-ink)/0.5)]">
        <span className="bp-serif text-xl">{sheetNumber}</span>
      </div>
      <div className="border-r border-[hsl(var(--bp-ink)/0.5)] px-3 py-1.5">
        <p className="bp-mono text-[11px] opacity-70">
          Units in · {sprinklered ? 'Sprinklered' : 'Non-sprinklered'}
        </p>
        <p className="bp-mono truncate text-[11px] opacity-70" title={geometryHash}>
          geom {geometryHash.slice(0, 16)}…
        </p>
      </div>
      <div className="flex items-center justify-center p-1">
        {sealStatus === 'UNSEALED' ? (
          <span className="bp-mono text-[11px] opacity-50">NOT SEALED</span>
        ) : (
          <div
            title={sealedBy ? `Sealed by ${sealedBy} ${sealedAt ?? ''}` : undefined}
            className={
              sealStatus === 'SEALED'
                ? 'flex size-16 flex-col items-center justify-center rounded-full border-2 border-[hsl(var(--bp-redline))] text-[hsl(var(--bp-redline))]'
                : 'relative flex size-16 flex-col items-center justify-center rounded-full border-2 border-dashed border-[hsl(var(--bp-ink)/0.5)] text-[hsl(var(--bp-ink)/0.6)]'
            }
          >
            <span className="bp-serif text-[11px] leading-none">{sealStatus === 'SEALED' ? 'SEALED' : 'STALE'}</span>
            <span className="bp-mono text-[7px] leading-tight">{sealStatus === 'SEALED' ? (sealedAt ?? '').slice(0, 10) : 're-audit'}</span>
            {sealStatus === 'STALE_REQUIRES_REAUDIT' ? (
              <span className="absolute left-1 right-1 top-1/2 h-px -rotate-12 bg-[hsl(var(--bp-redline))]" />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
