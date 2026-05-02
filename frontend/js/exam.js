const API_BASE_URL = 'http://localhost:8000/api';

let examSession = null;
let questions = [];
let questionIds = [];
let answers = [];
let totalTimeLeft = 0;
let timerInterval = null;
let examFinished = false;
let autoSubmitTriggered = false;

const timerDisplay = document.getElementById('timerDisplay');
const finishExamBtn = document.getElementById('finishExamBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const studentInfo = document.getElementById('studentInfo');
const questionsContainer = document.getElementById('questionsContainer');

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
    
    if (finishExamBtn) {
        finishExamBtn.addEventListener('click', finishExam);
    }
});

async function loadExam() {
    try {
        questionsContainer.innerHTML = '<div class="loading-spinner"></div><p>Загрузка вопросов...</p>';
        
        // Правильный вызов API - session_id в URL
        const response = await fetch(`${API_BASE_URL}/exam/start?session_id=${examSession.sessionId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        
        // Проверяем структуру ответа
        console.log('Ответ от сервера:', data);
        
        if (data.questions && Array.isArray(data.questions)) {
            questions = data.questions;
            questionIds = data.question_ids || [];
        } else {
            throw new Error('Неверный формат ответа от сервера');
        }
        
        if (questions.length === 0) {
            throw new Error('Нет вопросов для этого экзамена');
        }
        
        answers = new Array(questions.length).fill('');
        
        // Загружаем сохраненные ответы
        loadSavedAnswers();
        
        // Рассчитываем время
        const timePerQuestion = 60; // 60 секунд на вопрос
        const totalSeconds = questions.length * timePerQuestion;
        totalTimeLeft = totalSeconds;
        
        updateTimerDisplay();
        renderAllQuestions();
        startTimer();
        
        console.log(`Загружено ${questions.length} вопросов`);
        
    } catch (error) {
        console.error('Ошибка:', error);
        questionsContainer.innerHTML = `<p class="error-message">Ошибка загрузки вопросов: ${error.message}<br>Проверьте, запущен ли сервер на порту 8000</p>`;
    }
}

function loadSavedAnswers() {
    for (let i = 0; i < questions.length; i++) {
        const saved = localStorage.getItem(`exam_answer_${examSession.sessionId}_${questionIds[i] || i}`);
        if (saved) {
            answers[i] = saved;
        }
    }
}

function renderAllQuestions() {
    questionsContainer.innerHTML = '';
    
    questions.forEach((question, index) => {
        const questionBlock = document.createElement('div');
        questionBlock.className = 'question-block';
        questionBlock.setAttribute('data-question-id', questionIds[index] || index);
        
        // Получаем текст вопроса (поддерживаем разные форматы)
        const questionText = question.text || question.question_text || `Вопрос ${index + 1}`;
        const isAnswered = answers[index] && answers[index].trim();
        
        questionBlock.innerHTML = `
            <div class="question-header">
                <div class="question-number">Вопрос ${index + 1} из ${questions.length}</div>
                <div class="question-status ${isAnswered ? 'answered' : 'not-answered'}">
                    ${isAnswered ? '✓ Отвечен' : '○ Не отвечен'}
                </div>
            </div>
            <div class="question-text">${escapeHtml(questionText)}</div>
            <div class="answer-area">
                <div class="answer-label">Ваш ответ:</div>
                <textarea 
                    id="answer-${index}" 
                    class="answer-textarea" 
                    placeholder="Введите ответ здесь..."
                    data-index="${index}"
                    ${examFinished ? 'disabled' : ''}
                >${escapeHtml(answers[index] || '')}</textarea>
                <div class="voice-control">
                    <button type="button" class="voice-btn-small" data-index="${index}" ${examFinished ? 'disabled' : ''}>
                        🎙️ Голосовой ввод
                    </button>
                </div>
            </div>
        `;
        
        questionsContainer.appendChild(questionBlock);
        
        if (!examFinished) {
            const textarea = questionBlock.querySelector(`#answer-${index}`);
            textarea.addEventListener('input', (e) => {
                saveAnswer(index, e.target.value);
            });
            
            const voiceBtn = questionBlock.querySelector('.voice-btn-small');
            voiceBtn.addEventListener('click', () => {
                startVoiceInputForQuestion(index);
            });
        }
    });
    
    updateProgress();
}

function saveAnswer(questionIndex, value) {
    if (examFinished) return;
    
    answers[questionIndex] = value;
    const qid = questionIds[questionIndex] || questionIndex;
    localStorage.setItem(`exam_answer_${examSession.sessionId}_${qid}`, value);
    
    const statusEl = document.querySelector(`.question-block[data-question-id="${qid}"] .question-status`);
    if (statusEl) {
        if (value && value.trim()) {
            statusEl.innerHTML = '✓ Отвечен';
            statusEl.className = 'question-status answered';
        } else {
            statusEl.innerHTML = '○ Не отвечен';
            statusEl.className = 'question-status not-answered';
        }
    }
    
    updateProgress();
}

function updateProgress() {
    const answeredCount = answers.filter(a => a && a.trim()).length;
    const percent = (answeredCount / questions.length) * 100;
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `Заполнено: ${answeredCount} из ${questions.length} вопросов`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        if (examFinished) return;
        
        if (totalTimeLeft > 0) {
            totalTimeLeft--;
            updateTimerDisplay();
            
            if (totalTimeLeft === 60) {
                showWarning('⚠️ Осталась 1 минута!');
            }
            if (totalTimeLeft === 30) {
                showWarning('⚠️ Осталось 30 секунд!');
            }
            if (totalTimeLeft === 10) {
                showWarning('🔔 Осталось 10 секунд!');
            }
            if (totalTimeLeft === 5) {
                showWarning('⏰ Осталось 5 секунд!');
            }
            
            if (totalTimeLeft <= 0) {
                clearInterval(timerInterval);
                timerDisplay.textContent = "00:00";
                showWarning('⏰ ВРЕМЯ ВЫШЛО! Экзамен автоматически завершается...');
                
                if (!autoSubmitTriggered && !examFinished) {
                    autoSubmitTriggered = true;
                    setTimeout(() => autoSubmitExam(), 1500);
                }
            }
        }
    }, 1000);
}

function showWarning(message, isPermanent = false) {
    const warning = document.createElement('div');
    warning.className = 'warning-message';
    warning.style.position = 'fixed';
    warning.style.top = '20px';
    warning.style.right = '20px';
    warning.style.zIndex = '1000';
    warning.style.background = '#ff9800';
    warning.style.color = 'white';
    warning.style.padding = '12px 20px';
    warning.style.borderRadius = '12px';
    warning.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    warning.innerHTML = `
        <span>⚠️</span>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:white;margin-left:10px;cursor:pointer;">✖</button>
    `;
    document.body.appendChild(warning);
    
    if (!isPermanent) {
        setTimeout(() => {
            if (warning.parentElement) warning.remove();
        }, 4000);
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(totalTimeLeft / 60);
    const seconds = totalTimeLeft % 60;
    const displayText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    timerDisplay.textContent = displayText;
    
    if (totalTimeLeft <= 60) {
        timerDisplay.style.color = '#ff4444';
        timerDisplay.style.animation = 'pulse 0.5s infinite';
    } else {
        timerDisplay.style.color = '#1e2f4e';
        timerDisplay.style.animation = 'none';
    }
}

function lockExamInterface() {
    examFinished = true;
    
    document.querySelectorAll('.answer-textarea').forEach(textarea => {
        textarea.disabled = true;
        textarea.style.background = '#f0f0f0';
    });
    
    document.querySelectorAll('.voice-btn-small').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });
    
    if (finishExamBtn) {
        finishExamBtn.disabled = true;
        finishExamBtn.style.opacity = '0.5';
    }
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

async function finishExam() {
    if (examFinished) return;
    
    document.querySelectorAll('.answer-textarea').forEach(textarea => {
        const index = parseInt(textarea.getAttribute('data-index'));
        answers[index] = textarea.value;
    });
    
    const emptyAnswers = answers.filter(a => !a || a.trim() === '').length;
    if (emptyAnswers > 0) {
        const confirmSubmit = confirm(`Вы не ответили на ${emptyAnswers} из ${questions.length} вопросов. Отправить экзамен на проверку?`);
        if (!confirmSubmit) return;
    }
    
    lockExamInterface();
    finishExamBtn.textContent = 'Отправка...';
    showLoadingIndicator();
    
    try {
        const response = await fetch(`${API_BASE_URL}/exam/submit?session_id=${examSession.sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                answers: answers,
                question_ids: questionIds
            })
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка ${response.status}`);
        }
        
        const results = await response.json();
        hideLoadingIndicator();
        showResults(results);
        
    } catch (error) {
        console.error('Ошибка:', error);
        alert(`Ошибка при отправке: ${error.message}`);
        finishExamBtn.disabled = false;
        finishExamBtn.textContent = '✅ Завершить экзамен';
        hideLoadingIndicator();
        examFinished = false;
    }
}

async function autoSubmitExam() {
    if (examFinished || autoSubmitTriggered === false) return;
    
    console.log('⏰ Автоматическая отправка...');
    
    document.querySelectorAll('.answer-textarea').forEach(textarea => {
        const index = parseInt(textarea.getAttribute('data-index'));
        answers[index] = textarea.value;
    });
    
    lockExamInterface();
    showLoadingIndicator();
    
    try {
        const response = await fetch(`${API_BASE_URL}/exam/submit?session_id=${examSession.sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                answers: answers,
                question_ids: questionIds
            })
        });
        
        if (!response.ok) throw new Error(`Ошибка ${response.status}`);
        
        const results = await response.json();
        hideLoadingIndicator();
        showAutoSubmitResults(results);
        
    } catch (error) {
        console.error('Ошибка автоотправки:', error);
        hideLoadingIndicator();
        showWarning('❌ Ошибка при отправке. Пожалуйста, сообщите преподавателю.', true);
    }
}

function showAutoSubmitResults(results) {
    const answeredCount = answers.filter(a => a && a.trim()).length;
    
    let html = `
        <div class="results-container">
            <div class="auto-submit-banner" style="background: #ff9800; color: white; padding: 15px; border-radius: 12px; margin-bottom: 20px; text-align: center;">
                <span style="font-size: 24px;">⏰</span>
                <h3>Время экзамена истекло</h3>
                <p>Ответы были автоматически сохранены и отправлены на проверку</p>
                <small>Отвечено: ${answeredCount} из ${questions.length} вопросов</small>
            </div>
    `;
    html += getResultsHtml(results);
    document.querySelector('.exam-container').innerHTML = html;
}

function getResultsHtml(results) {
    return `
        <div class="total-score-badge">
            <div class="score-circle">
                <span class="score-value">${Math.round(results.total_score)}</span>
                <span class="score-max">/ 100</span>
            </div>
            <div class="grade-info">
                ${getGradeInfo(results.total_score)}
            </div>
        </div>
        
        <details class="detailed-results" open>
            <summary>📋 Подробные результаты (${questions.length} вопросов)</summary>
            <table class="results-table">
                <thead>
                    <tr>
                        <th>№</th>
                        <th>Вопрос</th>
                        <th>Оценка</th>
                        <th>Комментарий</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.results.map((result, idx) => {
                        const scoreClass = result.score >= 70 ? 'score-high' : (result.score >= 50 ? 'score-medium' : 'score-low');
                        const questionText = questions[idx]?.text || questions[idx]?.question_text || `Вопрос ${idx + 1}`;
                        return `
                            <tr>
                                <td>${idx + 1}</td>
                                <td class="question-cell">${escapeHtml(questionText.substring(0, 80))}${questionText.length > 80 ? '…' : ''}</td>
                                <td class="${scoreClass}"><strong>${Math.round(result.score)}</strong> / 100</td>
                                <td class="comment-cell">${escapeHtml(result.comment || 'Проверено')}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </details>
        
        <div class="results-actions">
            <button class="btn btn-primary" onclick="clearStorageAndExit()">🏠 Завершить сессию</button>
            <button class="btn btn-secondary" onclick="window.print()">🖨️ Печать результатов</button>
        </div>
    `;
}

function showResults(results) {
    const html = `
        <div class="results-container">
            <h2>📊 Результаты экзамена</h2>
            ${getResultsHtml(results)}
        </div>
    `;
    document.querySelector('.exam-container').innerHTML = html;
    
    questionIds.forEach((qid, i) => {
        localStorage.removeItem(`exam_answer_${examSession.sessionId}_${qid || i}`);
    });
}

function clearStorageAndExit() {
    localStorage.removeItem('examSession');
    window.location.href = '/';
}

function getGradeInfo(score) {
    if (score >= 90) return '<span class="grade-excellent">🎉 Отлично!</span>';
    if (score >= 75) return '<span class="grade-good">👍 Хорошо!</span>';
    if (score >= 60) return '<span class="grade-satisfactory">📚 Удовлетворительно</span>';
    if (score >= 40) return '<span class="grade-poor">📖 Требуется доработка</span>';
    return '<span class="grade-fail">⚠️ Неудовлетворительно</span>';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('Голосовой ввод не поддерживается');
    }
}

function startVoiceInputForQuestion(questionIndex) {
    if (examFinished) {
        alert('Экзамен уже завершен');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Голосовой ввод не поддерживается');
        return;
    }
    
    const textarea = document.getElementById(`answer-${questionIndex}`);
    const voiceBtn = document.querySelector(`.voice-btn-small[data-index="${questionIndex}"]`);
    
    if (!textarea || textarea.disabled) return;
    
    voiceBtn.innerHTML = '🎤 Слушаю...';
    voiceBtn.disabled = true;
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const currentText = textarea.value;
        const newText = currentText + (currentText ? ' ' : '') + transcript;
        textarea.value = newText;
        saveAnswer(questionIndex, newText);
        voiceBtn.innerHTML = '✅ Готово';
        setTimeout(() => {
            voiceBtn.innerHTML = '🎙️ Голосовой ввод';
            voiceBtn.disabled = false;
        }, 2000);
    };
    
    recognition.onerror = () => {
        voiceBtn.innerHTML = '❌ Ошибка';
        setTimeout(() => {
            voiceBtn.innerHTML = '🎙️ Голосовой ввод';
            voiceBtn.disabled = false;
        }, 2000);
    };
    
    recognition.start();
}

function showLoadingIndicator() {
    const loader = document.createElement('div');
    loader.id = 'examLoader';
    loader.className = 'exam-loader';
    loader.innerHTML = `
        <div class="loader-overlay">
            <div class="loader-content">
                <div class="loader-spinner"></div>
                <p>📤 Отправка ответов...</p>
            </div>
        </div>
    `;
    document.body.appendChild(loader);
}

function hideLoadingIndicator() {
    const loader = document.getElementById('examLoader');
    if (loader) loader.remove();
}