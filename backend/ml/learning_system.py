"""
Learning System - Handles prediction validation and model retraining
"""

import logging
from datetime import datetime
from typing import Dict

from data.database import DatabaseManager
from ml.neural_network import ModelManager
from ml.feature_extractor import FeatureExtractor
from config.settings import settings

logger = logging.getLogger(__name__)


class LearningSystem:
    """Manages continuous learning through validation and retraining"""
    
    def __init__(self, db: DatabaseManager, model: ModelManager):
        self.db = db
        self.model = model
        self.feature_extractor = FeatureExtractor()
        self.validations_since_retrain = 0
        
    async def validate_predictions(self):
        """Validate pending predictions"""
        try:
            # Get unvalidated predictions
            predictions = await self.db.get_unvalidated_predictions()
            
            if not predictions:
                logger.debug("No predictions to validate")
                return
            
            logger.info(f"Validating {len(predictions)} predictions")
            
            for pred in predictions:
                await self._validate_single_prediction(pred)
            
            logger.info(f"Validated {len(predictions)} predictions")
            
        except Exception as e:
            logger.error(f"Validation failed: {e}", exc_info=True)
    
    async def _validate_single_prediction(self, prediction: Dict):
        """Validate a single prediction"""
        try:
            # Get candle at validation time (T + 5 minutes)
            validation_time = prediction['timestamp'] + (settings.VALIDATION_DELAY_MINUTES * 60 * 1000)
            
            # Get candles around validation time
            candles = await self.db.get_recent_candles(count=50)
            
            # Find candle closest to validation time
            validation_candle = None
            min_diff = float('inf')
            
            for candle in candles:
                diff = abs(candle['timestamp'] - validation_time)
                if diff < min_diff:
                    min_diff = diff
                    validation_candle = candle
            
            if not validation_candle:
                logger.warning(f"No validation candle found for prediction {prediction['id']}")
                return
            
            # Get the candle at prediction time
            prediction_candle = None
            for candle in candles:
                if abs(candle['timestamp'] - prediction['timestamp']) < 60000:  # Within 1 minute
                    prediction_candle = candle
                    break
            
            if not prediction_candle:
                logger.warning(f"No prediction candle found for prediction {prediction['id']}")
                return
            
            # Determine actual outcome
            price_change = validation_candle['close'] - prediction_candle['close']
            
            if abs(price_change) < 0.00001:  # Essentially no change
                actual_outcome = 'NEUTRAL'
            elif price_change > 0:
                actual_outcome = 'UP'
            else:
                actual_outcome = 'DOWN'
            
            # Check if prediction was correct
            was_correct = (prediction['prediction'] == actual_outcome)
            
            # Update database
            await self.db.validate_prediction(
                prediction['id'],
                was_correct,
                actual_outcome
            )
            
            self.validations_since_retrain += 1
            
            logger.info(
                f"Prediction {prediction['id']}: "
                f"Predicted {prediction['prediction']}, "
                f"Actual {actual_outcome}, "
                f"{'✓ CORRECT' if was_correct else '✗ WRONG'}"
            )
            
        except Exception as e:
            logger.error(f"Failed to validate prediction {prediction.get('id')}: {e}")
    
    async def should_retrain(self) -> bool:
        """Check if model should be retrained"""
        return self.validations_since_retrain >= settings.RETRAIN_THRESHOLD
    
    async def retrain_model(self) -> Dict:
        """Retrain the model with validated data"""
        try:
            logger.info("Starting model retraining...")
            
            # Get training data
            X, y = await self.db.get_training_data(limit=1000)
            
            if len(X) < 50:
                logger.warning(f"Not enough training data: {len(X)} samples")
                return {'success': False, 'reason': 'insufficient_data'}
            
            # Train model
            training_stats = self.model.train(X, y)
            
            # Reset counter
            self.validations_since_retrain = 0
            
            logger.info(
                f"Model retrained: "
                f"Accuracy: {training_stats['final_accuracy']:.2%}, "
                f"Samples: {len(X)}"
            )
            
            return {
                'success': True,
                'stats': training_stats,
                'samples': len(X)
            }
            
        except Exception as e:
            logger.error(f"Retraining failed: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def get_stats(self) -> Dict:
        """Get learning system statistics"""
        return {
            'validations_since_retrain': self.validations_since_retrain,
            'retrain_threshold': settings.RETRAIN_THRESHOLD,
            'ready_for_retrain': self.validations_since_retrain >= settings.RETRAIN_THRESHOLD
        }
