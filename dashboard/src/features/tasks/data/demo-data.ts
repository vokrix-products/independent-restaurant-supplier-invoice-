import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, PRODUCT_ID } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

// Demo records are tagged with this source path so "Clear demo" can remove
// exactly the demo set and never touch the customer's own uploads.
export const DEMO_SOURCE_PATH = 'demo://vokrix-sample-invoice'

interface DemoRow {
  title: string
  status: string
  due_date: string | null
  details: Record<string, unknown>
}

// Realistic sample: 8 line items across 3 suppliers, priced against the
// recipe_ingredients baselines in the DB (spinach 3.25, tomatoes 4.00,
// peppers 0.95, beef 4.25, chicken 2.95, salmon 2.50, shrimp 11.20, scallops 19.00).
const DEMO_ROWS: DemoRow[] = [
  {
    title: 'Blue Ridge Produce Co.',
    status: 'critical:critical',
    due_date: '2026-08-25',
    details: {
      supplier_name: 'Blue Ridge Produce Co.',
      invoice_number: 'INV-8451',
      invoice_date: '2026-08-05',
      due_date: '2026-08-25',
      description: 'Organic Baby Spinach',
      sku: 'BRP-1001',
      unit: 'each',
      quantity: 24,
      unit_price: 3.9,
      extended_total: 93.6,
      gl_category: 'Produce',
      baseline_price: 3.25,
      price_change_pct: '20.0',
      matched_ingredient: 'Baby Spinach',
      matched_recipe: 'Margherita Pizza',
      recipe_impact_pct: '12.0',
      severity: 'critical',
    },
  },
  {
    title: 'Blue Ridge Produce Co.',
    status: 'critical:critical',
    due_date: '2026-08-25',
    details: {
      supplier_name: 'Blue Ridge Produce Co.',
      invoice_number: 'INV-8451',
      invoice_date: '2026-08-05',
      due_date: '2026-08-25',
      description: 'Roma Tomatoes',
      sku: 'BRP-1002',
      unit: 'each',
      quantity: 40,
      unit_price: 4.6,
      extended_total: 184.0,
      gl_category: 'Produce',
      baseline_price: 4.0,
      price_change_pct: '15.0',
      matched_ingredient: 'Roma Tomatoes',
      matched_recipe: 'Margherita Pizza',
      recipe_impact_pct: '9.0',
      severity: 'critical',
    },
  },
  {
    title: 'Blue Ridge Produce Co.',
    status: 'critical:critical',
    due_date: '2026-08-25',
    details: {
      supplier_name: 'Blue Ridge Produce Co.',
      invoice_number: 'INV-8451',
      invoice_date: '2026-08-05',
      due_date: '2026-08-25',
      description: 'Red Bell Peppers',
      sku: 'BRP-1003',
      unit: 'each',
      quantity: 30,
      unit_price: 1.1,
      extended_total: 33.0,
      gl_category: 'Produce',
      baseline_price: 0.95,
      price_change_pct: '15.8',
      matched_ingredient: 'Red Bell Peppers',
      matched_recipe: 'Classic Burger',
      recipe_impact_pct: '7.5',
      severity: 'critical',
    },
  },
  {
    title: 'Great Lakes Foodservice',
    status: 'flagged:warning',
    due_date: '2026-08-27',
    details: {
      supplier_name: 'Great Lakes Foodservice',
      invoice_number: 'INV-3320',
      invoice_date: '2026-08-06',
      due_date: '2026-08-27',
      description: 'Ground Beef 80/20',
      sku: 'GLS-2001',
      unit: 'lb',
      quantity: 50,
      unit_price: 4.8,
      extended_total: 240.0,
      gl_category: 'Meat & Poultry',
      baseline_price: 4.25,
      price_change_pct: '12.9',
      matched_ingredient: 'Ground Beef 80/20',
      matched_recipe: 'Classic Burger',
      recipe_impact_pct: '12.9',
      severity: 'flagged',
    },
  },
  {
    title: 'Great Lakes Foodservice',
    status: 'flagged:warning',
    due_date: '2026-08-27',
    details: {
      supplier_name: 'Great Lakes Foodservice',
      invoice_number: 'INV-3320',
      invoice_date: '2026-08-06',
      due_date: '2026-08-27',
      description: 'Chicken Thighs',
      sku: 'GLS-2002',
      unit: 'lb',
      quantity: 60,
      unit_price: 3.35,
      extended_total: 201.0,
      gl_category: 'Meat & Poultry',
      baseline_price: 2.95,
      price_change_pct: '13.6',
      matched_ingredient: 'Chicken Thighs',
      matched_recipe: 'Grilled Chicken Breast',
      recipe_impact_pct: '13.6',
      severity: 'flagged',
    },
  },
  {
    title: 'Great Lakes Foodservice',
    status: 'flagged:warning',
    due_date: '2026-08-27',
    details: {
      supplier_name: 'Great Lakes Foodservice',
      invoice_number: 'INV-3320',
      invoice_date: '2026-08-06',
      due_date: '2026-08-27',
      description: 'Fresh Salmon Fillet',
      sku: 'GLS-2003',
      unit: 'lb',
      quantity: 25,
      unit_price: 2.75,
      extended_total: 68.75,
      gl_category: 'Seafood',
      baseline_price: 2.5,
      price_change_pct: '10.0',
      matched_ingredient: 'Fresh Salmon Fillet',
      matched_recipe: null,
      recipe_impact_pct: null,
      severity: 'flagged',
    },
  },
  {
    title: 'East Coast Seafood Direct',
    status: 'flagged:warning',
    due_date: '2026-08-28',
    details: {
      supplier_name: 'East Coast Seafood Direct',
      invoice_number: 'INV-2214',
      invoice_date: '2026-08-07',
      due_date: '2026-08-28',
      description: 'Jumbo Shrimp (16-20)',
      sku: 'ECS-3001',
      unit: 'lb',
      quantity: 20,
      unit_price: 12.1,
      extended_total: 242.0,
      gl_category: 'Seafood',
      baseline_price: 11.2,
      price_change_pct: '8.0',
      matched_ingredient: 'Jumbo Shrimp (16-20)',
      matched_recipe: 'Garlic Shrimp Scampi',
      recipe_impact_pct: '8.0',
      severity: 'flagged',
    },
  },
  {
    title: 'East Coast Seafood Direct',
    status: 'valid:good',
    due_date: '2026-08-28',
    details: {
      supplier_name: 'East Coast Seafood Direct',
      invoice_number: 'INV-2214',
      invoice_date: '2026-08-07',
      due_date: '2026-08-28',
      description: 'Sea Scallops U10',
      sku: 'ECS-3002',
      unit: 'lb',
      quantity: 15,
      unit_price: 17.5,
      extended_total: 262.5,
      gl_category: 'Seafood',
      baseline_price: 19.0,
      price_change_pct: '-7.9',
      matched_ingredient: 'Sea Scallops U10',
      matched_recipe: 'Seared Sea Scallops',
      recipe_impact_pct: '-7.9',
      severity: 'valid',
    },
  },
]

async function writeAudit(action: string, userId: string) {
  try {
    await supabase.from('audit_log').insert({
      product_id: PRODUCT_ID,
      customer_id: userId,
      action,
      entity: 'demo',
      entity_id: DEMO_SOURCE_PATH,
    })
  } catch {}
}

function invalidateDemoQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['tasks', PRODUCT_ID] })
  queryClient.invalidateQueries({ queryKey: ['dashboard-stats', PRODUCT_ID] })
}

export function useLoadDemoData() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')
      await supabase
        .from('records')
        .delete()
        .eq('source_file_path', DEMO_SOURCE_PATH)
        .eq('product_id', PRODUCT_ID)
      const payload = DEMO_ROWS.map((row) => ({
        title: row.title,
        status: row.status,
        product_id: PRODUCT_ID,
        customer_id: user.id,
        source_file_path: DEMO_SOURCE_PATH,
        due_date: row.due_date,
        details: row.details,
      }))
      const { error } = await supabase.from('records').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateDemoQueries(queryClient)
      if (user?.id) void writeAudit('demo.loaded', user.id)
    },
  })
}

export function useRemoveDemoData() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('records')
        .delete()
        .eq('source_file_path', DEMO_SOURCE_PATH)
        .eq('product_id', PRODUCT_ID)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateDemoQueries(queryClient)
      if (user?.id) void writeAudit('demo.removed', user.id)
    },
  })
}
