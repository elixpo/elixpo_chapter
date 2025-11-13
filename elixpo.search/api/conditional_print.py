import tqdm 
import sys

class DummyContextManager:
    def __init__(self, *args, **kwargs):
        self.n = 0
        self.total = 1
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_value, traceback):
        pass
    def set_postfix_str(self, *args, **kwargs): pass
    def update(self, n=1): self.n += n
    def close(self): pass


def conditional_tqdm(iterable, show_logs, *args, **kwargs):
    if show_logs:
        return tqdm(iterable, *args, file=sys.stdout, **kwargs)
    else:
        return DummyContextManager()

def conditional_print(message, show_logs):
    if show_logs:
        print(message, file=sys.stdout)
