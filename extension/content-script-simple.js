/**
 * Simplified Content Script - Only reads canvas and sends to backend
 */

class QuotexDataExtractor {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.ws = null;
        this.scanInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    /**
     * Initialize
     */
    async init() {
        console.log('[Trading AI] 🚀 Initializing data extractor...');

        // Connect to backend
        await this.connectToBackend();

        // Find canvas
        this.findCanvas();

        // Start scanning
        if (this.canvas) {
            this.startScanning();
        }
    }

    /**
     * Connect to local backend via WebSocket
     */
    async connectToBackend() {
        try {
            console.log('[Trading AI] 📡 Connecting to backend at ws://localhost:8000/ws');

            this.ws = new WebSocket('ws://localhost:8000/ws');

            this.ws.onopen = () => {
                console.log('[Trading AI] ✅ Connected to backend!');
                this.reconnectAttempts = 0;
                this.showNotification('Connected to AI Backend', 'success');
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                console.log('[Trading AI] 📨 Received from backend:', message);

                if (message.type === 'PREDICTION') {
                    this.handlePrediction(message.data);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[Trading AI] ❌ WebSocket error:', error);
            };

            this.ws.onclose = () => {
                console.warn('[Trading AI] ⚠️  Disconnected from backend');
                this.showNotification('Disconnected from backend', 'warning');
                this.attemptReconnect();
            };

        } catch (error) {
            console.error('[Trading AI] Failed to connect:', error);
            this.attemptReconnect();
        }
    }

    /**
     * Attempt to reconnect
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[Trading AI] Max reconnect attempts reached');
            this.showNotification('Cannot connect to backend. Is it running?', 'error');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

        console.log(`[Trading AI] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connectToBackend();
        }, delay);
    }

    /**
     * Find canvas on page
     */
    findCanvas() {
        console.log('[Trading AI] 🔍 Searching for chart canvas...');

        // Find all canvases
        const canvases = document.querySelectorAll('canvas');

        if (canvases.length === 0) {
            console.warn('[Trading AI] No canvas found');
            return;
        }

        // Find largest canvas (likely the chart)
        let largest = null;
        let maxArea = 0;

        canvases.forEach(canvas => {
            const area = canvas.width * canvas.height;
            if (area > maxArea) {
                maxArea = area;
                largest = canvas;
            }
        });

        if (largest) {
            this.canvas = largest;
            this.ctx = largest.getContext('2d', { willReadFrequently: true });
            console.log(`[Trading AI] ✅ Canvas found: ${largest.width}x${largest.height}`);
        }
    }

    /**
     * Start scanning canvas
     */
    startScanning() {
        console.log('[Trading AI] 🔄 Starting canvas scan every 5 seconds...');

        this.scanInterval = setInterval(() => {
            this.scanAndSend();
        }, 5000);

        // Initial scan
        this.scanAndSend();
    }

    /**
     * Scan canvas and send to backend
     */
    scanAndSend() {
        if (!this.canvas || !this.ctx) {
            console.warn('[Trading AI] No canvas available');
            return;
        }

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[Trading AI] WebSocket not connected');
            return;
        }

        try {
            const candles = this.extractCandles();

            if (candles.length > 0) {
                // Send to backend
                this.ws.send(JSON.stringify({
                    type: 'CANDLES_UPDATE',
                    data: {
                        candles,
                        platform: 'quotex',
                        timestamp: Date.now()
                    }
                }));

                console.log(`[Trading AI] ✅ Sent ${candles.length} candles to backend`);
            } else {
                console.log('[Trading AI] ⚠️  No candles detected');
            }
        } catch (error) {
            console.error('[Trading AI] Scan error:', error);
        }
    }

    /**
     * Extract candles from canvas (simplified)
     */
    extractCandles() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const imageData = this.ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        const candles = [];
        const candleWidth = 15;
        const numCandles = Math.min(20, Math.floor(width / candleWidth));

        for (let i = 0; i < numCandles; i++) {
            const x = width - (i * candleWidth) - candleWidth / 2;
            const candle = this.extractCandleAtX(x, pixels, width, height);

            if (candle) {
                candles.unshift(candle);
            }
        }

        return candles;
    }

    /**
     * Extract single candle at X position
     */
    extractCandleAtX(x, pixels, width, height) {
        let minY = height;
        let maxY = 0;
        let greenCount = 0;
        let redCount = 0;

        // Scan vertical column
        for (let offsetX = -3; offsetX <= 3; offsetX++) {
            const scanX = Math.floor(x + offsetX);
            if (scanX < 0 || scanX >= width) continue;

            for (let y = 0; y < height; y++) {
                const idx = (y * width + scanX) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                const a = pixels[idx + 3];

                if (a < 50) continue;

                // Detect green
                if (g > r + 20 && g > b + 20 && g > 80) {
                    greenCount++;
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }

                // Detect red
                if (r > g + 20 && r > b + 20 && r > 80) {
                    redCount++;
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        if (greenCount === 0 && redCount === 0) return null;
        if (maxY - minY < 5) return null;

        const direction = greenCount > redCount ? 'bullish' : 'bearish';
        const high = 100 - (minY / height) * 100;
        const low = 100 - (maxY / height) * 100;
        const range = high - low;

        return {
            timestamp: Date.now() - (x / width) * 3600000,
            open: direction === 'bullish' ? low + range * 0.2 : high - range * 0.2,
            close: direction === 'bullish' ? high - range * 0.1 : low + range * 0.1,
            high,
            low,
            direction
        };
    }

    /**
     * Handle prediction from backend
     */
    handlePrediction(data) {
        console.log('[Trading AI] 🎯 Prediction:', data);

        // Show notification
        const icon = data.prediction === 'UP' ? '📈' : '📉';
        const confidence = (data.confidence * 100).toFixed(1);

        this.showNotification(
            `${icon} ${data.prediction} Signal`,
            `Confidence: ${confidence}%`
        );
    }

    /**
     * Show notification
     */
    showNotification(title, message) {
        // Create visual notification on page
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 999999;
            font-family: Arial, sans-serif;
            font-size: 14px;
            max-width: 300px;
        `;
        notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px;">${title}</div>
            <div style="opacity: 0.9;">${message}</div>
        `;

        document.body.appendChild(notification);

        // Remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const extractor = new QuotexDataExtractor();
        extractor.init();
    });
} else {
    const extractor = new QuotexDataExtractor();
    extractor.init();
}
