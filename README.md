# Supply Chain Ripple Risk Analyzer

An offline supply-chain security digital twin that shows how **structural reach and propagation dynamics** create risk beyond a static CVSS/CVE score. It uses Monte Carlo simulation over a typed dependency graph — seeded with data based on the real-world Copay / `event-stream` incident — to estimate breach blast radius and rank cost-weighted mitigation options.

---

## Requirements

- **Docker** (recommended path — nothing else needed), **or**
- Python 3.10+ and Node.js 20+ for a manual/local setup

---

## Quick Start (Docker)

The app is fully containerized.

```bash
docker compose up --build
```

- **Frontend UI:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:8000](http://localhost:8000)

Stop the containers:
```bash
docker compose down
```

---

## Running Locally (Without Docker)

### 1. Backend
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) — the Vite dev server proxies `/api` calls to `http://localhost:8000`.

---

## Demo Walkthrough

1. **Select a package** in the top control bar (e.g., `event-stream · 3.3.6`).
2. **Simulate compromise** — runs 800 Monte Carlo propagation trials. The force-directed graph highlights infected packages and downstream services/apps (`Copay wallet service`, `Copay mobile app`), showing median, p90, and worst-case reach.
3. **Find mitigation** — evaluates candidate actions (`ISOLATE`, `PATCH`, `UPGRADE`, `DO_NOTHING`).
4. **Tune the λ cost slider** (`0.0 – 2.0`) to re-rank mitigations by:
   $$\text{Score} = \text{Risk Reduction} - \lambda \times \text{Cost}$$
   Ranking updates live as you drag it.

---

## How It Works

The system is a pipeline of small, inspectable pieces — no single black-box score. Each step's output feeds the next, and every number stays traceable back to the simulation run that produced it.

### The Digital Twin (Dependency Graph)
A typed graph that's the structural source of truth: **Package**, **Service**, and **Application** nodes connected by typed edges (`depends_on`, `used_by`, `deployed_in`). It's read-only from the outside — a mitigation action never edits the live graph, it only produces a hypothetical modified copy for that simulation run.

### Seed / Mock Data
The graph is baked from a real-world incident rather than fully synthetic data: it mirrors the actual `event-stream` / `flatmap-stream` dependency compromise (`data/demo_graph.json`), so the topology and blast paths reflect something that really happened, not an invented worst case. No live registry calls, no runtime third-party API — the demo runs fully offline.

### Propagation Probability Model
Before any simulation runs, each edge gets a probability of "compromise spreads across this link." It's rule-based and inspectable rather than learned — e.g., a direct/runtime dependency propagates more readily than a transitive/dev one, and a service with no redundancy is more likely to be affected if reached.

### Monte Carlo Simulation Engine
Given a starting compromised package, the engine runs N stochastic trials (800 in the demo; configurable up to 1,000–10,000). Each trial samples propagation edge-by-edge until nothing new is infected, optionally applying a mitigation action mid-trial. Across all trials this produces a **distribution**, not a single number — median reach, 90th-percentile reach, and worst case.

### Impact & Mitigation Ranking
Blast-radius results are turned into a cost-weighted ranking of candidate actions (`PATCH`, `ISOLATE`, `UPGRADE`, `DO_NOTHING`). Each candidate is re-scored via `Risk Reduction − λ × Cost`, so moving the λ slider is really just re-ranking already-computed simulation outputs — nothing is recalculated from scratch, which keeps every ranking explainable.

---

## API Reference

- `GET /api/graph` — returns the typed digital twin graph and topology metrics.
- `GET /api/criticality` — returns structural centrality rankings, independent of CVE severity.
- `POST /api/simulate` — runs a Monte Carlo propagation simulation for a selected node.
  Body: `{"node_id": "event-stream@3.3.6", "trials": 800, "seed": 42}`
- `POST /api/mitigate` — evaluates single and combinatorial mitigation candidates with cost/risk trade-offs.
  Body: `{"node_id": "event-stream@3.3.6", "trials": 600, "lambda_value": 0.5}`

---

## Architecture & Tech Stack

- **Backend:** Python 3.12, FastAPI, NetworkX, NumPy
- **Frontend:** React 18, Vite, `react-force-graph-2d` (pure CSS/HTML5 canvas — no extraneous UI/animation libraries)
- **Offline dataset:** baked real-world seed data (`data/demo_graph.json`) mirroring the `event-stream` incident — no runtime third-party API or LLM calls
