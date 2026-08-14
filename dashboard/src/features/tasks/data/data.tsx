import { TriangleAlert, CircleCheckBig, Clock, ShieldAlert, PackageX, Eye, CalendarX2, Ban } from 'lucide-react'

export const labels = [
  {
    value: 'bug',
    label: 'Bug',
  },
  {
    value: 'feature',
    label: 'Feature',
  },
  {
    value: 'documentation',
    label: 'Documentation',
  },
]

// Severity tiers drive badge color. Every status maps to exactly one tier:
//   critical -> red (destructive)   e.g. expired, denied, failed
//   warning  -> amber (warning)     e.g. expiring soon, needs review
//   good     -> green (success)     e.g. valid, approved, done
//   neutral  -> gray (secondary)    e.g. pending, queued, n/a
export type Severity = 'critical' | 'warning' | 'good' | 'neutral'

export const severityToBadgeVariant: Record<Severity, 'destructive' | 'warning' | 'success' | 'secondary'> = {
  critical: 'destructive',
  warning: 'warning',
  good: 'success',
  neutral: 'secondary',
}

// The 8 statuses the poller writes to records.status for this product:
//   unprocessed:info     - ingested, awaiting variance decision
//   valid:good           - price within tolerance (<5%)
//   flagged:warning      - price increase >=5% (needs attention)
//   critical:critical    - price increase >=10% (immediate alert)
//   missing:info         - line item has no sku/description to compare
//   needs_approval:review- matched to a recipe ingredient with no baseline price
//   expired:info         - invoice due date has passed
//   ignored:info         - intentionally skipped / not actionable
export const statuses: {
  label: string
  value: string
  icon: typeof TriangleAlert
  severity: Severity
}[] = [
  { label: 'Unprocessed', value: 'unprocessed:info', icon: Clock, severity: 'neutral' as Severity },
  { label: 'Valid', value: 'valid:good', icon: CircleCheckBig, severity: 'good' as Severity },
  { label: 'Price Flagged', value: 'flagged:warning', icon: TriangleAlert, severity: 'warning' as Severity },
  { label: 'Price Critical', value: 'critical:critical', icon: ShieldAlert, severity: 'critical' as Severity },
  { label: 'Missing Data', value: 'missing:info', icon: PackageX, severity: 'warning' as Severity },
  { label: 'Needs Approval', value: 'needs_approval:review', icon: Eye, severity: 'warning' as Severity },
  { label: 'Expired', value: 'expired:info', icon: CalendarX2, severity: 'critical' as Severity },
  { label: 'Ignored', value: 'ignored:info', icon: Ban, severity: 'neutral' as Severity },
]
