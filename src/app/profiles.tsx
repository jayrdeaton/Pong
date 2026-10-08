import { defaultColors } from '@rific/auto-paper'
import { ProfilesScreen } from '@tastic/profile'

import { useGameStats } from '@/hooks/useGameStats'
import { useProfiles } from '@/hooks/useProfiles'
import { safeBack } from '@/utils/navigation'

// A real routed screen — reachable only from P1's dropdown (see ProfilePicker's own doc for why P2
// can't host this: its zone is 180°-rotated in face-to-face mode, and the OS keyboard doesn't rotate
// with it).
export default function Profiles() {
  const { profiles, createProfile, updateProfile, deleteProfile } = useProfiles()
  // Only for wiring onDelete below — nothing else on this screen touches stats directly. Without
  // this, deleting a profile here only removed it from useProfiles()' own roster, leaving its stats
  // bucket and achievement-unlock history permanently orphaned in the store under an id nothing
  // can ever reference again.
  const { removeProfileStats } = useGameStats()

  return (
    <ProfilesScreen
      profiles={profiles}
      defaultColor={defaultColors[0].value}
      onCreate={(patch) => createProfile(patch)}
      onSave={(id, patch) => updateProfile(id, patch)}
      onDelete={(id) => {
        deleteProfile(id)
        removeProfileStats(id)
      }}
      onBack={safeBack}
    />
  )
}
