const API_BASE_URL = 'http://localhost:8000/api';
const USE_MOCK = false;

let currentGroupResults = [];
let allResults = [];
let currentStudentId = null;
let isGradingMode = false;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    // Проверка авторизации
    const token = localStorage.getItem('token');
    const teacherLogin = localStorage.getItem('teacherLogin');
    
    if (!token && !USE_MOCK) {
        window.location.href = '/';
        return;
    }
    
    // Установка имени преподавателя
    if (teacherLogin) {
        document.getElementById('teacherName').textContent = teacherLogin;
    }
    
    // Обработчики событий
    document.getElementById('createExamBtn').addEventListener('click', () => {
        openModal('createExamModal');
    });
    
    document.getElementById('viewResultsBtn').addEventListener('click', () => {
        openModal('resultsModal');
        loadGroups();
    });
    
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Закрытие модальных окон
    document.getElementById('closeModalBtn').addEventListener('click', () => closeModal('createExamModal'));
    document.getElementById('cancelModalBtn').addEventListener('click', () => closeModal('createExamModal'));
    document.getElementById('closeResultsModalBtn').addEventListener('click', () => closeModal('resultsModal'));
    document.getElementById('closeAnswersModalBtn').addEventListener('click', () => closeModal('studentAnswersModal'));
    document.getElementById('closeAnswersModal').addEventListener('click', () => closeModal('studentAnswersModal'));
    document.getElementById('saveGradesBtn')?.addEventListener('click', saveGrades);
    
    // Обработка источника вопросов
    const autoRadio = document.querySelector('input[value="auto"]');
    const manualRadio = document.querySelector('input[value="manual"]');
    const manualBlock = document.getElementById('manualUploadBlock');
    
    autoRadio.addEventListener('change', () => {
        manualBlock.style.display = 'none';
    });
    
    manualRadio.addEventListener('change', () => {
        manualBlock.style.display = 'block';
    });
    
    // Обработка загрузки файлов
    setupFileUpload('lectureMaterials', 'lectureFilesList');
    setupFileUpload('questionsFile', 'questionsFileList');
    
    // Обработка создания экзамена
    document.getElementById('createExamForm').addEventListener('submit', createExam);
    
    // Поиск студентов
    document.getElementById('groupSelect').addEventListener('change', loadResultsForGroup);
    document.getElementById('studentSearch').addEventListener('input', filterStudents);
});

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function setupFileUpload(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    
    input.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const tag = document.createElement('div');
            tag.className = 'file-tag';
            tag.innerHTML = `
                📄 ${file.name}
                <span class="remove-file" onclick="this.parentElement.remove()">×</span>
            `;
            list.appendChild(tag);
        });
    });
}

async function createExam(e) {
    e.preventDefault();
    
    const roomKey = document.getElementById('roomKey').value.trim();
    const questionsCount = parseInt(document.getElementById('questionsCount').value);
    const examDuration = parseInt(document.getElementById('examDuration').value);
    const questionSource = document.querySelector('input[name="questionSource"]:checked').value;
    
    if (!roomKey) {
        alert('Пожалуйста, укажите ключ комнаты (номер группы)');
        return;
    }
    
    const createBtn = e.target.querySelector('.btn-create');
    const originalText = createBtn.textContent;
    createBtn.textContent = 'Создание...';
    createBtn.disabled = true;
    
    try {
        // Получение файлов
        const lectureFiles = document.getElementById('lectureMaterials').files;
        const questionsFile = document.getElementById('questionsFile').files[0];
        
        let examData = {
            room_key: roomKey,
            questions_count: questionsCount,
            duration_minutes: examDuration,
            question_source: questionSource
        };
        
        if (USE_MOCK) {
            await delay(1500);
            alert(`Экзамен для группы "${roomKey}" успешно создан!`);
            closeModal('createExamModal');
            document.getElementById('createExamForm').reset();
            document.getElementById('lectureFilesList').innerHTML = '';
            document.getElementById('questionsFileList').innerHTML = '';
        } else {
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` };
            
            const response = await fetch(`${API_BASE_URL}/teacher/exams/create`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(examData)
            });
            
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Ошибка создания экзамена');
            }
            
            const examResult = await response.json();
            const groupId = examResult.id;
            
            for (const file of lectureFiles) {
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await fetch(`${API_BASE_URL}/groups/${groupId}/upload-lecture`, {
                    method: 'POST',
                    headers,
                    body: formData
                });
                if (!uploadRes.ok) {
                    const err = await uploadRes.json().catch(() => ({}));
                    throw new Error(`Ошибка загрузки лекции "${file.name}": ${err.detail || uploadRes.statusText}`);
                }
            }
            
            if (questionSource === 'manual' && questionsFile) {
                const ext = questionsFile.name.split('.').pop().toLowerCase();
                const formData = new FormData();
                formData.append('file', questionsFile);
                
                let uploadUrl;
                if (ext === 'json') {
                    uploadUrl = `${API_BASE_URL}/groups/${groupId}/questions/upload-json`;
                } else if (ext === 'csv' || ext === 'txt') {
                    uploadUrl = `${API_BASE_URL}/groups/${groupId}/questions/upload-csv`;
                } else {
                    throw new Error('Для ручных вопросов поддерживаются форматы JSON, CSV и TXT');
                }
                
                const qRes = await fetch(uploadUrl, {
                    method: 'POST',
                    headers,
                    body: formData
                });
                if (!qRes.ok) {
                    const err = await qRes.json().catch(() => ({}));
                    throw new Error(`Ошибка загрузки вопросов: ${err.detail || qRes.statusText}`);
                }
            }
            
            alert(`Экзамен для группы "${roomKey}" успешно создан! Ключ доступа: ${examResult.access_key}`);
            closeModal('createExamModal');
            document.getElementById('createExamForm').reset();
            document.getElementById('lectureFilesList').innerHTML = '';
            document.getElementById('questionsFileList').innerHTML = '';
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при создании экзамена: ' + error.message);
    } finally {
        createBtn.textContent = originalText;
        createBtn.disabled = false;
    }
}

async function loadGroups() {
    try {
        if (USE_MOCK) {
            await delay(500);
            const groups = ['ИВТ-21-1', 'ПМИ-б-о-241', 'ИСТ-22-2'];
            const select = document.getElementById('groupSelect');
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                option.textContent = group;
                select.appendChild(option);
            });
        } else {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/groups`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Ошибка загрузки групп');
            const groups = await response.json();
            const select = document.getElementById('groupSelect');
            select.innerHTML = '<option value="">-- Выберите группу --</option>';
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка загрузки групп. Войдите в аккаунт заново.');
    }
}

async function loadResultsForGroup() {
    const groupId = document.getElementById('groupSelect').value;
    if (!groupId) {
        document.getElementById('resultsTableBody').innerHTML = '<tr><td colspan="5" style="text-align: center;">Выберите группу для просмотра результатов</td></tr>';
        return;
    }
    
    try {
        if (USE_MOCK) {
            await delay(800);
            allResults = generateMockResults(groupId);
            currentGroupResults = [...allResults];
            renderResultsTable(currentGroupResults);
            updateStats(currentGroupResults);
        } else {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/groups/${groupId}/results`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Ошибка загрузки результатов');
            const results = await response.json();
            allResults = results;
            currentGroupResults = [...allResults];
            renderResultsTable(currentGroupResults);
            updateStats(currentGroupResults);
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка загрузки результатов');
    }
}

function generateMockResults(groupName) {
    const students = [
        { name: 'Иванов Иван Иванович', answered: 23, total: 25, score: 85 },
        { name: 'Петрова Мария Сергеевна', answered: 25, total: 25, score: 92 },
        { name: 'Сидоров Алексей Петрович', answered: 21, total: 25, score: 78 },
        { name: 'Кузнецова Анна Дмитриевна', answered: 24, total: 25, score: 95 },
        { name: 'Смирнов Дмитрий Александрович', answered: 25, total: 25, score: 88 },
        { name: 'Васильева Ольга Викторовна', answered: 24, total: 25, score: 91 },
        { name: 'Морозов Сергей Николаевич', answered: 20, total: 25, score: 76 },
        { name: 'Новикова Елена Игоревна', answered: 23, total: 25, score: 89 }
    ];
    
    return students.map((s, idx) => ({
        id: idx + 1,
        name: s.name,
        answered: s.answered,
        total: s.total,
        score: s.score,
        answers: generateMockAnswers()
    }));
}

function generateMockAnswers() {
    const questions = [
        { text: 'Что такое производная функции?', correct: 'Скорость изменения функции или тангенс угла наклона касательной' },
        { text: 'Чему равен интеграл от константы?', correct: 'Константа умноженная на x плюс C' },
        { text: 'Что такое база данных?', correct: 'Организованная структура для хранения и управления данными' },
        { text: 'Что такое API?', correct: 'Интерфейс программирования приложений' },
        { text: 'Что такое ООП?', correct: 'Объектно-ориентированное программирование' }
    ];
    
    const studentAnswers = [
        'Скорость изменения функции',
        'Константа умноженная на x',
        'Место где хранятся данные',
        'Application Programming Interface',
        'Методология программирования'
    ];
    
    return questions.map((q, idx) => ({
        question: q.text,
        studentAnswer: studentAnswers[idx],
        correctAnswer: q.correct,
        score: idx < 4 ? 100 : 50
    }));
}

function renderResultsTable(results) {
    const tbody = document.getElementById('resultsTableBody');
    
    if (!results || results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Нет результатов</td></tr>';
        return;
    }
    
    tbody.innerHTML = results.map((student, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td>${student.name}</td>
            <td>${student.answered} / ${student.total}</td>
            <td>${student.score} / 100</td>
            <td class="action-links">
                <button class="action-link" onclick="viewStudentAnswers(${student.id})">Ответы</button>
                <button class="action-link" onclick="gradeStudent(${student.id})">Оценка</button>
            </td>
        </tr>
    `).join('');
}

function filterStudents() {
    const searchTerm = document.getElementById('studentSearch').value.toLowerCase();
    const filtered = allResults.filter(student => 
        student.name.toLowerCase().includes(searchTerm)
    );
    currentGroupResults = filtered;
    renderResultsTable(filtered);
    updateStats(filtered);
}

function updateStats(results) {
    if (!results || results.length === 0) {
        document.getElementById('avgScore').textContent = '—';
        document.getElementById('passedCount').textContent = '—';
        return;
    }
    
    const avgScore = results.reduce((sum, s) => sum + s.score, 0) / results.length;
    const passed = results.filter(s => s.score >= 60).length;
    
    document.getElementById('avgScore').textContent = avgScore.toFixed(1);
    document.getElementById('passedCount').textContent = `${passed} / ${results.length}`;
}

function viewStudentAnswers(studentId, grading = false) {
    const student = allResults.find(s => s.id === studentId);
    if (!student) return;
    
    currentStudentId = studentId;
    isGradingMode = grading;
    
    document.getElementById('studentAnswersName').textContent = student.name;
    document.getElementById('studentAnswersScore').textContent = 
        `Балл: ${student.score} / 100 · Ответил на вопросов: ${student.answered} / ${student.total}`;
    
    const answersList = document.getElementById('answersList');
    answersList.innerHTML = student.answers.map((ans, idx) => {
        const studentAnswer = ans.student_answer || ans.studentAnswer || '—';
        const correctAnswer = ans.correct_answer || ans.correctAnswer || '—';
        const score = ans.score ?? 0;
        
        const scoreBlock = grading
            ? `<div class="answer-score-edit">
                <label>Оценка:</label>
                <input type="number" class="score-input" data-answer-id="${ans.id}" 
                       min="0" max="100" value="${score}" step="1">
                <span>/ 100</span>
               </div>`
            : `<div class="answer-score">Оценка: ${score} / 100</div>`;
        
        return `
        <div class="answer-item" data-answer-id="${ans.id}">
            <div class="answer-question">Вопрос ${idx + 1}: ${ans.question}</div>
            <div class="answer-student">
                <div class="answer-student-label">📝 Ответ студента:</div>
                <div class="answer-student-text">${studentAnswer}</div>
            </div>
            ${correctAnswer !== '—' ? `
            <div class="answer-correct">
                <div class="answer-correct-label">✅ Эталонный ответ:</div>
                <div class="answer-correct-text">${correctAnswer}</div>
            </div>` : ''}
            ${ans.comment ? `<div class="answer-comment">💬 ${ans.comment}</div>` : ''}
            ${scoreBlock}
        </div>`;
    }).join('');
    
    const saveBtn = document.getElementById('saveGradesBtn');
    if (saveBtn) saveBtn.style.display = grading ? 'inline-block' : 'none';
    
    openModal('studentAnswersModal');
}

function gradeStudent(studentId) {
    viewStudentAnswers(studentId, true);
}

async function saveGrades() {
    const groupId = document.getElementById('groupSelect').value;
    if (!groupId || !currentStudentId) return;
    
    const token = localStorage.getItem('token');
    const scoreInputs = document.querySelectorAll('.score-input');
    const saveBtn = document.getElementById('saveGradesBtn');
    
    saveBtn.textContent = 'Сохранение...';
    saveBtn.disabled = true;
    
    try {
        let newTotal = 0;
        let count = 0;
        
        for (const input of scoreInputs) {
            const answerId = input.dataset.answerId;
            const score = parseFloat(input.value);
            
            const response = await fetch(`${API_BASE_URL}/groups/${groupId}/answers/${answerId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ score })
            });
            
            if (!response.ok) throw new Error('Ошибка сохранения оценки');
            const result = await response.json();
            newTotal = result.student_total_score;
            count++;
        }
        
        const student = allResults.find(s => s.id === currentStudentId);
        if (student) {
            student.score = newTotal;
            scoreInputs.forEach(input => {
                const ans = student.answers.find(a => String(a.id) === input.dataset.answerId);
                if (ans) ans.score = parseFloat(input.value);
            });
        }
        
        document.getElementById('studentAnswersScore').textContent = 
            `Балл: ${newTotal} / 100 · Ответил на вопросов: ${student?.answered || 0} / ${student?.total || 0}`;
        
        renderResultsTable(currentGroupResults);
        updateStats(currentGroupResults);
        alert('Оценки успешно сохранены!');
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при сохранении оценок: ' + error.message);
    } finally {
        saveBtn.textContent = 'Сохранить оценки';
        saveBtn.disabled = false;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('teacherLogin');
    localStorage.removeItem('examSession');
    window.location.href = '/';
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Добавляем функции в глобальный объект для вызова из onclick
window.viewStudentAnswers = viewStudentAnswers;
window.gradeStudent = gradeStudent;