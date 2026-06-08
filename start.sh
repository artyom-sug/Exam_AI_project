#!/bin/bash
echo "Starting Exam System..."

source venv/bin/activate

ollama serve &

sleep 3

cd backend
python run.py