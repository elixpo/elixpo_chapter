let isErasing = false;
let eraserPath = null;
let eraserPoints = [];
const MAX_TRAIL_LENGTH = 10;
const FADE_DURATION = 150;
let targetedElements = new Set(); // Changed to a Set for multiple elements

// --- Function to create the eraser trail ---
function createEraserTrail(x, y) {
    eraserPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    eraserPath.setAttribute("fill", "none");
    eraserPath.setAttribute("stroke", "rgba(53, 53, 53, 0.4)");
    eraserPath.setAttribute("stroke-width", "6");
    eraserPath.setAttribute("stroke-linecap", "round");
    eraserPath.setAttribute("stroke-linejoin", "round");

    svg.appendChild(eraserPath);
    eraserPoints = [{ x, y }];
    updateEraserPath();
}

// --- Function to update the eraser trail path ---
function updateEraserTrail(x, y) {
    if (!eraserPath || eraserPoints.length === 0) return;

    let lastPoint = eraserPoints[eraserPoints.length - 1];
    if (!lastPoint) return;

    if (Math.hypot(lastPoint.x - x, lastPoint.y - y) > 2) {
        eraserPoints.push({ x, y });
    }

    if (eraserPoints.length > MAX_TRAIL_LENGTH) {
        eraserPoints.shift();
    }

    updateEraserPath();
    handleElementHighlight(x, y);
}

// --- Function to update the eraser path ---
function updateEraserPath() {
    if (!eraserPath || eraserPoints.length < 3) return;

    let pathData = `M ${eraserPoints[0].x} ${eraserPoints[0].y}`;
    for (let i = 1; i < eraserPoints.length - 2; i++) {
        let p0 = eraserPoints[i - 1];
        let p1 = eraserPoints[i];
        let p2 = eraserPoints[i + 1];
        let p3 = eraserPoints[i + 2];

        let cp1x = p1.x + (p2.x - p0.x) / 6;
        let cp1y = p1.y + (p2.y - p0.y) / 6;
        let cp2x = p2.x - (p3.x - p1.x) / 6;
        let cp2y = p2.y - (p3.y - p1.y) / 6;

        pathData += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    let opacityFactor = Math.max(0.2, eraserPoints.length / MAX_TRAIL_LENGTH);
    let strokeWidth = Math.max(2, 10 * opacityFactor);

    eraserPath.setAttribute("d", pathData);
    eraserPath.setAttribute("stroke-width", strokeWidth);
    eraserPath.setAttribute("stroke", `rgba(53, 53, 53, ${opacityFactor})`);
}

// --- Function to fade out the eraser trail ---
function fadeOutEraserTrail() {
    if (!eraserPath) return;

    let fadeInterval = setInterval(() => {
        if (eraserPoints.length > 0) {
            eraserPoints.shift();
            updateEraserPath();
        } else {
            clearInterval(fadeInterval);
            if (eraserPath.parentNode) {
                svg.removeChild(eraserPath);
            }
            eraserPath = null;
        }
    }, FADE_DURATION / MAX_TRAIL_LENGTH);
}

