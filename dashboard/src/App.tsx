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



export default function App() {
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingError, setLoadingError] = useState<string>("");
  const [nodes, setNodes] = useState<CampusNode[]>([]);
  const [edges, setEdges] = useState<CampusEdge[]>([]);
  const [nodesMap, setNodesMap] = useState<Record<string, CampusNode>>({});
  
  // Theme & Selection states
  const [darkMode, setDarkMode] = useState<boolean>(false);
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
        console.error("Error loading graph:", err);
        setLoadingError("Failed to load campus graph data. Please verify that backend is running and data is linked.");
        setLoading(false);
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

    // 2. Draw nodes & landmarks (Only render landmarks as clean dots with hover tooltips)
    nodes.forEach((n) => {
      const isLandmark = n.label && n.label !== "Unknown";
      if (!isLandmark) return;

      const circle = L.circleMarker([n.y, n.x], {
        radius: 4,
        color: "#0288d1", 
        fillColor: "#0288d1",
        fillOpacity: 0.5,
        weight: 1
      }).addTo(markersGroup);

      circle.bindTooltip(n.label, {
        permanent: false, 
        direction: "top"
      });

      circle.on("click", (e: any) => {
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

  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  useEffect(() => {
    if (benchmarkResults && tableRef.current) {
      setTimeout(() => {
        tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [benchmarkResults]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm font-semibold tracking-wide">Loading MIT Campus Map...</p>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-slate-950 text-red-600 dark:text-red-400 p-4 text-center font-mono">
        <span className="text-lg font-bold">Error</span>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 max-w-md">{loadingError}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-slate-950 dark:bg-white text-white dark:text-slate-950 rounded text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const startLandmark = nodesMap[startNode];
  const goalLandmark = nodesMap[goalNode];

  return (
    <div className="min-h-screen flex flex-col font-sans antialiased bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-200">
      
      {/* Header / Navbar */}
      <header className="w-full px-8 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <span className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">GraphMIT</span>
        </div>

        <nav className="flex items-center space-x-6 text-sm font-bold text-slate-500 dark:text-slate-400">
          <a 
            href="https://github.com/ayatinkering/Astar-Campus-Route-Planning" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-slate-950 dark:hover:text-white transition-colors"
          >
            Code
          </a>
          <span className="text-slate-300 dark:text-slate-800">|</span>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer focus:outline-none flex items-center"
            title="Toggle Theme"
          >
            {darkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4.5 h-4.5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707-.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4.5 h-4.5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </nav>
      </header>

      {/* Main Single Column Layout */}
      <main className="flex-1 w-full px-8 py-6 flex flex-col space-y-6">
        
        {/* Detailed Leaflet Map Container */}
        <div className="w-full h-[550px] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden relative flex-shrink-0">
          <div 
            ref={mapContainerRef} 
            className="w-full h-full"
          ></div>
        </div>

        {/* Benchmark & Control Panel */}
        <div className="flex flex-col space-y-3 flex-shrink-0">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Map Controls & Benchmark
              </h3>
              
              {/* Selections inline conditional */}
              {startNode && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-1 flex flex-wrap items-center gap-1">
                  <span>Start: <span className="text-slate-950 dark:text-white font-bold">{startLandmark ? startLandmark.label : startNode}</span></span>
                  
                  {goalNode ? (
                    <>
                      <span className="text-slate-300 dark:text-slate-800 px-1">➔</span>
                      <span>Goal: <span className="text-slate-950 dark:text-white font-bold">{goalLandmark ? goalLandmark.label : goalNode}</span></span>
                      <button 
                        onClick={() => { setStartNode(""); setGoalNode(""); setPaths({ Astar: [], BFS: [], DFS: [] }); }}
                        className="text-[10px] text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-white underline cursor-pointer ml-2 font-bold"
                      >
                        Clear Selection
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-300 dark:text-slate-800 px-1">➔</span>
                      <span>Goal: <span className="text-slate-400 dark:text-slate-600 font-normal italic">[Click map for Goal]</span></span>
                      <button 
                        onClick={() => { setStartNode(""); setGoalNode(""); setPaths({ Astar: [], BFS: [], DFS: [] }); }}
                        className="text-[10px] text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-white underline cursor-pointer ml-2 font-bold"
                      >
                        Clear Selection
                      </button>
                    </>
                  )}
                </div>
              )}
              
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-normal mt-1.5 max-w-lg">
                Define endpoints via map clicks. Trigger animations to analyze expansion paths or run comparative benchmarks.
              </p>
            </div>

            {/* Animation & Benchmark Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={!paths.Astar || paths.Astar.length === 0}
                onClick={() => triggerAnimation("Astar")}
                className={`py-1.5 px-2.5 border rounded text-[11px] font-bold transition-all ${
                  paths.Astar && paths.Astar.length > 0
                    ? "border-[#1a73e8] text-[#1a73e8] bg-blue-50/20 dark:bg-blue-900/10 hover:bg-blue-50/40 dark:hover:bg-blue-900/20 cursor-pointer"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                }`}
              >
                Animate A*
              </button>
              <button
                disabled={!paths.BFS || paths.BFS.length === 0}
                onClick={() => triggerAnimation("BFS")}
                className={`py-1.5 px-2.5 border rounded text-[11px] font-bold transition-all ${
                  paths.BFS && paths.BFS.length > 0
                    ? "border-[#1e8e3e] text-[#1e8e3e] bg-emerald-50/20 dark:bg-emerald-900/10 hover:bg-emerald-50/40 dark:hover:bg-emerald-900/20 cursor-pointer"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                }`}
              >
                Animate BFS
              </button>
              <button
                disabled={!paths.DFS || paths.DFS.length === 0}
                onClick={() => triggerAnimation("DFS")}
                className={`py-1.5 px-2.5 border rounded text-[11px] font-bold transition-all ${
                  paths.DFS && paths.DFS.length > 0
                    ? "border-[#f9ab00] text-[#b07800] dark:text-[#f9ab00] bg-amber-50/20 dark:bg-amber-900/10 hover:bg-amber-50/40 dark:hover:bg-amber-900/20 cursor-pointer"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                }`}
              >
                Animate DFS
              </button>

              <button
                disabled={benchmarking}
                onClick={triggerBenchmark}
                className={`py-1.5 px-3 rounded text-[11px] font-bold transition-all flex items-center gap-2 ${
                  benchmarking 
                    ? "bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-800" 
                    : "bg-slate-950 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-950 cursor-pointer"
                }`}
              >
                {benchmarking ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
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
            <div ref={tableRef} className="border border-slate-200 dark:border-slate-800 rounded pt-1 mt-2">
              <table className="min-w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[9px] text-slate-400 dark:text-slate-500">
                    <th className="py-2 px-3">Algorithm</th>
                    <th className="py-2 px-3">Avg Compute Speed</th>
                    <th className="py-2 px-3">Avg Path Cost (Distance)</th>
                    <th className="py-2 px-3">Avg Hops (Nodes)</th>
                    <th className="py-2 px-3">Optimality Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {benchmarkResults.map(res => (
                    <tr key={`benchmark-row-${res.name}`} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/30">
                      <td className="py-2 px-3 text-xs font-bold text-slate-900 dark:text-white">{res.name}</td>
                      <td className="py-2 px-3 font-mono text-[11px]">{res.avgTime.toFixed(4)} ms</td>
                      <td className="py-2 px-3 font-mono text-[11px]">{res.avgCost.toFixed(2)} m</td>
                      <td className="py-2 px-3 font-mono text-[11px]">{res.avgLength.toFixed(1)} nodes</td>
                      <td className="py-2 px-3">
                        <span className={`text-[9px] py-0.5 px-2 rounded font-bold border ${
                          res.name === "A*" ? "bg-blue-50/50 dark:bg-blue-950/25 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30" :
                          res.name === "BFS" ? "bg-emerald-50/50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30" :
                          "bg-amber-50/50 dark:bg-amber-950/25 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30"
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
            <div className="py-4 flex flex-col items-center justify-center text-xs text-slate-400 dark:text-slate-600">
              <Clock className="w-4 h-4 text-slate-300 dark:text-slate-700 mb-1" />
              <span className="font-semibold text-[11px]">No benchmark records. Click "Run Benchmark".</span>
            </div>
          )}

        </div>

      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-center text-xs text-slate-400 dark:text-slate-500 font-mono tracking-wider flex-shrink-0">
        <div className="flex flex-col items-center space-y-2">
          <span>GraphMIT &bull; A* vs BFS vs DFS Comparative Analysis</span>
          <div className="flex items-center space-x-3 text-slate-500 dark:text-slate-400 font-bold">
            <a 
              href="https://github.com/ayatinkering/Astar-Campus-Route-Planning" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-slate-950 dark:hover:text-white underline"
            >
              Code (GitHub Repository)
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
