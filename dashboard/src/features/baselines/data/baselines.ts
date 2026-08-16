import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, PRODUCT_ID } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

export interface BaselineIngredient {
  id: string
  recipe_id: string
  ingredient_name: string
  aliases: string[]
  sku: string | null
  unit: string | null
  quantity: number
  expected_unit_price: number | null
}

export interface BaselineRecipe {
  id: string
  name: string
  description: string | null
  customer_id: string | null
  ingredients: BaselineIngredient[]
}

async function writeAudit(action: string, entity: string, entityId: string, userId: string) {
  try {
    await supabase.from('audit_log').insert({
      product_id: PRODUCT_ID,
      customer_id: userId,
      action,
      entity,
      entity_id: entityId,
    })
  } catch {}
}

export function useBaselines() {
  const user = useAuthStore((s) => s.auth.user)
  return useQuery({
    queryKey: ['baselines', PRODUCT_ID],
    enabled: !!user,
    queryFn: async () => {
      const { data: recipes, error: recipeError } = await supabase
        .from('recipes')
        .select('id, name, description, customer_id')
        .eq('product_id', PRODUCT_ID)
        .order('created_at', { ascending: true })
      if (recipeError) throw recipeError

      const { data: ingredients, error: ingError } = await supabase
        .from('recipe_ingredients')
        .select('id, recipe_id, ingredient_name, aliases, sku, unit, quantity, expected_unit_price')
      if (ingError) throw ingError

      const grouped = (recipes ?? []).map((r) => ({
        ...r,
        ingredients: (ingredients ?? []).filter((i) => i.recipe_id === r.id),
      }))
      return grouped as BaselineRecipe[]
    },
  })
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.auth.user)
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<Omit<BaselineIngredient, 'id' | 'recipe_id'>>
    }) => {
      const { error } = await supabase
        .from('recipe_ingredients')
        .update(patch as Record<string, unknown>)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['baselines', PRODUCT_ID] })
      if (user?.id) void writeAudit('baseline.ingredient_updated', 'recipe_ingredient', vars.id, user.id)
    },
  })
}

export function useCopyRecipe() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.auth.user)
  return useMutation({
    mutationFn: async (recipe: BaselineRecipe) => {
      const userId = user?.id
      if (!userId) throw new Error('Not signed in')

      const { data: newRecipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          product_id: PRODUCT_ID,
          customer_id: userId,
          name: recipe.name,
          description: recipe.description,
        })
        .select('id')
        .single()
      if (recipeError) throw recipeError

      if (recipe.ingredients.length > 0) {
        const { error: ingError } = await supabase.from('recipe_ingredients').insert(
          recipe.ingredients.map((ing) => ({
            recipe_id: newRecipe.id,
            customer_id: userId,
            ingredient_name: ing.ingredient_name,
            aliases: ing.aliases ?? [],
            sku: ing.sku,
            unit: ing.unit,
            quantity: ing.quantity ?? 1,
            expected_unit_price: ing.expected_unit_price,
          })),
        )
        if (ingError) throw ingError
      }
      return newRecipe.id
    },
    onSuccess: (id, recipe) => {
      queryClient.invalidateQueries({ queryKey: ['baselines', PRODUCT_ID] })
      if (user?.id) void writeAudit('baseline.copied', 'recipe', id, user.id)
    },
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.auth.user)
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recipes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['baselines', PRODUCT_ID] })
      if (user?.id) void writeAudit('baseline.deleted', 'recipe', id, user.id)
    },
  })
}
