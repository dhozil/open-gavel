"""Lean mini-probe: source_url guards + round-trip (no full sweep)."""
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import genlayer_py.accounts as accounts
from genlayer_py.chains import studionet
from genlayer_py.client.client import create_client

HERE = Path(__file__).resolve().parent.parent
WALLET_ENV = Path(r"D:\Genlayer-project\wallet\.env")
EXE = shutil.which("genlayer.cmd") or shutil.which("genlayer")
PW = (os.environ.get("OG_READER_PW", "reader4321") + "\n") * 3
EXEC_RE = re.compile(r"execution_result:\s*'(\w+)'")


def receipt(tx: str) -> str | None:
    for _ in range(6):
        p = subprocess.run([EXE, "receipt", tx], input=PW, capture_output=True,
                           text=True, timeout=600)
        m = EXEC_RE.search((p.stdout or "") + (p.stderr or ""))
        if m:
            return m.group(1)
        time.sleep(15)
    return None


def main() -> None:
    key = next(
        line.split(b"=", 1)[1].decode("utf-8").strip()
        for line in WALLET_ENV.read_bytes().split(b"\n")
        if line.startswith(b"GENLAYER_DEV_KEY=")
    )
    account = accounts.create_account(key)
    client = create_client(chain=studionet, account=account)
    address = json.loads((HERE / "deployed-opengavel.json").read_text())["address"]
    ok = True

    def check(label, method, args, want):
        nonlocal ok
        tx = client.write_contract(address, method, account=account, args=args)
        time.sleep(45)
        got = receipt(tx)
        good = (got != "SUCCESS") if want == "fail" else (got == "SUCCESS")
        print(f"[{'PASS' if good else 'FAIL'}] {label} exec={got}")
        ok = ok and good

    check("probe community", "create_community",
          ["probegarden", "Probe Garden",
           "R1 - No spam posts here at all ever. R2 - Be kind to all members."], "ok")
    check("bad source scheme", "report_content",
          ["probegarden", "hello world here", "bob", "ctx", "", "", "ftp://x/y"], "fail")
    check("long source", "report_content",
          ["probegarden", "hello world here", "bob", "ctx", "", "", "https://example.com/" + "p" * 2000], "fail")
    check("source stored", "report_content",
          ["probegarden", "hello world here", "bob", "ctx", "", "", "https://example.com"], "ok")
    case = client.read_contract(address, "get_case", ["probegarden-2"])
    good = case.get("source_url") == "https://example.com"
    print(f"[{'PASS' if good else 'FAIL'}] source round-trip {case.get('source_url')}")
    ok = ok and good
    print("MINI-PROBE " + ("PASSED" if ok else "FAILED"))
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
