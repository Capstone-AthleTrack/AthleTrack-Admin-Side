// src/core/offline/network.ts
// Network status detection and utilities

type NetworkListener = (online: boolean) => void;

const listeners = new Set<NetworkListener>();
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

/**
 * Initialize network status listeners
 * Call this once during app startup
 */
export function initNetworkListener(): void {
  if (typeof window === 'undefined') return;

  const handleOnline = () => {
    isOnline = true;
    listeners.forEach((fn) => fn(true));
  };

  const handleOffline = () => {
    isOnline = false;
    listeners.forEach((fn) => fn(false));
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
}

/**
 * Get current online status
 */
export function getNetworkStatus(): boolean {
  return isOnline;
}

/**
 * Subscribe to network status changes
 * Returns unsubscribe function
 */
export function onNetworkChange(listener: NetworkListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Check if we can reach Supabase
 * More reliable than navigator.onLine for actual API connectivity
 */
export async function checkSupabaseConnectivity(supabaseUrl: string): Promise<boolean> {
  if (!navigator.onLine) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok || response.status === 401; // 401 means server is reachable
  } catch {
    return false;
  }
}

/**
 * Wait for network to come back online
 * Returns a promise that resolves when online
 */
export function waitForOnline(): Promise<void> {
  if (isOnline) return Promise.resolve();

  return new Promise((resolve) => {
    const unsubscribe = onNetworkChange((online) => {
      if (online) {
        unsubscribe();
        resolve();
      }
    });
  });
}





