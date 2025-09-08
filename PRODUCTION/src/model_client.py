from model_server import worker_process
from multiprocessing import Process, Pipe
parent_conn, child_conn = Pipe()
p = Process(target=worker_process, args=(child_conn,))
if __name__ == '__main__':
    p.start()