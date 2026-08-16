import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  useCopyRecipe,
  useDeleteRecipe,
  type BaselineIngredient,
  type BaselineRecipe,
} from '../data/baselines'
import { EditIngredientDialog } from './edit-ingredient-dialog'

function formatPrice(v: number | null) {
  return v != null ? `$${Number(v).toFixed(2)}` : '—'
}

export function BaselineCard({ recipe }: { recipe: BaselineRecipe }) {
  const isTemplate = recipe.customer_id === null
  const deleteRecipe = useDeleteRecipe()
  const copyRecipe = useCopyRecipe()
  const [editing, setEditing] = useState<BaselineIngredient | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleCopy = async () => {
    try {
      await copyRecipe.mutateAsync(recipe)
      toast.success('Copied to your baselines — now you can edit it')
    } catch {
      toast.error('Failed to copy baseline')
    }
  }

  return (
    <Card className='h-fit'>
      <CardHeader>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <CardTitle className='truncate'>{recipe.name}</CardTitle>
            {recipe.description && (
              <CardDescription className='truncate'>{recipe.description}</CardDescription>
            )}
          </div>
          <div className='flex shrink-0 items-center gap-1'>
            {isTemplate && <Badge variant='secondary'>Starter</Badge>}
            {!isTemplate && (
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8 text-destructive'
                onClick={() => setConfirmDelete(true)}
                title='Delete baseline'
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            )}
          </div>
        </div>
        {isTemplate && (
          <Button variant='outline' size='sm' className='mt-2' onClick={handleCopy} disabled={copyRecipe.isPending}>
            <Copy className='mr-1.5 h-3.5 w-3.5' />
            Copy to my baselines
          </Button>
        )}
      </CardHeader>
      <CardContent className='space-y-1.5'>
        {recipe.ingredients.length === 0 && (
          <p className='text-sm text-muted-foreground'>No ingredients yet.</p>
        )}
        {recipe.ingredients.map((ing) => (
          <div
            key={ing.id}
            className='flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5'
          >
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium'>{ing.ingredient_name}</p>
              <p className='truncate text-xs text-muted-foreground'>
                {[ing.sku, ing.unit ? `per ${ing.unit}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className='flex shrink-0 items-center gap-1.5'>
              <span className='text-sm font-semibold tabular-nums'>
                {formatPrice(ing.expected_unit_price)}
              </span>
              {!isTemplate && (
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7'
                  onClick={() => setEditing(ing)}
                  title='Correct this ingredient'
                >
                  <Pencil className='h-3.5 w-3.5' />
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      <EditIngredientDialog
        ingredient={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this baseline?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the baseline and its ingredients. Future invoices will build a fresh
              baseline from your next upload.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await deleteRecipe.mutateAsync(recipe.id)
                  toast.success('Baseline deleted')
                } catch {
                  toast.error('Failed to delete baseline')
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
