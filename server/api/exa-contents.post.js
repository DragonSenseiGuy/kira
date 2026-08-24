import { defineEventHandler, readBody, getHeader } from 'h3';

const HC_EXA_CONTENTS_URL = 'https://ai.hackclub.com/proxy/v1/exa/contents';
const EXA_DIRECT_CONTENTS_URL = 'https://api.exa.ai/contents';

/**
 * Page-contents relay. Two backends (see search.get.js):
 *   - source=hackclub (default): Exa via the Hack Club AI proxy.
 *   - source=exa: the user's own Exa API key against api.exa.ai directly.
 */
export default defineEventHandler(async (event) => {
    const body = await readBody(event);

    const apiKey = getHeader(event, 'x-api-key');
    if (!apiKey) {
        throw createError({
            statusCode: 401,
            statusMessage: 'API key is required in X-API-Key header.'
        });
    }

    const { urls, source = 'hackclub' } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Request body must include a "urls" array with at least one URL.'
        });
    }

    // Limit to 10 URLs max
    const limitedUrls = urls.slice(0, 10);

    const useExaDirect = source === 'exa';
    const upstreamUrl = useExaDirect ? EXA_DIRECT_CONTENTS_URL : HC_EXA_CONTENTS_URL;
    const authHeaders = useExaDirect
        ? { 'x-api-key': apiKey }
        : { Authorization: `Bearer ${apiKey}` };

    try {
        const response = await fetch(upstreamUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders
            },
            body: JSON.stringify({
                urls: limitedUrls
            })
        });

        if (!response.ok) {
            throw createError({
                statusCode: response.status,
                statusMessage: `Exa Contents API failed: ${response.statusText}`
            });
        }

        const data = await response.json();

        // Transform Exa API response to match expected format
        return {
            results: data.results?.map(r => ({
                url: r.url || '',
                title: r.title || '',
                content: r.text || '',
                publishedDate: r.publishedDate || null
            })) || []
        };

    } catch (error) {
        console.error('Exa Contents API Error:', error);
        throw createError({
            statusCode: error.statusCode || 500,
            statusMessage: error.statusMessage || 'Internal Server Error'
        });
    }
});
