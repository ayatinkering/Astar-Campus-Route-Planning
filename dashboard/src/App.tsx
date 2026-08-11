import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { 
  Clock, 
  Play
} from "lucide-react";

import type { 
  CampusNode, 
  CampusEdge, 
  GraphData, 
  RouteRequest, 
  RouteResponse, 
  BenchmarkMetric 
} from "./types";

const stripEmojis = (str: string): string => {
  return str.replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, "").trim();
};

const getLandmarkStyle = (label: string) => {
  const lbl = label.toLowerCase();
  
  if (lbl.includes("block") || lbl.includes("hostel") || lbl.includes("hall") || /\d+(st|nd|rd|th)/.test(lbl)) {
    return {
      textColor: "text-[#007fb4]", // OSM blue
      icon: "🏨", // bed symbol
      borderColor: "border-[#007fb4]/30"
    };
  }
  if (lbl.includes("food") || lbl.includes("court") || lbl.includes("mess") || lbl.includes("canteen") || lbl.includes("annapoorna") || lbl.includes("fc1") || lbl.includes("fc2")) {
    return {
      textColor: "text-[#c27200]", // OSM orange/brown
      icon: "🍴", // fork/knife symbol
      borderColor: "border-[#c27200]/30"
    };
  }
  if (lbl.includes("pitch") || lbl.includes("court") || lbl.includes("tennis") || lbl.includes("recreation") || lbl.includes("club") || lbl.includes("ground") || lbl.includes("gym") || lbl.includes("sports")) {
    return {
      textColor: "text-[#2d8a4e]", // OSM green
      icon: "🏃", // runner symbol
      borderColor: "border-[#2d8a4e]/30"
    };
  }
  if (lbl.includes("temple") || lbl.includes("shrine")) {
    return {
      textColor: "text-[#654321]", // dark brown
      icon: "🕉️",
      borderColor: "border-[#654321]/30"
    };
  }
  
  // Default academic/misc block
  return {
    textColor: "text-[#374151]", // slate grey
    icon: "🏢", // building symbol
    borderColor: "border-slate-300"
  };
};

export default function App() {
  const [loading, setLoading] = useState<boolean>(true);
  const [nodes, setNodes] = useState<CampusNode[]>([]);
  const [edges, setEdges] = useState<CampusEdge[]>([]);
  const [nodesMap, setNodesMap] = useState<Record<string, CampusNode>>({});
  
  // Selection states
  const [startNode, setStartNode] = useState<string>("");
  const [goalNode, setGoalNode] = useState<string>("");
  const heuristic = "euclidean";
  const dynamicTraffic = false;
  const animSpeed = 100; // ms per step
  
  // Results
  const [paths, setPaths] = useState<Record<string, string[]>>({ Astar: [], BFS: [], DFS: [] });

  // Animation states
  const [animating, setAnimating] = useState<boolean>(false);
  const [animAlgo, setAnimAlgo] = useState<string>("Astar");
  const [animatedIndex, setAnimatedIndex] = useState<number>(0);
  
  // Benchmarking
  const [benchmarking, setBenchmarking] = useState<boolean>(false);
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkMetric[] | null>(null);

  // Map DOM and instance references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const edgesLayerRef = useRef<L.FeatureGroup | null>(null);
  const markersLayerRef = useRef<L.FeatureGroup | null>(null);
  const selectionLayerRef = useRef<L.FeatureGroup | null>(null);
  const pathLayersRef = useRef<L.Polyline[]>([]);

  // Keep a mutable ref of nodes and start/goal states for leaflet event handler callbacks
  const nodesRef = useRef<CampusNode[]>([]);
  const startNodeRef = useRef<string>("");
  const goalNodeRef = useRef<string>("");

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    startNodeRef.current = startNode;
    goalNodeRef.current = goalNode;
  }, [startNode, goalNode]);

  // Ingest Graph Data
  useEffect(() => {
    fetch("/api/graph")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch graph");
        return res.json() as Promise<GraphData>;
      })
      .then((data) => {
        const cleanNodes = data.nodes.map(n => ({
          ...n,
          label: n.label ? stripEmojis(n.label) : "Unknown"
        }));
        setNodes(cleanNodes);
        setEdges(data.edges);
        
        const nMap: Record<string, CampusNode> = {};
        cleanNodes.forEach((n) => {
          nMap[n.id] = n;
        });
        setNodesMap(nMap);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error connecting to backend API:", err);
      });
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (loading || !mapContainerRef.current || mapRef.current) return;

    // Centered around MIT Manipal campus
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      dragging: true,
      doubleClickZoom: true,
      boxZoom: false
    }).setView([13.3475, 74.7972], 16);

    // Default OpenStreetMap tileset
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Initialize overlay groups
    edgesLayerRef.current = L.featureGroup().addTo(map);
    markersLayerRef.current = L.featureGroup().addTo(map);
    selectionLayerRef.current = L.featureGroup().addTo(map);

    // Bind map click handler to select nearest node
    map.on("click", (e) => {
      const clickLat = e.latlng.lat;
      const clickLng = e.latlng.lng;
      const currentNodes = nodesRef.current;

      let nearestNodeId = "";
      let minDist = Infinity;

      currentNodes.forEach((n) => {
        const d = Math.sqrt((n.y - clickLat) ** 2 + (n.x - clickLng) ** 2);
        if (d < minDist) {
          minDist = d;
          nearestNodeId = n.id;
        }
      });

      if (nearestNodeId) {
        handleNodeSelection(nearestNodeId);
      }
    });

    mapRef.current = map;
  }, [loading]);

  // Selection state updater for Leaflet
  const handleNodeSelection = (nodeId: string) => {
    if (animating) return;
    const start = startNodeRef.current;
    const goal = goalNodeRef.current;

    if (!start || (start && goal)) {
      setStartNode(nodeId);
      setGoalNode("");
    } else {
      setGoalNode(nodeId);
    }
  };

  // Draw background road edges and landmark nodes
  useEffect(() => {
    const map = mapRef.current;
    const edgesGroup = edgesLayerRef.current;
    const markersGroup = markersLayerRef.current;

    if (!map || !edgesGroup || !markersGroup || edges.length === 0) return;

    edgesGroup.clearLayers();
    markersGroup.clearLayers();

    // 1. Draw road network segments (very faint topology helper)
    edges.forEach((e) => {
      const s = nodesMap[e.source];
      const t = nodesMap[e.target];
      if (s && t) {
        L.polyline([[s.y, s.x], [t.y, t.x]], {
          color: "#475569", 
          weight: 1.5,
          opacity: 0.15,
          interactive: false
        }).addTo(edgesGroup);
      }
    });

    // 2. Draw nodes & landmarks (Only render landmarks to avoid cluttering OSM base map)
    nodes.forEach((n) => {
      const isLandmark = n.label && n.label !== "Unknown";
      if (!isLandmark) return;

      const style = getLandmarkStyle(n.label);
      const customIcon = L.divIcon({
        className: "osm-landmark",
        html: `
          <div class="flex items-center space-x-1 bg-white/90 px-1.5 py-0.5 rounded border ${style.borderColor} shadow-sm whitespace-nowrap select-none">
            <span class="text-xs">${style.icon}</span>
            <span class="text-[10px] font-bold ${style.textColor} tracking-tight">${n.label}</span>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [30, 10]
      });

      const marker = L.marker([n.y, n.x], { icon: customIcon }).addTo(markersGroup);

      marker.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        handleNodeSelection(n.id);
      });
    });

    // Fit map bounds to show full road network
    if (nodes.length > 0) {
      const coords = nodes.map(n => [n.y, n.x] as L.LatLngTuple);
      map.fitBounds(L.latLngBounds(coords), { padding: [20, 20] });
    }
  }, [nodes, edges]);

  // Update Green/Red markers for Start/Goal selections
  useEffect(() => {
    const group = selectionLayerRef.current;
    if (!group) return;

    group.clearLayers();

    // Start Landmark marker
    if (startNode && nodesMap[startNode]) {
      const s = nodesMap[startNode];
      const startIcon = L.icon({
        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });

      L.marker([s.y, s.x], { icon: startIcon }).addTo(group)
        .bindTooltip(`Start: ${s.label === "Unknown" ? `Node #${s.id}` : s.label}`, {
          permanent: true,
          direction: "top"
        });
    }

    // Goal Destination marker
    if (goalNode && nodesMap[goalNode]) {
      const g = nodesMap[goalNode];
      const goalIcon = L.icon({
        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });

      L.marker([g.y, g.x], { icon: goalIcon }).addTo(group)
        .bindTooltip(`Goal: ${g.label === "Unknown" ? `Node #${g.id}` : g.label}`, {
          permanent: true,
          direction: "top"
        });
    }
  }, [startNode, goalNode, nodesMap]);

  // Render path finding lines (A*, BFS, DFS)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous route polylines
    pathLayersRef.current.forEach(layer => layer.remove());
    pathLayersRef.current = [];

    // Helper to draw route polylines
    const drawRouteLine = (path: string[], color: string, weight: number, opacity: number, maxIdx: number) => {
      const coords = path.slice(0, maxIdx).map(id => {
        const n = nodesMap[id];
        return [n.y, n.x] as L.LatLngExpression;
      });

      if (coords.length > 1) {
        const poly = L.polyline(coords, {
          color,
          weight,
          opacity,
          lineCap: "round",
          lineJoin: "round"
        }).addTo(map);
        pathLayersRef.current.push(poly);
      }
    };

    // 1. Draw DFS Path (Amber)
    if (paths.DFS && paths.DFS.length > 0) {
      const dfsLimit = (animAlgo === "DFS" && animating) ? animatedIndex : paths.DFS.length;
      drawRouteLine(paths.DFS, "#f9ab00", 3.5, 0.7, dfsLimit);
    }

    // 2. Draw BFS Path (Green)
    if (paths.BFS && paths.BFS.length > 0) {
      const bfsLimit = (animAlgo === "BFS" && animating) ? animatedIndex : paths.BFS.length;
      drawRouteLine(paths.BFS, "#1e8e3e", 4.5, 0.75, bfsLimit);
    }

    // 3. Draw A* Path (Google Blue)
    if (paths.Astar && paths.Astar.length > 0) {
      const astarLimit = (animAlgo === "Astar" && animating) ? animatedIndex : paths.Astar.length;
      drawRouteLine(paths.Astar, "#1a73e8", 6, 0.9, astarLimit);
    }
  }, [paths, animating, animatedIndex, animAlgo, nodesMap]);

  // Run backend routing API
  const calculateRoute = async (algo: "astar" | "bfs" | "dfs") => {
    if (!startNode || !goalNode || startNode === goalNode) return null;
    
    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: startNode,
          goal: goalNode,
          algo: algo,
          heuristic: heuristic,
          traffic: dynamicTraffic
        } as RouteRequest)
      });

      if (!response.ok) return null;
      return await response.json() as RouteResponse;
    } catch (e) {
      console.error(`Route calculation error for ${algo}:`, e);
      return null;
    }
  };

  const updateRoutes = async () => {
    if (!startNode || !goalNode) return;
    
    const astarRes = await calculateRoute("astar");
    const bfsRes = await calculateRoute("bfs");
    const dfsRes = await calculateRoute("dfs");

    const newPaths: Record<string, string[]> = {};

    if (astarRes) {
      newPaths.Astar = astarRes.path;
    }
    if (bfsRes) {
      newPaths.BFS = bfsRes.path;
    }
    if (dfsRes) {
      newPaths.DFS = dfsRes.path;
    }

    setPaths(newPaths);

    // Auto-animate A* path
    if (astarRes) {
      setAnimating(true);
      setAnimAlgo("Astar");
      setAnimatedIndex(0);
    }
  };

  useEffect(() => {
    if (startNode && goalNode) {
      updateRoutes();
    }
  }, [startNode, goalNode]);

  const triggerAnimation = (algo: string) => {
    setAnimating(true);
    setAnimAlgo(algo);
    setAnimatedIndex(0);
  };

  useEffect(() => {
    if (!animating) return;
    const currentPath = paths[animAlgo];
    if (!currentPath || currentPath.length === 0) {
      setAnimating(false);
      return;
    }

    if (animatedIndex < currentPath.length) {
      const timer = setTimeout(() => {
        setAnimatedIndex(prev => prev + 1);
      }, animSpeed);
      return () => clearTimeout(timer);
    } else {
      setAnimating(false);
    }
  }, [animating, animatedIndex, animAlgo, paths, animSpeed]);

  // Run Backend benchmark
  const triggerBenchmark = () => {
    setBenchmarking(true);
    fetch("/api/benchmark?runs=50")
      .then(res => res.json() as Promise<BenchmarkMetric[]>)
      .then(data => {
        setBenchmarkResults(data);
        setBenchmarking(false);
      })
      .catch(err => {
        console.error("Error executing benchmark:", err);
        setBenchmarking(false);
      });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-600">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm font-semibold tracking-wide">Loading MIT Campus Map...</p>
      </div>
    );
  }

  const startLandmark = nodesMap[startNode];
  const goalLandmark = nodesMap[goalNode];

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans flex flex-col antialiased">
      
      {/* Header / Navbar */}
      <header className="max-w-5xl w-full mx-auto px-6 py-6 flex items-center justify-between border-b border-dashed border-slate-200">
        <div className="flex items-center space-x-2">
          <span className="text-2xl font-serif-custom font-bold text-slate-900">MIT Route Planner</span>
        </div>

        <nav className="flex items-center space-x-6 text-sm font-medium text-slate-500">
          <div className="relative py-1 flex flex-col items-center select-none cursor-pointer">
            <span className="text-slate-950 font-bold">Home</span>
            <span className="absolute bottom-[-6px] w-1.5 h-1.5 bg-slate-950 rounded-full"></span>
          </div>
          <span className="hover:text-slate-900 transition-colors cursor-pointer">Benchmarks</span>
          <span className="hover:text-slate-900 transition-colors cursor-pointer">Documentation</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 hover:text-slate-900 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </span>
        </nav>
      </header>

      {/* Main Single Column Layout */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 flex flex-col space-y-8">
        
        {/* Selection overlay (above the map) */}
        <div className="flex flex-col space-y-3 py-1">
          <h2 className="text-2xl font-serif-custom font-bold tracking-tight text-slate-900">
            Route Planner
          </h2>
          
          <div className="flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center space-x-8">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Start Location</span>
                <span className="font-serif-custom text-slate-900 text-lg font-medium mt-0.5 block">
                  {startLandmark ? startLandmark.label : "Click a point on the map"}
                </span>
              </div>
              <div className="text-slate-300 font-bold text-lg">➔</div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Goal Destination</span>
                <span className="font-serif-custom text-slate-900 text-lg font-medium mt-0.5 block">
                  {goalLandmark ? goalLandmark.label : "Click a point on the map"}
                </span>
              </div>
            </div>
            {(startNode || goalNode) && (
              <button 
                onClick={() => { setStartNode(""); setGoalNode(""); setPaths({ Astar: [], BFS: [], DFS: [] }); }}
                className="text-xs hover:text-slate-900 text-slate-400 underline underline-offset-4 decoration-dashed cursor-pointer font-medium"
                title="Reset Selection"
              >
                Reset Route
              </button>
            )}
          </div>
        </div>

        {/* Detailed Leaflet Map Container */}
        <div className="border border-slate-200 rounded-lg overflow-hidden h-[500px]">
          <div 
            ref={mapContainerRef} 
            className="w-full h-full"
          ></div>
        </div>

        <div className="h-px border-b border-dashed border-slate-200"></div>

        {/* Benchmark & Control Panel */}
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-serif-custom font-bold tracking-tight text-slate-900">
                Map Controls & Benchmark
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-medium max-w-xl leading-relaxed">
                Click map nodes to define parameters. Use animation overlays to inspect search space expansions or run multi-trial empirical benchmarks.
              </p>
            </div>

            {/* Animation & Benchmark Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={!paths.Astar || paths.Astar.length === 0}
                onClick={() => triggerAnimation("Astar")}
                className={`py-2 px-3 border rounded-lg text-xs font-bold uppercase transition-all ${
                  paths.Astar && paths.Astar.length > 0
                    ? "border-[#1a73e8] text-[#1a73e8] bg-blue-50/20 hover:bg-blue-50/40 cursor-pointer"
                    : "border-slate-200 bg-slate-50/50 text-slate-400 cursor-not-allowed"
                }`}
              >
                Animate A*
              </button>
              <button
                disabled={!paths.BFS || paths.BFS.length === 0}
                onClick={() => triggerAnimation("BFS")}
                className={`py-2 px-3 border rounded-lg text-xs font-bold uppercase transition-all ${
                  paths.BFS && paths.BFS.length > 0
                    ? "border-[#1e8e3e] text-[#1e8e3e] bg-emerald-50/20 hover:bg-emerald-50/40 cursor-pointer"
                    : "border-slate-200 bg-slate-50/50 text-slate-400 cursor-not-allowed"
                }`}
              >
                Animate BFS
              </button>
              <button
                disabled={!paths.DFS || paths.DFS.length === 0}
                onClick={() => triggerAnimation("DFS")}
                className={`py-2 px-3 border rounded-lg text-xs font-bold uppercase transition-all ${
                  paths.DFS && paths.DFS.length > 0
                    ? "border-[#f9ab00] text-[#b07800] bg-amber-50/20 hover:bg-amber-50/40 cursor-pointer"
                    : "border-slate-200 bg-slate-50/50 text-slate-400 cursor-not-allowed"
                }`}
              >
                Animate DFS
              </button>

              <div className="w-px h-6 bg-slate-200 mx-1 hidden md:block"></div>

              <button
                disabled={benchmarking}
                onClick={triggerBenchmark}
                className={`py-2 px-4 rounded-lg text-xs font-bold tracking-wide uppercase transition-all flex items-center gap-2 ${
                  benchmarking 
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200" 
                    : "bg-slate-950 hover:bg-slate-800 text-white cursor-pointer"
                }`}
              >
                {benchmarking ? (
                  <>
                    <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" /> Run Benchmark (50 Runs)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Benchmark Results Table */}
          {benchmarkResults ? (
            <div className="overflow-x-auto pt-2">
              <table className="min-w-full text-left text-xs text-slate-600">
                <thead>
                  <tr className="border-b border-dashed border-slate-200 text-[10px] text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Algorithm</th>
                    <th className="py-2.5 px-3">Avg Compute Speed</th>
                    <th className="py-2.5 px-3">Avg Path Cost (Distance)</th>
                    <th className="py-2.5 px-3">Avg Hops (Nodes)</th>
                    <th className="py-2.5 px-3">Optimality Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-slate-100 font-medium">
                  {benchmarkResults.map(res => (
                    <tr key={`benchmark-row-${res.name}`} className="hover:bg-slate-50/30">
                      <td className="py-3 px-3 font-serif-custom text-sm font-bold text-slate-900">{res.name}</td>
                      <td className="py-3 px-3 font-mono">{res.avgTime.toFixed(4)} ms</td>
                      <td className="py-3 px-3 font-mono">{res.avgCost.toFixed(2)} m</td>
                      <td className="py-3 px-3 font-mono">{res.avgLength.toFixed(1)} nodes</td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] py-0.5 px-2 rounded font-bold border ${
                          res.name === "A*" ? "bg-blue-50/50 text-blue-600 border-blue-100" :
                          res.name === "BFS" ? "bg-emerald-50/50 text-emerald-600 border-emerald-100" :
                          "bg-amber-50/50 text-amber-600 border-amber-100"
                        }`}>
                          {res.name === "A*" ? "Optimal" : res.name === "BFS" ? "Suboptimal" : "Poor"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center justify-center text-xs text-slate-400">
              <Clock className="w-5 h-5 text-slate-300 mb-2" />
              <span className="font-medium">No benchmark records. Click "Run Benchmark" to fetch performance comparisons.</span>
            </div>
          )}

        </div>

      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-dashed border-slate-200 bg-white text-center text-[10px] text-slate-400 font-mono tracking-wider">
        MIT Campus Routing Dashboard &bull; A* vs BFS vs DFS Comparative Analysis
      </footer>

    </div>
  );
}
