"""Unit tests for Rubik's Cube representation, moves, and notation."""
import unittest
from core.cube import (
    SOLVED_STATE,
    apply_move,
    apply_algorithm,
    is_solved,
    generate_scramble,
    state_to_face_dict,
    face_dict_to_state,
    color_to_facelet_string,
    Cube,
)


class TestCube(unittest.TestCase):

    def test_solved_state(self):
        self.assertEqual(len(SOLVED_STATE), 54)
        self.assertTrue(is_solved(SOLVED_STATE))

    def test_move_identities(self):
        # 4 identical clockwise 90-degree moves return to original state (X^4 = I)
        for face in ['U', 'R', 'F', 'D', 'L', 'B']:
            state = SOLVED_STATE
            for _ in range(4):
                state = apply_move(state, face)
            self.assertEqual(state, SOLVED_STATE, f"Move {face}^4 did not return to solved state")

    def test_inverse_moves(self):
        # Move followed by its inverse returns to original state (X . X' = I)
        for face in ['U', 'R', 'F', 'D', 'L', 'B']:
            state = apply_move(SOLVED_STATE, face)
            state = apply_move(state, face + "'")
            self.assertEqual(state, SOLVED_STATE, f"Move {face} . {face}' did not return to solved state")

    def test_double_moves(self):
        # X2 . X2 = I
        for face in ['U', 'R', 'F', 'D', 'L', 'B']:
            state = apply_move(SOLVED_STATE, face + "2")
            state = apply_move(state, face + "2")
            self.assertEqual(state, SOLVED_STATE, f"Move {face}2 . {face}2 did not return to solved state")

    def test_sexy_move_cycle(self):
        # The standard 6-repetition "Sexy Move" (R U R' U')^6 = Solved
        state = SOLVED_STATE
        for _ in range(6):
            state = apply_algorithm(state, "R U R' U'")
        self.assertEqual(state, SOLVED_STATE, "6x (R U R' U') did not return to solved state")

    def test_scramble_generation(self):
        scramble = generate_scramble(20)
        moves = scramble.split()
        self.assertEqual(len(moves), 20)
        
        # Scrambled state should no longer be solved
        state = apply_algorithm(SOLVED_STATE, scramble)
        self.assertFalse(is_solved(state))

    def test_face_dict_roundtrip(self):
        faces = state_to_face_dict(SOLVED_STATE)
        self.assertEqual(len(faces), 6)
        for f, stickers in faces.items():
            self.assertEqual(len(stickers), 9)
        reconstructed = face_dict_to_state(faces)
        self.assertEqual(reconstructed, SOLVED_STATE)

    def test_cube_class(self):
        c = Cube()
        self.assertTrue(c.is_solved())
        c.move("R U R' U'")
        self.assertFalse(c.is_solved())
        c.move("U R U' R'")  # Inverse
        # Note: (R U R' U')^-1 = U R U' R'
        self.assertTrue(c.is_solved())


if __name__ == '__main__':
    unittest.main()
