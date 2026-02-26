import { defineEventHandler } from 'h3';

const MODELS_API_URL = 'https://ai.hackclub.com/proxy/v1/models';

export default defineEventHandler(async (event) => {
  try {
    const res = await fetch(MODELS_API_URL);
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
    const json = await res.json();
    return json;
  } catch (error) {
    console.error('Failed to fetch models:', error);
    event.node.res.statusCode = 502;
    return { error: error.message };
  }
});
