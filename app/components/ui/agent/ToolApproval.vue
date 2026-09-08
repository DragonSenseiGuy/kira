<template>
  <div class="ui-approval" :class="`is-${status}`" role="group" :aria-label="`Permission request: ${tool}`">
    <UiDisclosure v-model="detailsOpen" class="ui-approval__disclosure" :chevron="parameters.length > 0">
      <template #trigger>
        <span class="ui-approval__icon" aria-hidden="true">
          <Icon :icon="statusIcon" width="18" height="18" />
        </span>

        <span class="ui-approval__heading">
          <span class="ui-approval__title">{{ title }}</span>
          <code class="ui-approval__tool">{{ tool }}</code>
        </span>

        <UiBadge
          v-if="statusLabel"
          class="ui-approval__badge"
          :tone="statusTone"
          show-dot
          :live="isBusy"
        >
          {{ statusLabel }}
        </UiBadge>
      </template>

      <div v-if="parameters.length" class="ui-approval__params">
        <div v-for="param in parameters" :key="param.id" class="ui-approval__param">
          <span class="ui-approval__param-label">{{ param.label }}</span>
          <pre v-if="param.code" class="ui-approval__code"><code>{{ param.value }}</code></pre>
          <span v-else class="ui-approval__param-value">{{ param.value }}</span>
        </div>
      </div>
    </UiDisclosure>

    <p v-if="description" class="ui-approval__description">{{ description }}</p>

    <div v-if="status === 'pending'" class="ui-approval__actions">
      <UiButton variant="ghost" size="sm" @click="emit('deny')">Deny</UiButton>
      <UiButton variant="secondary" size="sm" @click="emit('always-allow')">Always allow</UiButton>
      <UiButton variant="primary" size="sm" @click="emit('approve')">Allow once</UiButton>
    </div>
  </div>
</template>

<script setup>
/**
 * Human-in-the-loop permission card — beUI's `tool-approval`. The agent has
 * stopped and is asking before it acts, so the request, its arguments and the
 * three answers all live on one surface rather than in a modal that hides the
 * conversation behind it.
 *
 * Once answered, the buttons are replaced by the outcome badge: the card stays
 * in place as the record of what was decided instead of disappearing.
 */
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps({
  /** Tool identifier, shown verbatim as a mono chip. */
  tool: { type: String, required: true },
  title: { type: String, default: "Allow this tool to run?" },
  description: { type: String, default: "" },
  /**
   * Rows shown under the disclosure: `{ id, label, value, code }`.
   * Set `code: true` to render the value as a preformatted block.
   */
  parameters: { type: Array, default: () => [] },
  status: {
    type: String,
    default: "pending",
    validator: (v) =>
      ["pending", "approving", "approved", "running", "complete", "denied", "error"].includes(v),
  },
  /** Whether the parameter disclosure starts open. */
  defaultOpen: { type: Boolean, default: true },
});

const emit = defineEmits(["approve", "always-allow", "deny"]);

const detailsOpen = ref(props.defaultOpen && props.parameters.length > 0);

const STATUS = {
  pending: { label: "", tone: "neutral", icon: "material-symbols:shield-question-outline-rounded" },
  approving: { label: "Approving…", tone: "neutral", icon: "material-symbols:shield-outline-rounded" },
  approved: { label: "Allowed", tone: "success", icon: "material-symbols:verified-user-outline-rounded" },
  running: { label: "Running…", tone: "accent", icon: "material-symbols:play-circle-outline-rounded" },
  complete: { label: "Done", tone: "success", icon: "material-symbols:check-circle-outline-rounded" },
  denied: { label: "Denied", tone: "danger", icon: "material-symbols:block-rounded" },
  error: { label: "Failed", tone: "danger", icon: "material-symbols:error-outline-rounded" },
};

const meta = computed(() => STATUS[props.status] ?? STATUS.pending);
const statusLabel = computed(() => meta.value.label);
const statusTone = computed(() => meta.value.tone);
const statusIcon = computed(() => meta.value.icon);
const isBusy = computed(() => ["approving", "running"].includes(props.status));

// Answering the request collapses the arguments — they were there to inform
// the decision, and the decision has been made.
watch(
  () => props.status,
  (status) => {
    if (status !== "pending") detailsOpen.value = false;
  },
);
</script>

<style scoped>
.ui-approval {
  padding: 12px 14px;
  background: var(--card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-raised);
}

.ui-approval__icon {
  display: flex;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.is-pending .ui-approval__icon {
  color: var(--warning);
}

.is-denied .ui-approval__icon,
.is-error .ui-approval__icon {
  color: var(--danger);
}

.is-approved .ui-approval__icon,
.is-complete .ui-approval__icon {
  color: var(--success);
}

.ui-approval__heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ui-approval__title {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-primary);
}

.ui-approval__tool {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.ui-approval__badge {
  flex-shrink: 0;
  margin-left: auto;
}

/* The chevron sits after the badge, so the badge only claims the gap it needs. */
.ui-approval__badge + :deep(.ui-disclosure__chevron) {
  margin-left: 6px;
}

.ui-approval__params {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
}

.ui-approval__param {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ui-approval__param-label {
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.ui-approval__param-value {
  font-size: 0.8rem;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.ui-approval__code {
  margin: 0;
  padding: 8px 10px;
  max-height: 160px;
  overflow: auto;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--inset);
  border-radius: var(--radius-chip);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ui-approval__description {
  margin: 10px 0 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.ui-approval__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 12px;
}
</style>
