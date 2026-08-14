import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { statuses, severityToBadgeVariant } from '@/features/tasks/data/data'
import { useDashboardStats } from '../data/dashboard'

function pctClass(pct: number) {
  if (pct > 0) return 'text-destructive'
  if (pct < 0) return 'text-success'
  return 'text-muted-foreground'
}

export function RecentPriceAlerts() {
  const { data, isLoading } = useDashboardStats()

  if (isLoading) {
    return (
      <div className='space-y-2'>
        {[1, 2, 3].map((i) => (
          <div key={i} className='flex items-center justify-between rounded-md border px-3 py-2'>
            <div className='flex items-center gap-3'>
              <Skeleton className='h-3 w-10' />
              <Skeleton className='h-3 w-40' />
            </div>
            <Skeleton className='h-6 w-16 rounded-full' />
          </div>
        ))}
      </div>
    )
  }

  const items = data?.recentAlerts ?? []

  if (items.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-8 gap-2 text-center'>
        <svg width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' className='text-muted-foreground/40'>
          <path d='M3 3v18h18' />
          <path d='M7 14l3-4 4 3 5-6' />
        </svg>
        <p className='text-sm text-muted-foreground'>No price variance alerts yet. Upload an invoice to start comparing costs.</p>
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      {items.map((record) => {
        const pct = parseFloat(record.price_change_pct ?? '0')
        const statusDef = statuses.find((s) => s.value === record.status)
        const severity = statusDef?.severity ?? 'neutral'
        const badgeVariant = severityToBadgeVariant[severity]
        const pctLabel = Number.isFinite(pct)
          ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
          : '—'
        return (
          <div
            key={record.id}
            className='flex items-center justify-between rounded-md border px-3 py-2'
          >
            <div className='flex items-center gap-3 min-w-0'>
              <span
                className={`text-xs font-semibold w-16 shrink-0 ${pctClass(pct)}`}
              >
                {pctLabel}
              </span>
              <div className='min-w-0'>
                <p className='text-sm font-medium truncate'>{record.title}</p>
                {record.matched_recipe && (
                  <p className='text-xs text-muted-foreground truncate'>
                    {record.matched_recipe}
                  </p>
                )}
              </div>
            </div>
            <Badge variant={badgeVariant} className='ml-2 shrink-0'>
              {statusDef?.label ?? record.status}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}
