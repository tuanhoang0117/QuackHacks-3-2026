import os
import json
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()


class IdentifiedItem(BaseModel):
    name: str = Field(description="Best-guess medication name from a visible label or imprint.")
    identification_basis: str = Field(
        description="How identity was determined: 'label_text', 'imprint', 'shape_color', or 'uncertain'."
    )


class PerceptionResult(BaseModel):
    physical_object_count: int = Field(description="Number of distinct physical objects observed on the tray.")
    identified_items: list[IdentifiedItem] = Field(description="Items the agent could name, with the basis for each.")
    document_medications: list[str] = Field(description="Medication names extracted from the clinical text.")
    unreadable_or_partial: list[str] = Field(description="Items/labels too damaged or partial to read; flagged for human review.")
    raw_text_observed: str = Field(description="Any label text literally read from the image.")


SYSTEM_INSTRUCTION = """
You are a perception module. Your ONLY task is to observe and report — never to judge medical safety.

From the image:
- Count the distinct physical objects on the tray.
- Read any visible labels or pill imprints.
- For each item you can name, state how you identified it: label_text, imprint, shape_color, or uncertain.
- If a label is torn or partial, attempt partial matching (e.g. 'acetamin...' -> Acetaminophen) but place
  the item in 'unreadable_or_partial' so a human can confirm.

From the clinical text:
- List every medication name mentioned.

Do NOT decide whether anything is safe, dangerous, duplicated, or interacting.
Output only what you observe, conforming exactly to the requested JSON schema.
"""


def extract_observations(image_bytes: bytes, clinical_paper_text: str) -> dict:
    """
    Sends image + clinical text to Gemini 2.5 Flash for extraction only.
    Returns a plain dict matching the PerceptionResult schema.
    Never makes a safety judgment.
    """
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            f"CLINICAL TEXT:\n{clinical_paper_text}",
        ],
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=PerceptionResult,
        ),
    )

    return json.loads(response.text)
