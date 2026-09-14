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

## Interaction and animation strategy

- Page and panels: Motion staggered opacity/vertical entry on initial load; 220–360ms ease-out. Purpose: establish hierarchy without delaying use.
- Buttons: Motion hover lift of 1–2px and press scale of 0.98; 120–180ms. Purpose: direct, tactile feedback.
- Scenario insight: `AnimatePresence` opacity/vertical transition when results replace the empty state; 180–240ms. Purpose: preserve continuity after simulation.
- Metric numbers: short opacity/position reveal only when simulation data changes. Purpose: mark changed state without decorative counting.
- Cards: CSS transform/border-color transition on hover/focus. Purpose: make clickable/interactive regions legible while avoiding unnecessary JavaScript animation.
- Graph: no continuous decorative animation beyond the force simulation. Purpose: graph movement already carries information.
- Reduced motion: Motion uses `useReducedMotion`; CSS disables nonessential transitions and animation. No motion is required to understand state.

## Accessibility and performance

- All controls use visible keyboard focus and native form semantics.
- Risk color is paired with labels and icons/text, not color alone.
- Request states use `aria-live="polite"`; disabled controls retain an explanatory label.
- Motion is limited to `opacity` and `transform`; no scroll parallax, permanent looping, or layout-thrashing animation.

## Research decisions

- Motion supplies React-aware enter/exit, hover/press, and reduced-motion behavior.
- React Bits informed the restrained layered/background-card aesthetic; no third-party component is copied or added.
- Anime.js was not selected: the product has no complex timeline or SVG sequence requiring a second animation runtime.
- Transitions.dev informed the use of short text/state swaps, panel reveals, and number emphasis; modal/page effects are intentionally omitted because they would not help the core workflow.
