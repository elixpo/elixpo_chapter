import {
  createSlice,
  createEntityAdapter,
  nanoid,
  PayloadAction,
  EntityState,
} from "@reduxjs/toolkit";

import type { Point } from "../viewport";

export type Tool =
  | "select"
  | "frame"
  | "rect"
  | "ellipse"
  | "circle"
  | "freedraw"
  | "arrow"
  | "line"
  | "text"
  | "eraser";

export interface BaseShape {
  id: string;
  stroke: string;
  strokeWidth: number;
  fill?: string | null;
  rotation?: number
}
export interface FrameShape extends BaseShape {
  type: "frame";
  x: number;
  y: number;
  w: number;
  h: number;
  frameNumber: number;
}
export interface RectShape extends BaseShape {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface EllipseShape extends BaseShape {
  type: "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FreeDrawShape extends BaseShape {
  type: "freedraw";
  points: Point[];
}
export interface ArrowShape extends BaseShape {
  type: "arrow";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
export interface LineShape extends BaseShape {
  type: "line";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
export interface TextShape extends BaseShape {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  textDecoration: "none" | "underline" | "line-through";
  lineHeight: number;
  letterSpacing: number;
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
}

export interface GeneratedUIShape extends BaseShape {
  type: "generatedui";
  x: number;
  y: number;
  w: number;
  h: number;
  uiSpecData: string | null;
  sourceFrameId: string;
  isWorkflowPage?: boolean; // Flag to identify workflow pages
}

export type Shape =
  | FrameShape
  | RectShape
  | EllipseShape
  | FreeDrawShape
  | ArrowShape
  | LineShape
  | TextShape
  | GeneratedUIShape;

const shapesAdapter = createEntityAdapter<Shape, string>({
  selectId: (s) => s.id,
});

type SelectionMap = Record<string, true>;

interface ShapesState {
  tool: Tool;
  shapes: EntityState<Shape, string>;
  selected: SelectionMap;
  frameCounter: number;
}

const initialState: ShapesState = {
  tool: "select",
  shapes: shapesAdapter.getInitialState(),
  selected: {},
  frameCounter: 0,
};

const DEFAULTS = { stroke: "#ffff", strokeWidth: 2 as const };

const makeFrame = (p: {
  x: number;
  y: number;
  w: number;
  h: number;
  frameNumber: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string | null;
}): FrameShape => ({
  id: nanoid(),
  type: "frame",
  x: p.x,
  y: p.y,
  w: p.w,
  h: p.h,
  frameNumber: p.frameNumber,
  stroke: "transparent",
  strokeWidth: 0,
  fill: p.fill ?? "rgba(255, 255, 255, 0.05)",
  rotation: 0
});

const makeRect = (p: {
  x: number;
  y: number;
  w: number;
  h: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string | null;
}): RectShape => ({
  id: nanoid(),
  type: "rect",
  x: p.x,
  y: p.y,
  w: p.w,
  h: p.h,
  stroke: p.stroke ?? DEFAULTS.stroke,
  strokeWidth: p.strokeWidth ?? DEFAULTS.strokeWidth,
  fill: p.fill ?? null,
  rotation: 0
});

const makeEllipse = (p: {
  x: number;
  y: number;
  w: number;
  h: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string | null;
}): EllipseShape => ({
  id: nanoid(),
  type: "ellipse",
  x: p.x,
  y: p.y,
  w: p.w,
  h: p.h,
  stroke: p.stroke ?? DEFAULTS.stroke,
  strokeWidth: p.strokeWidth ?? DEFAULTS.strokeWidth,
  fill: p.fill ?? null,
  rotation: 0
});

const makeFree = (p: {
  points: Point[];
  stroke?: string;
  strokeWidth?: number;
  fill?: string | null;
}): FreeDrawShape => ({
  id: nanoid(),
  type: "freedraw",
  points: p.points,
  stroke: p.stroke ?? DEFAULTS.stroke,
  strokeWidth: p.strokeWidth ?? DEFAULTS.strokeWidth,
  fill: p.fill ?? null,
  rotation: 0
});

const makeArrow = (p: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string | null;
}): ArrowShape => ({
  id: nanoid(),
  type: "arrow",
  startX: p.startX,
  startY: p.startY,
  endX: p.endX,
  endY: p.endY,
  stroke: p.stroke ?? DEFAULTS.stroke,
  strokeWidth: p.strokeWidth ?? DEFAULTS.strokeWidth,
  fill: p.fill ?? null,
  rotation: 0
});

const makeLine = (p: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string | null;
}): LineShape => ({
  id: nanoid(),
  type: "line",
  startX: p.startX,
  startY: p.startY,
  endX: p.endX,
  endY: p.endY,
  stroke: p.stroke ?? DEFAULTS.stroke,
  strokeWidth: p.strokeWidth ?? DEFAULTS.strokeWidth,
  fill: p.fill ?? null,
  rotation: 0
});

const makeText = (p: {
  x: number;
  y: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  textDecoration?: "none" | "underline" | "line-through";
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  stroke?: string;
  strokeWidth?: number;
  fill?: string | null;
}): TextShape => ({
  id: nanoid(),
  type: "text",
  x: p.x,
  y: p.y,
  text: p.text ?? "Type here...", // Start with placeholder text
  fontSize: p.fontSize ?? 16,
  fontFamily: p.fontFamily ?? "Inter, sans-serif",
  fontWeight: p.fontWeight ?? 400,
  fontStyle: p.fontStyle ?? "normal",
  textAlign: p.textAlign ?? "left",
  textDecoration: p.textDecoration ?? "none",
  lineHeight: p.lineHeight ?? 1.2,
  letterSpacing: p.letterSpacing ?? 0,
  textTransform: p.textTransform ?? "none",
  stroke: p.stroke ?? DEFAULTS.stroke,
  strokeWidth: p.strokeWidth ?? DEFAULTS.strokeWidth,
  fill: p.fill ?? "#ffffff",
  rotation: 0
});

const makeGeneratedUI = (p: {
  x: number;
  y: number;
  w: number;
  h: number;
  uiSpecData: string | null; // HTML markup as string
  sourceFrameId: string;
  id?: string;
  stroke?: string;
  strokeWidth?: number;
  fill?: string | null;
  isWorkflowPage?: boolean; // Flag to identify workflow pages
}): GeneratedUIShape => ({
  id: p.id ?? nanoid(),
  type: "generatedui",
  x: p.x,
  y: p.y,
  w: p.w,
  h: p.h,
  uiSpecData: p.uiSpecData,
  sourceFrameId: p.sourceFrameId,
  isWorkflowPage: p.isWorkflowPage,
  stroke: "transparent", // No border for generated UI
  strokeWidth: 0,
  fill: p.fill ?? null,
  rotation: 0
});

const shapesSlice = createSlice({
  name: "shapes",
  initialState,
  reducers: {
    setTool(state, action: PayloadAction<Tool>) {
      state.tool = action.payload;
      if (action.payload !== "select") state.selected = {};
    },

    addFrame(
      state,
      action: PayloadAction<
        Omit<Parameters<typeof makeFrame>[0], "frameNumber">
      >
    ) {
      state.frameCounter += 1;
      const frameWithNumber = {
        ...action.payload,
        frameNumber: state.frameCounter,
      };
      shapesAdapter.addOne(state.shapes, makeFrame(frameWithNumber));
    },
    addRect(state, action: PayloadAction<Parameters<typeof makeRect>[0]>) {
      shapesAdapter.addOne(state.shapes, makeRect(action.payload));
    },
    addEllipse(
      state,
      action: PayloadAction<Parameters<typeof makeEllipse>[0]>
    ) {
      shapesAdapter.addOne(state.shapes, makeEllipse(action.payload));
    },
    addFreeDrawShape(
      state,
      action: PayloadAction<Parameters<typeof makeFree>[0]>
    ) {
      const { points } = action.payload;
      if (!points || points.length === 0) return;
      shapesAdapter.addOne(state.shapes, makeFree(action.payload));
    },
    addArrow(state, action: PayloadAction<Parameters<typeof makeArrow>[0]>) {
      shapesAdapter.addOne(state.shapes, makeArrow(action.payload));
    },
    addLine(state, action: PayloadAction<Parameters<typeof makeLine>[0]>) {
      shapesAdapter.addOne(state.shapes, makeLine(action.payload));
    },
    addText(state, action: PayloadAction<Parameters<typeof makeText>[0]>) {
      shapesAdapter.addOne(state.shapes, makeText(action.payload));
    },
    addGeneratedUI(
      state,
      action: PayloadAction<Parameters<typeof makeGeneratedUI>[0]>
    ) {
      shapesAdapter.addOne(state.shapes, makeGeneratedUI(action.payload));
    },

    updateShape(
      state,
      action: PayloadAction<{ id: string; patch: Partial<Shape> }>
    ) {
      const { id, patch } = action.payload;
      shapesAdapter.updateOne(state.shapes, { id, changes: patch });
    },
    rotateShape: (
        state, 
        action: PayloadAction<{id: string, rotation: number}>
    ) => {
        const {id, rotation} = action.payload
        shapesAdapter.updateOne(state.shapes, {id, changes: {rotation}})
    },

    removeShape(state, action: PayloadAction<string>) {
      const id = action.payload;
      const shape = state.shapes.entities[id];
      if (shape?.type === "frame") {
        state.frameCounter = Math.max(0, state.frameCounter - 1);
      }
      shapesAdapter.removeOne(state.shapes, id);
      delete state.selected[id];
    },

    clearAll(state) {
      shapesAdapter.removeAll(state.shapes);
      state.selected = {};
      state.frameCounter = 0;
    },

    selectShape(state, action: PayloadAction<string>) {
      state.selected[action.payload] = true;
    },
    deselectShape(state, action: PayloadAction<string>) {
      delete state.selected[action.payload];
    },
    clearSelection(state) {
      state.selected = {};
    },
    selectAll(state) {
      const ids = state.shapes.ids as string[];
      state.selected = Object.fromEntries(ids.map((id) => [id, true]));
    },
    deleteSelected(state) {
      const ids = Object.keys(state.selected);
      if (ids.length) shapesAdapter.removeMany(state.shapes, ids);
      state.selected = {};
    },
    loadProject(
      state,
      action: PayloadAction<{
        shapes: EntityState<Shape, string>;
        tool: Tool;
        selected: SelectionMap;
        frameCounter: number;
      }>
    ) {
      // Load project data into the shapes state
      state.shapes = action.payload.shapes;
      state.tool = action.payload.tool;
      state.selected = action.payload.selected;
      state.frameCounter = action.payload.frameCounter;
    },
  },
});

export const {
  setTool,
  addFrame,
  addRect,
  addEllipse,
  addFreeDrawShape,
  addArrow,
  addLine,
  addText,
  addGeneratedUI,
  updateShape,
  removeShape,
  clearAll,
  selectShape,
  deselectShape,
  clearSelection,
  selectAll,
  deleteSelected,
  rotateShape,
  loadProject,
} = shapesSlice.actions;

export default shapesSlice.reducer;
