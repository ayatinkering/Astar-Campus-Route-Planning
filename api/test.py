from fastapi import FastAPI
import sys
import os

app = FastAPI()

@app.get("/api/test")
def test():
    # Gather file structure
    cwd = os.getcwd()
    files = []
    try:
        files = os.listdir(cwd)
    except Exception as e:
        files = [f"Error listing cwd: {str(e)}"]
        
    parent_files = []
    try:
        parent_files = os.listdir(os.path.dirname(cwd))
    except Exception as e:
        parent_files = [f"Error listing parent: {str(e)}"]

    return {
        "sys.path": sys.path,
        "cwd": cwd,
        "cwd_files": files,
        "parent_files": parent_files,
        "env": {k: v for k, v in os.environ.items() if "SECRET" not in k.upper() and "KEY" not in k.upper() and "PASSWORD" not in k.upper()}
    }
