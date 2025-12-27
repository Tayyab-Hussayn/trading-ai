/**
 * IndexedDB wrapper for Binary Trading AI Agent
 * Handles all data persistence for candles, patterns, predictions, and statistics
 */

import { openDB } from 'idb';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';

const DB_NAME = 'BinaryTradingAI';
const DB_VERSION = 1;

class Database {
    constructor() {
        this.db = null;
    }

    /**
     * Initialize database connection
     */
    async init() {
        try {
            this.db = await openDB(DB_NAME, DB_VERSION, {
                upgrade(db, oldVersion, newVersion, transaction) {
                    logger.info(`Upgrading database from ${oldVersion} to ${newVersion}`);

                    // Candles store - raw OHLC data
                    if (!db.objectStoreNames.contains('candles')) {
                        const candlesStore = db.createObjectStore('candles', {
                            keyPath: 'timestamp'
                        });
                        candlesStore.createIndex('date', 'date');
                    }

                    // Patterns store - extracted features
                    if (!db.objectStoreNames.contains('patterns')) {
                        const patternsStore = db.createObjectStore('patterns', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        patternsStore.createIndex('timestamp', 'timestamp');
                        patternsStore.createIndex('patternType', 'patternType', { multiEntry: true });
                    }

                    // Predictions store - with validation status
                    if (!db.objectStoreNames.contains('predictions')) {
                        const predictionsStore = db.createObjectStore('predictions', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        predictionsStore.createIndex('timestamp', 'timestamp');
                        predictionsStore.createIndex('validated', 'validated');
                        predictionsStore.createIndex('patternId', 'patternId');
                    }

                    // Pattern scores - success/failure tracking
                    if (!db.objectStoreNames.contains('patternScores')) {
                        const scoresStore = db.createObjectStore('patternScores', {
                            keyPath: 'signature'
                        });
                        scoresStore.createIndex('successRate', 'successRate');
                        scoresStore.createIndex('lastSeen', 'lastSeen');
                    }

                    // Stats store - daily aggregates
                    if (!db.objectStoreNames.contains('stats')) {
                        db.createObjectStore('stats', {
                            keyPath: 'date'
                        });
                    }
                }
            });

            logger.info('Database initialized successfully');
            return true;
        } catch (error) {
            logger.error('Failed to initialize database', error);
            return false;
        }
    }

    /**
     * Store a candle
     */
    async storeCandle(candle) {
        try {
            const candleData = {
                ...candle,
                date: new Date(candle.timestamp).toISOString().split('T')[0]
            };
            await this.db.put('candles', candleData);
            logger.debug('Candle stored', candleData);
            return true;
        } catch (error) {
            logger.error('Failed to store candle', error);
            return false;
        }
    }

    /**
     * Store multiple candles
     */
    async storeCandles(candles) {
        try {
            const tx = this.db.transaction('candles', 'readwrite');
            const store = tx.objectStore('candles');

            for (const candle of candles) {
                const candleData = {
                    ...candle,
                    date: new Date(candle.timestamp).toISOString().split('T')[0]
                };
                await store.put(candleData);
            }

            await tx.done;
            logger.debug(`Stored ${candles.length} candles`);
            return true;
        } catch (error) {
            logger.error('Failed to store candles', error);
            return false;
        }
    }

    /**
     * Get candles in time range
     */
    async getCandles(startTime, endTime = Date.now()) {
        try {
            const tx = this.db.transaction('candles', 'readonly');
            const store = tx.objectStore('candles');
            const index = store.index('timestamp');

            const range = IDBKeyRange.bound(startTime, endTime);
            const candles = await index.getAll(range);

            return candles;
        } catch (error) {
            logger.error('Failed to get candles', error);
            return [];
        }
    }

    /**
     * Get last N candles
     */
    async getLastCandles(count = 20) {
        try {
            const allCandles = await this.db.getAll('candles');
            return allCandles.slice(-count);
        } catch (error) {
            logger.error('Failed to get last candles', error);
            return [];
        }
    }

    /**
     * Store a pattern
     */
    async storePattern(pattern) {
        try {
            const id = await this.db.add('patterns', pattern);
            logger.debug('Pattern stored', { id, pattern });
            return id;
        } catch (error) {
            logger.error('Failed to store pattern', error);
            return null;
        }
    }

    /**
     * Get pattern by ID
     */
    async getPattern(id) {
        try {
            return await this.db.get('patterns', id);
        } catch (error) {
            logger.error('Failed to get pattern', error);
            return null;
        }
    }

    /**
     * Get all patterns
     */
    async getAllPatterns() {
        try {
            return await this.db.getAll('patterns');
        } catch (error) {
            logger.error('Failed to get all patterns', error);
            return [];
        }
    }

    /**
     * Store a prediction
     */
    async storePrediction(prediction) {
        try {
            const id = await this.db.add('predictions', prediction);
            logger.debug('Prediction stored', { id, prediction });
            return id;
        } catch (error) {
            logger.error('Failed to store prediction', error);
            return null;
        }
    }

    /**
     * Update prediction
     */
    async updatePrediction(id, updates) {
        try {
            const prediction = await this.db.get('predictions', id);
            if (!prediction) {
                logger.warn(`Prediction ${id} not found`);
                return false;
            }

            const updated = { ...prediction, ...updates };
            await this.db.put('predictions', updated);
            logger.debug('Prediction updated', { id, updates });
            return true;
        } catch (error) {
            logger.error('Failed to update prediction', error);
            return false;
        }
    }

    /**
     * Get unvalidated predictions
     */
    async getUnvalidatedPredictions() {
        try {
            const tx = this.db.transaction('predictions', 'readonly');
            const store = tx.objectStore('predictions');
            const index = store.index('validated');

            const predictions = await index.getAll(false);
            return predictions;
        } catch (error) {
            logger.error('Failed to get unvalidated predictions', error);
            return [];
        }
    }

    /**
     * Get recent predictions
     */
    async getRecentPredictions(count = 10) {
        try {
            const allPredictions = await this.db.getAll('predictions');
            return allPredictions.slice(-count).reverse();
        } catch (error) {
            logger.error('Failed to get recent predictions', error);
            return [];
        }
    }

    /**
     * Get validated predictions for training
     */
    async getValidatedPredictions(days = 30) {
        try {
            const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            const tx = this.db.transaction('predictions', 'readonly');
            const store = tx.objectStore('predictions');
            const index = store.index('validated');

            const allValidated = await index.getAll(true);
            return allValidated.filter(p => p.timestamp >= cutoffTime);
        } catch (error) {
            logger.error('Failed to get validated predictions', error);
            return [];
        }
    }

    /**
     * Store or update pattern score
     */
    async updatePatternScore(signature, wasCorrect) {
        try {
            let score = await this.db.get('patternScores', signature);

            if (!score) {
                score = {
                    signature,
                    successCount: 0,
                    failureCount: 0,
                    successRate: 0,
                    lastSeen: Date.now(),
                    totalOccurrences: 0
                };
            }

            if (wasCorrect) {
                score.successCount++;
            } else {
                score.failureCount++;
            }

            score.totalOccurrences = score.successCount + score.failureCount;
            score.successRate = score.successCount / score.totalOccurrences;
            score.lastSeen = Date.now();

            await this.db.put('patternScores', score);
            logger.debug('Pattern score updated', score);
            return score;
        } catch (error) {
            logger.error('Failed to update pattern score', error);
            return null;
        }
    }

    /**
     * Get pattern score
     */
    async getPatternScore(signature) {
        try {
            return await this.db.get('patternScores', signature);
        } catch (error) {
            logger.error('Failed to get pattern score', error);
            return null;
        }
    }

    /**
     * Store daily statistics
     */
    async storeStats(date, stats) {
        try {
            const statsData = {
                date,
                ...stats,
                updatedAt: Date.now()
            };
            await this.db.put('stats', statsData);
            logger.debug('Stats stored', statsData);
            return true;
        } catch (error) {
            logger.error('Failed to store stats', error);
            return false;
        }
    }

    /**
     * Get statistics for a date
     */
    async getStats(date) {
        try {
            return await this.db.get('stats', date);
        } catch (error) {
            logger.error('Failed to get stats', error);
            return null;
        }
    }

    /**
     * Get today's statistics
     */
    async getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        return await this.getStats(today);
    }

    /**
     * Clean up old data
     */
    async cleanup(retentionDays = CONFIG.DATA_RETENTION_DAYS) {
        try {
            const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
            const cutoffDate = new Date(cutoffTime).toISOString().split('T')[0];

            let deletedCount = 0;

            // Clean candles
            const tx1 = this.db.transaction('candles', 'readwrite');
            const candlesStore = tx1.objectStore('candles');
            const candlesIndex = candlesStore.index('date');
            const oldCandles = await candlesIndex.getAllKeys(IDBKeyRange.upperBound(cutoffDate, true));

            for (const key of oldCandles) {
                await candlesStore.delete(key);
                deletedCount++;
            }
            await tx1.done;

            // Clean patterns
            const tx2 = this.db.transaction('patterns', 'readwrite');
            const patternsStore = tx2.objectStore('patterns');
            const patternsIndex = patternsStore.index('timestamp');
            const oldPatterns = await patternsIndex.getAllKeys(IDBKeyRange.upperBound(cutoffTime, true));

            for (const key of oldPatterns) {
                await patternsStore.delete(key);
                deletedCount++;
            }
            await tx2.done;

            logger.info(`Cleanup completed: deleted ${deletedCount} old records`);
            return deletedCount;
        } catch (error) {
            logger.error('Failed to cleanup old data', error);
            return 0;
        }
    }

    /**
     * Get database statistics
     */
    async getDatabaseStats() {
        try {
            const candlesCount = await this.db.count('candles');
            const patternsCount = await this.db.count('patterns');
            const predictionsCount = await this.db.count('predictions');
            const scoresCount = await this.db.count('patternScores');

            return {
                candles: candlesCount,
                patterns: patternsCount,
                predictions: predictionsCount,
                patternScores: scoresCount
            };
        } catch (error) {
            logger.error('Failed to get database stats', error);
            return null;
        }
    }
}

// Export singleton instance
export const database = new Database();
export default database;
