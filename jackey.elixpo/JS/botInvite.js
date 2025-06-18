// Discord invite functionality
const DISCORD_INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1214916249222643752';
        
const inviteBtn = document.getElementById('inviteBtn');
if (inviteBtn) {
    inviteBtn.addEventListener('click', () => {
        window.open(DISCORD_INVITE_URL, '_blank');
    });
}

