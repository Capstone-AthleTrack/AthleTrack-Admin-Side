// src/services/accountRequests.ts
import { supabase } from '@/core/supabase';

export type AccountRequest = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  desired_role: 'athlete' | 'coach' | 'admin';
  device_name: string;
  status: 'pending' | 'approved' | 'denied';
  reason: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export async function listAccountRequests(params?: { status?: AccountRequest['status']; q?: string }) {
  let q = supabase
    .from('account_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (params?.status) q = q.eq('status', params.status);
  if (params?.q) q = q.or(`email.ilike.%${params.q}%,full_name.ilike.%${params.q}%`);

  const { data, error } = await q.returns<AccountRequest[]>();
  if (error) throw error;
  return data ?? [];
}

export async function getAccountRequest(id: string) {
  const { data, error } = await supabase
    .from('account_requests')
    .select('*')
    .eq('id', id)
    .single()
    .returns<AccountRequest>();
  if (error) throw error;
  return data;
}

type ApproveArgs = {
  id: string;
  finalRole: 'athlete' | 'coach' | 'admin';
  reason: string;
  teamId?: string;
};
type InvokeOk = { ok: true; request?: unknown };
type InvokeErr = { error: string; detail?: string };

export async function approveAccount(args: ApproveArgs) {
  const { data, error } = await supabase.functions.invoke<InvokeOk | InvokeErr>('approve_account', {
    body: args,
  });
  if (error) throw error;
  if (data && 'error' in data) throw new Error(data.error);
  return data;
}

export async function denyAccount(args: { id: string; reason: string }) {
  const { data, error } = await supabase.functions.invoke<InvokeOk | InvokeErr>('deny_account', {
    body: args,
  });
  if (error) throw error;
  if (data && 'error' in data) throw new Error(data.error);
  return data;
}

export async function updateDesiredRole(id: string, role: 'athlete' | 'coach' | 'admin') {
  const { data, error } = await supabase
    .from('account_requests')
    .update({ desired_role: role })
    .eq('id', id)
    .select('*')
    .single()
    .returns<AccountRequest>();
  if (error) throw error;
  return data;
}
