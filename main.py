"""FastAPI API for the Supply Chain Ripple Risk Analyzer."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from explain import explain
from graph import build_graph, graph_payload
from mitigate import mitigate
from propagate import propagate

app = FastAPI(title="Supply Chain Ripple Risk Analyzer")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
GRAPH, DATA = build_graph()


class SimulationRequest(BaseModel):
    """Validate a requested compromised package id."""
    node_id: str


def advisory_for(node_id: str) -> dict:
    """Find baked advisory data for a graph node."""
    return DATA["advisories"].get(GRAPH.nodes[node_id]["name"], {"id": "No baked advisory", "cvss": 0.0, "text": "No advisory is available for this package."})


@app.get("/api/graph")
def get_graph() -> dict:
    """Return the offline graph with structural metrics."""
    return graph_payload(GRAPH)


@app.post("/api/simulate")
def simulate(request: SimulationRequest) -> dict:
    """Run the hop-decay compromise simulation."""
    try:
        result = propagate(GRAPH, request.node_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    advisory = advisory_for(request.node_id)
    return {**graph_payload(GRAPH, result["risk_scores"], result["affected"], request.node_id), "simulation": {**result, "affected": sorted(result["affected"])}, "advisory": advisory, "explanation": explain(GRAPH.nodes[request.node_id]["name"], advisory, result)}


@app.post("/api/mitigate")
def run_mitigation(request: SimulationRequest) -> dict:
    """Run the single-fix patch comparison for a compromised package."""
    if request.node_id not in GRAPH:
        raise HTTPException(status_code=404, detail="Unknown package")
    result = mitigate(GRAPH, request.node_id)
    advisory = advisory_for(request.node_id)
    return {"mitigation": {**result, "before": {**result["before"], "affected": sorted(result["before"]["affected"])}, "after": {**result["after"], "affected": sorted(result["after"]["affected"])}}, "advisory": advisory, "explanation": explain(GRAPH.nodes[request.node_id]["name"], advisory, result["before"], result)}
