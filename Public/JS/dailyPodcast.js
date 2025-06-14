async function getPodCastDetails() {
    document.getElementById("centralImage").style.opacity = 0;
    document.querySelector('.podcastName').style.opacity = 0;
    document.querySelectorAll('.playBackControls svg').forEach(el => el.style.opacity = 0);
    document.querySelector('.playBackTime').style.opacity = 0;
    document.querySelector('.playBackSeek').style.opacity = 0;
    document.querySelector('.playBackSpeed').style.opacity = 0;
    
    try {
        const response = await fetch("http://10.42.0.56:3000/api/podcast");
        const data = await response.json();
        let podcastName = data[0].podcast_name;
        let podcastAudio = data[0].podcast_audio_url;
        let podcastSource = data[0].topic_source;
        let podcastBanner = data[0].podcast_banner_url;
        let podcastID = data[0].podcast_id;
        preparePodCast(podcastName, podcastAudio, podcastSource, podcastBanner, podcastID);
        return;
    } catch (error) {
        console.error('Error fetching podcast details:', error);
        return null;
    }
}

function preparePodCast(podcastName, podcastAudio, podcastSource, podcastBanner, podcastID) {
    const playBackSpeed = document.querySelector('.playBackSpeed');
    const speeds = [1, 1.5, 2, 4];
    let speedIndex = 0;

    const centralImage = document.getElementById("centralImage");
    centralImage.style.backgroundImage = `url(${podcastBanner})`;
    centralImage.style.backgroundSize = "cover";
    centralImage.style.backgroundPosition = "center";

    const podcastTitle = document.querySelector('.podcastName');
    podcastTitle.textContent = podcastName;

    const audio = new Audio(podcastAudio);
    audio.preload = "metadata";

    const controls = document.querySelectorAll('.playBackControls svg');
    const playBtn = document.getElementById("playBtn");
    let isPlaying = false;

    const timeDisplay = document.querySelector('.playBackTime');
    const seekHead = document.querySelector('.playBackSeekHead');
    const seekProgress = document.querySelector('.playBackSeekProgress');
    const seekBar = document.querySelector('.playBackSeek');
    let duration = 0;

    function formatTime(sec) {
        sec = Math.max(0, Math.floor(sec));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `-${m}:${s.toString().padStart(2, '0')}`;
    }

    function updateUI() {
        const current = audio.currentTime;
        const remain = duration - current;
        timeDisplay.textContent = formatTime(remain);
        const percent = (current / duration) * 100;
        seekProgress.style.width = percent + "%";
        seekHead.style.left = percent + "%";
    }

    playBackSpeed.addEventListener('click', () => {
        speedIndex = (speedIndex + 1) % speeds.length;
        audio.playbackRate = speeds[speedIndex];
        playBackSpeed.textContent = speeds[speedIndex] + 'x';
        playBackSpeed.classList.add('active');
        setTimeout(() => playBackSpeed.classList.remove('active'), 150);
    });

    playBtn.style.cursor = "pointer";
    playBtn.addEventListener('click', () => {
        if (isPlaying) {
            document.getElementById("playBtn").innerHTML = `<path d="M12.2246 27.5373C9.89137 28.8585 7 27.173 7 24.4917V7.50044C7 4.81864 9.89234 3.1332 12.2256 4.45537L27.2233 12.9542C29.5897 14.2951 29.5891 17.7047 27.2223 19.0449L12.2246 27.5373Z" fill="currentColor"></path>`;
            audio.pause();
        } else {
            document.getElementById("playBtn").innerHTML = `<path d="M7.25 29C5.45507 29 4 27.5449 4 25.75V7.25C4 5.45507 5.45507 4 7.25 4H10.75C12.5449 4 14 5.45507 14 7.25V25.75C14 27.5449 12.5449 29 10.75 29H7.25ZM21.25 29C19.4551 29 18 27.5449 18 25.75V7.25C18 5.45507 19.4551 4 21.25 4H24.75C26.5449 4 28 5.45507 28 7.25V25.75C28 27.5449 26.5449 29 24.75 29H21.25Z" fill="currentColor"></path>`;
            audio.play();
        }
    });

    audio.addEventListener('play', () => { isPlaying = true; playBtn.classList.add('playing'); });
    audio.addEventListener('pause', () => { isPlaying = false; playBtn.classList.remove('playing'); });

    audio.addEventListener('timeupdate', updateUI);
    audio.addEventListener('loadedmetadata', () => {
        duration = audio.duration;
        updateUI();
    });

    let isSeeking = false;

    seekBar.addEventListener('mousedown', (e) => {
        isSeeking = true;
        seekTo(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (isSeeking) seekTo(e);
    });

    document.addEventListener('mouseup', () => {
        isSeeking = false;
    });

    seekBar.addEventListener('click', (e) => seekTo(e));

    function seekTo(e) {
        const rect = seekBar.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const percent = x / rect.width;
        audio.currentTime = percent * duration;
    }

    controls[0].style.cursor = "pointer";
    controls[0].addEventListener('click', () => {
        audio.currentTime = Math.max(0, audio.currentTime - 10);
    });

    controls[2].style.cursor = "pointer";
    controls[2].addEventListener('click', () => {
        audio.currentTime = Math.min(duration, audio.currentTime + 10);
    });

    audio.addEventListener('ended', () => {
        isPlaying = false;
        playBtn.classList.remove('playing');
        updateUI();
    });

    audio.load();

    anime({
        targets: '#centralImage',
        opacity: [0, 1],
        // scale: [1.05, 1],
        duration: 1000,
        easing: 'easeOutExpo'
    });

    anime({
        targets: '.podcastName',
        opacity: [0, 1],
        // translateY: [20, 0],
        duration: 700,
        delay: 300,
        easing: 'easeOutCubic'
    });

    anime({
        targets: '.playBackControls svg',
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 500,
        delay: anime.stagger(100, { start: 600 }),
        easing: 'easeOutQuad'
    });

    anime({
        targets: ['.playBackTime', '.playBackSeek', '.playBackSpeed'],
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 500,
        delay: anime.stagger(150, { start: 800 }),
        easing: 'easeOutSine'
    });
}

getPodCastDetails();
