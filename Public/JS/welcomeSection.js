// document.querySelector(".welcomeSection").scroll(0, 1126.4000244140625 )
const seekBars = document.querySelectorAll('.newsplayBackSeek');

seekBars.forEach((bar) => {
    bar.addEventListener('click', () => {
        // Remove .selected from all
        seekBars.forEach(b => b.classList.remove('selected'));
        // Add to the clicked one
        bar.classList.add('selected');
    });
});
