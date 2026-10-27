import logging
import uuid
from quart import request, jsonify
from commons.searching_based import webSearch, imageSearch
from app.utils import validate_query
from pipeline.config import X_REQ_ID_SLICE_SIZE, LOG_MESSAGE_QUERY_TRUNCATE

logger = logging.getLogger("lixsearch-api")

SURF_MIN_LIMIT = 1
SURF_MAX_LIMIT = 20
SURF_DEFAULT_LIMIT = 5


async def surf(pipeline_initialized: bool):
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    try:
        if request.method == 'GET':
            query = request.args.get("query", "").strip()
            limit = request.args.get("limit", str(SURF_DEFAULT_LIMIT))
            images_param = request.args.get("images", "false").lower()
        else:
            data = await request.get_json()
            query = data.get("query", "").strip()
            limit = str(data.get("limit", SURF_DEFAULT_LIMIT))
            images_param = str(data.get("images", False)).lower()

        if not validate_query(query):
            return jsonify({"error": "Invalid or missing query"}), 400

        try:
            limit = max(SURF_MIN_LIMIT, min(SURF_MAX_LIMIT, int(limit)))
        except (ValueError, TypeError):
            limit = SURF_DEFAULT_LIMIT

        include_images = images_param in ("true", "1", "yes")

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])
        logger.info(f"[{request_id}] surf query={query[:LOG_MESSAGE_QUERY_TRUNCATE]} limit={limit} images={include_images}")

        urls = await webSearch(query)
        urls = urls[:limit] if urls else []

        result = {
            "urls": urls,
            "query": query,
        }

        if include_images:
            image_urls = await imageSearch(query, max_images=limit)
            result["images"] = image_urls if image_urls else []

        logger.info(f"[{request_id}] surf returned {len(urls)} urls" +
                     (f", {len(result.get('images', []))} images" if include_images else ""))

        return jsonify(result)

    except Exception as e:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])
        logger.error(f"[{request_id}] Surf error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
