активировать виртуальное окружение:
venv\Scripts\activate
source /Users/novikovamaria/Desktop/Exam_AI_project/venv/bin/activate

залить на гит:
    в первый раз:
    git init
    git remote add origin https://github.com/artyom-sug/Exam_AI_project.git
git add -A
git commit -m "..."
git push (в первый раз: git push -u origin main)
    
получить последние изменения:
git pull (в первый раз: git pull origin main)


# 1. Активация окружения
cd C:\Users\artyo\OneDrive\Документы\Exam_AI_project
venv\Scripts\activate

# 2. Инициализация БД
cd backend
python init_db.py

# 3. Загрузка лекций (если есть PDF в uploads/lectures)
python load_lectures.py

# 4. Парсинг вопросов (БЕЗ генерации ответов через Ollama)
python parse_questions_begin.py

# 5. Загрузка вопросов в БД
python load_questions.py --json questions_parsed.json

# 6. Запуск сервера
python run.py