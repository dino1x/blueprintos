import { cn } from '@/lib/utils'

interface StampProps {
  className?: string
}

export function SheetStamp({ className }: StampProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('size-6 shrink-0', className)}
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        fill="hsl(var(--bp-paper))"
        stroke="hsl(var(--bp-ink))"
        strokeWidth="1.3"
      />
      <path
        d="M5 5h9v6h4v4"
        fill="none"
        stroke="hsl(var(--bp-ink))"
        strokeWidth="1.3"
      />
      <rect
        x="14"
        y="16.5"
        width="6.5"
        height="4"
        fill="none"
        stroke="hsl(var(--bp-ink))"
        strokeWidth="1"
      />
      <path
        d="M4.5 18.5 11 12"
        stroke="hsl(var(--bp-redline))"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SheetTitleMark({ className }: StampProps) {
  return (
    <span
      className={cn(
        'bp-serif truncate text-[17px] leading-none text-sidebar-accent-foreground',
        className,
      )}
    >
      Blueprint<span className="text-[hsl(var(--bp-redline))]">OS</span>
    </span>
  )
}
