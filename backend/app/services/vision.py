"""Optional computer-vision module: detect dogs in a field-survey photograph using Ultralytics YOLO.

Enabled only when `ultralytics` is installed (pip install -r requirements-ml.txt) and
ENABLE_YOLO=1. Output is the number of dog detections *in that single photo* - it is not
a population estimate, cannot identify individuals across overlapping photos, and does not
assess behaviour, health or rabies status.
"""
from __future__ import annotations

import os
from functools import lru_cache

DOG_CLASS_ID = 16  # COCO 'dog'


def available() -> tuple[bool, str]:
    if os.getenv("ENABLE_YOLO", "0") != "1":
        return False, "YOLO module disabled (set ENABLE_YOLO=1 and install requirements-ml.txt)"
    try:
        import ultralytics  # noqa: F401
    except ImportError:
        return False, "ultralytics package not installed"
    return True, "ok"


@lru_cache(maxsize=1)
def _model():
    from ultralytics import YOLO

    return YOLO(os.getenv("YOLO_WEIGHTS", "yolov8n.pt"))


def count_dogs(image_path: str, conf: float = 0.35) -> dict:
    ok, msg = available()
    if not ok:
        return {"available": False, "message": msg}
    res = _model().predict(image_path, conf=conf, classes=[DOG_CLASS_ID], verbose=False)[0]
    boxes = [{"conf": round(float(b.conf), 3), "xyxy": [round(float(v), 1) for v in b.xyxy[0].tolist()]} for b in res.boxes]
    return {
        "available": True,
        "detections": len(boxes),
        "boxes": boxes,
        "model": os.getenv("YOLO_WEIGHTS", "yolov8n.pt"),
        "caveat": "Detections in this photograph only. Not an individual-level or population count; overlapping photos may show the same dogs.",
    }
