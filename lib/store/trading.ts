import { create } from 'zustand';

interface TradingState {
  // Shared counters across advanced features
  openOrderCount: number;
  alertCount: number;
  unreadNotifications: number;
  activeComparisonIds: string[];

  // Actions
  setOpenOrderCount: (count: number) => void;
  setAlertCount: (count: number) => void;
  setUnreadNotifications: (count: number) => void;
  incrementUnreadNotifications: () => void;
  markNotificationsRead: () => void;
  setActiveComparisonIds: (ids: string[]) => void;
  addComparisonId: (id: string) => void;
  removeComparisonId: (id: string) => void;
}

export const useTradingStore = create<TradingState>((set) => ({
  openOrderCount: 0,
  alertCount: 0,
  unreadNotifications: 0,
  activeComparisonIds: [],

  setOpenOrderCount: (count) => set({ openOrderCount: count }),
  setAlertCount: (count) => set({ alertCount: count }),
  setUnreadNotifications: (count) => set({ unreadNotifications: count }),
  incrementUnreadNotifications: () =>
    set((state) => ({ unreadNotifications: state.unreadNotifications + 1 })),
  markNotificationsRead: () => set({ unreadNotifications: 0 }),
  setActiveComparisonIds: (ids) => set({ activeComparisonIds: ids }),
  addComparisonId: (id) =>
    set((state) => ({
      activeComparisonIds: state.activeComparisonIds.includes(id)
        ? state.activeComparisonIds
        : [...state.activeComparisonIds, id].slice(0, 4),
    })),
  removeComparisonId: (id) =>
    set((state) => ({
      activeComparisonIds: state.activeComparisonIds.filter((i) => i !== id),
    })),
}));
