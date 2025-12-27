"""
Neural Network Model - PyTorch implementation for binary trading predictions
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from typing import List, Tuple, Dict
import os
import logging

from config.settings import settings

logger = logging.getLogger(__name__)


class TradingNeuralNetwork(nn.Module):
    """Neural network for predicting UP/DOWN/NEUTRAL outcomes"""
    
    def __init__(self, input_size=None):
        super(TradingNeuralNetwork, self).__init__()
        
        if input_size is None:
            input_size = settings.MODEL_INPUT_FEATURES
        
        arch = settings.MODEL_ARCHITECTURE
        hidden_layers = arch['hidden_layers']
        dropout_rates = arch['dropout']
        
        # Build layers
        layers = []
        
        # Input layer
        layers.append(nn.Linear(input_size, hidden_layers[0]))
        layers.append(nn.ReLU())
        if dropout_rates[0] > 0:
            layers.append(nn.Dropout(dropout_rates[0]))
        
        # Hidden layers
        for i in range(len(hidden_layers) - 1):
            layers.append(nn.Linear(hidden_layers[i], hidden_layers[i+1]))
            layers.append(nn.ReLU())
            if dropout_rates[i+1] > 0:
                layers.append(nn.Dropout(dropout_rates[i+1]))
        
        # Output layer (3 classes: UP, DOWN, NEUTRAL)
        layers.append(nn.Linear(hidden_layers[-1], 3))
        layers.append(nn.Softmax(dim=1))
        
        self.model = nn.Sequential(*layers)
    
    def forward(self, x):
        return self.model(x)


class ModelManager:
    """Manages model training, loading, and prediction"""
    
    def __init__(self):
        self.model = None
        self.optimizer = None
        self.criterion = nn.CrossEntropyLoss()
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model_path = os.path.join(settings.MODEL_PATH, 'model.pth')
        self.stats = {
            'total_predictions': 0,
            'correct_predictions': 0,
            'accuracy': 0.0,
            'version': 1
        }
        
        logger.info(f"Using device: {self.device}")
    
    def initialize_model(self):
        """Initialize or load model"""
        self.model = TradingNeuralNetwork().to(self.device)
        self.optimizer = optim.Adam(
            self.model.parameters(),
            lr=settings.LEARNING_RATE
        )
        
        # Try to load existing model
        if os.path.exists(self.model_path):
            try:
                self.load_model()
                logger.info("Loaded existing model")
            except Exception as e:
                logger.warning(f"Could not load model: {e}. Starting fresh.")
        else:
            logger.info("Initialized new model")
    
    def predict(self, features: np.ndarray) -> Dict:
        """
        Make prediction from features
        
        Args:
            features: numpy array of features
            
        Returns:
            Dictionary with prediction, confidence, and probabilities
        """
        if self.model is None:
            raise ValueError("Model not initialized")
        
        self.model.eval()
        
        with torch.no_grad():
            # Convert to tensor
            x = torch.FloatTensor(features).unsqueeze(0).to(self.device)
            
            # Get prediction
            output = self.model(x)
            probabilities = output.cpu().numpy()[0]
            
            # Get class with highest probability
            predicted_class = np.argmax(probabilities)
            confidence = probabilities[predicted_class]
            
            # Map to prediction
            class_map = {0: 'UP', 1: 'DOWN', 2: 'NEUTRAL'}
            prediction = class_map[predicted_class]
            
            self.stats['total_predictions'] += 1
            
            return {
                'prediction': prediction,
                'confidence': float(confidence),
                'probabilities': {
                    'UP': float(probabilities[0]),
                    'DOWN': float(probabilities[1]),
                    'NEUTRAL': float(probabilities[2])
                }
            }
    
    def train(self, X: np.ndarray, y: np.ndarray) -> Dict:
        """
        Train model on data
        
        Args:
            X: Features array (N, features)
            y: Labels array (N,) with values 0=UP, 1=DOWN, 2=NEUTRAL
            
        Returns:
            Training statistics
        """
        if self.model is None:
            self.initialize_model()
        
        logger.info(f"Training on {len(X)} samples")
        
        # Convert to tensors
        X_tensor = torch.FloatTensor(X).to(self.device)
        y_tensor = torch.LongTensor(y).to(self.device)
        
        # Split into train/validation
        val_split = int(len(X) * settings.VALIDATION_SPLIT)
        X_train, X_val = X_tensor[:-val_split], X_tensor[-val_split:]
        y_train, y_val = y_tensor[:-val_split], y_tensor[-val_split:]
        
        # Training loop
        self.model.train()
        train_losses = []
        val_accuracies = []
        
        for epoch in range(settings.TRAINING_EPOCHS):
            # Mini-batch training
            batch_size = settings.BATCH_SIZE
            num_batches = len(X_train) // batch_size
            
            epoch_loss = 0
            for i in range(num_batches):
                start_idx = i * batch_size
                end_idx = start_idx + batch_size
                
                batch_X = X_train[start_idx:end_idx]
                batch_y = y_train[start_idx:end_idx]
                
                # Forward pass
                self.optimizer.zero_grad()
                outputs = self.model(batch_X)
                loss = self.criterion(outputs, batch_y)
                
                # Backward pass
                loss.backward()
                self.optimizer.step()
                
                epoch_loss += loss.item()
            
            avg_loss = epoch_loss / num_batches
            train_losses.append(avg_loss)
            
            # Validation
            self.model.eval()
            with torch.no_grad():
                val_outputs = self.model(X_val)
                val_predictions = torch.argmax(val_outputs, dim=1)
                val_accuracy = (val_predictions == y_val).float().mean().item()
                val_accuracies.append(val_accuracy)
            
            self.model.train()
            
            logger.info(f"Epoch {epoch+1}/{settings.TRAINING_EPOCHS} - Loss: {avg_loss:.4f}, Val Acc: {val_accuracy:.4f}")
        
        # Final validation accuracy
        final_accuracy = val_accuracies[-1]
        
        # Update stats
        self.stats['accuracy'] = final_accuracy
        self.stats['version'] += 1
        
        # Save model if improved
        if final_accuracy > 0.5:  # Better than random
            self.save_model()
            logger.info(f"Model saved with accuracy: {final_accuracy:.4f}")
        
        return {
            'epochs': settings.TRAINING_EPOCHS,
            'final_loss': train_losses[-1],
            'final_accuracy': final_accuracy,
            'train_losses': train_losses,
            'val_accuracies': val_accuracies
        }
    
    def save_model(self):
        """Save model to disk"""
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'stats': self.stats
        }, self.model_path)
        
        logger.info(f"Model saved to {self.model_path}")
    
    def load_model(self):
        """Load model from disk"""
        checkpoint = torch.load(self.model_path, map_location=self.device)
        
        if self.model is None:
            self.model = TradingNeuralNetwork().to(self.device)
            self.optimizer = optim.Adam(
                self.model.parameters(),
                lr=settings.LEARNING_RATE
            )
        
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        self.stats = checkpoint.get('stats', self.stats)
        
        logger.info(f"Model loaded from {self.model_path}")
    
    def get_stats(self) -> Dict:
        """Get model statistics"""
        return self.stats.copy()
