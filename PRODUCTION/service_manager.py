#!/usr/bin/env python3
"""
Service Manager for Elixpo Search with IPC Embedding
Manages the embedding server and app workers
"""

import os
import sys
import time
import signal
import subprocess
import argparse
from pathlib import Path
from loguru import logger

class SearchServiceManager:
    def __init__(self, src_dir):
        self.src_dir = Path(src_dir)
        self.processes = {}
        self.running = False
        
    def start_embedding_server(self):
        """Start the embedding server"""
        logger.info("Starting embedding server...")
        
        cmd = [sys.executable, "modelServer.py"]
        process = subprocess.Popen(
            cmd,
            cwd=self.src_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        
        self.processes['embedding_server'] = process
        logger.info(f"Embedding server started with PID: {process.pid}")
        
        # Wait a moment for server to initialize
        time.sleep(3)
        return process
    
    def start_app_worker(self, port=5000, worker_id=0):
        """Start an app worker on specified port"""
        logger.info(f"Starting app worker {worker_id} on port {port}...")
        
        env = os.environ.copy()
        env['PORT'] = str(port)
        
        cmd = [sys.executable, "app.py"]
        process = subprocess.Popen(
            cmd,
            cwd=self.src_dir,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        
        self.processes[f'app_worker_{worker_id}'] = process
        logger.info(f"App worker {worker_id} started with PID: {process.pid} on port {port}")
        return process
    
    def test_embedding_connection(self):
        """Test connection to embedding server"""
        logger.info("Testing embedding server connection...")
        
        try:
            cmd = [sys.executable, "../test_embedding_ipc.py"]
            result = subprocess.run(
                cmd,
                cwd=self.src_dir,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.success("Embedding server connection test passed")
                return True
            else:
                logger.error(f"Embedding server connection test failed: {result.stderr}")
                return False
        except subprocess.TimeoutExpired:
            logger.error("Embedding server connection test timed out")
            return False
        except Exception as e:
            logger.error(f"Error testing embedding server: {e}")
            return False
    
    def start_all(self, num_workers=2, base_port=5000):
        """Start embedding server and multiple app workers"""
        logger.info(f"Starting Elixpo Search with {num_workers} workers...")
        
        try:
            # Start embedding server
            embedding_process = self.start_embedding_server()
            
            # Test connection
            if not self.test_embedding_connection():
                logger.error("Failed to connect to embedding server")
                self.stop_all()
                return False
            
            # Start app workers
            for i in range(num_workers):
                port = base_port + i
                self.start_app_worker(port, i)
                time.sleep(1)  # Stagger startup
            
            self.running = True
            logger.success(f"All services started successfully!")
            logger.info(f"Embedding server: localhost:5002")
            for i in range(num_workers):
                port = base_port + i
                logger.info(f"App worker {i}: localhost:{port}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to start services: {e}")
            self.stop_all()
            return False
    
    def stop_all(self):
        """Stop all processes"""
        logger.info("Stopping all services...")
        
        for name, process in self.processes.items():
            try:
                logger.info(f"Stopping {name} (PID: {process.pid})")
                process.terminate()
                
                # Wait for graceful shutdown
                try:
                    process.wait(timeout=10)
                    logger.info(f"{name} stopped gracefully")
                except subprocess.TimeoutExpired:
                    logger.warning(f"Force killing {name}")
                    process.kill()
                    process.wait()
            except Exception as e:
                logger.error(f"Error stopping {name}: {e}")
        
        self.processes.clear()
        self.running = False
        logger.info("All services stopped")
    
    def monitor(self):
        """Monitor running processes"""
        if not self.running:
            return
            
        logger.info("Monitoring services (Ctrl+C to stop)...")
        
        try:
            while self.running:
                # Check if any process has died
                dead_processes = []
                for name, process in self.processes.items():
                    if process.poll() is not None:
                        dead_processes.append(name)
                        logger.error(f"Process {name} has died with return code {process.returncode}")
                
                # Remove dead processes
                for name in dead_processes:
                    del self.processes[name]
                
                if dead_processes:
                    logger.error("Some processes have died, stopping all services")
                    self.stop_all()
                    break
                
                time.sleep(5)  # Check every 5 seconds
                
        except KeyboardInterrupt:
            logger.info("Received interrupt signal")
            self.stop_all()

def main():
    parser = argparse.ArgumentParser(description="Elixpo Search Service Manager")
    parser.add_argument("--workers", type=int, default=2, help="Number of app workers (default: 2)")
    parser.add_argument("--port", type=int, default=5000, help="Base port for app workers (default: 5000)")
    parser.add_argument("--src-dir", type=str, default="src", help="Source directory path (default: src)")
    
    args = parser.parse_args()
    
    # Setup src directory path
    if os.path.isabs(args.src_dir):
        src_dir = args.src_dir
    else:
        src_dir = Path(__file__).parent / args.src_dir
    
    if not src_dir.exists():
        logger.error(f"Source directory not found: {src_dir}")
        sys.exit(1)
    
    # Create service manager
    manager = SearchServiceManager(src_dir)
    
    # Setup signal handler
    def signal_handler(signum, frame):
        logger.info("Received shutdown signal")
        manager.stop_all()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Start services
    if manager.start_all(args.workers, args.port):
        manager.monitor()
    else:
        logger.error("Failed to start services")
        sys.exit(1)

if __name__ == "__main__":
    main()