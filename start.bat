@echo off
echo Starting Exam System...

call venv\Scripts\activate

start "" "c:\Users\artyo\AppData\Local\Programs\Ollama\ollama.exe"

timeout /t 3 /nobreak > nul

cd backend
python ru
pause