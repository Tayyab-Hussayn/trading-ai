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

            // Debug: Log canvas info
            console.log(`[Quotex Reader] Canvas size: ${width}x${height}`);

            // Sample candles from right to left (newest to oldest)
            const candles = [];
            const candleWidth = 15; // Increased width for better detection
            const numCandles = Math.min(20, Math.floor(width / candleWidth));

            // First, detect if there are ANY colored pixels
            let totalGreen = 0;
            let totalRed = 0;
            let totalWhite = 0;

            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const a = pixels[i + 3];

                if (a < 50) continue;

                // Count green pixels (more lenient)
                if (g > r + 20 && g > b + 20) totalGreen++;

                // Count red pixels (more lenient)
                if (r > g + 20 && r > b + 20) totalRed++;

                // Count white/light pixels
                if (r > 200 && g > 200 && b > 200) totalWhite++;
            }

            console.log(`[Quotex Reader] Pixel analysis: Green=${totalGreen}, Red=${totalRed}, White=${totalWhite}`);

            if (totalGreen === 0 && totalRed === 0) {
                console.warn('[Quotex Reader] No colored candles detected - canvas might be empty or using different colors');
                return [];
            }

            for (let i = 0; i < numCandles; i++) {
                const x = width - (i * candleWidth) - candleWidth / 2;
                const candle = this.extractCandleAtX(x, pixels, width, height);

                if (candle) {
                    candles.unshift(candle); // Add to beginning (oldest first)
                }
            }

            if (candles.length > 0) {
                this.lastCandles = candles;
                console.log(`[Quotex Reader] ✅ Extracted ${candles.length} candles`);
            } else {
                console.warn('[Quotex Reader] ⚠️ No candles extracted despite colored pixels');
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
        let colorCount = { green: 0, red: 0, white: 0 };
        let pixelsFound = 0;

        // Scan a wider area around X for better detection
        for (let offsetX = -3; offsetX <= 3; offsetX++) {
            const scanX = Math.floor(x + offsetX);
            if (scanX < 0 || scanX >= width) continue;

            for (let y = 0; y < height; y++) {
                const idx = (Math.floor(y) * width + scanX) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                const a = pixels[idx + 3];

                if (a < 50) continue; // Skip transparent

                pixelsFound++;

                // Detect green (bullish) - more lenient thresholds
                if (g > r + 20 && g > b + 20 && g > 80) {
                    colorCount.green++;
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }

                // Detect red (bearish) - more lenient thresholds
                if (r > g + 20 && r > b + 20 && r > 80) {
                    colorCount.red++;
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }

                // Detect white/light (might be wicks)
                if (r > 200 && g > 200 && b > 200) {
                    colorCount.white++;
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        // If no colored pixels found, skip
        if (colorCount.green === 0 && colorCount.red === 0 && colorCount.white === 0) {
            return null;
        }

        // Need at least some height
        if (maxY - minY < 5) {
            return null;
        }

        // Determine candle direction
        let direction;
        if (colorCount.green > colorCount.red) {
            direction = 'green';
        } else if (colorCount.red > colorCount.green) {
            direction = 'red';
        } else {
            // If equal or both zero, use white as neutral
            direction = 'neutral';
        }

        // Create candle object with estimated OHLC
        const high = this.mapYToPrice(minY, height);
        const low = this.mapYToPrice(maxY, height);
        const range = high - low;

        // Estimate open/close based on direction
        let open, close;
        if (direction === 'green') {
            open = low + range * 0.2;
            close = high - range * 0.1;
        } else if (direction === 'red') {
            open = high - range * 0.2;
            close = low + range * 0.1;
        } else {
            open = low + range * 0.5;
            close = low + range * 0.5;
        }

        return {
            timestamp: Date.now() - (x / width) * 3600000,
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
