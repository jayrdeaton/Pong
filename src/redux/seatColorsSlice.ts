import { createSeatColorsSlice, type SeatColorsState as GenericSeatColorsState } from '@tastic/profile'

import { DEFAULT_P1_COLOR, DEFAULT_P2_COLOR } from '@/constants/game'
import { Player } from '@/types'

// /loadout's own "remember this for next time" memory for guest/CPU seats — independent of the
// `theme` slice's own live color triad (store.ts), which is just a boot-seed placeholder for
// auto-paper's Provider and gets overwritten by every recolor (a profile-selected seat's repaint
// included, whether it's tracking the profile's own color live or a persisted override — see
// loadout.tsx's own focus effect). A profile-selected seat's color always comes live from the
// profile itself, unless overridden (profileOverride below) — this otherwise only ever holds what a
// GUEST seat, or the CPU seat, last picked for itself. Was a hand-rolled createSlice identical to 4
// sibling apps' own copies (AirHockey, BoxHockey, LightCycles) before @tastic/profile's
// createSeatColorsSlice factory generalized it away over the seat type — this is now a thin binding
// stub over that factory, re-exporting under this app's own established names so no call site
// elsewhere needs to change.
export type SeatColorsState = GenericSeatColorsState<Player>

export const defaultSeatColorsState: SeatColorsState = {
  lastGuestColor: { 1: DEFAULT_P1_COLOR, 2: DEFAULT_P2_COLOR },
  lastCpuColor: DEFAULT_P2_COLOR,
  profileOverride: { 1: null, 2: null }
}

const { actions, reducer } = createSeatColorsSlice<Player>('pong', defaultSeatColorsState)

export const seatColorsActions = actions
export default reducer
