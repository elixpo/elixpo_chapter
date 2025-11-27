const appContainer = document.getElementById('appContainer');

let velocity = 0;
let isTicking = false;
const friction = 0.82;
let frame;

appContainer.addEventListener('wheel', (e) => {
  // Allow native scroll for textarea elements
  if (
    e.target.tagName === 'textarea' ||
    (e.target.closest && e.target.closest('textarea'))
  ) {
    return; // Let textarea handle its own scroll
  }
  // Only handle if not horizontal scroll and shift is not pressed
  if (!e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
    e.preventDefault();
    velocity += e.deltaY * 0.5;
    startInertia();
  }
}, { passive: false });

function startInertia() {
  if (isTicking) return;
  isTicking = true;

  function step() {
  appContainer.scrollTop += velocity;
  velocity *= friction;

  if (Math.abs(velocity) < 0.5) {
    velocity = 0;
    isTicking = false;
    cancelAnimationFrame(frame);
    return;
  }

  frame = requestAnimationFrame(step);
  }

  step();
}
