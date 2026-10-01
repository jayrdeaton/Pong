import AsyncStorage from '@react-native-async-storage/async-storage'
import { combineReducers, configureStore, type Middleware } from '@reduxjs/toolkit'
import { createThemeReducer, getThirdColor } from '@rific/auto-paper'
import { defaultSoundSettings, hapticReducer, soundReducer, type SoundSettings } from '@rific/feedback-press'
import { createReturningPlayerMigrate } from '@tastic/hud/guide'
import { profilesReducer } from '@tastic/profile'
import { FLUSH, PAUSE, PERSIST, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE } from 'redux-persist'

import { DEFAULT_P1_COLOR, DEFAULT_P2_COLOR } from '@/constants/game'

import guide, { LEGACY_STORAGE_KEYS } from './guideSlice'
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
  seatColors,
  // Which version of the how-to-play flow this player has finished or skipped. Its own key rather
  // than a GameSettings field, so it survives 'Reset All Stats' (achievements.tsx, which only clears
  // useGameStats' own storage) and never touches gameSettingsValidation's strict isValidSettings.
  // Persisted like every other key here (the persistConfig below has no whitelist/blacklist). See
  // guideSlice.ts's own doc.
  guide
})

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  // redux-persist defaults `timeout` to 5000ms: a failsafe setTimeout scheduled on every PERSIST
  // dispatch to force-resolve rehydrate if storage never responds. It's never cleared once
  // rehydrate resolves normally (only guarded by an internal `_sealed` flag), so it sits as a
  // pending timer for up to 5s after every store creation — under Jest that's a real open handle
  // ("A worker process has failed to exit gracefully"), confirmed via `jest --detectOpenHandles`
  // pointing straight at persistReducer.js's setTimeout. Disabling it (falsy timeout skips the
  // setTimeout call entirely) is redux-persist's own documented way to opt out; AsyncStorage reads
  // failing to ever resolve at all isn't a failure mode worth a 5s failsafe for.
  timeout: 0,
  // Grandfathers players from the shipped pre-redux build past the how-to-play guide: no root store
  // yet, but one of that build's own keys present, means "played before", not a fresh install. A root
  // store that already exists passes through unchanged. See LEGACY_STORAGE_KEYS (guideSlice.ts).
  migrate: createReturningPlayerMigrate(AsyncStorage, LEGACY_STORAGE_KEYS)
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
