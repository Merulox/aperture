# Map and Interaction Model

## Visual doctrine

The first visual language is a **2D luminous systems city**: dark Aperture foundation, crisp miniature geometry, restrained luminous status, and precise technical overlays.

Function is primary, but the city must feel inhabited. Operational state becomes environmental behavior rather than a stack of unrelated cards.

## Stable map grammar

- **Districts:** broad capability zones with stable boundaries.
- **Homes:** distinctive resident identity anchors.
- **Workplaces:** project sites where shared work is visible.
- **Facilities:** services, routines, datastores, and tools represented as infrastructure.
- **Workers:** temporary moving entities tied to exact runs.
- **Signals:** messages, dependencies, and resource flow rendered only when relevant or toggled.
- **City Hall:** fixed global attention and authority center.

No force-directed layout controls primary geography. Stable coordinates preserve spatial memory. Relationship graphs are overlays, not the world foundation.

## Semantic zoom

### Level 0 — City

Shows:

- district boundaries and names;
- City Hall pending/urgent counts;
- resident presence silhouettes;
- active project sites;
- critical failure, blocker, or stale signals;
- aggregate activity and resource pressure.

Question answered: **Where does my attention belong?**

### Level 1 — District

Shows:

- resident homes and project workplaces;
- active workers and destination paths;
- facility health;
- current collaboration/dependency overlays;
- compact goal and workload signals.

Question answered: **What is happening in this domain?**

### Level 2 — Entity

Shows labels and immediate operational context:

- resident/worker identity;
- presence/state and freshness;
- current goal or work item;
- one primary blocker/approval;
- resource pressure rings;
- recent activity pulse.

Question answered: **What is this entity doing and why?**

### Level 3 — Inspector

A persistent side panel with tabs:

1. **Now** — summary, freshness, current objective, blocker, attention.
2. **Work** — work items, workers, evidence, native source state.
3. **Goals** — mission, tactical objectives, success criteria, authority.
4. **Resources** — all five resource families.
5. **Connections** — dependencies, collaborators, messages, owned facilities.
6. **Trail** — recent immutable events with provenance.
7. **Chat** — resident conversation and explicit context selector.

Question answered: **What can I understand or do safely?**

### Level 4 — Specialized detail

Deep links to existing Aperture tasks, Orbit, code graph, logs, repositories, or source-specific evidence. The City does not reimplement every expert surface.

## Attention language

Geography never moves for urgency.

| State | Map behavior |
|---|---|
| Idle/healthy | low steady light; no motion |
| Active | restrained rhythmic activity |
| Waiting | slow amber pause signal |
| Pending operator approval | violet beacon linked to City Hall |
| Blocked | amber barrier and named dependency |
| Degraded | irregular warning pulse |
| Failed/critical | red static signal; no continuous flashing |
| Stale/unknown | desaturated entity with age label |

Status uses icon, shape, label, and motion—not color alone. Decorative motion stops when reduced-motion is requested.

## Selection and camera

- Click selects without moving the map.
- Double-click or explicit focus zooms to an entity.
- Escape clears selection; browser back restores prior selection/context.
- Search centers an entity without changing its stable coordinates.
- Filters toggle workers, facilities, relationships, resource pressure, and completed work.
- Keyboard traversal exposes the same entities in a deterministic list order.

## City Hall

City Hall is both a place and a global interface:

- map beacon and pending count;
- prioritized inbox grouped by required authority and risk;
- exact request/provenance/consequence review;
- approve, reject, or request clarification;
- broadcast/policy surface in later phases;
- command delivery and acknowledgement state.

Every approval remains accessible from its requesting resident/site and from City Hall. These are two views of one normalized ID.

## Resident inspector

The collapsed header always shows:

- identity and role;
- source freshness;
- presence;
- current objective;
- attention count.

Raw prompts, logs, and memory excerpts are hidden behind deliberate reveal with source, timestamp, sensitivity, and audit notice. Credentials show only capability/scope status.

## Chat

The chat composer requires a visible context selector:

`general | project | goal | work item | worker | approval`.

It shows whether the resident is active, next scheduled wake, and whether immediate wake would be a separate action. Sending a message shows queued/delivering/delivered/read/responded states; optimistic bubbles never imply source delivery.

## Work-site behavior

- A work item activates its project site.
- Assigned residents appear connected to or present at the site.
- Temporary workers spawn with visible parent and work association.
- Completion changes site state and emits a trail event; it does not permanently construct arbitrary scenery in the first version.
- Shared sites make collaboration visible without moving resident homes.

## Low-fidelity prototype scope

The prototype uses deterministic fixtures and client-local state to validate the map grammar and control interaction. It must display a persistent **SIMULATION** badge.

Required scene:

- City Hall;
- one Memory/Operations district;
- Genesis home and active project site;
- Victorique home in read-only state;
- one Genesis worker;
- one violet pending-approval connection;
- Genesis inspector with Now, Resources, Trail, and Chat views;
- City Hall approval panel;
- approve/reject action transitions through queued, delivering, acknowledged;
- context-selectable message with optional separate wake action;
- visible trail update after the simulated acknowledgement.

The prototype does not call production adapters and cannot satisfy the production Genesis control-loop contract.
