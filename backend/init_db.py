from app.database import SessionLocal, engine, Base
from app import models
from app.auth import get_password_hash

def init_db():
    print("=" * 60)
    print("ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ")
    print("=" * 60)
    
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        teacher = db.query(models.Teacher).filter(models.Teacher.login == "mr.dyadichev").first()
        if not teacher:
            teacher = models.Teacher(
                login="mr.dyadichev",
                hashed_password=get_password_hash("test123"),
                full_name="Дядичев Преподаватель"
            )
            db.add(teacher)
            db.commit()
            print("Создан преподаватель: login='mr.dyadichev', password='test123'")
        else:
            print("Преподаватель mr.dyadichev уже существует")
        
        group = db.query(models.Group).filter(models.Group.access_key == "ПМИ-241").first()
        if not group:
            group = models.Group(
                name="ПМИ-241",
                teacher_id=teacher.id,
                access_key="ПМИ-241",
                questions_count=10,
                time_per_question=60,
                use_auto_generation=0  # 0 - использовать готовые вопросы из БД
            )
            db.add(group)
            db.commit()
            print("Создан ключ доступа: ПМИ-241")
            print("(Вопросы для этой группы будут загружены отдельным скриптом)")
        else:
            print("Ключ ПМИ-241 уже существует")
        
        teachers_count = db.query(models.Teacher).count()
        groups_count = db.query(models.Group).count()
        questions_count = db.query(models.QuestionBank).count()
        lectures_count = db.query(models.Lecture).count()
        
        print("\n" + "=" * 60)
        print("СТАТИСТИКА БАЗЫ ДАННЫХ")
        print("=" * 60)
        print(f"Преподавателей: {teachers_count}")
        print(f"Групп/ключей: {groups_count}")
        print(f"Вопросов в БД: {questions_count}")
        print(f"Лекций в БД: {lectures_count}")
        
        if questions_count == 0:
            print("\nВопросы не загружены!")
            print("Запустите: python load_questions.py --json questions_with_answers.json")
        
        if lectures_count == 0:
            print("\nЛекции не загружены!")
            print("Запустите: python load_lectures.py")
        
        print("\n" + "=" * 60)
        print("ИНИЦИАЛИЗАЦИЯ ЗАВЕРШЕНА")
        print("=" * 60)
        print(f"\nДанные для входа:")
        print(f"Преподаватель: mr.dyadichev / test123")
        print(f"Студент (ключ): ПМИ-241")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()