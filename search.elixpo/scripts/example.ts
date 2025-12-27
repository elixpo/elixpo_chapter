interface SearchConfig {
  apiUrl: string;
  timeout: number;
}

const config: SearchConfig = {
  apiUrl: '/api/search',
  timeout: 5000
};

export function initializeSearch(): void {
  console.log('Search initialized with config:', config);
}

export function performSearch(query: string): Promise<any> {
  return fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  }).then(res => res.json());
}
