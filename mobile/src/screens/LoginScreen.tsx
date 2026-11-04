import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { workerEmail } from '../../../shared/types';
import { supabase } from '../lib/supabase';
import { ui } from '../lib/ui';

export function LoginScreen() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

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
    // В режиме edge-to-edge Android сам не сжимает окно под клавиатуру
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={ui.centered} keyboardShouldPersistTaps="handled">
        <Text style={ui.h1}>Field CRM</Text>
        <Text style={ui.muted}>Sign in with the login and password from your foreman.</Text>

        <View style={styles.field}>
          <Text style={ui.label}>Login</Text>
          <TextInput
            style={ui.input}
            value={login}
            onChangeText={setLogin}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </View>
        <View style={styles.field}>
          <Text style={ui.label}>Password</Text>
          <View>
            <TextInput
              ref={passwordRef}
              style={[ui.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (canSubmit) void signIn();
              }}
            />
            <Pressable
              style={styles.toggle}
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={ui.buttonSecondaryText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  passwordInput: { paddingRight: 72 },
  toggle: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    minWidth: 64,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
