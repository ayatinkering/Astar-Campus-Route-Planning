# GraphMIT

An interactive campus routing and pathfinding dashboard designed for the **Manipal Institute of Technology (MIT) Campus**. 

The system leverages **FastAPI** on the backend to execute pathfinding algorithms (A* via Euclidean distance, BFS, DFS) and run empirical benchmarks, while serving a sleek, responsive **React + TypeScript + Vite** web dashboard styled with Tailwind CSS, default OpenStreetMap tiles, and Leaflet map markers.

---

## System Architecture

The following ASCII diagram illustrates the data ingestion pipeline, backend API services, and the interactive web interface layer:

```text
+-------------------------------------------------------------------------+
|                               DATA LAYER                                |
|                                                                         |
|  mit_campus.graphml   Hostels.geojson   Academic_Blocks.geojson   Mess  |
|                                  |                                      |
|                                  | (mit_labeled.graphml)                |
|                                  v                                      |
|                       PROCESSING & MAPPING LAYER                        |
|                                                                         |
|   +-------------------------+         +-----------------------------+   |
|   |   Graph Preprocessor    |-------->|  Landmark Geodesic Matcher  |   |
|   |   - Coordinate cleaning |         |  - Projection (EPSG:4326)   |   |
|   |   - Extr. Largest CC    |         |  - Nearest-node assignment  |   |
|   +-------------------------+         +-----------------------------+   |
+------------------------------------------|------------------------------+
                                           |
                                           v
+-------------------------------------------------------------------------+
|                           BACKEND SERVICE (API)                         |
|                                                                         |
|   FastAPI Application (src/api.py)                                      |
|   - Coordinates pathfinding algorithms (A*, BFS, DFS)                   |
|   - Executes multi-trial empirical benchmarks                           |
|   - Exposes GraphML structures and path lists over REST endpoints       |
+------------------------------------------|------------------------------+
                                           | (JSON Payloads / REST)
                                           v
+-------------------------------------------------------------------------+
|                          FRONTEND WEB INTERFACE                         |
|                                                                         |
|   React + Vite + TypeScript Dashboard (dashboard/)                      |
|   - Interactive Leaflet.js map layer for clicking Start/Goal            |
|   - Step-by-step path animations (colored paths: Blue, Green, Amber)    |
|   - Real-time empirical benchmarking table                              |
|   - Minimalist monospace dark/light mode layout (System Mono style)     |
+-------------------------------------------------------------------------+
```

---

## Tech Stack

* **Backend**: FastAPI, NetworkX, Uvicorn, Python 3
* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Leaflet.js
* **Data Sources**: Spatial GraphML representing road segments, GeoJSON landmarks
* **Typography**: Clean system monospace font stack (`ui-monospace`, `SFMono-Regular`, `Menlo`, etc.)

---

## Key Architectural Mechanics

### 1. Hybrid Vercel Serverless Router
The project deploys as a unified monorepo on Vercel:
* **Frontend assets**: Compiled from `dashboard/` and served as a static build via Vercel Edge.
* **Backend routes**: FastAPI functions are deployed as serverless lambda entrypoints in `api/index.py` using `@vercel/python`.
* **API rewrites**: The root `vercel.json` maps all `/api/*` requests to the python serverless functions while passing through other requests directly to the Vite frontend client.

### 2. Double-Data Folder Bundle & Fallback
* In local development, the GraphML networks and GeoJSON files are loaded from the root `data/` folder.
* During serverless deployments, Vercel excludes directories outside of the active function directory. To accommodate this, the data assets are copied inside `api/data/` for compilation.
* The system configuration automatically falls back to `api/data/` if the root `data/` directory is not resolved at runtime.

### 3. Separation of Production and Local Requirements
* **Production (`api/requirements.txt`)**: Contains only the core lightweight dependencies needed to execute the FastAPI endpoints (`fastapi`, `pydantic`, `networkx`, `geopy`). This prevents Vercel from compiling heavy packages like GeoPandas or PyProj at build time.
* **Development (`requirements-dev.txt`)**: Contains the full dependencies (Matplotlib, OSMnx, etc.) needed to run local Tkinter GUIs or execute graph visual generation pipelines.

---

## API Endpoints Reference

### 1. Ingest Graph Data
* **Endpoint**: `GET /api/graph`
* **Response**: Returns the node positions (GPS coordinates) and adjacency connections in JSON format.

### 2. Solve Route
* **Endpoint**: `POST /api/route`
* **Request Body**:
  ```json
  {
    "start": "SP Workshop",
    "goal": "Library",
    "algo": "astar",
    "heuristic": "euclidean",
    "traffic": false
  }
  ```
* **Response**: Returns the node traversal path, path cost (geodesic distance in meters), computation runtime, and list of named landmarks encountered.

### 3. Run Benchmark Suite
* **Endpoint**: `GET /api/benchmark?runs=50`
* **Response**: Runs `N` randomized test queries across A*, BFS, and DFS and returns comparative average execution speed, average path cost, and average hop count.

---

## Installation & Running Locally

### 1. Backend Service Setup (FastAPI)

1. **Clone the repository** and navigate to the project root:
   ```bash
   git clone https://github.com/ayatinkering/Astar-Campus-Route-Planning.git
   cd Astar-Campus-Route-Planning
   ```

2. **Create and activate a virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install python packages**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Launch the backend server**:
   ```bash
   uvicorn src.api:app --host 127.0.0.1 --port 8000
   ```
   *The backend will be running at [http://127.0.0.1:8000](http://127.0.0.1:8000).*

---

### 2. Frontend Dashboard Setup (React + Vite)

1. **Navigate to the dashboard directory**:
   ```bash
   cd dashboard
   ```

2. **Install node dependencies**:
   ```bash
   npm install
   ```

3. **Start the local Vite development server**:
   ```bash
   npm run dev
   ```
   *The dashboard will be running at [http://localhost:5173](http://localhost:5173).*

---

## Empirical Benchmark Findings

When clicking **Run Benchmark** on the control panel, the system executes 50 random path runs across the Manipal road network to compute empirical performance metrics:

| Metric | A* Algorithm | BFS Algorithm | DFS Algorithm |
| :--- | :--- | :--- | :--- |
| **Path Optimality** | **Optimal** (Weighted Shortest Path) | **Suboptimal** (Unweighted hop-count) | **Highly Suboptimal** (Randomized walkthrough) |
| **Average Time (ms)** | ~0.29 ms | **~0.04 ms** (Fastest) | ~0.11 ms |
| **Avg Path Cost (m)** | **~774 m** (Shortest) | ~836 m | ~1,755 m |
| **Avg Path Length (Nodes)** | ~10.6 nodes | ~9.3 nodes | ~20.7 nodes |

### Summary
1. **A\* (Weighted)**: Computes the **optimal physical route** (geodesic shortest distance). Calculated using coordinates mapping as the heuristic target.
2. **BFS (Unweighted)**: Computes the route containing the **fewest intersection hops**. It runs fastest because it ignores physical weights, but results in a longer overall walk.
3. **DFS (Randomized)**: Recursively traverses deep paths. It eventually succeeds but results in long, winding loops (often 2.5x longer than A*).
