"""
Image Preprocessing Pipeline for Rubik's Cube Face Photography.

Features:
- Robust image loading from raw bytes, base64 strings, or NumPy arrays.
- Automatic orientation / dimension standardization.
- CLAHE (Contrast Limited Adaptive Histogram Equalization) on lightness channel to handle glare and uneven lighting.
- Bilateral filtering to reduce noise on plastic cube textures while maintaining crisp edge boundaries.
"""

import base64
import io
from typing import Tuple, Union
import numpy as np
import cv2
from PIL import Image, ImageOps


def load_image_from_bytes(image_data: Union[bytes, str]) -> np.ndarray:
    """
    Decodes an image from raw bytes, base64 encoded data-URL, or plain base64 string.
    Returns standard BGR NumPy array suitable for OpenCV operations.
    """
    if isinstance(image_data, str):
        if "base64," in image_data:
            image_data = image_data.split("base64,")[1]
        raw_bytes = base64.b64decode(image_data)
    else:
        raw_bytes = image_data

    # Load with PIL to auto-handle EXIF orientation tags from smartphone cameras
    pil_img = Image.open(io.BytesIO(raw_bytes))
    pil_img = ImageOps.exif_transpose(pil_img)
    pil_img = pil_img.convert("RGB")
    
    # Convert RGB to BGR for OpenCV
    rgb_arr = np.array(pil_img)
    bgr_arr = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)
    return bgr_arr


def preprocess_image(bgr_image: np.ndarray, target_max_dim: int = 800) -> Tuple[np.ndarray, np.ndarray]:
    """
    Applies standard illumination normalization and edge-preserving smoothing.
    
    Returns:
        (processed_bgr: np.ndarray, enhanced_gray: np.ndarray)
    """
    # 1. Resize if image is huge to maintain blazing speed
    h, w = bgr_image.shape[:2]
    if max(h, w) > target_max_dim:
        scale = target_max_dim / max(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        bgr = cv2.resize(bgr_image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    else:
        bgr = bgr_image.copy()

    # 2. Bilateral filter to smooth texture while keeping sticker borders sharp
    smooth_bgr = cv2.bilateralFilter(bgr, d=9, sigmaColor=75, sigmaSpace=75)

    # 3. CLAHE in LAB color space (enhances luminance L without shifting color hue A/B)
    lab = cv2.cvtColor(smooth_bgr, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced_l = clahe.apply(l_chan)
    
    enhanced_lab = cv2.merge((enhanced_l, a_chan, b_chan))
    processed_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
    
    # Also generate high-contrast grayscale for contour localization
    gray = cv2.cvtColor(processed_bgr, cv2.COLOR_BGR2GRAY)
    
    return processed_bgr, gray


def encode_image_to_base64(bgr_image: np.ndarray, format: str = ".jpg") -> str:
    """Encodes an OpenCV image to a base64 data-URI string."""
    success, buffer = cv2.imencode(format, bgr_image)
    if not success:
        return ""
    b64_str = base64.b64encode(buffer).decode("utf-8")
    mime = "image/jpeg" if format.lower() in [".jpg", ".jpeg"] else "image/png"
    return f"data:{mime};base64,{b64_str}"
