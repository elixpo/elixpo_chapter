import gulp from "gulp";
import browserSyncLib from "browser-sync";
import ts from "typescript";
import fs from "fs";
import path from "path";
import LRU from "lru-cache";

const browserSync = browserSyncLib.create();
const srcDir = "JS"; // your TypeScript folder

// 🔹 LRU cache setup — keeps recent compiled files in memory
const cache = new LRU({
  max: 100,              // up to 100 compiled files
  ttl: 1000 * 60 * 5,    // each cached item expires after 5 minutes
});

function serveTS(req, res, next) {
  if (req.url.endsWith(".ts")) {
    const tsPath = path.join(process.cwd(), req.url);

    if (fs.existsSync(tsPath)) {
      const mtime = fs.statSync(tsPath).mtimeMs; // last modified time
      const cached = cache.get(tsPath);

      if (cached && cached.mtime === mtime) {
        res.setHeader("Content-Type", "application/javascript");
        res.end(cached.output);
        return;
      }

      // 🚀 Compile fresh if not cached or file changed
      const tsCode = fs.readFileSync(tsPath, "utf8");
      const transpiled = ts.transpileModule(tsCode, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2020,
          inlineSourceMap: true,
          inlineSources: true,
        },
      });

      // 💾 Save to cache
      cache.set(tsPath, { output: transpiled.outputText, mtime });

      res.setHeader("Content-Type", "application/javascript");
      res.end(transpiled.outputText);
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
    files: ["**/*.html", "**/*.css"],
    open: false,
    notify: false,
    reloadOnRestart: true,
  });

  gulp.watch(`${srcDir}/**/*.ts`).on("change", browserSync.reload);
  done();
}

export default gulp.series(serve);
