import { Platform } from 'react-native'
import { EdgeInsets } from 'react-native-safe-area-context'

import { BALL_RADIUS_RATIO, DESKTOP_WEB_MIN_WIDTH, PADDLE_HEIGHT_RATIOS, PADDLE_INSET_RATIO, PADDLE_WIDTH_RATIO, TABLE_WIDTH_TO_HEIGHT_RATIO, WALL_THICKNESS } from '@/constants/game'
import { BoardLayout, PaddleSizeLevel, Player } from '@/types'

// Mirrors AirHockey's own isDesktopLayout — desktop web is the only context that fixes the board
// to a fixed aspect ratio (TABLE_WIDTH_TO_HEIGHT_RATIO) rather than filling the viewport exactly.
// Native and mobile web fill their container exactly, so the device's own physical edge already
// reads as the boundary with zero gap.
function isDesktopLayout(screenWidth: number): boolean {
  return Platform.OS === 'web' && screenWidth >= DESKTOP_WEB_MIN_WIDTH
}

export function computeViewportSize(screenWidth: number, screenHeight: number, insets: EdgeInsets): { width: number; height: number } {
  return { width: screenWidth - insets.left - insets.right, height: screenHeight - insets.top - insets.bottom }
}

// No goalAxis/rotation parameter at all — unlike AirHockey's computeBoardLayout, board/physics/AI
// stay in canonical local space always (paddles at local-left/local-right, ball travels along
// local X). The rendering layer (game.tsx) is what rotates this local space onto the real screen
// via @tastic/split-screen's getFixedZoneRotation — see the design spec's note below — this
// function never needs to know about real device orientation; game.tsx alone decides which real
// width/height to feed it based on the live orientationMode.
export function computeBoardLayout(screenWidth: number, screenHeight: number, insets: EdgeInsets, paddleSize: PaddleSizeLevel = 'medium'): BoardLayout {
  const { width: availableWidth, height: availableHeight } = computeViewportSize(screenWidth, screenHeight, insets)

  let width = availableWidth
  let height = availableHeight
  if (isDesktopLayout(screenWidth)) {
    height = width / TABLE_WIDTH_TO_HEIGHT_RATIO
    if (height > availableHeight) {
      height = availableHeight
      width = height * TABLE_WIDTH_TO_HEIGHT_RATIO
    }
  }

  const x = insets.left + (availableWidth - width) / 2
  const y = insets.top + (availableHeight - height) / 2

  const ballRadius = height * BALL_RADIUS_RATIO
  const paddleHeight = height * PADDLE_HEIGHT_RATIOS[paddleSize]
  const paddleWidth = height * PADDLE_WIDTH_RATIO
  const paddleInset = width * PADDLE_INSET_RATIO

  return {
    x,
    y,
    width,
    height,
    wallThickness: WALL_THICKNESS,
    ballRadius,
    paddleWidth,
    paddleHeight,
    paddleX: { 1: x + paddleInset, 2: x + width - paddleInset },
    paddleMinY: y + paddleHeight / 2,
    paddleMaxY: y + height - paddleHeight / 2,
    centerX: x + width / 2,
    centerY: y + height / 2
  }
}

export function centerBall(board: BoardLayout): { x: number; y: number } {
  return { x: board.centerX, y: board.centerY }
}

export function centerPaddle(board: BoardLayout, player: Player): { x: number; y: number } {
  return { x: board.paddleX[player], y: board.centerY }
}

// The full equivalent of AirHockey's clampToOwnHalf, just narrower: a Pong paddle only ever moves
// on Y (its X is permanently fixed by board.paddleX), and it covers the full court height rather
// than half of it — there's no "own half" concept left once nothing behind the paddle needs
// defending. Shared by TouchInputLayer's setPaddleTarget (a human's live drag) and aiOpponent's
// target selection, same as AirHockey.
export function clampPaddleY(y: number, board: BoardLayout): number {
  return Math.min(board.paddleMaxY, Math.max(board.paddleMinY, y))
}

// NOTE on the orientation layer built on top of this (see the plan file + BoxHockey source for
// exact @tastic/split-screen usage): when the live orientationMode is 'sideBySide', local space
// maps directly onto the screen (width=local width, height=local height, screenWidth/screenHeight
// passed straight through). When 'faceToFace', the container hosting the board+TouchInputLayer
// tree is rotated 90°/-90° via getFixedZoneRotation, and computeBoardLayout must be called with
// the SWAPPED dimensions (screenHeight passed as screenWidth and vice versa) so the local rect
// still comes out sized correctly for its own rotated container — mirrors AirHockey's original
// computeLocalContainerSize's short/long swap, just resolved one level up in game.tsx rather than
// inside board.ts itself (board.ts stays orientation-agnostic; game.tsx decides which real
// width/height to feed it based on live orientationMode).
