/**
 * Ensemble Predictor - Combines historical pattern matching with ML model predictions
 * Weighted ensemble: 40% historical + 60% ML
 */

import { logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';
import { FeatureExtractor } from './feature-extractor.js';
import { PatternDetector } from './pattern-detector.js';
import { SimilarityMatcher } from './similarity-matcher.js';
import { NeuralNetwork } from './neural-network.js';
import { MathUtils } from '../utils/math.js';

export class EnsemblePredictor {
    constructor(database, neuralNetwork) {
        this.database = database;
        this.neuralNetwork = neuralNetwork;
    }

    /**
     * Make ensemble prediction from candles
     */
    async predict(candles) {
        if (!candles || candles.length < 20) {
            logger.warn('Insufficient candles for prediction');
            return null;
        }

        try {
            logger.time('Ensemble prediction');

            // Extract features
            const features = FeatureExtractor.extractFeatures(candles);
            if (!features) {
                logger.error('Feature extraction failed');
                return null;
            }

            // Detect patterns
            const patterns = PatternDetector.detectPatterns(candles);
            features.patterns = patterns;

            // Get historical prediction
            const historicalPrediction = await this.getHistoricalPrediction(features);

            // Get ML prediction
            const mlPrediction = await this.getMLPrediction(features);

            // Combine predictions
            const ensemblePrediction = this.combinePredictions(
                historicalPrediction,
                mlPrediction,
                features
            );

            logger.timeEnd('Ensemble prediction');
            logger.info('Ensemble prediction complete', ensemblePrediction);

            return ensemblePrediction;
        } catch (error) {
            logger.error('Ensemble prediction failed', error);
            return null;
        }
    }

    /**
     * Get prediction from historical pattern matching
     */
    async getHistoricalPrediction(features) {
        try {
            // Get all historical patterns
            const historicalPatterns = await this.database.getAllPatterns();

            if (historicalPatterns.length === 0) {
                logger.info('No historical patterns available');
                return {
                    prediction: null,
                    confidence: 0,
                    method: 'historical'
                };
            }

            // Find similar patterns
            const similarPatterns = await SimilarityMatcher.findSimilarPatterns(
                features,
                historicalPatterns
            );

            // Predict from similar patterns
            const prediction = SimilarityMatcher.predictFromSimilarPatterns(similarPatterns);

            return {
                ...prediction,
                method: 'historical',
                similarPatterns: similarPatterns.length
            };
        } catch (error) {
            logger.error('Historical prediction failed', error);
            return {
                prediction: null,
                confidence: 0,
                method: 'historical'
            };
        }
    }

    /**
     * Get prediction from ML model
     */
    async getMLPrediction(features) {
        try {
            // Convert features to array
            const featureArray = FeatureExtractor.featuresToArray(features);

            // Make prediction
            const prediction = await this.neuralNetwork.predict(featureArray);

            if (!prediction) {
                return {
                    prediction: null,
                    confidence: 0,
                    method: 'ml'
                };
            }

            return {
                prediction: prediction.prediction,
                confidence: prediction.confidence,
                probabilities: {
                    up: prediction.up,
                    down: prediction.down,
                    neutral: prediction.neutral
                },
                method: 'ml'
            };
        } catch (error) {
            logger.error('ML prediction failed', error);
            return {
                prediction: null,
                confidence: 0,
                method: 'ml'
            };
        }
    }

    /**
     * Combine historical and ML predictions
     */
    combinePredictions(historicalPred, mlPred, features) {
        const weights = CONFIG.ENSEMBLE_WEIGHTS;

        // If one method failed, use the other
        if (!historicalPred.prediction && mlPred.prediction) {
            return {
                ...mlPred,
                method: 'ml_only',
                features
            };
        }

        if (historicalPred.prediction && !mlPred.prediction) {
            return {
                ...historicalPred,
                method: 'historical_only',
                features
            };
        }

        // Both failed
        if (!historicalPred.prediction && !mlPred.prediction) {
            return {
                prediction: null,
                confidence: 0,
                method: 'none',
                reasoning: 'Both methods failed',
                features
            };
        }

        // Both succeeded - combine them
        const historicalScore = this.getPredictionScore(historicalPred);
        const mlScore = this.getPredictionScore(mlPred);

        // Weighted average
        const combinedScore = {
            up: (historicalScore.up * weights.historical) + (mlScore.up * weights.ml),
            down: (historicalScore.down * weights.historical) + (mlScore.down * weights.ml)
        };

        // Determine final prediction
        const prediction = combinedScore.up > combinedScore.down ? 'UP' : 'DOWN';
        const confidence = Math.max(combinedScore.up, combinedScore.down);

        // Apply pattern-based adjustments
        const adjustedConfidence = this.applyPatternAdjustments(
            confidence,
            features.patterns
        );

        // Check if meets minimum threshold
        const meetsThreshold = adjustedConfidence >= CONFIG.MIN_CONFIDENCE_THRESHOLD;

        return {
            prediction,
            confidence: MathUtils.round(adjustedConfidence, 3),
            rawConfidence: MathUtils.round(confidence, 3),
            meetsThreshold,
            method: 'ensemble',
            components: {
                historical: {
                    prediction: historicalPred.prediction,
                    confidence: historicalPred.confidence,
                    weight: weights.historical
                },
                ml: {
                    prediction: mlPred.prediction,
                    confidence: mlPred.confidence,
                    weight: weights.ml
                }
            },
            scores: combinedScore,
            patterns: features.patterns,
            features,
            timestamp: Date.now()
        };
    }

    /**
     * Convert prediction to score object
     */
    getPredictionScore(prediction) {
        if (prediction.probabilities) {
            return {
                up: prediction.probabilities.up,
                down: prediction.probabilities.down
            };
        }

        // For historical predictions
        if (prediction.upProbability !== undefined) {
            return {
                up: prediction.upProbability,
                down: prediction.downProbability
            };
        }

        // Fallback: convert binary prediction to scores
        const confidence = prediction.confidence || 0.5;
        if (prediction.prediction === 'UP') {
            return { up: confidence, down: 1 - confidence };
        } else if (prediction.prediction === 'DOWN') {
            return { up: 1 - confidence, down: confidence };
        }

        return { up: 0.5, down: 0.5 };
    }

    /**
     * Apply confidence adjustments based on detected patterns
     */
    applyPatternAdjustments(confidence, patterns) {
        if (!patterns || patterns.length === 0) {
            return confidence;
        }

        let adjustment = 0;

        // Strong bullish patterns increase UP confidence
        const strongBullish = [
            'three_white_soldiers',
            'morning_star',
            'bullish_engulfing'
        ];

        // Strong bearish patterns increase DOWN confidence
        const strongBearish = [
            'three_black_crows',
            'evening_star',
            'bearish_engulfing'
        ];

        // Count strong patterns
        const bullishCount = patterns.filter(p => strongBullish.includes(p)).length;
        const bearishCount = patterns.filter(p => strongBearish.includes(p)).length;

        // Adjust confidence based on pattern strength
        if (bullishCount > 0 || bearishCount > 0) {
            adjustment = 0.05 * Math.max(bullishCount, bearishCount);
        }

        // Conflicting patterns reduce confidence
        if (bullishCount > 0 && bearishCount > 0) {
            adjustment = -0.1;
        }

        const adjusted = confidence + adjustment;
        return MathUtils.clamp(adjusted, 0, 1);
    }

    /**
     * Get prediction explanation
     */
    getExplanation(prediction) {
        if (!prediction || !prediction.prediction) {
            return 'No prediction available';
        }

        const parts = [];

        // Main prediction
        parts.push(`Prediction: ${prediction.prediction} (${(prediction.confidence * 100).toFixed(1)}% confidence)`);

        // Method used
        if (prediction.method === 'ensemble') {
            parts.push(`Based on ensemble of historical patterns and ML model`);
        } else {
            parts.push(`Based on ${prediction.method} method`);
        }

        // Patterns detected
        if (prediction.patterns && prediction.patterns.length > 0) {
            parts.push(`Patterns detected: ${prediction.patterns.join(', ')}`);
        }

        // Component predictions
        if (prediction.components) {
            const hist = prediction.components.historical;
            const ml = prediction.components.ml;
            parts.push(`Historical: ${hist.prediction} (${(hist.confidence * 100).toFixed(1)}%)`);
            parts.push(`ML Model: ${ml.prediction} (${(ml.confidence * 100).toFixed(1)}%)`);
        }

        return parts.join('\n');
    }

    /**
     * Validate prediction quality
     */
    validatePrediction(prediction) {
        const issues = [];

        if (!prediction) {
            issues.push('No prediction generated');
            return { valid: false, issues };
        }

        if (!prediction.prediction) {
            issues.push('Missing prediction value');
        }

        if (prediction.confidence < CONFIG.MIN_CONFIDENCE_THRESHOLD) {
            issues.push(`Confidence below threshold (${prediction.confidence} < ${CONFIG.MIN_CONFIDENCE_THRESHOLD})`);
        }

        if (prediction.method === 'none') {
            issues.push('Both prediction methods failed');
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }
}

export default EnsemblePredictor;
