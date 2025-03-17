const firebaseConfig = {
    apiKey: "AIzaSyAlwbv2cZbPOr6v3r6z-rtch-mhZe0wycM",
    authDomain: "elixpoai.firebaseapp.com",
    projectId: "elixpoai",
    storageBucket: "elixpoai.appspot.com",
    messagingSenderId: "718153866206",
    appId: "1:718153866206:web:671c00aba47368b19cdb4f"
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', async () => {
    const voiceTiles = document.querySelectorAll('.voice-tile');
    let currentlyPlaying = null;

    // Get the user's IP address (using a third-party service)
    let userIP = localStorage.getItem('userIP');
    if (!userIP) {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            userIP = data.ip;
            localStorage.setItem('userIP', userIP); // Store in localStorage
        } catch (error) {
            console.error("Error getting IP address:", error);
            userIP = 'unknown'; // Use a default value if IP retrieval fails
        }
    }

    voiceTiles.forEach(async tile => {
        const voiceName = tile.dataset.voiceId;
        const playButton = tile.querySelector('.play-button');
        const audio = tile.querySelector('audio');
        const upvoteButton = tile.querySelector('.upvote-button');
        let isLiked = false;

        // Check if the user has already liked the voice
        const likedVoices = JSON.parse(localStorage.getItem('likedVoices')) || {};
        if (likedVoices[voiceName] === userIP) {
            isLiked = true;
            const heartIcon = upvoteButton.querySelector('i');
            heartIcon.classList.remove('bx-heart');
            heartIcon.classList.add('bx-heart', 'bxs-heart');
            heartIcon.style.color = 'red';
        }

        playButton.addEventListener('click', () => {
            if (currentlyPlaying && currentlyPlaying !== audio) {
                currentlyPlaying.pause();
                currentlyPlaying.currentTime = 0;
                const prevButton = document.querySelector(`[data-voice-id="${currentlyPlaying.id.replace('audio-','')}"] .play-button`);
                if (prevButton) {
                    prevButton.innerHTML = "<i class='bx bx-play'></i>";
                }
            }

            if (audio.paused) {
                audio.play();
                playButton.innerHTML = "<i class='bx bx-pause' ></i>";
                currentlyPlaying = audio;
            } else {
                audio.pause();
                playButton.innerHTML = "<i class='bx bx-play'></i>";
                currentlyPlaying = null;
            }
        });

        audio.addEventListener('ended', () => {
            playButton.innerHTML = "<i class='bx bx-play'></i>";
            currentlyPlaying = null;
        });

        upvoteButton.addEventListener('click', async () => {
            upvoteButton.style.pointerEvents = 'none'; // Disable pointer events
            isLiked = !isLiked;
            const heartIcon = upvoteButton.querySelector('i');

            try {
                if (isLiked) {
                    heartIcon.classList.remove('bx-heart');
                    heartIcon.classList.add('bx-heart', 'bxs-heart');
                    heartIcon.style.color = 'red';
                    await updateLikes(voiceName, 1);
                    // Store the liked voice and user IP in localStorage
                    const likedVoices = JSON.parse(localStorage.getItem('likedVoices')) || {};
                    likedVoices[voiceName] = userIP;
                    localStorage.setItem('likedVoices', JSON.stringify(likedVoices));
                } else {
                    heartIcon.classList.remove('bx-heart', 'bxs-heart');
                    heartIcon.classList.add('bx-heart');
                    heartIcon.style.color = '';
                    await updateLikes(voiceName, -1);
                    // Remove the liked voice from localStorage
                    const likedVoices = JSON.parse(localStorage.getItem('likedVoices')) || {};
                    delete likedVoices[voiceName];
                    localStorage.setItem('likedVoices', JSON.stringify(likedVoices));
                }
            } finally {
                upvoteButton.style.pointerEvents = 'auto'; // Re-enable pointer events
            }
        });
    });

    async function updateLikes(voiceName, change) {
        const voiceRef = db.collection("voices").doc(voiceName);

        try {
            await db.runTransaction(async (transaction) => {
                const voiceDoc = await transaction.get(voiceRef);
                if (!voiceDoc.exists) {
                    transaction.set(voiceRef, { likes: Math.max(0, change) });
                } else {
                    const newLikes = Math.max(0, (voiceDoc.data().likes || 0) + change);
                    transaction.update(voiceRef, { likes: newLikes });
                }
            });
            console.log("Likes updated successfully!");
        } catch (error) {
            console.error("Error updating likes:", error);
        }
    }
});