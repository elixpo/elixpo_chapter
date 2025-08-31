import psutil
import time

def monitor_and_restart_worker():
    global parent_conn, p
    MEMORY_LIMIT_MB = 4096
    while True:
        if not p.is_alive():
            parent_conn, child_conn = Pipe()
            p = Process(target=worker_process, args=(child_conn,))
            p.start()
        else:
            proc = psutil.Process(p.pid)
            mem_mb = proc.memory_info().rss / (1024 * 1024)
            if mem_mb > MEMORY_LIMIT_MB:
                print(f"Worker using {mem_mb:.2f} MB RAM, restarting...")
                parent_conn.send({"cmd": "exit"})
                p.join()
                parent_conn, child_conn = Pipe()
                p = Process(target=worker_process, args=(child_conn,))
                p.start()
        time.sleep(10)