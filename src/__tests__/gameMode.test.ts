import { bricksActiveFor, humanPlayersFor, parseGameMode, tiltControlActiveFor } from '@/utils/gameMode'

describe('parseGameMode', () => {
  it('parses a valid route param', () => {
    expect(parseGameMode('vsCpu')).toBe('vsCpu')
    expect(parseGameMode('twoPlayer')).toBe('twoPlayer')
  })

  it('falls back to twoPlayer for anything else, including an undefined param', () => {
    expect(parseGameMode(undefined)).toBe('twoPlayer')
    expect(parseGameMode('garbage')).toBe('twoPlayer')
    // Solo is never a route param (see app/loadout.tsx's finalMode) - parseGameMode has no case for
    // it, so it falls through to the same default as any other unrecognized string.
    expect(parseGameMode('solo')).toBe('twoPlayer')
  })
})

describe('humanPlayersFor', () => {
  // Regression guard for the pre-fix bug: the original ternary keyed off 'vsCpu' (`=== 'vsCpu' ?
  // [1] : [1, 2]`), which silently fell into the [1, 2] branch for 'solo' - wrong, solo has no
  // second paddle at all.
  it('returns just seat 1 for both vsCpu and solo', () => {
    expect(humanPlayersFor('vsCpu')).toEqual([1])
    expect(humanPlayersFor('solo')).toEqual([1])
  })

  it('returns both seats for twoPlayer', () => {
    expect(humanPlayersFor('twoPlayer')).toEqual([1, 2])
  })
})

describe('bricksActiveFor', () => {
  it('is unconditionally true for solo, regardless of the stored toggle', () => {
    expect(bricksActiveFor('solo', false)).toBe(true)
    expect(bricksActiveFor('solo', true)).toBe(true)
  })

  it('follows the toggle for vsCpu and twoPlayer', () => {
    expect(bricksActiveFor('vsCpu', false)).toBe(false)
    expect(bricksActiveFor('vsCpu', true)).toBe(true)
    expect(bricksActiveFor('twoPlayer', false)).toBe(false)
    expect(bricksActiveFor('twoPlayer', true)).toBe(true)
  })
})

describe('tiltControlActiveFor', () => {
  it('is unconditionally false for twoPlayer, regardless of the stored toggle', () => {
    expect(tiltControlActiveFor('twoPlayer', false)).toBe(false)
    expect(tiltControlActiveFor('twoPlayer', true)).toBe(false)
  })

  it('follows the toggle for vsCpu and solo', () => {
    expect(tiltControlActiveFor('vsCpu', false)).toBe(false)
    expect(tiltControlActiveFor('vsCpu', true)).toBe(true)
    expect(tiltControlActiveFor('solo', false)).toBe(false)
    expect(tiltControlActiveFor('solo', true)).toBe(true)
  })
})
