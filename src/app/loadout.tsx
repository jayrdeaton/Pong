import AsyncStorage from '@react-native-async-storage/async-storage'
import { defaultColors, getThirdColor, useAutoPaperTheme, useThemeSettings } from '@rific/auto-paper'
import { CornerActionButtons, MenuOption, PressAwayOverlay, ReadyButton, SharedActionBand, usePopoverHost } from '@tastic/hud'
import { DualZoneLayout, FakeLandscapeView, getViewRotation, needsSharedNeutralZone, rotateInsets, useAccelerometerOrientation, useDualZoneLayout } from '@tastic/split-screen'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { LOADOUT_SHARED_CONTROLS_IDS, LoadoutSharedControls } from '@/components/LoadoutSharedControls'
import { PlayerSetupPanel } from '@/components/PlayerSetupPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { CPU_COLOR_STORAGE_KEY, DEFAULT_P1_COLOR, DEFAULT_P2_COLOR, isValidHex, PLAYER_COLORS_STORAGE_KEY } from '@/components/Theme'
import { useGameSettings } from '@/hooks/useGameSettings'
import { useProfiles } from '@/hooks/useProfiles'
import { BallSpeedLevel, ControlScheme, PaddleSizeLevel, Player } from '@/types'
import { AIDifficulty } from '@/utils/aiOpponent'
import { humanPlayersFor, parseGameMode } from '@/utils/gameMode'
import { safeBack } from '@/utils/navigation'

// BoxHockey's own constants/game.ts owns LOADOUT_PANEL_SWAP_FADE_MS, but Pong's version of that
// file is owned by the physics/board work happening elsewhere in this build (same convention
// AirHockey's own loadout.tsx already follows) — kept local here instead of adding to it, same
// 180ms BoxHockey itself uses for this exact fade.
const PANEL_SWAP_FADE_MS = 180

const PADDLE_SIZE_OPTIONS: MenuOption<PaddleSizeLevel>[] = [
  { value: 'small', label: 'Small', description: 'Shorter paddle, more precision', icon: 'circle-small' },
  { value: 'medium', label: 'Medium', description: 'Standard size', icon: 'circle-medium' },
  { value: 'large', label: 'Large', description: 'Taller paddle, easier defense', icon: 'circle-outline' }
]

// New relative to AirHockey — replaces FrictionLevel outright, since Pong's ball has no
// deceleration model at all (see BallSpeedLevel's own doc comment in types/index.ts). Governs both
// the base serve speed and the per-hit ratchet increment (see BALL_SPEED_TIERS in
// constants/game.ts).
const BALL_SPEED_OPTIONS: MenuOption<BallSpeedLevel>[] = [
  { value: 'slow', label: 'Slow', description: 'Gentle pace, ramps up slowly', icon: 'speedometer-slow' },
  { value: 'medium', label: 'Medium', description: 'Standard pace', icon: 'speedometer-medium' },
  { value: 'fast', label: 'Fast', description: 'Quick pace, ramps up fast', icon: 'speedometer' }
]

const SCORE_TO_WIN_OPTIONS: MenuOption<number>[] = [3, 5, 7, 10].map((value) => ({ value, label: String(value) }))

// aiOpponent.ts has no AI_DIFFICULTY_LABELS export of its own — same as AirHockey's version, it
// only exports the AIDifficulty type and the pure tuning function — so the labels live here
// instead, same three tiers.
const AI_DIFFICULTY_OPTIONS: MenuOption<AIDifficulty>[] = [
  { value: 'easy', label: 'Easy', icon: 'emoticon-happy-outline' },
  { value: 'medium', label: 'Medium', icon: 'emoticon-neutral-outline' },
  { value: 'hard', label: 'Hard', icon: 'emoticon-devil-outline' }
]

// Left icon-less, mirroring Snake's own CONTROL_SCHEME_OPTIONS exactly — there's no
// MaterialCommunityIcons glyph that reads as "WASD" or "IJKL" at a glance the other option lists
// above get from their icons, so mixing one iconned option (Mouse) in with four icon-less ones
// would look like an inconsistency rather than a real distinction.
const CONTROL_SCHEME_OPTIONS: MenuOption<ControlScheme>[] = [
  { value: 'mouse', label: 'Mouse' },
  { value: 'wasd', label: 'WASD' },
  { value: 'arrows', label: 'Arrows' },
  { value: 'ijkl', label: 'IJKL' },
  { value: 'numpad', label: 'Numpad' }
]

export default function LoadoutScreen() {
  // Read only from this screen's own route param, never from useGameSettings().settings.gameMode
  // — the settings hook's AsyncStorage read is async, and racing it here could momentarily show
  // the wrong number of player panels.
  const params = useLocalSearchParams<{ mode: string }>()
  const gameMode = useMemo(() => parseGameMode(params.mode), [params.mode])
  const humanPlayers = useMemo(() => humanPlayersFor(gameMode), [gameMode])
  // Hoisted above the color-handling block below (it used to live down near the other
  // gameMode-derived layout values) — the seat-kind logic that decides guest/CPU/profile
  // persistence needs it early now.
  const p2IsHuman = humanPlayers.includes(2)

  const { settings, setSettings, commitRoundSettings } = useGameSettings()
  const { profiles, lastSelected, selectProfile } = useProfiles()
  // orientationMode just follows the device's current physical tilt (see useAccelerometerOrientation),
  // CPU games included — how you're holding the phone right now decides the panel arrangement, not
  // a stored per-round choice. This is what lets two players sit shoulder-to-shoulder and pick a
  // color at the same time once the phone is turned sideways, instead of a portrait-narrow column —
  // and for vs-CPU, it's simply whichever way the solo player is holding it. Lock Orientation (see
  // SettingsDialog) is the opt-in for pinning it. app.json is portrait-locked at the OS level now
  // (no more real OS rotation to rely on — see @tastic/split-screen's FakeLandscapeView below,
  // which fakes the rest entirely in JS from this hook's live accelerometer reading).
  const { orientationMode, p1OnRight, upsideDown, resolved: p1OnRightResolved } = useAccelerometerOrientation(settings.lockOrientation)

  // The panel area's own layout (which branch renders, which side each panel is on) lags one fade
  // behind the live orientationMode/p1OnRight/upsideDown above — see useDualZoneLayout's own
  // comment. Also drives the solo (vs-CPU) branch's own row below — that one doesn't rotate
  // anything, but still reorders/fades across a portrait<->landscape change the same way.
  const { panelLayout, panelFadeStyle } = useDualZoneLayout(orientationMode, p1OnRight, p1OnRightResolved, upsideDown, PANEL_SWAP_FADE_MS)

  const [settingsOpen, setSettingsOpen] = useState(false)
  // react-native-safe-area-context always reports insets relative to the device's own fixed
  // physical frame (the OS thinks the interface is still portrait-locked and never rotates, so it
  // has no idea FakeLandscapeView below is rotating the content) — rotateInsets remaps them onto
  // whichever edge they actually correspond to once visually rotated, using the same committed
  // rotation FakeLandscapeView itself renders with, so `top`/`left`/`right` below always mean the
  // screen's real, visual edges regardless of how the phone is being held.
  const rotation = getViewRotation(panelLayout.orientationMode, panelLayout.p1OnRight, panelLayout.upsideDown)
  const insets = rotateInsets(useSafeAreaInsets(), rotation)
  const { colors: themeColors, dark } = useAutoPaperTheme()
  const { set: setThemeColor } = useThemeSettings()
  const p1Color = themeColors.primary
  const p2Color = themeColors.secondary

  // A seat with a profile selected always repaints from that profile's own saved color (see the
  // reapply effect below) — a manual recolor or clash-swap on it must never touch either persisted
  // slot below, only the live theme, or it'd silently drift from the profile's real saved color.
  // P1 is never CPU (see humanPlayersFor), so it only ever needs this profile/guest split.
  const p1Profile = profiles.find((p) => p.id === lastSelected[1]) ?? null
  const p2Profile = p2IsHuman ? (profiles.find((p) => p.id === lastSelected[2]) ?? null) : null

  // Guest and CPU each remember their own last color independently (PLAYER_COLORS_STORAGE_KEY vs.
  // CPU_COLOR_STORAGE_KEY — see Theme.tsx) instead of fighting over one slot, and neither slot is
  // ever written from a profile-derived color (see p1Profile/p2Profile above). Seeded from the live
  // theme (already loaded by Theme.tsx's own cold-boot read of this same guest key, by the time this
  // screen ever mounts) rather than the DEFAULT_P* constants directly, so a guest seat's very first
  // render already agrees with itself instead of flashing a default for the one read below to fix.
  const [guestColors, setGuestColors] = useState<{ p1: string; p2: string }>(() => ({ p1: themeColors.primary, p2: themeColors.secondary }))
  const [cpuColor, setCpuColor] = useState(() => themeColors.secondary)

  useEffect(() => {
    let cancelled = false
    Promise.all([AsyncStorage.getItem(PLAYER_COLORS_STORAGE_KEY), AsyncStorage.getItem(CPU_COLOR_STORAGE_KEY)]).then(([storedGuest, storedCpu]) => {
      if (cancelled) return
      // Resolved definitively either way (never left at the lazy live-theme seed above) — a slot
      // that's never been written to falls back to this app's own defaults here, same as a fresh
      // install already behaves, rather than keeping whatever the seed above happened to guess.
      let nextGuest = { p1: DEFAULT_P1_COLOR, p2: DEFAULT_P2_COLOR }
      if (storedGuest) {
        try {
          const parsed = JSON.parse(storedGuest)
          nextGuest = { p1: isValidHex(parsed.p1) ? parsed.p1 : DEFAULT_P1_COLOR, p2: isValidHex(parsed.p2) ? parsed.p2 : DEFAULT_P2_COLOR }
        } catch {
          // Corrupt/stale blob — fall back to defaults above.
        }
      }
      setGuestColors(nextGuest)
      setCpuColor(isValidHex(storedCpu) ? storedCpu : DEFAULT_P2_COLOR)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const persistGuestColor = useCallback((seat: Player, hex: string) => {
    setGuestColors((prev) => {
      const next = { ...prev, [seat === 1 ? 'p1' : 'p2']: hex }
      AsyncStorage.setItem(PLAYER_COLORS_STORAGE_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])
  const persistCpuColor = useCallback((hex: string) => {
    setCpuColor(hex)
    AsyncStorage.setItem(CPU_COLOR_STORAGE_KEY, hex).catch(() => {})
  }, [])

  // Picking the other slot's exact current color swaps the two instead of no-op'ing — only
  // reachable at all when that slot's own picker allowed it (allowSwapTaken: vs-CPU only, where
  // the "other" color there is only ever the CPU's, not a second real person's choice). Each side
  // of a swap persists independently, per its own seat kind — a swap between a profile seat and a
  // CPU seat, say, leaves the profile side transient while the CPU side still remembers its own.
  const handleP1ColorChange = useCallback(
    (hex: string) => {
      const nextP2 = hex.toLowerCase() === p2Color.toLowerCase() ? p1Color : p2Color
      setThemeColor({ color: { primary: hex, secondary: nextP2, tertiary: getThirdColor(hex, nextP2) } })
      if (!p1Profile) persistGuestColor(1, hex)
      if (nextP2 !== p2Color) {
        if (!p2IsHuman) persistCpuColor(nextP2)
        else if (!p2Profile) persistGuestColor(2, nextP2)
      }
    },
    [setThemeColor, p1Color, p2Color, p1Profile, p2Profile, p2IsHuman, persistGuestColor, persistCpuColor]
  )
  const handleP2ColorChange = useCallback(
    (hex: string) => {
      const nextP1 = hex.toLowerCase() === p1Color.toLowerCase() ? p2Color : p1Color
      setThemeColor({ color: { primary: nextP1, secondary: hex, tertiary: getThirdColor(nextP1, hex) } })
      if (!p2IsHuman) persistCpuColor(hex)
      else if (!p2Profile) persistGuestColor(2, hex)
      if (nextP1 !== p1Color && !p1Profile) persistGuestColor(1, nextP1)
    },
    [setThemeColor, p1Color, p2Color, p1Profile, p2Profile, p2IsHuman, persistGuestColor, persistCpuColor]
  )

  // Applies a single seat's newly-picked profile (or, on clearing to guest, its remembered guest
  // color) to the live theme immediately, rather than waiting on the reapply effect below to catch
  // the lastSelected change — that effect skips a same-id reselect entirely (see its own comment),
  // and this is also what makes reselecting the very profile already active snap back off of a
  // transient override right away.
  const applySeatColor = useCallback(
    (seat: Player, hex: string) => {
      if (seat === 1) setThemeColor({ color: { primary: hex, secondary: p2Color, tertiary: getThirdColor(hex, p2Color) } })
      else setThemeColor({ color: { primary: p1Color, secondary: hex, tertiary: getThirdColor(p1Color, hex) } })
    },
    [setThemeColor, p1Color, p2Color]
  )

  // profiles/guestColors/cpuColor are all read fresh (via these refs) rather than depended on
  // directly below — a profile's own record can change elsewhere (e.g. recolored from /profiles),
  // or either persisted color slot can change from this same screen's own guest/CPU recolor, while
  // this seat's color stays a still-valid transient override; none of that alone must yank this
  // screen's live theme out from under it — only an actual identity change (a different seat/id/kind)
  // should.
  const profilesRef = useRef(profiles)
  useEffect(() => {
    profilesRef.current = profiles
  }, [profiles])
  const guestColorsRef = useRef(guestColors)
  useEffect(() => {
    guestColorsRef.current = guestColors
  }, [guestColors])
  const cpuColorRef = useRef(cpuColor)
  useEffect(() => {
    cpuColorRef.current = cpuColor
  }, [cpuColor])

  // Pulled out to plain variables (rather than indexing lastSelected inline below) so the reapply
  // effect's own dependency array can name them directly — an actual identity change on either one
  // is the only "real reason" to reapply a seat's color (see that effect's own comment).
  const p1SelectedId = lastSelected[1]
  const p2SelectedId = lastSelected[2]

  // Re-derives both seats' colors from scratch — profile ? that profile's own saved color : this
  // seat's own remembered guest/CPU slot — and repaints the live theme with them. Runs on mount, on
  // every return to this screen (so a transient override left behind never survives a trip away and
  // back), and whenever a seat's own profile identity actually changes; deliberately NOT keyed on
  // `ready`, guestColors/cpuColor, or anything else re-rendering this screen for unrelated reasons —
  // expo-router's useFocusEffect re-invokes its callback on any identity change of the callback
  // itself while the screen stays continuously focused, not just on a real focus/blur transition, so
  // guestColors/cpuColor (and profiles) are read through the refs above instead of being deps here:
  // otherwise, e.g., recoloring the CPU seat mid-screen would re-trigger this and wipe P1's own
  // still-valid transient override with no navigation having happened at all.
  useFocusEffect(
    useCallback(() => {
      const latestProfiles = profilesRef.current
      const nextP1Profile = latestProfiles.find((p) => p.id === p1SelectedId) ?? null
      const nextP2Profile = p2IsHuman ? (latestProfiles.find((p) => p.id === p2SelectedId) ?? null) : null
      const nextP1 = nextP1Profile ? nextP1Profile.color : guestColorsRef.current.p1
      const nextP2 = !p2IsHuman ? cpuColorRef.current : nextP2Profile ? nextP2Profile.color : guestColorsRef.current.p2
      setThemeColor({ color: { primary: nextP1, secondary: nextP2, tertiary: getThirdColor(nextP1, nextP2) } })
    }, [p1SelectedId, p2SelectedId, p2IsHuman, setThemeColor])
  )

  const [ready, setReady] = useState<Record<Player, boolean>>({ 1: false, 2: false })

  // Every time this screen (re)gains focus — first arrival from the title screen, or coming back
  // here via the post-game "Loadout" button — Ready starts false again. Without this, popping back
  // to an already-mounted loadout whose players both left it Ready would immediately re-trigger the
  // all-ready effect below and bounce straight back into /game.
  useFocusEffect(
    useCallback(() => {
      setReady({ 1: false, 2: false })
    }, [])
  )

  useEffect(() => {
    if (!humanPlayers.every((p) => ready[p])) return
    // `gameMode` here, not `settings.gameMode` — same race the comment above guards against: this
    // screen's own route param is the trustworthy value, not the settings hook's own (possibly
    // still-loading) copy.
    commitRoundSettings({ ...settings, gameMode })
    router.push('/game')
  }, [ready, humanPlayers, settings, gameMode, commitRoundSettings])

  const bg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'
  const fgMuted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'

  const isPortrait = panelLayout.orientationMode === 'faceToFace'
  // See @tastic/split-screen's needsSharedNeutralZone for the full reasoning — this screen never
  // had the equivalent of BoxHockey's/AirHockey's/LightCycles'/Snake's showMetaInSharedBand at all
  // until now, so its back/settings sat in the top corners unconditionally, landing inside P2's own
  // rotated zone for two-player face-to-face same as those apps' own pre-fix bug.
  const showMetaInSharedBand = needsSharedNeutralZone(panelLayout.orientationMode, humanPlayers.length)

  // Where P2's own press-away zone lives on screen — matches panelLayout (the already-committed,
  // currently-painted layout), not the live orientationMode/p1OnRight, since it needs to agree with
  // whichever arrangement is actually on screen right now, mid-fade included. Portrait always
  // renders P2's panel in the top half (see DualZoneLayout below); landscape puts it on whichever
  // side panelLayout.p1OnRight says isn't P1's. Only meaningful in two-player mode — vsCpu's P2/CPU
  // slot shares controlsHost instead (see p2Host below), so it never needs a zone of its own.
  const p2ZoneStyle = gameMode === 'twoPlayer' ? (isPortrait ? styles.p2ZoneTop : panelLayout.p1OnRight ? styles.p2ZoneLeft : styles.p2ZoneRight) : null

  // Vs-CPU only has one human slot, so its Ready toggle renders standalone below both panels
  // instead of embedded in this panel.
  const showReadyButton = gameMode === 'twoPlayer'
  // P1's own panel and the shared controls row always share one host — mutually exclusive
  // regardless of game mode, since both sit in the same near/bottom zone. Vs-CPU additionally
  // folds P2/CPU's panel into this same host: only one human is ever driving both slots there, so
  // having both YOU's and CPU's popovers open at once is just clutter. Two-player mode keeps P2 on
  // its own independent host, since two real people editing at once is the whole point there —
  // loadout.tsx (rather than PlayerSetupPanel's own internal fallback) owns it explicitly so the
  // press-away zones below can close it without a P1-side tap ever reaching into P2's own popover,
  // or vice versa.
  const controlsHost = usePopoverHost()
  const p2PanelHost = usePopoverHost()
  const p2Host = gameMode === 'vsCpu' ? controlsHost : p2PanelHost
  // Vs-CPU's own standalone Ready button (below, not per-panel — see showReadyButton) is centered
  // under the whole row, not under either player's own trigger, so it doesn't share a center with
  // an open popover the way a two-player panel's *embedded* Ready button does. A side player's
  // popover is centered on that player's own (off-center) trigger instead, so it can't fully cover
  // the wider gap between its edge and the standalone button's — leaving a sliver of the button's
  // own border peeking out from beside/behind the popover. Faded out instead while any player's
  // popover is open, rather than trying to reconcile the two different centers.
  const anyPlayerPickerOpen = !!(controlsHost.openId?.startsWith('p1-') || controlsHost.openId?.startsWith('p2-'))

  const sharedControlsRow = <LoadoutSharedControls host={controlsHost} paddleSize={settings.paddleSize} paddleSizeOptions={PADDLE_SIZE_OPTIONS} onPaddleSizeChange={(value) => setSettings({ paddleSize: value })} ballSpeed={settings.ballSpeed} ballSpeedOptions={BALL_SPEED_OPTIONS} onBallSpeedChange={(value) => setSettings({ ballSpeed: value })} scoreToWin={settings.scoreToWin} scoreToWinOptions={SCORE_TO_WIN_OPTIONS} onScoreToWinChange={(value) => setSettings({ scoreToWin: value })} aiDifficulty={gameMode === 'vsCpu' ? settings.aiDifficulty : undefined} aiDifficultyOptions={gameMode === 'vsCpu' ? AI_DIFFICULTY_OPTIONS : undefined} onAiDifficultyChange={gameMode === 'vsCpu' ? (value) => setSettings({ aiDifficulty: value }) : undefined} accentColor={themeColors.tertiary} mutedColor={fgMuted} onAccentColor={themeColors.onTertiary} dark={dark} />

  // Only wrapped for showMetaInSharedBand (see its own comment above) — everywhere else back/
  // settings stay in their usual top corners (CornerActionButtons below). Pong has no randomize/
  // reset match-settings action (unlike LightCycles), so SharedActionBand's own onRandomize/onReset
  // are simply omitted rather than threaded through from anywhere.
  const sharedControlsPopoverOpen = controlsHost.openId !== null && LOADOUT_SHARED_CONTROLS_IDS.includes(controlsHost.openId)
  const sharedControls = showMetaInSharedBand ? (
    <SharedActionBand onBack={safeBack} onSettings={() => setSettingsOpen(true)} fg={fg} popoverOpen={sharedControlsPopoverOpen}>
      {sharedControlsRow}
    </SharedActionBand>
  ) : (
    sharedControlsRow
  )

  // Always 'P1'/'P2', regardless of game mode — see ProfilePicker's own doc for why the trigger uses
  // this instead of "Player" (Player stays as the menu's own row, just not the idle label — using
  // the same word for both would make it impossible to tell "nothing selected yet" from "Player
  // deliberately selected" at a glance).
  const p1Panel = (
    <PlayerSetupPanel
      idPrefix='p1'
      host={controlsHost}
      color={p1Color}
      onColorChange={handleP1ColorChange}
      swatches={defaultColors}
      takenColor={p2Color}
      allowSwapTaken={gameMode === 'vsCpu'}
      isHuman
      controlScheme={settings.controlScheme[1]}
      onControlSchemeChange={(scheme) => setSettings({ controlScheme: { ...settings.controlScheme, 1: scheme } })}
      controlSchemeOptions={CONTROL_SCHEME_OPTIONS}
      otherControlScheme={p2IsHuman ? settings.controlScheme[2] : undefined}
      ready={ready[1]}
      onToggleReady={() => setReady((r) => ({ ...r, 1: !r[1] }))}
      dark={dark}
      showReadyButton={showReadyButton}
      profiles={profiles}
      selectedProfileId={lastSelected[1]}
      takenProfileId={lastSelected[2]}
      guestLabel='P1'
      onProfileSelect={(profile) => {
        selectProfile(1, profile?.id ?? null)
        applySeatColor(1, profile ? profile.color : guestColors.p1)
      }}
      onManageProfiles={() => router.push('/profiles')}
    />
  )
  const p2Panel = (
    <PlayerSetupPanel
      idPrefix='p2'
      host={p2Host}
      color={p2Color}
      onColorChange={handleP2ColorChange}
      swatches={defaultColors}
      takenColor={p1Color}
      allowSwapTaken={gameMode === 'vsCpu'}
      isHuman={p2IsHuman}
      controlScheme={p2IsHuman ? settings.controlScheme[2] : undefined}
      onControlSchemeChange={p2IsHuman ? (scheme) => setSettings({ controlScheme: { ...settings.controlScheme, 2: scheme } }) : undefined}
      controlSchemeOptions={p2IsHuman ? CONTROL_SCHEME_OPTIONS : undefined}
      otherControlScheme={p2IsHuman ? settings.controlScheme[1] : undefined}
      ready={p2IsHuman ? ready[2] : undefined}
      onToggleReady={p2IsHuman ? () => setReady((r) => ({ ...r, 2: !r[2] })) : undefined}
      dark={dark}
      showReadyButton={showReadyButton}
      profiles={p2IsHuman ? profiles : undefined}
      selectedProfileId={lastSelected[2]}
      takenProfileId={lastSelected[1]}
      guestLabel='P2'
      onProfileSelect={
        p2IsHuman
          ? (profile) => {
              selectProfile(2, profile?.id ?? null)
              applySeatColor(2, profile ? profile.color : guestColors.p2)
            }
          : undefined
      }
    />
  )

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Everything below reads correctly no matter which way the phone is actually being held —
      see @tastic/split-screen's FakeLandscapeView for why this is needed at all now that the app is
      portrait-locked at the OS level (no more real OS rotation to rely on). Driven by panelLayout
      (the same committed, already-fade-masked state DualZoneLayout itself renders from), not the
      live orientationMode/p1OnRight/upsideDown above, so the visual rotation change and the panel
      swap/reorder always land in the same fade-covered moment instead of one snapping ahead of the
      other. SettingsDialog is deliberately left outside this wrapper — it renders as a centered
      modal overlay via Portal, unaffected by (and not needing) this transform. */}
      <FakeLandscapeView orientationMode={panelLayout.orientationMode} p1OnRight={panelLayout.p1OnRight} upsideDown={panelLayout.upsideDown} style={styles.rotatable}>
        {/* Press-away overlays for the loadout screen's own popovers (color pickers, shared-setting
        dropdowns) — see PressAwayOverlay's own comment for the paint-order trick that keeps real
        controls directly tappable. P1's covers the whole screen (their own panel plus every shared
        setting reads as "theirs" — see LoadoutSharedControls), while P2's is scoped to just their
        own half (p2ZoneStyle) and, being a later sibling, takes priority over P1's within that rect.

        P2's overlay has to mount whenever *either* host has something open, not just p2Host — P1's
        popover being open is exactly when P1's full-screen overlay is sitting underneath P2's zone
        too, and if P2's own overlay were absent then (p2Host closed), a tap anywhere on P2's side
        would fall straight through to P1's and close P1's dialog. Mounting it any time controlsHost
        is open too — even though its own onPress (p2Host.close) is then a no-op — makes it "shield"
        P2's zone from P1's overlay unconditionally, which is what actually keeps P2's side exempt
        from P1's press-away regardless of whether P2 has anything open. */}
        <PressAwayOverlay active={controlsHost.openId !== null} onPress={controlsHost.close} />
        {p2ZoneStyle && <PressAwayOverlay active={controlsHost.openId !== null || p2Host.openId !== null} onPress={p2Host.close} style={p2ZoneStyle} />}

        {!showMetaInSharedBand && <CornerActionButtons onBack={safeBack} onSettings={() => setSettingsOpen(true)} fg={fg} insets={insets} />}

        {gameMode === 'twoPlayer' ? (
          // See @tastic/split-screen's DualZoneLayout for the portrait-vs-landscape switch and its
          // own note on why P1's zone stays unrotated while P2's rotates 180° in portrait.
          <DualZoneLayout
            panelLayout={panelLayout}
            panelFadeStyle={panelFadeStyle}
            p1={p1Panel}
            p2={p2Panel}
            shared={sharedControls}
            // Without these, a popover escaping its own zone (e.g. the shared paddle/ball physics
            // dropdown growing down into P1/P2's row below it) paints underneath whichever zone
            // happens to be the later DOM sibling, regardless of which one actually has something
            // open — see DualZoneLayout's own p1Elevated/p2Elevated/sharedElevated doc for the
            // stacking-context reason a zone can't just self-elevate the way
            // PlayerSetupPanel/LoadoutSharedControls already do internally. Same openId checks
            // those two components use for their own internal elevation, just re-run here for the
            // outer zone wrapper neither of them can reach on its own.
            p1Elevated={controlsHost.openId?.startsWith('p1-') ?? false}
            p2Elevated={p2Host.openId !== null}
            sharedElevated={sharedControlsPopoverOpen}
          />
        ) : (
          <View style={styles.stackedZone}>
            {sharedControls}
            <Animated.View style={[styles.playersRow, anyPlayerPickerOpen && styles.playersRowOpen, panelFadeStyle]}>
              {!isPortrait && panelLayout.p1OnRight ? p2Panel : p1Panel}
              {!isPortrait && panelLayout.p1OnRight ? p1Panel : p2Panel}
            </Animated.View>
            <ReadyButton color={p1Color} ready={ready[1]} onToggleReady={() => setReady((r) => ({ ...r, 1: !r[1] }))} style={anyPlayerPickerOpen && styles.readyButtonHidden} />
          </View>
        )}
      </FakeLandscapeView>

      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} rotation={rotation} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  p2ZoneLeft: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: '50%'
  },
  p2ZoneRight: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '50%'
  },
  p2ZoneTop: {
    height: '50%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  // Only used by vsCpu's stacked (non-rotated) layout below — two-player's own DualZoneLayout
  // handles p1/p2 spacing itself. vsCpu's human slot and CPU slot (both a lone color circle now —
  // see PlayerSetupPanel) read as one evenly spaced row of triggers this way, rather than two
  // independently-centered blocks throwing off screen-edge symmetry.
  playersRow: {
    flexDirection: 'row',
    gap: 12
  },
  playersRowOpen: {
    zIndex: 100
  },
  // See anyPlayerPickerOpen above — opacity 0 (not display:'none') so the button keeps its layout
  // space and doesn't shift the row above it when it disappears/reappears. pointerEvents:'none' too
  // — otherwise the sliver an open popover doesn't cover would still be a live, just-invisible tap
  // target underneath it.
  readyButtonHidden: {
    opacity: 0,
    pointerEvents: 'none'
  },
  // Owns the flex-centering layout `container` used to apply directly — now one level deeper, since
  // everything visible sits inside FakeLandscapeView, which needs a real (not shrink-wrapped)
  // full-bleed box to size its own absolutely-positioned children (PressAwayOverlay, back/settings
  // buttons) against correctly.
  rotatable: {
    alignItems: 'center',
    flex: 1,
    gap: 32,
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  stackedZone: {
    alignItems: 'center',
    gap: 28
  }
})
