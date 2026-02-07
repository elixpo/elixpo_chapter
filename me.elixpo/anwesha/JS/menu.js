import LiquidPaintEffect from "./curtain2.js";

const canvas = document.querySelector("#above-canvas");
const triggerBtn = document.querySelector("#scrollInMenu");
const revertBtn = document.querySelector("#scrollOutMenu");
const initialContent = document.querySelector("#appContainer");
const revealedSection = document.querySelector("#menuSection");

// Canvas shader setup
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const paperCurtainEffect = new LiquidPaintEffect(canvas, {
  color: "#1D1D1B",
  background: "#E2D9C8",
  backgroundOpacity: 1,
  ease: "power3.inOut",
  duration: 3.5,
  horizontal: true,
  amplitude: 0.2,
  paintNoiseFrequency: 6.0,
  paintNoiseAmplitude: 0.05,
  flowCurveFrequency: 1.5,
  flowCurveAmplitude: 0.05,
  initialProgress: 0,
  brushInitialOpacity: 0
});

const waitFrame = () => new Promise(requestAnimationFrame);

function applyCanvasFullscreenStyle() {
    canvas.style.display = "block";
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw !important;
    height: 100vh !important;
    visibility: visible;
    pointer-events: auto;
    z-index: 100;
    opacity: 0;
    will-change: opacity;
  `;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function resetCanvasStyle() {

    canvas.style.display = "none";
}

async function fadeCanvasIn() {
  applyCanvasFullscreenStyle();
  anime.set(canvas, { opacity: 0 });
  await waitFrame();
  await anime({ targets: canvas, opacity: 1, duration: 400, easing: "easeOutCubic" }).finished;
}

async function fadeCanvasOut() {
  await anime({ targets: canvas, opacity: 0, duration: 500, easing: "easeOutCubic" }).finished;
  anime.set(canvas, { visibility: "hidden", pointerEvents: "none", zIndex: 100 });
  resetCanvasStyle();
}

triggerBtn.addEventListener("click", async () => {
  triggerBtn.style.pointerEvents = revertBtn.style.pointerEvents = "none";
  canvas.style.pointerEvents = "auto";
  revealedSection.style.zIndex = "200";

  revealedSection.style.display = "flex";
  revealedSection.style.opacity = "0";
  revealedSection.style.pointerEvents = "all";


  const isRootRoute = window.location.pathname === "/" || window.location.pathname === "";
  if (isRootRoute) {
    document.querySelectorAll(".menuItem").forEach(item => {   
        item.classList.remove("selected");
    })
    document.getElementById("rootMenu").classList.add("selected");
  }
  else if((window.location.pathname === "/about/") || (window.location.pathname === "/about")) {
  {
    document.querySelectorAll(".menuItem").forEach(item => {
      if (item.classList.contains("selected")) {
        item.classList.remove("selected");
      }
    });
    document.getElementById("aboutMenu").classList.add("selected");
  }
    } else if ((window.location.pathname === "/projects/") || (window.location.pathname === "/projects")) {
    document.querySelectorAll(".menuItem").forEach(item => {
      if (item.classList.contains("selected")) {
        item.classList.remove("selected");
      }
    });
    document.getElementById("projectsMenu").classList.add("selected");
    }
    else if ((window.location.pathname === "/publications/") || (window.location.pathname === "/publications")) {
    document.querySelectorAll(".menuItem").forEach(item => {
      if (item.classList.contains("selected")) {
        item.classList.remove("selected");
      }
    });
    document.getElementById("publicationsMenu").classList.add("selected");
    }


  await fadeCanvasIn();

  await anime({
    targets: initialContent,
    opacity: 0,
    duration: 400,
    easing: "easeInOutSine",
    complete: () => (initialContent.style.pointerEvents = "none")
  }).finished;

  await Promise.all([
    anime({
      targets: paperCurtainEffect.curtain.uniforms.uProgress,
      value: 1,
      duration: 1200,
      easing: "easeOutCubic"
    }).finished,
    anime({
      targets: paperCurtainEffect.curtain.uniforms.uBrushOpacity,
      value: 1,
      duration: 1000,
      easing: "easeOutCubic"
    }).finished
  ]);

  revealedSection.style.display = "flex";
  revealedSection.style.pointerEvents = "all";
  await anime({ targets: revealedSection, opacity: 1, duration: 600, easing: "easeOutExpo" }).finished;
  await anime({
    targets: revealedSection.querySelectorAll(".menuItem"),
    opacity: 1,
    delay: anime.stagger(100),
    duration: 200,
    easing: "easeOutSine"
  }).finished;

  await Promise.all([
    anime({
      targets: paperCurtainEffect.curtain.uniforms.uProgress,
      value: 0,
      duration: 1000,
      easing: "easeInOutQuad"
    }).finished,
    anime({
      targets: paperCurtainEffect.curtain.uniforms.uBrushOpacity,
      value: 0,
      duration: 800,
      easing: "easeInQuad"
    }).finished
  ]);
  
  revertBtn.style.pointerEvents = "auto";
  await fadeCanvasOut();
  

});

revertBtn.addEventListener("click", async () => {
  triggerBtn.style.pointerEvents = revertBtn.style.pointerEvents = "none";

  const menuItems = revealedSection.querySelectorAll(".menuItem");
  await anime({
    targets: menuItems,
    opacity: 0,
    delay: anime.stagger(50, { direction: "reverse" }),
    duration: 150,
    easing: "easeInQuad"
  }).finished;

  applyCanvasFullscreenStyle();
  anime.set(canvas, { opacity: 0, visibility: "visible", pointerEvents: "auto", zIndex: 300 });
  await waitFrame();

  await Promise.all([
    anime({ targets: canvas, opacity: 1, duration: 400, easing: "easeInOutCubic" }).finished,
    anime({
      targets: revealedSection,
      opacity: 0,
      duration: 400,
      easing: "easeInOutSine",
      complete: () => {
        revealedSection.style.pointerEvents = "none";
        revealedSection.style.display = "none";
      }
    }).finished
  ]);

  paperCurtainEffect.curtain.uniforms.uProgress.value = 1;
  paperCurtainEffect.curtain.uniforms.uBrushOpacity.value = 1;

  await Promise.all([
    anime({
      targets: paperCurtainEffect.curtain.uniforms.uProgress,
      value: 0,
      duration: 1000,
      easing: "easeInOutCubic"
    }).finished,
    anime({
      targets: paperCurtainEffect.curtain.uniforms.uBrushOpacity,
      value: 0,
      duration: 800,
      easing: "easeInQuad"
    }).finished
  ]);

  initialContent.style.pointerEvents = "all";
  await Promise.all([
    anime({ targets: initialContent, opacity: 1, duration: 500, easing: "easeOutCubic" }).finished,
    anime({ targets: canvas, opacity: 0, duration: 500, easing: "easeOutCubic" }).finished
  ]);

  anime.set(canvas, { pointerEvents: "none", visibility: "hidden", zIndex: 100 });
  paperCurtainEffect.curtain.uniforms.uProgress.value = 0;
  paperCurtainEffect.curtain.uniforms.uBrushOpacity.value = 0;
  triggerBtn.style.pointerEvents = "auto";
  resetCanvasStyle();

  
});

async function handleMenuRedirect(target) {
    triggerBtn.style.pointerEvents = revertBtn.style.pointerEvents = "none";
  
    const menuItems = revealedSection.querySelectorAll(".menuItem");
    await anime({
      targets: menuItems,
      opacity: 0,
      delay: anime.stagger(50, { direction: "reverse" }),
      duration: 150,
      easing: "easeInQuad"
    }).finished;
  
    applyCanvasFullscreenStyle();
    anime.set(canvas, { opacity: 0, visibility: "visible", pointerEvents: "auto", zIndex: 300 });
    await waitFrame();
  
    await Promise.all([
      anime({ targets: canvas, opacity: 1, duration: 400, easing: "easeInOutCubic" }).finished,
      anime({
        targets: revealedSection,
        opacity: 0,
        duration: 400,
        easing: "easeInOutSine",
        complete: () => {
          revealedSection.style.pointerEvents = "none";
          revealedSection.style.display = "none";
        }
      }).finished
    ]);
  
    paperCurtainEffect.curtain.uniforms.uProgress.value = 1;
    paperCurtainEffect.curtain.uniforms.uBrushOpacity.value = 1;
  
    await Promise.all([
      anime({
        targets: paperCurtainEffect.curtain.uniforms.uProgress,
        value: 0,
        duration: 1000,
        easing: "easeInOutCubic"
      }).finished,
      anime({
        targets: paperCurtainEffect.curtain.uniforms.uBrushOpacity,
        value: 0,
        duration: 800,
        easing: "easeInQuad"
      }).finished
    ]);
  
    await anime({ targets: canvas, opacity: 0, duration: 500, easing: "easeOutCubic" }).finished;
  
    anime.set(canvas, { pointerEvents: "none", visibility: "hidden", zIndex: 100 });
    paperCurtainEffect.curtain.uniforms.uProgress.value = 0;
    paperCurtainEffect.curtain.uniforms.uBrushOpacity.value = 0;
    revealedSection.style.opacity = "0";
    revealedSection.style.display = "none";
    revealedSection.style.pointerEvents = "none";
    redirectTo(target);
  }
  
  document.getElementById("rootMenu").addEventListener("click", (e) => {
    e.preventDefault();
    handleMenuRedirect("");
  });
  document.getElementById("aboutMenu").addEventListener("click", (e) => {
    e.preventDefault();
    handleMenuRedirect("about");
  });
  document.getElementById("projectsMenu").addEventListener("click", (e) => {
    e.preventDefault();
    handleMenuRedirect("projects");
  });
  document.getElementById("publicationsMenu").addEventListener("click", (e) => {
    e.preventDefault();
    handleMenuRedirect("publications");
  });

  document.getElementById("rootRedirect").addEventListener("click", function() {
    redirectTo("");
  });