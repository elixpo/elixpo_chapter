const years = [2021, 2022, 2023, 2024, 2025];
const audienceGrowth = [1200, 1800, 2500, 3200, 4000]; // Example data
const emailSubscribers = [300, 600, 1100, 1700, 2500]; // Example data

const ctx = document.getElementById('readsViewsChart').getContext('2d');
new Chart(ctx, {
    type: 'line',
    data: {
        labels: years,
        datasets: [
            {
                label: 'Audience',
                data: audienceGrowth,
                borderColor: '#7ba8f0',
                backgroundColor: 'rgba(123,168,240,0.1)',
                tension: 0.3,
                fill: false,
                pointRadius: 3
            },
            {
                label: 'Email Subscribers',
                data: emailSubscribers,
                borderColor: '#34d399',
                backgroundColor: 'rgba(52,211,153,0.1)',
                tension: 0.3,
                fill: false,
                pointRadius: 3
            }
        ]
    },
    options: {
        responsive: true,
        plugins: {
            legend: {
                labels: { color: '#fff' }
            }
        },
        scales: {
            x: {
                title: { display: true, text: 'Year', color: '#fff' },
                ticks: { color: '#888' },
                grid: { color: '#222' }
            },
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Count', color: '#fff' },
                ticks: { color: '#888' },
                grid: { color: '#222' }
            }
        }
    }
});
