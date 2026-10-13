"""Lean mini-probe: source_url guards + round-trip (no full sweep)."""
import json
import time
from pathlib import Path

import genlayer_py.accounts as accounts
from genlayer_py.chains import studionet
from genlayer_py.client.client import create_client

HERE = Path(__file__).resolve().parent.parent
WALLET_ENV = Path(r"D:\Genlayer-project\wallet\.env")


def receipt(client, tx: str) -> str | None:
    last = object()
    stable = 0
    for _ in range(60):
        try:
            d = dict(client.get_transaction(tx))
            lr = ((d.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
            ex = lr.get("execution_result")
            if ex is not None and d.get("status") == last:
                stable += 1
                if stable >= 2:
                    return ex
            else:
                stable = 0
            last = d.get("status")
        except Exception:
            pass
        time.sleep(10)
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
        got = receipt(client, tx)
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
