// Временный экран прототипа фоновой геолокации. Заменится настоящими экранами (вход, задачи).
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { isShiftRunning, readShiftState, startShift, stopShift, type ShiftState } from './src/geo/shiftTracking';

type Perms = { foreground: boolean; background: boolean; notifications: boolean };

const time = (ms: number) => new Date(ms).toLocaleTimeString();

export default function App() {
  const [perms, setPerms] = useState<Perms | null>(null);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<ShiftState | null>(null);
  const [testMode, setTestMode] = useState(true);

  const refresh = useCallback(async () => {
    const [fg, bg, notif] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
    ]);
    setPerms({ foreground: fg.granted, background: bg.granted, notifications: notif.granted });
    setRunning(await isShiftRunning());
    setState(await readShiftState());
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [refresh]);

  async function askForeground() {
    await Location.requestForegroundPermissionsAsync();
    await refresh();
  }

  function askBackground() {
    // Android 11+ открывает системные настройки — сначала объясняем, что выбрать
    Alert.alert(
      'Location during your shift',
      'On the next screen choose "Allow all the time". Location is used only between Start and Finish of your shift.',
      [{ text: 'Continue', onPress: () => void Location.requestBackgroundPermissionsAsync().then(refresh) }],
    );
  }

  async function askNotifications() {
    await Notifications.requestPermissionsAsync();
    await refresh();
  }

  async function toggleShift() {
    try {
      if (running) await stopShift();
      else await startShift(testMode);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    }
    await refresh();
  }

  const ready = perms?.foreground && perms.background;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Background location test</Text>

      <Text style={styles.h2}>1. Permissions</Text>
      <PermRow label="Location (while using app)" ok={perms?.foreground} onPress={askForeground} />
      <PermRow label="Location (all the time)" ok={perms?.background} onPress={askBackground} disabled={!perms?.foreground} />
      <PermRow label="Notifications" ok={perms?.notifications} onPress={askNotifications} />

      <Text style={styles.h2}>2. Shift</Text>
      <View style={styles.row}>
        <Text style={styles.text}>Test mode (checks every 2–4 min)</Text>
        <Switch value={testMode} onValueChange={setTestMode} disabled={running} />
      </View>
      <Pressable
        style={[styles.button, running ? styles.stop : styles.start, !ready && styles.disabled]}
        onPress={() => void toggleShift()}
        disabled={!ready}
      >
        <Text style={styles.buttonText}>{running ? 'Stop shift' : 'Start shift'}</Text>
      </Pressable>

      <Text style={styles.h2}>3. Log</Text>
      {state ? (
        <>
          <Text style={styles.text}>Service: {running ? 'running' : 'stopped'} · mode: {state.testMode ? 'test' : 'real'}</Text>
          <Text style={styles.text}>Started: {time(state.startedAt)}</Text>
          <Text style={styles.text}>
            Updates from service: {state.updates}
            {state.lastUpdateAt ? `, last at ${time(state.lastUpdateAt)}` : ''}
          </Text>
          <Text style={styles.text}>Next check after: {time(state.nextCheckAt)}</Text>
          <Text style={[styles.text, styles.bold]}>Checks: {state.checks.length}</Text>
          {state.checks.map((c) => (
            <Text key={c.at} style={styles.mono}>
              {time(c.at)} {c.lat.toFixed(5)}, {c.lng.toFixed(5)} ±{Math.round(c.accuracy ?? 0)} m
            </Text>
          ))}
        </>
      ) : (
        <Text style={styles.text}>No shift yet.</Text>
      )}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

function PermRow(props: { label: string; ok?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.text}>
        {props.ok ? '✅' : '⬜'} {props.label}
      </Text>
      {!props.ok && (
        <Pressable style={[styles.small, props.disabled && styles.disabled]} onPress={props.onPress} disabled={props.disabled}>
          <Text style={styles.smallText}>Allow</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 56, gap: 10 },
  h1: { fontSize: 22, fontWeight: '700' },
  h2: { fontSize: 17, fontWeight: '600', marginTop: 14 },
  text: { fontSize: 15, color: '#1c2129', flexShrink: 1 },
  bold: { fontWeight: '600' },
  mono: { fontFamily: 'monospace', fontSize: 13, color: '#1c2129' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  button: { padding: 16, borderRadius: 10, alignItems: 'center' },
  start: { backgroundColor: '#1f6feb' },
  stop: { backgroundColor: '#b8322d' },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  small: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e8effd' },
  smallText: { color: '#1f6feb', fontWeight: '600' },
});
