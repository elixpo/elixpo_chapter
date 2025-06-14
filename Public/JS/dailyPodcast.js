
async function getPodCastDetails() 
{
    try {
        const response = await fetch("http://10.42.0.56:3000/api/podcast");
        const data = await response.json();
        console.log(data);
        podcastName = data[0].podcast_name;
        podcastAudio = data[0].podcast_audio_url;
        podcastSource = data[0].topic_source;
        podcastBanner = data[0].podcast_banner_url;
        podcastID = data[0].podcast_id;
        preparePodCast(podcastName, podcastAudio, podcastSource, podcastBanner, podcastID);
        return data;
    } catch (error) {
        console.error('Error fetching podcast details:', error);
        return null;
    }
}

function preparePodCast(podcastName, podcastAudio, podcastSource, podcastBanner, podcastID) {

    const playBackSpeed = document.querySelector('.playBackSpeed');
    const speeds = [1, 1.5, 2, 4];
    let speedIndex = 0;
    
    // podcastName = "Unveiling, the, Cosmic, Dawn, Stars"
    // podcastAudio = "https://firebasestorage.googleapis.com/v0/b/notes-89337.appspot.com/o/podcast%2F1ad64d4c26d3277f1289d41b374256b9d68ab8e07e7fbbe09f26bab4fb195257%2Fpodcast_1ad64d4c26d3277f1289d41b374256b9d68ab8e07e7fbbe09f26bab4fb195257.wav?alt=media&token=b3c4b78c-2b77-418d-9643-d3d28eb578ad"
    // podcastSource = "https://www.space.com/astronomers-see-first-stars-cosmic-dawn"
    // podcastBanner = "https://firebasestorage.googleapis.com/v0/b/notes-89337.appspot.com/o/podcast%2F1ad64d4c26d3277f1289d41b374256b9d68ab8e07e7fbbe09f26bab4fb195257%2FpodcastBanner_1ad64d4c26d3277f1289d41b374256b9d68ab8e07e7fbbe09f26bab4fb195257jpg?alt=media&token=6d3ab02d-5626-4389-9050-5bbe4f782afa"
    // podcastID = "5f1df4dae28cb17475514cee062b6769312979e502cfc411ecf03dfe1ec230b0"

    document.getElementById("centralImage").style.backgroundImage = `url(${podcastBanner})`;
    document.getElementById("centralImage").style.backgroundSize = "cover";
    document.getElementById("centralImage").style.backgroundPosition = "center";

    document.querySelector('.podcastName').textContent = podcastName;
    // Create audio element
    const audio = new Audio(podcastAudio);
    audio.preload = "metadata";

    // Playback controls
    const controls = document.querySelectorAll('.playBackControls svg');
    const playBtn = document.getElementById("playBtn");
    let isPlaying = false;

    // Time display
    const timeDisplay = document.querySelector('.playBackTime');
    const seekHead = document.querySelector('.playBackSeekHead');
    const seekProgress = document.querySelector('.playBackSeekProgress');
    const seekBar = document.querySelector('.playBackSeek');
    let duration = 0;

    // Format time helper
    function formatTime(sec) {
        sec = Math.max(0, Math.floor(sec));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `-${m}:${s.toString().padStart(2, '0')}`;
    }

    // Update UI
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

    // Play/Pause
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

    // Seekbar update
    audio.addEventListener('timeupdate', updateUI);

    // Load metadata
    audio.addEventListener('loadedmetadata', () => {
        duration = audio.duration;
        updateUI();
    });

    // Seekbar click
    // Seekbar click and drag
    let isSeeking = false;

    seekBar.addEventListener('mousedown', (e) => {
        isSeeking = true;
        seekTo(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (isSeeking) {
            seekTo(e);
        }
    });

    document.addEventListener('mouseup', () => {
        isSeeking = false;
    });

    seekBar.addEventListener('click', (e) => {
        seekTo(e);
    });

    function seekTo(e) {
        const rect = seekBar.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const percent = x / rect.width;
        audio.currentTime = percent * duration;
    }

    // Skip back 10s
    controls[0].style.cursor = "pointer";
    controls[0].addEventListener('click', () => {
        if (audio.currentTime > 10) {
            audio.currentTime -= 10;
        } else {
            audio.currentTime = 0;
        }
    });

    // Skip forward 10s
    controls[2].style.cursor = "pointer";
    controls[2].addEventListener('click', () => {
        if (duration - audio.currentTime > 10) {
            audio.currentTime += 10;
        } else {
            audio.currentTime = duration;
        }
    });

    // Reset UI on end
    audio.addEventListener('ended', () => {
        isPlaying = false;
        playBtn.classList.remove('playing');
        updateUI();
    });

    // Start loading audio
    audio.load();
}

// setTimeout(() => {
//     getPodCastDetails();
// }, 3000);


preparePodCast();