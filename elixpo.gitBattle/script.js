// GitHub Battle Report Generator
// Main Application Logic

class GitHubBattle {
    constructor() {
        this.user1Data = null;
        this.user2Data = null;
        this.roastMode = 'friendly';
        this.theme = 'christmas';
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('battle-btn').addEventListener('click', () => this.generateBattle());
        document.getElementById('pdf-btn').addEventListener('click', () => this.downloadPDF());
        document.querySelectorAll('input[name="roast-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.roastMode = e.target.value);
        });
        document.getElementById('theme-select').addEventListener('change', (e) => this.theme = e.target.value);
    }

    async generateBattle() {
        const user1 = document.getElementById('user1').value.trim();
        const user2 = document.getElementById('user2').value.trim();

        if (!user1 || !user2) {
            this.showError('Please enter both GitHub usernames!');
            return;
        }

        try {
            this.showLoading(true);
            this.hideError();

            // Fetch data for both users
            [this.user1Data, this.user2Data] = await Promise.all([
                this.fetchUserData(user1),
                this.fetchUserData(user2)
            ]);

            // Generate and display report
            this.displayResults();
            document.getElementById('pdf-btn').style.display = 'block';
        } catch (error) {
            this.showError(`Error: ${error.message}`);
            console.error(error);
        } finally {
            this.showLoading(false);
        }
    }

    async fetchUserData(username) {
        const userResponse = await fetch(`https://api.github.com/users/${username}`);
        if (!userResponse.ok) throw new Error(`User ${username} not found`);
        const user = await userResponse.json();

        // Fetch repos
        const reposResponse = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=stars&order=desc`);
        if (!reposResponse.ok) throw new Error(`Could not fetch repos for ${username}`);
        const repos = await reposResponse.json();

        // Fetch contributions (using GraphQL for better data)
        const contributionsData = await this.fetchContributions(username);

        return {
            profile: user,
            repos: repos,
            contributions: contributionsData
        };
    }

    async fetchContributions(username) {
        // Fallback: Get contribution count from profile
        try {
            const response = await fetch(`https://api.github.com/users/${username}/events/public?per_page=100`);
            const events = await response.json();
            
            let commits = 0;
            let pushEvents = 0;
            let lastCommitDate = null;

            if (Array.isArray(events)) {
                events.forEach(event => {
                    if (event.type === 'PushEvent') {
                        pushEvents++;
                        commits += event.payload.size || 0;
                        if (!lastCommitDate) lastCommitDate = event.created_at;
                    }
                });
            }

            return {
                totalCommits: commits,
                pushEvents: pushEvents,
                lastCommitDate: lastCommitDate,
                eventsCount: events.length
            };
        } catch (e) {
            return {
                totalCommits: 0,
                pushEvents: 0,
                lastCommitDate: null,
                eventsCount: 0
            };
        }
    }

    calculateStats(userData) {
        const profile = userData.profile;
        const repos = userData.repos;
        const contributions = userData.contributions;

        // Total stats
        const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
        const totalForks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
        const accountAgeYears = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        
        // Star power (stars per year of account)
        const starPower = accountAgeYears > 0 ? (totalStars / accountAgeYears).toFixed(2) : totalStars;

        // Top languages
        const languages = {};
        repos.forEach(repo => {
            if (repo.language) {
                languages[repo.language] = (languages[repo.language] || 0) + 1;
            }
        });
        const topLanguage = Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

        // Repo hygiene (ratio of open to total issues)
        let totalIssues = 0;
        let openIssues = 0;
        repos.forEach(repo => {
            totalIssues += repo.open_issues_count || 0;
            openIssues += repo.open_issues_count || 0;
        });

        return {
            totalRepos: profile.public_repos,
            followers: profile.followers,
            following: profile.following,
            totalStars,
            totalForks,
            accountAge: accountAgeYears,
            starPower,
            topLanguage,
            repoHygiene: totalIssues > 0 ? ((totalIssues - openIssues) / totalIssues * 100).toFixed(0) : 100,
            openIssues: openIssues,
            totalIssues: totalIssues,
            commits: contributions.totalCommits,
            lastCommit: contributions.lastCommitDate,
            bio: profile.bio || 'No bio provided',
            avatar: profile.avatar_url,
            name: profile.name || profile.login,
            socialLife: profile.followers > 0 ? profile.followers / (profile.following || 1) : 0
        };
    }

    generateRoast(stats1, stats2, isPlayer1 = true) {
        const player = isPlayer1 ? 'User 1' : 'User 2';
        const opponent = isPlayer1 ? 'User 2' : 'User 1';
        const pStats = isPlayer1 ? stats1 : stats2;
        const oStats = isPlayer1 ? stats2 : stats1;

        let roasts = [];

        if (this.roastMode === 'friendly') {
            roasts = [
                `${player} has ${pStats.totalStars} stars! That's dedication! 🌟`,
                `${player} follows ${pStats.following} people. Networking champion! 👥`,
                `${pStats.accountAge} years on GitHub. That's loyalty! 🎖️`,
                `${player} likes ${pStats.topLanguage}. A person of culture! 🎭`,
                `${player}'s repos are well-organized! Great job! 📚`,
            ];
        } else if (this.roastMode === 'gen-z') {
            roasts = [
                `${player} really said "let me collect ${pStats.totalStars} stars" fr fr no cap 💀`,
                `${player} been on GitHub for ${pStats.accountAge} years and still struggling ngl 😭`,
                `${player} following ${pStats.following} people? That's giving "touch grass" energy 🚪`,
                `${player}'s code smell? STANKY ${pStats.topLanguage} energy 🌀`,
                `${player} got ${pStats.openIssues} open issues... oop- 💅`,
                `Meanwhile ${opponent} really said "I don't know her" 👻`,
            ];
        } else if (this.roastMode === 'toxic') {
            roasts = [
                `${player} flexing ${pStats.totalStars} stars like they invented GitHub 🤡`,
                `${opponent} has ${oStats.totalStars} stars. ${player} collecting dust with ${pStats.totalStars} 😅`,
                `${player} been ghosting commits since ${new Date(pStats.lastCommit).getFullYear() || 'forever'} 👻`,
                `${pStats.openIssues} open issues on ${player}'s repos. That's a graveyard 🪦`,
                `${player} following more people than they have repos. Clown behavior 🤡`,
                `${player} changing ${pStats.topLanguage}? More like ${pStats.topLanguage} changing ${player} 💀`,
                `${opponent} really said "let me show you how it's done" 🔥`,
            ];
        }

        return roasts[Math.floor(Math.random() * roasts.length)];
    }

    displayResults() {
        const stats1 = this.calculateStats(this.user1Data);
        const stats2 = this.calculateStats(this.user2Data);

        // Display player cards
        this.displayPlayerCard(1, stats1, stats2);
        this.displayPlayerCard(2, stats2, stats1);

        // Display comparison table
        this.displayComparisonTable(stats1, stats2);

        // Display fun metrics
        this.displayFunMetrics(stats1, stats2);

        // Display top repos
        this.displayTopRepos(stats1, stats2);

        // Generate and display memes
        this.displayMemes(stats1, stats2);

        // Display sarcastic commentary
        this.displaySarcasm(stats1, stats2);

        // Display scoreboard
        this.displayScoreboard(stats1, stats2);

        // Display verdict
        this.displayVerdict(stats1, stats2);

        // Show results section
        document.getElementById('results').classList.remove('hidden');
    }

    displayPlayerCard(playerNum, stats, oppositeStats) {
        const prefix = `${playerNum}`;
        const roast = this.generateRoast(this.calculateStats(this.user1Data), this.calculateStats(this.user2Data), playerNum === 1);

        document.getElementById(`avatar${prefix}`).src = stats.avatar;
        document.getElementById(`name${prefix}`).textContent = stats.name;
        document.getElementById(`bio${prefix}`).textContent = stats.bio;
        document.getElementById(`repos${prefix}`).textContent = stats.totalRepos;
        document.getElementById(`followers${prefix}`).textContent = stats.followers;
        document.getElementById(`stars${prefix}`).textContent = stats.totalStars;
        document.getElementById(`age${prefix}`).textContent = `${stats.accountAge} years`;
        document.getElementById(`roast${prefix}`).textContent = roast;
    }

    displayComparisonTable(stats1, stats2) {
        const metrics = [
            { label: 'Total Repos', val1: stats1.totalRepos, val2: stats2.totalRepos },
            { label: 'Followers', val1: stats1.followers, val2: stats2.followers },
            { label: 'Following', val1: stats1.following, val2: stats2.following },
            { label: 'Total Stars', val1: stats1.totalStars, val2: stats2.totalStars },
            { label: 'Total Forks', val1: stats1.totalForks, val2: stats2.totalForks },
            { label: 'Star Power/Year', val1: stats1.starPower, val2: stats2.starPower },
            { label: 'Top Language', val1: stats1.topLanguage, val2: stats2.topLanguage },
            { label: 'Open Issues', val1: stats1.openIssues, val2: stats2.openIssues },
            { label: 'Account Age (Years)', val1: stats1.accountAge, val2: stats2.accountAge },
            { label: 'Last Active', val1: new Date(stats1.lastCommit).toLocaleDateString() || 'Unknown', val2: new Date(stats2.lastCommit).toLocaleDateString() || 'Unknown' },
        ];

        const tbody = document.getElementById('comparison-tbody');
        tbody.innerHTML = '';

        metrics.forEach(metric => {
            const row = document.createElement('tr');
            const isWinner1 = typeof metric.val1 === 'number' && typeof metric.val2 === 'number' && metric.val1 > metric.val2;
            const isWinner2 = typeof metric.val1 === 'number' && typeof metric.val2 === 'number' && metric.val2 > metric.val1;

            row.innerHTML = `
                <td class="${isWinner1 ? 'winner-badge' : ''}">${metric.val1}</td>
                <td class="font-bold text-gray-700">${metric.label}</td>
                <td class="${isWinner2 ? 'winner-badge' : ''}">${metric.val2}</td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById('user1-header').textContent = this.user1Data.profile.login;
        document.getElementById('user2-header').textContent = this.user2Data.profile.login;
    }

    displayFunMetrics(stats1, stats2) {
        const metrics = [
            {
                title: '🔥 Code Commitment Index 🔥',
                roast1: `${stats1.commits} commits. ${stats1.commits > 0 ? 'Actually coding!' : 'Ghost mode activated!'}`,
                roast2: `${stats2.commits} commits. ${stats2.commits > 0 ? 'Also coding!' : 'Equally invisible!'}`
            },
            {
                title: '⭐ Star Power Rating ⭐',
                roast1: `${stats1.starPower} stars/year. ${stats1.starPower > stats2.starPower ? 'Star collector extraordinaire!' : 'Just collecting slowly...'}`,
                roast2: `${stats2.starPower} stars/year. ${stats2.starPower > stats1.starPower ? 'The real star hoarder!' : 'Also just vibing...'}`
            },
            {
                title: '🧹 Repo Hygiene Score 🧹',
                roast1: `${stats1.repoHygiene}% clean. ${stats1.repoHygiene > 70 ? 'Tidy developer!' : 'Needs a spring cleaning...'}`,
                roast2: `${stats2.repoHygiene}% clean. ${stats2.repoHygiene > 70 ? 'Also very organized!' : 'Also messy vibes...'}`
            },
            {
                title: '👥 Open Source Social Life 👥',
                roast1: `${stats1.followers} followers. ${stats1.followers > stats2.followers ? 'Internet celebrity status!' : 'Still working on that...'}`,
                roast2: `${stats2.followers} followers. ${stats2.followers > stats1.followers ? 'The real celebrity!' : 'Also needs followers...'}`
            },
            {
                title: '🎄 Dec 25 Audit 🎄',
                roast1: `Last commit: ${stats1.lastCommit ? new Date(stats1.lastCommit).toLocaleDateString() : 'Never'}. ${stats1.lastCommit ? 'Stays busy even on holidays!' : 'Year off? Lucky you!'}`,
                roast2: `Last commit: ${stats2.lastCommit ? new Date(stats2.lastCommit).toLocaleDateString() : 'Never'}. ${stats2.lastCommit ? 'Also a workaholic!' : 'Same energy!'}`
            },
            {
                title: '💻 Main Language Flex 💻',
                roast1: `${stats1.topLanguage}. ${this.getLanguageRoast(stats1.topLanguage, this.roastMode)}`,
                roast2: `${stats2.topLanguage}. ${this.getLanguageRoast(stats2.topLanguage, this.roastMode)}`
            }
        ];

        const grid = document.getElementById('metrics-grid');
        grid.innerHTML = '';

        metrics.forEach(metric => {
            const card = document.createElement('div');
            card.className = 'metric-card';
            card.innerHTML = `
                <div class="metric-title">${metric.title}</div>
                <div class="mt-3 space-y-2">
                    <div class="metric-roast">👤 ${metric.roast1}</div>
                    <div class="metric-roast">👤 ${metric.roast2}</div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    getLanguageRoast(language, mode) {
        const roasts = {
            friendly: {
                'JavaScript': 'Versatile choice!',
                'Python': 'Data science energy!',
                'Java': 'Enterprise vibes!',
                'C++': 'Performance focused!',
                'Go': 'Concurrency master!',
                'Rust': 'Safety first!',
                'TypeScript': 'Type safety advocate!',
                'PHP': 'Web warrior!',
                'C#': 'Microsoft fan!',
            },
            'gen-z': {
                'JavaScript': 'JS boys never learn 💀',
                'Python': 'Snake language supremacy ✨',
                'Java': 'Still stuck in 2005',
                'C++': 'Memory management? Never heard of her',
                'Go': 'Go? More like No 💀',
                'Rust': 'Borrow checker? No thanks oop-',
                'TypeScript': 'JS but with training wheels',
                'PHP': 'Crack code detected',
                'C#': 'Java but Microsoft',
            },
            'toxic': {
                'JavaScript': 'Callback hell champion 🔥',
                'Python': 'Tabs vs spaces: still broken',
                'Java': 'Null pointer exception speedrunner',
                'C++': 'Segmentation fault is calling',
                'Go': 'Goroutines go brrrr (into deadlock)',
                'Rust': 'Compiler owns you',
                'TypeScript': 'I paid for the full language',
                'PHP': 'Please just quit',
                'C#': 'Java but slower',
            }
        };

        return roasts[mode]?.[language] || `Master of ${language}!`;
    }

    displayTopRepos(stats1, stats2) {
        const container = document.getElementById('repos-container');
        container.innerHTML = '';

        // User 1 repos
        const user1Column = document.createElement('div');
        user1Column.innerHTML = '<h3 class="text-xl font-bold mb-4">' + this.user1Data.profile.login + '</h3>';
        this.user1Data.repos.slice(0, 3).forEach((repo, index) => {
            const card = document.createElement('div');
            card.className = 'repo-card mb-4';
            card.innerHTML = `
                <div class="repo-name">${index + 1}. ${repo.name}</div>
                <div class="text-sm text-gray-600 mb-2">${repo.description || 'No description'}</div>
                <div class="flex justify-around text-sm">
                    <span>⭐ ${repo.stargazers_count}</span>
                    <span>🔀 ${repo.forks_count}</span>
                    <span>📋 ${repo.open_issues_count}</span>
                    <span class="text-gray-500">${repo.language || 'N/A'}</span>
                </div>
            `;
            user1Column.appendChild(card);
        });
        container.appendChild(user1Column);

        // User 2 repos
        const user2Column = document.createElement('div');
        user2Column.innerHTML = '<h3 class="text-xl font-bold mb-4">' + this.user2Data.profile.login + '</h3>';
        this.user2Data.repos.slice(0, 3).forEach((repo, index) => {
            const card = document.createElement('div');
            card.className = 'repo-card mb-4';
            card.innerHTML = `
                <div class="repo-name">${index + 1}. ${repo.name}</div>
                <div class="text-sm text-gray-600 mb-2">${repo.description || 'No description'}</div>
                <div class="flex justify-around text-sm">
                    <span>⭐ ${repo.stargazers_count}</span>
                    <span>🔀 ${repo.forks_count}</span>
                    <span>📋 ${repo.open_issues_count}</span>
                    <span class="text-gray-500">${repo.language || 'N/A'}</span>
                </div>
            `;
            user2Column.appendChild(card);
        });
        container.appendChild(user2Column);
    }

    displayMemes(stats1, stats2) {
        const gallery = document.getElementById('meme-gallery');
        gallery.innerHTML = '';

        const memeConfigs = [
            {
                type: 'drake',
                title: 'Drake Disapproves',
                topText: `${stats1.topLanguage}`,
                bottomText: `${stats2.topLanguage}`
            },
            {
                type: 'distracted',
                title: 'Distracted Developer',
                leftText: `${stats1.totalStars} stars`,
                rightText: `${stats2.totalStars} stars`
            },
            {
                type: 'galaxy-brain',
                title: 'Galaxy Brain (Useless Contributions)',
                lines: [
                    `Actually reading code`,
                    `Writing tests first`,
                    `${stats1.commits > stats2.commits ? stats1.commits + ' commits' : stats2.commits + ' commits'}`,
                    `${stats1.totalStars} stars (the real achievement)`
                ]
            }
        ];

        memeConfigs.forEach(config => {
            const memeContainer = document.createElement('div');
            memeContainer.className = 'flex flex-col items-center';

            const canvas = document.createElement('canvas');
            canvas.className = 'meme-canvas';
            
            // Generate meme using MemeGenerator utility
            MemeGenerator.generate(canvas, config);
            memeContainer.appendChild(canvas);

            const title = document.createElement('p');
            title.className = 'text-center font-bold text-lg mt-2 text-gray-700';
            title.textContent = config.title;
            memeContainer.appendChild(title);

            gallery.appendChild(memeContainer);
        });
    }

    displaySarcasm(stats1, stats2) {
        const templates = {
            christmas: [
                `${stats1.name} codes like they're trying to impress Santa's CI/CD pipeline. ${stats2.name} codes like they're on cooldown. 🎅`,
                `This Christmas: ${stats1.name} has ${stats1.totalStars} stars and ${stats2.name} has ${stats2.totalStars}. One of them is getting coal in their repo. ⚙️`,
                `${stats1.name} commits every day. ${stats2.name} commits every... (checking calendar). Never mind, it's been ${Math.floor((Date.now() - new Date(stats2.lastCommit)) / (1000 * 60 * 60 * 24))} days. 🎄`
            ],
            hacktoberfest: [
                `${stats1.name} really said "let's make ${stats1.totalRepos} repos this Hacktoberfest." ${stats2.name} said "nah." 🎃`,
                `Hacktoberfest vibes: ${stats1.name} collecting PRs like candy. ${stats2.name} collecting... disappointment. 🍬`
            ],
            stars: [
                `GitHub Stars Dream: ${stats1.name} has ${stats1.totalStars} stars. ${stats2.name} has ${stats2.totalStars}. One is the dream. 🌟`,
                `Star power: ${stats1.name} gained ${stats1.starPower} stars/year. ${stats2.name}? That's a conversation for another day. ⭐`
            ],
            devops: [
                `DevOps Chaos: ${stats1.name} with ${stats1.totalRepos} repos managing infrastructure. ${stats2.name} with ${stats2.totalRepos}. Whose CI/CD is actually working? 🤷`,
                `Docker containers vs AWS Lambda? ${stats1.name} uses both. ${stats2.name} uses... hope. 🐳`
            ]
        };

        const themeRoasts = templates[this.theme] || templates.christmas;
        const roast = themeRoasts[Math.floor(Math.random() * themeRoasts.length)];
        document.getElementById('sarcasm-box').textContent = roast;
    }

    displayScoreboard(stats1, stats2) {
        const scores = this.calculateScores(stats1, stats2);
        const winner = scores.total1 > scores.total2 ? 1 : 2;

        const scoreboard = document.getElementById('scoreboard');
        scoreboard.innerHTML = `
            <div class="scoreboard-item ${winner === 1 ? 'scoreboard-winner' : ''}">
                <span>🔥 Code Activity</span>
                <span>${scores.activity1.toFixed(0)} vs ${scores.activity2.toFixed(0)}</span>
            </div>
            <div class="scoreboard-item ${winner === 1 ? 'scoreboard-winner' : ''}">
                <span>⭐ Star Power</span>
                <span>${scores.stars1.toFixed(0)} vs ${scores.stars2.toFixed(0)}</span>
            </div>
            <div class="scoreboard-item ${winner === 1 ? 'scoreboard-winner' : ''}">
                <span>🧹 Repo Hygiene</span>
                <span>${scores.hygiene1.toFixed(0)} vs ${scores.hygiene2.toFixed(0)}</span>
            </div>
            <div class="scoreboard-item ${winner === 1 ? 'scoreboard-winner' : ''}">
                <span>👥 Git Notoriety</span>
                <span>${scores.notoriety1.toFixed(0)} vs ${scores.notoriety2.toFixed(0)}</span>
            </div>
            <div class="scoreboard-item scoreboard-winner">
                <span class="text-xl font-bold">🏆 TOTAL SCORE</span>
                <span class="text-xl font-bold">${scores.total1.toFixed(0)} vs ${scores.total2.toFixed(0)}</span>
            </div>
        `;
    }

    calculateScores(stats1, stats2) {
        const normalize = (val, max) => (val / max) * 100;
        const maxStars = Math.max(stats1.totalStars, stats2.totalStars) || 1;
        const maxFollowers = Math.max(stats1.followers, stats2.followers) || 1;

        return {
            activity1: stats1.commits,
            activity2: stats2.commits,
            stars1: normalize(stats1.totalStars, maxStars),
            stars2: normalize(stats2.totalStars, maxStars),
            hygiene1: parseInt(stats1.repoHygiene),
            hygiene2: parseInt(stats2.repoHygiene),
            notoriety1: normalize(stats1.followers, maxFollowers),
            notoriety2: normalize(stats2.followers, maxFollowers),
            total1: stats1.totalStars + stats1.followers + stats1.commits + (stats1.followers * 2),
            total2: stats2.totalStars + stats2.followers + stats2.commits + (stats2.followers * 2)
        };
    }

    displayVerdict(stats1, stats2) {
        const scores = this.calculateScores(stats1, stats2);
        const winner = scores.total1 > scores.total2 ? 1 : 2;
        const loser = winner === 1 ? 2 : 1;
        const winnerName = winner === 1 ? stats1.name : stats2.name;
        const loserName = winner === 1 ? stats2.name : stats1.name;

        const verdicts = {
            friendly: `🎄 Verdict: ${winnerName} takes it! Both are amazing developers though. Happy coding! 🎅`,
            'gen-z': `💀 Verdict: ${winnerName} really said "get good" to ${loserName}. The assignment is submitted. 📤`,
            'toxic': `🔥 VERDICT: ${winnerName} DESTROYS ${loserName} with the fury of a thousand CI/CD pipelines! ${loserName}, go touch grass. 🌿`
        };

        document.getElementById('verdict-box').textContent = verdicts[this.roastMode] || verdicts.friendly;
    }

    downloadPDF() {
        const element = document.getElementById('results');
        const opt = {
            margin: 10,
            filename: `github-battle-${this.user1Data.profile.login}-vs-${this.user2Data.profile.login}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
        };

        html2pdf().set(opt).from(element).save();
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    showError(message) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error').classList.remove('hidden');
    }

    hideError() {
        document.getElementById('error').classList.add('hidden');
    }
}

// Meme Generator Utility
const MemeGenerator = {
    generate(canvas, config) {
        const ctx = canvas.getContext('2d');
        canvas.width = 600;
        canvas.height = 600;

        // Set background
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Set text properties
        ctx.fillStyle = '#000';
        ctx.font = 'bold 32px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (config.type === 'drake') {
            this.drawDrake(ctx, config);
        } else if (config.type === 'distracted') {
            this.drawDistracted(ctx, config);
        } else if (config.type === 'galaxy-brain') {
            this.drawGalaxyBrain(ctx, config);
        }
    },

    drawDrake(ctx, config) {
        // Simple Drake meme representation
        ctx.fillStyle = '#FFA500';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height / 2);
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(0, ctx.canvas.height / 2, ctx.canvas.width, ctx.canvas.height / 2);

        ctx.fillStyle = '#000';
        ctx.font = 'bold 28px Arial';
        ctx.fillText(config.topText, ctx.canvas.width / 2, ctx.canvas.height / 4);
        ctx.fillText(config.bottomText, ctx.canvas.width / 2, (3 * ctx.canvas.height) / 4);

        // Add X and checkmark indicators
        ctx.font = 'bold 40px Arial';
        ctx.fillText('❌', 50, ctx.canvas.height / 4);
        ctx.fillText('✅', 50, (3 * ctx.canvas.height) / 4);
    },

    drawDistracted(ctx, config) {
        // Distracted Boyfriend representation
        ctx.fillStyle = '#FF69B4';
        ctx.fillRect(0, 0, ctx.canvas.width / 2, ctx.canvas.height);
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(ctx.canvas.width / 2, 0, ctx.canvas.width / 2, ctx.canvas.height);

        ctx.fillStyle = '#000';
        ctx.font = 'bold 28px Arial';
        ctx.fillText(config.leftText, ctx.canvas.width / 4, ctx.canvas.height / 2);
        ctx.fillText(config.rightText, (3 * ctx.canvas.width) / 4, ctx.canvas.height / 2);

        ctx.font = 'bold 50px Arial';
        ctx.fillText('👀', ctx.canvas.width / 2, ctx.canvas.height / 4);
    },

    drawGalaxyBrain(ctx, config) {
        // Galaxy brain meme representation
        const colors = ['#FF6B9D', '#C44569', '#FFA502', '#FFD32A'];
        const lineHeight = ctx.canvas.height / 4;

        config.lines.forEach((line, index) => {
            ctx.fillStyle = colors[index] || '#000';
            ctx.fillRect(0, index * lineHeight, ctx.canvas.width, lineHeight);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(line, ctx.canvas.width / 2, (index + 0.5) * lineHeight);
        });
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    new GitHubBattle();
});
