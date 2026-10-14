# Pong

Classic two-paddle Pong on one screen: play the CPU, sit face-to-face with a friend on one device, or switch the CPU off and break bricks.

Pong is a real-time paddle game for iOS, Android, and web. Built with Expo, React Native, and React Native Skia, it's part of a family of games built on my open-source `@tastic` game-engine and `@rific` Expo utility packages. App Store and Google Play release in progress.

<!-- TODO: add gameplay GIF/screenshot here -->

## Features

- **Three ways to play:** One Player against a CPU opponent (Easy, Medium, Hard), Two Player with both people on the same device, each controlling the paddle in their own half, or Brickbreaker: set the CPU to None and clear a 48-brick field off the far wall with three lives.
- **Pre-match loadout:** each seat picks a profile, color, and (on desktop web) a control scheme, then readies up. Shared options cover paddle size (Small, Medium, Large), ball speed (Slow, Medium, Fast), score to win (3, 5, 7, or 10), an optional Bricks block in the middle of the court for One Player and Two Player matches, and Tilt Control for single-player games on iOS and Android.
- **Touch, mouse, keyboard, and tilt:** your paddle lines up with your finger or the pointer anywhere in your zone (the whole screen in One Player, your own half in Two Player), so you never have to grab the paddle itself. On desktop web either seat can switch to WASD, Arrows, IJKL, or Numpad, and Tilt Control steers by tilting the device.
- **Plays in any orientation:** face-to-face in portrait or side-by-side in landscape, with an app-wide Lock Orientation setting. In One Player your paddle sits at the bottom of a portrait hold.
- **Ball speed that builds:** every paddle hit speeds the ball up to a cap set by the ball speed option, and where the ball meets the paddle changes the return angle.
- **Player profiles:** saved names, colors, and tags per seat. On iOS the roster is shared with my other games through an App Group.
- **Stats and achievements:** per-profile and device-wide records (overall, points and shutouts, vs CPU streaks, two-player results, win-loss by ball speed, player rankings, days played) and 40 bronze/silver/gold achievements. In Two Player, new unlocks are listed per seat on the game-over card instead of a toast, so each player can read their own.
- **How-to-play guide:** a short first-run guide, replayable from Settings on Home and the loadout, whose copy reflects each seat's live control scheme and the current score to win.
- **Settings:** sound, haptics, appearance, Lock Orientation, an iOS option to defer system edge gestures during play, and a manual update check. Leaving the app mid-match pauses it behind a Paused dialog, and backing out of a match in progress asks Quit Match? first.

## Under the hood

- **Physics:** a custom ball integrator (`src/utils/physics.ts`) built on `@tastic/physics` collision primitives (circle vs. rect, reflection). Paddle hits are an infinite-mass collision done by shifting into the paddle's reference frame, so the paddle's velocity (smoothed over a few ticks and capped) carries into the shot, plus a classic Pong steer from where on the paddle the ball struck. Each hit ratchets the ball's tracked speed by a fixed step up to the tier's max, while wall bounces are lossless. Every tick is sub-stepped against the paddle's thickness so a fast ball can't tunnel through it, and each serve heads toward the player who just conceded.
- **Bricks:** brick hits never add speed, and whenever bricks are in play every brick and wall bounce gets a small random angle nudge (up to 4°) so the ball can't settle into a loop inside a half-cleared pocket. Classic matches without bricks keep fully deterministic wall bounces. In Brickbreaker the far edge becomes a wall, and clearing the last brick wins even if the ball slips past your paddle later in the same tick.
- **AI opponent:** the CPU picks a target position every tick and feeds it through the same input path a human's drag uses. Each difficulty tunes how far ahead it predicts the ball, how much aim jitter it has, and how fast its paddle can move. The jitter is smoothed over about 20 frames so the CPU's aim wanders like a real player's instead of shaking.
- **One coordinate space, rotated:** board geometry, physics, and AI all work in a single landscape-shaped local space. A portrait hold rotates the board by ±90°, and touch input lives outside the rotated view and is mapped back to board coordinates by inverting that rotation explicitly, because Gesture Handler doesn't correct for an ancestor's rotation. Score labels turn to face each player, and a resize or rotation mid-rally rescales the ball, paddles, and bricks instead of resetting them.
- **Split-screen input:** in Two Player each seat gets its own gesture zone covering its own half. The loadout uses `@tastic/split-screen` to lay out both players' panels facing each other or side by side, and in a face-to-face match the back and settings buttons move to the neutral screen edges.
- **Keyboard and tilt:** keyboard seats are driven by a held-key set with its own `requestAnimationFrame` loop for continuous paddle motion, and the loadout's pickers use `@tastic/input`'s `assignSeatScheme`, which swaps schemes when they conflict so two seats never share one. Tilt Control reads `expo-sensors` device motion at a faster rate only while it's steering, recalibrates at every serve, has a small dead zone, and freezes the board's orientation for the match so a hard tilt can't rotate it mid-rally.
- **Skia rendering across platforms:** the court, paddles, ball, bricks, and Brickbreaker wall are drawn with React Native Skia and `@tastic/sprites`. `BoardHost.web.tsx` lazy-loads the board only after CanvasKit (WASM) is ready, while the native `BoardHost.tsx` is a passthrough. On desktop web the court is letterboxed to 16:9 with drawn walls.
- **State and updates:** Redux Toolkit with redux-persist covers settings, profiles, seat colors, stats, achievements, and guide state, with per-round state left out of persistence so a settings change mid-match only applies to the next one. A persist `migrate` recognizes players from the pre-Redux build so they skip the guide. Over-the-air updates ship through `expo-updates` and `@rific/updater`.
- **Tests:** 14 Jest suites with 204 tests covering physics, the AI, board geometry and brick fields, the game-state reducer, tilt mapping, control schemes, game-mode rules, stats and achievements, settings and guide persistence, the guide copy for every control-scheme pair, and profile syncing. CI runs `npm run verify` on pushes and pull requests to `main`.

## Built on

| Package | Used for |
| --- | --- |
| [`@tastic/core`](https://github.com/jayrdeaton/React-Native-Game-Core) | Game loop, orientation and rotation handling, background pause, config plugin for the native portrait lock |
| [`@tastic/physics`](https://www.npmjs.com/package/@tastic/physics) | Circle/rect collision and reflection |
| [`@tastic/input`](https://www.npmjs.com/package/@tastic/input) | Keyboard scheme resolution and conflict-free seat scheme assignment |
| [`@tastic/split-screen`](https://www.npmjs.com/package/@tastic/split-screen) | Two-player loadout zone layout (face-to-face vs side-by-side) |
| [`@tastic/hud`](https://www.npmjs.com/package/@tastic/hud) | Player setup panels, dropdowns, ready buttons, settings, confirm, and update dialogs, stats screen sections, how-to-play guide, Skia web loader |
| [`@tastic/sprites`](https://www.npmjs.com/package/@tastic/sprites) | Skia ball and brick shapes |
| [`@tastic/profile`](https://www.npmjs.com/package/@tastic/profile) | Player profiles, roster screen, seat selection and color slices, shared App Group sync |
| [`@tastic/achievements`](https://www.npmjs.com/package/@tastic/achievements) | Tiered achievement catalog, streak tracking, Redux-backed persistence |
| [`@tastic/edge-guard`](https://www.npmjs.com/package/@tastic/edge-guard) | Optional guard against iOS edge system gestures during play |
| [`@rific/core`](https://www.npmjs.com/package/@rific/core) | Redux settings slice factory, safe back navigation |
| [`@rific/auto-paper`](https://www.npmjs.com/package/@rific/auto-paper) | React Native Paper theming from seat colors, light/dark appearance |
| [`@rific/feedback-press`](https://www.npmjs.com/package/@rific/feedback-press) | Buttons with haptic and sound feedback, vibration, game sounds |
| [`@rific/toaster`](https://www.npmjs.com/package/@rific/toaster) | Toast notifications (achievement unlocks, update errors) |
| [`@rific/splash-gate`](https://www.npmjs.com/package/@rific/splash-gate) | Keeps the splash screen up until fonts, theme, and profiles are ready |
| [`@rific/updater`](https://www.npmjs.com/package/@rific/updater) | OTA update checks and the build/update scripts |
| [`@rific/focus-chain`](https://www.npmjs.com/package/@rific/focus-chain) | Peer dependency of `@tastic/profile` for form focus |

## Getting started

```bash
npm install
npm run ios        # or: npm run android / npm start (web)
```

The app uses native code that Expo Go doesn't include (the `@tastic/core` and `@tastic/edge-guard` config plugins and `@tastic/profile`'s native iOS shared-roster module), so iOS and Android run as a development build (`expo-dev-client`). `npm run ios` and `npm run android` build it locally, and once a dev client is installed, `npm run client` starts Metro for it. `npm install` also runs `setup-skia-web`, which sets up CanvasKit for the web target. Sound starts off in development builds.

### Checks

```bash
npm run verify     # lint (expo lint) + Jest + typecheck (tsc)
```

## Project layout

```
src/
  app/          expo-router screens: home, loadout, game, profiles, achievements
  components/   board rendering, touch, keyboard, and tilt input layers, dialogs, theme, title animation, guide host and art
  constants/    game tuning, achievement catalog, guide steps, fonts, release info
  hooks/        game state reducer and loop, AI opponent, profiles, stats, settings, sound
  redux/        redux-persist store and slices (settings, profile selection, seat colors, achievements, guide, live play)
  types/        shared TypeScript types
  utils/        physics, board geometry and brick fields, AI, tilt mapping, control schemes, game modes, stats engine and validation
  __tests__/    Jest suites
  __mocks__/    manual mocks for Reanimated and Worklets
```

## License

The code is released under the MIT License, see [LICENSE](LICENSE).

The game's name, logo, and icons, and the original artwork and audio in this repository, are not covered by that license and remain all rights reserved. If you fork it, please give your version its own name and look.
