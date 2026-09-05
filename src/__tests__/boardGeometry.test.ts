import { PADDLE_HEIGHT_RATIOS, TABLE_WIDTH_TO_HEIGHT_RATIO } from '@/constants/game'
import { PaddleSizeLevel } from '@/types'
import { centerBall, centerPaddle, clampPaddleY, computeBoardLayout } from '@/utils/board'

const insets = { top: 0, bottom: 0, left: 0, right: 0 }
const sizes: PaddleSizeLevel[] = ['small', 'medium', 'large']

describe('paddleHeight scales per PaddleSizeLevel tier', () => {
  it.each(sizes)('matches PADDLE_HEIGHT_RATIOS at paddleSize=%s', (size) => {
    const board = computeBoardLayout(900, 400, insets, size)
    expect(board.paddleHeight).toBeCloseTo(board.height * PADDLE_HEIGHT_RATIOS[size], 5)
  })

  it('a larger tier produces a taller paddle than a smaller one', () => {
    const small = computeBoardLayout(900, 400, insets, 'small')
    const large = computeBoardLayout(900, 400, insets, 'large')
    expect(large.paddleHeight).toBeGreaterThan(small.paddleHeight)
  })
})

describe('paddleX', () => {
  it('player 1 always sits left of player 2, both inset from their own edge', () => {
    const board = computeBoardLayout(900, 400, insets, 'medium')
    expect(board.paddleX[1]).toBeLessThan(board.paddleX[2])
    expect(board.paddleX[1]).toBeGreaterThan(board.x)
    expect(board.paddleX[2]).toBeLessThan(board.x + board.width)
  })

  it('stays proportionally symmetric around centerX regardless of paddleSize (inset is width-derived, not size-tiered)', () => {
    const board = computeBoardLayout(900, 400, insets, 'medium')
    const insetP1 = board.paddleX[1] - board.x
    const insetP2 = board.x + board.width - board.paddleX[2]
    expect(insetP1).toBeCloseTo(insetP2, 5)
  })
})

describe('ballRadius', () => {
  it('scales with board HEIGHT, not width — the axis that stays meaningful across both seating orientations', () => {
    const short = computeBoardLayout(900, 300, insets, 'medium')
    const tall = computeBoardLayout(900, 600, insets, 'medium')
    expect(tall.ballRadius).toBeGreaterThan(short.ballRadius)
  })
})

describe('paddleMinY / paddleMaxY', () => {
  it('bracket centerY, inset by paddleHeight/2, spanning the FULL board height — no half-court clamp, unlike AirHockey', () => {
    const board = computeBoardLayout(900, 400, insets, 'medium')
    expect(board.paddleMinY).toBeCloseTo(board.y + board.paddleHeight / 2, 5)
    expect(board.paddleMaxY).toBeCloseTo(board.y + board.height - board.paddleHeight / 2, 5)
    expect(board.centerY).toBeGreaterThan(board.paddleMinY)
    expect(board.centerY).toBeLessThan(board.paddleMaxY)
    expect(board.paddleMaxY - board.paddleMinY).toBeCloseTo(board.height - board.paddleHeight, 5)
  })
})

describe('desktop web letterboxing', () => {
  const originalPlatform = require('react-native').Platform.OS

  afterEach(() => {
    require('react-native').Platform.OS = originalPlatform
  })

  it('fixes the board to TABLE_WIDTH_TO_HEIGHT_RATIO on wide desktop web viewports', () => {
    require('react-native').Platform.OS = 'web'
    const board = computeBoardLayout(2000, 900, insets, 'medium') // width is the tight constraint here
    expect(board.width / board.height).toBeCloseTo(TABLE_WIDTH_TO_HEIGHT_RATIO, 3)
    expect(board.width).toBeLessThan(2000) // letterboxing actually engaged, not just a coincidence
  })

  it('does not letterbox on native/mobile — the board fills the viewport exactly, whatever its shape', () => {
    require('react-native').Platform.OS = 'ios'
    const board = computeBoardLayout(2000, 900, insets, 'medium')
    expect(board.width).toBeCloseTo(2000, 5)
    expect(board.height).toBeCloseTo(900, 5)
  })
})

describe('centerBall / centerPaddle / clampPaddleY', () => {
  it('centerBall places the ball at the exact board center', () => {
    const board = computeBoardLayout(900, 400, insets, 'medium')
    const c = centerBall(board)
    expect(c.x).toBeCloseTo(board.centerX, 5)
    expect(c.y).toBeCloseTo(board.centerY, 5)
  })

  it('centerPaddle places each player at their own FIXED X, board center Y', () => {
    const board = computeBoardLayout(900, 400, insets, 'medium')
    const p1 = centerPaddle(board, 1)
    const p2 = centerPaddle(board, 2)
    expect(p1.x).toBeCloseTo(board.paddleX[1], 5)
    expect(p2.x).toBeCloseTo(board.paddleX[2], 5)
    expect(p1.y).toBeCloseTo(board.centerY, 5)
    expect(p2.y).toBeCloseTo(board.centerY, 5)
  })

  it('clampPaddleY clamps to [paddleMinY, paddleMaxY] and leaves an in-range value untouched', () => {
    const board = computeBoardLayout(900, 400, insets, 'medium')
    expect(clampPaddleY(board.y - 1000, board)).toBeCloseTo(board.paddleMinY, 5)
    expect(clampPaddleY(board.y + board.height + 1000, board)).toBeCloseTo(board.paddleMaxY, 5)
    expect(clampPaddleY(board.centerY, board)).toBeCloseTo(board.centerY, 5)
  })
})
