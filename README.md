# Binary Trading AI Agent

An intelligent, self-learning AI system for binary options trading that analyzes candlestick patterns through visual recognition, makes predictions, validates them, and continuously improves through reinforcement learning.

## 🎯 Overview

This system uses a **two-part architecture**:

1. **Chrome Extension** - Collects candlestick data from Quotex trading platform
2. **Python Backend** - Handles all ML/AI processing, predictions, and learning

The AI learns from every prediction, getting smarter over time through continuous validation and model retraining.

## ✨ Key Features

- 🕯️ **Visual Pattern Recognition** - Reads candlestick data directly from browser canvas
- 🧠 **Neural Network Predictions** - PyTorch-based deep learning model
- 📊 **Pattern Matching** - Identifies 10+ classic technical patterns
- 🤖 **Gemini AI Integration** - Enhanced analysis and broker manipulation detection
- 📈 **Self-Learning** - Validates predictions and retrains automatically
- ⚡ **Real-time Signals** - WebSocket communication for instant predictions
- 🛡️ **Risk Management** - Built-in safety rules and confidence thresholds

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│   Chrome Extension (Data Layer)    │
│  ┌──────────────────────────────┐  │
│  │  Content Script              │  │
│  │  - Reads Quotex canvas       │  │
│  │  - Extracts candlesticks     │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│  ┌──────────▼───────────────────┐  │
│  │  Background Worker           │  │
│  │  - WebSocket bridge          │  │
│  └──────────┬───────────────────┘  │
└─────────────┼───────────────────────┘
              │ WebSocket
              ▼
┌─────────────────────────────────────┐
│   Python Backend (AI/ML Layer)     │
│  ┌──────────────────────────────┐  │
│  │  FastAPI Server              │  │
│  │  - WebSocket endpoint        │  │
│  │  - REST API                  │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│  ┌──────────▼───────────────────┐  │
│  │  Prediction Engine           │  │
│  │  - Feature extraction        │  │
│  │  - Pattern detection         │  │
│  │  - Neural network            │  │
│  │  - Gemini AI analysis        │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│  ┌──────────▼───────────────────┐  │
│  │  Learning System             │  │
│  │  - Validates predictions     │  │
│  │  - Retrains model            │  │
│  │  - Tracks performance        │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

## 📦 Installation

### Prerequisites

- **Node.js** 18+ (for extension dependencies)
- **Python** 3.11+ (for backend)
- **Chrome/Chromium** browser
- **Gemini API Key** (optional, for AI features)

### 1. Clone Repository

```bash
git clone <repository-url>
cd Trading-AI
```

### 2. Install Extension Dependencies

```bash
npm install
```

### 3. Install Python Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Configure Environment

```bash
# In backend directory
cp .env.example .env
# Edit .env and add your Gemini API key
```

### 5. Load Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` folder

## 🚀 Usage

### Start the Python Backend

```bash
cd backend
source venv/bin/activate
python main.py
```

The backend will start on `http://localhost:8000`

- **WebSocket**: `ws://localhost:8000/ws`
- **API Docs**: `http://localhost:8000/docs`
- **Status**: `http://localhost:8000/status`

### Use the Extension

1. Open [Quotex](https://qxbroker.com) in Chrome
2. The extension will automatically connect to the backend
3. Wait for candlestick data to be collected (need 20+ candles)
4. Predictions will appear as browser notifications when confidence > 65%

### Monitor Performance

```bash
# Get system status
curl http://localhost:8000/status

# Get performance stats
curl http://localhost:8000/performance

# Manually trigger retraining
curl -X POST http://localhost:8000/retrain
```

## 🧠 How It Works

### 1. Data Collection
- Extension reads candlestick data from Quotex canvas every 5 seconds
- Sends data to Python backend via WebSocket

### 2. Feature Extraction
- Extracts 60+ features from last 20 candles:
  - Body ratios, wick ratios
  - Trend slopes (short/medium/long term)
  - Volatility metrics (ATR)
  - Support/resistance levels

### 3. Pattern Detection
- Identifies classic patterns:
  - Hammer, Doji, Engulfing
  - Morning Star, Evening Star
  - Three White Soldiers, Three Black Crows

### 4. Prediction
- **ML Model**: PyTorch neural network (128→64→32 neurons)
- **Historical Matching**: Finds similar past patterns
- **Ensemble**: Combines both (60% ML, 40% historical)
- **Gemini AI**: Enhances with contextual analysis

### 5. Validation & Learning
- Stores each prediction with timestamp
- After 5 minutes, checks actual outcome
- Updates model with correct/incorrect results
- Retrains automatically after 50 validated predictions

## 📊 Performance Tracking

The system tracks:
- **Win Rate**: Percentage of correct predictions
- **Confidence Accuracy**: How well confidence scores match outcomes
- **Pattern Success Rates**: Which patterns work best
- **Broker Manipulation**: Detects suspicious platform behavior

## ⚙️ Configuration

Edit `backend/config/settings.py`:

```python
# Prediction
MIN_CONFIDENCE_THRESHOLD = 0.65  # Only show signals above 65%
VALIDATION_DELAY_MINUTES = 5     # Wait 5 min to validate

# Learning
RETRAIN_THRESHOLD = 50           # Retrain after 50 validations

# Risk Management
MAX_TRADES_PER_DAY = 20
MAX_CONSECUTIVE_LOSSES = 3
COOLDOWN_AFTER_LOSS_MINUTES = 5
```

## 🔧 Development

### Project Structure

```
Trading-AI/
├── extension/              # Chrome extension
│   ├── manifest.json
│   ├── background.js       # WebSocket bridge
│   ├── content-script.js   # Canvas reader
│   └── popup/              # UI (TODO)
│
├── backend/                # Python backend
│   ├── main.py             # FastAPI server
│   ├── config/
│   │   └── settings.py     # Configuration
│   ├── ml/
│   │   ├── feature_extractor.py
│   │   ├── pattern_detector.py
│   │   ├── neural_network.py
│   │   ├── prediction_engine.py
│   │   └── learning_system.py
│   ├── ai/
│   │   └── gemini_client.py
│   └── data/
│       └── database.py
│
└── docs/                   # Documentation
```

### Running Tests

```bash
# Python tests
cd backend
pytest

# Extension tests
npm test
```

## 🤖 Gemini AI Features

When configured with a Gemini API key, the system provides:

- **Market Context Analysis**: Understands broader market conditions
- **Pattern Explanations**: Human-readable reasoning for predictions
- **Broker Manipulation Detection**: Identifies suspicious platform behavior
- **Risk Assessment**: Evaluates current market risk level
- **Strategy Recommendations**: Suggests optimal trading conditions

## ⚠️ Important Notes

### Binary Trading Risks
- Binary options trading is **high-risk**
- This is an **educational/research project**
- Broker platforms may manipulate outcomes
- **Never trade more than you can afford to lose**

### Data Collection Period
- System needs **1-2 weeks** of data before reliable predictions
- Initial predictions will have lower confidence
- Performance improves over time through learning

### API Rate Limits
- Gemini API has rate limits (15 requests/minute on free tier)
- System automatically handles rate limiting
- Consider upgrading for heavy usage

## 📈 Roadmap

- [ ] Popup UI with live statistics
- [ ] PostgreSQL + TimescaleDB for better performance
- [ ] Backtesting engine with historical data
- [ ] Multi-platform support (IQ Option, Pocket Option)
- [ ] Advanced risk management strategies
- [ ] Performance monitoring dashboard

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- TensorFlow.js / PyTorch for ML frameworks
- Google Gemini for AI capabilities
- FastAPI for backend framework
- The technical analysis community

---

**Disclaimer**: This software is for educational purposes only. Trading binary options carries significant risk. Use at your own risk.
