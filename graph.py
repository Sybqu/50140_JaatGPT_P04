"""Load the baked dependency graph and calculate structural metrics."""

import json
from pathlib import Path

import networkx as nx

DATA_PATH = Path(__file__).parent / "data" / "demo_graph.json"


def load_data() -> dict:
    """Load the baked offline demo dataset."""
    with DATA_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def build_graph() -> tuple[nx.DiGraph, dict]:
    """Build the package-to-dependent directed graph from baked data."""
    # ASSUMPTION: bitpay/copay/package.json is the chosen real npm manifest; edges point dependency -> dependent so descendants are downstream impact.
    data = load_data()
    graph = nx.DiGraph()
    for node in data["nodes"]:
        graph.add_node(node["id"], **node)
    for link in data["links"]:
        graph.add_edge(link["source"], link["target"], weight=link.get("weight", 1.0))
    centrality = nx.betweenness_centrality(graph, normalized=True)
    for node_id in graph.nodes:
        graph.nodes[node_id]["betweenness"] = round(centrality[node_id], 6)
        graph.nodes[node_id]["blast_radius"] = len(nx.descendants(graph, node_id))
        graph.nodes[node_id]["severity"] = float(graph.nodes[node_id].get("severity", 0.0))
    return graph, data


def graph_payload(graph: nx.DiGraph, risk: dict | None = None, affected: set | None = None, compromised: str | None = None) -> dict:
    """Serialize graph metrics and simulation state for the frontend."""
    risk = risk or {}
    affected = affected or set()
    nodes = []
    for node_id, attrs in graph.nodes(data=True):
        nodes.append({
            "id": node_id,
            "name": attrs["name"],
            "version": attrs["version"],
            "betweenness": attrs["betweenness"],
            "blast_radius": attrs["blast_radius"],
            "severity": attrs["severity"],
            "risk": round(risk.get(node_id, 0.0), 4),
            "affected": node_id in affected and node_id != compromised,
            "compromised": node_id == compromised,
        })
    return {"nodes": nodes, "links": [{"source": source, "target": target, "weight": attrs["weight"]} for source, target, attrs in graph.edges(data=True)]}
