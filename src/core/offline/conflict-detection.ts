// src/core/offline/conflict-detection.ts
// Basic conflict detection for offline edits

import { sessionGet, sessionSet, sessionDelete } from './db';

// ---- Types ----
export interface EditVersion {
  recordId: string;
  recordType: string;
  timestamp: number;
  checksum: string;
  userId?: string;
}

export interface ConflictInfo {
  hasConflict: boolean;
  localVersion?: EditVersion;
  serverVersion?: EditVersion;
  conflictType?: 'concurrent_edit' | 'stale_data' | 'deleted';
}

// ---- Checksum Generation ----

/**
 * Generate a simple checksum for a record
 * Used to detect if data has changed
 */
export function generateChecksum(data: unknown): string {
  try {
    const str = JSON.stringify(data, Object.keys(data as object).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  } catch {
    return Date.now().toString(16);
  }
}

// ---- Version Tracking ----

const VERSION_PREFIX = 'version:';

/**
 * Store the current version of a record (before editing)
 */
export async function trackEditStart(
  recordType: string,
  recordId: string,
  data: unknown,
  userId?: string
): Promise<void> {
  const key = `${VERSION_PREFIX}${recordType}:${recordId}`;
  const version: EditVersion = {
    recordId,
    recordType,
    timestamp: Date.now(),
    checksum: generateChecksum(data),
    userId,
  };
  await sessionSet(key, version);
}

/**
 * Get the tracked version for a record
 */
export async function getTrackedVersion(
  recordType: string,
  recordId: string
): Promise<EditVersion | null> {
  const key = `${VERSION_PREFIX}${recordType}:${recordId}`;
  return sessionGet<EditVersion>(key);
}

/**
 * Clear the tracked version after successful save
 */
export async function clearTrackedVersion(
  recordType: string,
  recordId: string
): Promise<void> {
  const key = `${VERSION_PREFIX}${recordType}:${recordId}`;
  await sessionDelete(key);
}

// ---- Conflict Detection ----

/**
 * Check for conflicts before saving
 * Compare the tracked version with current server data
 */
export async function checkForConflict(
  recordType: string,
  recordId: string,
  serverData: unknown,
  serverUpdatedAt?: string | Date
): Promise<ConflictInfo> {
  const localVersion = await getTrackedVersion(recordType, recordId);
  
  if (!localVersion) {
    // No tracked version - assume no conflict
    return { hasConflict: false };
  }
  
  // Check if server data has changed
  const serverChecksum = generateChecksum(serverData);
  
  if (serverChecksum === localVersion.checksum) {
    // Data hasn't changed - no conflict
    return { hasConflict: false, localVersion };
  }
  
  // Data has changed - determine conflict type
  const serverTimestamp = serverUpdatedAt
    ? new Date(serverUpdatedAt).getTime()
    : Date.now();
  
  const serverVersion: EditVersion = {
    recordId,
    recordType,
    timestamp: serverTimestamp,
    checksum: serverChecksum,
  };
  
  // If server was updated after we started editing, it's a concurrent edit
  const isConcurrent = serverTimestamp > localVersion.timestamp;
  
  return {
    hasConflict: true,
    localVersion,
    serverVersion,
    conflictType: isConcurrent ? 'concurrent_edit' : 'stale_data',
  };
}

/**
 * Check if a record was deleted on the server
 */
export function checkForDeletion(serverData: unknown): ConflictInfo {
  if (serverData === null || serverData === undefined) {
    return {
      hasConflict: true,
      conflictType: 'deleted',
    };
  }
  return { hasConflict: false };
}

// ---- Conflict Resolution Helpers ----

export type ResolutionStrategy = 'keep_local' | 'keep_server' | 'merge' | 'cancel';

/**
 * Helper to determine a default resolution strategy
 */
export function suggestResolution(conflict: ConflictInfo): ResolutionStrategy {
  if (!conflict.hasConflict) return 'keep_local';
  
  switch (conflict.conflictType) {
    case 'deleted':
      // Record was deleted - user should decide
      return 'cancel';
    case 'concurrent_edit':
      // Someone else edited - prefer server to avoid data loss
      return 'keep_server';
    case 'stale_data':
      // Our data was old - keep local changes but warn
      return 'keep_local';
    default:
      return 'keep_server';
  }
}

/**
 * Format conflict message for user display
 */
export function formatConflictMessage(conflict: ConflictInfo): string {
  if (!conflict.hasConflict) return '';
  
  switch (conflict.conflictType) {
    case 'deleted':
      return 'This record has been deleted by another user. Your changes cannot be saved.';
    case 'concurrent_edit':
      return 'This record was modified by another user while you were editing. Please review the changes.';
    case 'stale_data':
      return 'You are editing an older version of this record. Some changes may have been made since.';
    default:
      return 'A conflict was detected with this record.';
  }
}

// ---- Merge Utilities ----

/**
 * Simple field-level merge (local wins for changed fields)
 * Returns merged data and list of conflicting fields
 */
export function mergeRecords<T extends Record<string, unknown>>(
  original: T,
  local: T,
  server: T
): { merged: T; conflicts: string[] } {
  const merged = { ...server } as T;
  const conflicts: string[] = [];
  
  for (const key of Object.keys(local)) {
    const originalValue = original[key];
    const localValue = local[key];
    const serverValue = server[key];
    
    // If local changed from original
    const localChanged = JSON.stringify(localValue) !== JSON.stringify(originalValue);
    // If server changed from original
    const serverChanged = JSON.stringify(serverValue) !== JSON.stringify(originalValue);
    
    if (localChanged && serverChanged) {
      // Both changed - conflict
      conflicts.push(key);
      // Keep local value (last-write-wins)
      merged[key as keyof T] = localValue as T[keyof T];
    } else if (localChanged) {
      // Only local changed - use local
      merged[key as keyof T] = localValue as T[keyof T];
    }
    // If only server changed, merged already has server value
  }
  
  return { merged, conflicts };
}

// ---- Batch Conflict Check ----

/**
 * Check multiple records for conflicts at once
 */
export async function checkBatchConflicts(
  recordType: string,
  records: Array<{ id: string; data: unknown; updatedAt?: string }>
): Promise<Map<string, ConflictInfo>> {
  const results = new Map<string, ConflictInfo>();
  
  for (const record of records) {
    const conflict = await checkForConflict(
      recordType,
      record.id,
      record.data,
      record.updatedAt
    );
    results.set(record.id, conflict);
  }
  
  return results;
}


