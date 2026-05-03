/**
 * Version Gate — enforces minimum app version before allowing usage.
 *
 * Call `enforceVersionGate()` in your root layout's `useEffect` (or app startup).
 * It is a no-op when the version check endpoint is unreachable (silent fail).
 */

import * as Application from 'expo-application';
import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';

import { api } from '@/services/api/client';

interface VersionCheck {
  min_version: string;
  latest_version: string;
  update_required: boolean;
  update_url: string;
}

function parseVersion(v: string): [number, number, number] {
  const parts = v.split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isBelowMinimum(current: string, minimum: string): boolean {
  const [cMaj, cMin, cPatch] = parseVersion(current);
  const [mMaj, mMin, mPatch] = parseVersion(minimum);
  if (cMaj !== mMaj) return cMaj < mMaj;
  if (cMin !== mMin) return cMin < mMin;
  return cPatch < mPatch;
}

const STORE_URL_ANDROID =
  'https://play.google.com/store/apps/details?id=com.yourname.portfolio';
const STORE_URL_IOS = 'itms-apps://itunes.apple.com/app/id000000000';

export async function enforceVersionGate(): Promise<void> {
  const current = Application.nativeApplicationVersion;
  if (!current) return; // running in Expo Go or web — skip

  try {
    const { data } = await api.get<VersionCheck>('/api/v1/system/version-check');

    if (isBelowMinimum(current, data.min_version)) {
      const storeUrl =
        data.update_url ||
        (Platform.OS === 'ios' ? STORE_URL_IOS : STORE_URL_ANDROID);

      Alert.alert(
        'Update Required',
        `Version ${data.min_version}+ is required to continue.\n\nYou have ${current}.`,
        [
          {
            text: 'Update Now',
            onPress: () => Linking.openURL(storeUrl),
          },
        ],
        { cancelable: false },
      );
    }
  } catch {
    // Silent fail — never block the user due to a network/server issue
  }
}
