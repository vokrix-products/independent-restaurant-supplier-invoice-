import { Database, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTasks } from '../data/tasks'
import { DEMO_SOURCE_PATH, useLoadDemoData, useRemoveDemoData } from '../data/demo-data'

export function DemoDataButtons() {
  const { data: tasks } = useTasks()
  const hasDemo = (tasks ?? []).some((t) => t.source_file_path === DEMO_SOURCE_PATH)
  const loadDemo = useLoadDemoData()
  const removeDemo = useRemoveDemoData()

  if (hasDemo) {
    return (
      <div className='flex flex-col items-end gap-1'>
        <Button
          variant='outline'
          className='space-x-1'
          onClick={() => removeDemo.mutate()}
          disabled={removeDemo.isPending}
        >
          {removeDemo.isPending ? (
            <Loader2 className='animate-spin' size={16} />
          ) : (
            <Trash2 size={16} />
          )}
          <span>Clear demo</span>
        </Button>
        {removeDemo.isError && (
          <span className='text-xs text-destructive'>Failed to clear demo</span>
        )}
      </div>
    )
  }

  return (
    <div className='flex flex-col items-end gap-1'>
      <Button
        variant='outline'
        className='space-x-1'
        onClick={() => loadDemo.mutate()}
        disabled={loadDemo.isPending}
      >
        {loadDemo.isPending ? (
          <Loader2 className='animate-spin' size={16} />
        ) : (
          <Database size={16} />
        )}
        <span>Load demo data</span>
      </Button>
      {loadDemo.isError && (
        <span className='text-xs text-destructive'>Failed to load demo</span>
      )}
    </div>
  )
}
