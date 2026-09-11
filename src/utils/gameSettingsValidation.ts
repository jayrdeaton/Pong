import { SCORE_TO_WIN } from '@/constants/game'
import { ControlScheme, GameSettings } from '@/types'

// Pulled out of hooks/useGameSettings.tsx specifically so it's testable without dragging in
// @react-native-async-storage/async-storage, which throws at import time under Jest's plain Node
// environment (its native module is never linked there) — see useGameSettings.tsx's own import.
export const DEFAULT_SETTINGS: GameSettings = {
  gameMode: 'twoPlayer',
  scoreToWin: SCORE_TO_WIN,
  aiDifficulty: 'medium',
  paddleSize: 'medium',
  ballSpeed: 'medium',
  bricksEnabled: false,
  lockOrientation: false,
  deferBottomEdgeGestures: false,
  // Asymmetric defaults (not both 'mouse') so two seats sharing one desktop's keyboard/mouse don't
  // start out colliding — mirrors Snake's identical reasoning for the same field.
  controlScheme: { 1: 'mouse', 2: 'wasd' }
}

function isValidControlScheme(value: unknown): value is ControlScheme {
  return value === 'mouse' || value === 'wasd' || value === 'arrows' || value === 'ijkl' || value === 'numpad'
}

export function isValidSettings(value: unknown): value is GameSettings {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<GameSettings>
  return (v.gameMode === 'twoPlayer' || v.gameMode === 'vsCpu' || v.gameMode === 'solo') && typeof v.scoreToWin === 'number' && (v.aiDifficulty === 'easy' || v.aiDifficulty === 'medium' || v.aiDifficulty === 'hard') && (v.paddleSize === 'small' || v.paddleSize === 'medium' || v.paddleSize === 'large') && (v.ballSpeed === 'slow' || v.ballSpeed === 'medium' || v.ballSpeed === 'fast') && typeof v.bricksEnabled === 'boolean' && typeof v.lockOrientation === 'boolean' && typeof v.deferBottomEdgeGestures === 'boolean' && !!v.controlScheme && isValidControlScheme(v.controlScheme[1]) && isValidControlScheme(v.controlScheme[2])
}
