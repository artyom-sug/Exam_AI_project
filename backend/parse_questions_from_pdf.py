import sys
import json
import re
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
        self.db = None
        if group_id:
            self.db = SessionLocal()
        
    def search_relevant_context(self, question: str) -> str:
        if not self.db or not self.group_id:
            return ""
        
        relevant_chunks = embeddings_service.search_similar_chunks(
            self.db, self.group_id, question, top_k=3
        )
        
        if relevant_chunks:
            return "\n\n".join(relevant_chunks)
        return ""
    
    def generate_answer_with_llm(self, question: str, context: str = "") -> str:
        if context:
            prompt = f"""
Ты - эксперт в области образования. Используя ТОЛЬКО материал лекций ниже, 
составь подробный, правильный и полный эталонный ответ на вопрос.

МАТЕРИАЛ ЛЕКЦИЙ:
{context[:3000]}

ВОПРОС: {question}

ЭТАЛОННЫЙ ОТВЕТ (3-5 предложений):
"""
        else:
            prompt = f"""
Ты - эксперт в области образования. Составь подробный, правильный и полный 
эталонный ответ на вопрос.

ВОПРОС: {question}

ЭТАЛОННЫЙ ОТВЕТ (3-5 предложений):
"""
        
        try:
            response = llm_service.generate(prompt, temperature=0.5)
            response = response.strip()
            response = re.sub(r'^ЭТАЛОННЫЙ ОТВЕТ:\s*', '', response, flags=re.IGNORECASE)
            return response if response else "Ответ не сгенерирован"
        except Exception as e:
            print(f"Ошибка генерации ответа: {e}")
            return "Ответ не сгенерирован"
    
    def parse_questions_from_pdf(self, pdf_path: str, generate_answers: bool = True) -> List[Dict[str, Any]]:
        if not Path(pdf_path).exists():
            print(f"Файл не найден: {pdf_path}")
            return []
        
        text = extract_text_from_pdf(pdf_path)
        if not text:
            print(f"Не удалось извлечь текст из {pdf_path}")
            return []
        
        return self.parse_from_text(text, generate_answers)
    
    def parse_from_text(self, text: str, generate_answers: bool = True) -> List[Dict[str, Any]]:
        questions = []
        
        text = text.replace('\n', ' ')
        text = re.sub(r'\s+', ' ', text)
        
        pattern = r'(\d+)\.\s+([^.]*(?:\.(?!\d+\.)[^.]*)*)'
        matches = re.findall(pattern, text)
        
        if not matches:
            pattern = r'(\d+)\)\s+([^)]*(?:\)(?!\d+\))[^)]*)*)'
            matches = re.findall(pattern, text)
        
        if not matches:
            parts = re.split(r'(?=\d+\.)', text)
            for part in parts:
                match = re.match(r'(\d+)\.\s+(.+)', part.strip())
                if match:
                    num = int(match.group(1))
                    question_text = match.group(2).strip()
                    next_num_match = re.search(rf'\b{num+1}\.', question_text)
                    if next_num_match:
                        question_text = question_text[:next_num_match.start()].strip()
                    
                    if question_text and len(question_text) > 5 and len(question_text) < 500:
                        questions.append({
                            "number": num,
                            "question": question_text
                        })
        
        if matches and not questions:
            for num_str, question_text in matches:
                num = int(num_str)
                question_text = question_text.strip()
                
                if len(question_text) > 100 and '.' in question_text:
                    parts = re.split(r'\s+\d+\.\s+', question_text)
                    question_text = parts[0].strip()
                
                if question_text and len(question_text) > 5 and len(question_text) < 500:
                    questions.append({
                        "number": num,
                        "question": question_text
                    })
        
        if not questions:
            print("Не удалось найти вопросы в формате '1. Текст вопроса'")
            return []
        
        questions.sort(key=lambda x: x['number'])
        
        print(f"\nНайдено вопросов: {len(questions)}")
        
        if generate_answers:
            print("\nГенерация эталонных ответов через нейросеть...")
            print("=" * 60)
            
            for i, q in enumerate(questions, 1):
                print(f"\n[{i}/{len(questions)}] Вопрос {q['number']}: {q['question'][:80]}...")
                
                if self.group_id and self.db:
                    context = self.search_relevant_context(q['question'])
                    if context:
                        print(f"Найден контекст в лекциях")
                    else:
                        print(f"Контекст не найден, использую общие знания")
                else:
                    context = ""
                    print(f"Лекции не загружены, использую общие знания")
                
                answer = self.generate_answer_with_llm(q['question'], context)
                q['expected_answer'] = answer
                
                print(f"Ответ: {answer[:100]}...")
        
        return questions
    
    def save_to_json(self, questions: List[Dict], output_path: str):
        formatted_questions = []
        for q in questions:
            formatted_questions.append({
                "question": q["question"],
                "expected_answer": q.get("expected_answer", ""),
                "topic": "Общий",
                "difficulty": 3
            })
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(formatted_questions, f, ensure_ascii=False, indent=2)
        
        print(f"\nСохранено {len(formatted_questions)} вопросов в {output_path}")
        return formatted_questions
    
    def close(self):
        if self.db:
            self.db.close()


def process_questions_from_folder(folder_path: str, group_id: int = None, output_json: str = "questions_with_answers.json"):
    folder = Path(folder_path)
    parser = QuestionParserWithAI(group_id)
    all_questions = []
    
    pdf_files = list(folder.glob("*.pdf")) + list(folder.glob("*.PDF"))
    
    if not pdf_files:
        print(f"PDF файлы не найдены в {folder}")
        return []
    
    print(f"Найдено PDF с вопросами: {len(pdf_files)}")
    print("=" * 60)
    
    for pdf_path in pdf_files:
        print(f"\nОбработка: {pdf_path.name}")
        questions = parser.parse_questions_from_pdf(str(pdf_path), generate_answers=False)
        
        if questions:
            all_questions.extend(questions)
            print(f"Извлечено вопросов: {len(questions)}")
        else:
            print(f"Не удалось извлечь вопросы из {pdf_path.name}")
    
    if all_questions:
        parser.save_to_json(all_questions, output_json)
    else:
        print("Не удалось извлечь ни одного вопроса!")
    
    parser.close()
    return all_questions


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Извлечение вопросов из PDF и генерация ответов через нейросеть')
    parser.add_argument('--questions-folder', '-q', type=str, 
                        default="uploads/questions",
                        help='Папка с PDF файлами вопросов')
    parser.add_argument('--output', '-o', type=str, default='questions_with_answers.json',
                        help='Выходной JSON файл')
    parser.add_argument('--no-lectures', action='store_true',
                        help='Работать без лекций')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("ГЕНЕРАЦИЯ ВОПРОСОВ И ОТВЕТОВ С ИСПОЛЬЗОВАНИЕМ НЕЙРОСЕТИ")
    print("=" * 60)
    
    group_id = None
    if not args.no_lectures:
        print("\nРабота с лекциями")
    else:
        print("\nРабота без лекций")
    
    questions_folder = Path(args.questions_folder)
    
    if not questions_folder.exists():
        print(f"Папка с вопросами не найдена: {questions_folder}")
        questions_folder.mkdir(parents=True, exist_ok=True)
        print(f"Создана папка: {questions_folder}")
        print(f"Поместите PDF файлы с вопросами в эту папку и запустите скрипт снова")
        return
    
    questions = process_questions_from_folder(
        str(questions_folder), 
        group_id, 
        args.output
    )
    
    if not questions:
        print("Не удалось извлечь вопросы. Проверьте формат PDF файлов.")
        return
    
    print("\n" + "=" * 60)
    print("ГОТОВО!")
    print("=" * 60)
    print(f"\nСтатистика:")
    print(f"Сгенерировано вопросов: {len(questions)}")
    print(f"Результат сохранен в: {args.output}")


if __name__ == "__main__":
    main()