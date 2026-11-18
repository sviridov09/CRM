import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { THEME_MODES, useTheme, useThemedStyles, type Palette } from '../lib/theme';

/** System / Light / Dark. */
export function ThemePicker() {
  const { t } = useTranslation();
  const { ui, mode, setMode } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap}>
      <Text style={ui.label}>{t('theme.title')}</Text>
      <View style={styles.row}>
        {THEME_MODES.map((m) => (
          <Pressable
            key={m}
            style={[styles.option, mode === m && styles.active]}
            onPress={() => setMode(m)}
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === m }}
          >
            <Text style={mode === m ? styles.activeText : ui.muted}>{t(`theme.${m}`)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { gap: 8, marginTop: 8 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border },
    active: { borderColor: c.accent, backgroundColor: c.selectedBg },
    activeText: { color: c.accent, fontWeight: '600' },
  });
