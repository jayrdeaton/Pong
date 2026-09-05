import { useEffect } from 'react'

import { BoardLayout, GameState, Player } from '@/types'
import { AIDifficulty, computeAIPaddleTarget } from '@/utils/aiOpponent'

// Re-runs every time state.ball changes — i.e. once per physics tick, since ball is a fresh object
// each TICK dispatch — so this hook itself IS the AI's per-tick decision point, riding the same
// cadence useGameState's own useGameLoop already drives rather than a separate rAF/interval loop
// of its own. setPaddleTarget is the EXACT SAME function TouchInputLayer's gesture callbacks call
// for a human — this is what preserves AirHockey's "AI plays through the human's own input
// contract" principle at continuous granularity: the AI never touches TICK dispatch, paddle
// velocity computation, or collision differently than a human's touch does, it only ever supplies
// a different SOURCE of a target Y (setPaddleTarget's own public signature simplifies from
// AirHockey's (player, x, y) to (player, y) — see useGameState.ts — since a Pong paddle's X is
// permanently fixed by board.paddleX[player], never a live input).
export function useAIOpponent(state: GameState, board: BoardLayout, aiPlayer: Player | null, difficulty: AIDifficulty, paused: boolean, setPaddleTarget: (player: Player, y: number) => void): void {
  useEffect(() => {
    if (aiPlayer === null || paused || state.phase !== 'live') return
    const target = computeAIPaddleTarget(state.ball, state.paddles[aiPlayer], board, aiPlayer, difficulty)
    setPaddleTarget(aiPlayer, target.y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ball, state.phase, aiPlayer, difficulty, paused, board, setPaddleTarget])
}
