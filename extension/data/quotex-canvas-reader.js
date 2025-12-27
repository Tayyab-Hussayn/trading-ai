/**
 * Quotex-specific Canvas Reader
 * Handles PixiJS-based chart rendering
 */

import { logger } from '../utils/logger.js';

export class QuotexCanvasReader {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.lastCandles = [];
    }

    /**
     * Initialize with canvas
     */
    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { willReadFrequently: true });
        logger.info('Quotex canvas reader initialized');
        return true;
    }

    /**
     * Read candles from Quotex PixiJS canvas
     * Uses a different approach - sampling the canvas at regular intervals
     */
    readCandles() {
        if (!this.canvas || !this.ctx) {
            return [];
        }

        try {
            const width = this.canvas.width;
            const height = this.canvas.height;

            // Get image data from canvas
            const imageData = this.ctx.getImageData(0, 0, width, height);
            const pixels = imageData.data;

            // Sample candles from right to left (newest to oldest)
            const candles = [];
            const candleWidth = 10; // Approximate width per candle
            const numCandles = Math.min(20, Math.floor(width / candleWidth));

            for (let i = 0; i < numCandles; i++) {
                const x = width - (i * candleWidth) - candleWidth / 2;
                const candle = this.extractCandleAtX(x, pixels, width, height);

                if (candle) {
                    candles.unshift(candle); // Add to beginning (oldest first)
                }
            }

            if (candles.length > 0) {
                this.lastCandles = candles;
                logger.debug(`Extracted ${candles.length} candles from Quotex`);
            }

            return candles;
        } catch (error) {
            logger.error('Failed to read Quotex candles', error);
            return this.lastCandles; // Return last known good data
        }
    }

    /**
     * Extract candle at specific X position
     */
    extractCandleAtX(x, pixels, width, height) {
        // Scan vertical column to find green/red pixels
        let minY = height;
        let maxY = 0;
        let isGreen = false;
        let isRed = false;
        let colorCount = { green: 0, red: 0 };

        for (let y = 0; y < height; y++) {
            const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const a = pixels[idx + 3];

            if (a < 100) continue; // Skip transparent

            // Detect green (bullish) - Quotex uses bright green
            if (g > 150 && g > r && g > b) {
                isGreen = true;
                colorCount.green++;
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }

            // Detect red (bearish) - Quotex uses bright red
            if (r > 150 && r > g && r > b) {
                isRed = true;
                colorCount.red++;
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }

        // If no colored pixels found, skip
        if (!isGreen && !isRed) {
            return null;
        }

        // Determine candle direction based on color count
        const direction = colorCount.green > colorCount.red ? 'green' : 'red';

        // Create candle object with estimated OHLC
        // Note: Without actual price data, we use relative positions
        const high = this.mapYToPrice(minY, height);
        const low = this.mapYToPrice(maxY, height);
        const range = high - low;

        // Estimate open/close based on direction
        let open, close;
        if (direction === 'green') {
            open = low + range * 0.3;
            close = high - range * 0.1;
        } else {
            open = high - range * 0.3;
            close = low + range * 0.1;
        }

        return {
            timestamp: Date.now() - (x / width) * 3600000, // Rough estimate
            open,
            close,
            high,
            low,
            color: direction
        };
    }

    /**
     * Map Y coordinate to relative price
     */
    mapYToPrice(y, height) {
        // Invert Y (0 at top = high price, height at bottom = low price)
        // Return relative value 0-100
        return 100 - (y / height) * 100;
    }

    /**
     * Take screenshot for debugging
     */
    takeScreenshot() {
        if (!this.canvas) return null;
        return this.canvas.toDataURL('image/png');
    }
}

export default QuotexCanvasReader;
