from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pathlib import Path
import logging

from .database import engine, get_db, Base
from . import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Exam System",
    description="Система для оценивания знаний студентов",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_path = Path(__file__).parent.parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/css", StaticFiles(directory=str(frontend_path / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(frontend_path / "js")), name="js")
    app.mount("/pages", StaticFiles(directory=str(frontend_path / "pages")), name="pages")

@app.get("/")
async def root():
    frontend_index = Path(__file__).parent.parent.parent / "frontend" / "pages" / "index.html"
    if frontend_index.exists():
        return FileResponse(str(frontend_index))
    return {"message": "Exam System API", "docs": "/docs"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Server is running"}

@app.post("/api/teacher/login")
async def teacher_login(login: str, password: str, db: Session = Depends(get_db)):
    # TODO: реализовать полноценную авторизацию
    return {"access_token": "temp_token", "token_type": "bearer"}

@app.post("/api/student/validate")
async def validate_student(fio: str, key: str, db: Session = Depends(get_db)):
    # TODO: проверить существование ключа
    return {"session_id": "temp_session", "group_id": 1, "valid": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)