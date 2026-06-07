# Exam AI Project

Система проведения экзаменов с ИИ-проверкой ответов. Backend на FastAPI, frontend — статический HTML/JS. Для оценки ответов используется Ollama, для голосового ввода — faster-whisper, для поиска по лекциям — эмбеддинги LaBSE.

---

## Установка

### Windows

#### 1. Git

Скачайте и установите с [git-scm.com](https://git-scm.com/download/win).

Проверка:
```powershell
git --version
```

#### 2. Python 3.12

Скачайте с [python.org](https://www.python.org/downloads/). При установке отметьте **Add Python to PATH**.

Проверка:
```powershell
python --version
```

#### 3. Ollama

Скачайте с [ollama.com](https://ollama.com/download) и установите.

Запустите Ollama, затем скачайте модель:
```powershell
ollama pull qwen2.5:3b
```

Проверка:
```powershell
ollama list
```

#### 4. FFmpeg

Через [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/):
```powershell
winget install Gyan.FFmpeg
```

Или скачайте сборку с [ffmpeg.org](https://ffmpeg.org/download.html) и добавьте папку `bin` в PATH.

Проверка:
```powershell
ffmpeg -version
```

#### 5. Клонирование и зависимости

```powershell
git clone https://github.com/artyom-sug/Exam_AI_project.git
cd Exam_AI_project

python -m venv venv
venv\Scripts\activate

cd backend
pip install -r requirements.txt
```

---

### macOS

#### 1. Git

```bash
xcode-select --install
# или через Homebrew:
brew install git
```

Проверка:
```bash
git --version
```

#### 2. Python 3.12

```bash
brew install python@3.12
```

Проверка:
```bash
python3.12 --version
```

#### 3. Ollama

Скачайте с [ollama.com](https://ollama.com/download) или установите через Homebrew:
```bash
brew install ollama
brew services start ollama
```

Скачайте модель:
```bash
ollama pull qwen2.5:3b
```

Проверка:
```bash
ollama list
```

#### 4. FFmpeg

```bash
brew install ffmpeg
```

Проверка:
```bash
ffmpeg -version
```

#### 5. Клонирование и зависимости

```bash
git clone https://github.com/artyom-sug/Exam_AI_project.git
cd Exam_AI_project

python3.12 -m venv venv
source venv/bin/activate

cd backend
pip install -r requirements.txt
```

---

## Первый запуск

Все команды ниже выполняются из папки `backend` с активированным виртуальным окружением.

### 1. Инициализация базы данных

```bash
python init_db.py
```

Создаёт тестовые учётные данные:
- Преподаватель: `mr.dyadichev` / `test123`
- Ключ доступа студента: `ПМИ-241`

### 2. Загрузка лекций (опционально)

Положите PDF-файлы в `backend/uploads/lectures/`, затем:

```bash
python load_lectures.py
```

### 3. Парсинг и загрузка вопросов

Парсинг вопросов из PDF (без генерации ответов через Ollama):
```bash
python parse_questions_begin.py
```

Загрузка вопросов в базу:
```bash
python load_questions.py --json questions_parsed.json
```

Альтернатива — парсинг с генерацией ответов через Ollama (дольше):
```bash
python parse_questions_from_pdf.py
python load_questions.py --json questions_with_answers.json
```

### 4. Запуск сервера

**Windows:**
```powershell
venv\Scripts\activate
cd backend
python run.py
```

**macOS:**
```bash
source venv/bin/activate
cd backend
python run.py
```

Откройте в браузере: [http://127.0.0.1:8000](http://127.0.0.1:8000)

API-документация: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

> Перед запуском убедитесь, что Ollama работает (`ollama serve` или через приложение).

---

## Работа с Git

### Первый раз (новый репозиторий)

```bash
git init
git remote add origin https://github.com/artyom-sug/Exam_AI_project.git
git add -A
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

### Отправка изменений

```bash
git add -A
git commit -m "Описание изменений"
git push
```

### Получение последних изменений

```bash
git pull
```

При первом клонировании:
```bash
git clone https://github.com/artyom-sug/Exam_AI_project.git
```

---
