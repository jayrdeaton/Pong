import { MenuOption, PopoverHost, SectionedDropdown, usePopoverHost } from '@tastic/hud'
import { StyleSheet, View } from 'react-native'

import { BallSpeedLevel, PaddleSizeLevel } from '@/types'

interface Props {
  // Shared popover host — see PlayerSetupPanel's identical `host` prop. loadout.tsx always passes
  // its own controlsHost here, in every game mode: this row sits in the same near/bottom zone as
  // P1's own panel, so paddle/ball physics/score/difficulty need to be mutually exclusive with P1's
  // color picker (only one of them can be open at a time), and — just as importantly — P1's
  // press-away overlay only watches controlsHost.openId, so a dropdown opened on any *other* host
  // would be invisible to it and never close on an outside tap. Omit only if some future caller
  // genuinely wants this row fully independent (own host, own press-away wiring it'd have to
  // provide itself).
  host?: PopoverHost
  paddleSize: PaddleSizeLevel
  paddleSizeOptions: MenuOption<PaddleSizeLevel>[]
  onPaddleSizeChange: (value: PaddleSizeLevel) => void
  ballSpeed: BallSpeedLevel
  ballSpeedOptions: MenuOption<BallSpeedLevel>[]
  onBallSpeedChange: (value: BallSpeedLevel) => void
  scoreToWin: number
  scoreToWinOptions: MenuOption<number>[]
  onScoreToWinChange: (value: number) => void
  // Omitted entirely for two-player — there's no CPU to tune the difficulty of.
  aiDifficulty?: 'easy' | 'medium' | 'hard'
  aiDifficultyOptions?: MenuOption<'easy' | 'medium' | 'hard'>[]
  onAiDifficultyChange?: (value: 'easy' | 'medium' | 'hard') => void
  accentColor: string
  mutedColor: string
  onAccentColor?: string
  dark: boolean
}

// Always-upright row of shared (not per-player) settings in the loadout screen. Shares P1's popover
// host (passed in by loadout.tsx in every game mode — see the `host` prop above) rather than owning
// an independent one, so this row participates in P1's mutual-exclusivity and press-away wiring the
// same way P1's own panel does. Pruned down from AirHockey's version — no friction/puckSize (Pong's
// ball has no deceleration model and no goal-mouth width to widen/narrow — see BallSpeedLevel's own
// doc comment in types/index.ts), replaced by a single ballSpeed tier that governs both serve speed
// and the per-hit ratchet increment.
// Exported so loadout.tsx can tell whether one of THIS row's own popovers is open, for
// SharedActionBand's own popoverOpen prop — see BoxHockey's/AirHockey's/Snake's identical
// LOADOUT_SHARED_CONTROLS_IDS.
export const LOADOUT_SHARED_CONTROLS_IDS = ['paddleBallPhysics', 'scoreToWin', 'aiDifficulty']

export function LoadoutSharedControls({ host: sharedHost, paddleSize, paddleSizeOptions, onPaddleSizeChange, ballSpeed, ballSpeedOptions, onBallSpeedChange, scoreToWin, scoreToWinOptions, onScoreToWinChange, aiDifficulty, aiDifficultyOptions, onAiDifficultyChange, accentColor, mutedColor, onAccentColor, dark }: Props) {
  const ownHost = usePopoverHost()
  const host = sharedHost ?? ownHost
  // See PlayerSetupPanel's identical ownPopoverOpen comment — elevating this row for *any* open
  // popover on a shared host (rather than only its own) would tie it with whichever sibling panel
  // actually has the open popover, letting DOM order wrongly decide which one paints on top.
  const ownPopoverOpen = host.openId !== null && LOADOUT_SHARED_CONTROLS_IDS.includes(host.openId)
  const showAiDifficulty = !!(aiDifficulty && aiDifficultyOptions && onAiDifficultyChange)

  return (
    <View style={[styles.row, ownPopoverOpen && styles.rowOpen]}>
      {/* Paddle size and ball speed both just govern how the paddles/ball themselves behave, so
      they share one popover as two 'single' sections rather than two separate triggers.
      autoDismiss is off: with two real lists to browse, picking a value in one shouldn't snap the
      whole popover shut before the other has even been looked at — press-away or the trigger
      itself closes it once both are set. */}
      <SectionedDropdown
        id='paddleBallPhysics'
        host={host}
        icon='speedometer-medium'
        accessibilityLabel='Paddle & ball physics'
        autoDismiss={false}
        sections={[
          { kind: 'single', id: 'paddleSize', options: paddleSizeOptions, value: paddleSize, onChange: onPaddleSizeChange },
          { kind: 'single', id: 'ballSpeed', options: ballSpeedOptions, value: ballSpeed, onChange: onBallSpeedChange }
        ]}
        accentColor={accentColor}
        mutedColor={mutedColor}
        onAccentColor={onAccentColor}
        dark={dark}
      />

      <SectionedDropdown id='scoreToWin' host={host} icon='flag-checkered' accessibilityLabel='Score to win' sections={[{ kind: 'single', id: 'scoreToWin', options: scoreToWinOptions, value: scoreToWin, onChange: onScoreToWinChange }]} accentColor={accentColor} mutedColor={mutedColor} onAccentColor={onAccentColor} dark={dark} />

      {showAiDifficulty && <SectionedDropdown id='aiDifficulty' host={host} icon='chip' accessibilityLabel='CPU difficulty' sections={[{ kind: 'single', id: 'aiDifficulty', options: aiDifficultyOptions!, value: aiDifficulty!, onChange: onAiDifficultyChange! }]} accentColor={accentColor} mutedColor={mutedColor} onAccentColor={onAccentColor} dark={dark} />}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    // Safety net, not the primary fix — combining related pickers (see paddleBallPhysics above) is
    // what actually keeps this row from feeling cramped. But nothing capped its width before this,
    // and a row of fixed-size triggers with no wrap just runs off the screen edge on a narrow
    // device, taking the last trigger or two with it — untappable, not just clipped. Wrap is what
    // turns that into "drops to a second centered line" instead.
    flexWrap: 'wrap',
    // Matches LightCycles' LobbySharedControls — wider than a plain icon row would need, to give
    // each trigger's TriggerGauge arc (pulled in close around the icon itself — see TriggerGauge's
    // own ARC_GAP) room to breathe against its neighbors instead of the arcs crowding each other.
    gap: 20,
    justifyContent: 'center'
  },
  // See SectionedDropdown's anchorOpen comment — this row is itself a sibling of the player panels
  // in loadout.tsx, and React Native Web's per-view stacking contexts mean a popover escaping this
  // row's bounds needs the row itself elevated, not just the popover content, to paint above a
  // later sibling panel.
  rowOpen: {
    zIndex: 100
  }
})
