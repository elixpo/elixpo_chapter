import nltk
import os
import sys
from pathlib import Path
from loguru import logger

# Set NLTK data path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
NLTK_DATA_DIR = PROJECT_ROOT / "searchenv" / "nltk_data"
NLTK_DATA_DIR.mkdir(parents=True, exist_ok=True)

NLTK_DATA_DIR_STR = str(NLTK_DATA_DIR)
if NLTK_DATA_DIR_STR not in nltk.data.path:
    nltk.data.path.insert(0, NLTK_DATA_DIR_STR)

REQUIRED_NLTK_RESOURCES = [
    "punkt",
    "punkt_tab",
    "averaged_perceptron_tagger",
    "averaged_perceptron_tagger_eng",  
    "maxent_ne_chunker",
    "maxent_ne_chunker_tab",
    "stopwords",
    "universal_tagset",
    "words",
]

RESOURCE_PATHS = {
    "punkt": ["tokenizers/punkt", "tokenizers/punkt_tab"],
    "punkt_tab": ["tokenizers/punkt_tab"],
    "averaged_perceptron_tagger": ["taggers/averaged_perceptron_tagger"],
    "averaged_perceptron_tagger_eng": ["taggers/averaged_perceptron_tagger_eng"],
    "maxent_ne_chunker": ["chunkers/maxent_ne_chunker"],
    "maxent_ne_chunker_tab": ["chunkers/maxent_ne_chunker_tab"],
    "stopwords": ["corpora/stopwords"],
    "universal_tagset": ["taggers/universal_tagset", "help/tagsets"],
    "words": ["corpora/words"],
}


def check_nltk_resource(resource_name: str) -> bool:
    candidate_paths = RESOURCE_PATHS.get(resource_name, [resource_name])
    for candidate in candidate_paths:
        try:
            nltk.data.find(candidate)
            return True
        except LookupError:
            continue
    return False


def download_nltk_resource(resource_name: str, retries: int = 3) -> bool:
    for attempt in range(retries):
        try:
            logger.info(f"[NLTK] Downloading {resource_name} (attempt {attempt + 1}/{retries})...")
            download_ok = nltk.download(
                resource_name,
                download_dir=NLTK_DATA_DIR_STR,
                quiet=True
            )
            if not download_ok:
                logger.warning(f"[NLTK] nltk.download returned False for {resource_name}")
            
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
