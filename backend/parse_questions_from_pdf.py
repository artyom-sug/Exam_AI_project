import sys
import json
import re
import time
from pathlib import Path
from typing import List, Dict, Any
import fitz

sys.path.insert(0, str(Path(__file__).parent))

from app.pdf_parser import extract_text_from_pdf
from app.database import SessionLocal
from app import models
from app.llm_service import llm_service
from app.embeddings_service import embeddings_service


class QuestionParserWithAI:
    
    def __init__(self, group_id: int = None):
        self.group_id = group_id
        self.db = SessionLocal() if group_id else None
        
    def search_relevant_context(self, question: str) -> str:
        if not self.db or not self.group_id:
            return ""
        
        try:
            relevant_chunks = embeddings_service.search_similar_chunks(
                self.db, self.group_id, question, top_k=3
            )
            if relevant_chunks:
                return "\n\n".join(relevant_chunks)
        except Exception as e:
            print(f"Ошибка поиска контекста: {e}")
        
        return ""
    
    def generate_answer_with_llm(self, question: str, context: str = "", retry_count: int = 2) -> str:
        """Генерирует эталонный ответ через Ollama с повторными попытками"""
        
        if context:
            prompt = f"""
Ты - эксперт в области образования. Используя ТОЛЬКО материал лекций ниже, 
составь правильный эталонный ответ на вопрос.

МАТЕРИАЛ ЛЕКЦИЙ:
{context[:2500]}

ВОПРОС: {question}

ЭТАЛОННЫЙ ОТВЕТ (кратко):
"""
        else:
            prompt = f"""
Ты - эксперт в области образования. Составь подробный, правильный и полный 
эталонный ответ на вопрос.

ВОПРОС: {question}

ЭТАЛОННЫЙ ОТВЕТ (кратко):
"""
        
        for attempt in range(retry_count):
            try:
                print(f"Вызов Ollama (попытка {attempt + 1})...")
                response = llm_service.generate(prompt, temperature=0.5)
                
                if response and "Ответ не сгенерирован" not in response and len(response) > 20:
                    response = response.strip()
                    response = re.sub(r'^ЭТАЛОННЫЙ ОТВЕТ:\s*', '', response, flags=re.IGNORECASE)
                    print(f"Ответ получен ({len(response)} символов)")
                    return response
                else:
                    print(f"Пустой ответ, повторная попытка...")
                    
            except Exception as e:
                print(f"Ошибка: {e}")
                if attempt < retry_count - 1:
                    print(f"Повтор через 3 секунды...")
                    time.sleep(3)
        
        return "Ответ не сгенерирован. Пожалуйста, добавьте вручную."
    
    def parse_with_ollama(self, pdf_path: Path, generate_answers: bool = True) -> List[Dict]:
        
        text = extract_text_from_pdf(str(pdf_path))
        if not text:
            print(f"Не удалось извлечь текст из {pdf_path}")
            return []
        
        raw_questions = self.extract_questions_from_text(text)
        
        all_questions = []
        for q in raw_questions:
            sub_qs = self.split_long_question(q)
            all_questions.extend(sub_qs)
        
        seen = set()
        unique_questions = []
        for q in all_questions:
            q_lower = q.lower()
            if q_lower not in seen and len(q) > 10:
                seen.add(q_lower)
                unique_questions.append(q)
        
        print(f"\nНайдено уникальных вопросов: {len(unique_questions)}")
        
        result = []
        
        if generate_answers:
            print("\nГЕНЕРАЦИЯ ЭТАЛОННЫХ ОТВЕТОВ ЧЕРЕЗ OLLAMA")
            print("=" * 60)
            
            for i, q_text in enumerate(unique_questions, 1):
                print(f"\n[{i}/{len(unique_questions)}] Вопрос: {q_text[:80]}...")
                
                context = self.search_relevant_context(q_text)
                if context:
                    print(f"Найден контекст в лекциях")
                else:
                    print(f"Контекст не найден, использую общие знания")
                
                answer = self.generate_answer_with_llm(q_text, context)
                
                result.append({
                    "number": i,
                    "question": q_text,
                    "expected_answer": answer,
                    "topic": "Общий",
                    "difficulty": 3
                })
                
                time.sleep(0.5)
        else:
            for i, q_text in enumerate(unique_questions, 1):
                result.append({
                    "number": i,
                    "question": q_text,
                    "expected_answer": "",
                    "topic": "Общий",
                    "difficulty": 3
                })
        
        return result
    
    def extract_questions_from_text(self, text: str) -> List[str]:
        text = text.replace('\n', ' ')
        text = re.sub(r'\s+', ' ', text)
        
        pattern = r'(\d+)[\.\)]?\s+([^.\d]*(?:\.(?!\d+[\.\)]?\s)[^.\d]*)*)'
        matches = re.findall(pattern, text)
        
        questions = []
        for match in matches:
            q_text = match[1].strip()
            q_text = re.sub(r'\s+', ' ', q_text)
            if q_text and len(q_text) > 10:
                questions.append(q_text)
        
        if not questions:
            parts = re.split(r'\s+(?=\d+[\.\)]?\s)', text)
            for part in parts:
                cleaned = re.sub(r'^\d+[\.\)]?\s*', '', part.strip())
                cleaned = re.sub(r'\s+', ' ', cleaned)
                if cleaned and len(cleaned) > 10:
                    questions.append(cleaned)
        
        return questions
    
    def split_long_question(self, question: str) -> List[str]:
        sub_matches = re.findall(r'(\d+)[\.\)]\s+([^.\d]*(?:\.(?!\d+[\.\)]?\s)[^.\d]*)*)', question)
        
        if len(sub_matches) >= 2:
            sub_questions = []
            for match in sub_matches:
                sub_text = match[1].strip()
                sub_text = re.sub(r'\s+', ' ', sub_text)
                if sub_text and len(sub_text) > 10:
                    sub_questions.append(sub_text)
            return sub_questions
        
        return [question]
    
    def save_to_json(self, questions: List[Dict], output_path: str):
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)
        
        print(f"\nСохранено {len(questions)} вопросов в {output_path}")
        
        answered = sum(1 for q in questions if q.get('expected_answer') and 
                      q['expected_answer'] not in ["", "Ответ не сгенерирован. Пожалуйста, добавьте вручную."])
        print(f"Из них с ответами: {answered}")
    
    def close(self):
        if self.db:
            self.db.close()


def main():
    print("=" * 60)
    print("ПАРСЕР ВОПРОСОВ С ГЕНЕРАЦИЕЙ ОТВЕТОВ ЧЕРЕЗ OLLAMA")
    print("=" * 60)
    
    print("\nПроверка подключения к Ollama...")
    try:
        import requests
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            print("Ollama работает!")
        else:
            print("Ollama отвечает, но с ошибкой")
    except Exception as e:
        print(f"Ollama НЕ ДОСТУПЕН! Ошибка: {e}")
        print("\nЗапустите Ollama в отдельном терминале:")
        print("ollama serve")
        print("\nИЛИ используйте ручной ввод ответов")
        return
    
    questions_folder = Path("uploads/questions")
    
    if not questions_folder.exists():
        print(f"Папка не найдена: {questions_folder}")
        questions_folder.mkdir(parents=True, exist_ok=True)
        print(f"Создана папка: {questions_folder}")
        print(f"Поместите PDF файлы в папку и запустите скрипт снова")
        return
    
    db = SessionLocal()
    group = db.query(models.Group).filter(models.Group.name == "Группа с лекциями").first()
    group_id = group.id if group else None
    
    if group_id:
        print(f"Найдена группа с лекциями ID: {group_id}")
    else:
        print("Группа с лекциями не найдена, работаем без контекста")
    
    db.close()
    
    pdf_files = list(questions_folder.glob("*.pdf")) + list(questions_folder.glob("*.PDF"))
    
    if not pdf_files:
        print(f"Нет PDF файлов в {questions_folder}")
        return
    
    print(f"\nНайдено PDF файлов: {len(pdf_files)}")
    
    parser = QuestionParserWithAI(group_id)
    all_questions = []
    
    for pdf_path in pdf_files:
        print(f"\nОбработка: {pdf_path.name}")
        questions = parser.parse_with_ollama(pdf_path, generate_answers=True)
        all_questions.extend(questions)
        print(f"Добавлено вопросов: {len(questions)}")
    
    parser.close()
    
    if all_questions:
        parser.save_to_json(all_questions, "questions_with_answers.json")
        
        print("\n" + "=" * 60)
        print("ГОТОВО!")
        print("=" * 60)
        print(f"\nДля загрузки вопросов в БД выполните:")
        print(f"python load_questions.py --json questions_with_answers.json")
    else:
        print("Не удалось извлечь вопросы!")


if __name__ == "__main__":
    main()