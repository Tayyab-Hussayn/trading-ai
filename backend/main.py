"""
Binary Trading AI Agent - Main FastAPI Backend
Handles all ML/AI processing, predictions, and learning
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import asyncio
from datetime import datetime
import json
from typing import Dict, List

# Import our modules
from config.settings import settings
from data.database import DatabaseManager
from ml.neural_network import ModelManager
from ml.prediction_engine import PredictionEngine
from ml.learning_system import LearningSystem
from ai.gemini_client import GeminiClient

# Setup logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(settings.LOG_FILE) if settings.LOG_FILE else logging.NullHandler()
    ]
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Binary Trading AI Backend",
    description="Intelligent AI system for binary trading pattern recognition and prediction",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
db_manager: DatabaseManager = None
model_manager: ModelManager = None
gemini_client: GeminiClient = None
prediction_engine: PredictionEngine = None
learning_system: LearningSystem = None

# Active WebSocket connections
active_connections: List[WebSocket] = []

# Background tasks
background_tasks_running = False


@app.on_event("startup")
async def startup_event():
    """Initialize system on startup"""
    global db_manager, model_manager, gemini_client, prediction_engine, learning_system
    
    logger.info("=" * 60)
    logger.info("🚀 Starting Binary Trading AI Backend")
    logger.info("=" * 60)
    
    try:
        # Initialize database
        logger.info("📊 Initializing database...")
        db_manager = DatabaseManager()
        db_manager.connect()
        
        # Initialize ML model
        logger.info("🧠 Initializing neural network...")
        model_manager = ModelManager()
        model_manager.initialize_model()
        
        # Initialize Gemini AI
        logger.info("🤖 Initializing Gemini AI...")
        gemini_client = GeminiClient()
        gemini_client.initialize()
        
        # Initialize prediction engine
        logger.info("🎯 Initializing prediction engine...")
        prediction_engine = PredictionEngine(db_manager, model_manager, gemini_client)
        
        # Initialize learning system
        logger.info("📚 Initializing learning system...")
        learning_system = LearningSystem(db_manager, model_manager)
        
        # Start background tasks
        asyncio.create_task(background_validation_loop())
        
        logger.info("=" * 60)
        logger.info("✅ System initialized successfully!")
        logger.info("=" * 60)
        logger.info(f"📡 WebSocket: ws://localhost:{settings.PORT}/ws")
        logger.info(f"🌐 API Docs: http://localhost:{settings.PORT}/docs")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}", exc_info=True)
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down...")
    
    if db_manager:
        db_manager.close()
    
    logger.info("Shutdown complete")


async def background_validation_loop():
    """Background task for validating predictions"""
    global background_tasks_running
    background_tasks_running = True
    
    logger.info("🔄 Background validation loop started")
    
    while background_tasks_running:
        try:
            # Wait 1 minute
            await asyncio.sleep(60)
            
            # Validate predictions
            await learning_system.validate_predictions()
            
            # Check if retraining needed
            if await learning_system.should_retrain():
                logger.info("🎓 Retraining threshold reached")
                result = await learning_system.retrain_model()
                
                if result['success']:
                    logger.info(f"✅ Model retrained successfully: {result['stats']['final_accuracy']:.2%} accuracy")
                    
                    # Notify connected clients
                    await broadcast_to_clients({
                        'type': 'MODEL_RETRAINED',
                        'data': result
                    })
                else:
                    logger.warning(f"⚠️ Retraining failed: {result.get('reason', 'unknown')}")
            
        except Exception as e:
            logger.error(f"Background task error: {e}", exc_info=True)
            await asyncio.sleep(60)


async def broadcast_to_clients(message: Dict):
    """Broadcast message to all connected WebSocket clients"""
    for connection in active_connections:
        try:
            await connection.send_json(message)
        except:
            pass


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Binary Trading AI Backend",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/status")
async def get_status():
    """Get system status"""
    db_stats = await db_manager.get_stats()
    model_stats = model_manager.get_stats()
    gemini_stats = gemini_client.get_stats()
    learning_stats = learning_system.get_stats()
    
    return {
        "system": {
            "active_connections": len(active_connections),
            "background_tasks_running": background_tasks_running
        },
        "database": db_stats,
        "model": model_stats,
        "gemini": gemini_stats,
        "learning": learning_stats,
        "timestamp": datetime.now().isoformat()
    }


@app.get("/performance")
async def get_performance():
    """Get performance statistics"""
    recent_perf = await db_manager.get_recent_performance(days=7)
    
    return {
        "recent_7_days": recent_perf,
        "timestamp": datetime.now().isoformat()
    }


@app.post("/retrain")
async def trigger_retrain():
    """Manually trigger model retraining"""
    result = await learning_system.retrain_model()
    
    if result['success']:
        return {
            "success": True,
            "message": "Model retrained successfully",
            "stats": result['stats']
        }
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Retraining failed'))


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication with extension"""
    await websocket.accept()
    active_connections.append(websocket)
    
    logger.info(f"✅ New WebSocket connection. Total: {len(active_connections)}")
    
    try:
        # Send welcome message
        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "data": {
                "message": "Connected to Trading AI Backend",
                "timestamp": datetime.now().isoformat(),
                "system_ready": True
            }
        })
        
        while True:
            # Receive data from extension
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get('type', 'UNKNOWN')
            logger.info(f"📨 Received: {message_type}")
            
            # Handle different message types
            if message_type == "CANDLES_UPDATE":
                response = await handle_candles_update(message['data'])
                await websocket.send_json(response)
                
            elif message_type == "PING":
                await websocket.send_json({
                    "type": "PONG",
                    "data": {"timestamp": datetime.now().isoformat()}
                })
                
            elif message_type == "GET_STATUS":
                status = await get_status()
                await websocket.send_json({
                    "type": "STATUS",
                    "data": status
                })
                
            else:
                logger.warning(f"Unknown message type: {message_type}")
                await websocket.send_json({
                    "type": "ERROR",
                    "data": {"message": f"Unknown message type: {message_type}"}
                })
                
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        logger.info(f"❌ WebSocket disconnected. Remaining: {len(active_connections)}")
        
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        if websocket in active_connections:
            active_connections.remove(websocket)


async def handle_candles_update(data: Dict) -> Dict:
    """
    Process candles data and return prediction
    """
    try:
        candles = data.get("candles", [])
        platform = data.get("platform", "quotex")
        
        logger.info(f"🕯️  Processing {len(candles)} candles from {platform}")
        
        # Store candles in database
        await db_manager.store_candles(candles, platform)
        
        # Make prediction if we have enough candles
        if len(candles) >= settings.CANDLE_HISTORY_LENGTH:
            prediction = await prediction_engine.predict(candles)
            
            if prediction and prediction.get('meets_threshold'):
                # Store prediction for later validation
                prediction_id = await db_manager.store_prediction(prediction)
                prediction['id'] = prediction_id
                
                logger.info(
                    f"🎯 SIGNAL: {prediction['prediction']} "
                    f"({prediction['confidence']:.1%}) "
                    f"[ID: {prediction_id}]"
                )
                
                return {
                    "type": "PREDICTION",
                    "data": {
                        "id": prediction_id,
                        "prediction": prediction['prediction'],
                        "confidence": prediction['confidence'],
                        "probabilities": prediction['probabilities'],
                        "method": prediction['method'],
                        "patterns": prediction.get('patterns', []),
                        "ai_analysis": prediction.get('ai_analysis'),
                        "manipulation_warning": prediction.get('manipulation_warning', False),
                        "timestamp": prediction['timestamp']
                    }
                }
            else:
                logger.debug("No high-confidence prediction")
                return {
                    "type": "NO_SIGNAL",
                    "data": {
                        "message": "No high-confidence signal",
                        "confidence": prediction['confidence'] if prediction else 0,
                        "threshold": settings.MIN_CONFIDENCE_THRESHOLD
                    }
                }
        else:
            logger.debug(f"Not enough candles: {len(candles)}")
            return {
                "type": "INSUFFICIENT_DATA",
                "data": {
                    "message": f"Need {settings.CANDLE_HISTORY_LENGTH} candles, got {len(candles)}",
                    "required": settings.CANDLE_HISTORY_LENGTH,
                    "received": len(candles)
                }
            }
            
    except Exception as e:
        logger.error(f"Error processing candles: {e}", exc_info=True)
        return {
            "type": "ERROR",
            "data": {
                "message": str(e),
                "timestamp": datetime.now().isoformat()
            }
        }


if __name__ == "__main__":
    logger.info("🚀 Starting Binary Trading AI Backend...")
    logger.info(f"📡 WebSocket will be available at: ws://localhost:{settings.PORT}/ws")
    logger.info(f"🌐 API will be available at: http://localhost:{settings.PORT}")
    logger.info(f"📚 API Docs: http://localhost:{settings.PORT}/docs")
    
    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower()
    )
