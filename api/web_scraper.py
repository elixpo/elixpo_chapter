import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import re
from config import MAX_TOTAL_SCRAPE_WORD_COUNT


def fetch_full_text(
    url,
    total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT,
):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        response = requests.get(url, timeout=20, headers=headers)
        if response.status_code != 200:
            print(f"Error:- {url}")
            return "", []
        response.raise_for_status()

        content_type = response.headers.get('Content-Type', '').lower()
        if 'text/html' not in content_type:
            print(f"Skipping non-HTML content from {url} (Content-Type: {content_type})")
            return "", []

        soup = BeautifulSoup(response.content, 'html.parser')

        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button', 'noscript', 'iframe', 'svg']):
            element.extract()

        main_content_elements = soup.find_all(['main', 'article', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p', 'article'], class_=[
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

        return temp_text
        # return text_content.strip()[:MAX_TOTAL_SCRAPE_WORD_COUNT]

    except requests.exceptions.Timeout:
        print(f"Timeout scraping URL: {url}")
        return "", []
    except requests.exceptions.RequestException as e:
        print(f"Request error scraping URL: {url}: {type(e).__name__}: {e}")
        return "", []
    except Exception as e:
        print(f"Error processing URL: {url}: {type(e).__name__}: {e}")
        return "", []


if __name__ == "__main__":
    test_url = "https://www.financialexpress.com/india-news/six-others-have-claimed-as-father-ec-summons-bengal-voters-for-sir-hearing-over-logical-discrepancy/4106668/"
    text = fetch_full_text(test_url)
    print("\n--- Extracted Text ---\n")
    print(text)

