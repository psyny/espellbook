.PHONY: default help env install clean clean-kernel clean-all \
	generate-catalog generate-html generate-symbols generate-check-symbols generate-all

SHELL := /bin/sh

PY ?= python3
VENV := venv
PIP := $(VENV)/bin/pip
PYBIN := $(VENV)/bin/python
REQ := requirements.txt

default: help

help:
	@echo "make env                     -> create virtualenv (uses $(PY))"
	@echo "make install                 -> install dependencies from $(REQ)"
	@echo "make generate-catalog        -> run generate_spell_catalog.py"
	@echo "make generate-html           -> run generate_html.py"
	@echo "make generate-symbols        -> run generate_processed_symbols.py"
	@echo "make generate-check-symbols  -> run generate_check_symbols.py"
	@echo "make generate-all            -> run the full pipeline (catalog -> html)"
	@echo "make clean                   -> cleanup pyc and caches"
	@echo "make clean-kernel            -> remove the virtualenv"
	@echo "make clean-all               -> clean + clean-kernel"

env:
	$(PY) -m venv $(VENV)

install: env
	$(PIP) install --upgrade pip
	$(PIP) install -r $(REQ)

# Cleanup
clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true

clean-kernel:
	rm -rf $(VENV)

clean-all: clean clean-kernel

# Generators
# Step 1: parse raw spell markdown into database/spells/processed/spells.json
generate-catalog:
	$(PYBIN) generate_spell_catalog.py

# Step 2: build the self-contained spellbook.html from the processed catalog
generate-html:
	$(PYBIN) generate_html.py

# Process raw sigil SVGs into cleaned SVGs plus metadata JSON
generate-symbols:
	$(PYBIN) generate_processed_symbols.py

# Render check SVGs overlaying topology slots on the base sigil art
generate-check-symbols:
	$(PYBIN) generate_check_symbols.py

# Full spellbook pipeline: catalog then html
generate-all: generate-catalog generate-html
