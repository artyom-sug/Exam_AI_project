from app.database import SessionLocal, engine, Base
from app import models
from app.auth import get_password_hash

def init_db():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    teacher = db.query(models.Teacher).filter(models.Teacher.login == "teacher").first()
    if not teacher:
        teacher = models.Teacher(
            login="teacher",
            hashed_password=get_password_hash("123"),
            full_name="Test Teacher"
        )
        db.add(teacher)
        db.commit()
        print("Test teacher created: login='teacher', password='123'")
    
    group = db.query(models.Group).filter(models.Group.name == "Test Group").first()
    if not group:
        group = models.Group(
            name="Test Group",
            teacher_id=teacher.id,
            access_key="TEST123",
            questions_count=3,
            time_per_question=30
        )
        db.add(group)
        db.commit()
        print(f"Test group created: key='{group.access_key}'")
    
    db.close()
    print("Database initialized")

if __name__ == "__main__":
    init_db()