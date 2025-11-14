import requests
from datetime import datetime, timezone

GITHUB_TOKEN = "" 
OWNER = "Itachi-1824"
REPO = "Temp-Will-be-deleted-"
START_DATE = "2025-11-01T00:00:00Z"
# END_DATE = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
END_DATE = "2025-11-08T00:00:00Z"  

def get_merged_prs(owner, repo, start_date, end_date, token):
    base_url = "https://api.github.com/search/issues"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}"
    }

    query = f"repo:{owner}/{repo} is:pull-request is:merged merged:{start_date}..{end_date}"
    params = {"q": query, "per_page": 100, "page": 1}

    all_prs = []
    print(f"Fetching merged PRs from {start_date} to {end_date}...\n")

    while True:
        response = requests.get(base_url, headers=headers, params=params)
        if response.status_code != 200:
            print(f"Error: {response.status_code} -> {response.text}")
            break

        data = response.json()
        items = data.get("items", [])
        all_prs.extend(items)
        if "next" not in response.links:
            break

        params["page"] += 1

    return all_prs


if __name__ == "__main__":
    prs = get_merged_prs(OWNER, REPO, START_DATE, END_DATE, GITHUB_TOKEN)

    print(f"\n Found {len(prs)} merged PR(s) in given range:\n")

    for pr in prs:
        print(f"#{pr['number']} | {pr['title']} | by {pr['user']['login']} | merged_at: {pr['closed_at']}")
