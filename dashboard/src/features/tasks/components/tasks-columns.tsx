import { type ColumnDef } from '@tanstack/react-table'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { supabase } from '@/lib/supabase'
import { statuses, severityToBadgeVariant } from '../data/data'
import { type Task } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

async function openSourceFile(path: string) {
  const { data, error } = await supabase.storage
    .from('uploads')
    .createSignedUrl(path, 60 * 60) // 1 hour
  if (error || !data?.signedUrl) return
  window.open(data.signedUrl, '_blank')
}

function formatDueDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  )
  const label = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  if (diffDays < 0) return `${label} (overdue)`
  if (diffDays <= 30) return `${label} (${diffDays}d)`
  return label
}

function detailsOf(row: { original: Task }): Record<string, unknown> {
  return (row.original.details ?? {}) as Record<string, unknown>
}

function formatCurrency(value: unknown, currency: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  const code = typeof currency === 'string' && currency ? currency : 'USD'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(n)
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  }
}

export const tasksColumns: ColumnDef<Task>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
        className='translate-y-0.5'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-0.5'
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    size: 40,
  },
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='ID' />
    ),
    cell: ({ row }) => <div className='w-20'>{row.getValue('id')}</div>,
    enableSorting: false,
    enableHiding: true,
    enableResizing: false,
    size: 90,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    meta: {
      className: 'ps-1',
      tdClassName: 'ps-4',
    },
    size: 320,
    minSize: 180,
    maxSize: 800,
    cell: ({ row }) => {
      const name = String(row.getValue('title') ?? '')
      return (
        <div className='flex min-w-0 space-x-2'>
          <span className='truncate font-medium' title={name}>
            {name}
          </span>
        </div>
      )
    },
  },
  {
    id: 'unit_price',
    accessorFn: (row) => (row.details as Record<string, unknown> | null)?.unit_price ?? null,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Unit Price' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-4' },
    size: 130,
    cell: ({ row }) => {
      const details = detailsOf(row)
      const price = details.unit_price
      if (price == null) return <span className='text-muted-foreground'>—</span>
      return <span className='font-medium'>{formatCurrency(price, details.currency)}</span>
    },
  },
  {
    id: 'price_change_pct',
    accessorFn: (row) => (row.details as Record<string, unknown> | null)?.price_change_pct ?? null,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Price Change' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-4' },
    size: 150,
    cell: ({ row }) => {
      const details = detailsOf(row)
      const pct = details.price_change_pct
      if (typeof pct !== 'number' || !Number.isFinite(pct)) {
        return <span className='text-muted-foreground'>—</span>
      }
      const up = pct > 0
      return (
        <Badge variant={up ? 'destructive' : 'success'} className='font-mono'>
          {up ? '+' : ''}{pct.toFixed(1)}%
        </Badge>
      )
    },
  },
  {
    id: 'matched_recipe',
    accessorFn: (row) => (row.details as Record<string, unknown> | null)?.matched_recipe ?? null,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Matched Recipe' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-4' },
    size: 240,
    minSize: 160,
    cell: ({ row }) => {
      const details = detailsOf(row)
      const recipe = details.matched_recipe
      if (!recipe) return <span className='text-muted-foreground'>—</span>
      const pct = details.recipe_impact_pct
      return (
        <div className='flex min-w-0 flex-col'>
          <span className='truncate font-medium' title={String(recipe)}>{String(recipe)}</span>
          {typeof pct === 'number' && Number.isFinite(pct) && (
            <span className={pct > 0 ? 'text-destructive text-xs' : 'text-emerald-600 text-xs'}>
              impact {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
            </span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-4' },
    size: 170,
    cell: ({ row }) => {
      const statusValue = row.getValue('status') as string
      const statusDef = statuses.find((s) => s.value === statusValue)
      const severity = statusDef?.severity ?? 'neutral'
      const badgeVariant = severityToBadgeVariant[severity]
      const Icon = statusDef?.icon
      return (
        <div className='flex w-32 items-center gap-2'>
          <Badge variant={badgeVariant} className='flex items-center gap-1'>
            {Icon && <Icon className='size-3' />}
            {statusDef?.label ?? statusValue}
          </Badge>
        </div>
      )
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    // PRODUCT_CUSTOMIZE: show due_date column only for products where records
    // have expiration/renewal/deadline dates (COI, credentialing, permits,
    // insurance). Remove this column definition for products without dates.
    accessorKey: 'due_date',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Due / Expires' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-4' },
    size: 170,
    cell: ({ row }) => {
      const val = row.getValue('due_date') as string | null | undefined
      const formatted = formatDueDate(val)
      if (!formatted) return <span className='text-muted-foreground'>—</span>
      const isOverdue = formatted.includes('overdue')
      const isSoon =
        !isOverdue && formatted.includes('d)') && parseInt(formatted.split('(')[1]) <= 30
      return (
        <span
          className={
            isOverdue
              ? 'text-destructive font-medium'
              : isSoon
                ? 'text-warning font-medium'
                : 'text-foreground'
          }
        >
          {formatted}
        </span>
      )
    },
  },
  {
    // PRODUCT_CUSTOMIZE: source document link. Keep for any product that
    // extracts data from uploaded documents (PDFs, CSVs). The poller must
    // write the original upload path to records.source_file_path.
    id: 'source',
    header: () => <span className='text-xs text-muted-foreground'>Source</span>,
    cell: ({ row }) => {
      const path = row.original.source_file_path
      if (!path) return null
      return (
        <Button
          variant='ghost'
          size='sm'
          className='h-7 px-2'
          onClick={() => openSourceFile(path)}
        >
          <ExternalLink className='size-3.5 mr-1' />
          View
        </Button>
      )
    },
    enableSorting: false,
    enableHiding: true,
    enableResizing: false,
    size: 90,
  },

  {
    id: 'actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableResizing: false,
    size: 60,
  },
]
