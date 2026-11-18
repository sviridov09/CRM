import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text } from 'react-native';
import type { LocationProblem } from '../geo/shiftHealth';
import { finishShift } from '../lib/shift';
import { ui } from '../lib/ui';

type Props = { problem: Exclude<LocationProblem, null>; sessionId: string; onChanged: () => void };

export function LocationOffScreen({ problem, sessionId, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function turnOn() {
    setError(null);
    if (problem === 'permission') {
      await Linking.openSettings();
      return;
    }
    try {
      // Системный диалог «Включить геолокацию?» — без перехода в настройки
      if (Platform.OS === 'android') await Location.enableNetworkProviderAsync();
      else await Linking.openURL('app-settings:');
    } catch {
      await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings());
    }
    onChanged();
  }

  function finish() {
    Alert.alert('Finish shift?', 'The task will be marked as done.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          setBusy(true);
          try {
            await finishShift(sessionId);
            onChanged();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.centered}>
      <Text style={ui.h1}>{problem === 'services' ? 'Location is off' : 'Location permission is off'}</Text>
      <Text style={ui.text}>
        You're on shift, and location checks can't run.{' '}
        {problem === 'services'
          ? 'Turn location back on to continue.'
          : 'Allow location "All the time" for Field CRM in Settings.'}{' '}
        Your foreman has been notified.
      </Text>
      {error && <Text style={ui.error}>{error}</Text>}
      <Pressable style={[ui.button, busy && ui.disabled]} disabled={busy} onPress={() => void turnOn()}>
        <Text style={ui.buttonText}>{problem === 'services' ? 'Turn on location' : 'Open Settings'}</Text>
      </Pressable>
      <Pressable style={ui.buttonSecondary} disabled={busy} onPress={finish}>
        <Text style={ui.buttonSecondaryText}>{busy ? 'Finishing…' : 'Finish shift instead'}</Text>
      </Pressable>
    </ScrollView>
  );
}
