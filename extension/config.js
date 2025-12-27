/**
 * Configuration file for Binary Trading AI Agent
 */

export const CONFIG = {
    // General Settings
    APP_NAME: 'Binary Trading AI Agent',
    VERSION: '1.0.0',

    // Data Collection
    SCAN_INTERVAL: 5000, // 5 seconds
    CANDLE_HISTORY_LENGTH: 20, // Number of candles to analyze
    DATA_RETENTION_DAYS: 90, // Keep data for 90 days

    // Pattern Recognition
    MIN_PATTERN_SIMILARITY: 0.75, // Minimum similarity score (0-1)
    TOP_K_SIMILAR_PATTERNS: 10, // Number of similar patterns to retrieve

    // Machine Learning
    MODEL_INPUT_FEATURES: 60, // 20 candles × 3 key features
    MODEL_ARCHITECTURE: {
        hiddenLayers: [128, 64, 32],
        dropout: [0.3, 0.2, 0],
        activation: 'relu',
        outputActivation: 'softmax'
    },
    TRAINING: {
        epochs: 10,
        batchSize: 32,
        validationSplit: 0.2,
        learningRate: 0.001
    },
    RETRAIN_THRESHOLD: 50, // Retrain after N validated predictions

    // Prediction
    MIN_CONFIDENCE_THRESHOLD: 0.65, // Minimum confidence to show signal
    ENSEMBLE_WEIGHTS: {
        historical: 0.4,
        ml: 0.6
    },
    VALIDATION_DELAY: 300000, // 5 minutes in milliseconds

    // Risk Management
    RISK_RULES: {
        maxTradesPerDay: 20,
        maxConsecutiveLosses: 3,
        minConfidence: 0.65,
        minWinRate: 0.50,
        cooldownAfterLoss: 300000 // 5 minutes
    },

    // Gemini AI
    GEMINI: {
        defaultModel: 'gemini-2.0-flash-exp',
        availableModels: [
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
            'gemini-1.5-pro'
        ],
        maxRetries: 3,
        timeout: 30000,
        rateLimit: {
            requestsPerMinute: 15
        }
    },

    // Broker Manipulation Detection
    MANIPULATION_DETECTION: {
        enabled: true,
        minSampleSize: 50, // Need at least 50 predictions
        suspiciousWinRateThreshold: 0.45, // Alert if win rate drops below 45%
        volatilityAnomalyThreshold: 2.5, // Standard deviations
        clusteringThreshold: 0.7 // Detect if losses cluster suspiciously
    },

    // Platform Configurations
    PLATFORMS: {
        'generic': {
            candleDetection: 'color-based',
            greenRGB: { r: 0, g: 255, b: 0, tolerance: 50 },
            redRGB: { r: 255, g: 0, b: 0, tolerance: 50 },
            scanInterval: 5000
        },
        'quotex': {
            candleDetection: 'color-based',
            greenRGB: { r: 34, g: 197, b: 94, tolerance: 30 },
            redRGB: { r: 239, g: 68, b: 68, tolerance: 30 },
            scanInterval: 5000
        },
        'iqoption': {
            candleDetection: 'svg-based',
            selector: 'svg.chart > rect.candle',
            scanInterval: 5000
        }
    },

    // Feature Weights (for similarity matching)
    FEATURE_WEIGHTS: {
        bodyRatios: 1.0,
        bodyDirections: 1.2,
        upperWickRatios: 0.8,
        lowerWickRatios: 0.8,
        shortTermSlope: 1.5,
        mediumTermSlope: 1.3,
        longTermSlope: 1.0,
        averageTrueRange: 1.1,
        volatilityRatio: 1.2,
        consecutiveBullish: 0.9,
        consecutiveBearish: 0.9,
        nearSupport: 1.3,
        nearResistance: 1.3,
        patterns: 1.4
    },

    // UI Settings
    UI: {
        theme: 'dark',
        primaryColor: '#6366f1',
        successColor: '#22c55e',
        dangerColor: '#ef4444',
        warningColor: '#f59e0b',
        updateInterval: 1000 // Update UI every second
    },

    // Notifications
    NOTIFICATIONS: {
        enabled: true,
        showOnPrediction: true,
        showOnValidation: false,
        soundEnabled: false
    },

    // Debug
    DEBUG: false,
    LOG_LEVEL: 'info' // 'debug', 'info', 'warn', 'error'
};

// Feature extraction configuration
export const FEATURE_CONFIG = {
    // Candle body features
    bodyRatio: true,
    bodyDirection: true,

    // Wick features
    upperWickRatio: true,
    lowerWickRatio: true,
    wickBalance: true,

    // Trend features
    shortTermSlope: { period: 5 },
    mediumTermSlope: { period: 10 },
    longTermSlope: { period: 20 },

    // Volatility features
    atr: { period: 14 },
    volatilityRatio: { period: 20 },

    // Pattern features
    consecutiveBullish: true,
    consecutiveBearish: true,
    higherHighs: true,
    lowerLows: true,

    // Support/Resistance
    supportResistance: {
        enabled: true,
        lookback: 50,
        threshold: 0.02 // 2%
    }
};

// Pattern detection configuration
export const PATTERN_CONFIG = {
    hammer: {
        enabled: true,
        minLowerWickRatio: 2.0,
        maxUpperWickRatio: 0.3,
        maxBodyRatio: 0.3
    },
    doji: {
        enabled: true,
        maxBodyRatio: 0.1
    },
    engulfing: {
        enabled: true,
        minBodyRatio: 1.0
    },
    morningstar: {
        enabled: true
    },
    eveningstar: {
        enabled: true
    },
    threeWhiteSoldiers: {
        enabled: true,
        minConsecutive: 3
    },
    threeBlackCrows: {
        enabled: true,
        minConsecutive: 3
    }
};

export default CONFIG;
