import { ref, computed } from 'vue';
import { isTextFile } from '~/utils/attachmentParts';
import { isDocxFile, extractDocxText } from '~/utils/docxText';

// Maximum file size: 4.5MB
const MAX_FILE_SIZE = 4.5 * 1024 * 1024;

// Maximum number of attachments
const MAX_ATTACHMENTS = 4;

// Maximum image width (images wider than this will be resized)
const MAX_IMAGE_WIDTH = 3000;

// WebP quality for compression (0.0 - 1.0)
const WEBP_QUALITY = 0.85;

// Allowed file types
const ALLOWED_TYPES = {
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/webp': 'image',
    'image/gif': 'image',
    'application/pdf': 'pdf'
};

const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'];

// Image extensions that should be processed (converted to WebP and resized)
const PROCESSABLE_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

/**
 * Composable for managing file attachments in the message form
 * @returns {Object} Attachment state and methods
 */
export function useAttachments() {
    const attachments = ref([]);
    const error = ref(null);

    const hasAttachments = computed(() => attachments.value.length > 0);
    const hasImages = computed(() => attachments.value.some(a => a.type === 'image'));
    const hasPDFs = computed(() => attachments.value.some(a => a.type === 'pdf'));

    /**
     * Validates file type before processing (does NOT check size - that happens after processing)
     * @param {File} file - The file to validate
     * @param {boolean} supportsVision - Whether the current model supports vision
     * @returns {{ valid: boolean, error?: string, isImage: boolean, isPDF: boolean }}
     */
    function validateFileType(file, supportsVision = false) {
        // Get file extension
        const extension = file.name.split('.').pop()?.toLowerCase();

        // Check if file type is allowed
        const fileType = ALLOWED_TYPES[file.type];
        const isAllowedExtension = ALLOWED_EXTENSIONS.includes(extension);

        if (!fileType && !isAllowedExtension) {
            if (isDocxFile(file)) {
                return { valid: true, isImage: false, isPDF: false, isText: true, isDocx: true };
            }
            if (isTextFile(file)) {
                return { valid: true, isImage: false, isPDF: false, isText: true };
            }
            return {
                valid: false,
                error: `File type not supported. Allowed: PNG, JPG, WEBP, GIF, PDF, Word (.docx), and text or code files.`,
                isImage: false,
                isPDF: false
            };
        }

        // Determine if it's an image or PDF
        const isImage = fileType === 'image' || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension);
        const isPDF = fileType === 'pdf' || extension === 'pdf';

        // Images require vision-capable model, PDFs work with any model
        if (isImage && !supportsVision) {
            return {
                valid: false,
                error: `The current model does not support image analysis. Please select a vision-capable model or upload a PDF.`,
                isImage,
                isPDF
            };
        }

        return { valid: true, isImage, isPDF };
    }

    /**
     * Loads an image file into an HTMLImageElement
     * @param {File} file - The image file to load
     * @returns {Promise<HTMLImageElement>} The loaded image element
     */
    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };

            img.src = url;
        });
    }

    /**
     * Processes an image: resizes if too wide and converts to WebP
     * @param {File} file - The image file to process
     * @returns {Promise<{ dataUrl: string, mimeType: string, processed: boolean }>}
     */
    async function processImage(file) {
        const extension = file.name.split('.').pop()?.toLowerCase();

        // Skip processing for GIFs to preserve animation
        if (extension === 'gif' || file.type === 'image/gif') {
            const dataUrl = await fileToDataUrl(file);
            return {
                dataUrl,
                mimeType: file.type || 'image/gif',
                processed: false
            };
        }

        // Load the image to get dimensions
        const img = await loadImage(file);

        let targetWidth = img.width;
        let targetHeight = img.height;

        // Resize if width exceeds maximum
        if (img.width > MAX_IMAGE_WIDTH) {
            const ratio = MAX_IMAGE_WIDTH / img.width;
            targetWidth = MAX_IMAGE_WIDTH;
            targetHeight = Math.round(img.height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Convert to WebP
        const dataUrl = canvas.toDataURL('image/webp', WEBP_QUALITY);

        return {
            dataUrl,
            mimeType: 'image/webp',
            processed: true
        };
    }

    /**
     * Converts a file to a data URL (base64)
     * @param {File} file - The file to convert
     * @returns {Promise<string>} The data URL
     */
    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Calculates the size of a data URL in bytes
     * @param {string} dataUrl - The data URL to measure
     * @returns {number} Size in bytes
     */
    function getDataUrlSize(dataUrl) {
        // Remove the data URL prefix (e.g., "data:image/webp;base64,")
        const base64 = dataUrl.split(',')[1];
        if (!base64) return 0;

        // Calculate the actual byte size from base64
        // Base64 encodes 3 bytes into 4 characters, with padding
        const padding = (base64.match(/=/g) || []).length;
        return (base64.length * 3 / 4) - padding;
    }

    /**
     * Adds a file to the attachments list
     * @param {File} file - The file to add
     * @param {boolean} supportsVision - Whether the current model supports vision
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async function addFile(file, supportsVision = false) {
        // Clear previous error
        error.value = null;

        // Check attachment limit
        if (attachments.value.length >= MAX_ATTACHMENTS) {
            error.value = `Maximum of ${MAX_ATTACHMENTS} attachments allowed.`;
            return { success: false, error: error.value };
        }

        // Validate file type (not size yet - that happens after processing)
        const validation = validateFileType(file, supportsVision);
        if (!validation.valid) {
            error.value = validation.error;
            return { success: false, error: validation.error };
        }

        try {
            let dataUrl;
            let mimeType;
            const extension = file.name.split('.').pop()?.toLowerCase();

            if (validation.isImage) {
                // Process image: convert to WebP and resize if needed
                const result = await processImage(file);
                dataUrl = result.dataUrl;
                mimeType = result.mimeType;
            } else if (validation.isDocx) {
                let text;
                try {
                    text = extractDocxText(await file.arrayBuffer());
                } catch {
                    error.value = `"${file.name}" could not be read as a Word document.`;
                    return { success: false, error: error.value };
                }
                if (!text) {
                    error.value = `"${file.name}" has no text to attach.`;
                    return { success: false, error: error.value };
                }
                dataUrl = await fileToDataUrl(new Blob([text], { type: 'text/plain' }));
                mimeType = 'text/plain';
            } else {
                // PDF or text: just convert to data URL
                dataUrl = await fileToDataUrl(file);
                mimeType = file.type || (validation.isText ? 'text/plain' : 'application/pdf');
            }

            // Now check size AFTER processing
            const processedSize = getDataUrlSize(dataUrl);
            if (processedSize > MAX_FILE_SIZE) {
                const sizeMB = (processedSize / (1024 * 1024)).toFixed(1);
                error.value = `File "${file.name}" is ${sizeMB}MB after processing, which exceeds the 4.5MB limit.`;
                return { success: false, error: error.value };
            }

            // Determine type
            const type = validation.isImage ? 'image' : validation.isText ? 'text' : 'pdf';

            // Update filename extension if converted to WebP
            let filename = file.name;
            if (validation.isImage && mimeType === 'image/webp' && extension !== 'webp') {
                filename = file.name.replace(/\.[^.]+$/, '.webp');
            }

            attachments.value.push({
                id: crypto.randomUUID(),
                type,
                filename,
                dataUrl,
                mimeType
            });

            return { success: true };
        } catch (err) {
            const errorMsg = `Failed to process file "${file.name}".`;
            error.value = errorMsg;
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Removes an attachment by ID
     * @param {string} id - The attachment ID to remove
     */
    function removeAttachment(id) {
        attachments.value = attachments.value.filter(a => a.id !== id);
    }

    /**
     * Clears all attachments
     */
    function clearAttachments() {
        attachments.value = [];
        error.value = null;
    }

    /**
     * Clears the current error
     */
    function clearError() {
        error.value = null;
    }

    return {
        attachments,
        error,
        hasAttachments,
        hasImages,
        hasPDFs,
        addFile,
        removeAttachment,
        clearAttachments,
        clearError,
        MAX_FILE_SIZE,
        MAX_ATTACHMENTS,
        ALLOWED_EXTENSIONS
    };
}
