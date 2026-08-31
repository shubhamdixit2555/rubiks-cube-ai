"""
Computer Vision Grid Detector & Perspective Rectifier.

Locates the 3x3 Rubik's cube face from an uploaded photo or webcam frame,
applies perspective transformation (homography rectification), and segments
the 9 individual sticker regions with adaptive margin protection.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import cv2


def order_points(pts: np.ndarray) -> np.ndarray:
    """
    Orders 4 quadrilateral coordinates in canonical sequence:
    [top-left, top-right, bottom-right, bottom-left]
    """
    rect = np.zeros((4, 2), dtype="float32")

    # Top-left has smallest sum (x+y), bottom-right has largest sum (x+y)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    # Top-right has smallest diff (y-x), bottom-left has largest diff (y-x)
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]

    return rect


def four_point_transform(image: np.ndarray, pts: np.ndarray, target_size: int = 300) -> np.ndarray:
    """
    Warps a 4-point quadrilateral region into a square target_size x target_size image.
    """
    rect = order_points(pts)
    dst = np.array([
        [0, 0],
        [target_size - 1, 0],
        [target_size - 1, target_size - 1],
        [0, target_size - 1]
    ], dtype="float32")

    # Compute perspective transformation matrix and warp
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (target_size, target_size), flags=cv2.INTER_LINEAR)
    return warped


def find_cube_face_contour(bgr_image: np.ndarray, gray_image: np.ndarray) -> Optional[np.ndarray]:
    """
    Searches for the 4-corner contour of the Rubik's cube face.
    Returns 4x2 array of corner points if found, else None.
    """
    h, w = gray_image.shape[:2]
    img_area = h * w

    # Edge detection and morphological dilation to connect broken sticker borders
    blurred = cv2.GaussianBlur(gray_image, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 150)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(edges, kernel, iterations=2)

    contours, _ = cv2.findContours(dilated, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    best_quad = None
    best_score = 0.0

    for c in contours:
        area = cv2.contourArea(c)
        if area < 0.12 * img_area:  # Must occupy at least 12% of the image
            continue

        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.04 * peri, True)

        if len(approx) == 4 and cv2.isContourConvex(approx):
            # Check aspect ratio of bounding rect
            x, y, bw, bh = cv2.boundingRect(approx)
            aspect = float(bw) / float(bh) if bh > 0 else 0
            if 0.7 <= aspect <= 1.4:
                # Score based on area and squarish aspect ratio
                score = area * (1.0 - abs(1.0 - aspect))
                if score > best_score:
                    best_score = score
                    best_quad = approx.reshape(4, 2)

    return best_quad


def extract_fallback_center_face(bgr_image: np.ndarray, target_size: int = 300) -> Tuple[np.ndarray, np.ndarray]:
    """
    Fallback when explicit 4-corner polygon is not found (e.g., tight close-up framing).
    Crops the center square of the image.
    """
    h, w = bgr_image.shape[:2]
    side = int(min(h, w) * 0.78)
    cx, cy = w // 2, h // 2
    x1, y1 = max(0, cx - side // 2), max(0, cy - side // 2)
    x2, y2 = min(w, x1 + side), min(h, y1 + side)

    cropped = bgr_image[y1:y2, x1:x2]
    warped = cv2.resize(cropped, (target_size, target_size), interpolation=cv2.INTER_AREA)

    corners = np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype="float32")
    return warped, corners


def extract_sticker_patches(
    rectified_face: np.ndarray,
    target_size: int = 300,
    margin_pct: float = 0.22
) -> List[Dict]:
    """
    Divides a 300x300 rectified face image into 9 sticker patches.
    Applies margin padding to avoid black borders and corner chamfers.
    
    Returns list of 9 dicts containing:
        - index: 0..8
        - row: 0..2
        - col: 0..2
        - patch: BGR image crop
        - bbox: (x1, y1, x2, y2) within the 300x300 image
    """
    cell_size = target_size // 3
    margin = int(cell_size * margin_pct)

    stickers = []
    idx = 0
    for r in range(3):
        for c in range(3):
            # Full cell coordinates
            cell_x1 = c * cell_size
            cell_y1 = r * cell_size
            cell_x2 = cell_x1 + cell_size
            cell_y2 = cell_y1 + cell_size

            # Inset crop for clean color sampling
            crop_x1 = cell_x1 + margin
            crop_y1 = cell_y1 + margin
            crop_x2 = cell_x2 - margin
            crop_y2 = cell_y2 - margin

            patch = rectified_face[crop_y1:crop_y2, crop_x1:crop_x2]

            stickers.append({
                "index": idx,
                "row": r,
                "col": c,
                "patch": patch,
                "cell_bbox": (cell_x1, cell_y1, cell_x2, cell_y2),
                "sample_bbox": (crop_x1, crop_y1, crop_x2, crop_y2),
            })
            idx += 1

    return stickers


def detect_cube_face_and_stickers(
    bgr_image: np.ndarray,
    gray_image: np.ndarray,
    target_size: int = 300
) -> Tuple[np.ndarray, List[Dict], bool, np.ndarray]:
    """
    Full face detection pipeline:
    1. Locates face contour or uses fallback center bounding box.
    2. Rectifies face into square standard dimensions.
    3. Segments 9 sticker patches.
    
    Returns:
        (rectified_face, stickers, contour_found: bool, corners: np.ndarray)
    """
    quad = find_cube_face_contour(bgr_image, gray_image)
    if quad is not None:
        rectified = four_point_transform(bgr_image, quad.astype("float32"), target_size)
        contour_found = True
        corners = quad
    else:
        rectified, corners = extract_fallback_center_face(bgr_image, target_size)
        contour_found = False

    stickers = extract_sticker_patches(rectified, target_size=target_size)
    return rectified, stickers, contour_found, corners
