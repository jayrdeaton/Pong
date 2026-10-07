import { useUpdateErrorToast } from '@rific/toaster'
import type { ViewRotation } from '@tastic/core'
import { BaseSettingsDialog } from '@tastic/hud'
import { useGuide } from '@tastic/hud/guide'

import { release } from '@/constants/release'
import { useSettings } from '@/hooks/useSettings'

export interface SettingsDialogProps {
  visible: boolean
  onDismiss: () => void
  // Live physical-hold rotation (see @tastic/split-screen's getViewRotation) — this dialog renders
  // as a centered Portal modal, unaffected by whichever screen's own FakeLandscapeView wraps its
  // trigger, so it has to rotate its own card content to read right-side-up for whichever way the
  // phone is actually being held. Defaults to 0 (unrotated) for any caller that doesn't track it.
  rotation?: ViewRotation
  // Shows the "How to Play" row that replays the intro. Off by default: the in-game (/game) dialog
  // leaves it out, since opening a full-screen guide over a live match (settings there already
  // pauses play) is disruptive. Home and the loadout, where nothing is running, turn it on.
  showHowToPlay?: boolean
}

// Thin adapter over @tastic/hud's shared settings shell — Pong's own Settings (lock
// orientation, edge guard) is the only thing that varies here; everything else (sound, haptics,
// appearance, update checking) is identical across every app using BaseSettingsDialog and lives
// entirely inside that package now. Keeps this file's own external props stable across its three
// call sites (index.tsx, loadout.tsx, game.tsx): showHowToPlay is optional, so game.tsx's didn't
// change.
export function SettingsDialog({ visible, onDismiss, rotation = 0, showHowToPlay = false }: SettingsDialogProps) {
  const { settings, setSettings } = useSettings()
  const onUpdateError = useUpdateErrorToast()
  const { open: openGuide } = useGuide()
  return <BaseSettingsDialog visible={visible} onDismiss={onDismiss} rotation={rotation} version={release.otaVersion} lockOrientation={settings.lockOrientation} onLockOrientationChange={(value) => setSettings({ lockOrientation: value })} deferBottomEdgeGestures={settings.deferBottomEdgeGestures} onDeferBottomEdgeGestures={(value) => setSettings({ deferBottomEdgeGestures: value })} onUpdateError={onUpdateError} onShowHowToPlay={showHowToPlay ? openGuide : undefined} />
}
