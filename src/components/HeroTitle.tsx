import { getStaggeredWordDuration, StaggeredWord } from '@tastic/hud'
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'

import { MONO_FONT } from '@/constants/fonts'

export interface HeroTitleProps {
  color: string
  // The live theme's p1/p2 colors - whatever the players actually picked (see Theme.tsx), not a
  // fixed pair - so the paddles rallying beneath the title always match the real in-game colors.
  p1Color: string
  p2Color: string
}

const WORD = 'PONG'

const TOTAL_STAGGER_MS = getStaggeredWordDuration(WORD.length)

// The paddles (and the ball they volley) stay hidden until the wordmark has mostly landed - one
// "power on" beat once the letters settle, rather than motion competing with letters still flying
// in - then the rally itself runs forever.
const RALLY_DELAY_MS = Math.round(TOTAL_STAGGER_MS * 0.7)
const PADDLE_IN_MS = 260
const LEG_MS = 520
const ARC_HEIGHT = 6

// Slim bar paddles + a small round ball, matching Board.tsx's own shapes (a real Pong paddle is a
// bar that only ever moves on Y, not a circular mallet).
const PADDLE_WIDTH = 6
const PADDLE_HEIGHT = 22
const PADDLE_RADIUS = 3
const BALL_SIZE = 10
const TRACK_WIDTH = 60
const HALF_TRAVEL = (TRACK_WIDTH - BALL_SIZE) / 2

// Bespoke hero for this game: a staggered word, then two paddles fade in and volley the ball back
// and forth forever - styled after the real in-game paddles/ball (see Board.tsx) so the rally reads
// as an echo of actual gameplay, not just decoration.
export function HeroTitle({ color, p1Color, p2Color }: HeroTitleProps) {
  const reducedMotion = useReducedMotion()

  const entrance = useSharedValue(reducedMotion ? 1 : 0)
  useEffect(() => {
    if (reducedMotion) return
    entrance.value = withDelay(RALLY_DELAY_MS, withTiming(1, { duration: PADDLE_IN_MS, easing: Easing.out(Easing.cubic) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])

  // Rally position: 0 = ball at the left paddle, 1 = at the right paddle. Runs 0→1→0→1… forever
  // once the paddles have landed, so the same value also drives each paddle's "just made contact"
  // pulse below - no separate hit-detection state needed.
  const t = useSharedValue(reducedMotion ? 0.5 : 0)
  useEffect(() => {
    if (reducedMotion) return
    t.value = withDelay(RALLY_DELAY_MS + PADDLE_IN_MS, withRepeat(withSequence(withTiming(1, { duration: LEG_MS, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: LEG_MS, easing: Easing.inOut(Easing.quad) })), -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ scale: 0.85 + entrance.value * 0.15 }]
  }))
  const leftPaddleStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.value, [0, 0.18], [1.22, 1], 'clamp') }] }))
  const rightPaddleStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.value, [0.82, 1], [1, 1.22], 'clamp') }] }))
  const ballStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(t.value, [0, 1], [-HALF_TRAVEL, HALF_TRAVEL]) }, { translateY: -Math.sin(t.value * Math.PI) * ARC_HEIGHT }]
  }))

  return (
    <View style={styles.wrapper}>
      <StaggeredWord word={WORD} startIndex={0} color={color} reducedMotion={reducedMotion} fontFamily={MONO_FONT} fontSize={40} lineHeight={48} letterSpacing={4} />

      <Animated.View style={[styles.lineRow, entranceStyle]}>
        <Animated.View style={[styles.paddle, { backgroundColor: p1Color }, leftPaddleStyle]} />

        <View style={styles.track}>
          <Animated.View pointerEvents='none' style={[styles.ball, { backgroundColor: color }, ballStyle]} />
        </View>

        <Animated.View style={[styles.paddle, { backgroundColor: p2Color }, rightPaddleStyle]} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  ball: {
    borderRadius: BALL_SIZE / 2,
    height: BALL_SIZE,
    width: BALL_SIZE
  },
  lineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 14
  },
  paddle: {
    borderRadius: PADDLE_RADIUS,
    height: PADDLE_HEIGHT,
    width: PADDLE_WIDTH
  },
  track: {
    alignItems: 'center',
    height: PADDLE_HEIGHT,
    justifyContent: 'center',
    width: TRACK_WIDTH
  },
  wrapper: {
    alignItems: 'center'
  }
})
