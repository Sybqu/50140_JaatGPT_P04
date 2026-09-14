# Project: [name] — Supply Chain Ripple Risk Analyzer

## Problem statement
Open Source Supply Chains: The Ripple Effect — map dependency relationships,
simulate compromise propagation, identify critical deps, rank mitigations,
explain reasoning.

## Dataset
Real repo: [github.com/xxx/xxx] — pull its package.json/requirements.txt,
walk 2 levels deep.

## Simulated compromise
Package: [event-stream / ua-parser-js / xz-utils — pick one]
Real advisory text: [paste GHSA/CVE description here]

## Risk formula
risk = blast_radius(node) × severity(cve) × spread_probability(hop_distance)
- blast_radius = count of nodes reachable downstream (networkx descendants)
- severity = CVSS score from OSV.dev, normalized 0-1
- spread_probability = decay per hop (1.0 direct, 0.5 two hops, 0.25 three hops)

## Pipeline (exact order)
1. Parse manifest → build networkx DiGraph
2. Compute betweenness centrality + blast radius per node
3. Mark one node "compromised", run hop-decay propagation → per-node risk score
4. Mitigation: re-run propagation with that node "patched" (edge weight → 0),
   diff blast radius before/after
5. Call LLM once: feed risk scores + advisory text → 3-sentence explanation
6. Render graph, red = compromised, orange = affected, size = risk score

## Stack
Backend: Python, FastAPI, networkx, numpy
Frontend: React (vite), react-force-graph-2d
LLM: OpenAI API, single completion call, no streaming needed

## Explicitly OUT of scope (do not build)
- Real Monte Carlo (hop-decay approximation is enough)
- Multi-fix combo ranking (single-fix before/after only)
- Vector DB / embeddings / RAG (just paste advisory text directly into prompt)
- User-uploaded arbitrary repos (hardcoded dataset only)
- Auth, deployment, persistence/DB (in-memory only, single demo run)
## CVE matching (replaces "paste CVE text")
For each graph node: query OSV.dev API with {name, ecosystem, version}.
Parse affected version ranges, flag matches. No embeddings/vector store.
Bake results into data/demo_graph.json at dev time — app reads this file,
does not call OSV live during judging.

## Explanation layer
Template-based (see explain() function). No LLM call required for MVP.
LLM call is optional, gated behind OPENAI_API_KEY env var — falls back
to template if unset.

## Docker
docker compose up --build must run the full app with zero required
external network calls and zero required API keys.