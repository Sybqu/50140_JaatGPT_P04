# Frontend Design Direction

## Product intent

This dashboard should feel like an incident-command console, not a generic dependency viewer. The first screen makes the selected compromise, its structural impact, and the next action immediately legible.

## Visual language

The interface uses a deep midnight base, a fine technical grid, luminous blue structural surfaces, and carefully reserved amber/red risk signals. Soft gradients and faint radial glows give the graph a command-centre depth without competing with data. Rounded panels, compact mono labels, and clear numeric hierarchy create a calm, analytical tone.

## Typography

- Interface family: Inter, ui-sans-serif, system-ui, sans-serif.
- Data family: ui-monospace, SFMono-Regular, Menlo, monospace.
- Display: clamp(2.25rem, 5vw, 4.8rem), 700–800, 0.98 line height.
- Section heading: 1.125–1.375rem, 700, 1.2 line height.
- Body: 0.875–1rem, 400–500, 1.5–1.65 line height.
- Labels: 0.68–0.75rem mono, uppercase, tracked.

## Color system

- Canvas: `#07111f`; raised canvas: `#0b1728`; panel: `#101f34`.
- Ink: `#eef5ff`; secondary ink: `#a6bad2`; muted: `#7088a6`.
- Structural blue: `#79b8ff`; cyan: `#41d7d1`.
- Risk amber: `#ffb454`; destructive red: `#ff5d6c`; success green: `#54d18b`.
- Borders: translucent `#9cc4ff` at low opacity.

## Layout and responsive behavior

- Maximum application width: 1440px with 24–40px inline padding.
- Desktop: controls span the top; the graph owns the dominant left column and an insight rail occupies the right column.
- Tablet: graph and insight rail remain stacked within a two-column grid when space permits; controls wrap cleanly.
- Mobile: single-column sequence: status, title, controls, graph, metrics, insight rail. The graph remains a deliberate 440px interactive viewport instead of a squeezed desktop panel.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px.

## Component inventory

- `AppShell`: animated page frame and status strip.
- `RiskHeader`: product identity, current dataset status, selected-node summary.
- `ScenarioControls`: accessible package selection plus simulate and mitigation actions.
- `GraphPanel`: graph canvas, legends, criticality callout, and graph loading state.
- `MetricStrip`: compact structural metrics with traceable labels.
- `InsightRail`: advisory, formula, explanation, mitigation result, and rank reductions.
- `EmptyInsight` and `LoadingState`: explicit pre-simulation and request states.

## Interaction and styling strategy

- Page and panels: Clean flex/grid layout with CSS gradients, soft borders (`rgba(156,196,255,.16)`), and backdrop blur (`backdrop-filter: blur(18px)`).
- Buttons: CSS transitions on hover (`box-shadow .18s ease`) and native `:focus-visible` outlines for tactile feedback.
- Interactive controls: Native range slider and select elements styled with high-contrast accent highlights.
- Graph: HTML5 Canvas rendering via `react-force-graph-2d` with custom node color mapping and directional links; graph topology changes convey structural state without extraneous decorative animations.
- Cards: Hover border-color and elevation transitions using hardware-accelerated CSS properties.
- Reduced motion: Native `@media (prefers-reduced-motion: reduce)` disables all CSS transitions and animations.

## Accessibility and performance

- All controls use visible keyboard focus and native form semantics.
- Risk color is paired with labels and text (e.g. badges, metrics), not color alone.
- Lightweight asset footprint: Zero external UI or animation libraries (React + `react-force-graph-2d` only, adhering strictly to AGENTS.md).
- Transitions are limited to `opacity`, `color`, and `box-shadow`; no layout-thrashing animations or scroll parallax.

## Design and architectural decisions

- No extraneous animation runtime: Framer Motion / Motion was removed to keep bundle size minimal, eliminate runtime overhead, and comply with the single frontend dependency constraint.
- Pure React + CSS: Component state transitions (simulation, mitigation, slider re-ranking) update reactively and instantaneously.
- Dark command-center palette: High-contrast midnight blue base (`#07111f`), luminous cyan/blue primary accents (`#41d7d1`, `#79b8ff`), and reserved amber/red risk indicators (`#ffb454`, `#ff5d6c`).
