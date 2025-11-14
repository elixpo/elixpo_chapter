import requests

BASE_URL = "http://localhost:5000"

def test_test_endpoint():
    response = requests.get(f"{BASE_URL}/test")
    print("/test:", response.status_code, response.json())


def test_search_get():
    response = requests.get(f"{BASE_URL}/search", params={"query": "What is AI?"})
    print("/search GET:", response.status_code, response.json())


def test_search_post_query():
    payload = {"query": "What is Quantum Computing?"}
    response = requests.post(f"{BASE_URL}/search", json=payload)
    print("/search POST (query):", response.status_code, response.json())

def test_search_post_messages():
    payload = {
        "messages": [
            {"role": "user", "content": "Tell me about Python programming."}
        ]
    }
    response = requests.post(f"{BASE_URL}/search", json=payload)
    print("/search POST (messages):", response.status_code, response.json())


def test_search_sse():
    payload = {"query": "Explain Machine Learning basics"}
    with requests.post(f"{BASE_URL}/search/sse", json=payload, stream=True) as response:
        print("/search/sse:", response.status_code)
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode("utf-8").strip()
                print(decoded_line)
                if "final" in decoded_line or "Didn't Wait" in decoded_line:
                    break



def main():
    #  test_test_endpoint()
    #  test_search_get()
     test_search_post_query()
    # test_search_post_messages()
    #  test_search_sse()
    #  test_chat_completions_post()


if __name__ == "__main__":
    main()
