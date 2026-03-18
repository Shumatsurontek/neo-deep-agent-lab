.PHONY: dump serve cli test lint install modal-setup

install:
	pip install -e ".[dev]"

dump:
	bash scripts/dump_neo_db.sh

serve:
	set -a && source .env && set +a && uvicorn src.server.app:app --reload --port 8080

cli:
	set -a && source .env && set +a && python -m src.cli.chat

test:
	pytest tests/ -v

modal-setup:
	modal token new

lint:
	ruff check src/ tests/
	ruff format --check src/ tests/

format:
	ruff check --fix src/ tests/
	ruff format src/ tests/
