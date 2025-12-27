"""
Binary Trading AI Agent - FastAPI Backend
Main server handling all ML/AI processing
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
from datetime import datetime
import json

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Binary Trading AI Backend")

# CORS for extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active WebSocket connections
active_connections: list[WebSocket] = []


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Binary Trading AI Backend",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/status")
async def get_status():
    """Get system status"""
    return {
        "active_connections": len(active_connections),
        "ml_model_loaded": False,  # TODO: Implement
        "database_connected": False,  # TODO: Implement
        "timestamp": datetime.now().isoformat()
    }


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
                "timestamp": datetime.now().isoformat()
            }
        })
        
        while True:
            # Receive data from extension
            data = await websocket.receive_text()
            message = json.loads(data)
            
            logger.info(f"📨 Received: {message.get('type', 'UNKNOWN')}")
            logger.debug(f"Data: {message}")
            
            # Handle different message types
            if message["type"] == "CANDLES_UPDATE":
                response = await handle_candles_update(message["data"])
                await websocket.send_json(response)
                
            elif message["type"] == "PING":
                await websocket.send_json({
                    "type": "PONG",
                    "data": {"timestamp": datetime.now().isoformat()}
                })
                
            else:
                logger.warning(f"Unknown message type: {message.get('type')}")
                
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        logger.info(f"❌ WebSocket disconnected. Remaining: {len(active_connections)}")
        
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        if websocket in active_connections:
            active_connections.remove(websocket)


async def handle_candles_update(data: dict) -> dict:
    """
    Process candles data and return prediction
    
    TODO: Implement full ML pipeline
    """
    candles = data.get("candles", [])
    platform = data.get("platform", "unknown")
    
    logger.info(f"🕯️  Processing {len(candles)} candles from {platform}")
    
    # For now, return a mock prediction
    # TODO: Implement actual ML prediction
    
    return {
        "type": "PREDICTION",
        "data": {
            "prediction": "UP",
            "confidence": 0.75,
            "method": "mock",
            "patterns": ["testing"],
            "candles_processed": len(candles),
            "timestamp": datetime.now().isoformat()
        }
    }


if __name__ == "__main__":
    logger.info("🚀 Starting Binary Trading AI Backend...")
    logger.info("📡 WebSocket will be available at: ws://localhost:8000/ws")
    logger.info("🌐 API will be available at: http://localhost:8000")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
