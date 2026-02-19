# FlowState — External state for stateless workflows

## Introduction
Why stateless workflow engines break down as soon as you introduce LLMs and multi-step content generation.

Workflow engines like n8n are intentionally stateless.

This design choice is usually a strength: workflows are easier to reason about, failures are isolated, and execution remains predictable.

But as soon as you start building non-trivial automations — especially those involving LLMs, multi-step content generation, or iterative processing — statelessness quickly turns into friction.

You end up fighting the tool:
loops become brittle,
merge nodes multiply,
state is duplicated across items,
and simple things like “append text step by step” turn into complex graph gymnastics.

FlowState is a small service I built to solve exactly this problem.

It externalizes state into a simple HTTP API, allowing stateless workflow engines to remain stateless — while still enabling structured, incremental state mutations across a single run.

## The problem with stateless workflows
Workflow engines like n8n are stateless by design — and for good reasons.
Each node receives input, produces output, and the engine moves on.
 There is no shared memory, no hidden coupling between steps, and no implicit state carried over time.

This model works extremely well for:
  -  data transformations
  - fan-in / fan-out pipelines
  - ETL-style workflows
  - event-driven automations


However, the model starts to break down when workflows become iterative or stateful by nature.

### Where statelessness becomes friction
In real-world automations, you often need to:
  - build a document progressively
  - accumulate results across steps
  - keep track of progress or iteration index
  - preserve context across multiple LLM calls
  - retry or resume a failed execution safely

In a stateless engine, none of this exists natively.
Instead, you are forced to simulate state using workflow mechanics:
  - looping over items just to carry data forward
  - merge nodes to recombine partial outputs
  - manual indexing to keep track of order
  - duplicated context on every item
  - fragile graphs that break when one step changes

The workflow still “works”, but the mental model degrades quickly.

Simple intentions (“append this paragraph”, “increment the step”, “remember this decision”) become implicit, scattered across multiple nodes, and hard to reason about.

### LLMs make the problem worse
Large Language Models amplify this friction.
LLM-based workflows are:
  - sequential
  - context-dependent
  - probabilistic
  - often long-running

You rarely want a single monolithic LLM call.
Instead, you want to:
  - generate outlines
  - expand sections one by one
  - refine content iteratively
  - keep intermediate results
  - recover from partial failures

Trying to do this in a stateless workflow engine usually leads to:
deeply nested loops
  - exploding item counts
  - complex merge logic
  - hard-to-debug executions

At that point, the workflow graph no longer represents your intent — it represents the workaround.

### The missing abstraction
The issue is not that stateless engines are poorly designed.
The issue is that state is a missing abstraction, pushed onto the workflow graph itself.
What’s missing is a simple, explicit place where a workflow can say:

#### “This run has a state. I want to read it, mutate it, and move on.”

Without turning the workflow engine into a database.

Without introducing hidden coupling.

Without breaking the stateless execution model.

This is the gap FlowState was built to fill.

## What I didn’t want to build
Before explaining what FlowState is, it’s important to clarify what it is deliberately not.
There are already many excellent tools for persistence, messaging, and orchestration.
 FlowState exists precisely because none of them fit this very specific problem.
### ❌ Not a database
FlowState does not try to be a database.
There is no schema management, no indexing, no querying, no durability guarantees.
 State lives in memory and can disappear at any time.
This is intentional.
If you need long-term persistence, historical queries, or strong consistency, you should use a real database — not FlowState.
### ❌ Not a queue or event system
FlowState does not schedule work, trigger jobs, or coordinate execution.
There are no workers, no retries, no acknowledgements, no backpressure.
Workflow engines already do this very well.
 FlowState only stores state, nothing more.
### ❌ Not a workflow engine
FlowState does not decide what happens next.
There is no branching logic, no conditions, no control flow, no retries, no loops.
All orchestration remains in your workflow engine (n8n, Airflow, Temporal, custom code).
FlowState is intentionally passive.
### ❌ Not a persistence layer
State is not guaranteed to survive restarts.
There is no replication, no snapshots, no WAL, no recovery mechanism.
This makes FlowState simple, fast, and predictable — but also means it is not suitable as a source of truth.
### ❌ Not a UI product
There is no dashboard, no visualization, no editor, no admin panel.
FlowState is an API-first tool, designed to be invisible.
If you don’t notice FlowState while building your workflow, it’s doing its job.
 
### Why these constraints matter
By aggressively limiting scope, FlowState stays:
small
  - understandable
  - auditable
  - hard to misuse
  - easy to replace

FlowState is not meant to be foundational infrastructure.
 It is a supporting tool — something you can depend on without building your system around it.

## The core idea
The core idea behind FlowState is deliberately simple:
#### Externalize mutable state into a small, explicit service, and keep the workflow engine stateless.
Instead of forcing a stateless engine to behave like it has memory, FlowState makes state an explicit dependency.

Each workflow run is associated with a single run-scoped state object, identified by a runId.

That state lives outside the workflow engine and is accessed exclusively through a small HTTP API.
The workflow itself becomes a sequence of pure steps:
  - read state
  - compute
  - write state
  - move on

No hidden merges.

No implicit accumulation.

No item explosion.

### One run, one state
FlowState does not attempt to model workflows, steps, or execution graphs.
It only knows one thing:
#### A run owns a state.
That state:
  - is created explicitly
  - mutated explicitly
  - read explicitly
  - destroyed explicitly

This makes state transitions visible, auditable, and easy to reason about.

### State as a first-class input/output
In a FlowState-based workflow:
  - state is not embedded inside items
  - state is not passed implicitly between nodes
  - state is not reconstructed through merges

Instead, state becomes:
  - an input to a step
  - an output of a step

This mirrors how engineers already think about multi-step processes — but without forcing the workflow engine to simulate memory.

### Stateless engines stay stateless
FlowState does not fight the design of tools like n8n.
It embraces it.
The workflow engine remains:
  - restartable
  - parallelizable
  - predictable

All mutability is pushed to the edges, where it belongs.

### Why this works especially well with LLMs
LLM-driven workflows amplify the weaknesses of stateless execution:
  - incremental text generation
  - retries
  - partial failures
  - long-running chains
  - context accumulation

By externalizing state:
  - each LLM call can append or patch safely
  - retries do not duplicate content
  - partial progress is preserved
  - long outputs are built incrementally

FlowState does not try to be intelligent about content.
 It simply guarantees deterministic state mutations.
 
### A small idea on purpose
The most important design choice in FlowState is what it refuses to do.

It does not:
  - infer intent
  - auto-merge structures
  - hide conflicts
  - manage workflows
  - persist data forever

By staying small, FlowState becomes:
  - easy to trust
  - easy to debug
  - easy to replace

That constraint is the feature.
  - Design invariants
  - State model
  - HTTP API
  - Conflict handling (resume / replace)

## A concrete example with n8n
To make the idea concrete, let’s look at a simple but very common workflow:
#### generating a long-form article step by step using an LLM.

### The usual n8n approach
Without external state, this kind of workflow typically ends up with:
  - a loop node to iterate over sections
  - merge nodes to recombine partial results
  - item juggling to preserve order
  - defensive logic to avoid duplications on retries

Each LLM call produces a fragment, but n8n has no natural place to accumulate those fragments.
State has to be simulated through items.

This works — until it doesn’t.

Retries duplicate content.
Partial failures reset progress.
The workflow graph grows more complex than the actual business logic.

### The same workflow with FlowState
With FlowState, the workflow becomes linear.
#### Step 1 — Create a run state
At the start of the workflow, n8n creates a state:
```json
POST /state

{
  "context": {
    "engine": "n8n",
    "executionId": "{{ $execution.id }}",
    "workflowId": "{{ $workflow.id }}",
    "topic": "AI consciousness",
    "language": "en"
  },
  "onConflict": "resume"
}
```
FlowState returns a runId.
This runId is stored once and reused throughout the workflow.
If the workflow is retried with the same execution context, FlowState resumes the existing state instead of creating a new one.

#### Step 2 — Generate a section
Each LLM node is responsible for one unit of work.
It:
  1 reads the current state
  2 generates a new section
  3 appends it explicitly

```json
POST /state/{runId}/append

{
  "path": "sections",
  "value": {
    "type": "markdown",
    "content": "# Introduction\nAI is evolving rapidly...",
    "createdAt": 1700000012345
  }
}
```
No merge nodes.
 No loops managing accumulation.
 Just a single, explicit append.
#### Step 3 — Retry without fear
If an LLM call times out or the workflow is retried:
existing sections remain untouched


new sections are appended only once


ordering is preserved


State lives outside the execution graph.


#### Step 4 — Finalization
At the end of the workflow, a final node may:
assemble the full markdown


generate HTML


publish content


write a summary


```json
PATCH /state/{runId}

{
  "output": {
    "markdown": "{{ assembled_markdown }}",
    "publishedUrl": "https://example.com/article"
  },
  "meta": {
    "status": "success"
  }
}
```

### What changed?
The workflow graph became:
  - shorter
  - easier to read
  - easier to debug

The complexity moved where it belongs:
#### into explicit state mutations, not control flow gymnastics.
FlowState does not make n8n “stateful”.

It simply gives state a place to exist.

### Why this scales better
This pattern scales naturally to:
  - multi-step research workflows
  - agent-style LLM pipelines
  - long-running executions
  - partial restarts
  - parallel branches writing to the same run

As long as all steps agree on the runId, they share the same source of truth.

## Limitations and trade-offs
FlowState is intentionally constrained.
It solves a very specific problem:
#### sharing mutable state across steps of a single workflow run.
Everything outside that scope is either unsupported or explicitly avoided.
### No durability guarantees
FlowState is an in-memory service.
If the process restarts, state is lost.
This is not a bug — it is a trade-off.

FlowState is designed for:
  - short to medium-lived executions
  - workflows that can be retried or restarted
  - state that can be recomputed if necessary

If you need strong durability, versioning, or historical replay, a database is the right tool.

### No global coordination
State is run-scoped.
FlowState does not:
  - coordinate between runs
  - synchronize multiple workflows
  - provide cross-run locking or transactions

This keeps the model simple and avoids turning FlowState into a distributed system.

### No built-in concurrency control
FlowState does not attempt to solve concurrent writes in a general way.
Conflicts are handled at run creation time (onConflict: resume | replace), not at the field or operation level.
This is sufficient for:
  - deterministic workflows
  - controlled execution graphs
  - idempotent append-style mutations

It is not suitable for high-contention shared state.

### No query language
FlowState exposes a minimal HTTP API.
You can:
  - read the full state
  - mutate known paths
  - append structured data

You cannot:
  - run complex queries
  - filter historical data
  - aggregate across runs

This is a deliberate choice to keep the surface area small.

### Explicit lifecycle management
State expires via TTL.
There is no:
  - archival
  - backup
  - recovery mechanism

Once expired, a run is gone.

This forces workflows to:
  - complete or fail decisively
  - treat state as ephemeral
  - avoid silent accumulation

### Trade-off summary
By accepting these limitations, FlowState remains:
  - small
  - understandable
  - auditable
  - hard to misuse
  - easy to replace

FlowState is not meant to be foundational infrastructure.

It is a supporting tool — something you can depend on without building your system around it.

## Why I’m sharing this
FlowState started as a very personal solution.
I wasn’t trying to build a product, a startup, or a new platform.
I was trying to remove friction from my own workflows.

While building complex automations — especially involving LLMs and multi-step content generation — I kept running into the same problem:
 stateless tools are elegant, but they push accidental complexity onto the workflow itself.

Instead of expressing what should happen, I spent time fighting how state was threaded through nodes, loops, and merges.

So I built the smallest thing that could solve that problem.

What surprised me wasn’t that it worked —
 it was how often I reached for it once it existed.

### What I learned
Stateless systems are great — until you need controlled, scoped mutability.

Externalizing state can simplify workflows instead of complicating them.

Strict constraints are not a limitation; they are what keep a tool usable.

Small services with clear boundaries age better than “flexible” abstractions.

Most importantly:
 you don’t always need a bigger platform — sometimes you need a sharper tool.

### Why it might help others
If you are:
  - using n8n, Temporal, or other stateless orchestrators
  - building LLM-heavy or iterative workflows
  - tired of brittle loops, merges, and item juggling
  - looking for something lightweight you can run yourself

Then FlowState might save you some time — or at least give you a different way to think about state.
And if you don’t end up using it, I still hope the design approach is useful.

## What’s next (maybe)
FlowState is intentionally small, and I want to keep it that way.
That said, a few directions seem worth exploring — carefully:
  - Authentication / access control, if it ever needs to be exposed beyond a private network
  - Better observability, mostly for debugging and introspection
  - Optional persistence, strictly opt-in, for specific use cases
  - Stronger typing and validation, to make misuse even harder

None of these are commitments.

The value of FlowState comes from its constraints.
 Any evolution has to preserve that — or it’s probably not worth doing.

If FlowState stops being useful, it should be easy to replace.
 That’s not a failure — that’s the design working as intended.