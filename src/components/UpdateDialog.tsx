import { useToast } from '@rific/toaster'
import { UpdateDialog as SharedUpdateDialog } from '@tastic/hud'

// Thin bridge onto the shared @tastic/hud UpdateDialog, which now owns the useUpdater() instance
// and the themed ConfirmDialog-based prompt end to end — this file used to hand-roll both. Kept as
// its own exported component (rather than importing SharedUpdateDialog directly at the _layout.tsx
// call site) purely so that import doesn't have to change.
export function UpdateDialog() {
  const { error } = useToast()
  return <SharedUpdateDialog onError={(message) => error('Update check failed', message)} />
}
