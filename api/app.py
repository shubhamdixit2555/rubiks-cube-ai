"""
FastAPI Server for AI Rubik's Cube Solver.

Endpoints:
- POST /api/analyze-face: Analyzes a single face image, returns 9 detected stickers & annotated image.
- POST /api/analyze-cube: Analyzes all 6 face images, reconstructs cube state, validates it.
- POST /api/validate: Validates a 54-facelet state or custom 2D net.
- POST /api/solve: Generates optimal 2-phase solution with 3D step frames & explanations.
- GET /api/scramble: Generates random WCA scramble and returns scrambled state.
- GET /api/ml-metrics: Returns model benchmark comparisons, confusion matrix & pipeline metadata.
"""

import os
from typing import Dict, List, Optional, Union
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from core.cube import (
    SOLVED_STATE,
    COLOR_MAP,
    COLOR_NAMES,
    HEX_COLORS,
    apply_move,
    apply_algorithm,
    generate_scramble,
    state_to_face_dict,
    face_dict_to_state,
    color_to_facelet_string,
    is_solved,
)
from core.validator import validate_cube, CubeValidationError
from core.solver import solve_cube, get_move_explanation
from cv.preprocessing import load_image_from_bytes, preprocess_image, encode_image_to_base64
from cv.grid_detector import detect_cube_face_and_stickers
from cv.color_classifier import classify_face_stickers, classify_sticker_color
from ml.benchmark import get_benchmark_metrics

# Initialize FastAPI App
app = FastAPI(
    title="AI Rubik's Cube Solver API",
    description="Computer Vision & Deep Learning Based Cube State Detection and Optimal Solver",
    version="1.0.0",
)

# Enable CORS for local dev / client integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")


# ----------------------------------------------------------------------------
# Pydantic Request Models
# ----------------------------------------------------------------------------

class AnalyzeFaceRequest(BaseModel):
    image_base64: str
    face_name: Optional[str] = "F"


class AnalyzeCubeRequest(BaseModel):
    images: Dict[str, str]  # Key: "U", "R", "F", "D", "L", "B" -> Value: base64 image data


class ValidateRequest(BaseModel):
    state: Optional[str] = None
    face_colors: Optional[Dict[str, List[str]]] = None


class SolveRequest(BaseModel):
    state: Optional[str] = None
    face_colors: Optional[Dict[str, List[str]]] = None


# ----------------------------------------------------------------------------
# Core API Endpoints
# ----------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "AI Rubik's Cube Solver"}


@app.get("/api/scramble")
def get_scramble(length: int = 20):
    """Generates a standard WCA-style scramble and returns resulting state."""
    scramble_str = generate_scramble(length)
    scrambled_facelet = apply_algorithm(SOLVED_STATE, scramble_str)
    
    # Map facelets to standard Western colors (U->W, R->R, F->G, D->Y, L->O, B->B)
    color_state = "".join(COLOR_MAP[ch] for ch in scrambled_facelet)
    faces = state_to_face_dict(scrambled_facelet)
    color_faces = state_to_face_dict(color_state)

    return {
        "scramble": scramble_str,
        "facelet_state": scrambled_facelet,
        "color_state": color_state,
        "faces": faces,
        "color_faces": color_faces,
        "is_solved": False,
    }


@app.post("/api/analyze-face")
def analyze_face(req: AnalyzeFaceRequest):
    """Processes a single face photo and extracts 9 sticker colors with bounding boxes."""
    try:
        bgr = load_image_from_bytes(req.image_base64)
        processed_bgr, gray = preprocess_image(bgr)
        rectified, stickers, contour_found, corners = detect_cube_face_and_stickers(processed_bgr, gray)
        classified, annotated = classify_face_stickers(rectified, stickers)

        annotated_b64 = encode_image_to_base64(annotated)
        rectified_b64 = encode_image_to_base64(rectified)

        return {
            "face_name": req.face_name,
            "contour_found": contour_found,
            "stickers": [
                {
                    "index": s["index"],
                    "row": s["row"],
                    "col": s["col"],
                    "color": s["color"],
                    "color_name": s["color_name"],
                    "confidence": s["confidence"],
                    "probabilities": s["probabilities"],
                    "is_low_confidence": s["is_low_confidence"],
                }
                for s in classified
            ],
            "annotated_image": annotated_b64,
            "rectified_image": rectified_b64,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Face analysis failed: {str(e)}")


@app.post("/api/analyze-cube")
def analyze_cube(req: AnalyzeCubeRequest):
    """
    Analyzes all 6 cube face photos (U, R, F, D, L, B), reconstructs 54-facelet state,
    and runs full mathematical cube validation.
    """
    expected_faces = ["U", "R", "F", "D", "L", "B"]
    missing = [f for f in expected_faces if f not in req.images or not req.images[f]]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing images for faces: {', '.join(missing)}")

    face_results = {}
    annotated_images = {}
    color_state_list = []
    confidences = []

    for face in expected_faces:
        bgr = load_image_from_bytes(req.images[face])
        processed_bgr, gray = preprocess_image(bgr)
        rectified, stickers, contour_found, _ = detect_cube_face_and_stickers(processed_bgr, gray)
        classified, annotated = classify_face_stickers(rectified, stickers)

        face_colors = [s["color"] for s in classified]
        color_state_list.extend(face_colors)
        face_results[face] = classified
        annotated_images[face] = encode_image_to_base64(annotated)
        confidences.extend([s["confidence"] for s in classified])

    raw_color_state = "".join(color_state_list)

    # Convert color string (W, R, G, Y, O, B) to standard facelet string (U, R, F, D, L, B)
    try:
        facelet_state = color_to_facelet_string(raw_color_state)
    except Exception as e:
        facelet_state = "".join("?" for _ in range(54))

    # Validate state
    is_valid, val_err = validate_cube(facelet_state) if "?" not in facelet_state else (False, "Unrecognized colors detected.")

    return {
        "is_valid": is_valid,
        "validation_error": val_err,
        "facelet_state": facelet_state,
        "color_state": raw_color_state,
        "faces": face_results,
        "annotated_faces": annotated_images,
        "average_confidence": round(sum(confidences) / len(confidences), 1) if confidences else 0,
        "min_confidence": round(min(confidences), 1) if confidences else 0,
    }


@app.post("/api/validate")
def validate_cube_state(req: ValidateRequest):
    """Checks whether a 54-character state string or 2D net represents a valid solvable cube."""
    state = req.state
    if not state and req.face_colors:
        # Convert dictionary to string
        color_str = face_dict_to_state(req.face_colors)
        try:
            state = color_to_facelet_string(color_str)
        except Exception as e:
            return {"is_valid": False, "error": str(e), "state": color_str}

    if not state or len(state) != 54:
        return {"is_valid": False, "error": "Cube state must be 54 characters."}

    # If colors were supplied instead of facelets (e.g. W, R, G...), convert:
    if any(c in ('W', 'Y', 'O', 'G') for c in state):
        try:
            state = color_to_facelet_string(state)
        except Exception as e:
            return {"is_valid": False, "error": f"Failed to map colors to faces: {str(e)}"}

    is_valid, err = validate_cube(state)
    return {
        "is_valid": is_valid,
        "error": err,
        "facelet_state": state,
    }


@app.post("/api/solve")
def solve_cube_endpoint(req: SolveRequest):
    """Computes an optimal Two-Phase Kociemba solution with step-by-step 3D frames."""
    state = req.state
    if not state and req.face_colors:
        color_str = face_dict_to_state(req.face_colors)
        try:
            state = color_to_facelet_string(color_str)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to map face colors: {str(e)}")

    if not state or len(state) != 54:
        raise HTTPException(status_code=400, detail="Cube state must be 54 characters.")

    # Check if color letters were provided
    if any(c in ('W', 'Y', 'O') for c in state):
        try:
            state = color_to_facelet_string(state)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid color configuration: {str(e)}")

    try:
        solution = solve_cube(state)
        return solution
    except CubeValidationError as e:
        raise HTTPException(status_code=400, detail=f"Cube configuration is invalid: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Solver error: {str(e)}")


@app.get("/api/ml-metrics")
def get_ml_metrics():
    """Returns AI/ML model comparisons, confusion matrix, precision/recall, and CV pipeline steps."""
    return get_benchmark_metrics()


# ----------------------------------------------------------------------------
# Static Files & SPA Routing
# ----------------------------------------------------------------------------

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "AI Rubik's Cube Solver API is running."}
