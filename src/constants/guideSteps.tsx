import { type GuideStep, type SeatDevice, SeatDevicesHint } from '@tastic/hud/guide'
import type { KeyScheme } from '@tastic/input'

import { GuideMouseDrag, GuidePaddleDrag, GuideScorePoint, GuideSplitPhone, GuideUpDownKeys, type UpDownKeyLabels } from '@/components/GuideArt'
import type { ControlScheme, Player } from '@/types'

// How each seat's control scheme reads in a sentence, and on GuideUpDownKeys' two caps (undefined =
// draw the arrow keys as arrows). Only up and down: KeyboardInputLayer never reads left/right, since
// a Pong paddle has one axis. Deliberately not the loadout's own CONTROL_SCHEME_OPTIONS labels
// ('Mouse', 'Arrows'), which are picker labels, not prose.
const SEAT_PHRASE: Record<ControlScheme, string> = { mouse: 'the mouse', wasd: 'W and S', arrows: 'the arrow keys', ijkl: 'I and K', numpad: 'the numpad' }
const KEY_CAPS: Record<KeyScheme, UpDownKeyLabels | undefined> = {
  wasd: { up: 'W', down: 'S' },
  arrows: undefined,
  ijkl: { up: 'I', down: 'K' },
  numpad: { up: '8', down: '2' }
}

// What SeatDevicesHint draws for each seat on the desktop two-player card: every key scheme is the
// keyboard, 'mouse' is the pointer drag.
function seatDevice(scheme: ControlScheme): SeatDevice {
  return scheme === 'mouse' ? 'mouse' : 'keyboard'
}

interface GuideStepsInput {
  // A touch screen vs. a desktop browser: a phone drags with a finger, a desktop with the mouse or keys.
  touch: boolean
  // Each seat's live control scheme (settings.controlScheme), only read on desktop. Seats pick their
  // own in the loadout, so a replayed guide has to name the real ones, not the defaults.
  controls: Record<Player, ControlScheme>
  // The live settings.scoreToWin (3/5/7/10, picked in the loadout), for the same reason.
  scoreToWin: number
}

// The three cards of Pong's how-to-play flow. Pure and hook-free so it's trivially testable;
// GuideHost feeds it useIsTouchPrimaryDevice() and the live settings, and memoizes the result.
//
// What's here is what a first-time player cannot work out alone (none of it is printed anywhere in
// the game): the paddle lines up with your finger (absolute, not nudged, and you never have to touch
// the paddle itself); you score by getting the ball past the other paddle, first to scoreToWin wins;
// and in two-player each player drags in their own half of one phone. Copy rules (Jay, 2026-09-24):
// Title Case titles, short bodies, and only say what's true in every mode. This shows on Home before
// any mode is picked, so the steering card never says "your half" (One Player drags anywhere) and the
// scoring card scopes its one exception, One Player with the CPU set to None (solo Brickbreaker: no
// other paddle, clear the bricks instead), rather than letting "First to 5 Points Wins" stand
// unqualified ("Points", because a bare "First to 5 Wins" can read as five match wins). No card
// explaining One Player vs Two Player: those buttons are right behind the dialog. Bricks and tilt
// steering are off by default, so neither gets a card.
//
// Desktop: the pointer drag is on for EVERY seat whatever its scheme (KeyboardInputLayer only ever
// adds keys on top of TouchInputLayer, never replaces it), so "click and drag" is true for anyone
// reading the steering card, and naming a key scheme there has to stay generic ("your up or down
// key"): two-player readers include a player 2 whose keys differ from player 1's. The two-player
// card names each seat's real controls in the fleet's shared wording (the same title and sentences
// every desktop two-player card in the fleet uses, with this game's own SEAT_PHRASE), and whenever a
// seat is on the mouse it also carries the own-half rule, which the steering card can't (One Player
// drags anywhere).
export function getGuideSteps({ touch, controls, scoreToWin }: GuideStepsInput): GuideStep[] {
  const p1 = controls[1]
  const anyMouse = controls[1] === 'mouse' || controls[2] === 'mouse'
  const bothMouse = controls[1] === 'mouse' && controls[2] === 'mouse'

  return [
    touch
      ? {
          title: 'Move Your Paddle',
          body: 'Touch and drag. Your paddle lines up with your finger and follows it.',
          art: <GuidePaddleDrag />
        }
      : p1 === 'mouse'
        ? {
            title: 'Move Your Paddle',
            body: 'Click and drag. Your paddle lines up with the pointer.',
            art: <GuideMouseDrag />
          }
        : {
            title: 'Move Your Paddle',
            body: 'Hold your up or down key to move your paddle, or click and drag.',
            art: <GuideUpDownKeys labels={KEY_CAPS[p1]} />
          },
    {
      title: `First to ${scoreToWin} Points Wins`,
      body: 'Get the ball past the other paddle to score. With the CPU set to None, clear every brick.',
      art: <GuideScorePoint />
    },
    touch
      ? {
          title: 'Two Players, One Phone',
          body: 'Each of you drags in your own half of the screen.',
          art: <GuideSplitPhone />
        }
      : {
          // "One Keyboard" only when it's true: the default desktop setup puts player 1 on the mouse.
          title: anyMouse ? 'Two Players, One Computer' : 'Two Players, One Keyboard',
          // With a mouse seat, the second sentence is the own-half rule instead: a two-player drag
          // moves whichever paddle's half it starts in (TouchInputLayer's two zones), so a mouse
          // player who drags on the far side moves the other player's paddle. The two sentences
          // together run past 90 characters, and the loadout's control pickers are in plain view. Both
          // seats on the mouse is said once ("Both players use the mouse.") instead of twice.
          body: bothMouse ? 'Both players use the mouse. Drag in your own half.' : `Player 1 uses ${SEAT_PHRASE[controls[1]]}, player 2 uses ${SEAT_PHRASE[controls[2]]}. ${anyMouse ? 'Drag in your own half.' : 'Change them before a match.'}`,
          art: <SeatDevicesHint devices={[seatDevice(controls[1]), seatDevice(controls[2])]} />
        }
  ]
}
