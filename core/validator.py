"""
Rubik's Cube State Validator.

Performs rigorous mathematical checks to ensure a 54-facelet configuration
corresponds to a physically solvable 3x3 Rubik's Cube:
1. Exact facelet counts (9 of each color/face).
2. Distinct and valid 6 centers.
3. 8 valid corner pieces (no duplicate or impossible combinations).
4. Corner twist parity (sum of twists mod 3 == 0).
5. 12 valid edge pieces (no duplicate or impossible combinations).
6. Edge flip parity (sum of flips mod 2 == 0).
7. Total permutation parity (Corner parity == Edge parity).
"""

from typing import Dict, List, Optional, Tuple


class CubeValidationError(Exception):
    """Raised when a cube configuration is physically impossible."""
    pass


# Corner definitions: (Index on U/D, Index on clockwise face, Index on counter-clockwise face)
CORNER_INDICES = [
    (8, 9, 20),   # URF (U8, R0, F2)
    (6, 18, 38),  # UFL (U6, F0, L2)
    (0, 36, 47),  # ULB (U0, L0, B2)
    (2, 45, 11),  # UBR (U2, B0, R2)
    (29, 26, 15), # DFR (D2, F8, R6)
    (27, 44, 24), # DLF (D0, L8, F6)
    (33, 53, 42), # DBL (D6, B8, L6)
    (35, 17, 51), # DRB (D8, R8, B6)
]

CORNER_BASE_COLORS = [
    {'U', 'R', 'F'},
    {'U', 'F', 'L'},
    {'U', 'L', 'B'},
    {'U', 'B', 'R'},
    {'D', 'F', 'R'},
    {'D', 'L', 'F'},
    {'D', 'B', 'L'},
    {'D', 'R', 'B'},
]

# Edge definitions: (Index 1, Index 2)
EDGE_INDICES = [
    (5, 10),   # UR (U5, R1)
    (7, 19),   # UF (U7, F1)
    (3, 37),   # UL (U3, L1)
    (1, 46),   # UB (U1, B1)
    (32, 16),  # DR (D5, R7)
    (28, 25),  # DF (D1, F7)
    (30, 43),  # DL (D3, L7)
    (34, 52),  # DB (D7, B7)
    (23, 12),  # FR (F5, R3)
    (21, 41),  # FL (F3, L5)
    (50, 39),  # BL (B5, L3)
    (48, 14),  # BR (B3, R5)
]

EDGE_BASE_COLORS = [
    {'U', 'R'}, {'U', 'F'}, {'U', 'L'}, {'U', 'B'},
    {'D', 'R'}, {'D', 'F'}, {'D', 'L'}, {'D', 'B'},
    {'F', 'R'}, {'F', 'L'}, {'B', 'L'}, {'B', 'R'},
]


def _count_inversions(perm: List[int]) -> int:
    """Computes the parity (number of inversions) of a permutation."""
    inv = 0
    for i in range(len(perm)):
        for j in range(i + 1, len(perm)):
            if perm[i] > perm[j]:
                inv += 1
    return inv % 2


def validate_cube(state: str) -> Tuple[bool, Optional[str]]:
    """
    Validates a 54-facelet string.
    Returns:
        (is_valid: bool, error_message: Optional[str])
    """
    if len(state) != 54:
        return False, f"Invalid length: state must be 54 characters, got {len(state)}."

    # 1. Check facelet counts
    counts: Dict[str, int] = {}
    for char in state:
        counts[char] = counts.get(char, 0) + 1
        
    expected_faces = ['U', 'R', 'F', 'D', 'L', 'B']
    for face in expected_faces:
        if counts.get(face, 0) != 9:
            return False, f"Color count mismatch: Face '{face}' has {counts.get(face, 0)} stickers (expected 9)."

    # 2. Check centers
    centers = [state[4], state[13], state[22], state[31], state[40], state[49]]
    if len(set(centers)) != 6:
        return False, "Cube center stickers are not 6 distinct faces."

    # 3. Check Corners (Pieces and Twists)
    total_corner_twist = 0
    corner_perm: List[int] = []
    seen_corners = set()

    for idx, (c0, c1, c2) in enumerate(CORNER_INDICES):
        stickers = (state[c0], state[c1], state[c2])
        sticker_set = set(stickers)
        
        # Find which canonical corner this corresponds to
        matched_corner = -1
        for c_idx, base_set in enumerate(CORNER_BASE_COLORS):
            if sticker_set == base_set:
                matched_corner = c_idx
                break
                
        if matched_corner == -1:
            return False, f"Impossible corner piece detected at position {idx} with colors {stickers}."
            
        if matched_corner in seen_corners:
            return False, f"Duplicate corner piece detected ({stickers})."
        seen_corners.add(matched_corner)
        corner_perm.append(matched_corner)

        # Twist calculation (Orientation with respect to U or D face)
        # 0: U/D sticker is on U/D face
        # 1: U/D sticker is rotated clockwise
        # 2: U/D sticker is rotated counter-clockwise
        if state[c0] in ('U', 'D'):
            twist = 0
        elif state[c1] in ('U', 'D'):
            twist = 1
        elif state[c2] in ('U', 'D'):
            twist = 2
        else:
            return False, f"Corner at position {idx} has no U or D sticker."
            
        total_corner_twist += twist

    if total_corner_twist % 3 != 0:
        return False, f"Invalid corner orientation parity: total twist sum ({total_corner_twist}) is not divisible by 3 (a corner is twisted)."

    # 4. Check Edges (Pieces and Flips)
    total_edge_flip = 0
    edge_perm: List[int] = []
    seen_edges = set()

    for idx, (e0, e1) in enumerate(EDGE_INDICES):
        stickers = (state[e0], state[e1])
        sticker_set = set(stickers)
        
        matched_edge = -1
        for e_idx, base_set in enumerate(EDGE_BASE_COLORS):
            if sticker_set == base_set:
                matched_edge = e_idx
                break
                
        if matched_edge == -1:
            return False, f"Impossible edge piece detected at position {idx} with colors {stickers}."
            
        if matched_edge in seen_edges:
            return False, f"Duplicate edge piece detected ({stickers})."
        seen_edges.add(matched_edge)
        edge_perm.append(matched_edge)

        # Flip calculation:
        # Standard convention: U/D color on U/D facelet is 0. If in middle slice, F/B color on F/B facelet is 0.
        if state[e0] in ('U', 'D'):
            flip = 0
        elif state[e1] in ('U', 'D'):
            flip = 1
        elif state[e0] in ('F', 'B'):
            flip = 0
        elif state[e1] in ('F', 'B'):
            flip = 1
        else:
            flip = 0
            
        total_edge_flip += flip

    if total_edge_flip % 2 != 0:
        return False, f"Invalid edge orientation parity: total flip sum ({total_edge_flip}) is odd (a single edge is flipped)."

    # 5. Check Total Permutation Parity
    corner_parity = _count_inversions(corner_perm)
    edge_parity = _count_inversions(edge_perm)

    if corner_parity != edge_parity:
        return False, f"Invalid permutation parity: corner parity ({corner_parity}) != edge parity ({edge_parity}). Two pieces swapped."

    return True, None
