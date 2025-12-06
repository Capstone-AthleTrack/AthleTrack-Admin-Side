// src/core/offline/cache-manager.ts
// Cache size management and cleanup utilities

import { getDB } from './db';

// ---- Configuration ----
const CONFIG = {
  // Maximum cache size in bytes (50 MB default)
  MAX_CACHE_SIZE_BYTES: 50 * 1024 * 1024,
  
  // Target size after cleanup (80% of max)
  TARGET_SIZE_RATIO: 0.8,
  
  // Minimum entries to keep per category
  MIN_ENTRIES_PER_CATEGORY: 5,
  
  // Cache key prefixes and their priorities (higher = keep longer)
  PRIORITY: {
    'profile:': 100,      // User's own profile - highest priority
    'dashboard:': 90,     // Dashboard data - very important
    'admin:users:': 80,   // User management
    'admin:requests:': 80, // Request management
    'sports:list': 70,    // Sports list
    'sports:bundle:': 60, // Sport bundles
    'athlete:bundle:': 50, // Athlete bundles
    'metrics:': 40,       // Metrics data
  } as Record<string, number>,
  
  // Default priority for unknown keys
  DEFAULT_PRIORITY: 30,
};

// ---- Types ----
interface CacheEntry {
  key: string;
  data: unknown;
  timestamp: number;
  expiresAt: number;
}

interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  entriesByPrefix: Record<string, number>;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

// ---- Size Estimation ----

/**
 * Estimate the byte size of a value
 * Uses JSON serialization as approximation
 */
function estimateSize(value: unknown): number {
  try {
    const str = JSON.stringify(value);
    // UTF-16 encoding: 2 bytes per character
    return str.length * 2;
  } catch {
    return 0;
  }
}

// ---- Priority Calculation ----

/**
 * Get priority for a cache key (higher = more important)
 */
function getPriority(key: string): number {
  for (const [prefix, priority] of Object.entries(CONFIG.PRIORITY)) {
    if (key.startsWith(prefix) || key === prefix.replace(':', '')) {
      return priority;
    }
  }
  return CONFIG.DEFAULT_PRIORITY;
}

/**
 * Calculate eviction score (lower = evict first)
 * Factors: priority, recency, staleness
 */
function getEvictionScore(entry: CacheEntry): number {
  const priority = getPriority(entry.key);
  const now = Date.now();
  
  // Age factor: newer entries score higher
  const ageMs = now - entry.timestamp;
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  const ageFactor = Math.max(0, 1 - (ageMs / maxAgeMs));
  
  // Staleness factor: unexpired entries score higher
  const isExpired = now > entry.expiresAt;
  const stalenessFactor = isExpired ? 0.5 : 1;
  
  // Combined score
  return priority * ageFactor * stalenessFactor;
}

// ---- Cache Statistics ----

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  const db = await getDB();
  const entries = await db.getAll('apiCache');
  
  let totalSizeBytes = 0;
  const entriesByPrefix: Record<string, number> = {};
  let oldestTimestamp = Infinity;
  let newestTimestamp = 0;
  
  for (const entry of entries) {
    totalSizeBytes += estimateSize(entry.data);
    
    // Count by prefix
    const prefix = entry.key.split(':')[0] + ':';
    entriesByPrefix[prefix] = (entriesByPrefix[prefix] || 0) + 1;
    
    // Track age range
    if (entry.timestamp < oldestTimestamp) oldestTimestamp = entry.timestamp;
    if (entry.timestamp > newestTimestamp) newestTimestamp = entry.timestamp;
  }
  
  return {
    totalEntries: entries.length,
    totalSizeBytes,
    entriesByPrefix,
    oldestEntry: oldestTimestamp < Infinity ? new Date(oldestTimestamp) : null,
    newestEntry: newestTimestamp > 0 ? new Date(newestTimestamp) : null,
  };
}

/**
 * Get formatted cache size
 */
export async function getCacheSizeFormatted(): Promise<string> {
  const stats = await getCacheStats();
  const mb = stats.totalSizeBytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

// ---- Cache Cleanup ----

/**
 * Check if cache is over the size limit
 */
export async function isCacheOverLimit(): Promise<boolean> {
  const stats = await getCacheStats();
  return stats.totalSizeBytes > CONFIG.MAX_CACHE_SIZE_BYTES;
}

/**
 * Clean up cache to stay within size limits
 * Uses priority-based eviction
 */
export async function cleanupCacheBySize(): Promise<{ removed: number; freedBytes: number }> {
  const db = await getDB();
  const entries = await db.getAll('apiCache');
  
  // Calculate current size
  const entriesWithSize = entries.map((entry) => ({
    ...entry,
    size: estimateSize(entry.data),
    score: getEvictionScore(entry),
  }));
  
  const totalSize = entriesWithSize.reduce((sum, e) => sum + e.size, 0);
  const targetSize = CONFIG.MAX_CACHE_SIZE_BYTES * CONFIG.TARGET_SIZE_RATIO;
  
  // If under limit, no cleanup needed
  if (totalSize <= CONFIG.MAX_CACHE_SIZE_BYTES) {
    return { removed: 0, freedBytes: 0 };
  }
  
  // Sort by eviction score (lowest first = evict first)
  entriesWithSize.sort((a, b) => a.score - b.score);
  
  // Track entries to keep per category
  const keptByCategory: Record<string, number> = {};
  
  let removed = 0;
  let freedBytes = 0;
  let currentSize = totalSize;
  
  const tx = db.transaction('apiCache', 'readwrite');
  
  for (const entry of entriesWithSize) {
    // Stop if we've reached target size
    if (currentSize <= targetSize) break;
    
    // Get category for this entry
    const category = entry.key.split(':')[0];
    keptByCategory[category] = (keptByCategory[category] || 0);
    
    // Check if we should keep minimum entries for this category
    const totalInCategory = entriesWithSize.filter(
      (e) => e.key.split(':')[0] === category
    ).length;
    
    if (keptByCategory[category] >= totalInCategory - CONFIG.MIN_ENTRIES_PER_CATEGORY) {
      // Skip - need to keep minimum
      keptByCategory[category]++;
      continue;
    }
    
    // Delete this entry
    await tx.store.delete(entry.key);
    currentSize -= entry.size;
    freedBytes += entry.size;
    removed++;
    keptByCategory[category]++;
  }
  
  await tx.done;
  
  console.log(`[cache] Cleanup: removed ${removed} entries, freed ${(freedBytes / 1024).toFixed(1)} KB`);
  
  return { removed, freedBytes };
}

/**
 * Clean up old/expired entries
 */
export async function cleanupExpiredEntries(): Promise<number> {
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
  
  if (count > 0) {
    console.log(`[cache] Cleaned ${count} expired entries`);
  }
  
  return count;
}

/**
 * Full cache maintenance
 * - Remove expired entries
 * - Enforce size limits
 */
export async function performCacheMaintenance(): Promise<{
  expiredRemoved: number;
  sizeCleanup: { removed: number; freedBytes: number };
}> {
  // First remove expired entries
  const expiredRemoved = await cleanupExpiredEntries();
  
  // Then enforce size limits
  const sizeCleanup = await cleanupCacheBySize();
  
  return { expiredRemoved, sizeCleanup };
}

// ---- Cache Configuration ----

/**
 * Update cache size limit
 */
export function setCacheMaxSize(bytes: number): void {
  CONFIG.MAX_CACHE_SIZE_BYTES = bytes;
}

/**
 * Get current cache configuration
 */
export function getCacheConfig(): typeof CONFIG {
  return { ...CONFIG };
}

// ---- Selective Cache Clear ----

/**
 * Clear cache entries by prefix
 */
export async function clearCacheByPrefix(prefix: string): Promise<number> {
  const db = await getDB();
  const entries = await db.getAll('apiCache');
  
  let count = 0;
  const tx = db.transaction('apiCache', 'readwrite');
  
  for (const entry of entries) {
    if (entry.key.startsWith(prefix)) {
      await tx.store.delete(entry.key);
      count++;
    }
  }
  
  await tx.done;
  
  console.log(`[cache] Cleared ${count} entries with prefix: ${prefix}`);
  return count;
}

/**
 * Clear all dashboard cache
 */
export async function clearDashboardCache(): Promise<number> {
  return clearCacheByPrefix('dashboard:');
}

/**
 * Clear all sports cache
 */
export async function clearSportsCache(): Promise<number> {
  return clearCacheByPrefix('sports:');
}

/**
 * Clear all athlete cache
 */
export async function clearAthleteCache(): Promise<number> {
  return clearCacheByPrefix('athlete:');
}

/**
 * Clear all admin cache (users + requests)
 */
export async function clearAdminCache(): Promise<number> {
  const users = await clearCacheByPrefix('admin:users:');
  const requests = await clearCacheByPrefix('admin:requests:');
  return users + requests;
}

