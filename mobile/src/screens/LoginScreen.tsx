import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { workerEmail } from '../../../shared/types';
import { supabase } from '../lib/supabase';
import { ui } from '../lib/ui';

export function LoginScreen() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    // Рабочие входят по логину; бригадир мог ввести настоящую почту
    const value = login.trim();
    const email = value.includes('@') ? value : workerEmail(value);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // При успехе useAuth сам переключит экран
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Wrong login or password.' : error.message);
      setBusy(false);
    }
  }

  const canSubmit = login.trim().length > 0 && password.length > 0 && !busy;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.centered} keyboardShouldPersistTaps="handled">
      <Text style={ui.h1}>Field CRM</Text>
      <Text style={ui.muted}>Sign in with the login and password from your foreman.</Text>

      <View style={{ gap: 6 }}>
        <Text style={ui.label}>Login</Text>
        <TextInput
          style={ui.input}
          value={login}
          onChangeText={setLogin}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          returnKeyType="next"
        />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={ui.label}>Password</Text>
        <TextInput
          style={ui.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => {
            if (canSubmit) void signIn();
          }}
        />
      </View>

      {error && <Text style={ui.error}>{error}</Text>}

      <Pressable
        style={[ui.button, !canSubmit && ui.disabled]}
        disabled={!canSubmit}
        onPress={() => void signIn()}
      >
        <Text style={ui.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </Pressable>
    </ScrollView>
  );
}
