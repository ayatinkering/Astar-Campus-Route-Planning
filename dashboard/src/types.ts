export interface CampusNode {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface CampusEdge {
  source: string;
  target: string;
  length: number;
}

export interface GraphData {
  nodes: CampusNode[];
  edges: CampusEdge[];
}

export interface RouteRequest {
  start: string;
  goal: string;
  algo: 'astar' | 'bfs' | 'dfs';
  heuristic: 'euclidean' | 'manhattan';
  traffic: boolean;
}

export interface RouteResponse {
  path: string[];
  cost: number;
  time_ms: number;
  landmarks: string[];
}

export interface BenchmarkMetric {
  name: string;
  avgTime: number;
  avgCost: number;
  avgLength: number;
}
