// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { useDark } from "@vueuse/core";
import SettingsGeneral from "~/components/settings/SettingsGeneral.vue";

const KEY = "vueuse-color-scheme";

function mountSettings() {
  return mount(SettingsGeneral, {
    global: { stubs: { Icon: true, SwitchRoot: true, SwitchThumb: true } },
  });
}

function selected(wrapper) {
  return wrapper.find(".theme-choice [aria-checked='true']").text();
}

describe("theme setting", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("starts on System when nothing is stored", () => {
    const wrapper = mountSettings();
    expect(selected(wrapper)).toBe("System");
    wrapper.unmount();
  });

  it("shows a stored choice", () => {
    localStorage.setItem(KEY, "dark");
    const wrapper = mountSettings();
    expect(selected(wrapper)).toBe("Dark");
    wrapper.unmount();
  });

  it("treats an unknown stored value as System", () => {
    localStorage.setItem(KEY, "sepia");
    const wrapper = mountSettings();
    expect(selected(wrapper)).toBe("System");
    wrapper.unmount();
  });

  it("stores the pick and the page's useDark() follows it", async () => {
    const isDark = useDark();
    const wrapper = mountSettings();
    const options = wrapper.findAll(".theme-choice [role='radio']");

    await options.find((o) => o.text() === "Dark").trigger("click");
    await nextTick();
    expect(localStorage.getItem(KEY)).toBe("dark");
    expect(isDark.value).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await options.find((o) => o.text() === "Light").trigger("click");
    await nextTick();
    expect(localStorage.getItem(KEY)).toBe("light");
    expect(isDark.value).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await options.find((o) => o.text() === "System").trigger("click");
    await nextTick();
    expect(localStorage.getItem(KEY)).toBe("auto");
    wrapper.unmount();
  });
});
