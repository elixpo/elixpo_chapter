import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const backendModules = [
  'api/authWorker/authService.js',
  'api/redisWorker/redisService.js'
];

const children = new Map(); // modulePath -> child process
const restartTimers = new Map();

function spawnService(modulePath) {
  const fullPath = join(projectRoot, modulePath);
  console.log(`🚀 Spawning service: ${modulePath}`);
  const child = spawn('node', ['--enable-source-maps', fullPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: projectRoot,
    env: { ...process.env }
  });

  child.stdout.on('data', (data) => {
    console.log(`[${modulePath}] ${data.toString().trim()}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`[${modulePath}] ❌ ${data.toString().trim()}`);
  });

  child.on('exit', (code, signal) => {
    console.log(`[${modulePath}] exited with code=${code} signal=${signal}`);
    // only restart here if not intentionally killed for reload
    if (!restartTimers.has(modulePath)) {
      // restarted by crash, restart after short delay
      setTimeout(() => spawnService(modulePath), 1000);
    }
  });

  children.set(modulePath, child);
  return child;
}

function stopService(modulePath) {
  const child = children.get(modulePath);
  if (!child) return;
  try {
    child.kill('SIGTERM');
  } catch (e) {
    // ignore
  }
  children.delete(modulePath);
}

function restartService(modulePath) {
  // debounce restarts to avoid multiple triggers
  if (restartTimers.has(modulePath)) {
    clearTimeout(restartTimers.get(modulePath));
  }
  restartTimers.set(modulePath, setTimeout(() => {
    restartTimers.delete(modulePath);
    console.log(`🔄 Restarting service: ${modulePath}`);
    stopService(modulePath);
    spawnService(modulePath);
  }, 300));
}

console.log('🎯 Starting backend services...');
backendModules.forEach((m) => {
  const fullPath = join(projectRoot, m);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Service file not found: ${fullPath}`);
    return;
  }
  spawnService(m);
});

// graceful shutdown kill children
function shutdown() {
  console.log('\n📊 Shutting down backend services...');
  for (const [modulePath, child] of children.entries()) {
    try { child.kill('SIGTERM'); } catch (e) {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);