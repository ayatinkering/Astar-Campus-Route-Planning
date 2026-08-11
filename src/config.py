import os

# Base Directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
if not os.path.exists(DATA_DIR) or not os.path.exists(os.path.join(DATA_DIR, "mit_labeled.graphml")):
    DATA_DIR = os.path.join(BASE_DIR, "api", "data")

# Input/Output Graph Paths
RAW_GRAPH_PATH = os.path.join(DATA_DIR, "mit_campus.graphml")
CLEAN_GRAPH_PATH = os.path.join(DATA_DIR, "mit_clean.graphml")
LABELED_GRAPH_PATH = os.path.join(DATA_DIR, "mit_labeled.graphml")

# GeoJSON Landmark Files
GEOJSON_FILES = [
    os.path.join(DATA_DIR, "Academic_Blocks.geojson"),
    os.path.join(DATA_DIR, "Hostels.geojson"),
    os.path.join(DATA_DIR, "Mess.geojson")
]

# Output Visualizations
LABELED_MAP_IMG = os.path.join(DATA_DIR, "labeled_map.png")
ALGORITHM_COMPARISON_IMG = os.path.join(BASE_DIR, "algorithm_comparison.png")

# Coordinate Systems
# EPSG:3857 (Web Mercator) to EPSG:4326 (WGS84 GPS coords)
SRC_CRS = "EPSG:3857"
DST_CRS = "EPSG:4326"

# Traffic/Routing Simulation Settings
DYNAMIC_TRAFFIC_PROB = 0.3
TRAFFIC_MULTIPLIER_MIN = 2.0
TRAFFIC_MULTIPLIER_MAX = 4.0
BENCHMARK_RUNS = 50
