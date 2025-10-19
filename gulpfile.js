import gulp from "gulp";
import ts from "gulp-typescript";
import sourcemaps from "gulp-sourcemaps";

// Load tsconfig
const tsProject = ts.createProject("tsconfig.json");

// Compile TypeScript
export function typescript() {
  return tsProject
    .src()
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest("dist"));
}

// Watch for changes in TS files
export function watchTS() {
  gulp.watch(["JS/**/*.ts"], typescript);
}

// Default task
export default gulp.series(typescript, watchTS);
