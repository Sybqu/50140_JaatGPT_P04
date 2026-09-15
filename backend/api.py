"""FastAPI routes for the offline supply-chain digital twin."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.explain import explain
from backend.graph import build_graph, criticality_ranking, graph_payload
from backend.mitigate import mitigate
from backend.propagate import propagate

app = FastAPI(title="Supply Chain Ripple Risk Analyzer")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
GRAPH, DATA = build_graph()


class SimulationRequest(BaseModel):
    """Validate a compromise simulation request."""
    node_id: str
    trials: int = Field(default=800, ge=1, le=10000)
    seed: int | None = None


class Action(BaseModel):
    """Validate one hypothetical mitigation action."""
    node_id: str
    action: str


class MitigationRequest(SimulationRequest):
    """Validate a one- or two-action mitigation search request."""
    actions: list[Action] = []


def advisory_for(node_id: str) -> dict:
    """Find baked advisory data for a graph node."""
    return DATA["advisories"].get(GRAPH.nodes[node_id]["name"], {"id": "No baked advisory", "cvss": 0.0, "text": "No advisory is available for this package."})


@app.get("/api/graph")
def get_graph() -> dict:
    """Return the immutable offline twin with derived metrics."""
    return graph_payload(GRAPH)


@app.get("/api/criticality")
def get_criticality() -> dict:
    """Return structural rankings independent of vulnerability severity."""
    return {"ranking": criticality_ranking(GRAPH)}


@app.post("/api/simulate")
def simulate(request: SimulationRequest) -> dict:
    """Run a configurable Monte Carlo compromise simulation."""
    try:
        result = propagate(GRAPH, request.node_id, request.trials, request.seed)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    advisory = advisory_for(request.node_id)
    return {**graph_payload(GRAPH, result, request.node_id), "simulation": result, "advisory": advisory, "explanation": explain(GRAPH.nodes[request.node_id]["name"], advisory, result)}


@app.post("/api/mitigate")
def run_mitigation(request: MitigationRequest) -> dict:
    """Evaluate requested and suggested one- or two-action mitigations."""
    if request.node_id not in GRAPH:
        raise HTTPException(status_code=404, detail="Unknown package")
    try:
        result = mitigate(GRAPH, request.node_id, [item.model_dump() for item in request.actions] or None, request.trials, request.seed)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    advisory = advisory_for(request.node_id)
    return {"mitigation": result, "advisory": advisory, "explanation": explain(GRAPH.nodes[request.node_id]["name"], advisory, result["before"], result)}
