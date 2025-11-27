import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_PAT;

export async function fetchGitHubData(projectURL) {
  if (!projectURL) {
    throw new Error('projectURL is required');
  }

  try {
    const [owner, repo] = projectURL.replace("https://github.com/", "").split("/");

    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    });
    
    if (!repoResponse.ok) {
      throw new Error(`GitHub API error: ${repoResponse.status}`);
    }
    
    const repoData = await repoResponse.json();

    const contributorsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    });
    
    const contributors = contributorsRes.ok ? await contributorsRes.json() : [];

    const result = {
      name: repoData.name,
      description: repoData.description,
      stars: repoData.stargazers_count,
      topics: repoData.topics || [],
      owner: repoData.owner.login,
      contributors: contributors.slice(0, 10),
      url: repoData.html_url,
      ownerLogo: repoData.owner.avatar_url
    };

    console.log('GitHub data fetched:', result);
    return result;

  } catch (err) {
    console.error('Error fetching GitHub data:', err);
    throw new Error(`Failed to fetch GitHub data: ${err.message}`);
  }
}

// fetchGitHubData("https://github.com/Circuit-Overtime/elixpo_chapter")