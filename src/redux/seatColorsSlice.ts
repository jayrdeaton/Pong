import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { DEFAULT_P1_COLOR, DEFAULT_P2_COLOR } from '@/constants/game'
import { Player } from '@/types'

// /loadout's own "remember this for next time" memory for guest/CPU seats — independent of the
// `theme` slice's own live color triad (store.ts), which is just a boot-seed placeholder for
// auto-paper's Provider and gets overwritten by every recolor (a profile-selected seat's transient
// repaint included, see loadout.tsx's own focus effect). A profile-selected seat's color always
// comes live from the profile itself, never from here (see loadout.tsx's own p1Profile/p2Profile
// split) — this only ever holds what a GUEST seat, or the CPU seat, last picked for itself. Mirrors
// Snake's own gameSlice lastGuestColor/lastCpuColor fields, just as their own dedicated slice here
// rather than folded into a broader settings/game slice, since Pong has no Redux-backed equivalent
// of that yet (see useGameSettings.tsx — Pong's main game settings are still a separate
// AsyncStorage-backed context, out of scope for this persistence convergence).
export type SeatColorsState = {
  lastGuestColor: Record<Player, string>
  // CPU only ever plays P2 (see utils/gameMode.ts), so this is never keyed per-seat — same
  // reasoning the old CPU_COLOR_STORAGE_KEY (Theme.tsx) used to carry in its own doc comment.
  lastCpuColor: string
}

export const defaultSeatColorsState: SeatColorsState = {
  lastGuestColor: { 1: DEFAULT_P1_COLOR, 2: DEFAULT_P2_COLOR },
  lastCpuColor: DEFAULT_P2_COLOR
}

const slice = createSlice({
  name: 'seatColors',
  initialState: defaultSeatColorsState,
  reducers: {
    setLastGuestColor: (state, action: PayloadAction<{ seat: Player; color: string }>) => ({
      ...state,
      lastGuestColor: { ...state.lastGuestColor, [action.payload.seat]: action.payload.color }
    }),
    setLastCpuColor: (state, action: PayloadAction<string>) => ({ ...state, lastCpuColor: action.payload })
  }
})

export const seatColorsActions = slice.actions
export default slice.reducer
