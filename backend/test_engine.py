import datetime
import pytest
from pymongo import MongoClient
from safety_engine import decide


@pytest.fixture(scope="module")
def db():
    client = MongoClient("mongodb://localhost:27017")
    return client["meds_crosslink"]


def make_perception(names: list[str], doc_meds: list[str] = [], unreadable: list[str] = []):
    return {
        "identified_items": [
            {"name": n, "identification_basis": "label_text"} for n in names
        ],
        "document_medications": doc_meds,
        "unreadable_or_partial": unreadable,
    }


MARCUS = {
    "patient_id": "PT-9942",
    "past_medical_history": [
        "Severe Essential Hypertension (High Blood Pressure)",
        "Hyperlipidemia (High Cholesterol)",
    ],
}


def test_demo1_contraindication(db):
    """Sudafed + hypertension → BLOCKED High contraindication."""
    result = decide(make_perception(["Pseudoephedrine"]), MARCUS, db)
    assert result.status_tag == "BLOCKED"
    assert len(result.safety_flags) == 1
    assert result.safety_flags[0].type == "contraindication"
    assert result.safety_flags[0].severity == "High"
    assert "Pseudoephedrine" in result.safety_flags[0].drugs_involved


def test_demo2_lethal_interaction(db):
    """Warfarin + Metronidazole → BLOCKED Critical interaction."""
    result = decide(make_perception(["Warfarin", "Metronidazole"]), MARCUS, db)
    assert result.status_tag == "BLOCKED"
    interaction_flags = [f for f in result.safety_flags if f.type == "interaction"]
    assert len(interaction_flags) == 1
    assert interaction_flags[0].severity == "Critical"
    assert "Warfarin" in interaction_flags[0].drugs_involved
    assert "Metronidazole" in interaction_flags[0].drugs_involved


def test_demo3_too_soon(db):
    """Warfarin re-scanned 47 min after last dose → BLOCKED too_soon."""
    result = decide(make_perception(["Warfarin"]), MARCUS, db)
    too_soon_flags = [f for f in result.safety_flags if f.type == "too_soon"]
    assert result.status_tag == "BLOCKED"
    assert len(too_soon_flags) == 1
    assert "Warfarin" in too_soon_flags[0].drugs_involved


def test_clean_pass(db):
    """Lisinopril only, no recent dose log → VERIFIED_PRESENT."""
    # Use a future 'now' to ensure no too-soon trigger for Lisinopril
    future_now = datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=24)
    result = decide(make_perception(["Lisinopril"]), MARCUS, db, now=future_now)
    assert result.status_tag == "VERIFIED_PRESENT"
    assert result.verification_successful is True
    assert result.safety_flags == []


def test_human_review_unreadable(db):
    """Unreadable label → REVIEW_REQUIRED regardless of drug."""
    result = decide(
        make_perception([], unreadable=["acetamin... (partial label)"]),
        MARCUS,
        db,
    )
    assert result.status_tag == "REVIEW_REQUIRED"
    assert result.requires_human_review is True
