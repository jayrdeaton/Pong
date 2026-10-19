import { createGuideSlice } from '@tastic/hud/guide'

import { GUIDE_VERSION } from '@/constants/guide'

// Thin binding over @tastic/hud/guide's createGuideSlice factory: the persisted "which version of the
// how-to-play flow has this player finished or skipped" flag. A fresh install starts at 0 (the guide
// auto-shows on Home); a player who already had the app before this slice existed is stamped with
// GUIDE_VERSION on their first rehydrate, so an over-the-air update never greets them with a "how to
// play" screen (see the factory's own doc for how it tells the two apart, and LEGACY_STORAGE_KEYS
// below for the players it can't tell apart on its own). Mounted under `guide` in store.ts (that key
// is what the REHYDRATE payload is read from), and store.ts's persistConfig key is 'root', the
// factory's default persistKey, so neither option needs passing here.
const slice = createGuideSlice({ currentVersion: GUIDE_VERSION })

export const guideActions = slice.actions
export const selectGuideVersionSeen = slice.selectVersionSeen
export default slice.reducer

// The AsyncStorage keys Pong's last shipped build wrote: f5b01f5 (otaVersion 3, 2026-09-05; the
// otaVersion 1 and 2 commits before it, e3012f5 and ca60277, wrote the same set). That build had no
// redux-persist root store (store.ts first landed in c98bafb, 2026-09-15), so its players have no
// root store and look like a fresh install to createGuideSlice. store.ts's migrate (hud's
// createReturningPlayerMigrate) reads these instead: any one present means "played an earlier
// build", and that player is grandfathered past the guide.
//
// A historical record, so literals, not today's constants: this list must not change if today's code
// renames or drops a key. Where each came from at f5b01f5:
// - pong.settings: hooks/useGameSettings.tsx's STORAGE_KEY
// - pong.profiles: hooks/useProfiles.tsx's STORAGE_KEY
// - pong.stats, pong.achievements: hooks/useGameStats.tsx's namespace 'pong' passed to
//   @tastic/achievements@0.1.1's useAchievements, which builds `${namespace}.stats`/`.achievements`
// - pong.cpuColor: components/Theme.tsx's CPU_COLOR_STORAGE_KEY, written by app/loadout.tsx
// - airhockey.*: that build really wrote these under AirHockey's prefix, a copy-paste leftover from
//   AirHockey's code. airhockey.appearance is components/Theme.tsx's APPEARANCE_STORAGE_KEY;
//   airhockey.playerColors is Theme.tsx's PLAYER_COLORS_STORAGE_KEY, written by app/loadout.tsx;
//   airhockey.vibrate and airhockey.sound are components/Feedback.tsx's. AirHockey's own keys can't
//   cause a false match: each app's AsyncStorage is its own sandbox on a device. On the web, where
//   every Tastic game shares games.infinitetoken.com's localStorage, only the pre-redux builds of Pong
//   or AirHockey ever wrote these dotted keys, and neither game had a web deployment then.
//
// Today's build writes none of these at all (settings, stats and achievements have lived in the Redux
// store since 2026-10-07), so a fresh install can never be taken for a returning player.
//
// The root store itself moved from persist:root to pong:root on 2026-10-19 (store.ts's keyPrefix: a
// colon, so it can never be one of these dotted keys). persist:root is deliberately not listed: no
// shipped build wrote it, and on the web it is the key every game on that origin used to share, so
// finding it says nothing about this player having played Pong.
export const LEGACY_STORAGE_KEYS = ['pong.achievements', 'pong.cpuColor', 'pong.profiles', 'pong.settings', 'pong.stats', 'airhockey.appearance', 'airhockey.playerColors', 'airhockey.sound', 'airhockey.vibrate'] as const
