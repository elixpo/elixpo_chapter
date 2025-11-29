from multiprocessing.managers import BaseManager
from utility import fetch_url_content_parallel
import re

class modelManager(BaseManager): pass
modelManager.register("accessSearchAgents")
modelManager.register("ipcService")

manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
manager.connect()

# Get the search service
search_service = manager.accessSearchAgents()


def main():
    urls = search_service.image_search("eiffel_tower")
    print(urls)

if __name__ == "__main__":
    main()