import { Provider as AutoPaperProvider, themeActions, type ThemeSettings } from '@rific/auto-paper'
import * as SplashScreen from 'expo-splash-screen'
import { ReactNode, useCallback } from 'react'
import { shallowEqual, useDispatch, useSelector } from 'react-redux'

import type { RootState } from '@/redux/store'
import { markSplashReady } from '@/utils/splashGate'

SplashScreen.preventAutoHideAsync()
// iOS defaults `fade` to false (Android always fades regardless of this flag), so without this the
// splash view is just yanked off screen the instant every gate reports ready.
SplashScreen.setOptions({ fade: true, duration: 400 })

interface Props {
  children: ReactNode
}

export function Theme({ children }: Props) {
  const settings = useSelector((state: RootState) => state.theme, shallowEqual)
  const dispatch = useDispatch()
  // Fully persists on every call now — appearance AND the color triad alike — rather than the old
  // AsyncStorage version's narrowed-to-appearance-only onChange. That narrowing existed because a
  // generic onChange fires on every set() regardless of caller, so it couldn't tell a guest/CPU
  // recolor (persist-worthy) apart from a profile seat's transient live-theme repaint (must not
  // persist as a "remembered" color). That ambiguity is now resolved one level up: seatColorsSlice's
  // lastGuestColor/lastCpuColor are the real, dedicated memory for "what to remember for next
  // time," resolved independently in loadout.tsx — so this slice's own color is just a boot-seed
  // placeholder for the Provider below, never read back as an input to that resolution. Persisting
  // it unconditionally, transient repaints included, is therefore provably harmless.
  const onChange = useCallback((next: ThemeSettings) => dispatch(themeActions.initialize(next)), [dispatch])
  // One-shot, not a boolean gate — Providers.tsx's PersistGate already blocks this component's own
  // mount until redux-persist has rehydrated, so `settings` above is already a real, resolved value
  // (persisted, or the theme reducer's own default) from this component's very first render. There's
  // nothing left here to gate mounting on the way the old `settings !== null` AsyncStorage read did;
  // this only marks auto-paper's own Provider as internally ready.
  const onReady = useCallback(() => markSplashReady('theme'), [])

  return (
    <AutoPaperProvider initialValue={settings} onChange={onChange} onReady={onReady}>
      {children}
    </AutoPaperProvider>
  )
}
