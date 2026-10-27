from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import csv

app = FastAPI(
    title="NetGuardX API",
    description="Network Monitoring Dashboard API",
    version="1.0.0"
)

# Allow the React frontend to communicate with the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
CSV_FILE = BASE_DIR / "logs" / "network_history.csv"


@app.get("/")
def home():
    return {
        "project": "NetGuardX",
        "message": "Network Monitoring API is running",
        "status": "ONLINE"
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "NetGuardX API"
    }


@app.get("/api/metrics")
def get_metrics():
    if not CSV_FILE.exists():
        return {
            "status": "NO_DATA",
            "message": "Network history file not found",
            "devices": []
        }

    latest_records = {}

    try:
        with CSV_FILE.open(
            "r",
            newline="",
            encoding="utf-8-sig"
        ) as file:
            reader = csv.DictReader(file)

            for row in reader:
                device = row.get("device_name")

                if device:
                    latest_records[device] = row

        return {
            "status": "success",
            "total_devices": len(latest_records),
            "devices": list(latest_records.values())
        }

    except (OSError, csv.Error) as error:
        return {
            "status": "error",
            "message": str(error),
            "devices": []
        }


@app.get("/api/history")
def get_history():
    if not CSV_FILE.exists():
        return {
            "status": "NO_DATA",
            "records": []
        }

    try:
        with CSV_FILE.open(
            "r",
            newline="",
            encoding="utf-8-sig"
        ) as file:
            reader = csv.DictReader(file)
            records = list(reader)

        return {
            "status": "success",
            "total_records": len(records),
            "records": records[-100:]
        }

    except (OSError, csv.Error) as error:
        return {
            "status": "error",
            "message": str(error),
            "records": []
        }