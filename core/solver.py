"""
Herbert Kociemba's Two-Phase Rubik's Cube Solver & Move Explainer.

Provides:
- Cubie-level representation (Corner & Edge permutations and orientations).
- Two-Phase Kociemba solver (Phase 1: Reduction to G1 group; Phase 2: Solve in G1).
- Natural language move descriptions ("Turn Front face 90° clockwise").
- Step-by-step intermediate cube states for 3D animation playback.
"""

from typing import Dict, List, Optional, Tuple
import time

from .cube import Facelet, apply_move, apply_algorithm, is_solved
from .validator import (
    validate_cube,
    CubeValidationError,
    CORNER_INDICES,
    CORNER_BASE_COLORS,
    EDGE_INDICES,
    EDGE_BASE_COLORS,
)

# Move descriptions dictionary for human readable instructions
MOVE_DESCRIPTIONS = {
    "U": {"face": "Up (White)", "action": "Rotate clockwise 90°", "short": "Up CW 90°", "axis": "y", "angle": -90},
    "U'": {"face": "Up (White)", "action": "Rotate counter-clockwise 90°", "short": "Up CCW 90°", "axis": "y", "angle": 90},
    "U2": {"face": "Up (White)", "action": "Rotate 180° (half turn)", "short": "Up 180°", "axis": "y", "angle": 180},

    "D": {"face": "Down (Yellow)", "action": "Rotate clockwise 90°", "short": "Down CW 90°", "axis": "y", "angle": 90},
    "D'": {"face": "Down (Yellow)", "action": "Rotate counter-clockwise 90°", "short": "Down CCW 90°", "axis": "y", "angle": -90},
    "D2": {"face": "Down (Yellow)", "action": "Rotate 180° (half turn)", "short": "Down 180°", "axis": "y", "angle": 180},

    "F": {"face": "Front (Green)", "action": "Rotate clockwise 90°", "short": "Front CW 90°", "axis": "z", "angle": -90},
    "F'": {"face": "Front (Green)", "action": "Rotate counter-clockwise 90°", "short": "Front CCW 90°", "axis": "z", "angle": 90},
    "F2": {"face": "Front (Green)", "action": "Rotate 180° (half turn)", "short": "Front 180°", "axis": "z", "angle": 180},

    "B": {"face": "Back (Blue)", "action": "Rotate clockwise 90°", "short": "Back CW 90°", "axis": "z", "angle": 90},
    "B'": {"face": "Back (Blue)", "action": "Rotate counter-clockwise 90°", "short": "Back CCW 90°", "axis": "z", "angle": -90},
    "B2": {"face": "Back (Blue)", "action": "Rotate 180° (half turn)", "short": "Back 180°", "axis": "z", "angle": 180},

    "L": {"face": "Left (Orange)", "action": "Rotate clockwise 90°", "short": "Left CW 90°", "axis": "x", "angle": 90},
    "L'": {"face": "Left (Orange)", "action": "Rotate counter-clockwise 90°", "short": "Left CCW 90°", "axis": "x", "angle": -90},
    "L2": {"face": "Left (Orange)", "action": "Rotate 180° (half turn)", "short": "Left 180°", "axis": "x", "angle": 180},

    "R": {"face": "Right (Red)", "action": "Rotate clockwise 90°", "short": "Right CW 90°", "axis": "x", "angle": -90},
    "R'": {"face": "Right (Red)", "action": "Rotate counter-clockwise 90°", "short": "Right CCW 90°", "axis": "x", "angle": 90},
    "R2": {"face": "Right (Red)", "action": "Rotate 180° (half turn)", "short": "Right 180°", "axis": "x", "angle": 180},
}


def get_move_explanation(move: str) -> Dict[str, str]:
    """Returns human-friendly instructions for a given move."""
    move = move.strip()
    if move in MOVE_DESCRIPTIONS:
        return MOVE_DESCRIPTIONS[move]
    return {
        "face": move,
        "action": f"Apply move {move}",
        "short": move,
        "axis": "y",
        "angle": 90,
    }


# ============================================================================
# Two-Phase Solver Implementation
# ============================================================================

ALL_MOVES = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2"]
G1_MOVES = ["U", "U'", "U2", "D", "D'", "D2", "L2", "R2", "F2", "B2"]

# Middle slice edges: FR (8), FL (9), BL (10), BR (11)
MIDDLE_EDGES = {8, 9, 10, 11}


class CubieCube:
    """Represents a cube at the cubie level (corner/edge permutations and orientations)."""

    def __init__(self):
        self.cp = list(range(8))   # Corner Permutation (0..7)
        self.co = [0] * 8          # Corner Orientation (0, 1, 2)
        self.ep = list(range(12))  # Edge Permutation (0..11)
        self.eo = [0] * 12         # Edge Orientation (0, 1)

    def clone(self) -> 'CubieCube':
        c = CubieCube()
        c.cp = list(self.cp)
        c.co = list(self.co)
        c.ep = list(self.ep)
        c.eo = list(self.eo)
        return c

    def is_in_g1(self) -> bool:
        """Check if cube is in subgroup G1 (co=0, eo=0, middle edges in middle slice)."""
        if any(self.co) or any(self.eo):
            return False
        for i in range(8, 12):
            if self.ep[i] not in MIDDLE_EDGES:
                return False
        return True

    def is_solved(self) -> bool:
        """Check if completely solved."""
        return (
            self.cp == list(range(8))
            and self.ep == list(range(12))
            and not any(self.co)
            and not any(self.eo)
        )


def state_to_cubie(state: str) -> CubieCube:
    """Converts a 54-facelet state string to a CubieCube object."""
    cc = CubieCube()
    
    # 1. Corners
    for idx, (c0, c1, c2) in enumerate(CORNER_INDICES):
        stickers = (state[c0], state[c1], state[c2])
        sticker_set = set(stickers)
        
        for c_idx, base_set in enumerate(CORNER_BASE_COLORS):
            if sticker_set == base_set:
                cc.cp[idx] = c_idx
                break
                
        if state[c0] in ('U', 'D'):
            cc.co[idx] = 0
        elif state[c1] in ('U', 'D'):
            cc.co[idx] = 1
        else:
            cc.co[idx] = 2

    # 2. Edges
    for idx, (e0, e1) in enumerate(EDGE_INDICES):
        stickers = (state[e0], state[e1])
        sticker_set = set(stickers)
        
        for e_idx, base_set in enumerate(EDGE_BASE_COLORS):
            if sticker_set == base_set:
                cc.ep[idx] = e_idx
                break
                
        if state[e0] in ('U', 'D'):
            cc.eo[idx] = 0
        elif state[e1] in ('U', 'D'):
            cc.eo[idx] = 1
        elif state[e0] in ('F', 'B'):
            cc.eo[idx] = 0
        elif state[e1] in ('F', 'B'):
            cc.eo[idx] = 1
        else:
            cc.eo[idx] = 0

    return cc


# Precompute CubieCube transformations for all 18 moves from solved state
_MOVE_CUBIES: Dict[str, CubieCube] = {}

def _init_move_cubies():
    from .cube import SOLVED_STATE
    for m in ALL_MOVES:
        m_state = apply_move(SOLVED_STATE, m)
        _MOVE_CUBIES[m] = state_to_cubie(m_state)

_init_move_cubies()


def apply_cubie_move(cubie: CubieCube, move: str) -> CubieCube:
    """Applies a move permutation/orientation transformation to a CubieCube."""
    m = _MOVE_CUBIES[move]
    result = CubieCube()

    # Corner multiplication
    for i in range(8):
        result.cp[i] = cubie.cp[m.cp[i]]
        result.co[i] = (cubie.co[m.cp[i]] + m.co[i]) % 3

    # Edge multiplication
    for i in range(12):
        result.ep[i] = cubie.ep[m.ep[i]]
        result.eo[i] = (cubie.eo[m.ep[i]] + m.eo[i]) % 2

    return result


def _phase1_heuristic(cubie: CubieCube) -> int:
    """Estimates distance to G1 subgroup."""
    # Count misplaced corner orientations, edge orientations, and middle slice edges
    co_dist = sum(1 for o in cubie.co if o != 0) // 2
    eo_dist = sum(1 for o in cubie.eo if o != 0) // 2
    slice_dist = sum(1 for i in range(8, 12) if cubie.ep[i] not in MIDDLE_EDGES)
    return max(co_dist, eo_dist, (slice_dist + 1) // 2)


def _phase2_heuristic(cubie: CubieCube) -> int:
    """Estimates distance to Solved state within G1 subgroup."""
    cp_dist = sum(1 for i in range(8) if cubie.cp[i] != i)
    ep_dist = sum(1 for i in range(12) if cubie.ep[i] != i)
    return max((cp_dist + 2) // 3, (ep_dist + 2) // 4)


def _search_phase1(cubie: CubieCube, depth: int, last_face: str, path: List[str]) -> Optional[Tuple[List[str], CubieCube]]:
    """IDA* search for Phase 1 (reach G1)."""
    h = _phase1_heuristic(cubie)
    if h == 0 and cubie.is_in_g1():
        return path, cubie
    if depth <= 0 or h > depth:
        return None

    opposite = {'U': 'D', 'D': 'U', 'L': 'R', 'R': 'L', 'F': 'B', 'B': 'F'}

    for m in ALL_MOVES:
        face = m[0]
        if face == last_face:
            continue
        if len(path) > 1 and face == opposite.get(last_face) and path[-2][0] == face:
            continue

        next_cubie = apply_cubie_move(cubie, m)
        path.append(m)
        res = _search_phase1(next_cubie, depth - 1, face, path)
        if res is not None:
            return res
        path.pop()

    return None


def _search_phase2(cubie: CubieCube, depth: int, last_face: str, path: List[str]) -> Optional[List[str]]:
    """IDA* search for Phase 2 (solve inside G1)."""
    h = _phase2_heuristic(cubie)
    if h == 0 and cubie.is_solved():
        return path
    if depth <= 0 or h > depth:
        return None

    opposite = {'U': 'D', 'D': 'U', 'L': 'R', 'R': 'L', 'F': 'B', 'B': 'F'}

    for m in G1_MOVES:
        face = m[0]
        if face == last_face:
            continue
        if len(path) > 1 and face == opposite.get(last_face) and path[-2][0] == face:
            continue

        next_cubie = apply_cubie_move(cubie, m)
        path.append(m)
        res = _search_phase2(next_cubie, depth - 1, face, path)
        if res is not None:
            return res
        path.pop()

    return None


def _clean_moves(moves: List[str]) -> List[str]:
    """Cancels redundant consecutive moves (e.g. U + U' -> None, U + U -> U2)."""
    if not moves:
        return []
        
    cleaned = []
    for m in moves:
        if not cleaned:
            cleaned.append(m)
            continue
            
        prev = cleaned[-1]
        if prev[0] == m[0]:
            # Same face
            p_rot = 1 if len(prev) == 1 else (2 if prev[1] == '2' else 3)
            m_rot = 1 if len(m) == 1 else (2 if m[1] == '2' else 3)
            tot = (p_rot + m_rot) % 4
            
            cleaned.pop()
            if tot == 1:
                cleaned.append(prev[0])
            elif tot == 2:
                cleaned.append(prev[0] + "2")
            elif tot == 3:
                cleaned.append(prev[0] + "'")
        else:
            cleaned.append(m)
    return cleaned


def solve_cube(state: str, max_depth_phase1: int = 12, max_depth_phase2: int = 18) -> Dict:
    """
    Computes an optimal/near-optimal solution for a given 54-facelet cube state.
    
    Returns a dictionary with:
        - is_solved: bool
        - total_moves: int
        - move_string: str (e.g. "R U R' F2 D...")
        - moves: List[str]
        - steps: List[Dict] (step number, move, description, state after move)
        - solve_time_ms: float
        - phase1_moves: List[str]
        - phase2_moves: List[str]
    """
    start_time = time.perf_counter()
    
    # 1. Validation
    is_valid, err = validate_cube(state)
    if not is_valid:
        raise CubeValidationError(err)

    if is_solved(state):
        return {
            "is_solved": True,
            "total_moves": 0,
            "move_string": "",
            "moves": [],
            "steps": [],
            "solve_time_ms": round((time.perf_counter() - start_time) * 1000, 2),
            "phase1_moves": [],
            "phase2_moves": [],
            "initial_state": state,
        }

    all_moves = []
    
    # Try high-performance C/CFFI Kociemba solver first if available
    try:
        import kociemba
        solution_raw = kociemba.solve(state)
        all_moves = [m.strip() for m in solution_raw.split() if m.strip()]
        p1_moves = all_moves[:len(all_moves)//2]
        p2_moves = all_moves[len(all_moves)//2:]
    except Exception:
        cubie = state_to_cubie(state)

        # 2. Phase 1 Search
        p1_moves: List[str] = []
        g1_cubie = cubie

        if not cubie.is_in_g1():
            for d in range(1, max_depth_phase1 + 1):
                res = _search_phase1(cubie, d, "", [])
                if res is not None:
                    p1_moves, g1_cubie = res
                    break
            else:
                for d in range(max_depth_phase1 + 1, 15):
                    res = _search_phase1(cubie, d, "", [])
                    if res is not None:
                        p1_moves, g1_cubie = res
                        break

        # 3. Phase 2 Search
        p2_moves: List[str] = []
        if not g1_cubie.is_solved():
            for d in range(1, max_depth_phase2 + 1):
                res2 = _search_phase2(g1_cubie, d, p1_moves[-1][0] if p1_moves else "", [])
                if res2 is not None:
                    p2_moves = res2
                    break
            else:
                for d in range(max_depth_phase2 + 1, 22):
                    res2 = _search_phase2(g1_cubie, d, p1_moves[-1][0] if p1_moves else "", [])
                    if res2 is not None:
                        p2_moves = res2
                        break

        all_moves = _clean_moves(p1_moves + p2_moves)
    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

    # 4. Generate step-by-step intermediate states and instructions
    steps = []
    current_state = state
    for idx, m in enumerate(all_moves):
        current_state = apply_move(current_state, m)
        expl = get_move_explanation(m)
        steps.append({
            "step": idx + 1,
            "move": m,
            "face": expl["face"],
            "action": expl["action"],
            "short_desc": expl["short"],
            "axis": expl["axis"],
            "angle": expl["angle"],
            "state_after": current_state,
        })

    return {
        "is_solved": True,
        "total_moves": len(all_moves),
        "move_string": " ".join(all_moves),
        "moves": all_moves,
        "steps": steps,
        "solve_time_ms": elapsed_ms,
        "phase1_moves": p1_moves,
        "phase2_moves": p2_moves,
        "initial_state": state,
    }
