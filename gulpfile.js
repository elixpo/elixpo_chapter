// gulpfile.js
import gulp from "gulp";
import browserSyncLib from "browser-sync";
import { createProxyMiddleware } from "http-proxy-middleware";
import history from "connect-history-api-fallback";
import ts from "gulp-typescript";
import sourcemaps from "gulp-sourcemaps";
import path from "path";

const browserSync = browserSyncLib.create();

// Load tsconfig.json
const tsProject = ts.createProject("tsconfig.json");

// --- Paths ---
const paths = {
  scripts: ["src/**/*.ts"],
  html: ["src/**/*.html"],
  css: ["src/**/*.css"],
  dist: "dist"
};

// --- Compile TypeScript ---
gulp.task("typescript", () => {
  return gulp
    .src(paths.scripts)
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest(paths.dist));
});

// --- Serve with BrowserSync + Proxy + SPA Fallback ---
gulp.task("serve", () => {
  // Proxy for /api
  const apiProxy = createProxyMiddleware("/api", {
    target: "http://localhost:3002",
    changeOrigin: true,
    logLevel: "debug"
  });

  browserSync.init({
    server: {
      baseDir: paths.dist,
      middleware: [
        apiProxy,
        history() 
      ]
    },
    files: [
      `${paths.dist}/**/*.css`,
      `${paths.dist}/**/*.html`,
      `${paths.dist}/**/*.js`
    ],
    injectChanges: true,
    reloadOnRestart: true,
    notify: false,
    open: false
  });

  // Watch and rebuild
  gulp.watch(paths.scripts, gulp.series("typescript", (done) => {
    browserSync.reload();
    done();
  }));
  gulp.watch([paths.html, paths.css]).on("change", browserSync.reload);
});

// --- Default ---
gulp.task("default", gulp.series("typescript", "serve"));
