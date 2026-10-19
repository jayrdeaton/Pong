import { createReturningPlayerMigrate, type GuidePersistedState, type GuideStorageReader } from '@tastic/hud/guide'

import { GUIDE_VERSION } from '@/constants/guide'
import reducer, { guideActions, LEGACY_STORAGE_KEYS, selectGuideVersionSeen } from '@/redux/guideSlice'

const REHYDRATE = 'persist/REHYDRATE'
// redux-persist's own default persistConfig version (store.ts doesn't set one).
const PERSIST_VERSION = -1

// The factory's and the migrate's own behavior is covered in @tastic/hud's tests. This only pins this
// app's binding of them: GUIDE_VERSION is what an existing player is stamped with, it listens to
// store.ts's 'root' persist key, the slice is mounted (and therefore rehydrated) under `guide`, and
// players from the shipped pre-redux build are recognized by the keys that build wrote.
describe('guideSlice', () => {
  it('starts a fresh install as never seen, so the guide auto-shows on Home', () => {
    const state = reducer(undefined, { type: REHYDRATE, key: 'root', payload: undefined })
    expect(state.versionSeen).toBe(0)
  })

  it('stamps a player who already had the app with the current version, so an update never nags them', () => {
    // A real pre-guide Pong store: every root key it persisted, none of them `guide`.
    const state = reducer(undefined, { type: REHYDRATE, key: 'root', payload: { theme: {}, haptic: {}, sound: {}, profiles: {}, profileSelection: {}, seatColors: {} } })
    expect(state.versionSeen).toBe(GUIDE_VERSION)
  })

  it('still shows the guide to a player who closed the app before finishing or skipping it', () => {
    // Their first launch persisted `guide` at 0. That is not a pre-guide store, so no grandfathering.
    const state = reducer(undefined, { type: REHYDRATE, key: 'root', payload: { theme: {}, guide: { versionSeen: 0 } } })
    expect(state.versionSeen).toBe(0)
  })

  it('records the version on finish or skip, and reads back from the root state under `guide`', () => {
    const state = reducer(undefined, guideActions.markSeen(GUIDE_VERSION))

    expect(state.versionSeen).toBe(GUIDE_VERSION)
    expect(selectGuideVersionSeen({ guide: state })).toBe(GUIDE_VERSION)
  })
})

function storageWith(items: Record<string, string>): GuideStorageReader {
  return { getItem: async (key: string) => items[key] ?? null }
}

// store.ts's migrate over what storage held, then the guide slice rehydrated with its result, the
// same order redux-persist uses.
async function launch(persistedRoot: GuidePersistedState, storage: GuideStorageReader) {
  const payload = await createReturningPlayerMigrate(storage, LEGACY_STORAGE_KEYS)(persistedRoot, PERSIST_VERSION)
  return reducer(undefined, { type: REHYDRATE, key: 'root', payload }).versionSeen
}

describe('LEGACY_STORAGE_KEYS', () => {
  it("lists the shipped build's keys, each namespaced to the app (or to the airhockey prefix that build really wrote)", () => {
    expect(LEGACY_STORAGE_KEYS.length).toBeGreaterThan(0)
    expect(new Set(LEGACY_STORAGE_KEYS).size).toBe(LEGACY_STORAGE_KEYS.length)
    for (const key of LEGACY_STORAGE_KEYS) expect(key).toMatch(/^(pong|airhockey)\.[A-Za-z]+$/)
    // The one key every shipped player has once they've picked a mode.
    expect(LEGACY_STORAGE_KEYS).toContain('pong.settings')
  })

  it('grandfathers a player from the shipped pre-redux build: no root store, but any one of its keys', async () => {
    for (const key of LEGACY_STORAGE_KEYS) {
      expect(await launch(undefined, storageWith({ [key]: '{}' }))).toBe(GUIDE_VERSION)
    }
  })

  it('still shows the guide on a fresh install: no root store and none of those keys', async () => {
    expect(await launch(undefined, storageWith({}))).toBe(0)
  })
})

type StoreModule = typeof import('@/redux/store')
type AsyncStorageModule = typeof import('@react-native-async-storage/async-storage')

// The real store.ts (its real persistConfig: key 'root', no whitelist, the default reconciler and its
// migrate) over the in-memory AsyncStorage mock @infinitetoken/jest-config maps in, so this checks the
// actual persistConfig carries the migrate, not a copy of it. Each launch loads a fresh store module
// and a fresh, empty storage mock seeded with `items`, then copies what it persisted back into
// `items`, so consecutive launches see what the one before saved.
async function launchRealStore(items: Record<string, string>): Promise<number> {
  let loaded: { storage: AsyncStorageModule['default']; module: StoreModule } | undefined
  jest.isolateModules(() => {
    // The official mock is a plain CommonJS object (module.exports = the mock), with no `default`.
    const storage = require('@react-native-async-storage/async-storage') as AsyncStorageModule['default']
    // Its multiSet writes before its first await, so storage is seeded before store.ts reads it.
    void storage.multiSet(Object.entries(items))
    loaded = { storage, module: require('@/redux/store') as StoreModule }
  })
  const { storage, module } = loaded as NonNullable<typeof loaded>
  const { persistor, store } = module
  await new Promise<void>((resolve) => {
    if (persistor.getState().bootstrapped) resolve()
    else persistor.subscribe(() => persistor.getState().bootstrapped && resolve())
  })
  // Drains redux-persist's write queue, so no timer outlives the test.
  await persistor.flush()
  for (const [key, value] of await storage.multiGet(await storage.getAllKeys())) {
    if (value !== null) items[key] = value
  }
  return selectGuideVersionSeen(store.getState())
}

describe("store.ts's persistConfig", () => {
  it('grandfathers a shipped pre-redux player and shows a fresh install the guide', async () => {
    const shipped: Record<string, string> = { 'pong.settings': JSON.stringify({ gameMode: 'vsCpu' }) }
    expect(await launchRealStore(shipped)).toBe(GUIDE_VERSION)
    // Their root store now exists and holds the stamp, so every later launch keeps it.
    expect(JSON.parse(JSON.parse(shipped['pong:root']).guide)).toEqual({ versionSeen: GUIDE_VERSION })
    expect(await launchRealStore(shipped)).toBe(GUIDE_VERSION)

    const fresh: Record<string, string> = {}
    expect(await launchRealStore(fresh)).toBe(0)
    // Closing the app with the guide unfinished still shows it next launch.
    expect(await launchRealStore(fresh)).toBe(0)
  }, 60000)
})
