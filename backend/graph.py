"""Load the baked typed digital twin and derive structural metrics."""

import json
from pathlib import Path

import networkx as nx

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "demo_graph.json"
TIER_WEIGHTS = {"low": 1.0, "medium": 2.0, "high": 3.0, "critical": 4.0}


def load_data() -> dict:
    """Load the offline demo fixture without network access."""
    with DATA_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def build_graph() -> tuple[nx.DiGraph, dict]:
    """Build the dependency-to-dependent graph from the baked twin."""
    # ASSUMPTION: synthetic maintainer dates/scores model operational posture for the demo.
    data = load_data()
    graph = nx.DiGraph()
    graph.add_nodes_from((node["id"], node) for node in data["nodes"])
    graph.add_edges_from((link["source"], link["target"], link) for link in data["links"])
    centrality = nx.betweenness_centrality(graph, normalized=True)
    for node_id, attrs in graph.nodes(data=True):
        attrs["betweenness"] = round(centrality[node_id], 6)
        attrs["blast_radius"] = len(nx.descendants(graph, node_id))
        attrs["dependents_count"] = graph.in_degree(node_id)
        attrs["severity"] = float(attrs.get("severity", 0.0))
    return graph, data


def criticality_ranking(graph: nx.DiGraph) -> list[dict]:
    """Rank every twin node by inspectable structural importance."""
    max_dependents = max((attrs["dependents_count"] for _, attrs in graph.nodes(data=True)), default=1) or 1
    ranked = []
    for node_id, attrs in graph.nodes(data=True):
        tier = TIER_WEIGHTS.get(attrs.get("criticality_tier", "low"), 0.0)
        redundancy_bonus = 0.0 if attrs.get("redundancy", True) else 0.25
        dependent_score = attrs["dependents_count"] / max_dependents
        score = attrs["betweenness"] * 4 + dependent_score * 2 + tier * 0.5 + redundancy_bonus
        ranked.append({"id": node_id, "name": attrs["name"], "type": attrs["type"], "severity": attrs["severity"], "score": round(score, 4), "breakdown": {"betweenness": attrs["betweenness"], "dependents_normalized": round(dependent_score, 4), "criticality_tier_weight": tier, "nonredundancy_bonus": redundancy_bonus}})
    return sorted(ranked, key=lambda item: item["score"], reverse=True)


def graph_payload(graph: nx.DiGraph, simulation: dict | None = None, compromised: str | None = None) -> dict:
    """Serialize twin nodes, typed links, and optional simulation state."""
    simulation = simulation or {}
    probabilities = simulation.get("affected_probabilities", {})
    risks = simulation.get("risk_scores", {})
    nodes = []
    for node_id, attrs in graph.nodes(data=True):
        node = {key: value for key, value in attrs.items() if key not in {"id"}}
        node.update({"id": node_id, "risk": round(risks.get(node_id, 0.0), 4), "affected_probability": round(probabilities.get(node_id, 0.0), 4), "affected": probabilities.get(node_id, 0.0) > 0 and node_id != compromised, "compromised": node_id == compromised})
        nodes.append(node)
    return {"nodes": nodes, "links": [{"source": source, "target": target, **attrs} for source, target, attrs in graph.edges(data=True)]}
