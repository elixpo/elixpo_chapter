from functools import lru_cache
from urllib.parse import urlparse, urlencode, parse_qs
from loguru import logger

# Domains that are ad networks / tracking redirects — never valid sources
_AD_DOMAINS = frozenset({
    "ad.doubleclick.net", "doubleclick.net", "googleadservices.com",
    "googlesyndication.com", "adclick.g.doubleclick.net",
    "clickserve.dartsearch.net", "pagead2.googlesyndication.com",
})

# URL params that are tracking/ad junk — safe to strip
_TRACKING_PARAMS = frozenset({
    "msclkid", "gclid", "gclsrc", "fbclid", "dclid", "utm_source",
    "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_keyword",
    "utm_adgroup", "utm_query", "ad_id", "adgroup_id", "campaign_id",
    "cmp", "partner_id", "network", "device", "match_type", "bid_match_type",
    "loc_interest_ms", "loc_physical_ms", "target_id", "feed_item_id",
    "keyword", "supag", "supca", "supsc", "supai", "supdv", "supnt",
    "suplp", "supli", "supti", "supci", "supkw", "supkw", "supcm",
    "tsem", "ds_s_kwgid", "ds_a_cid", "ds_a_caid", "ds_a_agid",
    "ds_a_lid", "ds_e_adid", "ds_e_target_id", "ds_e_network",
    "ds_url_v", "ds_dest_url",
})


def clean_url(url: str) -> str | None:
    """Strip tracking params from a URL. Returns None if it's an ad domain."""
    if not url or not url.startswith("http"):
        return None
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace("www.", "")

        # Block ad redirect domains entirely
        if domain in _AD_DOMAINS:
            return None

        # For redirect URLs, try to extract the real destination
        if "ds_dest_url" in url or "redirect" in parsed.path.lower():
            qs = parse_qs(parsed.query)
            dest = qs.get("ds_dest_url", qs.get("url", qs.get("q", [None])))[0]
            if dest:
                return clean_url(dest)
            return None

        # Strip tracking params
        qs = parse_qs(parsed.query, keep_blank_values=False)
        cleaned_qs = {k: v for k, v in qs.items() if k.lower() not in _TRACKING_PARAMS}
        cleaned_query = urlencode(cleaned_qs, doseq=True) if cleaned_qs else ""
        cleaned = parsed._replace(query=cleaned_query, fragment="").geturl()
        return cleaned
    except Exception:
        return url


def clean_source_list(urls: list[str]) -> list[str]:
    """Clean and deduplicate a list of source URLs."""
    seen = set()
    result = []
    for url in urls:
        cleaned = clean_url(url)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def get_model_server():

    try:
        from ipcService.coreServiceManager import CoreServiceManager
        manager = CoreServiceManager.get_instance()
        if manager.is_ready():
            return manager  # Return manager object that has get_core_service() method
        else:
            logger.error("[SearchPipeline] CoreServiceManager not ready")
            raise RuntimeError("CoreServiceManager not ready")
    except Exception as e:
        logger.error(f"[SearchPipeline] Failed to get model server: {e}")
        raise


@lru_cache(maxsize=100)
def cached_web_search_key(query: str) -> str:
    return f"web_search_{hash(query)}"

def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"

