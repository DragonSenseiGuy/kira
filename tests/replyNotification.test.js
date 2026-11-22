import { describe, it, expect, vi } from "vitest";
import {
  notificationPermission,
  notifyReplyFinished,
  requestNotificationPermission,
} from "../app/utils/replyNotification.js";

function fakeWindow({ permission = "granted", hidden = true, focused = false, supported = true } = {}) {
  const listeners = new Set();
  const shown = [];
  const win = {
    focus: vi.fn(),
    document: {
      hidden,
      hasFocus: () => focused,
      addEventListener: (type, fn) => listeners.add(fn),
      removeEventListener: (type, fn) => listeners.delete(fn),
    },
  };
  if (supported) {
    win.Notification = class {
      static permission = permission;
      static requestPermission = vi.fn(async () => "granted");
      constructor(title, options) {
        Object.assign(this, { title, options, close: vi.fn(() => this.onclose?.()) });
        shown.push(this);
      }
    };
  }
  const becomeVisible = () => {
    win.document.hidden = false;
    [...listeners].forEach((fn) => fn());
  };
  return { win, shown, listeners, becomeVisible };
}

describe("notifyReplyFinished", () => {
  it("names the chat when the tab is hidden", () => {
    const { win, shown } = fakeWindow();
    notifyReplyFinished({ title: " Trip plan " }, win);
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("Kira finished replying");
    expect(shown[0].options.body).toBe("Trip plan");
  });

  it("notifies when the tab is visible but the window is not focused", () => {
    const { win, shown } = fakeWindow({ hidden: false, focused: false });
    notifyReplyFinished({ title: "Trip" }, win);
    expect(shown).toHaveLength(1);
  });

  it("stays quiet while the user is looking at Kira", () => {
    const { win, shown } = fakeWindow({ hidden: false, focused: true });
    expect(notifyReplyFinished({ title: "Trip" }, win)).toBeNull();
    expect(shown).toHaveLength(0);
  });

  it("stays quiet without permission or without browser support", () => {
    for (const options of [{ permission: "default" }, { permission: "denied" }, { supported: false }]) {
      const { win, shown } = fakeWindow(options);
      expect(notifyReplyFinished({ title: "Trip" }, win)).toBeNull();
      expect(shown).toHaveLength(0);
    }
  });

  it("does not reveal the title of an incognito chat", () => {
    const { win, shown } = fakeWindow();
    notifyReplyFinished({ title: "Secret", incognito: true }, win);
    expect(shown[0].options.body).toBe("Incognito chat");
  });

  it("says so when the reply failed, and falls back for an untitled chat", () => {
    const { win, shown } = fakeWindow();
    notifyReplyFinished({ title: "", failed: true }, win);
    expect(shown[0].title).toBe("Kira could not finish the reply");
    expect(shown[0].options.body).toBe("New chat");
  });

  it("focuses Kira and closes when clicked", () => {
    const { win, shown, listeners } = fakeWindow();
    notifyReplyFinished({ title: "Trip" }, win);
    shown[0].onclick();
    expect(win.focus).toHaveBeenCalled();
    expect(shown[0].close).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it("closes itself once the user comes back to the tab", () => {
    const { win, shown, listeners, becomeVisible } = fakeWindow();
    notifyReplyFinished({ title: "Trip" }, win);
    becomeVisible();
    expect(shown[0].close).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it("returns null when the browser refuses to construct a notification", () => {
    const { win } = fakeWindow();
    win.Notification = class {
      static permission = "granted";
      constructor() {
        throw new TypeError("Illegal constructor");
      }
    };
    expect(notifyReplyFinished({ title: "Trip" }, win)).toBeNull();
  });
});

describe("requestNotificationPermission", () => {
  it("asks only when the user has not decided yet", async () => {
    const undecided = fakeWindow({ permission: "default" }).win;
    expect(await requestNotificationPermission(undecided)).toBe("granted");
    expect(undecided.Notification.requestPermission).toHaveBeenCalledTimes(1);

    const denied = fakeWindow({ permission: "denied" }).win;
    expect(await requestNotificationPermission(denied)).toBe("denied");
    expect(denied.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("reports browsers without notifications", async () => {
    const { win } = fakeWindow({ supported: false });
    expect(await requestNotificationPermission(win)).toBe("unsupported");
    expect(notificationPermission(win)).toBe("unsupported");
  });
});
