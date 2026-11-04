import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { isShiftRunning, readShiftState, startShift, stopShift, type ShiftState } from '../geo/shiftTracking';
import {
  createSession,
  distanceToSite,
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

export function TaskScreen({ task: initial, onBack }: { task: TaskRow; onBack: () => void }) {
  const [task, setTask] = useState(initial);
  const [session, setSession] = useState<OpenSession | null>(null);
  const [tracking, setTracking] = useState(false);
  const [step, setStep] = useState<string | null>(null); // что сейчас происходит при старте
  const [error, setError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [switching, setSwitching] = useState(false); // сервис включается или выключается
  const [shift, setShift] = useState<ShiftState | null>(null);

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
          {/* Настоящий финиш с отчётом — дни 10–12; пока сервис останавливаем вручную */}
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
  shift: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
});
