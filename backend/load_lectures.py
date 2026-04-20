import sys
from pathlib import Path
import uuid
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal, engine, Base
from app import models
from app.pdf_parser import extract_text_from_pdf
from app.embeddings_service import embeddings_service
from app.config import LECTURES_DIR
import shutil

PDF_FOLDER = Path(r"C:\Users\artyo\OneDrive\Документы\Exam_AI_project\backend\uploads\lectures")  # <-- ИЗМЕНИТЕ НА ВАШ ПУТЬ


def get_or_create_group(db: Session, group_name: str = "Тестовая группа") -> models.Group:
    group = db.query(models.Group).filter(models.Group.name == group_name).first()
    
    if not group:
        teacher = db.query(models.Teacher).filter(models.Teacher.login == "teacher").first()
        
        if not teacher:
            print("Преподаватель не найден! Запустите init_db.py сначала")
            return None
        
        group = models.Group(
            name=group_name,
            teacher_id=teacher.id,
            access_key=f"TEST{uuid.uuid4().hex[:6].upper()}",
            questions_count=5,
            time_per_question=30,
            use_auto_generation=1
        )
        db.add(group)
        db.commit()
        db.refresh(group)
        print(f"Создана группа: {group.name} (ключ: {group.access_key})")
    
    return group

def load_single_pdf(db: Session, group_id: int, pdf_path: Path) -> bool:
    try:
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
        print(f"❌ Ошибка при загрузке {pdf_path.name}: {str(e)}")
        return False

def load_all_pdfs(db: Session, group_id: int, folder_path: Path) -> dict:
    results = {"success": 0, "failed": 0, "files": []}
    
    pdf_files = list(folder_path.glob("*.pdf")) + list(folder_path.glob("*.PDF"))
    
    if not pdf_files:
        print(f"PDF файлы не найдены в {folder_path}")
        print(f"Убедитесь, что путь правильный и в папке есть PDF файлы")
        return results
    
    print(f"Найдено PDF файлов: {len(pdf_files)}")
    print("=" * 50)
    
    for pdf_path in pdf_files:
        success = load_single_pdf(db, group_id, pdf_path)
        if success:
            results["success"] += 1
            results["files"].append(pdf_path.name)
        else:
            results["failed"] += 1
    
    return results

def test_lecture_loading():
    print("=" * 60)
    print("Загрузка тестовых лекций в базу данных")
    print("=" * 60)
    
    db = SessionLocal()
    
    try:
        group = get_or_create_group(db, "Тестовая группа для экзамена")
        if not group:
            return
        
        print(f"\nГруппа ID: {group.id}")
        print(f"Ключ доступа: {group.access_key}")
        print(f"Название: {group.name}")
        print("=" * 50)
        
        if PDF_FOLDER.exists():
            results = load_all_pdfs(db, group.id, PDF_FOLDER)
            
            print("\n" + "=" * 50)
            print("РЕЗУЛЬТАТЫ ЗАГРУЗКИ:")
            print(f"Успешно загружено: {results['success']}")
            print(f"Ошибок: {results['failed']}")
            
            if results['files']:
                print("\nЗагруженные файлы:")
                for f in results['files']:
                    print(f"   - {f}")
        else:
            print(f"\nПапка с PDF не найдена: {PDF_FOLDER}")
            print("Создайте папку или укажите правильный путь")
            
            print("\nСоздание демо-лекции для тестирования...")
            create_demo_lecture(db, group.id)
        
        lectures = db.query(models.Lecture).filter(models.Lecture.group_id == group.id).all()
        chunks = db.query(models.Chunk).join(models.Lecture).filter(models.Lecture.group_id == group.id).all()
        
        print("\n" + "=" * 50)
        print("СТАТИСТИКА БАЗЫ ДАННЫХ:")
        print(f"Лекций в группе: {len(lectures)}")
        print(f"Всего чанков: {len(chunks)}")
        
        if chunks:
            total_text = sum(len(c.text) for c in chunks)
            print(f"Объем текста: ~{total_text // 1000} тыс. символов")
        
        print("\nТестовая загрузка завершена!")
        print(f"Для тестирования используйте ключ: {group.access_key}")
        
    except Exception as e:
        print(f"Критическая ошибка: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

def create_demo_lecture(db: Session, group_id: int):
    demo_text = ""
    
    lecture = models.Lecture(
        group_id=group_id,
        filename="demo_lecture_about_sustainability.txt",
        text_content=demo_text
    )
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    
    print(f"Создана демо-лекция: {lecture.filename}")
    
    # Создаем эмбеддинги
    embeddings_service.process_lecture(db, lecture.id, demo_text)
    print(f"Эмбеддинги созданы для демо-лекции")

def quick_test():
    import sys
    
    if len(sys.argv) < 2:
        print("Использование: python load_lectures.py <путь_к_pdf_файлу>")
        return
    
    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"Файл не найден: {pdf_path}")
        return
    
    db = SessionLocal()
    try:
        group = get_or_create_group(db, "Тестовая группа")
        if group:
            success = load_single_pdf(db, group.id, pdf_path)
            if success:
                print(f"\nЛекция успешно загружена!")
                print(f"Ключ группы: {group.access_key}")
    finally:
        db.close()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Загрузка PDF лекций в базу')
    parser.add_argument('--file', '-f', type=str, help='Путь к конкретному PDF файлу')
    parser.add_argument('--folder', '-d', type=str, help='Путь к папке с PDF файлами')
    
    args = parser.parse_args()
    
    if args.file:
        print(f"Загрузка файла: {args.file}")
        pdf_path = Path(args.file)
        if pdf_path.exists():
            db = SessionLocal()
            try:
                group = get_or_create_group(db, "Тестовая группа")
                if group:
                    load_single_pdf(db, group.id, pdf_path)
            finally:
                db.close()
        else:
            print(f"Файл не найден: {pdf_path}")
    elif args.folder:
        PDF_FOLDER = Path(args.folder)
        test_lecture_loading()
    else:
        test_lecture_loading()