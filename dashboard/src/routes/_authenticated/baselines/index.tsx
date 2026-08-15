import { createFileRoute } from '@tanstack/react-router'
import { Baselines } from '@/features/baselines'

export const Route = createFileRoute('/_authenticated/baselines/')({
  component: Baselines,
})
