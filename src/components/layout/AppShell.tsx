"use client";

import { useState } from "react";
import { ConversationStateContext, ConversationActionsContext, useConversationReducer } from "@/hooks/useConversation";
import { DetailPanelStateContext, DetailPanelActionsContext, useDetailPanelReducer } from "@/hooks/useDetailPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LeftSidebar } from "./LeftSidebar";
import { RightDetailPanel } from "./RightDetailPanel";
import { ConversationPanel } from "@/components/conversation/ConversationPanel";
import { FullscreenOverlay } from "./FullscreenOverlay";
import { Menu, X } from "lucide-react";
import { useTaskNotifications } from "@/hooks/useTaskNotifications";

export function AppShell() {
  const conversation = useConversationReducer();
  const detailPanel = useDetailPanelReducer();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useTaskNotifications();

  return (
    <ConversationStateContext.Provider value={conversation.state}>
      <ConversationActionsContext.Provider value={conversation.actions}>
        <DetailPanelStateContext.Provider value={detailPanel.state}>
          <DetailPanelActionsContext.Provider value={detailPanel.actions}>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="fixed top-4 left-4 z-50 p-2 rounded-xl bg-background/90 backdrop-blur border border-border/60 shadow-glass md:hidden"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex h-screen overflow-hidden">
              {/* Sidebar — hidden on mobile unless toggled */}
              <div className={`${mobileMenuOpen ? "fixed inset-0 z-40 flex" : "hidden"} md:relative md:flex`}>
                <ErrorBoundary fallbackMessage="Sidebar failed to load">
                  <LeftSidebar />
                </ErrorBoundary>
                {/* Mobile backdrop */}
                {mobileMenuOpen && (
                  <div className="flex-1 bg-black/30 md:hidden" onClick={() => setMobileMenuOpen(false)} />
                )}
              </div>

              <ErrorBoundary fallbackMessage="Conversation panel failed to load">
                <ConversationPanel />
              </ErrorBoundary>

              <div className="hidden md:block">
                <ErrorBoundary fallbackMessage="Detail panel failed to load">
                  <RightDetailPanel />
                </ErrorBoundary>
              </div>
            </div>
            <FullscreenOverlay />
          </DetailPanelActionsContext.Provider>
        </DetailPanelStateContext.Provider>
      </ConversationActionsContext.Provider>
    </ConversationStateContext.Provider>
  );
}
