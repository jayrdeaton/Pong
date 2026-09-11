import { GameMode, Player } from '@/types'

// Extracted so /loadout can parse its own mode route param the same way, without duplicating
// this ternary.
export function parseGameMode(value: string | undefined): GameMode {
  return value === 'vsCpu' ? 'vsCpu' : 'twoPlayer'
}

// CPU always plays player 2 (see useAIOpponent) — the human is player 1 whenever gameMode isn't
// 'twoPlayer' (both 'vsCpu' and 'solo' are single-human seats; solo simply has no seat 2 at all).
// Takes just the gameMode field (not the full GameSettings) so /loadout can call this before it
// has assembled a complete settings object of its own.
export function humanPlayersFor(gameMode: GameMode): Player[] {
  return gameMode === 'twoPlayer' ? [1, 2] : [1]
}

// Single source of truth for "does this round have a brick field" — solo is unconditionally
// Brickbreaker regardless of the stored toggle; vsCpu/twoPlayer only have bricks when the player
// opted in. Called from both game.tsx (board/state setup) and loadout.tsx (whether to show the
// Bricks toggle at all).
export function bricksActiveFor(gameMode: GameMode, bricksEnabled: boolean): boolean {
  return gameMode === 'solo' || bricksEnabled
}
