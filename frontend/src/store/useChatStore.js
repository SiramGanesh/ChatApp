import { create } from "zustand";
import { persist } from "zustand/middleware";

import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import toast from "react-hot-toast";

// Generates a unique id for an optimistic outgoing message. Used to match the
// placeholder in local state against the authoritative server response.
function newClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const useChatStore = create(
  persist(
    (set, get) => ({
      users: [],
      conversations: [],
      messages: [],
      selectedUser: null,
      isConversationsLoading: false,
      isUsersLoading: false,
      isMessagesLoading: false,
      activeConversationId: null,
      searchQuery: "",
      sidebarTab: "chats",
      composerText: "",
      isSoundEnabled: true,
      isSendingMedia: false,

      getUsers: async () => {
        set({ isUsersLoading: true });
        try {
          const res = await axiosInstance.get("/messages/users");
          set((state) => ({
            users: res.data,
            selectedUser:
              state.selectedUser && res.data.some((user) => user._id === state.selectedUser._id)
                ? state.selectedUser
                : null,
          }));
        } catch (error) {
          console.log("Error in get Users", error.message);
        } finally {
          set({ isUsersLoading: false });
        }
      },

      getConversations: async () => {
        set({ isConversationsLoading: true });
        try {
          const res = await axiosInstance.get("/messages/conversations");
          set({ conversations: res.data });
        } catch (error) {
          console.log("Error in getConversations", error.message);
        } finally {
          set({ isConversationsLoading: false });
        }
      },

      getMessages: async (userId) => {
        if (!userId) return;
        set({ isMessagesLoading: true });
        try {
          const res = await axiosInstance.get(`/messages/${userId}`);
          set({ messages: res.data });
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to load messages");
        } finally {
          set({ isMessagesLoading: false });
        }
      },

      // Text only: optimistic insert with a clientId so the bubble appears
      // instantly. The HTTP response (or the sender's socket echo) reconciles
      // the placeholder by clientId.
      sendTextMessage: async (conversationId) => {
        const { selectedUser, messages, composerText } = get();
        const messageText = composerText.trim();
        if (!conversationId || !messageText || !selectedUser) return false;

        const clientId = newClientId();
        const authUser = useAuthStore.getState().authUser;
        const optimistic = {
          _id: clientId,
          clientId,
          senderId: authUser?._id,
          receiverId: selectedUser._id,
          text: messageText,
          image: undefined,
          video: undefined,
          createdAt: new Date().toISOString(),
          pending: true,
        };

        set({ messages: [...messages, optimistic] });

        try {
          const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, {
            text: messageText,
            clientId,
          });
          set((state) => ({
            messages: state.messages.map((m) => (m.clientId === clientId ? res.data : m)),
            composerText: "",
          }));
          get().getConversations();
          return true;
        } catch (error) {
          set((state) => ({
            messages: state.messages.filter((m) => m.clientId !== clientId),
            // Restore the draft so the user can retry.
            composerText: messageText,
          }));
          toast.error(error.response?.data?.message || "Failed to send message");
          return false;
        }
      },

      // Media: do NOT optimistic-insert. The user only sees the bubble after
      // the upload finishes (the composer shows an "Uploading media…" loader
      // while it runs). Append the server response directly. The server
      // echoes to the sender's own socket as a safety net (idempotent via
      // _id dedupe in subscribeToMessages).
      sendMediaMessage: async ({ conversationId, file }) => {
        if (!conversationId || !file) return false;
        const { selectedUser } = get();
        if (!selectedUser) return false;

        const formData = new FormData();
        formData.append("media", file);

        set({ isSendingMedia: true });
        try {
          const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, formData);
          set((state) => {
            const existsById = state.messages.some(
              (m) => m._id && m._id === res.data._id,
            );
            if (existsById) return state;
            return { messages: [...state.messages, res.data] };
          });
          get().getConversations();
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to send message");
          return false;
        } finally {
          set({ isSendingMedia: false });
        }
      },

      subscribeToMessages: (userId) => {
        if (!userId) return;

        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newMessage");
        socket.on("newMessage", (newMessage) => {
          // Only react to messages on this thread. (senderId, receiverId) must
          // match the active conversation in either direction.
          const isForThisThread =
            (String(newMessage.senderId) === String(userId) &&
              String(newMessage.receiverId) === String(useAuthStore.getState().authUser?._id)) ||
            (String(newMessage.receiverId) === String(userId) &&
              String(newMessage.senderId) === String(useAuthStore.getState().authUser?._id));
          if (!isForThisThread) return;

          set((state) => {
            // 1. If the optimistic placeholder for this clientId is still in the
            //    list, replace it in place (this is what the sender's own tab
            //    sees when the socket echo arrives).
            if (newMessage.clientId) {
              const hasOptimistic = state.messages.some(
                (m) => m.clientId === newMessage.clientId,
              );
              if (hasOptimistic) {
                return {
                  messages: state.messages.map((m) =>
                    m.clientId === newMessage.clientId ? newMessage : m,
                  ),
                };
              }
            }
            // 2. Otherwise, dedupe by _id (e.g. a new receiver) and append.
            const existsById = state.messages.some(
              (m) => m._id && m._id === newMessage._id,
            );
            if (existsById) return state;
            return { messages: [...state.messages, newMessage] };
          });

          // Refresh the conversation list only when the incoming message isn't
          // our own (our own message already triggered a getConversations
          // refresh in sendMessage; calling it again is harmless but redundant).
          if (String(newMessage.senderId) !== String(useAuthStore.getState().authUser?._id)) {
            get().getConversations();
          }
        });
      },

      unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        socket?.off("newMessage");
      },

      setSelectedUser: (selectedUser) => set({ selectedUser }),

      setActiveConversationId: (activeConversationId) => {
        set((state) => ({
          activeConversationId,
          selectedUser:
            state.users.find((user) => user._id === activeConversationId) ||
            state.conversations.find((user) => user._id === activeConversationId) ||
            null,
          messages: activeConversationId ? state.messages : [],
        }));
      },

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setComposerText: (composerText) => set({ composerText }),
      setSoundEnabled: (isSoundEnabled) => set({ isSoundEnabled }),
    }),
    {
      name: "imessage-storage",
      partialize: (state) => ({ isSoundEnabled: state.isSoundEnabled }),
    },
  ),
);