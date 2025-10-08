/* src/components/AvatarImg.tsx
   Non-visual helper: fetches a signed URL and feeds it to your existing Avatar/img.
   Usage (NO layout change):

   // A) If you already have path + updatedAt:
   <AvatarImg path={row.avatar_url} updatedAt={row.avatar_updated_at}>
     {(src) => <img {...existingProps} src={src || existingFallback} />}
   </AvatarImg>

   // B) Or just a userId (auto-loads + realtime refreshes on profile changes):
   <AvatarImg userId={row.id}>
     {(src) => <Avatar src={src} icon={<UserOutlined />} />}
   </AvatarImg>
*/
import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/core/supabase";
import { getVersionedAvatarSrc, normalizeAvatarPath } from "@/services/avatars";
import { subscribeProfilesAvatar } from "@/hooks/useAvatarRealtime";

type Props = {
  /** Optional: pass a userId to auto-load avatar_url & updated_at (and subscribe to updates). */
  userId?: string;
  /** Optional: direct storage path (e.g., "avatar/<uid>/file.jpg" or "<uid>/file.jpg"). Ignored if userId is provided. */
  path?: string | null;
  /** Optional: ISO string or epoch seconds — used only for ?v= cache-bust. Ignored if userId is provided. */
  updatedAt?: string | number;
  /** Signed URL TTL (seconds). Default: 86400 (24h). */
  ttlSec?: number;
  /** Render prop receives the resolved signed URL (or undefined if none). */
  children: (src?: string) => ReactNode;
};

type ProfilePick = {
  avatar_url: string | null;
  avatar_updated_at: string | null;
};

export default function AvatarImg({
  userId,
  path,
  updatedAt,
  ttlSec = 86400,
  children,
}: Props) {
  const [src, setSrc] = useState<string | undefined>(undefined);

  // Memoized helper to compute and set src from path + version
  const computeFrom = useCallback(
    async (p?: string | null, ver?: string | number | null) => {
      const norm = normalizeAvatarPath(p ?? undefined);
      if (!norm) {
        setSrc(undefined);
        return;
      }
      const url = await getVersionedAvatarSrc(norm, ver ?? undefined, ttlSec);
      setSrc(url);
    },
    [ttlSec]
  );

  // MODE A: userId is provided → fetch once + subscribe to profile updates
  useEffect(() => {
    if (!userId) return;

    let alive = true;

    // initial fetch
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url, avatar_updated_at")
        .eq("id", userId)
        .single();

      if (!alive) return;
      if (error) {
        setSrc(undefined);
        return;
      }
      const row = (data as ProfilePick) ?? null;
      await computeFrom(row?.avatar_url ?? null, row?.avatar_updated_at ?? null);
    })();

    // realtime subscribe
    const unsub = subscribeProfilesAvatar([userId], async (row) => {
      if (!alive) return;
      await computeFrom(row.avatar_url, row.avatar_updated_at);
    });

    return () => {
      alive = false;
      unsub();
    };
  }, [userId, computeFrom]);

  // MODE B: direct path + updatedAt (only when userId is NOT provided)
  useEffect(() => {
    if (userId) return; // handled by MODE A
    let alive = true;

    (async () => {
      await computeFrom(path ?? undefined, updatedAt ?? undefined);
      if (!alive) return;
    })();

    return () => {
      alive = false;
    };
  }, [userId, path, updatedAt, computeFrom]);

  return <>{children(src)}</>;
}
