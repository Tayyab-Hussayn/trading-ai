/**
 * Neural Network - TensorFlow.js implementation for binary trading predictions
 * Architecture: 60 → 128 → 64 → 32 → 3 (UP/DOWN/NEUTRAL)
 */

import * as tf from '@tensorflow/tfjs';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';

export class NeuralNetwork {
    constructor() {
        this.model = null;
        this.isTraining = false;
        this.modelVersion = 1;
    }

    /**
     * Create neural network model
     */
    createModel() {
        logger.info('Creating neural network model');

        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.dense({
            inputShape: [CONFIG.MODEL_INPUT_FEATURES],
            units: CONFIG.MODEL_ARCHITECTURE.hiddenLayers[0],
            activation: CONFIG.MODEL_ARCHITECTURE.activation,
            kernelInitializer: 'heNormal'
        }));

        model.add(tf.layers.dropout({
            rate: CONFIG.MODEL_ARCHITECTURE.dropout[0]
        }));

        // Hidden layer 2
        model.add(tf.layers.dense({
            units: CONFIG.MODEL_ARCHITECTURE.hiddenLayers[1],
            activation: CONFIG.MODEL_ARCHITECTURE.activation,
            kernelInitializer: 'heNormal'
        }));

        model.add(tf.layers.dropout({
            rate: CONFIG.MODEL_ARCHITECTURE.dropout[1]
        }));

        // Hidden layer 3
        model.add(tf.layers.dense({
            units: CONFIG.MODEL_ARCHITECTURE.hiddenLayers[2],
            activation: CONFIG.MODEL_ARCHITECTURE.activation,
            kernelInitializer: 'heNormal'
        }));

        // Output layer (UP, DOWN, NEUTRAL)
        model.add(tf.layers.dense({
            units: 3,
            activation: CONFIG.MODEL_ARCHITECTURE.outputActivation
        }));

        // Compile model
        model.compile({
            optimizer: tf.train.adam(CONFIG.TRAINING.learningRate),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        this.model = model;
        logger.info('Model created successfully', {
            layers: model.layers.length,
            params: model.countParams()
        });

        return model;
    }

    /**
     * Train model with data
     */
    async train(trainingData, validationData = null) {
        if (!this.model) {
            this.createModel();
        }

        if (this.isTraining) {
            logger.warn('Model is already training');
            return null;
        }

        this.isTraining = true;
        logger.info('Starting model training', {
            samples: trainingData.inputs.length,
            epochs: CONFIG.TRAINING.epochs
        });

        try {
            // Convert data to tensors
            const xs = tf.tensor2d(trainingData.inputs);
            const ys = tf.tensor2d(trainingData.outputs);

            let validationSplit = CONFIG.TRAINING.validationSplit;
            let validationData_tf = null;

            // Use provided validation data if available
            if (validationData) {
                const xsVal = tf.tensor2d(validationData.inputs);
                const ysVal = tf.tensor2d(validationData.outputs);
                validationData_tf = [xsVal, ysVal];
                validationSplit = 0; // Don't split if validation provided
            }

            // Training callbacks
            const callbacks = {
                onEpochEnd: (epoch, logs) => {
                    logger.info(`Epoch ${epoch + 1}/${CONFIG.TRAINING.epochs}`, {
                        loss: logs.loss.toFixed(4),
                        accuracy: logs.acc.toFixed(4),
                        valLoss: logs.val_loss?.toFixed(4),
                        valAccuracy: logs.val_acc?.toFixed(4)
                    });
                },
                onTrainEnd: () => {
                    logger.info('Training completed');
                }
            };

            // Train model
            const history = await this.model.fit(xs, ys, {
                epochs: CONFIG.TRAINING.epochs,
                batchSize: CONFIG.TRAINING.batchSize,
                validationSplit,
                validationData: validationData_tf,
                callbacks,
                shuffle: true
            });

            // Clean up tensors
            xs.dispose();
            ys.dispose();
            if (validationData_tf) {
                validationData_tf[0].dispose();
                validationData_tf[1].dispose();
            }

            this.isTraining = false;
            this.modelVersion++;

            return history;
        } catch (error) {
            logger.error('Training failed', error);
            this.isTraining = false;
            return null;
        }
    }

    /**
     * Make prediction
     */
    async predict(features) {
        if (!this.model) {
            logger.warn('Model not initialized');
            return null;
        }

        try {
            // Convert features to tensor
            const inputTensor = tf.tensor2d([features]);

            // Make prediction
            const prediction = this.model.predict(inputTensor);
            const probabilities = await prediction.data();

            // Clean up tensors
            inputTensor.dispose();
            prediction.dispose();

            // Convert to result
            const result = {
                up: probabilities[0],
                down: probabilities[1],
                neutral: probabilities[2],
                prediction: this.getPredictionLabel(probabilities),
                confidence: Math.max(...probabilities)
            };

            logger.debug('Prediction made', result);
            return result;
        } catch (error) {
            logger.error('Prediction failed', error);
            return null;
        }
    }

    /**
     * Get prediction label from probabilities
     */
    getPredictionLabel(probabilities) {
        const maxIndex = probabilities.indexOf(Math.max(...probabilities));
        const labels = ['UP', 'DOWN', 'NEUTRAL'];
        return labels[maxIndex];
    }

    /**
     * Evaluate model on test data
     */
    async evaluate(testData) {
        if (!this.model) {
            logger.warn('Model not initialized');
            return null;
        }

        try {
            const xs = tf.tensor2d(testData.inputs);
            const ys = tf.tensor2d(testData.outputs);

            const evaluation = this.model.evaluate(xs, ys);
            const loss = await evaluation[0].data();
            const accuracy = await evaluation[1].data();

            // Clean up
            xs.dispose();
            ys.dispose();
            evaluation[0].dispose();
            evaluation[1].dispose();

            const result = {
                loss: loss[0],
                accuracy: accuracy[0]
            };

            logger.info('Model evaluation', result);
            return result;
        } catch (error) {
            logger.error('Evaluation failed', error);
            return null;
        }
    }

    /**
     * Save model to IndexedDB
     */
    async saveModel() {
        if (!this.model) {
            logger.warn('No model to save');
            return false;
        }

        try {
            const savePath = 'indexeddb://trading-ai-model';
            await this.model.save(savePath);

            logger.info('Model saved', {
                path: savePath,
                version: this.modelVersion
            });

            return true;
        } catch (error) {
            logger.error('Failed to save model', error);
            return false;
        }
    }

    /**
     * Load model from IndexedDB
     */
    async loadModel() {
        try {
            const loadPath = 'indexeddb://trading-ai-model';
            this.model = await tf.loadLayersModel(loadPath);

            logger.info('Model loaded', {
                path: loadPath,
                layers: this.model.layers.length
            });

            return true;
        } catch (error) {
            logger.warn('Failed to load model, creating new one', error);
            this.createModel();
            return false;
        }
    }

    /**
     * Get model summary
     */
    getSummary() {
        if (!this.model) {
            return null;
        }

        return {
            version: this.modelVersion,
            layers: this.model.layers.length,
            parameters: this.model.countParams(),
            isTraining: this.isTraining
        };
    }

    /**
     * Dispose model and free memory
     */
    dispose() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
            logger.info('Model disposed');
        }
    }

    /**
     * Prepare training data from predictions
     */
    static prepareTrainingData(predictions) {
        const inputs = [];
        const outputs = [];

        for (const prediction of predictions) {
            if (!prediction.validated || !prediction.features) {
                continue;
            }

            // Input: feature array
            inputs.push(prediction.features);

            // Output: one-hot encoded outcome
            const outcome = prediction.actualOutcome;
            if (outcome === 'UP') {
                outputs.push([1, 0, 0]);
            } else if (outcome === 'DOWN') {
                outputs.push([0, 1, 0]);
            } else {
                outputs.push([0, 0, 1]); // NEUTRAL
            }
        }

        return { inputs, outputs };
    }

    /**
     * Split data into train/test sets
     */
    static splitData(data, trainRatio = 0.8) {
        const totalSamples = data.inputs.length;
        const trainSize = Math.floor(totalSamples * trainRatio);

        // Shuffle indices
        const indices = Array.from({ length: totalSamples }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        const trainInputs = [];
        const trainOutputs = [];
        const testInputs = [];
        const testOutputs = [];

        for (let i = 0; i < totalSamples; i++) {
            const idx = indices[i];
            if (i < trainSize) {
                trainInputs.push(data.inputs[idx]);
                trainOutputs.push(data.outputs[idx]);
            } else {
                testInputs.push(data.inputs[idx]);
                testOutputs.push(data.outputs[idx]);
            }
        }

        return {
            train: { inputs: trainInputs, outputs: trainOutputs },
            test: { inputs: testInputs, outputs: testOutputs }
        };
    }
}

export default NeuralNetwork;
