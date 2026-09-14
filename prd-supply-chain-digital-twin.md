# PRD: Software Supply-Chain Risk Digital Twin

**Problem Track:** Open Source Supply Chains — The Ripple Effect (Industry, Innovation & Infrastructure)
**Doc status:** Draft v1
**Owner:** [team name]

---

## 1. Problem Statement

Modern software depends on deeply nested open-source packages. A compromise in a low-level, seemingly unimportant dependency can propagate through many downstream applications. Traditional scanners score packages in isolation (CVE severity, age, popularity) and miss **structural risk** — how central a package is to the ecosystem and what breaks if it fails.

We are building a system that:
1. Maps the dependency ecosystem as a graph.
2. Simulates how a compromise in any node could propagate through it, under uncertainty.
3. Quantifies blast radius and identifies structurally critical dependencies.
4. Ranks mitigation options by expected risk reduction vs. cost.
5. Makes every step of that reasoning visible and explorable — not a black box score.

## 2. Goals / Non-Goals

**Goals**
- Model a realistic (or real) dependency ecosystem as a typed graph.
- Simulate compromise propagation probabilistically (Monte Carlo), not deterministically.
- Produce interpretable outputs: blast radius distributions, critical-node rankings, mitigation rankings.
- Let a user query the system in natural language and get grounded, explainable answers.
- Ship a working, demoable MVP within the ideathon timebox.

**Non-Goals (for MVP)**
- Training a generalizing RL policy across thousands of synthetic ecosystems. (Explicitly descoped — see §9.)
- Real-time production monitoring / live agent deployment.
- Covering the entire npm/PyPI graph. A bounded, realistic subgraph is sufficient.
- Formal vulnerability discovery (we consume CVE data, we don't find new CVEs).

## 3. Why This Design (vs. the "RL + Monte Carlo + RAG" everything-bagel version)

An earlier direction proposed training a reinforcement-learning agent whose reward was evaluated via Monte Carlo rollouts, generalized across thousands of synthetic ecosystems. That's technically coherent but wrong for this brief and this timebox, for three reasons:

1. **The problem statement asks for analysis of *one* ecosystem** — relationships, propagation, impact, mitigation ranking, visible reasoning. It never asks for a policy that generalizes across ecosystems. Cross-graph generalization is the entire reason to reach for RL, and it isn't required here.
2. **The action space is small and discrete** (patch / isolate / upgrade / do-nothing, per node, plus small combinations). Once Monte Carlo gives you an expected-impact number per candidate action, ranking that small set is a **search problem**, not a learning problem. Greedy selection or shallow lookahead solves it directly and transparently.
3. **Trained RL is the highest-risk, highest-cost component for the least marginal value.** A half-trained policy invites the question "why RL?" with no good demo-time answer. A transparent expected-impact ranking answers "why this recommendation?" directly, which is what the brief explicitly asks for ("making the reasoning behind its risk assessment visible").

**Decision:** Monte Carlo simulation is the core intelligence engine. Mitigation ranking is done via transparent search over MC-evaluated actions, not a trained policy. This is faster to build, easier to trust, and maps directly onto every requirement in the problem statement. RL is kept as an optional, clearly-scoped stretch goal (§9), not a dependency for the core demo.

## 4. Top-Down Architecture

```
                              USER
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Conversational /   │
                    │   Dashboard Interface │
                    └──────────┬───────────┘
                               │
                     natural language query /
                        UI action (select node,
                        "simulate compromise")
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Query / Intent     │
                    │   Parser (LLM)       │
                    └──────────┬───────────┘
                               │
                 structured scenario request
                 e.g. COMPROMISE(package=X)
                               │
                               ▼
                 ┌───────────────────────────┐
                 │   DEPENDENCY GRAPH /       │
                 │   DIGITAL TWIN (source of  │
                 │   truth for structure)     │
                 └─────────────┬──────────────┘
                               │
              ┌────────────────┴─────────────────┐
              ▼                                   ▼
   ┌────────────────────┐              ┌────────────────────┐
   │  RAG / Evidence     │              │  Propagation        │
   │  Layer (CVE data,   │─feeds params→│  Probability Model  │
   │  advisories, docs)  │              │  (per-edge weights)  │
   └─────────────────────┘              └──────────┬──────────┘
                                                    │
                                                    ▼
                                    ┌──────────────────────────┐
                                    │  MONTE CARLO SIMULATION   │
                                    │  ENGINE (N runs, sampling  │
                                    │  propagation + mitigation) │
                                    └──────────────┬─────────────┘
                                                   │
                                     distribution of outcomes
                                     per node / per action
                                                   │
                                                   ▼
                                    ┌──────────────────────────┐
                                    │  IMPACT & CRITICALITY     │
                                    │  ANALYSIS (blast radius,   │
                                    │  centrality, percentiles)  │
                                    └──────────────┬─────────────┘
                                                   │
                                                   ▼
                                    ┌──────────────────────────┐
                                    │  MITIGATION RANKER        │
                                    │  (search over candidate    │
                                    │  actions, cost-weighted)   │
                                    └──────────────┬─────────────┘
                                                   │
                                                   ▼
                                    ┌──────────────────────────┐
                                    │  LLM EXPLANATION LAYER    │
                                    │  (turns numbers into       │
                                    │  grounded narrative)       │
                                    └──────────────┬─────────────┘
                                                   │
                                                   ▼
                                                  USER
```

## 5. Component Breakdown — What Each Piece Does and Why

### 5.1 Dependency Graph / Digital Twin
The structural source of truth. Everything downstream reads from it; nothing downstream mutates it directly (mitigation actions produce *hypothetical* modified copies for simulation, not edits to the live twin).

**Node types:** Package, Service, Application, (optionally Organization/Team).
**Edge types:** `depends_on`, `used_by`, `deployed_in`, `maintained_by`.
**Node attributes:** version, is direct vs. transitive dependency, dependents count, last-updated date, maintainer activity score, known CVEs, criticality tier (for Service/App nodes), redundancy flag, environment (prod/staging).
**Edge attributes:** dependency type (runtime/dev/optional/peer), directness.

**Data sources for MVP:** a bounded, realistic subgraph (50–500 packages, 10–20 services, 5–10 applications), seeded from real open-source dependency data (e.g., package manifests / public dependency graph APIs) where feasible, synthetically completed where not. Do not attempt full-ecosystem scale.

### 5.2 RAG / Evidence Layer
Retrieves supporting evidence to ground both the propagation model and the explanation layer — it does not calculate risk itself.

**Sources:** CVE descriptions, GitHub security advisories, package documentation, org-specific policy docs (if simulated).
**Output:** structured evidence snippets attached to a node/edge (e.g., "CVE-2024-XXXX affects the authentication module of package X") that (a) can adjust simulation parameters (e.g., a CVE affecting an auth module raises propagation probability along edges that use that module) and (b) get cited in the final explanation.

### 5.3 Propagation Probability Model
Converts graph + evidence into per-edge propagation probabilities. This is the model that Monte Carlo samples from.

For MVP, this is a **rule-based/heuristic scoring function**, not a trained model — transparency matters more than sophistication here, and it's directly inspectable/tunable during the demo.

Illustrative factors (not exhaustive, weights are tunable):
- Direct dependency → higher propagation probability than transitive.
- Runtime dependency → higher than dev/optional dependency.
- No redundancy / no isolation at the downstream node → higher probability impact realizes.
- Node has an associated CVE relevant to the compromised functionality (from RAG) → probability boost.
- High maintainer activity / recent patch → probability reduction (faster real-world remediation).

Output: for every edge, `P(propagate | upstream compromised)`, plus a `severity_if_realized` estimate per node (how bad it is if that node is actually affected — this feeds impact scoring, not just reachability).

### 5.4 Monte Carlo Simulation Engine
The core uncertainty engine. Given a starting compromised node (and, later, a candidate mitigation action), it runs N stochastic trials and returns a distribution of outcomes.

**Per-trial process:**
1. Mark the seed node compromised.
2. For each outgoing edge from a compromised node, sample propagation using that edge's probability.
3. Repeat propagation across the graph (breadth-first, until no new nodes are compromised in a pass).
4. If a mitigation action is active in this trial, apply its effect (e.g., `ISOLATE(service)` removes its outgoing edges before propagation reaches it; `PATCH(package)` zeroes propagation probability from that node onward).
5. Record the set of affected nodes and a computed impact score (see §5.5).

**Run at N = 1,000–10,000 trials** depending on graph size and latency budget. Output per scenario:
- Probability of each node being affected.
- Expected number of affected services/applications.
- Percentile impact (median, 95th percentile "worst case").

### 5.5 Impact & Criticality Analysis
Turns raw simulation output into risk numbers people can act on.

- **Blast radius:** count/list of affected nodes, split by type (services vs. applications) and by likelihood band (direct/likely/worst-case).
- **Impact score per scenario:** weighted function of affected-node criticality tiers, e.g. `impact = Σ (criticality_weight(node) × P(node affected))`.
- **Structural criticality ranking (independent of any single scenario):** run compromise simulations seeded at *every* node (or a sampled subset for large graphs) and rank packages by average/worst-case downstream impact. This directly answers "which components are structurally important" — the brief's core ask — regardless of that package's own CVE score.

### 5.6 Mitigation Ranker
Given a compromised/vulnerable node, evaluates a small set of candidate actions by re-running Monte Carlo with each action applied, and ranks them.

**Candidate actions (MVP action space):**
- `PATCH(node)`
- `ISOLATE(node)`
- `UPGRADE(node)`
- `DO_NOTHING` (baseline)
- A small number of 2-action combinations for the top individually-ranked actions (e.g., best patch + best isolate), if compute budget allows.

**Ranking method:** for each candidate action, compute `expected_impact_after` via Monte Carlo, then rank by:

```
score(action) = impact_reduction(action) − λ × mitigation_cost(action)
```

where `impact_reduction = expected_impact(no action) − expected_impact(with action)`, `mitigation_cost` is a configurable estimate (engineering effort, downtime, operational disruption), and `λ` is an adjustable tradeoff weight exposed in the UI (lets a user say "I care more about minimizing cost" vs. "I care more about minimizing risk").

This is deliberately a **transparent, re-computable ranking**, not a trained policy — every number in the ranked list is traceable back to specific simulation runs, which satisfies the brief's "make the reasoning visible" requirement directly.

### 5.7 LLM Interface / Explanation Layer
Two jobs, both bounded and neither touching the math:

1. **Intent parsing (in):** turn a natural-language question ("what happens if lodash gets compromised?") into a structured scenario request the simulation engine understands.
2. **Explanation (out):** turn structured simulation/ranking output into grounded natural-language narrative, citing the specific numbers produced upstream (not invented ones) and evidence pulled from RAG.

The LLM never computes risk, never invents propagation probabilities, and never decides mitigation ranking — it only translates in and narrates out. This boundary is a deliberate design choice to keep the system's core claims falsifiable and demo-defensible.

## 6. Primary User Flows

**Flow A — Explore structural criticality**
1. User opens dashboard, sees full dependency graph.
2. System (precomputed or on-demand) highlights top N structurally critical packages, ranked by average simulated blast radius.
3. User clicks a package → sees its dependents, criticality rank, and why (evidence + graph position).

**Flow B — Simulate a compromise**
1. User selects a package (or asks in chat: "What happens if package X is compromised?").
2. System runs Monte Carlo propagation (N trials), shows progress, then renders:
   - Direct / likely / worst-case affected counts.
   - Highlighted propagation paths on the graph.
   - Impact score.
3. LLM layer narrates the result in plain language, citing relevant CVE/advisory evidence.

**Flow C — Get mitigation recommendation**
1. From a simulated scenario, user clicks "Find mitigation."
2. System evaluates candidate actions (and combos) via Monte Carlo re-runs.
3. Ranked list displayed with expected impact reduction, cost, and net score; top recommendation highlighted.
4. User can drag the cost-vs-risk weighting slider (λ) and see the ranking update live — this is a strong, cheap demo beat.

**Flow D — Ask a follow-up question**
1. User asks "why is isolating Service A better than patching X alone?"
2. LLM pulls the relevant simulation run outputs and evidence, explains the delta — no new computation invented, just narration of existing numbers.

## 7. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | System represents dependency ecosystem as a typed graph (Package/Service/Application/Org nodes; typed edges). | Must |
| F2 | System can ingest a seed dataset (real and/or synthetic) of 50–500+ packages. | Must |
| F3 | System computes per-edge propagation probability from node/edge attributes + evidence. | Must |
| F4 | System runs Monte Carlo simulation (configurable N) for a given seed compromise and returns affected-node distribution. | Must |
| F5 | System computes blast-radius bands (direct/likely/worst-case) and an impact score per scenario. | Must |
| F6 | System ranks all packages by structural criticality independent of a specific CVE. | Must |
| F7 | System evaluates a defined set of mitigation actions per scenario via re-simulation and ranks them by expected impact reduction vs. cost. | Must |
| F8 | User can adjust the cost/risk tradeoff weight and see rankings update. | Should |
| F9 | LLM parses natural-language questions into structured scenario requests. | Should |
| F10 | LLM generates grounded explanations citing simulation output and RAG evidence. | Should |
| F11 | RAG layer retrieves CVE/advisory evidence for a given package and attaches it to nodes. | Should |
| F12 | Dashboard visualizes the graph with highlighting for propagation paths and criticality. | Must |
| F13 | All risk/ranking numbers are traceable to the specific simulation run that produced them (no unexplained black-box scores). | Must |

## 8. Non-Functional Requirements

- **Explainability over sophistication.** Every score must be traceable to a rule or a simulation output. This is a judged requirement of the brief, not just a nice-to-have.
- **Latency:** a single scenario simulation (1,000–10,000 trials on a bounded graph) should complete in a few seconds to keep the demo interactive; show a progress indicator for anything slower.
- **Reproducibility:** fixed random seed option so a demo run can be repeated identically.
- **Scalability boundary:** the system should degrade gracefully (sampling fewer trials, or sampling a subset of seed nodes for criticality ranking) rather than fail on larger graphs.
- **Modularity:** the propagation model, Monte Carlo engine, and mitigation ranker should be swappable/tunable independently — this is what keeps the "why not RL / why not integer programming" question easy to answer (the architecture doesn't foreclose it).

## 9. Explicitly Descoped / Stretch: Reinforcement Learning

RL is **not required** for the core system and is not on the critical path. If time allows after the core is solid, a scoped-down stretch version can be added:

- **Framing:** a single-step contextual bandit, not a multi-step trained policy — given the current scenario's feature vector (graph position, criticality, cost estimates), predict/refine the action ranking, trained on the outputs the Monte Carlo + search system already produces.
- **What it must NOT be for this project:** a policy trained across thousands of synthetic ecosystems for cross-graph generalization. That's a real research question but not one this problem statement asks for, and attempting it risks leaving the core system unfinished.
- **Fallback answer if a judge asks "where's the RL?":** "We evaluated it and scoped it out — the action space here is small enough that transparent search over Monte-Carlo-evaluated outcomes gives the same recommendation quality with full explainability, which the brief explicitly asks for. RL would add value if we needed a policy that generalizes across many ecosystems, which isn't this problem."

## 10. Data Model (Simplified)

```
Package {
  id, name, version, is_direct, dependents_count,
  last_updated, maintainer_activity_score,
  known_cves: [CVE], criticality_tier
}

Service {
  id, name, criticality_tier, redundancy: bool,
  environment, deployed_packages: [Package]
}

Application {
  id, name, criticality_tier, services: [Service]
}

Edge {
  source_id, target_id, type: depends_on|used_by|deployed_in|maintained_by,
  dependency_type: runtime|dev|optional|peer,
  propagation_probability: float   // computed, not stored raw
}

SimulationRun {
  id, seed_node_id, action_applied, n_trials,
  affected_node_probabilities: {node_id: float},
  impact_score, blast_radius_bands, timestamp
}

MitigationCandidate {
  action_type, target_node_id, expected_impact_after,
  impact_reduction, cost_estimate, net_score
}
```

## 11. MVP Scope for the Ideathon

**In scope:**
- Bounded dependency graph (50–500 packages) with real or realistic synthetic data.
- Rule-based propagation probability model.
- Monte Carlo simulation engine with configurable N.
- Blast-radius and structural-criticality analysis.
- Mitigation ranker with cost/risk tradeoff slider.
- Dashboard: graph visualization, scenario runner, ranked mitigation panel.
- LLM chat layer for natural-language query and explanation (can be thinner than described if time-constrained — even a templated narrative generator is an acceptable fallback).

**Out of scope for MVP (mention as future work):**
- Trained RL policy / cross-ecosystem generalization.
- Live/real-time ecosystem monitoring.
- Full-registry scale (npm/PyPI in entirety).
- Multi-tenant / auth / production deployment concerns.

## 12. Demo Script (for judging)

1. Show the graph, 2,000+ node scale claim optional — better to show a real, inspectable graph than an inflated one.
2. Highlight top structurally-critical packages — make the point that this differs from raw CVE severity ranking.
3. Select one, click "Simulate compromise" — show the Monte Carlo progress and resulting blast-radius bands live.
4. Click "Find mitigation" — show ranked actions with expected impact reduction and cost.
5. Move the cost/risk slider — ranking updates live (cheap, convincing interactivity).
6. Ask the chat layer a natural-language follow-up ("why is this better than just patching?") and show a grounded, cited answer.
7. Close with the criticality-vs-CVE-score contrast as the core value proposition, tied directly back to the brief's framing: *"the real risk of a dependency may be much greater than its own vulnerability score suggests."*

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Propagation probability model looks arbitrary/unjustified | Keep it rule-based and inspectable; show the weighting factors explicitly in UI; cite real CVE evidence where possible via RAG. |
| Monte Carlo run too slow for live demo | Cap N adaptively by graph size; precompute the headline demo scenario; show progress bar to make wait feel intentional. |
| LLM layer hallucinates numbers | Hard boundary: LLM only narrates structured outputs it's given, never generates numbers itself; validate outputs against source data before display if time allows. |
| Judges ask "why not RL" | Have the §9 answer ready — this PRD's whole point is that this is a considered decision, not an omission. |
| Graph data too synthetic to be credible | Seed with at least a real open-source manifest subset (e.g., a real popular package's actual dependency tree) even if the rest is synthetic. |

## 14. Open Questions

- Which real dependency data source is feasible to pull in the timebox (package registry APIs, existing SBOM datasets)?
- How much of the cost-estimate model for mitigation actions should be user-configurable vs. fixed defaults?
- Is a full chat interface needed for the demo, or does a structured "ask a preset question" UI cover it with less build risk?
