const canvas = document.querySelector("#scene");
const ctx = canvas.getContext("2d");
const tabs = [...document.querySelectorAll(".tab")];
const playPause = document.querySelector("#playPause");
const stepOnce = document.querySelector("#stepOnce");
const resetDemo = document.querySelector("#resetDemo");
const speedInput = document.querySelector("#speed");
const parameterInput = document.querySelector("#parameter");
const parameterLabel = document.querySelector("#parameterLabel");
const metricStep = document.querySelector("#metricStep");
const metricOneLabel = document.querySelector("#metricOneLabel");
const metricOne = document.querySelector("#metricOne");
const metricTwoLabel = document.querySelector("#metricTwoLabel");
const metricTwo = document.querySelector("#metricTwo");
const demoKicker = document.querySelector("#demoKicker");
const demoTitle = document.querySelector("#demoTitle");
const demoEquation = document.querySelector("#demoEquation");
const legend = document.querySelector("#legend");

const colors = {
  ink: "#17202a",
  muted: "#667085",
  line: "#d8d0c3",
  grid: "#ebe4d8",
  blue: "#2266aa",
  teal: "#168575",
  gold: "#d99116",
  red: "#c7523f",
  violet: "#7658a5",
  paper: "#fffaf1",
  white: "#ffffff",
};

const TAU = Math.PI * 2;
let activeName = "pagerank";
let active = null;
let playing = true;
let lastFrame = 0;
let accumulator = 0;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function dims() {
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normal(rand) {
  const u = Math.max(1e-9, rand());
  const v = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function clear() {
  const { w, h } = dims();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, w, h);
}

function drawRoundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPanel(x, y, w, h) {
  ctx.fillStyle = "rgba(255,255,255,0.84)";
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  drawRoundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function text(label, x, y, options = {}) {
  ctx.save();
  ctx.fillStyle = options.color || colors.ink;
  ctx.font = `${options.weight || 650} ${options.size || 13}px ${options.family || "Inter, system-ui, sans-serif"}`;
  ctx.textAlign = options.align || "left";
  ctx.textBaseline = options.baseline || "middle";
  ctx.fillText(label, x, y);
  ctx.restore();
}

function circle(x, y, r, fill, stroke = null, lineWidth = 1.5) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function line(x1, y1, x2, y2, stroke = colors.line, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function arrow(x1, y1, x2, y2, stroke = colors.line, width = 1.5) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const pad = 22;
  const sx = x1 + Math.cos(angle) * pad;
  const sy = y1 + Math.sin(angle) * pad;
  const ex = x2 - Math.cos(angle) * pad;
  const ey = y2 - Math.sin(angle) * pad;
  line(sx, sy, ex, ey, stroke, width);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(angle - 0.45) * 10, ey - Math.sin(angle - 0.45) * 10);
  ctx.lineTo(ex - Math.cos(angle + 0.45) * 10, ey - Math.sin(angle + 0.45) * 10);
  ctx.closePath();
  ctx.fillStyle = stroke;
  ctx.fill();
}

function setLegend(items) {
  legend.innerHTML = items
    .map(
      (item) =>
        `<span class="legend-item"><span class="swatch" style="background:${item.color}"></span>${item.label}</span>`
    )
    .join("");
}

function setDemo(name) {
  activeName = name;
  active = demos[name].create();
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.demo === name));
  const meta = demos[name].meta;
  demoKicker.textContent = meta.kicker;
  demoTitle.textContent = meta.title;
  demoEquation.textContent = meta.equation;
  parameterLabel.textContent = meta.parameterLabel;
  parameterInput.min = meta.parameterMin;
  parameterInput.max = meta.parameterMax;
  parameterInput.value = meta.parameterValue;
  metricOneLabel.textContent = meta.metricOneLabel;
  metricTwoLabel.textContent = meta.metricTwoLabel;
  setLegend(meta.legend);
  updateMetrics();
  draw();
}

function parameter() {
  return Number(parameterInput.value);
}

function step(count = 1) {
  for (let i = 0; i < count; i += 1) {
    active.step(parameter());
  }
  updateMetrics();
}

function updateMetrics() {
  const stats = active.stats();
  metricStep.textContent = stats.step;
  metricOne.textContent = stats.one;
  metricTwo.textContent = stats.two;
}

function draw() {
  if (!active) return;
  clear();
  active.draw();
}

function graphLayout(nodes, width, height, margin = 70) {
  const cx = width * 0.5;
  const cy = height * 0.49;
  const radius = Math.min(width, height) * 0.31;
  return Object.fromEntries(
    nodes.map((node, i) => {
      const angle = -Math.PI / 2 + (i / nodes.length) * TAU;
      return [node, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }];
    })
  );
}

function drawBarChart(values, x, y, w, h, color) {
  const entries = Object.entries(values);
  const max = Math.max(0.01, ...entries.map(([, value]) => value));
  const gap = 6;
  const barW = (w - gap * (entries.length - 1)) / entries.length;
  entries.forEach(([name, value], i) => {
    const bh = (value / max) * (h - 26);
    const bx = x + i * (barW + gap);
    const by = y + h - bh - 18;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.82;
    ctx.fillRect(bx, by, barW, bh);
    ctx.globalAlpha = 1;
    text(name, bx + barW / 2, y + h - 6, { align: "center", size: 11, color: colors.muted });
  });
}

function makePagerank() {
  const rand = mulberry32(2201);
  const nodes = ["A", "B", "C", "D", "E"];
  const graph = {
    A: ["B", "C"],
    B: ["B", "C", "D"],
    C: ["A"],
    D: ["A", "E"],
    E: ["A", "C"],
  };
  return {
    stepCount: 0,
    current: "A",
    visits: Object.fromEntries(nodes.map((node) => [node, 0])),
    lastTeleport: false,
    step(alphaRaw) {
      const alpha = alphaRaw / 100;
      this.visits[this.current] += 1;
      this.lastTeleport = rand() < alpha;
      if (this.lastTeleport) {
        this.current = nodes[Math.floor(rand() * nodes.length)];
      } else {
        const targets = graph[this.current];
        this.current = targets[Math.floor(rand() * targets.length)];
      }
      this.stepCount += 1;
    },
    stats() {
      const total = Math.max(1, this.stepCount);
      const share = this.visits[this.current] / total;
      return {
        step: this.stepCount,
        one: this.current,
        two: `${(share * 100).toFixed(1)}%`,
      };
    },
    draw() {
      const { w, h } = dims();
      const compact = w < 620;
      const pos = compact
        ? Object.fromEntries(
            nodes.map((node, i) => {
              const angle = -Math.PI / 2 + (i / nodes.length) * TAU;
              const radius = Math.min(w * 0.31, h * 0.17);
              return [
                node,
                {
                  x: w / 2 + Math.cos(angle) * radius,
                  y: h * 0.72 + Math.sin(angle) * radius,
                },
              ];
            })
          )
        : graphLayout(nodes, w * 0.72, h, 56);
      if (!compact) {
        Object.values(pos).forEach((p) => (p.x += 8));
      }

      Object.entries(graph).forEach(([src, targets]) => {
        targets.forEach((dst) => {
          if (src === dst) {
            const p = pos[src];
            ctx.beginPath();
            ctx.arc(p.x + 17, p.y - 18, 20, -0.2, 5.0);
            ctx.strokeStyle = "rgba(102,112,133,0.54)";
            ctx.lineWidth = 1.7;
            ctx.stroke();
          } else {
            arrow(pos[src].x, pos[src].y, pos[dst].x, pos[dst].y, "rgba(102,112,133,0.50)", 1.4);
          }
        });
      });

      nodes.forEach((node) => {
        const p = pos[node];
        const activeNode = node === this.current;
        circle(p.x, p.y, activeNode ? 27 : 23, activeNode ? colors.gold : colors.white, activeNode ? colors.ink : colors.blue, 2);
        text(node, p.x, p.y + 1, { align: "center", size: 15, weight: 800 });
      });

      const panelX = compact ? (w - 206) / 2 : w - 250;
      const panelY = compact ? 22 : 42;
      drawPanel(panelX, panelY, 206, 174);
      text("Visit frequency", panelX + 18, panelY + 26, { size: 13, weight: 800 });
      const total = Math.max(1, this.stepCount);
      const values = Object.fromEntries(nodes.map((node) => [node, this.visits[node] / total]));
      drawBarChart(values, panelX + 18, panelY + 44, 170, 100, colors.blue);

      const label = this.lastTeleport ? "teleport jump" : "link click";
      text(label, w * 0.5, compact ? panelY + 164 : h - 38, {
        align: "center",
        color: this.lastTeleport ? colors.red : colors.teal,
        size: 14,
        weight: 800,
      });
    },
  };
}

function makeDiffusion() {
  const rand = mulberry32(3109);
  const particles = Array.from({ length: 170 }, (_, i) => {
    const mode = i % 2 === 0 ? -1.35 : 1.35;
    return { x: mode + normal(rand) * 0.18, y: normal(rand) * 0.12 };
  });
  return {
    stepCount: 0,
    particles,
    step(betaRaw) {
      const beta = betaRaw / 1000;
      this.particles.forEach((p) => {
        p.x = Math.sqrt(1 - beta) * p.x + Math.sqrt(beta) * normal(rand);
        p.y = Math.sqrt(1 - beta) * p.y + Math.sqrt(beta) * normal(rand);
      });
      this.stepCount += 1;
    },
    stats() {
      const spread = Math.sqrt(this.particles.reduce((sum, p) => sum + p.x * p.x + p.y * p.y, 0) / this.particles.length);
      return { step: this.stepCount, one: "x_t", two: spread.toFixed(2) };
    },
    draw() {
      const { w, h } = dims();
      const plot = { x: 58, y: 48, w: w - 116, h: h - 116 };
      drawPanel(plot.x, plot.y, plot.w, plot.h);
      for (let i = 1; i < 7; i += 1) {
        const gx = plot.x + (plot.w * i) / 7;
        line(gx, plot.y + 18, gx, plot.y + plot.h - 24, colors.grid, 1);
      }
      for (let i = 1; i < 5; i += 1) {
        const gy = plot.y + (plot.h * i) / 5;
        line(plot.x + 20, gy, plot.x + plot.w - 20, gy, colors.grid, 1);
      }
      const scale = Math.min(plot.w, plot.h) / 5.2;
      const cx = plot.x + plot.w / 2;
      const cy = plot.y + plot.h / 2;
      this.particles.forEach((p, i) => {
        const px = cx + p.x * scale;
        const py = cy + p.y * scale;
        circle(px, py, i % 2 ? 3.1 : 2.6, i % 2 ? colors.blue : colors.teal);
      });
      text("clean modes spread into Gaussian noise", cx, plot.y + plot.h + 28, { align: "center", color: colors.muted, size: 13 });
      const t = clamp(this.stepCount / 240, 0, 1);
      ctx.strokeStyle = colors.gold;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(plot.x + 26, plot.y + 26);
      ctx.lineTo(plot.x + 26 + (plot.w - 52) * t, plot.y + 26);
      ctx.stroke();
    },
  };
}

function makeDeepwalk() {
  const rand = mulberry32(7717);
  const nodes = ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"];
  const graph = {
    v1: ["v2", "v3", "v4"],
    v2: ["v1", "v3", "v5"],
    v3: ["v1", "v2", "v4", "v6"],
    v4: ["v1", "v3", "v7"],
    v5: ["v2", "v6", "v8"],
    v6: ["v3", "v5", "v7", "v8"],
    v7: ["v4", "v6", "v8"],
    v8: ["v5", "v6", "v7"],
  };
  return {
    stepCount: 0,
    current: "v1",
    path: ["v1"],
    step(windowRaw) {
      const targets = graph[this.current];
      this.current = targets[Math.floor(rand() * targets.length)];
      this.path.push(this.current);
      const keep = Math.max(5, Math.floor(windowRaw / 5));
      this.path = this.path.slice(-keep);
      this.stepCount += 1;
    },
    stats() {
      return { step: this.stepCount, one: this.current, two: `${this.path.length} nodes` };
    },
    draw() {
      const { w, h } = dims();
      const pos = graphLayout(nodes, w, h, 70);
      Object.entries(graph).forEach(([src, targets]) => {
        targets.forEach((dst) => {
          if (src < dst) line(pos[src].x, pos[src].y, pos[dst].x, pos[dst].y, "rgba(102,112,133,0.33)", 1.4);
        });
      });

      for (let i = 1; i < this.path.length; i += 1) {
        const a = pos[this.path[i - 1]];
        const b = pos[this.path[i]];
        line(a.x, a.y, b.x, b.y, colors.gold, Math.max(2, 7 - (this.path.length - i) * 0.55));
      }

      nodes.forEach((node) => {
        const activeNode = node === this.current;
        const inPath = this.path.includes(node);
        circle(pos[node].x, pos[node].y, activeNode ? 25 : 21, activeNode ? colors.gold : inPath ? "#f7e1b9" : colors.white, colors.teal, 2);
        text(node, pos[node].x, pos[node].y + 1, { align: "center", size: 13, weight: 800 });
      });

      drawPanel(38, h - 100, w - 76, 58);
      text(this.path.join("  "), 58, h - 70, { family: "ui-monospace, Menlo, Consolas, monospace", color: colors.ink, size: 14, weight: 760 });
    },
  };
}

function bananaDensity(x, y) {
  const curved = y + 0.28 * (x * x - 1.6);
  return Math.exp(-0.5 * (x * x / 2.2 + curved * curved / 0.18));
}

function makeMcmc() {
  const rand = mulberry32(9329);
  return {
    stepCount: 0,
    accepted: 0,
    x: -1.8,
    y: 0.3,
    samples: [],
    step(scaleRaw) {
      const scale = scaleRaw / 34;
      const nx = this.x + normal(rand) * scale;
      const ny = this.y + normal(rand) * scale;
      const ratio = bananaDensity(nx, ny) / Math.max(1e-12, bananaDensity(this.x, this.y));
      if (rand() < Math.min(1, ratio)) {
        this.x = nx;
        this.y = ny;
        this.accepted += 1;
      }
      this.samples.push({ x: this.x, y: this.y });
      this.samples = this.samples.slice(-360);
      this.stepCount += 1;
    },
    stats() {
      const rate = this.stepCount ? this.accepted / this.stepCount : 0;
      return { step: this.stepCount, one: `${this.x.toFixed(1)}, ${this.y.toFixed(1)}`, two: `${(rate * 100).toFixed(0)}%` };
    },
    draw() {
      const { w, h } = dims();
      const plot = { x: 58, y: 44, w: w - 116, h: h - 94 };
      drawPanel(plot.x, plot.y, plot.w, plot.h);
      const sx = plot.w / 6.2;
      const sy = plot.h / 4.6;
      const px = (x) => plot.x + plot.w / 2 + x * sx;
      const py = (y) => plot.y + plot.h / 2 - y * sy;

      for (let i = 0; i < 18; i += 1) {
        const level = 0.12 + i * 0.045;
        ctx.beginPath();
        let moved = false;
        for (let a = -3.0; a <= 3.01; a += 0.05) {
          for (let b = -2.2; b <= 2.21; b += 0.05) {
            if (Math.abs(bananaDensity(a, b) - level) < 0.004) {
              if (!moved) {
                ctx.moveTo(px(a), py(b));
                moved = true;
              } else {
                ctx.lineTo(px(a), py(b));
              }
            }
          }
        }
        ctx.strokeStyle = `rgba(34, 102, 170, ${0.05 + i * 0.012})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      this.samples.forEach((s, i) => {
        const alpha = 0.15 + 0.65 * (i / Math.max(1, this.samples.length - 1));
        circle(px(s.x), py(s.y), 2.2, `rgba(22,133,117,${alpha})`);
      });
      circle(px(this.x), py(this.y), 7, colors.gold, colors.ink, 1.5);
    },
  };
}

function makeRl() {
  const rand = mulberry32(1499);
  const n = 9;
  const goal = { x: 7, y: 2 };
  return {
    stepCount: 0,
    x: 1,
    y: 7,
    visits: Array.from({ length: n }, () => Array(n).fill(0)),
    step(epsilonRaw) {
      const epsilon = epsilonRaw / 100;
      const moves = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];
      let move;
      if (rand() < epsilon) {
        move = moves[Math.floor(rand() * moves.length)];
      } else {
        move = moves
          .map((m) => ({ ...m, d: Math.abs(goal.x - (this.x + m.x)) + Math.abs(goal.y - (this.y + m.y)) }))
          .sort((a, b) => a.d - b.d)[0];
      }
      this.x = clamp(this.x + move.x, 0, n - 1);
      this.y = clamp(this.y + move.y, 0, n - 1);
      this.visits[this.y][this.x] += 1;
      if (this.x === goal.x && this.y === goal.y) {
        this.x = Math.floor(rand() * 3);
        this.y = 6 + Math.floor(rand() * 3);
      }
      this.stepCount += 1;
    },
    stats() {
      const seen = this.visits.flat().filter((v) => v > 0).length;
      return { step: this.stepCount, one: `${this.x}, ${this.y}`, two: `${seen}/81` };
    },
    draw() {
      const { w, h } = dims();
      const size = Math.min(w - 90, h - 80);
      const x0 = (w - size) / 2;
      const y0 = (h - size) / 2;
      const cell = size / n;
      const maxVisit = Math.max(1, ...this.visits.flat());
      for (let row = 0; row < n; row += 1) {
        for (let col = 0; col < n; col += 1) {
          const v = this.visits[row][col] / maxVisit;
          ctx.fillStyle = `rgba(34,102,170,${0.08 + v * 0.56})`;
          ctx.fillRect(x0 + col * cell, y0 + row * cell, cell - 1, cell - 1);
        }
      }
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      for (let i = 0; i <= n; i += 1) {
        line(x0 + i * cell, y0, x0 + i * cell, y0 + size, colors.line, 1);
        line(x0, y0 + i * cell, x0 + size, y0 + i * cell, colors.line, 1);
      }
      circle(x0 + (goal.x + 0.5) * cell, y0 + (goal.y + 0.5) * cell, cell * 0.28, colors.teal, colors.ink, 1.5);
      text("G", x0 + (goal.x + 0.5) * cell, y0 + (goal.y + 0.5) * cell + 1, { align: "center", color: colors.white, weight: 900 });
      circle(x0 + (this.x + 0.5) * cell, y0 + (this.y + 0.5) * cell, cell * 0.25, colors.gold, colors.ink, 1.5);
      text("A", x0 + (this.x + 0.5) * cell, y0 + (this.y + 0.5) * cell + 1, { align: "center", weight: 900 });
      text("epsilon-greedy state visitation", w / 2, h - 30, { align: "center", color: colors.muted, size: 13 });
    },
  };
}

const demos = {
  pagerank: {
    meta: {
      kicker: "Link analysis",
      title: "PageRank random surfer",
      equation: "r = (1 - alpha) A r + alpha e",
      parameterLabel: "Teleport probability",
      parameterMin: 0,
      parameterMax: 60,
      parameterValue: 15,
      metricOneLabel: "Current page",
      metricTwoLabel: "Visit share",
      legend: [
        { color: colors.gold, label: "current page" },
        { color: colors.blue, label: "visit frequency" },
        { color: colors.red, label: "teleport" },
      ],
    },
    create: makePagerank,
  },
  diffusion: {
    meta: {
      kicker: "Generative models",
      title: "Forward diffusion noising",
      equation: "x_t = sqrt(1 - beta_t) x_{t-1} + sqrt(beta_t) eps_t",
      parameterLabel: "Noise increment",
      parameterMin: 2,
      parameterMax: 80,
      parameterValue: 18,
      metricOneLabel: "State",
      metricTwoLabel: "RMS spread",
      legend: [
        { color: colors.teal, label: "mode one" },
        { color: colors.blue, label: "mode two" },
        { color: colors.gold, label: "time" },
      ],
    },
    create: makeDiffusion,
  },
  deepwalk: {
    meta: {
      kicker: "Graph embeddings",
      title: "DeepWalk sampling path",
      equation: "walks on G become sentences for Skip-gram",
      parameterLabel: "Context window",
      parameterMin: 25,
      parameterMax: 90,
      parameterValue: 55,
      metricOneLabel: "Current node",
      metricTwoLabel: "Sequence",
      legend: [
        { color: colors.gold, label: "recent walk" },
        { color: colors.teal, label: "graph node" },
      ],
    },
    create: makeDeepwalk,
  },
  mcmc: {
    meta: {
      kicker: "Bayesian inference",
      title: "Random-walk Metropolis",
      equation: "accept x' with min(1, pi(x') / pi(x))",
      parameterLabel: "Proposal scale",
      parameterMin: 4,
      parameterMax: 80,
      parameterValue: 18,
      metricOneLabel: "Sample",
      metricTwoLabel: "Accept rate",
      legend: [
        { color: colors.teal, label: "samples" },
        { color: colors.gold, label: "current state" },
        { color: colors.blue, label: "target contours" },
      ],
    },
    create: makeMcmc,
  },
  rl: {
    meta: {
      kicker: "Reinforcement learning",
      title: "Epsilon-greedy exploration",
      equation: "a_t = random action with probability epsilon",
      parameterLabel: "Exploration probability",
      parameterMin: 0,
      parameterMax: 100,
      parameterValue: 35,
      metricOneLabel: "Agent cell",
      metricTwoLabel: "Visited cells",
      legend: [
        { color: colors.gold, label: "agent" },
        { color: colors.teal, label: "goal" },
        { color: colors.blue, label: "visitation" },
      ],
    },
    create: makeRl,
  },
};

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setDemo(tab.dataset.demo));
});

playPause.addEventListener("click", () => {
  playing = !playing;
  playPause.textContent = playing ? "Pause" : "Run";
  playPause.setAttribute("aria-label", playing ? "Pause animation" : "Run animation");
});

stepOnce.addEventListener("click", () => {
  step(1);
  draw();
});

resetDemo.addEventListener("click", () => {
  setDemo(activeName);
});

parameterInput.addEventListener("input", () => {
  draw();
});

window.addEventListener("resize", resizeCanvas);

function frame(time) {
  if (!lastFrame) lastFrame = time;
  const delta = time - lastFrame;
  lastFrame = time;
  if (playing) {
    accumulator += delta;
    const interval = 90;
    const speed = Number(speedInput.value);
    while (accumulator >= interval) {
      step(speed);
      accumulator -= interval;
    }
    draw();
  }
  requestAnimationFrame(frame);
}

setDemo("pagerank");
resizeCanvas();
requestAnimationFrame(frame);
