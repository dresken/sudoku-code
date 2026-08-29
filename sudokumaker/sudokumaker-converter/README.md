# SudokuMaker JSON ↔ YAML Converter

Convert SudokuMaker custom constraints between their exported JSON form and a
Git-friendly YAML form. Every `code` property is written as a YAML literal
block, making embedded JavaScript easy to edit without JSON escape sequences.

## Install

```bash
python -m pip install -r requirements.txt
```

Python 3.12 or later is required. The project uses `ruamel.yaml`, not PyYAML.

## Usage

```bash
# Writes puzzle.yaml beside puzzle.json
python convert.py puzzle.json

# Writes puzzle.json beside puzzle.yaml
python convert.py puzzle.yaml

# Choose the destination explicitly
python convert.py puzzle.json editable-puzzle.yaml
```

YAML output preserves mapping order, moves common SudokuMaker fields to a
predictable order, uses two-space indentation, and does not wrap long lines.
JSON output uses four-space indentation and ends with a newline.

Check or apply the canonical YAML formatting:

```bash
python convert.py --check puzzle.yaml
python convert.py --format puzzle.yaml
```

`--check` exits with status 1 if formatting would change the file.

## Docker / Podman

```bash
podman build -t sudokumaker-converter .

podman run --rm \
  -v "$PWD:/work:Z" \
  sudokumaker-converter \
  /work/puzzle.json
```

The output is written alongside the mounted input file.

## Tests

```bash
python -m unittest discover -s tests -v
```
