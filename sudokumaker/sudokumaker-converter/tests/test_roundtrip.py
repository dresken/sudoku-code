"""End-to-end tests using real SudokuMaker exports."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
CONVERTER = PROJECT_DIR / "convert.py"
FIXTURES = (
    "Constraint Icons.json",
    "Almost non-consecutive.json",
    "Index Lines.json",
)


class RoundTripTests(unittest.TestCase):
    """Verify JSON/YAML conversion against representative constraint exports."""

    def test_json_yaml_json_round_trip(self) -> None:
        for fixture_name in FIXTURES:
            with self.subTest(fixture=fixture_name), tempfile.TemporaryDirectory() as directory:
                workdir = Path(directory)
                source = PROJECT_DIR / "tests" / fixture_name
                json_path = workdir / fixture_name
                json_path.write_bytes(source.read_bytes())

                yaml_path = workdir / "constraint.yaml"
                result = self.run_converter(json_path, yaml_path)
                self.assertEqual(result.returncode, 0, result.stderr)
                yaml_text = yaml_path.read_text(encoding="utf-8")
                self.assertIn("code: |", yaml_text)
                self.assertNotIn("\\\\n", yaml_text)

                if fixture_name == "Almost non-consecutive.json":
                    self.assertIn("components:", yaml_text)
                    self.assertIn("function* update", yaml_text)
                if fixture_name == "Index Lines.json":
                    self.assertIn("const SQUARE_PATH = `", yaml_text)
                if fixture_name == "Constraint Icons.json":
                    self.assertIn("// Configuration", yaml_text)
                    self.assertIn("🚫", yaml_text)

                output_path = workdir / "roundtrip.json"
                result = self.run_converter(yaml_path, output_path)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(
                    json.loads(json_path.read_text(encoding="utf-8")),
                    json.loads(output_path.read_text(encoding="utf-8")),
                )

    def test_format_and_check(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            yaml_path = Path(directory) / "constraint.yaml"
            source = PROJECT_DIR / "tests" / "Index Lines.json"
            self.assertEqual(self.run_converter(source, yaml_path).returncode, 0)
            self.assertEqual(self.run_converter("--check", yaml_path).returncode, 0)
            yaml_path.write_text('name: "Index Lines"\n', encoding="utf-8")
            self.assertEqual(self.run_converter("--check", yaml_path).returncode, 1)
            self.assertEqual(self.run_converter("--format", yaml_path).returncode, 0)

    @staticmethod
    def run_converter(*arguments: str | Path) -> subprocess.CompletedProcess[str]:
        """Run the CLI and collect UTF-8 output."""
        return subprocess.run(
            [sys.executable, str(CONVERTER), *(str(item) for item in arguments)],
            check=False,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
