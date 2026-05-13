"""
EMG Label Collector — küçük API: pipeline CSV'yi ``data/<GESTURE>/instance_NNN.csv`` olarak yazar.
``senior_project`` ile aynı klasör düzeni (``preprocessor.py`` girdisi).
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("COLLECTOR_DATA_DIR", str(ROOT.parent / "data"))).resolve()

GESTURE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
EXPECTED_HEADER = "sample_index,raw_adc,phase"


def _norm_csv_header(line: str) -> str:
    return ",".join(p.strip().lower() for p in line.strip().lstrip("\ufeff").split(","))


def _header_ok(first_line: str) -> bool:
    return _norm_csv_header(first_line) == _norm_csv_header(EXPECTED_HEADER)


class RecordingIn(BaseModel):
    gesture: str = Field(..., min_length=1, max_length=64)
    csv: str = Field(..., min_length=1)


app = FastAPI(title="EMG Label Collector API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def next_instance_number(gesture_dir: Path) -> int:
    if not gesture_dir.is_dir():
        return 1
    n = 0
    for p in gesture_dir.iterdir():
        if p.suffix != ".csv" or p.name.endswith(".csv.part"):
            continue
        if not p.name.startswith("instance_"):
            continue
        mid = p.stem.replace("instance_", "")
        if mid.isdigit():
            n = max(n, int(mid))
    return n + 1


def save_pipeline_csv_atomic(gesture: str, csv_text: str) -> Path:
    if not GESTURE_RE.match(gesture):
        raise HTTPException(status_code=400, detail="Invalid gesture name")
    lines = csv_text.strip().splitlines()
    if len(lines) < 2:
        raise HTTPException(status_code=400, detail="CSV too short")
    if not _header_ok(lines[0]):
        raise HTTPException(
            status_code=400,
            detail=f"Expected header {EXPECTED_HEADER!r}, got {lines[0]!r}",
        )

    gesture_dir = DATA_DIR / gesture
    gesture_dir.mkdir(parents=True, exist_ok=True)
    n = next_instance_number(gesture_dir)
    final = gesture_dir / f"instance_{n:03d}.csv"
    part = final.with_suffix(final.suffix + ".part")
    try:
        part.write_text(csv_text if csv_text.endswith("\n") else csv_text + "\n", encoding="utf-8")
        part.replace(final)
    except OSError as e:
        if part.exists():
            try:
                part.unlink()
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=str(e)) from e
    return final


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "data_dir": str(DATA_DIR)}


@app.post("/api/v1/recordings")
def post_recording(body: RecordingIn) -> dict[str, str]:
    path = save_pipeline_csv_atomic(body.gesture.strip(), body.csv)
    return {"saved": str(path), "gesture": body.gesture}


@app.get("/api/v1/recordings/{gesture}")
def list_recordings(gesture: str) -> dict[str, object]:
    if not GESTURE_RE.match(gesture):
        raise HTTPException(status_code=400, detail="Invalid gesture name")
    d = DATA_DIR / gesture
    if not d.is_dir():
        return {"gesture": gesture, "files": []}
    files = sorted(p.name for p in d.glob("instance_*.csv") if p.is_file() and not p.name.endswith(".part"))
    return {"gesture": gesture, "files": files}
