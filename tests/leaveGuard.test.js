import { describe, it, expect } from "vitest";
import { holdLeaveGuard } from "~/composables/leaveGuard";

function leaveIsBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("holdLeaveGuard", () => {
  it("asks before leaving only while a reply is held", () => {
    expect(leaveIsBlocked()).toBe(false);
    const release = holdLeaveGuard();
    expect(leaveIsBlocked()).toBe(true);
    release();
    expect(leaveIsBlocked()).toBe(false);
  });

  it("stays on until every reply has finished", () => {
    const first = holdLeaveGuard();
    const second = holdLeaveGuard();
    first();
    expect(leaveIsBlocked()).toBe(true);
    second();
    expect(leaveIsBlocked()).toBe(false);
  });

  it("ignores a release called twice", () => {
    const first = holdLeaveGuard();
    const second = holdLeaveGuard();
    first();
    first();
    expect(leaveIsBlocked()).toBe(true);
    second();
    expect(leaveIsBlocked()).toBe(false);
  });
});
