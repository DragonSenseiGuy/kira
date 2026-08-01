import localforage from "localforage";
import { emitter } from "~/composables/emitter";

/**
 * Wipes the locally cached chats.
 *
 * Chats live in localforage keyed by conversation id, with no notion of who
 * they belong to. On a shared device that would mean the next person to sign
 * in sees the previous account's conversations — and syncs them up into their
 * own account. Clearing on sign-out keeps accounts separate; the chats
 * themselves are safe in the database and come back on the next sign-in.
 */
export async function clearLocalChats() {
  try {
    const metadata =
      (await localforage.getItem("conversations_metadata")) || [];

    await Promise.all(
      metadata.map((conv) => localforage.removeItem(`conversation_${conv.id}`))
    );
    await localforage.removeItem("conversations_metadata");

    emitter.emit("updateConversations");
  } catch (error) {
    console.warn("[auth] Could not clear local chats:", error.message);
  }
}
