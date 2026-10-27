#!/usr/bin/env python3
"""Run and test the lixSearch stack locally without Docker."""

from __future__ import annotations

import argparse
import importlib
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
from typing import TextIO
from urllib.request import urlopen

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
VENV_PYTHON = ROOT / "venv" / "bin" / "python"
ENV_FILE = ROOT / ".env.local"
LOG_DIR = ROOT / "data" / "logs" / "local"
REDIS_DIR = ROOT / "data" / "redis"
QDRANT_DIR = ROOT / "data" / "qdrant"
LOCAL_DIR = ROOT / "data" / "local"

REQUIRED_MODULES = (
    "quart",
    "hypercorn",
    "redis",
    "qdrant_client",
    "sentence_transformers",
    "playwright",
    "yaml",
    "dotenv",
    "lix_open_cache",
    "rtk",
    "structlog",
)


class LocalStackError(RuntimeError):
    pass


def load_environment() -> dict[str, str]:
    values = {key: value or "" for key, value in dotenv_values(ENV_FILE).items()}
    env = os.environ.copy()
    env.update(values)
    env.update(
        {
            "CORE_SERVICE_BACKEND": "local",
            "WORKERS": "1",
            "HOST": "127.0.0.1",
            "WORKER_PORT": values.get("WORKER_PORT") or "9002",
            "REDIS_HOST": "127.0.0.1",
            "REDIS_PORT": values.get("REDIS_PORT") or "9530",
            "QDRANT_MODE": "local",
            "QDRANT_PATH": values.get("QDRANT_PATH") or str(QDRANT_DIR),
            "MODEL_CACHE_DIR": values.get("MODEL_CACHE_DIR") or str(ROOT / "data" / "models"),
            "PYTHONPATH": str(ROOT / "lixsearch"),
        }
    )
    return env


def preflight() -> list[str]:
    errors: list[str] = []
    if sys.version_info[:2] != (3, 11):
        errors.append(f"Use Python 3.11; current interpreter is {sys.version.split()[0]}")
    if not ENV_FILE.is_file():
        errors.append("Root .env.local file is missing")
    if not VENV_PYTHON.is_file():
        errors.append("Python virtual environment is missing at ./venv")
    if shutil.which("redis-server") is None:
        errors.append("redis-server is not installed")
    for module_name in REQUIRED_MODULES:
        try:
            importlib.import_module(module_name)
        except Exception as exc:
            errors.append(f"Python module '{module_name}' is unavailable: {exc}")
    return errors


def redis_config(env: dict[str, str]) -> str:
    password = env.get("REDIS_PASSWORD", "")
    if not password:
        raise LocalStackError("REDIS_PASSWORD is blank in .env.local")
    return "\n".join(
        (
            "bind 127.0.0.1",
            "protected-mode yes",
            f"port {env['REDIS_PORT']}",
            f"dir {REDIS_DIR}",
            "appendonly yes",
            "appendfilename appendonly.aof",
            "save 60 1000",
            f"requirepass {password}",
            "daemonize no",
            "", 
        )
    )


def redis_is_ready(env: dict[str, str]) -> bool:
    import redis
    try:
        return bool(redis.Redis(
            host="127.0.0.1",
            port=int(env["REDIS_PORT"]),
            password=env.get("REDIS_PASSWORD") or None,
            socket_connect_timeout=1,
            socket_timeout=1,
        ).ping())
    except redis.RedisError:
        return False


def wait_for_port(host: str, port: int, process: subprocess.Popen, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise LocalStackError(f"Process exited early with code {process.returncode}")
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.2)
    raise LocalStackError(f"Timed out waiting for {host}:{port}")


def wait_for_http(url: str, process: subprocess.Popen, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise LocalStackError(f"Process exited early with code {process.returncode}")
        try:
            with urlopen(url, timeout=1) as response:
                if response.status < 500:
                    return
        except Exception:
            time.sleep(0.5)
    raise LocalStackError(f"Timed out waiting for {url}")


class LocalStack:
    def __init__(self, env: dict[str, str]) -> None:
        self.env = env
        self.processes: list[tuple[str, subprocess.Popen, TextIO]] = []

    def _spawn(self, name: str, command: list[str]) -> subprocess.Popen:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_handle = (LOG_DIR / f"{name}.log").open("a", encoding="utf-8")
        process = subprocess.Popen(
            command,
            cwd=ROOT,
            env=self.env,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        self.processes.append((name, process, log_handle))
        print(f"[local] {name} started pid={process.pid} log={LOG_DIR / (name + '.log')}")
        return process

    def start(self, infrastructure_only: bool = False) -> None:
        for directory in (LOG_DIR, REDIS_DIR, QDRANT_DIR, LOCAL_DIR, Path(self.env["MODEL_CACHE_DIR"])):
            directory.mkdir(parents=True, exist_ok=True)

        if redis_is_ready(self.env):
            print(f"[local] reusing Redis at 127.0.0.1:{self.env['REDIS_PORT' ]}")
        else:
            redis_conf = LOCAL_DIR / "redis.conf"
            redis_conf.write_text(redis_config(self.env), encoding="utf-8")
            redis_conf.chmod(0o600)
            redis_process = self._spawn("redis", ["redis-server", str(redis_conf)])
            wait_for_port("127.0.0.1", int(self.env["REDIS_PORT"]), redis_process, 15)

        if infrastructure_only:
            print("[local] Redis and persistent local Qdrant are ready")
            return

        app_process = self._spawn("app", [str(VENV_PYTHON), "lixsearch/app/main.py"])
        app_url = f"http://127.0.0.1:{self.env['WORKER_PORT']}/api/health"
        wait_for_http(app_url, app_process, 300)
        print(f"[local] lixSearch ready at http://127.0.0.1:{self.env['WORKER_PORT']}")
        if not self.env.get("POLLINATIONS_API_KEY"):
            print("[local] warning: POLLINATIONS_API_KEY is blank; provider-backed requests will fail until it is set")

    def monitor(self) -> None:
        while True:
            for name, process, _ in self.processes:
                code = process.poll()
                if code is not None:
                    raise LocalStackError(f"{name} exited with code {code}; inspect {LOG_DIR / (name + '.log')}")
            time.sleep(1)

    def stop(self) -> None:
        for name, process, _ in reversed(self.processes):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
                print(f"[local] {name} stopped")
        for _, _, log_handle in self.processes:
            log_handle.close()
        self.processes.clear()


def run_tests() -> int:
    command = [
        str(VENV_PYTHON),
        "-m",
        "unittest",
        "tester.test_skill_registry",
        "tester.test_core_service_manager",
        "tester.test_model_cache",
        "tester.test_local_dev",
        "tester.test_agent_runtime",
        "tester.test_agent_responses",
        "tester.test_streaming_buffer",
        "-v",
    ]
    return subprocess.run(command, cwd=ROOT).returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "start", "infra", "test"))
    args = parser.parse_args()

    errors = preflight()
    if errors:
        for error in errors:
            print(f"[local] error: {error}", file=sys.stderr)
        return 1

    if args.command == "check":
        env = load_environment()
        print("[local] Python 3.11 environment is ready")
        print(f"[local] model cache: {env['MODEL_CACHE_DIR']}")
        if not env.get("POLLINATIONS_API_KEY"):
            print("[local] warning: POLLINATIONS_API_KEY is blank")
        return 0
    if args.command == "test":
        return run_tests()

    stack = LocalStack(load_environment())

    def stop_from_signal(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop_from_signal)
    signal.signal(signal.SIGINT, stop_from_signal)
    try:
        stack.start(infrastructure_only=args.command == "infra")
        stack.monitor()
    except KeyboardInterrupt:
        return 0
    except LocalStackError as exc:
        print(f"[local] error: {exc}", file=sys.stderr)
        return 1
    finally:
        stack.stop()


if __name__ == "__main__":
    raise SystemExit(main())
