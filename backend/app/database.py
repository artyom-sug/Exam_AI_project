from sqlalchemy import create_engine, text, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def run_migrations():
    inspector = inspect(engine)
    
    if "students" in inspector.get_table_names():
        student_cols = {c["name"] for c in inspector.get_columns("students")}
        if "manual_total_score" not in student_cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE students ADD COLUMN manual_total_score FLOAT"))
                conn.commit()
    
    if "answers" in inspector.get_table_names():
        answer_cols = {c["name"] for c in inspector.get_columns("answers")}
        if "expected_answer" not in answer_cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE answers ADD COLUMN expected_answer TEXT"))
                conn.commit()
    
    if "question_bank" in inspector.get_table_names():
        qb_cols = {c["name"] for c in inspector.get_columns("question_bank")}
        if "teacher_id" not in qb_cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE question_bank ADD COLUMN teacher_id INTEGER"))
                conn.commit()
            with engine.connect() as conn:
                conn.execute(text("""
                    UPDATE question_bank SET teacher_id = (
                        SELECT teacher_id FROM groups WHERE groups.id = question_bank.group_id
                    ) WHERE teacher_id IS NULL AND group_id IS NOT NULL
                """))
                conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()