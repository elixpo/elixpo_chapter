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

function startService(modulePath) {
  const fullPath = join(projectRoot, modulePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Service file not found: ${fullPath}`);
    return null;
  }

  console.log(`🚀 Starting service: ${modulePath}`);
  
  const child = spawn('node', ['--experimental-modules', fullPath], {
    stdio: 'pipe',
    cwd: projectRoot,
    env: process.env
  });

  child.stdout.on('data', (data) => {
    console.log(`[${modulePath}] ${data.toString().trim()}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`[${modulePath}] ❌ ${data.toString().trim()}`);
  });

  child.on('close', (code) => {
    console.log(`[${modulePath}] Process exited with code ${code}`);
    setTimeout(() => {
      console.log(`🔄 Restarting service: ${modulePath}`);
      startService(modulePath);
    }, 2000);
  });

  return child;
}

console.log('🎯 Starting backend services...');
backendModules.forEach(startService);

process.on('SIGINT', () => {
  console.log('\n📊 Shutting down backend services...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n📊 Shutting down backend services...');
  process.exit(0);
});