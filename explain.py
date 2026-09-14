"""Grounded plain-language explanation helpers."""

import os


def template_explain(node_name: str, advisory: dict, simulation: dict, mitigation: dict | None = None) -> str:
    """Return a deterministic three-sentence explanation from computed results."""
    affected_count = len(simulation["affected"]) - 1
    severity = advisory.get("cvss", 0.0)
    if mitigation:
        return (f"Patching {node_name} reduces its downstream blast radius from {mitigation['before_blast_radius']} to {mitigation['after_blast_radius']} packages. "
                f"It removes {len(mitigation['affected_set_delta'])} affected packages from the simulated path and produces the largest risk reductions shown below. "
                f"This is a structural result: the advisory is CVSS {severity}/10, while the dependency graph determines how far its impact can ripple.")
    return (f"{node_name} is simulated as compromised under {advisory.get('id', 'the baked advisory')} (CVSS {severity}/10). "
            f"The hop-decay rule reaches {affected_count} downstream packages, with each risk score equal to downstream blast radius × {severity / 10:.2f} normalized severity × 1.0, 0.5, or 0.25 by hop. "
            f"This separates raw vulnerability severity from structural criticality: packages with more reachable dependents create the larger ripple risk.")


def explain(node_name: str, advisory: dict, simulation: dict, mitigation: dict | None = None) -> str:
    """Use the always-available template explanation for the offline MVP."""
    # ASSUMPTION: optional OpenAI narration is intentionally omitted from the offline core; an API key never changes risk calculations.
    _ = os.getenv("OPENAI_API_KEY")
    return template_explain(node_name, advisory, simulation, mitigation)
