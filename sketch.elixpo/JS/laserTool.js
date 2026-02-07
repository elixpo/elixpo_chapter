let isDrawing = false;
let lasers = []; 
let fadingLasers = []; 

const fadeOutDuration = 1200; 
const baseLaserOpacity = 0.7;
const baseLaserWidth = 5;
const minStrokeWidth = 0.8;
const minDistanceThreshold = 0.5;

let drawingAnimationId = null;
let fadingAnimationId = null; 
let lastMovePoint = null;
let hasMoved = false;


function getZoomAdjustedWidth(baseWidth) {
    return baseWidth / currentZoom;
}

function getCatmullRomSegmentBezier(p0, p1, p2, p3) {
    
    p0 = p0 || p1;
    p3 = p3 || p2;

    
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    return { cp1x, cp1y, cp2x, cp2y };
}

function screenToViewBoxPoint(x, y) {
    const CTM = svg.getScreenCTM();
    if (!CTM) return null;
    try {
        const inverseCTM = CTM.inverse();
        return {
            x: (x - CTM.e) * inverseCTM.a + (y - CTM.f) * inverseCTM.c,
            y: (x - CTM.e) * inverseCTM.b + (y - CTM.f) * inverseCTM.d
        };
    } catch (e) {
        console.error("Error inverting CTM:", e);
        return {
            x: (x - CTM.e) / CTM.a,
            y: (y - CTM.f) / CTM.d
        };
    }
}

function updateLaserAppearance(laser, isFinalFade = false) {
    let laserGroup = document.getElementById(laser.id);
    if (!laserGroup) {
        laserGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        laserGroup.setAttribute("id", laser.id);
        svg.insertBefore(laserGroup, svg.firstChild);
    }

    while (laserGroup.firstChild) {
        laserGroup.removeChild(laserGroup.firstChild);
    }

    const currentTime = performance.now();
    let points = isFinalFade ? laser.initialPoints : [...laser.points];

    if (!isFinalFade) {
        points = points.filter(p => (currentTime - p.timestamp) < fadeOutDuration);
        laser.points = points;
    }

    if (points.length === 0) {
        laserGroup.remove();
        if (isFinalFade) fadingLasers = fadingLasers.filter(l => l.id !== laser.id);
        else lasers = lasers.filter(l => l.id !== laser.id);
        return;
    }

    // Get zoom-adjusted base width
    const adjustedBaseWidth = getZoomAdjustedWidth(baseLaserWidth);
    const adjustedMinWidth = getZoomAdjustedWidth(minStrokeWidth);

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? 0 : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        const cp = getCatmullRomSegmentBezier(p0, p1, p2, p3);

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute(
            "d",
            `M ${p1.x} ${p1.y} C ${cp.cp1x} ${cp.cp1y}, ${cp.cp2x} ${cp.cp2y}, ${p2.x} ${p2.y}`
        );
        path.setAttribute("fill", "none");


        const avgAge = ((currentTime - p1.timestamp) + (currentTime - p2.timestamp)) / 2;
        const ageProgress = Math.min(1, avgAge / fadeOutDuration);
        const easedFade = 1 - Math.pow(ageProgress, 3); 

        let opacity = baseLaserOpacity * easedFade;
        let width = adjustedBaseWidth * easedFade; 

        if (isFinalFade) {
            opacity *= laser.fadeProgress;
            width *= laser.fadeProgress;
        }

        path.setAttribute("stroke", `hsla(120, 100%, 50%, ${Math.max(0.05, opacity)})`);
        path.setAttribute("stroke-width", Math.max(adjustedMinWidth, width)); // Use zoom-adjusted min width
        laserGroup.appendChild(path);
    }
}


function distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}


function drawingLoop() {
    if (!isDrawing) {
        drawingAnimationId = null;
        return;
    }

    const currentLaser = lasers[lasers.length - 1];

    if (currentLaser) {
        if (hasMoved && lastMovePoint) {
            let svgPoint = screenToViewBoxPoint(lastMovePoint.x, lastMovePoint.y);

            if (svgPoint) {
                const lastLaserPoint = currentLaser.points[currentLaser.points.length - 1];
                
                const adjustedThreshold = minDistanceThreshold / currentZoom;
                if (!lastLaserPoint || distance(svgPoint, lastLaserPoint) >= adjustedThreshold) {
                    currentLaser.points.push({ x: svgPoint.x, y: svgPoint.y, timestamp: performance.now() });
                }
            }
            hasMoved = false; 
        }
        
        updateLaserAppearance(currentLaser, false); 
    }
    drawingAnimationId = requestAnimationFrame(drawingLoop);
}


function fadingLasersLoop() {
    if (fadingLasers.length === 0) {
        fadingAnimationId = null;
        return;
    }

    const currentTime = performance.now();

    for (let i = fadingLasers.length - 1; i >= 0; i--) {
        const laser = fadingLasers[i];
        const elapsedTime = currentTime - laser.fadeStartTime;
        laser.fadeProgress = Math.min(1, elapsedTime / fadeOutDuration); // This is the overall fade progression (0 to 1)

        const easedOverallProgress = 1 - Math.pow(laser.fadeProgress, 3); // Cubic easing out

        laser.fadeProgress = easedOverallProgress; // Store the eased progress

        updateLaserAppearance(laser, true); // Call with isFinalFade = true

        if (laser.fadeProgress <= 0.01) { // If completely faded
            const laserGroup = document.getElementById(laser.id);
            if (laserGroup) laserGroup.remove();
            fadingLasers.splice(i, 1); // Remove from array
        }
    }

    fadingAnimationId = requestAnimationFrame(fadingLasersLoop);
}


function fadeLaserTrail(laser) {
    // Stop the drawing loop from continuing to update this laser
    // The laser itself is still in the 'lasers' array initially
    
    // Move the laser from 'lasers' to 'fadingLasers'
    lasers = lasers.filter(l => l.id !== laser.id);
    
    laser.fadeStartTime = performance.now();
    laser.initialPoints = [...laser.points]; // Capture points at the moment of fade-out
    laser.fadeProgress = 1; // Start fade progress at 1 (full visibility)

    fadingLasers.push(laser);

    // Start the fading loop if it's not already running
    if (!fadingAnimationId) {
        fadingAnimationId = requestAnimationFrame(fadingLasersLoop);
    }
}


svg.addEventListener("mousedown", (e) => {
    if (!selectedTool || !selectedTool.classList.contains("bxs-magic-wand")) return;

    // Check if the click target is a UI element (like selection box or resize handle)
    if (e.target !== svg) {
        const isUIElement = e.target.closest('.selection-box, .resize-handle');
        if (isUIElement) return;
    }

    let screenPoint = { x: e.clientX, y: e.clientY };
    let startSvgPoint = screenToViewBoxPoint(screenPoint.x, screenPoint.y);
    if (!startSvgPoint) return;

    // If a drawing is already in progress, trigger its final fade-out
    if (isDrawing && lasers.length > 0) {
        const activeLaser = lasers[lasers.length - 1]; // Get the currently active laser
        fadeLaserTrail(activeLaser); // Trigger its fade-out
    }
    
    // Reset drawing state for the new laser
    isDrawing = true;
    hasMoved = false;
    lastMovePoint = screenPoint;
    
    const laserId = "laserGroup_" + Date.now() + "_" + Math.random().toString(16).slice(2);
    const newLaser = {
        id: laserId,
        points: [{ x: startSvgPoint.x, y: startSvgPoint.y, timestamp: performance.now() }], 
        // No need for pathElement, as updateLaserAppearance manages the group directly
    };
    lasers.push(newLaser); // Add to active lasers

    // Start drawing loop if not already running
    if (!drawingAnimationId) {
        drawingAnimationId = requestAnimationFrame(drawingLoop);
    }
});

svg.addEventListener("mousemove", (e) => {
    if (selectedTool && selectedTool.classList.contains("bxs-magic-wand")) {
        svg.style.cursor = `url(${lazerCursor}) 10 10, auto`;
    }

    if (!isDrawing) return;

    lastMovePoint = { x: e.clientX, y: e.clientY };
    hasMoved = true;
});

svg.addEventListener("mouseup", (e) => {
    if (!isDrawing) return;

    isDrawing = false; // Stop active drawing

    // Trigger final fade for the just-completed laser
    if (lasers.length > 0) {
        const lastDrawnLaser = lasers[lasers.length - 1];
        fadeLaserTrail(lastDrawnLaser);
    }
    
    // Reset mouse state
    hasMoved = false;
    lastMovePoint = null;

    // Restore cursor
    if (selectedTool && selectedTool.classList.contains("bxs-magic-wand")) {
       svg.style.cursor = `url(${lazerCursor}) 10 10, auto`;
    } else {
       svg.style.cursor = 'default';
    }
});