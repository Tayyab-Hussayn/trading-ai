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
        try {
            // Try 2D first
            this.ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!this.ctx) {
                // If 2D fails, it might be a WebGL canvas in use
                // We can't easily read pixels from a WebGL context that's already initialized by the site
                // unless we intercept it. 
                // However, PixiJS often has a 'view' canvas that can be read via toDataURL if preserveDrawingBuffer is on.
                // Or sometimes 2D works but returns null if context mismatch.
                logger.warn('Could not get 2D context. Canvas might be WebGL or already initialized.');

                // Hack: Try to see if it's WebGL
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (gl) {
                    logger.info('Detected WebGL context. Pixel reading might be limited.');
                    // We can't read WebGL pixels via getContext('2d'). We have to use toDataURL or gl.readPixels
                    // But we can't get the gl context if the site already got it without preserveDrawingBuffer: false?
                    // Actually, if we can't get 2d, we can't simply "fix" it here.
                    // We will fall back to `readCandles` handling this (e.g. using a different method or failing gracefully).
                    this.isWebGL = true;
                }
            }
        } catch (e) {
            logger.error('Context init error', e);
        }

        logger.info('Quotex canvas reader initialized');
        return true;
    }

    /**
     * Read candles from Quotex PixiJS canvas
     * Uses a different approach - sampling the canvas at regular intervals
     */
    async readCandles() {
        if (!this.canvas) return [];

        // Strategy 1: Try direct 2D access (fastest)
        if (!this.ctx && !this.isWebGL) {
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        }

        if (this.ctx) {
            return this.readCandlesFromContext(this.ctx, this.canvas.width, this.canvas.height);
        }

        // Strategy 2: WebGL / Protected Canvas -> Screenshot (slower but reliable)
        return await this.readCandlesFromScreenshot();
    }

    readCandlesFromContext(ctx, width, height) {
        try {
            if (width === 0 || height === 0) return [];
            const scanWidth = Math.min(width, 600);
            const imageData = ctx.getImageData(width - scanWidth, 0, scanWidth, height);
            return this.processImageData(imageData.data, scanWidth, height);
        } catch (error) {
            logger.error('Failed to read context pixels', error);
            return [];
        }
    }

    async readCandlesFromScreenshot() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' }, (response) => {
                if (!response || !response.dataUrl) {
                    resolve([]);
                    return;
                }
                const img = new Image();
                img.onload = () => resolve(this.processScreenshotImage(img));
                img.onerror = () => resolve([]);
                img.src = response.dataUrl;
            });
        });
    }

    processScreenshotImage(img) {
        const rect = this.canvas.getBoundingClientRect();
        const scale = window.devicePixelRatio || 1;
        const x = rect.left * scale;
        const y = rect.top * scale;
        const w = rect.width * scale;
        const h = rect.height * scale;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return [];

        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        const scanWidth = Math.min(w, 600);
        const imageData = ctx.getImageData(w - scanWidth, 0, scanWidth, h);
        return this.processImageData(imageData.data, scanWidth, h);
    }

    processImageData(pixels, scanWidth, height) {
        const candles = [];

        // Dynamically estimate candle width instead of hardcoding
        const candleWidth = this.estimateCandleWidth(pixels, scanWidth, height);
        const numCandles = Math.floor(scanWidth / candleWidth);

        logger.info(`Extracted candle width: ${candleWidth.toFixed(1)}px, count: ${numCandles}`);

        let hasColor = false;
        for (let i = 0; i < 300; i += 4) {
            if (pixels[i + 3] > 0) {
                hasColor = true;
                break;
            }
        }

        if (!hasColor) {
            let totalAlpha = 0;
            for (let i = 3; i < pixels.length; i += 100) totalAlpha += pixels[i];
            if (totalAlpha === 0) return [];
        }

        for (let i = 0; i < numCandles; i++) {
            // Center the sampling X in the middle of the estimated candle slot
            const xInImageData = scanWidth - (i * candleWidth) - (candleWidth / 2);
            if (xInImageData < 0) break;
            const candle = this.extractCandleAtX(xInImageData, pixels, scanWidth, height, i);
            if (candle) candles.unshift(candle);
        }

        if (candles.length > 0) this.lastCandles = candles;
        return candles;
    }

    /**
     * Estimate candle width dynamically
     */
    estimateCandleWidth(pixels, width, height) {
        // Sample middle row
        const y = Math.floor(height / 2);
        const colorChanges = [];
        let lastColor = null;

        // Scan the row
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            // Simple check: is it non-transparent?
            const alpha = pixels[idx + 3];
            const hasContent = alpha > 50;

            if (hasContent && !lastColor) {
                // Entered a candle
                colorChanges.push(x);
                lastColor = true;
            } else if (!hasContent && lastColor) {
                // Exited a candle
                // colorChanges.push(x); // track gaps too?
                lastColor = false;
            }
        }

        if (colorChanges.length < 2) return 15; // Fallback

        const distances = [];
        for (let i = 1; i < colorChanges.length; i++) {
            distances.push(colorChanges[i] - colorChanges[i - 1]);
        }

        // Median distance
        distances.sort((a, b) => a - b);
        const median = distances[Math.floor(distances.length / 2)];

        if (median > 5 && median < 100) return median;
        return 15; // Fallback
    }

    /**
     * Convert RGB to HSL
     */
    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h * 360, s, l];
    }

    /**
     * Extract candle at specific X position
     */
    extractCandleAtX(x, pixels, width, height, index = 0) {
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

                const [h, s, l] = this.rgbToHsl(r, g, b);

                // Skip very dark (background) or very transparent pixels
                // Quotex background is dark, so L < 0.15 is likely background
                if (l < 0.15) continue;

                pixelsFound++;

                // Detect Green (Bullish) - Broaden range for Teal/Cyan/Lime
                // Hue 70-170 (Green is 120, Cyan is 180)
                // Saturation > 0.15 (allow slightly washed out)
                if (h >= 70 && h <= 175 && s > 0.15) {
                    colorCount.green++;
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }

                // Detect Red (Bearish) - Broaden range for Orange/Purple-Red
                // Hue 330-360 OR 0-40 (Red is 0)
                // Saturation > 0.15
                else if ((h >= 330 || h <= 40) && s > 0.15) {
                    colorCount.red++;
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }

                // Detect White/Gray (Wicks/Neutral)
                else if (l > 0.6 || s < 0.1) {
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
        if (maxY - minY < 3) { // Lower threshold
            return null;
        }

        // Determine candle direction
        let direction;
        // Require a dominant color
        // If Green is significant
        if (colorCount.green > colorCount.red && colorCount.green > 2) {
            direction = 'green';
        }
        // If Red is significant
        else if (colorCount.red > colorCount.green && colorCount.red > 2) {
            direction = 'red';
        } else {
            // Neutral
            direction = 'neutral';
        }

        // Create candle object with estimated OHLC
        // mapYToPrice: 0 (top) -> 100, height (bottom) -> 0
        const high = this.mapYToPrice(minY, height); // Top pixel = High Price
        const low = this.mapYToPrice(maxY, height);  // Bottom pixel = Low Price
        const range = high - low;

        // Estimate open/close based on direction
        let open, close;

        // Improved Estimation Logic
        if (direction === 'green') {
            // Green: Opens low, Closes high
            // Body usually covers ~60-80% of range (unless specific pattern)
            // We assume a standard candle structure for estimation
            open = low + (range * 0.2);
            close = high - (range * 0.1);
        } else if (direction === 'red') {
            // Red: Opens high, Closes low
            open = high - (range * 0.2);
            close = low + (range * 0.1);
        } else {
            // Neutral/Doji: Open ~= Close near midpoint
            open = low + (range * 0.5);
            close = low + (range * 0.5);
        }

        // 2-Minute Candle Timestamp
        // index 0 = newest, index 1 = 2 mins ago, etc.
        const timeOffset = index * 2 * 60 * 1000;

        return {
            timestamp: Date.now() - timeOffset,
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
     * Check if canvas is valid
     */
    checkCanvas() {
        if (!this.canvas) return false;
        if (!this.canvas.isConnected) return false;
        if (this.canvas.width === 0 || this.canvas.height === 0) return false;
        return true;
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
