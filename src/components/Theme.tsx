import AsyncStorage from '@react-native-async-storage/async-storage'
import { getRgb, getThirdColor, Provider as AutoPaperProvider, ThemeSettings } from '@rific/auto-paper'
import * as SplashScreen from 'expo-splash-screen'
import { ReactNode, useCallback, useEffect, useState } from 'react'

import { useSplashReady } from '@/utils/splashGate'

SplashScreen.preventAutoHideAsync()
// iOS defaults `fade` to false (Android always fades regardless of this flag), so without this the
// splash view is just yanked off screen the instant every gate reports ready.
SplashScreen.setOptions({ fade: true, duration: 400 })

// Prefixed distinctly from BoxHockey's own `boxhockey.*` keys so a device with both games
// installed never cross-contaminates appearance/color settings.
const APPEARANCE_STORAGE_KEY = 'pong.appearance'
// Doubles as /loadout's own "last guest color" slot (see PLAYER_COLORS_STORAGE_KEY's own read
// below vs. that screen's seat-aware writes) — a human seat with no profile selected is exactly
// what this key already meant before profiles/CPU existed, so reusing it needs no third key.
export const PLAYER_COLORS_STORAGE_KEY = 'pong.playerColors'
// /loadout's own slot, independent of the guest one above — CPU only ever plays P2 (see
// utils/gameMode.ts), so this is never keyed per-seat.
export const CPU_COLOR_STORAGE_KEY = 'pong.cpuColor'

export const DEFAULT_P1_COLOR = '#f44336'
export const DEFAULT_P2_COLOR = '#2196f3'

function triadFor(p1: string, p2: string) {
  return { primary: p1, secondary: p2, tertiary: getThirdColor(p1, p2) }
}

export function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && getRgb(value) !== null
}

interface Props {
  children: ReactNode
}

export function Theme({ children }: Props) {
  const [settings, setSettings] = useState<Partial<ThemeSettings> | null>(null)

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(APPEARANCE_STORAGE_KEY), AsyncStorage.getItem(PLAYER_COLORS_STORAGE_KEY)]).then(([storedAppearance, storedColors]) => {
      const appearance = storedAppearance === 'light' || storedAppearance === 'dark' || storedAppearance === 'system' ? storedAppearance : 'dark'

      let p1 = DEFAULT_P1_COLOR
      let p2 = DEFAULT_P2_COLOR
      if (storedColors) {
        try {
          const parsed = JSON.parse(storedColors)
          if (isValidHex(parsed.p1)) p1 = parsed.p1
          if (isValidHex(parsed.p2)) p2 = parsed.p2
        } catch {
          // Corrupt/stale blob — fall back to defaults above.
        }
      }

      setSettings({ appearance, color: triadFor(p1, p2) })
    })
  }, [])

  // Loaded settings gate mounting AutoPaperProvider entirely (rather than mounting it immediately
  // with defaults and patching `initialValue` once the read resolves): AutoPaperProvider's own
  // `settings` state is a lazy useState(() => ...) that only reads `initialValue` on its very first
  // mount, so a changed `initialValue` prop on a later render is silently ignored — persistence
  // would appear to work (this component's own state updates) while the live theme never actually
  // picks it up. Splash stays up for this window regardless (see useSplashReady below), so gating
  // costs nothing visually.
  useSplashReady('theme', settings !== null)

  // Only persists — AutoPaperProvider owns the live settings after mount, and calling setSettings
  // here too would update this parent component while the provider (a child) is rendering.
  //
  // Color is deliberately NOT persisted here anymore, unlike appearance — this fires on every
  // `set()` regardless of caller, so it can't tell a guest/CPU recolor (which should persist) apart
  // from a profile seat's transient live-theme repaint (which must not). /loadout owns writing
  // PLAYER_COLORS_STORAGE_KEY/CPU_COLOR_STORAGE_KEY itself instead, per seat.
  const onChange = useCallback((next: ThemeSettings) => {
    void AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, next.appearance)
  }, [])

  if (!settings) return null

  return (
    <AutoPaperProvider initialValue={settings} onChange={onChange}>
      {children}
    </AutoPaperProvider>
  )
}
