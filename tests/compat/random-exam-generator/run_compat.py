import json
import os
import sys
import zipfile
from pathlib import Path


def _resolve_repo_path():
    if len(sys.argv) >= 2 and sys.argv[1].strip():
        return Path(sys.argv[1].strip())
    env_path = os.environ.get("RANDOM_EXAM_GENERATOR_PATH", "").strip()
    if env_path:
        return Path(env_path)
    return None


def _load_calculator(repo_path):
    sys.path.insert(0, str(repo_path))
    from math_eval import calculate_answer  # type: ignore

    return calculate_answer


def _run_case_tests(calculate_answer):
    cases = [
        (r"\frac{a}{b}", {"a": "10", "b": "2"}, True),
        (r"\sqrt{9.8*b*c}", {"b": "10", "c": "0.5"}, True),
        (r"\tan^{-1}(x)", {"x": "1"}, True),
        (r"\arctanh(x)", {"x": "0.5"}, True),
        (r"\sin", {"x": "1"}, False),
        (r"2x", {"x": "2"}, False),
        (r"x(y+1)", {"x": "2", "y": "3"}, False),
        (r"\log_{2}(x)", {"x": "8"}, False),
        (r"x^4", {"x": "2"}, False),
        (r"x^{4}", {"x": "2"}, True),
        (r"\sec(x)", {"x": "1"}, False),
    ]

    failures = []
    for expr, scope, expected_ok in cases:
        ok = True
        try:
            calculate_answer(expr, scope)
        except Exception:
            ok = False
        if ok != expected_ok:
            failures.append(f"[CASE] {expr}: expected={expected_ok}, actual={ok}")
    return failures


def _run_sample_zip_smoke(calculate_answer, repo_path):
    zip_path = repo_path / "test.zip"
    if not zip_path.exists():
        return [f"[WARN] sample zip not found: {zip_path}"]

    failures = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        json_name = next((n for n in zf.namelist() if n.lower().endswith(".json")), None)
        if not json_name:
            failures.append("[ZIP] no json file in test.zip")
            return failures

        data = json.loads(zf.read(json_name).decode("utf-8"))
        for q in data.get("questions", []):
            qid = q.get("id", "")
            scope = {}
            valid_scope = True
            for v in q.get("variables", []):
                try:
                    mn = float(v.get("min"))
                    mx = float(v.get("max"))
                    scope[v.get("name")] = str((mn + mx) / 2.0)
                except Exception:
                    valid_scope = False
                    break
            if not valid_scope:
                failures.append(f"[ZIP] invalid variable range: {qid}")
                continue
            try:
                calculate_answer(q.get("answer", ""), scope)
            except Exception as e:
                failures.append(f"[ZIP] eval fail: {qid} ({type(e).__name__})")
    return failures


def main():
    repo_path = _resolve_repo_path()
    if not repo_path:
        print("Usage: python tests/compat/random-exam-generator/run_compat.py <random-exam-generator-path>")
        print("   or set RANDOM_EXAM_GENERATOR_PATH")
        return 2
    if not repo_path.exists():
        print(f"Path not found: {repo_path}")
        return 2

    try:
        calculate_answer = _load_calculator(repo_path)
    except Exception as e:
        print(f"Failed to import random-exam-generator parser: {e}")
        return 2

    failures = []
    failures.extend(_run_case_tests(calculate_answer))
    zip_failures = _run_sample_zip_smoke(calculate_answer, repo_path)
    warn_count = 0
    for line in zip_failures:
        if line.startswith("[WARN]"):
            warn_count += 1
            print(line)
        else:
            failures.append(line)

    if failures:
        print("\nCompatibility test FAILED:")
        for f in failures:
            print(f"- {f}")
        return 1

    print("Compatibility test PASSED")
    if warn_count:
        print(f"Warnings: {warn_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
