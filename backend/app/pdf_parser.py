"""
Парсер PDF файлов для извлечения текста
"""
import fitz  # PyMuPDF
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Извлекает текст из PDF файла
    
    Args:
        pdf_path: путь к PDF файлу
        
    Returns:
        извлеченный текст в виде строки
    """
    try:
        text = ""
        # Открываем PDF
        doc = fitz.open(pdf_path)
        
        # Проходим по всем страницам
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text += page.get_text()
        
        doc.close()
        
        # Очищаем текст (убираем лишние пробелы и переносы)
        text = ' '.join(text.split())
        
        logger.info(f"Successfully extracted {len(text)} characters from {pdf_path}")
        return text
        
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {str(e)}")
        return ""

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """
    Извлекает текст из PDF байтов
    
    Args:
        pdf_bytes: PDF файл в виде байтов
        
    Returns:
        извлеченный текст в виде строки
    """
    try:
        text = ""
        # Открываем PDF из байтов
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        # Проходим по всем страницам
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text += page.get_text()
        
        doc.close()
        
        # Очищаем текст
        text = ' '.join(text.split())
        
        return text
        
    except Exception as e:
        logger.error(f"Error extracting text from PDF bytes: {str(e)}")
        return ""

def get_pdf_info(pdf_path: str) -> dict:
    """
    Получает информацию о PDF файле
    
    Args:
        pdf_path: путь к PDF файлу
        
    Returns:
        словарь с информацией о файле
    """
    try:
        doc = fitz.open(pdf_path)
        info = {
            "pages": len(doc),
            "title": doc.metadata.get("title", ""),
            "author": doc.metadata.get("author", ""),
            "subject": doc.metadata.get("subject", ""),
            "keywords": doc.metadata.get("keywords", ""),
        }
        doc.close()
        return info
    except Exception as e:
        logger.error(f"Error getting PDF info: {str(e)}")
        return {}