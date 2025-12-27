"""
Database Manager - Handles all database operations
"""

import sqlite3
import json
import logging
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import numpy as np

from config.settings import settings

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Manages SQLite database for candles, predictions, and patterns"""
    
    def __init__(self, db_path: str = "trading_ai.db"):
        self.db_path = db_path
        self.conn = None
        
    def connect(self):
        """Connect to database"""
        try:
            self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self.conn.row_factory = sqlite3.Row
            self._create_tables()
            logger.info(f"Connected to database: {self.db_path}")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    def _create_tables(self):
        """Create database tables"""
        cursor = self.conn.cursor()
        
        # Candles table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS candles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                platform TEXT DEFAULT 'quotex',
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)
        
        # Predictions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                prediction TEXT NOT NULL,
                confidence REAL NOT NULL,
                features TEXT NOT NULL,
                patterns TEXT,
                method TEXT DEFAULT 'ensemble',
                validated BOOLEAN DEFAULT 0,
                was_correct BOOLEAN,
                actual_outcome TEXT,
                validation_timestamp INTEGER,
                ai_analysis TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)
        
        # Pattern scores table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pattern_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                signature TEXT UNIQUE NOT NULL,
                success_count INTEGER DEFAULT 0,
                failure_count INTEGER DEFAULT 0,
                last_seen INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)
        
        # Statistics table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE NOT NULL,
                total_predictions INTEGER DEFAULT 0,
                correct_predictions INTEGER DEFAULT 0,
                win_rate REAL DEFAULT 0.0,
                avg_confidence REAL DEFAULT 0.0,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON candles(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_predictions_timestamp ON predictions(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_predictions_validated ON predictions(validated)")
        
        self.conn.commit()
        logger.info("Database tables created/verified")
    
    async def store_candles(self, candles: List[Dict], platform: str = "quotex"):
        """Store candles in database"""
        cursor = self.conn.cursor()
        
        for candle in candles:
            cursor.execute("""
                INSERT INTO candles (timestamp, open, high, low, close, platform)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                candle.get('timestamp', int(datetime.now().timestamp() * 1000)),
                candle['open'],
                candle['high'],
                candle['low'],
                candle['close'],
                platform
            ))
        
        self.conn.commit()
        logger.debug(f"Stored {len(candles)} candles")
    
    async def get_recent_candles(self, count: int = 20) -> List[Dict]:
        """Get most recent candles"""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT timestamp, open, high, low, close
            FROM candles
            ORDER BY timestamp DESC
            LIMIT ?
        """, (count,))
        
        rows = cursor.fetchall()
        
        # Convert to list of dicts (reverse to chronological order)
        candles = []
        for row in reversed(rows):
            candles.append({
                'timestamp': row['timestamp'],
                'open': row['open'],
                'high': row['high'],
                'low': row['low'],
                'close': row['close']
            })
        
        return candles
    
    async def store_prediction(self, prediction: Dict) -> int:
        """Store prediction"""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            INSERT INTO predictions (
                timestamp, prediction, confidence, features, patterns,
                method, ai_analysis
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            int(datetime.now().timestamp() * 1000),
            prediction['prediction'],
            prediction['confidence'],
            json.dumps(prediction.get('features', {})),
            json.dumps(prediction.get('patterns', [])),
            prediction.get('method', 'ensemble'),
            json.dumps(prediction.get('ai_analysis', {}))
        ))
        
        self.conn.commit()
        return cursor.lastrowid
    
    async def get_unvalidated_predictions(self) -> List[Dict]:
        """Get predictions that need validation"""
        cursor = self.conn.cursor()
        
        # Get predictions older than validation delay
        cutoff_time = int((datetime.now() - timedelta(minutes=settings.VALIDATION_DELAY_MINUTES)).timestamp() * 1000)
        
        cursor.execute("""
            SELECT id, timestamp, prediction, confidence, features, patterns
            FROM predictions
            WHERE validated = 0 AND timestamp < ?
            ORDER BY timestamp ASC
        """, (cutoff_time,))
        
        rows = cursor.fetchall()
        
        predictions = []
        for row in rows:
            predictions.append({
                'id': row['id'],
                'timestamp': row['timestamp'],
                'prediction': row['prediction'],
                'confidence': row['confidence'],
                'features': json.loads(row['features']),
                'patterns': json.loads(row['patterns']) if row['patterns'] else []
            })
        
        return predictions
    
    async def validate_prediction(self, prediction_id: int, was_correct: bool, actual_outcome: str):
        """Mark prediction as validated"""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            UPDATE predictions
            SET validated = 1, was_correct = ?, actual_outcome = ?,
                validation_timestamp = ?
            WHERE id = ?
        """, (was_correct, actual_outcome, int(datetime.now().timestamp() * 1000), prediction_id))
        
        self.conn.commit()
        logger.debug(f"Validated prediction {prediction_id}: {was_correct}")
    
    async def get_training_data(self, limit: int = 1000) -> tuple:
        """Get validated predictions for training"""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT features, actual_outcome
            FROM predictions
            WHERE validated = 1 AND actual_outcome IS NOT NULL
            ORDER BY timestamp DESC
            LIMIT ?
        """, (limit,))
        
        rows = cursor.fetchall()
        
        if not rows:
            return np.array([]), np.array([])
        
        X = []
        y = []
        
        outcome_map = {'UP': 0, 'DOWN': 1, 'NEUTRAL': 2}
        
        for row in rows:
            features = json.loads(row['features'])
            # Convert features dict to array (simplified)
            feature_array = [features.get(k, 0) for k in sorted(features.keys())]
            X.append(feature_array)
            y.append(outcome_map.get(row['actual_outcome'], 2))
        
        return np.array(X), np.array(y)
    
    async def find_similar_patterns(self, features: Dict, patterns: List[str], limit: int = 10) -> List[Dict]:
        """Find similar historical patterns"""
        # Simplified: just get recent validated predictions with same patterns
        cursor = self.conn.cursor()
        
        if not patterns:
            return []
        
        patterns_json = json.dumps(patterns)
        
        cursor.execute("""
            SELECT prediction, confidence, actual_outcome, patterns
            FROM predictions
            WHERE validated = 1 AND patterns LIKE ?
            ORDER BY timestamp DESC
            LIMIT ?
        """, (f'%{patterns[0]}%', limit))
        
        rows = cursor.fetchall()
        
        similar = []
        for row in rows:
            if row['actual_outcome']:
                similar.append({
                    'prediction': row['prediction'],
                    'confidence': row['confidence'],
                    'outcome': row['actual_outcome'],
                    'patterns': json.loads(row['patterns']) if row['patterns'] else []
                })
        
        return similar
    
    async def get_recent_performance(self, days: int = 7) -> Dict:
        """Get recent performance statistics"""
        cursor = self.conn.cursor()
        
        cutoff = int((datetime.now() - timedelta(days=days)).timestamp() * 1000)
        
        cursor.execute("""
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct
            FROM predictions
            WHERE validated = 1 AND timestamp > ?
        """, (cutoff,))
        
        row = cursor.fetchone()
        
        total = row['total'] or 0
        correct = row['correct'] or 0
        win_rate = correct / total if total > 0 else 0
        
        # Get last 10 results
        cursor.execute("""
            SELECT was_correct
            FROM predictions
            WHERE validated = 1
            ORDER BY timestamp DESC
            LIMIT 10
        """)
        
        last_10 = ['W' if r['was_correct'] else 'L' for r in cursor.fetchall()]
        
        return {
            'total': total,
            'correct': correct,
            'win_rate': win_rate,
            'last_10': ''.join(last_10)
        }
    
    async def get_stats(self) -> Dict:
        """Get overall statistics"""
        cursor = self.conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as count FROM candles")
        total_candles = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM predictions")
        total_predictions = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM predictions WHERE validated = 1")
        validated_predictions = cursor.fetchone()['count']
        
        cursor.execute("""
            SELECT AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) as win_rate
            FROM predictions WHERE validated = 1
        """)
        win_rate = cursor.fetchone()['win_rate'] or 0
        
        return {
            'total_candles': total_candles,
            'total_predictions': total_predictions,
            'validated_predictions': validated_predictions,
            'win_rate': win_rate
        }
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")
