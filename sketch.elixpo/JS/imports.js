import { getStroke } from "https://cdn.skypack.dev/perfect-freehand";
import rough from "https://cdn.skypack.dev/roughjs@latest";

// Attach them to the global `window` object
window.getStroke = getStroke;
window.rough = rough;
