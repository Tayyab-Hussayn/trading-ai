/**
 * Gemini AI Client - Integration with Google's Gemini API
 * Provides intelligent analysis and insights for trading predictions
 */

import { logger } from '../utils/logger.js';
import { StorageUtils } from '../utils/storage.js';
import { CONFIG } from '../config.js';

export class GeminiClient {
    constructor() {
        this.apiKey = null;
        this.model = CONFIG.GEMINI.defaultModel;
        this.requestCount = 0;
        this.lastRequestTime = 0;
    }

    /**
     * Initialize client with API key
     */
    async init() {
        this.apiKey = await StorageUtils.getGeminiApiKey();
        const settings = await StorageUtils.getSettings();
        this.model = settings.selectedGeminiModel || CONFIG.GEMINI.defaultModel;

        if (!this.apiKey) {
            logger.warn('Gemini API key not configured');
            return false;
        }

        logger.info('Gemini client initialized', { model: this.model });
        return true;
    }

    /**
     * Check if client is ready
     */
    isReady() {
        return !!this.apiKey;
    }

    /**
     * Make API request with rate limiting
     */
    async makeRequest(prompt, options = {}) {
        if (!this.isReady()) {
            logger.warn('Gemini client not ready');
            return null;
        }

        // Rate limiting
        await this.enforceRateLimit();

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: options.temperature || 0.7,
                topK: options.topK || 40,
                topP: options.topP || 0.95,
                maxOutputTokens: options.maxOutputTokens || 1024
            }
        };

        try {
            const response = await this.fetchWithRetry(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.candidates && data.candidates.length > 0) {
                const text = data.candidates[0].content.parts[0].text;
                logger.debug('Gemini response received', { length: text.length });
                return text;
            }

            logger.warn('No response from Gemini');
            return null;
        } catch (error) {
            logger.error('Gemini API request failed', error);
            return null;
        }
    }

    /**
     * Fetch with retry logic
     */
    async fetchWithRetry(url, options, retries = CONFIG.GEMINI.maxRetries) {
        for (let i = 0; i < retries; i++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), CONFIG.GEMINI.timeout);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });

                clearTimeout(timeout);
                return response;
            } catch (error) {
                if (i === retries - 1) throw error;
                logger.warn(`Retry ${i + 1}/${retries}`, error);
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }

    /**
     * Enforce rate limiting
     */
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const minInterval = 60000 / CONFIG.GEMINI.rateLimit.requestsPerMinute;

        if (timeSinceLastRequest < minInterval) {
            const waitTime = minInterval - timeSinceLastRequest;
            logger.debug(`Rate limiting: waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
        this.requestCount++;
    }

    /**
     * Analyze pattern with AI
     */
    async analyzePattern(features, patterns, candles) {
        const prompt = this.buildPatternAnalysisPrompt(features, patterns, candles);
        const response = await this.makeRequest(prompt, { temperature: 0.5 });

        if (!response) return null;

        try {
            // Parse JSON response
            const analysis = JSON.parse(response);
            return analysis;
        } catch (error) {
            logger.warn('Failed to parse Gemini response as JSON', error);
            return { analysis: response };
        }
    }

    /**
     * Build pattern analysis prompt
     */
    buildPatternAnalysisPrompt(features, patterns, candles) {
        const last5 = candles.slice(-5).map(c => ({
            open: c.open.toFixed(2),
            close: c.close.toFixed(2),
            high: c.high.toFixed(2),
            low: c.low.toFixed(2),
            direction: c.close > c.open ? 'bullish' : 'bearish'
        }));

        return `You are an expert binary trading analyst. Analyze this candlestick pattern and provide insights.

**Recent Candles (last 5):**
${JSON.stringify(last5, null, 2)}

**Detected Patterns:**
${patterns.join(', ') || 'None'}

**Key Features:**
- Short-term trend slope: ${features.shortTermSlope?.toFixed(4)}
- Medium-term trend slope: ${features.mediumTermSlope?.toFixed(4)}
- Volatility ratio: ${features.volatilityRatio?.toFixed(2)}
- Consecutive bullish: ${features.consecutiveBullish}
- Consecutive bearish: ${features.consecutiveBearish}
- Near support: ${features.nearSupport ? 'Yes' : 'No'}
- Near resistance: ${features.nearResistance ? 'Yes' : 'No'}

Provide a JSON response with:
{
  "direction": "UP" or "DOWN",
  "confidence": 0-1,
  "reasoning": "brief explanation",
  "riskFactors": ["factor1", "factor2"],
  "keyIndicators": ["indicator1", "indicator2"]
}`;
    }

    /**
     * Detect broker manipulation
     */
    async detectManipulation(predictions, stats) {
        const prompt = this.buildManipulationDetectionPrompt(predictions, stats);
        const response = await this.makeRequest(prompt, { temperature: 0.3 });

        if (!response) return null;

        try {
            return JSON.parse(response);
        } catch (error) {
            return { suspicious: false, analysis: response };
        }
    }

    /**
     * Build manipulation detection prompt
     */
    buildManipulationDetectionPrompt(predictions, stats) {
        return `You are a fraud detection expert analyzing binary trading patterns for broker manipulation.

**Statistics:**
- Total predictions: ${stats.totalPredictions}
- Win rate: ${(stats.winRate * 100).toFixed(1)}%
- Recent win rate (last 20): ${(stats.recentWinRate * 100).toFixed(1)}%
- Average confidence: ${(stats.avgConfidence * 100).toFixed(1)}%

**Recent Predictions (last 10):**
${predictions.slice(-10).map(p =>
            `- Predicted: ${p.prediction}, Actual: ${p.actualOutcome}, Confidence: ${(p.confidence * 100).toFixed(1)}%`
        ).join('\n')}

Analyze for suspicious patterns that might indicate broker manipulation:
- Unusual loss clustering
- Win rate significantly below expected
- High confidence predictions failing consistently
- Patterns that suggest price manipulation

Provide JSON response:
{
  "suspicious": true/false,
  "confidence": 0-1,
  "indicators": ["indicator1", "indicator2"],
  "recommendation": "action to take"
}`;
    }

    /**
     * Get trading advice
     */
    async getTradingAdvice(prediction, context) {
        const prompt = `As a binary trading advisor, provide advice for this prediction:

**Prediction:** ${prediction.prediction} (${(prediction.confidence * 100).toFixed(1)}% confidence)
**Patterns:** ${prediction.patterns?.join(', ') || 'None'}
**Method:** ${prediction.method}

**Context:**
- Recent win rate: ${(context.winRate * 100).toFixed(1)}%
- Consecutive losses: ${context.consecutiveLosses}
- Today's trades: ${context.todayTrades}

Should the user take this trade? Provide JSON:
{
  "recommendation": "TAKE" or "SKIP",
  "reasoning": "brief explanation",
  "riskLevel": "LOW", "MEDIUM", or "HIGH"
}`;

        const response = await this.makeRequest(prompt, { temperature: 0.4 });

        if (!response) return null;

        try {
            return JSON.parse(response);
        } catch (error) {
            return { recommendation: 'SKIP', reasoning: response };
        }
    }
}

export default GeminiClient;
