// Wraps useAudioPool with the app's own sound-enabled setting (Feedback.tsx/SettingsDialog) - for
// gameplay SFX (bounce, goal, select, etc.) that play outside the button-press pipeline, which
// already gates its own `sound` callbacks on this same setting internally (see
// useFeedbackHandlers' `fire`). Call once per distinct clip, same as useAudioPool itself. Was a
// hand-rolled wrapper around useAudioPool + useSoundSettings, byte-for-byte identical to
// @rific/feedback-press's own useGatedAudioPool, before that hook was extracted - this is now a
// thin re-export under this app's own established name so no call site elsewhere needs to change.
export { useGatedAudioPool as useGameSound } from '@rific/feedback-press/audio'
