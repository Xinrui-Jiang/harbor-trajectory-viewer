import subprocess
def run(*a): return subprocess.run(["python", "greet.py", *a], capture_output=True, text=True).stdout.strip()
def test_name(): assert run("Ada") == "Hello, Ada!"
def test_default(): assert run() == "Hello, World!"
