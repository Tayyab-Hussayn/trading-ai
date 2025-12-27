"""
Pattern Detector - Identifies classic technical analysis patterns
"""

from typing import List, Dict


class PatternDetector:
    """Detect classic candlestick patterns"""
    
    @staticmethod
    def detect_patterns(candles: List[Dict]) -> List[str]:
        """
        Detect all patterns in the candle sequence
        
        Returns:
            List of detected pattern names
        """
        patterns = []
        
        if len(candles) < 3:
            return patterns
        
        # Single candle patterns
        last_candle = candles[-1]
        
        if PatternDetector.is_hammer(last_candle):
            patterns.append('hammer')
        
        if PatternDetector.is_inverted_hammer(last_candle):
            patterns.append('inverted_hammer')
        
        if PatternDetector.is_doji(last_candle):
            patterns.append('doji')
        
        if PatternDetector.is_dragonfly_doji(last_candle):
            patterns.append('dragonfly_doji')
        
        if PatternDetector.is_gravestone_doji(last_candle):
            patterns.append('gravestone_doji')
        
        # Two candle patterns
        if len(candles) >= 2:
            if PatternDetector.is_bullish_engulfing(candles[-2:]):
                patterns.append('bullish_engulfing')
            
            if PatternDetector.is_bearish_engulfing(candles[-2:]):
                patterns.append('bearish_engulfing')
            
            if PatternDetector.is_bullish_harami(candles[-2:]):
                patterns.append('bullish_harami')
            
            if PatternDetector.is_bearish_harami(candles[-2:]):
                patterns.append('bearish_harami')
        
        # Three candle patterns
        if len(candles) >= 3:
            if PatternDetector.is_morning_star(candles[-3:]):
                patterns.append('morning_star')
            
            if PatternDetector.is_evening_star(candles[-3:]):
                patterns.append('evening_star')
            
            if PatternDetector.is_three_white_soldiers(candles[-3:]):
                patterns.append('three_white_soldiers')
            
            if PatternDetector.is_three_black_crows(candles[-3:]):
                patterns.append('three_black_crows')
        
        return patterns
    
    @staticmethod
    def is_hammer(candle: Dict) -> bool:
        """Hammer pattern: long lower shadow, small body at top"""
        o, h, l, c = candle['open'], candle['high'], candle['low'], candle['close']
        
        body = abs(c - o)
        lower_shadow = min(o, c) - l
        upper_shadow = h - max(o, c)
        total_range = h - l
        
        if total_range == 0:
            return False
        
        return (
            lower_shadow > body * 2 and
            upper_shadow < body * 0.3 and
            body < total_range * 0.3
        )
    
    @staticmethod
    def is_inverted_hammer(candle: Dict) -> bool:
        """Inverted hammer: long upper shadow, small body at bottom"""
        o, h, l, c = candle['open'], candle['high'], candle['low'], candle['close']
        
        body = abs(c - o)
        lower_shadow = min(o, c) - l
        upper_shadow = h - max(o, c)
        total_range = h - l
        
        if total_range == 0:
            return False
        
        return (
            upper_shadow > body * 2 and
            lower_shadow < body * 0.3 and
            body < total_range * 0.3
        )
    
    @staticmethod
    def is_doji(candle: Dict) -> bool:
        """Doji: very small body"""
        o, h, l, c = candle['open'], candle['high'], candle['low'], candle['close']
        
        body = abs(c - o)
        total_range = h - l
        
        if total_range == 0:
            return False
        
        return body / total_range < 0.1
    
    @staticmethod
    def is_dragonfly_doji(candle: Dict) -> bool:
        """Dragonfly doji: doji with long lower shadow"""
        o, h, l, c = candle['open'], candle['high'], candle['low'], candle['close']
        
        body = abs(c - o)
        lower_shadow = min(o, c) - l
        upper_shadow = h - max(o, c)
        total_range = h - l
        
        if total_range == 0:
            return False
        
        return (
            body / total_range < 0.1 and
            lower_shadow > total_range * 0.6 and
            upper_shadow < total_range * 0.1
        )
    
    @staticmethod
    def is_gravestone_doji(candle: Dict) -> bool:
        """Gravestone doji: doji with long upper shadow"""
        o, h, l, c = candle['open'], candle['high'], candle['low'], candle['close']
        
        body = abs(c - o)
        lower_shadow = min(o, c) - l
        upper_shadow = h - max(o, c)
        total_range = h - l
        
        if total_range == 0:
            return False
        
        return (
            body / total_range < 0.1 and
            upper_shadow > total_range * 0.6 and
            lower_shadow < total_range * 0.1
        )
    
    @staticmethod
    def is_bullish_engulfing(candles: List[Dict]) -> bool:
        """Bullish engulfing: large bullish candle engulfs previous bearish"""
        if len(candles) < 2:
            return False
        
        prev, curr = candles[0], candles[1]
        
        prev_bearish = prev['close'] < prev['open']
        curr_bullish = curr['close'] > curr['open']
        
        return (
            prev_bearish and
            curr_bullish and
            curr['open'] < prev['close'] and
            curr['close'] > prev['open']
        )
    
    @staticmethod
    def is_bearish_engulfing(candles: List[Dict]) -> bool:
        """Bearish engulfing: large bearish candle engulfs previous bullish"""
        if len(candles) < 2:
            return False
        
        prev, curr = candles[0], candles[1]
        
        prev_bullish = prev['close'] > prev['open']
        curr_bearish = curr['close'] < curr['open']
        
        return (
            prev_bullish and
            curr_bearish and
            curr['open'] > prev['close'] and
            curr['close'] < prev['open']
        )
    
    @staticmethod
    def is_bullish_harami(candles: List[Dict]) -> bool:
        """Bullish harami: small bullish candle inside previous bearish"""
        if len(candles) < 2:
            return False
        
        prev, curr = candles[0], candles[1]
        
        prev_bearish = prev['close'] < prev['open']
        curr_bullish = curr['close'] > curr['open']
        
        return (
            prev_bearish and
            curr_bullish and
            curr['open'] > prev['close'] and
            curr['close'] < prev['open']
        )
    
    @staticmethod
    def is_bearish_harami(candles: List[Dict]) -> bool:
        """Bearish harami: small bearish candle inside previous bullish"""
        if len(candles) < 2:
            return False
        
        prev, curr = candles[0], candles[1]
        
        prev_bullish = prev['close'] > prev['open']
        curr_bearish = curr['close'] < curr['open']
        
        return (
            prev_bullish and
            curr_bearish and
            curr['open'] < prev['close'] and
            curr['close'] > prev['open']
        )
    
    @staticmethod
    def is_morning_star(candles: List[Dict]) -> bool:
        """Morning star: bearish, small, bullish"""
        if len(candles) < 3:
            return False
        
        first, second, third = candles[0], candles[1], candles[2]
        
        first_bearish = first['close'] < first['open']
        second_small = abs(second['close'] - second['open']) < abs(first['close'] - first['open']) * 0.5
        third_bullish = third['close'] > third['open']
        
        return first_bearish and second_small and third_bullish
    
    @staticmethod
    def is_evening_star(candles: List[Dict]) -> bool:
        """Evening star: bullish, small, bearish"""
        if len(candles) < 3:
            return False
        
        first, second, third = candles[0], candles[1], candles[2]
        
        first_bullish = first['close'] > first['open']
        second_small = abs(second['close'] - second['open']) < abs(first['close'] - first['open']) * 0.5
        third_bearish = third['close'] < third['open']
        
        return first_bullish and second_small and third_bearish
    
    @staticmethod
    def is_three_white_soldiers(candles: List[Dict]) -> bool:
        """Three white soldiers: three consecutive bullish candles"""
        if len(candles) < 3:
            return False
        
        return all(
            c['close'] > c['open'] and
            (i == 0 or c['close'] > candles[i-1]['close'])
            for i, c in enumerate(candles)
        )
    
    @staticmethod
    def is_three_black_crows(candles: List[Dict]) -> bool:
        """Three black crows: three consecutive bearish candles"""
        if len(candles) < 3:
            return False
        
        return all(
            c['close'] < c['open'] and
            (i == 0 or c['close'] < candles[i-1]['close'])
            for i, c in enumerate(candles)
        )
