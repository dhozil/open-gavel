/** Smoke-test the exact read path the frontend uses (genlayer-js + StudioNet). */
import { chains, createClient } from "genlayer-js";

const client = createClient({ chain: chains.studionet, endpoint: "https://studio.genlayer.com/api" });
const address = "0x4708b9Ace6EE163cD2bF77bcDed5f81F33ACA3B6";

const community = await client.readContract({ address, functionName: "get_community", args: ["general"] });
console.log("community:", community.name, "v" + community.version);
const cases = await client.readContract({ address, functionName: "list_cases", args: ["general", 5] });
console.log("cases:", cases.length, "first:", cases[0]?.case_id, cases[0]?.verdict);
const one = await client.readContract({ address, functionName: "get_case", args: [cases[0].case_id] });
console.log("detail:", one.status, one.verdict, "sev=" + one.severity, "rules_v=" + one.rules_version);
console.log("SMOKE_OK");
