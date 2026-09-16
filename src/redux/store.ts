import AsyncStorage from '@react-native-async-storage/async-storage'
import { combineReducers, configureStore, type Middleware } from '@reduxjs/toolkit'
import { createThemeReducer, getThirdColor } from '@rific/auto-paper'
import { defaultSoundSettings, hapticReducer, soundReducer, type SoundSettings } from '@rific/feedback-press'
import { profilesReducer } from '@tastic/profile'
import { FLUSH, PAUSE, PERSIST, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE } from 'redux-persist'

import { DEFAULT_P1_COLOR, DEFAULT_P2_COLOR } from '@/constants/game'

import profileSelection from './profileSelectionSlice'
import seatColors from './seatColorsSlice'

const hasError = (action: unknown): action is { error?: unknown } => typeof action === 'object' && action !== null && 'error' in action && Boolean(action.error)

const errorMiddleware: Middleware = () => (next) => (action) => {
  if (!hasError(action)) return next(action)
  return action
}

// @rific/feedback-press's own soundReducer defaults `enabled` to true unconditionally (that
// default isn't published with the dev-only override yet). Wrap it so a fresh install with no
// persisted preference (redux-persist finds nothing in AsyncStorage for the `sound` key) defaults
// muted in dev/simulator builds so Claude/local testing doesn't blast audio; production builds
// still default to sound on. All actual action handling still delegates to the package's reducer.
const initialSoundSettings: SoundSettings = { ...defaultSoundSettings, enabled: !__DEV__ }
const appSoundReducer = (state: SoundSettings = initialSoundSettings, action: { type: string }): SoundSettings => soundReducer(state, action)

// Seeded with Pong's own actual default P1/P2 colors (constants/game.ts) rather than auto-paper's
// generic single-seed default, so a fresh install's very first paint already shows the right
// colors instead of flashing a placeholder. appearance is likewise pinned to 'dark' rather than
// left at the package's own 'system' default — Theme.tsx's old AsyncStorage-backed version already
// defaulted a fresh install to dark, and this preserves that exact behavior. This slice's own color
// is just a boot-seed placeholder for the live theme (Theme.tsx) — the real "what to remember for
// next time" memory is seatColorsSlice's lastGuestColor/lastCpuColor below, so this being persisted
// unconditionally on every theme change (including a profile seat's transient repaint) is harmless;
// it's never read back as an input to guest/CPU/profile color resolution (see loadout.tsx).
const themeReducer = createThemeReducer({
  appearance: 'dark',
  color: { primary: DEFAULT_P1_COLOR, secondary: DEFAULT_P2_COLOR, tertiary: getThirdColor(DEFAULT_P1_COLOR, DEFAULT_P2_COLOR) }
})

const rootReducer = combineReducers({
  theme: themeReducer,
  haptic: hapticReducer,
  sound: appSoundReducer,
  // The shared App Group roster (see @tastic/profile's resolveInitialProfiles/
  // useSharedProfilesSync, wired in hooks/useProfiles.tsx) is layered on top of this as a separate
  // sync target — this slice persisting normally via redux-persist, same as every other key here,
  // is what gives it local-fallback behavior for the platforms/builds where the shared store isn't
  // available, with no separate hand-rolled AsyncStorage path needed for that case.
  profiles: profilesReducer,
  profileSelection,
  seatColors
})

const persistConfig = {
  key: 'root',
  storage: AsyncStorage
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  middleware: (getDefaultMiddleware) => {
    const defaultMiddleware = getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER]
      }
    })
    return defaultMiddleware.concat(errorMiddleware)
  },
  reducer: persistedReducer
})

export const persistor = persistStore(store)
export type RootState = ReturnType<typeof rootReducer>
export type AppDispatch = typeof store.dispatch
