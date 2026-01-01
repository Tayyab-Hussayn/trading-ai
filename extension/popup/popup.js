/**
 * Popup JavaScript - UI logic and interactions
 */

import { StorageUtils } from '../utils/storage.js';

class PopupUI {
    constructor() {
        this.updateInterval = null;
    }

    /**
     * Initialize popup
     */
    async init() {
        console.log('[Popup] Initializing');

        // Load settings
        await this.loadSettings();

        // Setup event listeners
        this.setupEventListeners();

        // Start updates
        this.startUpdates();

        // Initial update
        await this.updateUI();
    }

    /**
     * Load settings from storage
     */
    async loadSettings() {
        const settings = await StorageUtils.getSettings();
        const apiKey = await StorageUtils.getGeminiApiKey();

        document.getElementById('minConfidence').value = settings.minConfidence * 100;
        document.getElementById('minConfidenceValue').textContent = `${settings.minConfidence * 100}%`;
        document.getElementById('notifications').checked = settings.notificationsEnabled;
        document.getElementById('learningMode').checked = settings.learningModeActive;

        if (apiKey) {
            document.getElementById('geminiApiKey').value = apiKey;
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Min confidence slider
        const minConfidence = document.getElementById('minConfidence');
        const minConfidenceValue = document.getElementById('minConfidenceValue');

        minConfidence.addEventListener('input', (e) => {
            const value = e.target.value;
            minConfidenceValue.textContent = `${value}%`;
        });

        minConfidence.addEventListener('change', async (e) => {
            await StorageUtils.updateSettings({
                minConfidence: parseInt(e.target.value) / 100
            });
        });

        // Notifications toggle
        document.getElementById('notifications').addEventListener('change', async (e) => {
            await StorageUtils.updateSettings({
                notificationsEnabled: e.target.checked
            });
        });

        // Learning mode toggle
        document.getElementById('learningMode').addEventListener('change', async (e) => {
            await StorageUtils.updateSettings({
                learningModeActive: e.target.checked
            });
        });

        // API key input
        document.getElementById('geminiApiKey').addEventListener('change', async (e) => {
            const apiKey = e.target.value.trim();
            if (apiKey) {
                await StorageUtils.setGeminiApiKey(apiKey);
                console.log('[Popup] API key saved');
            }
        });

        // Export button
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        // Reset button
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetModel();
        });
    }

    /**
     * Start periodic updates
     */
    startUpdates() {
        this.updateInterval = setInterval(() => {
            this.updateUI();
        }, 2000); // Update every 2 seconds
    }

    /**
     * Update UI with latest data
     */
    async updateUI() {
        try {
            // Get status from background
            const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

            if (response) {
                this.updateStatus(response);
                this.updateSignal(response.currentPrediction);
                this.updateStats(response.validation);
                this.updateRecent();
            }
        } catch (error) {
            console.error('[Popup] Update failed:', error);
        }
    }

    /**
     * Update status indicator
     */
    updateStatus(status) {
        const indicator = document.getElementById('statusIndicator');
        const statusText = indicator.querySelector('.status-text');
        const statusDot = indicator.querySelector('.status-dot');

        if (status.initialized) {
            statusText.textContent = 'Active';
            statusDot.style.background = '#22c55e';
        } else {
            statusText.textContent = 'Initializing...';
            statusDot.style.background = '#f59e0b';
        }
    }

    /**
     * Update signal display
     */
    updateSignal(prediction) {
        const signalEmpty = document.getElementById('signalEmpty');
        const signalContent = document.getElementById('signalContent');

        if (!prediction || !prediction.prediction) {
            signalEmpty.style.display = 'block';
            signalContent.style.display = 'none';
            return;
        }

        signalEmpty.style.display = 'none';
        signalContent.style.display = 'block';

        // Direction
        const signalText = document.getElementById('signalDirection').querySelector('.signal-text');
        const signalIcon = document.getElementById('signalDirection').querySelector('.signal-icon');

        if (prediction.prediction === 'NEUTRAL') {
            signalText.textContent = 'SCANNING...';
            signalText.className = 'signal-text neutral';
            signalIcon.textContent = '🔍';
        } else {
            signalText.textContent = prediction.prediction;
            signalText.className = `signal-text ${prediction.prediction.toLowerCase()}`;
            signalIcon.textContent = prediction.prediction === 'UP' ? '📈' : '📉';
        }

        // Confidence
        const confidence = Math.round(prediction.confidence * 100);
        document.getElementById('confidenceValue').textContent = `${confidence}%`;
        document.getElementById('confidenceFill').style.width = `${confidence}%`;

        // Meta
        document.getElementById('methodValue').textContent = prediction.method || '-';
        document.getElementById('patternsValue').textContent =
            prediction.patterns?.join(', ') || 'None';

        const time = new Date(prediction.timestamp).toLocaleTimeString();
        document.getElementById('timeValue').textContent = time;
    }

    /**
     * Update statistics
     */
    updateStats(stats) {
        if (!stats) return;

        document.getElementById('totalPredictions').textContent = stats.total || 0;

        const winRate = stats.winRate ? Math.round(stats.winRate * 100) : 0;
        document.getElementById('winRate').textContent = `${winRate}%`;

        document.getElementById('todayStats').textContent =
            `${stats.correct || 0}W / ${stats.incorrect || 0}L`;

        document.getElementById('modelAccuracy').textContent = `${winRate}%`;
    }

    /**
     * Update recent predictions
     */
    async updateRecent() {
        // This would fetch from database via background script
        // For now, showing placeholder
        const recentList = document.getElementById('recentList');

        // Get recent predictions from background
        // const recent = await getRecentPredictions();

        // For demo, keeping empty state
        // recentList.innerHTML = '<div class="recent-empty">No predictions yet</div>';
    }

    /**
     * Export data
     */
    async exportData() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

            const dataStr = JSON.stringify(response, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `trading-ai-data-${Date.now()}.json`;
            a.click();

            URL.revokeObjectURL(url);
            console.log('[Popup] Data exported');
        } catch (error) {
            console.error('[Popup] Export failed:', error);
        }
    }

    /**
     * Reset model
     */
    async resetModel() {
        if (!confirm('Are you sure you want to reset the model? This will delete all training data.')) {
            return;
        }

        try {
            // Send reset message to background
            await chrome.runtime.sendMessage({ type: 'RESET_MODEL' });
            console.log('[Popup] Model reset');
            alert('Model has been reset successfully');
        } catch (error) {
            console.error('[Popup] Reset failed:', error);
            alert('Failed to reset model');
        }
    }

    /**
     * Cleanup
     */
    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

// Initialize popup
const popup = new PopupUI();
popup.init();

// Cleanup on unload
window.addEventListener('unload', () => {
    popup.cleanup();
});
