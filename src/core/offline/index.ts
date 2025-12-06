// src/core/offline/index.ts
// Main export for offline functionality

// Database operations
export {
  getDB,
  cacheSet,
  cacheGet,
  cacheGetStale,
  cacheDelete,
  cacheClear,
  cacheCleanExpired,
  queueAdd,
  queueGetAll,
  queueRemove,
  queueClear,
  queueCount,
  sessionSet,
  sessionGet,
  sessionDelete,
  sessionClear,
  type SyncAction,
} from './db';

// Network status
export {
  initNetworkListener,
  getNetworkStatus,
  onNetworkChange,
  checkSupabaseConnectivity,
  waitForOnline,
} from './network';

// Background sync
export {
  registerSyncHandler,
  processSyncQueue,
  startSyncService,
  onSyncQueueChange,
  triggerSync,
  waitAndSync,
} from './sync';

// Cached queries
export {
  cachedQuery,
  prefetch,
  CacheKeys,
  type CacheStrategy,
  type CacheQueryOptions,
  type CacheQueryResult,
} from './cache-query';

// Sync notifications
export {
  onSyncNotification,
  notifySyncEvent,
  SyncNotifications,
  type SyncNotification,
} from './sync-notifications';

// Cache management
export {
  getCacheStats,
  getCacheSizeFormatted,
  isCacheOverLimit,
  cleanupCacheBySize,
  cleanupExpiredEntries,
  performCacheMaintenance,
  setCacheMaxSize,
  getCacheConfig,
  clearCacheByPrefix,
  clearDashboardCache,
  clearSportsCache,
  clearAthleteCache,
  clearAdminCache,
} from './cache-manager';

// Conflict detection
export {
  generateChecksum,
  trackEditStart,
  getTrackedVersion,
  clearTrackedVersion,
  checkForConflict,
  checkForDeletion,
  suggestResolution,
  formatConflictMessage,
  mergeRecords,
  checkBatchConflicts,
  type EditVersion,
  type ConflictInfo,
  type ResolutionStrategy,
} from './conflict-detection';

// ---- Initialization ----

import { initNetworkListener } from './network';
import { startSyncService } from './sync';
import { cacheCleanExpired } from './db';
import { performCacheMaintenance } from './cache-manager';

let initialized = false;
let cleanupFn: (() => void) | null = null;

/**
 * Initialize the offline system
 * Call this once during app startup
 */
export function initOffline(): void {
  if (initialized) return;
  initialized = true;

  // Start network listener
  initNetworkListener();

  // Start background sync service
  cleanupFn = startSyncService();

  // Full cache maintenance periodically (every 30 minutes)
  const maintenanceInterval = setInterval(() => {
    performCacheMaintenance()
      .then(({ expiredRemoved, sizeCleanup }) => {
        const totalRemoved = expiredRemoved + sizeCleanup.removed;
        if (totalRemoved > 0) {
          console.log(`[cache] Maintenance: ${expiredRemoved} expired, ${sizeCleanup.removed} by size (${(sizeCleanup.freedBytes / 1024).toFixed(1)} KB freed)`);
        }
      })
      .catch(console.error);
  }, 30 * 60 * 1000);

  // Initial cleanup (just expired entries for speed)
  cacheCleanExpired().catch(console.error);

  console.log('[offline] System initialized');

  // Store cleanup for potential teardown
  const originalCleanup = cleanupFn;
  cleanupFn = () => {
    originalCleanup?.();
    clearInterval(maintenanceInterval);
  };
}

/**
 * Cleanup offline system (for testing or app shutdown)
 */
export function cleanupOffline(): void {
  cleanupFn?.();
  cleanupFn = null;
  initialized = false;
}




