"""Monte Carlo compromise propagation over a copied dependency twin."""

import random

import networkx as nx
import numpy as np


def edge_probability(graph: nx.DiGraph, source: str, target: str, attrs: dict) -> float:
    """Return an inspectable heuristic probability for one propagation edge."""
    source_attrs = graph.nodes[source]
    target_attrs = graph.nodes[target]
    probability = float(attrs.get("base_probability", 0.72)) * float(attrs.get("weight", 1.0))
    if attrs.get("dependency_scope", "runtime") != "runtime":
        probability *= 0.6
    if source_attrs.get("upgraded") or target_attrs.get("upgraded"):
        probability *= 0.05
    elif source_attrs.get("patched") or target_attrs.get("patched"):
        probability *= 0.15
    probability *= 0.75 + (1 - float(target_attrs.get("maintainer_activity_score", 0.5))) * 0.25
    if target_attrs.get("redundancy"):
        probability *= 0.48
    return round(min(0.98, max(0.0, probability)), 4)


def decay_for_hop(hop_distance: int) -> float:
    """Keep the legacy hop-decay contribution for traceable node risk."""
    return 1.0 if hop_distance <= 1 else 0.5 if hop_distance == 2 else 0.25


def propagate(graph: nx.DiGraph, compromised_id: str, trials: int = 800, seed: int | None = None) -> dict:
    """Run stochastic propagation trials and aggregate impact distributions."""
    if compromised_id not in graph:
        raise ValueError("Unknown package")
    if not 1 <= trials <= 10000:
        raise ValueError("trials must be between 1 and 10000")
    # The live twin is never mutated: each simulation receives a shallow graph copy.
    active_graph = graph.copy()
    rng = random.Random(seed)
    counts, hit_counts = [], {node_id: 0 for node_id in active_graph}
    for _ in range(trials):
        affected, queue = {compromised_id}, [compromised_id]
        while queue:
            source = queue.pop(0)
            for _, target, attrs in active_graph.out_edges(source, data=True):
                if target not in affected and rng.random() < edge_probability(active_graph, source, target, attrs):
                    affected.add(target)
                    queue.append(target)
        counts.append(len(affected) - 1)
        for node_id in affected:
            hit_counts[node_id] += 1
    probabilities = {node_id: count / trials for node_id, count in hit_counts.items()}
    deterministic = nx.single_source_shortest_path_length(active_graph, compromised_id)
    severity = active_graph.nodes[compromised_id]["severity"]
    risks, breakdown = {}, {}
    for node_id, distance in deterministic.items():
        hop = max(1, distance)
        expected = probabilities[node_id] * severity * decay_for_hop(hop) * (1 + active_graph.nodes[node_id].get("blast_radius", 0))
        risks[node_id] = expected
        breakdown[node_id] = {"hop_distance": distance, "affected_probability": round(probabilities[node_id], 4), "expected_severity_contribution": round(expected, 4), "edge_path_rule": "base probability × maintainer activity × redundancy × edge weight"}
    return {"trials": trials, "median_affected": float(np.median(counts)), "p90_affected": float(np.percentile(counts, 90)), "worst_case_affected": int(max(counts)), "mean_affected": round(float(np.mean(counts)), 4), "affected_probabilities": probabilities, "affected": {node_id for node_id, value in probabilities.items() if value > 0}, "risk_scores": risks, "breakdown": breakdown}
