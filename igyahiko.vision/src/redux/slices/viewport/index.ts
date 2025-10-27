import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type ViewportMode = "idle" | "panning" | "shiftPanning";

interface ViewportState {
  scale: number;
  minScale: number;
  maxScale: number;
  translate: Point;
  mode: ViewportMode;

  // Pan tracking
  panStartScreen: Point | null;
  panStartTranslate: Point | null;

  // Tunables
  wheelPanSpeed: number;
  zoomStep: number;
}

const initialState: ViewportState = {
  scale: 1,
  minScale: 0.1,
  maxScale: 8,
  translate: { x: 0, y: 0 },
  mode: "idle",

  panStartScreen: null,
  panStartTranslate: null,

  wheelPanSpeed: 0.5,
  zoomStep: 1.06,
};

// Helpers
export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export const screenToWorld = (
  screen: Point,
  translate: Point,
  scale: number
): Point => ({
  x: (screen.x - translate.x) / scale,
  y: (screen.y - translate.y) / scale,
});

export const worldToScreen = (
  world: Point,
  translate: Point,
  scale: number
): Point => ({
  x: world.x * scale + translate.x,
  y: world.y * scale + translate.y,
});

// Compute the translate that keeps originScreen pointing at the same world point after scaling
export const zoomAroundScreenPoint = (
  originScreen: Point,
  newScale: number,
  currentTranslate: Point,
  currentScale: number
): Point => {
  const worldAtOrigin = screenToWorld(
    originScreen,
    currentTranslate,
    currentScale
  );
  return {
    x: originScreen.x - worldAtOrigin.x * newScale,
    y: originScreen.y - worldAtOrigin.y * newScale,
  };
};

export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);
export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const viewportSlice = createSlice({
  name: "viewport",
  initialState,
  reducers: {
    setTranslate(state, action: PayloadAction<Point>) {
      state.translate.x = action.payload.x;
      state.translate.y = action.payload.y;
    },

    setScale(
      state,
      action: PayloadAction<{ scale: number; originScreen?: Point }>
    ) {
      const { scale, originScreen } = action.payload;
      const clamped = clamp(scale, state.minScale, state.maxScale);
      if (originScreen) {
        const t = zoomAroundScreenPoint(
          originScreen,
          clamped,
          state.translate,
          state.scale
        );
        state.translate.x = t.x;
        state.translate.y = t.y;
      }
      state.scale = clamped;
    },

    // Relative zoom
    zoomBy(
      state,
      action: PayloadAction<{ factor: number; originScreen: Point }>
    ) {
      const { factor, originScreen } = action.payload;
      const next = clamp(state.scale * factor, state.minScale, state.maxScale);
      const t = zoomAroundScreenPoint(
        originScreen,
        next,
        state.translate,
        state.scale
      );
      state.translate.x = t.x;
      state.translate.y = t.y;
      state.scale = next;
    },

    wheelZoom(
      state,
      action: PayloadAction<{ deltaY: number; originScreen: Point }>
    ) {
      const { deltaY, originScreen } = action.payload;
      const factor = Math.pow(state.zoomStep, -deltaY / 53);
      const next = clamp(state.scale * factor, state.minScale, state.maxScale);
      const t = zoomAroundScreenPoint(
        originScreen,
        next,
        state.translate,
        state.scale
      );
      state.translate.x = t.x;
      state.translate.y = t.y;
      state.scale = next;
    },

    wheelPan(state, action: PayloadAction<{ dx: number; dy: number }>) {
      state.translate.x += action.payload.dx * state.wheelPanSpeed;
      state.translate.y += action.payload.dy * state.wheelPanSpeed;
    },

    panStart(
      state,
      action: PayloadAction<{ screen: Point; mode?: ViewportMode }>
    ) {
      state.mode = action.payload.mode ?? "panning";
      state.panStartScreen = action.payload.screen;
      state.panStartTranslate = { x: state.translate.x, y: state.translate.y };
    },

    panMove(state, action: PayloadAction<Point>) {
      if (!(state.mode === "panning" || state.mode === "shiftPanning")) return;
      if (!state.panStartScreen || !state.panStartTranslate) return;
      const dx = action.payload.x - state.panStartScreen.x;
      const dy = action.payload.y - state.panStartScreen.y;
      state.translate.x = state.panStartTranslate.x + dx;
      state.translate.y = state.panStartTranslate.y + dy;
    },

    panEnd(state) {
      state.mode = "idle";
      state.panStartScreen = null;
      state.panStartTranslate = null;
    },

    handToolEnable(state) {
      if (state.mode === "idle") state.mode = "shiftPanning";
    },
    handToolDisable(state) {
      if (state.mode === "shiftPanning") state.mode = "idle";
    },
    centerOnWorld(
      state,
      action: PayloadAction<{ world: Point; toScreen?: Point }>
    ) {
      const { world, toScreen = { x: 0, y: 0 } } = action.payload;
      state.translate.x = toScreen.x - world.x * state.scale;
      state.translate.y = toScreen.y - world.y * state.scale;
    },

    zoomToFit(
      state,
      action: PayloadAction<{
        bounds: Rect;
        viewportPx: { width: number; height: number };
        padding?: number;
      }>
    ) {
      const { bounds, viewportPx, padding = 50 } = action.payload;
      const aw = Math.max(1, viewportPx.width - padding * 2);
      const ah = Math.max(1, viewportPx.height - padding * 2);
      const bw = Math.max(1e-6, bounds.width);
      const bh = Math.max(1e-6, bounds.height);

      const scaleX = aw / bw;
      const scaleY = ah / bh;
      const next = clamp(
        Math.min(scaleX, scaleY),
        state.minScale,
        state.maxScale
      );

      const centerX = viewportPx.width / 2;
      const centerY = viewportPx.height / 2;
      const boundsCenterX = bounds.x + bounds.width / 2;
      const boundsCenterY = bounds.y + bounds.height / 2;

      state.scale = next;
      state.translate.x = centerX - boundsCenterX * next;
      state.translate.y = centerY - boundsCenterY * next;
    },

    resetView(state) {
      state.scale = 1;
      state.translate.x = 0;
      state.translate.y = 0;
      state.mode = "idle";
      state.panStartScreen = null;
      state.panStartTranslate = null;
    },

    // Restore viewport from saved state
    restoreViewport(
      state,
      action: PayloadAction<{ scale: number; translate: Point }>
    ) {
      const { scale, translate } = action.payload;
      state.scale = clamp(scale, state.minScale, state.maxScale);
      state.translate.x = translate.x;
      state.translate.y = translate.y;
      // Reset interaction state
      state.mode = "idle";
      state.panStartScreen = null;
      state.panStartTranslate = null;
    },
  },
});

export const {
  setTranslate,
  setScale,
  zoomBy,
  wheelZoom,
  wheelPan,
  panStart,
  panMove,
  panEnd,
  handToolEnable,
  handToolDisable,
  centerOnWorld,
  zoomToFit,
  resetView,
  restoreViewport,
} = viewportSlice.actions;

export default viewportSlice.reducer;
