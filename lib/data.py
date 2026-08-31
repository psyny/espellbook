import json
from pathlib import Path


def load_database_rules(root_dir):
    rules_dir = Path(root_dir) / "database" / "rules"
    if not rules_dir.exists():
        return {}
    rules = {}
    for path in rules_dir.glob("*.json"):
        rules[path.stem] = json.loads(path.read_text(encoding="utf-8"))
    return rules


def load_database_classes(root_dir):
    classes_dir = Path(root_dir) / "database" / "classes"
    if not classes_dir.exists():
        return {}
    classes = {}
    for path in classes_dir.glob("*.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        key = path.stem.lower()
        classes[key] = data
    return classes


def load_templates(root_dir):
    template_dir = Path(root_dir) / "template" / "default"
    index_html = (template_dir / "index.html").read_text(encoding="utf-8")
    css = (template_dir / "style.css").read_text(encoding="utf-8")
    js = (template_dir / "script.js").read_text(encoding="utf-8")
    return index_html, css, js
