/**
 * Background Service Worker - WebSocket Bridge
 * Connects extension to Python backend via WebSocket
 */

const BACKEND_URL = 'ws://localhost:8000/ws';

class BackendBridge {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.currentPrediction = null;
    }

    /**
     * Connect to Python backend
     */
    async connect() {
        console.log('[Backend Bridge] Connecting to:', BACKEND_URL);

        try {
            this.ws = new WebSocket(BACKEND_URL);

            this.ws.onopen = () => {
                console.log('✅ Connected to Python backend');
                this.connected = true;
                this.reconnectAttempts = 0;

                // Notify popup
                this.broadcastToPopup({
                    type: 'BACKEND_CONNECTED',
                    data: { timestamp: Date.now() }
                });
            };

            this.ws.onmessage = (event) => {
                this.handleBackendMessage(event.data);
            };

            this.ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
            };

            this.ws.onclose = () => {
                console.log('❌ Disconnected from backend');
                this.connected = false;
                this.attemptReconnect();
            };

        } catch (error) {
            console.error('Failed to connect:', error);
            this.attemptReconnect();
        }
    }

    /**
     * Attempt to reconnect
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        console.log(`Reconnecting in ${this.reconnectDelay}ms... (Attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
    }

    /**
     * Send data to backend
     */
    send(type, data) {
        if (!this.connected || !this.ws) {
            console.warn('Not connected to backend');
            return false;
        }

        try {
            this.ws.send(JSON.stringify({ type, data }));
            return true;
        } catch (error) {
            console.error('Failed to send message:', error);
            return false;
        }
    }

    /**
     * Handle messages from backend
     */
    handleBackendMessage(message) {
        try {
            const data = JSON.parse(message);
            console.log('📨 From backend:', data.type);

            switch (data.type) {
                case 'CONNECTION_ESTABLISHED':
                    console.log('Backend ready:', data.data.message);
                    break;

                case 'PREDICTION':
                    this.handlePrediction(data.data);
                    break;

                case 'PONG':
                    console.log('Pong received');
                    break;

                case 'ERROR':
                    console.error('Backend error:', data.data);
                    break;

                default:
                    console.log('Unknown message type:', data.type);
            }

            // Broadcast to popup
            this.broadcastToPopup(data);

        } catch (error) {
            console.error('Failed to parse backend message:', error);
        }
    }

    /**
     * Handle prediction from backend
     */
    handlePrediction(prediction) {
        console.log('🎯 Prediction received:', prediction);
        this.currentPrediction = prediction;

        // Show notification
        if (prediction.confidence >= 0.65) {
            this.showNotification(prediction);
        }
    }

    /**
     * Show browser notification
     */
    showNotification(prediction) {
        const icon = prediction.prediction === 'UP' ? '📈' : '📉';
        const confidence = (prediction.confidence * 100).toFixed(1);

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: `${icon} ${prediction.prediction} Signal`,
            message: `Confidence: ${confidence}%\nMethod: ${prediction.method}`,
            priority: 2
        });
    }

    /**
     * Broadcast message to all popup instances
     */
    async broadcastToPopup(message) {
        try {
            // Try to send to popup if it's open
            chrome.runtime.sendMessage(message).catch(() => {
                // Popup not open, ignore
            });
        } catch (error) {
            // Ignore if popup is not open
        }
    }
}

// Create singleton instance
const bridge = new BackendBridge();

// Connect on startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension started');
    bridge.connect();
});

// Connect on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
    bridge.connect();
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message.type);

    switch (message.type) {
        case 'CONTENT_READY':
            console.log('Content script ready on:', message.platform);
            sendResponse({ success: true, connected: bridge.connected });
            break;

        case 'CANDLES_UPDATE':
            // Forward candles to Python backend
            const sent = bridge.send('CANDLES_UPDATE', {
                candles: message.candles,
                platform: message.platform || 'quotex',
                timestamp: message.timestamp || Date.now()
            });
            sendResponse({ success: sent });
            break;

        case 'GET_STATUS':
            sendResponse({
                connected: bridge.connected,
                currentPrediction: bridge.currentPrediction,
                reconnectAttempts: bridge.reconnectAttempts
            });
            break;

        case 'RECONNECT_BACKEND':
            bridge.connect();
            sendResponse({ success: true });
            break;

        case 'PING_BACKEND':
            bridge.send('PING', { timestamp: Date.now() });
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ error: 'Unknown message type' });
    }

    return true; // Keep channel open for async response
});

// Auto-connect when service worker loads
bridge.connect();

// Keep service worker alive with periodic ping
setInterval(() => {
    if (bridge.connected) {
        bridge.send('PING', { timestamp: Date.now() });
    }
}, 30000); // Every 30 seconds

console.log('🤖 Trading AI Extension - Background worker loaded');
