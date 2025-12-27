/**
 * Pattern Detector - Identifies classic technical candlestick patterns
 * Implements detection for hammer, doji, engulfing, morning/evening star, etc.
 */

import { logger } from '../utils/logger.js';
import { PATTERN_CONFIG } from '../config.js';

export class PatternDetector {
    /**
     * Detect all patterns in candle array
     */
    static detectPatterns(candles) {
        if (!candles || candles.length < 3) {
            return [];
        }

        const patterns = [];

        // Single candle patterns
        if (PATTERN_CONFIG.hammer.enabled && this.isHammer(candles[candles.length - 1])) {
            patterns.push('hammer');
        }

        if (PATTERN_CONFIG.doji.enabled && this.isDoji(candles[candles.length - 1])) {
            patterns.push('doji');
        }

        // Two candle patterns
        if (candles.length >= 2) {
            if (PATTERN_CONFIG.engulfing.enabled) {
                if (this.isBullishEngulfing(candles.slice(-2))) {
                    patterns.push('bullish_engulfing');
                }
                if (this.isBearishEngulfing(candles.slice(-2))) {
                    patterns.push('bearish_engulfing');
                }
            }
        }

        // Three candle patterns
        if (candles.length >= 3) {
            if (PATTERN_CONFIG.morningstar.enabled && this.isMorningStar(candles.slice(-3))) {
                patterns.push('morning_star');
            }

            if (PATTERN_CONFIG.eveningstar.enabled && this.isEveningStar(candles.slice(-3))) {
                patterns.push('evening_star');
            }

            if (PATTERN_CONFIG.threeWhiteSoldiers.enabled && this.isThreeWhiteSoldiers(candles.slice(-3))) {
                patterns.push('three_white_soldiers');
            }

            if (PATTERN_CONFIG.threeBlackCrows.enabled && this.isThreeBlackCrows(candles.slice(-3))) {
                patterns.push('three_black_crows');
            }
        }

        // Additional patterns
        patterns.push(...this.detectAdvancedPatterns(candles));

        logger.debug('Patterns detected', patterns);
        return patterns;
    }

    /**
     * Hammer pattern - bullish reversal
     * Long lower shadow, small body at top, little to no upper shadow
     */
    static isHammer(candle) {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const upperWick = candle.high - Math.max(candle.open, candle.close);

        if (range === 0) return false;

        const bodyRatio = body / range;
        const lowerWickRatio = lowerWick / body;
        const upperWickRatio = upperWick / body;

        return (
            lowerWickRatio >= PATTERN_CONFIG.hammer.minLowerWickRatio &&
            upperWickRatio <= PATTERN_CONFIG.hammer.maxUpperWickRatio &&
            bodyRatio <= PATTERN_CONFIG.hammer.maxBodyRatio
        );
    }

    /**
     * Inverted Hammer - bullish reversal
     * Long upper shadow, small body at bottom
     */
    static isInvertedHammer(candle) {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;

        if (range === 0) return false;

        const bodyRatio = body / range;
        const upperWickRatio = upperWick / body;
        const lowerWickRatio = lowerWick / body;

        return (
            upperWickRatio >= 2.0 &&
            lowerWickRatio <= 0.3 &&
            bodyRatio <= 0.3
        );
    }

    /**
     * Shooting Star - bearish reversal
     * Long upper shadow, small body at bottom
     */
    static isShootingStar(candle) {
        return this.isInvertedHammer(candle) && candle.close < candle.open;
    }

    /**
     * Doji pattern - indecision
     * Very small body, open ≈ close
     */
    static isDoji(candle) {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;

        if (range === 0) return false;

        const bodyRatio = body / range;
        return bodyRatio <= PATTERN_CONFIG.doji.maxBodyRatio;
    }

    /**
     * Bullish Engulfing - bullish reversal
     * Large green candle completely engulfs previous red candle
     */
    static isBullishEngulfing(candles) {
        if (candles.length < 2) return false;

        const [prev, curr] = candles;

        const prevBearish = prev.close < prev.open;
        const currBullish = curr.close > curr.open;
        const currEngulfs = curr.open < prev.close && curr.close > prev.open;

        const prevBody = Math.abs(prev.close - prev.open);
        const currBody = Math.abs(curr.close - curr.open);
        const bodyRatio = prevBody === 0 ? 999 : currBody / prevBody;

        return (
            prevBearish &&
            currBullish &&
            currEngulfs &&
            bodyRatio >= PATTERN_CONFIG.engulfing.minBodyRatio
        );
    }

    /**
     * Bearish Engulfing - bearish reversal
     * Large red candle completely engulfs previous green candle
     */
    static isBearishEngulfing(candles) {
        if (candles.length < 2) return false;

        const [prev, curr] = candles;

        const prevBullish = prev.close > prev.open;
        const currBearish = curr.close < curr.open;
        const currEngulfs = curr.open > prev.close && curr.close < prev.open;

        const prevBody = Math.abs(prev.close - prev.open);
        const currBody = Math.abs(curr.close - curr.open);
        const bodyRatio = prevBody === 0 ? 999 : currBody / prevBody;

        return (
            prevBullish &&
            currBearish &&
            currEngulfs &&
            bodyRatio >= PATTERN_CONFIG.engulfing.minBodyRatio
        );
    }

    /**
     * Morning Star - bullish reversal
     * Three candles: bearish, small body, bullish
     */
    static isMorningStar(candles) {
        if (candles.length < 3) return false;

        const [first, second, third] = candles;

        const firstBearish = first.close < first.open;
        const thirdBullish = third.close > third.open;

        const secondBody = Math.abs(second.close - second.open);
        const secondRange = second.high - second.low;
        const secondSmall = secondRange === 0 ? false : (secondBody / secondRange) < 0.3;

        const thirdCloseAboveFirstMid = third.close > (first.open + first.close) / 2;

        return firstBearish && secondSmall && thirdBullish && thirdCloseAboveFirstMid;
    }

    /**
     * Evening Star - bearish reversal
     * Three candles: bullish, small body, bearish
     */
    static isEveningStar(candles) {
        if (candles.length < 3) return false;

        const [first, second, third] = candles;

        const firstBullish = first.close > first.open;
        const thirdBearish = third.close < third.open;

        const secondBody = Math.abs(second.close - second.open);
        const secondRange = second.high - second.low;
        const secondSmall = secondRange === 0 ? false : (secondBody / secondRange) < 0.3;

        const thirdCloseBelowFirstMid = third.close < (first.open + first.close) / 2;

        return firstBullish && secondSmall && thirdBearish && thirdCloseBelowFirstMid;
    }

    /**
     * Three White Soldiers - strong bullish continuation
     * Three consecutive large bullish candles
     */
    static isThreeWhiteSoldiers(candles) {
        if (candles.length < 3) return false;

        const allBullish = candles.every(c => c.close > c.open);
        if (!allBullish) return false;

        // Each candle should open within previous body
        for (let i = 1; i < candles.length; i++) {
            const prevBody = { low: candles[i - 1].open, high: candles[i - 1].close };
            const currOpen = candles[i].open;

            if (currOpen < prevBody.low || currOpen > prevBody.high) {
                return false;
            }
        }

        // Each close should be higher than previous
        for (let i = 1; i < candles.length; i++) {
            if (candles[i].close <= candles[i - 1].close) {
                return false;
            }
        }

        return true;
    }

    /**
     * Three Black Crows - strong bearish continuation
     * Three consecutive large bearish candles
     */
    static isThreeBlackCrows(candles) {
        if (candles.length < 3) return false;

        const allBearish = candles.every(c => c.close < c.open);
        if (!allBearish) return false;

        // Each candle should open within previous body
        for (let i = 1; i < candles.length; i++) {
            const prevBody = { low: candles[i - 1].close, high: candles[i - 1].open };
            const currOpen = candles[i].open;

            if (currOpen < prevBody.low || currOpen > prevBody.high) {
                return false;
            }
        }

        // Each close should be lower than previous
        for (let i = 1; i < candles.length; i++) {
            if (candles[i].close >= candles[i - 1].close) {
                return false;
            }
        }

        return true;
    }

    /**
     * Detect advanced patterns
     */
    static detectAdvancedPatterns(candles) {
        const patterns = [];

        if (candles.length < 5) return patterns;

        const last = candles[candles.length - 1];

        // Piercing Pattern - bullish reversal
        if (this.isPiercingPattern(candles.slice(-2))) {
            patterns.push('piercing_pattern');
        }

        // Dark Cloud Cover - bearish reversal
        if (this.isDarkCloudCover(candles.slice(-2))) {
            patterns.push('dark_cloud_cover');
        }

        // Tweezer Top/Bottom
        if (this.isTweezerTop(candles.slice(-2))) {
            patterns.push('tweezer_top');
        }

        if (this.isTweezerBottom(candles.slice(-2))) {
            patterns.push('tweezer_bottom');
        }

        return patterns;
    }

    /**
     * Piercing Pattern - bullish reversal
     */
    static isPiercingPattern(candles) {
        if (candles.length < 2) return false;

        const [prev, curr] = candles;
        const prevBearish = prev.close < prev.open;
        const currBullish = curr.close > curr.open;

        const prevMid = (prev.open + prev.close) / 2;
        const currClosesAboveMid = curr.close > prevMid;
        const currOpensBelow = curr.open < prev.close;

        return prevBearish && currBullish && currOpensBelow && currClosesAboveMid;
    }

    /**
     * Dark Cloud Cover - bearish reversal
     */
    static isDarkCloudCover(candles) {
        if (candles.length < 2) return false;

        const [prev, curr] = candles;
        const prevBullish = prev.close > prev.open;
        const currBearish = curr.close < curr.open;

        const prevMid = (prev.open + prev.close) / 2;
        const currClosesBelowMid = curr.close < prevMid;
        const currOpensAbove = curr.open > prev.close;

        return prevBullish && currBearish && currOpensAbove && currClosesBelowMid;
    }

    /**
     * Tweezer Top - bearish reversal
     */
    static isTweezerTop(candles) {
        if (candles.length < 2) return false;

        const [prev, curr] = candles;
        const highsMatch = Math.abs(prev.high - curr.high) / prev.high < 0.001; // Within 0.1%
        const prevBullish = prev.close > prev.open;
        const currBearish = curr.close < curr.open;

        return highsMatch && prevBullish && currBearish;
    }

    /**
     * Tweezer Bottom - bullish reversal
     */
    static isTweezerBottom(candles) {
        if (candles.length < 2) return false;

        const [prev, curr] = candles;
        const lowsMatch = Math.abs(prev.low - curr.low) / prev.low < 0.001; // Within 0.1%
        const prevBearish = prev.close < prev.open;
        const currBullish = curr.close > curr.open;

        return lowsMatch && prevBearish && currBullish;
    }

    /**
     * Get pattern significance (bullish/bearish/neutral)
     */
    static getPatternSignificance(pattern) {
        const bullishPatterns = [
            'hammer',
            'bullish_engulfing',
            'morning_star',
            'three_white_soldiers',
            'piercing_pattern',
            'tweezer_bottom'
        ];

        const bearishPatterns = [
            'shooting_star',
            'bearish_engulfing',
            'evening_star',
            'three_black_crows',
            'dark_cloud_cover',
            'tweezer_top'
        ];

        if (bullishPatterns.includes(pattern)) return 'bullish';
        if (bearishPatterns.includes(pattern)) return 'bearish';
        return 'neutral';
    }
}

export default PatternDetector;
