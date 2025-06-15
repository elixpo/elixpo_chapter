const seekBars = document.querySelectorAll('.newsplayBackSeek');

seekBars.forEach((bar) => {
    bar.addEventListener('click', () => {
        seekBars.forEach(b => b.classList.remove('selected'));
        bar.classList.add('selected');
    });
});

function updateNewsHeadline() {
    const now = new Date();
    const options = { month: 'long', day: 'numeric', year: 'numeric' };
    const formattedDate = now.toLocaleDateString('en-US', options);
    newsHeadline = `Your Elixpo Daily For ${formattedDate}`;
    document.getElementById("dailyNewsName").textContent = newsHeadline;
    anime({
        targets: '#dailyNewsName',
        opacity: [0, 1],
        translateY: [-20, 0],
        translateX: '-50%',
        duration: 800,
        easing: 'easeOutCubic'
    });
}

async function getNewsFromDatabase() {
    try {
        const response = await fetch("/api/news");
        let data = await response.json();
        data = data[0];
        const newsItems = Array.isArray(data.items) ? data.items : Object.values(data.items);
        prepareNews(newsItems);
        setTimeout(() => {
            document.body.setAttribute("data-loading", "false");
            anime({
                targets: [
                    '#dailyNewsName',
                    '#backDropImage',
                    '.newsplayBackSeek',
                    '.newsplayBackControls'
                ],
                opacity: [0, 1],
                filter: ['blur(8px)', 'blur(0px)'],
                duration: 1200,
                easing: 'easeOutCubic',
                delay: anime.stagger(100)
            });
        }, 500);
    } catch (error) {
        console.error('Error fetching news details:', error);
    }
}

function prepareNews(items) {
    const seekBars = document.querySelectorAll('.newsplayBackSeek');
    const controls = document.querySelector('.newsplayBackControls');
    const timeMin = document.getElementById('newsplayBackTimeMin');
    const timeMax = document.getElementById('newsplayBackTimeMax');
    let currentIdx = 0;
    let playTimeout = null;

    const audioElements = items.map(item => {
        const audio = document.createElement('audio');
        audio.src = item.audio_url;
        audio.preload = 'auto';
        audio.style.display = 'none';
        return audio;
    });

    controls.querySelectorAll('audio').forEach(a => a.remove());
    controls.appendChild(audioElements[0]);

    seekBars.forEach((bar, idx) => {
        const item = items[idx];
        bar.dataset.audioUrl = item.audio_url;
        bar.dataset.topic = item.topic;
    });

    function updateUI(idx) {
        controls.querySelectorAll('audio').forEach(a => a.remove());
        controls.appendChild(audioElements[idx]);
        updatePlayButton(audioElements[idx].paused ? "pause" : "play");
        audioElements[idx].onplay = () => updatePlayButton("play");
        audioElements[idx].onpause = () => updatePlayButton("pause");
        const sourceSection = document.getElementById("sourceSection");
        const sourceLink = items[idx].source_link;
        let domain = '';
        try {
            const urlObj = new URL(sourceLink);
            domain = urlObj.hostname.replace(/^www\./, '');
        } catch (e) {
            domain = sourceLink;
        }
        const logoUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        sourceSection.innerHTML = `
            <div class="sourcePill" style="opacity:0; transform:translateY(20px);" onclick="window.open('${sourceLink}', '_blank')">
                <div class="sourceLogo" style="background-image: url('${logoUrl}');"></div>
                <div class="sourceName">${domain.split(".")[0]}</div>
            </div>
        `;
        anime({
            targets: '#sourceSection .sourcePill',
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 600,
            delay: 700,
            easing: 'easeOutExpo'
        });
        document.getElementById("dailyNewsName").textContent = items[idx].topic?.slice(0, 80) + "..." || "Your Elixpo Daily";
        document.getElementById("backDropImage").style.backgroundImage = `url('${items[idx].image_url}')`;
        fetch(`/api/getDominantColor?imageUrl=${encodeURIComponent(items[idx].image_url)}`)
            .then(res => res.json())
            .then(data => {
                try {
                    const el = document.getElementById("maskBackgroundNewsSection");
                    el.style.transition = 'background 0.8s ease';
                    el.style.background = data.color;
                } catch (e) {
                    console.error("Error setting background color:", e);
                }
            });
        seekBars.forEach(b => b.classList.remove('selected'));
        if (seekBars[idx]) seekBars[idx].classList.add('selected');
        timeMin.textContent = "00:00";
        if (audioElements[idx].duration) {
            timeMax.textContent = formatTime(audioElements[idx].duration);
        } else {
            audioElements[idx].addEventListener('loadedmetadata', () => {
                timeMax.textContent = formatTime(audioElements[idx].duration);
            }, { once: true });
        }
        updateSeekBar(idx, 0);
    }

    function updatePlayButton(state) {
        const playBtn = document.getElementById("playNews");
        if (state === "play") {
            playBtn.innerHTML = `<path d="M7.25 29C5.45507 29 4 27.5449 4 25.75V7.25C4 5.45507 5.45507 4 7.25 4H10.75C12.5449 4 14 5.45507 14 7.25V25.75C14 27.5449 12.5449 29 10.75 29H7.25ZM21.25 29C19.4551 29 18 27.5449 18 25.75V7.25C18 5.45507 19.4551 4 21.25 4H24.75C26.5449 4 28 5.45507 28 7.25V25.75C28 27.5449 26.5449 29 24.75 29H21.25Z" fill="currentColor"></path>`;
        } else {
            playBtn.innerHTML = `<path d="M12.2246 27.5373C9.89137 28.8585 7 27.173 7 24.4917V7.50044C7 4.81864 9.89234 3.1332 12.2256 4.45537L27.2233 12.9542C29.5897 14.2951 29.5891 17.7047 27.2223 19.0449L12.2246 27.5373Z" fill="currentColor"></path>`;
        }
    }

    function formatTime(sec) {
        sec = Math.floor(sec);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function updateSeekBar(idx, percent) {
        const bar = seekBars[idx];
        if (!bar) return;
        const progress = bar.querySelector('.newsplayBackSeekProgress');
        const head = bar.querySelector('.newsplayBackSeekHead');
        if (progress) progress.style.width = `${percent * 100}%`;
        if (head) head.style.left = `calc(${percent * 100}% - 8px)`;
    }

    audioElements.forEach((audio, idx) => {
        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const percent = audio.currentTime / audio.duration;
                updateSeekBar(idx, percent);
            }
            if (idx === currentIdx) {
                timeMin.textContent = formatTime(audio.currentTime);
                timeMax.textContent = formatTime(audio.duration || 0);
            }
        });

        audio.addEventListener('ended', () => {
            if (idx < items.length - 1) {
                if (playTimeout) clearTimeout(playTimeout);
                currentIdx = idx + 1;
                updateUI(currentIdx);
                audioElements[currentIdx].currentTime = 0;
                playTimeout = setTimeout(() => {
                    audioElements[currentIdx].play();
                }, 1500);
            }
        });

        seekBars[idx]?.addEventListener('click', (e) => {
            if (currentIdx !== idx) return;
            const bar = seekBars[idx];
            const rect = bar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            audio.currentTime = percent * audio.duration;
        });
    });

    seekBars.forEach((bar, idx) => {
        const head = bar.querySelector('.newsplayBackSeekHead');
        if (!head) return;

        let isDragging = false;

        head.addEventListener('mousedown', (e) => {
            if (currentIdx !== idx) return;
            isDragging = true;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging || currentIdx !== idx) return;
            const rect = bar.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const percent = x / rect.width;
            updateSeekBar(idx, percent);
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging || currentIdx !== idx) return;
            isDragging = false;
            document.body.style.userSelect = '';
            const rect = bar.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const percent = x / rect.width;
            const audio = audioElements[idx];
            if (audio.duration) {
                audio.currentTime = percent * audio.duration;
            }
        });

        head.addEventListener('touchstart', (e) => {
            if (currentIdx !== idx) return;
            isDragging = true;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging || currentIdx !== idx) return;
            const touch = e.touches[0];
            const rect = bar.getBoundingClientRect();
            let x = touch.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const percent = x / rect.width;
            updateSeekBar(idx, percent);
        });

        document.addEventListener('touchend', (e) => {
            if (!isDragging || currentIdx !== idx) return;
            isDragging = false;
            document.body.style.userSelect = '';
            const rect = bar.getBoundingClientRect();
            let x = (e.changedTouches && e.changedTouches[0].clientX - rect.left) || 0;
            x = Math.max(0, Math.min(x, rect.width));
            const percent = x / rect.width;
            const audio = audioElements[idx];
            if (audio.duration) {
                audio.currentTime = percent * audio.duration;
            }
        });
    });

    document.getElementById('playNews').onclick = () => {
        const audio = audioElements[currentIdx];
        updatePlayButton(audio.paused ? "pause" : "play");
        if (!audio.paused) {
            audio.pause();
        } else {
            audio.play();
        }
    };
    document.getElementById('rewindNews').onclick = () => {
        if (currentIdx > 0) {
            if (playTimeout) clearTimeout(playTimeout);
            audioElements[currentIdx].pause();
            currentIdx--;
            updateUI(currentIdx);
            audioElements[currentIdx].currentTime = 0;
            playTimeout = setTimeout(() => {
                audioElements[currentIdx].play();
            }, 1500);
        }
    };
    document.getElementById('forwardNews').onclick = () => {
        if (currentIdx < items.length - 1) {
            if (playTimeout) clearTimeout(playTimeout);
            audioElements[currentIdx].pause();
            currentIdx++;
            updateUI(currentIdx);
            audioElements[currentIdx].currentTime = 0;
            playTimeout = setTimeout(() => {
                audioElements[currentIdx].play();
            }, 1500);
        }
    };

    updateUI(0);
}


document.getElementById("closeBtn").addEventListener("click", () => {
    window.location.href = "/";
});
getNewsFromDatabase();
updateNewsHeadline();
