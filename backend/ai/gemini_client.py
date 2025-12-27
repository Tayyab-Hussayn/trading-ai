"""
Gemini AI Client - Integration with Google's Gemini AI for intelligent analysis
"""

import google.generativeai as genai
import logging
from typing import Dict, List, Optional
import json

from config.settings import settings

logger = logging.getLogger(__name__)


class GeminiClient:
    """Client for Gemini AI integration"""
    
    def __init__(self):
        self.model = None
        self.ready = False
        self.request_count = 0
        
    def initialize(self):
        """Initialize Gemini AI client"""
        if not settings.GEMINI_API_KEY:
            logger.warning("Gemini API key not configured")
            return False
        
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self.model = genai.GenerativeModel(settings.GEMINI_MODEL)
            self.ready = True
            logger.info(f"Gemini AI initialized with model: {settings.GEMINI_MODEL}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Gemini: {e}")
            return False
    
    async def analyze_pattern(
        self,
        features: Dict,
        patterns: List[str],
        candles: List[Dict],
        recent_performance: Optional[Dict] = None
    ) -> Optional[Dict]:
        """
        Analyze trading pattern using Gemini AI
        
        Args:
            features: Extracted features
            patterns: Detected patterns
            candles: Recent candle data
            recent_performance: Recent win/loss statistics
            
        Returns:
            AI analysis with insights and confidence adjustment
        """
        if not self.ready:
            return None
        
        try:
            # Prepare context for AI
            context = self._prepare_context(features, patterns, candles, recent_performance)
            
            # Create prompt
            prompt = self._create_analysis_prompt(context)
            
            # Get AI response
            response = self.model.generate_content(prompt)
            
            # Parse response
            analysis = self._parse_response(response.text)
            
            self.request_count += 1
            
            return analysis
            
        except Exception as e:
            logger.error(f"Gemini analysis failed: {e}")
            return None
    
    def _prepare_context(
        self,
        features: Dict,
        patterns: List[str],
        candles: List[Dict],
        recent_performance: Optional[Dict]
    ) -> Dict:
        """Prepare context data for AI"""
        # Get last 5 candles
        recent_candles = candles[-5:] if len(candles) >= 5 else candles
        
        # Simplify candle data
        candle_summary = []
        for c in recent_candles:
            direction = "🟢 UP" if c['close'] > c['open'] else "🔴 DOWN"
            body_size = abs(c['close'] - c['open'])
            candle_summary.append(f"{direction} (body: {body_size:.5f})")
        
        context = {
            'patterns_detected': patterns if patterns else ['none'],
            'recent_candles': candle_summary,
            'trend': self._determine_trend(features),
            'volatility': features.get('volatility_ratio', 1.0),
            'near_support': features.get('near_support', 0) == 1,
            'near_resistance': features.get('near_resistance', 0) == 1,
        }
        
        if recent_performance:
            context['recent_performance'] = recent_performance
        
        return context
    
    def _determine_trend(self, features: Dict) -> str:
        """Determine overall trend from features"""
        short_slope = features.get('short_term_slope', 0)
        medium_slope = features.get('medium_term_slope', 0)
        long_slope = features.get('long_term_slope', 0)
        
        avg_slope = (short_slope + medium_slope + long_slope) / 3
        
        if avg_slope > 0.0001:
            return "UPTREND"
        elif avg_slope < -0.0001:
            return "DOWNTREND"
        else:
            return "SIDEWAYS"
    
    def _create_analysis_prompt(self, context: Dict) -> str:
        """Create prompt for Gemini AI"""
        prompt = f"""You are an expert binary options trading analyst. Analyze the following market data and provide insights.

**Current Market Context:**
- Detected Patterns: {', '.join(context['patterns_detected'])}
- Recent Candles: {' → '.join(context['recent_candles'])}
- Overall Trend: {context['trend']}
- Volatility: {'HIGH' if context['volatility'] > 1.5 else 'NORMAL' if context['volatility'] > 0.8 else 'LOW'}
- Near Support: {'YES' if context['near_support'] else 'NO'}
- Near Resistance: {'YES' if context['near_resistance'] else 'NO'}
"""

        if 'recent_performance' in context:
            perf = context['recent_performance']
            prompt += f"\n**Recent Performance:**\n- Win Rate: {perf.get('win_rate', 0):.1%}\n- Last 10 Trades: {perf.get('last_10', 'N/A')}\n"

        prompt += """
**Your Task:**
1. Analyze if this looks like broker manipulation (sudden reversals, suspicious patterns)
2. Predict the next likely move (UP or DOWN)
3. Provide confidence level (0.0 to 1.0)
4. Give brief reasoning

**Respond in JSON format:**
{
    "prediction": "UP" or "DOWN",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation",
    "manipulation_detected": true/false,
    "manipulation_reason": "explanation if detected",
    "risk_level": "LOW", "MEDIUM", or "HIGH"
}

Be concise and data-driven. Focus on technical analysis."""

        return prompt
    
    def _parse_response(self, response_text: str) -> Dict:
        """Parse AI response"""
        try:
            # Try to extract JSON from response
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            
            if start >= 0 and end > start:
                json_str = response_text[start:end]
                analysis = json.loads(json_str)
                
                # Validate required fields
                if 'prediction' in analysis and 'confidence' in analysis:
                    return analysis
            
            logger.warning("Could not parse AI response as JSON")
            return None
            
        except Exception as e:
            logger.error(f"Failed to parse AI response: {e}")
            return None
    
    async def detect_broker_manipulation(
        self,
        predictions_history: List[Dict]
    ) -> Dict:
        """
        Analyze prediction history to detect broker manipulation
        
        Args:
            predictions_history: List of past predictions with outcomes
            
        Returns:
            Manipulation analysis
        """
        if not self.ready or len(predictions_history) < 20:
            return {'manipulation_detected': False, 'confidence': 0.0}
        
        try:
            # Prepare statistics
            total = len(predictions_history)
            correct = sum(1 for p in predictions_history if p.get('was_correct'))
            win_rate = correct / total if total > 0 else 0
            
            # Check for suspicious patterns
            recent_losses = 0
            for p in predictions_history[-10:]:
                if not p.get('was_correct'):
                    recent_losses += 1
            
            prompt = f"""Analyze this binary trading performance for broker manipulation:

**Statistics:**
- Total Predictions: {total}
- Win Rate: {win_rate:.1%}
- Recent Losses (last 10): {recent_losses}/10

**Prediction History (last 20):**
"""
            for i, p in enumerate(predictions_history[-20:]):
                result = "✓" if p.get('was_correct') else "✗"
                prompt += f"\n{i+1}. {p.get('prediction')} ({p.get('confidence'):.0%}) - {result}"
            
            prompt += """

**Detect:**
1. Is the win rate suspiciously low despite high confidence?
2. Are losses clustering in unusual patterns?
3. Do outcomes seem manipulated?

**Respond in JSON:**
{
    "manipulation_detected": true/false,
    "confidence": 0.0-1.0,
    "reasoning": "explanation",
    "recommendation": "advice for trader"
}"""

            response = self.model.generate_content(prompt)
            return self._parse_response(response.text)
            
        except Exception as e:
            logger.error(f"Manipulation detection failed: {e}")
            return {'manipulation_detected': False, 'confidence': 0.0}
    
    def is_ready(self) -> bool:
        """Check if client is ready"""
        return self.ready
    
    def get_stats(self) -> Dict:
        """Get usage statistics"""
        return {
            'ready': self.ready,
            'model': settings.GEMINI_MODEL,
            'request_count': self.request_count
        }
