// Элементы
const container = document.getElementById('container');
const signinBtn = document.getElementById('signinBtn');
const signupBtn = document.getElementById('signupBtn');
const mobileSwitch = document.getElementById('mobileSwitchToSignin');

// ========== ПЕРЕКЛЮЧЕНИЕ ==========

// Переключение на форму преподавателя
signupBtn?.addEventListener('click', () => {
    container.classList.add('right-panel-active');
    // Для мобильной версии
    document.querySelector('.signin-panel')?.classList.remove('active');
    document.querySelector('.signup-panel')?.classList.add('active');
});

// Переключение на форму студента
signinBtn?.addEventListener('click', () => {
    container.classList.remove('right-panel-active');
    // Для мобильной версии
    document.querySelector('.signup-panel')?.classList.remove('active');
    document.querySelector('.signin-panel')?.classList.add('active');
});

// Мобильное переключение
mobileSwitch?.addEventListener('click', () => {
    container.classList.remove('right-panel-active');
    document.querySelector('.signup-panel')?.classList.remove('active');
    document.querySelector('.signin-panel')?.classList.add('active');
});

// Инициализация - показываем форму студента по умолчанию
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.signin-panel')?.classList.add('active');
});

// ========== ВАЛИДАЦИЯ ==========

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

// Форма СТУДЕНТА
document.getElementById('signinForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(e.target);
    
    const group = document.getElementById('studentGroup').value.trim();
    const fullname = document.getElementById('studentFullname').value.trim();
    let hasError = false;

    if (!group) {
        showError('groupError', 'Укажите номер группы');
        hasError = true;
    }
    
    if (!fullname) {
        showError('fullnameError', 'Укажите ФИО');
        hasError = true;
    } else if (fullname.split(' ').length < 2) {
        showError('fullnameError', 'Введите фамилию и имя');
        hasError = true;
    }

    if (!hasError) {
        alert(`✅ Добро пожаловать, ${fullname}!\nГруппа: ${group}`);
        console.log('Student login:', { group, fullname });
    }
});

// Форма ПРЕПОДАВАТЕЛЯ
document.getElementById('signupForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(e.target);
    
    const login = document.getElementById('teacherLogin').value.trim();
    const password = document.getElementById('teacherPassword').value;
    let hasError = false;

    if (!login) {
        showError('LoginError', 'Укажите логин');
        hasError = true;
    } else if (login.length < 3) {
        showError('LoginError', 'Логин слишком короткий');
        hasError = true;
    }

    if (!password) {
        showError('PasswordError', 'Укажите пароль');
        hasError = true;
    } else if (password.length < 6) {
        showError('PasswordError', 'Минимум 6 символов');
        hasError = true;
    }

    if (!hasError) {
        alert(`✅ Добро пожаловать, преподаватель!\nЛогин: ${login}`);
        console.log('Teacher login:', { login });
    }
});

// Убирать ошибку при вводе
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', function() {
        const errorEl = this.parentElement.querySelector('.error-message');
        if (errorEl) {
            errorEl.classList.remove('show');
        }
    });
});
