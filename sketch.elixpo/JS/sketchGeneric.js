let selectedTool = document.querySelector(".bx-folder-code");
let history = [];
let redoStack = [];
let shapes = [];
const svg = document.querySelector('#freehand-canvas');
const tools = document.querySelectorAll(".toolbar i");
const roughCanvas = window.rough.svg(svg);  
const roughGenerator = roughCanvas.generator;
let currentShape = null;
let lastMousePos = null; 

const eraserCursorSVG = `data:image/svg+xml;base64,${btoa(`
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="7" fill="#222" stroke="white" stroke-width="2"/>
  </svg>
`)}`;

const lazerCursor = `data:image/svg+xml;base64,${btoa(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
    <g fill="none" stroke="#fff" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" transform="rotate(90 10 10)">
      <path clip-rule="evenodd" d="m9.644 13.69 7.774-7.773a2.357 2.357 0 0 0-3.334-3.334l-7.773 7.774L8 12l1.643 1.69Z"></path>
      <path d="m13.25 3.417 3.333 3.333M10 10l2-2M5 15l3-3M2.156 17.894l1-1M5.453 19.029l-.144-1.407M2.377 11.887l.866 1.118M8.354 17.273l-1.194-.758M.953 14.652l1.408.13"></path>
    </g>
  </svg>
`)}`;


let currentZoom = 1;
const minScale = 0.4;
const maxScale = 30; 
const minZoom = 0.4;
const maxZoom = 30; 
let currentTranslation = { x: 0, y: 0 }; 
const freehandCanvas = document.getElementById("freehand-canvas");
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const zoomPercentSpan = document.getElementById("zoomPercent");
let currentMatrix = new DOMMatrix();
let container  = document.querySelector(".container");
let isPanning = false;
let panStart = null;
let startCanvasX, startCanvasY;
let currentViewBox = {
  x: 0,
  y: 0,
  width: window.innerWidth,
  height: window.innerHeight
};


let isPaintToolActive = false;
let isTextToolActive = false;
let isCircleToolActive = false;
let isSquareToolActive = false;
let isLaserToolActive = false;
let isEraserToolActive  = false;
let isImageToolActive = false;
let isArrowToolActive = false;
let isLineToolActive = false;
let isSelectionToolActive = false;
let isPanningToolActive = false;
let isFrameToolActive = false;
let isIconToolActive = false;
let isCodeToolActive = false;

const paintBrushSideBar = document.getElementById("paintBrushToolBar");
const lineSideBar = document.getElementById("lineSideBar");
const squareSideBar = document.getElementById("squareSideBar");
const circleSideBar = document.getElementById("circleSideBar");
const arrowSideBar = document.getElementById("arrowSideBar");
const textSideBar = document.getElementById("textToolBar");

const ACTION_CREATE = "create";
const ACTION_DELETE = "delete";
const ACTION_MODIFY = "modify";  
const ACTION_PASTE = "paste";

document.addEventListener("click", function(event) {
  const menuIcon = document.getElementById("menuIcon");
  const menu = document.querySelector(".menu");

  if (event.target === menuIcon) {
    menu.classList.toggle("hidden");
  } else {
    menu.classList.add("hidden");
  }
});


function toolExtraPopup() {
    if (selectedTool.classList.contains("bx-stroke-pen")) {

        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bx-stroke-pen").classList.add("selected");
        isPaintToolActive = true;
        svg.style.cursor = "crosshair"
        disableAllSideBars();
        paintBrushSideBar.classList.remove("hidden");
    }
    else if (selectedTool.classList.contains("bx-square")) {

        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bx-square").classList.add("selected");
        svg.style.cursor = "crosshair"
        isSquareToolActive = true;
        disableAllSideBars();
        squareSideBar.classList.remove("hidden");
    }
    else if(selectedTool.classList.contains("bx-circle"))
    {

        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bx-circle").classList.add("selected");
        svg.style.cursor = "crosshair"
        isCircleToolActive = true;
        disableAllSideBars();
        circleSideBar.classList.remove("hidden"); 
    }
    else if(selectedTool.classList.contains("bx-right-arrow-alt"))
    {
        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bx-right-arrow-alt").classList.add("selected");
        isArrowToolActive = true;
        disableAllSideBars();
        arrowSideBar.classList.remove("hidden");
    }
    else if(selectedTool.classList.contains("bxs-pointer"))
    {
        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bxs-pointer").classList.add("selected");
        isSelectionToolActive = true;
        svg.style.cursor = "all-scroll";
        disableAllSideBars();
    }
    else if(selectedTool.classList.contains("bxs-hand"))
    {
        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bxs-hand").classList.add("selected");
        isPanningToolActive = true;
        svg.style.cursor = "grab";
        disableAllSideBars();
    }
    else if(selectedTool.classList.contains("bx-text"))
    {
      disableAllTools();
      disSelectAllTools();
      document.querySelector(".bx-text").classList.add("selected");
      isTextToolActive = true;
      svg.style.cursor = "text";
      disableAllSideBars();
      textSideBar.classList.remove("hidden");

    }
    else if(selectedTool.classList.contains("bx-folder-code"))
    {
      disableAllTools();
      disSelectAllTools();
      document.querySelector(".bx-folder-code").classList.add("selected");
      isCodeToolActive = true;
      svg.style.cursor = "text";
      disableAllSideBars();
      textSideBar.classList.remove("hidden");

    }
    else if(selectedTool.classList.contains("bxs-magic-wand"))
    {
        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bxs-magic-wand").classList.add("selected");
        svg.style.cursor = "crosshair";
        isLaserToolActive = true;
        disableAllSideBars();
    }
    else if(selectedTool.classList.contains("bxs-minus"))
    {
        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bxs-minus").classList.add("selected");
        svg.style.cursor = "crosshair";
        isLineToolActive = true;
        disableAllSideBars();
        lineSideBar.classList.remove("hidden");
    }
    else if(selectedTool.classList.contains("bxs-eraser"))
    {
        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bxs-eraser").classList.add("selected");
        isEraserToolActive  = true;
        svg.style.cursor = `url(${eraserCursorSVG}) 10 10, auto`; // Maintain custom cursor
        disableAllSideBars();
    }
    else if(selectedTool.classList.contains("bx-image-alt"))
    {
        disableAllTools();
        disSelectAllTools();
        document.querySelector(".bx-image-alt").classList.add("selected");
        disableAllSideBars();
        svg.style.cursor = "crosshair"
    }
    else if(selectedTool.classList.contains("bx-frame"))
    {
        disableAllTools();
        disSelectAllTools();
        isFrameToolActive = true;
        document.querySelector(".bx-frame").classList.add("selected");
        disableAllSideBars();
        svg.style.cursor = "crosshair"
    }
    else if(selectedTool.classList.contains("bx-wink-smile"))
    {
        disableAllTools();
        disSelectAllTools();
        isIconToolActive = true;
        document.querySelector(".bx-wink-smile").classList.add("selected");
        disableAllSideBars();
        svg.style.cursor = "crosshair"
    }
    else {
        disableAllTools();
        disSelectAllTools();
        disableAllSideBars();
        svg.style.cursor = "crosshair"
    }
    

}


function disSelectAllTools()
{
  tools.forEach(t => t.classList.remove("selected"));
}

function disableAllSideBars()
{
  paintBrushSideBar.classList.add("hidden");
  lineSideBar.classList.add("hidden");
  squareSideBar.classList.add("hidden");
  circleSideBar.classList.add("hidden");
  arrowSideBar.classList.add("hidden");
  textSideBar.classList.add("hidden");
}
function disableAllTools() 
{
  isPaintToolActive = false;
  isSquareToolActive = false;
  isCircleToolActive = false;
  isArrowToolActive = false;
  isTextToolActive = false;
  isLaserToolActive = false;
  isLineToolActive = false;
  isEraserToolActive  = false;
  isSelectionToolActive = false;
  isImageToolActive = false;
  isPanningToolActive = false;
  isFrameToolActive = false;
  isIconToolActive = false;
  isCodeToolActive = false;
}


tools.forEach(tool => tool.addEventListener("click", handleToolSelection));
function handleToolSelection(event) {
  tools.forEach(t => t.classList.remove("selected"));
  const tool = event.target;
  tool.classList.add("selected");
  selectedTool = tool;
  toolExtraPopup();
}

window.onload = () => {
  toolExtraPopup();
  // updateUndoRedoButtons();
  resizeCanvas();

};

 
