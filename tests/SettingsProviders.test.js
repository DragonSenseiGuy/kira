// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import SettingsProviders from "~/components/settings/SettingsProviders.vue";
import { useSettings } from "~/composables/useSettings";

vi.mock("~/composables/useSettings", () => ({ useSettings: vi.fn() }));

describe("Settings Providers", () => {
  it("warns about removed providers only when the selected model falls back to Hack Club", async () => {
    const settings = reactive({
      selected_model_id: "gpt-4.1",
      custom_providers: [],
    });
    vi.mocked(useSettings).mockReturnValue({ settings });
    const renders = vi.fn();
    const wrapper = mount(SettingsProviders, {
      global: { stubs: { Icon: true }, config: { warnHandler: renders } },
    });

    try {
      const warning = "Your currently selected model belonged to a removed provider.";
      expect(wrapper.text()).not.toContain(warning);

      settings.selected_model_id = "pr_old::model";
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toContain(warning);

      settings.custom_providers = [{ id: "pr_current", name: "Current", baseUrl: "http://localhost:8001/v1" }];
      settings.active_provider_id = "pr_current";
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).not.toContain(warning);

      settings.selected_model_id = "pr_current::model";
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).not.toContain(warning);
      expect(renders).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });
});
