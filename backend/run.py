import uvicorn
import sys
from pathlib import Path

# Добавляем backend в путь
sys.path.insert(0, str(Path(__file__).parent))

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,  
        log_level="info"
    )