/* global jest */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// A manual mock under src/__mocks__/ for a BARE node_modules package name is picked up
// automatically, with zero registration needed. A manual mock for a deep SUBPATH of a package is
// not reliably auto-applied the same way, so each subpath import below is registered explicitly —
// same asymmetry documented at length in Hangman's jest.setup.cjs (see this repo's own
// .claude/CLAUDE.md). Neither specifier below is currently reached by this app's test suite (a
// console.warn probe planted in each real, resolved node_modules file never fired across the full
// suite), so this is closing a dormant gap before a future test starts exercising that path, not
// fixing a live failure.
//
// Feedback.tsx and useGameSound.ts both import this exact subpath directly
// (`@rific/feedback-press/audio`) for its `useAudioPool` hook. Same proven-safe stub shape used
// identically for this package across Snake/Swirlio/Hangman's own jest.setup — no carve-out for a
// real-behavior test needed here, since (unlike Hangman) no test file in this app exercises
// useAudioPool's own pooling/timing behavior directly.
jest.mock('@rific/feedback-press/audio', () => ({
  __esModule: true,
  useAudioPool: () => () => {}
}))
// loadSkiaWeb.web.ts imports this exact subpath directly (`@shopify/react-native-skia/src/web`)
// for its named `LoadSkiaWeb` export — an async function that fetches and initializes the real
// CanvasKit WASM build at runtime (see node_modules/@shopify/react-native-skia/src/web/LoadSkiaWeb.tsx).
// Stubbed as an inert async no-op, matching loadSkiaWeb.ts's own native counterpart (which never
// touches CanvasKit at all) rather than actually resolving WASM in a Jest/jsdom environment.
jest.mock('@shopify/react-native-skia/src/web', () => ({
  __esModule: true,
  LoadSkiaWeb: () => Promise.resolve()
}))

const handleUnhandledRejection = (reason) => {
  // eslint-disable-next-line no-console
  console.error('UnhandledRejection in tests:', reason)
}

const handleUncaughtException = (err) => {
  // eslint-disable-next-line no-console
  console.error('UncaughtException in tests:', err)
}

if (typeof process !== 'undefined' && process && process.on) {
  process.on('unhandledRejection', handleUnhandledRejection)
  process.on('uncaughtException', handleUncaughtException)
}

try {
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper')
} catch {
  // ignore if the path isn't present in this environment
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
}
if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
}
