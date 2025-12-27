/**
 * Feature Extractor - Converts candlestick data into ML-friendly numerical features
 * Extracts 60+ features for pattern recognition and prediction
 */

import { MathUtils } from '../utils/math.js';
import { logger } from '../utils/logger.js';
import { FEATURE_CONFIG } from '../config.js';

export class FeatureExtractor {
    /**
     * Extract all features from candle array
     */
    static extractFeatures(candles) {
        if (!candles || candles.length < 20) {
            logger.warn('Insufficient candles for feature extraction');
            return null;
        }

        try {
            const features = {
                // Basic candle features
                ...this.extractCandleBodyFeatures(candles),
                ...this.extractWickFeatures(candles),

                // Trend features
                ...this.extractTrendFeatures(candles),

                // Volatility features
                ...this.extractVolatilityFeatures(candles),

                // Pattern features
                ...this.extractPatternFeatures(candles),

                // Support/Resistance features
                ...this.extractSupportResistanceFeatures(candles),

                // Momentum features
                ...this.extractMomentumFeatures(candles)
            };

            logger.debug('Features extracted', { featureCount: Object.keys(features).length });
            return features;
        } catch (error) {
            logger.error('Feature extraction failed', error);
            return null;
        }
    }

    /**
     * Extract candle body features
     */
    static extractCandleBodyFeatures(candles) {
        const last20 = candles.slice(-20);

        const bodyRatios = last20.map(c => {
            const body = Math.abs(c.close - c.open);
            const range = c.high - c.low;
            return range === 0 ? 0 : body / range;
        });

        const bodyDirections = last20.map(c =>
            c.close > c.open ? 1 : (c.close < c.open ? -1 : 0)
        );

        const bodySizes = last20.map(c => Math.abs(c.close - c.open));
        const avgBodySize = MathUtils.mean(bodySizes);

        return {
            bodyRatios,
            bodyDirections,
            avgBodyRatio: MathUtils.mean(bodyRatios),
            bodyRatioStd: MathUtils.std(bodyRatios),
            avgBodySize,
            lastBodyRatio: bodyRatios[bodyRatios.length - 1],
            lastBodyDirection: bodyDirections[bodyDirections.length - 1]
        };
    }

    /**
     * Extract wick features
     */
    static extractWickFeatures(candles) {
        const last20 = candles.slice(-20);

        const upperWickRatios = last20.map(c => {
            const upperWick = c.high - Math.max(c.open, c.close);
            const range = c.high - c.low;
            return range === 0 ? 0 : upperWick / range;
        });

        const lowerWickRatios = last20.map(c => {
            const lowerWick = Math.min(c.open, c.close) - c.low;
            const range = c.high - c.low;
            return range === 0 ? 0 : lowerWick / range;
        });

        const wickBalance = upperWickRatios.map((upper, i) =>
            upper - lowerWickRatios[i]
        );

        return {
            upperWickRatios,
            lowerWickRatios,
            wickBalance,
            avgUpperWick: MathUtils.mean(upperWickRatios),
            avgLowerWick: MathUtils.mean(lowerWickRatios),
            avgWickBalance: MathUtils.mean(wickBalance),
            lastUpperWick: upperWickRatios[upperWickRatios.length - 1],
            lastLowerWick: lowerWickRatios[lowerWickRatios.length - 1]
        };
    }

    /**
     * Extract trend features
     */
    static extractTrendFeatures(candles) {
        const closePrices = candles.map(c => c.close);
        const highPrices = candles.map(c => c.high);
        const lowPrices = candles.map(c => c.low);

        // Calculate slopes for different periods
        const shortTermSlope = MathUtils.linearRegressionSlope(
            closePrices.slice(-5)
        );
        const mediumTermSlope = MathUtils.linearRegressionSlope(
            closePrices.slice(-10)
        );
        const longTermSlope = MathUtils.linearRegressionSlope(
            closePrices.slice(-20)
        );

        // Higher highs and lower lows
        const recentHighs = highPrices.slice(-10);
        const recentLows = lowPrices.slice(-10);

        const higherHighs = recentHighs.slice(1).every((h, i) =>
            h >= recentHighs[i]
        );
        const lowerLows = recentLows.slice(1).every((l, i) =>
            l <= recentLows[i]
        );

        return {
            shortTermSlope,
            mediumTermSlope,
            longTermSlope,
            higherHighs: higherHighs ? 1 : 0,
            lowerLows: lowerLows ? 1 : 0,
            trendStrength: Math.abs(shortTermSlope) + Math.abs(mediumTermSlope),
            trendConsistency: Math.sign(shortTermSlope) === Math.sign(longTermSlope) ? 1 : 0
        };
    }

    /**
     * Extract volatility features
     */
    static extractVolatilityFeatures(candles) {
        const atr = MathUtils.calculateATR(candles, 14);

        const ranges = candles.slice(-20).map(c => c.high - c.low);
        const avgRange = MathUtils.mean(ranges);
        const rangeStd = MathUtils.std(ranges);

        const currentRange = ranges[ranges.length - 1];
        const volatilityRatio = avgRange === 0 ? 1 : currentRange / avgRange;

        // Price changes
        const priceChanges = [];
        for (let i = 1; i < candles.length; i++) {
            priceChanges.push(Math.abs(candles[i].close - candles[i - 1].close));
        }
        const avgPriceChange = MathUtils.mean(priceChanges.slice(-20));

        return {
            averageTrueRange: atr,
            volatilityRatio,
            avgRange,
            rangeStd,
            currentRange,
            avgPriceChange,
            volatilityTrend: MathUtils.linearRegressionSlope(ranges.slice(-10))
        };
    }

    /**
     * Extract pattern features
     */
    static extractPatternFeatures(candles) {
        const last20 = candles.slice(-20);

        // Count consecutive bullish/bearish candles
        let consecutiveBullish = 0;
        let consecutiveBearish = 0;

        for (let i = last20.length - 1; i >= 0; i--) {
            if (last20[i].close > last20[i].open) {
                consecutiveBullish++;
                if (consecutiveBearish > 0) break;
            } else if (last20[i].close < last20[i].open) {
                consecutiveBearish++;
                if (consecutiveBullish > 0) break;
            } else {
                break;
            }
        }

        // Bullish/bearish ratio
        const bullishCount = last20.filter(c => c.close > c.open).length;
        const bearishCount = last20.filter(c => c.close < c.open).length;
        const bullishRatio = bullishCount / last20.length;

        // Gap detection
        const gaps = [];
        for (let i = 1; i < last20.length; i++) {
            const prevHigh = last20[i - 1].high;
            const prevLow = last20[i - 1].low;
            const currOpen = last20[i].open;

            if (currOpen > prevHigh) {
                gaps.push(1); // Gap up
            } else if (currOpen < prevLow) {
                gaps.push(-1); // Gap down
            } else {
                gaps.push(0); // No gap
            }
        }
        const gapCount = gaps.filter(g => g !== 0).length;

        return {
            consecutiveBullish,
            consecutiveBearish,
            bullishRatio,
            bearishRatio: 1 - bullishRatio,
            gapCount,
            lastGap: gaps[gaps.length - 1] || 0
        };
    }

    /**
     * Extract support/resistance features
     */
    static extractSupportResistanceFeatures(candles) {
        if (!FEATURE_CONFIG.supportResistance.enabled) {
            return {
                nearSupport: 0,
                nearResistance: 0,
                supportDistance: 0,
                resistanceDistance: 0
            };
        }

        const lookback = Math.min(
            FEATURE_CONFIG.supportResistance.lookback,
            candles.length
        );
        const threshold = FEATURE_CONFIG.supportResistance.threshold;

        const recentCandles = candles.slice(-lookback);
        const currentPrice = candles[candles.length - 1].close;

        // Find support (recent lows)
        const lows = recentCandles.map(c => c.low);
        const support = Math.min(...lows);
        const supportDistance = (currentPrice - support) / currentPrice;
        const nearSupport = supportDistance <= threshold ? 1 : 0;

        // Find resistance (recent highs)
        const highs = recentCandles.map(c => c.high);
        const resistance = Math.max(...highs);
        const resistanceDistance = (resistance - currentPrice) / currentPrice;
        const nearResistance = resistanceDistance <= threshold ? 1 : 0;

        return {
            nearSupport,
            nearResistance,
            supportDistance,
            resistanceDistance,
            supportLevel: support,
            resistanceLevel: resistance
        };
    }

    /**
     * Extract momentum features
     */
    static extractMomentumFeatures(candles) {
        const closePrices = candles.map(c => c.close);

        // Rate of change
        const roc5 = closePrices.length >= 6 ?
            (closePrices[closePrices.length - 1] - closePrices[closePrices.length - 6]) /
            closePrices[closePrices.length - 6] : 0;

        const roc10 = closePrices.length >= 11 ?
            (closePrices[closePrices.length - 1] - closePrices[closePrices.length - 11]) /
            closePrices[closePrices.length - 11] : 0;

        // Momentum
        const momentum5 = closePrices.length >= 6 ?
            closePrices[closePrices.length - 1] - closePrices[closePrices.length - 6] : 0;

        const momentum10 = closePrices.length >= 11 ?
            closePrices[closePrices.length - 1] - closePrices[closePrices.length - 11] : 0;

        return {
            roc5,
            roc10,
            momentum5,
            momentum10,
            momentumStrength: Math.abs(momentum5) + Math.abs(momentum10)
        };
    }

    /**
     * Convert features to flat array for ML model
     */
    static featuresToArray(features) {
        const flatArray = [];

        // Add array features
        if (features.bodyRatios) flatArray.push(...features.bodyRatios);
        if (features.bodyDirections) flatArray.push(...features.bodyDirections);
        if (features.upperWickRatios) flatArray.push(...features.upperWickRatios);
        if (features.lowerWickRatios) flatArray.push(...features.lowerWickRatios);

        // Add scalar features
        const scalarFeatures = [
            features.shortTermSlope || 0,
            features.mediumTermSlope || 0,
            features.longTermSlope || 0,
            features.averageTrueRange || 0,
            features.volatilityRatio || 0,
            features.consecutiveBullish || 0,
            features.consecutiveBearish || 0,
            features.bullishRatio || 0,
            features.nearSupport || 0,
            features.nearResistance || 0,
            features.higherHighs || 0,
            features.lowerLows || 0,
            features.trendStrength || 0,
            features.momentumStrength || 0
        ];

        flatArray.push(...scalarFeatures);

        return flatArray;
    }

    /**
     * Generate feature signature for pattern matching
     */
    static generateSignature(features) {
        // Create a hash-like signature from key features
        const keyFeatures = [
            features.avgBodyRatio,
            features.shortTermSlope,
            features.mediumTermSlope,
            features.volatilityRatio,
            features.consecutiveBullish,
            features.consecutiveBearish,
            features.bullishRatio
        ];

        // Round to 2 decimals and join
        const signature = keyFeatures
            .map(f => MathUtils.round(f || 0, 2))
            .join('_');

        return signature;
    }
}

export default FeatureExtractor;
