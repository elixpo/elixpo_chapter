import gulp from 'gulp';
import ts from 'gulp-typescript';
import sourcemaps from 'gulp-sourcemaps';
import browserSync from 'browser-sync';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bs = browserSync.create();
const tsProject = ts.createProject('./tsconfig.json');

const paths = {
  scripts: ['scripts/**/*.ts', 'scripts/**/*.js'],
  html: ['**/*.html', '!node_modules/**'],
  styles: ['styles/**/*.css', '!node_modules/**'],
  api: ['api/**/*.js'],
  dist: 'dist'
};

function compileTsInMemory(outputPath = 'dist') {
  return gulp
    .src(paths.scripts)
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .on('error', (error) => {
      console.error('TypeScript Compilation Error:', error.message);
    })
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(outputPath));
}

function compileTsForBuild() {
  return compileTsInMemory('dist');
}

function watchScripts(cb) {
  gulp.watch(paths.scripts, gulp.series(compileTsInMemory, () => {
    bs.reload('*.js');
  }));
  cb();
}

function watchHtml(cb) {
  gulp.watch(paths.html, (cb2) => {
    bs.reload('*.html');
    cb2();
  });
  cb();
}

function watchStyles(cb) {
  gulp.watch(paths.styles, (cb2) => {
    bs.reload('*.css');
    cb2();
  });
  cb();
}

function serve(cb) {
  bs.init({
    server: {
      baseDir: '.',
      middleware: [
        {
          route: '/api',
          handle: require('http-proxy-middleware').createProxyMiddleware({
            target: 'http://localhost:3002',
            changeOrigin: true,
            logLevel: 'debug'
          })
        }
      ]
    },
    files: [
      'styles/**/*.css',
      'index.html',
      'discover/**/*.html',
      'library/**/*.html'
    ],
    injectChanges: true,
    reloadOnRestart: true,
    notify: false,
    open: false
  });
  cb();
}

function clean(cb) {
  if (fs.existsSync(paths.dist)) {
    fs.rmSync(paths.dist, { recursive: true, force: true });
  }
  cb();
}

export const build = gulp.series(clean, compileTsForBuild);
export const dev = gulp.series(
  (cb) => compileTsInMemory(),
  serve,
  gulp.parallel(watchScripts, watchHtml, watchStyles)
);
export default dev;
