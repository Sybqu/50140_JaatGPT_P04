"""Deterministic explanations derived only from simulation outputs."""


def explain(node_name: str, advisory: dict, simulation: dict, mitigation: dict | None = None, lambda_value: float = 0.0) -> str:
    """Return a grounded three-sentence explanation without generative AI."""
    if mitigation:
        selected = mitigation["selected"]
        after = selected["after"]
        return (f"{selected['label']} changes the median affected count from {simulation['median_affected']:.0f} to {after['median_affected']:.0f}, with worst case {simulation['worst_case_affected']} to {after['worst_case_affected']}. "
                f"Its expected reduction is {selected['risk_reduction']:.2f} nodes at illustrative cost {selected['cost']:.2f}; λ={lambda_value:.2f} determines how strongly that cost changes its rank. "
                f"The comparison comes from {simulation['trials']} Monte Carlo trials and remains separate from the advisory CVSS {advisory.get('cvss', 0.0)}/10.")
    return (f"{node_name} is simulated under {advisory.get('id', 'the baked advisory')} across {simulation['trials']} Monte Carlo trials. "
            f"Downstream impact is median {simulation['median_affected']:.0f}, p90 {simulation['p90_affected']:.0f}, and worst case {simulation['worst_case_affected']}; each edge samples its rule-based probability. "
            "Structural criticality remains independent of CVE severity, combining betweenness, dependent count, service tier, and redundancy.")
