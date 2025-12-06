// src/core/offline/db.ts
// IndexedDB cache layer for offline data storage using idb library

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// ---- Schema Definition ----
interface AthleTrackDB extends DBSchema {
  // Generic cache store for API responses
  apiCache: {
    key: string; // Cache key (e.g., "sports:list", "sport:basketball")
    value: {
      key: string;
      data: unknown;
      timestamp: number;
      expiresAt: number;
    };
    indexes: { 'by-expires': number };
  };
  // Queue for mutations that need to sync when back online
  syncQueue: {
    key: number; // Auto-increment ID
    value: {
      id?: number;
      action: string; // e.g., "updateProfile", "logSession"
      payload: unknown;
      createdAt: number;
      retries: number;
    };
  };
  // Store for user session data (for offline auth state)
  session: {
    key: string;
    value: {
      key: string;
      data: unknown;
      updatedAt: number;
    };
  };
}

const DB_NAME = 'athletrack-offline';
const DB_VERSION = 1;

// Default cache TTL: 24 hours
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase<AthleTrackDB>> | null = null;

/**
 * Get or create the IndexedDB instance (singleton)
 */
export async function getDB(): Promise<IDBPDatabase<AthleTrackDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AthleTrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // API response cache
        if (!db.objectStoreNames.contains('apiCache')) {
          const cacheStore = db.createObjectStore('apiCache', { keyPath: 'key' });
          cacheStore.createIndex('by-expires', 'expiresAt');
        }

        // Offline mutation queue
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }

        // Session data
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ---- Cache Operations ----

/**
 * Store data in the cache with an optional TTL
 */
export async function cacheSet<T>(
  key: string,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  await db.put('apiCache', {
    key,
    data,
    timestamp: now,
    expiresAt: now + ttlMs,
  });
}

/**
 * Get data from cache (returns null if not found or expired)
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await getDB();
  const entry = await db.get('apiCache', key);
  
  if (!entry) return null;
  
  // Check if expired
  if (Date.now() > entry.expiresAt) {
    // Clean up expired entry
    await db.delete('apiCache', key);
    return null;
  }
  
  return entry.data as T;
}

/**
 * Get data from cache even if expired (for offline fallback)
 */
export async function cacheGetStale<T>(key: string): Promise<{ data: T; isStale: boolean } | null> {
  const db = await getDB();
  const entry = await db.get('apiCache', key);
  
  if (!entry) return null;
  
  return {
    data: entry.data as T,
    isStale: Date.now() > entry.expiresAt,
  };
}

/**
 * Delete a specific cache entry
 */
export async function cacheDelete(key: string): Promise<void> {
  const db = await getDB();
  await db.delete('apiCache', key);
}

/**
 * Clear all cache entries
 */
export async function cacheClear(): Promise<void> {
  const db = await getDB();
  await db.clear('apiCache');
}

/**
 * Clean up expired cache entries
 */
export async function cacheCleanExpired(): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const tx = db.transaction('apiCache', 'readwrite');
  const index = tx.store.index('by-expires');
  
  let count = 0;
  let cursor = await index.openCursor(IDBKeyRange.upperBound(now));
  
  while (cursor) {
    await cursor.delete();
    count++;
    cursor = await cursor.continue();
  }
  
  await tx.done;
  return count;
}

// ---- Sync Queue Operations ----

export type SyncAction = {
  id?: number;
  action: string;
  payload: unknown;
  createdAt: number;
  retries: number;
};

/**
 * Add an action to the sync queue (for offline mutations)
 */
export async function queueAdd(action: string, payload: unknown): Promise<number> {
  const db = await getDB();
  const id = await db.add('syncQueue', {
    action,
    payload,
    createdAt: Date.now(),
    retries: 0,
  });
  return id as number;
}

/**
 * Get all pending sync actions
 */
export async function queueGetAll(): Promise<SyncAction[]> {
  const db = await getDB();
  return db.getAll('syncQueue');
}

/**
 * Remove a sync action by ID (after successful sync)
 */
export async function queueRemove(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('syncQueue', id);
}

/**
 * Increment retry count for a failed sync action
 */
export async function queueIncrementRetry(id: number): Promise<void> {
  const db = await getDB();
  const entry = await db.get('syncQueue', id);
  if (entry) {
    entry.retries++;
    await db.put('syncQueue', entry);
  }
}

/**
 * Clear all sync queue entries
 */
export async function queueClear(): Promise<void> {
  const db = await getDB();
  await db.clear('syncQueue');
}

/**
 * Get count of pending sync actions
 */
export async function queueCount(): Promise<number> {
  const db = await getDB();
  return db.count('syncQueue');
}

// ---- Session Operations ----

/**
 * Store session data
 */
export async function sessionSet(key: string, data: unknown): Promise<void> {
  const db = await getDB();
  await db.put('session', {
    key,
    data,
    updatedAt: Date.now(),
  });
}

/**
 * Get session data
 */
export async function sessionGet<T>(key: string): Promise<T | null> {
  const db = await getDB();
  const entry = await db.get('session', key);
  return entry ? (entry.data as T) : null;
}

/**
 * Delete session data
 */
export async function sessionDelete(key: string): Promise<void> {
  const db = await getDB();
  await db.delete('session', key);
}

/**
 * Clear all session data
 */
export async function sessionClear(): Promise<void> {
  const db = await getDB();
  await db.clear('session');
}




