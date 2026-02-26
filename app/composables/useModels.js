import { ref, computed } from 'vue';
import { availableModels, findModelById } from './availableModels';

const MODELS_API_URL = 'https://ai.hackclub.com/proxy/v1/models';

const PROVIDER_MAP = {
  'deepseek': { name: 'DeepSeek', logo: '/ai_logos/deepseek.svg' },
  'google': { name: 'Google', logo: '/ai_logos/gemini.svg' },
  'minimax': { name: 'MiniMax', logo: '/ai_logos/minimax.svg' },
  'moonshotai': { name: 'Moonshot AI', logo: '/ai_logos/moonshot.svg' },
  'openai': { name: 'OpenAI', logo: '/ai_logos/openai.svg' },
  'perplexity': { name: 'Perplexity', logo: '/ai_logos/perplexity.svg' },
  'qwen': { name: 'Qwen', logo: '/ai_logos/qwen.svg' },
  'x-ai': { name: 'xAI', logo: '/ai_logos/xai.svg' },
  'z-ai': { name: 'Z.ai', logo: '/ai_logos/zai.svg' },
  'bytedance-seed': { name: 'ByteDance', logo: null },
};

// Module-level singleton state
const models = ref([]);
const isLoading = ref(false);
const error = ref(null);
let fetchPromise = null;

function truncateDescription(desc) {
  if (!desc) return '';
  const firstSentence = desc.match(/^[^.!?]*[.!?]/);
  const sentence = firstSentence ? firstSentence[0] : desc;
  if (sentence.length <= 120) return sentence;
  return desc.slice(0, 120).replace(/\s+\S*$/, '') + '…';
}

function stripProviderPrefix(name) {
  const colonIndex = name.indexOf(': ');
  return colonIndex !== -1 ? name.slice(colonIndex + 2) : name;
}

function inferReasoning(apiModel) {
  const params = apiModel.supported_parameters || [];
  const supported = params.includes('reasoning');
  if (!supported) return { supported: false };

  const hasEffort = params.includes('reasoning_effort');
  return {
    supported: true,
    toggleable: true,
    defaultEnabled: true,
    ...(hasEffort ? {
      effort: {
        levels: ['low', 'medium', 'high'],
        default: 'medium',
      },
    } : {}),
  };
}

function normalizeModel(apiModel) {
  const inputModalities = apiModel.architecture?.input_modalities || [];
  const params = apiModel.supported_parameters || [];

  // Check if we have a hardcoded config for this model
  const hardcoded = findModelById(availableModels, apiModel.id);

  const reasoning = hardcoded ? hardcoded.reasoning : inferReasoning(apiModel);

  return {
    id: apiModel.id,
    name: stripProviderPrefix(apiModel.name || apiModel.id),
    description: truncateDescription(apiModel.description),
    vision: inputModalities.includes('image'),
    tool_use: hardcoded?.tool_use !== undefined ? hardcoded.tool_use : params.includes('tools'),
    context_length: apiModel.context_length,
    reasoning,
  };
}

async function fetchModels() {
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await fetch(MODELS_API_URL);
      if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
      const json = await res.json();
      models.value = (json.data || []).map(normalizeModel);
    } catch (e) {
      error.value = e.message;
      console.error('Failed to fetch models:', e);
    } finally {
      isLoading.value = false;
    }
  })();

  return fetchPromise;
}

const groupedModels = computed(() => {
  const groups = {};

  for (const model of models.value) {
    const slashIndex = model.id.indexOf('/');
    const prefix = slashIndex !== -1 ? model.id.slice(0, slashIndex) : model.id;
    if (!groups[prefix]) {
      const provider = PROVIDER_MAP[prefix] || { name: prefix, logo: null };
      groups[prefix] = {
        provider: prefix,
        name: provider.name,
        logo: provider.logo,
        models: [],
      };
    }
    groups[prefix].models.push(model);
  }

  const sorted = Object.values(groups).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (const group of sorted) {
    group.models.sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted;
});

function getModelById(id) {
  return models.value.find((m) => m.id === id) || null;
}

function getProviderLogo(modelId) {
  const slashIndex = modelId.indexOf('/');
  const prefix = slashIndex !== -1 ? modelId.slice(0, slashIndex) : modelId;
  return PROVIDER_MAP[prefix]?.logo || null;
}

// Fetch on first import (client-side only)
if (typeof window !== 'undefined') {
  fetchModels();
}

export function useModels() {
  return {
    models,
    groupedModels,
    isLoading,
    error,
    fetchModels,
    getModelById,
    getProviderLogo,
  };
}
