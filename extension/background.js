/**
 * Background Service Worker - Main orchestrator for Binary Trading AI Agent
 * Handles all AI operations, predictions, learning, and communication
 */

import { database } from './data/database.js';
import { logger } from './utils/logger.js';
import { CONFIG } from './config.js';
import { NeuralNetwork } from './ml/neural-network.js';
import { EnsemblePredictor } from './ml/ensemble-predictor.js';
import { GeminiClient } from './ai/gemini-client.js';
import { RiskManager } from './risk/risk-manager.js';
import { Validator } from './learning/validator.js';
import { Trainer } from './learning/trainer.js';

class TradingAIAgent {
    constructor() {
        this.initialized = false;
        this.neuralNetwork = null;
        this.ensemblePredictor = null;
        this.geminiClient = null;
        this.riskManager = null;
        this.validator = null;
        this.trainer = null;
        this.currentPrediction = null;
        this.validationInterval = null;
        this.retrainingInterval = null;
    }

    /**
     * Initialize the AI agent
     */
    async init() {
        if (this.initialized) {
            logger.info('Agent already initialized');
            return true;
        }

        logger.info('Initializing Trading AI Agent');

        try {
            // Initialize database
            await database.init();

            // Initialize neural network
            this.neuralNetwork = new NeuralNetwork();
            await this.neuralNetwork.loadModel();

            // Initialize components
            this.ensemblePredictor = new EnsemblePredictor(database, this.neuralNetwork);
            this.geminiClient = new GeminiClient();
            await this.geminiClient.init();
            this.riskManager = new RiskManager(database);
            this.validator = new Validator(database);
            this.trainer = new Trainer(database, this.neuralNetwork);

            // Start periodic tasks
            this.startPeriodicTasks();

            this.initialized = true;
            logger.info('Trading AI Agent initialized successfully');

            return true;
        } catch (error) {
            logger.error('Failed to initialize agent', error);
            return false;
        }
    }

    /**
     * Start periodic background tasks
     */
    startPeriodicTasks() {
        // Validation task - every minute
        this.validationInterval = setInterval(async () => {
            try {
                await this.validator.validatePredictions();

                // Check if retraining needed
                const shouldRetrain = await this.trainer.shouldRetrain();
                if (shouldRetrain) {
                    logger.info('Retraining threshold reached');
                    await this.trainer.retrain();
                }
            } catch (error) {
                logger.error('Validation task failed', error);
            }
        }, 60000); // Every minute

        // Cleanup task - daily
        setInterval(async () => {
            try {
                await database.cleanup();
            } catch (error) {
                logger.error('Cleanup task failed', error);
            }
        }, 86400000); // Every 24 hours

        logger.info('Periodic tasks started');
    }

    /**
     * Handle candles update from content script
     */
    async handleCandlesUpdate(candles) {
        try {
            // Store candles in database
            await database.storeCandles(candles);

            // Make prediction if we have enough candles
            if (candles.length >= 20) {
                const prediction = await this.makePrediction(candles);

                if (prediction && prediction.meetsThreshold) {
                    this.currentPrediction = prediction;

                    // Check risk management
                    const riskCheck = await this.riskManager.shouldAllowTrade(prediction);

                    if (riskCheck.allowed) {
                        // Show notification
                        await this.showPredictionNotification(prediction);

                        // Store prediction for validation
                        await this.storePrediction(prediction);
                    } else {
                        logger.info('Trade blocked by risk management', riskCheck.failedChecks);
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to handle candles update', error);
        }
    }

    /**
     * Make prediction from candles
     */
    async makePrediction(candles) {
        logger.info('Making prediction');

        try {
            // Get ensemble prediction
            const prediction = await this.ensemblePredictor.predict(candles);

            if (!prediction) {
                logger.warn('Prediction failed');
                return null;
            }

            // Enhance with Gemini AI if available
            if (this.geminiClient.isReady() && prediction.meetsThreshold) {
                try {
                    const aiAnalysis = await this.geminiClient.analyzePattern(
                        prediction.features,
                        prediction.patterns,
                        candles
                    );

                    if (aiAnalysis) {
                        prediction.aiAnalysis = aiAnalysis;

                        // Adjust confidence based on AI analysis
                        if (aiAnalysis.confidence) {
                            const aiWeight = 0.2;
                            const ensembleWeight = 0.8;
                            prediction.confidence =
                                (prediction.confidence * ensembleWeight) +
                                (aiAnalysis.confidence * aiWeight);
                        }
                    }
                } catch (error) {
                    logger.warn('AI analysis failed', error);
                }
            }

            return prediction;
        } catch (error) {
            logger.error('Prediction failed', error);
            return null;
        }
    }

    /**
     * Store prediction for later validation
     */
    async storePrediction(prediction) {
        const predictionData = {
            timestamp: prediction.timestamp,
            prediction: prediction.prediction,
            confidence: prediction.confidence,
            features: FeatureExtractor.featuresToArray(prediction.features),
            patterns: prediction.patterns,
            method: prediction.method,
            validated: false,
            wasCorrect: null,
            actualOutcome: null,
            validationTimestamp: null
        };

        const id = await database.storePrediction(predictionData);
        logger.info(`Prediction stored with ID: ${id}`);
        return id;
    }

    /**
     * Show prediction notification
     */
    async showPredictionNotification(prediction) {
        if (!CONFIG.NOTIFICATIONS.enabled || !CONFIG.NOTIFICATIONS.showOnPrediction) {
            return;
        }

        const icon = prediction.prediction === 'UP' ? '📈' : '📉';
        const confidence = (prediction.confidence * 100).toFixed(1);

        await chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: `${icon} ${prediction.prediction} Signal`,
            message: `Confidence: ${confidence}%\nMethod: ${prediction.method}`,
            priority: 2
        });
    }

    /**
     * Get current status
     */
    async getStatus() {
        const dbStats = await database.getDatabaseStats();
        const validationStats = await this.validator.getValidationStats();
        const trainerStats = this.trainer.getStats();

        return {
            initialized: this.initialized,
            currentPrediction: this.currentPrediction,
            database: dbStats,
            validation: validationStats,
            training: trainerStats,
            model: this.neuralNetwork.getSummary(),
            geminiReady: this.geminiClient.isReady()
        };
    }
}

// Create singleton instance
const agent = new TradingAIAgent();

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
    logger.info('Extension installed');
    await agent.init();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
    logger.info('Extension started');
    await agent.init();
});

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            logger.debug('Message received', { type: message.type });

            switch (message.type) {
                case 'CONTENT_READY':
                    await agent.init();
                    sendResponse({ success: true });
                    break;

                case 'CANDLES_UPDATE':
                    await agent.handleCandlesUpdate(message.candles);
                    sendResponse({ success: true });
                    break;

                case 'GET_STATUS':
                    const status = await agent.getStatus();
                    sendResponse(status);
                    break;

                case 'GET_CURRENT_PREDICTION':
                    sendResponse({ prediction: agent.currentPrediction });
                    break;

                case 'FORCE_RETRAIN':
                    const success = await agent.trainer.retrain();
                    sendResponse({ success });
                    break;

                case 'OPEN_POPUP':
                    chrome.action.openPopup();
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ error: 'Unknown message type' });
            }
        } catch (error) {
            logger.error('Message handler error', error);
            sendResponse({ error: error.message });
        }
    })();

    return true; // Keep channel open for async response
});

// Export for testing
export { agent, TradingAIAgent };
