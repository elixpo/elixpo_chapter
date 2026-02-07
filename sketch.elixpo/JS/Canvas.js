const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let currentTool = 'pencil'; // Default tool
let points = [];
let isDrawing = false;
let currentStrokeWidth = 3; // Default stroke width
let currentColor = '#ffffff'; // Default color

function resizeCanvas() {
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(2, 2);
    redrawCanvas();
}

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Re-render existing drawings if needed
}

function handlePointerDown(e) {
    if (currentTool === 'pencil') {
        isDrawing = true;
        points = [[e.clientX, e.clientY, e.pressure]];
        console.log("pointer moving down")
    }
}

function handlePointerMove(e) {
    if (!isDrawing || currentTool !== 'pencil') return;
    points.push([e.clientX, e.clientY, e.pressure]);
}

function handlePointerUp() {
    if (isDrawing && currentTool === 'pencil') {
        isDrawing = false;
        console.log("pointer moving up")
    }
}

function handleToolChange(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('active'));
    document.getElementById(tool).classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    resizeCanvas();
    redrawCanvas();

    // Event listeners for canvas interactions
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    // Tool selection
    document.getElementById('pencil').addEventListener('click', () => handleToolChange('pencil'));
    document.getElementById('select').addEventListener('click', () => handleToolChange('select'));
    document.getElementById('rectangle').addEventListener('click', () => handleToolChange('rectangle'));

    // Initial tool activation
    handleToolChange('pencil');

    document.getElementById('colorPicker').addEventListener('change', (e) => {
        currentColor = e.target.value;
        ctx.strokeStyle = currentColor; // Update Canvas stroke color
        ctx.fillStyle = currentColor;   // Update Canvas fill color
    
        const path = document.querySelector('#freehand-canvas path');
        if (path) path.setAttribute('stroke', currentColor); // Update SVG path color
    });

    document.getElementById('strokeWidth').addEventListener('change', (e) => {
        currentStrokeWidth = parseInt(e.target.value);
        ctx.lineWidth = currentStrokeWidth;
    });


});

