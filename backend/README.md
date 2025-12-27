# Binary Trading AI Backend

Python FastAPI backend for the Binary Trading AI Agent. Handles all ML/AI processing with full debugging capabilities.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and add your Gemini API key
```

### 3. Run Server

```bash
python main.py
```

The server will start on:
- **WebSocket**: `ws://localhost:8000/ws`
- **API**: `http://localhost:8000`

## 📡 WebSocket Protocol

### Extension → Backend

```json
{
  "type": "CANDLES_UPDATE",
  "data": {
    "candles": [
      {"open": 100, "close": 102, "high": 103, "low": 99, "timestamp": 1234567890}
    ],
    "platform": "quotex"
  }
}
```

### Backend → Extension

```json
{
  "type": "PREDICTION",
  "data": {
    "prediction": "UP",
    "confidence": 0.85,
    "method": "ensemble",
    "patterns": ["hammer", "bullish_engulfing"]
  }
}
```

## 🧪 Testing

```bash
# Test WebSocket connection
python -c "
import asyncio
import websockets
import json

async def test():
    async with websockets.connect('ws://localhost:8000/ws') as ws:
        # Send test data
        await ws.send(json.dumps({
            'type': 'PING'
        }))
        response = await ws.recv()
        print(response)

asyncio.run(test())
"
```

## 📊 API Endpoints

- `GET /` - Health check
- `GET /status` - System status
- `WS /ws` - WebSocket connection

## 🔧 Development

```bash
# Run with auto-reload
uvicorn main:app --reload --log-level debug

# View logs
tail -f logs/trading_ai.log
```

## 📁 Project Structure

```
backend/
├── main.py                 # FastAPI server
├── requirements.txt        # Dependencies
├── .env.example           # Config template
├── ml/                    # ML models (TODO)
├── ai/                    # Gemini AI (TODO)
├── database/              # Database models (TODO)
└── README.md             # This file
```

## ⚠️ Notes

- Backend runs locally on your machine
- All data stays on your computer
- No external servers involved
- Extension connects to localhost:8000
