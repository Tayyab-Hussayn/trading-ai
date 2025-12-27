"""
Feature Extractor - Extracts numerical features from candlestick patterns
"""

import numpy as np
from typing import List, Dict
from scipy import stats


class FeatureExtractor:
    """Extract features from candlestick data for ML model"""
    
    @staticmethod
    def extract_features(candles: List[Dict]) -> Dict:
        """
        Extract comprehensive features from candles
        
        Args:
            candles: List of candle dictionaries with OHLC data
            
        Returns:
            Dictionary of extracted features
        """
        if len(candles) < 20:
            raise ValueError("Need at least 20 candles for feature extraction")
        
        # Take last 20 candles
        recent_candles = candles[-20:]
        
        features = {}
        
        # 1. Candle Body Features
        features.update(FeatureExtractor._extract_body_features(recent_candles))
        
        # 2. Wick Features
        features.update(FeatureExtractor._extract_wick_features(recent_candles))
        
        # 3. Trend Features
        features.update(FeatureExtractor._extract_trend_features(recent_candles))
        
        # 4. Volatility Features
        features.update(FeatureExtractor._extract_volatility_features(recent_candles))
        
        # 5. Pattern Features
        features.update(FeatureExtractor._extract_pattern_features(recent_candles))
        
        # 6. Support/Resistance Features
        features.update(FeatureExtractor._extract_support_resistance(recent_candles))
        
        return features
    
    @staticmethod
    def _extract_body_features(candles: List[Dict]) -> Dict:
        """Extract candle body characteristics"""
        features = {}
        
        body_ratios = []
        body_directions = []
        
        for candle in candles:
            o, h, l, c = candle['open'], candle['high'], candle['low'], candle['close']
            
            # Body ratio: (close - open) / (high - low)
            range_val = h - l
            if range_val > 0:
                body_ratio = abs(c - o) / range_val
            else:
                body_ratio = 0
            
            body_ratios.append(body_ratio)
            
            # Direction: 1 for bullish, -1 for bearish
            body_directions.append(1 if c > o else -1)
        
        features['body_ratios'] = body_ratios
        features['body_directions'] = body_directions
        features['avg_body_ratio'] = np.mean(body_ratios)
        
        return features
    
    @staticmethod
    def _extract_wick_features(candles: List[Dict]) -> Dict:
        """Extract wick characteristics"""
        features = {}
        
        upper_wick_ratios = []
        lower_wick_ratios = []
        
        for candle in candles:
            o, h, l, c = candle['open'], candle['high'], candle['low'], candle['close']
            
            body_top = max(o, c)
            body_bottom = min(o, c)
            range_val = h - l
            
            if range_val > 0:
                upper_wick = (h - body_top) / range_val
                lower_wick = (body_bottom - l) / range_val
            else:
                upper_wick = 0
                lower_wick = 0
            
            upper_wick_ratios.append(upper_wick)
            lower_wick_ratios.append(lower_wick)
        
        features['upper_wick_ratios'] = upper_wick_ratios
        features['lower_wick_ratios'] = lower_wick_ratios
        features['avg_upper_wick'] = np.mean(upper_wick_ratios)
        features['avg_lower_wick'] = np.mean(lower_wick_ratios)
        
        return features
    
    @staticmethod
    def _extract_trend_features(candles: List[Dict]) -> Dict:
        """Extract trend indicators"""
        features = {}
        
        closes = np.array([c['close'] for c in candles])
        
        # Short-term slope (last 5 candles)
        if len(closes) >= 5:
            x = np.arange(5)
            y = closes[-5:]
            slope, _ = np.polyfit(x, y, 1)
            features['short_term_slope'] = slope
        else:
            features['short_term_slope'] = 0
        
        # Medium-term slope (last 10 candles)
        if len(closes) >= 10:
            x = np.arange(10)
            y = closes[-10:]
            slope, _ = np.polyfit(x, y, 1)
            features['medium_term_slope'] = slope
        else:
            features['medium_term_slope'] = 0
        
        # Long-term slope (all 20 candles)
        x = np.arange(len(closes))
        slope, _ = np.polyfit(x, closes, 1)
        features['long_term_slope'] = slope
        
        return features
    
    @staticmethod
    def _extract_volatility_features(candles: List[Dict]) -> Dict:
        """Extract volatility metrics"""
        features = {}
        
        # Average True Range (ATR)
        true_ranges = []
        for i in range(1, len(candles)):
            h = candles[i]['high']
            l = candles[i]['low']
            prev_close = candles[i-1]['close']
            
            tr = max(
                h - l,
                abs(h - prev_close),
                abs(l - prev_close)
            )
            true_ranges.append(tr)
        
        features['atr'] = np.mean(true_ranges) if true_ranges else 0
        
        # Volatility ratio (current ATR vs average)
        if len(true_ranges) > 5:
            recent_atr = np.mean(true_ranges[-5:])
            avg_atr = np.mean(true_ranges)
            features['volatility_ratio'] = recent_atr / avg_atr if avg_atr > 0 else 1
        else:
            features['volatility_ratio'] = 1
        
        return features
    
    @staticmethod
    def _extract_pattern_features(candles: List[Dict]) -> Dict:
        """Extract pattern-based features"""
        features = {}
        
        # Consecutive bullish/bearish candles
        consecutive_bullish = 0
        consecutive_bearish = 0
        current_streak_bullish = 0
        current_streak_bearish = 0
        
        for candle in candles:
            if candle['close'] > candle['open']:
                current_streak_bullish += 1
                current_streak_bearish = 0
            else:
                current_streak_bearish += 1
                current_streak_bullish = 0
            
            consecutive_bullish = max(consecutive_bullish, current_streak_bullish)
            consecutive_bearish = max(consecutive_bearish, current_streak_bearish)
        
        features['consecutive_bullish'] = consecutive_bullish
        features['consecutive_bearish'] = consecutive_bearish
        
        # Higher highs / Lower lows
        highs = [c['high'] for c in candles]
        lows = [c['low'] for c in candles]
        
        higher_highs = sum(1 for i in range(1, len(highs)) if highs[i] > highs[i-1])
        lower_lows = sum(1 for i in range(1, len(lows)) if lows[i] < lows[i-1])
        
        features['higher_highs_count'] = higher_highs
        features['lower_lows_count'] = lower_lows
        
        return features
    
    @staticmethod
    def _extract_support_resistance(candles: List[Dict]) -> Dict:
        """Extract support/resistance features"""
        features = {}
        
        closes = [c['close'] for c in candles]
        highs = [c['high'] for c in candles]
        lows = [c['low'] for c in candles]
        
        current_price = closes[-1]
        
        # Recent high/low (last 10 candles)
        recent_high = max(highs[-10:])
        recent_low = min(lows[-10:])
        
        # Distance to recent high/low (as percentage)
        if recent_high > 0:
            dist_to_resistance = (recent_high - current_price) / recent_high
        else:
            dist_to_resistance = 0
        
        if recent_low > 0:
            dist_to_support = (current_price - recent_low) / recent_low
        else:
            dist_to_support = 0
        
        features['near_resistance'] = 1 if dist_to_resistance < 0.02 else 0  # Within 2%
        features['near_support'] = 1 if dist_to_support < 0.02 else 0  # Within 2%
        features['dist_to_resistance'] = dist_to_resistance
        features['dist_to_support'] = dist_to_support
        
        return features
    
    @staticmethod
    def features_to_array(features: Dict) -> np.ndarray:
        """
        Convert feature dictionary to numpy array for ML model
        
        Returns:
            1D numpy array of features
        """
        feature_array = []
        
        # Add scalar features
        scalar_keys = [
            'avg_body_ratio', 'avg_upper_wick', 'avg_lower_wick',
            'short_term_slope', 'medium_term_slope', 'long_term_slope',
            'atr', 'volatility_ratio',
            'consecutive_bullish', 'consecutive_bearish',
            'higher_highs_count', 'lower_lows_count',
            'near_resistance', 'near_support',
            'dist_to_resistance', 'dist_to_support'
        ]
        
        for key in scalar_keys:
            feature_array.append(features.get(key, 0))
        
        # Add last 5 body ratios
        body_ratios = features.get('body_ratios', [0] * 20)
        feature_array.extend(body_ratios[-5:])
        
        # Add last 5 body directions
        body_directions = features.get('body_directions', [0] * 20)
        feature_array.extend(body_directions[-5:])
        
        # Add last 5 upper wick ratios
        upper_wicks = features.get('upper_wick_ratios', [0] * 20)
        feature_array.extend(upper_wicks[-5:])
        
        # Add last 5 lower wick ratios
        lower_wicks = features.get('lower_wick_ratios', [0] * 20)
        feature_array.extend(lower_wicks[-5:])
        
        return np.array(feature_array, dtype=np.float32)
