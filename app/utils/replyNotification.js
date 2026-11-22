// Desktop notification for a reply that finishes while Kira is in the
// background. The text never includes the conversation itself: only the chat's
// title, and not even that for incognito chats.

export function notificationPermission(win = window) {
  return "Notification" in win ? win.Notification.permission : "unsupported";
}

export async function requestNotificationPermission(win = window) {
  if (!("Notification" in win)) return "unsupported";
  if (win.Notification.permission !== "default") return win.Notification.permission;
  try {
    return await win.Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function notifyReplyFinished({ title, failed = false, incognito = false } = {}, win = window) {
  const doc = win.document;
  if (notificationPermission(win) !== "granted") return null;
  if (!doc.hidden && doc.hasFocus()) return null;

  let notification;
  try {
    notification = new win.Notification(failed ? "Kira could not finish the reply" : "Kira finished replying", {
      body: incognito ? "Incognito chat" : (title || "").trim() || "New chat",
      tag: "kira-reply",
    });
  } catch {
    // Some browsers only allow notifications from a service worker.
    return null;
  }

  const closeWhenSeen = () => {
    if (doc.hidden) return;
    notification.close();
    doc.removeEventListener("visibilitychange", closeWhenSeen);
  };
  doc.addEventListener("visibilitychange", closeWhenSeen);
  notification.onclick = () => {
    win.focus();
    notification.close();
  };
  notification.onclose = () => doc.removeEventListener("visibilitychange", closeWhenSeen);
  return notification;
}
