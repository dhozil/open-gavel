"""Deploy the OpenGavel contract with the shared dev wallet.

The key is read at runtime from D:\\Genlayer-project\\wallet\\.env
(GENLAYER_DEV_KEY) and never passes through argv, logs, or tracked files.
Follows the same pattern as D:\\Genlayer-project\\wallet\\deploy.py.

    python scripts/deploy_opengavel.py
"""

import json
import time
from pathlib import Path

import genlayer_py.accounts as accounts
from genlayer_py.chains import studionet
from genlayer_py.client.client import create_client

HERE = Path(__file__).resolve().parent.parent
WALLET_ENV = Path(r"D:\Genlayer-project\wallet\.env")
CONTRACT = HERE / "contracts" / "opengavel.py"
OUT = HERE / "deployed-opengavel.json"


def load_key() -> str:
    for line in WALLET_ENV.read_bytes().split(b"\n"):
        if line.startswith(b"GENLAYER_DEV_KEY="):
            return line.split(b"=", 1)[1].decode("utf-8").strip()
    raise SystemExit(f"no GENLAYER_DEV_KEY in {WALLET_ENV}")


def main() -> None:
    key = load_key()
    account = accounts.create_account(key)
    print("deployer :", account.address)
    print("contract :", CONTRACT.name)

    client = create_client(chain=studionet, account=account)
    try:
        print("balance  :", client.get_balance(account.address))
    except Exception as exc:
        print("balance  : unavailable —", exc)

    code = CONTRACT.read_text()
    print(f"deploying {len(code)} bytes ...")
    tx_hash = client.deploy_contract(code)
    print("tx hash  :", tx_hash)

    address, status = None, None
    for _ in range(60):
        time.sleep(10)
        try:
            receipt = dict(client.get_transaction_receipt(tx_hash))
        except Exception as exc:
            print("  receipt not ready —", str(exc)[:100])
            continue
        address, status = receipt.get("to"), receipt.get("status")
        if address:
            break
    print("address  :", address)
    print("status   :", status)
    if not address or status != 1:
        raise SystemExit("deploy did not complete — inspect with `genlayer receipt` / `genlayer trace`")

    try:
        schema = client.get_contract_schema(address)
        methods = schema.get("methods", []) if isinstance(schema, dict) else []
        print(f"schema   : {len(methods)} methods")
    except Exception as exc:
        print("schema   : FAILED —", exc)

    OUT.write_text(json.dumps(
        {"network": "studionet", "deployer": account.address,
         "contract": "OpenGavel", "address": address, "tx": tx_hash},
        indent=2) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
