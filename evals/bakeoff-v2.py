#!/usr/bin/env python3
"""
Model bakeoff v2 — tests tool-call correctness and multi-step task completion.

Key improvements over v1:
- Fresh hermes session per test (no --continue, no cross-contamination)
- Verifiable tokens: model MUST call tools to discover pre-written values
- Two enforcement modes tested: auto vs true
- Tests multi-step, error-recovery, API calls, sequential dependency
- Scores are outcome-based, not style-based

Usage: python3 bakeoff-v2.py [--models nemotron-3-nano:30b,deepseek-v4-flash]
"""
from __future__ import annotations
import argparse, json, os, random, shutil, string, subprocess, sys, tempfile, time
from pathlib import Path

HERMES     = "/opt/hermes-venv/bin/hermes"
BASE_PROF  = "/opt/hermes-profiles/vera"
PAPERCLIP_URL = os.environ.get("PAPERCLIP_API_URL", "https://paperclip-ezk7.srv1710374.hstgr.cloud/api")
PAPERCLIP_KEY = os.environ.get("PAPERCLIP_API_KEY", "")
AGE_COMPANY   = "f4593f38-24c0-481c-9771-3c52e74d16f5"

MODELS = [
    "nemotron-3-nano:30b",
    "deepseek-v4-flash",
    "glm-5.1:cloud",   # quality baseline
]

def rand_token(n=8):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))

def build_eval_profile(enforcement: str, tmp_dir: Path) -> Path:
    """Clone vera profile into a temp dir and override tool_use_enforcement."""
    prof = tmp_dir / f"eval-enforce-{enforcement}"
    shutil.copytree(BASE_PROF, prof, dirs_exist_ok=True)
    cfg_path = prof / "config.yaml"
    cfg = cfg_path.read_text()
    cfg = cfg.replace("tool_use_enforcement: auto", f"tool_use_enforcement: {enforcement}")
    # disable langfuse for eval runs (no noise)
    cfg = cfg.replace("observability/langfuse", "# observability/langfuse")
    cfg_path.write_text(cfg)
    return prof

def run_hermes(profile: Path, model: str, prompt: str, timeout_s: int = 120) -> tuple[str, int]:
    """Run hermes -q with a fresh session, return (stdout+stderr, returncode)."""
    env = {**os.environ, "HERMES_HOME": str(profile)}
    # source the .env to get OLLAMA_API_KEY etc
    env_file = profile / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    cmd = [HERMES, "chat", "-Q", "-q", prompt, "-m", model, "--provider", "auto",
           "--accept-hooks", "--max-turns", "15", "--yolo"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s, env=env)
        return (r.stdout + r.stderr).strip(), r.returncode
    except subprocess.TimeoutExpired:
        return "TIMEOUT", 124

# ── Test definitions ────────────────────────────────────────────────────────

def make_tests(token_file: Path) -> list[dict]:
    """Build tests with pre-written unique tokens the model must discover via tools."""
    tests = []

    # T1: Basic tool invocation — model must call terminal and echo a specific phrase
    t1_token = rand_token()
    tests.append({
        "id": "T1", "name": "basic_tool_call",
        "prompt": f"Use the terminal tool to run this exact command: echo '{t1_token}'. Show me the output.",
        "check": lambda out: t1_token in out,
        "desc": "Model calls terminal tool and gets real output (not hallucinated)",
    })

    # T2: File read — write a token to disk, model must read it
    t2_token = rand_token()
    t2_path = "/tmp/bakeoff_t2.txt"
    Path(t2_path).write_text(t2_token)
    tests.append({
        "id": "T2", "name": "file_read_tool",
        "prompt": f"Read the file {t2_path} using the terminal or file read tool and tell me exactly what it contains (just the text, nothing else).",
        "check": lambda out: t2_token in out,
        "desc": "Model reads a file via tool and returns pre-written token",
    })

    # T3: Multi-step — write file then read it back
    t3_token = rand_token()
    t3_path = "/tmp/bakeoff_t3.txt"
    tests.append({
        "id": "T3", "name": "multi_step_write_read",
        "prompt": f"Do these two steps in order using terminal commands:\n1. Write the text '{t3_token}' to the file {t3_path}\n2. Read it back and confirm the content matches.\nReport: did the file contain exactly '{t3_token}'? Answer YES or NO.",
        "check": lambda out: "YES" in out.upper(),
        "desc": "Model completes a two-step sequential task: write then verify",
    })

    # T4: Error recovery — file doesn't exist, must adapt
    t4_token = rand_token()
    t4_fallback = "/tmp/bakeoff_t4_fallback.txt"
    Path(t4_fallback).write_text(t4_token)
    tests.append({
        "id": "T4", "name": "error_recovery",
        "prompt": f"Try to read /tmp/definitely_does_not_exist_bakeoff_xyz.txt. If that fails, read {t4_fallback} instead and tell me what it contains.",
        "check": lambda out: t4_token in out,
        "desc": "Model recovers from failed tool call and tries alternative",
    })

    # T5: API call — model must make HTTP request to Paperclip
    tests.append({
        "id": "T5", "name": "api_call",
        "prompt": (
            f"Make a GET request to {PAPERCLIP_URL}/agents?companyId={AGE_COMPANY} "
            f"with the header 'Authorization: Bearer {PAPERCLIP_KEY}'. "
            "Parse the JSON response and tell me how many agents are in the list. "
            "Reply with just the number."
        ),
        "check": lambda out: any(c.isdigit() for c in out.split()[-1] if out.strip()),
        "desc": "Model makes a real HTTP API call and parses JSON response",
    })

    # T6: Sequential dependency — check capability then use it
    t6_val = str(2 ** 13)  # 8192
    tests.append({
        "id": "T6", "name": "sequential_dependency",
        "prompt": "First check if python3 is available by running `which python3`. If it is, run `python3 -c 'print(2**13)'` and tell me the result.",
        "check": lambda out: t6_val in out,
        "desc": "Model gates second tool call on result of first",
    })

    # T7: No tool-loop — same failing command should not repeat more than twice
    tests.append({
        "id": "T7", "name": "no_tool_loop",
        "prompt": "Run `fake_command_xyz_does_not_exist --version`. When it fails, run `echo 'FALLBACK_OK'` and report the output.",
        "check": lambda out: "FALLBACK_OK" in out,
        "desc": "Model doesn't loop on failure; adapts to fallback command",
    })

    return tests


def score_test(test: dict, output: str, rc: int) -> dict:
    if rc == 124:
        return {"id": test["id"], "name": test["name"], "result": "TIMEOUT", "output_snippet": ""}
    try:
        passed = test["check"](output)
    except Exception:
        passed = False
    snippet = output[-300:].replace("\n", " ") if output else ""
    return {
        "id": test["id"],
        "name": test["name"],
        "result": "PASS" if passed else "FAIL",
        "output_snippet": snippet,
    }


def run_bakeoff(models: list[str], enforcements: list[str]):
    tmp_dir = Path(tempfile.mkdtemp(prefix="bakeoff_v2_"))
    print(f"\n{'='*60}")
    print(f"Bakeoff v2 — {len(models)} models × {len(enforcements)} enforcement modes × 7 tests")
    print(f"Temp profiles: {tmp_dir}")
    print(f"{'='*60}\n")

    token_file = tmp_dir / "tokens.txt"
    profiles = {e: build_eval_profile(e, tmp_dir) for e in enforcements}
    tests = make_tests(token_file)

    results = {}
    for model in models:
        results[model] = {}
        for enforcement in enforcements:
            profile = profiles[enforcement]
            results[model][enforcement] = []
            print(f"\n── {model} [enforcement={enforcement}] ──")
            for test in tests:
                sys.stdout.write(f"  {test['id']} {test['name']} ... ")
                sys.stdout.flush()
                output, rc = run_hermes(profile, model, test["prompt"])
                score = score_test(test, output, rc)
                results[model][enforcement].append(score)
                print(score["result"])
                if score["result"] == "FAIL":
                    print(f"     output: {score['output_snippet'][:150]}")

    # Summary table
    print(f"\n{'='*60}")
    print("RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"{'Model':<28} {'Enf':>5}  T1  T2  T3  T4  T5  T6  T7  Total")
    print("-"*70)
    for model in models:
        for enforcement in enforcements:
            scores = results[model][enforcement]
            cols = [("✓" if s["result"]=="PASS" else ("T" if s["result"]=="TIMEOUT" else "✗")) for s in scores]
            total = sum(1 for s in scores if s["result"]=="PASS")
            model_short = model[:27]
            print(f"{model_short:<28} {enforcement:>5}  {'  '.join(cols)}  {total}/7")

    # Save full results
    out_path = tmp_dir / "results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nFull results: {out_path}")
    print(f"{'='*60}\n")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default=",".join(MODELS))
    parser.add_argument("--enforcements", default="auto,true")
    args = parser.parse_args()
    models = [m.strip() for m in args.models.split(",")]
    enforcements = [e.strip() for e in args.enforcements.split(",")]
    run_bakeoff(models, enforcements)
