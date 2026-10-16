import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button, IconButton, useVibration } from '@rific/feedback-press'
import { useToast } from '@rific/toaster'
import { broadcastDeviceUnlocks } from '@tastic/achievements'
import { rotateInsets, useBackgroundPause, useOrientationState } from '@tastic/core'
import { AchievementUnlockList, type AchievementUnlockOwner, ConfirmDialog, OverlayBackdrop, OverlayCard, useOverlayCardColors, useQuitConfirmation } from '@tastic/hud'
import { Profile, ProfileChip } from '@tastic/profile'
import { needsSharedNeutralZone } from '@tastic/split-screen'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'

import Board from '@/components/BoardHost'
import KeyboardInputLayer from '@/components/KeyboardInputLayer'
import { SettingsDialog } from '@/components/SettingsDialog'
import TiltInputLayer from '@/components/TiltInputLayer'
import TouchInputLayer from '@/components/TouchInputLayer'
import { ACHIEVEMENT_TIER_COLORS } from '@/constants/achievements'
import { MONO_FONT } from '@/constants/fonts'
import { DESKTOP_WEB_MIN_WIDTH, SOLO_LIVES } from '@/constants/game'
import { useAIOpponent } from '@/hooks/useAIOpponent'
import { useGameSound } from '@/hooks/useGameSound'
import { useGameState } from '@/hooks/useGameState'
import { useGameStats } from '@/hooks/useGameStats'
import { useProfiles } from '@/hooks/useProfiles'
import { liveplayActions } from '@/redux/liveplaySlice'
import { DEFAULT_SETTINGS } from '@/redux/settingsSlice'
import type { AppDispatch, RootState } from '@/redux/store'
import { AchievementDefinition, Player } from '@/types'
import { computeBoardLayout } from '@/utils/board'
import { humanPlayersFor, tiltControlActiveFor } from '@/utils/gameMode'
import { safeBack } from '@/utils/navigation'

// Converts a point expressed in the board's own LOCAL coordinate space (the same frame board.x/y/
// paddleX live in) into a real, absolute screen position - the exact inverse of TouchInputLayer's
// own screenToLocalY, generalized to both axes since floating UI (score labels, corner buttons)
// needs a full 2D screen position, not just a Y. Used to anchor floating UI to a point ON the board
// (e.g. "near board's own top-left corner") so it lands in the correct real screen location
// regardless of live rotation, mirroring how BoxHockey's MatchOverlays rotates its dialog card in
// place rather than reflowing layout.
function localToScreen(localX: number, localY: number, containerWidth: number, containerHeight: number, screenCenterX: number, screenCenterY: number, rotation: 0 | 90 | -90): { x: number; y: number } {
  const lx = localX - containerWidth / 2
  const ly = localY - containerHeight / 2
  let dx: number
  let dy: number
  if (rotation === 90) {
    dx = -ly
    dy = lx
  } else if (rotation === -90) {
    dx = ly
    dy = -lx
  } else {
    dx = lx
    dy = ly
  }
  return { x: screenCenterX + dx, y: screenCenterY + dy }
}

const SEATS: readonly Player[] = [1, 2]

export default function GameScreen() {
  // Committed once by /loadout when every human player readied up - falls back to defaults for a
  // direct/deep link to this screen, which never went through /loadout to commit anything.
  const activeRoundSettings = useSelector((state: RootState) => state.liveplay.activeRoundSettings)
  const dispatch = useDispatch<AppDispatch>()
  const { recordMatchOutcome, recordSoloOutcome } = useGameStats()
  const { clear: clearToasts, success: showAchievementToast } = useToast()
  const roundSettings = activeRoundSettings ?? DEFAULT_SETTINGS
  const scoreToWin = roundSettings.scoreToWin
  const paddleSize = roundSettings.paddleSize
  const ballSpeed = roundSettings.ballSpeed
  const isSolo = roundSettings.gameMode === 'solo'
  // Only P2 can be CPU-controlled - pass-and-play stays the default, single-player just swaps who
  // controls P2's paddle (see useAIOpponent, which drives it through the exact same setPaddleTarget
  // path a human's touch uses). null for solo too - there's no seat 2 to control at all.
  const aiPlayer: Player | null = roundSettings.gameMode === 'vsCpu' ? 2 : null
  const aiDifficulty = roundSettings.aiDifficulty
  const humanPlayers = humanPlayersFor(roundSettings.gameMode)
  const tiltControlActive = tiltControlActiveFor(roundSettings.gameMode, roundSettings.tiltControlEnabled)

  // ─── Orientation / rotation ────────────────────────────────────────────────
  // orientationMode/upsideDown are live accelerometer tilt readings, frozen at their last value while
  // the Lock Orientation setting is on. That lock is app-wide (_layout.tsx's OrientationProvider
  // freezes the shared reading under `freezeWhileLocked`), so it's live settings, not roundSettings,
  // and toggling it from this screen's own Settings dialog applies mid-round. The only per-screen
  // lock left here is tilt control's, below.
  //
  // DELIBERATE DEVIATION from calling @tastic/core's getFixedZoneRotation directly: that
  // function (verified against the installed package's actual source, src/rotation.ts) returns 0 for
  // 'faceToFace' and ±90 for 'sideBySide' - the correct polarity for BoxHockey/AirHockey's own board,
  // which is PORTRAIT-native in local space (goals/paddle-separation along local Y) and so needs zero
  // rotation exactly when the device is held upright/portrait (faceToFace) and a compensating ±90
  // only when physically turned sideways (sideBySide) to still read correctly. Pong's board is the
  // mirror image - LANDSCAPE-native in local space (paddle separation along local X, the long axis -
  // see BoardLayout's own doc comment in types/index.ts) - so it needs the OPPOSITE polarity: zero
  // rotation for sideBySide (the device is already physically turned so its long edge runs left-
  // right, matching Pong's native wide shape with no correction needed) and ±90 for faceToFace (the
  // device stays portrait/unrotated under app.json's OS-level portrait lock, so the wide board must
  // still be rotated to present correctly to two players seated at its near/far ends - the same
  // swap-and-rotate escape hatch FakeLandscapeView itself uses for wide content, just triggered by
  // the opposite orientationMode, since FakeLandscapeView's own content - the home/loadout screens -
  // is authored tall/stacked-native instead). A literal `getFixedZoneRotation(orientationMode, ...)`
  // call here would rotate the board exactly backwards (rotating the one mode that's already correct,
  // and leaving unrotated the one mode that genuinely needs it) - confirmed by cross-checking against
  // AirHockey's own OLD (portrait-native) rotation wrapper, whose goalAxis === 'horizontal' branch
  // (its own sideBySide-equivalent) is the one that rotates, mirroring getFixedZoneRotation's real
  // convention for tall-native content exactly, which is the mirror image of what a wide-native board
  // needs.
  //
  // The sign for faceToFace is keyed off `upsideDown` (the only live-varying signal in that mode -
  // useOrientationState's own faceToFace reading hardcodes p1OnRight: true, so it can never
  // actually distinguish anything) rather than derived from theory - like AirHockey's original
  // rotation wrapper, whose own rotation SIGN was "confirmed empirically" against the real render
  // rather than reasoned out in the abstract, this polarity should be spot-checked in a simulator by
  // rotating through both faceToFace placements and flipped if player 1's paddle doesn't end up
  // nearest whichever seat is holding the device's own "right-side-up" reading direction.
  // `locked` = tiltControlActive: a per-screen lock on top of the app-wide Lock Orientation setting,
  // forced whenever tilt steering is active even with that setting off. This same reading drives the
  // board's own `rotation` below, and a sustained extreme steering tilt held past this hook's own
  // ~275ms commit window could otherwise cross its dominance-ratio threshold and flip
  // orientationMode/upsideDown, visually rotating the whole board mid-rally. roundSettings is frozen
  // for the entire round (see liveplaySlice.ts's activeRoundSettings doc), so this engages the
  // instant this screen mounts (well before any actual tilt-steering begins) and never toggles again
  // mid-round.
  const { orientationMode, upsideDown } = useOrientationState(tiltControlActive)
  // vsCpu always seats the sole human at player 1 (see humanPlayersFor) - pin them to the visual
  // bottom of a portrait/faceToFace hold, the natural single-hand grip, rather than the ±90/
  // upsideDown pairing above. That pairing is tuned for two-player pass-and-play, where either seat
  // is equally valid and the upsideDown compensation instead keeps player 1 consistently reading
  // upright from whichever seat physically picked up the device - a meaningless distinction with
  // only one seat, and one that happens to land the lone human at the TOP (CPU at the bottom) for
  // the common upsideDown===false hold, backwards from where a solo player's thumb actually is.
  const rotation: 0 | 90 | -90 = orientationMode !== 'faceToFace' ? 0 : aiPlayer !== null ? (upsideDown ? 90 : -90) : upsideDown ? -90 : 90

  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // Remaps insets onto the correct visual edge for the board's own rotated container - see
  // rotateInsets' own doc comment in @tastic/core. Applied wherever this screen's floating
  // UI needs to reason about the board's own (possibly rotated) edges, via computeBoardLayout below
  // (board.x/y/width/height end up correctly inset once, not the real screen's raw insets).
  const rotatedInsets = useMemo(() => rotateInsets(insets, rotation), [insets, rotation])

  // Pre-rotation container dimensions: real width/height directly for sideBySide (no swap - local
  // space maps straight onto the screen), SWAPPED for faceToFace (sizes the local rect correctly for
  // the container that's about to be rotated 90°/-90° to display it) - see computeBoardLayout's own
  // NOTE on the orientation layer in utils/board.ts.
  const containerWidth = rotation === 0 ? width : height
  const containerHeight = rotation === 0 ? height : width

  const board = useMemo(() => computeBoardLayout(containerWidth, containerHeight, rotatedInsets, paddleSize), [containerWidth, containerHeight, rotatedInsets, paddleSize])

  // Settings/quit-confirm dialogs pause gameplay while open.
  const [settingsOpen, setSettingsOpen] = useState(false)
  // useQuitConfirmation reads hasProgress lazily (only inside a real requestBack() call, via its
  // own ref-mirrored getter - see that hook's own doc) rather than taking a plain boolean, which is
  // exactly what makes this safe to call before `state` exists yet: `state` (lives/bricks/scores)
  // comes from useGameState, which itself needs `paused` (derived from confirmVisible) as an INPUT,
  // so a plain-boolean argument computed from `state` here would be a real circular render
  // dependency. hasProgressRef breaks the remaining direct textual reference to lives/bricks/scores
  // (react-hooks/immutability flags reading a binding before its own declaration, even one only
  // ever invoked later - see the mirroring effect right after `state` is destructured below) -
  // it's reassigned every render via the same effect-based "ref mirrors latest value" idiom this
  // file already uses for vibrationRef/soundRef, so requestBack still always calls whatever
  // lives/bricks/scores were bound to as of the most recently committed render, same as before.
  // scores stays [0,0] the whole round in solo (see useGameState's TICK case) - a lost life or a
  // broken brick is solo's own equivalent of "there's progress worth confirming before losing it".
  const hasProgressRef = useRef<() => boolean>(() => false)
  const { confirmVisible, requestBack, cancelBack } = useQuitConfirmation(() => hasProgressRef.current(), safeBack)
  // Leaving the app mid-match (home, app switch, a phone call, Control Center) latches a pause that
  // only the Paused dialog's Resume clears - see @tastic/core's useBackgroundPause. Skipped once the
  // match is over, or while a dialog already holds the pause by itself.
  const { backgroundPaused, resume } = useBackgroundPause(() => phase !== 'gameOver' && !settingsOpen && !confirmVisible)
  // Keeps the screen from dimming and locking while a match is up, unless Keep Awake is off in
  // Settings (read live, so the toggle applies mid-match). Expo only does this by itself in
  // development builds, and the OS auto-lock only counts screen touches, so tilt or keyboard steering,
  // or watching the CPU, could let a release build lock mid-match. Failures are dropped: a browser
  // without the Screen Wake Lock API (or one that refuses it) just keeps its own timeout.
  const keepAwake = useSelector((state: RootState) => state.settings.keepAwake)
  useEffect(() => {
    if (!keepAwake) return undefined
    activateKeepAwakeAsync('game').catch(() => {})
    return () => {
      deactivateKeepAwake('game').catch(() => {})
    }
  }, [keepAwake])
  const paused = settingsOpen || confirmVisible || backgroundPaused

  // Two-player (pass-and-play) only - seat -> that seat's own newly-unlocked achievements this
  // game, read by the two-player game-over overlay below to badge each seat correctly (see the
  // gameOver effect below for why this replaces showAchievementToast for that mode specifically).
  const [seatUnlocks, setSeatUnlocks] = useState<Partial<Record<Player, AchievementDefinition[]>>>({})

  const { state, setPaddleTarget, resetGame } = useGameState(board, scoreToWin, ballSpeed, roundSettings.gameMode, roundSettings.bricksEnabled, paused)
  const { phase, ball, paddles, scores, bounceCount, bricks, lives } = state

  // See hasProgressRef's own comment above - mirrors the real hasProgress check into it every
  // render, now that lives/bricks/scores actually exist to read.
  useEffect(() => {
    // Once the match is over (gameOver) its stats are already recorded and nothing is lost, so back
    // exits at once, the same as the Game Over card's own buttons.
    hasProgressRef.current = () => phase !== 'gameOver' && (isSolo ? lives < SOLO_LIVES || bricks.some((b) => b.destroyed) : scores[0] > 0 || scores[1] > 0)
  })

  // Mirrors "an actual live rally, not paused" into liveplay.activelyPlaying for Providers.tsx's
  // EdgeGuardBridge rather than calling useEdgeGestureGuard directly here: it stays mounted once for
  // the app's lifetime, and this is just the one signal it has no other way to read. Unlocked between points (idle/pointScored/gameOver) and whenever a
  // dialog is open (paused) - back/settings stay unconditionally visible here (unlike Snake/
  // LightCycles), so there's no button-visibility signal to key off instead. Reset to false on
  // unmount too, so leaving this screen mid-rally by any path can't leave Edge Guard stuck on.
  useEffect(() => {
    dispatch(liveplayActions.setActivelyPlaying(phase === 'live' && !paused))
    return () => {
      dispatch(liveplayActions.setActivelyPlaying(false))
    }
  }, [phase, paused, dispatch])

  // No toast may stay on screen during live play - only between rounds or at game over. Unlock
  // toasts fire at game over and last 7s, so a quick restart would otherwise carry them into the
  // next rally.
  useEffect(() => {
    if (phase === 'live') clearToasts()
  }, [phase, clearToasts])

  useAIOpponent(state, board, aiPlayer, aiDifficulty, paused, setPaddleTarget)

  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_WEB_MIN_WIDTH

  const { dark, colors: themeColors } = useAutoPaperTheme()
  const bg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'
  // The Game Over card and the dialogs' score lines sit on @tastic/hud's OverlayCard, so their text
  // takes its theme colors rather than this screen's literal black/white.
  const { fg: cardFg, fgMuted } = useOverlayCardColors()

  const playerColor: Record<Player, string> = { 1: themeColors.primary, 2: themeColors.secondary }
  const playerOnColor: Record<Player, string> = { 1: themeColors.onPrimary, 2: themeColors.onSecondary }
  const winner: Player = scores[0] >= scoreToWin ? 1 : 2
  const loser: Player = winner === 1 ? 2 : 1

  // Neither AirHockey nor BoxHockey renders a bare ProfileChip directly - both only ever consume it
  // indirectly through ProfilePicker/ProfilesManager - so this is the one spot in the whole family
  // that reads useProfiles() just to look a profile up by id, not to drive a picker of its own.
  // Falls back to the plain 'P1'/'P2' label (same idle text ProfilePicker's own guestLabel would
  // show) whenever the winning seat never had a profile selected for this round.
  const { profiles, lastSelected } = useProfiles()
  const winnerProfile = profiles.find((p) => p.id === lastSelected[winner]) ?? null
  // Whichever profile each seat had selected, if any - read the same way winnerProfile just
  // above is, so the two-player achievement badges below can identify whose unlock is whose.
  const seatProfile: Partial<Record<Player, Profile>> = { 1: profiles.find((p) => p.id === lastSelected[1]) ?? undefined, 2: profiles.find((p) => p.id === lastSelected[2]) ?? undefined }
  const achievementOwners: Record<Player, AchievementUnlockOwner> = { 1: { profile: seatProfile[1], color: playerColor[1] }, 2: { profile: seatProfile[2], color: playerColor[2] } }

  const vibration = useVibration()
  const vibrationRef = useRef(vibration)
  // Mirrored every render so the stable effects below can read the latest vibration handle without
  // needing it in their own deps - done inside an effect (no dependency array, so it reruns after
  // every render) rather than as a bare assignment in the component body, matching AirHockey's own
  // identical vibrationRef in its game.tsx: a bare `.current =` write during render is a render-time
  // side effect the react-hooks/refs rule (rightly) flags, since React may render this component
  // more than once for a single commit (e.g. under StrictMode or a Suspense retry) without any of
  // those extra renders actually reaching the browser/device - an effect only fires once per real commit.
  useEffect(() => {
    vibrationRef.current = vibration
  })

  // Gameplay SFX - mirrors the haptics above one-for-one: each event fires its soundRef.current.
  // playX() beside the matching vibrationRef.current.x(). Ref-mirrored the same way vibration is
  // above, not called directly, so the effects below don't need these in their dependency arrays.
  const playBounce = useGameSound(require('../../assets/sounds/bounce.wav'))
  const playGoal = useGameSound(require('../../assets/sounds/goal.wav'))
  const playWin = useGameSound(require('../../assets/sounds/win.wav'))
  const soundRef = useRef({ playBounce, playGoal, playWin })
  // See vibrationRef's own comment above for why this is an effect rather than a bare render-time assignment.
  useEffect(() => {
    soundRef.current = { playBounce, playGoal, playWin }
  })

  const firstBounceRender = useRef(true)
  useEffect(() => {
    if (firstBounceRender.current) {
      firstBounceRender.current = false
      return
    }
    vibrationRef.current.short()
    soundRef.current.playBounce()
  }, [bounceCount])

  const prevScoresRef = useRef(scores)
  useEffect(() => {
    const [prevP1, prevP2] = prevScoresRef.current
    prevScoresRef.current = scores
    if (scores[0] !== prevP1 || scores[1] !== prevP2) {
      vibrationRef.current.notification()
      soundRef.current.playGoal()
    }
  }, [scores])

  const prevPhaseRef = useRef(phase)
  useEffect(() => {
    if (prevPhaseRef.current !== 'gameOver' && phase === 'gameOver') {
      soundRef.current.playWin()
      // Recorded on the transition rather than in the reducer, which runs every physics step and
      // has no notion of "this is new". prevPhaseRef guards a re-run from any other dep changing.
      if (isSolo) {
        // Solo has no opponent/score-tuple shape to fit into MatchOutcome - a genuinely separate
        // recording path (see recordSoloOutcome), not a solo-shaped MatchOutcome. lives > 0 at
        // gameOver means every brick was cleared (see useGameState's TICK case); lives <= 0 means
        // the player ran out.
        const result = recordSoloOutcome({ cleared: lives > 0, bricksDestroyed: bricks.filter((b) => b.destroyed).length }, lastSelected[1] ?? undefined)
        ;(broadcastDeviceUnlocks([1] as Player[], result.profiles, result.device, { 1: lastSelected[1] ?? undefined })[1] ?? []).forEach((achievement) => {
          showAchievementToast(achievement.title, 'Achievement unlocked', undefined, { color: ACHIEVEMENT_TIER_COLORS[achievement.tier], icon: achievement.icon })
        })
      } else {
        const matchWinner: Player = scores[0] >= scoreToWin ? 1 : 2
        const profileIds = { 1: lastSelected[1] ?? undefined, 2: aiPlayer === null ? (lastSelected[2] ?? undefined) : undefined }
        // bricksDestroyed is 0 whenever the Bricks toggle was off for this round - correctly a
        // no-op add to the shared counter, not something that needs its own on/off branch here.
        const result = recordMatchOutcome({ winner: matchWinner, scores: [scores[0], scores[1]] }, { gameMode: roundSettings.gameMode, aiDifficulty, ballSpeed, profileIds, bricksDestroyed: bricks.filter((b) => b.destroyed).length })
        if (aiPlayer === null) {
          // Genuine two-seat pass-and-play - showAchievementToast below is a single, screen-fixed
          // @rific/toaster call with no rotation of its own, so it only ever reads right-side-up
          // for whichever seat happens to match the CURRENT `rotation`. A player seated opposite
          // (the other end of a faceToFace hold) would see it upside-down even though it's their
          // own achievement. Broadcasting into seatUnlocks instead lets the two-player game-over
          // overlay below (which already carries the board's own rotationStyle) show each seat's
          // own unlocks once the match settles - same fix LightCycles's game.tsx applies via its
          // own profileUnlockToast, for the identical reason. The winner's seat also gets the
          // device-wide unlocks that are really its own (all of them for a guest, only scope:
          // 'device' ones for a profile; see @tastic/achievements' broadcastDeviceUnlocks). The
          // loser's card shows only its own (audit F037).
          const broadcast = broadcastDeviceUnlocks([1, 2] as Player[], result.profiles, result.device, profileIds, { winners: [matchWinner] })
          // eslint-disable-next-line react-hooks/set-state-in-effect -- a real one-shot transition guarded by prevPhaseRef above, not a render loop; the sibling vsCpu branch below fires showAchievementToast (which does the same thing inside @rific/toaster) unconditionally in this same effect
          setSeatUnlocks(broadcast)
        } else {
          // vsCpu only ever has one human perspective (seat 1) to address - see the rotation
          // comment above for why this mode never enters a genuine faceToFace two-seat hold in
          // the first place - so the shared, screen-fixed toast is fine here.
          ;(broadcastDeviceUnlocks([1] as Player[], result.profiles, result.device, profileIds)[1] ?? []).forEach((achievement) => {
            showAchievementToast(achievement.title, 'Achievement unlocked', undefined, { color: ACHIEVEMENT_TIER_COLORS[achievement.tier], icon: achievement.icon })
          })
        }
      }
    }
    prevPhaseRef.current = phase
  }, [phase, scores, scoreToWin, aiPlayer, aiDifficulty, ballSpeed, lastSelected, roundSettings.gameMode, recordMatchOutcome, isSolo, lives, bricks, recordSoloOutcome, showAchievementToast])

  // ─── Floating UI placement ─────────────────────────────────────────────────
  // Score labels and the back/settings buttons all live OUTSIDE the board's own rotated container
  // (they're floating UI, not part of the playing field - the board itself never rotates twice) and
  // are individually positioned via localToScreen + their own small rotate transform, the same
  // technique BoxHockey's MatchOverlays uses for its dialog card.
  const screenCenterX = width / 2
  const screenCenterY = height / 2

  // Anchored to the board's OWN rect (board.x/y/width/height, not the raw container) so placement
  // automatically respects both the rotated safe-area insets AND any desktop-web letterboxing.
  const scoreMargin = 20
  // Desktop web keeps back/settings in the page's own top corners (see backSlot below), which a
  // court that fills the window puts right on top of these labels, so there each label sits further
  // in along the court's edge, beside its chip instead of under it.
  const scoreMarginAlong = isDesktopWeb ? 96 : scoreMargin
  const p1ScorePos = localToScreen(board.x + scoreMarginAlong, board.y + scoreMargin, containerWidth, containerHeight, screenCenterX, screenCenterY, rotation)
  const p2ScorePos = localToScreen(board.x + board.width - scoreMarginAlong, board.y + scoreMargin, containerWidth, containerHeight, screenCenterX, screenCenterY, rotation)
  // Player 2 sits at the OPPOSITE end of a face-to-face hold (see the rotation comment above) - its
  // own label needs the opposing 180° reading direction to stay upright from player 2's own seat.
  // For sideBySide (rotation 0) this is trivially still 0 - both players share the same viewing
  // angle there, so no relative flip is needed.
  const p2Rotation: 0 | 90 | -90 = rotation === 90 ? -90 : rotation === -90 ? 90 : 0

  const buttonMargin = 16
  const backPos = localToScreen(board.x + buttonMargin, board.y + board.height - buttonMargin, containerWidth, containerHeight, screenCenterX, screenCenterY, rotation)
  const settingsPos = localToScreen(board.x + board.width - buttonMargin, board.y + board.height - buttonMargin, containerWidth, containerHeight, screenCenterX, screenCenterY, rotation)

  const rotationStyle = rotation !== 0 ? { transform: [{ rotate: `${rotation}deg` }] } : undefined
  const p2RotationStyle = p2Rotation !== 0 ? { transform: [{ rotate: `${p2Rotation}deg` }] } : undefined

  // See @tastic/split-screen's needsSharedNeutralZone for the full reasoning. Board-corner
  // positioning above (backPos/settingsPos + rotationStyle, P1's own reading direction) is fine for
  // vsCpu/sideBySide, but breaks down for two-player faceToFace: unlike the score labels just above
  // (two independent instances, each correctly rotated for its own player via p1/p2RotationStyle),
  // there's only ONE back chip and ONE settings chip - a single shared element can't simultaneously
  // read right-side-up for both players when they're seated on opposite ends. neutralZoneStyle below
  // sidesteps that instead of trying to solve it: pinned to the real screen's own left/right edge,
  // vertically centered, the same neutral midline LightCycles'/BoxHockey's in-match chips use - still
  // carrying rotationStyle (not p2RotationStyle) since that ±90° reflects the whole board's own
  // landscape-native-vs-portrait-hold orientation, not a P1-vs-P2 opposing flip, and stays needed
  // even here for the icon to read upright at all.
  const neutralZone = needsSharedNeutralZone(orientationMode, humanPlayers.length)
  // Desktop web: the page's own top corners, upright, the same spot as hud's CornerActionButtons on
  // every other screen. Both players share one screen, keyboard and mouse there, so there's no far
  // seat for the neutral edge to serve, and the page is always read upright.
  const backSlot = { top: 8 + insets.top, left: 8 + insets.left }
  const settingsSlot = { top: 8 + insets.top, right: 8 + insets.right }

  const progressMessage = isSolo ? (
    <Text style={{ color: fgMuted }}>
      {lives} {lives === 1 ? 'life' : 'lives'} · {bricks.filter((b) => b.destroyed).length} / {bricks.length} bricks
    </Text>
  ) : (
    <>
      <Text style={{ color: playerColor[1] }}>{scores[0]}</Text>
      <Text style={{ color: fgMuted }}> - </Text>
      <Text style={{ color: playerColor[2] }}>{scores[1]}</Text>
    </>
  )
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Board's own rotated container - see the rotation comment above for why, unlike
          BoxHockey/AirHockey's portrait-native board, Pong's landscape-native board genuinely needs
          to visually rotate for a face-to-face portrait hold. Sized to containerWidth/containerHeight
          (the pre-swap dimensions - since a 90°/-90° rotation swaps which screen dimension is "width"
          vs "height" for this box's own layout, it has to be laid out BEFORE the transform using
          whichever pairing was fed into computeBoardLayout above) and centered on the real screen
          exactly the way @tastic/core's own FakeLandscapeView centers its rotated content. */}
      <View
        style={[
          styles.localContainer,
          {
            width: containerWidth,
            height: containerHeight,
            left: (width - containerWidth) / 2,
            top: (height - containerHeight) / 2
          },
          rotationStyle
        ]}
      >
        <Board board={board} ball={ball} paddles={paddles} phase={phase} showWalls={isDesktopWeb} bricks={bricks} soloMode={isSolo} />
      </View>

      {/* Touch input - deliberately a SIBLING of the board's own rotated container, not nested
          inside it: react-native-gesture-handler does not correct a Pan gesture's own coordinate
          reporting for an ancestor View's CSS rotation, so keeping its root entirely outside that
          rotated ancestor sidesteps the whole class of issue rather than fighting it. Its own zones
          still cover the full real screen and invert each touch by hand (see its own file for why the
          split axis itself has to vary with rotation, not just the coordinate math). Disabled outside
          live play (paused, or the match has ended) same as AirHockey's own gestureEnabled gate. */}
      <TouchInputLayer humanPlayers={humanPlayers} enabled={!paused && phase !== 'gameOver'} containerHeight={containerHeight} rotation={rotation} onPaddleTargetY={setPaddleTarget} />

      {/* Web-only, additive keyboard input - see that component's own doc for why it needs no
      rotation-awareness the way TouchInputLayer does. paddles[1].y/paddles[2].y are read fresh
      every frame internally (not reactively), so passing the current `paddles` snapshot here on
      every render is exactly right, not stale. */}
      <KeyboardInputLayer enabled={!paused && phase !== 'gameOver'} humanPlayers={humanPlayers} controlScheme={roundSettings.controlScheme} paddleY={{ 1: paddles[1].y, 2: paddles[2].y }} onPaddleTargetY={setPaddleTarget} />

      {/* Additive on top of TouchInputLayer's own always-on drag input, same precedent as
      KeyboardInputLayer above - see that component's own doc for why this never disables touch.
      Always mounted (inert whenever `enabled` is false), same convention as the other two layers. */}
      <TiltInputLayer player={humanPlayers[0]} enabled={tiltControlActive && !paused && phase !== 'gameOver'} phase={phase} rotation={rotation} board={board} paddleY={paddles[humanPlayers[0]].y} onPaddleTargetY={setPaddleTarget} />

      {/* Score labels - plain react-native-paper Text, not on the Skia canvas, each individually
          rotated to face its own player correctly (see p1/p2 rotation comment above) and anchored
          near its own player's own corner of the board via localToScreen. */}
      <View pointerEvents='none' style={[styles.floatingChip, { left: p1ScorePos.x - 30, top: p1ScorePos.y - 20 }, rotationStyle]}>
        <Text variant='headlineMedium' style={{ color: playerColor[1], fontFamily: MONO_FONT }}>
          {scores[0]}
        </Text>
      </View>
      <View pointerEvents='none' style={[styles.floatingChip, { left: p2ScorePos.x - 30, top: p2ScorePos.y - 20 }, p2RotationStyle]}>
        <Text variant='headlineMedium' style={{ color: playerColor[2], fontFamily: MONO_FONT }}>
          {scores[1]}
        </Text>
      </View>

      {/* Back + settings - see neutralZone's own doc above for the two treatments. Board-corner
          (vsCpu/sideBySide): floating chips near the board's own bottom corners (offset from the
          score labels, which sit near the top corners), each rotated as a unit via the same
          `rotation` so their icon reads upright given the current hold. Neutral-edge (two-player
          faceToFace): pinned to the real screen's own left/right edge instead, vertically centered,
          reachable and legible from either seat. Desktop web: the page's own top corners (see
          backSlot above). */}
      {isDesktopWeb ? (
        <>
          <View style={[styles.floatingChip, backSlot]}>
            <IconButton icon='arrow-left' iconColor={bg} containerColor={fg} style={styles.chipButton} size={24} onPress={requestBack} accessibilityLabel='Back' />
          </View>
          <View style={[styles.floatingChip, settingsSlot]}>
            <IconButton icon='cog' iconColor={bg} containerColor={fg} style={styles.chipButton} size={24} onPress={() => setSettingsOpen(true)} accessibilityLabel='Settings' />
          </View>
        </>
      ) : neutralZone ? (
        <>
          <View style={[styles.neutralSlot, { left: insets.left + 8 }]}>
            <IconButton icon='arrow-left' iconColor={bg} containerColor={fg} style={[styles.chipButton, rotationStyle]} size={24} onPress={requestBack} accessibilityLabel='Back' />
          </View>
          <View style={[styles.neutralSlot, { right: insets.right + 8 }]}>
            <IconButton icon='cog' iconColor={bg} containerColor={fg} style={[styles.chipButton, rotationStyle]} size={24} onPress={() => setSettingsOpen(true)} accessibilityLabel='Settings' />
          </View>
        </>
      ) : (
        <>
          <View style={[styles.floatingChip, { left: backPos.x - 24, top: backPos.y - 24 }, rotationStyle]}>
            <IconButton icon='arrow-left' iconColor={bg} containerColor={fg} style={styles.chipButton} size={24} onPress={requestBack} accessibilityLabel='Back' />
          </View>
          <View style={[styles.floatingChip, { left: settingsPos.x - 24, top: settingsPos.y - 24 }, rotationStyle]}>
            <IconButton icon='cog' iconColor={bg} containerColor={fg} style={styles.chipButton} size={24} onPress={() => setSettingsOpen(true)} accessibilityLabel='Settings' />
          </View>
        </>
      )}

      {/* Game Over overlay - solo has no opponent, so it gets its own branch entirely: lives > 0
          means every brick was cleared (a win), lives <= 0 means the player ran out (see
          useGameState's TICK case) - there's no "loser" to speak of, so both buttons just use
          playerColor[1] rather than the winner/loser pairing the two-paddle branch below uses. */}
      {phase === 'gameOver' &&
        (isSolo ? (
          <OverlayBackdrop>
            <OverlayCard style={rotationStyle}>
              <Icon source={lives > 0 ? 'trophy' : 'heart-broken'} size={64} color={playerColor[1]} />
              <Text variant='headlineLarge' style={[styles.overlayTitle, { color: playerColor[1], fontFamily: MONO_FONT }]}>
                {lives > 0 ? 'Cleared!' : 'Out of Lives'}
              </Text>
              <Text variant='bodyLarge' style={[styles.overlayScore, { color: fgMuted, fontFamily: MONO_FONT }]}>
                {bricks.filter((b) => b.destroyed).length} / {bricks.length} bricks
              </Text>
              <Button mode='contained' onPress={() => resetGame(board)} style={styles.overlayButton} buttonColor={playerColor[1]} textColor={playerOnColor[1]}>
                Play Again
              </Button>
              <Button mode='contained' onPress={safeBack} style={styles.overlayButton} buttonColor={playerColor[1]} textColor={playerOnColor[1]}>
                Quit
              </Button>
            </OverlayCard>
          </OverlayBackdrop>
        ) : (
          <OverlayBackdrop>
            <OverlayCard style={rotationStyle}>
              <Icon source='trophy' size={64} color={playerColor[winner]} />
              <Text variant='headlineLarge' style={[styles.overlayTitle, { color: playerColor[winner], fontFamily: MONO_FONT }]}>
                Wins!
              </Text>
              {winnerProfile ? (
                <View style={styles.winnerRow}>
                  <ProfileChip profile={winnerProfile} />
                  <Text variant='titleMedium' style={{ color: playerColor[winner], fontFamily: MONO_FONT }}>
                    {winnerProfile.name}
                  </Text>
                </View>
              ) : (
                <Text variant='titleMedium' style={{ color: playerColor[winner], fontFamily: MONO_FONT }}>
                  {winner === 1 ? 'P1' : 'P2'}
                </Text>
              )}
              <Text variant='bodyLarge' style={[styles.overlayScore, { fontFamily: MONO_FONT }]}>
                <Text style={{ color: playerColor[1] }}>{scores[0]}</Text>
                <Text style={{ color: fgMuted }}> - </Text>
                <Text style={{ color: playerColor[2] }}>{scores[1]}</Text>
              </Text>
              {/* Two-player-only achievement rows - see seatUnlocks' own doc above for why these
              land here instead of the shared showAchievementToast vsCpu still uses. This card
              already carries a single shared rotationStyle, so each row's owner avatar is what
              identifies whose achievement it is, not a second independent rotation. */}
              {aiPlayer === null && <AchievementUnlockList unlocks={seatUnlocks} seats={SEATS} owners={achievementOwners} tierColors={ACHIEVEMENT_TIER_COLORS} fg={cardFg} />}
              <Button mode='contained' onPress={() => resetGame(board)} style={styles.overlayButton} buttonColor={playerColor[loser]} textColor={playerOnColor[loser]}>
                Play Again
              </Button>
              <Button mode='contained' onPress={safeBack} style={styles.overlayButton} buttonColor={playerColor[winner]} textColor={playerOnColor[winner]}>
                Quit
              </Button>
            </OverlayCard>
          </OverlayBackdrop>
        ))}

      {/* Quit confirmation - shared @tastic/hud dialog; accepts its primary accent + default font
          in place of this dialog's previous secondary-accent Quit button and MONO_FONT styling
          (a deliberate trade-off for convergence onto the shared component). */}
      <ConfirmDialog visible={confirmVisible} title='Quit Match?' message={progressMessage} confirmLabel='Quit' cancelLabel='Cancel' icon='alert-circle-outline' destructive={false} onConfirm={safeBack} onCancel={cancelBack} rotation={rotation} />
      {/* Shown when the app comes back from the background mid-match (see useBackgroundPause above):
      play stays frozen until Resume, so a match never restarts before the player is back and ready. */}
      <ConfirmDialog visible={backgroundPaused} title='Paused' message={progressMessage} confirmLabel='Resume' cancelLabel='Quit' icon='pause-circle-outline' destructive={false} onConfirm={resume} onCancel={safeBack} rotation={rotation} />

      {/* rotation={rotation} - same physical-hold-compensating rotation the board itself uses (see
          the rotation comment above), not a separate reading; previously omitted, leaving this
          dialog's content stuck unrotated for a faceToFace hold while every other floating card on
          this screen correctly rotated. */}
      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} rotation={rotation} />
    </View>
  )
}

const styles = StyleSheet.create({
  chipButton: { margin: 0 },
  floatingChip: { position: 'absolute' },
  localContainer: { position: 'absolute' },
  // neutralZone's own back/settings position - full screen height at a fixed left/right edge,
  // button centered vertically via justifyContent, same shape as LightCycles'/BoxHockey's own
  // neutral-midline chip slots (see neutralZone's own doc above for why).
  neutralSlot: { alignItems: 'center', bottom: 0, justifyContent: 'center', position: 'absolute', top: 0 },
  overlayButton: { width: 160 },
  overlayScore: {},
  overlayTitle: { fontWeight: 'bold' },
  root: { flex: 1 },
  // Marginless - sits between the "Wins!" title and the score line, both of which already carry
  // this card's own vertical gap (OverlayCard's own `gap`), so this row needs no extra spacing
  // of its own to read as one more line in that same stack.
  winnerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  }
})
