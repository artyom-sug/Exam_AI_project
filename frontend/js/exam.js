const API_BASE_URL = 'http://localhost:8000/api';

let examSession = null;
let questions = [];
let currentQuestionIndex = 0;
let answers = [];
let timeLeft = 0;
let timerInterval = null;
let recognition = null;

const timerDisplay = document.getElementById('timerDisplay');
const questionTextEl = document.getElementById('questionText');
const answerInput = document.getElementById('answerInput');
const voiceBtn = document.getElementById('voiceBtn');
const voiceStatus = document.getElementById('voiceStatus');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const finishEarlyBtn = document.getElementById('finishEarlyBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const studentInfo = document.getElementById('studentInfo');

document.addEventListener('DOMContentLoaded', async () => {
    const sessionStr = localStorage.getItem('examSession');
    if (!sessionStr) {
        alert('Сессия не найдена. Пожалуйста, войдите заново.');
        window.location.href = '/';
        return;
    }
    
    examSession = JSON.parse(sessionStr);
    studentInfo.textContent = `${examSession.fio}`;
    
    await loadExam();
    
    initSpeechRecognition();
    
    nextBtn.addEventListener('click', nextQuestion);
    prevBtn.addEventListener('click', prevQuestion);
    finishEarlyBtn.addEventListener('click', finishExam);
    voiceBtn.addEventListener('click', startVoiceInput);
});

async function loadExam() {
    try {
        questionTextEl.innerHTML = '<div class="loading-spinner"></div>Генерация вопросов...';
        
        const response = await fetch(`${API_BASE_URL}/exam/start?session_id=${examSession.sessionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки вопросов');
        }
        
        const data = await response.json();
        questions = data.questions;
        questionIds = data.question_ids;  // НОВОЕ: сохраняем ID
        answers = new Array(questions.length).fill('');
        
        showQuestion(0);
        
    } catch (error) {
        console.error('Ошибка:', error);
        questionTextEl.innerHTML = 'Ошибка загрузки вопросов. Пожалуйста, обновите страницу.';
    }
}

function showQuestion(index) {
    if (timerInterval) clearInterval(timerInterval);
    
    currentQuestionIndex = index;
    const question = questions[index];
    
    questionTextEl.innerHTML = `<strong>Вопрос ${index + 1}:</strong><br><br>${question.text}`;
    
    answerInput.value = answers[index] || '';
    
    timeLeft = question.time_limit || 30;
    updateTimerDisplay();
    startTimer();
    
    const progress = ((index + 1) / questions.length) * 100;
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `Вопрос ${index + 1} из ${questions.length}`;
    
    prevBtn.style.display = index > 0 ? 'inline-block' : 'none';
    if (index === questions.length - 1) {
        nextBtn.textContent = 'Завершить экзамен';
        finishEarlyBtn.style.display = 'inline-block';
    } else {
        nextBtn.textContent = 'Следующий вопрос →';
        finishEarlyBtn.style.display = 'none';
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timerDisplay.textContent = "00:00";
        alert('Время вышло! Переходим к следующему вопросу.');
        nextQuestion();
    }
}

function startTimer() {
    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft--;
            updateTimerDisplay();
        } else {
            clearInterval(timerInterval);
        }
    }, 1000);
}

function saveCurrentAnswer() {
    answers[currentQuestionIndex] = answerInput.value.trim();
}

function nextQuestion() {
    saveCurrentAnswer();
    
    if (!answers[currentQuestionIndex]) {
        if (!confirm('Вы не ввели ответ. Пропустить вопрос?')) {
            return;
        }
    }
    
    if (currentQuestionIndex + 1 < questions.length) {
        showQuestion(currentQuestionIndex + 1);
    } else {
        submitExam();
    }
}

function prevQuestion() {
    saveCurrentAnswer();
    if (currentQuestionIndex > 0) {
        showQuestion(currentQuestionIndex - 1);
    }
}

async function submitExam() {
    saveCurrentAnswer();
    
    const emptyAnswers = answers.filter(a => !a).length;
    if (emptyAnswers > 0) {
        if (!confirm(`Вы не ответили на ${emptyAnswers} вопросов. Отправить экзамен?`)) {
            return;
        }
    }
    
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    finishEarlyBtn.disabled = true;
    answerInput.disabled = true;
    voiceBtn.disabled = true;
    
    nextBtn.textContent = 'Проверка...';
    
    try {
        const response = await fetch(`${API_BASE_URL}/exam/submit?session_id=${examSession.sessionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ answers: answers })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка при проверке экзамена');
        }
        
        const results = await response.json();
        showResults(results);
        
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при отправке экзамена. Пожалуйста, попробуйте еще раз.');
        nextBtn.disabled = false;
        answerInput.disabled = false;
        voiceBtn.disabled = false;
        nextBtn.textContent = 'Завершить экзамен';
    }
}

function showResults(results) {
    clearInterval(timerInterval);
    
    let html = `
        <div class="results-container">
            <h2>Результаты экзамена</h2>
            <table class="results-table">
                <thead>
                    <tr>
                        <th>№</th>
                        <th>Вопрос</th>
                        <th>Ваш ответ</th>
                        <th>Оценка</th>
                        <th>Комментарий</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    results.results.forEach((result, idx) => {
        html += `
            <tr>
                <td>${idx + 1}</td>
                <td>${questions[idx]?.text.substring(0, 80) || '...'}${questions[idx]?.text.length > 80 ? '…' : ''}</td>
                <td>${result.answer.substring(0, 100)}${result.answer.length > 100 ? '…' : ''}</td>
                <td><strong>${result.score}</strong> / 100</td>
                <td>${result.comment}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            <div class="total-score">
                Общий балл: ${Math.round(results.total_score)} / 100
            </div>
            <div style="text-align: center; margin-top: 30px;">
                <button class="btn btn-primary" onclick="window.location.href='/'">Завершить</button>
            </div>
        </div>
    `;
    
    document.querySelector('.exam-container').innerHTML = html;
}

function finishExam() {
    if (confirm('Вы уверены, что хотите завершить экзамен досрочно? Ответы будут отправлены на проверку.')) {
        submitExam();
    }
}

function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        voiceStatus.textContent = "Голосовой ввод не поддерживается";
        voiceBtn.disabled = true;
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => {
        voiceStatus.textContent = "Слушаю... Говорите";
        voiceBtn.style.background = "#d5ceeb";
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const currentText = answerInput.value;
        answerInput.value = currentText + (currentText ? " " : "") + transcript;
        voiceStatus.textContent = "Готово";
        setTimeout(() => {
            if (voiceStatus.textContent === "Готово") {
                voiceStatus.textContent = "";
            }
        }, 2000);
    };
    
    recognition.onerror = (event) => {
        console.error('Ошибка:', event.error);
        voiceStatus.textContent = `Ошибка: ${event.error}`;
        setTimeout(() => {
            if (voiceStatus.textContent.includes("Ошибка")) {
                voiceStatus.textContent = "";
            }
        }, 3000);
    };
    
    recognition.onend = () => {
        voiceBtn.style.background = "";
        if (voiceStatus.textContent === "Слушаю... Говорите") {
            voiceStatus.textContent = "";
        }
    };
}

function startVoiceInput() {
    if (!recognition) {
        voiceStatus.textContent = "Инициализация...";
        initSpeechRecognition();
        setTimeout(() => {
            if (recognition) recognition.start();
        }, 100);
        return;
    }
    
    try {
        recognition.start();
    } catch (e) {
        console.error("Ошибка:", e);
        voiceStatus.textContent = "Микрофон недоступен";
    }
}