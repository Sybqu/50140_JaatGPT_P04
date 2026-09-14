"""Rule-based compromise propagation over dependency graph paths."""

import networkx as nx


def decay_for_hop(hop_distance: int) -> float:
    """Return the specified propagation decay for a hop distance."""
    # ASSUMPTION: distances beyond three continue at the three-hop 0.25 bucket for a compact, inspectable MVP rule.
    return 1.0 if hop_distance <= 1 else 0.5 if hop_distance == 2 else 0.25


def propagate(graph: nx.DiGraph, compromised_id: str) -> dict:
    """Calculate affected nodes and risk from one compromised package."""
    if compromised_id not in graph:
        raise ValueError("Unknown package")
    active_graph = nx.DiGraph((source, target, attrs) for source, target, attrs in graph.edges(data=True) if attrs.get("weight", 1.0) > 0)
    active_graph.add_nodes_from(graph.nodes(data=True))
    severity = graph.nodes[compromised_id]["severity"]
    distances = nx.single_source_shortest_path_length(active_graph, compromised_id)
    affected = set(distances)
    risks = {}
    breakdown = {}
    for node_id, distance in distances.items():
        hop = max(1, distance)
        blast_radius = len(nx.descendants(active_graph, node_id))
        probability = decay_for_hop(hop)
        risk = blast_radius * severity * probability
        risks[node_id] = risk
        breakdown[node_id] = {"blast_radius": blast_radius, "severity": severity, "hop_distance": distance, "spread_probability": probability, "risk": risk}
    return {"risk_scores": risks, "affected": affected, "distances": distances, "breakdown": breakdown}
