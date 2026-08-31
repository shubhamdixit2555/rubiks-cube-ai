/**
 * Three.js WebGL 3D Rubik's Cube Engine.
 * 
 * Features:
 * - 27 individual cubies with realistic beveled materials and sticker colors.
 * - Exact pivot-based layer rotation animations with smooth easing.
 * - Interactive orbit camera rotation & zoom.
 * - Instant state synchronization from any 54-facelet string.
 * - Animation speed control (0.5x to 3.0x).
 */

const FACE_COLORS = {
  W: 0xFFFFFF, // White (Up)
  R: 0xDC2626, // Red (Right)
  G: 0x16A34A, // Green (Front)
  Y: 0xFACC15, // Yellow (Down)
  O: 0xEA580C, // Orange (Left)
  B: 0x2563EB, // Blue (Back)
  BLACK: 0x111827 // Plastic body
};

const COLOR_MAP_CHARS = {
  U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B'
};

class RubiksCube3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.cubies = [];
    this.isAnimating = false;
    this.animationSpeed = 1.0;
    this.moveQueue = [];
    this.currentState = "U".repeat(9) + "R".repeat(9) + "F".repeat(9) + "D".repeat(9) + "L".repeat(9) + "B".repeat(9);

    this.initThree();
    this.createCube();
    this.setupEvents();
    this.animate();
  }

  initThree() {
    const width = this.container.clientWidth || 500;
    const height = this.container.clientHeight || 500;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    this.camera.position.set(4.5, 3.8, 5.2);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.minDistance = 3.0;
      this.controls.maxDistance = 12.0;
      this.controls.enablePan = false;
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(8, 12, 10);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-8, -6, -8);
    this.scene.add(dirLight2);

    // Pivot group for layer rotations
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);
  }

  createCubieMaterials(x, y, z) {
    // Face indices for BoxGeometry: 0:+X(R), 1:-X(L), 2:+Y(U), 3:-Y(D), 4:+Z(F), 5:-Z(B)
    const materials = [];
    const colors = [
      x === 1 ? FACE_COLORS.R : FACE_COLORS.BLACK,
      x === -1 ? FACE_COLORS.O : FACE_COLORS.BLACK,
      y === 1 ? FACE_COLORS.W : FACE_COLORS.BLACK,
      y === -1 ? FACE_COLORS.Y : FACE_COLORS.BLACK,
      z === 1 ? FACE_COLORS.G : FACE_COLORS.BLACK,
      z === -1 ? FACE_COLORS.B : FACE_COLORS.BLACK,
    ];

    for (let i = 0; i < 6; i++) {
      const isOuter = colors[i] !== FACE_COLORS.BLACK;
      materials.push(new THREE.MeshStandardMaterial({
        color: colors[i],
        roughness: isOuter ? 0.25 : 0.6,
        metalness: isOuter ? 0.05 : 0.1,
      }));
    }
    return materials;
  }

  createCube() {
    this.cubies = [];
    const geom = new THREE.BoxGeometry(0.96, 0.96, 0.96);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const materials = this.createCubieMaterials(x, y, z);
          const mesh = new THREE.Mesh(geom, materials);
          mesh.position.set(x, y, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          // Track initial logical coordinate
          mesh.userData = { initialPos: { x, y, z }, currentPos: { x, y, z } };
          this.cubeGroup.add(mesh);
          this.cubies.push(mesh);
        }
      }
    }
  }

  setSpeed(multiplier) {
    this.animationSpeed = Math.max(0.2, Math.min(4.0, multiplier));
  }

  resetCamera() {
    this.camera.position.set(4.5, 3.8, 5.2);
    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  getCubiesForMove(face) {
    const threshold = 0.5;
    return this.cubies.filter(c => {
      const pos = c.position;
      switch (face) {
        case 'U': return pos.y > threshold;
        case 'D': return pos.y < -threshold;
        case 'R': return pos.x > threshold;
        case 'L': return pos.x < -threshold;
        case 'F': return pos.z > threshold;
        case 'B': return pos.z < -threshold;
        default: return false;
      }
    });
  }

  applyMove(moveNotation, callback) {
    if (this.isAnimating) {
      this.moveQueue.push({ move: moveNotation, callback });
      return;
    }

    const face = moveNotation[0];
    const isDouble = moveNotation.includes('2');
    const isPrime = moveNotation.includes("'");

    let angle = isDouble ? Math.PI : (isPrime ? Math.PI / 2 : -Math.PI / 2);
    let axis = new THREE.Vector3(0, 1, 0);

    if (face === 'U') { axis = new THREE.Vector3(0, -1, 0); }
    else if (face === 'D') { axis = new THREE.Vector3(0, 1, 0); }
    else if (face === 'R') { axis = new THREE.Vector3(-1, 0, 0); }
    else if (face === 'L') { axis = new THREE.Vector3(1, 0, 0); }
    else if (face === 'F') { axis = new THREE.Vector3(0, 0, -1); }
    else if (face === 'B') { axis = new THREE.Vector3(0, 0, 1); }

    const targetCubies = this.getCubiesForMove(face);
    if (targetCubies.length === 0) {
      if (callback) callback();
      return;
    }

    // Attach target cubies to Pivot
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.position.set(0, 0, 0);
    targetCubies.forEach(c => {
      this.cubeGroup.remove(c);
      this.pivot.add(c);
    });

    this.isAnimating = true;
    const baseDuration = isDouble ? 320 : 220;
    const duration = baseDuration / this.animationSpeed;
    const startTime = performance.now();

    const animateRotation = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      // Smooth cosine easing
      const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);

      this.pivot.setRotationFromAxisAngle(axis, angle * eased);

      if (progress < 1.0) {
        requestAnimationFrame(animateRotation);
      } else {
        // Animation finished: finalize transform
        this.pivot.setRotationFromAxisAngle(axis, angle);
        this.pivot.updateMatrixWorld();

        targetCubies.forEach(c => {
          c.applyMatrix4(this.pivot.matrixWorld);
          this.pivot.remove(c);
          this.cubeGroup.add(c);

          // Round coordinates to clean integers to eliminate floating point error
          c.position.x = Math.round(c.position.x);
          c.position.y = Math.round(c.position.y);
          c.position.z = Math.round(c.position.z);
        });

        this.pivot.rotation.set(0, 0, 0);
        this.isAnimating = false;

        if (callback) callback();

        // Process next queued move if any
        if (this.moveQueue.length > 0) {
          const next = this.moveQueue.shift();
          this.applyMove(next.move, next.callback);
        }
      }
    };

    requestAnimationFrame(animateRotation);
  }

  syncFromFaceletState(state) {
    if (!state || state.length !== 54) return;
    this.currentState = state;

    // Map facelet state onto the 54 stickers of the 27 cubies
    // Faces: U(0..8), R(9..17), F(18..26), D(27..35), L(36..44), B(45..53)
    const getColorHex = (char) => {
      const colorChar = COLOR_MAP_CHARS[char] || char;
      return FACE_COLORS[colorChar] || FACE_COLORS.W;
    };

    // Rebuild fresh cubies with exact colors
    while (this.cubeGroup.children.length > 0) {
      this.cubeGroup.remove(this.cubeGroup.children[0]);
    }
    this.cubies = [];

    const geom = new THREE.BoxGeometry(0.96, 0.96, 0.96);

    // Map coordinates (x, y, z) to facelet indices
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const mats = [];

          // +X: R face (x = 1, y = 1..-1, z = 1..-1)
          let colR = FACE_COLORS.BLACK;
          if (x === 1) {
            const r_row = 1 - y; // y: 1->0, 0->1, -1->2
            const r_col = 1 - z; // z: 1->0, 0->1, -1->2
            const idx = 9 + r_row * 3 + r_col;
            colR = getColorHex(state[idx]);
          }

          // -X: L face (x = -1, y = 1..-1, z = -1..1)
          let colL = FACE_COLORS.BLACK;
          if (x === -1) {
            const l_row = 1 - y;
            const l_col = z + 1; // z: -1->0, 0->1, 1->2
            const idx = 36 + l_row * 3 + l_col;
            colL = getColorHex(state[idx]);
          }

          // +Y: U face (y = 1, z = -1..1, x = -1..1)
          let colU = FACE_COLORS.BLACK;
          if (y === 1) {
            const u_row = z + 1; // z: -1->0, 0->1, 1->2
            const u_col = x + 1; // x: -1->0, 0->1, 1->2
            const idx = 0 + u_row * 3 + u_col;
            colU = getColorHex(state[idx]);
          }

          // -Y: D face (y = -1, z = 1..-1, x = -1..1)
          let colD = FACE_COLORS.BLACK;
          if (y === -1) {
            const d_row = 1 - z; // z: 1->0, 0->1, -1->2
            const d_col = x + 1; // x: -1->0, 0->1, 1->2
            const idx = 27 + d_row * 3 + d_col;
            colD = getColorHex(state[idx]);
          }

          // +Z: F face (z = 1, y = 1..-1, x = -1..1)
          let colF = FACE_COLORS.BLACK;
          if (z === 1) {
            const f_row = 1 - y;
            const f_col = x + 1;
            const idx = 18 + f_row * 3 + f_col;
            colF = getColorHex(state[idx]);
          }

          // -Z: B face (z = -1, y = 1..-1, x = 1..-1)
          let colB = FACE_COLORS.BLACK;
          if (z === -1) {
            const b_row = 1 - y;
            const b_col = 1 - x;
            const idx = 45 + b_row * 3 + b_col;
            colB = getColorHex(state[idx]);
          }

          const faceColors = [colR, colL, colU, colD, colF, colB];
          for (let f = 0; f < 6; f++) {
            const isOuter = faceColors[f] !== FACE_COLORS.BLACK;
            mats.push(new THREE.MeshStandardMaterial({
              color: faceColors[f],
              roughness: isOuter ? 0.25 : 0.6,
              metalness: isOuter ? 0.05 : 0.1,
            }));
          }

          const mesh = new THREE.Mesh(geom, mats);
          mesh.position.set(x, y, z);
          this.cubeGroup.add(mesh);
          this.cubies.push(mesh);
        }
      }
    }
  }

  handleResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth || 500;
    const height = this.container.clientHeight || 500;
    if (width > 0 && height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }

  setupEvents() {
    window.addEventListener('resize', () => this.handleResize());
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
