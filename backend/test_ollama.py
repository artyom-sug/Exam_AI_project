from app.llm_service import llm_service
from app.embeddings_service import embeddings_service

def test_generate_questions():
    context = """
    Python - это высокоуровневый язык программирования общего назначения.
    Он поддерживает объектно-ориентированное, функциональное и процедурное программирование.
    Основные особенности: динамическая типизация, автоматическое управление памятью,
    обширная стандартная библиотека.
    """
    
    print("Генерация вопросов...")
    questions = llm_service.generate_questions(context, 3)
    for i, q in enumerate(questions, 1):
        print(f"{i}. {q}")
    print()

def test_evaluate_answer():
    question = "Что такое Python?"
    answer = "Python - это язык программирования, который используется для разработки"
    print("Оценка ответа...")
    result = llm_service.evaluate_answer(question, answer)
    print(f"Оценка: {result['score']}")
    print(f"Комментарий: {result['comment']}")
    print()

def test_embeddings():
    print("Тест эмбеддингов...")
    text = "Машинное обучение - это подполе искусственного интеллекта"
    embedding = embeddings_service.get_embedding(text)
    print(f"Размер эмбеддинга: {len(embedding)}")
    print(f"Первые 5 значений: {embedding[:5]}")
    print()

if __name__ == "__main__":
    print("=" * 50)
    print("Тестирование AI сервисов")
    print("=" * 50)
    
    test_generate_questions()
    test_evaluate_answer()
    test_embeddings()
    
    print("Тесты завершены")