import { defineEventHandler, getQuery, getHeader } from 'h3';

const HC_EXA_SEARCH_URL = 'https://ai.hackclub.com/proxy/v1/exa/search';
const EXA_DIRECT_SEARCH_URL = 'https://api.exa.ai/search';

/**
 * Web-search relay. Two backends:
 *   - source=hackclub (default): Exa via the Hack Club AI proxy; key is
 *     the user's Hack Club AI key (search is bundled with it).
 *   - source=exa: the user's own Exa API key against api.exa.ai directly.
 *
 * The key arrives in the x-api-key header and is forwarded to whichever
 * backend was selected. Route is protected by the session-token guard.
 */
export default defineEventHandler(async (event) => {
    const query = getQuery(event);

    const apiKey = getHeader(event, 'x-api-key');
    if (!apiKey) {
        throw createError({
            statusCode: 401,
            statusMessage: 'API key is required in X-API-Key header.'
        });
    }

    const { q, numResults = 5, source = 'hackclub' } = query;
    if (!q) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Query parameter "q" is required.'
        });
    }

    const useExaDirect = source === 'exa';
    const upstreamUrl = useExaDirect ? EXA_DIRECT_SEARCH_URL : HC_EXA_SEARCH_URL;

    // The Hack Club proxy expects a Bearer token; Exa's own API uses the
    // x-api-key header.
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
                query: q,
                numResults: Math.min(parseInt(numResults) || 5, 10),
                contents: {
                    highlights: true
                }
            })
        });

        if (!response.ok) {
            throw createError({
                statusCode: response.status,
                statusMessage: `Exa Search API failed: ${response.statusText}`
            });
        }

        const data = await response.json();

        // Transform Exa API response to match expected format
        return {
            results: data.results?.map(r => ({
                title: r.title || '',
                url: r.url || '',
                highlights: Array.isArray(r.highlights) ? r.highlights : [],
                author: r.author || null,
                date: r.publishedDate || null,
                subpages: Array.isArray(r.subpages) ? r.subpages : []
            })) || [],
            query: q
        };

    } catch (error) {
        console.error('Exa Search API Error:', error);
        throw createError({
            statusCode: error.statusCode || 500,
            statusMessage: error.statusMessage || 'Internal Server Error'
        });
    }
});
