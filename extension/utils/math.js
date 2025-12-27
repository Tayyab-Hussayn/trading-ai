/**
 * Mathematical utility functions for Binary Trading AI Agent
 */

export const MathUtils = {
    /**
     * Calculate dot product of two vectors
     */
    dotProduct(vec1, vec2) {
        if (vec1.length !== vec2.length) {
            throw new Error('Vectors must have same length');
        }
        return vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    },

    /**
     * Calculate magnitude (length) of a vector
     */
    magnitude(vec) {
        return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    },

    /**
     * Calculate cosine similarity between two vectors
     */
    cosineSimilarity(vec1, vec2) {
        const dot = this.dotProduct(vec1, vec2);
        const mag1 = this.magnitude(vec1);
        const mag2 = this.magnitude(vec2);

        if (mag1 === 0 || mag2 === 0) return 0;
        return dot / (mag1 * mag2);
    },

    /**
     * Calculate mean of an array
     */
    mean(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    },

    /**
     * Calculate standard deviation
     */
    std(arr) {
        if (arr.length === 0) return 0;
        const avg = this.mean(arr);
        const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
        return Math.sqrt(this.mean(squareDiffs));
    },

    /**
     * Calculate linear regression slope
     */
    linearRegressionSlope(values) {
        if (values.length < 2) return 0;

        const n = values.length;
        const indices = Array.from({ length: n }, (_, i) => i);

        const sumX = this.mean(indices) * n;
        const sumY = this.mean(values) * n;
        const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
        const sumXX = indices.reduce((sum, x) => sum + x * x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return slope;
    },

    /**
     * Calculate Euclidean distance
     */
    euclideanDistance(vec1, vec2) {
        if (vec1.length !== vec2.length) {
            throw new Error('Vectors must have same length');
        }
        const squaredDiffs = vec1.map((val, i) => Math.pow(val - vec2[i], 2));
        return Math.sqrt(squaredDiffs.reduce((sum, val) => sum + val, 0));
    },

    /**
     * Normalize array to 0-1 range
     */
    normalize(arr) {
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        const range = max - min;

        if (range === 0) return arr.map(() => 0.5);
        return arr.map(val => (val - min) / range);
    },

    /**
     * Calculate correlation coefficient
     */
    correlation(arr1, arr2) {
        if (arr1.length !== arr2.length || arr1.length === 0) return 0;

        const mean1 = this.mean(arr1);
        const mean2 = this.mean(arr2);

        let numerator = 0;
        let sum1 = 0;
        let sum2 = 0;

        for (let i = 0; i < arr1.length; i++) {
            const diff1 = arr1[i] - mean1;
            const diff2 = arr2[i] - mean2;
            numerator += diff1 * diff2;
            sum1 += diff1 * diff1;
            sum2 += diff2 * diff2;
        }

        const denominator = Math.sqrt(sum1 * sum2);
        return denominator === 0 ? 0 : numerator / denominator;
    },

    /**
     * Calculate Average True Range (ATR)
     */
    calculateATR(candles, period = 14) {
        if (candles.length < period + 1) return 0;

        const trueRanges = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;

            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trueRanges.push(tr);
        }

        return this.mean(trueRanges.slice(-period));
    },

    /**
     * Clamp value between min and max
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * Round to specified decimal places
     */
    round(value, decimals = 2) {
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }
};

export default MathUtils;
