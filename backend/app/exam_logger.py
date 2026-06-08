"""
Логирование запросов к ИИ (JSON) и технических событий (текстовый лог).
"""
import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .config import LOGS_DIR, AI_LOG_FILE, SYSTEM_LOG_FILE

_lock = threading.Lock()

LOGS_DIR.mkdir(parents=True, exist_ok=True)

_system_logger = logging.getLogger("exam_system")
if not _system_logger.handlers:
    _system_logger.setLevel(logging.DEBUG)
    handler = logging.FileHandler(SYSTEM_LOG_FILE, encoding="utf-8")
    handler.setFormatter(logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    _system_logger.addHandler(handler)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_ai_interaction(
    event_type: str,
    *,
    question: str = "",
    student_answer: str = "",
    expected_answer: str = "",
    context: str = "",
    system_prompt: str = "",
    user_prompt: str = "",
    full_prompt: str = "",
    model: str = "",
    temperature: float = 0.0,
    llm_response: str = "",
    parsed_score: Optional[float] = None,
    parsed_comment: str = "",
    injection_detected: bool = False,
    session_id: str = "",
    student_fio: str = "",
    question_number: int = 0,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """Записать взаимодействие с ИИ в JSON-лог (одна строка = одно событие)."""
    entry = {
        "timestamp": _utc_now(),
        "event_type": event_type,
        "session_id": session_id,
        "student_fio": student_fio,
        "question_number": question_number,
        "question": question,
        "student_answer": student_answer,
        "expected_answer": expected_answer,
        "context_preview": context[:500] if context else "",
        "model": model,
        "temperature": temperature,
        "system_prompt": system_prompt,
        "user_prompt": user_prompt,
        "full_prompt": full_prompt,
        "llm_response": llm_response,
        "parsed_score": parsed_score,
        "parsed_comment": parsed_comment,
        "injection_detected": injection_detected,
    }
    if extra:
        entry["extra"] = extra

    line = json.dumps(entry, ensure_ascii=False)
    with _lock:
        with open(AI_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def log_system(level: str, message: str, **kwargs: Any) -> None:
    """Технический лог: Ollama, сервер, ошибки."""
    extra_info = " | ".join(f"{k}={v}" for k, v in kwargs.items()) if kwargs else ""
    full_message = f"{message} | {extra_info}" if extra_info else message
    log_fn = getattr(_system_logger, level.lower(), _system_logger.info)
    log_fn(full_message)


def log_ollama_request(model: str, status: str, duration_ms: float = 0, error: str = "") -> None:
    log_system("info", "Ollama request", model=model, status=status,
               duration_ms=round(duration_ms, 1), error=error or "none")


def log_server_event(event: str, **kwargs: Any) -> None:
    log_system("info", f"Server: {event}", **kwargs)
