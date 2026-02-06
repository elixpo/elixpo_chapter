window.addEventListener("DOMContentLoaded", () => {
    const appContainers = document.querySelectorAll('.appContainer');
    appContainers.forEach(container => {
      anime({
        targets: container,
        opacity: [0, 1],
        translateY: [60, 0],
        duration: 1200,
        easing: 'easeOutExpo',
        complete: () => {
          container.style.opacity = 1;
        }
      });
    });
  });