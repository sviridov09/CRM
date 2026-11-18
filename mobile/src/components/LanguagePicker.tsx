import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { useTheme, useThemedStyles, type Palette } from '../lib/theme';

/** Выбор языка. Пока переведён только английский — не показываем. */
export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const { ui } = useTheme();
  const styles = useThemedStyles(createStyles);
  const languages = Object.entries(LANGUAGES) as [Language, string][];
  if (languages.length < 2) return null;

  return (
    <View style={styles.wrap}>
      <Text style={ui.label}>{t('common.language')}</Text>
      <View style={styles.row}>
        {languages.map(([code, name]) => (
          <Pressable
            key={code}
            style={[styles.option, i18n.language === code && styles.active]}
            onPress={() => void setLanguage(code)}
          >
            <Text style={i18n.language === code ? styles.activeText : ui.muted}>{name}</Text>
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
