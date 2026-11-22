// The Supabase calls sync needs, given a client. Kept apart from the phone-only parts (sign-in storage, status) so it can be tested from Node.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudApi, CloudRow, Cursor, Table } from './sync';

export function supabaseApi(c: SupabaseClient): CloudApi {
  return {
    async upsert(table: Table | 'settings', rows: CloudRow[]) {
      const { error } = await c.from(table).upsert(rows, { onConflict: table === 'settings' ? 'user_id' : 'user_id,id' });
      if (error) throw error;
    },
    async changedSince(table: Table, after: Cursor | null, limit: number) {
      let q = c.from(table).select('*').order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
      if (after) q = q.or(`updated_at.gt.${after.at},and(updated_at.eq.${after.at},id.gt.${after.id})`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CloudRow[];
    },
    async settings() {
      const { data, error } = await c.from('settings').select('data, updated_at').maybeSingle();
      if (error) throw error;
      return data as { data: unknown; updated_at: string } | null;
    },
  };
}
