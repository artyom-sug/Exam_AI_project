from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import uuid
import shutil
from pathlib import Path

from .database import engine, get_db, Base
from . import models, schemas, auth
from .config import LECTURES_DIR
from .pdf_parser import extract_text_from_pdf

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Exam System", version="0.1.0")

@app.post("/api/teacher/register", response_model=schemas.TeacherResponse)
async def register_teacher(
    login: str,
    password: str,
    full_name: str = None,
    db: Session = Depends(get_db)
):
    # Проверяем существует ли
    existing = db.query(models.Teacher).filter(models.Teacher.login == login).first()
    if existing:
        raise HTTPException(status_code=400, detail="Login already exists")
    
    teacher = models.Teacher(
        login=login,
        hashed_password=auth.get_password_hash(password),
        full_name=full_name
    )
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher

@app.post("/api/teacher/login", response_model=schemas.TokenResponse)
async def teacher_login(
    login_data: schemas.TeacherLogin,
    db: Session = Depends(get_db)
):
    teacher = auth.authenticate_teacher(db, login_data.login, login_data.password)
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect login or password"
        )
    
    access_token = auth.create_access_token(data={"sub": teacher.id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/teacher/me", response_model=schemas.TeacherResponse)
async def get_current_teacher_info(
    current_teacher: models.Teacher = Depends(auth.get_current_teacher)
):
    """Получить информацию о текущем преподавателе"""
    return current_teacher

@app.post("/api/groups", response_model=schemas.GroupResponse)
async def create_group(
    group: schemas.GroupCreate,
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    db_group = models.Group(
        name=group.name,
        teacher_id=current_teacher.id,
        questions_count=group.questions_count,
        time_per_question=group.time_per_question,
        use_auto_generation=1 if group.use_auto_generation else 0
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group

@app.get("/api/groups", response_model=List[schemas.GroupResponse])
async def get_groups(
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    groups = db.query(models.Group).filter(
        models.Group.teacher_id == current_teacher.id
    ).all()
    return groups

@app.put("/api/groups/{group_id}", response_model=schemas.GroupResponse)
async def update_group(
    group_id: int,
    group_update: schemas.GroupUpdate,
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == current_teacher.id
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    for key, value in group_update.dict(exclude_unset=True).items():
        setattr(group, key, value)
    
    db.commit()
    db.refresh(group)
    return group

@app.post("/api/groups/{group_id}/generate-key", response_model=schemas.GenerateKeyResponse)
async def generate_new_key(
    group_id: int,
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == current_teacher.id
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    new_key = str(uuid.uuid4())[:8].upper()
    group.access_key = new_key
    db.commit()
    
    return {"access_key": new_key}

@app.delete("/api/groups/{group_id}")
async def delete_group(
    group_id: int,
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == current_teacher.id
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    db.delete(group)
    db.commit()
    return {"message": "Group deleted"}

@app.post("/api/groups/{group_id}/upload-lecture")
async def upload_lecture(
    group_id: int,
    file: UploadFile = File(...),
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == current_teacher.id
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    file_path = LECTURES_DIR / f"{uuid.uuid4()}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    text_content = extract_text_from_pdf(str(file_path))
    
    lecture = models.Lecture(
        group_id=group_id,
        filename=file.filename,
        text_content=text_content
    )
    db.add(lecture)
    db.commit()
    
    # TODO: Разбить на чанки и создать эмбеддинги
    
    return {"message": "Lecture uploaded successfully", "id": lecture.id}

@app.post("/api/student/validate")
async def validate_student(
    student_data: schemas.StudentValidate,
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(
        models.Group.access_key == student_data.key.upper()
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Invalid key")
    
    student = models.Student(
        fio=student_data.fio,
        group_id=group.id
    )
    db.add(student)
    db.commit()
    
    return {
        "session_id": student.exam_session_id,
        "group_id": group.id,
        "fio": student.fio
    }

@app.post("/api/exam/start", response_model=schemas.ExamStartResponse)
async def start_exam(
    session_id: str,
    db: Session = Depends(get_db)
):
    student = db.query(models.Student).filter(
        models.Student.exam_session_id == session_id
    ).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Session not found")
    
    group = student.group
    
    # TODO: Здесь генерируем вопросы (из лекций или загруженных)
    # Пока возвращаем тестовые вопросы
    questions = [
        schemas.Question(
            id=i+1,
            text=f"Тестовый вопрос {i+1}. Опишите основные принципы работы системы?",
            time_limit=group.time_per_question
        )
        for i in range(group.questions_count)
    ]
    
    return schemas.ExamStartResponse(questions=questions)

@app.post("/api/exam/submit", response_model=schemas.ExamResultResponse)
async def submit_exam(
    submit_data: schemas.ExamSubmit,
    session_id: str,
    db: Session = Depends(get_db)
):
    """Отправить ответы на проверку"""
    student = db.query(models.Student).filter(
        models.Student.exam_session_id == session_id
    ).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # TODO: Здесь проверка ответов через LLM
    # Пока возвращаем случайные оценки
    results = []
    total = 0
    
    for i, answer in enumerate(submit_data.answers):
        score = 85.0  # Временная заглушка
        comment = "Хороший ответ"  # Временная заглушка
        
        db_answer = models.Answer(
            student_id=student.id,
            question_text=f"Вопрос {i+1}",
            student_answer=answer,
            score=score,
            comment=comment,
            question_number=i+1
        )
        db.add(db_answer)
        total += score
        results.append(schemas.AnswerResult(score=score, comment=comment, answer=answer))
    
    student.completed_at = datetime.now()
    db.commit()
    
    return schemas.ExamResultResponse(
        results=results,
        total_score=total / len(submit_data.answers)
    )