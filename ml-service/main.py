# main.py
import base64
import json
import os
from typing import Literal, Optional

from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import pandas as pd
from google import genai
from google.genai import types

app = FastAPI()

model = joblib.load("isolation_forest_model.pkl")

# Lazily constructed -- a missing/invalid GEMINI_API_KEY should only break
# /ocr/receipt, not the anomaly-flag endpoint or the service's own startup.
_gemini_client: genai.Client | None = None


def get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _gemini_client


# Configurable so the model can be bumped without a code change if this one
# is ever deprecated.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")

FEATURE_ORDER = ['amount', 'days_since_donation', 'ngo_avg_verification_time',
                  'ngo_pending_ratio', 'is_round_number', 'hour_of_day']

class FeatureVector(BaseModel):
    amount: float
    days_since_donation: float
    ngo_avg_verification_time: float
    ngo_pending_ratio: float
    is_round_number: bool
    hour_of_day: int

class FlagRequest(BaseModel):
    features: FeatureVector

class AnomalyResult(BaseModel):
    score: float
    isAnomalous: bool
    reason: str

def generate_reason(row):
    if row['days_since_donation'] > 30:
        return f"Donation sat unspent for {row['days_since_donation']:.0f} days"
    if row['days_since_donation'] < 0.5:
        return "Disbursed within hours of donation arriving"
    if row['ngo_pending_ratio'] > 0.5:
        return f"NGO has high pending/unverified ratio ({row['ngo_pending_ratio']:.0%})"
    if row['is_round_number'] == 1:
        return "Round-number amount, possible structuring"
    if row['hour_of_day'] < 5 or row['hour_of_day'] > 22:
        return f"Disbursement created at unusual hour ({row['hour_of_day']}:00)"
    if row['ngo_avg_verification_time'] < 0.1:
        return f"Bill verified unusually fast ({row['ngo_avg_verification_time']:.2f}h) for this NGO"
    if row['ngo_avg_verification_time'] > 100:
        return f"Unusually slow bill verification for this NGO ({row['ngo_avg_verification_time']:.0f}h)"
    return "Flagged by model — no single dominant factor identified"

@app.post("/ml/flag", response_model=AnomalyResult)
def flag_disbursement(req: FlagRequest):
    f = req.features
    row_dict = {
        'amount': f.amount,
        'days_since_donation': f.days_since_donation,
        'ngo_avg_verification_time': f.ngo_avg_verification_time,
        'ngo_pending_ratio': f.ngo_pending_ratio,
        'is_round_number': int(f.is_round_number),
        'hour_of_day': f.hour_of_day
    }
    X = pd.DataFrame([row_dict])[FEATURE_ORDER]

    score = float(model.decision_function(X)[0])
    pred = model.predict(X)[0]
    is_anomalous = bool(pred == -1)
    reason = generate_reason(row_dict) if is_anomalous else ""

    return AnomalyResult(score=score, isAnomalous=is_anomalous, reason=reason)


class OcrRequest(BaseModel):
    fileBase64: str
    mimeType: str


class OcrResult(BaseModel):
    extractedAmount: Optional[float] = None
    vendorName: Optional[str] = None
    date: Optional[str] = None
    confidence: Literal['high', 'low', 'none']


OCR_PROMPT = """You are reading a photo or scan of a receipt/bill. Extract:
- total_amount: the final total amount paid, as a plain number with no currency symbol or commas (null if you cannot find one)
- vendor_name: the business/vendor name on the receipt (null if not legible)
- date: the date on the receipt in YYYY-MM-DD format (null if not legible or not present)
- confidence: "high" if this is clearly a receipt/bill with a legible total, "low" if it's a receipt but partially illegible or you're unsure of the total, "none" if this image does not look like a receipt/bill at all

Respond with ONLY a JSON object, no other text: {"total_amount": number|null, "vendor_name": string|null, "date": string|null, "confidence": "high"|"low"|"none"}"""


@app.post("/ocr/receipt", response_model=OcrResult)
def ocr_receipt(req: OcrRequest):
    image_bytes = base64.b64decode(req.fileBase64)

    response = get_gemini_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=req.mimeType),
            OCR_PROMPT,
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    data = json.loads(response.text)

    return OcrResult(
        extractedAmount=data.get("total_amount"),
        vendorName=data.get("vendor_name"),
        date=data.get("date"),
        confidence=data.get("confidence") or "none",
    )