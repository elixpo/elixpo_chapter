allUsers = [];
let filteredUsers = [];
let currentFilter = 'all';

const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');
const leaderboardBody = document.getElementById('leaderboardBody');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const totalUsersEl = document.getElementById('totalUsers');
const completedUsersEl = document.getElementById('completedUsers');
const lastUpdatedEl = document.getElementById('lastUpdated');
const completedCountEl = document.getElementById('completedCount');
const redeemedCountEl = document.getElementById('redeemedCount');

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
    updateLastUpdated();
});

async function loadData() {
    try {
        showLoading(true);
        const csvUrl = 'https://raw.githubusercontent.com/Circuit-Overtime/gdg.jisu/refs/heads/main/data/data.csv';
        const csvResponse = await fetch(csvUrl);
        if (!csvResponse.ok) throw new Error(`CSV fetch failed: ${csvResponse.status}`);
        const csvText = await csvResponse.text();
        console.log('Loaded CSV from raw.githubusercontent.com');

        allUsers = parseCSV(csvText);
        processUsers();
        updateStats();
        renderLeaderboard(allUsers);

        // Try to fetch last commit time for data.csv and show it
        try {
            const commitDate = await fetchLastCommitDate('Circuit-Overtime', 'gdg.jisu', 'data/data.csv', 'main');
            updateLastUpdated(commitDate);
        } catch (err) {
            console.warn('Could not fetch last commit date:', err);
            updateLastUpdated(); // fallback to now
        }

        showLoading(false);
    } catch (error) {
        console.error('Error loading data:', error);
        showLoading(false);
        showEmptyState(true);
    }
}

async function fetchLastCommitDate(owner, repo, path, branch = 'main') {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(branch)}&per_page=1`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`GitHub API responded with ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No commits found for file');
    }
    const commit = data[0];
    const dateStr = commit.commit?.author?.date || commit.commit?.committer?.date;
    if (!dateStr) {
        throw new Error('Commit date not found in response');
    }
    return new Date(dateStr);
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    const users = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const values = parseCSVLine(line);
        if (values.length < headers.length) continue;
        let userName = values[0]?.trim() || 'Unknown';
        const userEmail = values[1]?.trim() || '';
        const profileUrl = values[2]?.trim() || '';
        if (userName === 'gdg.nit@gmail.com') {
            userName = 'Suman Jash';
        } else if (userName === 'https://www.cloudskillsboost.google/public_profiles/d1b5eca9-3675-41a9-bf18-b995d8622d29') {
            userName = 'Mohd Faraz';
        }
        const user = {
            name: userName,
            email: userEmail,
            profileUrl: profileUrl,
            profileStatus: values[3]?.trim() || '',
            accessCodeRedeemed: values[4]?.trim() === 'Yes',
            allCompleted: values[5]?.trim() === 'Yes',
            badgesCount: parseInt(values[6]) || 0,
            badgeNames: values[7]?.trim() || '',
            gamesCount: parseInt(values[8]) || 0,
            gameNames: values[9]?.trim() || ''
        };
        users.push(user);
    }
    return users;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function processUsers() {
    allUsers.sort((a, b) => {
        if (b.badgesCount !== a.badgesCount) {
            return b.badgesCount - a.badgesCount;
        }
        if (b.gamesCount !== a.gamesCount) {
            return b.gamesCount - a.gamesCount;
        }
        return a.name.localeCompare(b.name);
    });
    allUsers.forEach((user, index) => {
        user.rank = index + 1;
    });
}

function renderLeaderboard(users) {
    if (users.length === 0) {
        showEmptyState(true);
        return;
    }
    showEmptyState(false);
    leaderboardBody.innerHTML = '';
    users.forEach((user, index) => {
        const row = createUserRow(user, index);
        leaderboardBody.appendChild(row);
    });
}

function createUserRow(user, index) {
    const tr = document.createElement('tr');
    tr.style.setProperty('--index', index);
    const rankTd = document.createElement('td');
    rankTd.innerHTML = getRankHTML(user.rank);
    tr.appendChild(rankTd);
    const nameTd = document.createElement('td');
    nameTd.innerHTML = getUserInfoHTML(user);
    tr.appendChild(nameTd);
    const badgesTd = document.createElement('td');
    badgesTd.className = 'td-center';
    badgesTd.innerHTML = getBadgeCountHTML(user.badgesCount);
    badgesTd.title = user.badgeNames || 'No badges completed';
    tr.appendChild(badgesTd);
    const gamesTd = document.createElement('td');
    gamesTd.className = 'td-center';
    gamesTd.innerHTML = getGameCountHTML(user.gamesCount);
    gamesTd.title = user.gameNames || 'No games completed';
    tr.appendChild(gamesTd);
    const codeTd = document.createElement('td');
    codeTd.className = 'td-center';
    codeTd.innerHTML = getRedeemedHTML(user.accessCodeRedeemed);
    tr.appendChild(codeTd);
    const statusTd = document.createElement('td');
    statusTd.innerHTML = getStatusHTML(user);
    tr.appendChild(statusTd);
    return tr;
}

function getRankHTML(rank) {
    let medal = '';
    let className = 'rank';
    if (rank === 1) {
        medal = '🥇';
        className += ' top-1';
    } else if (rank === 2) {
        medal = '🥈';
        className += ' top-2';
    } else if (rank === 3) {
        medal = '🥉';
        className += ' top-3';
    }
    return `
        <div class="${className}">
            ${medal ? `<span class="medal">${medal}</span>` : ''}
            <span class="rank-number">${rank}</span>
        </div>
    `;
}

function getUserInfoHTML(user) {
    const initials = getInitials(user.name);
    return `
        <div class="user-info">
            <div class="avatar">${initials}</div>
            <div class="user-details">
                <a href="${user.profileUrl}" target="_blank" rel="noopener noreferrer" class="user-name">
                    ${escapeHTML(user.name)}
                </a>
            </div>
        </div>
    `;
}

function getBadgeCountHTML(count) {
    let className = 'badge-count';
    if (count >= 15) {
        className += ' very-high';
    } else if (count >= 5) {
        className += ' high';
    }
    return `<div class="${className}">${count}</div>`;
}

function getGameCountHTML(count) {
    let className = 'badge-count';
    if (count >= 1) {
        className += ' high';
    }
    return `<div class="${className}">${count}</div>`;
}

function getRedeemedHTML(redeemed) {
    if (redeemed) {
        return '<div class="redeemed yes">✓</div>';
    }
    return '<div class="redeemed no">✗</div>';
}

function getStatusHTML(user) {
    if (user.allCompleted) {
        return '<div class="status completed">✓ Completed</div>';
    } else if (user.badgesCount > 0 || user.gamesCount > 0) {
        return '<div class="status in-progress">In Progress</div>';
    }
    return '<div class="status not-started">Not Started</div>';
}

function setupEventListeners() {
    searchInput.addEventListener('input', debounce(applyFilters, 300));
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            applyFilters();
        });
    });
}

function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();
    let filtered = allUsers;
    if (query) {
        filtered = filtered.filter(user => 
            user.name.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query)
        );
    }
    if (currentFilter === 'completed') {
        filtered = filtered.filter(user => user.allCompleted);
    } else if (currentFilter === 'redeemed') {
        filtered = filtered.filter(user => user.accessCodeRedeemed);
    }
    filteredUsers = filtered;
    renderLeaderboard(filtered);
}

function updateStats() {
    const total = allUsers.length;
    const completed = allUsers.filter(u => u.allCompleted).length;
    const redeemed = allUsers.filter(u => u.accessCodeRedeemed).length;
    animateValue(totalUsersEl, 0, total, 1000);
    animateValue(completedUsersEl, 0, completed, 1000);
    animateValue(completedCountEl, 0, completed, 1000);
    animateValue(redeemedCountEl, 0, redeemed, 1000);
}

function animateValue(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    const timer = setInterval(() => {
        current += increment;
        if (current >= end) {
            element.textContent = end;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showLoading(show) {
    loadingState.style.display = show ? 'flex' : 'none';
}

function showEmptyState(show) {
    emptyState.style.display = show ? 'flex' : 'none';
}

function updateLastUpdated(date) {
    const now = (date instanceof Date) ? date : new Date();
    const formatted = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    lastUpdatedEl.textContent = formatted;
}

window.leaderboardApp = {
    allUsers,
    filteredUsers,
    loadData,
    renderLeaderboard
};