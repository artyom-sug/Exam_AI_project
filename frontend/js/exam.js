const API_BASE_URL = 'http://localhost:8000/api';

let examSession = null;
let questions = [];
let questionIds = [];
let answers = {};
let totalTimeLeft = 0;
let timerInterval = null;
let examFinished = false;
let autoSubmitTriggered = false;
let mediaRecorder = null;
let audioChunks = [];
let activeRecordingIndex = null;

const timerDisplay = document.getElementById('timerDisplay');
const finishExamBtn = document.getElementById('finishExamBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const studentInfo = document.getElementById('studentInfo');
const questionsContainer = document.getElementById('questionsContainer');

function saveExamSessionState() {
    if (!examSession) return;
    
    const state = {
        sessionId: examSession.sessionId,
        groupId: examSession.groupId,
        fio: examSession.fio,
        answers: answers,
        questionIds: questionIds,
        totalTimeLeft: totalTimeLeft,
        lastUpdate: Date.now()
    };
    localStorage.setItem('exam_session_state', JSON.stringify(state));
}

function restoreExamSessionState() {
    const savedState = localStorage.getItem('exam_session_state');
    if (!savedState) return false;
    
    try {
        const state = JSON.parse(savedState);
        const currentSessionId = examSession?.sessionId;
        const isRecent = (Date.now() - state.lastUpdate) < 24 * 60 * 60 * 1000;
        
        if (currentSessionId === state.sessionId && isRecent) {
            questionIds = state.questionIds || [];
            if (Array.isArray(state.answers)) {
                const migrated = {};
                state.answers.forEach((val, idx) => {
                    const qid = questionIds[idx] || `temp_${idx}`;
                    if (val) migrated[qid] = val;
                });
                answers = migrated;
            } else {
                answers = state.answers || {};
            }
            totalTimeLeft = state.totalTimeLeft || 0;
            return true;
        }
    } catch (e) {
        console.error('Error restoring state:', e);
    }
    return false;
}

function clearExamSessionState() {
    localStorage.removeItem('exam_session_state');
    localStorage.removeItem(`exam_time_left_${examSession?.sessionId}`);
    sessionStorage.removeItem(`exam_questions_${examSession?.sessionId}`);
}

let autoSaveInterval = null;

function startAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    
    autoSaveInterval = setInterval(() => {
        if (!examFinished && examSession && questions.length > 0) {
            saveExamSessionState();
            localStorage.setItem(`exam_time_left_${examSession.sessionId}`, totalTimeLeft.toString());
        }
    }, 10000);
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const hasResultsContainer = document.querySelector('.results-container');
    if (hasResultsContainer) {
        return;
    }
    
    const sessionStr = localStorage.getItem('examSession');
    const savedState = localStorage.getItem('exam_session_state');
    
    if (sessionStr) {
        try {
            const session = JSON.parse(sessionStr);
            const isCompleted = sessionStorage.getItem('exam_completed_' + session.sessionId);
            if (isCompleted === 'true') {
                window.location.href = '/';
                return;
            }
        } catch(e) {}
    }
    
    if (!sessionStr && savedState) {
        try {
            const state = JSON.parse(savedState);
            const isRecent = (Date.now() - state.lastUpdate) < 24 * 60 * 60 * 1000;
            const isCompleted = sessionStorage.getItem('exam_completed_' + state.sessionId);
            
            if (isCompleted === 'true') {
                localStorage.removeItem('exam_session_state');
                sessionStorage.removeItem('exam_completed_' + state.sessionId);
                window.location.href = '/';
                return;
            }
            
            if (isRecent) {
                examSession = {
                    sessionId: state.sessionId,
                    groupId: state.groupId,
                    fio: state.fio
                };
                localStorage.setItem('examSession', JSON.stringify(examSession));
            }
        } catch (e) {
            console.error('Error restoring session:', e);
        }
    }
    
    if (!examSession) {
        const newSessionStr = localStorage.getItem('examSession');
        if (!newSessionStr) {
            window.location.href = '/';
            return;
        }
        examSession = JSON.parse(newSessionStr);
    }
    
    const isCompleted = sessionStorage.getItem('exam_completed_' + examSession.sessionId);
    if (isCompleted === 'true') {
        window.location.href = '/';
        return;
    }
    
    studentInfo.textContent = `${examSession.fio}`;
    await loadExam();
    initSpeechRecognition();
    
    if (finishExamBtn) {
        finishExamBtn.addEventListener('click', finishExam);
    }
});

async function loadExam() {
    if (sessionStorage.getItem('exam_completed_' + examSession?.sessionId) === 'true') {
        window.location.href = '/';
        return;
    }
    
    try {
        questionsContainer.innerHTML = '<div class="loading-spinner"></div><p>Загрузка вопросов...</p>';
        
        const cachedQuestions = sessionStorage.getItem(`exam_questions_${examSession.sessionId}`);
        
        let data;
        
        if (cachedQuestions) {
            data = JSON.parse(cachedQuestions);
        } else {
            const response = await fetch(`${API_BASE_URL}/exam/start?session_id=${examSession.sessionId}`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ошибка ${response.status}: ${errorText}`);
            }
            
            data = await response.json();
            sessionStorage.setItem(`exam_questions_${examSession.sessionId}`, JSON.stringify(data));
        }
        
        if (data.questions && Array.isArray(data.questions)) {
            questions = data.questions;
            questionIds = data.question_ids || [];
        } else {
            throw new Error('Неверный формат ответа от сервера');
        }
        
        if (questions.length === 0) {
            throw new Error('Нет вопросов для этого экзамена');
        }
        
        answers = {};
        
        const restored = restoreExamSessionState();
        
        if (!restored) {
            restoreAnswers();
            loadSavedAnswers();
            
            const savedTimeLeft = localStorage.getItem(`exam_time_left_${examSession.sessionId}`);
            const totalSeconds = data.exam_duration_seconds || 5400;
            
            if (savedTimeLeft) {
                const timeLeft = parseInt(savedTimeLeft);
                totalTimeLeft = (timeLeft > 0 && timeLeft <= totalSeconds) ? timeLeft : totalSeconds;
            } else {
                totalTimeLeft = totalSeconds;
            }
        }
        
        updateTimerDisplay();
        renderAllQuestions();
        startTimer();
        startAutoSave();

    } catch (error) {
        console.error('Ошибка:', error);
        questionsContainer.innerHTML = `<p class="error-message">Ошибка загрузки вопросов: ${error.message}<br>Проверьте, запущен ли сервер на порту 8000</p>`;
    }
}

function getQuestionKey(index) {
    return questionIds[index] || `temp_${index}`;
}

function syncAnswersFromTextareas() {
    document.querySelectorAll('.answer-textarea').forEach(textarea => {
        const index = parseInt(textarea.getAttribute('data-index'), 10);
        if (Number.isNaN(index)) return;
        answers[getQuestionKey(index)] = textarea.value;
    });
}

function countEmptyAnswers() {
    let count = 0;
    for (let i = 0; i < questions.length; i++) {
        const answer = answers[getQuestionKey(i)];
        if (!answer || !answer.trim()) count++;
    }
    return count;
}

function countAnswered() {
    return questions.length - countEmptyAnswers();
}

function buildAnswersArray() {
    const answersArray = [];
    for (let i = 0; i < questions.length; i++) {
        answersArray.push(answers[getQuestionKey(i)] || '');
    }
    return answersArray;
}

function restoreAnswers() {
    answers = {};
    for (let i = 0; i < questions.length; i++) {
        const qid = getQuestionKey(i);
        const savedAnswer = localStorage.getItem(`exam_answer_${examSession.sessionId}_${qid}`);
        if (savedAnswer) {
            answers[qid] = savedAnswer;
        }
    }
}

function loadSavedAnswers() {
    for (let i = 0; i < questions.length; i++) {
        const qid = getQuestionKey(i);
        const saved = localStorage.getItem(`exam_answer_${examSession.sessionId}_${qid}`);
        if (saved) {
            answers[qid] = saved;
        }
    }
}

function renderAllQuestions() {
    if (!questionsContainer) {
        console.error('questionsContainer not found');
        return;
    }

    if (questionsContainer) {
        questionsContainer.innerHTML = '';
    }

    for (let index = 0; index < questions.length; index++) {
        const question = questions[index];
        const questionId = questionIds[index] || `temp_${index}`;   
        const questionBlock = document.createElement('div');
        questionBlock.className = 'question-block';

        const questionText = question.text || question.question_text || `Вопрос ${index + 1}`;
        const savedAnswer = answers[questionId] || '';

        questionBlock.innerHTML = `
            <div class="question-header">
                <div class="question-number">Вопрос ${index + 1} из ${questions.length}</div>
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
                >${escapeHtml(savedAnswer)}</textarea>
                <div class="voice-control">
                    <button type="button" class="voice-btn-small" data-index="${index}" ${examFinished ? 'disabled' : ''}>
                        🎙️ Голосовой ввод
                    </button>
                </div>
            </div>
        `;

        questionsContainer.appendChild(questionBlock);

        if (!examFinished) {
            const textarea = document.getElementById(`answer-${index}`);
            const voiceBtn = questionBlock.querySelector(`.voice-btn-small[data-index="${index}"]`);
            const stopBtn = questionBlock.querySelector(`.voice-stop-btn-small[data-index="${index}"]`);

            if (textarea) {
                textarea.addEventListener('input', (e) => {
                    saveAnswer(questionId, e.target.value);
                });
            }

            if (voiceBtn) {
                voiceBtn.addEventListener('click', () => {
                    startVoiceInputForQuestion(index);
                });
            }

            if (stopBtn) {
                stopBtn.addEventListener('click', () => {
                    stopVoiceInputForQuestion(index);
                });
            }
        }
    }

    updateProgress();
}


function saveAnswer(questionId, value) {
    if (examFinished) return;
    
    answers[questionId] = value;
    localStorage.setItem(`exam_answer_${examSession.sessionId}_${questionId}`, value);
    saveExamSessionState();
    updateProgress();
}

function updateProgress() {
    let answeredCount = 0;
    for (let i = 0; i < questions.length; i++) {
        const qid = questionIds[i] || `temp_${i}`;
        const answer = answers[qid];
        if (answer && answer.trim()) {
            answeredCount++;
        }
    }
    
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
                showWarning('⏰ Осталась 1 минута!');
            }

            if (totalTimeLeft === 10) {
                showWarning('⏰ Осталось 10 секунд!');
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

    if (examSession && !examFinished) {
        localStorage.setItem(`exam_time_left_${examSession.sessionId}`, totalTimeLeft.toString());
    }
    
    if (totalTimeLeft <= 60) {
        timerDisplay.style.color = '#ff4444';
        timerDisplay.style.animation = 'pulse 0.5s infinite';
    } else {
        timerDisplay.style.color = '#1e2f4e';
        timerDisplay.style.animation = 'none';
    }
}

async function startVoiceInputForQuestion(questionIndex) {
    if (examFinished) {
        alert('Экзамен уже завершен');
        return;
    }

    if (activeRecordingIndex === questionIndex && mediaRecorder?.state === 'recording') {
        stopVoiceInputForQuestion(questionIndex);
        return;
    }

    if (mediaRecorder?.state === 'recording') {
        await new Promise((resolve) => {
            const originalOnStop = mediaRecorder.onstop;

            mediaRecorder.onstop = async () => {
                if (originalOnStop) {
                    await originalOnStop();
                }
                setTimeout(resolve, 300);
            };

            mediaRecorder.stop();
        });

        if (mediaRecorder && mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        mediaRecorder = null;
        audioChunks = [];

        if (activeRecordingIndex !== null) {
            const oldVoiceBtn = document.querySelector(`.voice-btn-small[data-index="${activeRecordingIndex}"]`);
            const oldStopBtn = document.querySelector(`.voice-stop-btn-small[data-index="${activeRecordingIndex}"]`);
            const oldTextarea = document.getElementById(`answer-${activeRecordingIndex}`);
            resetButtons(oldVoiceBtn, oldStopBtn, oldTextarea);
            if (oldVoiceBtn) oldVoiceBtn.innerHTML = '🎙️ Голосовой ввод';
        }

        activeRecordingIndex = null;
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    if (examFinished) {
        alert('Экзамен уже завершен');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
        });
        mediaRecorder.stream = stream;
        audioChunks = [];
        activeRecordingIndex = questionIndex;

        const textarea = document.getElementById(`answer-${questionIndex}`);
        const voiceBtn = document.querySelector(`.voice-btn-small[data-index="${questionIndex}"]`);
        const stopBtn = document.querySelector(`.voice-stop-btn-small[data-index="${questionIndex}"]`);

        if (voiceBtn) {
            voiceBtn.innerHTML = '⏹️ Остановить';
            voiceBtn.disabled = false;
        }
        if (stopBtn) {
            stopBtn.style.display = 'inline-block';
            stopBtn.disabled = false;
        }
        if (textarea) {
            textarea.style.border = '2px solid #87dbfd';
            textarea.style.backgroundColor = '#ffffff';
        }

        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const currentQuestionIndex = questionIndex;
            const currentTextarea = textarea;
            const currentVoiceBtn = voiceBtn;
            const currentStopBtn = stopBtn;

            if (audioChunks.length === 0) {
                console.warn('No audio chunks recorded');
                resetButtons(currentVoiceBtn, currentStopBtn, currentTextarea);
                if (currentVoiceBtn) currentVoiceBtn.innerHTML = '🎙️ Голосовой ввод';

                if (activeRecordingIndex === currentQuestionIndex) {
                    if (mediaRecorder && mediaRecorder.stream) {
                        mediaRecorder.stream.getTracks().forEach(track => track.stop());
                    }
                    mediaRecorder = null;
                    audioChunks = [];
                    activeRecordingIndex = null;
                }
                return;
            }

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

            if (currentVoiceBtn) {
                currentVoiceBtn.innerHTML = 'Распознавание...';
                currentVoiceBtn.disabled = true;
            }

            try {
                const formData = new FormData();
                formData.append('file', audioBlob, 'recording.webm');

                const response = await fetch(`${API_BASE_URL}/transcribe`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Ошибка распознавания');
                }

                const data = await response.json();
                const transcribedText = data.text;

                if (currentTextarea && transcribedText) {
                    const currentText = currentTextarea.value;
                    const newText = currentText + (currentText ? ' ' : '') + transcribedText;
                    currentTextarea.value = newText;
                    saveAnswer(getQuestionKey(currentQuestionIndex), newText);
                }

                if (currentVoiceBtn) {
                    currentVoiceBtn.innerHTML = '✅ Готово';
                    setTimeout(() => {
                        if (currentVoiceBtn) currentVoiceBtn.innerHTML = '🎙️ Голосовой ввод';
                    }, 2000);
                }

            } catch (error) {
                console.error('Ошибка:', error);
                if (!examFinished) {
                    alert('Ошибка распознавания: ' + error.message);
                }
                if (currentVoiceBtn) {
                    currentVoiceBtn.innerHTML = 'Ошибка';
                    setTimeout(() => {
                        if (currentVoiceBtn) currentVoiceBtn.innerHTML = '🎙️ Голосовой ввод';
                    }, 2000);
                }
            } finally {
                resetButtons(currentVoiceBtn, currentStopBtn, currentTextarea);

                if (activeRecordingIndex === currentQuestionIndex) {
                    if (mediaRecorder && mediaRecorder.stream) {
                        mediaRecorder.stream.getTracks().forEach(track => track.stop());
                    }
                    mediaRecorder = null;
                    audioChunks = [];
                    activeRecordingIndex = null;
                }
            }
        };

        mediaRecorder.start(1000);

    } catch (error) {
        console.error('Ошибка доступа к микрофону:', error);
        if (!examFinished) {
            alert('Не удалось получить доступ к микрофону. Проверьте разрешения в браузере.');
        }
        mediaRecorder = null;
        audioChunks = [];
        activeRecordingIndex = null;
    }
}

function stopVoiceInputForQuestion(questionIndex) {
    if (mediaRecorder && mediaRecorder.state === 'recording' && activeRecordingIndex === questionIndex) {
        mediaRecorder.stop();
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

function unlockExamInterface() {
    examFinished = false;

    document.querySelectorAll('.answer-textarea').forEach(textarea => {
        textarea.disabled = false;
        textarea.style.background = '';
    });

    document.querySelectorAll('.voice-btn-small').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
    });

    if (finishExamBtn) {
        finishExamBtn.disabled = false;
        finishExamBtn.style.opacity = '1';
    }
}

async function finishExam() {
    if (examFinished) return;

    stopAutoSave();

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        showWarning('Завершаем голосовой ввод...', false);

        await new Promise((resolve) => {
            const originalOnStop = mediaRecorder.onstop;

            mediaRecorder.onstop = async () => {
                if (originalOnStop) {
                    await originalOnStop();
                }
                setTimeout(resolve, 1000);
            };

            mediaRecorder.stop();
        });
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    syncAnswersFromTextareas();

    const emptyAnswers = countEmptyAnswers();
    if (emptyAnswers > 0) {
        const confirmSubmit = confirm(`Вы не ответили на ${emptyAnswers} из ${questions.length} вопросов. Отправить экзамен на проверку?`);
        if (!confirmSubmit) return;
    }

    lockExamInterface();
    finishExamBtn.textContent = 'Отправка...';
    showLoadingIndicator();

    const answersArray = buildAnswersArray();
    
    try {
        const response = await fetch(`${API_BASE_URL}/exam/submit?session_id=${examSession.sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                answers: answersArray
            })
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            const detail = errBody.detail;
            const message = Array.isArray(detail)
                ? detail.map(d => d.msg || JSON.stringify(d)).join(', ')
                : (detail || `Ошибка ${response.status}`);
            throw new Error(message);
        }

        const results = await response.json();
        hideLoadingIndicator();
        showResults(results);

        clearExamSessionState();
        localStorage.removeItem(`exam_time_left_${examSession.sessionId}`);
        localStorage.removeItem('examSession');
        sessionStorage.setItem('exam_completed_' + examSession.sessionId, 'true');

    } catch (error) {
        console.error('Ошибка:', error);
        alert(`Ошибка при отправке: ${error.message}`);
        unlockExamInterface();
        finishExamBtn.textContent = '✅ Завершить экзамен';
        hideLoadingIndicator();
    }
}

async function autoSubmitExam() {
    if (examFinished || autoSubmitTriggered === false) return;

    stopAutoSave();

    showWarning('⏰ Время вышло! Завершаем экзамен...', false);

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        await new Promise((resolve) => {
            const originalOnStop = mediaRecorder.onstop;

            mediaRecorder.onstop = async () => {
                if (originalOnStop) {
                    await originalOnStop();
                }
                setTimeout(resolve, 1000);
            };

            mediaRecorder.stop();
        });

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    syncAnswersFromTextareas();

    lockExamInterface();
    showLoadingIndicator();
    const answersArray = buildAnswersArray();
        
    try {
        const response = await fetch(`${API_BASE_URL}/exam/submit?session_id=${examSession.sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                answers: answersArray
            })
        });

        if (!response.ok) throw new Error(`Ошибка ${response.status}`);

        const results = await response.json();
        hideLoadingIndicator();
        showAutoSubmitResults(results);

        clearExamSessionState();
        localStorage.removeItem(`exam_time_left_${examSession.sessionId}`);
        localStorage.removeItem('examSession');
        sessionStorage.setItem('exam_completed_' + examSession.sessionId, 'true');

    } catch (error) {
        console.error('Ошибка автоотправки:', error);
        hideLoadingIndicator();
        showWarning('Ошибка при отправке. Пожалуйста, сообщите преподавателю.', true);
    }
}

function showAutoSubmitResults(results) {
    const answeredCount = countAnswered();
    
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

    clearExamSessionState();
    localStorage.removeItem(`exam_time_left_${examSession.sessionId}`);
    localStorage.removeItem('examSession');
    sessionStorage.setItem('exam_completed_' + examSession.sessionId, 'true');
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
                                <td class="question-cell">${escapeHtml(questionText)}</td>
                                <td class="${scoreClass}"><strong>${Math.round(result.score)}</strong> / 100</td>
                                <td class="comment-cell">${escapeHtml(result.comment || 'Проверено')}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </details>

        <div class="results-actions">
            <button class="btn btn-primary" onclick="clearStorageAndExit()">Завершить сессию</button>
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
    sessionStorage.removeItem(`exam_questions_${examSession.sessionId}`);
    clearExamSessionState();
    localStorage.removeItem(`exam_time_left_${examSession.sessionId}`);
    localStorage.removeItem('examSession');
    sessionStorage.setItem('exam_completed_' + examSession.sessionId, 'true');
}

function clearStorageAndExit() {
    if (examSession) {
        clearExamSessionState();
        localStorage.removeItem(`exam_time_left_${examSession.sessionId}`);
        sessionStorage.removeItem('exam_completed_' + examSession.sessionId);
    }
    localStorage.removeItem('examSession');
    window.location.href = '/';
}

function getGradeInfo(score) {
    if (score >= 90) return '<span class="grade-excellent">Отлично!</span>';
    if (score >= 75) return '<span class="grade-good">Хорошо!</span>';
    if (score >= 60) return '<span class="grade-satisfactory">Удовлетворительно</span>';
    return '<span class="grade-fail">Неудовлетворительно</span>';
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

function showLoadingIndicator() {
    const loader = document.createElement('div');
    loader.id = 'examLoader';
    loader.className = 'exam-loader';
    loader.innerHTML = `
        <div class="loader-overlay">
            <div class="loader-content">
                <div class="loader-spinner"></div>
                <p>Отправка ответов...</p>
            </div>
        </div>
    `;
    document.body.appendChild(loader);
}

function hideLoadingIndicator() {
    const loader = document.getElementById('examLoader');
    if (loader) loader.remove();
}

function resetButtons(voiceBtn, stopBtn, textarea) {
    if (voiceBtn) {
        voiceBtn.disabled = false;
    }
    if (stopBtn) {
        stopBtn.style.display = 'none';
        stopBtn.disabled = false;
    }
    if (textarea) {
        textarea.style.border = '';
        textarea.style.backgroundColor = '';
    }
}

window.addEventListener('beforeunload', (event) => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        event.preventDefault();
        event.returnValue = 'Идет активная запись. Вы уверены, что хотите покинуть страницу?';
        return event.returnValue;
    }

    if (!examFinished && examSession && questions.length > 0) {
        saveExamSessionState();
        localStorage.setItem(`exam_time_left_${examSession.sessionId}`, totalTimeLeft.toString());
    }
});