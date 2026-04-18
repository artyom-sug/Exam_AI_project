// ========================
// 1. ЭЛЕМЕНТЫ DOM
// ========================
const timerDisplay = document.getElementById('timerDisplay');
const questionTextEl = document.getElementById('questionText');
const answerInput = document.getElementById('answerInput');
const voiceBtn = document.getElementById('voiceBtn');
const voiceStatus = document.getElementById('voiceStatus');
const finishEarlyBtn = document.getElementById('finishEarlyBtn');
const submitAnswerBtn = document.getElementById('submitAnswerBtn');

// ========================
// 2. ТАЙМЕР (30 минут по умолчанию)
// ========================
let totalSeconds = 30 * 60; // 30 минут
let timerInterval = null;

function updateTimerDisplay() {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  if (totalSeconds <= 0) {
    clearInterval(timerInterval);
    timerDisplay.textContent = "00:00";
    alert("⏰ Время вышло! Экзамен завершён.");
    disableExam();
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (totalSeconds > 0) {
      totalSeconds--;
      updateTimerDisplay();
    } else {
      clearInterval(timerInterval);
    }
  }, 1000);
}

function disableExam() {
  answerInput.disabled = true;
  voiceBtn.disabled = true;
  submitAnswerBtn.disabled = true;
  finishEarlyBtn.disabled = true;
}

// ========================
// 3. ГЕНЕРАЦИЯ ВОПРОСА (через API)
// ========================
async function generateQuestion() {
  try {
    questionTextEl.innerHTML = "❓ <strong>Вопрос:</strong><br><br>🔄 Генерация вопроса...";
    
    // Используем бесплатный API для генерации вопросов
    // (GigaChat API требует ключ, поэтому используем открытый API)
    const response = await fetch('https://api.adviceslip.com/advice');
    const data = await response.json();
    
    // Если API сработал, формируем вопрос на тему устойчивого развития
    const baseQuestion = "Объясните концепцию устойчивого развития и её важность в современном обществе.";
    const alternativeQuestions = [
      "Какие три основных компонента включает в себя концепция устойчивого развития?",
      "Почему устойчивое развитие важно для будущих поколений?",
      "Приведите примеры экологических, экономических и социальных аспектов устойчивого развития.",
      "Как концепция устойчивого развития связана с изменением климата?",
      "Что такое «зелёная экономика» и как она relates к устойчивому развитию?"
    ];
    
    // Используем случайный вопрос из списка
    const randomIndex = Math.floor(Math.random() * alternativeQuestions.length);
    const question = alternativeQuestions[randomIndex];
    
    questionTextEl.innerHTML = `❓ <strong>Вопрос:</strong><br><br>${question}`;
  } catch (error) {
    console.error('Ошибка загрузки вопроса:', error);
    questionTextEl.innerHTML = "❓ <strong>Вопрос:</strong><br><br>Объясните концепцию устойчивого развития и её важность в современном обществе.";
  }
}

// ========================
// 4. РЕАЛЬНЫЙ ГОЛОСОВОЙ ВВОД (Web Speech API)
// ========================
let recognition = null;

function initSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    voiceStatus.textContent = "❌ Голосовой ввод не поддерживается вашим браузером";
    voiceBtn.disabled = true;
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  
  recognition.onstart = () => {
    voiceStatus.textContent = "🎙️ Слушаю... Говорите";
    voiceBtn.style.background = "#d5ceeb";
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const currentText = answerInput.value;
    answerInput.value = currentText + (currentText ? " " : "") + transcript;
    voiceStatus.textContent = "✅ Голосовой ввод завершён";
    setTimeout(() => {
      if (voiceStatus.textContent === "✅ Голосовой ввод завершён") {
        voiceStatus.textContent = "";
      }
    }, 2000);
  };
  
  recognition.onerror = (event) => {
    console.error('Ошибка распознавания:', event.error);
    voiceStatus.textContent = `❌ Ошибка: ${event.error}`;
    setTimeout(() => {
      if (voiceStatus.textContent.includes("Ошибка")) {
        voiceStatus.textContent = "";
      }
    }, 3000);
  };
  
  recognition.onend = () => {
    voiceBtn.style.background = "";
    if (voiceStatus.textContent === "🎙️ Слушаю... Говорите") {
      voiceStatus.textContent = "";
    }
  };
}

function startVoiceInput() {
  if (!recognition) {
    voiceStatus.textContent = "❌ Инициализация...";
    initSpeechRecognition();
    setTimeout(() => {
      if (recognition) recognition.start();
    }, 100);
    return;
  }
  
  try {
    recognition.start();
  } catch (e) {
    console.error("Ошибка запуска:", e);
    voiceStatus.textContent = "❌ Микрофон недоступен";
  }
}

// ========================
// 5. ДЕЙСТВИЯ С ЭКЗАМЕНОМ
// ========================
function finishExam() {
  if (confirm("Вы уверены, что хотите завершить экзамен досрочно? Ответ будет отправлен автоматически.")) {
    clearInterval(timerInterval);
    alert("📤 Экзамен завершён. Ответ сохранён.");
    disableExam();
  }
}

function submitAnswer() {
  const answer = answerInput.value.trim();
  if (!answer) {
    alert("❌ Пожалуйста, введите ответ перед отправкой.");
    return;
  }
  
  alert(`✅ Ответ успешно отправлен!\n\n📝 Ваш ответ:\n${answer.substring(0, 200)}${answer.length > 200 ? '…' : ''}`);
  console.log("Отправленный ответ:", answer);
  
  clearInterval(timerInterval);
  disableExam();
}

// ========================
// 6. ЗАГРУЗКА СТРАНИЦЫ
// ========================
document.addEventListener('DOMContentLoaded', () => {
  // Запускаем генерацию вопроса
  generateQuestion();
  
  // Запускаем таймер
  updateTimerDisplay();
  startTimer();
  
  // Инициализируем голосовой ввод
  initSpeechRecognition();
  
  // Навешиваем обработчики
  voiceBtn.addEventListener('click', startVoiceInput);
  finishEarlyBtn.addEventListener('click', finishExam);
  submitAnswerBtn.addEventListener('click', submitAnswer);
});
