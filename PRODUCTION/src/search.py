import requests
from time import sleep
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

"""
Perform a Google search for the given query using Playwright, filter out blacklisted domains, and return up to 7 result URLs.
Args:
    query (str): The search query string.
Returns:
    list: A list of up to 7 filtered result URLs from Google search.
"""
# Uses Playwright to scrape Google search results, filtering out blacklisted domains.
"""
Perform a search on Mojeek for the given query and return up to 5 result URLs.
Args:
    query (str): The search query string.
Returns:
    list: A list of up to 5 result URLs from Mojeek search.
"""
# Uses requests and BeautifulSoup to scrape Mojeek search results.
"""
Perform a search on DuckDuckGo (HTML version) for the given query and return up to 5 result URLs.
Args:
    query (str): The search query string.
Returns:
    list: A list of up to 5 result URLs from DuckDuckGo search.
"""
# Uses requests and BeautifulSoup to scrape DuckDuckGo search results.


def google_search(query):
    blacklist = ["maps.google.", "support.google.", "accounts.google.", "policies.google.", "images.google.", "google.com/preferences", "https://www.instagram.com/reel", "https://www.instagram.com/p", "youtube.com/shorts", "youtube.com/live", "https://www.facebook.com/", "https://www.facebook.com/p"]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=[
            "--disable-blink-features=AutomationControlled",
        ])
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/114.0.0.0 Safari/537.36",
            viewport={'width': 1280, 'height': 800},
            java_script_enabled=True,
            locale="en-US"
        )

        page = context.new_page()

        # Prevent bot detection
        page.add_init_script(
            """Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"""
        )

        page.goto(f"https://www.google.com/search?q={query}", timeout=60000)
        page.wait_for_selector('a[jsname]')

        links = page.locator('a[jsname]')
        results = []

        for i in range(links.count()):
            href = links.nth(i).get_attribute("href")
            if href and href.startswith("http") and not any(bad in href for bad in blacklist):
                results.append(href)

        browser.close()
        return results[:7]


def mojeek_form_search(query):
    url = "https://www.mojeek.com/search"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Referer": "https://www.mojeek.com/",
        "Accept": "text/html"
    }
    params = {"q": query}

    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        results = soup.select("ul.results-standard li")
        links = []

        for r in results[:5]:
            title_tag = r.select_one("a.title")
            if title_tag and title_tag.has_attr("href"):
                links.append(title_tag["href"])

        return links

    except requests.exceptions.RequestException as e:
        print("❌ Mojeek request failed:", e)
        return []


def ddgs_search(query):
    url = "https://html.duckduckgo.com/html/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    }
    data = {"q": query}

    try:
        response = requests.post(url, data=data, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        links = []
        for a in soup.select("a.result__a"):
            href = a.get("href")
            if href and href.startswith("http"):
                links.append(href)

        return links[:5]

    except Exception as e:
        print("❌ DDG search failed:", e)
        return []


# ---------- Testing ----------
if __name__ == "__main__":
    print("\nMOJEEK:")
    for urls in mojeek_form_search("sign language detection using cnn"):
        print(urls)

    print("\nDDGS:")
    for url in ddgs_search("the best sign language detection using cnn"):
        print(url)

    print("\nGOOGLE:")
    for url in google_search("jis university"):
        print(url)
