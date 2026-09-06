<template>
  <div>
    <div class="stx-header">
      <h2>Providers</h2>
      <p>
        Kira is built for <a href="https://ai.hackclub.com" target="_blank">Hack Club AI</a>, but you can add any number of
        additional OpenAI-compatible endpoints.
      </p>
    </div>

    <!-- Providers: one flat list, Hack Club first (locked) -->
    <div class="stx-card">
      <div class="stx-card-title">Providers</div>

      <!-- Built-in row -->
      <div class="stx-provider">
        <div class="stx-provider-row">
          <div style="min-width: 0">
            <div class="stx-provider-name">
              Hack Club AI
              <span class="stx-badge muted" style="margin-left: 6px">
                <Icon icon="material-symbols:lock-outline-rounded" width="12" height="12" />
                Built-in
              </span>
            </div>
            <div class="stx-provider-url">https://ai.hackclub.com/proxy/v1</div>
          </div>
          <div class="stx-provider-actions">
            <span
              class="stx-count"
              :title="hcFullModels.length === 0 ? 'Model list not fetched yet' : `${hcFullModels.length} models available`"
            >
              {{ hcFullModels.length === 0 ? '—' : `${hcFullModels.length} models` }}
            </span>
            <span class="stx-badge" :class="{ muted: !hackClubKey }">
              {{ hackClubKey ? 'key set' : 'no key' }}
            </span>
            <button class="stx-btn ghost" :disabled="refreshingHc" @click="refreshHcModels" aria-label="Refresh model list" title="Refresh model list">
              <Icon icon="material-symbols:refresh-rounded" width="18" height="18" :class="{ spin: refreshingHc }" />
            </button>
          </div>
        </div>

        <div class="stx-input-container wide" style="margin-top: 12px">
          <input
            v-model="hackClubKey"
            :type="showHackClubKey ? 'text' : 'password'"
            placeholder="Your Hack Club AI API key"
            class="stx-input"
            style="max-width: none"
            autocomplete="off"
            @change="set('custom_api_key', hackClubKey)"
          />
          <button
            type="button"
            class="stx-btn ghost"
            @click="showHackClubKey = !showHackClubKey"
            :aria-label="showHackClubKey ? 'Hide key' : 'Show key'"
          >
            <Icon :icon="showHackClubKey ? 'material-symbols:visibility-off' : 'material-symbols:visibility'" width="20" height="20" />
          </button>
        </div>

        <p class="builtin-hint">
          Provides free AI inference for a large variety of different models as well as a free Exa search API.
        </p>
      </div>

      <!-- Custom provider rows -->
      <div v-for="provider in providers" :key="provider.id" class="stx-provider">
        <div class="stx-provider-row">
          <div style="min-width: 0">
            <div class="stx-provider-name">
              {{ provider.name }}
              <span
                v-if="isLocalProvider(provider)"
                class="stx-badge muted"
                style="margin-left: 6px"
                title="Routes local models to Kira">
                Local
              </span>
            </div>
            <div class="stx-provider-url">{{ provider.baseUrl }}</div>
          </div>
          <div class="stx-provider-actions">
            <span
              class="stx-count"
              :title="
                modelCount(provider) === null
                  ? 'Model list not fetched yet'
                  : `${modelCount(provider)} models available`
              "
            >
              {{ modelCount(provider) === null ? '—' : `${modelCount(provider)} models` }}
            </span>
            <button class="stx-btn ghost" :disabled="refreshing[provider.id]" @click="refreshModels(provider)" aria-label="Refresh models" title="Refresh model list">
              <Icon icon="material-symbols:refresh-rounded" width="18" height="18" :class="{ spin: refreshing[provider.id] }" />
            </button>
            <button class="stx-btn ghost" @click="startEdit(provider)" aria-label="Edit provider" title="Edit provider">
              <Icon icon="material-symbols:edit-outline-rounded" width="18" height="18" />
            </button>
            <button class="stx-btn ghost danger-text" @click="removeProvider(provider)" aria-label="Delete provider" title="Delete provider">
              <Icon icon="material-symbols:delete-outline-rounded" width="18" height="18" />
            </button>
          </div>
        </div>

        <!-- One-time setup hint for local runtimes -->
        <p v-if="isLocalProvider(provider)" class="local-hint">
          To set up, enable CORS on your inference software. For LM Studio: Developer tab → enable CORS; for Ollama: follow <a href="https://objectgraph.com/blog/ollama-cors/" target="_blank">this tutorial</a>.
        </p>

        <!-- Inline edit form -->
        <div v-if="editingId === provider.id" class="stx-edit-form">
          <label class="stx-field">
            <span>Name</span>
            <input v-model="editDraft.name" type="text" class="stx-input small" style="max-width: none; min-width: 0" />
          </label>
          <label class="stx-field">
            <span>Base URL</span>
            <input v-model="editDraft.baseUrl" type="url" placeholder="https://api.example.com/v1" class="stx-input" style="max-width: none; min-width: 0" />
          </label>
          <label class="stx-field">
            <span>API key</span>
            <input v-model="editDraft.apiKey" type="password" autocomplete="off" class="stx-input" style="max-width: none; min-width: 0" />
          </label>
          <p v-if="editError" class="stx-error">{{ editError }}</p>
          <div style="display: flex; gap: 8px; margin-top: 4px">
            <button class="stx-btn primary" @click="saveEdit">Save changes</button>
            <button class="stx-btn ghost" @click="cancelEdit">Cancel</button>
          </div>
        </div>
      </div>

      <div v-if="providers.length === 0" class="stx-note">
        No custom providers yet — add one below and its models will appear in the model selector.
      </div>

      <div v-if="selectedModelUsesRemovedProvider" class="stx-note">
        ⚠️ Your currently selected model belonged to a removed provider. Chat will fall back to the
        Hack Club provider until you pick a new model.
      </div>
    </div>

    <!-- Add provider -->
    <div class="stx-card">
      <div class="stx-card-title">Add a provider</div>

      <div class="stx-item stacked">
        <div class="stx-info">
          <h3>Pick a preset (optional)</h3>
          <p>Fills in the name and endpoint for known OpenAI-compatible APIs.</p>
        </div>
        <div class="preset-grid">
          <button
            v-for="preset in PRESET_PROVIDERS"
            :key="preset.id"
            type="button"
            class="preset-chip"
            :title="preset.description"
            @click="applyPreset(preset)"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>

      <div class="stx-item stacked">
        <div class="stx-fields">
          <label class="stx-field">
            <span>Name</span>
            <input v-model="draft.name" type="text" placeholder="My OpenRouter account" class="stx-input" style="max-width: none; min-width: 0" />
          </label>
          <label class="stx-field">
            <span>Base URL</span>
            <input v-model="draft.baseUrl" type="url" placeholder="https://openrouter.ai/api/v1" class="stx-input" style="max-width: none; min-width: 0" />
          </label>
          <label class="stx-field">
            <span>API key</span>
            <input v-model="draft.apiKey" type="password" autocomplete="off" placeholder="sk-..." class="stx-input" style="max-width: none; min-width: 0" />
          </label>
        </div>
        <p v-if="addError" class="stx-error">{{ addError }}</p>
        <div>
          <button class="stx-btn primary" @click="addProvider">
            <Icon icon="material-symbols:add-rounded" width="18" height="18" />
            Add provider
          </button>
        </div>
      </div>

      <div class="stx-note">
        Keys are stored only in this browser. Remote endpoints must use https. Local runtimes (Ollama / LM Studio) need CORS enabled on your runtime to be able to communicate with the browser.
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, inject } from 'vue';
import { Icon } from '@iconify/vue';
import { useSettings } from '~/composables/useSettings';
import {
  PRESET_PROVIDERS,
  generateProviderId,
  clearCachedProviderModels,
  fetchProviderModels,
  fetchHcFullModels,
  hcFullModels,
  customProviderModels,
  isLocalBaseUrl,
} from '~/composables/providers';

const ui = inject('settings-ui', null);
const settingsManager = useSettings();

const providers = computed(() => settingsManager.settings.custom_providers || []);

// Built-in Hack Club provider (key stored as custom_api_key)
const showHackClubKey = ref(false);
const hackClubKey = ref(settingsManager.settings.custom_api_key || '');

function set(key, value) {
  settingsManager.settings[key] = value;
  settingsManager.saveSettings();
}

const refreshing = reactive({});
const refreshingHc = ref(false);
const editingId = ref(null);
const editDraft = reactive({ name: '', baseUrl: '', apiKey: '' });
const editError = ref('');

const draft = reactive({ name: '', baseUrl: '', apiKey: '' });
const addError = ref('');

function persist() {
  return settingsManager.saveSettings();
}

function modelCount(provider) {
  const list = customProviderModels[provider.id];
  if (!Array.isArray(list)) return null;
  if (list.length === 0) return 0;
  return list.length;
}

function isLocalProvider(provider) {
  return isLocalBaseUrl(provider?.baseUrl);
}

async function refreshModels(provider) {
  refreshing[provider.id] = true;
  try {
    const models = await fetchProviderModels(provider, { force: true });
    ui?.showToast(
      models.length > 0
        ? `Loaded ${models.length} models from ${provider.name}`
        : `No models reported by ${provider.name}`,
    );
  } catch (error) {
    ui?.showToast(error?.message || 'Could not load models');
  } finally {
    refreshing[provider.id] = false;
  }
}

async function refreshHcModels() {
  refreshingHc.value = true;
  try {
    const models = await fetchHcFullModels({
      apiKey: settingsManager.settings.custom_api_key,
      force: true,
    });
    ui?.showToast(
      models.length > 0
        ? `Refreshed ${models.length} Hack Club models`
        : 'No models reported by Hack Club',
    );
  } catch (error) {
    ui?.showToast(error?.message || 'Could not refresh Hack Club models');
  } finally {
    refreshingHc.value = false;
  }
}

function validateProvider(draftState) {
  if (!draftState.name?.trim()) return 'Please give the provider a name.';
  if (!/^https?:\/\//i.test(draftState.baseUrl?.trim() || '')) {
    return 'Base URL must start with http(s)://';
  }
  return '';
}

function applyPreset(preset) {
  draft.name = preset.name.replace(/ \(this machine\)$/, '');
  draft.baseUrl = preset.baseUrl;
  addError.value = '';
}

function addProvider() {
  const error = validateProvider(draft);
  if (error) {
    addError.value = error;
    return;
  }
  settingsManager.settings.custom_providers.push({
    id: generateProviderId(),
    name: draft.name.trim(),
    baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''),
    apiKey: draft.apiKey.trim(),
  });
  persist();
  Object.assign(draft, { name: '', baseUrl: '', apiKey: '' });
  addError.value = '';
  ui?.showToast('Provider added — fetching its model list…');

  // Best-effort initial model fetch so the selector fills in.
  const created = settingsManager.settings.custom_providers.at(-1);
  fetchProviderModels(created)
    .then((models) =>
      ui?.showToast(
        models.length > 0 ? `${created.name}: ${models.length} models available` : `${created.name} reported no models`,
      ),
    )
    .catch((e) => ui?.showToast(e?.message || 'Could not load models'));
}

function startEdit(provider) {
  editingId.value = provider.id;
  editError.value = '';
  Object.assign(editDraft, {
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey || '',
  });
}

function cancelEdit() {
  editingId.value = null;
  editError.value = '';
}

function saveEdit() {
  const provider = providers.value.find((p) => p.id === editingId.value);
  if (!provider) return cancelEdit();
  const error = validateProvider(editDraft);
  if (error) {
    editError.value = error;
    return;
  }
  const urlChanged = provider.baseUrl !== editDraft.baseUrl.trim().replace(/\/+$/, '');
  provider.name = editDraft.name.trim();
  provider.baseUrl = editDraft.baseUrl.trim().replace(/\/+$/, '');
  provider.apiKey = editDraft.apiKey.trim();
  persist();
  ui?.showToast('Provider updated');
  cancelEdit();
  if (urlChanged) refreshModelsQuiet(provider);
}

async function refreshModelsQuiet(provider) {
  try {
    await fetchProviderModels(provider, { force: true });
  } catch {
    // Surfaced via badge state; silent here.
  }
}

function removeProvider(provider) {
  settingsManager.settings.custom_providers = providers.value.filter(
    (p) => p.id !== provider.id,
  );
  clearCachedProviderModels(provider.id);

  // Reset selection when it pointed at the removed provider.
  if (typeof settingsManager.settings.selected_model_id === 'string' &&
      settingsManager.settings.selected_model_id.startsWith(`${provider.id}::`)) {
    settingsManager.settings.selected_model_id = '';
  }
  persist();
  ui?.showToast(`${provider.name} removed`);
}
</script>

<style scoped>
.stx-edit-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding-left: 14px;
  border-left: 2px solid var(--border);
}

.stx-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (min-width: 720px) {
  .stx-fields {
    grid-template-columns: 1fr 1fr;
  }
}

.stx-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.preset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-chip {
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-chip:hover {
  border-color: var(--line-strong);
  color: var(--text-primary);
}

.stx-error {
  margin: 0;
  color: #dc2626;
  font-size: 0.82rem;
}

.builtin-hint {
  margin: 10px 0 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.local-hint {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

.local-hint code {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.72rem;
}

.danger-text:hover {
  color: #dc2626 !important;
}

.spin {
  animation: stx-spin 0.9s linear infinite;
}

@keyframes stx-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
