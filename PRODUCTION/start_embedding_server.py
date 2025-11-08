#!/usr/bin/env python3
"""
Startup script for the Elixpo Search Embedding Server
Launches the IPC-based embedding model server on port 5002
"""

import sys
import os
import time
import subprocess
import signal
from pathlib import Path
from loguru import logger

# Add src directory to path
src_dir = Path(__file__).parent / "src"
sys.path.insert(0, str(src_dir))

def start_embedding_server():
    """Start the embedding server"""
    logger.info("Starting Elixpo Search Embedding Server...")
    
    try:
        # Change to src directory
        os.chdir(src_dir)
        
        # Start the embedding server
        process = subprocess.Popen([
            sys.executable, "modelServer.py"
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        logger.info(f"Embedding server started with PID: {process.pid}")
        
        # Monitor the process
        try:
            while True:
                output = process.stdout.readline()
                if output:
                    print(output.strip())
                
                # Check if process is still running
                if process.poll() is not None:
                    logger.error("Embedding server process has terminated")
                    break
                    
                time.sleep(0.1)
        except KeyboardInterrupt:
            logger.info("Received interrupt signal, shutting down embedding server...")
            process.terminate()
            
            # Wait for graceful shutdown
            try:
                process.wait(timeout=10)
                logger.info("Embedding server shut down gracefully")
            except subprocess.TimeoutExpired:
                logger.warning("Embedding server did not shut down gracefully, forcing termination")
                process.kill()
                process.wait()
        
        return process.returncode
        
    except Exception as e:
        logger.error(f"Failed to start embedding server: {e}")
        return 1

def check_dependencies():
    """Check if required dependencies are available"""
    try:
        import torch
        import sentence_transformers
        import faiss
        import loguru
        logger.info("All dependencies are available")
        return True
    except ImportError as e:
        logger.error(f"Missing dependency: {e}")
        logger.error("Please install required packages: pip install torch sentence-transformers faiss-cpu loguru")
        return False

if __name__ == "__main__":
    logger.info("Elixpo Search Embedding Server Startup")
    
    if not check_dependencies():
        sys.exit(1)
    
    exit_code = start_embedding_server()
    sys.exit(exit_code)