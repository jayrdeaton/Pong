# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# Pong

A digital Pong game (Expo/React Native, Skia-rendered). Part of the `@rific`/`@tastic`/InfiniteToken app ecosystem — depends on `@rific/auto-paper`, `@rific/feedback-press`, `@rific/focus-chain`, `@rific/splash-gate`, `@rific/toaster`, `@rific/updater`, `@tastic/core`, `@tastic/hud`, `@tastic/physics`, `@tastic/profile`, `@tastic/split-screen`.

**Expo has changed.** Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code — don't rely on general Expo knowledge, this app is on SDK 57 specifically.

## Commands

```bash
npm run lint          # expo lint .
npm run fix            # expo lint . --fix
npm test               # Jest (4 suites, 62 tests)
npm run test:watch     # Jest --watchAll
npm run typecheck      # tsc
npm run verify         # lint + test + typecheck
npm run doctor         # expo install --fix && expo-doctor
npm start              # Expo dev server
npm run client          # Expo dev server (dev client build)
```

Always run `npm run lint` before finishing any task. This is an app (`"private": true`, no publish scripts) — `verify` doesn't include a build step.

`build:development`/`build:preview`/`build:production` and `update` (which `update:development`/`update:preview`/`update:production` delegate to) are each gated behind `verify` by prefixing `npm run verify && ` directly onto the script's own definition, same as every other migrated app — see Swirlio's CLAUDE.md for the full reasoning (not redundant with CI, since EAS builds/OTA updates have no GitHub Action step to catch this the way `publish.yml` does; inline chaining rather than a separate `pre<script>` hook, since these are scripts we author ourselves, not builtin npm commands).

## Tooling

Unlike Swirlio/LightCycles/BoxHockey/CashierFu-Utility, this app was never hand-rolled and migrated — it was bootstrapped directly from the already-migrated template (`eslint.config.cjs`, `jest.config.cjs`, `jest.setup.cjs`, `tsconfig.json` all matched the finished shape from day one). Found with **zero commits at all** (every file untracked) the first time this was checked — a fresh, uncommitted scaffold, not a repo with real history to be careful around. What this pass actually did was verify + finish it, not migrate it:

- `npx expo install --fix` + `npm update` — genuinely found real staleness (`expo`, `expo-constants`, `expo-font`, `expo-updates`, `react-native` were all a patch or two behind), confirmed clean afterward.
- `tsconfig.json` had a local `"types": ["jest", "node"]` override that was copied forward from before `@infinitetoken/tsconfig/expo` baked in its own `["jest", "node", "react-native"]` default — redundant (missing `"react-native"` for no reason) and unnecessary now; removed. Also bumped `@infinitetoken/tsconfig` from `^0.4.0` to `^0.4.1` to actually get that default.
- `metro.config.js` was pure `getDefaultConfig(__dirname)` boilerplate — confirmed via `npx expo export -p web` (builds clean, `canvaskit.wasm` still lands in `dist/`) and deleted, same as Swirlio/LightCycles/BoxHockey. Not every app's `metro.config.js` is boilerplate though — see CashierFu-Utility's CLAUDE.md for a real counter-example with load-bearing custom resolver logic; always check before assuming either way.
- **No `src/__mocks__/` exists yet, and none were needed** — the only tests so far are pure-logic (`useGameState`, `physics`, `boardGeometry`, `aiOpponent`), no component-rendering tests that would need `react-native-reanimated`/`react-native-gesture-handler`/etc. mocked yet, even though this app depends on both. When component tests get added, follow the `src/__mocks__/*.ts` convention from the start (see LightCycles'/BoxHockey's CLAUDE.md) — don't reach for inline `jest.mock()` calls in `jest.setup.cjs`.
- CI workflow and `verify` script naming were already correct (`@v1`, no `with: script:` override) — this app never had the `ci`-script-name problem the older apps did.

## Testing

- Framework: Jest (`@infinitetoken/jest-config/expo`, `jest-expo` preset)
- Tests live in `src/__tests__/`
- `jest.setup.cjs` holds only genuine setup-file concerns: process-level error handlers, RAF polyfills, the `IS_REACT_ACT_ENVIRONMENT` flag, the no-factory `NativeAnimatedHelper` automock — no mocks yet, see Tooling above
- Native/Expo module mocks, once needed, go in `src/__mocks__/`, one file per module, picked up automatically (no `jest.mock()` call needed)

## Architecture

```
src/
  app/          - expo-router routes
  components/   - UI components (board rendering, controls)
  constants/    - static config, game params
  hooks/        - custom hooks (game state, AI opponent)
  types/        - shared TypeScript types
  utils/        - physics, board geometry, validation
  __tests__/    - test suites
```

## CI

`.github/workflows/ci.yml` uses the shared reusable workflow (`infinitetoken/Workflows/.github/workflows/npm-ci.yml@v1`, defaults to `npm run verify`).
