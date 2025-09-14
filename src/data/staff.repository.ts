import { getSupabase } from '@/core/supabase';

export type StaffUser = {
  id: string;
  user_id: string;
  status: 'active' | 'inactive' | string;
  created_at: string;
};

export async function me(): Promise<StaffUser | null> {
  const supabase = getSupabase();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  const { data, error } = await supabase
    .from('staff_users')
    .select('id,user_id,status,created_at')
    .eq('user_id', user.user.id)
    .maybeSingle();

  if (error) throw error;
  return (data as StaffUser) ?? null;
}

export async function list(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await getSupabase()
    .from('staff_users')
    .select('id,user_id,status,created_at', { count: 'exact' })
    .range(from, to)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return { rows: (data ?? []) as StaffUser[] };
}

export async function updateStatus(id: string, status: 'active' | 'inactive') {
  const { data, error } = await getSupabase()
    .from('staff_users')
    .update({ status })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as StaffUser;
}
