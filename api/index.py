import sys
import os
import traceback

try:
    # Add root folder to sys.path
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from src.api import app
except Exception as e:
    from fastapi import FastAPI
    app = FastAPI(title="MIT Campus Route Planner API - Debug Mode")
    error_msg = traceback.format_exc()
    
    @app.get("/api/graph")
    def get_graph():
        return {"error": "Import failed", "traceback": error_msg}
        
    @app.post("/api/route")
    def compute_route():
        return {"error": "Import failed", "traceback": error_msg}
        
    @app.get("/api/benchmark")
    def trigger_benchmark():
        return {"error": "Import failed", "traceback": error_msg}
