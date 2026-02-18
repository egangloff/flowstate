# FlowState

**FlowState** is a lightweight, self-hosted, in-memory state manager designed for **stateless workflow engines** such as **n8n**, LLM pipelines, and multi-step automation systems.

It solves a common problem:  
👉 *how to keep and mutate state across workflow steps without hacks, merges, or brittle loops.*

---

## ✨ Why FlowState?

Workflow engines like n8n are intentionally **stateless**.  
This becomes painful when you need to:

- accumulate markdown or text across steps
- keep an index or cursor in a loop
- preserve context between multiple LLM calls
- avoid item explosion and merge nodes
- build long-form content step by step

**FlowState externalizes state** into a simple HTTP service so your workflows stay clean and predictable.

---

## 🎯 What FlowState Is (and Is Not)

### ✅ What it is
- In-memory state manager
- HTTP API
- Run-scoped state (`runId`)
- Append / patch / read / delete state
- TTL-based lifecycle
- Docker-friendly
- Simple and fast

### ❌ What it is not
- A database
- A queue
- A workflow engine
- A persistence layer
- A UI product (for now)

---

## 🧠 Core Concept

Each workflow run gets a **state object** identified by a `runId`.

## State format (v1)

FlowState uses a **versioned, JSON-only, state object** designed to be:
- LLM-friendly
- n8n-friendly
- extensible
- media-agnostic
- safe (no magic, no implicit merges)

> ⚠️ **This format is locked for v1.**  
> Backward compatibility is guaranteed within the v1 range.

---

### High-level structure
FlowState distinguishes between:
  - the State Object (domain model, persisted in memory)
  - the API Response Envelope (transport wrapper)
  
#### API Response Envelope
All HTTP endpoints return a response wrapped with a runId.
```json
{
  "runId": "string",
  "state": { /* FlowState object */ }
}
```
  - runId is used to reference the state in subsequent calls
  - state contains the actual FlowState data

#### State Object (v1)
This is the internal state model managed by FlowState.
It is the object that is mutated, patched, appended to, and consumed by workflows and LLMs.

```json
{
  "meta": {},
  "context": {},
  "assets": {},
  "sections": [],
  "output": {},
  "errors": [],
  "debug": {}
}
```

### Field Definitions

#### meta
Metadata describing the lifecycle of the run.
```json
{
  "id": "run-uuid",
  "version": 1,
  "createdAt": 1700000000000,
  "updatedAt": 1700000123456,
  "step": 0,
  "status": "running"
}
```
version is mandatory=
step controls iteration
status: running | done | error

#### Context
High-level configuration and intent of the run.
```json
{
  "engine": "n8n",
  "n8n": {
    "executionId": "123456",
    "workflowId": "789",
    "workflowName": "Article Generator"
  },
  "topic": "AI consciousness",
  "language": "en",
  "tone": "informative",
  "audience": "general",
  "voiceId": "alloy-en-1",
  "imageStyle": "cinematic",
  "llm": {
    "model": "llama3.1",
    "temperature": 0.7
  }
}
```
Rule:
  - engine is mandatory (n8n, airflow, custom, etc.)
  - Engine-specific identifiers (e.g. n8n.executionId) are strongly recommended
  - Usually immutable during a run
  - Arbitrary keys allowed
  - No binary data
  - Must be JSON-serializable
  - Used for:
    - correlation
    - debugging
    - recovery
    - cross-system tracing

🔑 Important
External workflow engines must inject their own execution identifiers into context.
FlowState never assumes or generates external identity.

#### Assets
References to external media generated or used during the run.
```json
{
  "images": [
    {
      "id": "img-1",
      "url": "https://cdn.example.com/image1.png",
      "prompt": "cinematic AI brain",
      "provider": "sdxl"
    }
  ],
  "audio": [
    {
      "id": "aud-1",
      "url": "https://cdn.example.com/voice
```
Rules
Assets are references only
No binary storage
Append or replace explicitly via PATCH

#### Sections
Ordered, append-only content blocks (typically text / markdown).
```json
[
  {
    "id": "sec-1",
    "type": "markdown",
    "content": "# Introduction\nAI is evolving...",
    "createdAt": 1700000012345
  }
]
```
Rules
Append-only
Order is guaranteed
Never implicitly merged or reordered

#### output
Final or intermediate results.
```json
{
  "markdown": "...",
  "html": "...",
  "summary": "...",
  "publishedUrl": null
}
```
Rules
Free-form JSON
Typically written at the end of a run

#### errors
Structured error tracking.
```json
[
  {
    "step": 3,
    "code": "LLM_TIMEOUT",
    "message": "Model did not respond in time",
    "timestamp": 1700000099999
  }
]
```

#### debug
Optional diagnostics for development.
```json
{
  "llmCalls": 4,
  "tokensUsed": 12345,
  "notes": "Retry happened at step 2"
}
```

## 🔌 HTTP API Contract (v1)
### Base URL
```json
http://localhost:3001
```

### POST /state
Create a new state.

Response
```json
{
  "runId": "uuid",
  "state": { ... }
}
```
Guarantees
Always returns a fresh state
runId is unique
State follows v1 format

### GET /state/:runId
Retrieve the full state snapshot.
Guarantees
Read-only
404 if runId does not exist

### PATCH /state/:runId
Merge partial data into the state.
Rules
Only provided top-level fields are updated
Missing fields are untouched
Unknown fields are rejected
No implicit deep merge

### POST /state/:runId/sections
Append a new section.
Request
```json
{
  "type": "markdown",
  "content": "Text content"
}
```
Guarantees
Append-only
Order preserved
Never overwrites existing sections

### DELETE /state/:runId
Destroy the state.
Guarantees
State is removed immediately
Further access returns 404

## 🔎 Retrieve State by Context (v1)
FlowState allows retrieving a state without knowing the runId, by querying its execution context.

This is especially useful for:
  - resuming interrupted workflows
  - correlating external systems (n8n, Airflow, custom engines)
  - recovering state after a crash or restart
  - avoiding manual runId propagation across steps

### POST /state/by-context
Retrieve a state using context identifiers instead of runId.

Request
```json
{
  "engine": "n8n",
  "executionId": "123456"
}
```
Rules
  - engine is mandatory
  - At least one additional context key is required
  - Matching is done against state.context
  - Matching is exact (no partial / fuzzy matching)
  - Returns at most one state
  - If multiple states match, the request fails with 409

Response (200)
```json
{
  "runId": "uuid",
  "state": { /* FlowState object */ }
}
```

## 🔁 State creation & conflict resolution

### POST /state

Create a new state **or resolve an existing one based on context**.

This endpoint is **idempotent by context** when `onConflict` is provided.

---

### Request body

```json
{
  "context": {
    "engine": "n8n",
    "executionId": "123456"
  },
  "onConflict": "resume"
}
```

#### Fields

| Field        | Type   | Required | Description                                    |
| ------------ | ------ | -------- | ---------------------------------------------- |
| `context`    | object | optional | Context used to identify and correlate the run |
| `onConflict` | string | optional | Conflict resolution strategy                   |

#### onConflict values

| Value             | Behavior                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| `error` (default) | Return **409 Conflict** if a state already exists for the same context |
| `resume`          | Return the **existing state**                                          |
| `replace`         | Delete the existing state and **create a new one**                     |

⚠️ Invalid values result in 400 Bad Request.


### Context conflict definition

A conflict occurs when another state already exists with the same context key.

By default, the context key is:

```json
engine + executionId
```

#### Example

```json
{
  "engine": "n8n",
  "executionId": "123456"
}
```

#### Response
```json
{
  "runId": "uuid",
  "state": { ... }
}
```
- runId uniquely identifies the resolved state
- state always follows the FlowState v1 format

### Guarantees
  - No implicit behavior
  - No silent fallback
  - Conflict resolution is explicit and client-controlled
  - Safe for retries, crashes, and workflow restarts

#### Typical usage
n8n – normal run
```json
{ "onConflict": "error" }
```

n8n – retry after crach
```json
{ "onConflict": "resume" }
```

Manuel Restart / Reset
```json
{ "onConflict": "replace" }
```

## Error Model
| Code | Meaning                            |
| ---- | ---------------------------------- |
| 400  | Invalid payload                    |
| 404  | Unknown runId                      |
| 409  | Invalid state mutation             |
| 500  | Internal error (never leaks state) |

## Design Invariants
State is never implicitly merged
Sections are append-only
PATCH never resets other fields
No side effects across runIds
No persistence guarantee
Client controls the workflow logic

## 📜 License
MIT