# The .lixsketch Format & DSL

A `.lixsketch` file is a plain-text description of a whole LixSketch canvas: every shape, style, connection, frame and group, plus scene settings. It is the readable, diff-friendly sibling of the `.lixjson` scene file, and it is a superset of [LixScript](/docs), the diagram DSL used in the DSL Studio.

- **Readable** — one statement per shape, one property per line.
- **Lossless** — exporting a canvas and opening the file again reproduces the scene exactly (same ids, z-order, styles, bindings, markup and assets).
- **Writable by hand** — relative positions, variables, shape references and arrows that bind themselves to shapes.
- **Strict** — every error is reported with `line:column` and a fix hint.

---

## Quick start

Save this as `flow.lixsketch` and open it with **Menu → Open** (`Ctrl+O`) or drop it onto the canvas.

```lixsketch
lixsketch 1
@name "Sign-in flow"

$blue = #4A90D9
$green = #2ECC71

rect login at 200, 60 size 200x65 {
  stroke: $blue
  fill: #1d2b3f
  fillStyle: solid
  label: "Login page"
}

circle check at login.x, login.bottom + 120 size 110x110 {
  stroke: #E74C3C
  label: "Valid?"
}

rect home at login.x, check.bottom + 120 size 200x65 {
  stroke: $green
  label: "Dashboard"
}

arrow a1 from login.bottom to check.top
arrow a2 from check.bottom to home.top {
  stroke: $green
  label: "Yes"
}
```

To get a file from an existing canvas use **Menu → Save .lixsketch**, the **Save & Share → Export** panel, the command palette entry *Save as .lixsketch*, or `Ctrl+Alt+S`.

---

## File structure

A document is a sequence of statements, one per line:

| Statement | Example | Purpose |
|-----------|---------|---------|
| Header | `lixsketch 1` | Format version. Must be the first statement. |
| Directive | `@name "Roadmap"` | Scene metadata and settings. |
| Variable | `$accent = #9d86df` | Reusable value, resolved when the file is read. |
| Shape | `rect box at 0, 0 size 120x60 { … }` | One canvas shape. Statement order is the z-order (first = bottom). |
| Asset | `asset img-1x9 = "data:image/png;base64,…"` | Embedded image data referenced by `src: "lixasset:img-1x9"`. |
| Comment | `// note` or `/* … */` | Ignored. |

### Header and versioning

`lixsketch 1` declares format version 1. A reader refuses files with a higher version (`Unsupported .lixsketch version 2`) instead of guessing.

A document **without** a header is read as a LixScript document. The syntax is identical; two LixScript conventions apply only in that mode (see [LixScript compatibility](#lixscript-compatibility)).

### Directives

| Directive | Value | Default | Example |
|-----------|-------|---------|---------|
| `@name` | string | `"Untitled"` | `@name "Q3 architecture"` |
| `@viewport` | 4 numbers: x y width height | none | `@viewport 0 0 1600 900` |
| `@zoom` | positive number | `1` | `@zoom 1.25` |
| `@background` | canvas colour | current app setting | `@background #15111f` |
| `@theme` | `dark` · `light` · `system` | current app setting | `@theme dark` |
| `@grid` | `true` · `false` | current app setting | `@grid true` |
| `@session` | string | none | `@session "lx-mf3k2-ab12cd"` |
| `@created` | ISO timestamp string | none | `@created "2026-10-25T10:00:00.000Z"` |
| `@meta.<key>` | any value | — | `@meta.mcpRevision 4` |

`@background`, `@theme` and `@grid` are applied to the editor when the file is opened. `@meta.*` keeps extra top-level scene fields (written by integrations such as the MCP server) so they survive a round trip.

### Variables

```lixsketch
lixsketch 1
$primary = #4A90D9
$w = 180
$label = "Primary node"

rect node at 40, 40 size $w x 60 {
  stroke: $primary
  label: $label
}
```

- Declare before use. Using an undeclared variable is an error.
- In geometry (`at`, `size`, `center`, `radius`) a variable must hold a number.
- In a property, `$name` alone is replaced by the variable's value with its type (number, string, boolean). Inside a longer unquoted value it is substituted as text (`fontFamily: $font, sans-serif`). Quoted strings are never substituted.

---

## Shape statements

```text
<keyword> <id> <geometry> [ { <properties> } ]
```

| Keyword | Shape | Geometry |
|---------|-------|----------|
| `rect` (`rectangle`) | Rectangle | `at X, Y size WxH` |
| `circle` (`ellipse`) | Circle / ellipse | `center X, Y radius RX[, RY]` or `at X, Y size WxH` |
| `line` | Line | `from <end> to <end>` |
| `arrow` | Arrow | `from <end> to <end>` |
| `freehand` | Freehand stroke | `[at X, Y]` (offset added to `points`) |
| `text` | Text | `at X, Y` |
| `code` | Code block | `at X, Y` |
| `image` | Image | `at X, Y size WxH` |
| `icon` | Icon | `at X, Y size WxH` |
| `frame` | Frame / artboard | `[at X, Y] [size WxH]` |
| `embed` | Web-embed frame | `at X, Y size WxH` |

**Ids** are unique names such as `login`, `api-gateway` or `node_2`. Ids may contain `-` and `_`. Any other id is written as a quoted string: `rect "my box" at 0, 0`.

**Numbers** may be negative, fractional or in exponent form (`-12.5`, `1e-7`). Geometry accepts expressions: `+ - * /`, parentheses, `$variables` and references (see [Positioning](#positioning)).

**Size** is written `WIDTHxHEIGHT` (`200x65`) or with spaces (`$w x $h`). Defaults when `size` is omitted: rect 160×60, circle 80×80, image 200×200, icon 48×48, frame 600×400.

### Property blocks

```lixsketch
lixsketch 1
// multi-line block — one property per line
rect a at 0, 0 size 120x60 {
  stroke: #4A90D9
  fontFamily: lixFont, sans-serif
}

// inline block — separate properties with , or ;
rect b at 200, 0 size 120x60 { stroke: #4A90D9, label: "B" }

// no block — engine defaults
rect c at 400, 0 size 120x60
```

In an inline block a comma ends the value, so quote values that contain commas there (`{ fontFamily: "lixFont, sans-serif" }`).

### Values

| Form | Example | Notes |
|------|---------|-------|
| Number | `2`, `-0.5`, `1e3` | |
| Boolean | `true`, `false` | |
| Null | `null` | |
| Bare text | `#4A90D9`, `cross-hatch`, `rgba(0, 0, 0, 0.4)` | Runs to the end of the line. `//` starts a comment only after whitespace, so URLs are safe. |
| Quoted string | `"Login page"`, `'single'` | JSON escapes: `\n`, `\"`, `\\`, `é`. |
| List | `[a, b, c]`, `[[0, 0, 0.5], [10, 5, 0.5]]` | May span lines. |
| Object | `{ x: 10, y: -4 }` | Keys may be quoted. |
| Heredoc | `<<<SVG` … `SVG` | Multi-line text, see below. |

A heredoc starts with `<<<TAG` at the end of a line and ends at a line containing only `TAG`. The closing line's indentation is removed from every content line, so heredocs can be indented with their block:

```lixsketch
lixsketch 1
text note at 40, 40 {
  content: <<<TEXT
  First line
    indented second line
  TEXT
}
```

---

## Shapes and properties

Every shape accepts the [common properties](#common-properties). Properties not listed for a shape are style options passed to the renderer (rough.js) and stored as-is — for example `bowing`, `hachureGap`, `hachureAngle`, `fillWeight` or `seed`.

### Common properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `rotation` | number (degrees) | `0` | Rotation (rect, circle, freehand, frame, text, code, image, icon). |
| `group` | id | `null` | Group id. Shapes with the same group move, resize and rotate together. |
| `parent` | frame id or `null` | from the frame's `contains` | Overrides the containing frame. |
| `docBlocks` | list of ids | `[]` | Linked document blocks (canvas ↔ docs navigation). |
| `locked` | boolean | absent | Lock flag, stored with the shape. |
| `link` | string (URL) | absent | Hyperlink, stored with the shape. |
| `opacity` | number 0–1, or a percentage (`50`, `"50%"`) | `1` | Opacity of the whole shape (stroke, fill and label). Omitted when fully opaque. Values above 1 are read as percentages. |
| `options.<key>` | any | — | Force a key into the shape's style options (used when the key collides with a property name, e.g. `options.style`). |
| `data.<key>` | any | — | Raw scene-record field, applied last. Written by the exporter for fields this reference does not cover. |

### rect

```lixsketch
lixsketch 1
rect card at 40, 40 size 220x90 {
  stroke: #7255b5
  strokeWidth: 3
  fill: #d9ccff
  fillStyle: cross-hatch
  roughness: 2.5
  style: dashed
  label: "Card"
  labelColor: #1a1a2e
  labelFontSize: 18
  shadeColor: #5b57d1
  shadeOpacity: 0.3
  shadeDirection: top
  edges: round
  opacity: 0.8
}
```

| Property | Type | Default | Allowed values | Example |
|----------|------|---------|----------------|---------|
| `stroke` | colour | `#fff` | any CSS colour | `stroke: #4A90D9` |
| `strokeWidth` | number | `2` | > 0 (toolbar: 1, 2, 4, 7) | `strokeWidth: 4` |
| `fill` | colour | `transparent` | any CSS colour | `fill: #1d2b3f` |
| `fillStyle` | keyword | `none` | `none` · `transparent` · `hachure` · `solid` · `cross-hatch` · `dots` · `zigzag` · `dashed` · `zigzag-line` | `fillStyle: hachure` |
| `roughness` | number | `1.5` | `0` (architect) … `3` (sketchy) | `roughness: 0` |
| `style` | keyword | `solid` | `solid` · `dashed` · `dotted` | `style: dotted` |
| `strokeDasharray` | string | `""` | SVG dash pattern | `strokeDasharray: "4,4"` |
| `label` | string | none | multi-line allowed | `label: "API"` |
| `labelColor` | colour | theme text colour | | `labelColor: #e0e0e0` |
| `labelFontSize` | number | `18` | | `labelFontSize: 14` |
| `labelBg` | boolean | `true` | `false` = no backdrop behind the label | `labelBg: false` |
| `shadeColor` | colour | none | gradient overlay colour | `shadeColor: #000` |
| `shadeOpacity` | number | `0.15` | 0–1 | `shadeOpacity: 0.3` |
| `shadeDirection` | keyword | `bottom` | `top` · `bottom` · `left` · `right` | `shadeDirection: left` |
| `rotation` | number | `0` | degrees | `rotation: 12` |
| `edges` | keyword | `sharp` | `sharp` · `round` (alias: `roundness`) | `edges: round` |

`edges: round` draws hand-drawn rounded corners with an adaptive radius: 25% of the shorter side, capped at 32px. Bound arrows stay on the curved outline.

`style` is shorthand for `strokeDasharray`: `solid` = `""`, `dashed` = `"10,10"`, `dotted` = `"2,8"`.

### circle / ellipse

Exported files use the exact centre/radius form; hand-written files may use either form.

```lixsketch
lixsketch 1
circle exact center 300, 200 radius 60, 40 {
  stroke: #2ECC71
  fillStyle: dots
  fill: #2ECC71
}
circle box at 100, 100 size 110x110 {
  label: "Valid?"
}
```

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| geometry `center X, Y radius RX[, RY]` | numbers | — | `RY` defaults to `RX`. |
| geometry `at X, Y size WxH` | numbers | 80×80 | `at` is the top-left of the bounding box. |
| all `rect` style properties | | | `stroke`, `fill`, `fillStyle`, `roughness`, `style`, `label*`, `shade*`, `rotation`. |

### line

```lixsketch
lixsketch 1
line divider from 0, 300 to 800, 300 {
  stroke: #888
  style: dashed
}
line bend from 0, 0 to 300, 0 {
  curved: true
  control: { x: 150, y: -60 }
  endHead: triangle
}
```

| Property | Type | Default | Allowed values | Notes |
|----------|------|---------|----------------|-------|
| `stroke` | colour | `#fff` | | |
| `strokeWidth` | number | `2` | | |
| `style` / `strokeDasharray` | keyword / string | `solid` | `solid` · `dashed` · `dotted` | |
| `roughness` | number | `1.5` | 0–3 | |
| `curved` | boolean | `false` | | Alias `curve: true` (LixScript). |
| `control` | point | `null` | `{ x, y }` or `"X, Y"` | Quadratic control point of a curved line. |
| `startHead`, `endHead` | keyword | `none` | same types as [arrow](#arrow) | Optional arrowheads, drawn like arrow heads (tangent follows the curve). Omitted when `none`. |
| `label`, `labelColor`, `labelFontSize` | | | | Label at the midpoint. |

### arrow

```lixsketch
lixsketch 1
rect a at 0, 0 size 120x60
rect b at 300, 0 size 120x60
arrow flow from a.right to b.left {
  stroke: #e0e0e0
  strokeWidth: 2
  style: dashed
  startHead: dot
  endHead: triangle
  curve: curved
  curveAmount: 80
  label: "next"
  labelOffsetY: -8
}
```

| Property | Type | Default | Allowed values | Notes |
|----------|------|---------|----------------|-------|
| `stroke` | colour | `#fff` | | |
| `strokeWidth` | number | `2` | | |
| `style` | keyword | `solid` | `solid` · `dashed` · `dotted` | Outline style of the shaft. |
| `startHead` | keyword | `none` | see below | Head at the start point. |
| `endHead` | keyword | `arrow` | see below | Head at the end point. |
| `head` | keyword | — | legacy | Older files: sets `endHead`. `default` → `arrow`, `outline` → `triangle_outline`, `solid` → `triangle`, `square` → `bar`. |
| `headLength` / `arrowHeadLength`, `arrowHeadAngleDeg` | number | `15`, `30` | | Kept for older files; heads are sized from `strokeWidth`. |
| `curve` | keyword | `straight` | `straight` · `curved` · `elbow` | |
| `curveAmount` | number | `50` | | Bend of `curved` arrows. |
| `control1`, `control2` | point | none | `{ x, y }` | Cubic control points of a curved arrow. |
| `elbowX` | number | none | | x of the vertical segment of an `elbow` arrow. |
| `label`, `labelColor`, `labelFontSize` | | | | |
| `labelBg` | boolean | `true` | | `false` removes the knockout behind the label. |
| `labelOffsetY` | number | `0` | | Shifts the label perpendicular to the shaft. |
| `bindStart`, `bindEnd` | id | none | | Shape the start/end is bound to. |
| `bindStartSide`, `bindEndSide` | keyword | inferred | `top` · `bottom` · `left` · `right` · `perimeter` | Side the binding attaches to. |
| `bindStartOffset`, `bindEndOffset` | object | `{ x: 0, y: 0 }` | | Offset along the side (`{ angle }` for `perimeter` on ellipses). |

See [Connections and bindings](#connections-and-bindings).


Arrowhead types (`startHead` / `endHead`): `none` · `arrow` (open V) · `bar` · `dot` (filled circle) · `circle` (outline) · `triangle` · `triangle_outline` · `diamond` · `diamond_outline` · `crowfoot_one` · `crowfoot_many` · `crowfoot_one_or_many` · `cross`.

Heads are drawn hand-drawn with the shaft's roughness and seed, always with a solid stroke (a dashed `style` only affects the shaft). Filled heads use the stroke colour, head size grows with `strokeWidth`, and the shaft stops at the back of closed heads.

### freehand

```lixsketch
lixsketch 1
freehand pen at 100, 100 {
  points: [[0, 0, 0.5], [12, 4, 0.7], [30, -2, 0.4], [44, 6, 0.5]]
  stroke: #f5c542
  strokeWidth: 3
  thinning: 0.6
  roughness: smooth
}
```

| Property | Type | Default | Allowed values | Notes |
|----------|------|---------|----------------|-------|
| `points` | list of `[x, y, pressure]` | required | pressure 0–1 | LixScript form `"x,y;x,y,p;…"` also accepted (pressure defaults to 0.5). At least 2 points. |
| `stroke` | colour | `#fff` | | |
| `strokeWidth` | number | `3` | | |
| `thinning` | number | `0.5` | 0–1 | Pressure sensitivity. |
| `roughness` | keyword | `smooth` | `smooth` · `medium` · `rough` | |
| `style` / `strokeStyle` | keyword | `solid` | `solid` · `dashed` · `dotted` | |
| `fill`, `fillStyle`, `closedFill`, `outlineStroke` | | | | Paint-bucket fill of a closed stroke. |

### text

```lixsketch
lixsketch 1
text title at 80, 40 {
  content: "Sprint review"
  color: #e8e3f3
  fontSize: 28
  fontFamily: lixFont
  align: left
}
```

| Property | Type | Default | Allowed values | Notes |
|----------|------|---------|----------------|-------|
| `content` (`text`) | string | `""` | `\n` or a heredoc for line breaks | |
| `color` | colour | `#e8e3f3` | | |
| `fontSize` | number | `20` | px | |
| `fontFamily` | string | `lixFont` | `lixFont` · `lixCode` · `lixDefault` · `lixFancy` · any CSS font | |
| `align` (`anchor`) | keyword | `left` | `left` · `center` · `right` (or `start` · `middle` · `end`) | |
| `markup` | heredoc | generated | | Exact SVG of the text group (written by the exporter). |

**How `markup` works.** The editor stores text as SVG. The exporter writes the readable properties *and* the exact markup. When the file is read:

- if `content`, `color`, `fontSize`, `fontFamily` and `align` match the markup, the markup is used verbatim (lossless);
- if you edited any of them, only those attributes are patched into the markup;
- if you changed `at`, the group is moved;
- without `markup`, the text group is generated from the properties.

### code

```lixsketch
lixsketch 1
code snippet at 400, 40 {
  content: <<<CODE
  function greet(name) {
    return `Hello ${name}`
  }
  CODE
  language: javascript
  fontSize: 14
}
```

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `content` | string | `""` | Source code. |
| `language` | string | `plaintext` | Highlighting language. |
| `color` | colour | `#e6edf3` | |
| `fontSize` | number | `14` | |
| `fontFamily` | string | `lixCode` | |
| `markup` | heredoc | generated | Same rules as text. |

### image

```lixsketch
lixsketch 1
image hero at 0, 0 size 480x270 {
  src: "https://res.cloudinary.com/demo/image/upload/sample.jpg"
  rotation: 2
}
```

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `src` (`href`, `url`) | string | required | URL, `data:` URL or `lixasset:<id>`. |
| `sizeBytes` | number | `0` | Stored file size (storage quota). |
| `cloudinaryId` | string | `null` | Uploaded asset id. |
| `storage` | string | `platform_cloudinary` | `platform_cloudinary` · `personal_cloudinary` · `user_cloudinary`. |
| `storageCloudName` | string | `null` | |
| `aiGenerated` | boolean | `false` | Provenance flag. |
| `aiModel` | string | `null` | Provenance model name. |
| `frameType` | string | `null` | `graph` for graph images. |
| `graph` | object | `null` | Graph definition (when `frameType: graph`). |

**Assets.** On export, inline images (`data:` URLs of 1 KB or more) are moved to `asset` statements at the end of the file and referenced as `lixasset:<id>`. The id is a content hash, so identical images are stored once. Linked images keep their URL.

```lixsketch
lixsketch 1
image logo at 0, 0 size 32x32 {
  src: "lixasset:img-logo"
}
asset img-logo = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4="
```

### icon

```lixsketch
lixsketch 1
icon bolt at 40, 40 size 32x32 {
  svg: "<path d='M13 2L3 14h7l-1 8 10-12h-7z' fill='currentColor'/>"
  color: #f5c542
}
```

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `svg` | string | — | Inner SVG in a 24×24 box; `currentColor`/black is replaced by `color`. |
| `name` | string | — | Placeholder icon labelled with the name's first letter. |
| `color` | colour | `#ffffff` | |
| `viewBoxWidth`, `viewBoxHeight` | number | `24` | Coordinate box of `svg`. |
| `markup` | heredoc | generated | Exact icon group (written by the exporter). |

One of `svg`, `name` or `markup` is required.

### frame

```lixsketch
lixsketch 1
rect a at 60, 80 size 120x60
rect b at 260, 80 size 120x60
frame board at 20, 20 size 420x200 {
  name: "Board"
  contains: a, b
  fillStyle: grid
  fillColor: #21182f
  gridSize: 24
  gridColor: "rgba(255,255,255,0.08)"
  stroke: #555
  strokeWidth: 1
  edges: round
}
```

| Property | Type | Default | Allowed values | Notes |
|----------|------|---------|----------------|-------|
| `name` | string | the frame id | | Title shown above the frame. |
| `contains` | ids | `[]` | `a, b, c` or `[a, b]` | Children; each child's `parent` defaults to this frame. Order is kept. |
| `fillStyle` | keyword | `transparent` | `transparent` · `solid` · `grid` | |
| `edges` | keyword | `sharp` | `sharp` · `round` | Rounded border; children are clipped to the same outline. |
| `fillColor` | colour | `#1e1e28` | | Used by `solid` and `grid`. |
| `gridSize` | number | `20` | px | |
| `gridColor` | colour | `rgba(255,255,255,0.06)` | | |
| `frameType` | string | `null` | `lixscript`, `mermaid-er`, … | Set by generators. |
| `stroke`, `strokeWidth`, `fill` | | `#555`, `1`, `transparent` | | Border and background. `options.opacity` is the border's own opacity; the common `opacity` fades the frame itself (border, background, title). Shapes inside a frame keep their own `opacity`, set per shape. |

### embed

A frame that shows an allow-listed web page (YouTube, Figma, CodePen, …). It is stored as a frame with `frameType: web-embed`.

```lixsketch
lixsketch 1
embed demo at 0, 0 size 640x360 {
  url: "https://www.youtube.com/embed/dQw4w9WgXcQ"
  name: "Demo video"
}
```

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `url` | string | required | Normalised and checked against the embed allow-list on load. |
| frame properties | | | `name`, `stroke`, … |

---

## Positioning

Geometry can reference other shapes, declared before or after:

```lixsketch
lixsketch 1
rect first at 200, 60 size 200x65 { label: "First" }
rect second at first.right + 250, first.y size 200x65 { label: "Second" }
rect third at first.x, first.bottom + (40 * 3) size first.width x 65 { label: "Third" }
```

| Reference | Value |
|-----------|-------|
| `id.x`, `id.left` | Left edge |
| `id.y`, `id.top` | Top edge |
| `id.right` | Right edge |
| `id.bottom` | Bottom edge |
| `id.centerX`, `id.centerY` | Centre |
| `id.width`, `id.height` | Size |

Circles use their bounding box. Lines and arrows use the box spanned by their endpoints. Text and code have zero size unless `width`/`height` properties are given (used for layout only). A reference to an unknown shape or a circular chain of references is an error.

---

## Connections and bindings

A line or arrow endpoint is either a point (`X, Y`) or a shape reference:

| Endpoint | Meaning |
|----------|---------|
| `120, 40` | Absolute point. |
| `box` | Centre of `box`. |
| `box.top` · `.bottom` · `.left` · `.right` · `.center` | Middle of that side. |
| `box.right + 10` | Side point shifted along the side. |

When an **arrow** endpoint references a shape, the arrow is bound to it: moving the shape drags the arrow. The bound side is the side the endpoint lies on. Lines are never bound.

```lixsketch
lixsketch 1
rect api at 0, 0 size 140x60 { label: "API" }
circle db at 300, 0 size 80x80 { label: "DB" }
arrow q from api.right to db.left { label: "query" }
arrow r from db.bottom to api.bottom { curve: curved, style: dashed, label: "rows" }
```

Exported files spell bindings out, because the saved endpoint is already the attached point:

```lixsketch
lixsketch 1
rect api at 0, 0 size 140x60
circle db center 340, 40 radius 40, 40
arrow q from 140, 30 to 300, 40 {
  bindStart: api
  bindStartSide: right
  bindStartOffset: { x: 0, y: 0 }
  bindEnd: db
  bindEndSide: perimeter
  bindEndOffset: { angle: 3.14 }
}
```

---

## Groups, frames and z-order

- **Z-order** is statement order: later shapes are drawn on top. Exported files keep the canvas order exactly.
- **Frames** list their children with `contains`. A child that should not belong to the frame listing it, or that belongs to a different frame, carries `parent: <frame id>` or `parent: null`.
- **Groups** are a property: shapes sharing a `group` id behave as one selection.

```lixsketch
lixsketch 1
rect left at 0, 0 size 100x60 { group: pair }
rect right at 140, 0 size 100x60 { group: pair }
frame area at -20, -20 size 300x120 {
  name: "Pair"
  contains: left, right
}
```

---

## Comments

```lixsketch
lixsketch 1
// a line comment
rect a at 0, 0 size 10x10 // trailing comment
/* a block comment
   across lines */
rect link at 20, 0 size 10x10 {
  link: https://example.com/path // the // inside the URL is not a comment
}
```

---

## Errors

Errors carry `line:column` of the offending token. Reading continues after an error so one pass reports every broken statement; a file with errors is not loaded.

| Example input | Message |
|---------------|---------|
| `lixsketch 2` | `1:11: Unsupported .lixsketch version 2 (this build reads up to 1)` |
| `rectangel a at 0, 0` | `2:1: Unknown statement 'rectangel' (did you mean 'rectangle'?)` |
| `rect a at 0 0` | `2:13: Expected ',' between X and Y in 'at X, Y', found '0'` |
| `rect a at 0, 0 size 10 by 10` | `2:24: Expected 'x' in 'size WIDTHxHEIGHT', found 'b'` |
| `stroke #fff` (in a block) | `3:10: Expected ':' after property 'stroke', found '#'` |
| missing `}` | `2:16: Unclosed '{' (opened at 2:16)` |
| `label: "oops` | `2:25: Unterminated string` |
| `stroke: $missing` | `2:26: Undefined variable '$missing'` |
| `rect a at b.x, 0` (no `b`) | `2:11: Unknown shape 'b'` |
| two shapes named `a` | `3:6: Duplicate shape id 'a' (first declared at 2:1)` |
| `a` at `b.x`, `b` at `a.x` | `2:1: Cannot resolve the position of 'a' (circular reference)` |
| `from a.middle` | `2:16: 'middle' is not a connection side (use top, bottom, left, right, center)` |
| `text t at 0, 0 { colour: red }` | `2:18: Unknown property 'colour' for text (did you mean 'color'?)` |
| `rotation: fast` | `2:28: Property 'rotation' on rect expects a number` |
| `image i at 0, 0` | `2:1: image 'i' requires a 'src' property` |

Warnings (the file still loads): a frame that `contains` an unknown id, a `parent` that does not exist, an arrow bound to an unknown shape.

When a file opened in the app has errors, a toast shows the first one as `file.lixsketch:line:col: message`.

---

## Grammar (EBNF)

```ebnf
document     = [ header ] , { blank | statement } ;
header       = "lixsketch" , ws , integer , eol ;
statement    = ( directive | variable | asset | shape ) , eol ;

directive    = "@" , key , [ ws , value ] ;
variable     = "$" , ident , ws? , "=" , ws? , value ;
asset        = "asset" , ws , id , ws? , "=" , ws? , ( string | heredoc ) ;

shape        = keyword , ws , id , { ws , clause } , [ ws? , block ] ;
keyword      = "rect" | "rectangle" | "circle" | "ellipse" | "line" | "arrow"
             | "freehand" | "text" | "code" | "image" | "icon" | "frame" | "embed" ;
clause       = "at" , ws , expr , "," , expr
             | "size" , ws , expr , "x" , expr
             | "center" , ws , expr , "," , expr
             | "radius" , ws , expr , [ "," , expr ]
             | "from" , ws , endpoint
             | "to" , ws , endpoint ;
endpoint     = expr , "," , expr
             | id , [ "." , side ] , [ ( "+" | "-" ) , number ] ;
side         = "top" | "bottom" | "left" | "right" | "center" ;

block        = "{" , { separator | property } , "}" ;
separator    = eol | "," | ";" ;          (* "," and ";" end values only in inline blocks *)
property     = key , ws? , ":" , ws? , value ;
key          = segment , { "." , segment } ;
segment      = ident | string ;

value        = string | heredoc | list | object | bare ;
bare         = { any character except end of line } ;   (* see "Values" *)
list         = "[" , [ item , { "," , item } , [ "," ] ] , "]" ;
object       = "{" , [ pair , { "," , pair } , [ "," ] ] , "}" ;
pair         = ( ident | string ) , ":" , item ;
item         = string | list | object | word ;
word         = { letter | digit | "_" | "#" | "." | "%" | "+" | "-" | "$" } ;
heredoc      = "<<<" , tag , eol , { line } , indent , tag ;

expr         = term , { ( "+" | "-" ) , term } ;
term         = factor , { ( "*" | "/" ) , factor } ;
factor       = number | "-" , factor | "$" , ident | ref | "(" , expr , ")" ;
ref          = id , "." , refprop ;
refprop      = "x" | "y" | "left" | "top" | "right" | "bottom"
             | "centerX" | "centerY" | "width" | "height" ;

id           = idchar-start , { idchar | "-" , idchar } | string ;
ident        = letter-or-underscore , { letter | digit | "_" } ;
string       = '"' , { char | escape } , '"' | "'" , { char | escape } , "'" ;
number       = [ "-" ] , digits , [ "." , digits ] , [ ( "e" | "E" ) , [ "+" | "-" ] , digits ] ;
comment      = "//" , { any } , eol | "/*" , { any } , "*/" ;
```

Whitespace and comments may appear between any two tokens of a statement; a statement ends at the end of its line (or of its block).

---

## Worked example

A small service map: frames, groups, bound arrows, styles, text, code and settings.

```lixsketch
lixsketch 1
@name "Service map"
@background #15111f
@theme dark
@grid true

$edge = #a0a0b0
$svc = #9d86df

text heading at 40, 20 {
  content: "Checkout services"
  fontSize: 28
  color: #e8e3f3
}

rect web at 60, 120 size 180x70 {
  stroke: $svc
  fill: #352b52
  fillStyle: solid
  roughness: 1
  label: "Web app"
  group: edge-tier
}

rect gateway at web.right + 120, web.y size 180x70 {
  stroke: $svc
  fill: #352b52
  fillStyle: solid
  roughness: 1
  label: "API gateway"
  group: edge-tier
}

circle cache at gateway.right + 120, gateway.y - 15 size 100x100 {
  stroke: #2ECC71
  fillStyle: dots
  fill: #2ECC71
  label: "Redis"
}

rect orders at gateway.x, gateway.bottom + 140 size 180x70 {
  stroke: #f5c542
  style: dashed
  label: "Orders"
}

code handler at orders.right + 80, orders.y {
  content: "POST /orders\n  validate(cart)\n  charge(card)"
  language: http
}

arrow a1 from web.right to gateway.left { stroke: $edge, label: "HTTPS" }
arrow a2 from gateway.right to cache.left { stroke: $edge, style: dotted, head: outline }
arrow a3 from gateway.bottom to orders.top { stroke: $edge, curve: elbow, label: "gRPC" }

frame backend at gateway.x - 30, gateway.y - 60 size 560x340 {
  name: "Backend"
  contains: gateway, cache, orders, handler, a2, a3
  fillStyle: grid
  gridSize: 24
}
```

---

## Versioning and compatibility

- **Format version.** The header number changes only for breaking changes; new optional properties are added within version 1. Nothing is dropped silently: on rect, circle, line, arrow, freehand and frame an unlisted property is kept as a style option, and on text, code, image and icon it is an error.
- **Scene compatibility.** A `.lixsketch` file compiles to the same v1 scene JSON the editor saves to the cloud and to `.lixjson` files. Every scene saved by the editor round-trips exactly. Older or hand-written JSON scenes are normalised on the way (missing fields get their defaults) and are stable from then on.
- **Opening files.** *Open* (`Ctrl+O`) and drag-and-drop accept `.lixsketch` (DSL text), `.lixjson` (gzip or plain JSON) and `.json`. A `.lixsketch` file that contains JSON — written by earlier versions of the VS Code extension — is detected and opened as JSON.
- **VS Code.** The LixSketch extension opens `.lixsketch` files in its canvas editor. New diagrams are written as DSL text; files that were JSON stay JSON when saved.
- **MIME type.** `text/vnd.lixsketch`, extension `.lixsketch`, UTF-8.

### LixScript compatibility

LixScript (the DSL Studio language described in [LIXSCRIPT.md](https://github.com/elixpo/sketch.elixpo/blob/main/LIXSCRIPT.md)) is the same syntax without the header. A headerless document is read with LixScript conventions:

- a `frame` without `contains` contains every non-frame shape;
- property values are style options exactly as written (no extra defaults are injected; the editor applies its defaults when drawing).

The DSL Studio's LixScript runner additionally wraps output in an automatic frame; `.lixsketch` files never add shapes that are not in the file.

## Programmatic API

```js
import {
  compileLixSketch,   // text → { scene, errors, warnings }
  lixSketchToScene,   // text → { scene, warnings }, throws LixSketchError
  sceneToLixSketch,   // scene → text
  parseLixSketch,     // text → { ast, errors }
  sceneFromFileText,  // .lixsketch or JSON text → { scene, kind }
} from '@elixpo/lixsketch'

const { scene, errors } = compileLixSketch(source)
if (errors.length) console.error(errors.map(e => `${e.line}:${e.col}: ${e.message}`))
```

Inside the editor, `window.__sceneSerializer.toLixSketch(name)` returns the current canvas as text and `window.__sceneSerializer.openFile(file)` opens a file.
