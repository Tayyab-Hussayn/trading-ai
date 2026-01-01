/**
 * Canvas Reader for extracting candlestick data from trading platform screens
 * Supports both color-based and SVG-based detection
 */

import { logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';

export class CanvasReader {
    constructor(platformType = 'generic') {
        this.platformConfig = CONFIG.PLATFORMS[platformType] || CONFIG.PLATFORMS.generic;
        this.canvas = null;
        this.ctx = null;
        this.priceRange = { min: 0, max: 100 };
        this.timeRange = { start: Date.now() - 3600000, end: Date.now() };
    }

    /**
     * Initialize canvas reader
     */
    init(canvas) {
        try {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d', { willReadFrequently: true });
            logger.info('Canvas reader initialized', {
                width: canvas.width,
                height: canvas.height,
                platform: this.platformConfig
            });
            return true;
        } catch (error) {
            logger.error('Failed to initialize canvas reader', error);
            return false;
        }
    }

    /**
     * Auto-detect platform type
     */
    static detectPlatform() {
        const hostname = window.location.hostname;
        const title = document.title.toLowerCase();

        // More robust detection using regex and checking title
        if (/quotex|qxbroker|market-qx/.test(hostname) || title.includes('quotex')) {
            return 'quotex';
        } else if (/iqoption/.test(hostname)) {
            return 'iqoption';
        }

        return null;
    }

    /**
     * Find chart canvas on page
     */
    static findChartCanvas() {
        logger.info('[Canvas Finder] Searching for best canvas...');

        // Strategy 1: Look for specific Quotex/PixiJS canvases
        // Quotex often uses a canvas that covers the screen or has specific data checks
        const candidates = Array.from(document.querySelectorAll('canvas'));

        if (candidates.length === 0) {
            logger.warn('No canvas elements found in DOM');
            return null;
        }

        // Filter out small UI canvases (like indicators, sparklines)
        const validCanvases = candidates.filter(c => {
            const rect = c.getBoundingClientRect();
            return c.width > 100 && c.height > 100 && rect.width > 100 && rect.height > 100;
        });

        if (validCanvases.length === 0) {
            logger.warn(`Found ${candidates.length} canvases but all were too small (<400x300)`);
            // Fallback: If absolutely nothing else, return largest of the small ones? 
            // No, better to fail than read garbage. But let's log them.
            candidates.forEach((c, i) => logger.debug(`Canvas ${i}: ${c.width}x${c.height}`));
            return null;
        }

        // Strategy 2: Find the largest canvas by area
        const bestCanvas = validCanvases.reduce((largest, current) => {
            const area = current.width * current.height;
            const largestArea = largest ? largest.width * largest.height : 0;
            return area > largestArea ? current : largest;
        }, null);

        if (bestCanvas) {
            logger.info(`✅ Found best candidate canvas: ${bestCanvas.width}x${bestCanvas.height}`, {
                id: bestCanvas.id,
                class: bestCanvas.className
            });
            return bestCanvas;
        }

        return null;
    }

    /**
     * Read canvas and extract candlestick data
     */
    readCandles() {
        if (!this.canvas || !this.ctx) {
            logger.warn('Canvas not initialized');
            return [];
        }

        try {
            if (this.platformConfig.candleDetection === 'svg-based') {
                return this.readCandlesFromSVG();
            } else {
                return this.readCandlesFromPixels();
            }
        } catch (error) {
            logger.error('Failed to read candles', error);
            return [];
        }
    }

    /**
     * Read candles from canvas pixels (color-based detection)
     */
    readCandlesFromPixels() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const imageData = this.ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        const candles = [];
        const candleWidth = this.estimateCandleWidth(pixels, width, height);
        const numCandles = Math.floor(width / candleWidth);

        logger.debug(`Detecting ${numCandles} candles with width ${candleWidth}px`);

        for (let i = 0; i < numCandles; i++) {
            const x = i * candleWidth;
            const candle = this.extractCandleAtX(x, candleWidth, pixels, width, height);

            if (candle) {
                candles.push(candle);
            }
        }

        logger.debug(`Extracted ${candles.length} candles from pixels`);
        return candles;
    }

    /**
     * Estimate candle width from pixel data
     */
    estimateCandleWidth(pixels, width, height) {
        // Sample middle row
        const y = Math.floor(height / 2);
        const colorChanges = [];
        let lastColor = null;

        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const color = `${r},${g},${b}`;

            if (lastColor && color !== lastColor) {
                colorChanges.push(x);
            }
            lastColor = color;
        }

        // Calculate average distance between color changes
        if (colorChanges.length < 2) return 20; // Default

        const distances = [];
        for (let i = 1; i < colorChanges.length; i++) {
            distances.push(colorChanges[i] - colorChanges[i - 1]);
        }

        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        return Math.max(10, Math.min(50, avgDistance)); // Clamp between 10-50px
    }

    /**
     * Extract candle data at specific X position
     */
    extractCandleAtX(x, candleWidth, pixels, width, height) {
        const greenRGB = this.platformConfig.greenRGB;
        const redRGB = this.platformConfig.redRGB;
        const tolerance = greenRGB.tolerance || 50;

        let topY = height;
        let bottomY = 0;
        let wickTopY = height;
        let wickBottomY = 0;
        let isGreen = false;
        let isRed = false;

        // Scan vertical column at x
        for (let y = 0; y < height; y++) {
            const idx = (y * width + Math.floor(x + candleWidth / 2)) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const a = pixels[idx + 3];

            if (a < 100) continue; // Skip transparent pixels

            // Check if green
            if (this.isColorMatch(r, g, b, greenRGB.r, greenRGB.g, greenRGB.b, tolerance)) {
                isGreen = true;
                topY = Math.min(topY, y);
                bottomY = Math.max(bottomY, y);
            }

            // Check if red
            if (this.isColorMatch(r, g, b, redRGB.r, redRGB.g, redRGB.b, tolerance)) {
                isRed = true;
                topY = Math.min(topY, y);
                bottomY = Math.max(bottomY, y);
            }

            // Detect wicks (thin lines, usually black or gray)
            if (r < 100 && g < 100 && b < 100) {
                wickTopY = Math.min(wickTopY, y);
                wickBottomY = Math.max(wickBottomY, y);
            }
        }

        // No candle detected
        if (!isGreen && !isRed) return null;

        // Map Y coordinates to prices
        const high = this.mapYToPrice(wickTopY, height);
        const low = this.mapYToPrice(wickBottomY, height);
        const bodyTop = this.mapYToPrice(topY, height);
        const bodyBottom = this.mapYToPrice(bottomY, height);

        const candle = {
            timestamp: this.estimateTimestamp(x, width),
            open: isGreen ? bodyBottom : bodyTop,
            close: isGreen ? bodyTop : bodyBottom,
            high,
            low,
            color: isGreen ? 'green' : 'red'
        };

        return candle;
    }

    /**
     * Check if RGB values match target color within tolerance
     */
    isColorMatch(r, g, b, targetR, targetG, targetB, tolerance) {
        return Math.abs(r - targetR) <= tolerance &&
            Math.abs(g - targetG) <= tolerance &&
            Math.abs(b - targetB) <= tolerance;
    }

    /**
     * Map Y pixel coordinate to price
     */
    mapYToPrice(y, height) {
        const { min, max } = this.priceRange;
        // Y is inverted (0 at top, height at bottom)
        const ratio = 1 - (y / height);
        return min + (max - min) * ratio;
    }

    /**
     * Map X pixel coordinate to timestamp
     */
    estimateTimestamp(x, width) {
        const { start, end } = this.timeRange;
        const ratio = x / width;
        return start + (end - start) * ratio;
    }

    /**
     * Read candles from SVG elements (alternative method)
     */
    readCandlesFromSVG() {
        const selector = this.platformConfig.selector;
        const candleElements = document.querySelectorAll(selector);
        const candles = [];

        candleElements.forEach((element, index) => {
            try {
                const rect = element.getBoundingClientRect();
                const fill = element.getAttribute('fill') || element.style.fill;
                const isGreen = fill.includes('green') || fill.includes('#00') || fill.includes('rgb(0,');

                // Extract data attributes if available
                const open = parseFloat(element.getAttribute('data-open')) || 0;
                const close = parseFloat(element.getAttribute('data-close')) || 0;
                const high = parseFloat(element.getAttribute('data-high')) || 0;
                const low = parseFloat(element.getAttribute('data-low')) || 0;

                candles.push({
                    timestamp: Date.now() - (candleElements.length - index) * 60000,
                    open: open || (isGreen ? rect.bottom : rect.top),
                    close: close || (isGreen ? rect.top : rect.bottom),
                    high: high || rect.top,
                    low: low || rect.bottom,
                    color: isGreen ? 'green' : 'red'
                });
            } catch (error) {
                logger.debug('Failed to parse SVG candle', error);
            }
        });

        logger.debug(`Extracted ${candles.length} candles from SVG`);
        return candles;
    }

    /**
     * Calibrate price range from visible data
     */
    calibratePriceRange(min, max) {
        this.priceRange = { min, max };
        logger.debug('Price range calibrated', this.priceRange);
    }

    /**
     * Calibrate time range
     */
    calibrateTimeRange(start, end) {
        this.timeRange = { start, end };
        logger.debug('Time range calibrated', this.timeRange);
    }

    /**
     * Take screenshot of canvas for debugging
     */
    takeScreenshot() {
        if (!this.canvas) return null;
        return this.canvas.toDataURL('image/png');
    }
}

export default CanvasReader;
