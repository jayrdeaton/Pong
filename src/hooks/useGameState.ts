import { useGameLoop } from '@tastic/core'
import { useCallback, useEffect, useReducer, useRef } from 'react'

import { BALL_SPEED_TIERS, PADDLE_VELOCITY_SMOOTHING_FRAMES, SERVE_PAUSE_MS } from '@/constants/game'
import { BallSpeedLevel, BallState, BoardLayout, GameState, PaddleState, Player } from '@/types'
import { centerBall, centerPaddle, clampPaddleY } from '@/utils/board'
import { applyPaddleCollision, clampPaddleSpeed, computePaddleVelocity, computeServeVelocity, computeTickSubsteps, stepPhysics } from '@/utils/physics'

// setPaddleTarget's public signature simplifies from AirHockey's (player, x, y) to (player, y) —
// a Pong paddle's X is permanently fixed by board.paddleX[player] for the whole match, so there's
// nothing left for a live input to ever set it to. paddleTargetsRef mirrors that: bare Y values,
// not {x, y} points.
type PaddleTargets = Record<Player, number>

type Action = { type: 'TICK'; board: BoardLayout; dt: number; targets: PaddleTargets } | { type: 'START'; random?: () => number } | { type: 'POINT_SERVE'; board: BoardLayout; random?: () => number } | { type: 'RESET'; board: BoardLayout } | { type: 'RESCALE'; prevBoard: BoardLayout; board: BoardLayout }

function makeInitialState(board: BoardLayout): GameState {
  const ballPos = centerBall(board)
  const p1 = centerPaddle(board, 1)
  const p2 = centerPaddle(board, 2)
  return {
    phase: 'idle',
    scores: [0, 0],
    // speed: 0 — unlike AirHockey's puck (which also legitimately sits at rest pre-START), Pong's
    // ball genuinely gets launched by START itself (see the 'START' case below), so a resting
    // speed of 0 here is momentary by design, not a steady state anything else needs to handle.
    ball: { ...ballPos, vx: 0, vy: 0, speed: 0 },
    paddles: { 1: { ...p1, vx: 0, vy: 0 }, 2: { ...p2, vx: 0, vy: 0 } },
    lastScoredBy: null,
    bounceCount: 0
  }
}

// Commits one player's paddle from its raw target Y into a real, velocity-bearing PaddleState —
// an EMA over the instantaneous per-tick velocity, same technique AirHockey's own commitPaddle
// uses (see its own doc comment for the full rationale). targetX is never a live input here — it's
// always board.paddleX[player], read fresh each commit so a mid-rally RESCALE's new fixed X is
// picked up automatically on the very next TICK, with no separate reconciliation step needed.
function commitPaddle(prev: PaddleState, targetY: number, board: BoardLayout, player: Player, dt: number): PaddleState {
  const targetX = board.paddleX[player]
  const instant = computePaddleVelocity(prev.x, prev.y, targetX, targetY, dt)
  const alpha = 1 / PADDLE_VELOCITY_SMOOTHING_FRAMES
  const smoothed = clampPaddleSpeed(prev.vx + (instant.vx - prev.vx) * alpha, prev.vy + (instant.vy - prev.vy) * alpha)
  return { x: targetX, y: targetY, vx: smoothed.vx, vy: smoothed.vy }
}

function otherPlayer(p: Player): Player {
  return p === 1 ? 2 : 1
}

// Board-change remap, split into a ball-specific and a paddle-specific half rather than one
// generic rescalePoint the way AirHockey's single function handles both puck and paddle — a Pong
// paddle's X is fixed geometry, not a live coordinate, so it must SNAP to the new board's own
// paddleX[player] rather than fractionally interpolate from wherever it happened to be (fractional
// interpolation would leave it off the fixed line the moment the board's own aspect ratio changed
// even slightly). The ball has no such fixed axis, so it rescales fractionally in both dimensions,
// same as AirHockey's puck.
function rescaleBall(ball: BallState, prevBoard: BoardLayout, board: BoardLayout): BallState {
  const degenerate = prevBoard.width <= 0 || prevBoard.height <= 0
  const fx = degenerate ? 0.5 : (ball.x - prevBoard.x) / prevBoard.width
  const fy = degenerate ? 0.5 : (ball.y - prevBoard.y) / prevBoard.height
  const vx = ball.vx * (degenerate ? 1 : board.width / prevBoard.width)
  const vy = ball.vy * (degenerate ? 1 : board.height / prevBoard.height)
  // speed is recomputed from the rescaled vx/vy rather than carried forward unchanged — a resize
  // isn't a "hit" (applyPaddleCollision's own ratchet never runs here), but the rescaled vx/vy's
  // own magnitude genuinely did just change, so speed (the ratchet's source of truth — see
  // BallState's doc comment in types/index.ts) has to track that or the two would silently drift
  // apart from each other.
  return { x: board.x + fx * board.width, y: board.y + fy * board.height, vx, vy, speed: Math.hypot(vx, vy) }
}

function rescalePaddleY(paddle: PaddleState, prevBoard: BoardLayout, board: BoardLayout, player: Player): PaddleState {
  const degenerate = prevBoard.height <= 0
  const fy = degenerate ? 0.5 : (paddle.y - prevBoard.y) / prevBoard.height
  return { x: board.paddleX[player], y: board.y + fy * board.height, vx: 0, vy: 0 }
}

export function makeReducer(scoreToWin: number, ballSpeedLevel: BallSpeedLevel) {
  const tier = BALL_SPEED_TIERS[ballSpeedLevel]

  return function reducer(state: GameState, action: Action): GameState {
    switch (action.type) {
      // idle -> live: the pre-game "get ready" beat, same pause POINT_SERVE gives after a point
      // (see useGameState's own effect below). Unlike AirHockey's own START (which only has to
      // flip the phase, since the puck legitimately sits at rest until struck), Pong's ball has no
      // such mechanic — this is the very first thing that ever puts it in motion, via
      // computeServeVelocity with towardPlayer: null (a coin-flip direction, since neither player
      // has conceded anything yet).
      case 'START': {
        if (state.phase !== 'idle') return state
        const velocity = computeServeVelocity(tier.base, null, action.random)
        return { ...state, phase: 'live', ball: { ...state.ball, vx: velocity.vx, vy: velocity.vy, speed: tier.base } }
      }

      case 'TICK': {
        if (state.phase !== 'live') return state

        const paddles = {
          1: commitPaddle(state.paddles[1], action.targets[1], action.board, 1, action.dt),
          2: commitPaddle(state.paddles[2], action.targets[2], action.board, 2, action.dt)
        }

        // Substepping lives HERE, not inside stepPhysics itself (unlike AirHockey) — each substep
        // needs its own fresh applyPaddleCollision check against a thin paddle bar, not just wall
        // integration, so the loop has to live at the layer that already owns both paddles' state.
        const substeps = computeTickSubsteps(state.ball.speed, action.dt, action.board.paddleWidth)
        const subDt = action.dt / substeps

        let ball: BallState = state.ball
        let anyBounced = false
        let scoredBy: 1 | 2 | null = null

        for (let i = 0; i < substeps; i++) {
          ball = applyPaddleCollision(ball, paddles[1], action.board, tier.increment, tier.max)
          ball = applyPaddleCollision(ball, paddles[2], action.board, tier.increment, tier.max)
          const result = stepPhysics(ball, action.board, subDt)
          anyBounced = anyBounced || result.bounced
          ball = { x: result.x, y: result.y, vx: result.vx, vy: result.vy, speed: result.speed }
          // A score is final — stop sub-stepping immediately rather than continuing to integrate a
          // ball that's already left play this frame, same discipline AirHockey's own stepPhysics
          // substep loop uses for a scored/stopped puck.
          if (result.scored !== null) {
            scoredBy = result.scored
            break
          }
        }

        if (scoredBy !== null) {
          const scores: [number, number] = [state.scores[0], state.scores[1]]
          scores[scoredBy - 1]++
          // At rest, dead center — the actual re-launch happens on the FOLLOWING POINT_SERVE, once
          // SERVE_PAUSE_MS has given both players a beat to see the score change (see
          // useGameState's own effect below). speed: 0 here, not tier.base — a scored ball isn't
          // "in play" again until POINT_SERVE actually serves it.
          const nextBall: BallState = { ...centerBall(action.board), vx: 0, vy: 0, speed: 0 }
          if (scores[scoredBy - 1] >= scoreToWin) {
            return { ...state, phase: 'gameOver', scores, ball: nextBall, paddles, lastScoredBy: scoredBy }
          }
          return { ...state, phase: 'pointScored', scores, ball: nextBall, paddles, lastScoredBy: scoredBy }
        }

        return { ...state, ball, paddles, bounceCount: anyBounced ? state.bounceCount + 1 : state.bounceCount }
      }

      // Post-point re-serve — see useGameState's own SERVE_PAUSE_MS timer. Re-centers both
      // paddles (real Pong re-serves fresh, no possession/turn logic to carry over) and serves the
      // ball toward whoever just conceded (otherPlayer(lastScoredBy) — the scorer doesn't also get
      // to receive their own serve).
      case 'POINT_SERVE': {
        if (state.phase !== 'pointScored') return state
        const p1 = centerPaddle(action.board, 1)
        const p2 = centerPaddle(action.board, 2)
        const velocity = computeServeVelocity(tier.base, otherPlayer(state.lastScoredBy!), action.random)
        return {
          ...state,
          phase: 'live',
          ball: { ...centerBall(action.board), vx: velocity.vx, vy: velocity.vy, speed: tier.base },
          paddles: { 1: { ...p1, vx: 0, vy: 0 }, 2: { ...p2, vx: 0, vy: 0 } },
          lastScoredBy: null
        }
      }

      case 'RESET':
        return makeInitialState(action.board)

      case 'RESCALE':
        return {
          ...state,
          ball: rescaleBall(state.ball, action.prevBoard, action.board),
          paddles: { 1: rescalePaddleY(state.paddles[1], action.prevBoard, action.board, 1), 2: rescalePaddleY(state.paddles[2], action.prevBoard, action.board, 2) }
        }

      default:
        return state
    }
  }
}

export function useGameState(board: BoardLayout, scoreToWin: number, ballSpeedLevel: BallSpeedLevel, paused: boolean) {
  // Mirrored every render so the stable useReducer wrapper below always dispatches through the
  // latest settings-derived reducer, without needing to recreate useReducer itself (which would
  // reset `state` back to its initializer whenever scoreToWin/ballSpeedLevel changed).
  const reducerRef = useRef(makeReducer(scoreToWin, ballSpeedLevel))
  // eslint-disable-next-line react-hooks/refs -- see comment above
  reducerRef.current = makeReducer(scoreToWin, ballSpeedLevel)

  const [state, dispatch] = useReducer(
    // eslint-disable-next-line react-hooks/refs -- see reducerRef's own comment above; this wrapper is only ever invoked from dispatch (an event handler), never during render
    (s: GameState, a: Action) => reducerRef.current(s, a),
    board,
    makeInitialState
  )

  const boardRef = useRef(board)
  // eslint-disable-next-line react-hooks/refs -- mirrored every render so the physics rAF loop below always reads the current board layout without needing it in that effect's own deps
  boardRef.current = board

  // Raw, unthrottled paddle target Ys — written every touch sample (TouchInputLayer) or AI
  // decision (useAIOpponent) via setPaddleTarget below, WITHOUT dispatching (a dispatch per touch
  // sample would re-render well over 60 times a second on some devices). The physics tick reads
  // whatever this ref currently holds once per animation frame — the same cadence stepPhysics
  // itself runs at — and folds the read into the SAME TICK dispatch that also steps the ball, so a
  // player's and the AI's target both flow through this identical commit path (see commitPaddle
  // above). Same pattern as AirHockey's own paddleTargetsRef, just bare Ys instead of {x, y}
  // points.
  const paddleTargetsRef = useRef<PaddleTargets>({ 1: centerPaddle(board, 1).y, 2: centerPaddle(board, 2).y })

  const setPaddleTarget = useCallback((player: Player, y: number) => {
    const clamped = clampPaddleY(y, boardRef.current)
    paddleTargetsRef.current = { ...paddleTargetsRef.current, [player]: clamped }
  }, [])

  useGameLoop((dt) => dispatch({ type: 'TICK', board: boardRef.current, dt, targets: paddleTargetsRef.current }), { enabled: state.phase === 'live' && !paused, maxDt: 2.5 })

  // useReducer's lazy init (the `board` argument passed to useReducer above) only ever runs ONCE,
  // at this hook's very first mount — but `board` itself can change again at any later point too:
  // useSafeAreaInsets/useAccelerometerOrientation both resolve asynchronously after game.tsx's
  // first paint, a live window resize can fire at any time, and rotating the device mid-rally
  // genuinely changes which real dimensions feed computeBoardLayout. Rescaling on every board
  // change (see rescaleBall/rescalePaddleY above), not just while idle, is what actually keeps the
  // ball/paddles' absolute-pixel positions sane across all of those — including the pre-game
  // settling window, where it's simply invisible since nothing's moved yet. Mirrors AirHockey's own
  // identical effect.
  const prevBoardRef = useRef(board)
  useEffect(() => {
    const prevBoard = prevBoardRef.current
    if (board === prevBoard) return
    prevBoardRef.current = board
    // A degenerate zero-sized prevBoard (web's very first render, before hydration has a real
    // window size to measure) can only ever be true right at mount — real gameplay can't have
    // happened against a board with 0 width. Re-centering fresh (each point at its OWN correct
    // spot) rather than fractionally rescaling from it is what actually matters here: rescaleBall/
    // rescalePaddleY both treat a degenerate prevBoard as "everything was at the 0.5,0.5 fraction"
    // (their own last-resort anti-NaN fallback), which would collapse the ball AND BOTH paddles
    // onto the same center Y instead of each landing at its own distinct starting position.
    if (prevBoard.width <= 0 || prevBoard.height <= 0) {
      paddleTargetsRef.current = { 1: centerPaddle(board, 1).y, 2: centerPaddle(board, 2).y }
      dispatch({ type: 'RESET', board })
      return
    }
    paddleTargetsRef.current = {
      1: rescalePaddleY({ x: 0, y: paddleTargetsRef.current[1], vx: 0, vy: 0 }, prevBoard, board, 1).y,
      2: rescalePaddleY({ x: 0, y: paddleTargetsRef.current[2], vx: 0, vy: 0 }, prevBoard, board, 2).y
    }
    dispatch({ type: 'RESCALE', prevBoard, board })
  }, [board])

  // Owns the idle->live and pointScored->live pauses itself, rather than pushing timer bookkeeping
  // out to game.tsx — this is the game's own internal rhythm, not something the screen layer needs
  // to orchestrate. Re-runs (and so restarts the pause from scratch) whenever `paused` toggles, so
  // a settings/quit-confirm dialog opened mid-pause doesn't let the ball go live off a stale timer
  // that counted time the dialog was covering the board. Mirrors AirHockey's own identical effect.
  useEffect(() => {
    if (paused) return undefined
    if (state.phase === 'idle' || state.phase === 'pointScored') {
      const t = setTimeout(() => {
        if (state.phase === 'idle') dispatch({ type: 'START' })
        else dispatch({ type: 'POINT_SERVE', board: boardRef.current })
      }, SERVE_PAUSE_MS)
      return () => clearTimeout(t)
    }
    return undefined
  }, [state.phase, paused])

  const resetGame = useCallback((currentBoard: BoardLayout) => {
    paddleTargetsRef.current = { 1: centerPaddle(currentBoard, 1).y, 2: centerPaddle(currentBoard, 2).y }
    dispatch({ type: 'RESET', board: currentBoard })
  }, [])

  return { state, setPaddleTarget, resetGame }
}
