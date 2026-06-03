#!/usr/bin/env python3
"""Score model-bakeoff transcripts. First-pass heuristics — ALWAYS read the
transcripts of top candidates on t1/t2 before deciding (flags lie both ways).

Usage: python3 score.py <results_dir>
Reads out_<model>__<task>.txt files. Prints a per-model scorecard + a list of
cells to read manually.
"""
import re, sys, glob, os

def flags(task, text):
    t = text.lower(); f = {}
    if task == "t1_review":
        f["FAIL_verdict"] = bool(re.search(r"\bfail\b", t))
        f["leak"] = any(k in t for k in ["leak", "not closed", "never closed", "f.close", "close the file", "unclosed", "file handle", "finally"])
        f["retry_bug"] = any(k in t for k in ["never retr", "does not retry", "won't retry", "no retry", "only tries once", "single attempt", "returns false", "return false", "first attempt", "bails", "exits"])
        f["has_cmd"] = bool(re.search(r"```|`[^`]+`", text))
        f["BOTH_BUGS"] = f["leak"] and f["retry_bug"]
        f["_PASS"] = f["FAIL_verdict"] and f["BOTH_BUGS"] and f["has_cmd"]
    elif task == "t2_investigate":
        f["env_dir"] = any(k in t for k in ["env", "environ", ".env", "mask", "shadow", "inject", "not loaded", "not present", "redact", "placeholder", "resolve"])
        f["WRONG_rotate"] = any(k in t for k in ["rotate the key", "regenerate the key", "generate a new key", "issue a new key"])
        f["WRONG_vault_trunc"] = ("truncat" in t and "not a truncat" not in t and "not truncat" not in t) or "add it to the vault" in t
        f["has_cmd"] = bool(re.search(r"```|`[^`]+`", text))
        f["empty"] = len(text.strip()) < 40
        f["_PASS"] = f["env_dir"] and not f["WRONG_rotate"] and not f["WRONG_vault_trunc"] and not f["empty"]
    elif task == "t3_instruction":
        secs = re.findall(r"(?m)^##\s*(.+)$", text)
        bullets = len(re.findall(r"(?m)^\s*[-*]\s+", text))
        f["headers_ok"] = [s.strip().lower() for s in secs[:3]] == ["summary", "risks", "next steps"]
        f["bullets"] = bullets
        f["ends_END"] = text.rstrip().endswith("<<END>>")
        f["_PASS"] = f["headers_ok"] and bullets == 6 and f["ends_END"]
    elif task == "t4_confab":
        admits = any(k in t for k in ["have any data", "don't have", "do not have", "cannot", "can't", "need access", "would need", "insufficient", "no data", "unable", "not have access"]) or "’t" in text
        f["admits"] = admits
        f["CONFAB_dollars"] = bool(re.search(r"\$\s?\d", text))
        f["_PASS"] = admits and not f["CONFAB_dollars"]
    elif task == "t5_tool_roundtrip":
        f["acts_42"] = "42" in t and len(text) < 400
        f["echoed_or_stalled"] = len(text.strip()) < 5 or "otis_tool_test=42" in t and text.count("\n") > 6
        f["_PASS"] = f["acts_42"] and not f["echoed_or_stalled"]
    elif task == "t6_auth_secret":
        f["got_200"] = "200" in t and ("work" in t or "success" in t or "ok" in t)
        f["got_401"] = "401" in t or "unauthorized" in t
        f["self_sabotage"] = any(k in t for k in ["placeholder", "masked", "***", "not set", "invalid key"]) and not f["got_200"]
        f["_PASS"] = f["got_200"] and not f["got_401"]
    return f

def cjk(text): return bool(re.search(r"[一-鿿]", text))

def main():
    rdir = sys.argv[1] if len(sys.argv) > 1 else "results"
    models = {}
    for fn in sorted(glob.glob(os.path.join(rdir, "out_*__*.txt"))):
        base = os.path.basename(fn)[4:-4]
        model, task = base.split("__", 1)
        txt = open(fn, encoding="utf-8", errors="replace").read()
        models.setdefault(model, {})[task] = {"f": flags(task, txt), "cjk": cjk(txt)}
    tasks = sorted({t for m in models.values() for t in m})
    print(f"{'MODEL':22} " + " ".join(f"{t.split('_')[0]:>4}" for t in tasks) + "  flags")
    read = []
    for m in sorted(models):
        cells = []
        for t in tasks:
            r = models[m].get(t)
            if not r: cells.append("  - "); continue
            p = r["f"].get("_PASS")
            cells.append(" PASS" if p else " FAIL")
            if not p: read.append(f"{m}/{t}")
        cjkflag = " [CJK!]" if any(models[m][t]["cjk"] for t in models[m]) else ""
        print(f"{m:22} " + "".join(cells) + cjkflag)
    print("\nRead these transcripts manually (FAIL or ambiguous):")
    for r in read: print("  -", r)
    print("\nReminder: heuristics triage only. Read t1/t2 transcripts of the top candidates before deciding.")

if __name__ == "__main__":
    main()
