document.addEventListener('DOMContentLoaded', () => {
    const pillButtons = document.querySelectorAll('.pill-button');
    
    pillButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all pills
            pillButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked pill
            button.classList.add('active');
        });
    });
});
