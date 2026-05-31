"""
Static pipeline test — runs the full Track B pipeline against a saved image
and hardcoded clinical text. No webcam, no live API keys needed for the
safety engine checks. Gemini calls will fail without a real GEMINI_API_KEY,
but the safety engine + MongoDB path is fully exercised.

Usage:
    cd backend
    python test_static.py
"""

import os
import sys
import json
import datetime
from pymongo import MongoClient
from safety_engine import decide

# --- Hardcoded clinical text simulating Marcus Vance's discharge paperwork ---
CLINICAL_TEXT = """
DISCHARGE INSTRUCTIONS — Marcus Vance (PT-9942)
Date of Discharge: 2024-03-15

MEDICATIONS PRESCRIBED:
1. Warfarin (Coumadin) 5mg — Take once daily at the same time each evening.
   Do not skip doses. Follow up with INR lab work in 5 days.
2. Metronidazole (Flagyl) 500mg — Take twice daily for 7 days for dental infection.
   Do not consume alcohol during treatment.
3. Lisinopril 10mg — Continue existing prescription. Take once daily in the morning.

FOLLOW-UP: Cardiology in 2 weeks. Primary care in 1 week.
ACTIVITY: Light walking only. No strenuous activity for 2 weeks.
DIET: Maintain consistent Vitamin K intake while on Warfarin.
"""

# --- Three demo scenarios as hardcoded perception dicts ---
DEMO_SCENARIOS = {
    "demo_1_contraindication": {
        "label": "Sudafed + Hypertension",
        "perception": {
            "physical_object_count": 1,
            "identified_items": [
                {"name": "Pseudoephedrine", "identification_basis": "label_text"}
            ],
            "document_medications": [],
            "unreadable_or_partial": [],
            "raw_text_observed": "Sudafed PE 30mg Pseudoephedrine HCl",
        },
    },
    "demo_2_lethal_interaction": {
        "label": "Warfarin + Metronidazole (lethal mix)",
        "perception": {
            "physical_object_count": 2,
            "identified_items": [
                {"name": "Warfarin", "identification_basis": "label_text"},
                {"name": "Metronidazole", "identification_basis": "label_text"},
            ],
            "document_medications": ["Warfarin", "Metronidazole"],
            "unreadable_or_partial": [],
            "raw_text_observed": "Warfarin 5mg | Metronidazole 500mg",
        },
    },
    "demo_3_too_soon": {
        "label": "Warfarin re-scanned too soon",
        "perception": {
            "physical_object_count": 1,
            "identified_items": [
                {"name": "Warfarin", "identification_basis": "label_text"}
            ],
            "document_medications": ["Warfarin"],
            "unreadable_or_partial": [],
            "raw_text_observed": "Warfarin 5mg",
        },
    },
    "demo_clean": {
        "label": "Lisinopril — clean pass",
        "perception": {
            "physical_object_count": 1,
            "identified_items": [
                {"name": "Lisinopril", "identification_basis": "label_text"}
            ],
            "document_medications": ["Lisinopril"],
            "unreadable_or_partial": [],
            "raw_text_observed": "Lisinopril 10mg",
        },
    },
}

PATIENT_PROFILE = {
    "patient_id": "PT-9942",
    "past_medical_history": [
        "Severe Essential Hypertension (High Blood Pressure)",
        "Hyperlipidemia (High Cholesterol)",
    ],
}


def run_all_demos():
    db = MongoClient("mongodb://localhost:27017")["meds_crosslink"]
    passed = 0
    failed = 0

    print("=" * 60)
    print("oculusMD — Static Pipeline Test")
    print("=" * 60)

    for key, scenario in DEMO_SCENARIOS.items():
        print(f"\n[{scenario['label']}]")

        # Use future now for clean pass so Lisinopril dose_log doesn't trigger too_soon
        now = (
            datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=24)
            if key == "demo_clean"
            else None
        )

        result = decide(scenario["perception"], PATIENT_PROFILE, db, now=now)

        print(f"  status_tag:            {result.status_tag}")
        print(f"  verification_successful: {result.verification_successful}")
        print(f"  matched_medications:   {result.matched_medications}")
        print(f"  safety_flags:          {len(result.safety_flags)} flag(s)")
        for f in result.safety_flags:
            print(f"    → [{f.severity}] {f.type}: {', '.join(f.drugs_involved)}")
        print(f"  status_speech preview: {result.status_speech[:120]}...")
        print(f"  solana_hash:           {result.solana_payload_hash[:16]}...")

        # Assertions
        ok = True
        if key == "demo_1_contraindication":
            ok = result.status_tag == "BLOCKED" and any(f.type == "contraindication" for f in result.safety_flags)
        elif key == "demo_2_lethal_interaction":
            ok = result.status_tag == "BLOCKED" and any(f.severity == "Critical" for f in result.safety_flags)
        elif key == "demo_3_too_soon":
            ok = result.status_tag == "BLOCKED" and any(f.type == "too_soon" for f in result.safety_flags)
        elif key == "demo_clean":
            ok = result.status_tag == "VERIFIED_PRESENT" and result.verification_successful

        status = "PASS" if ok else "FAIL"
        print(f"  Result: {status}")
        if ok:
            passed += 1
        else:
            failed += 1

    print("\n" + "=" * 60)
    print(f"  {passed} passed / {failed} failed")
    print("=" * 60)
    return failed == 0


if __name__ == "__main__":
    success = run_all_demos()
    sys.exit(0 if success else 1)
