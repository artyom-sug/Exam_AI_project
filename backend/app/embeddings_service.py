import logging
from typing import List, Dict, Any
import numpy as np
from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session
from . import models
from .config import EMBEDDING_MODEL

logger = logging.getLogger(__name__)

class EmbeddingsService:
    
    def __init__(self):
        self.model = None
        self.load_model()
    
    def load_model(self):
        try:
            logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
            self.model = SentenceTransformer(EMBEDDING_MODEL)
            logger.info("Embedding model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading embedding model: {str(e)}")
            self.model = None
    
    def get_embedding(self, text: str) -> List[float]:
        if not self.model:
            return []
        
        try:
            embedding = self.model.encode(text, show_progress_bar=False)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error getting embedding: {str(e)}")
            return []
    
    def split_into_chunks(self, text: str, chunk_size: int = 500, overlap: int = 100) -> List[str]:
        if not text:
            return []
        
        words = text.split()
        chunks = []
        
        for i in range(0, len(words), chunk_size - overlap):
            chunk = ' '.join(words[i:i + chunk_size])
            if chunk:
                chunks.append(chunk)
        
        return chunks
    
    def process_lecture(self, db: Session, lecture_id: int, text: str):
        if not self.model:
            logger.error("Embedding model not loaded")
            return
        
        lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
        if not lecture:
            logger.error(f"Lecture {lecture_id} not found")
            return
        
        db.query(models.Chunk).filter(models.Chunk.lecture_id == lecture_id).delete()
        
        chunks = self.split_into_chunks(text)
        
        for i, chunk_text in enumerate(chunks):
            embedding = self.get_embedding(chunk_text)
            if embedding:
                chunk = models.Chunk(
                    lecture_id=lecture_id,
                    text=chunk_text,
                    embedding=embedding,
                    chunk_index=i
                )
                db.add(chunk)
        
        db.commit()
        logger.info(f"Processed lecture {lecture_id}: {len(chunks)} chunks created")
    
    def search_similar_chunks(self, db: Session, group_id: int, query: str, top_k: int = 3) -> List[str]:
        if not self.model:
            return []
        
        chunks = db.query(models.Chunk).join(
            models.Lecture
        ).filter(
            models.Lecture.group_id == group_id
        ).all()
        
        if not chunks:
            return []
        
        query_embedding = self.get_embedding(query)
        if not query_embedding:
            return []
        
        similarities = []
        for chunk in chunks:
            if chunk.embedding:
                similarity = self.cosine_similarity(query_embedding, chunk.embedding)
                similarities.append((similarity, chunk.text))
        
        # Сортируем и берем топ-k
        similarities.sort(key=lambda x: x[0], reverse=True)
        top_chunks = [text for _, text in similarities[:top_k]]
        
        return top_chunks
    
    @staticmethod
    def cosine_similarity(a: List[float], b: List[float]) -> float:
        a = np.array(a)
        b = np.array(b)
        
        if np.linalg.norm(a) == 0 or np.linalg.norm(b) == 0:
            return 0
        
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

embeddings_service = EmbeddingsService()