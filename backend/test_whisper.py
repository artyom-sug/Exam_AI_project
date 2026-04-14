from faster_whisper import WhisperModel
from pathlib import Path
import sys

def transcribe_faster(audio_path="test_audio.wav"):
    
    if not Path(audio_path).exists():
        print(f"Ошибка: Файл {audio_path} не найден")
        return
    
    model = WhisperModel("base", device="cpu", compute_type="int8")
    
    print(f"Распознавание аудио: {audio_path}")
    segments, info = model.transcribe(audio_path, beam_size=5)
    
    print(f"\nРаспознанный текст:")
    full_text = ""
    for segment in segments:
        full_text += segment.text
        print(f"[{segment.start:.2f} -> {segment.end:.2f}] {segment.text}")
    
    print(f"\nПолный текст: {full_text}")
    print(f"Язык: {info.language}, Вероятность: {info.language_probability:.2f}")

if __name__ == "__main__":
    audio_file = sys.argv[1] if len(sys.argv) > 1 else "test_audio.wav"
    transcribe_faster(audio_file)