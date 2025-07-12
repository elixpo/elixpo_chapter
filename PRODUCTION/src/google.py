from googlesearch import search

query = "python web scraping tutorial"
for result in search(query, num_results=10):
    print(result)
