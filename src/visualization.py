import math
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.lines as mlines
import networkx as nx

def setup_matplotlib_backend():
    """Configures TkAgg backend for interactive plotting if available."""
    try:
        matplotlib.use('TkAgg')
    except Exception as e:
        print(f"Warning: Could not set Matplotlib backend to TkAgg: {e}. Interactive mode might fail.")

def filter_landmark_labels(G):
    """Filters the graph nodes to return only those with valid landmark labels."""
    return {
        node: data.get("label")
        for node, data in G.nodes(data=True)
        if data.get("label") not in [None, "Unknown"]
    }

def interactive_route_selection(G, pos):
    """
    Launches an interactive matplotlib window where the user click twice:
    1st click: selects closest node as Start (Green marker)
    2nd click: selects closest node as Goal (Red marker)
    Returns (start_node, goal_node) when done.
    """
    setup_matplotlib_backend()
    fig, ax = plt.subplots(figsize=(11, 11))
    
    state = {
        "start": None,
        "goal": None,
        "done": False
    }

    labels = filter_landmark_labels(G)

    def find_nearest_node(x, y):
        best_node = None
        min_dist = float("inf")
        for n in G.nodes:
            nx_val, ny_val = pos[n]
            d = math.sqrt((nx_val - x)**2 + (ny_val - y)**2)
            if d < min_dist:
                min_dist = d
                best_node = n
        return best_node

    def redraw():
        ax.clear()
        
        # Draw background campus road network
        nx.draw(
            G.to_undirected(),
            pos,
            node_size=3,
            edge_color="#bbbbbb",
            width=0.6,
            ax=ax
        )

        # Annotate landmarks
        nx.draw_networkx_labels(
            G,
            pos,
            labels=labels,
            font_size=5,
            font_color="black",
            alpha=0.7,
            ax=ax
        )

        # Highlight Start node if selected
        if state["start"]:
            nx.draw_networkx_nodes(
                G, pos,
                nodelist=[state["start"]],
                node_color="green",
                node_size=120,
                ax=ax
            )

        # Highlight Goal node if selected
        if state["goal"]:
            nx.draw_networkx_nodes(
                G, pos,
                nodelist=[state["goal"]],
                node_color="red",
                node_size=120,
                ax=ax
            )

        ax.set_title("Route Planner: Click once for Start (Green) | Click again for Goal (Red)", fontsize=12)
        plt.axis("off")
        fig.canvas.draw_idle()

    def on_click(event):
        if event.inaxes != ax:
            return

        clicked_node = find_nearest_node(event.xdata, event.ydata)

        if state["start"] is None:
            state["start"] = clicked_node
            print(f"Start selected: Node {clicked_node} (Label: {G.nodes[clicked_node].get('label', 'Unknown')})")
        elif state["goal"] is None:
            state["goal"] = clicked_node
            print(f"Goal selected: Node {clicked_node} (Label: {G.nodes[clicked_node].get('label', 'Unknown')})")
            state["done"] = True

        redraw()

    fig.canvas.mpl_connect("button_press_event", on_click)
    
    redraw()
    # Event loop to wait for selection completion
    while not state["done"]:
        plt.pause(0.1)

    plt.close(fig)
    return state["start"], state["goal"]

def animate_path(G, pos, path):
    """
    Renders the A* route step by step, illustrating node transitions and connections.
    """
    setup_matplotlib_backend()
    fig, ax = plt.subplots(figsize=(11, 11))
    labels = filter_landmark_labels(G)

    # Base graph structure
    nx.draw(
        G.to_undirected(),
        pos,
        node_size=3,
        edge_color="#bbbbbb",
        width=0.6,
        ax=ax
    )

    nx.draw_networkx_labels(
        G,
        pos,
        labels=labels,
        font_size=6,
        font_color="black",
        alpha=0.7,
        ax=ax
    )

    ax.set_title("Simulating Path Navigation...", fontsize=14)
    ax.axis("off")

    drawn_edges = []
    
    # Animate steps
    for i in range(len(path) - 1):
        edge = (path[i], path[i+1])
        drawn_edges.append(edge)

        nx.draw_networkx_edges(
            G.to_undirected(),
            pos,
            edgelist=drawn_edges,
            edge_color="blue",
            width=3.5,
            ax=ax
        )
        
        plt.pause(0.2)

    plt.title("Navigation Route Complete!", fontsize=14)
    plt.show()

def visualize_comparison(G, pos, start, goal, paths, output_path):
    """
    Creates a 3-panel comparative layout of A*, BFS, and DFS routes side-by-side.
    Saves the comparative chart to output_path.
    """
    fig, axes = plt.subplots(1, 3, figsize=(18, 6))
    labels = filter_landmark_labels(G)

    def draw_path_panel(ax, path, title, color):
        nx.draw(
            G.to_undirected(),
            pos,
            node_size=3,
            edge_color="#bbbbbb",
            width=0.7,
            alpha=0.8,
            ax=ax
        )

        if path:
            edges = list(zip(path, path[1:]))
            nx.draw_networkx_edges(
                G.to_undirected(),
                pos,
                edgelist=edges,
                edge_color=color,
                width=4,
                alpha=0.8,
                ax=ax
            )

        # Highlight Start and Goal
        nx.draw_networkx_nodes(
            G,
            pos,
            nodelist=[start, goal],
            node_color=['green', 'red'],
            node_size=150,
            ax=ax
        )

        nx.draw_networkx_labels(
            G,
            pos,
            labels=labels,
            font_size=5,
            font_color="black",
            alpha=0.7,
            ax=ax
        )

        ax.set_title(title, fontsize=12)
        ax.axis('off')

    draw_path_panel(axes[0], paths.get("A*"), "A* Algorithm (Weighted, Heuristic)", 'blue')
    draw_path_panel(axes[1], paths.get("BFS"), "BFS Algorithm (Unweighted Shortest)", 'green')
    draw_path_panel(axes[2], paths.get("DFS"), "DFS Algorithm (Randomized Walk)", 'orange')

    legend_handles = [
        mlines.Line2D([], [], color='blue', linewidth=4, label='A* Path'),
        mlines.Line2D([], [], color='green', linewidth=4, label='BFS Path'),
        mlines.Line2D([], [], color='orange', linewidth=4, label='DFS Path')
    ]

    fig.legend(handles=legend_handles, loc='upper center',
               bbox_to_anchor=(0.5, 0.98), ncol=3, fontsize=11)

    plt.tight_layout(rect=[0, 0, 1, 0.92])
    plt.savefig(output_path, dpi=300, bbox_inches="tight")
    print(f"Comparison chart saved successfully at: {output_path}")
    plt.show()
