// document.querySelector(".welcomeSection").scroll(0, 1126.4000244140625 )
const seekBars = document.querySelectorAll('.newsplayBackSeek');

async function getPodCast() {
    try {
        const response = await fetch("http://10.42.0.56:3000/api/podcastDetails");
        const data = await response.json();
        let podcastName = data.latestPodcastName || "Fake AI Podcasts  Your Search Results";
        let podcast_thumbnail = data.latestPodcastThumbnail || "https://storage.googleapis.com/notes-89337.appspot.com/podcast/3691ca4503dad62489d848b0027c6478e9007df0e779e6bdf4fd699cbbdc5d17/podcastThumbnail_3691ca4503dad62489d848b0027c6478e9007df0e779e6bdf4fd699cbbdc5d17.jpg";
        await displayPodcast(podcastName, podcast_thumbnail);
    } catch (error) {
        console.error('Error fetching podcast details:', error);
    }
}

function hidePodcastElements() {
    const podcastTitle = document.querySelector('.podCastPunchline');
    const podcastImage = document.getElementById("podcastThumbnail");
    if (podcastTitle) podcastTitle.style.opacity = 0;
    if (podcastImage) podcastImage.style.opacity = 0;
}

async function displayPodcast(podcastName, podcast_thumbnail) {
    let podcastName = "Fake AI Podcasts  Your Search Results"
    let podcast_thumbnail = "https://storage.googleapis.com/notes-89337.appspot.com/podcast/3691ca4503dad62489d848b0027c6478e9007df0e779e6bdf4fd699cbbdc5d17/podcastThumbnail_3691ca4503dad62489d848b0027c6478e9007df0e779e6bdf4fd699cbbdc5d17.jpg"
    const podcastTitle = document.querySelector('.podCastPunchline');
    const podcastImage = document.getElementById("podcastThumbnail");

    if (!podcastTitle || !podcastImage) return;

    // Hide elements before animation
    podcastTitle.style.opacity = 0;
    podcastImage.style.opacity = 0;

    podcastTitle.textContent = podcastName;
    podcastImage.style.backgroundImage = `url(${podcast_thumbnail})`;
    podcastImage.style.backgroundSize = "cover";
    podcastImage.style.backgroundPosition = "center";

    // Wait for image to load before animating
    const img = new window.Image();
    img.src = podcast_thumbnail;
    img.onload = function() {
        // Animate image
        anime({
            targets: podcastImage,
            opacity: [0, 1],
            scale: [0.9, 1],
            duration: 800,
            easing: 'easeOutCubic'
        });
        // Animate text after image
        anime({
            targets: podcastTitle,
            opacity: [0, 1],
            translateY: [20, 0],
            delay: 300,
            duration: 600,
            easing: 'easeOutCubic'
        });
    };
}

hidePodcastElements();
displayPodcast();