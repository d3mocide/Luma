.PHONY: lock lock-dev install install-dev

# Regenerate lock files — run with Python 3.12 to match CI
lock:
	pip-compile pyproject.toml --generate-hashes --allow-unsafe --output-file requirements.lock

lock-dev:
	pip-compile pyproject.toml --extra dev --generate-hashes --allow-unsafe --output-file requirements-dev.lock

# Install from hashed lock files (matches CI)
install:
	pip install --require-hashes -r requirements.lock && pip install --no-deps -e .

install-dev:
	pip install --require-hashes -r requirements-dev.lock && pip install --no-deps -e .
