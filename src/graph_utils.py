import os
import json
import math
import networkx as nx
from geopy.distance import geodesic
from src.config import SRC_CRS, DST_CRS

def convert_coordinates(lon, lat):
    """
    Converts coordinates from EPSG:3857 to EPSG:4326 if they are outside
    the standard WGS84 ranges.
    """
    if abs(lon) > 180 or abs(lat) > 90:
        from pyproj import Transformer
        transformer = Transformer.from_crs(SRC_CRS, DST_CRS, always_xy=True)
        lon, lat = transformer.transform(lon, lat)
    return lat, lon

def load_graph(path):
    """Loads a GraphML file using NetworkX."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"Graph file not found at {path}")
    return nx.read_graphml(path)

def preprocess_graph(G):
    """
    Preprocesses nodes (converts x, y to float) and edges (converts length to float),
    and filters to the largest connected component (undirected).
    """
    # Create a copy to modify
    G_clean = G.copy()

    # Float conversion for node coordinates
    for n in G_clean.nodes:
        G_clean.nodes[n]['x'] = float(G_clean.nodes[n]['x'])
        G_clean.nodes[n]['y'] = float(G_clean.nodes[n]['y'])

    # Ensure edge length attribute exists and is a float
    for u, v, k, d in G_clean.edges(keys=True, data=True):
        try:
            d['length'] = float(d.get('length', 1.0))
        except (ValueError, TypeError):
            d['length'] = 1.0

    # Extract largest connected component
    # nx.connected_components requires undirected graph
    undirected_G = G_clean.to_undirected()
    largest_cc = max(nx.connected_components(undirected_G), key=len)
    G_clean = G_clean.subgraph(largest_cc).copy()

    return G_clean

def generate_alphabetical_label(index):
    """Generates spreadsheet-style column labels (A, B, C, ..., Z, AA, AB, ...)."""
    label = ""
    while True:
        label = chr(ord('A') + (index % 26)) + label
        index = index // 26 - 1
        if index < 0:
            break
    return label

def label_nodes_alphabetically(G):
    """Assigns sequential A, B, C... labels to all nodes in the graph."""
    for i, node in enumerate(G.nodes):
        G.nodes[node]['label'] = generate_alphabetical_label(i)
    return G

def extract_landmarks_from_geojson(file_path):
    """
    Parses a GeoJSON file to extract named places with their coordinates.
    Handles Point, Polygon, and MultiPolygon geometries and normalizes coordinates.
    """
    places = []
    if not os.path.exists(file_path):
        print(f"Warning: GeoJSON file {file_path} not found.")
        return places

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for feature in data.get("features", []):
        props = feature.get("properties", {})
        name = (
            props.get("Name") or
            props.get("Name/Num") or
            props.get("Shops")
        )
        if not name:
            continue

        geom = feature.get("geometry", {})
        coords = geom.get("coordinates", [])
        if not coords:
            continue

        try:
            geom_type = geom.get("type")
            if geom_type == "Point":
                lon, lat = coords
            elif geom_type == "Polygon":
                lon, lat = coords[0][0]
            elif geom_type == "MultiPolygon":
                lon, lat = coords[0][0][0]
            else:
                continue

            lat, lon = convert_coordinates(lon, lat)
            places.append((name.strip(), lat, lon))
        except Exception as e:
            # Silently skip malformed geometry
            continue

    return places

def label_nodes_with_geojson(G, geojson_paths):
    """
    Assigns landmark labels to the closest graph nodes.
    Each landmark gets assigned to exactly one unique closest node.
    """
    all_places = []
    for file_path in geojson_paths:
        places = extract_landmarks_from_geojson(file_path)
        all_places.extend(places)

    # Reset all labels to Unknown first
    for node in G.nodes():
        G.nodes[node]["label"] = "Unknown"

    assigned_nodes = set()
    label_to_node = {}

    for name, plat, plon in all_places:
        best_node = None
        min_dist = float("inf")

        for node, data in G.nodes(data=True):
            if node in assigned_nodes:
                continue

            try:
                lat = float(data["y"])
                lon = float(data["x"])
            except (ValueError, KeyError):
                continue

            # Geodesic distance in meters
            dist = geodesic((lat, lon), (plat, plon)).meters
            if dist < min_dist:
                min_dist = dist
                best_node = node

        if best_node is not None:
            G.nodes[best_node]["label"] = name
            assigned_nodes.add(best_node)
            label_to_node[name] = best_node

    return G, label_to_node

def visualize_labeled_map(G, output_img_path):
    """
    Draws the full graph network, highlights nodes with valid landmark labels,
    and annotations on top. Saves the map to the target path.
    """
    import matplotlib.pyplot as plt
    # Extract node positions
    pos = {
        node: (float(data["x"]), float(data["y"]))
        for node, data in G.nodes(data=True)
    }

    # Gather labeled nodes
    labels = {
        node: data["label"]
        for node, data in G.nodes(data=True)
        if data.get("label") not in [None, "Unknown"]
    }

    plt.figure(figsize=(22, 18))

    # Draw full background graph
    nx.draw(
        G.to_undirected(),
        pos,
        node_size=10,
        alpha=0.3,
        edge_color="gray"
    )

    # Highlight labeled nodes
    nx.draw_networkx_nodes(
        G,
        pos,
        nodelist=list(labels.keys()),
        node_color="skyblue",
        node_size=60
    )

    # Add text annotations for landmarks
    nx.draw_networkx_labels(
        G,
        pos,
        labels=labels,
        font_size=6,
        font_color="black",
        alpha=0.9
    )

    plt.title("MIT Campus Road Network - Labeled Places & Landmarks", fontsize=16)
    
    # Save image
    plt.savefig(output_img_path, dpi=300, bbox_inches="tight")
    plt.close()
