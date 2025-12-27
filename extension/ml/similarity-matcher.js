/**
 * Similarity Matcher - Finds historical patterns similar to current pattern
 * Uses Dynamic Time Warping (DTW) and Cosine Similarity
 */

import { MathUtils } from '../utils/math.js';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';

export class SimilarityMatcher {
    /**
     * Find similar patterns from historical database
     */
    static async findSimilarPatterns(currentFeatures, historicalPatterns) {
        if (!currentFeatures || !historicalPatterns || historicalPatterns.length === 0) {
            logger.warn('Insufficient data for similarity matching');
            return [];
        }

        logger.time('Similarity matching');

        const similarities = [];

        for (const historical of historicalPatterns) {
            try {
                const similarity = this.calculateSimilarity(
                    currentFeatures,
                    historical.features
                );

                if (similarity >= CONFIG.MIN_PATTERN_SIMILARITY) {
                    similarities.push({
                        pattern: historical,
                        similarity,
                        outcome: historical.outcome || null
                    });
                }
            } catch (error) {
                logger.debug('Failed to calculate similarity for pattern', error);
            }
        }

        // Sort by similarity (highest first)
        similarities.sort((a, b) => b.similarity - a.similarity);

        // Return top K
        const topK = similarities.slice(0, CONFIG.TOP_K_SIMILAR_PATTERNS);

        logger.timeEnd('Similarity matching');
        logger.debug(`Found ${topK.length} similar patterns`);

        return topK;
    }

    /**
     * Calculate overall similarity between two feature sets
     */
    static calculateSimilarity(features1, features2) {
        let totalSimilarity = 0;
        let totalWeight = 0;

        const featureWeights = CONFIG.FEATURE_WEIGHTS;

        // Compare array features using DTW
        const arrayFeatures = [
            'bodyRatios',
            'bodyDirections',
            'upperWickRatios',
            'lowerWickRatios'
        ];

        for (const featureName of arrayFeatures) {
            if (features1[featureName] && features2[featureName]) {
                const weight = featureWeights[featureName] || 1.0;
                const similarity = this.dtwSimilarity(
                    features1[featureName],
                    features2[featureName]
                );
                totalSimilarity += similarity * weight;
                totalWeight += weight;
            }
        }

        // Compare scalar features using weighted difference
        const scalarFeatures = [
            'shortTermSlope',
            'mediumTermSlope',
            'longTermSlope',
            'averageTrueRange',
            'volatilityRatio',
            'consecutiveBullish',
            'consecutiveBearish',
            'nearSupport',
            'nearResistance'
        ];

        for (const featureName of scalarFeatures) {
            if (features1[featureName] !== undefined && features2[featureName] !== undefined) {
                const weight = featureWeights[featureName] || 1.0;
                const similarity = this.scalarSimilarity(
                    features1[featureName],
                    features2[featureName]
                );
                totalSimilarity += similarity * weight;
                totalWeight += weight;
            }
        }

        // Compare pattern arrays
        if (features1.patterns && features2.patterns) {
            const weight = featureWeights.patterns || 1.0;
            const similarity = this.patternArraySimilarity(
                features1.patterns,
                features2.patterns
            );
            totalSimilarity += similarity * weight;
            totalWeight += weight;
        }

        return totalWeight === 0 ? 0 : totalSimilarity / totalWeight;
    }

    /**
     * Dynamic Time Warping similarity for time series
     */
    static dtwSimilarity(series1, series2) {
        const distance = this.dtwDistance(series1, series2);

        // Convert distance to similarity (0-1 range)
        // Lower distance = higher similarity
        const maxDistance = Math.max(series1.length, series2.length);
        const similarity = 1 - Math.min(distance / maxDistance, 1);

        return similarity;
    }

    /**
     * Calculate DTW distance
     */
    static dtwDistance(series1, series2) {
        const n = series1.length;
        const m = series2.length;

        // Create cost matrix
        const dtw = Array(n + 1).fill(null).map(() =>
            Array(m + 1).fill(Infinity)
        );
        dtw[0][0] = 0;

        // Fill matrix
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                const cost = Math.abs(series1[i - 1] - series2[j - 1]);
                dtw[i][j] = cost + Math.min(
                    dtw[i - 1][j],      // Insertion
                    dtw[i][j - 1],      // Deletion
                    dtw[i - 1][j - 1]   // Match
                );
            }
        }

        return dtw[n][m];
    }

    /**
     * Cosine similarity for array features (alternative to DTW)
     */
    static cosineSimilarityArray(arr1, arr2) {
        // Pad arrays to same length
        const maxLen = Math.max(arr1.length, arr2.length);
        const padded1 = [...arr1, ...Array(maxLen - arr1.length).fill(0)];
        const padded2 = [...arr2, ...Array(maxLen - arr2.length).fill(0)];

        return MathUtils.cosineSimilarity(padded1, padded2);
    }

    /**
     * Scalar feature similarity
     */
    static scalarSimilarity(val1, val2) {
        // Normalize difference to 0-1 similarity
        const maxVal = Math.max(Math.abs(val1), Math.abs(val2), 1);
        const diff = Math.abs(val1 - val2);
        return 1 - Math.min(diff / maxVal, 1);
    }

    /**
     * Pattern array similarity (Jaccard similarity)
     */
    static patternArraySimilarity(patterns1, patterns2) {
        if (!patterns1 || !patterns2) return 0;
        if (patterns1.length === 0 && patterns2.length === 0) return 1;

        const set1 = new Set(patterns1);
        const set2 = new Set(patterns2);

        // Intersection
        const intersection = new Set([...set1].filter(x => set2.has(x)));

        // Union
        const union = new Set([...set1, ...set2]);

        // Jaccard similarity
        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    /**
     * Predict outcome based on similar patterns
     */
    static predictFromSimilarPatterns(similarPatterns) {
        if (!similarPatterns || similarPatterns.length === 0) {
            return {
                prediction: null,
                confidence: 0,
                reasoning: 'No similar patterns found'
            };
        }

        // Weight outcomes by similarity
        let upScore = 0;
        let downScore = 0;
        let totalWeight = 0;

        for (const { pattern, similarity, outcome } of similarPatterns) {
            if (!outcome) continue;

            const weight = similarity;
            totalWeight += weight;

            if (outcome === 'UP') {
                upScore += weight;
            } else if (outcome === 'DOWN') {
                downScore += weight;
            }
        }

        if (totalWeight === 0) {
            return {
                prediction: null,
                confidence: 0,
                reasoning: 'No validated outcomes in similar patterns'
            };
        }

        const upProbability = upScore / totalWeight;
        const downProbability = downScore / totalWeight;

        const prediction = upProbability > downProbability ? 'UP' : 'DOWN';
        const confidence = Math.max(upProbability, downProbability);

        return {
            prediction,
            confidence,
            upProbability,
            downProbability,
            similarPatternsCount: similarPatterns.length,
            reasoning: `Based on ${similarPatterns.length} similar patterns`
        };
    }

    /**
     * Calculate pattern diversity score
     */
    static calculateDiversityScore(similarPatterns) {
        if (!similarPatterns || similarPatterns.length === 0) return 0;

        // Check outcome diversity
        const outcomes = similarPatterns
            .filter(p => p.outcome)
            .map(p => p.outcome);

        if (outcomes.length === 0) return 0;

        const upCount = outcomes.filter(o => o === 'UP').length;
        const downCount = outcomes.filter(o => o === 'DOWN').length;

        // Higher diversity = less reliable
        // Perfect split (50/50) = low confidence
        // All same = high confidence
        const ratio = Math.min(upCount, downCount) / outcomes.length;
        return 1 - (ratio * 2); // 0 = perfect split, 1 = all same
    }

    /**
     * Get confidence adjustment based on pattern quality
     */
    static getConfidenceAdjustment(similarPatterns) {
        if (!similarPatterns || similarPatterns.length === 0) return 0;

        // Average similarity of top patterns
        const avgSimilarity = MathUtils.mean(
            similarPatterns.slice(0, 5).map(p => p.similarity)
        );

        // Diversity score
        const diversity = this.calculateDiversityScore(similarPatterns);

        // Combine factors
        const adjustment = (avgSimilarity * 0.6) + (diversity * 0.4);

        return MathUtils.clamp(adjustment, 0, 1);
    }
}

export default SimilarityMatcher;
