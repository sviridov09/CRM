import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Profile } from '../../../shared/types';
import { supabase } from '../lib/supabase';
import { loadTodayTasks, shortDate, TASK_STATUS, todayISO, type TaskRow } from '../lib/tasks';
import { colors, ui } from '../lib/ui';

type Props = { profile: Profile; onOpenTask: (task: TaskRow) => void; onOpenGeoTest: () => void };

export function TasksScreen({ profile, onOpenTask, onOpenGeoTest }: Props) {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTasks(await loadTodayTasks(profile.id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={ui.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={ui.h1}>Today</Text>
          <Text style={ui.muted}>{profile.full_name}</Text>
        </View>
        <Pressable onPress={() => void supabase.auth.signOut()} hitSlop={10}>
          <Text style={ui.buttonSecondaryText}>Sign out</Text>
        </Pressable>
      </View>

      {error && <Text style={[ui.error, styles.errorBox]}>{error}</Text>}

      <FlatList
        data={tasks ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        renderItem={({ item }) => <TaskCard task={item} onPress={() => onOpenTask(item)} />}
        ListEmptyComponent={
          <Text style={[ui.muted, styles.empty]}>{tasks ? 'No tasks for today.' : 'Loading…'}</Text>
        }
        ListFooterComponent={
          __DEV__ ? (
            <Pressable style={ui.buttonSecondary} onPress={onOpenGeoTest}>
              <Text style={ui.buttonSecondaryText}>Location test (dev)</Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

function TaskCard({ task, onPress }: { task: TaskRow; onPress: () => void }) {
  const status = TASK_STATUS[task.status];
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHead}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={[styles.badge, { backgroundColor: status.bg, color: status.fg }]}>{status.label}</Text>
      </View>
      {task.work_date !== todayISO() && <Text style={ui.label}>Started {shortDate(task.work_date)}</Text>}
      {task.site && (
        <Text style={ui.muted}>
          {task.site.name} · {task.site.address}
        </Text>
      )}
      {task.description && <Text style={ui.text}>{task.description}</Text>}
      {task.task_materials.length > 0 && (
        <View style={styles.materials}>
          <Text style={ui.label}>Materials</Text>
          {task.task_materials.map((tm) => (
            <Text key={tm.id} style={ui.muted}>
              {tm.material?.name}: {tm.planned_qty} {tm.material?.unit}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  errorBox: { marginHorizontal: 20, marginBottom: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  empty: { textAlign: 'center', paddingVertical: 48 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  badge: { fontSize: 13, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  materials: { gap: 2, marginTop: 4 },
});
