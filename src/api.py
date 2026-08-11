import os
import time
import random
import networkx as nx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from src.config import LABELED_GRAPH_PATH, RAW_GRAPH_PATH, GEOJSON_FILES
from src.graph_utils import load_graph, preprocess_graph, label_nodes_with_geojson
from src.pathfinding import run_astar, run_bfs, run_dfs, path_cost

app = FastAPI(title="GraphMIT API")

# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Graph references
G = None
nodes_map = {}
label_to_node = {}

def init_graph():
    """Initializes and loads the graph, running the labeling pipeline if needed."""
    global G, nodes_map, label_to_node
    
    if not os.path.exists(LABELED_GRAPH_PATH):
        print(f"Labeled graph not found. Automatically generating labeled graph...")
        # Run labeling pipeline inline
        raw_g = load_graph(RAW_GRAPH_PATH)
        clean_g = preprocess_graph(raw_g)
        G, label_to_node_temp = label_nodes_with_geojson(clean_g, GEOJSON_FILES)
        nx.write_graphml(G, LABELED_GRAPH_PATH)
        print("Labeled graph generated and saved successfully.")
    else:
        G = load_graph(LABELED_GRAPH_PATH)
    
    # Pre-cache nodes map and label mappings
    nodes_map = {}
    label_to_node = {}
    for node, data in G.nodes(data=True):
        # Convert coords to float
        data['x'] = float(data.get('x', 0.0))
        data['y'] = float(data.get('y', 0.0))
        nodes_map[node] = data
        
        lbl = data.get("label")
        if lbl and lbl != "Unknown":
            label_to_node[lbl.strip().lower()] = node

# Load graph immediately on import so it's always ready
init_graph()

# --- Data Transfer Objects (Pydantic Models) ---

class RouteRequest(BaseModel):
    start: str  # Can be a node ID or a landmark label (e.g. "B 18")
    goal: str   # Can be a node ID or a landmark label (e.g. "Library")
    algo: str = "astar"  # "astar", "bfs", "dfs"
    heuristic: str = "euclidean"  # "euclidean", "manhattan"
    traffic: bool = False

class RouteResponse(BaseModel):
    path: List[str]
    cost: float
    time_ms: float
    landmarks: List[str]

class BenchmarkMetric(BaseModel):
    name: str
    avgTime: float
    avgCost: float
    avgLength: float

# --- API Routes ---

@app.get("/api/graph")
def get_graph():
    """Returns nodes and edges of the road network graph."""
    if G is None:
        raise HTTPException(status_code=500, detail="Graph is not loaded.")
    
    nodes_out = []
    for node, data in G.nodes(data=True):
        nodes_out.append({
            "id": node,
            "x": data['x'],
            "y": data['y'],
            "label": data.get("label", "Unknown")
        })
        
    edges_out = []
    for u, v, k, data in G.edges(keys=True, data=True):
        edges_out.append({
            "source": u,
            "target": v,
            "length": float(data.get("length", 1.0))
        })
        
    return {"nodes": nodes_out, "edges": edges_out}

@app.post("/api/route", response_model=RouteResponse)
def compute_route(req: RouteRequest):
    """Computes path from start to goal landmark using the requested algorithm."""
    if G is None:
        raise HTTPException(status_code=500, detail="Graph is not loaded.")
        
    # Resolve start and goal node IDs
    start_id = None
    goal_id = None
    
    s_query = req.start.strip().lower()
    g_query = req.goal.strip().lower()
    
    # 1. Check label mappings
    if s_query in label_to_node:
        start_id = label_to_node[s_query]
    elif req.start in G.nodes:
        start_id = req.start
        
    if g_query in label_to_node:
        goal_id = label_to_node[g_query]
    elif req.goal in G.nodes:
        goal_id = req.goal
        
    if not start_id:
        raise HTTPException(status_code=400, detail=f"Start location '{req.start}' not found.")
    if not goal_id:
        raise HTTPException(status_code=400, detail=f"Goal location '{req.goal}' not found.")

    # Execute pathfinding
    t0 = time.perf_counter()
    try:
        if req.algo == "astar":
            path = run_astar(G, start_id, goal_id, heuristic_type=req.heuristic, dynamic_traffic=req.traffic)
        elif req.algo == "bfs":
            path = run_bfs(G, start_id, goal_id)
        elif req.algo == "dfs":
            # BFS is used as a fallback if DFS fails or randomized DFS is requested
            path = run_dfs(G, start_id, goal_id, randomized=True)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown algorithm '{req.algo}'")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pathfinding failed: {str(e)}")
    
    time_ms = (time.perf_counter() - t0) * 1000

    if not path:
        raise HTTPException(status_code=404, detail="No route exists between the selected locations.")

    # Compile landmarks passed along the way
    landmarks = []
    for n in path:
        lbl = G.nodes[n].get("label")
        if lbl and lbl != "Unknown":
            landmarks.append(lbl)

    return RouteResponse(
        path=path,
        cost=path_cost(G, path),
        time_ms=time_ms,
        landmarks=landmarks
    )

@app.get("/api/benchmark", response_model=List[BenchmarkMetric])
def run_benchmark_suite(runs: int = 50):
    """Runs 50 randomized query benchmarking trials on the server and returns average metrics."""
    if G is None:
        raise HTTPException(status_code=500, detail="Graph is not loaded.")
        
    all_nodes = list(G.nodes)
    if len(all_nodes) < 2:
        raise HTTPException(status_code=400, detail="Not enough nodes to run benchmark.")

    astar_times, astar_costs, astar_lengths = [], [], []
    bfs_times, bfs_costs, bfs_lengths = [], [], []
    dfs_times, dfs_costs, dfs_lengths = [], [], []

    for _ in range(runs):
        start = random.choice(all_nodes)
        goal = random.choice(all_nodes)
        while start == goal:
            goal = random.choice(all_nodes)

        # 1. A* Run
        t0 = time.perf_counter()
        try:
            p_astar = run_astar(G, start, goal, heuristic_type="euclidean", dynamic_traffic=False)
            astar_times.append((time.perf_counter() - t0) * 1000)
            astar_costs.append(path_cost(G, p_astar))
            astar_lengths.append(len(p_astar))
        except Exception:
            pass

        # 2. BFS Run
        t0 = time.perf_counter()
        try:
            p_bfs = run_bfs(G, start, goal)
            bfs_times.append((time.perf_counter() - t0) * 1000)
            bfs_costs.append(path_cost(G, p_bfs))
            bfs_lengths.append(len(p_bfs))
        except Exception:
            pass

        # 3. DFS Run
        t0 = time.perf_counter()
        try:
            p_dfs = run_dfs(G, start, goal, randomized=True)
            dfs_times.append((time.perf_counter() - t0) * 1000)
            dfs_costs.append(path_cost(G, p_dfs))
            dfs_lengths.append(len(p_dfs))
        except Exception:
            pass

    mean = lambda l: sum(l) / len(l) if l else 0.0

    return [
        BenchmarkMetric(name="A*", avgTime=mean(astar_times), avgCost=mean(astar_costs), avgLength=mean(astar_lengths)),
        BenchmarkMetric(name="BFS", avgTime=mean(bfs_times), avgCost=mean(bfs_costs), avgLength=mean(bfs_lengths)),
        BenchmarkMetric(name="DFS", avgTime=mean(dfs_times), avgCost=mean(dfs_costs), avgLength=mean(dfs_lengths))
    ]
