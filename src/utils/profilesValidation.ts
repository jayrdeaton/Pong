import { isValidProfile, isValidTag, MAX_PROFILE_NAME_LENGTH, MAX_TAG_LENGTH, Profile } from '@tastic/profile'

import { Player } from '@/types'

// Pulled out of hooks/useProfiles.tsx specifically so it's testable without dragging in
// @react-native-async-storage/async-storage, which throws at import time under Jest's plain Node
// environment (its native module is never linked there) — mirrors gameSettingsValidation.ts.
//
// Unlike BoxHockey's own version of this file, there's no extra field to compose in here: Pong has
// no per-seat control scheme (or anything else) to extend the package's base Profile type with, so
// this just re-exports the package's own isValidProfile/isValidTag unmodified rather than wrapping
// them with an additional field check.

export { isValidProfile, isValidTag, MAX_PROFILE_NAME_LENGTH, MAX_TAG_LENGTH }

// What this app actually persists locally now. `localBase` is only read/written when the shared
// App Group store is unavailable (see isSharedProfileStoreAvailable in useProfiles.tsx) — this
// app's own complete fallback roster, in exactly the shape a solo (non-shared) install would have
// used. `lastSelected` is always local — which profile P1/P2 last picked is naturally a per-app
// thing, not a cross-app one.
export interface LocalProfilesState {
  localBase: Profile[]
  lastSelected: Record<Player, string | null>
}

export const DEFAULT_LOCAL_PROFILES_STATE: LocalProfilesState = {
  localBase: [],
  lastSelected: { 1: null, 2: null }
}

// Pre-shared-roster storage shape — a single flat `profiles: Profile[]`, the only shape this app
// ever wrote under STORAGE_KEY before this feature existed. Kept only so
// migrateLegacyProfilesState below can upgrade an already-installed app's existing saved roster
// into the new shape instead of silently losing it the first time this version loads.
interface LegacyProfilesState {
  profiles: Profile[]
  lastSelected: Record<Player, string | null>
}

function isValidSeatProfileId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0)
}

function isValidLastSelected(value: unknown): value is Record<Player, string | null> {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<Record<Player, string | null>>
  return isValidSeatProfileId(v[1]) && isValidSeatProfileId(v[2])
}

// All-or-nothing, matching gameSettingsValidation.ts's isValidSettings: one malformed entry
// anywhere invalidates the whole blob rather than silently dropping just that entry.
export function isValidLocalProfilesState(value: unknown): value is LocalProfilesState {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<LocalProfilesState>
  return Array.isArray(v.localBase) && v.localBase.every(isValidProfile) && isValidLastSelected(v.lastSelected)
}

function isValidLegacyProfilesState(value: unknown): value is LegacyProfilesState {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<LegacyProfilesState>
  return Array.isArray(v.profiles) && v.profiles.every(isValidProfile) && isValidLastSelected(v.lastSelected)
}

// One-time upgrade path: an already-installed app's pre-shared-roster save (see
// LegacyProfilesState above) has every profile under the same storage key this version now
// expects a LocalProfilesState at. Rather than let isValidLocalProfilesState simply reject that
// old shape (and silently drop every saved profile the first time this version loads), this
// renames `profiles` to `localBase` — the two are otherwise identical, since Pong has no extra
// per-profile field to split out the way BoxHockey's controlScheme is. Returns null for anything
// that's neither a valid current nor a valid legacy blob (corrupt/unrecognized), same "keep
// defaults" fallback the caller already had for a corrupt blob.
export function migrateLegacyProfilesState(value: unknown): LocalProfilesState | null {
  if (!isValidLegacyProfilesState(value)) return null
  return { localBase: value.profiles, lastSelected: value.lastSelected }
}
