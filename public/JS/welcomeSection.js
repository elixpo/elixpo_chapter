// document.querySelector(".welcomeSection").scroll(0, 1126.4000244140625 )
const seekBars = document.querySelectorAll('.newsplayBackSeek');
async function getNews() {
    try {
        const response = await fetch("/api/newsDetails");
        const data = await response.json();
        console.log('News Data:', data);
        let date = data.latestNewsDate.split("T")[0];
        const monthNames = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"
        ];
        const [year, month, day] = date.split("-");
        date = `${monthNames[parseInt(month, 10) - 1]} ${day}`;

        // Get elements
        const dateElem = document.getElementById("date");
        const yearElem = document.getElementById("year");
        const descElem = document.getElementById("desc");
        const centralLogo = document.getElementById("centralLogo");
        const newsText = document.getElementById("newsText");
        const backgroundBlur = document.getElementById("backgroundBlur");

        // Hide elements before loading
        if (dateElem) dateElem.style.opacity = 0;
        if (yearElem) yearElem.style.opacity = 0;
        if (descElem) descElem.style.opacity = 0;
        if (centralLogo) {
            centralLogo.style.opacity = 0;
            centralLogo.style.filter = "blur(16px)";
        }
        if (backgroundBlur) backgroundBlur.style.opacity = 0;

        // Preload image
        const img = new window.Image();
        img.src = data.latestNewsThumbnail;
        img.onload = function() {
            // Set content and styles
            if (dateElem) dateElem.textContent = date;
            if (yearElem) yearElem.textContent = year;
            if (descElem) descElem.textContent = data.latestNewsSummary;
            if (centralLogo) {
                centralLogo.style.backgroundImage = `url(${data.latestNewsThumbnail})`;
                centralLogo.style.backgroundSize = "cover";
                centralLogo.style.backgroundPosition = "center";
            }
            if (backgroundBlur) {
                backgroundBlur.style.backgroundImage = `url(${data.latestNewsThumbnail})`;
                backgroundBlur.style.backgroundSize = "cover";
                backgroundBlur.style.backgroundPosition = "center";
            }

            // Animate central logo blur out and fade in
            anime({
                targets: centralLogo,
                opacity: [0, 1],
                filter: ['blur(25px)', 'blur(0px)'],
                filter: "invert(1)",
                scale: [0.95, 1],
                translateY: "-50%",
                translateX: "-50%",
                duration: 900,
                easing: 'easeOutCubic'
            });

            // Animate background blur
            anime({
                targets: backgroundBlur,
                opacity: [0, 1],
                scale: [0.95, 1],
                duration: 800,
                easing: 'easeOutCubic'
            });

            // Animate text elements in with upward motion
            anime({
                targets: [dateElem, yearElem, descElem, newsText],
                opacity: [0, 1],
                translateY: [40, 0],
                delay: anime.stagger(120),
                duration: 700,
                easing: 'easeOutCubic'
            });
        };
    }
    catch (error) {
        console.error('Error fetching news details:', error);
    }
}


async function getPodCast() {
    try {
        const response = await fetch("/api/podcastDetails");
        const data = await response.json();
        var podcastName = data.latestPodcastName || "Fake AI Podcasts  Your Search Results";
        var podcast_thumbnail = data.latestPodcastThumbnail || "https://storage.googleapis.com/notes-89337.appspot.com/podcast/3691ca4503dad62489d848b0027c6478e9007df0e779e6bdf4fd699cbbdc5d17/podcastThumbnail_3691ca4503dad62489d848b0027c6478e9007df0e779e6bdf4fd699cbbdc5d17.jpg";
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
    // let podcastName = "Fake AI Podcasts  Your Search Results"
    // let podcast_thumbnail = "https://storage.googleapis.com/notes-89337.appspot.com/podcast/3691ca4503dad62489d848b0027c6478e9007df0e779e6bdf4fd699cbbdc5d17/podcastThumbnail_3691ca4503dad62489d848b0027c6478e9007df0e779e6bdf4fd699cbbdc5d17.jpg"
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

function getWeather() 
{
    
    fetch('/api/weather')
        .then(response => response.json())
        .then(data => {
            if (data.error) return;

            const { structuredWeather, aiSummary, aiImageLink } = data;
            console.log(data.bannerLink)
            const {
                location,
                current: { condition, temperature },
                forecast
            } = structuredWeather;

            // Update location
            const locationElem = document.querySelector('.weatherContainer .location');
            if (locationElem) locationElem.textContent = location;

            const tempElem = document.querySelector('.weatherContainer .temperature');
            if (tempElem) tempElem.textContent = `${Math.round(temperature * 9/5 + 32)}°F`;

            // Update weather description
            const descElem = document.querySelector('.weatherContainer .typeOfWeather');
            if (descElem) descElem.textContent = condition;

            // Update weather background image
            const bannerElem = document.querySelector('.weatherContainer .weatherBackground');
            if (bannerElem && data.bannerLink) {
                bannerElem.style.backgroundImage = `url(${data.bannerLink})`;
                bannerElem.style.backgroundSize = "cover";
                bannerElem.style.backgroundPosition = "center";
                bannerElem.style.opacity = 1;
            }
            // Update high/low
            const highLowElem = document.querySelector('.weatherContainer .highAndLow');
            if (highLowElem && forecast && forecast.length > 0) {
                const today = forecast[0];
                if (today.max && today.min) {
                    highLowElem.textContent = `H ${today.max}° L ${today.min})}°`;
                }
            }
        })
        .catch(err => {
            // Optionally show error in weather section
            console.error('Weather fetch error:', err);
        });
}

document.getElementById("playButton").addEventListener("click", function() {
    window.location.href = "/daily";
});
document.getElementById("podCastContainer").addEventListener("click", function() {
    window.location.href = "/podcast";
});
document.getElementById("weatherContainer").addEventListener("click", function() {
    window.location.href = "/weather";
});



hidePodcastElements();
getPodCast();
getNews();
getWeather();