# Supply Chain Ripple Risk Analyzer

An offline hackathon demo showing how the structural reach of a compromised open-source package can create risk beyond its CVSS score.

## Requirements

- Python 3.10+
- Node.js 20+

## Install

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd frontend
npm install
```

## Run locally

Terminal 1, from the project root:

```bash
source .venv/bin/activate
uvicorn main:app --reload
```

Terminal 2:

```bash
cd frontend
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:8000.

`npm run dev` automatically stages the frontend under `/tmp` because Vite cannot reliably serve a project whose parent directory contains `#`.

## Docker

```bash
docker compose up --build
```

Open http://localhost:5173.

## Push to GitHub

Create an empty repository on GitHub first, then run these commands from the project root. Replace the URL with your repository URL.

```bash
git init
git add .
git commit -m "Build supply chain ripple risk analyzer"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```
