// Первый запуск: согласие на геолокацию, затем системные разрешения по одному.
// На Android фоновое разрешение просят отдельным шагом и только после обычного.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Pressable, ScrollView, Text } from 'react-native';
import { ui } from '../lib/ui';

const CONSENT_KEY = 'location-consent-v1';

type Perms = { foreground: boolean; background: boolean; notifications: boolean };

async function readPerms(): Promise<Perms> {
  const [fg, bg, notif] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
  ]);
  return { foreground: fg.granted, background: bg.granted, notifications: notif.granted };
}

/** Согласие дано и все разрешения на месте (их могли отозвать в настройках). */
export async function isSetupComplete(): Promise<boolean> {
  const [consent, perms] = await Promise.all([AsyncStorage.getItem(CONSENT_KEY), readPerms()]);
  return consent === 'yes' && perms.foreground && perms.background && perms.notifications;
}

// Тексты шагов — в en.json, раздел consent.<шаг>
type Step = 'intro' | 'foreground' | 'background' | 'notifications';

export function ConsentScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [agreed, setAgreed] = useState<boolean | null>(null);
  const [perms, setPerms] = useState<Perms | null>(null);
  const [deniedStep, setDeniedStep] = useState<Step | null>(null);

  const refresh = useCallback(async () => {
    setAgreed((await AsyncStorage.getItem(CONSENT_KEY)) === 'yes');
    setPerms(await readPerms());
  }, []);

  useEffect(() => {
    void refresh();
    // Вернулись из системных настроек — перечитываем разрешения
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const step: Step | null =
    agreed === null || !perms
      ? null
      : !agreed
        ? 'intro'
        : !perms.foreground
          ? 'foreground'
          : !perms.background
            ? 'background'
            : !perms.notifications
              ? 'notifications'
              : null;

  const finished = agreed === true && perms !== null && step === null;
  useEffect(() => {
    if (finished) onDone();
  }, [finished, onDone]);

  if (!step) return null;

  async function next() {
    if (step === 'intro') {
      await AsyncStorage.setItem(CONSENT_KEY, 'yes');
    } else {
      const res =
        step === 'foreground'
          ? await Location.requestForegroundPermissionsAsync()
          : step === 'background'
            ? await Location.requestBackgroundPermissionsAsync()
            : await Notifications.requestPermissionsAsync();
      if (!res.granted) setDeniedStep(step);
    }
    await refresh();
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.centered}>
      <Text style={ui.h1}>{t(`consent.${step}.title`)}</Text>
      <Text style={ui.text}>{t(`consent.${step}.body`)}</Text>
      {deniedStep === step && <Text style={ui.error}>{t('consent.denied')}</Text>}
      <Pressable style={ui.button} onPress={() => void next()}>
        <Text style={ui.buttonText}>{t(`consent.${step}.button`)}</Text>
      </Pressable>
      {deniedStep === step && (
        <Pressable style={ui.buttonSecondary} onPress={() => void Linking.openSettings()}>
          <Text style={ui.buttonSecondaryText}>{t('common.openSettings')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
