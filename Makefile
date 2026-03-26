.PHONY: dump serve cli test lint install modal-setup format db db-down db-reset front dev down

install:
	pip install -e ".[dev]"

install-front:
	cd frontend && npm install

# ── Database (ParadeDB: pgvector + pg_search/BM25) ───────────────────

db:
	docker compose up -d
	@echo "ParadeDB running on port 17"

db-down:
	docker compose down

db-reset:
	docker compose down -v
	docker compose up -d
	@echo "ParadeDB reset (fresh volume)"

dump:
	bash scripts/dump_neo_db.sh

# ── Run ───────────────────────────────────────────────────────────────

serve:
	set -a && source .env && set +a && python -m src.server.app

cli:
	set -a && source .env && set +a && python -m src.cli.chat

front:
	cd frontend && npm run dev

down:
	@echo "Killing processes on :5173 and :8080..."
	@lsof -ti:5173 -ti:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
	@echo "Done."

dev:
	@echo "Cleaning ports 5173 & 8080..."
	@lsof -ti:5173 -ti:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
	@sleep 0.5
	@echo "Starting backend (FastAPI :8080) + frontend (Vite :5173)..."
	@trap 'kill 0' EXIT; \
	(set -a && source .env && set +a && python -m src.server.app) & \
	(cd frontend && npm run dev -- --port 5173 --strictPort) & \
	wait

build-front:
	cd frontend && npm run build

# ── Quality ───────────────────────────────────────────────────────────

test:
	pytest tests/ -v

lint:
	ruff check src/ tests/
	ruff format --check src/ tests/

format:
	ruff check --fix src/ tests/
	ruff format src/ tests/

# ── Setup ─────────────────────────────────────────────────────────────

modal-setup:
	modal token new
