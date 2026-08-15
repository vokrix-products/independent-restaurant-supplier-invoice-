import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateIngredient, type BaselineIngredient } from '../data/baselines'

interface Props {
  ingredient: BaselineIngredient | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditIngredientDialog({ ingredient, open, onOpenChange }: Props) {
  const updateIngredient = useUpdateIngredient()
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')

  useEffect(() => {
    if (!ingredient) return
    setName(ingredient.ingredient_name)
    setAliases((ingredient.aliases ?? []).join(', '))
    setSku(ingredient.sku ?? '')
    setUnit(ingredient.unit ?? '')
    setQuantity(ingredient.quantity != null ? String(ingredient.quantity) : '')
    setPrice(ingredient.expected_unit_price != null ? String(ingredient.expected_unit_price) : '')
  }, [ingredient])

  const handleSave = async () => {
    if (!ingredient) return
    const qty = quantity ? Number(quantity) : 0
    const p = price ? Number(price) : null
    if (Number.isNaN(qty) || (p != null && Number.isNaN(p))) {
      toast.error('Quantity and price must be numbers')
      return
    }
    try {
      await updateIngredient.mutateAsync({
        id: ingredient.id,
        patch: {
          ingredient_name: name.trim(),
          aliases: aliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          sku: sku.trim() || null,
          unit: unit.trim() || null,
          quantity: qty,
          expected_unit_price: p,
        },
      })
      toast.success('Ingredient updated')
      onOpenChange(false)
    } catch {
      toast.error('Failed to update ingredient')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Correct ingredient</DialogTitle>
          <DialogDescription>
            Fix the name, SKU or expected price. Changes apply to your baseline only.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-3 py-2'>
          <div className='grid gap-1.5'>
            <Label htmlFor='ing-name'>Ingredient name</Label>
            <Input id='ing-name' value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='ing-aliases'>Aliases (comma separated)</Label>
            <Input id='ing-aliases' value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder='e.g. beef, ground chuck' />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-1.5'>
              <Label htmlFor='ing-sku'>SKU</Label>
              <Input id='ing-sku' value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='ing-unit'>Unit</Label>
              <Input id='ing-unit' value={unit} onChange={(e) => setUnit(e.target.value)} placeholder='lb, kg, each' />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-1.5'>
              <Label htmlFor='ing-qty'>Quantity</Label>
              <Input id='ing-qty' type='number' value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='ing-price'>Expected unit price ($)</Label>
              <Input id='ing-price' type='number' step='0.01' value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateIngredient.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
