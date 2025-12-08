// src/services/offline/profile.offline.ts
// Offline-enabled wrapper for profile service

import { cachedQuery, CacheKeys, queueAdd, getNetworkStatus, cacheSet, cacheDelete } from '@/core/offline';
import { getMyProfile, updateMyProfile, type MyProfile } from '@/services/profile';
import supabase from '@/core/supabase';

const PROFILE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get current user's profile with offline caching
 */
export async function getMyProfileOffline(): Promise<{
  data: MyProfile;
  fromCache: boolean;
  isStale: boolean;
}> {
  return cachedQuery(
    () => getMyProfile(),
    {
      key: CacheKeys.profile.me(),
      ttl: PROFILE_TTL,
      strategy: 'stale-while-revalidate', // Show cached immediately, refresh in background
    }
  );
}

/**
 * Update profile with offline queuing support
 * 
 * If online: Updates immediately and refreshes cache
 * If offline: Queues the update for later sync and updates local cache optimistically
 */
export async function updateMyProfileOffline(patch: {
  full_name: string;
  pup_id?: string | null;
  phone?: string | null;
}): Promise<{ queued: boolean }> {
  const isOnline = getNetworkStatus();

  if (isOnline) {
    // Online: Update immediately
    await updateMyProfile(patch);
    
    // Refresh cache with new data
    const newProfile = await getMyProfile();
    await cacheSet(CacheKeys.profile.me(), newProfile, PROFILE_TTL);
    
    return { queued: false };
  } else {
    // Offline: Queue for later sync
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    
    if (!userId) {
      throw new Error('Cannot update profile: Not signed in');
    }

    // Queue the mutation
    await queueAdd('updateProfile', {
      userId,
      data: {
        full_name: (patch.full_name ?? '').trim(),
        ...(patch.pup_id !== undefined && { pup_id: patch.pup_id ?? null }),
        ...(patch.phone !== undefined && { phone: patch.phone ?? null }),
      },
    });

    // Optimistically update local cache
    try {
      const { data: cached } = await getMyProfileOffline();
      if (cached) {
        const optimisticProfile: MyProfile = {
          ...cached,
          full_name: patch.full_name,
          pup_id: patch.pup_id !== undefined ? patch.pup_id : cached.pup_id,
          phone: patch.phone !== undefined ? patch.phone : cached.phone,
        };
        await cacheSet(CacheKeys.profile.me(), optimisticProfile, PROFILE_TTL);
      }
    } catch {
      // Ignore cache update errors
    }

    return { queued: true };
  }
}

/**
 * Clear cached profile (call on sign out)
 */
export async function clearProfileCache(): Promise<void> {
  await cacheDelete(CacheKeys.profile.me());
}





