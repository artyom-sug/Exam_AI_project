const API_BASE_URL = 'http://localhost:8000/api';

const container = document.getElementById('container');
const signinBtn = document.getElementById('signinBtn');
const signupBtn = document.getElementById('signupBtn');

signupBtn?.addEventListener('click', () => {
    container.classList.add('right-panel-active');
    document.querySelector('.signin-panel')?.classList.remove('active');
    document.querySelector('.signup-panel')?.classList.add('active');
});

signinBtn?.addEventListener('click', () => {
    container.classList.remove('right-panel-active');
    document.querySelector('.signup-panel')?.classList.remove('active');
    document.querySelector('.signin-panel')?.classList.add('active');
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.signin-panel')?.classList.add('active');
});

function showError(id, msg) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    }
}

function clearErrors(form) {
    form.querySelectorAll('.error-message').forEach(el => {
        el.classList.remove('show');
        el.textContent = '';
    });
}

function setLoading(btn, isLoading) {
    if (isLoading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

document.getElementById('signinForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(e.target);
    
    const group = document.getElementById('studentGroup').value.trim();
    const fullname = document.getElementById('studentFullname').value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    let hasError = false;

    if (!group) {
        showError('groupError', 'Укажите ключ доступа');
        hasError = true;
    }
    
    if (!fullname) {
        showError('fullnameError', 'Укажите ФИО');
        hasError = true;
    } else if (fullname.split(' ').length < 2) {
        showError('fullnameError', 'Введите фамилию и имя');
        hasError = true;
    }

    if (hasError) return;
    
    setLoading(submitBtn, true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/student/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fio: fullname, key: group })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Неверный ключ доступа');
        }
        const data = await response.json();
        
        localStorage.setItem('examSession', JSON.stringify({
            sessionId: data.session_id,
            groupId: data.group_id,
            fio: data.fio
        }));
        
        window.location.href = '/pages/exam.html';
        
    } catch (error) {
        console.error('Ошибка:', error);
        showError('groupError', error.message || 'Ошибка подключения к серверу');
    } finally {
        setLoading(submitBtn, false);
    }
});

document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(e.target);
    
    const login = document.getElementById('teacherLogin').value.trim();
    const password = document.getElementById('teacherPassword').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    let hasError = false;

    if (!login) {
        showError('teacherLoginError', 'Укажите логин'); 
        hasError = true;
    } else if (login.length < 3) {
        showError('teacherLoginError', 'Логин слишком короткий'); 
        hasError = true;
    }

    if (!password) {
        showError('teacherPasswordError', 'Укажите пароль');  
        hasError = true;
    } else if (password.length < 3) {
        showError('teacherPasswordError', 'Минимум 3 символа'); 
        hasError = true;
    }

    if (hasError) return;
    
    setLoading(submitBtn, true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ login: login, password: password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Неверный логин или пароль');
        }
        const data = await response.json();
        
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('teacherLogin', login);
        
        window.location.href = '/pages/teacher.html';
        
    } catch (error) {
    console.error('Ошибка:', error);
    showError('teacherLoginError', error.message || 'Ошибка подключения к серверу');
    } finally {
        setLoading(submitBtn, false);
    }
});

document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', function() {
        const parent = this.parentElement;
        const errorEl = parent.querySelector('.error-message');
        if (errorEl) {
            errorEl.classList.remove('show');
        }
    });
});

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('role') === 'teacher') {
    setTimeout(() => {
        signupBtn?.click();
    }, 100);
}