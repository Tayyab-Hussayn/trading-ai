/**
 * Chrome Storage wrapper for Binary Trading AI Agent
 */

import { logger } from './logger.js';

export const StorageUtils = {
    /**
     * Get value from chrome.storage.local
     */
    async get(key, defaultValue = null) {
        try {
            const result = await chrome.storage.local.get(key);
            return result[key] !== undefined ? result[key] : defaultValue;
        } catch (error) {
            logger.error(`Failed to get storage key: ${key}`, error);
            return defaultValue;
        }
    },

    /**
     * Set value in chrome.storage.local
     */
    async set(key, value) {
        try {
            await chrome.storage.local.set({ [key]: value });
            logger.debug(`Storage set: ${key}`, value);
            return true;
        } catch (error) {
            logger.error(`Failed to set storage key: ${key}`, error);
            return false;
        }
    },

    /**
     * Remove key from chrome.storage.local
     */
    async remove(key) {
        try {
            await chrome.storage.local.remove(key);
            logger.debug(`Storage removed: ${key}`);
            return true;
        } catch (error) {
            logger.error(`Failed to remove storage key: ${key}`, error);
            return false;
        }
    },

    /**
     * Clear all storage
     */
    async clear() {
        try {
            await chrome.storage.local.clear();
            logger.info('Storage cleared');
            return true;
        } catch (error) {
            logger.error('Failed to clear storage', error);
            return false;
        }
    },

    /**
     * Get all storage data
     */
    async getAll() {
        try {
            return await chrome.storage.local.get(null);
        } catch (error) {
            logger.error('Failed to get all storage', error);
            return {};
        }
    },

    /**
     * Get Gemini API key
     */
    async getGeminiApiKey() {
        return await this.get('gemini_api_key', null);
    },

    /**
     * Set Gemini API key
     */
    async setGeminiApiKey(apiKey) {
        return await this.set('gemini_api_key', apiKey);
    },

    /**
     * Get user settings
     */
    async getSettings() {
        const defaults = {
            minConfidence: 0.65,
            notificationsEnabled: true,
            learningModeActive: true,
            selectedGeminiModel: 'gemini-2.0-flash-exp',
            platformType: 'generic'
        };

        return await this.get('settings', defaults);
    },

    /**
     * Update user settings
     */
    async updateSettings(settings) {
        const current = await this.getSettings();
        const updated = { ...current, ...settings };
        return await this.set('settings', updated);
    },

    /**
     * Get storage usage
     */
    async getUsage() {
        try {
            if (chrome.storage.local.getBytesInUse) {
                const bytes = await chrome.storage.local.getBytesInUse(null);
                return {
                    bytes,
                    mb: (bytes / (1024 * 1024)).toFixed(2)
                };
            }
            return null;
        } catch (error) {
            logger.error('Failed to get storage usage', error);
            return null;
        }
    }
};

export default StorageUtils;
