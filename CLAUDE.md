# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**neo-deep-agent-lab** — A conversational SQL agent with sandboxed execution, context engineering, and human-in-the-loop (HITL). Built with LangChain/LangGraph, FastAPI, React 19, and Modal sandboxes against ParadeDB (PostgreSQL 17 + pgvector + pg_search/BM25).

## Commands

```bash
# Install
make install          # pip install -e ".[dev]"
make install-front    # cd frontend && npm install

# Database (ParadeDB on port 17)
make db               # docker-compose up -d
make db-down          # stop
make db-reset         # destroy volume + restart

# Run
make dev              # parallel: FastAPI :8080 + Vite :5173
make serve            # FastAPI only (:8080)
make front            # Vite only (:5173)
make cli              # Rich terminal chat
make down             # kill processes on :5173 and :8080

# Quality
make test             # pytest tests/ -v
make lint             # ruff check src/ tests/ + format check
make format           # ruff --fix + ruff format

# Database utilities
make dump             # export → data/neo_dump.sql
alembic upgrade head  # run migrations
```

## Architecture

**Monorepo:** `src/` (Python backend) + `frontend/` (React SPA) + `tests/` (pytest)

### Backend (`src/`)

- **`agent/factory.py`** — `create_sql_agent()` builds a LangGraph `CompiledStateGraph` with a 7-layer middleware stack and 8 tools. This is the central orchestration point.
- **`agent/prompts.py`** — System prompt (in French) with scratchpad guidelines.
- **`server/app.py`** — FastAPI app (~26KB). SSE streaming via `/chat`, HITL via `/resume`, context CRUD, provider switching, document upload.
- **`config.py`** — Pydantic settings loading ~60 env vars. All configuration flows through here.
- **`constants.py`** — Enums: `LLMProvider`, `SSEEventType`, `SQLKeyword`.

### Middleware Stack (applied in order in `factory.py`)

1. `sql_guard` — blocks DDL/DML (DROP, DELETE, INSERT, UPDATE, ALTER, etc.)
2. `ToolRetryMiddleware` — 2x backoff on tool failures
3. `ToolCallLimitMiddleware` — max 20 tool calls per run
4. `schema_cache` — caches `get_database_schema` results via `@wrap_tool_call`
5. `inject_context` — `@dynamic_prompt` enriches system prompt with schema + user context + scratchpad + recalled memories
6. `ContextEditingMiddleware` — clears old tool results when >80k tokens
7. `ModelRetryMiddleware` / `ModelFallbackMiddleware` — 3x backoff, optional fallback LLM

### Context Engineering (`src/context/`)

Write → Select → Compress → Isolate pattern:
- **`store.py`** — `ContextStore` dataclass (schema_cache, user_context, scratchpad, summary)
- **`hybrid_search.py`** — Reciprocal Rank Fusion: pgvector cosine (0.6) + BM25 (0.4)
- **`pg_sync.py`** — Sync wrappers for async Postgres operations
- **`thread_var.py`** — `ContextVar` for thread_id propagation

### Sandbox (`src/sandbox/`)

Ephemeral Modal containers with PostgreSQL 15 (read-only user, 10s statement timeout). `app.py` manages lifecycle as a singleton with auto-recreate on stale. Chart and analysis scripts are baked into the image.

### Tools (`src/tools/`) — 8 LangChain tools

`execute_sql`, `get_database_schema`, `export_csv`, `export_json`, `generate_chart`, `analyze_query`, `write_scratchpad`, `persist_context`. All inputs use Pydantic v2 strict schemas.

### Streaming (`src/streaming/`)

LangGraph events → SSE via `sse_encoder.py`. Event types: `text-delta`, `tool-call-start`, `tool-call-end`, `interrupt-request`, `error`, `done`, `metrics`.

### Frontend (`frontend/src/`)

- **State:** 8 Zustand stores (`stores/`): chat, context, session, agents, providers, hitl, documents, middleware
- **Layout:** `App.tsx` → Header + ChatPanel + RightSidebar (context/scratchpad) + HitlModal
- **API:** `lib/api.ts` — fetch wrapper with Bearer token auth
- **Proxy:** Vite proxies all `/api/*`, `/chat`, `/context`, etc. to `localhost:8080`

## Conventions

- **Python:** Ruff (line-length 100, target py311, rules E/F/I/W). Pyright for type checking.
- **Commits:** Conventional commits enforced by pre-commit hook — `<type>(<scope>): <subject>` (feat, fix, chore, docs, style, refactor, perf, test).
- **Branches:** Must start with `feat/`, `fix/`, `hotfix/`, `chore/`, or `docs/`.
- **LLM providers:** Hot-swappable via `LLM_PROVIDER` env var or `/provider` API endpoint (anthropic, openai, ollama).
- **Environment:** Copy `.env.example` → `.env`. Requires at minimum: Modal credentials + one LLM API key + DATABASE_URL (default `postgresql://postgres:postgres@localhost:17/neo_agent`).
