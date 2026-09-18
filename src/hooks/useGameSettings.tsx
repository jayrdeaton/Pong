import { createGameSettingsProvider } from '@tastic/core'

import { GameSettings } from '@/types'
import { DEFAULT_SETTINGS, isValidSettings } from '@/utils/gameSettingsValidation'

// Single source of truth for game settings, mounted once in _layout.tsx. Every screen reads this
// same live instance via useGameSettings() below rather than each keeping its own AsyncStorage-
// backed copy — expo-router keeps prior screens mounted underneath when navigating forward, so a
// per-screen copy would go stale the moment another still-mounted screen changed a setting, and
// could even clobber that change by later writing its own stale snapshot back to storage. Mirrors
// Theme.tsx's own Provider pattern for the same reason.
//
// This app's own inline `useSplashReady('settings', loaded)` call (formerly here, alongside the
// `loaded` flag) was dropped as part of this migration — confirmed redundant, not silently lost:
// _layout.tsx already wraps this provider's own children in `<SplashGate gate='settings'
// ready={loaded}>`, and that Gate calls useReady (== useSplashReady bound to this app's gate
// instance) internally itself (see @rific/splash-gate's own Gate implementation). The factory
// deliberately doesn't reproduce that call either, for the same reason — it's app-level
// splash-gate wiring, not a property of the settings pattern itself.
export const { GameSettingsProvider, useGameSettings } = createGameSettingsProvider<GameSettings>({
  storageKey: 'pong.settings',
  defaultSettings: DEFAULT_SETTINGS,
  isValidSettings
})
