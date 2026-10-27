"use client";

import { createContext, useContext, useReducer, useCallback } from "react";
import type { RichBlock, PinnedItem } from "@/types/conversation";

interface DetailPanelState {
  isOpen: boolean;
  entityType: "contact" | "deal" | null;
  entityId: string | null;
  pinnedItems: PinnedItem[];
  sidebarWidth: number;
  sidebarVisible: boolean;
  fullscreenBlock: RichBlock | null;
}

type DetailPanelAction =
  | { type: "OPEN"; entityType: "contact" | "deal"; entityId: string }
  | { type: "CLOSE" }
  | { type: "PIN_BLOCK"; block: RichBlock }
  | { type: "UNPIN_BLOCK"; id: string }
  | { type: "SET_SIDEBAR_WIDTH"; width: number }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SHOW_SIDEBAR" }
  | { type: "EXPAND_BLOCK"; block: RichBlock }
  | { type: "CLOSE_FULLSCREEN" };

function detailPanelReducer(state: DetailPanelState, action: DetailPanelAction): DetailPanelState {
  switch (action.type) {
    case "OPEN":
      return { ...state, isOpen: true, entityType: action.entityType, entityId: action.entityId };
    case "CLOSE":
      return { ...state, isOpen: false, entityType: null, entityId: null };
    case "PIN_BLOCK": {
      const item: PinnedItem = {
        id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        block: action.block,
        pinnedAt: new Date().toISOString(),
      };
      return { ...state, pinnedItems: [item, ...state.pinnedItems], sidebarVisible: true };
    }
    case "UNPIN_BLOCK":
      return { ...state, pinnedItems: state.pinnedItems.filter((p) => p.id !== action.id) };
    case "SET_SIDEBAR_WIDTH":
      return { ...state, sidebarWidth: Math.max(300, Math.min(700, action.width)) };
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarVisible: !state.sidebarVisible };
    case "SHOW_SIDEBAR":
      return { ...state, sidebarVisible: true };
    case "EXPAND_BLOCK":
      return { ...state, fullscreenBlock: action.block };
    case "CLOSE_FULLSCREEN":
      return { ...state, fullscreenBlock: null };
    default:
      return state;
  }
}

const initialState: DetailPanelState = {
  isOpen: false,
  entityType: null,
  entityId: null,
  pinnedItems: [],
  sidebarWidth: 400,
  sidebarVisible: false,
  fullscreenBlock: null,
};

export interface DetailPanelActions {
  openPanel: (entityType: "contact" | "deal", entityId: string) => void;
  closePanel: () => void;
  pinBlock: (block: RichBlock) => void;
  unpinBlock: (id: string) => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  expandBlock: (block: RichBlock) => void;
  closeFullscreen: () => void;
}

export const DetailPanelStateContext = createContext<DetailPanelState>(initialState);
export const DetailPanelActionsContext = createContext<DetailPanelActions>({
  openPanel: () => {},
  closePanel: () => {},
  pinBlock: () => {},
  unpinBlock: () => {},
  setSidebarWidth: () => {},
  toggleSidebar: () => {},
  expandBlock: () => {},
  closeFullscreen: () => {},
});

export function useDetailPanelState() {
  return useContext(DetailPanelStateContext);
}

export function useDetailPanelActions() {
  return useContext(DetailPanelActionsContext);
}

export function useDetailPanelReducer() {
  const [state, dispatch] = useReducer(detailPanelReducer, initialState);

  const openPanel = useCallback((entityType: "contact" | "deal", entityId: string) => {
    dispatch({ type: "OPEN", entityType, entityId });
  }, []);

  const closePanel = useCallback(() => {
    dispatch({ type: "CLOSE" });
  }, []);

  const pinBlock = useCallback((block: RichBlock) => {
    dispatch({ type: "PIN_BLOCK", block });
  }, []);

  const unpinBlock = useCallback((id: string) => {
    dispatch({ type: "UNPIN_BLOCK", id });
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    dispatch({ type: "SET_SIDEBAR_WIDTH", width });
  }, []);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: "TOGGLE_SIDEBAR" });
  }, []);

  const expandBlock = useCallback((block: RichBlock) => {
    dispatch({ type: "EXPAND_BLOCK", block });
  }, []);

  const closeFullscreen = useCallback(() => {
    dispatch({ type: "CLOSE_FULLSCREEN" });
  }, []);

  return {
    state,
    actions: { openPanel, closePanel, pinBlock, unpinBlock, setSidebarWidth, toggleSidebar, expandBlock, closeFullscreen },
  };
}
