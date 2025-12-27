"""
Prediction Engine - Combines ML model and historical patterns for predictions
"""

import numpy as np
import logging
from typing import Dict, List, Optional
from datetime import datetime

from ml.feature_extractor import FeatureExtractor
from ml.pattern_detector import PatternDetector
from ml.neural_network import ModelManager
from ai.gemini_client import GeminiClient
from config.settings import settings

logger = logging.getLogger(__name__)


class PredictionEngine:
    """Main prediction engine combining ML and pattern matching"""
    
    def __init__(self, db_manager, model_manager: ModelManager, gemini_client: GeminiClient):
        self.db = db_manager
        self.model_manager = model_manager
        self.gemini = gemini_client
        self.feature_extractor = FeatureExtractor()
        self.pattern_detector = PatternDetector()
        
    async def predict(self, candles: List[Dict]) -> Optional[Dict]:
        """
        Make prediction from candles
        
        Args:
            candles: List of candle dictionaries
            
        Returns:
            Prediction dictionary with all metadata
        """
        if len(candles) < settings.CANDLE_HISTORY_LENGTH:
            logger.warning(f"Not enough candles: {len(candles)} < {settings.CANDLE_HISTORY_LENGTH}")
            return None
        
        try:
            # Extract features
            features = self.feature_extractor.extract_features(candles)
            
            # Detect patterns
            patterns = self.pattern_detector.detect_patterns(candles)
            
            # Get ML prediction
            feature_array = self.feature_extractor.features_to_array(features)
            ml_prediction = self.model_manager.predict(feature_array)
            
            # Get historical pattern matching
            historical_prediction = await self._get_historical_prediction(features, patterns)
            
            # Combine predictions (ensemble)
            ensemble_prediction = self._combine_predictions(ml_prediction, historical_prediction)
            
            # Enhance with Gemini AI if available
            if self.gemini.is_ready() and ensemble_prediction['confidence'] >= settings.MIN_CONFIDENCE_THRESHOLD:
                try:
                    recent_performance = await self.db.get_recent_performance()
                    ai_analysis = await self.gemini.analyze_pattern(
                        features,
                        patterns,
                        candles,
                        recent_performance
                    )
                    
                    if ai_analysis:
                        ensemble_prediction['ai_analysis'] = ai_analysis
                        
                        # Adjust confidence based on AI
                        if ai_analysis.get('confidence'):
                            ai_weight = 0.2
                            ensemble_weight = 0.8
                            ensemble_prediction['confidence'] = (
                                ensemble_prediction['confidence'] * ensemble_weight +
                                ai_analysis['confidence'] * ai_weight
                            )
                        
                        # Override if AI detects manipulation
                        if ai_analysis.get('manipulation_detected'):
                            ensemble_prediction['manipulation_warning'] = True
                            ensemble_prediction['confidence'] *= 0.5  # Reduce confidence
                
                except Exception as e:
                    logger.warning(f"AI analysis failed: {e}")
            
            # Add metadata
            ensemble_prediction.update({
                'timestamp': datetime.now().isoformat(),
                'features': features,
                'patterns': patterns,
                'candles_analyzed': len(candles),
                'meets_threshold': ensemble_prediction['confidence'] >= settings.MIN_CONFIDENCE_THRESHOLD
            })
            
            logger.info(
                f"Prediction: {ensemble_prediction['prediction']} "
                f"({ensemble_prediction['confidence']:.2%}) "
                f"Patterns: {patterns}"
            )
            
            return ensemble_prediction
            
        except Exception as e:
            logger.error(f"Prediction failed: {e}", exc_info=True)
            return None
    
    async def _get_historical_prediction(self, features: Dict, patterns: List[str]) -> Dict:
        """
        Get prediction based on historical similar patterns
        
        Returns:
            Prediction dict with confidence
        """
        try:
            # Find similar patterns from database
            similar_patterns = await self.db.find_similar_patterns(features, patterns)
            
            if not similar_patterns or len(similar_patterns) < 3:
                # Not enough historical data
                return {
                    'prediction': 'NEUTRAL',
                    'confidence': 0.5,
                    'method': 'historical',
                    'sample_size': 0
                }
            
            # Aggregate outcomes
            up_count = sum(1 for p in similar_patterns if p['outcome'] == 'UP')
            down_count = sum(1 for p in similar_patterns if p['outcome'] == 'DOWN')
            total = len(similar_patterns)
            
            # Calculate confidence
            if up_count > down_count:
                prediction = 'UP'
                confidence = up_count / total
            elif down_count > up_count:
                prediction = 'DOWN'
                confidence = down_count / total
            else:
                prediction = 'NEUTRAL'
                confidence = 0.5
            
            return {
                'prediction': prediction,
                'confidence': confidence,
                'method': 'historical',
                'sample_size': total
            }
            
        except Exception as e:
            logger.error(f"Historical prediction failed: {e}")
            return {
                'prediction': 'NEUTRAL',
                'confidence': 0.5,
                'method': 'historical',
                'sample_size': 0
            }
    
    def _combine_predictions(self, ml_pred: Dict, hist_pred: Dict) -> Dict:
        """
        Combine ML and historical predictions using ensemble weights
        
        Returns:
            Combined prediction
        """
        ml_weight = settings.ENSEMBLE_WEIGHTS['ml']
        hist_weight = settings.ENSEMBLE_WEIGHTS['historical']
        
        # Get probabilities
        ml_probs = ml_pred['probabilities']
        
        # Convert historical to probabilities
        hist_probs = {
            'UP': 0.33,
            'DOWN': 0.33,
            'NEUTRAL': 0.34
        }
        
        if hist_pred['prediction'] == 'UP':
            hist_probs['UP'] = hist_pred['confidence']
            hist_probs['DOWN'] = (1 - hist_pred['confidence']) / 2
            hist_probs['NEUTRAL'] = (1 - hist_pred['confidence']) / 2
        elif hist_pred['prediction'] == 'DOWN':
            hist_probs['DOWN'] = hist_pred['confidence']
            hist_probs['UP'] = (1 - hist_pred['confidence']) / 2
            hist_probs['NEUTRAL'] = (1 - hist_pred['confidence']) / 2
        
        # Combine probabilities
        combined_probs = {
            'UP': ml_probs['UP'] * ml_weight + hist_probs['UP'] * hist_weight,
            'DOWN': ml_probs['DOWN'] * ml_weight + hist_probs['DOWN'] * hist_weight,
            'NEUTRAL': ml_probs['NEUTRAL'] * ml_weight + hist_probs['NEUTRAL'] * hist_weight
        }
        
        # Get final prediction
        final_prediction = max(combined_probs, key=combined_probs.get)
        final_confidence = combined_probs[final_prediction]
        
        return {
            'prediction': final_prediction,
            'confidence': final_confidence,
            'probabilities': combined_probs,
            'method': 'ensemble',
            'ml_prediction': ml_pred['prediction'],
            'ml_confidence': ml_pred['confidence'],
            'historical_prediction': hist_pred['prediction'],
            'historical_confidence': hist_pred['confidence'],
            'historical_sample_size': hist_pred.get('sample_size', 0)
        }
