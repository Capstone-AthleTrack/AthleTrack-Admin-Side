// src/core/offline/sync.ts
// Background sync manager for offline mutations

import { queueGetAll, queueRemove, queueIncrementRetry, type SyncAction } from './db';
import { getNetworkStatus, onNetworkChange, waitForOnline } from './network';
import supabase from '@/core/supabase';

const MAX_RETRIES = 3;
let isSyncing = false;
let syncListeners = new Set<(pending: number) => void>();

/**
 * Action handlers for different mutation types
 * Add new handlers here as needed
 */
type ActionHandler = (payload: unknown) => Promise<void>;

const actionHandlers: Record<string, ActionHandler> = {
  // Profile update
  updateProfile: async (payload) => {
    const { userId, data } = payload as { userId: string; data: Record<string, unknown> };
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', userId);
    if (error) throw error;
  },

  // Log session (telemetry) - uses RPC function
  logSession: async (payload) => {
    const { platform } = payload as { platform: string };
    const { error } = await supabase.rpc('rpc_log_session', { _platform: platform });
    if (error) throw error;
  },

  // Log login (telemetry) - uses RPC function
  logLogin: async () => {
    const { error } = await supabase.rpc('rpc_log_login');
    if (error) throw error;
  },

  // Telemetry session (new format)
  'telemetry:session': async (payload) => {
    const { platform } = payload as { platform?: string };
    const { error } = await supabase.rpc('rpc_log_session', { _platform: platform || 'web' });
    if (error) throw error;
  },

  // Telemetry login (new format)
  'telemetry:login': async () => {
    const { error } = await supabase.rpc('rpc_log_login');
    if (error) throw error;
  },

  // Generic RPC call
  rpc: async (payload) => {
    const { name, params } = payload as { name: string; params: Record<string, unknown> };
    const { error } = await supabase.rpc(name, params);
    if (error) throw error;
  },

  // Insert auth event (from telemetry)
  insertAuthEvent: async (payload) => {
    const data = payload as Record<string, unknown>;
    const { error } = await supabase.from('auth_events').insert(data);
    if (error) throw error;
  },

  // Insert app session (from telemetry)
  insertAppSession: async (payload) => {
    const data = payload as Record<string, unknown>;
    const { error } = await supabase.from('app_sessions').insert(data);
    if (error) throw error;
  },

  // ---- Admin Operations ----

  // Add user (admin)
  'admin:addUser': async (payload) => {
    const data = payload as Record<string, unknown>;
    const { error } = await supabase.from('profiles').insert(data);
    if (error) throw error;
  },

  // Update user (admin) - direct database update (Edge Function is unreliable for role changes)
  'admin:updateUser': async (payload) => {
    const { user_id, sport, team, role } = payload as {
      user_id: string;
      sport?: string | null;
      team?: string | null;
      role?: string | null;
    };

    // Build update object (only include defined values)
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (sport !== undefined && sport !== null) updateData.sport = sport;
    if (team !== undefined && team !== null) updateData.team = team;
    if (role !== undefined && role !== null) updateData.role = role;

    console.log('[sync] admin:updateUser payload:', { user_id, updateData });

    // Direct database update (bypasses unreliable Edge Function)
    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user_id)
      .select();

    if (error) {
      console.error('[sync] admin:updateUser failed:', error);
      throw error;
    }

    console.log('[sync] admin:updateUser success, updated row:', data);
  },

  // Delete user (admin)
  'admin:deleteUser': async (payload) => {
    const { user_id } = payload as { user_id: string };
    const { error } = await supabase.from('profiles').delete().eq('id', user_id);
    if (error) throw error;
  },

  // Decide request (admin) - accept/deny
  'admin:decideRequest': async (payload) => {
    const { requestId, userId, decision, finalRole, reason } = payload as {
      requestId: string;
      userId?: string;
      decision: 'approve' | 'deny';
      finalRole: string;
      reason: string;
    };

    // Import function helpers
    const { getFunctionUrl, getFunctionHeaders } = await import('@/core/supabase');

    // Try Edge Function first
    try {
      const res = await fetch(getFunctionUrl('create_user'), {
        method: 'POST',
        headers: await getFunctionHeaders(),
        body: JSON.stringify({
          action: 'decide',
          decision,
          request_id: requestId,
          final_role: finalRole,
          reason,
        }),
      });

      const out = await res.json();
      if (!res.ok || out?.error) {
        throw new Error(out?.error || 'Edge function failed');
      }
      return;
    } catch {
      // Fallback to direct updates
    }

    // Direct table updates as fallback
    const { data: auth } = await supabase.auth.getUser();
    const decidedAt = new Date().toISOString();

    if (decision === 'approve') {
      const { error: e1 } = await supabase
        .from('account_requests')
        .update({
          status: 'approved',
          reason,
          decided_by: auth?.user?.id ?? null,
          decided_at: decidedAt,
        })
        .eq('id', requestId)
        .eq('status', 'pending');
      if (e1) throw e1;

      if (userId) {
        const { error: e2 } = await supabase
          .from('profiles')
          .update({
            role: finalRole,
            status: 'accepted',
            is_active: true,
            updated_at: decidedAt,
          })
          .eq('id', userId);
        if (e2) throw e2;
      }
    } else {
      const { error: e3 } = await supabase
        .from('account_requests')
        .update({
          status: 'denied',
          reason,
          decided_by: auth?.user?.id ?? null,
          decided_at: decidedAt,
        })
        .eq('id', requestId)
        .eq('status', 'pending');
      if (e3) throw e3;
    }
  },
};

/**
 * Register a custom sync action handler
 */
export function registerSyncHandler(action: string, handler: ActionHandler): void {
  actionHandlers[action] = handler;
}

/**
 * Process a single sync action
 */
async function processSyncAction(action: SyncAction): Promise<boolean> {
  const handler = actionHandlers[action.action];
  
  if (!handler) {
    console.warn(`[sync] No handler for action: ${action.action}`);
    // Remove unknown actions to prevent queue buildup
    if (action.id) await queueRemove(action.id);
    return true;
  }

  try {
    await handler(action.payload);
    if (action.id) await queueRemove(action.id);
    console.log(`[sync] Completed: ${action.action}`);
    return true;
  } catch (error) {
    console.error(`[sync] Failed: ${action.action}`, error);
    
    if (action.id) {
      if (action.retries >= MAX_RETRIES) {
        // Give up after max retries
        console.warn(`[sync] Max retries exceeded, removing: ${action.action}`);
        await queueRemove(action.id);
        return true;
      }
      await queueIncrementRetry(action.id);
    }
    return false;
  }
}

/**
 * Process all pending sync actions
 */
export async function processSyncQueue(): Promise<{ success: number; failed: number }> {
  if (isSyncing || !getNetworkStatus()) {
    return { success: 0, failed: 0 };
  }

  isSyncing = true;
  let success = 0;
  let failed = 0;

  try {
    const actions = await queueGetAll();
    
    // Notify sync started (only if there are actions)
    if (actions.length > 0) {
      try {
        const { SyncNotifications } = await import('./sync-notifications');
        SyncNotifications.syncStarted(actions.length);
      } catch {
        // Notifications module may not be loaded yet
      }
    }
    
    for (const action of actions) {
      if (!getNetworkStatus()) {
        // Network went offline during sync
        break;
      }
      
      const result = await processSyncAction(action);
      if (result) success++;
      else failed++;
    }
    
    // Notify listeners of remaining queue size
    const remaining = await queueGetAll();
    syncListeners.forEach((fn) => fn(remaining.length));
    
    // Notify sync completed (only if we processed something)
    if (success > 0 || failed > 0) {
      try {
        const { SyncNotifications } = await import('./sync-notifications');
        SyncNotifications.syncCompleted(success, failed);
      } catch {
        // Notifications module may not be loaded yet
      }
    }
  } finally {
    isSyncing = false;
  }

  return { success, failed };
}

/**
 * Start the background sync service
 * Automatically syncs when network comes online
 */
export function startSyncService(): () => void {
  // Sync immediately if online
  if (getNetworkStatus()) {
    processSyncQueue();
  }

  // Sync when network comes back online
  const unsubscribe = onNetworkChange(async (online) => {
    // Emit connection status notification
    try {
      const { SyncNotifications } = await import('./sync-notifications');
      if (online) {
        SyncNotifications.connectionRestored();
      } else {
        SyncNotifications.connectionLost();
      }
    } catch {
      // Notifications module may not be loaded yet
    }

    if (online) {
      // Small delay to ensure connection is stable
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (getNetworkStatus()) {
        await processSyncQueue();
      }
    }
  });

  // Periodic sync check (every 5 minutes when online)
  const intervalId = setInterval(() => {
    if (getNetworkStatus()) {
      processSyncQueue();
    }
  }, 5 * 60 * 1000);

  return () => {
    unsubscribe();
    clearInterval(intervalId);
  };
}

/**
 * Subscribe to sync queue changes
 */
export function onSyncQueueChange(listener: (pending: number) => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

/**
 * Manually trigger a sync (e.g., when user clicks "sync now")
 */
export async function triggerSync(): Promise<{ success: number; failed: number }> {
  if (!getNetworkStatus()) {
    console.log('[sync] Cannot sync while offline');
    return { success: 0, failed: 0 };
  }
  return processSyncQueue();
}

/**
 * Wait for online and sync
 */
export async function waitAndSync(): Promise<void> {
  await waitForOnline();
  await processSyncQueue();
}

