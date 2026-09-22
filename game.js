// =====================================================
// MATH BLAST - game.js
// Block Blast + Matematika Dasar
// =====================================================

'use strict';

// ─── CONSTANTS ───────────────────────────────────────
const GRID_SIZE = 8;
const MATH_DURATION = 6000; // ms
const LINES_PER_LEVEL = 8;
const PTS_PER_CELL = 10;
const PTS_MATH_BONUS = 60;

const COLORS = [
  '#FF6B6B','#FF8E53','#FFC93C','#56E87B',
  '#4D96FF','#C77DFF','#FF6BCD','#00D8CF',
  '#FF4757','#2ED573','#70A1FF','#FF9FF3',
];

// Piece shape definitions (2D boolean grids)
const SHAPES = [
  [[1]],
  [[1,1]],
  [[1],[1]],
  [[1,1],[1,1]],
  [[1,1,1]],
  [[1],[1],[1]],
  [[1,0],[1,1]],
  [[0,1],[1,1]],
  [[1,1],[1,0]],
  [[1,1],[0,1]],
  [[1,1,1],[1,0,0]],
  [[1,1,1],[0,0,1]],
  [[1,0,0],[1,1,1]],
  [[0,0,1],[1,1,1]],
  [[1,1,0],[0,1,1]],
  [[0,1,1],[1,1,0]],
  [[0,1,0],[1,1,1]],
  [[1,0],[1,0],[1,1]],
  [[0,1],[0,1],[1,1]],
  [[1,1],[1,0],[1,0]],
  [[1,1],[0,1],[0,1]],
  [[1,1,1,1]],
  [[1],[1],[1],[1]],
  [[1,1],[1,1],[1,1]],
  [[1,1,1],[1,0,1]],
  [[1,1,1,1,1]],
  [[1],[1],[1],[1],[1]],
];

// ─── STATE ───────────────────────────────────────────
let gridData = [];       // [row][col] = {number, color} or null
let cellEls = [];        // [row][col] = HTMLElement
let pieces = [];         // [{shape, cells:{key:num}, color}|null, ...]
let selectedIdx = -1;
let hoverR = -1, hoverC = -1;

let score = 0;
let highScore = +( localStorage.getItem('mathblast-hs') || 0 );
let level = 1;
let combo = 1;
let maxCombo = 1;
let linesCleared = 0;
let gameActive = false;
let paused = false;
let startDiff = 1;       // 1 = easy, 2 = medium, 3 = hard

let mathTimerInterval = null;
let mathTimeLeft = 0;

let particles = [];
let particleCtx = null;
let rafId = null;

// ─── DOM REFS ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const screenStart  = $('screen-start');
const screenGame   = $('screen-game');
const scoreEl      = $('score-display');
const levelEl      = $('level-display');
const comboEl      = $('combo-display');
const progressEl   = $('level-progress');
const hsEl         = $('high-score-display');
const linesEl      = $('lines-display');
const nextLvlEl    = $('next-level-display');
const linesToNext  = $('lines-to-next');
const mathModal    = $('math-modal');
const mathQEl      = $('math-question');
const mathOptsEl   = $('math-options');
const mathTimerBar = $('math-timer-bar');
const mathTimerTxt = $('math-timer-text');
const mathLinesEl  = $('math-lines-info');
const gameOverModal= $('gameover-modal');
const pauseModal   = $('pause-modal');
const resultFlash  = $('result-flash');
const resultTxt    = $('result-flash-text');
const scorePopLayer= $('score-popup-layer');
const canvas       = $('particle-canvas');
const startHS      = $('start-high-score');

// ─── PARTICLES ───────────────────────────────────────
function initCanvas() {
  resize();
  particleCtx = canvas.getContext('2d');
  if (rafId) cancelAnimationFrame(rafId);
  rafLoop();
}

function resize() {
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
}

function rafLoop() {
  if (particleCtx) {
    particleCtx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.18; p.vx *= 0.98;
      p.life -= p.decay;
      const alpha = Math.max(0, p.life / p.maxLife);
      particleCtx.save();
      particleCtx.globalAlpha = alpha;
      particleCtx.fillStyle = p.color;
      particleCtx.shadowBlur = 10;
      particleCtx.shadowColor = p.color;
      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      particleCtx.fill();
      particleCtx.restore();
    }
  }
  rafId = requestAnimationFrame(rafLoop);
}

function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 2.5,
      r: 2 + Math.random() * 3.5,
      color,
      life: 55 + Math.random() * 45,
      maxLife: 100,
      decay: 1.4 + Math.random(),
    });
  }
}

function burstCells(els, color) {
  for (const el of els) {
    const rc = el.getBoundingClientRect();
    burst(rc.left + rc.width / 2, rc.top + rc.height / 2, color, 8);
  }
}

// ─── AUDIO ───────────────────────────────────────────
let actx = null;
function getActx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}

function playTone(type) {
  try {
    const ac = getActx();
    const play = (freq, t, dur, wave = 'sine', vol = 0.12) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = wave; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + dur);
    };
    const now = ac.currentTime;
    if (type === 'place')   { play(440, now, 0.08); play(660, now + 0.04, 0.08); }
    if (type === 'clear')   { play(880, now, 0.12); play(1320, now + 0.06, 0.2); play(1760, now + 0.15, 0.18); }
    if (type === 'correct') { [523,659,784,1047].forEach((f,i) => play(f, now+i*0.09, 0.14)); }
    if (type === 'wrong')   { play(220, now, 0.12, 'sawtooth', 0.08); play(180, now+0.1, 0.14, 'sawtooth', 0.07); }
    if (type === 'levelup') { [523,659,784,1047,1319].forEach((f,i) => play(f, now+i*0.11, 0.18)); }
    if (type === 'gameover'){ [330,277,220].forEach((f,i) => play(f, now+i*0.18, 0.28, 'triangle')); }
  } catch(e) {}
}

// ─── GRID ─────────────────────────────────────────────
function buildGrid() {
  const g = $('game-grid');
  g.innerHTML = '';
  gridData = Array.from({length: GRID_SIZE}, () => Array(GRID_SIZE).fill(null));
  cellEls   = Array.from({length: GRID_SIZE}, () => Array(GRID_SIZE).fill(null));

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const el = document.createElement('div');
      el.className = 'grid-cell';
      el.dataset.r = r; el.dataset.c = c;
      g.appendChild(el);
      cellEls[r][c] = el;
    }
  }

  // Mouse events
  g.addEventListener('mousemove', onGridMouse);
  g.addEventListener('mouseleave', onGridLeave);
  g.addEventListener('click', onGridClick);
  // Touch events
  g.addEventListener('touchmove', onGridTouch, {passive: false});
  g.addEventListener('touchend', onGridTouchEnd, {passive: false});
}

function setCell(r, c, data) {
  const el = cellEls[r][c];
  if (!data) {
    el.className = 'grid-cell';
    el.style.backgroundColor = '';
    el.textContent = '';
  } else {
    el.className = 'grid-cell filled';
    el.style.backgroundColor = data.color;
    el.style.boxShadow = `inset 0 -3px 0 rgba(0,0,0,0.28), 0 0 8px ${data.color}55`;
    el.textContent = data.number;
  }
}

// ─── PIECES ──────────────────────────────────────────
function makePiece() {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const cells = {};
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) cells[`${r},${c}`] = Math.ceil(Math.random() * 9);
  return { shape, color, cells };
}

function spawnPieces() {
  pieces = [makePiece(), makePiece(), makePiece()];
  selectedIdx = -1;
  renderTray();
}

function renderTray() {
  for (let i = 0; i < 3; i++) renderSlot(i);
}

function renderSlot(i) {
  const slot = $(`piece-slot-${i}`);
  slot.innerHTML = '';
  slot.className = 'piece-slot';
  const p = pieces[i];
  if (!p) { slot.classList.add('empty-slot'); return; }

  const sh = p.shape;
  const rows = sh.length, cols = sh[0].length;
  const mg = document.createElement('div');
  mg.className = 'piece-mini-grid';
  mg.style.gridTemplateColumns = `repeat(${cols}, 22px)`;
  mg.style.gridTemplateRows    = `repeat(${rows}, 22px)`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mc = document.createElement('div');
      if (sh[r][c]) {
        mc.className = 'piece-mini-cell visible';
        mc.style.backgroundColor = p.color;
        mc.style.boxShadow = `0 0 7px ${p.color}88`;
        mc.textContent = p.cells[`${r},${c}`];
      } else {
        mc.className = 'piece-mini-cell transparent';
      }
      mg.appendChild(mc);
    }
  }
  slot.appendChild(mg);
  if (selectedIdx === i) slot.classList.add('selected');

  slot.onclick = () => selectPiece(i);
}

function selectPiece(i) {
  if (!pieces[i] || !gameActive || paused) return;
  selectedIdx = (selectedIdx === i) ? -1 : i;
  clearPreview();
  renderTray();
  if (selectedIdx >= 0 && hoverR >= 0) updatePreview(hoverR, hoverC);
}

// ─── PREVIEW ─────────────────────────────────────────
function getCells(piece, tr, tc) {
  const list = [];
  const sh = piece.shape;
  for (let r = 0; r < sh.length; r++)
    for (let c = 0; c < sh[r].length; c++)
      if (sh[r][c]) list.push({r: tr+r, c: tc+c, num: piece.cells[`${r},${c}`]});
  return list;
}

function isValid(piece, tr, tc) {
  return getCells(piece, tr, tc).every(({r,c}) =>
    r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && !gridData[r][c]
  );
}

function clearPreview() {
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++) {
      const el = cellEls[r][c];
      el.classList.remove('preview-valid','preview-invalid','preview-number');
      if (!gridData[r][c]) el.textContent = '';
    }
}

function updatePreview(tr, tc) {
  clearPreview();
  if (selectedIdx < 0 || !pieces[selectedIdx]) return;
  const p = pieces[selectedIdx];
  const pcs = getCells(p, tr, tc);
  const valid = isValid(p, tr, tc);
  for (const {r,c,num} of pcs) {
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
    const el = cellEls[r][c];
    if (gridData[r][c]) continue;
    el.classList.add(valid ? 'preview-valid' : 'preview-invalid');
    if (valid) { el.textContent = num; el.classList.add('preview-number'); }
  }
}

// ─── GRID EVENTS ─────────────────────────────────────
function gridCoords(clientX, clientY) {
  const rect = $('game-grid').getBoundingClientRect();
  const cw = rect.width / GRID_SIZE;
  const ch = rect.height / GRID_SIZE;
  return {
    r: Math.floor((clientY - rect.top)  / ch),
    c: Math.floor((clientX - rect.left) / cw),
  };
}

function onGridMouse(e) {
  if (selectedIdx < 0) return;
  const {r, c} = gridCoords(e.clientX, e.clientY);
  if (r !== hoverR || c !== hoverC) { hoverR = r; hoverC = c; updatePreview(r, c); }
}

function onGridLeave() {
  hoverR = -1; hoverC = -1;
  clearPreview();
}

function onGridTouch(e) {
  e.preventDefault();
  if (selectedIdx < 0) return;
  const t = e.touches[0];
  const {r, c} = gridCoords(t.clientX, t.clientY);
  if (r !== hoverR || c !== hoverC) { hoverR = r; hoverC = c; updatePreview(r, c); }
}

function onGridTouchEnd(e) {
  e.preventDefault();
  const t = e.changedTouches[0];
  const {r, c} = gridCoords(t.clientX, t.clientY);
  doPlace(r, c);
}

function onGridClick(e) {
  const {r, c} = gridCoords(e.clientX, e.clientY);
  doPlace(r, c);
}

// ─── PLACE ───────────────────────────────────────────
function doPlace(tr, tc) {
  if (selectedIdx < 0 || !gameActive || paused) return;
  if (tr < 0 || tr >= GRID_SIZE || tc < 0 || tc >= GRID_SIZE) return;
  const p = pieces[selectedIdx];
  if (!isValid(p, tr, tc)) return;

  playTone('place');
  const pcs = getCells(p, tr, tc);
  for (const {r, c, num} of pcs) {
    gridData[r][c] = {number: num, color: p.color};
    setCell(r, c, gridData[r][c]);
    const el = cellEls[r][c];
    el.classList.add('just-placed');
    setTimeout(() => el.classList.remove('just-placed'), 280);
  }

  pieces[selectedIdx] = null;
  selectedIdx = -1;
  clearPreview();
  renderTray();

  // Check clears
  const {rows, cols} = findFullLines();
  if (rows.length > 0 || cols.length > 0) {
    animateClear(rows, cols);
  } else {
    afterPlace();
  }
}

// ─── LINE CLEAR ──────────────────────────────────────
function findFullLines() {
  const rows = [], cols = [];
  for (let r = 0; r < GRID_SIZE; r++)
    if (gridData[r].every(c => c !== null)) rows.push(r);
  for (let c = 0; c < GRID_SIZE; c++)
    if (gridData.every(row => row[c] !== null)) cols.push(c);
  return {rows, cols};
}

function animateClear(rows, cols) {
  gameActive = false;

  // Collect unique cells + numbers
  const keySet = new Set();
  const nums   = [];
  const colors = [];

  const addCell = (r, c) => {
    const k = `${r},${c}`;
    if (!keySet.has(k)) {
      keySet.add(k);
      if (gridData[r][c]) {
        nums.push(gridData[r][c].number);
        colors.push(gridData[r][c].color);
      }
    }
  };

  for (const r of rows) for (let c = 0; c < GRID_SIZE; c++) addCell(r, c);
  for (const c of cols) for (let r = 0; r < GRID_SIZE; r++) addCell(r, c);

  const totalCells   = keySet.size;
  const lineCount    = rows.length + cols.length;
  const dominantColor = colors[Math.floor(colors.length / 2)] || '#FFC93C';

  // Flash animation
  const clearEls = [];
  for (const k of keySet) {
    const [r, c] = k.split(',').map(Number);
    const el = cellEls[r][c];
    el.classList.add('clearing');
    clearEls.push(el);
  }

  playTone('clear');
  burstCells(clearEls, dominantColor);

  setTimeout(() => {
    // Clear grid data
    for (const k of keySet) {
      const [r, c] = k.split(',').map(Number);
      gridData[r][c] = null;
      setCell(r, c, null);
    }

    // Base score (without combo multiplier yet, will apply after math)
    const baseScore = totalCells * PTS_PER_CELL * combo;
    addScore(baseScore, null);

    // Update lines
    linesCleared += lineCount;
    linesEl.textContent = linesCleared;

    // Level check
    const newLevel = Math.floor(linesCleared / LINES_PER_LEVEL) + 1;
    if (newLevel > level) doLevelUp(newLevel);
    updateLevelBar();

    // Show math challenge
    showMath(nums, lineCount, dominantColor);

  }, 480);
}

// ─── MATH CHALLENGE ──────────────────────────────────
function showMath(nums, lineCount, color) {
  const q = genQuestion(nums);
  mathLinesEl.textContent = `🎉 ${lineCount} baris/kolom terhapus!`;
  mathLinesEl.style.color = color;
  mathQEl.textContent = q.question;

  mathOptsEl.innerHTML = '';
  q.options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'math-option-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => pickAnswer(opt === q.answer, btn, q.answer));
    mathOptsEl.appendChild(btn);
  });

  mathModal.classList.remove('hidden');
  startTimer(q.answer);
}

function genQuestion(nums) {
  const valid = nums.filter(n => n > 0);
  if (valid.length < 2) return fallbackQ();

  const a = valid[Math.floor(Math.random() * valid.length)];
  let b;
  do { b = valid[Math.floor(Math.random() * valid.length)]; } while (b === a && valid.length > 1);

  const ops = ['+'];
  if (level >= 2 || startDiff >= 2) ops.push('-');
  if (level >= 3 || startDiff >= 3) ops.push('×');
  const op = ops[Math.floor(Math.random() * ops.length)];

  let x = a, y = b, ans;
  if (op === '+')  { ans = a + b; }
  else if (op === '-') { x = Math.max(a,b); y = Math.min(a,b); if (x===y) y = Math.max(1,y-1); ans = x - y; }
  else { x = Math.min(a,9); y = Math.min(b,9); if (x>6&&y>6) x=Math.min(x,5); ans = x * y; }

  const wrongs = new Set();
  let tries = 0;
  while (wrongs.size < 3 && tries++ < 60) {
    const off = Math.floor(Math.random() * 8) + 1;
    const w = ans + (Math.random() > 0.5 ? off : -off);
    if (w > 0 && w !== ans) wrongs.add(w);
  }
  while (wrongs.size < 3) wrongs.add(ans + wrongs.size + 1);

  const options = shuffle([ans, ...wrongs]);
  return { question: `${x} ${op} ${y} = ?`, answer: ans, options };
}

function fallbackQ() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const ans = a + b;
  const options = shuffle([ans, ans+1, ans+2, Math.max(1,ans-1)]);
  return { question: `${a} + ${b} = ?`, answer: ans, options };
}

function startTimer(correctAns) {
  clearInterval(mathTimerInterval);
  mathTimeLeft = MATH_DURATION;
  mathTimerBar.style.width = '100%';
  mathTimerBar.className = 'timer-bar';
  mathTimerTxt.textContent = '6 detik';

  mathTimerInterval = setInterval(() => {
    mathTimeLeft -= 100;
    const pct = Math.max(0, (mathTimeLeft / MATH_DURATION) * 100);
    mathTimerBar.style.width = `${pct}%`;
    mathTimerTxt.textContent = `${Math.ceil(mathTimeLeft / 1000)} detik`;
    if (pct < 40) mathTimerBar.classList.add('warning');
    if (mathTimeLeft <= 0) {
      clearInterval(mathTimerInterval);
      handleResult(false, null, correctAns);
    }
  }, 100);
}

function pickAnswer(correct, btn, correctAns) {
  clearInterval(mathTimerInterval);
  const btns = mathOptsEl.querySelectorAll('.math-option-btn');
  btns.forEach(b => b.disabled = true);
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    btns.forEach(b => {
      if (+b.textContent === correctAns) b.classList.add('correct');
    });
  }
  setTimeout(() => handleResult(correct, btn, correctAns), 750);
}

function handleResult(correct, btn, correctAns) {
  mathModal.classList.add('hidden');

  if (correct) {
    const bonus = PTS_MATH_BONUS * combo;
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    addScore(bonus, null);
    showFlash(`✅ Benar! +${bonus}`, '#56E87B');
    playTone('correct');
  } else {
    combo = 1;
    showFlash('❌ Salah! Combo reset', '#FF5F5F');
    playTone('wrong');
  }

  comboEl.textContent = `x${combo}`;
  comboEl.className = combo >= 4 ? 'hud-value combo combo-high' : 'hud-value combo';
  updateHUD();
  afterMath();
}

function afterMath() {
  gameActive = true;
  if (pieces.every(p => p === null)) spawnPieces();
  checkGameOver();
}

function afterPlace() {
  if (pieces.every(p => p === null)) spawnPieces();
  checkGameOver();
}

// ─── SCORE & LEVEL ───────────────────────────────────
function addScore(pts, originEl) {
  score += pts;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('mathblast-hs', highScore);
  }
  updateHUD();

  // Score popup
  if (pts > 0) {
    const pop = document.createElement('div');
    pop.className = 'score-popup';
    pop.textContent = `+${pts}`;
    // Position near grid center or random
    const gRect = $('game-grid').getBoundingClientRect();
    pop.style.left = (gRect.left + gRect.width / 2 + (Math.random()-0.5)*100) + 'px';
    pop.style.top  = (gRect.top  + gRect.height/ 2 + (Math.random()-0.5)*60)  + 'px';
    scorePopLayer.appendChild(pop);
    setTimeout(() => pop.remove(), 1200);
  }
}

function showFlash(text, color) {
  resultTxt.textContent = text;
  resultTxt.style.color = color;
  resultTxt.style.borderColor = color + '44';
  resultFlash.classList.remove('hidden');
  setTimeout(() => resultFlash.classList.add('hidden'), 950);
}

function doLevelUp(newLvl) {
  level = newLvl;
  playTone('levelup');
  showFlash(`🆙 Level ${level}!`, '#FFC93C');
  // Flash background briefly
  document.body.style.transition = 'background 0.2s';
  document.body.style.background = '#1a0a30';
  setTimeout(() => { document.body.style.background = ''; }, 300);
}

function updateLevelBar() {
  const inLevel = linesCleared % LINES_PER_LEVEL;
  progressEl.style.width = `${(inLevel / LINES_PER_LEVEL) * 100}%`;
  const toNext = LINES_PER_LEVEL - inLevel;
  nextLvlEl.textContent = level + 1;
  linesToNext.textContent = `${toNext} baris lagi`;
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString('id-ID');
  levelEl.textContent = `Level ${level}`;
  comboEl.textContent = `x${combo}`;
  hsEl.textContent    = highScore.toLocaleString('id-ID');
  linesEl.textContent = linesCleared;
  updateLevelBar();
}

// ─── GAME OVER ───────────────────────────────────────
function checkGameOver() {
  if (pieces.some(p => p && canFitAnywhere(p))) return; // at least one fits
  // No pieces can fit
  setTimeout(showGameOver, 350);
}

function canFitAnywhere(piece) {
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (isValid(piece, r, c)) return true;
  return false;
}

function showGameOver() {
  gameActive = false;
  playTone('gameover');
  const isNew = score > 0 && score >= highScore;

  $('final-score').textContent    = score.toLocaleString('id-ID');
  $('final-high-score').textContent = highScore.toLocaleString('id-ID');
  $('final-lines').textContent    = linesCleared;
  $('final-level').textContent    = level;
  $('final-combo').textContent    = `x${maxCombo}`;

  $('new-record-badge').className = isNew ? 'new-record' : 'new-record hidden';
  $('gameover-emoji').textContent = score > 500 ? '🏆' : score > 200 ? '😎' : '😵';

  gameOverModal.classList.remove('hidden');
}

// ─── INIT GAME ───────────────────────────────────────
function initGame(diff) {
  startDiff = diff || startDiff;
  gridData  = Array.from({length: GRID_SIZE}, () => Array(GRID_SIZE).fill(null));
  score = 0; level = 1; combo = 1; maxCombo = 1; linesCleared = 0;
  hoverR = -1; hoverC = -1;
  gameActive = true; paused = false;
  clearInterval(mathTimerInterval);
  particles = [];

  buildGrid();
  spawnPieces();
  updateHUD();
  gameOverModal.classList.add('hidden');
  mathModal.classList.add('hidden');
  pauseModal.classList.add('hidden');
}

// ─── SCREEN TRANSITIONS ──────────────────────────────
function goGame(diff) {
  screenStart.classList.remove('active');
  screenGame.style.display  = 'flex';
  screenGame.classList.add('active');
  initGame(diff);
}

function goStart() {
  screenGame.style.display = 'none';
  screenGame.classList.remove('active');
  screenStart.classList.add('active');
  gameOverModal.classList.add('hidden');
  mathModal.classList.add('hidden');
  pauseModal.classList.add('hidden');
  startHS.textContent = highScore.toLocaleString('id-ID');
}

function doPause() {
  if (!gameActive && !paused) return;
  paused = true; gameActive = false;
  $('btn-pause').textContent = '▶️';
  pauseModal.classList.remove('hidden');
}

function doResume() {
  paused = false; gameActive = true;
  $('btn-pause').textContent = '⏸️';
  pauseModal.classList.add('hidden');
}

// ─── UTILITIES ───────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── BOOT ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startHS.textContent = highScore.toLocaleString('id-ID');
  initCanvas();
  window.addEventListener('resize', resize);

  // Difficulty selection
  let selDiff = 1;
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selDiff = +btn.dataset.level;
    });
  });

  $('btn-start').addEventListener('click', () => goGame(selDiff));
  $('btn-pause').addEventListener('click', doPause);
  $('btn-resume').addEventListener('click', doResume);

  $('btn-restart').addEventListener('click', () => {
    gameOverModal.classList.add('hidden');
    initGame(startDiff);
  });
  $('btn-home').addEventListener('click', goStart);

  $('btn-restart-pause').addEventListener('click', () => {
    pauseModal.classList.add('hidden');
    initGame(startDiff);
  });
  $('btn-home-pause').addEventListener('click', goStart);
});
