import { BallSpeedLevel, PaddleSizeLevel } from '@/types'

export const WALL_THICKNESS = 10

// width:height for the outer letterboxed container on desktop web only — a much wider, shallower
// shape than AirHockey's TABLE_LONG_TO_SHORT_RATIO (a real air-hockey table's ~2:1), matching a
// classic Pong court's own proportions instead.
export const TABLE_WIDTH_TO_HEIGHT_RATIO = 16 / 9
export const DESKTOP_WEB_MIN_WIDTH = 768

// Ball/paddle sizing, all as a fraction of board HEIGHT (unlike AirHockey's short-edge-fraction
// convention) — Pong's court is fixed wide/landscape-native in local space (paddles always at
// local-left/local-right along the long axis), so height is the axis that stays meaningful across
// both seating orientations once game.tsx swaps which real screen dimension feeds computeBoardLayout.
export const BALL_RADIUS_RATIO = 0.018
export const PADDLE_WIDTH_RATIO = 0.022
export const PADDLE_INSET_RATIO = 0.035
export const PADDLE_HEIGHT_RATIOS: Record<PaddleSizeLevel, number> = { small: 0.14, medium: 0.18, large: 0.24 }

export const PADDLE_VELOCITY_SMOOTHING_FRAMES = 3 // unchanged from AirHockey
export const MAX_PADDLE_SPEED = 26 // unchanged from AirHockey

// Wall bounces are lossless by design — direction flips, magnitude untouched, matching a classic
// Pong court's own flat top/bottom walls. Unlike AirHockey's WALL_RESTITUTION (0.72, a real
// mallet-and-ice feel), any restitution below 1 here would make the ball quietly bleed speed on
// every wall bounce despite the whole speed model being an explicit, deliberate ratchet elsewhere
// — the two mechanisms would fight each other. Ratchet-on-hit-only lives entirely in
// applyPaddleCollision.
export const WALL_RESTITUTION = 1
export const PADDLE_COLLISION_RESTITUTION = 1
// Extra vy nudge from WHERE on the paddle the ball struck (see applyPaddleCollision) — without
// this, a ball met by a paddle holding still reflects at vy≈0 off a pure geometric bounce and can
// rally dead-straight along the same horizontal line forever, which reads as broken rather than
// as a legitimate rally.
export const PADDLE_STEER_FACTOR = 0.6

export const BALL_SPEED_TIERS: Record<BallSpeedLevel, { base: number; increment: number; max: number }> = {
  slow: { base: 6, increment: 1.0, max: 14 },
  medium: { base: 8, increment: 1.4, max: 20 },
  fast: { base: 11, increment: 1.8, max: 26 }
}

export const SCORE_TO_WIN = 5
export const SERVE_PAUSE_MS = 900
export const SERVE_ANGLE_MAX_DEG = 30

// Sizes the TICK-level substep loop (see computeTickSubsteps below and useGameState.ts's TICK
// handler) against the thinnest feature a fast ball must not tunnel through — the paddle BAR, not
// the wall. A wall spans the board's full width so a single large-dt step can never skip past it
// entirely, but a paddle is only ~2% of board height thick, and the ball's own max speed is capped
// well above what a single 60fps frame's worth of displacement could safely resolve against
// something that thin.
export const PADDLE_TUNNEL_SAFETY_RATIO = 0.4
export const MAX_TICK_SUBSTEPS = 8
