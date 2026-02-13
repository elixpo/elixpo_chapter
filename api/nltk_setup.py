import nltk
import os
import sys
from pathlib import Path
from loguru import logger

# Set NLTK data path
NLTK_DATA_DIR = "searchenv/nltk_data"
Path(NLTK_DATA_DIR).mkdir(parents=True, exist_ok=True)
nltk.data.path.insert(0, NLTK_DATA_DIR)
if NLTK_DATA_DIR not in nltk.data.path:
    nltk.data.path.append(NLTK_DATA_DIR)

REQUIRED_NLTK_RESOURCES = [
    "punkt",
    "averaged_perceptron_tagger",
    "averaged_perceptron_tagger_eng",  
    "maxent_ne_chunker",
    "stopwords",
    "wordnet",
    "universal_tagset",
]


def check_nltk_resource(resource_name: str) -> bool:
    try:
        nltk.data.find(resource_name)
        return True
    except LookupError:
        return False


def download_nltk_resource(resource_name: str, retries: int = 3) -> bool:
    for attempt in range(retries):
        try:
            logger.info(f"[NLTK] Downloading {resource_name} (attempt {attempt + 1}/{retries})...")
            nltk.download(
                resource_name,
                download_dir=NLTK_DATA_DIR,
                quiet=True,
                raise_errors=False
            )
            
            # Verify download was successful
            if check_nltk_resource(resource_name):
                logger.info(f"[NLTK] Successfully downloaded {resource_name}")
                return True
            else:
                logger.warning(f"[NLTK] Download for {resource_name} did not result in accessible resource")
        
        except Exception as e:
            logger.warning(f"[NLTK] Attempt {attempt + 1} to download {resource_name} failed: {e}")
    
    return False


def initialize_nltk_data():
    logger.info("[NLTK] Initializing NLTK data setup...")
    
    missing_resources = []
    downloaded_count = 0
    
    for resource in REQUIRED_NLTK_RESOURCES:
        if check_nltk_resource(resource):
            logger.info(f"[NLTK] ✓ {resource} is already available")
        else:
            logger.warning(f"[NLTK] ✗ {resource} is missing, attempting download...")
            if download_nltk_resource(resource):
                downloaded_count += 1
            else:
                missing_resources.append(resource)
    
    if missing_resources:
        logger.warning(f"[NLTK] Failed to download some resources: {missing_resources}")
        logger.warning("[NLTK] Some NLP features may be degraded, but application will continue")
    else:
        logger.info(f"[NLTK] Successfully initialized all required resources (downloaded {downloaded_count})")
    
    logger.info(f"[NLTK] Data paths: {nltk.data.path}")


# Call initialization on import
try:
    initialize_nltk_data()
except Exception as e:
    logger.error(f"[NLTK] Fatal error during initialization: {e}")
    logger.warning("[NLTK] Application will continue, but NLP features may be limited")
