import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from './src/lib/supabase';
import type { TaskRow } from './src/lib/tasks';
import { ui } from './src/lib/ui';
import { useAuth } from './src/lib/useAuth';
import { useLeftSite } from './src/lib/useLeftSite';
import { useShiftHealth } from './src/lib/useShiftHealth';
import { ConsentScreen, isSetupComplete } from './src/screens/ConsentScreen';
import { GeoTestScreen } from './src/screens/GeoTestScreen';
import { LeftSiteScreen } from './src/screens/LeftSiteScreen';
import { LocationOffScreen } from './src/screens/LocationOffScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { TaskScreen } from './src/screens/TaskScreen';
import { TasksScreen } from './src/screens/TasksScreen';

export default function App() {
  return (
    <>
      <Root />
      <StatusBar style="dark" />
    </>
  );
}

function Root() {
  const { t } = useTranslation();
  const { state, retry } = useAuth();
  const { awaiting, answer } = useLeftSite();
  const health = useShiftHealth();
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [geoTest, setGeoTest] = useState(false);
  const [openTask, setOpenTask] = useState<{ task: TaskRow; finish: boolean } | null>(null);
  const finishSetup = useCallback(() => setSetupDone(true), []);

  const ready = state.status === 'ready';
  useEffect(() => {
    if (ready) void isSetupComplete().then(setSetupDone);
  }, [ready]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'signed-out') return <LoginScreen />;
  if (state.status === 'foreman') {
    return <Notice title={t('account.foremanTitle')} body={t('account.foremanBody')} />;
  }
  if (state.status === 'disabled') {
    return <Notice title={t('account.disabledTitle')} body={t('account.disabledBody')} />;
  }
  if (state.status === 'error') {
    return (
      <Notice title={t('account.loadErrorTitle')} body={state.message} onRetry={() => void retry(state.userId)} />
    );
  }

  if (setupDone === null) return <Loading />;
  if (!setupDone) return <ConsentScreen onDone={finishSetup} />;
  if (awaiting) return <LeftSiteScreen awaiting={awaiting} onAnswer={answer} />;
  if (health.problem && health.sessionId) {
    return (
      <LocationOffScreen
        problem={health.problem}
        sessionId={health.sessionId}
        onChanged={() => {
          setOpenTask(null);
          void health.refresh();
        }}
      />
    );
  }
  if (geoTest) return <GeoTestScreen onBack={() => setGeoTest(false)} />;
  if (openTask) {
    return <TaskScreen task={openTask.task} finishOnOpen={openTask.finish} onBack={() => setOpenTask(null)} />;
  }
  return (
    <TasksScreen
      profile={state.profile}
      onOpenTask={(task, options) => setOpenTask({ task, finish: options?.finish ?? false })}
      onOpenGeoTest={() => setGeoTest(true)}
    />
  );
}

function Loading() {
  return (
    <View style={[ui.screen, { justifyContent: 'center' }]}>
      <ActivityIndicator size="large" />
    </View>
  );
}

function Notice(props: { title: string; body: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.centered}>
      <Text style={ui.h1}>{props.title}</Text>
      <Text style={ui.text}>{props.body}</Text>
      {props.onRetry && (
        <Pressable style={ui.button} onPress={props.onRetry}>
          <Text style={ui.buttonText}>{t('common.tryAgain')}</Text>
        </Pressable>
      )}
      <Pressable style={ui.buttonSecondary} onPress={() => void supabase.auth.signOut()}>
        <Text style={ui.buttonSecondaryText}>{t('common.signOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}
