from multiprocessing.managers import BaseManager
from utility import fetch_url_content_parallel
import re

class modelManager(BaseManager): pass
modelManager.register("accessSearchAgents")

manager = modelManager(address=("localhost", 5002), authkey=b"ipcService")
manager.connect()

# Get the search service
search_service = manager.accessSearchAgents()

def main():
    urls = search_service.web_search("Eiffel Tower")
    print(urls)

if __name__ == "__main__":
    main()