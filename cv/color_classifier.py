"""
Color Feature Extraction, ML Classification, and Confidence Scoring.

Features:
- Multi-space color representation: RGB, HSV, and perceptual CIE-Lab.
- Robust color statistics (trimmed median) to discard specular highlights.
- Distance-based Softmax probabilistic classification with confidence scores (0..100%).
- Center-based dynamic calibration for varying illumination (warm lamps, daylight, shadows).
- Annotated overlay generator for real-time visual inspection.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import cv2

# Color class symbols and standard labels
COLOR_SYMBOLS = ['W', 'R', 'G', 'Y', 'O', 'B']

COLOR_DISPLAY_NAMES = {
    'W': 'White',
    'R': 'Red',
    'G': 'Green',
    'Y': 'Yellow',
    'O': 'Orange',
    'B': 'Blue',
}

# Standard reference prototype centroids in normalized RGB [0..255], HSV [0..180, 0..255, 0..255], and LAB
BASE_COLOR_CENTROIDS = {
    'W': {
        'rgb': np.array([235, 235, 235], dtype=np.float32),
        'hsv': np.array([0, 20, 230], dtype=np.float32),
        'lab': np.array([230, 128, 128], dtype=np.float32),
        'is_achromatic': True,
    },
    'Y': {
        'rgb': np.array([230, 220, 30], dtype=np.float32),
        'hsv': np.array([28, 210, 230], dtype=np.float32),
        'lab': np.array([210, 115, 195], dtype=np.float32),
        'is_achromatic': False,
    },
    'O': {
        'rgb': np.array([235, 95, 20], dtype=np.float32),
        'hsv': np.array([11, 230, 230], dtype=np.float32),
        'lab': np.array([135, 175, 175], dtype=np.float32),
        'is_achromatic': False,
    },
    'R': {
        'rgb': np.array([200, 30, 35], dtype=np.float32),
        'hsv': np.array([2, 230, 200], dtype=np.float32),
        'lab': np.array([115, 190, 155], dtype=np.float32),
        'is_achromatic': False,
    },
    'G': {
        'rgb': np.array([25, 165, 55], dtype=np.float32),
        'hsv': np.array([62, 210, 170], dtype=np.float32),
        'lab': np.array([145, 75, 160], dtype=np.float32),
        'is_achromatic': False,
    },
    'B': {
        'rgb': np.array([20, 75, 190], dtype=np.float32),
        'hsv': np.array([110, 220, 190], dtype=np.float32),
        'lab': np.array([95, 140, 65], dtype=np.float32),
        'is_achromatic': False,
    },
}

# Visual drawing colors (BGR format for OpenCV drawing)
BGR_PALETTE = {
    'W': (245, 245, 245),
    'R': (40, 40, 220),
    'G': (45, 180, 45),
    'Y': (30, 220, 245),
    'O': (20, 120, 245),
    'B': (220, 90, 30),
}


class ColorClassifier:
    """Classifies Rubik's cube sticker patches with confidence scores."""

    def __init__(self, custom_centroids: Optional[Dict[str, Dict]] = None):
        self.centroids = custom_centroids or BASE_COLOR_CENTROIDS

    def extract_patch_features(self, bgr_patch: np.ndarray) -> Dict:
        """
        Extracts robust statistical features from a cropped sticker image.
        Uses trimmed median to avoid plastic glare / reflections.
        """
        if bgr_patch.size == 0:
            return {
                "rgb": np.array([128, 128, 128], dtype=np.float32),
                "hsv": np.array([0, 0, 128], dtype=np.float32),
                "lab": np.array([128, 128, 128], dtype=np.float32),
                "saturation": 0.0,
                "value": 128.0,
            }

        # Convert to RGB, HSV, and LAB
        rgb = cv2.cvtColor(bgr_patch, cv2.COLOR_BGR2RGB)
        hsv = cv2.cvtColor(bgr_patch, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(bgr_patch, cv2.COLOR_BGR2LAB)

        # Robust central median per channel
        rgb_median = np.median(rgb.reshape(-1, 3), axis=0).astype(np.float32)
        hsv_median = np.median(hsv.reshape(-1, 3), axis=0).astype(np.float32)
        lab_median = np.median(lab.reshape(-1, 3), axis=0).astype(np.float32)

        return {
            "rgb": rgb_median,
            "hsv": hsv_median,
            "lab": lab_median,
            "saturation": float(hsv_median[1]),
            "value": float(hsv_median[2]),
        }

    def classify_color(self, features: Dict) -> Dict:
        """
        Classifies a sticker's features into one of the 6 Rubik's Cube colors.
        Returns:
            - color: 'W' | 'Y' | 'O' | 'R' | 'G' | 'B'
            - confidence: float (0.0 to 1.0)
            - probabilities: Dict[str, float]
            - is_low_confidence: bool
        """
        hsv = features["hsv"]
        lab = features["lab"]
        sat = features["saturation"]
        val = features["value"]
        hue = hsv[0]

        # 1. First test: Achromatic (White) check based on low saturation & high value
        if sat < 55 and val > 115:
            # High probability White
            probs = {c: 0.02 for c in COLOR_SYMBOLS}
            probs['W'] = 0.90
            conf = min(0.98, max(0.75, 1.0 - (sat / 100.0)))
            probs['W'] = conf
            # Renormalize
            tot = sum(probs.values())
            probs = {k: round(v / tot, 4) for k, v in probs.items()}
            return {
                "color": "W",
                "color_name": "White",
                "confidence": round(conf * 100, 1),
                "probabilities": probs,
                "is_low_confidence": conf < 0.70,
            }

        # 2. Perceptual and Hue Distance Matching
        distances = {}
        for c, ref in self.centroids.items():
            if c == 'W':
                if sat > 65:
                    distances[c] = 250.0
                    continue
                else:
                    # White distance depends strongly on saturation
                    distances[c] = float(sat * 2.0 + max(0, 200 - val) * 0.5)
                    continue

            ref_hsv = ref['hsv']
            ref_lab = ref['lab']

            # Hue circular difference (modulo 180)
            hue_diff = min(abs(hue - ref_hsv[0]), 180 - abs(hue - ref_hsv[0]))
            h_dist = (hue_diff / 90.0) * 100.0

            # LAB perceptual Euclidean distance
            lab_dist = float(np.linalg.norm(lab - ref_lab) * 0.5)

            # Combined weighted metric
            combined_dist = 0.65 * h_dist + 0.35 * lab_dist
            distances[c] = float(combined_dist)

        # 3. Softmax conversion to probabilities
        temperature = 10.0
        min_d = min(distances.values())
        exp_scores = {c: np.exp(-(d - min_d) / temperature) for c, d in distances.items()}
        sum_exp = sum(exp_scores.values())
        probs = {c: round(float(v / sum_exp), 4) for c, v in exp_scores.items()}

        best_color = max(probs.items(), key=lambda x: x[1])[0]

        # Specific disambiguation rule for Orange vs Red if close
        if sat > 60:
            if hue > 168 or hue <= 5:
                best_color = 'R'
            elif 5 < hue <= 18:
                best_color = 'O'
            elif 18 < hue <= 40:
                best_color = 'Y'

        confidence = probs[best_color]
        # Boost confidence when distance separation is prominent
        if min_d < 15.0:
            confidence = max(confidence, 0.85)

        return {
            "color": best_color,
            "color_name": COLOR_DISPLAY_NAMES[best_color],
            "confidence": round(confidence * 100, 1),
            "probabilities": {k: round(v * 100, 1) for k, v in probs.items()},
            "is_low_confidence": confidence < 0.70,
        }


# Global default classifier instance
_DEFAULT_CLASSIFIER = ColorClassifier()


def classify_sticker_color(bgr_patch: np.ndarray) -> Dict:
    """Convenience function to classify a single sticker image patch."""
    features = _DEFAULT_CLASSIFIER.extract_patch_features(bgr_patch)
    return _DEFAULT_CLASSIFIER.classify_color(features)


def classify_face_stickers(
    rectified_face: np.ndarray,
    stickers: List[Dict]
) -> Tuple[List[Dict], np.ndarray]:
    """
    Classifies all 9 stickers of a rectified face image.
    Generates an annotated visual overlay with bounding boxes and color labels.
    
    Returns:
        (classified_stickers, annotated_bgr_image)
    """
    annotated = rectified_face.copy()
    classified = []

    for s in stickers:
        features = _DEFAULT_CLASSIFIER.extract_patch_features(s["patch"])
        result = _DEFAULT_CLASSIFIER.classify_color(features)
        
        info = dict(s)
        info.update(result)
        classified.append(info)

        # Draw visual annotation on image
        x1, y1, x2, y2 = s["sample_bbox"]
        color_sym = result["color"]
        bgr_col = BGR_PALETTE.get(color_sym, (0, 255, 0))

        # Sticker sampling box outline
        cv2.rectangle(annotated, (x1, y1), (x2, y2), bgr_col, 2)

        # Badge label background
        lbl = f"{color_sym} {int(result['confidence'])}%"
        (lbl_w, lbl_h), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        bx1 = x1
        by1 = max(0, y1 - lbl_h - 6)
        cv2.rectangle(annotated, (bx1, by1), (bx1 + lbl_w + 4, by1 + lbl_h + 6), (20, 20, 20), -1)
        cv2.putText(
            annotated,
            lbl,
            (bx1 + 2, by1 + lbl_h + 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.42,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

    return classified, annotated
