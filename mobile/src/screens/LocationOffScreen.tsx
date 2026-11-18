import * as Location from 'expo-location';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform, Pressable, ScrollView, Text } from 'react-native';
import type { LocationProblem } from '../geo/shiftHealth';
import { finishShift } from '../lib/shift';
import { ui } from '../lib/ui';

type Props = { problem: Exclude<LocationProblem, null>; sessionId: string; onChanged: () => void };

export function LocationOffScreen({ problem, sessionId, onChanged }: Props) {
  const { t } = useTranslation();
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
    Alert.alert(t('task.finishTitle'), t('locationOff.finishBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('task.finishConfirm'),
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

  const services = problem === 'services';

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.centered}>
      <Text style={ui.h1}>{services ? t('locationOff.servicesTitle') : t('locationOff.permissionTitle')}</Text>
      <Text style={ui.text}>
        {t('locationOff.intro')} {services ? t('locationOff.servicesBody') : t('locationOff.permissionBody')}{' '}
        {t('locationOff.foremanWarning')}
      </Text>
      {error && <Text style={ui.error}>{error}</Text>}
      <Pressable style={[ui.button, busy && ui.disabled]} disabled={busy} onPress={() => void turnOn()}>
        <Text style={ui.buttonText}>{services ? t('locationOff.turnOn') : t('common.openSettings')}</Text>
      </Pressable>
      <Pressable style={ui.buttonSecondary} disabled={busy} onPress={finish}>
        <Text style={ui.buttonSecondaryText}>{busy ? t('locationOff.finishing') : t('locationOff.finishInstead')}</Text>
      </Pressable>
    </ScrollView>
  );
}
