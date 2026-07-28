import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTradingStore } from '@/lib/store/trading';

// ── Types ──────────────────────────────────────────────────────────

export interface PriceAlert {
  id: string;
  user_address: string;
  condition_id: string;
  token_id: string;
  outcome: string;
  direction: 'above' | 'below';
  threshold: number;
  is_recurring: boolean;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
}

export interface AlertNotification {
  id: string;
  user_address: string;
  alert_id: string;
  condition_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface CreateAlertParams {
  conditionId: string;
  tokenId: string;
  outcome: string;
  direction: 'above' | 'below';
  threshold: number;
  isRecurring?: boolean;
}

// ── Fetchers ──────────────────────────────────────────────────────

async function fetchAlerts(userAddress: string): Promise<PriceAlert[]> {
  const res = await fetch(`/api/alerts?userAddress=${encodeURIComponent(userAddress)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch alerts: ${res.status}`);
  }
  const data = await res.json();
  return data.alerts || [];
}

async function fetchNotifications(userAddress: string): Promise<{ notifications: AlertNotification[]; unreadCount: number }> {
  const res = await fetch(`/api/alerts/notifications?userAddress=${encodeURIComponent(userAddress)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch notifications: ${res.status}`);
  }
  const data = await res.json();
  return { notifications: data.notifications || [], unreadCount: data.unreadCount || 0 };
}

// ── Hook ───────────────────────────────────────────────────────────

export function usePriceAlerts(userAddress: string | undefined) {
  const queryClient = useQueryClient();

  const setAlertCount = useTradingStore((s) => s.setAlertCount);
  const setUnreadNotifications = useTradingStore((s) => s.setUnreadNotifications);

  const alertsQuery = useQuery({
    queryKey: ['price-alerts', userAddress],
    queryFn: () => fetchAlerts(userAddress!),
    enabled: !!userAddress,
  });

  const alerts = alertsQuery.data ?? [];

  const notificationsQuery = useQuery({
    queryKey: ['alert-notifications', userAddress],
    queryFn: () => fetchNotifications(userAddress!),
    enabled: !!userAddress,
  });

  const notifications = notificationsQuery.data?.notifications ?? [];

  // Sync store counts in useEffect to avoid updating state during render
  useEffect(() => {
    if (alertsQuery.data) {
      setAlertCount(alertsQuery.data.filter((a) => a.is_active).length);
    }
  }, [alertsQuery.data, setAlertCount]);

  useEffect(() => {
    if (notificationsQuery.data) {
      setUnreadNotifications(notificationsQuery.data.unreadCount);
    }
  }, [notificationsQuery.data, setUnreadNotifications]);

  const alertsKey = useMemo(() => ['price-alerts', userAddress] as const, [userAddress]);
  const notificationsKey = useMemo(() => ['alert-notifications', userAddress] as const, [userAddress]);

  const createAlertMutation = useMutation({
    mutationFn: async (params: CreateAlertParams) => {
      if (!userAddress) {
        throw new Error('Wallet not connected');
      }
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          conditionId: params.conditionId,
          tokenId: params.tokenId,
          outcome: params.outcome,
          direction: params.direction,
          threshold: params.threshold,
          isRecurring: params.isRecurring ?? false,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create alert');
      }
      return params;
    },
    onSuccess: (params) => {
      toast.success(`Alert created: ${params.direction} ${params.threshold}c`);
      queryClient.invalidateQueries({ queryKey: alertsKey });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      console.error('[usePriceAlerts] createAlert error:', err);
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/alerts?alertId=${encodeURIComponent(alertId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete alert');
      }
    },
    onSuccess: () => {
      toast.success('Alert deleted');
      queryClient.invalidateQueries({ queryKey: alertsKey });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      console.error('[usePriceAlerts] deleteAlert error:', err);
    },
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async ({ alertId, isActive }: { alertId: string; isActive: boolean }) => {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update alert');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertsKey });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      console.error('[usePriceAlerts] toggleAlert error:', err);
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch('/api/alerts/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to mark as read');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsKey });
    },
    onError: (err: Error) => {
      console.error('[usePriceAlerts] markAsRead error:', err);
    },
  });

  const loading = alertsQuery.isLoading || notificationsQuery.isLoading || createAlertMutation.isPending;

  const createAlert = useCallback(
    (params: CreateAlertParams) => createAlertMutation.mutateAsync(params).catch(() => {}),
    [createAlertMutation],
  );

  const deleteAlert = useCallback(
    (alertId: string) => deleteAlertMutation.mutateAsync(alertId).catch(() => {}),
    [deleteAlertMutation],
  );

  const toggleAlert = useCallback(
    (alertId: string, isActive: boolean) => toggleAlertMutation.mutateAsync({ alertId, isActive }).catch(() => {}),
    [toggleAlertMutation],
  );

  const markAsRead = useCallback(
    (notificationId: string) => markAsReadMutation.mutateAsync(notificationId).catch(() => {}),
    [markAsReadMutation],
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: alertsKey }),
      queryClient.invalidateQueries({ queryKey: notificationsKey }),
    ]);
  }, [queryClient, alertsKey, notificationsKey]);

  return {
    alerts,
    notifications,
    loading,
    createAlert,
    deleteAlert,
    toggleAlert,
    markAsRead,
    refresh,
  };
}
