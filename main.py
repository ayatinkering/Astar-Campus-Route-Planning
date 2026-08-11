import os
import sys
import argparse
import networkx as nx

from src.config import (
    RAW_GRAPH_PATH,
    LABELED_GRAPH_PATH,
    GEOJSON_FILES,
    LABELED_MAP_IMG,
    ALGORITHM_COMPARISON_IMG
)
from src.graph_utils import (
    load_graph,
    preprocess_graph,
    label_nodes_with_geojson,
    visualize_labeled_map
)
from src.pathfinding import (
    run_astar,
    run_bfs,
    run_dfs,
    path_cost
)
from src.visualization import (
    interactive_route_selection,
    animate_path,
    visualize_comparison
)
from src.benchmarking import run_benchmarks

def ensure_labeled_graph_exists():
    """Checks if labeled graph exists; if not, automatically generates it."""
    if not os.path.exists(LABELED_GRAPH_PATH):
        print(f"Labeled graph not found at {LABELED_GRAPH_PATH}.")
        print("Automatically executing the landmark labeling pipeline...")
        run_label_pipeline()

def run_label_pipeline():
    """Runs the full pipeline to preprocess, label with landmarks, and visualize the graph."""
    print("Loading raw graph...")
    G = load_graph(RAW_GRAPH_PATH)
    
    print("Preprocessing graph structure (coordinates, edge weights, and largest CC)...")
    G = preprocess_graph(G)
    
    print(f"Mapping landmark locations from {len(GEOJSON_FILES)} GeoJSON files...")
    G, label_to_node = label_nodes_with_geojson(G, GEOJSON_FILES)
    
    print(f"Successfully labeled {len(label_to_node)} unique locations on the graph.")
    
    print(f"Saving labeled graph to: {LABELED_GRAPH_PATH}")
    nx.write_graphml(G, LABELED_GRAPH_PATH)
    
    print(f"Generating campus labeled map visualization: {LABELED_MAP_IMG}")
    visualize_labeled_map(G, LABELED_MAP_IMG)
    print("Labeling pipeline complete!\n")

def get_label_to_node_mappings(G):
    """Generates case-insensitive label-to-node and node-to-label dictionaries."""
    label_to_node = {}
    for node, data in G.nodes(data=True):
        label = data.get("label")
        if label and label != "Unknown":
            label_to_node[label.strip().lower()] = node
    return label_to_node

def find_node_by_label_or_id(G, label_map, query):
    """Finds a node either by its exact string label (case-insensitive) or by its raw node ID."""
    q_lower = query.strip().lower()
    if q_lower in label_map:
        return label_map[q_lower]
    
    # Check if the query is a raw node ID that exists in the graph
    if query in G.nodes:
        return query
        
    return None

def main():
    parser = argparse.ArgumentParser(
        description="GraphMIT - A* Campus Route Planner (MIT)"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # 'label' subcommand
    subparsers.add_parser("label", help="Preprocess, label graph with GeoJSON landmarks, and save visualizations.")

    # 'interactive' subcommand
    subparsers.add_parser("interactive", help="Launch interactive GUI to select start/goal and animate routes.")

    # 'benchmark' subcommand
    bench_parser = subparsers.add_parser("benchmark", help="Run comparative benchmark of pathfinding algorithms.")
    bench_parser.add_argument("--runs", type=int, default=50, help="Number of random runs for the benchmark (default: 50).")

    # 'route' subcommand
    route_parser = subparsers.add_parser("route", help="Calculate path between specific nodes or landmarks.")
    route_parser.add_argument("--start", required=True, help="Start landmark name (e.g. 'B 18') or node ID.")
    route_parser.add_argument("--goal", required=True, help="Goal landmark name (e.g. 'Academic Block 1') or node ID.")
    route_parser.add_argument("--algo", choices=["astar", "bfs", "dfs"], default="astar", help="Algorithm to use (default: astar).")
    route_parser.add_argument("--traffic", action="store_true", help="Simulate dynamic road traffic (A* only).")
    route_parser.add_argument("--animate", action="store_true", help="Animate path traversal after finding it.")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "label":
        run_label_pipeline()
        return

    # For other commands, make sure labeled graph is present
    ensure_labeled_graph_exists()
    
    print("Loading pre-processed labeled graph...")
    G = load_graph(LABELED_GRAPH_PATH)
    
    # Extract positions
    pos = {
        n: (float(G.nodes[n]['x']), float(G.nodes[n]['y']))
        for n in G.nodes
    }

    if args.command == "interactive":
        print("Launching interactive campus map GUI...")
        print("Please click on the plot window:")
        print(" - First click: Set Start Node (marked in Green)")
        print(" - Second click: Set Goal Node (marked in Red)")
        
        start_node, goal_node = interactive_route_selection(G, pos)
        
        if not start_node or not goal_node:
            print("Interactive selection cancelled or failed.")
            return
            
        print(f"\nSelected Start: {G.nodes[start_node].get('label', start_node)}")
        print(f"Selected Goal: {G.nodes[goal_node].get('label', goal_node)}")

        # Run all three algorithms for comparative display
        print("Computing routes...")
        astar_path = run_astar(G, start_node, goal_node, dynamic_traffic=False)
        bfs_path = run_bfs(G, start_node, goal_node)
        dfs_path = run_dfs(G, start_node, goal_node, randomized=True)

        print(f"A* Path Cost: {path_cost(G, astar_path):.2f} meters, Nodes: {len(astar_path)}")
        print(f"BFS Path Cost: {path_cost(G, bfs_path):.2f} meters, Nodes: {len(bfs_path)}")
        print(f"DFS Path Cost: {path_cost(G, dfs_path):.2f} meters, Nodes: {len(dfs_path)}")

        # Animate the selected A* path
        print("Animating A* Path navigation...")
        animate_path(G, pos, astar_path)

        # Plot comparison panels
        print(f"Saving comparison map to: {ALGORITHM_COMPARISON_IMG}")
        paths_dict = {"A*": astar_path, "BFS": bfs_path, "DFS": dfs_path}
        visualize_comparison(G, pos, start_node, goal_node, paths_dict, ALGORITHM_COMPARISON_IMG)

    elif args.command == "benchmark":
        run_benchmarks(G, num_runs=args.runs)

    elif args.command == "route":
        label_map = get_label_to_node_mappings(G)
        
        start_node = find_node_by_label_or_id(G, label_map, args.start)
        goal_node = find_node_by_label_or_id(G, label_map, args.goal)

        if not start_node:
            print(f"Error: Start node/landmark '{args.start}' could not be resolved.")
            sys.exit(1)
        if not goal_node:
            print(f"Error: Goal node/landmark '{args.goal}' could not be resolved.")
            sys.exit(1)

        start_lbl = G.nodes[start_node].get('label', start_node)
        goal_lbl = G.nodes[goal_node].get('label', goal_node)
        print(f"Calculating route from '{start_lbl}' to '{goal_lbl}'...")

        if args.algo == "astar":
            path = run_astar(G, start_node, goal_node, dynamic_traffic=args.traffic)
            algo_name = f"A* {'(with Traffic Sim)' if args.traffic else ''}"
        elif args.algo == "bfs":
            path = run_bfs(G, start_node, goal_node)
            algo_name = "BFS"
        else:
            path = run_dfs(G, start_node, goal_node, randomized=False)
            algo_name = "DFS"

        if not path:
            print(f"Error: No path could be found between the chosen points using {algo_name}.")
            sys.exit(1)

        cost = path_cost(G, path)
        print("\n--- Route Summary ---")
        print(f"Algorithm: {algo_name}")
        print(f"Total Cost: {cost:.2f} meters")
        print(f"Path Length: {len(path)} nodes")
        
        # Display sequence of landmarks along the route
        landmark_sequence = []
        for n in path:
            lbl = G.nodes[n].get("label")
            if lbl and lbl != "Unknown":
                landmark_sequence.append(lbl)
        
        if landmark_sequence:
            print(f"Landmarks passed: {' -> '.join(landmark_sequence)}")
        
        if args.animate:
            print("Animating route navigation...")
            animate_path(G, pos, path)

if __name__ == "__main__":
    main()
