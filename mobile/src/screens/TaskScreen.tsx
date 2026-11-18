import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { isShiftRunning, readShiftState, startShift, stopShift, type ShiftState } from '../geo/shiftTracking';
import {
  createSession,
  distanceToSite,
  finishShift,
  getPosition,
  loadOpenSession,
  offSiteMessage,
  saveBeforePhoto,
  takePhoto,
  type OpenSession,
} from '../lib/shift';
import { TASK_STATUS, type TaskRow } from '../lib/tasks';
import { colors, ui } from '../lib/ui';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Props = { task: TaskRow; finishOnOpen?: boolean; onBack: () => void };

export function TaskScreen({ task: initial, finishOnOpen = false, onBack }: Props) {
  const [task, setTask] = useState(initial);
  const [session, setSession] = useState<OpenSession | null>(null);
  const [tracking, setTracking] = useState(false);
  const [step, setStep] = useState<string | null>(null); // что сейчас происходит при старте
  const [error, setError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [switching, setSwitching] = useState(false); // сервис включается или выключается
  const [shift, setShift] = useState<ShiftState | null>(null);
  const askedToFinish = useRef(false);

  const refresh = useCallback(async () => {
    setTracking(await isShiftRunning());
    setShift(await readShiftState());
    if (task.status === 'in_progress') setSession(await loadOpenSession(task.id));
  }, [task.id, task.status]);

  useEffect(() => {
    refresh().catch((e) => setError(errorText(e)));
  }, [refresh]);

  async function start() {
    setError(null);
    try {
      if (await isShiftRunning()) throw new Error('Another shift is already running. Finish it first.');

      setStep('Getting your location…');
      const before = await getPosition();
      if (distanceToSite(task, before) > task.site!.radius_m) throw new Error(offSiteMessage(task, before));

      setStep('Take a photo of the site before you start');
      const uri = await takePhoto();
      if (!uri) return;

      setStep('Saving the photo…');
      await saveBeforePhoto(task, uri, before);

      setStep('Starting your shift…');
      const opened = await createSession(task, await getPosition());
      setSession(opened);
      setTask((t) => ({ ...t, status: 'in_progress' }));
      await startShift({ testMode, sessionId: opened.id });
      setTracking(true);
      setShift(await readShiftState());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStep(null);
    }
  }

  async function resume() {
    if (!session) return;
    setError(null);
    setSwitching(true);
    try {
      await startShift({ testMode, sessionId: session.id });
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSwitching(false);
    }
  }

  async function finish() {
    if (!session) return;
    setError(null);
    setStep('Finishing your shift…');
    try {
      await finishShift(session.id);
      setTask((t) => ({ ...t, status: 'done' }));
      setSession(null);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStep(null);
    }
  }

  function confirmFinish() {
    Alert.alert('Finish shift?', 'Location checks will stop and the task will be marked as done.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', onPress: () => void finish() },
    ]);
  }

  // Открыли с карточки по кнопке Finish shift — сразу спрашиваем подтверждение
  useEffect(() => {
    if (finishOnOpen && session && !askedToFinish.current) {
      askedToFinish.current = true;
      confirmFinish();
    }
  });

  async function stopTracking() {
    setSwitching(true);
    try {
      await stopShift();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSwitching(false);
    }
  }

  const status = TASK_STATUS[task.status];
  const busy = step !== null;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} hitSlop={10} disabled={busy}>
        <Text style={ui.buttonSecondaryText}>‹ Today</Text>
      </Pressable>

      <Text style={ui.h1}>{task.title}</Text>
      <Text style={[styles.badge, { backgroundColor: status.bg, color: status.fg }]}>{status.label}</Text>

      {task.site && (
        <View>
          <Text style={ui.label}>{task.site.name}</Text>
          <Text style={ui.muted}>{task.site.address}</Text>
        </View>
      )}
      {task.description && <Text style={ui.text}>{task.description}</Text>}

      {task.task_materials.length > 0 && (
        <View style={styles.block}>
          <Text style={ui.label}>Materials</Text>
          {task.task_materials.map((tm) => (
            <Text key={tm.id} style={ui.muted}>
              {tm.material?.name}: {tm.planned_qty} {tm.material?.unit}
            </Text>
          ))}
        </View>
      )}

      {error && <Text style={ui.error}>{error}</Text>}

      {__DEV__ && task.status !== 'done' && !tracking && (
        <View style={styles.row}>
          <Text style={ui.muted}>Test checks (every 2–4 min)</Text>
          <Switch value={testMode} onValueChange={setTestMode} disabled={busy || switching} />
        </View>
      )}

      {task.status === 'assigned' && (
        <Pressable style={[ui.button, busy && ui.disabled]} disabled={busy} onPress={() => void start()}>
          <Text style={ui.buttonText}>Start shift</Text>
        </Pressable>
      )}

      {step && (
        <View style={styles.row}>
          <ActivityIndicator />
          <Text style={[ui.muted, { flex: 1 }]}>{step}</Text>
        </View>
      )}

      {task.status === 'in_progress' && (
        <View style={styles.shift}>
          <Text style={ui.label}>You're on shift</Text>
          {session && (
            <Text style={ui.muted}>Started at {new Date(session.started_at).toLocaleTimeString()}</Text>
          )}
          {tracking ? (
            <Text style={ui.muted}>Location checks are running.</Text>
          ) : (
            session && (
              <>
                <Text style={ui.error}>Location checks are off. Turn them back on to continue your shift.</Text>
                <Pressable style={[ui.button, switching && ui.disabled]} disabled={switching} onPress={() => void resume()}>
                  <Text style={ui.buttonText}>{switching ? 'Turning on…' : 'Resume location checks'}</Text>
                </Pressable>
              </>
            )
          )}
          {session && (
            <Pressable style={[ui.button, styles.finish, busy && ui.disabled]} disabled={busy} onPress={confirmFinish}>
              <Text style={ui.buttonText}>Finish shift</Text>
            </Pressable>
          )}
          {__DEV__ && tracking && shift && (
            <Text style={ui.muted}>
              Mode: {shift.testMode ? 'test (2–4 min)' : 'real (60–120 min)'} · next check after{' '}
              {new Date(shift.nextCheckAt).toLocaleTimeString()}
            </Text>
          )}
          {__DEV__ && tracking && (
            <Pressable style={ui.buttonSecondary} disabled={switching} onPress={() => void stopTracking()}>
              <Text style={ui.buttonSecondaryText}>{switching ? 'Stopping…' : 'Stop location checks (dev)'}</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 56, paddingBottom: 40, gap: 14 },
  block: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  finish: { backgroundColor: '#1d7a3a' },
  shift: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
});
