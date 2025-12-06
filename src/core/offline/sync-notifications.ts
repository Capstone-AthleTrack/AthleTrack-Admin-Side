// src/core/offline/sync-notifications.ts
// Toast notifications for sync events

type NotificationCallback = (event: SyncNotification) => void;

export interface SyncNotification {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  description?: string;
  action?: string;
}

const listeners = new Set<NotificationCallback>();

/**
 * Subscribe to sync notifications
 */
export function onSyncNotification(callback: NotificationCallback): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Emit a sync notification
 */
export function notifySyncEvent(notification: SyncNotification): void {
  listeners.forEach((fn) => fn(notification));
}

/**
 * Predefined notification helpers
 */
export const SyncNotifications = {
  syncStarted: (count: number) =>
    notifySyncEvent({
      type: 'info',
      message: 'Syncing changes...',
      description: `${count} operation${count > 1 ? 's' : ''} in queue`,
    }),

  syncCompleted: (success: number, failed: number) => {
    if (failed === 0) {
      notifySyncEvent({
        type: 'success',
        message: 'Sync complete!',
        description: `${success} change${success > 1 ? 's' : ''} synced successfully`,
      });
    } else {
      notifySyncEvent({
        type: 'warning',
        message: 'Sync partially complete',
        description: `${success} succeeded, ${failed} failed`,
      });
    }
  },

  syncFailed: (action: string, error: string) =>
    notifySyncEvent({
      type: 'error',
      message: 'Sync failed',
      description: error,
      action,
    }),

  operationQueued: (action: string) =>
    notifySyncEvent({
      type: 'info',
      message: 'Saved offline',
      description: `${action} will sync when you're back online`,
    }),

  connectionRestored: () =>
    notifySyncEvent({
      type: 'success',
      message: 'Back online!',
      description: 'Syncing pending changes...',
    }),

  connectionLost: () =>
    notifySyncEvent({
      type: 'warning',
      message: 'Connection lost',
      description: 'Changes will be saved locally',
    }),
};

