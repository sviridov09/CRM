import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#f5f6f8',
  surface: '#ffffff',
  border: '#dfe2e7',
  text: '#1c2129',
  muted: '#626b7a',
  primary: '#1f6feb',
  danger: '#b8322d',
  errorBg: '#fdecea',
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
  h1: { fontSize: 26, fontWeight: '700', color: colors.text },
  text: { fontSize: 16, lineHeight: 23, color: colors.text },
  muted: { fontSize: 15, lineHeight: 21, color: colors.muted },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  button: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  buttonSecondary: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  buttonSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, backgroundColor: colors.errorBg, padding: 12, borderRadius: 10, fontSize: 15 },
});
