import { defineEventHandler, getHeader, readBody } from 'h3';
import OpenAI from 'openai';
import { resolveApiKey } from '../utils/apiKeys';

const UPSTREAM_BASE_URL = 'https://ai.hackclub.com/proxy/v1';

/**
 * Sends a JSON error response, guarding against headers already sent.
 */
function sendJsonError(event, statusCode, payload) {
    const res = event.node.res;
    if (res.headersSent) return;
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
}

/**
 * Quantizes a float embedding vector to binary (0 or 1).
 * Uses the median as threshold for better distribution.
 * @param {Array<number>} embedding - The float embedding vector
 * @returns {Array<number>} - Binary quantized embedding (0s and 1s)
 */
function quantizeToBinary(embedding) {
    // Calculate median value as threshold
    const sorted = [...embedding].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Quantize: values >= median become 1, others become 0
    return embedding.map(value => value >= median ? 1 : 0);
}

export default defineEventHandler(async (event) => {
    const body = await readBody(event);

    // BYOK: the user's own API key travels in the x-api-key header. Falling
    // back to the key saved on their account is what makes a new device work.
    const apiKey = await resolveApiKey(event, getHeader(event, 'x-api-key'));

    if (!apiKey) {
        sendJsonError(event, 401, {
            error: {
                type: 'authentication_error',
                message: 'API key is required. Please add your own API key in settings.',
                code: 401
            }
        });
        return;
    }

    const openai = new OpenAI({
        apiKey,
        baseURL: UPSTREAM_BASE_URL
    });

    try {
        const { input, model = "qwen/qwen3-embedding-8b" } = body;

        if (!input) {
            sendJsonError(event, 400, {
                error: {
                    type: 'invalid_request_error',
                    message: 'Input text is required',
                    code: 400
                }
            });
            return;
        }

        const response = await openai.embeddings.create({
            model,
            input,
            dimensions: 768, // Use 768 dimensions for optimal balance of quality and size
        });

        // Quantize the embedding to binary format
        if (response.data && response.data[0] && response.data[0].embedding) {
            const floatEmbedding = response.data[0].embedding;
            const binaryEmbedding = quantizeToBinary(floatEmbedding);

            // Replace the float embedding with binary quantized version
            response.data[0].embedding = binaryEmbedding;
        }

        event.node.res.setHeader('Content-Type', 'application/json');
        event.node.res.end(JSON.stringify(response));

    } catch (error) {
        console.error('Error creating embeddings:', error);

        sendJsonError(event, error.status || 500, {
            error: {
                type: error.type || 'api_error',
                message: error.message || 'Failed to generate embeddings',
                code: error.status || 500
            }
        });
    }
});
