import gulp from "gulp";
import browserSyncLib from "browser-sync";
import ts from "typescript";
import fs from "fs";
import path from "path";
import { LRUCache } from "lru-cache";
import chokidar from "chokidar";
import { spawn } from "child_process";

const browserSync = browserSyncLib.create();
const srcDir = "JS";
const apiDir = "api";

const cache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 5,
});

let apiProcess = null;
const apiRestartTimers = new Map();

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
  let requestedUrl = req.url.split("?")[0];

  function sendCompiled(output, mtime) {
    const etag = `"${mtime}"`;
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "public, max-age=5");
    res.setHeader("ETag", etag);

    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return;
    }

    res.end(output);
  }

  if (requestedUrl.endsWith(".js")) {
    const possibleTs = path.join(process.cwd(), requestedUrl.replace(/\.js$/, ".ts"));
    if (fs.existsSync(possibleTs)) {
      const cached = cache.get(possibleTs) || {};
      const output = compileTSFile(possibleTs);
      const mtime = (cached && cached.mtime) || (fs.existsSync(possibleTs) && fs.statSync(possibleTs).mtimeMs) || Date.now();
      sendCompiled(output, mtime);
      return;
    }
  }

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

function startApiServer() {
  if (apiProcess) {
    apiProcess.kill('SIGTERM');
  }
  apiProcess = spawn('node', ['api/run-backend.js'], {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('🚀 Backend server started');
}

function restartApi() {
  if (apiRestartTimers.has('api')) {
    clearTimeout(apiRestartTimers.get('api'));
  }
  apiRestartTimers.set('api', setTimeout(() => {
    apiRestartTimers.delete('api');
    console.log('🔄 Restarting backend server...');
    startApiServer();
  }, 300));
}

function serve(done) {
  startApiServer();

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

  gulp.watch(`${srcDir}/**/*.ts`).on("change", (filePath) => {
    const abs = path.resolve(filePath);
    compileTSFile(abs);
    browserSync.reload();
  });

  const apiWatcher = chokidar.watch([`${apiDir}/**/*.js`, `${apiDir}/**/*.ts`], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  });

  apiWatcher.on('all', (event, filePath) => {
    console.log(`[api] ${event} -> ${filePath}`);
    restartApi();
  });

  process.on('exit', () => {
    if (apiProcess) apiProcess.kill();
    apiWatcher.close();
  });

  done();
}

export default gulp.series(serve);
