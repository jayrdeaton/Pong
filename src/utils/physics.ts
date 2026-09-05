import { circleVsRect, reflectOffNormal } from '@tastic/physics'

import { MAX_PADDLE_SPEED, MAX_TICK_SUBSTEPS, PADDLE_COLLISION_RESTITUTION, PADDLE_STEER_FACTOR, PADDLE_TUNNEL_SAFETY_RATIO, SERVE_ANGLE_MAX_DEG, WALL_RESTITUTION } from '@/constants/game'
import { BallState, BoardLayout, PaddleState, Player } from '@/types'

export interface PhysicsResult extends BallState {
  scored: 1 | 2 | null
  bounced: boolean
}

// Flat top/bottom walls, full width, always solid — no goal-mouth gap in them anywhere, unlike
// AirHockey's own front walls. Left/right edges ARE the score lines: fully clearing either one is
// an immediate point, with no goal-post/corner ambiguity to resolve first.
//
// Single-pass — no internal substepping here at all, unlike AirHockey's own stepPhysics (which
// substeps internally against goalpost/corner geometry). The substep loop that actually matters
// for Pong — not skipping clean over the thin paddle bar — lives in useGameState.ts's TICK handler
// instead (see computeTickSubsteps below), since each substep also needs fresh paddle-collision
// detection against both paddles, not just wall integration.
export function stepPhysics(ball: BallState, board: BoardLayout, dt = 1): PhysicsResult {
  const r = board.ballRadius
  const { vx, speed } = ball
  let { x, y, vy } = ball
  x += vx * dt
  y += vy * dt

  let bounced = false
  if (y - r < board.y) {
    y = board.y + r
    // Collision.normal's own convention (see @tastic/physics's collision.ts) is outward from the
    // solid, into the ball's own free space — for the TOP wall the solid sits above board.y, so
    // "outward into free space" points DOWNWARD, (0, 1), not up.
    vy = reflectOffNormal({ x: vx, y: vy }, { x: 0, y: 1 }, WALL_RESTITUTION).y
    bounced = true
  } else if (y + r > board.y + board.height) {
    y = board.y + board.height - r
    // Same convention, mirrored: the BOTTOM wall's solid sits below board.y + board.height, so
    // outward into free space points UPWARD, (0, -1).
    vy = reflectOffNormal({ x: vx, y: vy }, { x: 0, y: -1 }, WALL_RESTITUTION).y
    bounced = true
  }

  if (x + r < board.x) return { x, y, vx, vy, speed, scored: 2, bounced } // cleared P1's edge — P2 scores
  if (x - r > board.x + board.width) return { x, y, vx, vy, speed, scored: 1, bounced } // cleared P2's edge — P1 scores

  return { x, y, vx, vy, speed, scored: null, bounced }
}

// Ball-vs-paddle: circle (ball) vs. axis-aligned rect (paddle bar), via @tastic/physics's already-
// published circleVsRect + reflectOffNormal — unlike AirHockey's circle-vs-circle mallet model,
// a Pong paddle is a bar, not a disc, so this is the one genuinely new collision shape Pong needs.
// No new primitive was needed in Game-Physics for it.
//
// This is also where the per-hit speed ratchet lives — it's the one unambiguous place a "hit" is
// detected (a wall bounce, by contrast, never ratchets: see WALL_RESTITUTION's own doc comment in
// constants/game.ts for why the two would otherwise fight each other).
export function applyPaddleCollision(ball: BallState, paddle: PaddleState, board: BoardLayout, speedIncrement: number, maxSpeed: number): BallState {
  const halfW = board.paddleWidth / 2
  const halfH = board.paddleHeight / 2
  const rect = { x: paddle.x - halfW, y: paddle.y - halfH, width: board.paddleWidth, height: board.paddleHeight }
  const col = circleVsRect({ position: { x: ball.x, y: ball.y }, radius: board.ballRadius }, rect)
  if (!col.hit) return ball

  const x = ball.x + col.normal.x * col.depth
  const y = ball.y + col.normal.y * col.depth

  // Same infinite-mass-vs-finite-mass reference-frame-shift technique AirHockey's own
  // applyPaddleCollision uses (see its own doc comment for the full derivation): transform into
  // the paddle's own reference frame, reflect the RELATIVE velocity off the contact normal, then
  // transform back. The paddle's own vx/vy are never read back out or modified by this function —
  // only the live gesture (or the AI) ever moves it.
  const relativeVelocity = { x: ball.vx - paddle.vx, y: ball.vy - paddle.vy }
  const reflected = reflectOffNormal(relativeVelocity, col.normal, PADDLE_COLLISION_RESTITUTION)
  const vx = reflected.x + paddle.vx
  let vy = reflected.y + paddle.vy

  // Classic Pong "paddle steering": -1 at the paddle's top edge to +1 at its bottom edge, added on
  // top of the geometric reflection. Without this, a paddle held perfectly still reflects the ball
  // at vy≈0 off the pure geometric bounce (the ball approaches along the board's long axis, so the
  // contact normal is itself nearly horizontal) and a rally can settle into a dead-straight,
  // unwinnable line forever. Only ever nudges vy — it never flips vx's sign, so a strike can never
  // send the ball back out the side it came in from.
  const contactOffset = Math.max(-1, Math.min(1, (y - paddle.y) / halfH))
  vy += contactOffset * Math.abs(vx) * PADDLE_STEER_FACTOR

  // speed is the ratchet's own tracked source of truth (see BallState's doc comment in
  // types/index.ts) — bumped by a fixed increment per hit and capped at maxSpeed, then vx/vy are
  // re-projected onto it (direction from the just-computed reflection+steer, magnitude from the
  // ratchet) rather than left to whatever magnitude the geometric reflection happened to produce.
  const nextSpeed = Math.min(maxSpeed, ball.speed + speedIncrement)
  const dir = Math.hypot(vx, vy) || 1
  return { x, y, vx: (vx / dir) * nextSpeed, vy: (vy / dir) * nextSpeed, speed: nextSpeed }
}

// Serve direction/angle for START and POINT_SERVE. towardPlayer null means "first serve of the
// match, direction is a coin flip"; otherwise the ball travels toward whoever just conceded — real
// Pong (and every other paddle sport) serves to the loser, not the winner, so the player who just
// gave up a point gets the very next chance at the ball rather than having to chase it down.
export function computeServeVelocity(baseSpeed: number, towardPlayer: Player | null, random: () => number = Math.random): { vx: number; vy: number } {
  const angleRad = ((random() * 2 - 1) * SERVE_ANGLE_MAX_DEG * Math.PI) / 180
  const goingRight = towardPlayer === null ? random() < 0.5 : towardPlayer === 2
  const dirSign = goingRight ? 1 : -1
  return { vx: Math.cos(angleRad) * baseSpeed * dirSign, vy: Math.sin(angleRad) * baseSpeed }
}

// Guards against a fast ball skipping clean over the paddle's thin width within a single TICK's
// displacement — a real risk at capped max speeds against a bar only ~2% of board height thick,
// especially under useGameLoop's clamped-but-still-large maxDt (2.5) after a foreground stall (the
// app backgrounded mid-rally, or a slow frame on an older device). Unlike AirHockey's own substep
// loop (internal to stepPhysics, sized off puckRadius against goalpost/corner geometry), this one
// is sized off paddleWidth and is deliberately just a step COUNT — the actual substep loop lives
// in useGameState.ts's TICK handler, since each substep also needs its own fresh paddle-collision
// check, not just wall integration.
export function computeTickSubsteps(speed: number, dt: number, paddleWidth: number): number {
  const displacement = speed * dt
  const safeDisplacement = paddleWidth * PADDLE_TUNNEL_SAFETY_RATIO
  if (displacement <= safeDisplacement) return 1
  return Math.min(MAX_TICK_SUBSTEPS, Math.ceil(displacement / safeDisplacement))
}

// Copied VERBATIM from AirHockey's own utils/physics.ts — still 2D, still needed for the smoothed-
// velocity-imparts-momentum feel, even though a Pong paddle's vx component is always 0 in practice
// (its x never changes tick to tick — see PaddleState's doc comment in types/index.ts).
//
// A paddle's velocity, for collision purposes, is derived from how far its committed position
// moved THIS tick divided by dt — not from a gesture's own cumulative translation delta (which is
// relative to touch-down, not per-frame). Called once per player per physics tick (see
// useGameState.ts's TICK handler); the caller is expected to smooth this over a few ticks (see
// PADDLE_VELOCITY_SMOOTHING_FRAMES) before using it, so a single jittery touch sample doesn't read
// as a wild instantaneous velocity.
export function computePaddleVelocity(prevX: number, prevY: number, x: number, y: number, dt: number): { vx: number; vy: number } {
  if (dt <= 0) return { vx: 0, vy: 0 }
  return { vx: (x - prevX) / dt, vy: (y - prevY) / dt }
}

export function clampPaddleSpeed(vx: number, vy: number, maxSpeed: number = MAX_PADDLE_SPEED): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy)
  if (speed <= maxSpeed || speed === 0) return { vx, vy }
  const scale = maxSpeed / speed
  return { vx: vx * scale, vy: vy * scale }
}
