const dropdown = document.getElementById('customMonthDropdown');
const options = document.getElementById('monthOptions');
const selected = document.getElementById('selectedMonth');
dropdown.onclick = () => {
    options.classList.toggle('hidden');
};
options.querySelectorAll('div').forEach(option => {
    option.onclick = (e) => {
        selected.textContent = option.textContent;
        options.classList.add('hidden');
        e.stopPropagation();
    };
});
document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
        options.classList.add('hidden');
    }
});


const days = Array.from({length: 31}, (_, i) => i + 1);
const views = [
    12, 18, 25, 30, 22, 28, 35, 40, 38, 32, 29, 27, 31, 36, 41, 39, 34, 28, 25, 30, 33, 37, 40, 42, 38, 35, 32, 29, 27, 30, 34
];
const reads = [
    5, 8, 12, 15, 10, 13, 18, 20, 19, 16, 14, 13, 15, 17, 20, 19, 16, 13, 12, 14, 16, 18, 20, 21, 19, 17, 15, 14, 13, 15, 17
];

const ctx = document.getElementById('readsViewsChart').getContext('2d');
new Chart(ctx, {
    type: 'line',
    data: {
        labels: days.map(day => `Aug ${day}`),
        datasets: [
            {
                label: 'Views',
                data: views,
                borderColor: '#7ba8f0',
                backgroundColor: 'rgba(123,168,240,0.1)',
                tension: 0.3,
                fill: false,
                pointRadius: 2
            },
            {
                label: 'Reads',
                data: reads,
                borderColor: '#34d399',
                backgroundColor: 'rgba(52,211,153,0.1)',
                tension: 0.3,
                fill: false,
                pointRadius: 2
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
                ticks: { color: '#888' },
                grid: { color: '#222' }
            },
            y: {
                beginAtZero: true,
                ticks: { color: '#888' },
                grid: { color: '#222' }
            }
        }
    }
});