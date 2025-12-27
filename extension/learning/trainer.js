/**
 * Trainer - Handles model retraining with validated predictions
 */

import { logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';
import { NeuralNetwork } from '../ml/neural-network.js';

export class Trainer {
    constructor(database, neuralNetwork) {
        this.database = database;
        this.neuralNetwork = neuralNetwork;
        this.isTraining = false;
        this.lastTrainingTime = 0;
    }

    /**
     * Check if retraining is needed
     */
    async shouldRetrain() {
        // Get count of validated predictions since last training
        const validated = await this.database.getValidatedPredictions(30);
        const newValidated = validated.filter(p =>
            p.validationTimestamp > this.lastTrainingTime
        );

        logger.debug(`New validated predictions: ${newValidated.length}`);

        return newValidated.length >= CONFIG.RETRAIN_THRESHOLD;
    }

    /**
     * Retrain model with latest data
     */
    async retrain() {
        if (this.isTraining) {
            logger.warn('Training already in progress');
            return false;
        }

        this.isTraining = true;
        logger.info('Starting model retraining');

        try {
            // Get validated predictions
            const predictions = await this.database.getValidatedPredictions(30);

            if (predictions.length < 50) {
                logger.warn(`Insufficient training data: ${predictions.length} samples`);
                this.isTraining = false;
                return false;
            }

            // Prepare training data
            const trainingData = NeuralNetwork.prepareTrainingData(predictions);

            if (trainingData.inputs.length === 0) {
                logger.warn('No valid training data');
                this.isTraining = false;
                return false;
            }

            // Split data
            const split = NeuralNetwork.splitData(trainingData, 0.8);

            logger.info(`Training with ${split.train.inputs.length} samples, validating with ${split.test.inputs.length}`);

            // Train model
            const history = await this.neuralNetwork.train(split.train, split.test);

            if (!history) {
                logger.error('Training failed');
                this.isTraining = false;
                return false;
            }

            // Evaluate on test set
            const evaluation = await this.neuralNetwork.evaluate(split.test);

            logger.info('Training completed', {
                finalLoss: evaluation.loss,
                finalAccuracy: evaluation.accuracy
            });

            // Save model
            await this.neuralNetwork.saveModel();

            this.lastTrainingTime = Date.now();
            this.isTraining = false;

            return true;
        } catch (error) {
            logger.error('Retraining failed', error);
            this.isTraining = false;
            return false;
        }
    }

    /**
     * Get training statistics
     */
    getStats() {
        return {
            isTraining: this.isTraining,
            lastTrainingTime: this.lastTrainingTime,
            modelVersion: this.neuralNetwork.modelVersion
        };
    }
}

export default Trainer;
