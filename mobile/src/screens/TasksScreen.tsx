import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Profile, Site, Task, TaskMaterial, TaskStatus } from '../../../shared/types';
import { supabase } from '../lib/supabase';
import { colors, ui } from '../lib/ui';

type TaskRow = Task & {
  site: Pick<Site, 'name' | 'address' | 'lat' | 'lng' | 'radius_m'> | null;
  task_materials: (TaskMaterial & { material: { name: string; unit: string } | null })[];
};

const TASK_SELECT =
  '*, site:site_id(name, address, lat, lng, radius_m), task_materials(*, material:material_id(name, unit))';

const STATUS: Record<TaskStatus, { label: string; bg: string; fg: string }> = {
  assigned: { label: 'To do', bg: '#e8ebf0', fg: colors.muted },
  in_progress: { label: 'In progress', bg: '#fff6e0', fg: '#8a5a00' },
  done: { label: 'Done', bg: '#e5f6ea', fg: '#1d7a3a' },
};

/** Сегодня по часам телефона, YYYY-MM-DD. */
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

type Props = { profile: Profile; onOpenGeoTest: () => void };

export function TasksScreen({ profile, onOpenGeoTest }: Props) {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_SELECT)
      .eq('worker_id', profile.id)
      .eq('work_date', todayISO())
      .order('created_at');
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setTasks(data as TaskRow[]);
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
        renderItem={({ item }) => <TaskCard task={item} />}
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

function TaskCard({ task }: { task: TaskRow }) {
  const status = STATUS[task.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={[styles.badge, { backgroundColor: status.bg, color: status.fg }]}>{status.label}</Text>
      </View>
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
    </View>
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
