import gulp from 'gulp';
import browserSync from 'browser-sync';
import ts from 'gulp-typescript';
import sourcemaps from 'gulp-sourcemaps';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const browserSyncInstance = browserSync.create();

// Store child processes
let authWorkerProcess;
let redisWorkerProcess;

// TypeScript project (fixed configuration)
const tsProject = ts.createProject({
  target: 'ES2017',
  module: 'ES2015',
  sourceMap: true,
  outDir: 'JS',
  rootDir: 'JS',
  skipLibCheck: true // Removed incremental to fix the error
});

// Optimized backend startup with restart capabilities
function startBackendService(serviceName, scriptPath) {
  // Check if file exists before trying to start it
  if (!existsSync(scriptPath)) {
    console.warn(`⚠️ ${serviceName} file not found: ${scriptPath}`);
    return null;
  }

  const childProcess = spawn('node', [scriptPath], {
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'development' }
  });
  
  childProcess.on('error', (err) => {
    console.error(`${serviceName} error:`, err.message);
  });
  
  childProcess.on('exit', (code) => {
    if (code !== 0) {
      console.log(`${serviceName} exited with code ${code}`);
    }
  });
  
  console.log(`✅ ${serviceName} started`);
  return childProcess;
}

gulp.task('start-backend', (done) => {
  console.log('🚀 Starting backend services...');
  
  redisWorkerProcess = startBackendService('Redis Worker', 'api/redisWorker/redisService.js');
  authWorkerProcess = startBackendService('Auth Service', 'api/authWorker/authService.js');
  
  
  if (!authWorkerProcess && !redisWorkerProcess) {
    console.warn('⚠️ No backend services found to start');
  }
  
  done();
});

gulp.task('stop-backend', (done) => {
  const stopProcess = (childProcess, name) => {
    if (childProcess && !childProcess.killed) {
      childProcess.kill('SIGTERM');
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill('SIGKILL');
        }
      }, 3000);
      console.log(`🛑 ${name} stopped`);
    }
  };
  
  stopProcess(authWorkerProcess, 'Auth service');
  stopProcess(redisWorkerProcess, 'Redis worker');
  
  authWorkerProcess = null;
  redisWorkerProcess = null;
  
  done();
});

// Faster TypeScript compilation
gulp.task('typescript', () => {
  return gulp.src(['JS/**/*.ts'], { since: gulp.lastRun('typescript') })
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .js
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('JS'))
    .pipe(browserSyncInstance.stream({ match: '**/*.js' }));
});

// Debounced restart function to prevent multiple restarts
let restartTimeout;
function debouncedRestart() {
  clearTimeout(restartTimeout);
  restartTimeout = setTimeout(() => {
    console.log('🔄 Restarting backend services...');
    gulp.series('stop-backend', 'start-backend')();
  }, 500);
}

gulp.task('serve', gulp.series('start-backend', 'typescript', (done) => {
  setTimeout(() => {
    browserSyncInstance.init({
      server: {
        baseDir: ".",
        middleware: [
          createProxyMiddleware('/api', {
            target: 'http://localhost:3002',
            changeOrigin: true,
            logLevel: 'warn',
            timeout: 5000
          })
        ]
      },
      files: [
        {
          match: ["**/*.css", "**/*.html"],
          fn: function (event, file) {
            if (event === "change") {
              this.reload();
            }
          }
        }
      ],
      watchOptions: {
        ignored: ['node_modules', '.git'], 
        usePolling: false 
      },
      injectChanges: true,
      reloadOnRestart: false, 
      notify: {
        styles: {
          top: 'auto',
          bottom: '0',
          right: '0',
          fontSize: '12px'
        }
      },
      open: false,
      ghostMode: false 
    });

    // Optimized file watching
    gulp.watch(['JS/**/*.ts'], { delay: 300 }, gulp.series('typescript'))
      .on('change', (path) => console.log(`📝 TypeScript changed: ${path}`));
    
    // Watch backend files with debouncing
    gulp.watch(['api/**/*.js'], { delay: 500 })
      .on('change', (path) => {
        console.log(`🔧 Backend changed: ${path}`);
        debouncedRestart();
      });
    
    console.log('🌐 Development server ready!');
    done();
  }, 1500); 
}));

// Graceful shutdown handlers
const gracefulShutdown = () => {
  console.log('\n🛑 Shutting down gracefully...');
  clearTimeout(restartTimeout);
  
  const cleanup = gulp.series('stop-backend');
  cleanup(() => {
    console.log('✅ Cleanup complete');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

process.on('beforeExit', () => {
  if (authWorkerProcess) authWorkerProcess.kill();
  if (redisWorkerProcess) redisWorkerProcess.kill();
});

gulp.task('default', gulp.series('serve'));