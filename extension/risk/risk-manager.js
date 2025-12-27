/**
 * Risk Manager - Protects against bad trading decisions
 * Implements trade filtering, limits, and cooldown mechanisms
 */

import { logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';

export class RiskManager {
    constructor(database) {
        this.database = database;
        this.rules = CONFIG.RISK_RULES;
    }

    /**
     * Check if trade should be allowed
     */
    async shouldAllowTrade(prediction) {
        const checks = [];

        // Get today's stats
        const stats = await this.getTodayStats();

        // Check 1: Daily limit
        if (stats.todayCount >= this.rules.maxTradesPerDay) {
            checks.push({
                passed: false,
                reason: `Daily limit reached (${stats.todayCount}/${this.rules.maxTradesPerDay})`
            });
        } else {
            checks.push({ passed: true, reason: 'Daily limit OK' });
        }

        // Check 2: Consecutive losses
        if (stats.consecutiveLosses >= this.rules.maxConsecutiveLosses) {
            checks.push({
                passed: false,
                reason: `Too many consecutive losses (${stats.consecutiveLosses})`
            });
        } else {
            checks.push({ passed: true, reason: 'Consecutive losses OK' });
        }

        // Check 3: Confidence threshold
        if (prediction.confidence < this.rules.minConfidence) {
            checks.push({
                passed: false,
                reason: `Confidence too low (${(prediction.confidence * 100).toFixed(1)}% < ${(this.rules.minConfidence * 100).toFixed(1)}%)`
            });
        } else {
            checks.push({ passed: true, reason: 'Confidence OK' });
        }

        // Check 4: Recent win rate
        if (stats.recentWinRate < this.rules.minWinRate && stats.recentCount >= 10) {
            checks.push({
                passed: false,
                reason: `Recent win rate too low (${(stats.recentWinRate * 100).toFixed(1)}%)`
            });
        } else {
            checks.push({ passed: true, reason: 'Win rate OK' });
        }

        // Check 5: Cooldown period
        const timeSinceLastLoss = Date.now() - stats.lastLossTime;
        if (timeSinceLastLoss < this.rules.cooldownAfterLoss && stats.lastLossTime > 0) {
            const remainingCooldown = Math.ceil((this.rules.cooldownAfterLoss - timeSinceLastLoss) / 1000);
            checks.push({
                passed: false,
                reason: `Cooldown period (${remainingCooldown}s remaining)`
            });
        } else {
            checks.push({ passed: true, reason: 'Cooldown OK' });
        }

        const allPassed = checks.every(c => c.passed);
        const failedChecks = checks.filter(c => !c.passed);

        logger.info('Risk check completed', {
            allowed: allPassed,
            checks: checks.length,
            failed: failedChecks.length
        });

        return {
            allowed: allPassed,
            checks,
            failedChecks,
            stats
        };
    }

    /**
     * Get today's trading statistics
     */
    async getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        const todayStats = await this.database.getStats(today);

        // Get recent predictions
        const recentPredictions = await this.database.getRecentPredictions(50);
        const validatedRecent = recentPredictions.filter(p => p.validated);

        // Calculate consecutive losses
        let consecutiveLosses = 0;
        for (let i = validatedRecent.length - 1; i >= 0; i--) {
            if (validatedRecent[i].wasCorrect === false) {
                consecutiveLosses++;
            } else if (validatedRecent[i].wasCorrect === true) {
                break;
            }
        }

        // Find last loss time
        const lastLoss = validatedRecent.find(p => p.wasCorrect === false);
        const lastLossTime = lastLoss ? lastLoss.validationTimestamp : 0;

        // Recent win rate (last 20 validated)
        const last20Validated = validatedRecent.slice(0, 20);
        const recentCorrect = last20Validated.filter(p => p.wasCorrect === true).length;
        const recentWinRate = last20Validated.length > 0 ? recentCorrect / last20Validated.length : 0;

        return {
            todayCount: todayStats?.totalPredictions || 0,
            consecutiveLosses,
            lastLossTime,
            recentWinRate,
            recentCount: last20Validated.length,
            todayWinRate: todayStats?.winRate || 0
        };
    }

    /**
     * Record trade decision
     */
    async recordDecision(prediction, allowed, reason) {
        logger.info('Trade decision recorded', {
            prediction: prediction.prediction,
            confidence: prediction.confidence,
            allowed,
            reason
        });

        // Could store this in database for analysis
        return true;
    }

    /**
     * Get risk assessment
     */
    getRiskLevel(prediction, stats) {
        let riskScore = 0;

        // Low confidence = higher risk
        if (prediction.confidence < 0.7) riskScore += 2;
        else if (prediction.confidence < 0.8) riskScore += 1;

        // Recent losses = higher risk
        if (stats.consecutiveLosses >= 2) riskScore += 2;
        else if (stats.consecutiveLosses >= 1) riskScore += 1;

        // Low win rate = higher risk
        if (stats.recentWinRate < 0.5) riskScore += 2;
        else if (stats.recentWinRate < 0.6) riskScore += 1;

        // Many trades today = higher risk
        if (stats.todayCount >= 15) riskScore += 1;

        if (riskScore >= 4) return 'HIGH';
        if (riskScore >= 2) return 'MEDIUM';
        return 'LOW';
    }
}

export default RiskManager;
