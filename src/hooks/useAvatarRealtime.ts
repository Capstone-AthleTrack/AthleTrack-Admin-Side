// src/hooks/useAvatarRealtime.ts
import { supabase } from "@/core/supabase";

/** Minimal fields we care about from public.profiles */
type ProfileAvatarFields = {
  id: string;
  avatar_url: string | null;
  avatar_updated_at: string | null;
};

/** Narrow payload type for UPDATE events */
type UpdatePayload<T> = {
  schema: string;
  table: string;
  commit_timestamp: string;
  eventType: "UPDATE";
  old: T | null;
  new: T | null;
};

/** Shape we need from RealtimeChannel (avoids broken overloads) */
type LooseChannel = {
  on: (
    event: string,
    config: unknown,
    cb: (payload: UpdatePayload<ProfileAvatarFields>) => void
  ) => LooseChannel;
  subscribe: () => LooseChannel;
};

export function subscribeProfilesAvatar(
  userIds: string[],
  onChange: (row: ProfileAvatarFields) => void
): () => void {
  if (!userIds?.length) return () => {};

  const inList = userIds.join(",");
  let isUnsubscribed = false;

  // Create the channel once with official client type…
  const channel = supabase.channel(`profiles-avatars:${inList}`);
  // …then use a "loose" typed view of it to call .on('postgres_changes', …)
  const loose = channel as unknown as LooseChannel;

  loose.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "profiles",
      filter: `id=in.(${inList})`,
    },
    (payload) => {
      if (isUnsubscribed) return;
      
      const oldRow = payload.old;
      const newRow = payload.new;
      if (!newRow) return;

      const oldUrl = oldRow?.avatar_url ?? null;
      const newUrl = newRow.avatar_url ?? null;
      const oldVer = oldRow?.avatar_updated_at ?? null;
      const newVer = newRow.avatar_updated_at ?? null;

      if (oldUrl !== newUrl || oldVer !== newVer) {
        onChange({
          id: newRow.id,
          avatar_url: newUrl,
          avatar_updated_at: newVer,
        });
      }
    }
  ).subscribe();

  return () => {
    isUnsubscribed = true;
    // Use setTimeout to allow the connection to settle before removing
    setTimeout(() => {
      supabase.removeChannel(channel).catch(() => {
        // Silently ignore removal errors (channel may already be closed)
      });
    }, 0);
  };
}
