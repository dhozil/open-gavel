from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded

RULES = """R1 - No hate speech or slurs targeting protected groups.
R2 - No threats, harassment, or doxxing.
R3 - No spam, scams, or malicious links.
R4 - No explicit sexual content involving minors (zero tolerance).
R5 - Be civil: no insults in heated debate, attack ideas not people."""


def test_community_lifecycle():
    factory = get_contract_factory("OpenGavel")
    contract = factory.deploy(args=[])

    tx = contract.create_community(args=["general", "General", RULES]).transact()
    assert tx_execution_succeeded(tx)

    community = contract.get_community(args=["general"]).call()
    assert community["version"] == 1
    assert "R1" in community["rules_text"]

    tx = contract.report_content(
        args=["general", "I disagree with your proposal because the budget numbers look wrong.", "alice", "forum post, no prior strikes", "", "", ""]
    ).transact()
    assert tx_execution_succeeded(tx)

    cases = contract.list_cases(args=["general", 20]).call()
    assert len(cases) == 1
    case_id = cases[0]["case_id"]

    tx = contract.moderate_case(args=[case_id]).transact()
    assert tx_execution_succeeded(tx)

    case = contract.get_case(args=[case_id]).call()
    assert case["status"] == "DECIDED"
    assert case["verdict"] in ("ALLOW", "WARN", "REMOVE", "BAN", "ESCALATE")

    tx = contract.appeal_case(args=[case_id, "I believe this was civil disagreement, please re-check against R5."]).transact()
    assert tx_execution_succeeded(tx)

    appealed = contract.get_case(args=[case_id]).call()
    assert appealed["appeal_count"] == 1
