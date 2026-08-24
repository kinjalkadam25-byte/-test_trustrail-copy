# main.py
from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import pandas as pd

app = FastAPI()

model = joblib.load("isolation_forest_model.pkl")

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