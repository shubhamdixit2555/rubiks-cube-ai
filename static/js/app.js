/**
 * AI Rubik's Cube Solver - Main Application Controller.
 */

// Western Standard Color Definitions
const COLOR_PALETTE = {
  W: { name: 'White', hex: '#FFFFFF', face: 'U' },
  R: { name: 'Red', hex: '#DC2626', face: 'R' },
  G: { name: 'Green', hex: '#16A34A', face: 'F' },
  Y: { name: 'Yellow', hex: '#FACC15', face: 'D' },
  O: { name: 'Orange', hex: '#EA580C', face: 'L' },
  B: { name: 'Blue', hex: '#2563EB', face: 'B' },
};

const FACE_TO_COLOR = {
  U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B'
};

const INVERSE_MOVES = {
  "U": "U'", "U'": "U", "U2": "U2",
  "D": "D'", "D'": "D", "D2": "D2",
  "R": "R'", "R'": "R", "R2": "R2",
  "L": "L'", "L'": "L", "L2": "L2",
  "F": "F'", "F'": "F", "F2": "F2",
  "B": "B'", "B'": "B", "B2": "B2",
};

class RubiksApp {
  constructor() {
    this.cube3d = null;
    this.mlDashboard = null;

    // Cube State (54 facelets)
    this.currentState = "U".repeat(9) + "R".repeat(9) + "F".repeat(9) + "D".repeat(9) + "L".repeat(9) + "B".repeat(9);
    this.activeNetColor = 'W';

    // Solution Player State
    this.currentSolution = null;
    this.currentStepIdx = 0; // 0 = start (scrambled), 1..N = after step i
    this.isPlaying = false;
    this.playTimer = null;
    this.speedMultiplier = 1.0;

    // Upload / Webcam State
    this.uploadedImages = { U: null, R: null, F: null, D: null, L: null, B: null };
    this.webcamStream = null;
    this.activeWebcamFace = 'F';

    this.init();
  }

  async init() {
    // 1. Initialize 3D Engine
    this.cube3d = new RubiksCube3D('canvas-container');
    this.cube3d.syncFromFaceletState(this.currentState);

    // 2. Initialize ML Dashboard
    this.mlDashboard = new MLDashboard();
    this.mlDashboard.init();

    // 3. Build UI components
    this.render2DNet();
    this.setupTabs();
    this.setupControlButtons();
    this.setupUploadHandlers();
    this.setupWebcamHandlers();

    // 4. Initial validation check
    this.validateCurrentState();
  }

  // --------------------------------------------------------------------------
  // Tab Switching
  // --------------------------------------------------------------------------
  setupTabs() {
    const tabs = ['solver', 'upload', 'webcam', 'net', 'ml'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const content = document.getElementById(`tab-content-${t}`);
      if (btn && content) {
        btn.addEventListener('click', () => {
          tabs.forEach(other => {
            document.getElementById(`tab-btn-${other}`)?.classList.remove('active-tab', 'text-indigo-400', 'border-indigo-500');
            document.getElementById(`tab-btn-${other}`)?.classList.add('text-gray-400', 'border-transparent');
            document.getElementById(`tab-content-${other}`)?.classList.add('hidden');
          });

          btn.classList.add('active-tab', 'text-indigo-400', 'border-indigo-500');
          btn.classList.remove('text-gray-400', 'border-transparent');
          content.classList.remove('hidden');

          if (t === 'webcam') {
            this.startWebcam();
          } else {
            this.stopWebcam();
          }
        });
      }
    });
  }

  // --------------------------------------------------------------------------
  // Solver Studio Controls
  // --------------------------------------------------------------------------
  setupControlButtons() {
    // Scramble Button
    document.getElementById('btn-scramble')?.addEventListener('click', () => this.scrambleCube());

    // Solve Button
    document.getElementById('btn-solve')?.addEventListener('click', () => this.solveCurrentCube());

    // Reset Button
    document.getElementById('btn-reset')?.addEventListener('click', () => this.resetCube());

    // Player Play / Pause
    document.getElementById('player-play-btn')?.addEventListener('click', () => this.togglePlay());

    // Next Step
    document.getElementById('player-next-btn')?.addEventListener('click', () => this.stepForward());

    // Prev Step
    document.getElementById('player-prev-btn')?.addEventListener('click', () => this.stepBackward());

    // Speed Slider
    const speedSlider = document.getElementById('speed-slider');
    const speedLabel = document.getElementById('speed-label');
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.speedMultiplier = val;
        if (speedLabel) speedLabel.textContent = `${val.toFixed(1)}x`;
        this.cube3d.setSpeed(val);
      });
    }

    // Reset Camera
    document.getElementById('btn-reset-cam')?.addEventListener('click', () => {
      this.cube3d.resetCamera();
    });
  }

  async scrambleCube() {
    this.stopPlayback();
    try {
      const res = await fetch('/api/scramble?length=20');
      if (res.ok) {
        const data = await res.json();
        this.currentState = data.facelet_state;
        this.currentSolution = null;
        this.currentStepIdx = 0;

        this.cube3d.syncFromFaceletState(this.currentState);
        this.render2DNet();
        this.updateSolutionHUD();
        this.validateCurrentState();
        this.showToast(`🎲 Cube Scrambled: ${data.scramble}`, 'info');
      }
    } catch (e) {
      this.showToast("Failed to generate scramble", "error");
    }
  }

  async solveCurrentCube() {
    this.stopPlayback();
    const solveBtn = document.getElementById('btn-solve');
    if (solveBtn) {
      solveBtn.disabled = true;
      solveBtn.innerHTML = `⚡ Solving...`;
    }

    try {
      const res = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: this.currentState }),
      });

      const data = await res.json();
      if (res.ok && data.is_solved) {
        this.currentSolution = data;
        this.currentStepIdx = 0;
        this.updateSolutionHUD();
        this.showToast(`✨ Solution generated in ${data.solve_time_ms}ms (${data.total_moves} moves)!`, 'success');
      } else {
        this.showToast(`Solve error: ${data.detail || data.error || 'Invalid configuration'}`, 'error');
      }
    } catch (e) {
      this.showToast(`Solver request failed: ${e.message}`, 'error');
    } finally {
      if (solveBtn) {
        solveBtn.disabled = false;
        solveBtn.innerHTML = `⚡ Solve Cube`;
      }
    }
  }

  resetCube() {
    this.stopPlayback();
    this.currentState = "U".repeat(9) + "R".repeat(9) + "F".repeat(9) + "D".repeat(9) + "L".repeat(9) + "B".repeat(9);
    this.currentSolution = null;
    this.currentStepIdx = 0;
    this.cube3d.syncFromFaceletState(this.currentState);
    this.render2DNet();
    this.updateSolutionHUD();
    this.validateCurrentState();
    this.showToast("Cube reset to solved state", "info");
  }

  togglePlay() {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  startPlayback() {
    if (!this.currentSolution || this.currentSolution.steps.length === 0) {
      this.showToast("Click 'Solve Cube' first to generate instructions!", "warning");
      return;
    }
    if (this.currentStepIdx >= this.currentSolution.steps.length) {
      this.currentStepIdx = 0;
      this.cube3d.syncFromFaceletState(this.currentSolution.initial_state);
      this.currentState = this.currentSolution.initial_state;
      this.render2DNet();
    }

    this.isPlaying = true;
    const playBtn = document.getElementById('player-play-btn');
    if (playBtn) playBtn.innerHTML = `⏸️ Pause`;

    this.playNextStepLoop();
  }

  stopPlayback() {
    this.isPlaying = false;
    clearTimeout(this.playTimer);
    const playBtn = document.getElementById('player-play-btn');
    if (playBtn) playBtn.innerHTML = `▶️ Auto Play`;
  }

  playNextStepLoop() {
    if (!this.isPlaying) return;
    if (this.currentStepIdx >= this.currentSolution.steps.length) {
      this.stopPlayback();
      this.showToast("🎉 Rubik's Cube is fully solved!", "success");
      return;
    }

    this.stepForward(() => {
      if (this.isPlaying) {
        const interval = 450 / this.speedMultiplier;
        this.playTimer = setTimeout(() => this.playNextStepLoop(), interval);
      }
    });
  }

  stepForward(onComplete) {
    if (!this.currentSolution || this.currentStepIdx >= this.currentSolution.steps.length) return;

    const step = this.currentSolution.steps[this.currentStepIdx];
    this.cube3d.applyMove(step.move, () => {
      this.currentStepIdx++;
      this.currentState = step.state_after;
      this.updateSolutionHUD();
      this.render2DNet();
      if (onComplete) onComplete();
    });
  }

  stepBackward() {
    if (!this.currentSolution || this.currentStepIdx <= 0) return;
    this.stopPlayback();

    const prevStep = this.currentSolution.steps[this.currentStepIdx - 1];
    const invMove = INVERSE_MOVES[prevStep.move] || prevStep.move;

    this.cube3d.applyMove(invMove, () => {
      this.currentStepIdx--;
      const targetState = this.currentStepIdx === 0
        ? this.currentSolution.initial_state
        : this.currentSolution.steps[this.currentStepIdx - 1].state_after;

      this.currentState = targetState;
      this.updateSolutionHUD();
      this.render2DNet();
    });
  }

  jumpToStep(targetIdx) {
    if (!this.currentSolution) return;
    this.stopPlayback();
    this.currentStepIdx = targetIdx;

    const targetState = targetIdx === 0
      ? this.currentSolution.initial_state
      : this.currentSolution.steps[targetIdx - 1].state_after;

    this.currentState = targetState;
    this.cube3d.syncFromFaceletState(targetState);
    this.updateSolutionHUD();
    this.render2DNet();
  }

  updateSolutionHUD() {
    const moveBadge = document.getElementById('hud-move-badge');
    const actionDesc = document.getElementById('hud-action-desc');
    const faceDesc = document.getElementById('hud-face-desc');
    const counter = document.getElementById('hud-step-counter');
    const progressBar = document.getElementById('hud-progress-bar');
    const movesList = document.getElementById('hud-moves-list');

    if (!this.currentSolution || this.currentSolution.steps.length === 0) {
      if (moveBadge) moveBadge.textContent = "—";
      if (actionDesc) actionDesc.textContent = "Click 'Solve Cube' to compute optimal steps";
      if (faceDesc) faceDesc.textContent = "Ready";
      if (counter) counter.textContent = "Step 0 / 0";
      if (progressBar) progressBar.style.width = "0%";
      if (movesList) movesList.innerHTML = `<span class="text-xs text-gray-500 italic">No active solution sequence.</span>`;
      return;
    }

    const total = this.currentSolution.steps.length;
    const current = this.currentStepIdx;

    if (current === 0) {
      const nextStep = this.currentSolution.steps[0];
      if (moveBadge) moveBadge.textContent = nextStep.move;
      if (actionDesc) actionDesc.textContent = `Next: ${nextStep.action}`;
      if (faceDesc) faceDesc.textContent = nextStep.face;
    } else if (current > total) {
      if (moveBadge) moveBadge.textContent = "🎉";
      if (actionDesc) actionDesc.textContent = "Cube is Solved!";
      if (faceDesc) faceDesc.textContent = "Completed";
    } else {
      const activeStep = this.currentSolution.steps[current - 1];
      if (moveBadge) moveBadge.textContent = activeStep.move;
      if (actionDesc) actionDesc.textContent = activeStep.action;
      if (faceDesc) faceDesc.textContent = activeStep.face;
    }

    if (counter) counter.textContent = `Step ${current} / ${total}`;
    if (progressBar) progressBar.style.width = `${(current / total) * 100}%`;

    // Render clickable move chips
    if (movesList) {
      let chipsHtml = '';
      this.currentSolution.steps.forEach((s, idx) => {
        const isPast = idx < current;
        const isCurrent = idx === current - 1;
        const chipStyle = isCurrent
          ? 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-400 scale-105'
          : (isPast ? 'bg-gray-800 text-gray-400' : 'bg-gray-800/80 text-gray-200 hover:bg-gray-700');

        chipsHtml += `
          <button onclick="window.app.jumpToStep(${idx + 1})" class="px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${chipStyle}">
            ${s.move}
          </button>
        `;
      });
      movesList.innerHTML = chipsHtml;
    }
  }

  // --------------------------------------------------------------------------
  // 2D Unfolded Net Editor
  // --------------------------------------------------------------------------
  render2DNet() {
    const container = document.getElementById('cube-net-container');
    if (!container) return;

    // Facelet layout: 
    // Row 0: empty, U (0..8), empty, empty
    // Row 1: L (36..44), F (18..26), R (9..17), B (45..53)
    // Row 2: empty, D (27..35), empty, empty

    const faceIndices = {
      U: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      L: [36, 37, 38, 39, 40, 41, 42, 43, 44],
      F: [18, 19, 20, 21, 22, 23, 24, 25, 26],
      R: [9, 10, 11, 12, 13, 14, 15, 16, 17],
      B: [45, 46, 47, 48, 49, 50, 51, 52, 53],
      D: [27, 28, 29, 30, 31, 32, 33, 34, 35],
    };

    const renderFaceGrid = (faceName) => {
      const indices = faceIndices[faceName];
      let gridHtml = `<div class="grid grid-cols-3 gap-1 p-1 bg-gray-900/80 rounded-lg border border-gray-700/60 inline-block">`;
      indices.forEach((idx, pos) => {
        const faceletChar = this.currentState[idx] || 'U';
        const colorChar = FACE_TO_COLOR[faceletChar] || faceletChar;
        const colorInfo = COLOR_PALETTE[colorChar] || COLOR_PALETTE.W;
        const isCenter = pos === 4;

        gridHtml += `
          <div
            class="net-sticker ${isCenter ? 'ring-1 ring-white/60' : ''}"
            style="background-color: ${colorInfo.hex}; color: ${colorChar === 'W' || colorChar === 'Y' ? '#111827' : '#FFFFFF'};"
            onclick="window.app.paintSticker(${idx})"
            title="Facelet ${idx} (${faceName}${pos + 1}): ${colorInfo.name}"
          >
            ${isCenter ? faceName : ''}
          </div>
        `;
      });
      gridHtml += `</div>`;
      return gridHtml;
    };

    let netHtml = `
      <div class="flex flex-col items-center gap-2">
        <!-- Top Row: U Face -->
        <div class="flex justify-center">${renderFaceGrid('U')}</div>
        <!-- Middle Row: L, F, R, B Faces -->
        <div class="flex justify-center gap-2">
          ${renderFaceGrid('L')}
          ${renderFaceGrid('F')}
          ${renderFaceGrid('R')}
          ${renderFaceGrid('B')}
        </div>
        <!-- Bottom Row: D Face -->
        <div class="flex justify-center">${renderFaceGrid('D')}</div>
      </div>
    `;

    container.innerHTML = netHtml;
    this.renderColorPalette();
    this.updateColorCounts();
  }

  renderColorPalette() {
    const container = document.getElementById('net-color-palette');
    if (!container) return;

    let html = '';
    Object.keys(COLOR_PALETTE).forEach(cKey => {
      const c = COLOR_PALETTE[cKey];
      const isSelected = this.activeNetColor === cKey;
      const borderStyle = isSelected ? 'ring-4 ring-indigo-500 scale-110' : 'ring-1 ring-gray-600 hover:scale-105';

      html += `
        <button
          onclick="window.app.setActiveNetColor('${cKey}')"
          class="w-8 h-8 rounded-lg transition-all flex items-center justify-center font-bold text-xs shadow-md ${borderStyle}"
          style="background-color: ${c.hex}; color: ${cKey === 'W' || cKey === 'Y' ? '#111827' : '#FFFFFF'};"
          title="Select ${c.name} (${cKey})"
        >
          ${cKey}
        </button>
      `;
    });

    container.innerHTML = html;
  }

  setActiveNetColor(colorKey) {
    this.activeNetColor = colorKey;
    this.renderColorPalette();
  }

  paintSticker(faceletIdx) {
    const faceChar = COLOR_PALETTE[this.activeNetColor].face;
    const arr = this.currentState.split('');
    arr[faceletIdx] = faceChar;
    this.currentState = arr.join('');

    this.cube3d.syncFromFaceletState(this.currentState);
    this.render2DNet();
    this.validateCurrentState();
  }

  updateColorCounts() {
    const container = document.getElementById('net-color-counts');
    if (!container) return;

    const counts = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
    for (let ch of this.currentState) {
      counts[ch] = (counts[ch] || 0) + 1;
    }

    let html = '<div class="grid grid-cols-6 gap-2 text-center text-xs">';
    Object.keys(COLOR_PALETTE).forEach(cKey => {
      const faceChar = COLOR_PALETTE[cKey].face;
      const count = counts[faceChar] || 0;
      const isValid = count === 9;
      const badgeStyle = isValid ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/60 border-rose-500/40 text-rose-300';

      html += `
        <div class="glass-card p-2 rounded-lg border ${badgeStyle}">
          <div class="font-bold font-mono">${cKey} (${faceChar})</div>
          <div class="text-[13px] font-bold mt-0.5">${count} / 9</div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  async validateCurrentState() {
    const banner = document.getElementById('validation-banner');
    if (!banner) return;

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: this.currentState }),
      });

      const data = await res.json();
      if (data.is_valid) {
        banner.className = "p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2";
        banner.innerHTML = `✓ Configuration is physically valid & solvable!`;
      } else {
        banner.className = "p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2";
        banner.innerHTML = `⚠️ ${data.error || 'Invalid configuration'}`;
      }
    } catch (e) {
      console.warn(e);
    }
  }

  // --------------------------------------------------------------------------
  // Photo Upload Scanner
  // --------------------------------------------------------------------------
  setupUploadHandlers() {
    const faces = ['U', 'R', 'F', 'D', 'L', 'B'];
    faces.forEach(f => {
      const input = document.getElementById(`upload-input-${f}`);
      if (input) {
        input.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              this.uploadedImages[f] = ev.target.result;
              this.analyzeSingleFace(f, ev.target.result);
            };
            reader.readAsDataURL(file);
          }
        });
      }
    });

    // Analyze All Uploaded Faces Button
    document.getElementById('btn-analyze-upload')?.addEventListener('click', () => this.analyzeAllFaces());

    // Load Sample Cube Button
    document.getElementById('btn-sample-cube')?.addEventListener('click', () => this.loadSampleCube());
  }

  async analyzeSingleFace(faceKey, base64Image) {
    const previewContainer = document.getElementById(`upload-preview-${faceKey}`);
    if (previewContainer) {
      previewContainer.innerHTML = `<div class="text-xs text-indigo-400 animate-pulse">Analyzing...</div>`;
    }

    try {
      const res = await fetch('/api/analyze-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64Image, face_name: faceKey }),
      });

      if (res.ok) {
        const data = await res.json();
        if (previewContainer) {
          previewContainer.innerHTML = `
            <img src="${data.annotated_image}" class="w-full h-full object-cover rounded-lg shadow" />
          `;
        }
      }
    } catch (e) {
      console.warn("Face analysis failed:", e);
    }
  }

  async loadSampleCube() {
    // Generate synthetic photos with canvas for instant 1-click sample demo
    const sampleFaces = ['U', 'R', 'F', 'D', 'L', 'B'];
    const sampleColors = {
      U: ['W', 'W', 'G', 'W', 'W', 'R', 'Y', 'B', 'W'],
      R: ['R', 'R', 'B', 'O', 'R', 'G', 'R', 'W', 'R'],
      F: ['G', 'G', 'W', 'R', 'G', 'Y', 'G', 'G', 'O'],
      D: ['Y', 'Y', 'O', 'Y', 'Y', 'G', 'W', 'R', 'Y'],
      L: ['O', 'O', 'Y', 'G', 'O', 'W', 'O', 'O', 'B'],
      B: ['B', 'B', 'R', 'B', 'B', 'O', 'B', 'B', 'Y'],
    };

    sampleFaces.forEach(f => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');

      // Draw dark cube background
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, 300, 300);

      // Draw 9 stickers with realistic bevel
      const colors = sampleColors[f];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const colorKey = colors[r * 3 + c];
          const hex = COLOR_PALETTE[colorKey].hex;
          ctx.fillStyle = hex;
          ctx.beginPath();
          ctx.roundRect(c * 100 + 8, r * 100 + 8, 84, 84, 12);
          ctx.fill();
        }
      }

      const dataUrl = canvas.toDataURL('image/jpeg');
      this.uploadedImages[f] = dataUrl;

      const preview = document.getElementById(`upload-preview-${f}`);
      if (preview) {
        preview.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover rounded-lg shadow" />`;
      }
    });

    this.showToast("✨ Sample scrambled cube images loaded!", "success");
    await this.analyzeAllFaces();
  }

  async analyzeAllFaces() {
    const missing = Object.keys(this.uploadedImages).filter(f => !this.uploadedImages[f]);
    if (missing.length > 0) {
      this.showToast(`Please upload photos for all 6 faces (missing: ${missing.join(', ')})`, 'warning');
      return;
    }

    const btn = document.getElementById('btn-analyze-upload');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "🔍 Analyzing All Faces...";
    }

    try {
      const res = await fetch('/api/analyze-cube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: this.uploadedImages }),
      });

      const data = await res.json();
      if (res.ok) {
        this.currentState = data.facelet_state;
        this.cube3d.syncFromFaceletState(this.currentState);
        this.render2DNet();
        this.validateCurrentState();

        // Switch to solver tab
        document.getElementById('tab-btn-solver')?.click();
        this.showToast(`✓ Cube detected with ${data.average_confidence}% average confidence!`, 'success');
      } else {
        this.showToast(`Analysis error: ${data.detail}`, 'error');
      }
    } catch (e) {
      this.showToast(`Cube analysis failed: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "🔍 Analyze & Transfer to 3D Solver";
      }
    }
  }

  // --------------------------------------------------------------------------
  // Live Webcam Scanner
  // --------------------------------------------------------------------------
  setupWebcamHandlers() {
    const faces = ['U', 'L', 'F', 'R', 'B', 'D'];
    faces.forEach(f => {
      document.getElementById(`webcam-tab-${f}`)?.addEventListener('click', () => {
        faces.forEach(other => {
          document.getElementById(`webcam-tab-${other}`)?.classList.remove('bg-indigo-600', 'text-white');
          document.getElementById(`webcam-tab-${other}`)?.classList.add('bg-gray-800', 'text-gray-400');
        });
        document.getElementById(`webcam-tab-${f}`)?.classList.add('bg-indigo-600', 'text-white');
        document.getElementById(`webcam-tab-${f}`)?.classList.remove('bg-gray-800', 'text-gray-400');
        this.activeWebcamFace = f;
      });
    });

    document.getElementById('btn-webcam-capture')?.addEventListener('click', () => this.captureWebcamFace());
  }

  async startWebcam() {
    const video = document.getElementById('webcam-video');
    if (!video) return;

    try {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'environment' }
      });
      video.srcObject = this.webcamStream;
    } catch (e) {
      console.warn("Webcam access error:", e);
      this.showToast("Could not access webcam: " + e.message, "warning");
    }
  }

  stopWebcam() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop());
      this.webcamStream = null;
    }
  }

  async captureWebcamFace() {
    const video = document.getElementById('webcam-video');
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const b64 = canvas.toDataURL('image/jpeg');
    const f = this.activeWebcamFace;
    this.uploadedImages[f] = b64;

    const preview = document.getElementById(`upload-preview-${f}`);
    if (preview) preview.innerHTML = `<img src="${b64}" class="w-full h-full object-cover rounded-lg shadow" />`;

    this.showToast(`📸 Captured Face ${f}!`, 'success');
    this.analyzeSingleFace(f, b64);

    // Advance to next face in standard cycle
    const sequence = ['U', 'L', 'F', 'R', 'B', 'D'];
    const curIdx = sequence.indexOf(f);
    if (curIdx < sequence.length - 1) {
      const nextFace = sequence[curIdx + 1];
      document.getElementById(`webcam-tab-${nextFace}`)?.click();
    }
  }

  // --------------------------------------------------------------------------
  // Toast Notifications
  // --------------------------------------------------------------------------
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgStyles = {
      success: 'bg-emerald-900/90 border-emerald-500 text-emerald-100',
      error: 'bg-rose-900/90 border-rose-500 text-rose-100',
      warning: 'bg-amber-900/90 border-amber-500 text-amber-100',
      info: 'bg-gray-900/90 border-indigo-500 text-indigo-100',
    };

    toast.className = `p-3.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-medium flex items-center gap-2.5 transition-all duration-300 transform translate-y-2 opacity-0 ${bgStyles[type] || bgStyles.info}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }
}

// Global bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.app = new RubiksApp();
});
