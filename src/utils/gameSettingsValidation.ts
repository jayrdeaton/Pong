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
  controlScheme: { 1: 'mouse', 2: 'wasd' },
  tiltControlEnabled: false
}

function isValidControlScheme(value: unknown): value is ControlScheme {
  return value === 'mouse' || value === 'wasd' || value === 'arrows' || value === 'ijkl' || value === 'numpad'
}

// lockedRotation is optional and absent from DEFAULT_SETTINGS: it only exists while Lock Orientation
// is on, and settings saved before it existed don't have it either. It must pass when missing, because
// a failed isValidSettings makes createGameSettingsProvider discard EVERY saved setting, not just this.
function isValidLockedRotation(value: unknown): value is GameSettings['lockedRotation'] {
  return value === undefined || value === 0 || value === 90 || value === 180 || value === -90
}

export function isValidSettings(value: unknown): value is GameSettings {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<GameSettings>
  return (v.gameMode === 'twoPlayer' || v.gameMode === 'vsCpu' || v.gameMode === 'solo') && typeof v.scoreToWin === 'number' && (v.aiDifficulty === 'easy' || v.aiDifficulty === 'medium' || v.aiDifficulty === 'hard') && (v.paddleSize === 'small' || v.paddleSize === 'medium' || v.paddleSize === 'large') && (v.ballSpeed === 'slow' || v.ballSpeed === 'medium' || v.ballSpeed === 'fast') && typeof v.bricksEnabled === 'boolean' && typeof v.lockOrientation === 'boolean' && isValidLockedRotation(v.lockedRotation) && typeof v.deferBottomEdgeGestures === 'boolean' && !!v.controlScheme && isValidControlScheme(v.controlScheme[1]) && isValidControlScheme(v.controlScheme[2]) && typeof v.tiltControlEnabled === 'boolean'
}
