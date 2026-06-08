from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class TeacherLogin(BaseModel):
    login: str
    password: str

class TeacherResponse(BaseModel):
    id: int
    login: str
    full_name: Optional[str]
    
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class GroupCreate(BaseModel):
    name: str
    access_key: Optional[str] = None
    questions_count: Optional[int] = 5
    exam_duration_seconds: Optional[int] = 5400
    use_auto_generation: Optional[bool] = True

class GroupResponse(BaseModel):
    id: int
    name: str
    access_key: str
    questions_count: int
    exam_duration_seconds: int
    use_auto_generation: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    questions_count: Optional[int] = None
    exam_duration_seconds: Optional[int] = None
    use_auto_generation: Optional[bool] = None

class GenerateKeyResponse(BaseModel):
    access_key: str

class StudentValidate(BaseModel):
    fio: str
    key: str

class StudentSession(BaseModel):
    session_id: str
    group_id: int
    fio: str

class LectureUpload(BaseModel):
    group_id: int
    filename: str

class Question(BaseModel):
    id: int
    text: str

class ExamStartResponse(BaseModel):
    questions: List[Question]
    question_ids: List[int]
    exam_duration_seconds: int

class AnswerSubmit(BaseModel):
    question_id: int
    answer: str

class ExamSubmit(BaseModel):
    answers: List[str] 

class AnswerResult(BaseModel):
    score: float
    comment: str
    answer: str

class ExamResultResponse(BaseModel):
    results: List[AnswerResult]
    total_score: float

class QuestionBankCreate(BaseModel):
    question_text: str
    expected_answer: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[int] = 3

class QuestionBankUpdate(BaseModel):
    question_text: Optional[str] = None
    expected_answer: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[int] = None


class QuestionBankResponse(BaseModel):
    id: int
    group_id: Optional[int]
    question_text: str
    expected_answer: Optional[str]
    topic: Optional[str]
    difficulty: int
    
    class Config:
        from_attributes = True

class QuestionBankUploadResponse(BaseModel):
    total: int
    added: int
    skipped: int
    errors: List[str]

class AnswerScoreUpdate(BaseModel):
    score: Optional[float] = None
    comment: Optional[str] = None
    recalculate_total: Optional[bool] = None

class StudentTotalScoreUpdate(BaseModel):
    total_score: float