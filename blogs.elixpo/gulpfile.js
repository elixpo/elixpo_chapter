import gulp from "gulp";
import browserSyncLib from "browser-sync";
import ts from "typescript";
import fs from "fs";
import path from "path";
import { LRUCache } from "lru-cache";

const browserSync = browserSyncLib.create();
const srcDir = "JS"; // your TypeScript folder

// 🔹 LRU cache setup — keeps recent compiled files in memory
const cache = new LRUCache({
  max: 100,              // up to 100 compiled files
  ttl: 1000 * 60 * 5,    // each cached item expires after 5 minutes
});

// Compile a TS file (absolute path) and store in cache
function compileTSFile(absTsPath) {
  if (!fs.existsSync(absTsPath)) return null;
  const tsCode = fs.readFileSync(absTsPath, "utf8");
  const mtime = fs.statSync(absTsPath).mtimeMs;
  const cached = cache.get(absTsPath);
  if (cached && cached.mtime === mtime) return cached.output;
  const transpiled = ts.transpileModule(tsCode, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      inlineSourceMap: true,
      inlineSources: true,
    },
  });
  cache.set(absTsPath, { output: transpiled.outputText, mtime });
  return transpiled.outputText;
}

function serveTS(req, res, next) {
  // Serve JS requests by compiling corresponding TS if present,
  // and also allow direct .ts requests for debugging.
  let requestedUrl = req.url.split("?")[0];

  // helper to send compiled output with caching headers (ETag based on mtime)
  function sendCompiled(output, mtime) {
    const etag = `"${mtime}"`;
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "public, max-age=5"); // keep a short cache
    res.setHeader("ETag", etag);

    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return;
    }

    res.end(output);
  }

  // try .js -> .ts mapping first
  if (requestedUrl.endsWith(".js")) {
    // map /path/file.js -> <cwd>/path/file.ts
    const possibleTs = path.join(process.cwd(), requestedUrl.replace(/\.js$/, ".ts"));
    if (fs.existsSync(possibleTs)) {
      const cached = cache.get(possibleTs) || {};
      const output = compileTSFile(possibleTs);
      const mtime = (cached && cached.mtime) || (fs.existsSync(possibleTs) && fs.statSync(possibleTs).mtimeMs) || Date.now();
      sendCompiled(output, mtime);
      return;
    }
  }

  // allow direct .ts requests (keep existing behavior)
  if (requestedUrl.endsWith(".ts")) {
    const tsPath = path.join(process.cwd(), requestedUrl);
    if (fs.existsSync(tsPath)) {
      const cached = cache.get(tsPath) || {};
      const output = compileTSFile(tsPath);
      const mtime = (cached && cached.mtime) || fs.statSync(tsPath).mtimeMs;
      sendCompiled(output, mtime);
      return;
    }
  }

  next();
}

function serve(done) {
  browserSync.init({
    server: {
      baseDir: ".",
      middleware: [serveTS],
    },
    files: ["**/*.html", "**/*.css"], // keep watching HTML/CSS
    open: false,
    notify: false,
    reloadOnRestart: true,
  });

  // When a TS file changes, compile it immediately then trigger reload.
  gulp.watch(`${srcDir}/**/*.ts`).on("change", (filePath) => {
    // filePath is the path to the changed file; make absolute
    const abs = path.resolve(filePath);
    // compile into the cache so the middleware serves the fresh output
    compileTSFile(abs);
    // reload the browser — middleware will serve the updated JS when requested.
    browserSync.reload();
  });

  done();
}

export default gulp.series(serve);
