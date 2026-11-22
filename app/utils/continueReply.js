// A reply that stopped because the model ran out of output tokens
// (finish_reason "length") can be picked up again with one click.

export const CONTINUE_PROMPT = "Continue exactly where you left off.";

export function isTruncated(finishReason) {
  return finishReason === "length";
}

// The id of the message that should offer "Continue": only the last message
// of the chat, only a finished assistant reply that was cut off, and never
// while another reply is streaming.
export function continuableMessageId(messages, isLoading) {
  if (isLoading || !messages?.length) return null;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant" || !last.complete || !last.truncated || last.error) return null;
  return last.id;
}
