#!/usr/bin/env python3
"""
Очистка вопросов с ID с 87 по 171 в таблице question_bank
"""

from app.database import SessionLocal
from app import models

def clear_questions_range():
    print("=" * 60)
    print("ОЧИСТКА ВОПРОСОВ (ID 87-171)")
    print("=" * 60)
    
    db = SessionLocal()
    
    try:
        # Проверяем, сколько вопросов в этом диапазоне
        questions_to_delete = db.query(models.QuestionBank).filter(
            models.QuestionBank.id >= 87,
            models.QuestionBank.id <= 171
        ).all()
        
        count = len(questions_to_delete)
        
        if count == 0:
            print(f"❌ Вопросы с ID 87 по 171 не найдены")
            print(f"   (Всего вопросов в БД: {db.query(models.QuestionBank).count()})")
            return
        
        print(f"\n📊 Найдено вопросов для удаления: {count}")
        print(f"   Диапазон ID: с 87 по 171")
        
        # Показываем первые 5 вопросов для подтверждения
        print("\n📝 Первые 5 вопросов из диапазона:")
        for i, q in enumerate(questions_to_delete[:5]):
            print(f"   ID {q.id}: {q.question_text[:50]}...")
        
        # Запрашиваем подтверждение
        print(f"\n⚠️ ВНИМАНИЕ: Вы собираетесь удалить {count} вопросов!")
        confirm = input("Подтвердите удаление (введите 'ДА'): ")
        
        if confirm != "ДА":
            print("❌ Операция отменена")
            return
        
        # Удаляем вопросы
        deleted = db.query(models.QuestionBank).filter(
            models.QuestionBank.id >= 87,
            models.QuestionBank.id <= 171
        ).delete(synchronize_session=False)
        
        db.commit()
        
        print(f"\n✅ Успешно удалено вопросов: {deleted}")
        
        # Проверяем результат
        remaining = db.query(models.QuestionBank).count()
        print(f"📊 Осталось вопросов в БД: {remaining}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()

def clear_by_question_text_contains(text_contains):
    """Очистить вопросы, содержащие определенный текст"""
    print(f"\nОчистка вопросов, содержащих: '{text_contains}'")
    
    db = SessionLocal()
    
    try:
        questions = db.query(models.QuestionBank).filter(
            models.QuestionBank.question_text.contains(text_contains)
        ).all()
        
        print(f"Найдено вопросов: {len(questions)}")
        
        if questions:
            confirm = input("Удалить? (да/нет): ")
            if confirm.lower() == 'да':
                for q in questions:
                    db.delete(q)
                db.commit()
                print(f"✅ Удалено {len(questions)} вопросов")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("\nВыберите действие:")
    print("1. Очистить вопросы с ID 87 по 171")
    print("2. Очистить вопросы по тексту")
    
    choice = input("\nВаш выбор (1/2): ")
    
    if choice == "1":
        clear_questions_range()
    elif choice == "2":
        text = input("Введите текст для поиска: ")
        clear_by_question_text_contains(text)
    else:
        print("Неверный выбор")