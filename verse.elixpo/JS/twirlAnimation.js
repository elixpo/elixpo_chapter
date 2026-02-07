let varDuration;
const n = 20;
const rots = [
    { ry: 270, a: 0.5 },
    { ry: 0, a: 0.85 },
    { ry: 90, a: 0.4 },
    { ry: 180, a: 0.0 }
];

// Set initial positions
gsap.set(".face", {
    z: 200,
    rotateY: i => rots[i].ry,
    transformOrigin: "50% 50% -201px"
});

// Create and animate cubes
for (let i = 0; i < n; i++) {
    let die = document.querySelector('.cube-container');
    let cube = die.querySelector('.cube');
    
    if (i > 0) {
        let clone = die.cloneNode(true);
        document.querySelector('.tray').appendChild(clone);
        cube = clone.querySelector('.cube');
    }

    // Create timeline for each cube
    gsap.timeline({
        repeat: -1,
        yoyo: true,
        defaults: { ease: 'power3.inOut', duration: 1 }
    })
    .fromTo(cube, {
        rotateY: -90
    }, {
        rotateY: 90,
        ease: 'power1.inOut',
        duration: 2
    })
    .fromTo(cube.querySelectorAll('.face'), {
        color: (j) => `hsl(${(i/n*75+130)}, 10%, ${50 + 30 * [rots[3].a, rots[0].a, rots[1].a][j]}%)` // Metallic base
    }, {
        color: (j) => `hsl(${(i/n*75+130)}, 10%, ${50 + 30 * [rots[0].a, rots[1].a, rots[2].a][j]}%)` // Metallic transition
    }, 0)
    .to(cube.querySelectorAll('.face'), {
        color: (j) => `hsl(${(i/n*75+130)}, 10%, ${50 + 30 * [rots[1].a, rots[2].a, rots[3].a][j]}%)` // Metallic highlight
    }, 1)
    .progress(i/n);
}

// Add tray animations
gsap.timeline()
    .from('.tray', {
        yPercent: -3,
        duration: 2,
        ease: 'power1.inOut',
        yoyo: true,
        repeat: -1
    }, 0)
    .fromTo('.tray', {
        rotate: -15
    }, {
        rotate: 15,
        duration: 4,
        ease: 'power1.inOut',
        yoyo: true,
        repeat: -1
    }, 0)
    .from('.cube-container', {
        duration: 0.01,
        opacity: 0,
        stagger: {
            each: -0.05,
            ease: 'power1.in'
        }
    }, 0)
    .to('.tray', {
        scale: 1.2,
        duration: 2,
        ease: 'power3.inOut',
        yoyo: true,
        repeat: -1
    }, 0);

// Handle responsive scaling
window.onload = window.onresize = () => {
    const h = n * 60;
    gsap.set('.tray', { height: h });
    gsap.set('.twirlContainer', { scale: innerHeight/h });
    varDuration = 0.5;
    setTimeout(() => {
        varDuration = 5;
    }, 1200);
    setTimeout(() => {
        varDuration = 2;
    }, 2000);
};