"""Unit tests for Two-Phase Kociemba Solver."""
import unittest
from core.cube import SOLVED_STATE, apply_algorithm, is_solved
from core.solver import solve_cube


class TestSolver(unittest.TestCase):

    def test_solve_already_solved(self):
        res = solve_cube(SOLVED_STATE)
        self.assertTrue(res["is_solved"])
        self.assertEqual(res["total_moves"], 0)

    def test_solve_short_scrambles(self):
        test_scrambles = [
            "R U R' U'",
            "F2 D' B2 R2",
            "U2 R2 F2 D2",
            "R U R' F' U2 F",
            "L F R U' B2 D",
        ]
        for s in test_scrambles:
            scrambled = apply_algorithm(SOLVED_STATE, s)
            res = solve_cube(scrambled)
            self.assertTrue(res["is_solved"], f"Failed to solve scramble: {s}")
            self.assertGreater(len(res["moves"]), 0)
            
            # Verify solution returns cube to solved state
            final_state = apply_algorithm(scrambled, res["move_string"])
            self.assertTrue(
                is_solved(final_state),
                f"Solution '{res['move_string']}' did not solve scramble '{s}'. Final: {final_state}"
            )

    def test_solve_steps_structure(self):
        scrambled = apply_algorithm(SOLVED_STATE, "R U R' U'")
        res = solve_cube(scrambled)
        self.assertTrue(len(res["steps"]) > 0)
        
        # Verify first step properties
        step1 = res["steps"][0]
        self.assertEqual(step1["step"], 1)
        self.assertIn("move", step1)
        self.assertIn("face", step1)
        self.assertIn("action", step1)
        self.assertIn("state_after", step1)


if __name__ == '__main__':
    unittest.main()
