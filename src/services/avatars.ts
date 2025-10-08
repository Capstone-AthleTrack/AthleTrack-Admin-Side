/* src/services/avatars.ts */
import { supabase } from "@/core/supabase";

/** Normalize paths so Storage expects "uid/file.jpg" (bucket passed separately). */
export function normalizeAvatarPath(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("avatar/")) return path.slice("avatar/".length);
  if (path.startsWith("avatars/")) return path.slice("avatars/".length);
  return path;
}

/** Append cache-busting version param using epoch seconds. */
function withVersion(url: string, updatedAt?: string | number): string {
  if (!updatedAt) return url;
  let epochSec: number | undefined;
  if (typeof updatedAt === "number") {
    epochSec = updatedAt > 2_000_000_000 ? Math.floor(updatedAt / 1000) : Math.floor(updatedAt);
  } else {
    const t = Date.parse(updatedAt);
    epochSec = Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
  }
  if (!epochSec) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${epochSec}`;
}

/** Tiny in-memory LRU (no dependency). */
const MAX = 500;
const cache = new Map<string, string>();
function cacheGet(key: string) {
  const v = cache.get(key);
  if (v !== undefined) {
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}
function cacheSet(key: string, value: string) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX) {
    const firstKey = cache.keys().next().value as string | undefined;
    if (firstKey) cache.delete(firstKey);
    else break;
  }
}
/** Invalidate any cached signed URL(s) for a given avatar path. */
export function invalidateAvatar(path?: string | null) {
  const norm = normalizeAvatarPath(path);
  if (!norm) return;
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(`${norm}|`)) cache.delete(k);
  }
}

/** Bulk signer duck type (newer storage-js exposes createSignedUrls). */
interface BulkSigner {
  createSignedUrls: (
    paths: string[],
    expiresIn: number
  ) => Promise<{
    data: Array<{ signedUrl: string }> | null;
    error: { message?: string } | null;
  }>;
}
function isBulkSigner(obj: unknown): obj is BulkSigner {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "createSignedUrls" in obj &&
    typeof (obj as BulkSigner).createSignedUrls === "function"
  );
}

/** Sign a single avatar path. Returns a signed URL (no version added here). */
export async function getSignedAvatar(path: string, ttlSec = 86400): Promise<string> {
  const norm = normalizeAvatarPath(path);
  if (!norm) return "";
  const cacheKey = `${norm}|${ttlSec}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;

  const { data, error } = await supabase.storage.from("avatar").createSignedUrl(norm, ttlSec);
  if (error || !data?.signedUrl) return "";
  cacheSet(cacheKey, data.signedUrl);
  return data.signedUrl;
}

type ProfileRow = { id: string; avatar_url: string | null; avatar_updated_at: string | null };
type AdminAvatarRow = { user_id: string; avatar_url: string | null; avatar_updated_at: string | null };

/** Internal: bulk-sign a list of profile rows. */
async function bulkSignFromProfiles(
  profs: ProfileRow[],
  ttlSec = 86400
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!profs?.length) return out;

  const index: Array<{ uid: string; norm?: string; ver?: string | number }> = profs.map((p) => {
    const norm = normalizeAvatarPath(p.avatar_url || undefined);
    const ver = (p.avatar_updated_at ?? undefined) as string | number | undefined;
    return { uid: p.id, norm, ver };
  });

  const filtered = index.filter((i) => !!i.norm);
  if (!filtered.length) return out;

  const paths = filtered.map((i) => i.norm!) as string[];
  const bucket = supabase.storage.from("avatar");
  const CHUNK = 200;

  if (isBulkSigner(bucket)) {
    let offset = 0;
    while (offset < paths.length) {
      const slice = paths.slice(offset, offset + CHUNK);
      const { data: signed } = await bucket.createSignedUrls(slice, ttlSec);
      if (Array.isArray(signed)) {
        for (let j = 0; j < signed.length; j++) {
          const s = signed[j];
          const rec = filtered[offset + j];
          if (!s?.signedUrl || !rec) continue;
          const finalUrl = rec.ver ? withVersion(s.signedUrl, rec.ver) : s.signedUrl;
          out[rec.uid] = finalUrl;
          cacheSet(`${rec.norm}|${ttlSec}`, s.signedUrl);
        }
      }
      offset += CHUNK;
    }
    return out;
  }

  const results = await Promise.all(paths.map((p) => getSignedAvatar(p, ttlSec)));
  for (let i = 0; i < results.length; i++) {
    const base = results[i];
    const rec = filtered[i];
    if (!base || !rec) continue;
    out[rec.uid] = rec.ver ? withVersion(base, rec.ver) : base;
  }
  return out;
}

/** Probe-once state for the admin_get_avatars RPC to avoid noise. */
let adminRpcAvailable: boolean | "unknown" = "unknown";

async function fetchAvatarsViaAdminRpc(userIds: string[]): Promise<AdminAvatarRow[] | null> {
  if (!userIds.length) return [];
  if (adminRpcAvailable === false) return null;

  try {
    const { data, error } = await supabase.rpc("admin_get_avatars", { _user_ids: userIds });
    if (!error && Array.isArray(data)) {
      adminRpcAvailable = true;
      return data as AdminAvatarRow[];
    }
    adminRpcAvailable = false;
    return null;
  } catch {
    adminRpcAvailable = false;
    return null;
  }
}

/**
 * Bulk by User IDs:
 * 1) Try admin_get_avatars (SECURITY DEFINER) → client-side sign (RLS-safe)
 * 2) Fallback to direct table read (works only if RLS allows)
 */
export async function bulkSignedByUserIds(
  userIds: string[],
  ttlSec = 86400
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!userIds.length) return out;

  // --- Preferred: admin RPC (RLS bypass for admin pages) ---
  const adminRows = await fetchAvatarsViaAdminRpc(userIds);
  if (adminRows) {
    const profs: ProfileRow[] = adminRows.map((r) => ({
      id: r.user_id,
      avatar_url: r.avatar_url,
      avatar_updated_at: r.avatar_updated_at,
    }));
    return bulkSignFromProfiles(profs, ttlSec);
  }

  // --- Fallback: direct table read (may return only current user due to RLS) ---
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, avatar_url, avatar_updated_at")
    .in("id", userIds);

  if (Array.isArray(profs)) {
    return bulkSignFromProfiles(profs as ProfileRow[], ttlSec);
  }

  return out;
}

/** Get a versioned, signed URL for direct <img src>. */
export async function getVersionedAvatarSrc(
  path?: string | null,
  updatedAt?: string | number,
  ttlSec = 86400
): Promise<string | undefined> {
  const norm = normalizeAvatarPath(path || undefined);
  if (!norm) return undefined;
  const cacheKey = `${norm}|${ttlSec}`;
  const hit = cacheGet(cacheKey);
  const base = hit || (await getSignedAvatar(norm, ttlSec));
  if (!base) return undefined;
  return withVersion(base, updatedAt);
}

/* =========================
   Get ALL users' avatars
   ========================= */
async function fetchAllProfilesPaged(pageSize = 1000): Promise<ProfileRow[]> {
  const rows: ProfileRow[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, avatar_url, avatar_updated_at")
      .range(from, to);

    if (error) break;
    if (!data?.length) break;

    rows.push(...(data as ProfileRow[]));

    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function bulkSignedAllUsers(ttlSec = 86400): Promise<Record<string, string>> {
  // If you later add an "admin_get_all_avatars" RPC, prefer that here.
  const profs = await fetchAllProfilesPaged();
  if (!profs.length) return {};
  return bulkSignFromProfiles(profs, ttlSec);
}
