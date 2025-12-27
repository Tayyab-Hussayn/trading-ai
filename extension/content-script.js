/**
 * Content Script - Injected into trading platforms
 * Extracts candlestick data and sends to background worker
 */

import { CanvasReader } from './data/canvas-reader.js';
import { CONFIG } from './config.js';

class TradingPlatformObserver {
    constructor() {
        this.canvasReader = null;
        this.scanInterval = null;
        this.isActive = false;
        this.platformType = null;
    }

    /**
     * Initialize observer
     */
    async init() {
        console.log('[Trading AI] Content script loaded');

        // Detect platform
        this.platformType = CanvasReader.detectPlatform();
        console.log(`[Trading AI] Detected platform: ${this.platformType}`);

        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.findAndObserveCanvas());
        } else {
            this.findAndObserveCanvas();
        }

        // Listen for messages from background
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sendResponse);
            return true; // Keep channel open for async response
        });
    }

    /**
     * Find chart canvas and start observing
     */
    findAndObserveCanvas() {
        // Try to find canvas immediately
        let canvas = CanvasReader.findChartCanvas();

        if (canvas) {
            this.setupCanvasReader(canvas);
        } else {
            // Canvas not found, observe DOM for changes
            console.log('[Trading AI] Canvas not found, observing DOM...');
            this.observeDOM();
        }
    }

    /**
     * Observe DOM for canvas appearance
     */
    observeDOM() {
        const observer = new MutationObserver((mutations) => {
            const canvas = CanvasReader.findChartCanvas();
            if (canvas) {
                console.log('[Trading AI] Canvas found via DOM observer');
                this.setupCanvasReader(canvas);
                observer.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Stop observing after 30 seconds
        setTimeout(() => {
            observer.disconnect();
            console.log('[Trading AI] DOM observation timeout');
        }, 30000);
    }

    /**
     * Setup canvas reader
     */
    setupCanvasReader(canvas) {
        this.canvasReader = new CanvasReader(this.platformType);

        if (this.canvasReader.init(canvas)) {
            console.log('[Trading AI] Canvas reader initialized');
            this.startScanning();

            // Notify background that we're ready
            chrome.runtime.sendMessage({
                type: 'CONTENT_READY',
                platform: this.platformType
            });
        } else {
            console.error('[Trading AI] Failed to initialize canvas reader');
        }
    }

    /**
     * Start periodic scanning
     */
    startScanning() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }

        this.isActive = true;
        console.log(`[Trading AI] Starting scan every ${CONFIG.SCAN_INTERVAL}ms`);

        // Initial scan
        this.scanAndSend();

        // Periodic scans
        this.scanInterval = setInterval(() => {
            this.scanAndSend();
        }, CONFIG.SCAN_INTERVAL);
    }

    /**
     * Stop scanning
     */
    stopScanning() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        this.isActive = false;
        console.log('[Trading AI] Scanning stopped');
    }

    /**
     * Scan canvas and send data to background
     */
    async scanAndSend() {
        if (!this.canvasReader) return;

        try {
            const candles = this.canvasReader.readCandles();

            if (candles.length > 0) {
                // Send to background worker
                chrome.runtime.sendMessage({
                    type: 'CANDLES_UPDATE',
                    candles: candles,
                    timestamp: Date.now(),
                    platform: this.platformType
                });

                console.log(`[Trading AI] Sent ${candles.length} candles to background`);
            } else {
                console.warn('[Trading AI] No candles detected');
            }
        } catch (error) {
            console.error('[Trading AI] Scan error:', error);
        }
    }

    /**
     * Handle messages from background
     */
    handleMessage(message, sendResponse) {
        console.log('[Trading AI] Received message:', message.type);

        switch (message.type) {
            case 'START_SCANNING':
                this.startScanning();
                sendResponse({ success: true });
                break;

            case 'STOP_SCANNING':
                this.stopScanning();
                sendResponse({ success: true });
                break;

            case 'GET_STATUS':
                sendResponse({
                    isActive: this.isActive,
                    platform: this.platformType,
                    hasCanvas: !!this.canvasReader
                });
                break;

            case 'TAKE_SCREENSHOT':
                if (this.canvasReader) {
                    const screenshot = this.canvasReader.takeScreenshot();
                    sendResponse({ screenshot });
                } else {
                    sendResponse({ error: 'No canvas reader' });
                }
                break;

            case 'CALIBRATE_PRICE_RANGE':
                if (this.canvasReader && message.min && message.max) {
                    this.canvasReader.calibratePriceRange(message.min, message.max);
                    sendResponse({ success: true });
                } else {
                    sendResponse({ error: 'Invalid calibration data' });
                }
                break;

            default:
                sendResponse({ error: 'Unknown message type' });
        }
    }

    /**
     * Inject visual indicator on page
     */
    injectIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'trading-ai-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            font-weight: bold;
            z-index: 999999;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        indicator.innerHTML = '🤖 AI Trading Agent Active';

        indicator.addEventListener('mouseenter', () => {
            indicator.style.transform = 'scale(1.05)';
        });

        indicator.addEventListener('mouseleave', () => {
            indicator.style.transform = 'scale(1)';
        });

        indicator.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
        });

        document.body.appendChild(indicator);
    }
}

// Initialize observer
const observer = new TradingPlatformObserver();
observer.init();

// Inject indicator after a short delay
setTimeout(() => {
    observer.injectIndicator();
}, 2000);
