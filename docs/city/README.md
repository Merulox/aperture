# Aperture City

**Status:** vision locked; architecture candidate; implementation limited to an explicitly labelled low-fidelity prototype.  
**Owner:** merulox.  
**Host product:** Aperture, initially as `/city`, designed to become its primary home.

Aperture City is a luminous, inhabited operational world for understanding and directing a society of persistent AI agents.

It combines three synchronized layers:

1. **Habitat** — stable geography, persistent residents, identity, memory, relationships, and history.
2. **Simulation** — workers, work sites, communication, dependencies, resource flow, and state change.
3. **Command** — semantic zoom, inspectors, chat, approvals, evidence, and precise operational actions.

The city is a projection of normalized operational truth. Genesis, Victorique, OMP, Orbit, services, and future agents retain authority over their own runtime state. City Hall federates observation and commands without pretending every subsystem already shares one runtime.

## Decisions

- The first visual substrate is a **2D living map**.
- Geography is a stable hybrid: capability districts contain resident homes and project workplaces; dynamic relationships render as overlays.
- Persistent named agents are **residents**. Transient sessions and runs are **workers**. Deterministic automations and services are infrastructure, not citizens.
- The operator uses a free camera. **City Hall** is the durable center for approvals, policy, broadcasts, and prioritized attention.
- The city remains spatially stable. Urgency changes signals and City Hall priority, never entity position.
- Conversations are resident-level and durable, with explicit work/run/project context selection.
- Idle messages enter a durable inbox. Immediate wake is a separate explicit action.
- All resources are first class: compute/cost, capabilities/permissions, knowledge/memory, attention/workload, and artifacts/dependencies.
- Sensitive content uses summary-first disclosure. Secret values are never rendered.
- merulox owns mission and mandate; residents may create tactical objectives inside them; workers receive bounded tasks.
- Genesis anchors the first real complete control loop. Victorique is the second inspectable resident.

## First product proof

The first production-capable vertical slice succeeds only when the operator can:

```text
notice → inspect → understand → converse → decide → deliver → observe changed state
```

A low-fidelity fixture-backed prototype may validate interaction and visual semantics, but it must say **SIMULATION** and does not satisfy the production control-loop proof.

## Documents

- [Domain model](domain-model.md)
- [State machines](state-machines.md)
- [Adapter contracts](adapters.md)
- [City Hall protocol](city-hall-protocol.md)
- [Map and interaction model](interaction-model.md)

## First-slice boundary

### In scope

- City Hall, one capability district, Genesis home, Victorique home, one project workplace, one temporary Genesis worker.
- Resident selection and semantic zoom.
- Genesis inspector: state, goal, worker, blocker, resources, recent trail, contextual chat.
- One pending approval visible both at Genesis and City Hall.
- Approval response and message/wake semantics represented end to end in the model.

### Not in scope

- 3D rendering or full historical replay.
- Replacing existing Aperture detail tabs.
- Unified migration of Genesis, Victorique, OMP, or Orbit into one runtime.
- Full agent lifecycle/resource control.
- Synthetic city population, salesman implementation, or visual polish.
- Rendering raw secrets.

## Canonical deployment

The auth-gated production URL is `https://aperture.merulox.com`. The live `aperture.service` has `WorkingDirectory=/home/merulox/projects/aperture` and executes this repository's `dist/server/entry.mjs`; this repository is canonical for Aperture City.
