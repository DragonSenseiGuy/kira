import { defineEventHandler, readBody, getHeader } from 'h3';

export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    
    // Get API key from header
    const apiKey = getHeader(event, 'x-api-key');
    
    if (!apiKey) {
        throw createError({
            statusCode: 401,
            statusMessage: 'API key is required in X-API-Key header.'
        });
    }

    const { urls } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Request body must include a "urls" array with at least one URL.'
        });
    }

    // Limit to 10 URLs max
    const limitedUrls = urls.slice(0, 10);

    try {
        const response = await fetch('https://ai.hackclub.com/proxy/v1/exa/contents', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
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
