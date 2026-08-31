"""Unit tests for physical cube mathematical validator."""
import unittest
from core.cube import SOLVED_STATE, apply_algorithm
from core.validator import validate_cube


class TestValidator(unittest.TestCase):

    def test_valid_solved_cube(self):
        is_valid, err = validate_cube(SOLVED_STATE)
        self.assertTrue(is_valid)
        self.assertIsNone(err)

    def test_valid_scrambled_cubes(self):
        scrambles = [
            "R U R' U'",
            "F2 D' B2 R2 D' L2 F2 U L2 U2 F2 R' U B' L' R D' B' F2 R2",
            "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L' B2 U2 F2",
        ]
        for s in scrambles:
            state = apply_algorithm(SOLVED_STATE, s)
            is_valid, err = validate_cube(state)
            self.assertTrue(is_valid, f"Scramble '{s}' was marked invalid: {err}")

    def test_invalid_length(self):
        is_valid, err = validate_cube("UUUU")
        self.assertFalse(is_valid)
        self.assertIn("Invalid length", err)

    def test_invalid_color_counts(self):
        # Change one U to R (10 R's, 8 U's)
        state_list = list(SOLVED_STATE)
        state_list[0] = 'R'
        bad_state = "".join(state_list)
        is_valid, err = validate_cube(bad_state)
        self.assertFalse(is_valid)
        self.assertIn("Color count mismatch", err)

    def test_invalid_corner_twist(self):
        # Manually twist corner URF (indices 8, 9, 20)
        # Originally U8='U', R0='R', F2='F'
        # Twisted: U8='R', R0='F', F2='U'
        state_list = list(SOLVED_STATE)
        state_list[8] = 'R'
        state_list[9] = 'F'
        state_list[20] = 'U'
        bad_state = "".join(state_list)
        is_valid, err = validate_cube(bad_state)
        self.assertFalse(is_valid)
        self.assertTrue("corner orientation parity" in err or "parity" in err)

    def test_invalid_edge_flip(self):
        # Manually flip single edge UR (indices 5, 10)
        # Originally U5='U', R1='R'
        # Flipped: U5='R', R1='U'
        state_list = list(SOLVED_STATE)
        state_list[5] = 'R'
        state_list[10] = 'U'
        bad_state = "".join(state_list)
        is_valid, err = validate_cube(bad_state)
        self.assertFalse(is_valid)
        self.assertTrue("edge orientation parity" in err or "parity" in err)


if __name__ == '__main__':
    unittest.main()
