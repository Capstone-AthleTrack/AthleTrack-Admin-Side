// src/hooks/useNetworkStatus.ts
// React hook for network status awareness

import { useState, useEffect, useCallback } from 'react';
import {
  getNetworkStatus,
  onNetworkChange,
  queueCount,
  onSyncQueueChange,
  triggerSync,
} from '@/core/offline';

export interface NetworkState {
  /** Whether the browser is online */
  isOnline: boolean;
  /** Number of pending sync operations */
  pendingSync: number;
  /** Manually trigger a sync */
  syncNow: () => Promise<void>;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
}

/**
 * Hook to track network status and pending sync operations
 * 
 * @example
 * function MyComponent() {
 *   const { isOnline, pendingSync, syncNow } = useNetworkStatus();
 *   
 *   return (
 *     <div>
 *       {!isOnline && <span>You're offline</span>}
 *       {pendingSync > 0 && <span>{pendingSync} changes pending</span>}
 *       <button onClick={syncNow}>Sync Now</button>
 *     </div>
 *   );
 * }
 */
export function useNetworkStatus(): NetworkState {
  const [isOnline, setIsOnline] = useState(getNetworkStatus);
  const [pendingSync, setPendingSync] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Track network status changes
  useEffect(() => {
    const unsubscribe = onNetworkChange((online) => {
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  // Track sync queue changes
  useEffect(() => {
    // Initial count
    queueCount().then(setPendingSync).catch(console.error);

    const unsubscribe = onSyncQueueChange((count) => {
      setPendingSync(count);
    });
    return unsubscribe;
  }, []);

  // Manual sync trigger
  const syncNow = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    
    setIsSyncing(true);
    try {
      await triggerSync();
      // Refresh pending count
      const count = await queueCount();
      setPendingSync(count);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing]);

  return {
    isOnline,
    pendingSync,
    syncNow,
    isSyncing,
  };
}

/**
 * Simple hook that just returns online status
 * Use this when you don't need sync functionality
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(getNetworkStatus);

  useEffect(() => {
    const unsubscribe = onNetworkChange(setIsOnline);
    return unsubscribe;
  }, []);

  return isOnline;
}





