import sys
import json
import csv
import argparse
from pathlib import Path
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app import models


def get_teacher(db: Session) -> models.Teacher | None:
    teacher = db.query(models.Teacher).filter(models.Teacher.login == "mr.dyadichev").first()
    if not teacher:
        print("Преподаватель mr.dyadichev не найден!")
        print("Сначала запустите: python init_db.py")
    return teacher


def load_questions_from_json(db: Session, json_path: Path, teacher_id: int):
    with open(json_path, 'r', encoding='utf-8') as f:
        questions = json.load(f)

    for q in questions:
        question = models.QuestionBank(
            group_id=None,
            teacher_id=teacher_id,
            question_text=q.get("question") or q.get("text") or q.get("q"),
            expected_answer=q.get("expected_answer") or q.get("answer", ""),
            topic=q.get("topic", ""),
            difficulty=q.get("difficulty", 3)
        )
        db.add(question)

    db.commit()
    print(f"Загружено {len(questions)} вопросов из {json_path}")


def load_questions_from_csv(db: Session, csv_path: Path, teacher_id: int):
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            question = models.QuestionBank(
                group_id=None,
                teacher_id=teacher_id,
                question_text=row.get("question") or row.get("вопрос", ""),
                expected_answer=row.get("answer") or row.get("ответ", ""),
                topic=row.get("topic") or row.get("тема", ""),
                difficulty=int(row.get("difficulty") or row.get("сложность", 3))
            )
            db.add(question)
            count += 1

    db.commit()
    print(f"Загружено {count} вопросов из {csv_path}")


def print_stats(db: Session, teacher_id: int):
    questions_count = db.query(models.QuestionBank).filter(
        models.QuestionBank.teacher_id == teacher_id
    ).count()

    print(f"\nВопросов у преподавателя: {questions_count}")

    if questions_count > 0:
        questions = db.query(models.QuestionBank).filter(
            models.QuestionBank.teacher_id == teacher_id
        ).limit(5).all()

        print("\nПримеры вопросов:")
        for i, q in enumerate(questions, 1):
            print(f"   {i}. {q.question_text[:80]}...")


def main():
    parser = argparse.ArgumentParser(description='Загрузка вопросов')
    parser.add_argument('--json', '-j', type=str, help='Путь к JSON файлу')
    parser.add_argument('--csv', '-c', type=str, help='Путь к CSV файлу')
    args = parser.parse_args()

    print("=" * 60)
    print("Загрузка базы вопросов")
    print("=" * 60)

    db = SessionLocal()

    try:
        teacher = get_teacher(db)
        if not teacher:
            return

        if args.json:
            json_path = Path(args.json)
            if json_path.exists():
                load_questions_from_json(db, json_path, teacher.id)
            else:
                print(f"Файл не найден: {json_path}")
                return

        if args.csv:
            csv_path = Path(args.csv)
            if csv_path.exists():
                load_questions_from_csv(db, csv_path, teacher.id)
            else:
                print(f"Файл не найден: {csv_path}")
                return

        if not args.json and not args.csv:
            print("Укажите --json или --csv для загрузки файла")
            print_stats(db, teacher.id)
            return

        print_stats(db, teacher.id)

    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
