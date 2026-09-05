import { useAutoPaperTheme } from '@rific/auto-paper'
import { Canvas, DashPathEffect, Line, Rect, RoundedRect, vec } from '@shopify/react-native-skia'
import { Disc } from '@tastic/sprites/shapes'
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { cancelAnimation, Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'

import { BallState, BoardLayout, GamePhase, PaddleStates } from '@/types'

export interface BoardProps {
  board: BoardLayout
  ball: BallState
  paddles: PaddleStates
  phase: GamePhase
  // Perimeter top/bottom walls — see game.tsx's isDesktopWeb. On a phone (native or mobile web)
  // they'd sit redundantly right against the device's own physical edge, which already reads as the
  // boundary; only desktop web, with no such edge, gets them drawn.
  showWalls: boolean
}

export default function Board({ board, ball, paddles, phase, showWalls }: BoardProps) {
  const { x, y, width, height, wallThickness, ballRadius, paddleWidth, paddleHeight } = board
  const { colors: themeColors, dark } = useAutoPaperTheme()

  // Retro-vector palette, same convention as the games this was cloned from: the board's own
  // structure (walls/centerline) and the ball are a literal black/white-by-appearance neutral, not
  // a themed color, since they're scaffolding rather than a gameplay signal — a player's own paddle
  // color is the only saturated color on screen.
  const wallColor = dark ? '#FFFFFF' : '#000000'
  const centerLineColor = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'
  const p1Color = themeColors.primary
  const p2Color = themeColors.secondary

  // A gentle "not live yet" breathe during the pre-game/post-point pause — plain and static once
  // play is actually live. Mirrors AirHockey's own puck ring pulse, just applied to the ball's own
  // fill opacity instead of a separate ring (the ball has no ring here, just a filled circle).
  const waiting = phase !== 'live'
  const idlePulseT = useSharedValue(0)
  useEffect(() => {
    if (waiting) {
      idlePulseT.value = 0
      idlePulseT.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true)
    } else {
      cancelAnimation(idlePulseT)
      idlePulseT.value = 0
    }
  }, [waiting]) // eslint-disable-line react-hooks/exhaustive-deps
  const ballOpacity = useDerivedValue(() => (waiting ? 0.5 + idlePulseT.value * 0.5 : 1))

  // ~0.3x paddleWidth corner radius, per the design spec — a small, subtle round rather than a
  // fully pill-shaped bar.
  const paddleCornerRadius = paddleWidth * 0.3

  return (
    <View style={styles.container}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Dashed center line at board.centerX — Pong has no "own half" clamp the way AirHockey's
            solid centerline implied (see clampPaddleY in utils/board.ts, which spans the FULL board
            height for both paddles), so this is purely a classic-Pong visual cue, not a rule
            boundary. */}
        <Line p1={vec(board.centerX, y)} p2={vec(board.centerX, y + height)} color={centerLineColor} strokeWidth={2}>
          <DashPathEffect intervals={[10, 10]} />
        </Line>

        {/* Perimeter top/bottom walls — desktop web only, see BoardProps' showWalls doc comment. */}
        {showWalls && (
          <>
            <Rect x={x - wallThickness} y={y - wallThickness} width={width + wallThickness * 2} height={wallThickness} color={wallColor} />
            <Rect x={x - wallThickness} y={y + height} width={width + wallThickness * 2} height={wallThickness} color={wallColor} />
          </>
        )}

        {/* Paddles — bars, not discs (see BoardLayout's own paddleWidth/paddleHeight doc comment in
            types/index.ts): each only ever moves on Y, drawn centered on paddles[player].y at its
            fixed board.paddleX[player]. */}
        <RoundedRect x={paddles[1].x - paddleWidth / 2} y={paddles[1].y - paddleHeight / 2} width={paddleWidth} height={paddleHeight} r={paddleCornerRadius} color={p1Color} />
        <RoundedRect x={paddles[2].x - paddleWidth / 2} y={paddles[2].y - paddleHeight / 2} width={paddleWidth} height={paddleHeight} r={paddleCornerRadius} color={p2Color} />

        {/* Ball — softly pulsing while waiting to go live. Ring-less Disc (no ringColor): a plain
            filled circle, matching this game's pre-@tastic/sprites rendering exactly — see Disc's
            own doc comment, which calls out Pong's ball by name as the ring-less case. */}
        <Disc x={ball.x} y={ball.y} radius={ballRadius} color={wallColor} opacity={ballOpacity} />
      </Canvas>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }
})
