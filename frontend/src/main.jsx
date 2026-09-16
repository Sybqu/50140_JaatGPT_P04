import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ForceGraph2D from 'react-force-graph-2d'
import './styles.css'

const API = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || ''

// Helper to format numbers with precision
const fmt = (num, decimals = 1) => Number(num || 0).toFixed(decimals)

// Custom hook to measure container size for ForceGraph2D
function useContainerDimensions(ref) {
  const [dimensions, setDimensions] = useState({ width: 700, height: 500 })
  useEffect(() => {
    if (!ref.current) return
    const measure = () => {
      if (ref.current) {
        const { clientWidth, clientHeight } = ref.current
        if (clientWidth > 50 && clientHeight > 50) {
          setDimensions({ width: clientWidth, height: clientHeight })
        }
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(ref.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref])
  return dimensions
}

export default function App() {
  // Navigation & Workspace State
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('tab') || 'blast'
    } catch {
      return 'blast'
    }
  }) // 'blast' | 'choke'
  const [showHowItWorks, setShowHowItWorks] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('modal')
      return p === 'how' || p === 'walkthrough'
    } catch {
      return false
    }
  })
  const [walkthroughStep, setWalkthroughStep] = useState(() => {
    try {
      const s = parseInt(new URLSearchParams(window.location.search).get('step') || '1', 10)
      return isNaN(s) ? 1 : Math.max(1, Math.min(4, s))
    } catch {
      return 1
    }
  })

  // Domain Data State
  const [graph, setGraph] = useState({ nodes: [], links: [] })
  const [criticality, setCriticality] = useState([])
  const [selectedNode, setSelectedNode] = useState('event-stream@3.3.6')
  const [focusedNode, setFocusedNode] = useState(null)
  const [scenario, setScenario] = useState(null)
  const [mitigation, setMitigation] = useState(null)
  const [lambda, setLambda] = useState(0.5)

  // Execution & Telemetry State
  const [trials, setTrials] = useState(800)
  const [simProgress, setSimProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [eventLog, setEventLog] = useState([
    { time: '18:30:00.012', msg: 'INIT: Connecting to offline supply-chain twin', type: 'info' }
  ])
  const [showFormula, setShowFormula] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('modal') === 'formula'
    } catch {
      return false
    }
  })

  // Helper to generate ASCII progress bar matching htop aesthetic
  const makeAsciiBar = (fraction, length = 10) => {
    const clamped = Math.max(0, Math.min(1, fraction || 0))
    const filled = Math.round(clamped * length)
    const empty = length - filled
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`
  }

  const stageRef = useRef(null)
  const fgRef = useRef(null)
  const { width: stageWidth, height: stageHeight } = useContainerDimensions(stageRef)

  // Append a message to the live event log
  const logEvent = (msg, type = 'info') => {
    const d = new Date()
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
    setEventLog(prev => [{ time, msg, type }, ...prev.slice(0, 40)])
  }

  // Initial Boot: Load twin graph & criticality
  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/graph`).then(r => r.json()),
      fetch(`${API}/api/criticality`).then(r => r.json())
    ]).then(([twin, crit]) => {
      setGraph(twin)
      setCriticality(crit.ranking || [])
      logEvent(`LOAD_TWIN: ${twin.nodes.length} nodes, ${twin.links.length} edges mapped`, 'info')
      logEvent('SYSTEM: Digital twin ready. Zero external runtime dependencies.', 'info')
      const p = new URLSearchParams(window.location.search)
      if (p.get('focus')) {
        const target = twin.nodes.find(n => n.id === p.get('focus'))
        if (target) setFocusedNode(target)
      }
      if (p.get('simulate') === 'true') {
        fetch(`${API}/api/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            node_id: 'event-stream@3.3.6',
            trials: 800
          })
        }).then(r => r.json()).then(data => {
          setGraph({ nodes: data.nodes, links: data.links })
          setScenario(data)
          logEvent(`SIMULATE_COMPLETE: Median affected = ${data.simulation.median_affected}`, 'infected')
        }).catch(() => {})
      }
      if (p.get('mitigate') === 'true') {
        fetch(`${API}/api/mitigate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            node_id: 'event-stream@3.3.6',
            trials: 600,
            actions: [{ node_id: 'event-stream@3.3.6', action: 'PATCH' }],
            lambda_value: 0.5
          })
        }).then(r => r.json()).then(data => {
          setMitigation(data)
        }).catch(() => {})
      }
    }).catch(err => {
      setError('Failed to reach the API server on port 8000.')
      logEvent('ERROR: Connection failed to backend service', 'compromised')
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  // Auto-fit graph when loaded or when switching tabs
  useEffect(() => {
    if (fgRef.current && graph.nodes.length > 0) {
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 30)
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [graph, activeTab])

  // Run Compromise Simulation
  async function runSimulation() {
    setWorking(true)
    setError('')
    setSimProgress(Math.floor(trials * 0.18))
    const pTimer = setInterval(() => {
      setSimProgress(prev => {
        if (prev === null) return Math.floor(trials * 0.25)
        const next = prev + Math.floor(trials * 0.22)
        return next < trials ? next : trials - 20
      })
    }, 100)
    logEvent(`SIMULATE: Starting compromise of ${selectedNode} (${trials} trials)...`, 'compromised')
    try {
      const resp = await fetch(`${API}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: selectedNode, trials: Number(trials) })
      })
      if (!resp.ok) throw new Error('Simulation failed')
      const data = await resp.json()
      clearInterval(pTimer)
      setSimProgress(trials)
      setTimeout(() => setSimProgress(null), 1200)
      setGraph({ nodes: data.nodes, links: data.links })
      setScenario(data)
      setMitigation(null)
      logEvent(`SIMULATE_COMPLETE: Median affected = ${data.simulation.median_affected}, P90 = ${data.simulation.p90_affected}, Worst = ${data.simulation.worst_case_affected}`, 'infected')
      if (data.simulation.trial_samples && data.simulation.trial_samples.length > 0) {
        const s = data.simulation.trial_samples[0]
        s.traversed_edges.forEach(e => {
          logEvent(`EDGE_TRAVERSAL: ${e.source} -> ${e.target} ${e.fired ? 'COMPROMISED' : 'BLOCKED'} (p=${e.p}, roll=${e.roll})`, e.fired ? 'infected' : 'blocked')
        })
      }
    } catch (e) {
      clearInterval(pTimer)
      setSimProgress(null)
      setError('Simulation failed. Verify API is running.')
      logEvent('ERROR: Simulation execution error', 'compromised')
    } finally {
      setWorking(false)
    }
  }

  // Find Mitigations
  async function runMitigation() {
    setWorking(true)
    setError('')
    logEvent(`MITIGATE: Searching combinatorial mitigations for ${selectedNode}...`, 'info')
    try {
      const resp = await fetch(`${API}/api/mitigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: selectedNode,
          trials: 600,
          actions: [{ node_id: selectedNode, action: 'PATCH' }],
          lambda_value: lambda
        })
      })
      if (!resp.ok) throw new Error('Mitigation failed')
      const data = await resp.json()
      setMitigation(data)
      const top = data.mitigation.candidates[0]
      logEvent(`MITIGATION_OPTIMAL: Top candidate = ${top.label} (Risk Red: ${top.risk_reduction}, Cost: ${top.cost})`, 'mitigated')
    } catch (e) {
      setError('Mitigation search failed.')
      logEvent('ERROR: Mitigation evaluation error', 'compromised')
    } finally {
      setWorking(false)
    }
  }

  // Dynamic client-side re-ranking of mitigations based on active lambda
  const rankedCandidates = useMemo(() => {
    if (!mitigation?.mitigation?.candidates) return []
    return [...mitigation.mitigation.candidates].map(c => ({
      ...c,
      net_score: c.risk_reduction - lambda * c.cost
    })).sort((a, b) => b.net_score - a.net_score)
  }, [mitigation, lambda])

  // Visible score scales and anchors
  const maxCritScore = useMemo(() => Math.max(...criticality.map(c => c.score), 4.04), [criticality])
  const minCritScore = useMemo(() => Math.min(...criticality.map(c => c.score), 0.50), [criticality])
  const maxRiskReduction = useMemo(() => Math.max(...(mitigation?.mitigation?.candidates || []).map(c => c.risk_reduction), 1), [mitigation])

  // Packages list for dropdown
  const packageOptions = useMemo(() => {
    return graph.nodes.filter(n => n.type === 'package')
  }, [graph])

  // Focused node details
  const focusedNodeDetails = useMemo(() => {
    if (!focusedNode) return null
    const critItem = criticality.find(c => c.id === focusedNode.id)
    return {
      ...focusedNode,
      score: critItem ? critItem.score : 0,
      breakdown: critItem?.breakdown || {
        betweenness: focusedNode.betweenness || 0,
        dependents_normalized: (focusedNode.dependents_count || 0) / 4,
        criticality_tier_weight: focusedNode.criticality_tier === 'critical' ? 4 : (focusedNode.criticality_tier === 'high' ? 3 : (focusedNode.criticality_tier === 'medium' ? 2 : 1)),
        nonredundancy_bonus: focusedNode.redundancy ? 0 : 0.25
      }
    }
  }, [focusedNode, criticality])

  // Custom compact node painter for ForceGraph2D
  const paintNode = (node, ctx, globalScale) => {
    // If walkthrough is active, step drives highlighting
    let isPatientZero = (node.id === selectedNode && scenario)
    let isAffected = (node.affected_probability > 0 || node.affected) && !isPatientZero
    let isServiceOrApp = node.type === 'service' || node.type === 'application'
    let isMitigated = false

    if (showHowItWorks) {
      if (walkthroughStep === 1) {
        // Step 1: Baseline topology
        isPatientZero = node.id === 'event-stream@3.3.6'
        isAffected = false
      } else if (walkthroughStep === 2) {
        // Step 2: Propagation path
        isPatientZero = node.id === 'event-stream@3.3.6'
        isAffected = ['flatmap-stream@0.1.1', 'through@2.3.8'].includes(node.id)
      } else if (walkthroughStep === 3) {
        // Step 3: Monte Carlo trial outcome
        isPatientZero = node.id === 'event-stream@3.3.6'
        isAffected = ['flatmap-stream@0.1.1', 'copay-wallet-service', 'through@2.3.8', 'copay-mobile-app'].includes(node.id)
      } else if (walkthroughStep === 4) {
        // Step 4: Mitigated state
        isMitigated = node.id === 'event-stream@3.3.6'
        isAffected = false
      }
    }

    // Color by strict semantic tokens
    let fillColor = '#475467' // Healthy package
    if (isMitigated) fillColor = '#12b76a' // Green: patched / isolated
    else if (isPatientZero) fillColor = '#f04438' // Red: patient zero
    else if (isAffected) fillColor = '#f79009' // Amber: infected
    else if (isServiceOrApp) fillColor = '#875bf7' // Purple: prod service/app

    // Compact technical nodes per specification (no giant circles)
    const radius = isPatientZero ? 6.5 : (isServiceOrApp ? 5.5 : 4.2)

    ctx.beginPath()
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = fillColor
    ctx.fill()

    // High contrast outline
    if (focusedNode?.id === node.id || isPatientZero || isMitigated) {
      ctx.strokeStyle = isPatientZero ? '#ff8585' : (isMitigated ? '#6ee7b7' : '#ffffff')
      ctx.lineWidth = 1.5 / globalScale
      ctx.stroke()
    } else {
      ctx.strokeStyle = '#181e28'
      ctx.lineWidth = 1 / globalScale
      ctx.stroke()
    }

    // Monospace label below node
    if (globalScale > 0.6 || isPatientZero || isServiceOrApp || isMitigated) {
      ctx.font = `${9 / globalScale}px "JetBrains Mono", monospace`
      ctx.fillStyle = isMitigated ? '#6ee7b7' : (isPatientZero ? '#ff8585' : (isServiceOrApp ? '#c7d2fe' : (isAffected ? '#fde68a' : '#94a3b8')))
      ctx.textAlign = 'center'
      ctx.fillText(node.name, node.x, node.y + radius + 9 / globalScale)
    }
  }

  const selectedPkg = graph.nodes.find(n => n.id === selectedNode)
  const totalNodesCount = graph.nodes.length || 16

  // 1. RISK: aggregate risk score normalized to 0-100%
  const riskFraction = scenario
    ? Math.min(1, ((scenario.simulation.worst_case_affected || 9) / totalNodesCount) * ((selectedPkg?.severity || 0.98) > 0 ? (selectedPkg?.severity || 0.98) : 0.8))
    : (selectedPkg?.severity || 0.78)
  const riskPercent = Math.round(riskFraction * 100)

  // 2. COVERAGE: blast radius as percentage of total twin nodes
  const affectedCount = scenario
    ? (scenario.simulation.median_affected || 6)
    : (selectedPkg?.blast_radius || 9)
  const coverageFraction = totalNodesCount > 0 ? (affectedCount / totalNodesCount) : 0
  const coveragePercent = Math.round(coverageFraction * 100)

  return (
    <div className="app-container">
      {/* 1. TOP HTOP-STYLE TELEMETRY CHROME */}
      <header className="htop-bar">
        <div className="htop-meters">
          <div className="htop-meter">
            <span className="htop-label">RISK</span>
            <span className="meter-bar">{makeAsciiBar(riskFraction, 10)}</span>
            <span className="meter-val">{riskPercent}%</span>
          </div>
          <div className="htop-meter">
            <span className="htop-label">COVERAGE</span>
            <span className="meter-bar">{makeAsciiBar(coverageFraction, 10)}</span>
            <span className="meter-val">{coveragePercent}%</span>
          </div>
          <div className="htop-meter">
            <span className="htop-label">TRIALS</span>
            {simProgress !== null ? (
              <>
                <span className="meter-bar">{makeAsciiBar(simProgress / trials, 8)}</span>
                <span className="meter-val">{simProgress}/{trials}</span>
              </>
            ) : (
              <span className="meter-val">{trials}</span>
            )}
          </div>
          <div className="htop-meter">
            <span className="htop-label">TWIN</span>
            <span className="meter-val">{graph.nodes.length} NODES · {graph.links.length} EDGES</span>
          </div>
        </div>
        <div className="htop-status">
          <span className="status-indicator">
            <span className="status-dot"></span>
            TWIN: OFFLINE (BAKED DATASET)
          </span>
          <span style={{ color: 'var(--text-muted)' }}>LOCAL GRAPH LOOKUP: &lt;0.1ms</span>
        </div>
      </header>

      {/* 2. APPLICATION HEADER & PRIMARY TABS */}
      <div className="app-header">
        <div className="brand-section">
          <div className="brand-title">
            <span>RIPPLE RISK</span>
            <span className="brand-tag">/ Supply Chain Digital Twin Console</span>
          </div>
        </div>
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'blast' ? 'active' : ''}`}
            onClick={() => setActiveTab('blast')}
          >
            [ BLAST RADIUS ]
          </button>
          <button
            className={`nav-tab ${activeTab === 'choke' ? 'active' : ''}`}
            onClick={() => setActiveTab('choke')}
          >
            [ CHOKE POINTS ]
          </button>
          <button
            className="nav-tab nav-tab--help"
            onClick={() => {
              setShowHowItWorks(true)
              setWalkthroughStep(1)
            }}
          >
            [ ? HOW IT WORKS ]
          </button>
        </nav>
      </div>

      {/* 3. CONTROL / TARGET SELECTION BAR (When in Blast view) */}
      {activeTab === 'blast' && (
        <section className="control-bar">
          <div className="control-group">
            <label className="control-label">
              <span>TARGET COMPROMISE:</span>
              <select
                className="control-select"
                value={selectedNode}
                onChange={e => setSelectedNode(e.target.value)}
                disabled={working || loading}
              >
                {packageOptions.map(pkg => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name}@{pkg.version} (CVSS {fmt((pkg.severity || 0) * 10, 1)})
                  </option>
                ))}
              </select>
            </label>
            <label className="control-label">
              <span>TRIALS:</span>
              <select
                className="control-select"
                value={trials}
                onChange={e => setTrials(Number(e.target.value))}
                disabled={working || loading}
              >
                <option value={200}>200 trials</option>
                <option value={500}>500 trials</option>
                <option value={800}>800 trials (Standard)</option>
                <option value={2000}>2000 trials (Deep)</option>
              </select>
            </label>
          </div>
          <div className="control-group">
            <button
              className="btn btn--primary"
              onClick={runSimulation}
              disabled={working || loading}
            >
              {working ? 'SIMULATING…' : '▶ RUN SIMULATION'}
            </button>
            <button
              className="btn btn--success"
              onClick={runMitigation}
              disabled={working || !scenario}
            >
              FIND MITIGATION
            </button>
          </div>
        </section>
      )}

      {/* 4. MAIN VIEWPORT */}
      {activeTab === 'blast' ? (
        <main className="workspace-grid">
          {/* Central Dependency Graph */}
          <div className="graph-stage-container">
            <div className="stage-header">
              <span>TOPOLOGY GRAPH VIEWPORT ({graph.nodes.length} nodes, {graph.links.length} directed links)</span>
              <span>CANVAS SCALE: 1.00x</span>
            </div>
            <div className="stage-canvas-wrapper" ref={stageRef}>
              <div className="graph-controls-overlay">
                <button
                  className="btn-tool"
                  onClick={() => fgRef.current?.zoom(fgRef.current.zoom() * 1.3, 300)}
                >
                  +
                </button>
                <button
                  className="btn-tool"
                  onClick={() => fgRef.current?.zoom(fgRef.current.zoom() * 0.7, 300)}
                >
                  −
                </button>
                <button
                  className="btn-tool"
                  onClick={() => fgRef.current?.zoomToFit(400, 30)}
                >
                  FIT
                </button>
              </div>

              <ForceGraph2D
                ref={fgRef}
                width={stageWidth}
                height={stageHeight}
                graphData={graph}
                nodeCanvasObject={paintNode}
                nodeLabel={node => `${node.name}@${node.version || 'prod'} [${node.type}] - Affected: ${fmt(node.affected_probability * 100, 0)}%`}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                linkColor={() => '#222d3d'}
                linkWidth={link => link.fired ? 2 : 1}
                linkDirectionalParticles={scenario ? 2 : 0}
                linkDirectionalParticleSpeed={0.006}
                linkDirectionalParticleWidth={2}
                linkDirectionalParticleColor={() => '#f79009'}
                d3VelocityDecay={0.3}
                warmupTicks={80}
                cooldownTicks={120}
                onNodeClick={node => {
                  setFocusedNode(node)
                  logEvent(`FOCUS_NODE: ${node.name} (${node.type}) selected`, 'info')
                }}
              />
            </div>
            <div className="graph-legend-strip">
              <div className="legend-item">
                <span className="legend-box" style={{ background: 'var(--color-patient-zero)' }}></span>
                <span>Root Compromise</span>
              </div>
              <div className="legend-item">
                <span className="legend-box" style={{ background: 'var(--color-infected)' }}></span>
                <span>Stochastically Infected</span>
              </div>
              <div className="legend-item">
                <span className="legend-box" style={{ background: 'var(--color-service-prod)' }}></span>
                <span>Production Service/App</span>
              </div>
              <div className="legend-item">
                <span className="legend-box" style={{ background: 'var(--color-healthy)' }}></span>
                <span>Healthy Package</span>
              </div>
              <div className="legend-item">
                <span className="legend-box" style={{ background: 'var(--color-mitigated)' }}></span>
                <span>Patched / Mitigated</span>
              </div>
            </div>
          </div>

          {/* Right Column: Telemetry & Mitigation Console */}
          <aside className="telemetry-column">
            {/* Risk Telemetry Panel */}
            <div className="telemetry-panel">
              <div className="panel-title-bar">
                <h2 className="panel-heading">PROPAGATION RISK TELEMETRY</h2>
                <span className="panel-badge">{scenario ? 'ACTIVE SIMULATION' : 'BASELINE'}</span>
              </div>
              {scenario ? (
                <>
                  <div className="telemetry-row">
                    <span className="label">TARGET ROOT:</span>
                    <span className="val" style={{ color: 'var(--color-patient-zero)' }}>{scenario.nodes.find(n => n.compromised)?.name || selectedNode}</span>
                  </div>
                  <div className="telemetry-row">
                    <span className="label">BAKED ADVISORY:</span>
                    <span className="val">{scenario.advisory?.id || 'CVE-2018-3721'} (CVSS {fmt(scenario.advisory?.cvss, 1)}/10)</span>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div className="telemetry-row">
                      <span className="label">MEDIAN REACH:</span>
                      <span className="val">{scenario.simulation.median_affected} nodes</span>
                    </div>
                    <div className="telemetry-meter-bar">
                      <div className="telemetry-meter-fill" style={{ width: `${(scenario.simulation.median_affected / graph.nodes.length) * 100}%` }}></div>
                    </div>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <div className="telemetry-row">
                      <span className="label">90TH PERCENTILE (P90):</span>
                      <span className="val">{scenario.simulation.p90_affected} nodes</span>
                    </div>
                    <div className="telemetry-meter-bar">
                      <div className="telemetry-meter-fill" style={{ width: `${(scenario.simulation.p90_affected / graph.nodes.length) * 100}%` }}></div>
                    </div>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <div className="telemetry-row">
                      <span className="label">WORST CASE SCENARIO:</span>
                      <span className="val" style={{ color: 'var(--color-patient-zero)' }}>{scenario.simulation.worst_case_affected} nodes</span>
                    </div>
                    <div className="telemetry-meter-bar">
                      <div className="telemetry-meter-fill telemetry-meter-fill--patient" style={{ width: `${(scenario.simulation.worst_case_affected / graph.nodes.length) * 100}%` }}></div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, padding: 8, background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', borderRadius: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>DOWNSTREAM PRODUCTION IMPACT</span>
                    <span style={{ fontSize: 11, color: 'var(--color-service-prod)', fontFamily: 'var(--font-mono)' }}>
                      ● copay-wallet-service (PROD)<br />
                      ● copay-mobile-app (PROD)
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  [ NO ACTIVE SIMULATION ]<br />
                  Select a package and click "RUN SIMULATION" to evaluate stochastic blast path.
                </div>
              )}
            </div>

            {/* Mitigation Optimizer Panel */}
            <div className="telemetry-panel">
              <div className="panel-title-bar">
                <h2 className="panel-heading">MITIGATION DECISION CONSOLE</h2>
                <span className="panel-badge">λ OPTIMIZER</span>
              </div>
              {mitigation ? (
                <>
                  <div className="mitigation-box">
                    <div className="mitigation-target">
                      RECOMMENDED: {rankedCandidates[0]?.label || 'ISOLATE'}
                    </div>
                    <div className="telemetry-row">
                      <span className="label">Risk Reduction:</span>
                      <span className="val" style={{ color: 'var(--color-mitigated)' }}>
                        {fmt(mitigation.mitigation.before.median_affected, 0)} → {fmt(rankedCandidates[0]?.after.median_affected, 0)} median affected ({fmt(rankedCandidates[0]?.risk_reduction, 2)} prevented · {makeAsciiBar(rankedCandidates[0]?.risk_reduction / (mitigation.mitigation.before.median_affected || 1), 6)})
                      </span>
                    </div>
                    <div className="telemetry-row">
                      <span className="label">Relative Effort (illustrative):</span>
                      <span className="val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--color-cost)', fontWeight: 600 }}>
                          {fmt(rankedCandidates[0]?.cost, 2)} / 10
                        </span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {makeAsciiBar((rankedCandidates[0]?.cost || 0) / 10, 6)}
                        </span>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 2,
                          background: rankedCandidates[0]?.cost <= 1.5 ? 'rgba(18, 183, 106, 0.2)' : rankedCandidates[0]?.cost <= 3.5 ? 'rgba(247, 144, 9, 0.2)' : 'rgba(240, 68, 56, 0.2)',
                          color: rankedCandidates[0]?.cost <= 1.5 ? 'var(--color-mitigated)' : rankedCandidates[0]?.cost <= 3.5 ? 'var(--color-infected)' : 'var(--color-patient-zero)'
                        }}>
                          {rankedCandidates[0]?.cost <= 1.5 ? 'LOW' : rankedCandidates[0]?.cost <= 3.5 ? 'MED' : 'HIGH'}
                        </span>
                      </span>
                    </div>
                    <div className="telemetry-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '6px 0', borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
                      <span className="label" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        NET UTILITY SCORE (λ = {fmt(lambda, 2)}):
                      </span>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                        Net Utility = {fmt(rankedCandidates[0]?.risk_reduction, 2)} (risk reduction) − {fmt(lambda, 2)} (λ) × {fmt(rankedCandidates[0]?.cost, 2)} (effort) = <strong style={{ color: 'var(--color-mitigated)' }}>{fmt(rankedCandidates[0]?.net_score, 2)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="slider-container">
                    <div className="slider-header">
                      <span>COST SENSITIVITY (λ):</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>λ = {fmt(lambda, 2)}</span>
                    </div>
                    <input
                      type="range"
                      className="slider-input"
                      min="0.0"
                      max="2.0"
                      step="0.1"
                      value={lambda}
                      onChange={e => setLambda(Number(e.target.value))}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      <span>0.0 (Risk Only)</span>
                      <span>1.0 (Balanced)</span>
                      <span>2.0 (Cost Sensitive)</span>
                    </div>
                  </div>

                  <div className="candidate-list">
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>RANKED INTERVENTIONS:</span>
                    {rankedCandidates.slice(0, 4).map((c, i) => (
                      <div key={c.label} className={`candidate-row ${i === 0 ? 'active' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '7px 8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="candidate-label">#{i + 1} {c.label}</span>
                          <span className="candidate-score" style={{ fontWeight: 700 }}>
                            {i === 0 ? <span style={{ fontSize: 9, color: 'var(--color-mitigated)', marginRight: 4 }}>[OPTIMAL]</span> : null}
                            {fmt(c.net_score, 2)}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          Net Utility = {fmt(c.risk_reduction, 2)} (risk) − {fmt(lambda, 2)} (λ) × {fmt(c.cost, 2)} (effort) = <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(c.net_score, 2)}</span>
                          <span style={{ marginLeft: 6, fontSize: 9, color: c.cost <= 1.5 ? 'var(--color-mitigated)' : c.cost <= 3.5 ? 'var(--color-infected)' : 'var(--color-patient-zero)' }}>
                            [{c.cost <= 1.5 ? 'LOW EFFORT' : c.cost <= 3.5 ? 'MED EFFORT' : 'HIGH EFFORT'}]
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  [ MITIGATION STANDBY ]<br />
                  Run compromise simulation first to enable combinatorial search.
                </div>
              )}
            </div>

            {/* Node Quick Inspector */}
            {focusedNodeDetails && (
              <div className="telemetry-panel">
                <div className="panel-title-bar">
                  <h2 className="panel-heading">NODE INSPECTION: {focusedNodeDetails.name}</h2>
                  <span className="panel-badge">{focusedNodeDetails.type.toUpperCase()}</span>
                </div>
                <div className="telemetry-row">
                  <span className="label">COMPOSITE CRITICALITY:</span>
                  <span className="val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{fmt(focusedNodeDetails.score, 2)} / {fmt(maxCritScore, 2)}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {makeAsciiBar(focusedNodeDetails.score / maxCritScore, 6)}
                    </span>
                  </span>
                </div>
                <div className="telemetry-row">
                  <span className="label">BETWEENNESS CENTRALITY:</span>
                  <span className="val">{fmt(focusedNodeDetails.breakdown.betweenness, 4)}</span>
                </div>
                <div className="telemetry-row">
                  <span className="label">DOWNSTREAM DEPENDENTS:</span>
                  <span className="val">{focusedNodeDetails.dependents_count || 0}</span>
                </div>
                <div className="telemetry-row">
                  <span className="label">ENVIRONMENT TIER:</span>
                  <span className="val">{focusedNodeDetails.criticality_tier || 'standard'}</span>
                </div>
                <div className="telemetry-row">
                  <span className="label">REDUNDANCY POSTURE:</span>
                  <span className="val">{focusedNodeDetails.redundancy ? 'Redundant' : 'Single Point of Failure'}</span>
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'grid', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  <div><strong style={{ color: 'var(--text-primary)', display: 'inline-block', width: 125 }}>STRUCTURAL ROLE:</strong> {focusedNodeDetails.type.toUpperCase()} · {focusedNodeDetails.dependents_count || 0} direct dependents · {focusedNodeDetails.redundancy ? 'Redundant' : 'SPoF'}</div>
                  <div><strong style={{ color: 'var(--text-primary)', display: 'inline-block', width: 125 }}>VULNERABILITY:</strong> CVSS {fmt((focusedNodeDetails.severity || 0) * 10, 1)} {focusedNodeDetails.severity >= 0.7 ? '— Critical CVE logged' : (focusedNodeDetails.severity > 0 ? '— Vulnerability flaw' : '— Clean / No CVEs')}</div>
                  <div><strong style={{ color: 'var(--text-primary)', display: 'inline-block', width: 125 }}>VERDICT:</strong> {focusedNodeDetails.score >= 3.0 ? 'Systemic choke point — compromises cascade widely to downstream runtimes' : (focusedNodeDetails.score >= 1.0 ? 'Intermediate node — structural relay in dependency path' : 'Perimeter leaf — isolated failure radius, contained downstream blast')}</div>
                </div>
              </div>
            )}
          </aside>
        </main>
      ) : (
        /* CHOKE POINTS & SYSTEMIC CRITICALITY VIEW */
        <main className="choke-points-view">
          <div className="view-header">
            <h1 className="view-title">SYSTEMIC CHOKE POINT AUDIT (STRUCTURAL CRITICALITY)</h1>
            <p className="view-desc">
              Identifies architectural choke points independent of active CVE severity. Combines graph betweenness centrality, in-degree dependency fan-out, production tier weights, and redundancy penalties.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--color-service-prod)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>#1 SYSTEMIC CHOKE POINT: copay-wallet-service</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-service-prod)', fontWeight: 700 }}>SCORE: {fmt(maxCritScore, 2)} (MAX)</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', display: 'grid', gap: 4 }}>
                <div><strong style={{ color: 'var(--text-primary)', display: 'inline-block', width: 140 }}>STRUCTURAL ROLE:</strong> Core production service · 4 dependents · intersection of package tree and runtime</div>
                <div><strong style={{ color: 'var(--text-primary)', display: 'inline-block', width: 140 }}>VULNERABILITY:</strong> CVSS 0.0 — no known CVEs logged</div>
                <div><strong style={{ color: 'var(--text-primary)', display: 'inline-block', width: 140 }}>VERDICT:</strong> Zero direct CVEs, but systemic choke point — high betweenness (0.0476) + single point of failure</div>
              </div>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--color-patient-zero)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>PERIMETER LEAF: event-stream@3.3.6</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-patient-zero)', fontWeight: 700 }}>SCORE: {fmt(minCritScore, 2)} (MIN)</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', display: 'grid', gap: 4 }}>
                <div><strong style={{ color: 'var(--text-primary)', display: 'inline-block', width: 140 }}>STRUCTURAL ROLE:</strong> Leaf package · 0 dependents · not on any critical path</div>
                <div><strong style={{ color: 'var(--text-primary)', display: 'inline-block', width: 140 }}>VULNERABILITY:</strong> CVSS 9.8 — critical, actively exploited (real CVE)</div>
                <div><strong style={{ color: 'var(--text-primary)', display: 'inline-block', width: 140 }}>VERDICT:</strong> Dangerous vulnerability, but contained — nothing else breaks if this one does</div>
              </div>
            </div>
          </div>

          <div className="choke-table-container">
            <div className="tier-legend-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
              <span><strong style={{ color: 'var(--text-primary)' }}>TIER LEGEND:</strong> Critical (Weight 4.0) · High (Weight 3.0) · Medium (Weight 2.0) · Low (Weight 1.0)</span>
              <span>Formula Factor: +0.5 × Weight</span>
            </div>
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>RANK</th>
                  <th>COMPONENT</th>
                  <th>TYPE</th>
                  <th>CVSS</th>
                  <th>BETWEENNESS</th>
                  <th>DEPENDENTS</th>
                  <th>TIER (WEIGHT)</th>
                  <th>REDUNDANCY</th>
                  <th>CRITICALITY SCORE [0–{fmt(maxCritScore, 2)}]</th>
                </tr>
              </thead>
              <tbody>
                {criticality.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={focusedNode?.id === item.id ? 'selected' : ''}
                    onClick={() => setFocusedNode(graph.nodes.find(n => n.id === item.id))}
                  >
                    <td style={{ fontWeight: 700, color: idx === 0 ? 'var(--color-service-prod)' : 'inherit' }}>#{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td><span className="panel-badge">{item.type}</span></td>
                    <td>{fmt((item.severity || 0) * 10, 1)}</td>
                    <td>{fmt(item.breakdown.betweenness, 4)}</td>
                    <td>
                      {(() => {
                        const count = item.dependents_count ?? (graph.nodes.find(n => n.id === item.id)?.dependents_count) ?? Math.round((item.breakdown?.dependents_normalized || 0) * 4);
                        const norm = item.breakdown?.dependents_normalized ? fmt(item.breakdown.dependents_normalized, 2) : '0.00';
                        return (
                          <span title={`Direct downstream dependents: ${count} (Normalized fan-out: ${norm})`}>
                            {count} {count === 1 ? 'dependent' : 'dependents'}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const w = Number(item.breakdown?.criticality_tier_weight || 1);
                        if (w >= 4) return <span>Critical (4.0)</span>;
                        if (w >= 3) return <span>High (3.0)</span>;
                        if (w >= 2) return <span>Medium (2.0)</span>;
                        return <span style={{ color: 'var(--text-muted)' }}>Low (1.0)</span>;
                      })()}
                    </td>
                    <td>{item.breakdown.nonredundancy_bonus > 0 ? 'SPoF (+0.25)' : 'Protected'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-service-prod)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{fmt(item.score, 2)}</span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {makeAsciiBar(item.score / maxCritScore, 6)}
                        </span>
                        {idx === 0 && (
                          <span style={{ fontSize: 9, color: 'var(--color-service-prod)', fontWeight: 800 }}>
                            (MAX)
                          </span>
                        )}
                        {idx === criticality.length - 1 && (
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                            (MIN)
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mathematical Transparency Card */}
          <div className="node-inspection-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="node-inspection-title">MATHEMATICAL TRANSPARENCY & FORMULA</h3>
              <button className="btn" onClick={() => setShowFormula(prev => !prev)}>
                {showFormula ? 'HIDE FORMULA' : 'HOW IS THIS CALCULATED?'}
              </button>
            </div>
            {showFormula && (
              <div className="formula-collapse">
                <code>
                  Score = 4 × Betweenness + 2 × (Dependents / MaxDependents) + 0.5 × TierWeight + NonRedundancyBonus
                </code>
                <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
                  • Betweenness Centrality (weight 4): Fraction of all shortest graph paths that pass through this node.<br />
                  • Fan-Out (weight 2): Normalized count of direct dependents relying on this component.<br />
                  • Operational Tier (weight 0.5): Production service tier multiplier (Critical = 4.0, High = 3.0, Medium = 2.0, Low = 1.0).<br />
                  • Non-Redundancy Bonus (+0.25): Single point of failure penalty when no standby redundancy exists.
                </p>
              </div>
            )}
          </div>
        </main>
      )}

      {/* 5. BOTTOM INVENTORY & EVENT CONSOLE (Visible in Blast view) */}
      {activeTab === 'blast' && (
        <section className="bottom-console">
          {/* Inventory Table */}
          <div className="table-panel">
            <div className="console-title-bar">
              <span>TWIN COMPONENT INVENTORY ({graph.nodes.length} ITEMS)</span>
              <span>CLICK ROW TO FOCUS ON GRAPH</span>
            </div>
            <div className="table-scroll">
              <table className="terminal-table">
                <thead>
                  <tr>
                    <th>NAME</th>
                    <th>VERSION</th>
                    <th>TYPE</th>
                    <th>STATUS</th>
                    <th>CVSS</th>
                    <th>DEPENDENTS</th>
                    <th>BLAST REACH</th>
                  </tr>
                </thead>
                <tbody>
                  {graph.nodes.map(node => {
                    const isPat = node.id === selectedNode && scenario
                    const isAff = node.affected_probability > 0
                    return (
                      <tr
                        key={node.id}
                        className={focusedNode?.id === node.id ? 'selected' : ''}
                        onClick={() => {
                          setFocusedNode(node)
                          if (fgRef.current && node.x && node.y) {
                            fgRef.current.centerAt(node.x, node.y, 400)
                            fgRef.current.zoom(2.2, 400)
                          }
                        }}
                      >
                        <td style={{ fontWeight: 600 }}>{node.name}</td>
                        <td>{node.version || 'prod'}</td>
                        <td><span className="panel-badge">{node.type}</span></td>
                        <td>
                          {isPat ? (
                            <span style={{ color: 'var(--color-patient-zero)', fontWeight: 700 }}>● ROOT</span>
                          ) : isAff ? (
                            <span style={{ color: 'var(--color-infected)', fontWeight: 700 }}>● INFECTED</span>
                          ) : node.type === 'service' || node.type === 'application' ? (
                            <span style={{ color: 'var(--color-service-prod)' }}>● PROD</span>
                          ) : (
                            <span style={{ color: 'var(--color-healthy)' }}>● CLEAN</span>
                          )}
                        </td>
                        <td>{fmt((node.severity || 0) * 10, 1)}</td>
                        <td>{node.dependents_count || 0}</td>
                        <td>{node.blast_radius || 0} nodes</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Diagnostic Event Stream Log */}
          <div className="log-panel">
            <div className="console-title-bar">
              <span>DIAGNOSTIC EVENT STREAM</span>
              <span>LIVE MONTE CARLO TELEMETRY</span>
            </div>
            <div className="log-scroll">
              <div className="event-log-container">
                {eventLog.map((ev, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-time">[{ev.time}]</span>
                    <span className={`log-msg log-msg--${ev.type}`}>{ev.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 6. HOW IT WORKS INTERACTIVE WALKTHROUGH DRAWER / MODAL */}
      {showHowItWorks && (
        <div className="walkthrough-overlay" onClick={() => setShowHowItWorks(false)}>
          <div className="walkthrough-modal" onClick={e => e.stopPropagation()}>
            <div className="walkthrough-header">
              <div className="walkthrough-title">
                <span>[ HOW IT WORKS ]</span>
                <span>/ Technical Walkthrough</span>
              </div>
              <div className="walkthrough-step-count">
                STEP 0{walkthroughStep} / 04
              </div>
            </div>

            <div className="walkthrough-body">
              {walkthroughStep === 1 && (
                <>
                  <span className="step-badge">STEP 01</span>
                  <h2 className="step-heading">01 — THE DEPENDENCY TWIN</h2>
                  <p className="step-copy">
                    We represent the entire software supply chain as a typed, directed graph.
                    Upstream libraries, backend microservices, and client applications become nodes.
                    Runtime dependencies become directed edges that model possible propagation paths.
                  </p>
                  <div className="walkthrough-diagram">
                    event-stream@3.3.6 (NPM Package)<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;│<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;▼ [depends_on]<br />
                    flatmap-stream@0.1.1 (Malicious Payload)<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;│<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;▼ [used_by]<br />
                    copay-wallet-service (Backend Production Service)<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;│<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;▼ [deployed_in]<br />
                    copay-mobile-app (Client Application)
                  </div>
                  <p className="step-copy" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Based on the 2018 BitPay Copay supply-chain compromise. Notice how upstream open-source code flows directly into downstream operational targets.
                  </p>
                </>
              )}

              {walkthroughStep === 2 && (
                <>
                  <span className="step-badge">STEP 02</span>
                  <h2 className="step-heading">02 — COMPROMISE PROPAGATES THROUGH EDGES</h2>
                  <p className="step-copy">
                    Each dependency edge has an inspectable transmission probability ($p$).
                    This probability is derived from dependency scope (runtime vs dev), maintainer activity scores, and architectural redundancy.
                  </p>
                  <div className="walkthrough-diagram">
                    <span style={{ color: 'var(--color-patient-zero)' }}>● ROOT COMPROMISE</span>: event-stream@3.3.6 (Severity 0.98)<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;│<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;│ p = 0.88 (base=0.72, weight=1.0, maintainer=0.05)<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;▼<br />
                    <span style={{ color: 'var(--color-infected)' }}>● AFFECTED NODE</span>: flatmap-stream@0.1.1<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;│<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;│ p = 0.92 (runtime dependency, no redundancy)<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;▼<br />
                    <span style={{ color: 'var(--color-service-prod)' }}>● PRODUCTION SERVICE</span>: copay-wallet-service
                  </div>
                  <p className="step-copy" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Malware transmission is not guaranteed on every hop; network segmentation and maintainer responsiveness reduce the probability.
                  </p>
                </>
              )}

              {walkthroughStep === 3 && (
                <>
                  <span className="step-badge">STEP 03</span>
                  <h2 className="step-heading">03 — MONTE CARLO ESTIMATES THE BLAST RADIUS</h2>
                  <p className="step-copy">
                    A single deterministic formula cannot capture real-world uncertainty.
                    We run repeated stochastic trials (typically 800) where each edge samples its calculated probability via a Bernoulli trial.
                  </p>

                  <div className="walkthrough-diagram">
                    <div className="trial-row"><span>TRIAL 01</span> <span>🔴 → 🟠 → 🟣</span> <span style={{ marginLeft: 'auto' }}>3 affected</span></div>
                    <div className="trial-row"><span>TRIAL 02</span> <span>🔴 → 🟠</span> <span style={{ marginLeft: 'auto' }}>2 affected</span></div>
                    <div className="trial-row"><span>TRIAL 03</span> <span>🔴 → 🟠 → 🟣</span> <span style={{ marginLeft: 'auto' }}>3 affected</span></div>
                    <div className="trial-row"><span>TRIAL 04</span> <span>🔴 → 🟠</span> <span style={{ marginLeft: 'auto' }}>2 affected</span></div>
                    <div className="trial-row"><span>TRIAL 05</span> <span>🔴 → 🟠 → 🟣 → 🟣</span> <span style={{ marginLeft: 'auto' }}>4 affected</span></div>
                  </div>

                  {/* Histogram representation */}
                  <div className="histogram-container">
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>DISTRIBUTION OF AFFECTED NODES (800 TRIALS):</span>
                    <div style={{ display: 'flex', alignItems: 'flex-end', height: 60, gap: 8, marginTop: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ flex: 1, height: '10%', background: 'var(--color-infected)', borderRadius: 1 }} title="1 node"></div>
                      <div style={{ flex: 1, height: '25%', background: 'var(--color-infected)', borderRadius: 1 }} title="2 nodes"></div>
                      <div style={{ flex: 1, height: '40%', background: 'var(--color-infected)', borderRadius: 1 }} title="3 nodes"></div>
                      <div style={{ flex: 1, height: '65%', background: 'var(--color-infected)', borderRadius: 1 }} title="4 nodes"></div>
                      <div style={{ flex: 1, height: '85%', background: 'var(--color-infected)', borderRadius: 1 }} title="5 nodes"></div>
                      <div style={{ flex: 1, height: '100%', background: 'var(--color-patient-zero)', borderRadius: 1 }} title="6 nodes (Median)"></div>
                      <div style={{ flex: 1, height: '80%', background: 'var(--color-infected)', borderRadius: 1 }} title="7 nodes (P90)"></div>
                      <div style={{ flex: 1, height: '50%', background: 'var(--color-infected)', borderRadius: 1 }} title="8 nodes"></div>
                      <div style={{ flex: 1, height: '20%', background: 'var(--color-patient-zero)', borderRadius: 1 }} title="9 nodes (Worst)"></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 6, color: 'var(--text-primary)' }}>
                      <span>TRIALS: 800</span>
                      <span>MEDIAN: 6</span>
                      <span>P90: 7</span>
                      <span>WORST CASE: 9</span>
                    </div>
                  </div>
                </>
              )}

              {walkthroughStep === 4 && (
                <>
                  <span className="step-badge">STEP 04</span>
                  <h2 className="step-heading">04 — FROM RISK TO ACTION</h2>
                  <p className="step-copy">
                    The system evaluates single and combinatorial interventions to minimize the blast radius at an acceptable engineering effort.
                  </p>
                  <div className="walkthrough-diagram">
                    GRAPH → PROPAGATION → MONTE CARLO → RISK → MITIGATION → DECISION
                  </div>
                  <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                    <div style={{ padding: 8, background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', borderRadius: 2 }}>
                      <span style={{ color: 'var(--color-mitigated)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>ISOLATE(event-stream)</span>
                      <span style={{ float: 'right', fontFamily: 'var(--font-mono)' }}>Median: 6 → 0 (Effort: 1.00/10 [LOW])</span>
                    </div>
                    <div style={{ padding: 8, background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', borderRadius: 2 }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>PATCH(event-stream)</span>
                      <span style={{ float: 'right', fontFamily: 'var(--font-mono)' }}>Median: 6 → 0 (Effort: 2.00/10 [MED])</span>
                    </div>
                    <div style={{ padding: 8, background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', borderRadius: 2 }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>UPGRADE(event-stream)</span>
                      <span style={{ float: 'right', fontFamily: 'var(--font-mono)' }}>Median: 6 → 0 (Effort: 2.50/10 [MED])</span>
                    </div>
                  </div>
                  <p className="step-copy" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Using the effort-sensitivity parameter (λ), engineers can choose whether to prioritize pure risk reduction or avoid high-effort patch churn.
                  </p>
                </>
              )}
            </div>

            <div className="walkthrough-footer">
              <div className="step-nav-dots">
                {[1, 2, 3, 4].map(step => (
                  <button
                    key={step}
                    className={`step-dot-btn ${walkthroughStep === step ? 'active' : ''}`}
                    onClick={() => setWalkthroughStep(step)}
                  >
                    0{step}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {walkthroughStep > 1 && (
                  <button
                    className="btn"
                    onClick={() => setWalkthroughStep(prev => prev - 1)}
                  >
                    ← BACK
                  </button>
                )}
                {walkthroughStep < 4 ? (
                  <button
                    className="btn btn--primary"
                    onClick={() => setWalkthroughStep(prev => prev + 1)}
                  >
                    NEXT →
                  </button>
                ) : (
                  <button
                    className="btn btn--success"
                    onClick={() => setShowHowItWorks(false)}
                  >
                    CLOSE WALKTHROUGH
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. TERMINAL FOOTER WITH SUBTLE KEYBOARD HINTS */}
      <footer className="terminal-footer">
        <div className="fkey-group">
          <div className="fkey-item"><span className="fkey-num">F1</span><span>Help</span></div>
          <div className="fkey-item"><span className="fkey-num">F2</span><span>Setup</span></div>
          <div className="fkey-item"><span className="fkey-num">F3</span><span>Search</span></div>
          <div className="fkey-item"><span className="fkey-num">F4</span><span>Filter</span></div>
          <div className="fkey-item"><span className="fkey-num">F5</span><span>Refresh</span></div>
          <div className="fkey-item"><span className="fkey-num">F6</span><span>Details</span></div>
          <div className="fkey-item"><span className="fkey-num">F7</span><span>Mitigate</span></div>
          <div className="fkey-item"><span className="fkey-num">F10</span><span>Quit</span></div>
        </div>
        <div>
          <span>SEC_INSTRUMENT v2.4.0 (COPAY_TWIN_OFFLINE)</span>
        </div>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
