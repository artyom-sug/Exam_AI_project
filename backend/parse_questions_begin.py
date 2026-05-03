import sys
import json
import re
from pathlib import Path
from typing import List, Dict, Any
import fitz

sys.path.insert(0, str(Path(__file__).parent))

from app.pdf_parser import extract_text_from_pdf


def extract_questions_from_text(text: str) -> List[str]:
    text = text.replace('\n', ' ')
    text = re.sub(r'\s+', ' ', text)
    
    questions = []
    seen_questions = set()
    
    parts = re.split(r'\s+(?=\d+[\.\)]?\s)', text)
    
    for part in parts:
        cleaned = re.sub(r'^\d+[\.\)]?\s*', '', part.strip())
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        cleaned = re.sub(r'\s+\d+[\.\)]\s+', '. ', cleaned)
        
        if cleaned and len(cleaned) > 10 and len(cleaned) < 500:
            normalized = cleaned.lower().rstrip('.!?')
            if normalized not in seen_questions:
                seen_questions.add(normalized)
                questions.append(cleaned)
    
    return questions


def parse_pdf_questions(pdf_path: Path) -> List[Dict]:
    
    text = extract_text_from_pdf(str(pdf_path))
    if not text:
        print(f"Не удалось извлечь текст из {pdf_path}")
        return []
    
    raw_questions = extract_questions_from_text(text)
    
    result = []
    for i, q_text in enumerate(raw_questions, 1):
        result.append({
            "number": i,
            "question": q_text,
            "expected_answer": "",
            "topic": "Общий",
            "difficulty": 3
        })
    
    return result


def main():
    print("=" * 60)
    print("ПАРСЕР ВОПРОСОВ")
    print("=" * 60)
    
    questions_folder = Path("uploads/questions")
    
    if not questions_folder.exists():
        print(f"Папка не найдена: {questions_folder}")
        questions_folder.mkdir(parents=True, exist_ok=True)
        print(f"Создана папка: {questions_folder}")
        return
    
    pdf_files = list(questions_folder.glob("*.pdf")) + list(questions_folder.glob("*.PDF"))
    
    if not pdf_files:
        print(f"Нет PDF файлов в {questions_folder}")
        return
    
    print(f"Найдено PDF файлов: {len(pdf_files)}")
    
    all_questions = []
    seen_questions_global = set()
    
    for pdf_path in pdf_files:
        print(f"\nОбработка: {pdf_path.name}")
        questions = parse_pdf_questions(pdf_path)
        
        new_count = 0
        for q in questions:
            normalized = q['question'].lower().rstrip('.!?')
            if normalized not in seen_questions_global:
                seen_questions_global.add(normalized)
                all_questions.append(q)
                new_count += 1
        
        print(f"Извлечено вопросов: {len(questions)}, новых: {new_count}")
    
    if not all_questions:
        print("\nНе удалось извлечь вопросы!")
        return
    
    for i, q in enumerate(all_questions, 1):
        q['number'] = i
    
    output_path = "questions_parsed.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)
    
    print("\n" + "=" * 60)
    print(f"Сохранено {len(all_questions)} уникальных вопросов в {output_path}")
    print("=" * 60)
    
    print("\nПримеры вопросов:")
    for q in all_questions[:10]:
        print(f"{q['number']}. {q['question'][:80]}...")
    
    print(f"\nДля загрузки в БД выполните:")
    print(f"python load_questions.py --json {output_path}")


if __name__ == "__main__":
    main()