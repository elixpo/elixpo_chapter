document.addEventListener('DOMContentLoaded', function () {

    const scroll = new LocomotiveScroll({
        el: document.querySelector('body'), 
        smooth: true
    });
});

let startTime = Date.now();
setInterval(() => {
    let elapsedTime = Date.now() - startTime;
    let minutes = Math.floor(elapsedTime / 60000);
    document.getElementById('read-time').textContent = minutes;
}, 60000);
