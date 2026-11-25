/*
 * Elixpo festive themes. Generated into public/festive/theme.js by scripts/build-festive.mjs,
 * which inlines config/festivals.yaml as CALENDAR. Sites opt in with one script tag:
 *   <script src="https://agent.elixpo.com/festive/theme.js" defer></script>
 * The layer is decorative: it never blocks input and never restyles a site's own components.
 */
(function () {
  "use strict";
  var CALENDAR = /*__ELIXPO_FESTIVE_CALENDAR__*/ null;
  if (!CALENDAR || window.ElixpoFestive) return;

  var THEMES = {
    // A theme may carry a `canary` override: the next design, served first to hosts listed under
    // `canary` in festivals.yaml (and on localhost) before it replaces the default.
    // The site's top bar moves below the toran (topOffset), hanging diyas stay inside that band,
    // and the festival colours wash faintly over the whole page.
    "diwali": { accent: "#f59e0b", colors: ["#ffb347", "#ff7a1a", "#ffd166", "#e85d04"], particle: null, garland: "toran", diyas: true, trail: true,
      topOffset: 70, hangLen: [4, 12], tint: true },
    "holi": { accent: "#ec4899", colors: ["#ff4d9d", "#4dabff", "#ffd23f", "#3ddc84", "#a259ff"], particle: "powder", garland: "bunting" },
    "independence-day": { accent: "#ff9933", colors: ["#ff9933", "#ffffff", "#138808", "#000080"], particle: "confetti", garland: "bunting" },
    "republic-day": { accent: "#138808", colors: ["#ff9933", "#ffffff", "#138808", "#000080"], particle: "confetti", garland: "bunting" },
    "durga-puja": { accent: "#d00000", colors: ["#d00000", "#ffba08", "#ffffff", "#f48c06"], particle: "petal", garland: "lights" },
    "christmas": { accent: "#c1121f", colors: ["#ffffff", "#e0f2fe", "#c1121f", "#2d6a4f"], particle: "snow", garland: "lights" },
    "new-year": { accent: "#eab308", colors: ["#ffd166", "#c7d2fe", "#ffffff", "#ff6b6b"], particle: "sparkle", garland: "lights" },
    "winter": { accent: "#60a5fa", colors: ["#ffffff", "#dbeafe", "#bfdbfe"], particle: "snow", garland: null },
    "summer": { accent: "#f59e0b", colors: ["#ffd166", "#ffb347", "#fde68a"], particle: "sun", garland: null }
  };

  var DAY = 86400000;
  var dayNumber = function (iso) { var p = iso.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / DAY; };
  var todayIso = function () {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: CALENDAR.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  };

  function occurrences(festival, year) {
    if (festival.every_year) return [year - 1, year, year + 1].map(function (y) { var iso = y + "-" + festival.every_year; return { start: iso, end: iso }; });
    return (festival.dates || []).map(function (d) { return { start: d.start, end: d.end || d.start }; });
  }

  function resolve(iso) {
    var today = dayNumber(iso), year = Number(iso.slice(0, 4)), best = null;
    CALENDAR.festivals.forEach(function (festival) {
      var before = festival.before != null ? festival.before : CALENDAR.defaults.before;
      var after = festival.after != null ? festival.after : CALENDAR.defaults.after;
      occurrences(festival, year).forEach(function (o) {
        var start = dayNumber(o.start), end = dayNumber(o.end);
        if (today < start - before || today > end + after) return;
        var distance = today < start ? start - today : today > end ? today - end : 0;
        if (!best || distance < best.distance) best = { festival: festival, distance: distance };
      });
    });
    if (best) return { id: best.festival.id, name: best.festival.name, greeting: best.festival.greeting, festival: true };
    var month = Number(iso.slice(5, 7));
    var season = (CALENDAR.seasons || []).filter(function (s) { return s.months.indexOf(month) !== -1; })[0];
    return season ? { id: season.id, name: season.name, greeting: null, festival: false } : null;
  }

  var host = location.hostname.replace(/^www\./, "");
  var canaryPreview = false;
  try { canaryPreview = new URLSearchParams(location.search).get("festive-canary") === "1"; } catch (e) { /* no URL API */ }
  var isLocal = host === "localhost" || host === "127.0.0.1";
  // Local development always previews the newest designs.
  var isCanary = canaryPreview || isLocal || (CALENDAR.canary || []).indexOf(host) !== -1;

  var isOff = function () { return document.documentElement.hasAttribute("data-elixpo-festive-off"); };

  /** Routes listed under exclude_paths for this host (globs, * matches anything) never show a theme. */
  function excludedRoute() {
    var list = (CALENDAR.exclude_paths || {})[host] || [];
    var path = location.pathname;
    return list.some(function (glob) {
      return new RegExp("^" + glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(path);
    });
  }

  /** Applies the exclusion now and on every client-side navigation (pushState, replaceState, back/forward). */
  function watchRoutes() {
    var sync = function () {
      var off = excludedRoute();
      document.documentElement.toggleAttribute("data-elixpo-festive-off", off);
      if (!off) dispatchEvent(new Event("resize")); // re-check empty-space diyas on the new page
    };
    ["pushState", "replaceState"].forEach(function (name) {
      var original = history[name];
      history[name] = function () { var result = original.apply(this, arguments); setTimeout(sync, 0); return result; };
    });
    addEventListener("popstate", sync);
    sync();
  }

  function pick() {
    var param = null;
    try { param = new URLSearchParams(location.search).get("festive"); } catch (e) { /* no URL API */ }
    if (param === "off" || CALENDAR.override === "none") return null;
    var forced = param || CALENDAR.override;
    if (forced && THEMES[forced]) {
      var known = CALENDAR.festivals.concat(CALENDAR.seasons || []).filter(function (f) { return f.id === forced; })[0] || {};
      return { id: forced, name: known.name || forced, greeting: known.greeting || null, festival: !!known.greeting };
    }
    if (!isLocal && CALENDAR.services.indexOf(host) === -1) return null;
    return resolve(todayIso());
  }

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  var CSS = [
    "#elixpo-festive{position:fixed;inset:0;z-index:9990;pointer-events:none;overflow:hidden;contain:strict}",
    "#elixpo-festive .ef-glow{position:absolute;inset:0 0 auto;height:42vh;background:radial-gradient(ellipse 60% 100% at 50% 0,var(--ef-accent-soft),transparent 70%)}",
    "#elixpo-festive .ef-garland{position:absolute;inset:0 0 auto;height:16px}",
    "#elixpo-festive .ef-garland.lights{background:radial-gradient(circle at 18px 7px,var(--ef-c0) 0 3px,transparent 4.5px) 0 0/72px 16px,radial-gradient(circle at 54px 7px,var(--ef-c1) 0 3px,transparent 4.5px) 0 0/72px 16px;filter:drop-shadow(0 0 4px var(--ef-c0))}",
    "#elixpo-festive .ef-garland.lights::after{content:'';position:absolute;inset:0;background:radial-gradient(circle at 36px 9px,var(--ef-c2) 0 3px,transparent 4.5px) 0 0/72px 16px;animation:ef-blink 1.8s ease-in-out infinite alternate}",
    "#elixpo-festive .ef-garland.bunting{height:18px;background:conic-gradient(from 135deg at 50% 0,var(--ef-c0) 0 90deg,transparent 0) 0 0/66px 18px,conic-gradient(from 135deg at 50% 0,var(--ef-c1) 0 90deg,transparent 0) 22px 0/66px 18px,conic-gradient(from 135deg at 50% 0,var(--ef-c2) 0 90deg,transparent 0) 44px 0/66px 18px}",
    "#elixpo-festive .ef-p{position:absolute;top:0;left:var(--x);width:var(--s);height:var(--s);background:var(--c);border-radius:50%;opacity:0;will-change:transform,opacity;animation:var(--anim) var(--d) linear var(--delay) infinite}",
    "#elixpo-festive .ef-ember{top:100%;box-shadow:0 0 10px 2px var(--c)}",
    "#elixpo-festive .ef-snow{top:-12px}",
    "#elixpo-festive .ef-confetti{top:-14px;border-radius:2px;height:calc(var(--s)*.45)}",
    "#elixpo-festive .ef-petal{top:-14px;border-radius:70% 0 70% 0}",
    "#elixpo-festive .ef-powder{top:100%;width:calc(var(--s)*4);height:calc(var(--s)*4);background:radial-gradient(circle,var(--c),transparent 68%)}",
    "#elixpo-festive .ef-sun{top:100%;width:calc(var(--s)*2.4);height:calc(var(--s)*2.4);background:radial-gradient(circle,var(--c),transparent 70%)}",
    "#elixpo-festive .ef-sparkle{top:var(--y);border-radius:0;clip-path:polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%)}",
    "@keyframes ef-rise{0%{transform:translate3d(0,0,0);opacity:0}10%{opacity:.75}80%{opacity:.5}100%{transform:translate3d(var(--drift),-108vh,0);opacity:0}}",
    "@keyframes ef-fall{0%{transform:translate3d(0,0,0) rotate(0);opacity:0}8%{opacity:.8}90%{opacity:.65}100%{transform:translate3d(var(--drift),108vh,0) rotate(var(--spin));opacity:0}}",
    "@keyframes ef-twinkle{0%,100%{transform:scale(.3);opacity:0}50%{transform:scale(1.2) rotate(45deg);opacity:.85}}",
    "@keyframes ef-blink{from{opacity:.25}to{opacity:1}}",
    ".ef-badge{position:fixed;left:16px;bottom:16px;z-index:9991;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:8px 10px 8px 14px;border-radius:999px;background:rgba(20,20,20,.86);color:#fff;font:600 12px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25),inset 0 0 0 1px var(--ef-accent);animation:ef-in .5s cubic-bezier(.3,1.4,.5,1)}",
    ".ef-badge b{color:var(--ef-accent)}",
    ".ef-badge button{width:22px;height:22px;flex:none;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font:700 14px/1 system-ui;cursor:pointer}",
    ".ef-badge button:hover{background:var(--ef-accent)}",
    "@keyframes ef-in{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}",
    "html[data-elixpo-festive] ::selection{background:var(--ef-accent-soft-strong)}",
    "#elixpo-festive .ef-garland.toran{height:22px;background:radial-gradient(ellipse 4px 7px at 8px 17px,#2d6a4f 0 98%,transparent 100%) 4px 0/48px 26px,radial-gradient(circle at 8px 9px,#ff9f1c 0 6px,transparent 6.5px) 0 0/16px 22px,radial-gradient(circle at 8px 9px,#ffd166 0 6px,transparent 6.5px) 8px 4px/16px 22px;filter:drop-shadow(0 2px 2px rgba(120,40,0,.25))}",
    ".ef-diya{position:absolute;width:30px;height:14px;transition:opacity .35s}",
    ".ef-diya::before{content:'';position:absolute;inset:0;border-radius:0 0 50% 50%/0 0 100% 100%;background:linear-gradient(180deg,#f48c06,#9d0208);box-shadow:inset 0 2px 0 #ffba08}",
    ".ef-diya::after{content:'';position:absolute;left:50%;bottom:calc(20px - var(--glow,64px)/2);width:var(--glow,64px);height:var(--glow,64px);margin-left:calc(var(--glow,64px)/-2);border-radius:50%;background:radial-gradient(circle,rgba(255,186,80,.42),transparent 65%);animation:ef-pool 2.4s ease-in-out infinite alternate}",
    ".ef-flame{position:absolute;left:50%;bottom:calc(100% - 3px);width:9px;height:15px;margin-left:-4.5px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:radial-gradient(ellipse at 50% 75%,#fffbe0 0 22%,#ffd166 42%,#ff8c1a 72%,rgba(255,120,0,0) 74%);transform-origin:50% 100%;animation:ef-flicker .19s ease-in-out var(--fd,0s) infinite alternate}",
    "#elixpo-festive .ef-hang{position:absolute;top:14px;left:var(--x);width:30px;height:var(--len);transform-origin:50% 0;animation:ef-sway var(--d) ease-in-out var(--delay) infinite alternate;transition:opacity .35s}",
    "#elixpo-festive .ef-hang::before{content:'';position:absolute;left:50%;top:0;width:1px;height:100%;background:linear-gradient(#9c5518,#e8a33d)}",
    "#elixpo-festive .ef-hang .ef-diya{left:0;top:calc(100% + 13px)}",
    "#elixpo-festive-tint{position:fixed;inset:0;z-index:9989;pointer-events:none;contain:strict;background:radial-gradient(ellipse 55% 45% at 0 0,var(--ef-t0),transparent 70%),radial-gradient(ellipse 55% 45% at 100% 0,var(--ef-t1),transparent 70%),radial-gradient(ellipse 60% 50% at 0 100%,var(--ef-t2),transparent 70%),radial-gradient(ellipse 60% 50% at 100% 100%,var(--ef-t0),transparent 70%),linear-gradient(var(--ef-t3),var(--ef-t3))}",
    "html[data-elixpo-festive-offset] body{padding-top:calc(var(--ef-body-pad,0px) + var(--ef-shift,0px))}",
    "html[data-elixpo-festive-off]{--ef-shift:0px!important}",
    "html[data-elixpo-festive-off] #elixpo-festive,html[data-elixpo-festive-off] #elixpo-festive-bg,html[data-elixpo-festive-off] #elixpo-festive-tint,html[data-elixpo-festive-off] .ef-badge{display:none!important}",
    "#elixpo-festive-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:strict;background:radial-gradient(ellipse 90% 55% at 50% 115%,rgba(255,160,50,.11),transparent 70%)}",
    "#elixpo-festive-bg .ef-diya{opacity:var(--o);transform:scale(var(--k));transform-origin:50% 100%;--glow:110px}",
    "#elixpo-festive-bg .ef-diya::after{background:radial-gradient(circle,rgba(255,176,64,.55),transparent 62%)}",
    "#elixpo-festive-bg .ef-flame{animation-duration:.6s}",
    "#elixpo-festive .ef-off{opacity:0}",
    "#elixpo-festive .ef-spark{position:absolute;left:0;top:0;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;background:radial-gradient(circle,#fff6d5 0 25%,var(--c) 60%);clip-path:polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%);opacity:0;will-change:transform,opacity}",
    "html.ef-cursor:not([data-elixpo-festive-off]),html.ef-cursor:not([data-elixpo-festive-off]) body{cursor:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z' fill='%23ffc94d' stroke='%23893101' stroke-width='1.2' stroke-linejoin='round'/%3E%3C/svg%3E\") 12 12,auto}",
    "@keyframes ef-flicker{from{transform:scale(1,1) rotate(-2deg)}to{transform:scale(.9,1.13) rotate(2deg)}}",
    "@keyframes ef-pool{from{opacity:.65;transform:scale(.92)}to{opacity:1;transform:scale(1.06)}}",
    "@keyframes ef-sway{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}",
    "@media (prefers-reduced-motion:reduce){#elixpo-festive .ef-p,#elixpo-festive .ef-spark{display:none}#elixpo-festive .ef-garland::after,.ef-flame,#elixpo-festive .ef-hang,.ef-diya::after,.ef-badge{animation:none}}",
    "@media print{#elixpo-festive,#elixpo-festive-bg,#elixpo-festive-tint,.ef-badge{display:none}}"
  ].join("");

  var PARTICLES = {
    ember: { anim: "ef-rise", dur: [9, 15] },
    powder: { anim: "ef-rise", dur: [12, 20] },
    sun: { anim: "ef-rise", dur: [16, 26] },
    snow: { anim: "ef-fall", dur: [10, 18] },
    confetti: { anim: "ef-fall", dur: [7, 12] },
    petal: { anim: "ef-fall", dur: [9, 15] },
    sparkle: { anim: "ef-twinkle", dur: [2.4, 4.2] }
  };

  var hexAlpha = function (hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; };
  var rand = function (min, max) { return min + Math.random() * (max - min); };

  var MEDIA = { IMG: 1, SVG: 1, VIDEO: 1, CANVAS: 1, BUTTON: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, IFRAME: 1 };

  /** True when nothing readable or interactive is under the rectangle (only page background). */
  function isEmptyArea(x, y, w, h) {
    var points = [[x + w / 2, y + h / 2], [x + 2, y + 2], [x + w - 2, y + 2], [x + 2, y + h - 2], [x + w - 2, y + h - 2]];
    var viewArea = innerWidth * innerHeight;
    for (var i = 0; i < points.length; i++) {
      var px = points[i][0], py = points[i][1];
      if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) return false;
      var el = document.elementFromPoint(px, py);
      if (!el || el === document.documentElement || el === document.body) continue;
      if (MEDIA[el.tagName.toUpperCase()] || el.closest("a,button,label,input,textarea,select,[role=button],nav,header")) return false;
      for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.textContent.trim()) return false;
      var box = el.getBoundingClientRect();
      if (box.width * box.height > viewArea * 0.35) continue;
      var bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent" && !/,\s*0\)$/.test(bg)) return false;
    }
    return true;
  }

  function diya() {
    var d = document.createElement("span");
    d.className = "ef-diya";
    var flame = document.createElement("i");
    flame.className = "ef-flame";
    flame.style.setProperty("--fd", (-rand(0, 0.4)).toFixed(2) + "s");
    d.appendChild(flame);
    return d;
  }

  function mountDiyas(layer, hangLen) {
    var hang = [];
    var hangCount = Math.max(4, Math.min(14, Math.round(innerWidth / 130)));
    for (var i = 0; i < hangCount; i++) {
      var h = document.createElement("span");
      h.className = "ef-hang";
      h.style.setProperty("--x", ((i + 0.5) / hangCount * 100 + rand(-2, 2)).toFixed(2) + "vw");
      h.style.setProperty("--len", rand(hangLen[0], hangLen[1]).toFixed(0) + "px");
      h.style.setProperty("--d", rand(2.6, 4.2).toFixed(2) + "s");
      h.style.setProperty("--delay", (-rand(0, 4)).toFixed(2) + "s");
      h.appendChild(diya());
      layer.appendChild(h);
      hang.push(h);
    }
    var check = function () {
      if (isOff()) return;
      hang.forEach(function (el) {
        var b = el.querySelector(".ef-diya").getBoundingClientRect();
        // Include the flame and its glow above the bowl.
        el.classList.toggle("ef-off", !isEmptyArea(b.left - 6, b.top - 20, b.width + 12, b.height + 24));
      });
    };
    var timer = 0;
    var schedule = function () { clearTimeout(timer); timer = setTimeout(check, 140); };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    setTimeout(check, 60);
    setTimeout(check, 1200); // after late layout (fonts, images)
    return function () { removeEventListener("scroll", schedule); removeEventListener("resize", schedule); };
  }

  var TOP_BAND = 160; // keep the navigation area clear of background diyas

  /** Faint diyas scattered behind the page; sections with their own background cover them. */
  function mountBackdrop() {
    var bg = document.createElement("div");
    bg.id = "elixpo-festive-bg";
    bg.setAttribute("aria-hidden", "true");
    var cols = Math.max(3, Math.round(innerWidth / 280)), rows = Math.max(3, Math.round(innerHeight / 230));
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (Math.random() < 0.45) continue;
        var d = diya();
        d.style.left = ((c + rand(0.15, 0.85)) / cols * 100).toFixed(2) + "%";
        d.style.top = (TOP_BAND + (r + rand(0.2, 0.85)) / rows * (innerHeight - TOP_BAND)).toFixed(0) + "px";
        d.style.setProperty("--o", rand(0.16, 0.3).toFixed(2));
        d.style.setProperty("--k", rand(0.8, 1.35).toFixed(2));
        bg.appendChild(d);
      }
    }
    document.body.insertBefore(bg, document.body.firstChild);
    return function () { bg.remove(); };
  }

  function mountTrail(layer, colors) {
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches || !Element.prototype.animate) return function () {};
    var pool = [], next = 0, lastX = -99, lastY = -99, lastT = 0;
    for (var i = 0; i < 22; i++) {
      var s = document.createElement("i");
      s.className = "ef-spark";
      s.style.setProperty("--c", colors[i % colors.length]);
      layer.appendChild(s);
      pool.push(s);
    }
    var fire = function (x, y, dx, dy, duration, scale) {
      var s = pool[next++ % pool.length];
      s.animate([
        { transform: "translate3d(" + x + "px," + y + "px,0) scale(" + scale + ")", opacity: 1 },
        { transform: "translate3d(" + (x + dx) + "px," + (y + dy) + "px,0) scale(.15) rotate(120deg)", opacity: 0 }
      ], { duration: duration, easing: "cubic-bezier(.2,.7,.3,1)" });
    };
    var onMove = function (e) {
      if (isOff()) return;
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      var now = performance.now();
      if (now - lastT < 28 || Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) < 7) return;
      lastT = now; lastX = e.clientX; lastY = e.clientY;
      fire(e.clientX, e.clientY, rand(-10, 10), rand(8, 22), 560, rand(0.7, 1));
    };
    var onDown = function (e) {
      if (isOff()) return;
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      for (var k = 0; k < 9; k++) {
        var a = (k / 9) * Math.PI * 2 + rand(-0.2, 0.2), r = rand(26, 46);
        fire(e.clientX, e.clientY, Math.cos(a) * r, Math.sin(a) * r, 720, 1.15);
      }
    };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.classList.add("ef-cursor");
    return function () {
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown);
      document.documentElement.classList.remove("ef-cursor");
      pool.forEach(function (s) { s.remove(); });
    };
  }

  /** A faint wash of the festival colours from every edge of the page. */
  function mountTint(colors) {
    var root = document.documentElement;
    [0.13, 0.11, 0.1].forEach(function (a, i) { root.style.setProperty("--ef-t" + i, hexAlpha(colors[i % colors.length], a)); });
    root.style.setProperty("--ef-t3", hexAlpha(colors[0], 0.035));
    var tint = document.createElement("div");
    tint.id = "elixpo-festive-tint";
    tint.setAttribute("aria-hidden", "true");
    document.body.appendChild(tint);
    return function () { tint.remove(); };
  }

  /**
   * Moves the site's top bar below the toran and pushes the page down by the same amount.
   * Fixed bars are translated; sticky bars get a larger `top`. Re-applied on resize and DOM changes.
   */
  function mountTopOffset(px) {
    var root = document.documentElement;
    root.style.setProperty("--ef-body-pad", getComputedStyle(document.body).paddingTop);
    root.style.setProperty("--ef-shift", px + "px");
    root.setAttribute("data-elixpo-festive-offset", "");
    var shift = function () {
      var els = document.body.getElementsByTagName("*");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.hasAttribute("data-ef-shifted") || el.closest("#elixpo-festive,#elixpo-festive-bg,#elixpo-festive-tint,.ef-badge")) continue;
        var style = getComputedStyle(el);
        if (style.position !== "fixed" && style.position !== "sticky") continue;
        var b = el.getBoundingClientRect();
        if (b.top > 48 || b.height > 180 || b.width < innerWidth * 0.4) continue;
        el.setAttribute("data-ef-shifted", "");
        if (style.position === "fixed") el.style.translate = "0 var(--ef-shift, 0px)";
        else el.style.top = "calc(" + style.top + " + var(--ef-shift, 0px))";
      }
    };
    shift();
    var timer = 0;
    var observer = new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(shift, 200); });
    observer.observe(document.body, { childList: true, subtree: true });
    return function () { observer.disconnect(); };
  }

  function mount(active) {
    var base = THEMES[active.id], theme = {};
    for (var k in base) theme[k] = base[k];
    if (isCanary && base.canary) for (var c in base.canary) theme[c] = base.canary[c];
    var root = document.documentElement;
    var dismissKey = "elixpo-festive-dismissed:" + active.id + ":" + todayIso().slice(0, 4);
    var dismissed = store.get(dismissKey) === "1";
    root.setAttribute("data-elixpo-festive", active.id);
    root.style.setProperty("--ef-accent", theme.accent);
    root.style.setProperty("--ef-accent-soft", hexAlpha(theme.accent, 0.12));
    root.style.setProperty("--ef-accent-soft-strong", hexAlpha(theme.accent, 0.32));
    theme.colors.slice(0, 3).forEach(function (c, i) { root.style.setProperty("--ef-c" + i, c); });

    var style = document.createElement("style");
    style.id = "elixpo-festive-style";
    style.textContent = CSS;
    document.head.appendChild(style);

    var layer = document.createElement("div");
    layer.id = "elixpo-festive";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = '<div class="ef-glow"></div>' + (theme.garland ? '<div class="ef-garland ' + theme.garland + '"></div>' : "");
    var cleanups = [];
    if (theme.topOffset) mountTopOffset(theme.topOffset);
    if (theme.tint) mountTint(theme.colors);
    if (theme.diyas) {
      cleanups.push(mountDiyas(layer, theme.hangLen || [10, 34]));
      if (!dismissed) cleanups.push(mountBackdrop());
    }
    if (!dismissed && theme.trail) cleanups.push(mountTrail(layer, theme.colors));
    if (!dismissed && theme.particle) {
      var kind = PARTICLES[theme.particle];
      var count = window.matchMedia("(max-width: 640px)").matches ? 7 : 14;
      for (var i = 0; i < count; i++) {
        var p = document.createElement("i");
        p.className = "ef-p ef-" + theme.particle;
        var props = {
          "--x": rand(0, 100).toFixed(1) + "vw", "--y": rand(8, 85).toFixed(1) + "vh",
          "--s": rand(5, 11).toFixed(1) + "px", "--c": theme.colors[i % theme.colors.length],
          "--d": rand(kind.dur[0], kind.dur[1]).toFixed(1) + "s", "--delay": (-rand(0, kind.dur[1])).toFixed(1) + "s",
          "--drift": rand(-60, 60).toFixed(0) + "px", "--spin": rand(-540, 540).toFixed(0) + "deg", "--anim": kind.anim
        };
        for (var key in props) p.style.setProperty(key, props[key]);
        layer.appendChild(p);
      }
    }
    document.body.appendChild(layer);

    if (active.festival && active.greeting && !dismissed) {
      var badge = document.createElement("div");
      badge.className = "ef-badge";
      badge.setAttribute("role", "note");
      badge.innerHTML = "<span><b>✦</b> " + active.greeting + " from Elixpo</span>";
      var close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "Hide the " + active.name + " greeting and effects");
      close.textContent = "×";
      close.addEventListener("click", function () {
        store.set(dismissKey, "1");
        badge.remove();
        layer.querySelectorAll(".ef-p").forEach(function (p) { p.remove(); });
        cleanups.forEach(function (stop) { stop(); });
      });
      badge.appendChild(close);
      document.body.appendChild(badge);
    }
  }

  var active = pick();
  if (active && THEMES[active.id]) watchRoutes();
  window.ElixpoFestive = { active: active, calendar: CALENDAR, resolve: resolve };
  if (!active || !THEMES[active.id]) return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mount(active); });
  else mount(active);
})();
