import sys
import json
import csv
from pathlib import Path
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app import models


def get_or_create_group(db: Session, group_name: str = "Тестовая группа") -> models.Group:
    group = db.query(models.Group).filter(models.Group.name == group_name).first()
    
    if not group:
        teacher = db.query(models.Teacher).filter(models.Teacher.login == "mr.dyadichev").first()
        if not teacher:
            print("Преподаватель mr.dyadichev не найден! Запустите init_db.py")
            return None
        
        group = models.Group(
            name=group_name,
            teacher_id=teacher.id,
            access_key=f"TEST{group_name[:3].upper()}123",
            questions_count=5,
            time_per_question=30,
            use_auto_generation=0  
        )
        db.add(group)
        db.commit()
        db.refresh(group)
        print(f"Создана группа: {group.name} (ключ: {group.access_key})")
    else:
        print(f"Используется существующая группа: {group.name} (ID: {group.id})")
    
    return group


def load_questions_from_json(db: Session, group_id: int, json_path: Path):
    with open(json_path, 'r', encoding='utf-8') as f:
        questions = json.load(f)
    
    for q in questions:
        question = models.QuestionBank(
            group_id=group_id,
            question_text=q.get("question") or q.get("text") or q.get("q"),
            expected_answer=q.get("expected_answer") or q.get("answer", ""),
            topic=q.get("topic", ""),
            difficulty=q.get("difficulty", 3)
        )
        db.add(question)
    
    db.commit()
    print(f"Загружено {len(questions)} вопросов из {json_path}")


def load_questions_from_csv(db: Session, group_id: int, csv_path: Path):
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            question = models.QuestionBank(
                group_id=group_id,
                question_text=row.get("question") or row.get("вопрос", ""),
                expected_answer=row.get("answer") or row.get("ответ", ""),
                topic=row.get("topic") or row.get("тема", ""),
                difficulty=int(row.get("difficulty") or row.get("сложность", 3))
            )
            db.add(question)
            count += 1
    
    db.commit()
    print(f"Загружено {count} вопросов из {csv_path}")


def main():
    print("=" * 60)
    print("Загрузка базы вопросов")
    print("=" * 60)
    
    db = SessionLocal()
    
    try:
        teacher = db.query(models.Teacher).filter(models.Teacher.login == "mr.dyadichev").first()
        if not teacher:
            print("Преподаватель mr.dyadichev не найден!")
            print("Сначала запустите: python init_db.py")
            return
        
        group = get_or_create_group(db, "ПМИ-241")
        if not group:
            return
        
        print(f"\nГруппа: {group.name}")
        print(f"Ключ доступа: {group.access_key}")
        print(f"Режим: {'Готовые вопросы' if group.use_auto_generation == 0 else 'AI генерация'}")
        
        group.use_auto_generation = 0
        db.commit()
        print("Включен режим использования готовых вопросов")
        
        questions_count = db.query(models.QuestionBank).filter(
            models.QuestionBank.group_id == group.id
        ).count()
        
        print(f"\nИТОГО:")
        print(f"Вопросов в базе: {questions_count}")
        print(f"Ключ для входа: {group.access_key}")
        
        if questions_count > 0:
            questions = db.query(models.QuestionBank).filter(
                models.QuestionBank.group_id == group.id
            ).limit(5).all()
            
            print("\nПримеры вопросов:")
            for i, q in enumerate(questions, 1):
                print(f"   {i}. {q.question_text[:80]}...")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


def load_custom_file():
    import argparse
    
    parser = argparse.ArgumentParser(description='Загрузка вопросов')
    parser.add_argument('--json', '-j', type=str, help='Путь к JSON файлу')
    parser.add_argument('--csv', '-c', type=str, help='Путь к CSV файлу')
    parser.add_argument('--group', '-g', type=str, default="ПМИ-241", help='Название группы')
    
    args = parser.parse_args()
    
    if not args.json and not args.csv:
        print("Укажите --json или --csv для загрузки файла")
        return
    
    db = SessionLocal()
    
    try:
        teacher = db.query(models.Teacher).filter(models.Teacher.login == "mr.dyadichev").first()
        if not teacher:
            print("Преподаватель mr.dyadichev не найден!")
            print("Сначала запустите: python init_db.py")
            return
        
        group = get_or_create_group(db, args.group)
        if not group:
            return
        
        group.use_auto_generation = 0
        db.commit()
        
        if args.json:
            json_path = Path(args.json)
            if json_path.exists():
                load_questions_from_json(db, group.id, json_path)
            else:
                print(f"Файл не найден: {json_path}")
        
        if args.csv:
            csv_path = Path(args.csv)
            if csv_path.exists():
                load_questions_from_csv(db, group.id, csv_path)
            else:
                print(f"Файл не найден: {csv_path}")
        
        count = db.query(models.QuestionBank).filter(
            models.QuestionBank.group_id == group.id
        ).count()
        print(f"\nВсего вопросов в базе: {count}")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        load_custom_file()
    else:
        main()