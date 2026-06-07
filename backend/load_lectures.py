import sys
import argparse
from pathlib import Path
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app import models
from app.pdf_parser import extract_text_from_pdf
from app.embeddings_service import embeddings_service
from app.config import LECTURES_DIR


def get_teacher(db: Session) -> models.Teacher | None:
    teacher = db.query(models.Teacher).filter(models.Teacher.login == "mr.dyadichev").first()
    if not teacher:
        print("Преподаватель mr.dyadichev не найден! Запустите init_db.py")
    return teacher


def get_group(db: Session, group_id: int, teacher_id: int) -> models.Group | None:
    group = db.query(models.Group).filter(
        models.Group.id == group_id,
        models.Group.teacher_id == teacher_id
    ).first()
    if not group:
        print(f"Группа с ID {group_id} не найдена.")
        print("Создайте группу в панели преподавателя на сайте и укажите её ID.")
    return group


def is_lecture_already_loaded(db: Session, group_id: int, filename: str) -> bool:
    lecture = db.query(models.Lecture).filter(
        models.Lecture.group_id == group_id,
        models.Lecture.filename == filename
    ).first()
    return lecture is not None


def load_single_pdf(db: Session, group_id: int, pdf_path: Path) -> bool:
    try:
        if is_lecture_already_loaded(db, group_id, pdf_path.name):
            print(f"Пропуск: {pdf_path.name} (уже загружена)")
            return True

        print(f"Обработка: {pdf_path.name}")

        text_content = extract_text_from_pdf(str(pdf_path))

        if not text_content or len(text_content) < 100:
            print(f"Предупреждение: {pdf_path.name} - мало текста ({len(text_content)} символов)")

        lecture = models.Lecture(
            group_id=group_id,
            filename=pdf_path.name,
            text_content=text_content
        )
        db.add(lecture)
        db.commit()
        db.refresh(lecture)

        print(f"Создание эмбеддингов для {pdf_path.name}...")
        embeddings_service.process_lecture(db, lecture.id, text_content)

        print(f"Загружено: {pdf_path.name} ({len(text_content)} символов)")
        return True

    except Exception as e:
        print(f"Ошибка при загрузке {pdf_path.name}: {str(e)}")
        return False


def load_all_pdfs(db: Session, group_id: int, folder_path: Path) -> dict:
    results = {"success": 0, "skipped": 0, "failed": 0, "files": []}

    pdf_files = list(folder_path.glob("*.pdf")) + list(folder_path.glob("*.PDF"))

    if not pdf_files:
        print(f"PDF файлы не найдены в {folder_path}")
        return results

    loaded_files = db.query(models.Lecture.filename).filter(
        models.Lecture.group_id == group_id
    ).all()
    loaded_filenames = {f[0] for f in loaded_files}

    print(f"Найдено PDF файлов: {len(pdf_files)}")
    print(f"Уже загружено в БД: {len(loaded_filenames)}")
    print("=" * 50)

    for pdf_path in pdf_files:
        if pdf_path.name in loaded_filenames:
            print(f"Пропуск (уже загружен): {pdf_path.name}")
            results["skipped"] += 1
            continue

        success = load_single_pdf(db, group_id, pdf_path)
        if success:
            results["success"] += 1
            results["files"].append(pdf_path.name)
        else:
            results["failed"] += 1

    return results


def main():
    parser = argparse.ArgumentParser(description='Загрузка лекций в базу данных')
    parser.add_argument(
        '--group-id', '-g', type=int, required=True,
        help='ID группы (создаётся в панели преподавателя на сайте)'
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Загрузка лекций в базу данных")
    print("=" * 60)

    db = SessionLocal()

    try:
        teacher = get_teacher(db)
        if not teacher:
            return

        print(f"Найден преподаватель: {teacher.login}")

        group = get_group(db, args.group_id, teacher.id)
        if not group:
            return

        print(f"\nГруппа ID: {group.id}")
        print(f"Название: {group.name}")
        print("=" * 50)

        lectures_folder = Path(LECTURES_DIR)

        if not lectures_folder.exists():
            print(f"\nПапка с PDF не найдена: {lectures_folder}")
            print("Создайте папку и поместите в неё PDF файлы с лекциями")
            lectures_folder.mkdir(parents=True, exist_ok=True)
            print(f"Создана папка: {lectures_folder}")
            return

        results = load_all_pdfs(db, group.id, lectures_folder)

        print("\n" + "=" * 50)
        print("РЕЗУЛЬТАТЫ ЗАГРУЗКИ:")
        print(f"Успешно загружено: {results['success']}")
        print(f"Пропущено (уже были): {results['skipped']}")
        print(f"Ошибок: {results['failed']}")

        if results['files']:
            print("\nНовые загруженные файлы:")
            for f in results['files']:
                print(f"   - {f}")

        lectures = db.query(models.Lecture).filter(models.Lecture.group_id == group.id).all()
        chunks = db.query(models.Chunk).join(models.Lecture).filter(models.Lecture.group_id == group.id).all()

        print("\n" + "=" * 50)
        print("СТАТИСТИКА:")
        print(f"Лекций в группе: {len(lectures)}")
        print(f"Всего чанков: {len(chunks)}")

        if chunks:
            total_text = sum(len(c.text) for c in chunks)
            print(f"Объем текста: ~{total_text // 1000} тыс. символов")

        print("\nЗагрузка завершена!")

    except Exception as e:
        print(f"Критическая ошибка: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
