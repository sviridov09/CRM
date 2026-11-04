import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { RETURN_OPTIONS, type Awaiting } from '../geo/leftSite';
import { ui } from '../lib/ui';

type Props = { awaiting: Awaiting; onAnswer: (pingId: string, minutes: number) => Promise<void> };

export function LeftSiteScreen({ awaiting, onAnswer }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(minutes: number) {
    setBusy(true);
    setError(null);
    try {
      await onAnswer(awaiting.pingId, minutes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.centered}>
      <Text style={ui.h1}>You left the site</Text>
      <Text style={ui.text}>
        A location check shows you're away from the site. When will you be back? Your foreman will see your answer.
      </Text>
      {error && <Text style={ui.error}>{error}</Text>}
      {RETURN_OPTIONS.map((minutes) => (
        <Pressable
          key={minutes}
          style={[ui.button, busy && ui.disabled]}
          disabled={busy}
          onPress={() => void answer(minutes)}
        >
          <Text style={ui.buttonText}>Back in {minutes} min</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
