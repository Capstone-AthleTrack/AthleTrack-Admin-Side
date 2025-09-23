// src/services/accountRequests.ts
import type { PostgrestError } from '@supabase/supabase-js';
import supabase from '@/core/supabase';

/** DB row shape (compatible with UI mapping) */
export type AccountRequest = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  device_name: string | null;
  desired_role: 'athlete' | 'coach' | 'admin' | null;
  status: 'pending' | 'approved' | 'denied' | null;
  reason: string | null;
  created_at: string | null;
  // optional extras if you have them in the table/view
  phone?: string | null;
  pup_id?: string | null;
  sport?: string | null;
};

type RequestStatus = NonNullable<AccountRequest['status']>;
type Role = NonNullable<AccountRequest['desired_role']>;

function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  const pe = e as Partial<PostgrestError> & { message?: string };
  return new Error(pe?.message || 'Unknown error');
}

/** List account requests (defaults to all, newest first) */
export async function listRequests(opts?: {
  status?: RequestStatus | 'all';
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AccountRequest[]; total: number }> {
  const limit = opts?.limit ?? 200;
  const offset = opts?.offset ?? 0;

  const cols =
    'id,user_id,email,full_name,device_name,desired_role,status,reason,created_at,phone,pup_id,sport';

  let qbuilder = supabase
    .from('account_requests')
    .select(cols, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts?.status && opts.status !== 'all') {
    qbuilder = qbuilder.eq('status', opts.status as RequestStatus);
  }

  if (opts?.q && opts.q.trim()) {
    const term = opts.q.trim();
    qbuilder = qbuilder.or(
      [
        `full_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `device_name.ilike.%${term}%`,
        `sport.ilike.%${term}%`,
      ].join(',')
    );
  }

  const { data, count, error } = await qbuilder;
  if (error) throw asError(error);

  const rows = (data ?? []) as AccountRequest[];
  return { rows, total: typeof count === 'number' ? count : rows.length };
}

/** Approve a pending request. Two calls: update profile, then mark request approved. */
export async function approveRequest(
  requestId: string,
  opts?: { overrideRole?: Role }
): Promise<boolean> {
  type ReqLite = Pick<AccountRequest, 'id' | 'user_id' | 'desired_role' | 'status'>;

  // 1) Read the request first (need user_id and desired_role)
  const { data: reqData, error: getErr } = await supabase
    .from('account_requests')
    .select('id,user_id,desired_role,status')
    .eq('id', requestId)
    .maybeSingle();

  if (getErr) throw asError(getErr);

  const req = (reqData ?? null) as ReqLite | null;
  if (!req) throw new Error('Request not found');
  if (req.status !== 'pending') throw new Error('Request is not pending');

  const finalRole: Role = opts?.overrideRole ?? (req.desired_role ?? 'athlete');

  // 2) Activate profile with final role
  const { error: profErr } = await supabase
    .from('profiles')
    .update({
      role: finalRole,
      status: 'active',
      is_active: true, // tolerate legacy boolean if present
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.user_id);

  if (profErr) throw asError(profErr);

  // 3) Mark request as approved (concurrency guard: only if still pending)
  const { error: reqErr } = await supabase
    .from('account_requests')
    .update({ status: 'approved' })
    .eq('id', requestId)
    .eq('status', 'pending');

  if (reqErr) throw asError(reqErr);

  return true;
}

/** Deny a pending request (requires a reason) */
export async function denyRequest(requestId: string, reason: string): Promise<boolean> {
  const clean = (reason ?? '').trim();
  if (!clean) throw new Error('Reason is required to deny a request.');

  const { error } = await supabase
    .from('account_requests')
    .update({ status: 'denied', reason: clean })
    .eq('id', requestId)
    .eq('status', 'pending');

  if (error) throw asError(error);
  return true;
}
