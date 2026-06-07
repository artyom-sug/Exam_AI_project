const API_BASE_URL = 'http://localhost:8000/api';

let currentGroupResults = [];
let allResults = [];
let currentStudentId = null;
let isGradingMode = false;
let allGroups = [];
let currentSettingsGroupId = null;
let questionsToEdit = [];

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const teacherLogin = localStorage.getItem('teacherLogin');
    
    if (!token) {
        window.location.href = '/';
        return;
    }
    
    if (teacherLogin) {
        document.getElementById('teacherName').textContent = teacherLogin;
    }
    
    document.getElementById('examSettingsBtn').addEventListener('click', () => {
        openModal('examSettingsModal');
        loadGroupsForSettings();
    });
    
    document.getElementById('viewResultsBtn').addEventListener('click', () => {
        openModal('resultsModal');
        loadGroups();
    });
    
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    document.getElementById('closeSettingsModalBtn').addEventListener('click', () => closeModal('examSettingsModal'));
    document.getElementById('cancelSettingsBtn').addEventListener('click', () => closeModal('examSettingsModal'));
    document.getElementById('closeResultsModalBtn').addEventListener('click', () => closeModal('resultsModal'));
    document.getElementById('closeAnswersModalBtn').addEventListener('click', () => closeModal('studentAnswersModal'));
    document.getElementById('closeAnswersModal').addEventListener('click', () => closeModal('studentAnswersModal'));
    document.getElementById('saveGradesBtn')?.addEventListener('click', saveGrades);
    
    document.getElementById('settingsGroupSelect').addEventListener('change', loadGroupSettings);
    document.getElementById('examSettingsForm').addEventListener('submit', saveGroupSettings);
    document.getElementById('editAnswersBtn').addEventListener('click', openEditAnswersModal);
    document.getElementById('createGroupBtn').addEventListener('click', createGroup);
    document.getElementById('closeEditAnswersBtn').addEventListener('click', () => closeModal('editAnswersModal'));
    document.getElementById('closeEditAnswersBtn2').addEventListener('click', () => closeModal('editAnswersModal'));
    document.getElementById('saveQuestionsBtn').addEventListener('click', saveQuestionsEdits);
    
    document.getElementById('groupSelect').addEventListener('change', loadResultsForGroup);
    document.getElementById('studentSearch').addEventListener('input', filterStudents);
});

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
async function loadGroupsForSettings() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/groups`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Ошибка загрузки групп');
        allGroups = await response.json();
        
        const select = document.getElementById('settingsGroupSelect');
        select.innerHTML = '<option value="">-- Выберите группу --</option>';
        allGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            select.appendChild(option);
        });
        
        document.getElementById('settingsFormBlock').style.display = 'none';
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка загрузки групп');
    }
}

function loadGroupSettings() {
    const groupId = document.getElementById('settingsGroupSelect').value;
    const formBlock = document.getElementById('settingsFormBlock');
    
    if (!groupId) {
        formBlock.style.display = 'none';
        currentSettingsGroupId = null;
        return;
    }

    const group = allGroups.find(g => String(g.id) === String(groupId));
    if (!group) return;
    
    currentSettingsGroupId = group.id;
    formBlock.style.display = 'block';
    
    document.getElementById('settingsQuestionsCount').value = group.questions_count;
    document.getElementById('settingsExamDuration').value = Math.round(group.exam_duration_seconds / 60);
    document.getElementById('settingsAccessKey').value = group.access_key;
    
    const source = group.use_auto_generation ? 'auto' : 'manual';
    document.querySelector(`input[name="settingsQuestionSource"][value="${source}"]`).checked = true;
}

async function saveGroupSettings(e) {
    e.preventDefault();
    
    if (!currentSettingsGroupId) return;
    
    const questionsCount = parseInt(document.getElementById('settingsQuestionsCount').value);
    const examDurationMinutes = parseInt(document.getElementById('settingsExamDuration').value);
    const questionSource = document.querySelector('input[name="settingsQuestionSource"]:checked').value;
    
    const submitBtn = e.target.querySelector('.btn-create');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Сохранение...';
    submitBtn.disabled = true;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/groups/${currentSettingsGroupId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                questions_count: questionsCount,
                exam_duration_seconds: examDurationMinutes * 60,
                use_auto_generation: questionSource === 'auto'
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Ошибка сохранения');
        }
        
        const updated = await response.json();
        const idx = allGroups.findIndex(g => g.id === updated.id);
        if (idx >= 0) allGroups[idx] = updated;
        
        alert('Настройки успешно сохранены!');
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при сохранении: ' + error.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

async function openEditAnswersModal() {
    openModal('editAnswersModal');
    const list = document.getElementById('questionsEditList');
    list.innerHTML = '<p style="text-align: center;">Загрузка вопросов...</p>';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/teacher/questions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Ошибка загрузки вопросов');
        
        questionsToEdit = await response.json();
        renderQuestionsEditList();
    } catch (error) {
        console.error('Ошибка:', error);
        list.innerHTML = '<p style="text-align: center; color: red;">Ошибка загрузки вопросов</p>';
    }
}

function renderQuestionsEditList() {
    const list = document.getElementById('questionsEditList');
    
    if (!questionsToEdit.length) {
        list.innerHTML = '<p style="text-align: center; color: #888;">Вопросы не найдены. Загрузите их через скрипт load_questions.py</p>';
        return;
    }
    
    list.innerHTML = questionsToEdit.map((q, idx) => `
        <div class="question-edit-item" data-question-id="${q.id}">
            <div class="question-edit-number">Вопрос ${idx + 1}</div>
            <div class="form-group">
                <label>Текст вопроса</label>
                <textarea class="question-text-input" rows="3">${escapeHtml(q.question_text || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Эталонный ответ</label>
                <textarea class="expected-answer-input" rows="8">${escapeHtml(q.expected_answer || '')}</textarea>
            </div>
        </div>
    `).join('');
}

async function saveQuestionsEdits() {
    const items = document.querySelectorAll('.question-edit-item');
    const token = localStorage.getItem('token');
    const saveBtn = document.getElementById('saveQuestionsBtn');
    
    saveBtn.textContent = 'Сохранение...';
    saveBtn.disabled = true;
    
    try {
        for (const item of items) {
            const questionId = item.dataset.questionId;
            const questionText = item.querySelector('.question-text-input').value;
            const expectedAnswer = item.querySelector('.expected-answer-input').value;
            
            const response = await fetch(
                `${API_BASE_URL}/teacher/questions/${questionId}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        question_text: questionText,
                        expected_answer: expectedAnswer
                    })
                }
            );
            if (!response.ok) throw new Error('Ошибка сохранения вопроса');
        }
        
        alert('Эталонные ответы успешно сохранены!');
        closeModal('editAnswersModal');
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при сохранении: ' + error.message);
    } finally {
        saveBtn.textContent = 'Сохранить изменения';
        saveBtn.disabled = false;
    }
}

async function createGroup() {
    const name = document.getElementById('newGroupName').value.trim();
    if (!name) {
        alert('Укажите название или ключ группы');
        return;
    }
    
    const btn = document.getElementById('createGroupBtn');
    btn.disabled = true;
    btn.textContent = 'Создание...';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/groups`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                questions_count: 25,
                exam_duration_seconds: 5400,
                use_auto_generation: true
            })
        });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Ошибка создания группы');
        }
        
        const group = await response.json();
        allGroups.push(group);
        
        const select = document.getElementById('settingsGroupSelect');
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        select.appendChild(option);
        select.value = group.id;
        loadGroupSettings();
        
        document.getElementById('newGroupName').value = '';
        alert(`Группа "${group.name}" создана. Ключ доступа: ${group.access_key}`);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Создать группу';
    }
}

async function loadGroups() {
    try {
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
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка загрузки результатов');
    }
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

    
    const totalScoreBlock = grading ? `
        <div class="total-score-edit">
            <label><strong>Общий балл студента:</strong></label>
            <input type="number" class="total-score-input" id="totalScoreInput"
                   min="0" max="100" value="${student.score}" step="0.1">
            <span>/ 100</span>
        </div>
    ` : '';
    
    answersList.innerHTML = totalScoreBlock + student.answers.map((ans, idx) => {
        const studentAnswer = ans.student_answer || ans.studentAnswer || '—';
        const correctAnswer = ans.correct_answer || ans.correctAnswer || '—';
        const score = ans.score ?? 0;
        const comment = ans.comment || '';
        
        const scoreBlock = grading
            ? `<div class="answer-score-edit">
                <label>Оценка за вопрос:</label>
                <input type="number" class="score-input" data-answer-id="${ans.id}" 
                    min="0" max="100" value="${score}" step="0.1">
                <span>/ 100</span>
                </div>
               <div class="answer-comment-edit">
                <label>Комментарий:</label>
                <textarea class="comment-input" data-answer-id="${ans.id}" rows="6">${escapeHtml(comment)}</textarea>
               </div>`
            : `<div class="answer-score">Оценка: ${score} / 100</div>`;
        
        return `
        <div class="answer-item" data-answer-id="${ans.id}">
             <div class="answer-question">Вопрос ${idx + 1}: ${escapeHtml(ans.question)}</div>
            <div class="answer-student">
                <div class="answer-student-label">📝 Ответ студента:</div>
                <div class="answer-student-text">${escapeHtml(studentAnswer)}</div>
            </div>
            ${correctAnswer !== '—' ? `
            <div class="answer-correct">
                <div class="answer-correct-label">✅ Эталонный ответ:</div>
                <div class="answer-correct-text">${escapeHtml(correctAnswer)}</div>
            </div>` : ''}
            ${!grading && comment ? `<div class="answer-comment">💬 ${escapeHtml(comment)}</div>` : ''}
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
    const commentInputs = document.querySelectorAll('.comment-input');
    const totalScoreInput = document.getElementById('totalScoreInput');
    const saveBtn = document.getElementById('saveGradesBtn');
    
    saveBtn.textContent = 'Сохранение...';
    saveBtn.disabled = true;
    
    try {
        let newTotal = null;
        
        for (const input of scoreInputs) {
            const answerId = input.dataset.answerId;
            const score = parseFloat(input.value);
            const commentEl = document.querySelector(`.comment-input[data-answer-id="${answerId}"]`);
            const comment = commentEl ? commentEl.value : undefined;
            
            const body = { score };
            if (comment !== undefined) body.comment = comment;
            
            
            const response = await fetch(`${API_BASE_URL}/groups/${groupId}/answers/${answerId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            
            if (!response.ok) throw new Error('Ошибка сохранения оценки');
        }

        if (totalScoreInput) {
            const totalScore = parseFloat(totalScoreInput.value);
            const totalResponse = await fetch(
                `${API_BASE_URL}/groups/${groupId}/students/${currentStudentId}/total-score`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ total_score: totalScore })
                }
            );
            if (!totalResponse.ok) throw new Error('Ошибка сохранения общего балла');
            const totalResult = await totalResponse.json();
            newTotal = totalResult.total_score;
        }

        const student = allResults.find(s => s.id === currentStudentId);
        if (student) {
            if (newTotal !== null) {
                student.score = newTotal;
                student.manual_total_score = newTotal;
            }
            scoreInputs.forEach(input => {
                const ans = student.answers.find(a => String(a.id) === input.dataset.answerId);
                if (ans) ans.score = parseFloat(input.value);
            });
            commentInputs.forEach(input => {
                const ans = student.answers.find(a => String(a.id) === input.dataset.answerId);
                if (ans) ans.comment = input.value;
            });
        }
        
        document.getElementById('studentAnswersScore').textContent = 
            `Балл: ${newTotal ?? student?.score} / 100 · Ответил на вопросов: ${student?.answered || 0} / ${student?.total || 0}`;
        
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

window.viewStudentAnswers = viewStudentAnswers;
window.gradeStudent = gradeStudent;