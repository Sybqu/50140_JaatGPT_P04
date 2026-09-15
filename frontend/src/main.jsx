import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ForceGraph2D from 'react-force-graph-2d'
import './styles.css'

const API = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || ''
const format = (value, digits = 1) => Number(value || 0).toFixed(digits)

function MetricCard({ label, value, detail, tone = 'blue' }) {
  return <div className={`metric-card metric-card--${tone}`}><span className="metric-card__label">{label}</span><strong className="metric-card__value">{value}</strong><span className="metric-card__detail">{detail}</span></div>
}

function GraphPanel({ graph, loading }) {
  const paintNode = (node, context, scale) => {
    const typeColors = { package: '#79b8ff', service: '#65d79b', application: '#c98cff' }
    const color = node.compromised ? '#ff5d6c' : node.affected ? '#ffb454' : typeColors[node.type] || '#79b8ff'
    const radius = 5 + Math.min(14, Math.sqrt(node.risk || node.score || 0) * 4)
    context.beginPath(); context.arc(node.x, node.y, radius, 0, 2 * Math.PI); context.fillStyle = color; context.fill(); context.strokeStyle = '#eaf4ff'; context.lineWidth = 1 / scale; context.stroke()
    if (scale > .75) { context.font = `${11 / scale}px system-ui`; context.fillStyle = '#dce9f9'; context.textAlign = 'center'; context.fillText(node.name, node.x, node.y + radius + 14 / scale) }
  }
  return <section className="graph-panel panel"><div className="panel-heading"><div><span className="eyebrow">Typed digital twin</span><h2>Dependency blast path</h2></div><span className="topology-status">{graph.nodes.length} nodes mapped</span></div><div className="graph-stage">{loading ? <div className="graph-loading">Loading offline twin…</div> : <ForceGraph2D graphData={graph} nodeCanvasObject={paintNode} nodeLabel={node => `${node.name} · ${node.type} · affected ${(node.affected_probability * 100).toFixed(0)}%`} linkDirectionalArrowLength={4} linkColor={() => '#355374'} cooldownTicks={70} />}</div><p className="graph-caption">Red: compromised · amber: affected · blue: package · green: service · purple: application.</p></section>
}

function CriticalityPanel({ ranking }) {
  return <section className="panel criticality-panel"><span className="eyebrow">Independent of CVE severity</span><h2>Top critical nodes</h2>{ranking.slice(0, 5).map((item, index) => <div className="rank-row" key={item.id}><strong>#{index + 1}</strong><div><b>{item.name}</b><small>{item.type} · CVSS {format(item.severity * 10)}</small></div><span>{format(item.score, 2)}<small>b {format(item.breakdown.betweenness, 2)} · d {format(item.breakdown.dependents_normalized, 2)}</small></span></div>)}</section>
}

function ScenarioPanel({ scenario }) {
  if (!scenario) return <section className="panel empty-insight"><span className="eyebrow">Ready to model</span><h2>Run a compromise scenario</h2><p>Choose a package to sample edge-by-edge propagation through the typed offline twin.</p></section>
  const simulation = scenario.simulation
  return <><section className="panel scenario-panel"><span className="eyebrow">Monte Carlo outcome</span><h2>{scenario.advisory.id}</h2><p className="advisory-copy">{scenario.advisory.text}</p><div className="metric-grid"><MetricCard label="Median" value={format(simulation.median_affected, 0)} detail="affected nodes" tone="amber"/><MetricCard label="P90" value={format(simulation.p90_affected, 0)} detail="affected nodes" tone="amber"/><MetricCard label="Worst case" value={simulation.worst_case_affected} detail={`${simulation.trials} trials`} tone="red"/><MetricCard label="CVSS" value={`${format(scenario.advisory.cvss)}/10`} detail="baked advisory" tone="red"/></div></section><section className="panel explanation-panel"><span className="eyebrow">Traceable explanation</span><p>{scenario.explanation}</p></section></>
}

function MitigationPanel({ mitigation, lambda, setLambda }) {
  if (!mitigation) return null
  const candidates = [...mitigation.mitigation.candidates].map(item => ({ ...item, score: item.risk_reduction - lambda * item.cost })).sort((a, b) => b.score - a.score)
  const top = candidates[0]
  const sim = mitigation.mitigation.before
  const explanation = `${top.label} is ranked #1 at λ=${format(lambda, 2)} with net score ${format(top.score, 2)} (reduction ${format(top.risk_reduction, 2)} nodes, illustrative cost ${format(top.cost, 2)}). It shifts median affected from ${format(sim.median_affected, 0)} to ${format(top.after.median_affected, 0)}, with worst-case ${sim.worst_case_affected} to ${top.after.worst_case_affected}. Comparison derived from ${sim.trials} Monte Carlo trials.`
  return <section className="panel mitigation-panel"><span className="eyebrow">Cost / risk tradeoff</span><h2>Mitigation candidates</h2><label className="slider-label">λ cost weight: {format(lambda, 1)}<input type="range" min="0" max="2" step="0.1" value={lambda} onChange={event => setLambda(Number(event.target.value))}/></label><p className="reduction-summary">Score = expected node reduction − λ × illustrative cost. Slider reranks existing Monte Carlo results.</p><div className="panel explanation-panel" style={{ margin: '10px 0', padding: '10px 12px', background: 'rgba(16,31,52,0.85)' }}><span className="eyebrow" style={{ color: '#79b8ff' }}>Tradeoff explanation (λ={format(lambda, 2)})</span><p style={{ margin: '4px 0 0', fontSize: '0.86rem', lineHeight: '1.4' }}>{explanation}</p></div>{candidates.slice(0, 5).map((item, index) => <div className="reduction-row" key={item.label}><span><b>#{index + 1} {item.label}</b><small>median {format(item.after.median_affected, 0)} · worst {item.after.worst_case_affected} · cost {format(item.cost, 2)}</small></span><strong>{format(item.score, 2)}</strong></div>)}</section>
}

function App() {
  const [graph, setGraph] = useState({ nodes: [], links: [] }); const [ranking, setRanking] = useState([]); const [selected, setSelected] = useState('event-stream@3.3.6'); const [scenario, setScenario] = useState(null); const [mitigation, setMitigation] = useState(null); const [lambda, setLambda] = useState(.5); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [error, setError] = useState('')
  const candidates = useMemo(() => graph.nodes.filter(node => node.type === 'package'), [graph])
  useEffect(() => { Promise.all([fetch(`${API}/api/graph`).then(response => response.json()), fetch(`${API}/api/criticality`).then(response => response.json())]).then(([twin, criticality]) => { setGraph(twin); setRanking(criticality.ranking); }).catch(() => setError('Could not reach the FastAPI server on port 8000.')).finally(() => setLoading(false)) }, [])
  async function request(endpoint, body) { setWorking(true); setError(''); try { const response = await fetch(`${API}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(); return await response.json() } catch { setError('Analysis failed. Confirm the API is running and retry.'); return null } finally { setWorking(false) } }
  async function simulate() { const data = await request('/api/simulate', { node_id: selected, trials: 800 }); if (data) { setGraph({ nodes: data.nodes, links: data.links }); setScenario(data); setMitigation(null) } }
  async function findMitigation() { const data = await request('/api/mitigate', { node_id: selected, trials: 600, actions: [{ node_id: selected, action: 'PATCH' }], lambda_value: lambda }); if (data) setMitigation(data) }
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#top">RIPPLE<span>RISK</span></a><div className="topbar-status">Offline typed twin · no runtime network calls</div></header><main id="top" className="app-content"><section className="hero"><div><span className="eyebrow">Supply-chain intelligence</span><h1>See the <em>ripple</em> before it reaches production.</h1><p>Monte Carlo propagation over a typed Copay dependency twin with transparent structural and mitigation rankings.</p></div></section><section className="control-deck panel"><div className="control-deck__title"><span className="eyebrow">Compromise scenario</span><strong>Sample 800 propagation trials</strong></div><label className="select-field"><span>Compromised package</span><select value={selected} onChange={event => setSelected(event.target.value)} disabled={loading}>{candidates.map(node => <option value={node.id} key={node.id}>{node.name} · {node.version}</option>)}</select></label><button className="button button--primary" onClick={simulate} disabled={working || loading}> {working ? 'Sampling…' : 'Simulate compromise'} </button><button className="button button--secondary" onClick={findMitigation} disabled={working || !scenario}>Find mitigation</button></section>{error && <p className="panel error-panel">{error}</p>}<section className="dashboard-grid"><div className="primary-column"><div className="metric-strip"><MetricCard label="Twin nodes" value={graph.nodes.length || '—'} detail="packages, services, apps"/><MetricCard label="Highest reach" value={Math.max(0, ...graph.nodes.map(node => node.blast_radius || 0)) || '—'} detail="downstream nodes" tone="amber"/><MetricCard label="Graph state" value={scenario ? 'Active' : 'Baseline'} detail="Monte Carlo model" tone={scenario ? 'red' : 'blue'}/></div><GraphPanel graph={graph} loading={loading}/></div><aside className="insight-rail"><ScenarioPanel scenario={scenario}/><CriticalityPanel ranking={ranking}/><MitigationPanel mitigation={mitigation} lambda={lambda} setLambda={setLambda}/></aside></section></main><footer className="footer">Offline baked dataset · no LLM runtime path · every score is traceable</footer></div>
}

createRoot(document.getElementById('root')).render(<App />)
