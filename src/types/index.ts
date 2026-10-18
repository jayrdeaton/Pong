import { AchievementDefinition as BaseAchievementDefinition, DayStreakState, OutcomeRecord, RoundResult, WinStreakState } from '@tastic/achievements'
import type { ViewRotation } from '@tastic/core'
import { KeyScheme } from '@tastic/input'

export type Player = 1 | 2

// KeyScheme (wasd/arrows/ijkl/numpad) is the shared, cross-fleet set of physical key layouts, from
// @tastic/input. 'mouse' is a local addition on top - it means "keep using the paddle's own drag/
// touch input" (see TouchInputLayer.tsx), which has no keys of its own, so @tastic/input has no
// opinion on it (see that package's own KeyScheme doc). Only ever meaningful on desktop web - see
// PlayerSetupPanel's own showControlScheme-equivalent gating (now @tastic/hud's ControlSchemePicker,
// which bakes that gate in itself).
export type ControlScheme = KeyScheme | 'mouse'

// Dramatically simpler than AirHockey's own phase machine, which needed a 'goalScored' pause for
// puck+paddle re-centering AND a distinct goal-mouth/post/corner geometry underneath it. Pong's
// underlying mechanic is the same shape (score, brief pause, re-serve) so the phase names mirror
// it 1:1, just renamed to match this game's own "point" vocabulary rather than "goal" - see the
// naming-convention note at the top of the design spec this file implements.
export type GamePhase = 'idle' | 'live' | 'pointScored' | 'gameOver'

export type GameMode = 'twoPlayer' | 'vsCpu' | 'solo'

export type AiDifficulty = 'easy' | 'medium' | 'hard'

export type PaddleSizeLevel = 'small' | 'medium' | 'large'

// Ball pace tier - governs BOTH the base serve speed and the per-hit ratchet increment (see
// BALL_SPEED_TIERS in constants/game.ts). Replaces AirHockey's FrictionLevel outright: Pong's
// ball has no deceleration model at all, so there's nothing for a "friction tier" to modulate -
// pace here is entirely a function of how fast the ball starts and how much each strike adds.
export type BallSpeedLevel = 'slow' | 'medium' | 'fast'

export interface Settings {
  gameMode: GameMode
  scoreToWin: number
  aiDifficulty: AiDifficulty
  paddleSize: PaddleSizeLevel
  ballSpeed: BallSpeedLevel
  // 'vsCpu'/'twoPlayer' only - a destructible brick field between the paddles, off by default so
  // classic Pong is unchanged. Meaningless for 'solo', which is unconditionally a brick field
  // regardless of this flag (see bricksActiveFor in utils/gameMode.ts).
  bricksEnabled: boolean
  // Lock Orientation, app-wide: _layout.tsx's OrientationBridge hands it to @tastic/core's
  // OrientationProvider (freezeWhileLocked), which freezes the one shared orientation reading for
  // every screen, the in-game board, dialogs and the status bar alike. Off by default: all of those
  // just follow however the device is actually being held.
  lockOrientation: boolean
  // The angle the lock is holding. Written by OrientationProvider's onLockChange (recorded on lock,
  // cleared on unlock) and handed back as lockInitialValue, so a relaunch reopens in the locked
  // orientation instead of portrait. Never set by the UI directly; absent while unlocked.
  lockedRotation?: ViewRotation
  // iOS-only. Off by default - deliberately opt-in rather than always-on, so it only kicks in for
  // someone who's actually hit the problem and gone looking for a fix, instead of every player
  // eating a "swipe twice to go home" surprise from day one. Mirrored into native UserDefaults (see
  // Providers.tsx's EdgeGuardBridge) for @tastic/edge-guard's own config plugin swizzle to read at runtime.
  deferBottomEdgeGestures: boolean
  // Web-only per-seat picker (see PlayerSetupPanel's ControlSchemePicker usage) - which physical
  // input drives each seat's paddle. 'mouse' (the default) keeps using TouchInputLayer's own drag
  // input unchanged; any KeyScheme routes that seat's paddle through KeyboardInputLayer instead.
  controlScheme: Record<Player, ControlScheme>
  // Opt-in device-tilt paddle steering - single-player only (vsCpu/solo, wherever
  // humanPlayersFor(gameMode).length === 1 - see tiltControlActiveFor in utils/gameMode.ts).
  // Inert in twoPlayer regardless of this flag: two people share one device via TouchInputLayer's
  // split touch zones, and one tilt reading can't independently steer two paddles. Additive on top
  // of TouchInputLayer's own drag input, same "adds a method, never removes one" precedent
  // KeyboardInputLayer already established. Off by default, same opt-in convention as
  // lockOrientation/deferBottomEdgeGestures above.
  tiltControlEnabled: boolean
}

// A single destructible brick, in the same LOCAL space as BoardLayout. Deliberately its own type
// rather than a generic Obstacle - every obstacle in this game is destructible, so there's no
// non-destructible shape worth factoring out separately (unlike AirHockey/BoxHockey's permanent
// Obstacle, which this otherwise mirrors).
export interface Brick {
  x: number
  y: number
  width: number
  height: number
  destroyed: boolean
}

// Single source of truth for court geometry, always expressed in canonical LOCAL space: player 1
// is always at local-left, player 2 always at local-right, the ball always travels along the
// local X axis - regardless of how the device is physically held. Unlike AirHockey's BoardLayout,
// there is no GoalAxis/rotation field here at all: the rendering layer (game.tsx) is solely
// responsible for rotating this local rectangle onto the real screen via @tastic/split-screen's
// getFixedZoneRotation (see the design spec's board.ts section), so board/physics/AI code never
// needs to branch on real device orientation.
export interface BoardLayout {
  x: number
  y: number
  width: number
  height: number
  wallThickness: number
  ballRadius: number
  paddleWidth: number // thickness (short dimension) - a fixed ratio of board height, not tiered
  paddleHeight: number // length (long dimension) - tiered by PaddleSizeLevel
  // Each player's fixed X (their paddle rect's center-x) in LOCAL space - always paddleX[1] <
  // paddleX[2], for the whole match. A Pong paddle never moves in X at all (unlike AirHockey's
  // free-roam mallet), so this is computed once per BoardLayout rather than tracked as live state.
  paddleX: Record<Player, number>
  // A paddle's CENTER travel range in local Y, already inset by paddleHeight/2 from the top/bottom
  // walls so the paddle's own edge - not its center - is what actually touches a wall. Spans the
  // FULL board height: unlike AirHockey's own-half clamp (a mallet defends one goal), a Pong
  // paddle has always covered the entire court vertically, since it's the only thing defending
  // its edge.
  paddleMinY: number
  paddleMaxY: number
  centerX: number
  centerY: number
}

export interface BallState {
  x: number
  y: number
  vx: number
  vy: number
  // Tracked scalar speed - the per-hit ratchet's own source of truth (see applyPaddleCollision in
  // utils/physics.ts). Re-projected onto vx/vy on each hit rather than re-derived via hypot() every
  // hit, so many ratchets in a row can't accumulate float drift the way repeatedly reconstructing
  // it from vx/vy would.
  speed: number
}

// Only y is ever live in practice - x is always board.paddleX[player], fixed for the whole match.
// Kept as a full 2D PaddleState (not narrowed to a bare Y scalar) rather than introduce a second,
// narrower shape: computePaddleVelocity/clampPaddleSpeed copy VERBATIM from AirHockey (see
// utils/physics.ts) and are still genuinely 2D, so PaddleState keeping their existing (x, y, vx,
// vy) signature lets those two functions come across unmodified. vx is simply always 0 in
// practice since x never changes tick to tick.
export interface PaddleState {
  x: number
  y: number
  vx: number
  vy: number
}

export type PaddleStates = Record<Player, PaddleState>

export interface GameState {
  phase: GamePhase
  scores: [number, number]
  ball: BallState
  paddles: PaddleStates
  lastScoredBy: Player | null
  // Bumped on every TICK where stepPhysics reports a wall bounce - an ever-incrementing counter
  // (not a plain boolean), same reason AirHockey's identical bounceCount exists: a boolean alone
  // can't tell "a NEW bounce just happened" apart from "one already happened a tick ago" across
  // renders, which is what a bounce SFX/haptic effect actually needs to key off of.
  bounceCount: number
  // Always present (empty when bricks aren't active this round) so the TICK substep loop never
  // needs a conditional just to skip the brick pass. Lives in GameState, not BoardLayout: unlike
  // AirHockey/BoxHockey's permanently-static obstacles, bricks are destructible round-progress
  // state, and BoardLayout is recomputed on every resize/rotation - storing destroyed-state there
  // would silently regenerate a fully-intact field on a mid-round rotation. Rescaled (not
  // regenerated) on RESCALE - see rescaleBricks in utils/board.ts.
  bricks: Brick[]
  // Meaningful only for 'solo' (0 otherwise) - decremented on a miss, <= 0 ends the round as a loss.
  lives: number
}

// ─── Stats & achievements ───────────────────────────────────────────────────
export type { AchievementTier, UnlockedAchievementsState } from '@tastic/achievements'
export type AchievementDefinition = BaseAchievementDefinition<StatsState>

export type MatchRecord = OutcomeRecord

// The human is always seat 1 in vsCpu mode. A match ends the instant one side reaches scoreToWin,
// so a draw is impossible and `draws` stays 0 - it rides along because @tastic/achievements'
// applyResult maintains the whole quadruple.
export interface VsCpuStats extends OutcomeRecord, WinStreakState {
  byDifficulty: Record<AiDifficulty, MatchRecord>
}

// Tallied by SEAT, not by person - so this deliberately isn't an OutcomeRecord.
export interface TwoPlayerStats {
  played: number
  p1Wins: number
  p2Wins: number
}

// Solo/Brickbreaker has no opponent and no score tuple, so it's neither an OutcomeRecord (vsCpu)
// nor a seat tally (twoPlayer) - its own minimal shape instead. `cleared` is solo's "win": every
// brick destroyed before running out of lives.
export interface SoloStats {
  played: number
  cleared: number
}

// Points for and against across every match, both modes.
export interface PointTotals {
  scored: number
  conceded: number
}

export interface ProfileStats extends DayStreakState {
  vsCpu: VsCpuStats
  twoPlayer: TwoPlayerStats
  solo: SoloStats
  points: PointTotals
  shutouts: number
  bestWinMargin: number
  // Per ball-speed tier - the closest thing Pong has to a difficulty modifier the player picks
  // themselves, so "win at every speed" is a meaningful goal.
  bySpeed: Record<BallSpeedLevel, MatchRecord>
  // Career total, mode-agnostic - bricks can be destroyed in solo OR the vsCpu/twoPlayer Bricks
  // toggle, and there's no reason to fragment one counter into two for that.
  bricksDestroyed: number
}

export interface StatsState extends ProfileStats {
  profiles: Record<string, ProfileStats>
  firstGameResult: RoundResult | null
}
