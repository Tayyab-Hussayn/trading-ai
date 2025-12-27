# Binary Trading AI Agent 🤖📈

An intelligent, self-learning Chrome extension that predicts binary trading outcomes by analyzing candlestick patterns directly from trading platform screens. The system continuously improves through a feedback loop and integrates Google's Gemini AI for enhanced intelligence.

## 🎯 Features

### Core Capabilities
- **Visual Pattern Recognition**: Reads candlestick data directly from canvas/SVG elements
- **60+ Feature Extraction**: Analyzes body ratios, wicks, trends, volatility, and more
- **15+ Classic Patterns**: Detects hammer, doji, engulfing, stars, and advanced patterns
- **Ensemble Predictions**: Combines historical pattern matching (DTW + Cosine Similarity) with TensorFlow.js neural network
- **Self-Learning Loop**: Validates predictions after 5 minutes and retrains model automatically
- **Gemini AI Integration**: Enhanced analysis, broker manipulation detection, and trading advice
- **Risk Management**: Daily limits, consecutive loss protection, confidence thresholds, cooldown periods

### Technical Highlights
- **Neural Network**: 60 → 128 → 64 → 32 → 3 architecture with dropout
- **Pattern Matching**: Dynamic Time Warping and weighted cosine similarity
- **Data Persistence**: IndexedDB for candles, patterns, predictions, and statistics
- **Real-time Updates**: Background service worker with periodic validation
- **Modern UI**: Beautiful glassmorphism design with smooth animations

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- Chrome/Chromium browser
- (Optional) Gemini API key for AI-enhanced features

### Setup

1. **Clone and install dependencies**:
```bash
cd /home/krawin/code/Trading-AI
npm install
```

2. **Build the extension**:
```bash
# Development build with watch mode
npm run dev

# Production build
npm run build
```

3. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

4. **(Optional) Configure Gemini AI**:
   - Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Open extension popup
   - Go to Settings
   - Enter your API key

## 🚀 Usage

1. **Visit a binary trading platform** (e.g., Quotex, IQ Option)
2. **Extension auto-detects** the chart canvas
3. **AI analyzes patterns** every 5 seconds
4. **Signals appear** in popup when confidence > threshold
5. **Predictions are validated** after 5 minutes
6. **Model retrains** automatically with new data

### Popup Interface
- **Current Signal**: Shows UP/DOWN prediction with confidence
- **Performance Stats**: Win rate, total predictions, today's results
- **Recent Predictions**: History of validated predictions
- **Settings**: Adjust confidence threshold, enable/disable features

## 🧠 How It Works

### 1. Visual Data Extraction
```javascript
Canvas → Pixel Scanning → Candlestick Detection → OHLC Data
```

### 2. Feature Engineering
Extracts 60+ features:
- Body ratios and directions
- Wick characteristics
- Trend slopes (short/medium/long term)
- Volatility metrics (ATR, volatility ratio)
- Pattern indicators
- Support/resistance proximity

### 3. Pattern Recognition
Detects classic patterns:
- Hammer, Doji, Engulfing
- Morning Star, Evening Star
- Three White Soldiers, Three Black Crows
- And more...

### 4. Ensemble Prediction
```
Historical Matching (40%) + ML Model (60%) = Final Prediction
```

### 5. Self-Learning Loop
```
Prediction → Wait 5min → Validate → Update Scores → Retrain Model
```

## 📊 Architecture

```
┌─────────────────────────────────────────┐
│         Chrome Extension                │
│  ┌───────────────────────────────────┐  │
│  │  Content Script                   │  │
│  │  - Canvas Reader                  │  │
│  │  - Platform Detection             │  │
│  └──────────────┬────────────────────┘  │
│                 │                        │
│  ┌──────────────▼────────────────────┐  │
│  │  Background Worker                │  │
│  │  - Feature Extractor              │  │
│  │  - Pattern Detector               │  │
│  │  - Similarity Matcher             │  │
│  │  - Neural Network                 │  │
│  │  - Ensemble Predictor             │  │
│  │  - Gemini AI Client               │  │
│  │  - Risk Manager                   │  │
│  │  - Validator & Trainer            │  │
│  └──────────────┬────────────────────┘  │
│                 │                        │
│  ┌──────────────▼────────────────────┐  │
│  │  Popup UI                         │  │
│  │  - Signal Display                 │  │
│  │  - Performance Stats              │  │
│  │  - Settings                       │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 🔧 Configuration

Edit `extension/config.js` to customize:

```javascript
CONFIG = {
    SCAN_INTERVAL: 5000,              // Scan every 5 seconds
    MIN_CONFIDENCE_THRESHOLD: 0.65,   // Minimum confidence to show signal
    VALIDATION_DELAY: 300000,         // 5 minutes validation delay
    RETRAIN_THRESHOLD: 50,            // Retrain after 50 validated predictions
    
    RISK_RULES: {
        maxTradesPerDay: 20,
        maxConsecutiveLosses: 3,
        minConfidence: 0.65,
        cooldownAfterLoss: 300000
    }
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Test specific components
npm run test:features    # Feature extraction
npm run test:patterns    # Pattern detection
npm run test:model       # Neural network
```

## 📁 Project Structure

```
Trading-AI/
├── extension/
│   ├── ai/                    # Gemini AI integration
│   │   └── gemini-client.js
│   ├── data/                  # Data layer
│   │   ├── database.js
│   │   └── canvas-reader.js
│   ├── learning/              # Self-learning system
│   │   ├── validator.js
│   │   └── trainer.js
│   ├── ml/                    # Machine learning
│   │   ├── feature-extractor.js
│   │   ├── pattern-detector.js
│   │   ├── similarity-matcher.js
│   │   ├── neural-network.js
│   │   └── ensemble-predictor.js
│   ├── popup/                 # UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── risk/                  # Risk management
│   │   └── risk-manager.js
│   ├── utils/                 # Utilities
│   │   ├── math.js
│   │   ├── logger.js
│   │   └── storage.js
│   ├── background.js          # Main orchestrator
│   ├── content-script.js      # Platform integration
│   ├── config.js              # Configuration
│   └── manifest.json          # Extension manifest
├── package.json
├── webpack.config.js
└── README.md
```

## ⚠️ Disclaimer

**IMPORTANT**: This is an AI prediction system and should NOT be used as the sole basis for trading decisions. Binary trading carries significant risk. Always:
- Use proper risk management
- Never invest more than you can afford to lose
- Understand that past performance doesn't guarantee future results
- Consider this tool as ONE input among many in your trading strategy

## 🤝 Contributing

This is a personal project, but suggestions and improvements are welcome!

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- TensorFlow.js for in-browser ML
- Google Gemini AI for intelligent analysis
- IndexedDB for client-side storage
- The trading community for pattern knowledge

---

**Built with ❤️ using cutting-edge AI and ML technologies**
