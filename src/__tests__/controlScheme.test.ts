import { resolveControlSchemeDirection } from '@/utils/controlScheme'

describe('resolveControlSchemeDirection', () => {
  it('returns null for the mouse scheme regardless of key', () => {
    expect(resolveControlSchemeDirection({ key: 'w', code: 'KeyW' }, 'mouse')).toBeNull()
    expect(resolveControlSchemeDirection({ key: 'ArrowUp', code: 'ArrowUp' }, 'mouse')).toBeNull()
  })

  it('resolves wasd by key', () => {
    expect(resolveControlSchemeDirection({ key: 'w', code: 'KeyW' }, 'wasd')).toBe('up')
    expect(resolveControlSchemeDirection({ key: 's', code: 'KeyS' }, 'wasd')).toBe('down')
  })

  it('resolves arrows by key', () => {
    expect(resolveControlSchemeDirection({ key: 'ArrowUp', code: 'ArrowUp' }, 'arrows')).toBe('up')
    expect(resolveControlSchemeDirection({ key: 'ArrowDown', code: 'ArrowDown' }, 'arrows')).toBe('down')
  })

  it('resolves ijkl by key', () => {
    expect(resolveControlSchemeDirection({ key: 'i', code: 'KeyI' }, 'ijkl')).toBe('up')
    expect(resolveControlSchemeDirection({ key: 'k', code: 'KeyK' }, 'ijkl')).toBe('down')
  })

  it('resolves numpad by code, independent of NumLock (.key may read as a digit or an arrow name)', () => {
    expect(resolveControlSchemeDirection({ key: '8', code: 'Numpad8' }, 'numpad')).toBe('up')
    expect(resolveControlSchemeDirection({ key: 'ArrowDown', code: 'Numpad2' }, 'numpad')).toBe('down')
  })

  it('returns null for a key not in the given scheme', () => {
    expect(resolveControlSchemeDirection({ key: 'q', code: 'KeyQ' }, 'wasd')).toBeNull()
  })
})
