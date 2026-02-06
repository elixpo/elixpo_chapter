function scaleAppContainer() {
    const container = document.getElementById('appContainer');
    const maxWidth = 1440;
    const maxHeight = window.innerHeight;

    const scaleX = window.innerWidth / maxWidth;
    const scaleY = window.innerHeight / maxHeight;

    // Scale uniformly to avoid distortion
    const scale = Math.min(scaleX, scaleY); 

    container.style.transform = `translate(-50%, 0) scale(${scale})`;
    container.style.transformOrigin = 'top center';
  }

  window.addEventListener('load', scaleAppContainer);
  window.addEventListener('resize', scaleAppContainer);