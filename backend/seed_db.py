import os
import json
import datetime
from pymongo import MongoClient, ASCENDING, TEXT
from dotenv import load_dotenv

load_dotenv()

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

def load(filename):
    # TODO (production): replace with OpenFDA / DrugBank API fetch
    with open(os.path.join(DATA_DIR, filename)) as f:
        return json.load(f)

client = MongoClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
db = client["meds_crosslink"]

# Drop all collections for idempotency
for col in ["patient_profiles", "drug_interactions", "drug_contraindications", "dosages", "dose_log"]:
    db[col].drop()

db.patient_profiles.insert_many(load("patient_profiles.json"))
db.drug_interactions.insert_many(load("drug_interactions.json"))
db.drug_contraindications.insert_many(load("drug_contraindications.json"))
db.dosages.insert_many(load("dosages.json"))

# dose_log starts empty; pre-seed one Warfarin entry 47 min ago to trigger Demo 3
db.dose_log.insert_one({
    "patient_id": "PT-9942",
    "drug_name": "Warfarin",
    "logged_at": datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=47)
})

db.drug_interactions.create_index([("drug_a", ASCENDING), ("drug_b", ASCENDING)])
db.drug_contraindications.create_index([("drug_name", TEXT)])

print(f"patient_profiles:       {db.patient_profiles.count_documents({})} documents")
print(f"drug_interactions:      {db.drug_interactions.count_documents({})} documents")
print(f"drug_contraindications: {db.drug_contraindications.count_documents({})} documents")
print(f"dosages:                {db.dosages.count_documents({})} documents")
print(f"dose_log:               {db.dose_log.count_documents({})} documents")
print("Indexes created.")
print("Seed complete.")
