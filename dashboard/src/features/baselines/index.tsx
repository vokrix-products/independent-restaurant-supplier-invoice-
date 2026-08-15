import { Header } from '@/components/layout/header'
import { NotificationsBell } from '@/components/notifications-bell'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { NotebookText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useBaselines } from './data/baselines'
import { BaselineCard } from './components/baseline-card'

export function Baselines() {
  const { data, isLoading, error } = useBaselines()

  return (
    <>
      <Header>
        <Search />
        <ThemeSwitch />
        <NotificationsBell />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Baselines</h2>
            <p className='text-muted-foreground'>
              Your supplier baselines — auto-created from your first invoice upload. Tap an
              ingredient to correct it.
            </p>
          </div>
        </div>

        {isLoading && (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className='h-44 w-full rounded-xl' />
            ))}
          </div>
        )}

        {error && <p className='text-destructive'>Failed to load: {error.message}</p>}

        {!isLoading && !error && (!data || data.length === 0) && (
          <div className='flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center'>
            <NotebookText className='h-10 w-10 text-muted-foreground/40' />
            <p className='text-sm font-medium'>No baselines yet</p>
            <p className='max-w-sm text-sm text-muted-foreground'>
              Upload your first supplier invoice — we'll build your supplier baselines
              automatically from the line items. No typing required.
            </p>
          </div>
        )}

        {!isLoading && !error && data && data.length > 0 && (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {data.map((recipe) => (
              <BaselineCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}
      </Main>
    </>
  )
}
