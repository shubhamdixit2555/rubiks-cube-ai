"""Unit tests for Computer Vision and Color Classification Pipeline."""
import unittest
import numpy as np
import cv2
from cv.preprocessing import preprocess_image
from cv.grid_detector import extract_sticker_patches, order_points
from cv.color_classifier import classify_sticker_color, ColorClassifier


class TestComputerVision(unittest.TestCase):

    def test_order_points(self):
        # 4 unordered points of a square
        pts = np.array([[100, 100], [0, 100], [0, 0], [100, 0]], dtype=np.float32)
        ordered = order_points(pts)
        
        # Expected: [top-left (0,0), top-right (100,0), bottom-right (100,100), bottom-left (0,100)]
        np.testing.assert_array_equal(ordered[0], [0, 0])
        np.testing.assert_array_equal(ordered[1], [100, 0])
        np.testing.assert_array_equal(ordered[2], [100, 100])
        np.testing.assert_array_equal(ordered[3], [0, 100])

    def test_extract_sticker_patches(self):
        fake_face = np.zeros((300, 300, 3), dtype=np.uint8)
        stickers = extract_sticker_patches(fake_face, target_size=300, margin_pct=0.20)
        self.assertEqual(len(stickers), 9)
        self.assertEqual(stickers[0]["row"], 0)
        self.assertEqual(stickers[0]["col"], 0)
        self.assertEqual(stickers[8]["row"], 2)
        self.assertEqual(stickers[8]["col"], 2)

    def test_synthetic_color_classification(self):
        classifier = ColorClassifier()

        # Pure red patch (BGR: (0, 0, 255))
        red_patch = np.zeros((40, 40, 3), dtype=np.uint8)
        red_patch[:, :] = (20, 20, 220)
        res_red = classifier.classify_color(classifier.extract_patch_features(red_patch))
        self.assertEqual(res_red["color"], "R")
        self.assertGreater(res_red["confidence"], 70)

        # Pure green patch (BGR: (0, 255, 0))
        green_patch = np.zeros((40, 40, 3), dtype=np.uint8)
        green_patch[:, :] = (30, 200, 30)
        res_green = classifier.classify_color(classifier.extract_patch_features(green_patch))
        self.assertEqual(res_green["color"], "G")

        # Pure white patch (BGR: (240, 240, 240))
        white_patch = np.full((40, 40, 3), 245, dtype=np.uint8)
        res_white = classifier.classify_color(classifier.extract_patch_features(white_patch))
        self.assertEqual(res_white["color"], "W")


if __name__ == '__main__':
    unittest.main()
