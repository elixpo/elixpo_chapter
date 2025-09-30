document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state');
  const code = params.get('code');
  const error = params.get('error');
  const guildId = params.get('guild_id');

  const title = document.getElementById('cb-title');
  const status = document.getElementById('cb-status');
  const details = document.getElementById('cb-details');
  const continueBtn = document.getElementById('cb-continue');
  const retryBtn = document.getElementById('cb-retry');

  function setSuccess(message) {
    title.textContent = 'Handshake Complete';
    status.textContent = 'Authorization successful';
    status.classList.add('success');
    details.textContent = message;
  }

  function setError(message) {
    title.textContent = 'Handshake Failed';
    status.textContent = 'Authorization error';
    status.classList.add('error');
    details.textContent = message;
  }

  if (error) {
    setError(`OAuth returned: ${error}`);
  } else if (code) {
    const info = [`code: ${code.slice(0, 6)}...`];
    if (guildId) info.push(`guild: ${guildId}`);
    if (state) info.push(`state: ${state.slice(0, 6)}...`);
    setSuccess(info.join('  |  '));
  } else {
    setError('Missing authorization parameters.');
  }

  continueBtn.addEventListener('click', () => {
    window.location.href = '../index.html';
  });
  retryBtn.addEventListener('click', () => {
    window.history.back();
  });
});


