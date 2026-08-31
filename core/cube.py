"""
Rubik's Cube Representation, Move Engine, and Notation System.

Standard 54-Facelet Indexing:
    U (Up)    :  0..8   (White)
    R (Right) :  9..17  (Red)
    F (Front) : 18..26  (Green)
    D (Down)  : 27..35  (Yellow)
    L (Left)  : 36..44  (Orange)
    B (Back)  : 45..53  (Blue)

Facelet order per face:
    0 1 2
    3 4 5
    6 7 8
"""

import random
from typing import Dict, List, Tuple, Union

# Standard Western Color Palette
COLOR_MAP = {
    'U': 'W',  # White
    'R': 'R',  # Red
    'F': 'G',  # Green
    'D': 'Y',  # Yellow
    'L': 'O',  # Orange
    'B': 'B',  # Blue
}

COLOR_NAMES = {
    'W': 'White',
    'R': 'Red',
    'G': 'Green',
    'Y': 'Yellow',
    'O': 'Orange',
    'B': 'Blue',
}

HEX_COLORS = {
    'W': '#FFFFFF',
    'R': '#DC2626',  # Bright Red
    'G': '#16A34A',  # Vivid Green
    'Y': '#FACC15',  # Bright Yellow
    'O': '#EA580C',  # Orange
    'B': '#2563EB',  # Royal Blue
}

FACE_NAMES = {
    'U': 'Up',
    'R': 'Right',
    'F': 'Front',
    'D': 'Down',
    'L': 'Left',
    'B': 'Back',
}

# Solved 54-character state string:
# UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
SOLVED_STATE = "U" * 9 + "R" * 9 + "F" * 9 + "D" * 9 + "L" * 9 + "B" * 9
SOLVED_STATE_COLORS = "W" * 9 + "R" * 9 + "G" * 9 + "Y" * 9 + "O" * 9 + "B" * 9


class Facelet:
    U1, U2, U3, U4, U5, U6, U7, U8, U9 = range(9)
    R1, R2, R3, R4, R5, R6, R7, R8, R9 = range(9, 18)
    F1, F2, F3, F4, F5, F6, F7, F8, F9 = range(18, 27)
    D1, D2, D3, D4, D5, D6, D7, D8, D9 = range(27, 36)
    L1, L2, L3, L4, L5, L6, L7, L8, L9 = range(36, 45)
    B1, B2, B3, B4, B5, B6, B7, B8, B9 = range(45, 54)


class Color:
    U, R, F, D, L, B = range(6)


def _rotate_face_cw(base: int) -> List[Tuple[int, int]]:
    """Mapping for 90-degree clockwise rotation of a single face."""
    # 0 1 2       6 3 0
    # 3 4 5  -->  7 4 1
    # 6 7 8       8 5 2
    return [
        (base + 0, base + 6),
        (base + 1, base + 3),
        (base + 2, base + 0),
        (base + 3, base + 7),
        (base + 4, base + 4),
        (base + 5, base + 1),
        (base + 6, base + 8),
        (base + 7, base + 5),
        (base + 8, base + 2),
    ]


def _build_move_permutation(face: str) -> List[int]:
    """Generates the 54-element permutation array for a clockwise move."""
    perm = list(range(54))
    
    # Rotate the face itself
    face_offset = {'U': 0, 'R': 9, 'F': 18, 'D': 27, 'L': 36, 'B': 45}[face]
    for dst, src in _rotate_face_cw(face_offset):
        perm[dst] = src
        
    # Rotate adjacent layers
    if face == 'U':
        # Back -> Right -> Front -> Left -> Back (top rows)
        # B0..2 -> R0..2 -> F0..2 -> L0..2 -> B0..2
        cycles = [
            (18, 9), (19, 10), (20, 11),    # F <- R
            (9, 45), (10, 46), (11, 47),    # R <- B
            (45, 36), (46, 37), (47, 38),   # B <- L
            (36, 18), (37, 19), (38, 20),   # L <- F
        ]
        for dst, src in cycles:
            perm[dst] = src

    elif face == 'D':
        # Front -> Right -> Back -> Left -> Front (bottom rows)
        cycles = [
            (24, 42), (25, 43), (26, 44),   # F <- L
            (42, 51), (43, 52), (44, 53),   # L <- B
            (51, 15), (52, 16), (53, 17),   # B <- R
            (15, 24), (16, 25), (17, 26),   # R <- F
        ]
        for dst, src in cycles:
            perm[dst] = src

    elif face == 'F':
        # U bottom, R left col, D top, L right col
        # U6,7,8 -> R0,3,6 -> D2,1,0 -> L8,5,2 -> U6,7,8
        cycles = [
            (9, 6), (12, 7), (15, 8),       # R <- U
            (29, 9), (28, 12), (27, 15),    # D <- R
            (44, 29), (41, 28), (38, 27),   # L <- D
            (6, 44), (7, 41), (8, 38),      # U <- L
        ]
        for dst, src in cycles:
            perm[dst] = src

    elif face == 'B':
        # U top, L left col, D bottom, R right col
        # U2,1,0 -> L0,3,6 -> D6,7,8 -> R8,5,2 -> U2,1,0
        cycles = [
            (36, 2), (39, 1), (42, 0),      # L <- U
            (33, 36), (34, 39), (35, 42),   # D <- L
            (17, 33), (14, 34), (11, 35),   # R <- D
            (2, 17), (1, 14), (0, 11),      # U <- R
        ]
        for dst, src in cycles:
            perm[dst] = src

    elif face == 'L':
        # U left col, F left col, D left col, B right col reversed
        # U0,3,6 -> F0,3,6 -> D0,3,6 -> B8,5,2 -> U0,3,6
        cycles = [
            (18, 0), (21, 3), (24, 6),      # F <- U
            (27, 18), (30, 21), (33, 24),   # D <- F
            (53, 27), (50, 30), (47, 33),   # B <- D
            (0, 53), (3, 50), (6, 47),      # U <- B
        ]
        for dst, src in cycles:
            perm[dst] = src

    elif face == 'R':
        # U right col, B left col reversed, D right col, F right col
        # U8,5,2 -> B0,3,6 -> D8,5,2 -> F8,5,2 -> U8,5,2
        cycles = [
            (45, 8), (48, 5), (51, 2),      # B <- U
            (35, 45), (32, 48), (29, 51),   # D <- B
            (26, 35), (23, 32), (20, 29),   # F <- D
            (8, 26), (5, 23), (2, 20),      # U <- F
        ]
        for dst, src in cycles:
            perm[dst] = src

    return perm


# Precompute all 18 basic move permutations:
# U, U', U2, D, D', D2, F, F', F2, B, B', B2, L, L', L2, R, R', R2
MOVE_PERMUTATIONS: Dict[str, List[int]] = {}

for _f in ['U', 'R', 'F', 'D', 'L', 'B']:
    _p1 = _build_move_permutation(_f)
    _p2 = [_p1[_p1[i]] for i in range(54)]
    _p3 = [_p1[_p2[i]] for i in range(54)]
    
    MOVE_PERMUTATIONS[_f] = _p1
    MOVE_PERMUTATIONS[_f + "2"] = _p2
    MOVE_PERMUTATIONS[_f + "'"] = _p3


def solved_state() -> str:
    """Returns the solved 54-facelet representation."""
    return SOLVED_STATE


def apply_move(state: str, move: str) -> str:
    """Applies a single standard Rubik's cube move to a 54-facelet state string."""
    move = move.strip()
    if move not in MOVE_PERMUTATIONS:
        raise ValueError(f"Unknown move notation: '{move}'")
    
    perm = MOVE_PERMUTATIONS[move]
    return "".join(state[perm[i]] for i in range(54))


def apply_algorithm(state: str, algo: Union[str, List[str]]) -> str:
    """Applies a sequence of moves (e.g., "R U R' U'") to a state string."""
    if isinstance(algo, str):
        moves = [m.strip() for m in algo.split() if m.strip()]
    else:
        moves = algo
        
    current = state
    for m in moves:
        current = apply_move(current, m)
    return current


def is_solved(state: str) -> bool:
    """Checks if the cube state is in the solved configuration."""
    for face_idx in range(6):
        face_chars = state[face_idx * 9: (face_idx + 1) * 9]
        if len(set(face_chars)) != 1:
            return False
    return True


def generate_scramble(length: int = 20) -> str:
    """Generates a standard WCA-style random scramble sequence."""
    faces = ['U', 'D', 'L', 'R', 'F', 'B']
    modifiers = ['', "'", '2']
    opposite = {'U': 'D', 'D': 'U', 'L': 'R', 'R': 'L', 'F': 'B', 'B': 'F'}
    
    scramble: List[str] = []
    last_face = ""
    second_last_face = ""
    
    for _ in range(length):
        valid_faces = [
            f for f in faces
            if f != last_face and not (last_face and f == opposite.get(last_face) and last_face == second_last_face)
        ]
        face = random.choice(valid_faces)
        mod = random.choice(modifiers)
        scramble.append(f"{face}{mod}")
        
        second_last_face = last_face
        last_face = face
        
    return " ".join(scramble)


def state_to_face_dict(state: str) -> Dict[str, List[str]]:
    """Converts a 54-char string into a dictionary with faces U, R, F, D, L, B."""
    return {
        'U': list(state[0:9]),
        'R': list(state[9:18]),
        'F': list(state[18:27]),
        'D': list(state[27:36]),
        'L': list(state[36:45]),
        'B': list(state[45:54]),
    }


def face_dict_to_state(face_dict: Dict[str, List[str]]) -> str:
    """Combines a dictionary of 6 faces into a 54-character string."""
    return "".join("".join(face_dict[f]) for f in ['U', 'R', 'F', 'D', 'L', 'B'])


def color_to_facelet_string(color_state: str) -> str:
    """
    Converts a color-based 54-char string (e.g. 'WWWWWWWWWRRRRRRRRR...')
    into facelet notation ('UUUUUUUUURRRRRRRRR...').
    Uses the center stickers (indices 4, 13, 22, 31, 40, 49) as the face reference.
    """
    if len(color_state) != 54:
        raise ValueError(f"State must be 54 characters, got {len(color_state)}")
    
    center_indices = {'U': 4, 'R': 13, 'F': 22, 'D': 31, 'L': 40, 'B': 49}
    color_to_face = {color_state[idx]: face for face, idx in center_indices.items()}
    
    if len(color_to_face) != 6:
        raise ValueError("Centers are not 6 unique colors.")
        
    return "".join(color_to_face.get(c, '?') for c in color_state)


class Cube:
    """Object-oriented wrapper around the Rubik's Cube state engine."""
    
    def __init__(self, state: str = SOLVED_STATE):
        if len(state) != 54:
            raise ValueError(f"State must be 54 characters, got {len(state)}")
        self.state = state
        
    def move(self, move_str: str) -> 'Cube':
        """Applies move(s) in place and returns self."""
        self.state = apply_algorithm(self.state, move_str)
        return self
        
    def is_solved(self) -> bool:
        return is_solved(self.state)
        
    def scramble(self, length: int = 20) -> str:
        algo = generate_scramble(length)
        self.move(algo)
        return algo
        
    def to_faces(self) -> Dict[str, List[str]]:
        return state_to_face_dict(self.state)
        
    def __repr__(self) -> str:
        return f"<Cube state='{self.state}'>"
