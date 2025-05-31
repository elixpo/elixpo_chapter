import { CACHE_DURATION } from './config.js';

const imageCache = new Map();

/**
 * Stores image data in the cache.
 * @param {string} interactionId - The interaction ID.
 * @param {Array} data - Array of image objects (attachments, urls, etc).
 */
export function setCache(interactionId, data) {
    imageCache.set(interactionId, {
        data,
        timestamp: Date.now()
    });
}

/**
 * Retrieves image data from the cache.
 * @param {string} interactionId - The interaction ID.
 * @returns {object|null} - The cached entry or null if not found/expired.
 */
export function getCache(interactionId) {
    const entry = imageCache.get(interactionId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
        imageCache.delete(interactionId);
        return null;
    }
    return entry;
}

/**
 * Deletes a cache entry.
 * @param {string} interactionId - The interaction ID.
 */
export function deleteCache(interactionId) {
    imageCache.delete(interactionId);
}

/**
 * Cleans up expired cache entries.
 */
export function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of imageCache) {
        if (now - value.timestamp > CACHE_DURATION) {
            imageCache.delete(key);
        }
    }
}

export {
    imageCache 
};