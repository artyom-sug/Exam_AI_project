import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
LECTURES_DIR = UPLOAD_DIR / "lectures"
TEMP_AUDIO_DIR = UPLOAD_DIR / "temp_audio"

LECTURES_DIR.mkdir(parents=True, exist_ok=True)
TEMP_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{BASE_DIR}/database.db"

SECRET_KEY = "your-secret-key-change-in-production-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:3b"

DEFAULT_QUESTIONS_COUNT = 5
DEFAULT_TIME_PER_QUESTION = 30

EMBEDDING_MODEL = "cointegrated/LaBSE-en-ru"