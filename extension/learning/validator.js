/**
 * Validator - Validates predictions after delay and updates learning data
 */

import { logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';

export class Validator {
    constructor(database) {
        this.database = database;
    }

    /**
     * Validate all unvalidated predictions
     */
    async validatePredictions() {
        const unvalidated = await this.database.getUnvalidatedPredictions();
        const now = Date.now();
        let validatedCount = 0;

        logger.info(`Checking ${unvalidated.length} unvalidated predictions`);

        for (const prediction of unvalidated) {
            const timeSincePrediction = now - prediction.timestamp;

            // Check if enough time has passed
            if (timeSincePrediction >= CONFIG.VALIDATION_DELAY) {
                const validated = await this.validatePrediction(prediction);
                if (validated) {
                    validatedCount++;
                }
            }
        }

        logger.info(`Validated ${validatedCount} predictions`);
        return validatedCount;
    }

    /**
     * Validate a single prediction
     */
    async validatePrediction(prediction) {
        try {
            // Get candle at validation time
            const validationTime = prediction.timestamp + CONFIG.VALIDATION_DELAY;
            const candles = await this.database.getCandles(
                validationTime - 60000, // 1 minute window
                validationTime + 60000
            );

            if (candles.length === 0) {
                logger.warn(`No candles found for validation of prediction ${prediction.id}`);
                return false;
            }

            // Find closest candle
            const closestCandle = candles.reduce((closest, candle) => {
                const diff = Math.abs(candle.timestamp - validationTime);
                const closestDiff = Math.abs(closest.timestamp - validationTime);
                return diff < closestDiff ? candle : closest;
            });

            // Get original candle
            const originalCandles = await this.database.getCandles(
                prediction.timestamp - 60000,
                prediction.timestamp + 60000
            );

            if (originalCandles.length === 0) {
                logger.warn(`No original candles found for prediction ${prediction.id}`);
                return false;
            }

            const originalCandle = originalCandles[originalCandles.length - 1];

            // Determine actual outcome
            const actualOutcome = closestCandle.close > originalCandle.close ? 'UP' : 'DOWN';
            const wasCorrect = actualOutcome === prediction.prediction;

            // Update prediction
            await this.database.updatePrediction(prediction.id, {
                validated: true,
                wasCorrect,
                actualOutcome,
                validationTimestamp: Date.now(),
                validationCandle: closestCandle
            });

            // Update pattern score
            if (prediction.features) {
                const signature = this.generateSignature(prediction.features);
                await this.database.updatePatternScore(signature, wasCorrect);
            }

            logger.info(`Prediction ${prediction.id} validated`, {
                predicted: prediction.prediction,
                actual: actualOutcome,
                correct: wasCorrect
            });

            return true;
        } catch (error) {
            logger.error(`Failed to validate prediction ${prediction.id}`, error);
            return false;
        }
    }

    /**
     * Generate signature from features
     */
    generateSignature(features) {
        const keyFeatures = [
            features.avgBodyRatio,
            features.shortTermSlope,
            features.mediumTermSlope,
            features.volatilityRatio
        ];

        return keyFeatures
            .map(f => (f || 0).toFixed(2))
            .join('_');
    }

    /**
     * Get validation statistics
     */
    async getValidationStats() {
        const allPredictions = await this.database.getRecentPredictions(100);
        const validated = allPredictions.filter(p => p.validated);

        if (validated.length === 0) {
            return {
                total: 0,
                correct: 0,
                incorrect: 0,
                winRate: 0
            };
        }

        const correct = validated.filter(p => p.wasCorrect).length;
        const incorrect = validated.filter(p => !p.wasCorrect).length;

        return {
            total: validated.length,
            correct,
            incorrect,
            winRate: correct / validated.length
        };
    }
}

export default Validator;
