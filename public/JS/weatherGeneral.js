

function getWeatherLocation() {
    showSkeletons(); 
    fetch('/api/weather')
        .then(response => response.json())
        .then(data => {
            hideSkeletons(); 
            if (data.error) {
                document.getElementById("markdownRender").textContent = data.error;
                return;
            }
            const { structuredWeather, aiSummary, aiImageLink } = data;
            console.log(data);
            typeMarkdownFormatted("markdownRender", aiSummary, {
                delay: 200,
                initialDelay: 0,
                clear: true
            });

            const {
                location,
                current: { condition, temperature, wind_speed, datetime },
                forecast
            } = structuredWeather;

            const [weatherDate, weatherTime] = datetime.split("T");
            showWeather(condition, location, temperature, wind_speed, weatherDate, weatherTime.split(".")[0], forecast, data.bannerLink);

            // Animate the UI after rendering
            setTimeout(animateWeatherUI, 100);
        })
        .catch(err => {
            hideSkeletons();
            document.getElementById("markdownRender").textContent = "Failed to fetch weather.";
            console.error(err);
        });
}

function animateWeatherUI() {
    anime({
        targets: ['.location-info', '.weather-type', '.current-weather', '.temp-range', '.forecast .day'],
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 600,
        delay: anime.stagger(100),
        easing: 'easeOutQuad'
    });
}

function showWeather(condition, location, temperature, windSpeed, date, time, forecast, image) {
    const locationInfo = document.querySelector('.location-info');
    const weatherType = document.querySelector('.weather-type');
    const currentWeather = document.querySelector('.current-weather');
    const tempRange = document.querySelector('.temp-range');
    const forecastContainer = document.querySelector('.forecast');
    const weatherBackground = document.getElementById('weatherBackground');
    // Format time as HH:MM
    let hourMin = time ? time.slice(0, 5) : '';

    // Update location and time
    if (locationInfo) {
        locationInfo.textContent = `${location} • (${date})`;
    }

    // Update weather condition
    if (weatherType) {
        weatherType.textContent = condition;
    }

    // Update temperature
    if (currentWeather) {
        currentWeather.innerHTML = `${temperature}<span class="temp-unit">°C</span>`;
    }

    // Update weather background image
    if (weatherBackground) {
        weatherBackground.style.backgroundImage = `url('${image}')`;
        weatherBackground.style.backgroundSize = 'cover';
        weatherBackground.style.backgroundPosition = 'center';
        weatherBackground.style.backgroundRepeat = 'no-repeat';
        weatherBackground.style.opacity = '0.7';

        anime({
            targets: weatherBackground,
            opacity: [0, 0.8],
            filter: ['blur(10px)', 'blur(5px)'],
            filter: "brightness(0.4)",
            duration: 800,
            easing: 'easeInOutQuad'
        })
    }
    // Add wind speed detail below temperature range
    let windElem = document.querySelector('.wind-speed-detail');
    if (!windElem) {
        windElem = document.createElement('div');
        windElem.className = 'wind-speed-detail';
        tempRange?.after(windElem);
    }
    windElem.textContent = `Wind: ${windSpeed} km/h`;

    // Update temperature range if forecast has min/max
    if (tempRange && forecast && forecast.length > 0) {
        const today = forecast[0];
        if (today.max && today.min) {
            tempRange.textContent = `↑ ${today.max}° ↓ ${today.min}°`;
        }
    }

    
    // Helper: map condition to weather icon class
    function getWeatherIconClass(condition) {
        const map = {
            'clear': 'wi-day-sunny',
            'sunny': 'wi-day-sunny',
            'partly cloudy': 'wi-day-cloudy',
            'cloudy': 'wi-cloudy',
            'mostly cloudy': 'wi-cloudy',
            'overcast': 'wi-cloudy',
            'rain': 'wi-rain',
            'light rain': 'wi-rain',
            'heavy rain': 'wi-rain-wind',
            'thunderstorm': 'wi-thunderstorm',
            'snow': 'wi-snow',
            'fog': 'wi-fog',
            'mist': 'wi-fog',
            'drizzle': 'wi-sprinkle',
            'hail': 'wi-hail',
            'windy': 'wi-strong-wind'
        };
        if (!condition) return 'wi-day-cloudy';
        const key = condition.toLowerCase();
        return 'wi ' + (map[key] || 'wi-day-cloudy');
    }

    // Render forecast days
    if (forecastContainer) {
        forecastContainer.innerHTML = '';
        const todayDate = date;
        forecast.forEach(day => {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'day';

            // Day name: "Today" if date matches, else weekday
            let dayName = '';
            if (day.date === todayDate) {
                dayName = 'Today';
            } else {
                const d = new Date(day.date);
                dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
            }

            // Weather icon class: use day.icon if present, else map from condition
            let iconClass = 'wi wi-day-cloudy';
            if (day.icon) {
                iconClass = `wi ${day.icon}`;
            } else if (day.condition) {
                iconClass = getWeatherIconClass(day.condition);
            }

            // Write the weather temp in the day-temp for each day (show max/min if both present)
            let dayTemp = '';
            if (day.high && day.low) {
                dayTemp = `${day.high}°/${day.low}°`;
            } else if (day.high) {
                dayTemp = `${day.high}°`;
            }

            dayDiv.innerHTML = `
                <div class="day-name">${dayName}</div>
                <i class="${iconClass}"></i>
                <div class="day-temp">${dayTemp}</div>
            `;
            forecastContainer.appendChild(dayDiv);
        });
    }
}

document.getElementById("closeBtn").addEventListener("click", () => {
    window.location.href = "/";
});

getWeatherLocation();