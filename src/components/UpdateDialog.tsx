import { useUpdateErrorToast } from '@rific/toaster'
import { UpdateDialog as SharedUpdateDialog } from '@tastic/hud'

// Thin bridge onto the shared @tastic/hud UpdateDialog, which now owns the useUpdater() instance
// and the themed ConfirmDialog-based prompt end to end - this file used to hand-roll both. Kept as
// its own exported component (rather than importing SharedUpdateDialog directly at the _layout.tsx
// call site) purely so that import doesn't have to change. The hand-rolled `(message) =>
// error('Update check failed', message)` closure this used to pass as onError was identical to
// every sibling app's own copy of the same one-liner - now @rific/toaster's own
// useUpdateErrorToast() directly.
export function UpdateDialog() {
  const onError = useUpdateErrorToast()
  return <SharedUpdateDialog onError={onError} />
}
