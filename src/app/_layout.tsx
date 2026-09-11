import { Toaster, ToastProvider } from '@rific/toaster'
import { AccelerometerOrientationProvider } from '@tastic/split-screen'
import * as Haptics from 'expo-haptics'
import { Stack } from 'expo-router'
import { DeviceMotion } from 'expo-sensors'
import { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import * as RNPaper from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { Feedback } from '@/components/Feedback'
import { Fonts } from '@/components/Fonts'
import { Theme } from '@/components/Theme'
import { UpdateDialog } from '@/components/UpdateDialog'
import { GameSettingsProvider, useGameSettings } from '@/hooks/useGameSettings'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { ProfilesProvider, useProfiles } from '@/hooks/useProfiles'
import { SplashGate } from '@/utils/splashGate'

// Holds GameSettingsProvider's own children back until its 'settings' splash gate reports ready
// (see useGameSettings.tsx's own `loaded` field) — so nothing further down the tree can ever mount
// and read a still-loading/default settings value. Wrapped INSIDE GameSettingsProvider's own
// position in the tree (i.e. as its children, not as its parent) so GameSettingsProvider itself
// still mounts immediately and its AsyncStorage read starts right away — wrapping it from the
// outside instead would deadlock, since `loaded` could then never become true. See loadout.tsx's
// own route-param workaround for the bug this used to cause before this gate existed.
function SettingsGate({ children }: { children: ReactNode }) {
  const { loaded } = useGameSettings()
  return (
    <SplashGate gate='settings' ready={loaded}>
      {children}
    </SplashGate>
  )
}

// Same reasoning as SettingsGate above, for the profiles roster (see useProfiles.tsx's own `loaded`
// field, which only flips true once both the local AsyncStorage read AND, when available, the
// shared-store read have resolved).
function ProfilesGate({ children }: { children: ReactNode }) {
  const { loaded } = useProfiles()
  return (
    <SplashGate gate='profiles' ready={loaded}>
      {children}
    </SplashGate>
  )
}

// AccelerometerOrientationProvider/ProfilesProvider mounted at the same nesting position BoxHockey
// uses (see BoxHockey/src/app/_layout.tsx): both inside GameSettingsProvider (game.tsx's
// useAccelerometerOrientation call needs settings.lockOrientation to be available, though neither
// provider actually depends on settings — this just mirrors the established nesting order), outside
// ToastProvider.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Fonts>
          <Feedback>
            <Theme>
              <GameSettingsProvider>
                <SettingsGate>
                  <ProfilesProvider>
                    <ProfilesGate>
                      <GameStatsProvider>
                        {/* deviceMotion is the app's own real expo-sensors import, injected rather than
                        imported by @tastic/core itself — see that package's own doc for why. */}
                        <AccelerometerOrientationProvider deviceMotion={DeviceMotion}>
                          <ToastProvider haptics={Haptics} paper={RNPaper}>
                            <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
                            <Toaster />
                            <UpdateDialog />
                          </ToastProvider>
                        </AccelerometerOrientationProvider>
                      </GameStatsProvider>
                    </ProfilesGate>
                  </ProfilesProvider>
                </SettingsGate>
              </GameSettingsProvider>
            </Theme>
          </Feedback>
        </Fonts>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 }
})
