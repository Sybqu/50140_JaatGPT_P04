# Supply Chain Ripple Risk Analyzer

An offline supply-chain security digital twin demonstrating how structural reach and propagation dynamics create risk beyond static CVSS scores. Uses Monte Carlo simulations over a typed dependency graph (based on the real-world Copay/`event-stream` incident) to evaluate propagation blast radius and cost-weighted mitigation trade-offs.

---

## Quick Start (Recommended)

The app is fully containerized. Docker is the only prerequisite.

```bash
docker compose up --build
```

- **Frontend UI:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:8000](http://localhost:8000) (Interactive docs at [http://localhost:8000/docs](http://localhost:8000/docs))

To stop the containers:
```bash
docker compose down
```

---

## Interactive Demo Walkthrough

1. **Select a Package:**
   - In the top control bar, select a package (e.g., `event-stream · 3.3.6`).
2. **Simulate Compromise:**
   - Click **Simulate compromise** to run 800 Monte Carlo propagation trials.
   - The force-directed graph highlights infected packages and downstream production services/applications (`Copay wallet service`, `Copay mobile app`), displaying median, p90, and worst-case reach.
3. **Find Mitigations:**
   - Click **Find mitigation** to evaluate combinatorial actions (`ISOLATE`, `PATCH`, `UPGRADE`, `DO_NOTHING`).
4. **Tune the $\lambda$ Cost Slider:**
   - Adjust the **$\lambda$ cost weight slider** ($0.0 \le \lambda \le 2.0$) to re-rank mitigation actions according to net benefit:
     $$\text{Score} = \text{Risk Reduction} - \lambda \times \text{Cost}$$
   - Observe real-time candidate re-ranking and live trade-off explanations.

---

## Running Locally (Without Docker)

### Prerequisites
- Python 3.10+
- Node.js 20+

### 1. Backend Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` calls directly to `http://localhost:8000`.

---

## API Reference

- `GET /api/graph`: Returns the typed digital twin graph and topology metrics.
- `GET /api/criticality`: Returns structural centrality rankings independent of CVE severity.
- `POST /api/simulate`: Runs a Monte Carlo propagation simulation for a selected node.
  - Body: `{"node_id": "event-stream@3.3.6", "trials": 800, "seed": 42}`
- `POST /api/mitigate`: Evaluates single and combinatorial mitigation candidates with cost/risk trade-offs.
  - Body: `{"node_id": "event-stream@3.3.6", "trials": 600, "lambda_value": 0.5}`

---

## Architecture & Tech Stack

- **Backend:** Python 3.12, FastAPI, NetworkX, NumPy.
- **Frontend:** React 18, Vite, `react-force-graph-2d` (pure CSS/HTML5 canvas, zero extraneous UI or animation libraries).
- **Offline Dataset:** Baked real-world seed data (`data/demo_graph.json`) mirroring the `event-stream` / `flatmap-stream` incident — no runtime third-party API or LLM calls.
