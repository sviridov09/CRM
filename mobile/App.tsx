import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from './src/lib/supabase';
import { ui } from './src/lib/ui';
import { useAuth } from './src/lib/useAuth';
import { ConsentScreen, isSetupComplete } from './src/screens/ConsentScreen';
import { GeoTestScreen } from './src/screens/GeoTestScreen';
import { LoginScreen } from './src/screens/LoginScreen';
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
  const { state, retry } = useAuth();
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [geoTest, setGeoTest] = useState(false);
  const finishSetup = useCallback(() => setSetupDone(true), []);

  const ready = state.status === 'ready';
  useEffect(() => {
    if (ready) void isSetupComplete().then(setSetupDone);
  }, [ready]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'signed-out') return <LoginScreen />;
  if (state.status === 'foreman') {
    return <Notice title="Use the web CRM" body="This app is for workers. Foremen manage work in the web CRM." />;
  }
  if (state.status === 'disabled') {
    return <Notice title="Account disabled" body="Ask your foreman to turn your account back on." />;
  }
  if (state.status === 'error') {
    return (
      <Notice title="Can't load your account" body={state.message} onRetry={() => void retry(state.userId)} />
    );
  }

  if (setupDone === null) return <Loading />;
  if (!setupDone) return <ConsentScreen onDone={finishSetup} />;
  if (geoTest) return <GeoTestScreen onBack={() => setGeoTest(false)} />;
  return <TasksScreen profile={state.profile} onOpenGeoTest={() => setGeoTest(true)} />;
}

function Loading() {
  return (
    <View style={[ui.screen, { justifyContent: 'center' }]}>
      <ActivityIndicator size="large" />
    </View>
  );
}

function Notice(props: { title: string; body: string; onRetry?: () => void }) {
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.centered}>
      <Text style={ui.h1}>{props.title}</Text>
      <Text style={ui.text}>{props.body}</Text>
      {props.onRetry && (
        <Pressable style={ui.button} onPress={props.onRetry}>
          <Text style={ui.buttonText}>Try again</Text>
        </Pressable>
      )}
      <Pressable style={ui.buttonSecondary} onPress={() => void supabase.auth.signOut()}>
        <Text style={ui.buttonSecondaryText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
