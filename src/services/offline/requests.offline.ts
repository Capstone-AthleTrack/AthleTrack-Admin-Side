// src/services/offline/requests.offline.ts
// Offline-enabled wrapper for request management operations

import { cachedQuery, queueAdd, getNetworkStatus, cacheDelete } from '@/core/offline';
import { supabase, getFunctionUrl, getFunctionHeaders } from '@/core/supabase';

// Cache TTLs
const REQUESTS_LIST_TTL = 5 * 60 * 1000; // 5 minutes

// ---- Types ----
export type ReqStatus = 'Pending' | 'Accepted' | 'Denied';
export type FinalRole = 'athlete' | 'coach' | 'admin';

export interface AccountRequest {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  device_name: string | null;
  desired_role: string | null;
  status: string | null;
  reason: string | null;
  created_at: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  phone?: string | null;
  pup_id?: string | null;
  sport?: string | null;
}

export interface RequestItem {
  id: string;
  name: string;
  email?: string;
  deviceName?: string;
  issuedAt: string;
  status: ReqStatus;
  reason?: string;
  extra?: {
    userId?: string;
    role?: string;
    phone?: string;
    pupId?: string;
    sport?: string;
    decidedById?: string;
    decidedByName?: string;
    decidedAt?: string;
  };
}

export interface DecisionPayload {
  requestId: string;
  userId?: string;
  decision: 'approve' | 'deny';
  finalRole: FinalRole;
  reason: string;
}

// ---- Cache Keys ----
const CACHE_KEYS = {
  requestsList: () => 'admin:requests:list',
};

// ---- Helpers ----
const toUiStatus = (s: string | null | undefined): ReqStatus =>
  (s ?? '').toLowerCase() === 'approved'
    ? 'Accepted'
    : (s ?? '').toLowerCase() === 'denied'
    ? 'Denied'
    : 'Pending';

// ---- Read Operations (with caching) ----

/**
 * Fetch all account requests with offline caching
 * Also includes auto-approved users from mobile app
 */
export async function fetchRequestsOffline(): Promise<{
  data: RequestItem[];
  fromCache: boolean;
  isStale: boolean;
}> {
  return cachedQuery(
    async () => {
      const selectFull = [
        'id', 'user_id', 'email', 'full_name', 'device_name', 'desired_role',
        'status', 'reason', 'created_at', 'decided_by', 'decided_at', 'phone', 'pup_id', 'sport',
      ].join(',');

      const selectBase = [
        'id', 'user_id', 'email', 'full_name', 'device_name', 'desired_role',
        'status', 'reason', 'created_at',
      ].join(',');

      let rows: AccountRequest[] = [];

      // Try full select first
      const resp = await supabase
        .from('account_requests')
        .select(selectFull)
        .order('created_at', { ascending: false })
        .range(0, 199);

      if (resp.error) {
        // Try base select
        const resp2 = await supabase
          .from('account_requests')
          .select(selectBase)
          .order('created_at', { ascending: false })
          .range(0, 199);

        if (resp2.error) {
          // Fallback to pending profiles
          const fb = await supabase
            .from('profiles')
            .select('id,full_name,email,updated_at,role,status')
            .eq('status', 'pending')
            .order('updated_at', { ascending: false })
            .range(0, 199);

          if (fb.error) throw fb.error;

          return (fb.data ?? []).map((p: Record<string, unknown>) => ({
            id: String(p.id),
            name: String(p.full_name || ''),
            email: p.email ? String(p.email) : undefined,
            deviceName: undefined,
            issuedAt: String(p.updated_at || new Date().toISOString()),
            status: 'Pending' as ReqStatus,
            reason: '',
            extra: {
              userId: String(p.id),
              role: p.role
                ? `${String(p.role).charAt(0).toUpperCase()}${String(p.role).slice(1)}`
                : 'Athlete',
            },
          }));
        }
        rows = (resp2.data ?? []) as unknown as AccountRequest[];
      } else {
        rows = (resp.data ?? []) as unknown as AccountRequest[];
      }

      // Soft fallback if table exists but empty
      if (!rows.length) {
        const fb2 = await supabase
          .from('profiles')
          .select('id,full_name,email,updated_at,role,status')
          .eq('status', 'pending')
          .order('updated_at', { ascending: false })
          .range(0, 199);

        if (!fb2.error && fb2.data?.length) {
          return fb2.data.map((p) => ({
            id: p.id,
            name: p.full_name || '',
            email: p.email || undefined,
            deviceName: undefined,
            issuedAt: p.updated_at || new Date().toISOString(),
            status: 'Pending' as ReqStatus,
            reason: '',
            extra: {
              userId: p.id,
              role: p.role
                ? `${String(p.role).charAt(0).toUpperCase()}${String(p.role).slice(1)}`
                : 'Athlete',
            },
          }));
        }
      }

      // ---- Sync auto-approved users from mobile app ----
      // Find requests that show 'pending' but whose profile is already 'accepted'/'active'
      const pendingRequests = rows.filter((r) => (r.status ?? '').toLowerCase() === 'pending');
      if (pendingRequests.length > 0) {
        const pendingEmails = pendingRequests
          .map((r) => r.email)
          .filter((e): e is string => !!e);

        if (pendingEmails.length > 0) {
          // Check which of these users have accepted profiles
          const { data: acceptedProfiles } = await supabase
            .from('profiles')
            .select('id, email, full_name, role, status, updated_at')
            .in('email', pendingEmails)
            .in('status', ['accepted', 'active']);

          if (acceptedProfiles && acceptedProfiles.length > 0) {
            // Create a map of email -> accepted profile
            const acceptedByEmail: Record<string, typeof acceptedProfiles[0]> = {};
            for (const p of acceptedProfiles) {
              if (p.email) acceptedByEmail[p.email.toLowerCase()] = p;
            }

            // Update the rows to reflect the actual status
            rows = rows.map((r) => {
              if ((r.status ?? '').toLowerCase() !== 'pending') return r;
              
              const email = (r.email ?? '').toLowerCase();
              const acceptedProfile = acceptedByEmail[email];
              
              if (acceptedProfile) {
                // This request was auto-approved - update its status
                return {
                  ...r,
                  user_id: r.user_id || acceptedProfile.id,
                  status: 'approved',
                  reason: r.reason || 'Auto-approved via mobile app',
                  decided_at: r.decided_at || acceptedProfile.updated_at || new Date().toISOString(),
                  decided_by: r.decided_by || 'system',
                };
              }
              return r;
            });
          }
        }
      }

      // Fetch admin names for decided_by
      const adminIds = Array.from(
        new Set(
          rows
            .map((r) => r.decided_by)
            .filter((v): v is string => !!v && v !== 'system')
        )
      );

      let decidedNameById: Record<string, string> = { system: 'System (Auto)' };
      if (adminIds.length) {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id,full_name,email')
          .in('id', adminIds);

        if (admins) {
          decidedNameById = admins.reduce<Record<string, string>>((acc, p) => {
            acc[p.id] = p.full_name || p.email || p.id;
            return acc;
          }, decidedNameById);
        }
      }

      return rows.map((r) => ({
        id: r.id,
        name: r.full_name || '',
        email: r.email || undefined,
        deviceName: r.device_name || undefined,
        issuedAt: r.created_at || new Date().toISOString(),
        status: toUiStatus(r.status),
        reason: r.reason || '',
        extra: {
          userId: r.user_id || undefined,
          role: r.desired_role
            ? `${String(r.desired_role).charAt(0).toUpperCase()}${String(r.desired_role).slice(1)}`
            : 'Athlete',
          pupId: r.pup_id || undefined,
          sport: r.sport || undefined,
          phone: r.phone || undefined,
          decidedById: r.decided_by || undefined,
          decidedByName: r.decided_by ? decidedNameById[r.decided_by] : undefined,
          decidedAt: r.decided_at || undefined,
        },
      }));
    },
    {
      key: CACHE_KEYS.requestsList(),
      ttl: REQUESTS_LIST_TTL,
      strategy: 'stale-while-revalidate', // Show cached immediately, refresh in background
    }
  );
}

// ---- Write Operations (with offline queuing) ----

/**
 * Accept or deny a request with offline queuing
 */
export async function decideRequestOffline(
  payload: DecisionPayload
): Promise<{ queued: boolean }> {
  if (getNetworkStatus()) {
    try {
      // Try Edge Function first
      const res = await fetch(getFunctionUrl('create_user'), {
        method: 'POST',
        headers: await getFunctionHeaders(),
        body: JSON.stringify({
          action: 'decide',
          decision: payload.decision,
          request_id: payload.requestId,
          final_role: payload.finalRole,
          reason: payload.reason,
        }),
      });
      
      const out = await res.json();
      if (!res.ok || out?.error) {
        throw new Error(out?.error || 'Edge function failed');
      }

      // Invalidate cache
      await cacheDelete(CACHE_KEYS.requestsList());
      return { queued: false };
    } catch (edgeErr) {
      console.warn('[requests] Edge function failed, trying direct update:', edgeErr);

      // Fallback: direct table updates
      try {
        const { data: auth } = await supabase.auth.getUser();
        const decidedAt = new Date().toISOString();

        if (payload.decision === 'approve') {
          await supabase
            .from('account_requests')
            .update({
              status: 'approved',
              reason: payload.reason,
              decided_by: auth?.user?.id ?? null,
              decided_at: decidedAt,
            })
            .eq('id', payload.requestId)
            .eq('status', 'pending');

          if (payload.userId) {
            await supabase
              .from('profiles')
              .update({
                role: payload.finalRole,
                status: 'accepted',
                is_active: true,
                updated_at: decidedAt,
              })
              .eq('id', payload.userId);
          }
        } else {
          await supabase
            .from('account_requests')
            .update({
              status: 'denied',
              reason: payload.reason,
              decided_by: auth?.user?.id ?? null,
              decided_at: decidedAt,
            })
            .eq('id', payload.requestId)
            .eq('status', 'pending');
        }

        // Invalidate cache
        await cacheDelete(CACHE_KEYS.requestsList());
        return { queued: false };
      } catch (directErr) {
        console.warn('[requests] Direct update also failed, queuing:', directErr);
      }
    }
  }

  // Queue for later sync
  await queueAdd('admin:decideRequest', payload);
  return { queued: true };
}

/**
 * Clear requests cache
 */
export async function clearRequestsCache(): Promise<void> {
  await cacheDelete(CACHE_KEYS.requestsList());
}

