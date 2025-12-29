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
    readCandles() {
        if (!this.canvas) {
            return [];
        }

        // If we have no 2D context (e.g. WebGL), what do we do?
        // Attempt to re-acquire or fail once to avoid log spam
        if (!this.ctx && !this.isWebGL) {
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        }

        if (!this.ctx && !this.isWebGL) {
            // Only log once per scan cycle using a throttle or check
            // For now, just return empty to stop spam
            return [];
        }

        const width = this.canvas.width;
        const height = this.canvas.height;

        if (width === 0 || height === 0) {
            console.warn('[Quotex Reader] Canvas has 0 dimensions');
            return [];
        }

        // Get image data from canvas
        // Optimization: Only read the relevant right-side portion
        const scanWidth = Math.min(width, 600);
        const imageData = this.ctx.getImageData(width - scanWidth, 0, scanWidth, height);
        const pixels = imageData.data;

        // Debug: Log canvas info rarely to avoid spam
        if (Math.random() < 0.05) {
            console.log(`[Quotex Reader] Canvas active: ${width}x${height}`);
        }

        // Sample candles from right to left (newest to oldest)
        const candles = [];
        const candleWidth = 15;
        // Calculate number of candles that fit in scan width
        const numCandles = Math.floor(scanWidth / candleWidth);

        // Quick pixel check
        let hasColor = false;
        // Check center line of scan area
        const centerY = Math.floor(height / 2);
        // Check random pixels to see if canvas is blank
        for (let i = 0; i < 300; i += 4) {
            if (pixels[i + 3] > 0) { // Alpha > 0
                hasColor = true;
                break;
            }
        }

        if (!hasColor) {
            // Try a deeper scan if quick check failed
            let totalAlpha = 0;
            for (let i = 3; i < pixels.length; i += 100) {
                totalAlpha += pixels[i];
            }
            if (totalAlpha === 0) {
                console.warn('[Quotex Reader] Canvas appears completely transparent/empty');
                return [];
            }
        }

        // Extract candles
        for (let i = 0; i < numCandles; i++) {
            // X relative to the SCANNED image data, not full canvas
            // We scanned the rightmost 'scanWidth' pixels
            // So x=0 in imageData corresponds to x=(width-scanWidth) in canvas
            // We want to scan from right to left in imageData
            const xInImageData = scanWidth - (i * candleWidth) - (candleWidth / 2);

            if (xInImageData < 0) break;

            const candle = this.extractCandleAtX(xInImageData, pixels, scanWidth, height);

            if (candle) {
                candles.unshift(candle);
            }
        }

        if (candles.length > 0) {
            this.lastCandles = candles;
            // Less spammy success log
            // console.log(`[Quotex Reader] Output: ${candles.length} candles`);
        } else {
            console.warn('[Quotex Reader] No candles extracted (pixels found but no valid structures)');
        }

        return candles;
    } catch(error) {
        logger.error('Failed to read Quotex candles', error);
        // Re-throw or return empty? Returning last known good is safer for UI flicker prevention
        return this.lastCandles;
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
