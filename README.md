# A* Campus Route Planner

A campus navigation and route planning system designed for the **Manipal Institute of Technology (MIT) Campus**. This system merges landmark mapping, routing algorithms (A*, BFS, DFS), an interactive Tk-based GUI map interface, and an empirical benchmarking engine into a modular Python application.


## System Components Architecture

The diagram below shows the high-level data flow and component interactions from raw files to final visualizations.

```text
+-------------------------------------------------------------------------+
|                               DATA LAYER                                |
|                                                                         |
|  mit_campus.graphml   Hostels.geojson   Academic_Blocks.geojson   Mess  |
+-------------------------------------------------------------------------+
                                     |
                                     | (Raw Ingestion)
                                     v
+-------------------------------------------------------------------------+
|                       PROCESSING & MAPPING LAYER                        |
|                                                                         |
|   +-------------------------+         +-----------------------------+   |
|   |   Graph Preprocessor    |-------->|  Landmark Geodesic Matcher  |   |
|   |   - Coordinate cleaning |         |  - Projection (EPSG:4326)   |   |
|   |   - Extr. Largest CC    |         |  - Nearest-node assignment  |   |
|   +-------------------------+         +-----------------------------+   |
+-------------------------------------------------------------------------+
                                     |
                                     | (mit_labeled.graphml)
                                     v
+-------------------------------------------------------------------------+
|                         CORE ROUTING ALGORITHMS                         |
|                                                                         |
|     A* Routing           Breadth-First Search       Depth-First Search  |
|  (Weighted/Heuristic)    (Hop-Count Shortest)       (Randomized Walk)   |
|  - Euclidean/Manhattan                                                  |
|  - Dynamic Traffic Sim                                                  |
+-------------------------------------------------------------------------+
                                     |
                                     | (Computed Path & Stats)
                                     v
+-------------------------------------------------------------------------+
|                             INTERFACE LAYER                             |
|                                                                         |
|   +-----------------------+   +-------------------+   +-------------+   |
|   |        CLI App        |   |    Tk GUI App     |   |  Benchmark  |   |
|   |     (main.py route)   |   |   (interactive)   |   | (benchmark) |   |
|   +-----------------------+   +-------------------+   +-------------+   |
|               |                         |                    |          |
|               v                         v                    v          |
|         Route Summary            Path Animation         Performance     |
|         & Landmark Path          & 3-Panel Plot          Dashboard      |
+-------------------------------------------------------------------------+
```



## Project Structure


```
Astar-Campus-Route-Planning/
│
├── data/                                 # Spatial datasets & output assets
│   ├── Academic_Blocks.geojson           # GeoJSON boundaries for classrooms/blocks
│   ├── Hostels.geojson                   # GeoJSON points/polygons for hostels
│   ├── Mess.geojson                      # GeoJSON footprints for dining halls
│   ├── mit_campus.graphml                # Raw graph representing roads & intersections
│   ├── mit_labeled.graphml               # Pre-processed graph with matched landmark labels
│   └── labeled_map.png                   # PNG render of the road network & landmark locations
│
├── src/                                  # Modular source package
│   ├── __init__.py                       # Package initializer
│   ├── config.py                         # File paths, projections, and simulation settings
│   ├── graph_utils.py                    # Graph loading, cleaning, and nearest-neighbor label matching
│   ├── pathfinding.py                    # A*, BFS, and DFS routing implementations
│   ├── visualization.py                  # Matplotlib GUI, step-by-step route animations, and comparisons
│   └── benchmarking.py                   # Performance metrics collector and comparative plotting
│
├── main.py                               # Unified Command Line Interface
├── requirements.txt                      # Project package dependencies
├── path_length_comparison.png            # Automatically generated benchmarking chart
└── README.md                             # Production documentation (this file)
```


## Installation & Setup

1. **Clone the repository** and navigate to the project directory:
   ```bash
   git clone https://github.com/guthlb/Astar-Campus-Route-Planning.git
   cd Astar-Campus-Route-Planning
   ```

2. **Create and activate a virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install the dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

   *Note: On Linux, ensure `python3-tk` is installed on your system if you intend to run the interactive GUI:*
   ```bash
   sudo apt-get install python3-tk
   ```


## Empirical Pathfinding Analysis

When executing `python main.py benchmark --runs 50`, the system logs and plots average performance metrics across the pathfinding algorithms:

| Metric | A* Algorithm | BFS Algorithm | DFS Algorithm |
| :--- | :--- | :--- | :--- |
| **Path Optimality** | **Optimal** (Weighted Shortest Path) | **Suboptimal** (Unweighted hop-count) | **Highly Suboptimal** (Randomized walkthrough) |
| **Average Time (ms)** | ~0.19 ms | **~0.04 ms** (Fastest) | ~0.08 ms |
| **Avg Path Cost (m)** | **~747 m** (Shortest) | ~811 m | ~2,050 m |
| **Avg Path Length (Nodes)** | ~10 nodes | ~9 nodes | ~24 nodes |
| **Success Rate (%)** | 100% | 100% | 100% |

### Key Takeaways
1. **A\* (Weighted)**: Provides the **optimal physical route** (averaging ~747 meters). While it performs more computation by calculating geodesic heuristics and edge lengths (taking ~0.19 ms), it guarantees the shortest walk.
2. **BFS (Unweighted)**: Computes the route with the **fewest intersection nodes/hops** (averaging ~9 nodes). Because it disregards actual road distances, it runs extremely fast (~0.04 ms) but leads to a longer walk (averaging ~811 meters).
3. **DFS (Randomized)**: Traverses the road network by following deep branches. While it eventually reaches the goal, it results in extremely long, winding loops (averaging ~2,050 meters, a **2.7x increase** in distance) and has high variance.
