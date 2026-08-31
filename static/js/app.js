/**
 * CubeAI - Main Application Controller.
 * 
 * Features:
 * - Full Dark SaaS Layout matching UI mockups
 * - Sidebar Navigation across Dashboard, Solver Tool, Scan Cube, 2D Net, ML Metrics, History & Settings
 * - Photo Upload Grid with live verification badges and progress calculation
 * - 3D WebGL Cube Studio with step scrubber, auto-play, and move sequence cards
 * - Real-time Parity & Solvability Validation Checklist
 * - Solve History Logger with LocalStorage Persistence
 * - Copy Solution & Export Algorithm
 * - 100% Client-Side Fallbacks for GitHub Pages
 */

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

const MOVE_ARROWS = {
  "U": "↺", "U'": "↻", "U2": "⇆",
  "D": "↻", "D'": "↺", "D2": "⇆",
  "R": "↑", "R'": "↓", "R2": "⇅",
  "L": "↓", "L'": "↑", "L2": "⇅",
  "F": "↻", "F'": "↺", "F2": "⇆",
  "B": "↺", "B'": "↻", "B2": "⇆",
};

class CubeAIApp {
  constructor() {
    this.cube3d = null;
    this.mlDashboard = null;

    // State
    this.currentState = "U".repeat(9) + "R".repeat(9) + "F".repeat(9) + "D".repeat(9) + "L".repeat(9) + "B".repeat(9);
    this.activeNetColor = 'W';

    // Solution Player State
    this.currentSolution = null;
    this.currentStepIdx = 0;
    this.isPlaying = false;
    this.playTimer = null;
    this.speedMultiplier = 1.0;

    // Scanner State
    this.uploadedImages = { U: null, R: null, F: null, D: null, L: null, B: null };
    this.webcamStream = null;
    this.activeWebcamFace = 'F';

    // History Log
    this.solveHistory = JSON.parse(localStorage.getItem('cubeai_history') || '[]');

    this.init();
  }

  async init() {
    // 1. Initialize 3D Engine
    this.cube3d = new RubiksCube3D('canvas-container');
    this.cube3d.syncFromFaceletState(this.currentState);

    // 2. Initialize ML Dashboard
    this.mlDashboard = new MLDashboard();
    this.mlDashboard.init();

    // 3. Setup UI Components
    this.render2DNet();
    this.setupTabs();
    this.setupControlButtons();
    this.setupUploadHandlers();
    this.setupWebcamHandlers();
    this.renderHistory();

    // 4. Initial Validation
    this.validateCurrentState();

    // Start on Dashboard or Solver
    this.switchTab('solver');
  }

  // --------------------------------------------------------------------------
  // Sidebar Tabs Switching
  // --------------------------------------------------------------------------
  setupTabs() {
    const tabs = ['dashboard', 'solver', 'scan', 'verified', 'net', 'ml', 'history', 'settings'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      if (btn) {
        btn.addEventListener('click', () => this.switchTab(t));
      }
    });

    // Global Search Bar Handler
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = searchInput.value.trim().toLowerCase();
          if (q.includes('scan') || q.includes('upload') || q.includes('photo')) this.switchTab('scan');
          else if (q.includes('solve') || q.includes('solution') || q.includes('3d')) this.switchTab('solver');
          else if (q.includes('net') || q.includes('edit') || q.includes('paint')) this.switchTab('net');
          else if (q.includes('ml') || q.includes('metric') || q.includes('benchmark')) this.switchTab('ml');
          else if (q.includes('scramble')) this.scrambleCube();
        }
      });
    }
  }

  switchTab(tabId) {
    const tabs = ['dashboard', 'solver', 'scan', 'verified', 'net', 'ml', 'history', 'settings'];
    
    tabs.forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const content = document.getElementById(`tab-content-${t}`);
      
      if (btn) {
        btn.classList.remove('bg-white/10', 'text-white', 'font-semibold', 'border-white/10');
        btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-white/5');
      }
      if (content) {
        content.classList.add('hidden');
      }
    });

    const activeBtn = document.getElementById(`tab-btn-${tabId}`);
    const activeContent = document.getElementById(`tab-content-${tabId}`);

    if (activeBtn) {
      activeBtn.classList.add('bg-white/10', 'text-white', 'font-semibold', 'border-white/10');
      activeBtn.classList.remove('text-slate-400', 'hover:bg-white/5');
    }
    if (activeContent) {
      activeContent.classList.remove('hidden');
    }

    if (tabId === 'solver' && this.cube3d) {
      setTimeout(() => {
        this.cube3d.handleResize();
        this.cube3d.resetCamera();
      }, 50);
    }
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

    // Copy Solution
    document.getElementById('btn-copy-solution')?.addEventListener('click', () => this.copySolution());

    // Download PDF / Export
    document.getElementById('btn-download-pdf')?.addEventListener('click', () => this.exportAlgorithm());

    // Player Play / Pause
    document.getElementById('player-play-btn')?.addEventListener('click', () => this.togglePlay());

    // Step Prev / Next
    document.getElementById('player-prev-btn')?.addEventListener('click', () => this.stepBackward());
    document.getElementById('player-next-btn')?.addEventListener('click', () => this.stepForward());

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
    let scrambleStr = '';
    let faceletState = '';
    
    try {
      const res = await fetch('/api/scramble?length=20');
      if (res.ok) {
        const data = await res.json();
        scrambleStr = data.scramble;
        faceletState = data.facelet_state;
      } else {
        throw new Error('API unavailable');
      }
    } catch (e) {
      if (window.CubeEngine) {
        scrambleStr = window.CubeEngine.generateScramble(20);
        faceletState = window.CubeEngine.applyAlgorithm(this.currentState || window.CubeEngine.SOLVED_STATE, scrambleStr);
      }
    }

    if (faceletState) {
      this.currentState = faceletState;
      this.currentSolution = null;
      this.currentStepIdx = 0;
      this.cube3d.syncFromFaceletState(this.currentState);
      this.render2DNet();
      this.updateSolutionHUD();
      this.validateCurrentState();
      this.showToast(`🎲 Scrambled: ${scrambleStr}`, 'info');
      this.switchTab('solver');
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
      let data = null;
      try {
        const res = await fetch('/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: this.currentState }),
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (netErr) {
        // Client fallback
      }

      if (!data && window.CubeEngine) {
        data = window.CubeEngine.solveCube(this.currentState);
      }

      if (data && data.is_solved) {
        this.currentSolution = data;
        this.currentStepIdx = 0;
        this.updateSolutionHUD();
        this.recordHistory(data);
        this.showToast(`✨ Solved in ${data.solve_time_ms}ms (${data.total_moves} moves)!`, 'success');
      } else {
        this.showToast(`Solve error: ${data?.detail || data?.error || 'Invalid state'}`, 'error');
      }
    } catch (e) {
      this.showToast(`Solver error: ${e.message}`, 'error');
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

  copySolution() {
    if (!this.currentSolution || !this.currentSolution.move_string) {
      this.showToast("No active solution to copy. Solve a cube first!", "warning");
      return;
    }
    navigator.clipboard.writeText(this.currentSolution.move_string);
    this.showToast("📋 Solution copied to clipboard!", "success");
  }

  exportAlgorithm() {
    if (!this.currentSolution || !this.currentSolution.steps) {
      this.showToast("No solution algorithm generated yet.", "warning");
      return;
    }
    const text = `CubeAI Optimal Solution Algorithm\nTotal Moves: ${this.currentSolution.total_moves}\nCompute Time: ${this.currentSolution.solve_time_ms} ms\n\nMoves: ${this.currentSolution.move_string}\n\nStep Breakdown:\n` +
      this.currentSolution.steps.map(s => `Step ${String(s.step).padStart(2, '0')}: [${s.move}] ${s.action} (${s.face})`).join('\n');
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CubeAI_Solution_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("📄 Solution algorithm exported!", "success");
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
      this.showToast("Click 'Solve Cube' first to compute steps!", "warning");
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
      this.showToast("🎉 Cube is fully solved!", "success");
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
    const totalMovesEl = document.getElementById('solver-total-moves');
    const estTimeEl = document.getElementById('solver-est-time');
    const counter = document.getElementById('hud-step-counter');
    const progressBar = document.getElementById('hud-progress-bar');
    const movesList = document.getElementById('hud-moves-list');

    if (!this.currentSolution || this.currentSolution.steps.length === 0) {
      if (totalMovesEl) totalMovesEl.textContent = "0";
      if (estTimeEl) estTimeEl.textContent = "0 ms";
      if (counter) counter.textContent = "Step 0 / 0";
      if (progressBar) progressBar.style.width = "0%";
      if (movesList) movesList.innerHTML = `<div class="text-xs text-slate-500 italic p-4 text-center">No active solution sequence. Click 'Solve Cube' to compute.</div>`;
      return;
    }

    const total = this.currentSolution.steps.length;
    const current = this.currentStepIdx;

    if (totalMovesEl) totalMovesEl.textContent = total;
    if (estTimeEl) estTimeEl.textContent = `${this.currentSolution.solve_time_ms} ms`;
    if (counter) counter.textContent = `Step ${current} / ${total}`;
    if (progressBar) progressBar.style.width = `${(current / total) * 100}%`;

    // Render Move Sequence Cards (Matching Image 6)
    if (movesList) {
      let cardsHtml = '';
      this.currentSolution.steps.forEach((s, idx) => {
        const isCurrent = idx === current - 1;
        const arrow = MOVE_ARROWS[s.move] || '↻';
        const cardActiveStyle = isCurrent
          ? 'active bg-[#1e2638] border-sky-400 text-white shadow-lg shadow-sky-500/20'
          : 'bg-[#141720] text-slate-300 border-white/5 hover:bg-[#1a1e2a]';

        cardsHtml += `
          <div onclick="window.app.jumpToStep(${idx + 1})" class="move-step-card ${cardActiveStyle}">
            <div class="flex items-center gap-3">
              <div class="text-xs font-mono font-bold text-slate-500 w-5">${String(idx + 1).padStart(2, '0')}</div>
              <div class="text-base font-mono font-black ${isCurrent ? 'text-sky-300' : 'text-white'}">${s.move}</div>
              <div class="text-xs ${isCurrent ? 'text-slate-200 font-semibold' : 'text-slate-400'}">${s.action} (${s.face})</div>
            </div>
            <div class="text-sm font-bold text-sky-400/80 px-1">${arrow}</div>
          </div>
        `;
      });
      movesList.innerHTML = cardsHtml;
    }
  }

  // --------------------------------------------------------------------------
  // 2D Unfolded Net Editor
  // --------------------------------------------------------------------------
  render2DNet() {
    const container = document.getElementById('cube-net-container');
    if (!container) return;

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
      let gridHtml = `<div class="grid grid-cols-3 gap-1 p-1 bg-black/60 rounded-xl border border-white/5 inline-block">`;
      indices.forEach((idx, pos) => {
        const faceletChar = this.currentState[idx] || 'U';
        const colorChar = FACE_TO_COLOR[faceletChar] || faceletChar;
        const colorInfo = COLOR_PALETTE[colorChar] || COLOR_PALETTE.W;
        const isCenter = pos === 4;

        gridHtml += `
          <div
            class="net-sticker ${isCenter ? 'ring-2 ring-white/70' : ''}"
            style="background-color: ${colorInfo.hex}; color: ${colorChar === 'W' || colorChar === 'Y' ? '#0f172a' : '#FFFFFF'};"
            onclick="window.app.paintSticker(${idx})"
            title="Sticker ${idx}: ${colorInfo.name}"
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
        <div class="flex justify-center">${renderFaceGrid('U')}</div>
        <div class="flex justify-center gap-2">
          ${renderFaceGrid('L')}
          ${renderFaceGrid('F')}
          ${renderFaceGrid('R')}
          ${renderFaceGrid('B')}
        </div>
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
      const borderStyle = isSelected ? 'ring-4 ring-sky-500 scale-110' : 'ring-1 ring-white/10 hover:scale-105';

      html += `
        <button
          onclick="window.app.setActiveNetColor('${cKey}')"
          class="w-9 h-9 rounded-xl transition-all flex items-center justify-center font-black text-xs shadow-md ${borderStyle}"
          style="background-color: ${c.hex}; color: ${cKey === 'W' || cKey === 'Y' ? '#0f172a' : '#FFFFFF'};"
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
    for (let ch of this.currentState) counts[ch] = (counts[ch] || 0) + 1;

    let html = '<div class="grid grid-cols-6 gap-2 text-center text-xs">';
    Object.keys(COLOR_PALETTE).forEach(cKey => {
      const faceChar = COLOR_PALETTE[cKey].face;
      const count = counts[faceChar] || 0;
      const isValid = count === 9;
      const badgeStyle = isValid ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/40 border-rose-500/40 text-rose-300';

      html += `
        <div class="p-2.5 rounded-xl border ${badgeStyle}">
          <div class="font-bold font-mono">${cKey} (${faceChar})</div>
          <div class="text-[13px] font-black mt-0.5">${count} / 9</div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  async validateCurrentState() {
    const banner = document.getElementById('validation-banner');
    if (!banner) return;

    let isValid = false;
    let errorMsg = null;

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: this.currentState }),
      });
      if (res.ok) {
        const data = await res.json();
        isValid = data.is_valid;
        errorMsg = data.error;
      } else {
        throw new Error('API unavailable');
      }
    } catch (e) {
      if (window.CubeEngine) {
        const val = window.CubeEngine.validateCube(this.currentState);
        isValid = val.isValid;
        errorMsg = val.error;
      }
    }

    if (isValid) {
      banner.className = "p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2";
      banner.innerHTML = `✓ Configuration is physically valid & solvable!`;
    } else {
      banner.className = "p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2";
      banner.innerHTML = `⚠️ ${errorMsg || 'Invalid configuration'}`;
    }
  }

  // --------------------------------------------------------------------------
  // Photo Upload Scanner (Matching Image 3)
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
              this.updateScanProgress();
              this.analyzeSingleFace(f, ev.target.result);
            };
            reader.readAsDataURL(file);
          }
        });
      }
    });

    document.getElementById('btn-analyze-upload')?.addEventListener('click', () => this.analyzeAllFaces());
    document.getElementById('btn-sample-cube')?.addEventListener('click', () => this.loadSampleCube());
  }

  updateScanProgress() {
    const count = Object.values(this.uploadedImages).filter(Boolean).length;
    const pct = Math.round((count / 6) * 100);

    const countLabel = document.getElementById('scan-count-label');
    const pctLabel = document.getElementById('scan-progress-pct');
    const progressBar = document.getElementById('scan-progress-bar');

    if (countLabel) countLabel.textContent = count;
    if (pctLabel) pctLabel.textContent = `${pct}% Complete`;
    if (progressBar) progressBar.style.width = `${pct}%`;
  }

  async analyzeSingleFace(faceKey, base64Image) {
    const previewContainer = document.getElementById(`upload-preview-${faceKey}`);
    const badge = document.getElementById(`scan-badge-${faceKey}`);

    if (previewContainer) {
      previewContainer.innerHTML = `<div class="text-xs text-sky-400 animate-pulse font-mono">Neural Scanning...</div>`;
    }

    try {
      let data = null;
      try {
        const res = await fetch('/api/analyze-face', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: base64Image, face_name: faceKey }),
        });
        if (res.ok) data = await res.json();
      } catch (netErr) {}

      if (!data && window.CubeEngine) {
        data = await window.CubeEngine.clientAnalyzeImage(base64Image, faceKey);
      }

      if (data && previewContainer) {
        previewContainer.innerHTML = `<img src="${data.annotated_image}" class="w-full h-full object-cover rounded-lg" />`;
        if (badge) {
          badge.className = "text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1";
          badge.innerHTML = `✓ Verified`;
        }
      }
    } catch (e) {
      console.warn(e);
    }
  }

  async loadSampleCube() {
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

      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, 300, 300);

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
      const badge = document.getElementById(`scan-badge-${f}`);
      if (badge) {
        badge.className = "text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1";
        badge.innerHTML = `✓ Verified`;
      }
    });

    this.updateScanProgress();
    this.showToast("✨ Sample scrambled cube images loaded!", "success");
    await this.analyzeAllFaces();
  }

  async analyzeAllFaces() {
    const missing = Object.keys(this.uploadedImages).filter(f => !this.uploadedImages[f]);
    if (missing.length > 0) {
      this.showToast(`Please upload all 6 faces (missing: ${missing.join(', ')})`, 'warning');
      return;
    }

    const btn = document.getElementById('btn-analyze-upload');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>🔍 Analyzing Cube State...</span>`;
    }

    try {
      let data = null;
      try {
        const res = await fetch('/api/analyze-cube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: this.uploadedImages }),
        });
        if (res.ok) data = await res.json();
      } catch (netErr) {}

      if (!data && window.CubeEngine) {
        data = await window.CubeEngine.clientAnalyzeCube(this.uploadedImages);
      }

      if (data && data.facelet_state) {
        this.currentState = data.facelet_state;
        this.cube3d.syncFromFaceletState(this.currentState);
        this.render2DNet();
        this.validateCurrentState();

        const confVal = document.getElementById('verified-conf-val');
        if (confVal) confVal.textContent = data.average_confidence || 99.8;

        // Switch to Verified Checklist tab (Matching Image 2)
        this.switchTab('verified');
        this.showToast(`✓ Cube State Verified with ${data.average_confidence}% confidence!`, 'success');
      } else {
        // Show Vision Error Modal (Matching Image 4)
        document.getElementById('error-modal')?.classList.remove('hidden');
      }
    } catch (e) {
      document.getElementById('error-modal')?.classList.remove('hidden');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>⚡ Analyze Cube State</span>`;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Live Webcam Scanner
  // --------------------------------------------------------------------------
  setupWebcamHandlers() {
    document.getElementById('btn-toggle-webcam-modal')?.addEventListener('click', () => {
      document.getElementById('webcam-modal')?.classList.remove('hidden');
      this.startWebcam();
    });

    document.getElementById('btn-close-webcam')?.addEventListener('click', () => {
      document.getElementById('webcam-modal')?.classList.add('hidden');
      this.stopWebcam();
    });

    const faces = ['U', 'L', 'F', 'R', 'B', 'D'];
    faces.forEach(f => {
      document.getElementById(`webcam-tab-${f}`)?.addEventListener('click', () => {
        faces.forEach(other => {
          document.getElementById(`webcam-tab-${other}`)?.classList.remove('bg-sky-600', 'text-white');
          document.getElementById(`webcam-tab-${other}`)?.classList.add('bg-slate-800', 'text-slate-300');
        });
        document.getElementById(`webcam-tab-${f}`)?.classList.add('bg-sky-600', 'text-white');
        document.getElementById(`webcam-tab-${f}`)?.classList.remove('bg-slate-800', 'text-slate-300');
        this.activeWebcamFace = f;
        const targetLabel = document.getElementById('webcam-target-label');
        if (targetLabel) targetLabel.textContent = f;
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
      this.showToast("Could not access webcam: " + e.message, "warning");
    }
  }

  stopWebcam() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
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
    this.updateScanProgress();

    const preview = document.getElementById(`upload-preview-${f}`);
    if (preview) preview.innerHTML = `<img src="${b64}" class="w-full h-full object-cover rounded-lg shadow" />`;

    this.showToast(`📸 Captured Face ${f}!`, 'success');
    this.analyzeSingleFace(f, b64);

    const sequence = ['U', 'L', 'F', 'R', 'B', 'D'];
    const curIdx = sequence.indexOf(f);
    if (curIdx < sequence.length - 1) {
      const nextFace = sequence[curIdx + 1];
      document.getElementById(`webcam-tab-${nextFace}`)?.click();
    } else {
      document.getElementById('webcam-modal')?.classList.add('hidden');
      this.stopWebcam();
      this.analyzeAllFaces();
    }
  }

  // --------------------------------------------------------------------------
  // Solve History
  // --------------------------------------------------------------------------
  recordHistory(solution) {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
      moves: solution.total_moves,
      time: solution.solve_time_ms,
      algorithm: solution.move_string,
    };
    this.solveHistory.unshift(entry);
    if (this.solveHistory.length > 25) this.solveHistory.pop();
    localStorage.setItem('cubeai_history', JSON.stringify(this.solveHistory));
    this.renderHistory();
  }

  renderHistory() {
    const container = document.getElementById('history-log-container');
    if (!container) return;

    if (this.solveHistory.length === 0) {
      container.innerHTML = `<div class="text-xs text-slate-500 p-6 text-center italic">No solve history recorded yet. Scramble or solve a cube to generate entries!</div>`;
      return;
    }

    let html = '';
    this.solveHistory.forEach((h, i) => {
      html += `
        <div class="p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-3 text-xs">
          <div>
            <div class="font-bold text-white flex items-center gap-2">
              <span class="text-sky-400 font-mono">#${i + 1}</span>
              <span>${h.moves} Moves Optimal Solution</span>
              <span class="text-[10px] text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded">${h.time} ms</span>
            </div>
            <div class="text-[11px] font-mono text-slate-400 mt-1 max-w-xl truncate">${h.algorithm}</div>
          </div>
          <span class="text-[10px] text-slate-500 font-mono">${h.date} ${h.timestamp}</span>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  clearHistory() {
    this.solveHistory = [];
    localStorage.removeItem('cubeai_history');
    this.renderHistory();
    this.showToast("Solve history logs cleared", "info");
  }

  // --------------------------------------------------------------------------
  // Toast Notifications
  // --------------------------------------------------------------------------
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgStyles = {
      success: 'bg-[#102a20] border-emerald-500/40 text-emerald-200',
      error: 'bg-[#2a1215] border-rose-500/40 text-rose-200',
      warning: 'bg-[#2a2010] border-amber-500/40 text-amber-200',
      info: 'bg-[#141824] border-sky-500/40 text-sky-200',
    };

    toast.className = `p-3.5 rounded-xl border backdrop-blur-xl shadow-2xl text-xs font-medium flex items-center gap-2.5 transition-all duration-300 transform translate-y-2 opacity-0 ${bgStyles[type] || bgStyles.info}`;
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
  window.app = new CubeAIApp();
});
