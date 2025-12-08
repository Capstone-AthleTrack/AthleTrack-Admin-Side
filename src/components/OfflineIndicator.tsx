// src/components/OfflineIndicator.tsx
// Visual indicators for offline status and pending sync operations

import { useEffect, useState } from 'react';
import { Badge, Button, Tooltip, message, Progress } from 'antd';
import {
  WifiOutlined,
  CloudSyncOutlined,
  CloudOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { BRAND } from '@/brand';

// ---- Offline Banner ----
// Shows a persistent banner when the user is offline

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);

  // Delay showing to avoid flash on quick reconnects
  useEffect(() => {
    if (!isOnline) {
      const timer = setTimeout(() => setShow(true), 500);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
      setDismissed(false);
    }
  }, [isOnline]);

  if (isOnline || dismissed || !show) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-3 px-4 py-2 text-white text-sm font-medium shadow-lg animate-slideDown"
      style={{ background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)' }}
    >
      <CloudOutlined className="text-lg" />
      <span>You're offline — Changes will sync when you reconnect</span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition text-xs"
      >
        Dismiss
      </button>
    </div>
  );
}

// ---- Sync Status Badge ----
// Shows pending sync count and allows manual sync

interface SyncBadgeProps {
  className?: string;
  showLabel?: boolean;
}

export function SyncBadge({ className, showLabel = false }: SyncBadgeProps) {
  const { isOnline, pendingSync, syncNow, isSyncing } = useNetworkStatus();

  const handleSync = async () => {
    if (!isOnline) {
      message.warning('Cannot sync while offline');
      return;
    }
    if (pendingSync === 0) {
      message.info('Nothing to sync');
      return;
    }

    try {
      await syncNow();
      message.success('Sync complete!');
    } catch {
      message.error('Sync failed. Will retry automatically.');
    }
  };

  // Online with no pending - show green check
  if (isOnline && pendingSync === 0) {
    return (
      <Tooltip title="All changes synced">
        <span className={`flex items-center gap-1.5 text-green-600 ${className}`}>
          <CheckCircleOutlined />
          {showLabel && <span className="text-xs">Synced</span>}
        </span>
      </Tooltip>
    );
  }

  // Online with pending - show sync button
  if (isOnline && pendingSync > 0) {
    return (
      <Tooltip title={`${pendingSync} change${pendingSync > 1 ? 's' : ''} pending - Click to sync`}>
        <Badge count={pendingSync} size="small" offset={[-2, 2]}>
          <Button
            type="text"
            size="small"
            icon={<SyncOutlined spin={isSyncing} />}
            onClick={handleSync}
            loading={isSyncing}
            className={className}
            style={{ color: BRAND.maroon }}
          >
            {showLabel && <span className="text-xs ml-1">Sync</span>}
          </Button>
        </Badge>
      </Tooltip>
    );
  }

  // Offline with pending - show warning
  if (!isOnline && pendingSync > 0) {
    return (
      <Tooltip title={`${pendingSync} change${pendingSync > 1 ? 's' : ''} will sync when online`}>
        <Badge count={pendingSync} size="small" offset={[-2, 2]}>
          <span className={`flex items-center gap-1.5 text-amber-600 ${className}`}>
            <CloudSyncOutlined />
            {showLabel && <span className="text-xs">Pending</span>}
          </span>
        </Badge>
      </Tooltip>
    );
  }

  // Offline with nothing pending
  return (
    <Tooltip title="You're offline">
      <span className={`flex items-center gap-1.5 text-gray-400 ${className}`}>
        <WifiOutlined />
        {showLabel && <span className="text-xs">Offline</span>}
      </span>
    </Tooltip>
  );
}

// ---- Connection Status Icon ----
// Simple icon showing online/offline status

export function ConnectionIcon({ className }: { className?: string }) {
  const { isOnline } = useNetworkStatus();

  return (
    <Tooltip title={isOnline ? 'Connected' : 'Offline'}>
      <WifiOutlined
        className={className}
        style={{ color: isOnline ? '#10b981' : '#9ca3af' }}
      />
    </Tooltip>
  );
}

// ---- Sync Progress Indicator ----
// Shows progress during sync operations

interface SyncProgressProps {
  visible: boolean;
  current: number;
  total: number;
  currentTask?: string;
}

export function SyncProgress({ visible, current, total, currentTask }: SyncProgressProps) {
  if (!visible || total === 0) return null;

  const percent = Math.round((current / total) * 100);

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-xl p-4 min-w-[280px] z-[9998] border">
      <div className="flex items-center gap-2 mb-2">
        <SyncOutlined spin className="text-blue-500" />
        <span className="font-medium text-sm">Syncing...</span>
      </div>
      <Progress percent={percent} size="small" status="active" />
      {currentTask && (
        <div className="text-xs text-gray-500 mt-1 truncate">{currentTask}</div>
      )}
    </div>
  );
}

// ---- Reconnection Toast ----
// Hook to show toast when connection is restored

export function useReconnectionToast() {
  const { isOnline, pendingSync } = useNetworkStatus();
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setWasOffline(false);
      if (pendingSync > 0) {
        message.info({
          content: `Back online! Syncing ${pendingSync} pending change${pendingSync > 1 ? 's' : ''}...`,
          icon: <CloudSyncOutlined style={{ color: '#3b82f6' }} />,
          duration: 3,
        });
      } else {
        message.success({
          content: 'Back online!',
          icon: <WifiOutlined style={{ color: '#10b981' }} />,
          duration: 2,
        });
      }
    }
  }, [isOnline, wasOffline, pendingSync]);
}

// ---- Offline-Aware Wrapper ----
// Wraps content and shows overlay when offline (optional harsh mode)

interface OfflineAwareProps {
  children: React.ReactNode;
  blockWhenOffline?: boolean;
  offlineMessage?: string;
}

export function OfflineAware({
  children,
  blockWhenOffline = false,
  offlineMessage = 'This feature requires an internet connection',
}: OfflineAwareProps) {
  const { isOnline } = useNetworkStatus();

  if (!isOnline && blockWhenOffline) {
    return (
      <div className="relative">
        <div className="opacity-50 pointer-events-none">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
          <div className="text-center p-4">
            <WarningOutlined className="text-4xl text-amber-500 mb-2" />
            <p className="text-gray-600">{offlineMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ---- CSS Animation (add to global styles or use Tailwind) ----
// The slideDown animation for the banner

export const offlineIndicatorStyles = `
  @keyframes slideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  .animate-slideDown {
    animation: slideDown 0.3s ease-out;
  }
`;


