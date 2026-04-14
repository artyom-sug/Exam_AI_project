import logging
from pathlib import Path
from typing import Optional
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

class WhisperService:
    def __init__(self, model_size: str = "base", device: str = "cpu"):
        self.model_size = model_size
        self.device = device
        self.model = None
        self.load_model()
    
    def load_model(self):
        try:
            compute_type = "float16" if self.device == "cuda" else "int8"
            
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=compute_type,
                num_workers=1
            )
            logger.info(f"Whisper model {self.model_size} loaded on {self.device}")
        except Exception as e:
            logger.error(f"Error loading Whisper model: {e}")
            # Fallback на CPU
            if self.device != "cpu":
                self.device = "cpu"
                self.load_model()
    
    def transcribe(self, audio_path: str, language: str = "ru") -> str:
        if not self.model:
            return ""
        
        try:
            segments, info = self.model.transcribe(
                audio_path,
                language=language,
                beam_size=5,
                vad_filter=True,  
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                    threshold=0.5
                )
            )
            
            text = " ".join([segment.text for segment in segments])
            
            logger.info(f"Transcribed {len(text)} chars from {audio_path}")
            return text.strip()
            
        except Exception as e:
            logger.error(f"Error transcribing audio: {e}")
            return ""
    
    def transcribe_bytes(self, audio_bytes: bytes, language: str = "ru") -> str:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        
        try:
            result = self.transcribe(tmp_path, language)
            return result
        finally:
            Path(tmp_path).unlink(missing_ok=True)

whisper_service = WhisperService(model_size="base", device="cpu")