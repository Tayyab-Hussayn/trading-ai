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
        this.maxReconnectAttempts = 300; // Try for ~15 minutes
        this.reconnectDelay = 3000;
        this.currentPrediction = null;
        this.lastStatus = null; // Cache for backend status
    }

    /**
     * Connect to Python backend
     */
    async connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return; // Already connecting or connected
        }

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

                // Request initial status
                this.send('GET_STATUS', {});
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
                this.ws = null; // Cleanup
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
            // console.log('📨 From backend:', data.type); // Reduce noise

            switch (data.type) {
                case 'CONNECTION_ESTABLISHED':
                    console.log('Backend ready:', data.data.message);
                    break;

                case 'PREDICTION':
                    this.handlePrediction(data.data);
                    break;

                case 'STATUS':
                    this.lastStatus = data.data; // Update cache
                    break;

                case 'PONG':
                    // console.log('Pong received');
                    break;

                case 'NO_SIGNAL':
                    this.currentPrediction = {
                        prediction: 'NEUTRAL',
                        confidence: data.data.confidence || 0,
                        method: 'Scanning',
                        patterns: [],
                        timestamp: Date.now()
                    };
                    break;

                case 'INSUFFICIENT_DATA':
                    // Don't update currentPrediction with invalid data, but verify we are connected
                    // Maybe broadcast status update
                    break;

                case 'ERROR':
                    console.error('Backend error:', data.data);
                    break;
            }

            // Always broadcast to popup so it gets live updates
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
            message: `Confidence: ${confidence}%\nMethod: ${prediction.method}\nPattern: ${prediction.patterns?.[0] || 'Unknown'}`,
            priority: 2
        });
    }

    /**
     * Broadcast message to all popup instances
     */
    async broadcastToPopup(message) {
        try {
            chrome.runtime.sendMessage(message).catch(() => {
                // Ignore if popup is closed
            });
        } catch (error) {
            // Ignore if popup is closed
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
    // console.log('Message received:', message.type);

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
            // If not connected, try to trigger a reconnect (lazily)
            if (!bridge.connected) {
                bridge.connect();
            }

            // 1. Send immediate response with cached data
            const statusResponse = {
                initialized: bridge.connected,
                connected: bridge.connected,
                currentPrediction: bridge.currentPrediction,
                reconnectAttempts: bridge.reconnectAttempts,
                // Merge backend stats if available
                ...(bridge.lastStatus || {})
            };

            sendResponse(statusResponse);

            // 2. Refresh cache asynchronously
            if (bridge.connected) {
                bridge.send('GET_STATUS', {});
            }
            break;

        case 'RECONNECT_BACKEND':
            bridge.connect();
            sendResponse({ success: true });
            break;

        case 'RESET_MODEL':
            // Forward reset command to backend (if we had an endpoint, but we don't yet via WebSocket)
            // We can send a generic message or HTTP POST
            fetch('http://localhost:8000/retrain', { method: 'POST' })
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.toString() }));
            return true; // Async

        case 'CAPTURE_TAB':
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to capture tab', chrome.runtime.lastError);
                    sendResponse({ error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ dataUrl });
                }
            });
            return true;

        case 'PING_BACKEND':
            bridge.send('PING', { timestamp: Date.now() });
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ error: 'Unknown message type' });
    }

    // Return synchronous response for non-async cases
    // (except RESET_MODEL which returns true)
    return false;
});

// Auto-connect when service worker loads
bridge.connect();

// Keep service worker alive with periodic ping & status update
setInterval(() => {
    if (bridge.connected) {
        bridge.send('GET_STATUS', {}); // Periodic status refresh
    }
}, 2000);

console.log('🤖 Trading AI Extension - Background worker loaded');
