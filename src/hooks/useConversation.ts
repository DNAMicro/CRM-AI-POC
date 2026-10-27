"use client";

import { createContext, useContext, useReducer, useCallback, useRef } from "react";
import type { Message, CRMContext, FileAttachment } from "@/types/conversation";
import { sendChatMessage, fetchStats, buildGreetingFromStats } from "@/lib/api-client";

interface ConversationState {
  messages: Message[];
  isTyping: boolean;
  context: CRMContext;
  conversationId: string | null;
  conversations: { id: string; title: string; updatedAt: string }[];
}

type ConversationAction =
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "SET_TYPING"; isTyping: boolean }
  | { type: "SET_CONTEXT"; context: Partial<CRMContext> }
  | { type: "INIT_GREETING"; message: Message; conversationId: string }
  | { type: "LOAD_CONVERSATION"; messages: Message[]; conversationId: string }
  | { type: "SET_CONVERSATIONS"; conversations: { id: string; title: string; updatedAt: string }[] };

function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "SET_TYPING":
      return { ...state, isTyping: action.isTyping };
    case "SET_CONTEXT":
      return { ...state, context: { ...state.context, ...action.context } };
    case "INIT_GREETING":
      return { ...state, messages: [action.message], conversationId: action.conversationId };
    case "LOAD_CONVERSATION":
      return { ...state, messages: action.messages, conversationId: action.conversationId };
    case "SET_CONVERSATIONS":
      return { ...state, conversations: action.conversations };
    default:
      return state;
  }
}

const initialState: ConversationState = {
  messages: [],
  isTyping: false,
  context: {},
  conversationId: null,
  conversations: [],
};

export interface ConversationActions {
  sendMessage: (text: string, attachments?: FileAttachment[]) => void;
  triggerIntent: (intent: string, params?: Record<string, string | undefined>) => void;
  initGreeting: () => Promise<void>;
  newConversation: () => void;
  loadConversation: (id: string) => void;
  refreshConversations: () => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
}

export const ConversationStateContext = createContext<ConversationState>(initialState);
export const ConversationActionsContext = createContext<ConversationActions>({
  sendMessage: () => {},
  triggerIntent: () => {},
  initGreeting: async () => {},
  newConversation: () => {},
  loadConversation: () => {},
  refreshConversations: () => {},
  renameConversation: () => {},
  deleteConversation: () => {},
});

export function useConversationState() {
  return useContext(ConversationStateContext);
}

export function useConversationActions() {
  return useContext(ConversationActionsContext);
}

const INTENT_PROMPTS: Record<string, (params?: Record<string, string | undefined>) => string> = {
  "show-pipeline": () => "Show me the deal pipeline",
  "pipeline-kanban": () => "Show me the pipeline board",
  "show-contacts": () => "Show me all contacts",
  "follow-ups": () => "Which contacts need follow-up?",
  "recent-activity": () => "Show recent activity",
  "deals-closing-soon": () => "Show deals closing this month",
  "high-priority-deals": () => "Show high priority deals",
  "deal-detail": (p) => `Show me details for deal ${p?.dealId || ""}`,
  "contact-detail": (p) => `Show me details for contact ${p?.contactId || ""}`,
  "log-call": (p) => `I want to log a call${p?.dealId ? ` for deal ${p.dealId}` : ""}${p?.contactId ? ` with contact ${p.contactId}` : ""}`,
  "send-email": (p) => `Draft a follow-up email${p?.contactId ? ` for contact ${p.contactId}` : ""}`,
  "update-stage": (p) => `I want to update the stage${p?.dealId ? ` for deal ${p.dealId}` : ""}`,
  "dashboard": () => "Show me the dashboard overview",
  "show-inbox": () => "Show my email inbox",
  "compose-email": (p) => p?.contactId ? `Compose an email to contact ${p.contactId}` : "I want to compose an email",
  "view-email-thread": (p) => `Show the email thread ${p?.threadId || ""}`,
  "forward-email": (p) => `Forward email ${p?.emailId || ""}`,
  "sms-history": (p) => p?.contactId ? `Show SMS history with contact ${p.contactId}` : "Show my recent SMS messages",
  "send-sms": (p) => p?.contactId ? `Send an SMS to contact ${p.contactId}` : "I want to send an SMS",
  "open-settings": () => "Show my integration settings",
  "show-tasks": () => "Show my tasks — what's overdue and due today?",
  "add-task": () => "I want to add a new task",
  "morning-briefing": () => "Give me my morning briefing",
  "complete-task": (p) => `Mark task ${p?.taskId || ""} as completed`,
};

/** Persist a message to the conversation in the database (fire-and-forget) */
function persistMessage(conversationId: string, message: Message) {
  fetch(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  }).catch(() => {});
}

export function useConversationReducer() {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;
  const conversationIdRef = useRef(state.conversationId);
  conversationIdRef.current = state.conversationId;

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      dispatch({ type: "SET_CONVERSATIONS", conversations: data });
    } catch {
      // silently fail
    }
  }, []);

  const renameConversation = useCallback(async (id: string, title: string) => {
    await fetch(`/api/conversations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    refreshConversations();
  }, [refreshConversations]);

  const generateConversationTitle = useCallback(async (convId: string, userMessage: string) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Generate a short conversation title (3-5 words, no quotes) for this message: "${userMessage}"`,
          history: [],
        }),
      });
      // Error responses carry a user-facing apology, not a title
      if (!res.ok) return;
      const data = await res.json();
      const title = (data.content || "").replace(/["']/g, "").replace(/```[\s\S]*```/g, "").trim().slice(0, 50);
      if (title && title.length > 2) {
        await fetch(`/api/conversations/${convId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        refreshConversations();
      }
    } catch {
      // Silently fail
    }
  }, [refreshConversations]);

  const callLLM = useCallback(async (userText: string, attachments?: FileAttachment[]) => {
    dispatch({ type: "SET_TYPING", isTyping: true });

    try {
      // Note which tools backed each earlier answer; without this the model
      // sees unsourced facts in its own history and "corrects" them as invented
      const history = messagesRef.current.slice(-20).map((m) => {
        const tools = m.role === "assistant" ? m.debugToolCalls ?? [] : [];
        const note = tools.length
          ? `\n\n[Data retrieved via tools: ${tools.map((t) => `${t.name}(${JSON.stringify(t.arguments)})`).join(", ")}]`
          : "";
        return { role: m.role as "user" | "assistant", content: m.content + note };
      });

      const response = await sendChatMessage(userText, history, attachments);

      const assistantMessage: Message = {
        id: `asst-${Date.now()}`,
        role: "assistant",
        content: response.content,
        richBlocks: response.richBlocks,
        suggestedChips: response.suggestedChips,
        debugToolCalls: response.debugToolCalls,
        timestamp: new Date().toISOString(),
      };

      dispatch({ type: "ADD_MESSAGE", message: assistantMessage });
      if (conversationIdRef.current) {
        persistMessage(conversationIdRef.current, assistantMessage);
      }
      // Auto-title: after first user+assistant exchange
      const currentMessages = messagesRef.current;
      if (currentMessages.length <= 3 && conversationIdRef.current) {
        const firstUserMsg = currentMessages.find(m => m.role === "user");
        if (firstUserMsg) {
          generateConversationTitle(conversationIdRef.current, firstUserMsg.content);
        }
      }
    } catch {
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Sorry, I encountered an error connecting to the AI service. Please try again.",
        suggestedChips: [
          { label: "Show pipeline", intent: "show-pipeline" },
          { label: "Show contacts", intent: "show-contacts" },
        ],
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: "ADD_MESSAGE", message: errorMessage });
      if (conversationIdRef.current) {
        persistMessage(conversationIdRef.current, errorMessage);
      }
    } finally {
      dispatch({ type: "SET_TYPING", isTyping: false });
    }
  }, [generateConversationTitle]);

  const sendMessage = useCallback(
    (text: string, attachments?: FileAttachment[]) => {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        attachments,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: "ADD_MESSAGE", message: userMessage });
      if (conversationIdRef.current) {
        persistMessage(conversationIdRef.current, userMessage);
      }
      callLLM(text, attachments);
    },
    [callLLM]
  );

  const triggerIntent = useCallback(
    (intent: string, params?: Record<string, string | undefined>) => {
      const promptBuilder = INTENT_PROMPTS[intent];
      const message = promptBuilder ? promptBuilder(params) : (params?.__chipLabel || intent.replace(/-/g, " "));
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: "ADD_MESSAGE", message: userMessage });
      if (conversationIdRef.current) {
        persistMessage(conversationIdRef.current, userMessage);
      }
      callLLM(message);
    },
    [callLLM]
  );

  const startNewConversationWithGreeting = useCallback(async (conversationId: string) => {
    try {
      const stats = await fetchStats();
      const greeting = buildGreetingFromStats(stats);
      const greetingMessage: Message = {
        id: `greeting-${Date.now()}`,
        role: "assistant",
        ...greeting,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: "INIT_GREETING", message: greetingMessage, conversationId });
      persistMessage(conversationId, greetingMessage);
    } catch {
      const fallback: Message = {
        id: `greeting-${Date.now()}`,
        role: "assistant",
        content: "Good morning. How can I help you with your CRM today?",
        suggestedChips: [
          { label: "Show pipeline", intent: "show-pipeline" },
          { label: "Show contacts", intent: "show-contacts" },
          { label: "Recent activity", intent: "recent-activity" },
        ],
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: "INIT_GREETING", message: fallback, conversationId });
      persistMessage(conversationId, fallback);
    }
  }, []);

  const initGreeting = useCallback(async () => {
    // Try to load the most recent conversation
    try {
      const res = await fetch("/api/conversations");
      const conversations = await res.json();
      dispatch({ type: "SET_CONVERSATIONS", conversations });

      if (conversations.length > 0) {
        // Load the most recent conversation
        const latest = conversations[0];
        const convRes = await fetch(`/api/conversations/${latest.id}`);
        const { messages: rawMessages } = await convRes.json();

        if (rawMessages && rawMessages.length > 0) {
          const messages: Message[] = rawMessages.map((m: Record<string, unknown>) => ({
            id: m.id as string,
            role: m.role as "user" | "assistant",
            content: m.content as string,
            richBlocks: JSON.parse(m.richBlocks as string || "[]"),
            suggestedChips: JSON.parse(m.suggestedChips as string || "[]"),
            attachments: JSON.parse(m.attachments as string || "[]"),
            debugToolCalls: JSON.parse(m.debugToolCalls as string || "[]"),
            timestamp: m.timestamp as string,
          }));
          dispatch({ type: "LOAD_CONVERSATION", messages, conversationId: latest.id });
          return;
        }
      }
    } catch {
      // Fall through to create new conversation
    }

    // No existing conversations — create one and show greeting
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const conv = await res.json();
      await startNewConversationWithGreeting(conv.id);
      refreshConversations();
    } catch {
      // Last resort: no persistence, just show greeting
      dispatch({
        type: "INIT_GREETING",
        message: {
          id: `greeting-${Date.now()}`,
          role: "assistant",
          content: "Good morning. How can I help you with your CRM today?",
          suggestedChips: [
            { label: "Show pipeline", intent: "show-pipeline" },
            { label: "Show contacts", intent: "show-contacts" },
            { label: "Recent activity", intent: "recent-activity" },
          ],
          timestamp: new Date().toISOString(),
        },
        conversationId: "",
      });
    }
  }, [startNewConversationWithGreeting, refreshConversations]);

  const newConversation = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const conv = await res.json();
      await startNewConversationWithGreeting(conv.id);
      refreshConversations();
    } catch {
      // Fallback: just clear messages locally
      dispatch({
        type: "INIT_GREETING",
        message: {
          id: `greeting-${Date.now()}`,
          role: "assistant",
          content: "Good morning. How can I help you with your CRM today?",
          suggestedChips: [
            { label: "Show pipeline", intent: "show-pipeline" },
            { label: "Show contacts", intent: "show-contacts" },
          ],
          timestamp: new Date().toISOString(),
        },
        conversationId: "",
      });
    }
  }, [startNewConversationWithGreeting, refreshConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      // Refresh list first to get remaining conversations
      const res = await fetch("/api/conversations");
      const remaining = await res.json();
      dispatch({ type: "SET_CONVERSATIONS", conversations: remaining });

      if (conversationIdRef.current === id) {
        if (remaining.length > 0) {
          // Switch to the most recent remaining conversation
          const latest = remaining[0];
          const convRes = await fetch(`/api/conversations/${latest.id}`);
          const { messages: rawMessages } = await convRes.json();
          const messages = (rawMessages || []).map((m: Record<string, unknown>) => ({
            id: m.id as string,
            role: m.role as "user" | "assistant",
            content: m.content as string,
            richBlocks: JSON.parse(m.richBlocks as string || "[]"),
            suggestedChips: JSON.parse(m.suggestedChips as string || "[]"),
            attachments: JSON.parse(m.attachments as string || "[]"),
            debugToolCalls: JSON.parse(m.debugToolCalls as string || "[]"),
            timestamp: m.timestamp as string,
          }));
          dispatch({ type: "LOAD_CONVERSATION", messages, conversationId: latest.id });
        } else {
          // No conversations left — create a new one
          await newConversation();
        }
      }
    } catch {
      // silently fail
    }
  }, [newConversation]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const { messages: rawMessages } = await res.json();
      const messages: Message[] = (rawMessages || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        role: m.role as "user" | "assistant",
        content: m.content as string,
        richBlocks: JSON.parse(m.richBlocks as string || "[]"),
        suggestedChips: JSON.parse(m.suggestedChips as string || "[]"),
        attachments: JSON.parse(m.attachments as string || "[]"),
        debugToolCalls: JSON.parse(m.debugToolCalls as string || "[]"),
        timestamp: m.timestamp as string,
      }));
      dispatch({ type: "LOAD_CONVERSATION", messages, conversationId: id });
    } catch {
      // silently fail
    }
  }, []);

  return {
    state,
    dispatch,
    actions: { sendMessage, triggerIntent, initGreeting, newConversation, loadConversation, refreshConversations, renameConversation, deleteConversation },
  };
}
