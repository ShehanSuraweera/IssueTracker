import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { IssueStatus, PriorityLevel } from "@/types/issues";

export interface TabMeta {
  title: string;
  status: IssueStatus;
  priority: PriorityLevel;
}

export interface AppTab {
  id: string;
  label: string;
  path: string;
  closeable: boolean;
  meta?: TabMeta;
}

interface TabsState {
  tabs: AppTab[];
  activeId: string;
  pinnedId: string | null;
  openTab: (args: { id: string; label: string; path: string; meta?: TabMeta }) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  updateLabel: (id: string, label: string) => void;
  updateMeta: (id: string, meta: TabMeta) => void;
  pinTab: (id: string) => void;
  reset: () => void;
}

const HOME_TAB: AppTab = { id: "home", label: "Home", path: "/", closeable: false };

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [HOME_TAB],
      activeId: "home",
      pinnedId: null,

      openTab({ id, label, path, meta }) {
        const { tabs } = get();
        if (tabs.find((t) => t.id === id)) {
          set({ activeId: id });
        } else {
          set({ tabs: [...tabs, { id, label, path, closeable: true, meta }], activeId: id });
        }
      },

      closeTab(id) {
        const { tabs, activeId, pinnedId } = get();
        const idx = tabs.findIndex((t) => t.id === id);
        if (idx === -1 || !tabs[idx].closeable) return;
        const next = tabs.filter((t) => t.id !== id);
        const newActive = activeId === id ? (next[Math.max(0, idx - 1)]?.id ?? "home") : activeId;
        set({ tabs: next, activeId: newActive, ...(pinnedId === id ? { pinnedId: null } : {}) });
      },

      setActive(id) { set({ activeId: id }); },

      updateLabel(id, label) {
        set(({ tabs }) => ({ tabs: tabs.map((t) => (t.id === id ? { ...t, label } : t)) }));
      },

      updateMeta(id, meta) {
        set(({ tabs }) => ({ tabs: tabs.map((t) => (t.id === id ? { ...t, meta } : t)) }));
      },

      pinTab(id) {
        set(({ pinnedId }) => ({ pinnedId: pinnedId === id ? null : id }));
      },

      reset() {
        set({ tabs: [HOME_TAB], activeId: "home", pinnedId: null });
      },
    }),
    {
      name: "newnopdesk-tabs",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
