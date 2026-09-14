import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import ForceGraph2D from 'react-force-graph-2d'
import './styles.css'

const API = import.meta.env.VITE_API_URL || ''

const enter = {
  hidden: { opacity: 0, y: 14 },
  visible: index => ({ opacity: 1, y: 0, transition: { duration: 0.36, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] } }),
}

function format(value, digits = 2) {
  return Number(value || 0).toFixed(digits)
}

function StatusDot({ tone = 'blue' }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />
}

function MetricCard({ label, value, detail, tone = 'blue' }) {
  return <div className={`metric-card metric-card--${tone}`}>
    <span className="metric-card__label">{label}</span>
    <strong className="metric-card__value">{value}</strong>
    <span className="metric-card__detail">{detail}</span>
  </div>
}

function GraphPanel({ graph, graphLoading, onNodeClick }) {
  const paintNode = (node, context, globalScale) => {
    const radius = 5 + Math.min(18, Math.sqrt(node.risk || 0) * 4)
    const color = node.compromised ? '#ff5d6c' : node.affected ? '#ffb454' : '#79b8ff'
    context.beginPath()
    context.arc(node.x, node.y, radius, 0, 2 * Math.PI)
    context.fillStyle = color
    context.shadowColor = color
    context.shadowBlur = node.compromised ? 18 : node.affected ? 10 : 4
    context.fill()
    context.shadowBlur = 0
    context.strokeStyle = '#eaf4ff'
    context.lineWidth = 1.25 / globalScale
    context.stroke()
    if (globalScale > 0.72) {
      context.font = `${11 / globalScale}px ui-sans-serif, system-ui, sans-serif`
      context.fillStyle = '#dce9f9'
      context.textAlign = 'center'
      context.fillText(node.name, node.x, node.y + radius + 14 / globalScale)
    }
  }

  return <section className="graph-panel panel" aria-label="Dependency impact graph">
    <div className="panel-heading">
      <div><span className="eyebrow">Live topology</span><h2>Dependency blast path</h2></div>
      <span className="topology-status"><StatusDot tone={graphLoading ? 'amber' : 'green'} />{graphLoading ? 'Refreshing graph' : `${graph.nodes.length} packages mapped`}</span>
    </div>
    <div className="graph-stage">
      <div className="graph-grid" aria-hidden="true" />
      <div className="graph-legend" aria-label="Graph legend"><span><i className="legend-dot legend-dot--red" />Compromised</span><span><i className="legend-dot legend-dot--amber" />Affected</span><span><i className="legend-dot legend-dot--blue" />Unaffected</span></div>
      {graphLoading ? <div className="graph-loading" role="status"><span className="pulse-ring" /><span>Mapping dependency topology…</span></div> : <ForceGraph2D graphData={graph} nodeCanvasObject={paintNode} onNodeClick={onNodeClick} nodeLabel={node => `<strong>${node.name}@${node.version}</strong><br/>Risk: ${format(node.risk)}<br/>Blast radius: ${node.blast_radius}<br/>Betweenness: ${format(node.betweenness, 3)}`} linkColor={link => link.source?.compromised ? '#ff7582' : link.source?.affected ? '#d89d55' : '#355374'} linkWidth={link => link.source?.compromised ? 2.4 : 1.1} linkDirectionalArrowLength={4} linkDirectionalArrowRelPos={1} cooldownTicks={90} />}
    </div>
    <p className="graph-caption">Nodes grow with computed risk. Click a node to inspect its structural role; colors always include text labels and tooltips.</p>
  </section>
}

function InsightRail({ scenario, mitigation, error }) {
  return <aside className="insight-rail" aria-label="Scenario analysis">
    <AnimatePresence mode="wait">
      {error ? <motion.section key="error" className="panel error-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><span className="eyebrow">Connection issue</span><h2>Analysis unavailable</h2><p>{error}</p></motion.section> : scenario ? <motion.div key="scenario" className="insight-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <section className="panel scenario-panel"><div className="panel-heading"><div><span className="eyebrow">Compromise scenario</span><h2>{scenario.advisory.id}</h2></div><span className="risk-chip"><StatusDot tone="red" />Active</span></div><p className="advisory-copy">{scenario.advisory.text}</p><div className="metric-grid"><MetricCard label="Downstream reach" value={scenario.simulation.affected.length - 1} detail="packages exposed" tone="amber" /><MetricCard label="CVSS severity" value={`${format(scenario.advisory.cvss, 1)}/10`} detail="baked advisory" tone="red" /></div></section>
        <section className="panel explanation-panel"><span className="eyebrow">Why it matters</span><p>{scenario.explanation}</p><div className="formula"><span>Traceable formula</span><code>risk = blast radius × severity × hop decay</code></div></section>
        {mitigation && <MitigationPanel mitigation={mitigation} />}
      </motion.div> : <motion.section key="empty" className="panel empty-insight" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: 'easeOut' }}><div className="empty-insight__icon" aria-hidden="true">↗</div><span className="eyebrow">Ready to model</span><h2>Start a compromise scenario</h2><p>Choose the baked vulnerable package, run the simulation, then compare the single-fix mitigation against its current blast radius.</p><ol><li>Simulate the advisory</li><li>Inspect the propagation path</li><li>Patch and compare the reduction</li></ol></motion.section>}
    </AnimatePresence>
  </aside>
}

function MitigationPanel({ mitigation }) {
  return <section className="panel mitigation-panel"><div className="panel-heading"><div><span className="eyebrow">Single-fix recommendation</span><h2>Patch impact</h2></div><span className="success-chip"><StatusDot tone="green" />Path contained</span></div><div className="blast-comparison"><div><span>Before</span><strong>{mitigation.mitigation.before_blast_radius}</strong><small>reachable packages</small></div><span className="comparison-arrow" aria-hidden="true">→</span><div><span>After</span><strong>{mitigation.mitigation.after_blast_radius}</strong><small>reachable packages</small></div></div><p className="reduction-summary">{mitigation.mitigation.affected_set_delta.length} packages are removed from the simulated path.</p><div className="reduction-list"><span className="eyebrow">Largest risk reductions</span>{mitigation.mitigation.top_reductions.map(item => <div className="reduction-row" key={item.id}><span>{item.id.split('@')[0]}</span><strong>−{format(item.risk_reduction)}</strong></div>)}</div></section>
}

function App() {
  const shouldReduceMotion = useReducedMotion()
  const [graph, setGraph] = useState({ nodes: [], links: [] })
  const [selected, setSelected] = useState('event-stream@3.3.6')
  const [scenario, setScenario] = useState(null)
  const [mitigation, setMitigation] = useState(null)
  const [graphLoading, setGraphLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const candidates = useMemo(() => graph.nodes.filter(node => node.name === 'event-stream' || node.severity > 0), [graph])
  const current = graph.nodes.find(node => node.id === selected)

  useEffect(() => {
    async function loadGraph() {
      try {
        const response = await fetch(`${API}/api/graph`)
        if (!response.ok) throw new Error('The API did not return the baked graph.')
        setGraph(await response.json())
      } catch (requestError) {
        setError('Could not reach the analyzer API. Start the FastAPI server on port 8000 and refresh this page.')
      } finally {
        setGraphLoading(false)
      }
    }
    loadGraph()
  }, [])

  async function runScenario(endpoint) {
    setActionLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ node_id: selected }) })
      if (!response.ok) throw new Error('The analysis request failed.')
      return await response.json()
    } catch (requestError) {
      setError('Analysis could not complete. Confirm the FastAPI server is running, then try again.')
      return null
    } finally {
      setActionLoading(false)
    }
  }

  async function simulate() {
    const data = await runScenario('/api/simulate')
    if (!data) return
    setGraph({ nodes: data.nodes, links: data.links })
    setScenario(data)
    setMitigation(null)
  }

  async function findMitigation() {
    const data = await runScenario('/api/mitigate')
    if (data) setMitigation(data)
  }

  function inspectNode(node) {
    if (node.name === 'event-stream' || node.severity > 0) setSelected(node.id)
  }

  return <MotionConfig reducedMotion="user"><div className="app-shell">
    <div className="ambient ambient--one" aria-hidden="true" /><div className="ambient ambient--two" aria-hidden="true" />
    <motion.header className="topbar" custom={0} variants={enter} initial="hidden" animate="visible"><a className="brand" href="#top" aria-label="Ripple Risk home"><span className="brand-mark">R</span><span>RIPPLE<span>RISK</span></span></a><div className="topbar-status"><StatusDot tone="green" /><span>Offline baked dataset</span><span className="topbar-divider" /><span>Copay dependency map</span></div></motion.header>
    <main id="top" className="app-content">
      <motion.section className="hero" custom={1} variants={enter} initial="hidden" animate="visible"><div><span className="eyebrow">Supply chain intelligence</span><h1>See the <em>ripple</em> before it reaches production.</h1><p>Model how a single compromised dependency propagates through a real package topology—and identify the one fix that cuts its structural reach.</p></div><div className="hero-stat"><span>Selected exposure</span><strong>{current ? current.name : 'event-stream'}</strong><small>{current ? `Blast radius: ${current.blast_radius} packages` : 'Loading topology…'}</small></div></motion.section>
      <motion.section className="control-deck panel" custom={2} variants={enter} initial="hidden" animate="visible" aria-label="Scenario controls"><div className="control-deck__title"><span className="eyebrow">1 · Choose exposure</span><strong>Run a contained what-if analysis</strong></div><label className="select-field"><span>Compromised package</span><select value={selected} onChange={event => setSelected(event.target.value)} disabled={graphLoading}>{candidates.map(node => <option key={node.id} value={node.id}>{node.name} · {node.version} · CVSS {format(node.severity * 10, 1)}</option>)}</select></label><motion.button className="button button--primary" onClick={simulate} disabled={actionLoading || graphLoading || !selected} whileHover={shouldReduceMotion ? {} : { y: -2 }} whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}><span>{actionLoading ? 'Analyzing path…' : 'Simulate compromise'}</span><span aria-hidden="true">→</span></motion.button><motion.button className="button button--secondary" onClick={findMitigation} disabled={actionLoading || !scenario} whileHover={shouldReduceMotion ? {} : { y: -2 }} whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}><span>{actionLoading ? 'Comparing…' : 'Find mitigation'}</span><span aria-hidden="true">↗</span></motion.button><p className="control-help" aria-live="polite">{actionLoading ? 'Calculating traceable risk factors…' : scenario ? 'Simulation complete. Compare the patch result when ready.' : 'The formula and propagation factors remain inspectable at every step.'}</p></motion.section>
      <motion.section className="dashboard-grid" custom={3} variants={enter} initial="hidden" animate="visible"><div className="primary-column"><div className="metric-strip"><MetricCard label="Structural hotspots" value={graph.nodes.filter(node => node.blast_radius >= 2).length || '—'} detail="nodes with radius ≥ 2" /><MetricCard label="Highest reach" value={Math.max(0, ...graph.nodes.map(node => node.blast_radius)) || '—'} detail="downstream packages" tone="amber" /><MetricCard label="Graph state" value={scenario ? 'Active' : 'Baseline'} detail={scenario ? 'scenario in view' : 'no compromise selected'} tone={scenario ? 'red' : 'blue'} /></div><GraphPanel graph={graph} graphLoading={graphLoading} onNodeClick={inspectNode} /></div><InsightRail scenario={scenario} mitigation={mitigation} error={error} /></motion.section>
    </main>
    <footer className="footer"><span>Risk is structural reach × advisory severity × hop decay.</span><span>Offline demo · No runtime network calls</span></footer>
  </div></MotionConfig>
}

createRoot(document.getElementById('root')).render(<App />)
