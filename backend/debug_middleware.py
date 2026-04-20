from fastapi import Request
import json

DEBUG_MODE = True  

async def debug_middleware(request: Request, call_next):
    response = await call_next(request)
    
    if "/api/exam/start" in request.url.path and DEBUG_MODE:
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        
        data = json.loads(body.decode())
        
        if "questions" in data:
            for q in data["questions"]:
                q["correct_answer"] = "[ОТЛАДКА] Это правильный ответ на вопрос"
        
        from fastapi.responses import JSONResponse
        return JSONResponse(content=data)
    
    return response