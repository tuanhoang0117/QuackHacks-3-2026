import os
import re
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

DISCLAIMER = (
    "For personalized guidance, always confirm with your provider or pharmacist. "
    "This information is educational and does not replace professional medical advice."
)

SUMMARIZE_SYSTEM = """
You are a patient-friendly medical assistant helping a patient understand their hospital discharge instructions.
Summarize the document in plain, calm language a non-medical person can follow at home.
Structure your response as:
1. A brief overview of why they were in the hospital.
2. Each prescribed medication: what it is, what it does, and exactly how to take it.
3. Any important warnings or follow-up instructions from the document.
Keep sentences short. Avoid medical jargon. Do not add information not present in the document.
End with: "If you have questions about any of these instructions, contact your provider or pharmacist."
"""

ANSWER_SYSTEM = """
You are a patient-friendly medication education assistant.

Your job is to answer the patient's question using:
1. The discharge document (their doctor's specific instructions — highest priority).
2. The drug data provided below from the medical database (general drug information).
3. Your general medical knowledge for well-known facts (side effects, food interactions, etc.)
   — but only when the document and database do not already answer the question.

Rules:
- Never tell the patient to change, stop, or start a medication. That is their doctor's decision.
- Never override information in the discharge document.
- If the question is about whether a drug combination is safe, say:
  "Your care team has reviewed your medications. For specific safety concerns, contact your provider."
- Keep answers plain-language, calm, and concise.
- Always end your answer with this exact disclaimer:
  "{disclaimer}"
""".format(disclaimer=DISCLAIMER)


def _fetch_drug_context(drug_names: list[str], db) -> str:
    """Fetches MongoDB rows for named drugs and formats them as grounding context."""
    if not drug_names or db is None:
        return ""

    lines = []
    for drug in drug_names:
        dosage = db.dosages.find_one({"drug_name": drug})
        if dosage:
            lines.append(
                f"- {drug}: max single dose {dosage['max_single_dose_mg']}mg, "
                f"max daily {dosage['max_daily_dose_mg']}mg, "
                f"minimum interval between doses {dosage['min_interval_minutes']} minutes."
            )
        interactions = list(db.drug_interactions.find({"$or": [{"drug_a": drug}, {"drug_b": drug}]}))
        for ix in interactions:
            other = ix["drug_b"] if ix["drug_a"] == drug else ix["drug_a"]
            lines.append(f"- {drug} + {other} interaction ({ix['severity']}): {ix['mechanism']}")

        contraindications = list(db.drug_contraindications.find({"drug_name": drug}))
        for cx in contraindications:
            lines.append(
                f"- {drug} contraindication ({cx['severity']}) for {cx['contraindicated_condition']}: {cx['mechanism']}"
            )

    return "\n".join(lines) if lines else ""


def _extract_drug_names(text: str, db) -> list[str]:
    """Returns drug names from the clinical text that exist in our dosages collection."""
    if db is None:
        return []
    known_drugs = [d["drug_name"] for d in db.dosages.find({}, {"drug_name": 1})]
    found = []
    for drug in known_drugs:
        if re.search(re.escape(drug), text, re.IGNORECASE):
            found.append(drug)
    return found


def summarize_document(clinical_text: str) -> str:
    """
    Takes discharge document text and returns a plain-language spoken summary.
    Passed to ElevenLabs /speak for audio playback.
    """
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[f"DISCHARGE DOCUMENT:\n{clinical_text}"],
        config=types.GenerateContentConfig(
            system_instruction=SUMMARIZE_SYSTEM,
        ),
    )
    return response.text


def answer_question(question: str, clinical_context: str, db=None) -> str:
    """
    Answers a patient question grounded in their discharge document and MongoDB drug data.
    Falls back to Gemini general knowledge for well-known facts (side effects, food, etc.)
    Always ends with the provider disclaimer.
    """
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    drug_names = _extract_drug_names(clinical_context, db)
    db_context = _fetch_drug_context(drug_names, db)

    context_block = f"DISCHARGE DOCUMENT:\n{clinical_context}\n"
    if db_context:
        context_block += f"\nDRUG DATABASE RECORDS:\n{db_context}\n"

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            context_block,
            f"PATIENT QUESTION: {question}",
        ],
        config=types.GenerateContentConfig(
            system_instruction=ANSWER_SYSTEM,
        ),
    )
    return response.text
