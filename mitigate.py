"""Single-package patch mitigation calculations."""

import networkx as nx

from propagate import propagate


def mitigate(graph: nx.DiGraph, compromised_id: str) -> dict:
    """Patch a compromised node by zeroing its outgoing edge weights."""
    before = propagate(graph, compromised_id)
    patched = graph.copy()
    for _, target, attrs in list(patched.out_edges(compromised_id, data=True)):
        attrs["weight"] = 0.0
    after = propagate(patched, compromised_id)
    reductions = []
    for node_id in before["affected"]:
        reduction = before["risk_scores"].get(node_id, 0.0) - after["risk_scores"].get(node_id, 0.0)
        if reduction > 0:
            reductions.append({"id": node_id, "before_risk": round(before["risk_scores"][node_id], 4), "after_risk": round(after["risk_scores"].get(node_id, 0.0), 4), "risk_reduction": round(reduction, 4)})
    reductions.sort(key=lambda item: item["risk_reduction"], reverse=True)
    return {
        "before": before,
        "after": after,
        "before_blast_radius": graph.nodes[compromised_id]["blast_radius"],
        "after_blast_radius": len(after["affected"]) - 1,
        "affected_set_delta": sorted(before["affected"] - after["affected"]),
        "top_reductions": reductions[:5],
    }
