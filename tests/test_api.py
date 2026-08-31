"""Integration tests for FastAPI endpoints."""
import unittest
import base64
import numpy as np
import cv2
from fastapi.testclient import TestClient
from api.app import app


class TestAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_endpoint(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")

    def test_scramble_endpoint(self):
        res = self.client.get("/api/scramble?length=18")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("scramble", data)
        self.assertEqual(len(data["facelet_state"]), 54)
        self.assertEqual(len(data["color_state"]), 54)

    def test_solve_endpoint(self):
        # 1. Scramble
        scramble_res = self.client.get("/api/scramble?length=10")
        scramble_data = scramble_res.json()
        
        # 2. Solve
        solve_res = self.client.post("/api/solve", json={"state": scramble_data["facelet_state"]})
        self.assertEqual(solve_res.status_code, 200)
        solve_data = solve_res.json()
        self.assertTrue(solve_data["is_solved"])
        self.assertGreaterEqual(solve_data["total_moves"], 0)
        self.assertIn("steps", solve_data)

    def test_ml_metrics_endpoint(self):
        res = self.client.get("/api/ml-metrics")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("models", data)
        self.assertEqual(len(data["models"]), 6)
        self.assertIn("confusion_matrix", data)

    def test_analyze_face_endpoint(self):
        # Create synthetic green face image
        fake_img = np.zeros((300, 300, 3), dtype=np.uint8)
        fake_img[:, :] = (30, 200, 30)  # BGR Green
        _, buf = cv2.imencode(".jpg", fake_img)
        b64_str = base64.b64encode(buf).decode("utf-8")

        res = self.client.post("/api/analyze-face", json={"image_base64": b64_str, "face_name": "F"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["stickers"]), 9)
        self.assertEqual(data["stickers"][0]["color"], "G")
        self.assertIn("annotated_image", data)


if __name__ == '__main__':
    unittest.main()
