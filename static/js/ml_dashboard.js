/**
 * AI/ML Research & Portfolio Dashboard Visualizer.
 * Renders interactive confusion matrices, model benchmarks, and CV pipeline cards.
 */

class MLDashboard {
  constructor() {
    this.data = null;
  }

  async init() {
    try {
      const res = await fetch('/api/ml-metrics');
      if (res.ok) {
        this.data = await res.json();
      } else {
        throw new Error('API unavailable');
      }
    } catch (e) {
      if (window.CubeEngine && typeof window.CubeEngine.getBenchmarkMetrics === 'function') {
        this.data = window.CubeEngine.getBenchmarkMetrics();
      }
    }
    this.renderAll();
  }

  renderAll() {
    if (!this.data) return;
    this.renderBenchmarkTable();
    this.renderConfusionMatrix();
    this.renderClassMetrics();
    this.renderCVPipeline();
  }

  renderBenchmarkTable() {
    const container = document.getElementById('ml-benchmark-table');
    if (!container || !this.data.models) return;

    let html = `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-gray-300">
          <thead class="text-xs uppercase bg-gray-800/80 text-gray-400 border-b border-gray-700">
            <tr>
              <th class="py-3 px-4">Method / Paradigm</th>
              <th class="py-3 px-3">Type</th>
              <th class="py-3 px-3 text-center">Accuracy</th>
              <th class="py-3 px-3 text-center">Latency</th>
              <th class="py-3 px-4">Key Tradeoffs</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
    `;

    this.data.models.forEach(m => {
      const isSelected = m.id === 'cielab_softmax';
      const rowClass = isSelected ? 'bg-indigo-950/30 border-l-4 border-indigo-500' : 'hover:bg-gray-800/40';
      const badgeClass = m.accuracy > 95 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                        (m.accuracy > 90 ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30');

      html += `
        <tr class="${rowClass} transition-colors">
          <td class="py-3.5 px-4 font-medium text-white flex items-center gap-2">
            ${m.name}
            ${isSelected ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500 text-white font-bold">Active</span>' : ''}
          </td>
          <td class="py-3.5 px-3 text-xs text-gray-400">${m.type}</td>
          <td class="py-3.5 px-3 text-center">
            <span class="inline-block px-2.5 py-1 text-xs font-semibold rounded-full border ${badgeClass}">
              ${m.accuracy}%
            </span>
          </td>
          <td class="py-3.5 px-3 text-center font-mono text-xs text-gray-300">${m.latency_ms} ms</td>
          <td class="py-3.5 px-4 text-xs text-gray-400">
            <span class="text-emerald-400">✓ ${m.pros}</span><br>
            <span class="text-rose-400/80">✗ ${m.cons}</span>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  }

  renderConfusionMatrix() {
    const container = document.getElementById('ml-confusion-matrix');
    if (!container || !this.data.confusion_matrix) return;

    const cm = this.data.confusion_matrix;
    const labels = ["White", "Red", "Green", "Yellow", "Orange", "Blue"];
    const syms = ["W", "R", "G", "Y", "O", "B"];

    let html = `
      <div class="flex flex-col items-center">
        <div class="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider text-center">Predicted Class →</div>
        <div class="grid grid-cols-7 gap-1.5 max-w-md w-full text-center text-xs font-mono">
          <!-- Top header -->
          <div class="text-gray-500 font-bold p-1">Actual ↓</div>
          ${syms.map((s, i) => `<div class="p-1 font-bold text-gray-300 bg-gray-800/60 rounded">${s}</div>`).join('')}
    `;

    for (let r = 0; r < 6; r++) {
      html += `<div class="p-1 font-bold text-gray-300 bg-gray-800/60 rounded flex items-center justify-center">${syms[r]}</div>`;
      for (let c = 0; c < 6; c++) {
        const count = cm[r][c];
        const isDiagonal = r === c;
        let bgStyle = 'bg-gray-900/60 text-gray-600';

        if (isDiagonal) {
          const intensity = Math.min(100, Math.max(20, count));
          bgStyle = `bg-indigo-600/${intensity} text-white font-bold border border-indigo-400/40`;
        } else if (count > 0) {
          bgStyle = 'bg-rose-950/70 text-rose-300 font-bold border border-rose-500/30';
        }

        html += `
          <div class="p-2.5 rounded flex items-center justify-center transition-all hover:scale-105 ${bgStyle}" title="Actual: ${labels[r]} | Predicted: ${labels[c]} (${count} samples)">
            ${count}
          </div>
        `;
      }
    }

    html += `
        </div>
        <div class="mt-4 flex items-center gap-4 text-xs text-gray-400">
          <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-indigo-600 inline-block"></span> Correct Predictions</div>
          <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-rose-800 inline-block"></span> Off-Diagonal Errors</div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  renderClassMetrics() {
    const container = document.getElementById('ml-class-metrics');
    if (!container || !this.data.class_metrics) return;

    let html = `
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
    `;

    const colorPills = {
      White: 'border-slate-300 text-slate-100 bg-slate-800/50',
      Red: 'border-red-500 text-red-300 bg-red-950/40',
      Green: 'border-emerald-500 text-emerald-300 bg-emerald-950/40',
      Yellow: 'border-amber-400 text-amber-300 bg-amber-950/40',
      Orange: 'border-orange-500 text-orange-300 bg-orange-950/40',
      Blue: 'border-blue-500 text-blue-300 bg-blue-950/40',
    };

    this.data.class_metrics.forEach(m => {
      const pill = colorPills[m.label] || 'border-gray-500 text-gray-300';

      html += `
        <div class="glass-card p-3 rounded-xl border ${pill}">
          <div class="flex items-center justify-between mb-2">
            <span class="font-bold text-sm text-white">${m.label} (${m.symbol})</span>
            <span class="text-xs px-2 py-0.5 rounded-full bg-black/40 font-mono">F1: ${m.f1_score}%</span>
          </div>
          <div class="space-y-1 text-xs text-gray-300">
            <div class="flex justify-between"><span>Precision:</span> <span class="font-mono text-white">${m.precision}%</span></div>
            <div class="flex justify-between"><span>Recall:</span> <span class="font-mono text-white">${m.recall}%</span></div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  renderCVPipeline() {
    const container = document.getElementById('cv-pipeline-stepper');
    if (!container || !this.data.cv_pipeline_stages) return;

    let html = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">`;

    this.data.cv_pipeline_stages.forEach(s => {
      html += `
        <div class="glass-card p-4 rounded-xl relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div class="flex items-center gap-2.5 mb-2">
            <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center text-xs font-bold font-mono">
              ${s.step}
            </span>
            <h4 class="text-sm font-semibold text-white">${s.name}</h4>
          </div>
          <p class="text-xs text-gray-400 mb-2.5 leading-relaxed">${s.description}</p>
          <div class="text-[11px] font-mono px-2 py-1 rounded bg-black/40 text-cyan-400 inline-block">
            ⚙️ ${s.tech}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }
}
