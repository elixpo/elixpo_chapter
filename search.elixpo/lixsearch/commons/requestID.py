from loguru import logger 
from starlette.middleware.base import BaseHTTPMiddleware
import uuid
from pipeline.config import REQUEST_ID_LEGACY_SLICE_SIZE

def reqID():
    return str(uuid.uuid4())[:REQUEST_ID_LEGACY_SLICE_SIZE]


def _request_log_target(request) -> str:
    """Return a useful request target without ever logging query values."""
    return request.url.path


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = reqID()
        request.state.request_id = request_id
        logger.info(
            f"Request {request_id} started: {request.method} {_request_log_target(request)}"
        )
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        logger.info(f"Request {request_id} finished")
        return response