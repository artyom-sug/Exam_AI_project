from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware  
from sqlalchemy.orm import Session
from typing import List
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from .llm_service import llm_service
from .embeddings_service import embeddings_service
from .pdf_parser import extract_text_from_pdf
from .database import engine, get_db, Base
from . import models, schemas, auth
from .config import LECTURES_DIR, TEMP_AUDIO_DIR
from .crypto import get_password_hash, verify_password
from .whisper_service import whisper_service
from collections import defaultdict
exam_sessions_questions = defaultdict(dict)
import logging
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Exam System", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_PATH = Path(__file__).parent.parent.parent / "frontend"

print(f"🔍 Looking for frontend at: {FRONTEND_PATH}")
print(f"📁 Frontend exists: {FRONTEND_PATH.exists()}")

if FRONTEND_PATH.exists():
    app.mount("/css", StaticFiles(directory=str(FRONTEND_PATH / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(FRONTEND_PATH / "js")), name="js")
    app.mount("/pages", StaticFiles(directory=str(FRONTEND_PATH / "pages")), name="pages")
    print("✅ Static files mounted successfully")
else:
    print(f"Frontend folder not found at {FRONTEND_PATH}")
    (FRONTEND_PATH / "css").mkdir(parents=True, exist_ok=True)
    (FRONTEND_PATH / "js").mkdir(parents=True, exist_ok=True)
    (FRONTEND_PATH / "pages").mkdir(parents=True, exist_ok=True)
    print("Created frontend directories")

@app.get("/")
async def root():
    index_path = FRONTEND_PATH / "pages" / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "Exam System API", "docs": "/docs"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Server is running"}

@app.post("/api/teacher/register", response_model=schemas.TeacherResponse)
async def register_teacher(
    login: str,
    password: str,
    full_name: str = None,
    db: Session = Depends(get_db)
):
    existing = db.query(models.Teacher).filter(models.Teacher.login == login).first()
    if existing:
        raise HTTPException(status_code=400, detail="Login already exists")
    
    teacher = models.Teacher(
        login=login,
        hashed_password=get_password_hash(password),
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
    
    return {"message": "Lecture uploaded successfully", "id": lecture.id}

@app.post("/api/groups/{group_id}/generate-questions")
async def generate_questions_for_group(
    group_id: int,
    num_questions: int = None,
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == current_teacher.id
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    lectures = db.query(models.Lecture).filter(models.Lecture.group_id == group_id).all()
    
    if not lectures:
        raise HTTPException(status_code=400, detail="No lectures uploaded for this group")
    
    combined_text = " ".join([lec.text_content for lec in lectures if lec.text_content])
    
    if not combined_text:
        raise HTTPException(status_code=400, detail="No text content in lectures")
    
    num = num_questions or group.questions_count
    questions = llm_service.generate_questions(combined_text, num)
    
    return {"questions": questions}

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
    questions_list = []
    question_ids = []  # НОВОЕ: сохраняем ID вопросов
    
    if group.use_auto_generation == 0:
        db_questions = db.query(models.QuestionBank).filter(
            models.QuestionBank.group_id == group.id
        ).all()
        
        if db_questions:
            import random
            selected_questions = random.sample(
                db_questions, 
                min(group.questions_count, len(db_questions))
            )
            
            for i, q in enumerate(selected_questions):
                questions_list.append(
                    schemas.Question(
                        id=i+1,
                        text=q.question_text,
                        time_limit=group.time_per_question
                    )
                )
                question_ids.append(q.id) 
    
    if not questions_list and group.use_auto_generation == 1:
        lectures = db.query(models.Lecture).filter(models.Lecture.group_id == group.id).all()
        
        if lectures:
            combined_text = " ".join([lec.text_content for lec in lectures if lec.text_content])
            if combined_text:
                generated_questions = llm_service.generate_questions(combined_text, group.questions_count)
                
                for i, q_text in enumerate(generated_questions):
                    questions_list.append(
                        schemas.Question(
                            id=i+1,
                            text=q_text,
                            time_limit=group.time_per_question
                        )
                    )
                    question_ids.append(-1)  # -1 означает сгенерированный вопрос
    
    if not questions_list:
        for i in range(group.questions_count):
            questions_list.append(
                schemas.Question(
                    id=i+1,
                    text=f"Вопрос {i+1}. Опишите основные концепции изученного материала?",
                    time_limit=group.time_per_question
                )
            )
            question_ids.append(-1)
    
    exam_sessions_questions[session_id] = {
        "questions": questions_list,
        "question_ids": question_ids
    }
    
    return schemas.ExamStartResponse(
        questions=questions_list,
        question_ids=question_ids
    )

@app.post("/api/exam/submit", response_model=schemas.ExamResultResponse)
async def submit_exam(
    submit_data: schemas.ExamSubmit,
    session_id: str,
    db: Session = Depends(get_db)
):
    student = db.query(models.Student).filter(
        models.Student.exam_session_id == session_id
    ).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Session not found")
    
    group = student.group
    
    session_data = exam_sessions_questions.get(session_id, {})
    question_ids = session_data.get("question_ids", [])
    
    results = []
    total = 0
    
    for i, answer in enumerate(submit_data.answers):
        expected_answer = None
        question_text = f"Вопрос {i+1}"
        question_id = None
        
        if i < len(question_ids) and question_ids[i] != -1:
            db_question = db.query(models.QuestionBank).filter(
                models.QuestionBank.id == question_ids[i]
            ).first()
            if db_question:
                question_text = db_question.question_text
                expected_answer = db_question.expected_answer
                question_id = db_question.id
        
        if expected_answer:
            evaluation = llm_service.evaluate_answer_with_expected(
                question_text, answer, expected_answer
            )
        else:
            relevant_chunks = embeddings_service.search_similar_chunks(
                db, group.id, answer, top_k=3
            )
            
            if relevant_chunks:
                evaluation = llm_service.check_answer_with_rag(
                    question_text, answer, relevant_chunks
                )
            else:
                evaluation = llm_service.evaluate_answer(question_text, answer)
        
        score = evaluation["score"]
        comment = evaluation["comment"]
        
        db_answer = models.Answer(
            student_id=student.id,
            question_id=question_id,  # НОВОЕ
            question_text=question_text,
            student_answer=answer,
            score=score,
            comment=comment,
            question_number=i+1
        )
        db.add(db_answer)
        
        total += score
        results.append(schemas.AnswerResult(
            score=score,
            comment=comment,
            answer=answer
        ))
    
    student.completed_at = datetime.now()
    db.commit()
    
    if session_id in exam_sessions_questions:
        del exam_sessions_questions[session_id]
    
    return schemas.ExamResultResponse(
        results=results,
        total_score=total / len(submit_data.answers)
    )

@app.post("/api/groups/{group_id}/process-lecture/{lecture_id}")
async def process_lecture_embeddings(
    group_id: int,
    lecture_id: int,
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == current_teacher.id
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    lecture = db.query(models.Lecture).filter(
        models.Lecture.id == lecture_id,
        models.Lecture.group_id == group_id
    ).first()
    
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    if not lecture.text_content:
        raise HTTPException(status_code=400, detail="Lecture has no text content")
    
    embeddings_service.process_lecture(db, lecture_id, lecture.text_content)
    
    return {"message": "Lecture processed successfully", "chunks_created": True}

@app.post("/api/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    import tempfile
    import uuid
    
    temp_path = TEMP_AUDIO_DIR / f"{uuid.uuid4()}_{file.filename}"
    
    try:
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)
        
        text = whisper_service.transcribe(str(temp_path))
        
        if not text:
            raise HTTPException(status_code=400, detail="Не удалось распознать речь")
        
        return {"text": text, "success": True}
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        if temp_path.exists():
            temp_path.unlink()

@app.post("/api/teacher/exams/create")
async def create_exam(
    exam_data: dict,
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    room_key = exam_data.get("room_key")
    questions_count = exam_data.get("questions_count", 25)
    duration_minutes = exam_data.get("duration_minutes", 90)
    question_source = exam_data.get("question_source", "auto")
    
    if not room_key:
        raise HTTPException(status_code=400, detail="room_key required")
    
    existing = db.query(models.Group).filter(models.Group.access_key == room_key).first()
    if existing:
        raise HTTPException(status_code=400, detail="Group with this key already exists")
    
    group = models.Group(
        name=room_key,
        teacher_id=current_teacher.id,
        access_key=room_key,
        questions_count=questions_count,
        time_per_question=60,  # duration_minutes * 60 / questions_count
        use_auto_generation=1 if question_source == "auto" else 0
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    
    return {"id": group.id, "access_key": group.access_key, "message": "Exam created"}

@app.get("/api/groups/by-key")
async def get_group_by_key(key: str, db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.access_key == key.upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"id": group.id, "name": group.name, "access_key": group.access_key}

@app.post("/api/groups/{group_id}/questions/upload-json")
async def upload_questions_json(
    group_id: int,
    file: UploadFile = File(...),
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Загрузка вопросов из JSON файла
    Формат JSON: [{"question": "текст", "expected_answer": "ответ", "topic": "тема", "difficulty": 3}]
    """
    # Проверяем группу
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == current_teacher.id
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    try:
        content = await file.read()
        questions_data = json.loads(content.decode('utf-8'))
        
        results = {"total": len(questions_data), "added": 0, "skipped": 0, "errors": []}
        
        for idx, q_data in enumerate(questions_data):
            try:
                if not q_data.get("question"):
                    results["errors"].append(f"Row {idx+1}: missing 'question' field")
                    results["skipped"] += 1
                    continue
                
                # Создаем вопрос
                question = models.QuestionBank(
                    group_id=group_id,
                    question_text=q_data["question"],
                    expected_answer=q_data.get("expected_answer", ""),
                    topic=q_data.get("topic", ""),
                    difficulty=q_data.get("difficulty", 3)
                )
                db.add(question)
                results["added"] += 1
                
            except Exception as e:
                results["errors"].append(f"Row {idx+1}: {str(e)}")
                results["skipped"] += 1
        
        db.commit()
        return results
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/groups/{group_id}/questions/upload-csv")
async def upload_questions_csv(
    group_id: int,
    file: UploadFile = File(...),
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    import csv
    import io
    
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == current_teacher.id
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    try:
        content = await file.read()
        text = content.decode('utf-8-sig')
        csv_reader = csv.reader(io.StringIO(text))
        
        first_row = next(csv_reader, None)
        if first_row and first_row[0].lower() in ['вопрос', 'question', '"вопрос"']:
            pass
        else:
            questions_data = [first_row] + list(csv_reader)
            csv_reader = iter(questions_data)
        
        results = {"total": 0, "added": 0, "skipped": 0, "errors": []}
        
        for idx, row in enumerate(csv_reader):
            results["total"] += 1
            if not row or not row[0].strip():
                results["skipped"] += 1
                continue
            
            try:
                question = models.QuestionBank(
                    group_id=group_id,
                    question_text=row[0].strip(),
                    expected_answer=row[1].strip() if len(row) > 1 else "",
                    topic=row[2].strip() if len(row) > 2 else "",
                    difficulty=int(row[3]) if len(row) > 3 and row[3].strip().isdigit() else 3
                )
                db.add(question)
                results["added"] += 1
            except Exception as e:
                results["errors"].append(f"Row {idx+1}: {str(e)}")
                results["skipped"] += 1
        
        db.commit()
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/groups/{group_id}/questions", response_model=List[schemas.QuestionBankResponse])
async def get_group_questions(
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
    
    questions = db.query(models.QuestionBank).filter(
        models.QuestionBank.group_id == group_id
    ).all()
    
    return questions

@app.delete("/api/groups/{group_id}/questions/{question_id}")
async def delete_question(
    group_id: int,
    question_id: int,
    current_teacher: models.Teacher = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == current_teacher.id
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    question = db.query(models.QuestionBank).filter(
        models.QuestionBank.id == question_id,
        models.QuestionBank.group_id == group_id
    ).first()
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    db.delete(question)
    db.commit()
    
    return {"message": "Question deleted"}

@app.get("/api/groups/{group_id}/results")
async def get_group_results(
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
    
    students = db.query(models.Student).filter(models.Student.group_id == group_id).all()
    
    results = []
    for student in students:
        answers = db.query(models.Answer).filter(models.Answer.student_id == student.id).all()
        
        total_score = sum(a.score or 0 for a in answers) / len(answers) if answers else 0
        answered = len([a for a in answers if a.student_answer and a.student_answer.strip()])
        
        student_answers = []
        for answer in answers:
            question = db.query(models.QuestionBank).filter(
                models.QuestionBank.id == answer.question_id
            ).first() if answer.question_id else None
            
            student_answers.append({
                "question": answer.question_text,
                "student_answer": answer.student_answer,
                "correct_answer": question.expected_answer if question else "",
                "score": answer.score,
                "comment": answer.comment
            })
        
        results.append({
            "id": student.id,
            "name": student.fio,
            "answered": answered,
            "total": len(answers) if answers else 0,
            "score": round(total_score, 1),
            "answers": student_answers
        })
    
    return results