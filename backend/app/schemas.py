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
    questions_count: Optional[int] = 5
    time_per_question: Optional[int] = 30
    use_auto_generation: Optional[bool] = True

class GroupResponse(BaseModel):
    id: int
    name: str
    access_key: str
    questions_count: int
    time_per_question: int
    use_auto_generation: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class GroupUpdate(BaseModel):
    name: Optional[str]
    questions_count: Optional[int]
    time_per_question: Optional[int]
    use_auto_generation: Optional[bool]

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
    time_limit: int

class ExamStartResponse(BaseModel):
    questions: List[Question]

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