"""
Configuration settings for Binary Trading AI Backend
"""

import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Server
    HOST = "0.0.0.0"
    PORT = 8000
    DEBUG = os.getenv("DEBUG", "False").lower() == "true"
    
    # Gemini AI
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")
    
    # Database
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./trading_ai.db")
    
    # ML Model
    MODEL_PATH = "models/saved"
    MODEL_INPUT_FEATURES = 60
    MODEL_ARCHITECTURE = {
        "hidden_layers": [128, 64, 32],
        "dropout": [0.3, 0.2, 0],
        "activation": "relu"
    }
    
    # Training
    TRAINING_EPOCHS = 10
    BATCH_SIZE = 32
    LEARNING_RATE = 0.001
    VALIDATION_SPLIT = 0.2
    RETRAIN_THRESHOLD = 50  # Retrain after N validated predictions
    
    # Prediction
    MIN_CONFIDENCE_THRESHOLD = 0.65
    VALIDATION_DELAY_MINUTES = 5
    ENSEMBLE_WEIGHTS = {
        "historical": 0.4,
        "ml": 0.6
    }
    
    # Risk Management
    MAX_TRADES_PER_DAY = 20
    MAX_CONSECUTIVE_LOSSES = 3
    MIN_WIN_RATE = 0.50
    COOLDOWN_AFTER_LOSS_MINUTES = 5
    
    # Pattern Recognition
    MIN_PATTERN_SIMILARITY = 0.75
    TOP_K_SIMILAR_PATTERNS = 10
    CANDLE_HISTORY_LENGTH = 20
    
    # Data Management
    DATA_RETENTION_DAYS = 90
    
    # Feature Weights
    FEATURE_WEIGHTS = {
        "body_ratios": 1.0,
        "body_directions": 1.2,
        "upper_wick_ratios": 0.8,
        "lower_wick_ratios": 0.8,
        "short_term_slope": 1.5,
        "medium_term_slope": 1.3,
        "long_term_slope": 1.0,
        "atr": 1.1,
        "volatility_ratio": 1.2,
        "consecutive_bullish": 0.9,
        "consecutive_bearish": 0.9,
        "near_support": 1.3,
        "near_resistance": 1.3,
        "patterns": 1.4
    }
    
    # Broker Manipulation Detection
    MANIPULATION_DETECTION_ENABLED = True
    MIN_SAMPLE_SIZE_FOR_DETECTION = 50
    SUSPICIOUS_WIN_RATE_THRESHOLD = 0.45
    VOLATILITY_ANOMALY_THRESHOLD = 2.5
    
    # Logging
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE = "logs/trading_ai.log"

settings = Settings()
