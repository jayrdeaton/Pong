import { SeatDevicesHint } from '@tastic/hud/guide'
import type { ReactElement } from 'react'

import { GuideUpDownKeys } from '@/components/GuideArt'
import { getGuideSteps } from '@/constants/guideSteps'
import { DEFAULT_SETTINGS } from '@/redux/settingsSlice'
import type { ControlScheme, Player } from '@/types'

const DEFAULT_CONTROLS = DEFAULT_SETTINGS.controlScheme
const ALL_SCHEMES: ControlScheme[] = ['mouse', 'wasd', 'arrows', 'ijkl', 'numpad']
// The loadout's own SCORE_TO_WIN_OPTIONS.
const SCORE_OPTIONS = [3, 5, 7, 10]
// How the desktop two-player card names each scheme: Pong's own phrases (a paddle only uses two keys,
// so "W and S", not "WASD"), and "the mouse" as everywhere in the fleet.
const PHRASE: Record<ControlScheme, string> = { mouse: 'the mouse', wasd: 'W and S', arrows: 'the arrow keys', ijkl: 'I and K', numpad: 'the numpad' }

function stepsFor(touch: boolean, controls: Record<Player, ControlScheme> = DEFAULT_CONTROLS, scoreToWin = DEFAULT_SETTINGS.scoreToWin) {
  return getGuideSteps({ touch, controls, scoreToWin })
}

function textOf(touch: boolean, controls?: Record<Player, ControlScheme>) {
  return stepsFor(touch, controls)
    .map((step) => `${step.title} ${step.body}`)
    .join(' ')
}

// Every setting the copy reads, in every combination a player can reach.
const EVERY_INPUT = [true, false].flatMap((touch) => ALL_SCHEMES.flatMap((p1) => ALL_SCHEMES.flatMap((p2) => SCORE_OPTIONS.map((scoreToWin) => ({ touch, controls: { 1: p1, 2: p2 }, scoreToWin })))))

describe('getGuideSteps', () => {
  it('gives every guide three complete, illustrated, short cards, whatever the live settings', () => {
    for (const input of EVERY_INPUT) {
      const steps = getGuideSteps(input)

      expect(steps).toHaveLength(3)
      for (const step of steps) {
        expect(step.title.trim().length).toBeGreaterThan(0)
        // A card a casual player reads in a glance, not a wall of text.
        expect(step.body.length).toBeLessThanOrEqual(90)
        // The pager sizes every page to the tallest, so a card without art leaves a visible gap.
        expect(step.art).toBeDefined()
        // Jay's copy rules: no rhetorical questions, no em dashes.
        expect(`${step.title} ${step.body}`).not.toMatch(/[?\u2013\u2014]/)
      }
    }
  })

  it('headlines the win condition at the live score to win, and scopes the one mode it is not true for', () => {
    for (const touch of [true, false]) {
      const [, rules] = stepsFor(touch)
      // "Points", so it can't read as five match wins.
      expect(rules.title).toBe('First to 5 Points Wins')
      expect(rules.body).toMatch(/past the other paddle to score/)
      // One Player with the CPU set to None is solo Brickbreaker: no other paddle, no score.
      expect(rules.body).toMatch(/With the CPU set to None, clear every brick/)
    }
    for (const scoreToWin of SCORE_OPTIONS) expect(stepsFor(true, DEFAULT_CONTROLS, scoreToWin)[1].title).toBe(`First to ${scoreToWin} Points Wins`)
  })

  it('teaches dragging on touch, and only says "your own half" on the two-player card (One Player drags anywhere)', () => {
    const [steer, rules, twoPlayer] = stepsFor(true)

    expect(steer.body).toMatch(/drag/i)
    expect(steer.body).toMatch(/lines up with your finger/)
    expect(steer.body).not.toMatch(/half|anywhere/i)
    expect(rules.body).not.toMatch(/half/i)
    expect(twoPlayer.title).toBe('Two Players, One Phone')
    expect(twoPlayer.body).toMatch(/your own half/i)
  })

  it('never tells a touch player to press keys or click, and never tells a desktop player to swipe or touch', () => {
    for (const p1 of ALL_SCHEMES) {
      for (const p2 of ALL_SCHEMES) {
        expect(textOf(true, { 1: p1, 2: p2 })).not.toMatch(/\bkeys?\b|keyboard|click|mouse|pointer/i)
        expect(textOf(false, { 1: p1, 2: p2 })).not.toMatch(/swipe|touch|finger|phone/i)
      }
    }
  })

  it("steers with player 1's live scheme on desktop, in words that stay true for a player 2 on a different one", () => {
    // The pointer drag works for every seat whatever its scheme, so it can always be taught.
    expect(stepsFor(false, { 1: 'mouse', 2: 'wasd' })[0].body).toBe('Click and drag. Your paddle lines up with the pointer.')
    for (const p1 of ['wasd', 'arrows', 'ijkl', 'numpad'] as const) {
      const [steer] = stepsFor(false, { 1: p1, 2: 'mouse' })
      expect(steer.body).toMatch(/Hold your up or down key/)
      expect(steer.body).toMatch(/click and drag/)
    }
  })

  it('names the controls each seat actually uses on the two-player desktop card', () => {
    // The defaults: player 1 on the mouse, player 2 on WASD. Not "One Keyboard" then.
    const [, , defaults] = stepsFor(false)
    expect(defaults.title).toBe('Two Players, One Computer')
    expect(defaults.body).toMatch(/^Player 1 uses the mouse, player 2 uses W and S\./)

    const [, , keysOnly] = stepsFor(false, { 1: 'arrows', 2: 'ijkl' })
    expect(keysOnly.title).toBe('Two Players, One Keyboard')
    expect(keysOnly.body).toMatch(/^Player 1 uses the arrow keys, player 2 uses I and K\./)
    expect(stepsFor(false, { 1: 'numpad', 2: 'wasd' })[2].body).toMatch(/^Player 1 uses the numpad, player 2 uses W and S\./)
  })

  it("uses the fleet's desktop two-player wording for every pair of seat schemes, in 90 characters or fewer", () => {
    for (const p1 of ALL_SCHEMES) {
      for (const p2 of ALL_SCHEMES) {
        const [, , twoPlayer] = stepsFor(false, { 1: p1, 2: p2 })
        const anyMouse = p1 === 'mouse' || p2 === 'mouse'
        const bothMouse = p1 === 'mouse' && p2 === 'mouse'

        expect(twoPlayer.title).toBe(anyMouse ? 'Two Players, One Computer' : 'Two Players, One Keyboard')
        expect(twoPlayer.body).toBe(bothMouse ? 'Both players use the mouse. Drag in your own half.' : `Player 1 uses ${PHRASE[p1]}, player 2 uses ${PHRASE[p2]}.${anyMouse ? ' Drag in your own half.' : ' Change them before a match.'}`)
        expect(twoPlayer.body.length).toBeLessThanOrEqual(90)
      }
    }
  })

  it("draws each seat's live device on the desktop two-player card, and player 1's own keys on the steering card", () => {
    for (const p1 of ALL_SCHEMES) {
      for (const p2 of ALL_SCHEMES) {
        const [steer, , twoPlayer] = stepsFor(false, { 1: p1, 2: p2 })
        const seatsArt = twoPlayer.art as ReactElement<{ devices: string[] }>

        expect(seatsArt.type).toBe(SeatDevicesHint)
        expect(seatsArt.props.devices).toEqual([p1 === 'mouse' ? 'mouse' : 'keyboard', p2 === 'mouse' ? 'mouse' : 'keyboard'])
        if (p1 !== 'mouse') expect((steer.art as ReactElement).type).toBe(GuideUpDownKeys)
      }
    }
    // The caps print the seat's own keys; the arrow keys draw as arrows (no labels).
    expect((stepsFor(false, { 1: 'wasd', 2: 'mouse' })[0].art as ReactElement<{ labels?: object }>).props.labels).toEqual({ up: 'W', down: 'S' })
    expect((stepsFor(false, { 1: 'arrows', 2: 'mouse' })[0].art as ReactElement<{ labels?: object }>).props.labels).toBeUndefined()
  })

  it('teaches the own-half rule on the two-player desktop card whenever a seat is on the mouse, and never on the first two cards', () => {
    // A two-player drag moves whichever paddle's half it starts in, so the default player 1 (on the
    // mouse) dragging on the far side would move player 2's paddle.
    expect(stepsFor(false)[2].body).toBe('Player 1 uses the mouse, player 2 uses W and S. Drag in your own half.')

    for (const p1 of ALL_SCHEMES) {
      for (const p2 of ALL_SCHEMES) {
        const [steer, rules, twoPlayer] = stepsFor(false, { 1: p1, 2: p2 })
        const anyMouse = p1 === 'mouse' || p2 === 'mouse'

        expect(steer.body).not.toMatch(/half|anywhere/i)
        expect(rules.body).not.toMatch(/half/i)
        expect(twoPlayer.body).toMatch(anyMouse ? /\. Drag in your own half\.$/ : /\. Change them before a match\.$/)
      }
    }
  })
})
