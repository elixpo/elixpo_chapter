// gulpfile.js
import gulp from "gulp";
import browserSyncLib from "browser-sync";
import { createProxyMiddleware } from "http-proxy-middleware";
import history from "connect-history-api-fallback";
import ts from "gulp-typescript";
import sourcemaps from "gulp-sourcemaps";
import nodemon from "gulp-nodemon";

const browserSync = browserSyncLib.create();
const tsProject = ts.createProject("tsconfig.json");

const paths = {
  src: "src",
  scripts: ["src/**/*.ts"],
  backendWatch: ["api/**/*.js"]
};

// --- Compile TypeScript (Frontend) ---
gulp.task("typescript", () => {
  return gulp
    .src(paths.scripts)
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest("src")); // 👈 output compiled JS into same src folder
});

// --- Run Backend Services via Nodemon ---
gulp.task("backend", (done) => {
  let started = false;

  // Auth Worker
  nodemon({
    script: "api/authWorker/authService.js",
    watch: ["api/authWorker/**/*.js"],
    env: { NODE_ENV: "development" },
    stdout: true
  }).on("start", () => {
    if (!started) {
      started = true;
      done();
    }
  });

  // Redis Worker
  nodemon({
    script: "api/redisWorker/redisService.js",
    watch: ["api/redisWorker/**/*.js"],
    env: { NODE_ENV: "development" },
    stdout: true
  });
});


gulp.task("serve", () => {
  browserSync.init({
  server: {
    baseDir: "src",  // serve src as root
    middleware: [
      createProxyMiddleware({
        context: ["/api"],
        target: "http://localhost:3002",
        changeOrigin: true,
        logLevel: "debug"
      }),
      history({ index: "/index.html" }) // SPA fallback
    ]
  },
  files: ["src/**/*"],
  injectChanges: true,
  reloadOnRestart: true,
  notify: false,
  open: false,
  ghostMode: false
});


  
  gulp.watch(paths.scripts, gulp.series("typescript", (done) => {
    browserSync.reload();
    done();
  }));
});

// --- Default Task: Run Backend + Serve Frontend ---
gulp.task("default", gulp.parallel("backend", gulp.series("typescript", "serve")));
