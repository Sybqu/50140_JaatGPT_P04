"""Transparent action search for Monte Carlo mitigation comparisons."""

from itertools import combinations

import networkx as nx

from backend.propagate import propagate

VALID_ACTIONS = {"PATCH", "ISOLATE", "UPGRADE", "DO_NOTHING"}


def action_cost(graph: nx.DiGraph, node_id: str, action: str) -> float:
    """Estimate illustrative engineering cost for one mitigation action."""
    # ASSUMPTION: costs are demo heuristics, not financial estimates; dependency fan-out makes patching harder.
    fan_out = graph.nodes[node_id].get("dependents_count", 0)
    return {"DO_NOTHING": 0.0, "ISOLATE": 1.0, "UPGRADE": 2.5 + fan_out * 0.25, "PATCH": 2.0 + fan_out * 0.55}[action]


def apply_actions(graph: nx.DiGraph, actions: list[dict]) -> nx.DiGraph:
    """Return a hypothetical copied twin with the requested actions applied."""
    hypothetical = graph.copy()
    for item in actions:
        node_id, action = item["node_id"], item["action"]
        if action == "ISOLATE":
            for _, _, attrs in hypothetical.out_edges(node_id, data=True):
                attrs["weight"] = 0.0
        elif action == "PATCH":
            hypothetical.nodes[node_id]["severity"] = 0.05
            hypothetical.nodes[node_id]["patched"] = True
        elif action == "UPGRADE":
            hypothetical.nodes[node_id]["severity"] = 0.0
            hypothetical.nodes[node_id]["maintainer_activity_score"] = 1.0
            hypothetical.nodes[node_id]["upgraded"] = True
    return hypothetical


def evaluate_actions(graph: nx.DiGraph, compromised_id: str, actions: list[dict], trials: int, seed: int | None) -> dict:
    """Evaluate one action set against the unmodified baseline distribution."""
    result = propagate(apply_actions(graph, actions), compromised_id, trials, seed)
    return {"actions": actions, "label": " + ".join(f"{item['action']}({item['node_id']})" for item in actions), "cost": round(sum(action_cost(graph, item["node_id"], item["action"]) for item in actions), 2), "after": result}


def mitigate(graph: nx.DiGraph, compromised_id: str, requested: list[dict] | None = None, trials: int = 800, seed: int | None = None) -> dict:
    """Evaluate requested actions plus a compact candidate set of singles and pairs."""
    requested = requested or [{"node_id": compromised_id, "action": "PATCH"}]
    for item in requested:
        if item.get("node_id") not in graph or item.get("action") not in VALID_ACTIONS:
            raise ValueError("Each action needs a known node_id and valid action")
    if not 1 <= len(requested) <= 2:
        raise ValueError("Provide one or two actions")
    baseline = propagate(graph, compromised_id, trials, seed)
    targets = [compromised_id] + [node for node, probability in sorted(baseline["affected_probabilities"].items(), key=lambda item: item[1], reverse=True) if node != compromised_id][:2]
    singles = [{"node_id": node, "action": action} for node in targets for action in ("PATCH", "ISOLATE", "UPGRADE")]
    candidates = [[{"node_id": compromised_id, "action": "DO_NOTHING"}]] + [[item] for item in singles]
    candidates.extend([list(pair) for pair in combinations(singles[:4], 2) if pair[0]["node_id"] != pair[1]["node_id"]])
    candidates.append(requested)
    unique, evaluations = set(), []
    for actions in candidates:
        key = tuple(sorted((item["node_id"], item["action"]) for item in actions))
        if key not in unique:
            unique.add(key)
            evaluation = evaluate_actions(graph, compromised_id, actions, trials, seed)
            evaluation["risk_reduction"] = round(baseline["mean_affected"] - evaluation["after"]["mean_affected"], 4)
            evaluations.append(evaluation)
    evaluations.sort(key=lambda item: item["risk_reduction"], reverse=True)
    requested_result = next(item for item in evaluations if tuple(sorted((x["node_id"], x["action"]) for x in item["actions"])) == tuple(sorted((x["node_id"], x["action"]) for x in requested)))
    return {"before": baseline, "selected": requested_result, "candidates": evaluations}
