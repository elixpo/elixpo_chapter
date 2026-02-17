from app.main import create_app
from app.utils import setup_logger
logger = setup_logger("lixsearch-api")


if __name__ == "__main__":
    logger.info("[MAIN] Initializing ElixpoSearch API...")
    elixpo_app = create_app()
    elixpo_app.run(host="0.0.0.0", port=8000, workers=1)
