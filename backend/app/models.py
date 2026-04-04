from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON, Float
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from .database import Base

class Teacher(Base):
    __tablename__ = "teachers"
    
    id = Column(Integer, primary_key=True)
    login = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100))
    created_at = Column(DateTime, default=datetime.now)
    
    groups = relationship("Group", back_populates="teacher", cascade="all, delete-orphan")

class Group(Base):
    __tablename__ = "groups"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    access_key = Column(String(50), unique=True, index=True, default=lambda: str(uuid.uuid4())[:8])
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    
    questions_count = Column(Integer, default=5)
    time_per_question = Column(Integer, default=30)
    use_auto_generation = Column(Integer, default=1) 
    
    created_at = Column(DateTime, default=datetime.now)
    
    teacher = relationship("Teacher", back_populates="groups")
    students = relationship("Student", back_populates="group", cascade="all, delete-orphan")
    lectures = relationship("Lecture", back_populates="group", cascade="all, delete-orphan")

class Student(Base):
    __tablename__ = "students"
    
    id = Column(Integer, primary_key=True)
    fio = Column(String(150), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    exam_session_id = Column(String(36), unique=True, index=True, default=lambda: str(uuid.uuid4()))
    started_at = Column(DateTime, default=datetime.now)
    completed_at = Column(DateTime, nullable=True)
    
    group = relationship("Group", back_populates="students")
    answers = relationship("Answer", back_populates="student", cascade="all, delete-orphan")

class Lecture(Base):
    __tablename__ = "lectures"
    
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    text_content = Column(Text)  
    uploaded_at = Column(DateTime, default=datetime.now)
    
    group = relationship("Group", back_populates="lectures")
    chunks = relationship("Chunk", back_populates="lecture", cascade="all, delete-orphan")

class Chunk(Base):
    __tablename__ = "chunks"
    
    id = Column(Integer, primary_key=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"), nullable=False)
    text = Column(Text, nullable=False)
    embedding = Column(JSON) 
    chunk_index = Column(Integer)
    
    lecture = relationship("Lecture", back_populates="chunks")

class Answer(Base):
    __tablename__ = "answers"
    
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    student_answer = Column(Text, nullable=False)
    score = Column(Float, nullable=True)
    comment = Column(Text, nullable=True)
    question_number = Column(Integer)
    answered_at = Column(DateTime, default=datetime.now)
    
    student = relationship("Student", back_populates="answers")