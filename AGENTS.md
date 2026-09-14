# Agent instructions

This is a hackathon MVP. Speed and a working demo matter more than
elegance or edge-case handling.

## Rules
- Read spec.md before doing anything. Follow it exactly — do not add
  features not listed there, do not ask clarifying questions, make
  reasonable assumptions and keep moving.
- Backend: Python 3.10+, FastAPI, networkx, numpy only. No new deps
  without a strong reason.
- Frontend: React + react-force-graph-2d only. No extra UI libraries.
- Keep everything runnable with two commands: `uvicorn main:app --reload`
  and `npm run dev`. No Docker, no build pipeline, no env orchestration.
- Prefer one file per concern (graph.py, propagate.py, mitigate.py,
  explain.py, main.py) over one giant file.
- Every function needs a one-line docstring. No other documentation
  needed.
- When something in spec.md is ambiguous, pick the simplest option that
  still demos well, and add a `# ASSUMPTION:` comment explaining the
  choice.
- Do not build anything listed under "Explicitly OUT of scope" in
  spec.md, even if it seems easy to add.

  ## Environment
- Use a Python venv locally (.venv, gitignored) for your own dev/test loop.
- Pin exact versions in requirements.txt — must match what Docker installs.
- Never require OPENAI_API_KEY for core pipeline to run. Check for it,
  fall back to template explanation if missing.
- Do not call OSV/npm/PyPI live at app runtime. Fetch once, save to
  data/demo_graph.json, read from that file. Only a /refresh endpoint
  (optional, not core path) may call live APIs.
- Docker: backend Dockerfile (python:3.11-slim), frontend Dockerfile
  (node build → nginx serve), one docker-compose.yml wiring both.
  `docker compose up --build` is the single required run command.