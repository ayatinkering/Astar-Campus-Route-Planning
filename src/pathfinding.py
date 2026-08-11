import math
import random
import networkx as nx
from src.config import DYNAMIC_TRAFFIC_PROB, TRAFFIC_MULTIPLIER_MIN, TRAFFIC_MULTIPLIER_MAX

def heuristic_euclidean(G, n1, n2):
    """Straight-line Euclidean distance heuristic."""
    x1, y1 = G.nodes[n1]['x'], G.nodes[n1]['y']
    x2, y2 = G.nodes[n2]['x'], G.nodes[n2]['y']
    return math.sqrt((x1 - x2)**2 + (y1 - y2)**2)

def heuristic_manhattan(G, n1, n2):
    """Manhattan (L1) distance heuristic."""
    x1, y1 = G.nodes[n1]['x'], G.nodes[n1]['y']
    x2, y2 = G.nodes[n2]['x'], G.nodes[n2]['y']
    return abs(x1 - x2) + abs(y1 - y2)

def run_astar(G, start, goal, heuristic_type="euclidean", dynamic_traffic=False):
    """
    Computes the shortest path using A*.
    - heuristic_type: "euclidean" or "manhattan"
    - dynamic_traffic: If True, stochastically inflates edge lengths to simulate congestion.
    """
    # Select heuristic
    if heuristic_type == "manhattan":
        h_func = lambda a, b: heuristic_manhattan(G, a, b)
    else:
        h_func = lambda a, b: heuristic_euclidean(G, a, b)

    if dynamic_traffic:
        G_temp = G.copy()
        for u, v, k, d in G_temp.edges(keys=True, data=True):
            base = float(d.get("length", 1.0))
            if random.random() < DYNAMIC_TRAFFIC_PROB:
                d["length"] = base * random.uniform(TRAFFIC_MULTIPLIER_MIN, TRAFFIC_MULTIPLIER_MAX)
            else:
                d["length"] = base
        
        return nx.astar_path(
            G_temp,
            start,
            goal,
            heuristic=h_func,
            weight="length"
        )
    else:
        return nx.astar_path(
            G,
            start,
            goal,
            heuristic=h_func,
            weight="length"
        )

def run_bfs(G, start, goal):
    """BFS shortest path finding (unweighted shortest path)."""
    try:
        return nx.shortest_path(G, start, goal)
    except nx.NetworkXNoPath:
        return []

def run_dfs(G, start, goal, randomized=False):
    """
    Custom Depth-First Search path finding.
    - randomized: If True, shuffles neighbors at each step to introduce exploration variance.
    """
    visited = set()
    stack = [(start, [start])]

    while stack:
        node, path = stack.pop()

        if node == goal:
            return path

        if node not in visited:
            visited.add(node)

            neighbors = list(G.neighbors(node))
            if randomized:
                random.shuffle(neighbors)

            for neighbor in neighbors:
                if neighbor not in visited:
                    stack.append((neighbor, path + [neighbor]))

    return []

def path_cost(G, path):
    """
    Calculates cumulative edge length along a node path.
    Handles both standard graphs and Multigraphs/MultiDiGraphs.
    """
    if len(path) < 2:
        return 0.0

    cost = 0.0
    for i in range(len(path) - 1):
        u, v = path[i], path[i+1]
        
        if G.is_multigraph():
            # Get the minimum weight among all parallel edges
            edges = G[u][v]
            cost += min(float(e.get('length', 1.0)) for e in edges.values())
        else:
            cost += float(G[u][v].get('length', 1.0))
            
    return cost
