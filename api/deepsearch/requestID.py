from loguru import logger 
from starlette.middleware.base import BaseHTTPMiddleware
import uuid

def reqID():
    return str(uuid.uuid4())[:10]


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = reqID()
        request.state.request_id = request_id
        logger.info(f"Request {request_id} started: {request.method} {request.url}")
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        logger.info(f"Request {request_id} finished")
        return response