import sys
import json
import threading

_stdout_lock = threading.Lock()


def emit(obj: dict):
    line = json.dumps(obj, ensure_ascii=False) + "\n"
    with _stdout_lock:
        sys.stdout.write(line)
        sys.stdout.flush()
