import random
import time
import pandas as pd
import matplotlib.pyplot as plt
from src.pathfinding import run_astar, run_bfs, run_dfs, path_cost

def run_benchmarks(G, num_runs=50, output_img_path="path_length_comparison.png"):
    """
    Performs empirical benchmarking by running A*, BFS, and DFS over
    num_runs randomly selected node pairs. Logs and plots performance metrics.
    """
    nodes = list(G.nodes)
    results = []

    astar_success = 0
    bfs_success = 0
    dfs_success = 0

    print(f"\nBenchmarking algorithms over {num_runs} random route simulations...")

    for i in range(num_runs):
        start = random.choice(nodes)
        goal = random.choice(nodes)

        # Ensure start and goal are distinct
        while start == goal:
            goal = random.choice(nodes)

        # 1. A* Benchmark
        t0 = time.perf_counter()
        try:
            # We use standard euclidean A* for benchmarks
            astar_path = run_astar(G, start, goal, heuristic_type="euclidean", dynamic_traffic=False)
            astar_success += int(len(astar_path) > 0)
        except Exception:
            astar_path = []
        t_astar = (time.perf_counter() - t0) * 1000  # Convert to ms

        # 2. BFS Benchmark
        t0 = time.perf_counter()
        try:
            bfs_path = run_bfs(G, start, goal)
            bfs_success += int(len(bfs_path) > 0)
        except Exception:
            bfs_path = []
        t_bfs = (time.perf_counter() - t0) * 1000

        # 3. DFS Benchmark (with random neighbor ordering)
        t0 = time.perf_counter()
        try:
            dfs_path = run_dfs(G, start, goal, randomized=True)
            dfs_success += int(len(dfs_path) > 0)
        except Exception:
            dfs_path = []
        t_dfs = (time.perf_counter() - t0) * 1000

        # Log metrics
        results.append({
            "astar_time": t_astar,
            "astar_cost": path_cost(G, astar_path) if astar_path else 0.0,
            "astar_length": len(astar_path),

            "bfs_time": t_bfs,
            "bfs_cost": path_cost(G, bfs_path) if bfs_path else 0.0,
            "bfs_length": len(bfs_path),

            "dfs_time": t_dfs,
            "dfs_cost": path_cost(G, dfs_path) if dfs_path else 0.0,
            "dfs_length": len(dfs_path),
        })

    # Convert results list to DataFrame
    df = pd.DataFrame(results)

    # Compute averages
    avg_results = pd.DataFrame({
        "Algorithm": ["A*", "BFS", "DFS"],
        "Avg Time (ms)": [
            df["astar_time"].mean(),
            df["bfs_time"].mean(),
            df["dfs_time"].mean()
        ],
        "Avg Path Cost (m)": [
            df["astar_cost"].mean(),
            df["bfs_cost"].mean(),
            df["dfs_cost"].mean()
        ],
        "Avg Path Length (Nodes)": [
            df["astar_length"].mean(),
            df["bfs_length"].mean(),
            df["dfs_length"].mean()
        ],
        "Success Rate (%)": [
            (astar_success / num_runs) * 100,
            (bfs_success / num_runs) * 100,
            (dfs_success / num_runs) * 100
        ]
    })

    print("\n--- Empirical Benchmark Results (Averages) ---")
    print(avg_results.to_string(index=False))

    # Generate a single consolidated 2x2 comparison plot
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # 1. Execution Time Bar
    axes[0, 0].bar(avg_results["Algorithm"], avg_results["Avg Time (ms)"], color=['royalblue', 'seagreen', 'orange'])
    axes[0, 0].set_title("Average Execution Time")
    axes[0, 0].set_ylabel("Time (ms)")
    axes[0, 0].grid(axis='y', linestyle='--', alpha=0.7)

    # 2. Path Cost Bar
    axes[0, 1].bar(avg_results["Algorithm"], avg_results["Avg Path Cost (m)"], color=['royalblue', 'seagreen', 'orange'])
    axes[0, 1].set_title("Average Path Cost (Distance)")
    axes[0, 1].set_ylabel("Cost (meters)")
    axes[0, 1].grid(axis='y', linestyle='--', alpha=0.7)

    # 3. Path Length (Number of Nodes) Bar
    axes[1, 0].bar(avg_results["Algorithm"], avg_results["Avg Path Length (Nodes)"], color=['royalblue', 'seagreen', 'orange'])
    axes[1, 0].set_title("Average Path Length")
    axes[1, 0].set_ylabel("Node Count")
    axes[1, 0].grid(axis='y', linestyle='--', alpha=0.7)

    # 4. Boxplot for Execution Time Distributions
    time_data = [df["astar_time"], df["bfs_time"], df["dfs_time"]]
    axes[1, 1].boxplot(time_data, tick_labels=["A*", "BFS", "DFS"])
    axes[1, 1].set_title("Execution Time Distribution")
    axes[1, 1].set_ylabel("Time (ms)")
    axes[1, 1].grid(axis='y', linestyle='--', alpha=0.7)

    plt.suptitle(f"Algorithm Performance Comparison ({num_runs} Runs)", fontsize=16)
    plt.tight_layout(rect=[0, 0, 1, 0.95])
    plt.savefig(output_img_path, dpi=300)
    plt.close()

    print(f"\nBenchmarking plots successfully saved at: {output_img_path}")
    return avg_results
