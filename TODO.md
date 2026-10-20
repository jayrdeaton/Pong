# TODO

Open fixes from the 2026-10-15 review of the 2026-10-08 fleet audit. Line numbers are as of that date. The F042, F094 and F010 fixes and `@tastic/profile` 0.12.0 landed on 2026-10-15, and F037 (device-wide unlocks on the winner's card only) with `@tastic/achievements` 0.6.0.

## Before launch

Nothing open: the 2026-10-15 live checks passed and keep-awake is in (see CLAUDE.md).

## After launch

1. **Android hardware back and web browser back skip "Quit Match?"** (audit F093). Needs hud support (an opt-in `BackHandler` in `useQuitConfirmation`, plus a router-level block for web). Before an Android release; iOS is unaffected.
2. **The Update Available prompt and toasts stay portrait while the screen is turned** (audit F007). The UpdateDialog wrapper passes no `rotation`, and the Toaster sits outside any turned frame. Pass `rotation`, or mount both in hud's `RotatedFrame`.
3. **Home's hero animation keeps looping under `/loadout` and `/game`** (audit F016). Pause it on blur and in the background, as Solitaire's HeroCards does (`useIsFocused` plus AppState).
4. **A loadout shared-setting dropdown can open toward the wrong edge during the panel-swap fade** (audit F225; from reading the code, not reproduced). Pass the `panelLayout` rotation to each shared-control trigger, as BoxHockey does.

## Expo SDK 58 follow-ups (2026-10-18)

Deferred to ship SDK 58 the same day:

- **Check it on a device.** Verify, typecheck and `npx expo config --type prebuild` pass, but nothing ran on hardware: launch (SDK 58's scene life cycle), swiping a toast away (`@rific/toaster` 0.9.0 still builds its swipe with gesture-handler's deprecated `Gesture.Pan()` builder, and its tests mock gesture-handler), dragging a paddle (`TouchInputLayer`'s `Gesture.Pan()`, the same deprecated builder, still working in gesture-handler 3.3), tilt steering, the Skia board (2.6 to 2.14), and the edge-gesture guard.
- **React Native 0.88 strict types.** `@infinitetoken/tsconfig` 0.6 resolves React Native 0.88's legacy types, and React Native drops them after 0.88. Checked 2026-10-18 with `customConditions: ["react-native"]` only: 30 errors. One is this app's own: `src/components/Theme.tsx` hands auto-paper `maskedView={MaskedView}`, and masked-view 0.3.2's own types build `MaskedView` on React Native's legacy `NativeMethods` type, which the strict types don't export, so it no longer reads as a component to auto-paper's `MaskedViewModule`. BoxHockey's `Theme.tsx` passes it the same way, so this is likely fleet-wide: fix it once (in auto-paper's type or masked-view's), not per app. The rest are in package source it type-checks (`@tastic/hud` 15, `@tastic/split-screen` 6, `@rific/auto-paper` 3, `@tastic/profile` 3, `@tastic/core` 1, `@rific/updater` 1). Fix those packages first (their TODO.md files), then drop the deferral.
- **Web tab title in the static HTML.** Since SDK 58, `expo-router/head`'s `<Head>` (in `src/components/Fonts.tsx`) only sets the title after hydration; the static export's HTML has none, so the tab shows the URL until the JS loads and crawlers see no title. Export `generateMetadata()` (returns `{ title }`) from each route, or from the root layout if Expo Router supports it there, then drop `<Head>`.

## NOTES

The speed ramp up is way too fast.