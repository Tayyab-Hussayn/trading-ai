#!/bin/bash

# Binary Trading AI - Quick Start Script

echo "🚀 Starting Binary Trading AI System"
echo "===================================="

# Check if virtual environment exists
if [ ! -d "backend/venv" ]; then
    echo "📦 Creating Python virtual environment..."
    cd backend
    python3 -m venv venv
    cd ..
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source backend/venv/bin/activate

# Install Python dependencies
echo "📥 Installing Python dependencies..."
cd backend
pip install -q -r requirements.txt

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.example .env
    echo "📝 Please edit backend/.env and add your Gemini API key"
    echo "   Then run this script again."
    exit 1
fi

# Start the backend
echo ""
echo "✅ Starting Backend Server..."
echo "===================================="
echo "📡 WebSocket: ws://localhost:8000/ws"
echo "🌐 API: http://localhost:8000"
echo "📚 Docs: http://localhost:8000/docs"
echo "===================================="
echo ""

python main.py
