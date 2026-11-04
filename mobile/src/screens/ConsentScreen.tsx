// Первый запуск: согласие на геолокацию, затем системные разрешения по одному.
// На Android фоновое разрешение просят отдельным шагом и только после обычного.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
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

type Step = 'intro' | 'foreground' | 'background' | 'notifications';

const STEPS: Record<Step, { title: string; body: string; button: string }> = {
  intro: {
    title: 'Location during your shift',
    body:
      'Field CRM records your location only between Start and Finish of a task, ' +
      'to confirm you are on site. A few random checks happen during the shift. ' +
      'Your location is never collected outside a shift.',
    button: 'I agree',
  },
  foreground: {
    title: 'Allow location',
    body: 'Needed to confirm you are on site when you start a task. Choose "While using the app".',
    button: 'Continue',
  },
  background: {
    title: 'Allow location all the time',
    body:
      'Shift checks run while your phone is locked. On the next screen choose "Allow all the time". ' +
      'Checks still happen only during a shift, and you will see a notification while it runs.',
    button: 'Open permission screen',
  },
  notifications: {
    title: 'Allow notifications',
    body: 'We need to tell you if a check shows you have left the site.',
    button: 'Continue',
  },
};

export function ConsentScreen({ onDone }: { onDone: () => void }) {
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

  const { title, body, button } = STEPS[step];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.centered}>
      <Text style={ui.h1}>{title}</Text>
      <Text style={ui.text}>{body}</Text>
      {deniedStep === step && (
        <Text style={ui.error}>This permission is required to work shifts. Turn it on in Settings.</Text>
      )}
      <Pressable style={ui.button} onPress={() => void next()}>
        <Text style={ui.buttonText}>{button}</Text>
      </Pressable>
      {deniedStep === step && (
        <Pressable style={ui.buttonSecondary} onPress={() => void Linking.openSettings()}>
          <Text style={ui.buttonSecondaryText}>Open Settings</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
