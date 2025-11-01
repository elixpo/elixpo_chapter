import requests
import re
import sys
import os
import time

def get_email_from_github(username, max_repos=10):
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "email-finder-script"
    }

    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"token {token}"
    repos_url = f"https://api.github.com/users/{username}/repos?per_page=100&sort=updated"
    repos = requests.get(repos_url, headers=headers, timeout=15).json()

    non_forked = [r for r in repos if not r.get("fork")]
    if not non_forked:
        print("No non-forked repos found.")
        return

    print(f"Found {len(non_forked)} non-forked repos for {username} — scanning up to {max_repos}...\n")

    for repo in non_forked[:max_repos]:
        repo_name = repo["name"]
        print(f"Checking repo: {repo_name}")
        commits_url = f"https://api.github.com/repos/{username}/{repo_name}/commits?per_page=5"
        commits = requests.get(commits_url, headers=headers, timeout=15).json()

        if not isinstance(commits, list) or len(commits) == 0:
            print("  No commits found or access denied.")
            continue

        for commit in commits:
            sha = commit.get("sha")
            if not sha:
                continue
            patch_url = f"https://github.com/{username}/{repo_name}/commit/{sha}.patch"

            try:
                patch_text = requests.get(patch_url, headers={"User-Agent": "email-finder-script"}, timeout=15).text
            except Exception as e:
                print(f" Error fetching patch: {e}")
                continue

            match = re.search(r"^From:\s+.*<([^>]+)>", patch_text, re.MULTILINE)
            if match:
                email = match.group(1)
                if "noreply.github.com" not in email:
                    print(f"\n Email found: {email}")
                    print(f"   Repo: {repo_name}")
                    print(f"   Commit: {sha}")
                    return email
                else:
                    print("Got noreply email, trying next commit/repo...")
            else:
                print("No email in patch.")
            
            time.sleep(0.5) 

    print("\n No valid (non-noreply) email found after scanning up to 10 repos.")
    return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python get_github_email_from_patch.py <github-username>")
        sys.exit(1)

    username = sys.argv[1]
    get_email_from_github(username)
