<template>
  <div>
    <div class="stx-header">
      <h2>Autonomy</h2>
      <p>
        Control what the code sandbox may do on its own. Kira can use Exa's search tools without limits, but it can also directly fetch from URLs with stricter limits.
      </p>
    </div>

    <div class="stx-card">
      <div class="stx-card-title">Network access</div>

      <div class="stx-item stacked">
        <div class="stx-options" role="radiogroup" aria-label="Sandbox network mode">
          <button
            v-for="option in modes"
            :key="option.value"
            type="button"
            class="stx-option"
            :class="{ active: netMode === option.value }"
            role="radio"
            :aria-checked="netMode === option.value"
            @click="setMode(option.value)"
          >
            <span class="opt-title">
              <Icon :icon="option.icon" width="18" height="18" />
              {{ option.label }}
            </span>
            <span class="opt-desc">{{ option.description }}</span>
          </button>
        </div>
      </div>

      <div class="stx-item stacked">
        <div class="stx-info">
          <h3>Approved domains</h3>
          <p v-if="!grantList.length">
            No domains approved yet.
          </p>
        </div>
        <div v-if="grantList.length" class="stx-grants">
          <div v-for="g in grantList" :key="g.domain" class="stx-grant-row">
            <span class="stx-mono">{{ g.domain }}</span>
            <button
              type="button"
              class="stx-btn ghost"
              @click="revoke(g.domain)"
            >
              Revoke
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="stx-card">
      <div class="stx-card-title">Recent sandbox network activity</div>
      <p v-if="!activity.length" class="stx-note" style="margin: 0">
        Nothing yet.
      </p>
      <div v-else class="stx-activity">
        <div v-for="(a, i) in activity" :key="i" class="stx-act-row" :class="`is-${a.outcome}`">
          <span class="stx-act-method">{{ a.method }}</span>
          <span class="stx-mono stx-act-domain">{{ a.domain || a.url }}</span>
          <span class="stx-act-meta">
            {{ a.status ?? "—" }} · {{ outcomeLabel(a.outcome) }} ·
            {{ timeAgo(a.at) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import { useSettings } from "~/composables/useSettings";

const settingsManager = useSettings();
const settings = settingsManager.settings;

const modes = [
  {
    value: "off",
    label: "No network",
    icon: "material-symbols:block-outline-rounded",
    description: "Generated code cannot reach the internet.",
  },
  {
    value: "ask",
    label: "Ask per domain (recommended)",
    icon: "material-symbols:verified-user-outline-rounded",
    description: "First request to each domain requires your approval.",
  },
  {
    value: "auto",
    label: "Allow all domains",
    icon: "material-symbols:bolt-rounded",
    description: "Every https request is allowed automatically.",
  },
];

const netMode = computed(() => settings.net_mode || "ask");

function setMode(value) {
  settings.net_mode = value;
  settingsManager.saveSettings();
}

const grantList = computed(() =>
  Object.keys(settings.net_grants || {}).map((domain) => ({ domain })),
);

function revoke(domain) {
  delete settings.net_grants[domain];
  settingsManager.saveSettings();
}

const activity = computed(() =>
  [...(settings.net_activity || [])].reverse().slice(0, 15),
);

function outcomeLabel(outcome) {
  switch (outcome) {
    case "denied": return "denied";
    case "error": return "failed";
    case "timeout": return "timed out";
    default: return "ok";
  }
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
</script>

<style scoped>
.stx-mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.78rem;
}

.stx-grant-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}

.stx-act-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  font-size: 0.78rem;
}
.stx-act-row:last-child { border-bottom: none; }

.stx-act-method {
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  width: 42px;
  flex-shrink: 0;
}

.stx-act-domain {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stx-act-row.is-denied .stx-act-meta { color: #dc2626; }
.stx-act-row.is-error .stx-act-meta { color: #d97706; }

.stx-act-meta {
  font-size: 0.7rem;
  color: var(--text-secondary);
  white-space: nowrap;
}
</style>
