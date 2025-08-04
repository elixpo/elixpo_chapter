import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import re
from conditional_print import conditional_print
from config import SCRAPE_IMAGE, MAX_TOTAL_SCRAPE_WORD_COUNT, scrape_website_show_log, MAX_IMAGES_TO_INCLUDE


def fetch_full_text(
    url,
    total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT,
    show_logs=scrape_website_show_log
):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        response = requests.get(url, timeout=20, headers=headers)
        if response.status_code != 200:
            conditional_print(f"Error:- {url}", show_logs)
            return "", []
        response.raise_for_status()

        content_type = response.headers.get('Content-Type', '').lower()
        if 'text/html' not in content_type:
            conditional_print(f"Skipping non-HTML content from {url} (Content-Type: {content_type})", show_logs)
            return "", []

        soup = BeautifulSoup(response.content, 'html.parser')

        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button', 'noscript', 'iframe', 'svg']):
            element.extract()

        main_content_elements = soup.find_all(['main', 'article', 'div', 'section'], class_=[
            'main', 'content', 'article', 'post', 'body', 'main-content', 'entry-content', 'blog-post'
        ])
        if not main_content_elements:
            main_content_elements = [soup.find('body')] if soup.find('body') else [soup]

        # Extract text
        temp_text = []
        word_count = 0
        for main_elem in main_content_elements:
            if word_count >= total_word_count_limit:
                break
            for tag in main_elem.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'div']):
                if word_count >= total_word_count_limit:
                    break
                text = re.sub(r'\s+', ' ', tag.get_text()).strip()
                if text:
                    words = text.split()
                    words_to_add = words[:total_word_count_limit - word_count]
                    if words_to_add:
                        temp_text.append(" ".join(words_to_add))
                        word_count += len(words_to_add)

        text_content = '\n\n'.join(temp_text)
        if word_count >= total_word_count_limit:
            text_content = ' '.join(text_content.split()[:total_word_count_limit]) + '...'


        return text_content.strip()[:MAX_TOTAL_SCRAPE_WORD_COUNT]

    except requests.exceptions.Timeout:
        conditional_print(f"Timeout scraping URL: {url}", show_logs)
        return "", []
    except requests.exceptions.RequestException as e:
        conditional_print(f"Request error scraping URL: {url}: {type(e).__name__}: {e}", show_logs)
        return "", []
    except Exception as e:
        conditional_print(f"Error processing URL: {url}: {type(e).__name__}: {e}", show_logs)
        return "", []


def is_likely_image_url_heuristic(url):
    if not url:
        return False
    lower_url = url.lower()
    path_part = urlparse(url).path

    # File extension check
    if not any(path_part.endswith(ext) for ext in ['.png', '.jpg', '.jpeg']):
        return False

    # Exclude common small/unwanted patterns
    if any(keyword in lower_url for keyword in ['/icon/', '/logo/', '/loader/', '/sprite/', '/thumbnail/', '/small/', '/avatar/', '/advert', '/ad_/', 'pixel', '1x1', 'badge', 'button']):
        return False

    # Exclude tiny images via URL hints
    size_patterns = [
        r'/(\d+)x(\d+)/',
        r'-(\d+)x(\d+)\.',
        r'width=(\d+)&',
        r'height=(\d+)&',
        r'&w=(\d+)',
        r'&h=(\d+)'
    ]
    min_dim_threshold = 150
    for pattern in size_patterns:
        matches = re.findall(pattern, lower_url)
        dims = [int(d) for group in matches for d in group if d.isdigit()]
        if dims and any(dim < min_dim_threshold for dim in dims):
            return False

    return True


if __name__ == "__main__":
    test_url = "https://www.hindustantimes.com/india-news/bengal-woman-trying-to-escape-drunk-eve-teasers-dies-in-road-accident-101740391266434.html"
    text, images = fetch_full_text(test_url)
    print("\n--- Extracted Text ---\n")
    print(text)
    print("\n--- Extracted Images ---\n")
    for img in images:
        print(img)
