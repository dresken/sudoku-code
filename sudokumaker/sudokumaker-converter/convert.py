#!/usr/bin/env python3
"""Convert SudokuMaker custom-constraint files between JSON and YAML."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.scalarstring import LiteralScalarString


PREFERRED_KEYS = (
    "formatVersion",
    "name",
    "author",
    "rules",
    "backend",
    "components",
    "input",
)


def ordered_document(value: Any) -> Any:
    """Return *value* with preferred mapping keys moved to the front.

    Mappings retain the original relative order of all keys that are not in
    :data:`PREFERRED_KEYS`. Lists and nested mappings are handled recursively.
    """
    if isinstance(value, Mapping):
        result: dict[Any, Any] = {}
        for key in PREFERRED_KEYS:
            if key in value:
                result[key] = ordered_document(value[key])
        for key, item in value.items():
            if key not in result:
                result[key] = ordered_document(item)
        return result
    if isinstance(value, list):
        return [ordered_document(item) for item in value]
    return value


def literal_code_scalars(value: Any) -> Any:
    """Mark every string value whose property name is ``code`` as literal YAML."""
    if isinstance(value, Mapping):
        result: dict[Any, Any] = {}
        for key, item in value.items():
            if key == "code" and isinstance(item, str):
                result[key] = LiteralScalarString(item)
            else:
                result[key] = literal_code_scalars(item)
        return result
    if isinstance(value, list):
        return [literal_code_scalars(item) for item in value]
    return value


def make_yaml() -> YAML:
    """Create the YAML formatter used for all reads and writes."""
    yaml = YAML(typ="rt")
    yaml.indent(mapping=2, sequence=2, offset=0)
    yaml.width = 2**31 - 1
    yaml.allow_unicode = True
    return yaml


def load_json(path: Path) -> Any:
    """Read a JSON document without changing its mapping order."""
    with path.open("r", encoding="utf-8") as source:
        return json.load(source)


def dump_json(document: Any) -> str:
    """Serialize a JSON document in SudokuMaker-friendly canonical form."""
    return json.dumps(ordered_document(document), ensure_ascii=False, indent=4) + "\n"


def load_yaml(path: Path) -> Any:
    """Read a YAML document using ruamel.yaml's round-trip parser."""
    with path.open("r", encoding="utf-8") as source:
        return make_yaml().load(source)


def dump_yaml(document: Any) -> str:
    """Serialize a document as canonical, human-editable YAML."""
    from io import StringIO

    output = StringIO()
    make_yaml().dump(literal_code_scalars(ordered_document(document)), output)
    return output.getvalue()


def input_format(path: Path) -> str:
    """Return the supported format selected by *path*'s file extension."""
    suffix = path.suffix.lower()
    if suffix == ".json":
        return "json"
    if suffix in {".yaml", ".yml"}:
        return "yaml"
    raise ValueError("input filename must end in .json, .yaml, or .yml")


def default_output_path(input_path: Path) -> Path:
    """Choose the sibling file path for the opposite representation."""
    return input_path.with_suffix(".yaml" if input_format(input_path) == "json" else ".json")


def convert(input_path: Path, output_path: Path | None = None) -> Path:
    """Convert *input_path* and write the result, returning its path."""
    source_format = input_format(input_path)
    target_path = output_path or default_output_path(input_path)
    document = load_json(input_path) if source_format == "json" else load_yaml(input_path)
    rendered = dump_yaml(document) if source_format == "json" else dump_json(document)
    target_path.write_text(rendered, encoding="utf-8")
    return target_path


def canonical_yaml(path: Path) -> str:
    """Return YAML after the same YAML → JSON → YAML round trip as the CLI."""
    document = load_yaml(path)
    json_document = json.loads(dump_json(document))
    return dump_yaml(json_document)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check", action="store_true", help="fail if YAML is not canonical")
    action.add_argument("--format", action="store_true", help="rewrite YAML in canonical form")
    parser.add_argument("input", type=Path, help="JSON or YAML input file")
    parser.add_argument("output", nargs="?", type=Path, help="optional output path")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    """Run the command-line converter."""
    args = parse_args(argv)
    try:
        if args.check or args.format:
            if input_format(args.input) != "yaml":
                raise ValueError("--check and --format require a YAML input file")
            if args.output is not None:
                raise ValueError("--check and --format do not accept an output path")
            formatted = canonical_yaml(args.input)
            original = args.input.read_text(encoding="utf-8")
            if args.check:
                if original != formatted:
                    print(f"{args.input}: not canonically formatted", file=sys.stderr)
                    return 1
                return 0
            args.input.write_text(formatted, encoding="utf-8")
            return 0

        output = convert(args.input, args.output)
        print(output)
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
