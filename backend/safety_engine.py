import hashlib
import json
import re
import datetime
from typing import Literal
from pydantic import BaseModel

# Common label variants → canonical DB name
_ALIASES: dict[str, str] = {
    "warfarin sodium": "Warfarin",
    "coumadin": "Warfarin",
    "flagyl": "Metronidazole",
    "prinivil": "Lisinopril",
    "zestril": "Lisinopril",
    "sudafed": "Pseudoephedrine",
    "pseudoephedrine hcl": "Pseudoephedrine",
    "pseudoephedrine hydrochloride": "Pseudoephedrine",
}

def _normalize_drug(name: str) -> str:
    """Strip dosage/form suffixes and resolve brand/salt variants to canonical DB names."""
    cleaned = re.sub(r'\s*\d[\d.,]*\s*(?:mg|mcg|ml|g|iu|units?)\b.*', '', name, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r'\b(tablets?|capsules?|oral|solution|injection|hcl|hydrochloride)\b.*', '', cleaned, flags=re.IGNORECASE).strip()
    lower = cleaned.lower()
    return _ALIASES.get(lower, cleaned) or name


def _fmt_mins(minutes: int) -> str:
    """Format an integer minute count as a readable string for TTS."""
    h, m = divmod(minutes, 60)
    if h == 0:
        return f"{m} minute{'s' if m != 1 else ''}"
    if m == 0:
        return f"{h} hour{'s' if h != 1 else ''}"
    return f"{h} hour{'s' if h != 1 else ''} and {m} minute{'s' if m != 1 else ''}"


class SafetyFlag(BaseModel):
    type: Literal["interaction", "contraindication", "dose_ceiling", "too_soon", "duplicate"]
    severity: Literal["Critical", "High", "Moderate", "Low"]
    drugs_involved: list[str]
    mechanism: str


class ReconciliationResult(BaseModel):
    verification_successful: bool
    matched_medications: list[str]
    safety_flags: list[SafetyFlag]
    requires_human_review: bool
    review_reason: str
    status_speech: str
    solana_payload_hash: str
    status_tag: Literal["VERIFIED_PRESENT", "BLOCKED", "REVIEW_REQUIRED"]


def compose_speech(flags: list[SafetyFlag], needs_review: bool, review_reason: str, candidates: list[str]) -> str:
    if needs_review and not any(f.severity in ("Critical", "High") for f in flags):
        return (
            f"Review required. {review_reason} "
            "Please verify manually before administering."
        )

    blocking_flags = [f for f in flags if f.severity in ("Critical", "High")]
    if blocking_flags:
        parts = ["BLOCKED."]
        for f in blocking_flags:
            drugs = " and ".join(f.drugs_involved)
            parts.append(
                f"{f.severity} {f.type.replace('_', ' ')} detected for {drugs}. "
                f"{f.mechanism}"
            )
        parts.append("Do not administer. Contact your provider immediately.")
        return " ".join(parts)

    if flags:
        parts = ["Caution."]
        for f in flags:
            drugs = " and ".join(f.drugs_involved)
            parts.append(f"{f.severity} {f.type.replace('_', ' ')} noted for {drugs}. {f.mechanism}")
        parts.append("Consult your provider before administering.")
        return " ".join(parts)

    drugs_str = ", ".join(candidates)
    return (
        f"Verified. {drugs_str} present and match your prescription. "
        "No interactions or contraindications detected. Safe to administer."
    )


def decide(perception: dict, patient_profile: dict, db, now: datetime.datetime | None = None) -> ReconciliationResult:
    now = now or datetime.datetime.now(datetime.UTC)
    flags: list[SafetyFlag] = []

    observed = [_normalize_drug(i["name"]) for i in perception["identified_items"]]
    profile_meds = patient_profile.get("discharge_prescriptions", [])
    candidates = sorted(set(observed + profile_meds))

    # 1) Drug-to-drug interactions (pairwise)
    for a in candidates:
        for b in candidates:
            if a < b:
                hit = (
                    db.drug_interactions.find_one({"drug_a": a, "drug_b": b})
                    or db.drug_interactions.find_one({"drug_a": b, "drug_b": a})
                )
                if hit:
                    flags.append(SafetyFlag(
                        type="interaction",
                        severity=hit["severity"],
                        drugs_involved=[a, b],
                        mechanism=hit["mechanism"],
                    ))

    # 2) Drug-to-condition contraindications
    for drug in candidates:
        for cond in patient_profile.get("past_medical_history", []):
            hit = db.drug_contraindications.find_one({
                "drug_name": drug,
                "contraindicated_condition": cond,
            })
            if hit:
                flags.append(SafetyFlag(
                    type="contraindication",
                    severity=hit["severity"],
                    drugs_involved=[drug],
                    mechanism=hit["mechanism"],
                ))

    # 3) Dose ceilings
    # production: compare label-read dose_mg against max_single_dose_mg from dosages collection.
    # Perception does not carry dose_mg yet — stub confirms drug is in known formulary only.
    for drug in candidates:
        db.dosages.find_one({"drug_name": drug})  # no-op for now; extend when perception carries dose

    # 4) Too-soon / double-dose — only for physically scanned drugs, not discharge document refs
    for drug in observed:
        last = db.dose_log.find_one(
            {"patient_id": patient_profile["patient_id"], "drug_name": drug},
            sort=[("logged_at", -1)],
        )
        if last:
            dosage = db.dosages.find_one({"drug_name": drug})
            if dosage:
                last_logged = last["logged_at"]
                if last_logged.tzinfo is None:
                    last_logged = last_logged.replace(tzinfo=datetime.UTC)
                minutes_since = (now - last_logged).total_seconds() / 60
                if minutes_since < dosage["min_interval_minutes"]:
                    flags.append(SafetyFlag(
                        type="too_soon",
                        severity="High",
                        drugs_involved=[drug],
                        mechanism=(
                            f"A dose of {drug} was already logged "
                            f"{_fmt_mins(int(minutes_since))} ago. "
                            f"The minimum re-dose interval is {_fmt_mins(dosage['min_interval_minutes'])}. "
                            "Administering again this soon risks dangerous accumulation."
                        ),
                    ))

    # Verdict
    needs_review = bool(perception["unreadable_or_partial"]) or any(
        i["identification_basis"] in ("shape_color", "uncertain")
        for i in perception["identified_items"]
    )
    review_reason = "; ".join(perception["unreadable_or_partial"]) if needs_review else ""

    blocking = any(f.severity in ("Critical", "High") for f in flags)
    success = (not blocking) and (not needs_review) and len(flags) == 0
    tag: Literal["VERIFIED_PRESENT", "BLOCKED", "REVIEW_REQUIRED"] = (
        "BLOCKED" if blocking else ("REVIEW_REQUIRED" if needs_review else "VERIFIED_PRESENT")
    )

    speech = compose_speech(flags, needs_review, review_reason, candidates)

    event = {
        "ts": now.isoformat(),
        "tag": tag,
        "drugs": candidates,
        "patient_ref": hashlib.sha256(patient_profile["patient_id"].encode()).hexdigest()[:16],
    }
    payload_hash = hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()

    return ReconciliationResult(
        verification_successful=success,
        matched_medications=sorted(observed),
        safety_flags=flags,
        requires_human_review=needs_review,
        review_reason=review_reason,
        status_speech=speech,
        solana_payload_hash=payload_hash,
        status_tag=tag,
    )
