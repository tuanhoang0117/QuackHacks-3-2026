import os
import subprocess
import datetime
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from pymongo import MongoClient
import httpx
from dotenv import load_dotenv

from perception_agent import extract_observations, extract_document_text
from safety_engine import decide
from chat_agent import summarize_document, answer_question

load_dotenv()

app = FastAPI(title="MedsCrossLink AI", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

mongo = MongoClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
db = mongo["meds_crosslink"]

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # default: Rachel


# ---------- Request/Response models ----------

class SpeakRequest(BaseModel):
    text: str

class SummarizeRequest(BaseModel):
    clinical_text: str

class AskRequest(BaseModel):
    question: str
    clinical_context: str
    patient_id: str = "PT-9942"

class LogDoseRequest(BaseModel):
    patient_id: str
    medication_name: str
    timestamp: str


# ---------- Helpers ----------

async def _speak_audio(text: str):
    """Calls ElevenLabs and streams back audio bytes."""
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="ElevenLabs API key not configured.")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=headers, json=payload)
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="ElevenLabs request failed.")
        return response.content


def _log_to_solana(payload_hash: str, status_tag: str) -> str:
    """Calls the TypeScript Solana logger as a subprocess. Returns tx URL or error string."""
    solana_dir = os.path.join(os.path.dirname(__file__), "..", "solana")
    try:
        result = subprocess.run(
            ["npx", "ts-node", "solana_logger.ts", payload_hash, status_tag],
            cwd=solana_dir,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stdout.strip() or result.stderr.strip()
    except Exception as e:
        return f"solana_unavailable: {str(e)}"


# ---------- Endpoints ----------

@app.post("/verify")
async def verify(
    image: UploadFile = File(...),
    clinical_text: str = Form(...),
    patient_id: str = Form(...),
):
    """
    Full scan pipeline:
    image + clinical_text + patient_id
      → Gemini perception
      → MongoDB safety engine
      → Solana audit log
      → ReconciliationResult
    """
    patient_profile = db.patient_profiles.find_one({"patient_id": patient_id})
    if not patient_profile:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found.")

    image_bytes = await image.read()

    perception = extract_observations(image_bytes, clinical_text)

    result = decide(perception, patient_profile, db)

    solana_tx = _log_to_solana(result.solana_payload_hash, result.status_tag)

    response_data = result.model_dump()
    response_data["solana_tx"] = solana_tx

    # Log this dose to dose_log on any non-blocked clean verification
    if result.verification_successful:
        for drug in result.matched_medications:
            db.dose_log.insert_one({
                "patient_id": patient_id,
                "drug_name": drug,
                "logged_at": datetime.datetime.now(datetime.UTC),
            })

    return JSONResponse(content=response_data)


@app.post("/speak")
async def speak(request: SpeakRequest):
    """Proxies text to ElevenLabs TTS. Keeps API key server-side."""
    audio = await _speak_audio(request.text)
    return StreamingResponse(
        iter([audio]),
        media_type="audio/mpeg",
    )


@app.post("/summarize")
async def summarize(request: SummarizeRequest):
    """
    Takes discharge document text.
    Returns a plain-language summary + audio from ElevenLabs.
    """
    summary = summarize_document(request.clinical_text)
    audio = await _speak_audio(summary)
    return StreamingResponse(
        iter([audio]),
        media_type="audio/mpeg",
        headers={"X-Summary-Text": summary[:500]},
    )


@app.post("/ask")
async def ask(request: AskRequest):
    """
    Patient Q&A grounded in discharge document + MongoDB drug data.
    Returns plain-language answer + audio from ElevenLabs.
    """
    answer = answer_question(request.question, request.clinical_context, db)
    audio = await _speak_audio(answer)
    return StreamingResponse(
        iter([audio]),
        media_type="audio/mpeg",
        headers={"X-Answer-Text": answer[:500]},
    )


@app.post("/document/summary")
async def document_summary(
    image: UploadFile = File(...),
    patient_id: str = Form(...),
):
    """
    Takes a photo of a discharge document.
    Returns plain-language summary as JSON — frontend handles audio via /speak.
    """
    image_bytes = await image.read()
    clinical_text = extract_document_text(image_bytes)
    summary = summarize_document(clinical_text)
    return JSONResponse(content={"summary": summary})


@app.post("/document/ask")
async def document_ask(
    image: UploadFile = File(...),
    question: str = Form(...),
    patient_id: str = Form(...),
):
    """
    Takes a photo of a discharge document + a patient question.
    Returns plain-language answer as JSON — frontend handles audio via /speak.
    """
    image_bytes = await image.read()
    clinical_text = extract_document_text(image_bytes)
    answer = answer_question(question, clinical_text, db)
    excerpt = clinical_text[:300].strip()
    return JSONResponse(content={"answer": answer, "relevant_excerpt": excerpt})


@app.post("/log-dose")
async def log_dose(request: LogDoseRequest):
    """Records a dose to dose_log so /verify can catch too-soon re-doses."""
    import datetime
    db.dose_log.insert_one({
        "patient_id": request.patient_id,
        "drug_name": request.medication_name,
        "logged_at": datetime.datetime.now(datetime.UTC),
    })
    return JSONResponse(content={"status": "logged"})


@app.get("/health")
def health():
    return {"status": "ok", "db": "connected" if mongo.server_info() else "unreachable"}
