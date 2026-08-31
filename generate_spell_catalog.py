#!/usr/bin/env python3
"""Parse raw spell markdown into a processed JSON catalog with stable IDs."""

from pathlib import Path

from lib.catalog import build_spell_catalog


ROOT_DIR = Path(__file__).parent.resolve()


def main():
    catalog_path = build_spell_catalog(ROOT_DIR)
    print(f"Generated spell catalog: {catalog_path}")


if __name__ == "__main__":
    main()
