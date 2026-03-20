// ============================================================
// Flower Bounce - Pure HTML5 Canvas 2D Game
// Version: 2.4
// ============================================================

// --- Configuration ---
const CONFIG = {
  WIDTH: 1280,
  HEIGHT: 720,
  // Seesaw
  SEESAW_WIDTH: 220,
  SEESAW_HEIGHT: 18,
  SEESAW_Y: 620,
  SEESAW_COLOR: '#e91e63',
  SEESAW_HIGHLIGHT: '#f48fb1',
  // Character
  CHAR_RADIUS: 20,
  CHAR_SCALE: 1,          // visual scale multiplier for character drawing
  CHAR_COLOR: '#ff7043',
  CHAR_EYE_COLOR: '#fff',
  CHAR_PUPIL_COLOR: '#333',
  // Flowers (dense, no gaps, same style per row, full-row refresh)
  FLOWER_ROWS: 4,
  FLOWER_RADIUS: 16,
  FLOWER_ROW_TOP: 70,
  FLOWER_ROW_SPACING: 44,
  FLOWER_SPEEDS: [1.44, -1.08, 1.32, -1.2],
  FLOWER_ROW_RESPAWN_DELAY: 800, // ms before a cleared row respawns
  // Each row has its own style: [petalColor, centerColor]
  FLOWER_ROW_STYLES: [
    { petal: '#ff6b9d', center: '#ffeb3b', specialPetal: '#cc1155', specialCenter: '#ff8800' },  // Row 1: pink → deep rose
    { petal: '#64b5f6', center: '#fff176', specialPetal: '#1565c0', specialCenter: '#ffab00' },  // Row 2: blue → deep blue
    { petal: '#ce93d8', center: '#ffcc02', specialPetal: '#7b1fa2', specialCenter: '#ff6f00' },  // Row 3: purple → deep purple
    { petal: '#ff8a65', center: '#fff9c4', specialPetal: '#d84315', specialCenter: '#ffd600' },  // Row 4: orange → deep orange
  ],
  FLOWER_SPECIAL_THRESHOLD: 0.3, // spawn special when active < 30%
  // Physics (gravity fixed per frame, not speed-scaled)
  GRAVITY: 0.40,
  BOUNCE_BASE_VY: -25,
  BOUNCE_SPEED_SCALE: 0.35,  // how much speedMultiplier boosts bounce
  BOUNCE_SIDE_VX: 5.0,
  AIR_FRICTION: 0.997,
  // Speed system
  SPEED_INITIAL: 1.2,
  SPEED_INCREMENT: 0.1,
  SPEED_INTERVAL: 2000,
  SPEED_MAX: 2.0,
  SPEED_MAX_HOLD: 4000, // ms to hold at max speed before resetting
  // Combo system
  COMBO_WINDOW: 1500, // ms to continue combo
  // Leaderboard
  MAX_SCORES: 3,
  STORAGE_KEY: 'flowerBounce_topScores',
};

// --- Mobile Detection ---
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  ('ontouchstart' in window && window.innerWidth < 1024);

// Apply mobile overrides: wider seesaw, lower position, more bottom space
if (isMobile) {
  CONFIG.WIDTH = 1600;        // wider canvas for phone aspect ratio (~20:9)
  CONFIG.SEESAW_WIDTH = 280;
  CONFIG.SEESAW_Y = 540;
  CONFIG.GROUND_TOP = CONFIG.HEIGHT - 80;
  CONFIG.SPEED_INITIAL = 0.8;
  CONFIG.SPEED_INCREMENT = 0.1;
  CONFIG.SPEED_MAX = 1.8;
  CONFIG.FLOWER_ROWS = 3;
  CONFIG.FLOWER_SPEEDS = [1.44, -1.08, 1.32];
  CONFIG.CHAR_RADIUS = 20;    // collision radius stays default
  CONFIG.CHAR_SCALE = 1.35;   // visual scale for character on mobile
  CONFIG.FLOWER_RADIUS = 20;  // larger flowers on mobile (default 16)
}

// --- Global State ---
let canvas, ctx;
let scaleX, scaleY, offsetX, offsetY;
let mouseX = CONFIG.WIDTH / 2;
let gameState = 'menu'; // menu, countdown, playing, gameover
let score = 0;
let speedMultiplier = CONFIG.SPEED_INITIAL;
let speedTimer = 0;
let speedHoldTimer = 0; // timer for holding at max speed
let lastTime = 0;
let showSpeedUp = 0;
let muted = false;
let showLeaderboard = false;
let paused = false;
let animFrame = 0;

// Combo system
let combo = 0;
let comboTimer = 0;
let comboPopups = [];  // {x, y, combo, t}
let bestCombo = 0;
let bounceCount = 0;
let lastEatSoundTime = 0; // throttle eat sound to avoid audio spam

// Countdown state
let countdownNum = 0;      // 3, 2, 1 then 0 = GO
let countdownTimer = 0;    // ms until next decrement


// --- Audio Context ---
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // iOS Safari requires resume() after user gesture
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, duration, type = 'sine', vol = 0.15) {
  if (muted || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (_) { /* audio not available */ }
}

function playCatchSound() {
  playTone(523, 0.12, 'sine', 0.18);
  setTimeout(() => playTone(659, 0.1, 'sine', 0.14), 60);
}

function playEatSound() {
  playTone(880, 0.08, 'sine', 0.2);
  setTimeout(() => playTone(1100, 0.1, 'triangle', 0.15), 50);
}

function playMissSound() {
  playTone(200, 0.3, 'sawtooth', 0.12);
  setTimeout(() => playTone(150, 0.4, 'sawtooth', 0.1), 150);
}

function playGameOverSound() {
  playTone(400, 0.2, 'square', 0.1);
  setTimeout(() => playTone(300, 0.2, 'square', 0.1), 200);
  setTimeout(() => playTone(200, 0.5, 'square', 0.12), 400);
}

function playClickSound() {
  playTone(600, 0.06, 'sine', 0.1);
}

function playSpeedUpSound() {
  playTone(700, 0.1, 'triangle', 0.12);
  setTimeout(() => playTone(900, 0.1, 'triangle', 0.12), 100);
  setTimeout(() => playTone(1100, 0.15, 'triangle', 0.1), 200);
}

function playComboSound(comboNum) {
  // Rising pitch with combo
  const baseFreq = 600 + Math.min(comboNum, 10) * 80;
  playTone(baseFreq, 0.1, 'sine', 0.15);
  setTimeout(() => playTone(baseFreq * 1.25, 0.08, 'sine', 0.12), 50);
}

function playCountdownTick(num) {
  // Rising pitch: 3→low, 2→mid, 1→high, GO→chime
  const freqs = { 3: 440, 2: 523, 1: 659, 0: 880 };
  const f = freqs[num] || 880;
  playTone(f, 0.18, 'sine', 0.22);
  if (num === 0) setTimeout(() => playTone(1100, 0.2, 'sine', 0.18), 80); // double-note for GO
}

// --- BGM ---
let bgmInterval = null;
const bgmNotes = [523, 587, 659, 698, 784, 698, 659, 587, 523, 440, 494, 523, 587, 659, 784, 880];
let bgmIndex = 0;

function startBGM() {
  stopBGM();
  bgmIndex = 0;
  bgmInterval = setInterval(() => {
    if (muted || !audioCtx) return;
    playTone(bgmNotes[bgmIndex % bgmNotes.length], 0.25, 'sine', 0.04);
    playTone(bgmNotes[bgmIndex % bgmNotes.length] / 2, 0.25, 'triangle', 0.02);
    bgmIndex++;
  }, 320);
}

function stopBGM() {
  if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

// --- Supabase Online Leaderboard ---
const SUPABASE_URL = 'https://agpnyrstzndyjmhfjcac.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TFePA_YX31tKgjTiBzyuBg_SJgTpTs6';
let sbClient = null;
try {
  if (window.supabase && window.supabase.createClient) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch (e) { console.warn('Supabase init failed:', e); }

// Cached online scores
let onlineScores = [];      // [{name, score, platform, created_at}]
let onlineScoresLoading = false;
let onlineScoresLoaded = false;
let playerName = localStorage.getItem('flowerBounce_name') || '';
let showNameInput = false;   // show name input on game over
let nameInputText = '';
let nameInputCursor = 0;     // blink timer

// Fetch top scores from Supabase (deduplicated: one entry per name, highest score only)
async function fetchOnlineScores() {
  if (!sbClient) return;
  onlineScoresLoading = true;
  try {
    const { data, error } = await sbClient
      .from('scores')
      .select('name, score, platform, created_at')
      .order('score', { ascending: false })
      .limit(100);
    if (!error && data) {
      // Client-side deduplication: keep only the highest score per name
      const seen = new Map();
      const deduped = [];
      for (const entry of data) {
        const key = entry.name || '匿名';
        if (!seen.has(key)) {
          seen.set(key, true);
          deduped.push(entry);
        }
      }
      onlineScores = deduped;
      onlineScoresLoaded = true;
    }
  } catch (e) { console.warn('Fetch scores failed:', e); }
  onlineScoresLoading = false;
}

// Supabase Realtime: subscribe to scores table changes for instant sync
function subscribeToScores() {
  if (!sbClient) return;
  try {
    sbClient
      .channel('scores-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        fetchOnlineScores();
      })
      .subscribe();
  } catch (e) { console.warn('Realtime subscribe failed:', e); }
}

// Fallback poll every 10s in case Realtime is not available
let _scoresPollTimer = 0;
const SCORES_POLL_INTERVAL = 10000;

function pollOnlineScores(dt) {
  const shouldPoll = true; // always poll while page is open
  if (!shouldPoll) {
    _scoresPollTimer = 0;
    return;
  }
  _scoresPollTimer += dt;
  if (_scoresPollTimer >= SCORES_POLL_INTERVAL) {
    _scoresPollTimer = 0;
    fetchOnlineScores();
  }
}

// Submit score to Supabase (always INSERT; client-side dedup keeps highest per name)
// Avoids UPDATE/DELETE which may be blocked by Supabase RLS
async function submitOnlineScore(name, scoreVal) {
  if (!sbClient) return;
  const playerNameStr = name || '匿名';
  const platform = isMobile ? 'mobile' : 'desktop';
  const now = new Date().toISOString();
  try {
    // Check if this player already has a higher score in DB
    const { data: existing, error: fetchErr } = await sbClient
      .from('scores')
      .select('score')
      .eq('name', playerNameStr)
      .order('score', { ascending: false })
      .limit(1);

    const bestDbScore = (!fetchErr && existing && existing.length > 0) ? existing[0].score : -1;

    // Only insert if this score is higher than what's already in DB
    if (scoreVal > bestDbScore) {
      const { error: insertErr } = await sbClient.from('scores').insert({
        name: playerNameStr, score: scoreVal, platform, created_at: now
      });
      if (insertErr) console.warn('Insert score failed:', insertErr);
    }
    await fetchOnlineScores();
  } catch (e) { console.warn('Submit score failed:', e); }
}

// Local fallback (also keep local top 3)
function getTopScores() {
  try {
    const data = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY));
    if (Array.isArray(data)) return data.slice(0, CONFIG.MAX_SCORES);
  } catch (e) {}
  return [];
}

function saveScore(s) {
  const scores = getTopScores();
  scores.push(s);
  scores.sort((a, b) => b - a);
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(scores.slice(0, CONFIG.MAX_SCORES)));
}

// --- Seesaw ---
const seesaw = {
  x: CONFIG.WIDTH / 2,
  y: CONFIG.SEESAW_Y,
  w: CONFIG.SEESAW_WIDTH,
  h: CONFIG.SEESAW_HEIGHT,
  tilt: 0,
  draw(ctx) {
    const hw = this.w / 2;
    // Base/pivot
    ctx.fillStyle = '#ad1457';
    ctx.beginPath();
    ctx.moveTo(this.x - 14, this.y + this.h + 8);
    ctx.lineTo(this.x + 14, this.y + this.h + 8);
    ctx.lineTo(this.x, this.y + 2);
    ctx.closePath();
    ctx.fill();
    // Board
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt * 0.04);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    roundRect(ctx, -hw - 2, 2, this.w + 4, this.h + 2, 8);
    ctx.fill();
    // Main board
    const grad = ctx.createLinearGradient(-hw, 0, hw, 0);
    grad.addColorStop(0, '#f48fb1');
    grad.addColorStop(0.5, CONFIG.SEESAW_COLOR);
    grad.addColorStop(1, '#f48fb1');
    ctx.fillStyle = grad;
    roundRect(ctx, -hw, 0, this.w, this.h, 8);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, -hw + 4, 2, this.w - 8, 6, 3);
    ctx.fill();
    ctx.restore();
  },
  update() {
    const target = Math.max(this.w / 2, Math.min(CONFIG.WIDTH - this.w / 2, mouseX));
    this.x += (target - this.x) * 0.45;
    // Tilt toward the side with a sitting character
    let targetTilt = 0;
    chars.forEach(c => {
      if (c.state === 'sitting') {
        targetTilt = c.sittingEnd === 'left' ? -1 : 1;
      }
    });
    this.tilt += (targetTilt - this.tilt) * 0.15;
  }
};

// --- Character Class (dual characters with person appearance) ---
// Character styles: boy and girl (cute simple line-art)
const CHAR_STYLES = [
  { top: '#5dade2', hair: '#6d4c2a', skin: '#fddcb5', pants: '#3b82c4', shoes: '#444', gender: 'boy' },
  { top: '#f48fb1', hair: '#4a2c18', skin: '#fde3cb', pants: '#ec407a', shoes: '#a1665e', gender: 'girl' },
];

class Character {
  constructor(id) {
    this.id = id;
    this.style = CHAR_STYLES[id];
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.state = 'inactive'; // inactive, waiting, falling, bounced, flying, missed, sitting
    this.sittingEnd = null; // 'left' or 'right' when sitting on seesaw
    this.trail = [];
    this.squash = 0;
    this.armAnim = 0;
    this._sameEndMiss = false;
    this._footBounceCount = 0; // feet-hit bounces this launch (max 3, reset on seesaw launch)
    // Chain eat state
    this._chainQueue = [];  // [{row, index}]
    this._chainDir = 0;     // -1 left, +1 right
  }

  reset(startX, startY) {
    this.x = startX;
    this.y = startY;
    this.vx = 0;
    this.vy = 0;
    this.state = 'falling';
    this.sittingEnd = null;
    this.trail = [];
    this.squash = 0;
    this.armAnim = 0;
    this._sameEndMiss = false;
    this._chainQueue = [];
    this._chainDir = 0;
  }

  setWaiting(x, y) {
    this.x = x;
    this.y = y || 25;
    this.vx = 0;
    this.vy = 0;
    this.state = 'waiting';
    this.trail = [];
    this._sameEndMiss = false;
    this._chainQueue = [];
    this._chainDir = 0;
  }

  launch() {
    if (this.state === 'waiting') {
      this.state = 'falling';
      this._sameEndMiss = false;
    }
  }

  sitOnEnd(end) {
    this.state = 'sitting';
    this.sittingEnd = end;
    this.vx = 0;
    this.vy = 0;
    this.trail = [];
    this._sameEndMiss = false;
    this._chainQueue = [];
    this._chainDir = 0;
    this.y = seesaw.y - CONFIG.CHAR_RADIUS;
  }

  launchFromSeesaw(landingDx) {
    bounceCount++;
    const bounceBoost = 1 + CONFIG.BOUNCE_SPEED_SCALE * (speedMultiplier - 1);
    const hw = seesaw.w / 2;

    // Base vertical velocity
    this.vy = CONFIG.BOUNCE_BASE_VY * bounceBoost;

    // Horizontal velocity depends on landing position offset
    // landingDx > 0 means lander hit right side -> sitting char (on opposite side) flies more to the left
    // The further from center the landing, the more horizontal the bounce
    const edgeFactor = Math.abs(landingDx || 0); // 0~1, 0=center, 1=edge
    const dirSign = this.sittingEnd === 'left' ? -1 : 1;
    // Center landing: mostly vertical (vx small). Edge landing: more angled (vx large)
    const baseVx = CONFIG.BOUNCE_SIDE_VX * speedMultiplier;
    this.vx = dirSign * baseVx * (0.2 + edgeFactor * 0.8);
    // Edge landing also gives slightly less vertical power (more angled trajectory)
    this.vy *= (1.0 - edgeFactor * 0.15);

    this.state = 'bounced';
    this.sittingEnd = null;
    this.squash = 1;
    this._sameEndMiss = false;
    this._footBounceCount = 0; // reset foot-bounce counter on seesaw launch
    playCatchSound();
    particles.push(...createParticles(this.x, this.y, 5, this.style.top));
  }

  update(dt) {
    // Sitting character smoothly follows seesaw end position
    if (this.state === 'sitting') {
      const hw = seesaw.w / 2;
      const targetX = seesaw.x + (this.sittingEnd === 'left' ? -hw * 0.6 : hw * 0.6);
      // Smooth lerp to sitting position (no teleport)
      this.x += (targetX - this.x) * 0.25;
      this.y = seesaw.y - CONFIG.CHAR_RADIUS;
      return;
    }

    if (this.state === 'inactive' || this.state === 'waiting') return;

    // Deferred game-over after miss
    if (this.state === 'missed') {
      if (this._missTimer !== undefined) {
        this._missTimer -= 16;
        if (this._missTimer <= 0) {
          this._missTimer = undefined;
          if (!gameOverTriggered) { playGameOverSound(); gameOver(); }
        }
      }
      return;
    }

    const vScale = 1 + (speedMultiplier - 1) * 0.1; // vertical speed scales at 10% of multiplier
    this.vy += CONFIG.GRAVITY * vScale;
    this.vx *= CONFIG.AIR_FRICTION;
    this.x += this.vx * speedMultiplier;
    this.y += this.vy * vScale;

    // Wall bounce
    if (this.x < CONFIG.CHAR_RADIUS) { this.x = CONFIG.CHAR_RADIUS; this.vx = Math.abs(this.vx) * 0.6; }
    if (this.x > CONFIG.WIDTH - CONFIG.CHAR_RADIUS) { this.x = CONFIG.WIDTH - CONFIG.CHAR_RADIUS; this.vx = -Math.abs(this.vx) * 0.6; }
    // Ceiling bounce
    if (this.y < CONFIG.CHAR_RADIUS) { this.y = CONFIG.CHAR_RADIUS; this.vy = Math.abs(this.vy) * 0.3; }

    // Trail
    this.trail.push({ x: this.x, y: this.y, a: 1 });
    if (this.trail.length > 10) this.trail.shift();
    this.trail.forEach(t => t.a *= 0.82);

    this.squash *= 0.85;
    this.armAnim += 0.12;

    // State transitions (else-if prevents double-jump in one frame)
    if (this.state === 'bounced' && this.vy > 0) this.state = 'flying';
    else if (this.vy > 0 && this.state === 'flying') this.state = 'falling';

    // Seesaw collision - detect which end (left or right) the character lands on
    // Skip collision if already flagged as same-end miss (falling through)
    if (this.vy > 0 && this.state !== 'bounced' && !this._sameEndMiss) {
      const dx = this.x - seesaw.x;
      // Use sweep test: check both current and previous position to prevent tunneling
      const feetY = this.y + CONFIG.CHAR_RADIUS;
      const prevFeetY = feetY - this.vy; // where feet were last frame
      const seesawTop = seesaw.y;
      const hitHalfW = seesaw.w / 2 + CONFIG.CHAR_RADIUS;
      // Character crosses seesaw level this frame, or is within range
      const crossedSeesaw = (prevFeetY <= seesawTop + 4 && feetY >= seesawTop - 4);
      const inRange = (feetY >= seesawTop - 4 && feetY < seesawTop + 40);
      if ((crossedSeesaw || inRange) && Math.abs(dx) < hitHalfW) {
        // Determine which end: left or right based on position relative to seesaw center
        let landEnd = dx < 0 ? 'left' : 'right';

        // Find the other character
        const other = chars[1 - this.id];

        // When the other character is sitting:
        // - Land on empty end ONLY if character is on that side (or near center)
        // - Miss if character clearly lands on the occupied side
        if (other.state === 'sitting') {
          const emptyEnd = other.sittingEnd === 'left' ? 'right' : 'left';
          const emptyDir = emptyEnd === 'left' ? -1 : 1;
          const dxTowardEmpty = dx * emptyDir; // positive = toward empty end

          if (dxTowardEmpty >= -seesaw.w * 0.08) {
            // Character is on empty side or very close to center → land on empty end
            landEnd = emptyEnd;
          } else {
            // Character is clearly on the occupied side → fall through
            this.vy = Math.max(this.vy, 3);
            playMissSound();
            this._sameEndMiss = true;
            return;
          }
        }

        // Land on this end - sit down
        this.y = seesaw.y - CONFIG.CHAR_RADIUS;
        this.sitOnEnd(landEnd);

        // If other character is sitting on opposite end, launch them
        if (other.state === 'sitting' && other.sittingEnd !== landEnd) {
          // Pass normalized landing offset (0=center, 1=edge) for angle calculation
          const landingDx = Math.min(1, Math.abs(dx) / (seesaw.w / 2));
          other.launchFromSeesaw(landingDx);
        }
        return;
      }
    }

    // Miss check — character fell off screen
    if (this.y > CONFIG.HEIGHT + 50) {
      this.state = 'missed';
      this._missTimer = 300;
      playMissSound();
      return;
    }

    // --- Chain eat slide update ---
    if (this._chainQueue.length > 0) {
      const next = this._chainQueue[0];
      const row = next.row;
      // Move with row scroll to stay aligned
      this.x += row.baseSpeed * speedMultiplier * 0.7;
      const targetPos = row.getFlowerPos(next.index);
      const slideSpeed = Math.max(6, Math.abs(this._preChainVx || 6));

      // Abort if invalid or wrapped
      if (!targetPos || !isFinite(targetPos.x) || !isFinite(targetPos.y) ||
          this.x <= CONFIG.CHAR_RADIUS + 4 || this.x >= CONFIG.WIDTH - CONFIG.CHAR_RADIUS - 4) {
        this._chainQueue = [];
        this.vx = (this._preChainVx || this._chainDir * 2.5) * 0.8;
        this.vy = 1.5; // gentle fixed drop, avoid sudden speed burst
        return;
      }

      this.y = row.y;
      const dxToTarget = targetPos.x - this.x;

      if (!isFinite(dxToTarget) || Math.abs(dxToTarget) > CONFIG.WIDTH / 2) {
        this._chainQueue = [];
        this.vx = (this._preChainVx || this._chainDir * 2.5) * 0.8;
        this.vy = 1.5; // gentle fixed drop, avoid sudden speed burst
        return;
      }

      if (Math.abs(dxToTarget) <= slideSpeed + 2) {
        this.x = targetPos.x;
        this._chainQueue.shift();
        if (row.active[next.index]) {
          row.eat(next.index);
          combo++;
          comboTimer = CONFIG.COMBO_WINDOW;
          if (combo > bestCombo) bestCombo = combo;
          score += 1 + Math.floor(combo / 5);
          const now = performance.now();
          if (now - lastEatSoundTime > 80) { playEatSound(); lastEatSoundTime = now; }
        }
      } else {
        this.x += Math.sign(dxToTarget) * slideSpeed;
      }

      // Trail
      this.trail.push({ x: this.x, y: this.y, a: 1 });
      if (this.trail.length > 10) this.trail.shift();
      this.trail.forEach(t => t.a *= 0.82);
      this.armAnim += 0.2;

      if (this._chainQueue.length === 0) {
        this.vx = (this._preChainVx || this._chainDir * 2.5) * 0.8;
        this.vy = 1.5; // gentle fixed drop, avoid sudden speed burst
      }
      return; // skip normal physics while chaining
    }

    // --- Pass-through chain eat ---
    // Trigger: rising (vy<0), passed through gap in lower row, reached upper row,
    // lower row has flowers blocking fall-back. Requires bounceCount > 5.
    if (bounceCount > 5 && this.vy < 0) {
      for (let ri = 0; ri < flowerRows.length - 1; ri++) {
        const row = flowerRows[ri];         // current (upper) row
        const lowerRow = flowerRows[ri + 1]; // row below
        const dyToRow = Math.abs(this.y - row.y);
        if (dyToRow > CONFIG.FLOWER_RADIUS + CONFIG.CHAR_RADIUS * 0.5) continue;

        // Must have risen through a gap in the lower row
        if (lowerRow.hasFlowerNearX(this.x)) continue;
        // Lower row must have flowers nearby that block falling back
        if (!lowerRow.hasFlowerNearX(this.x + 20) && !lowerRow.hasFlowerNearX(this.x - 20)) continue;

        // Find adjacent active flowers in movement direction on current row
        const moveDir = (this.vx >= 0) ? 1 : -1;
        const totalWidth = row.count * row.diameter;
        let closestIdx = -1;
        let closestDist = Infinity;
        for (let i = 0; i < row.count; i++) {
          if (!row.active[i]) continue;
          let fx = i * row.diameter + row.diameter / 2 + row.offset;
          fx = ((fx % totalWidth) + totalWidth) % totalWidth - row.diameter;
          const d = (fx - this.x) * moveDir;
          if (d > 0 && d < closestDist) {
            closestDist = d;
            closestIdx = i;
          }
        }
        if (closestIdx < 0 || closestDist > row.diameter * 2) continue;

        const adj = [closestIdx, ...row.getAdjacentActive(closestIdx, moveDir)];
        if (adj.length < 2) continue; // need at least 2 consecutive flowers

        // Probability decay: 80% initial, ×0.80 per flower, max 30
        const maxChain = Math.min(adj.length, 30);
        let chainCount = 0;
        let prob = 0.80;
        for (let ci = 0; ci < maxChain; ci++) {
          if (Math.random() > prob) break;
          chainCount++;
          prob *= 0.80;
        }

        if (chainCount > 0) {
          this._chainDir = moveDir;
          this._preChainVx = this.vx;
          this._preChainVy = this.vy;
          this.vy = 0;
          this.vx = 0;
          this.y = row.y;
          this._chainQueue = adj.slice(0, chainCount).map(idx => ({ row, index: idx }));
          return;
        }
      }
    }

    // Flower collision with directional bounce rules:
    // - Rising + flower directly above (head hit) → eat + immediately fall
    // - Falling + flower directly below (feet hit) → eat + bounce up to row above
    // - Other angles → eat only, no velocity change
    for (let ri = 0; ri < flowerRows.length; ri++) {
      const row = flowerRows[ri];
      const hitIdx = row.checkCollision(this.x, this.y, CONFIG.CHAR_RADIUS);
      if (hitIdx < 0) continue;

      const flowerPos = row.getFlowerPos(hitIdx);
      row.eat(hitIdx);
      combo++;
      comboTimer = CONFIG.COMBO_WINDOW;
      if (combo > bestCombo) bestCombo = combo;
      const basePoints = (ri <= 1) ? 2 : 1; // top 2 rows = 2 points
      const points = basePoints + Math.floor(combo / 5);
      score += points;

      // Throttled eat sound
      const now = performance.now();
      if (now - lastEatSoundTime > 80) {
        playEatSound();
        lastEatSoundTime = now;
      }

      // Determine hit direction: is flower directly above or below?
      const dx = Math.abs(this.x - flowerPos.x);
      const dy = this.y - row.y; // positive = character below flower, negative = above
      const isVerticalHit = dx < CONFIG.FLOWER_RADIUS * 1.2; // roughly aligned horizontally

      if (isVerticalHit) {
        if (this.vy < 0 && dy > 0) {
          // Rising + flower above head → force immediate fall
          this.vy = Math.max(2, Math.abs(this.vy) * 0.2);
          this.y = row.y + CONFIG.CHAR_RADIUS + CONFIG.FLOWER_RADIUS; // push below
        } else if (this.vy > 0 && dy < 0 && this._footBounceCount < 3) {
          // Falling + flower below feet → bounce up to previous row height (max 3 per launch)
          this._footBounceCount++;
          // First bounce: decay to 80% original speed, then hold
          if (this._footBounceCount === 1) {
            this.vx = this.vx * 0.8;
          }
          const bounceHeight = CONFIG.FLOWER_ROW_SPACING;
          const bounceVy = Math.sqrt(2 * CONFIG.GRAVITY * bounceHeight);
          this.vy = -bounceVy;
          this.y = row.y - CONFIG.CHAR_RADIUS - CONFIG.FLOWER_RADIUS;
        }
      }

      // --- Random bottom-row chain eat: 15% chance if adjacent flowers, max 8 ---
      if (bounceCount > 5 && ri === flowerRows.length - 1) {
        const moveDir = (this.vx >= 0) ? 1 : -1;
        const adj = row.getAdjacentActive(hitIdx, moveDir);
        if (adj.length >= 1 && Math.random() < 0.15) {
          const maxChain = Math.min(adj.length, 8);
          let chainCount = 0;
          let prob = 0.80;
          for (let ci = 0; ci < maxChain; ci++) {
            if (Math.random() > prob) break;
            chainCount++;
            prob *= 0.80;
          }
          if (chainCount > 0) {
            this._chainDir = moveDir;
            this._preChainVx = this.vx;
            this._preChainVy = this.vy;
            this.vy = 0;
            this.vx = 0;
            this.y = row.y;
            this._chainQueue = adj.slice(0, chainCount).map(idx => ({ row, index: idx }));
          }
        }
      }

      break; // only hit one row per frame
    }
  }

  draw(ctx) {
    if (this.state === 'inactive') return;
    const s = this.style;
    const isWaiting = this.state === 'waiting';

    // Trail
    this.trail.forEach(t => {
      ctx.globalAlpha = t.a * 0.1;
      ctx.fillStyle = s.top;
      ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = isWaiting ? 0.5 : 1;

    const baseScale = CONFIG.CHAR_SCALE;
    const scX = baseScale * (1 + this.squash * 0.25);
    const scY = baseScale * (1 - this.squash * 0.18);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(scX, scY);

    const isFalling = this.state === 'falling' || this.state === 'flying';
    const isBounced = this.state === 'bounced';
    const isBoy = s.gender === 'boy';
    const O = '#3a2a1a'; // outline color
    const OW = 1.6;      // outline width
    const headR = 11;
    const headY = -15;

    // -------- LEGS --------
    const la = isFalling ? Math.sin(this.armAnim * 0.7) * 4 : 0;
    if (isBoy) {
      // Short pants legs
      ctx.fillStyle = s.pants;
      roundRect(ctx, -6 - la * 0.2, 8, 5, 8, 2); ctx.fill();
      roundRect(ctx, 1 + la * 0.2, 8, 5, 8, 2); ctx.fill();
      // Skin below shorts
      ctx.strokeStyle = s.skin;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-3.5 - la * 0.2, 16); ctx.lineTo(-4 - la, 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3.5 + la * 0.2, 16); ctx.lineTo(4 + la, 20);  ctx.stroke();
    } else {
      // Skin legs under skirt
      ctx.strokeStyle = s.skin;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-3, 13); ctx.lineTo(-4 - la, 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 13);  ctx.lineTo(4 + la, 20);  ctx.stroke();
    }
    // Shoes (simple ovals)
    ctx.fillStyle = s.shoes;
    ctx.beginPath(); ctx.ellipse(-4.5 - la, 21, 4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4.5 + la, 21, 4, 2.2, 0, 0, Math.PI * 2);  ctx.fill();
    // Shoe outline
    ctx.strokeStyle = O; ctx.lineWidth = OW * 0.7;
    ctx.beginPath(); ctx.ellipse(-4.5 - la, 21, 4, 2.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(4.5 + la, 21, 4, 2.2, 0, 0, Math.PI * 2);  ctx.stroke();

    // -------- BODY --------
    ctx.fillStyle = s.top;
    roundRect(ctx, -8, -5, 16, 14, 4); ctx.fill();
    // Outline
    ctx.strokeStyle = O; ctx.lineWidth = OW;
    roundRect(ctx, -8, -5, 16, 14, 4); ctx.stroke();

    // Girl: skirt over body bottom
    if (!isBoy) {
      ctx.fillStyle = s.pants;
      ctx.beginPath();
      ctx.moveTo(-9, 5); ctx.lineTo(9, 5);
      ctx.lineTo(11, 15); ctx.lineTo(-11, 15);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = O; ctx.lineWidth = OW;
      ctx.beginPath();
      ctx.moveTo(-9, 5); ctx.lineTo(-11, 15); ctx.lineTo(11, 15); ctx.lineTo(9, 5);
      ctx.stroke();
      // Skirt pleat lines
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-4, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 6);  ctx.lineTo(4, 14);  ctx.stroke();
    }

    // -------- ARMS --------
    const armS = isFalling ? Math.sin(this.armAnim) * 10 : (isBounced ? -12 : 3);
    ctx.strokeStyle = s.top; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, 1); ctx.lineTo(-14, 1 + armS); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, 1);  ctx.lineTo(14, 1 - armS);  ctx.stroke();
    // Hands
    ctx.fillStyle = s.skin;
    ctx.beginPath(); ctx.arc(-14, 1 + armS, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, 1 - armS, 2.5, 0, Math.PI * 2);  ctx.fill();
    ctx.strokeStyle = O; ctx.lineWidth = OW * 0.7;
    ctx.beginPath(); ctx.arc(-14, 1 + armS, 2.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(14, 1 - armS, 2.5, 0, Math.PI * 2);  ctx.stroke();

    // -------- HEAD --------
    // Face circle
    ctx.fillStyle = s.skin;
    ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
    // Face outline
    ctx.strokeStyle = O; ctx.lineWidth = OW;
    ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.stroke();

    // -------- HAIR --------
    ctx.fillStyle = s.hair;
    if (isBoy) {
      // Short neat hair on top half
      ctx.beginPath();
      ctx.arc(0, headY, headR + 1, Math.PI + 0.5, -0.5);
      ctx.closePath(); ctx.fill();
      // Outline
      ctx.strokeStyle = O; ctx.lineWidth = OW;
      ctx.beginPath(); ctx.arc(0, headY, headR + 1, Math.PI + 0.5, -0.5); ctx.stroke();
      // Simple fringe strands
      ctx.strokeStyle = O; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-4, headY - headR); ctx.lineTo(-3, headY - 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, headY - headR - 1); ctx.lineTo(1, headY - 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, headY - headR); ctx.lineTo(4, headY - 6); ctx.stroke();
    } else {
      // Girl: top hair
      ctx.beginPath();
      ctx.arc(0, headY, headR + 1.5, Math.PI + 0.3, -0.3);
      ctx.closePath(); ctx.fill();
      // Curly shoulder-length sides
      const cw = Math.sin(this.armAnim * 0.4) * 1;
      // Left curls
      ctx.beginPath();
      ctx.moveTo(-headR, headY);
      ctx.quadraticCurveTo(-headR - 4 + cw, headY + 8, -headR - 1 - cw, headY + 16);
      ctx.quadraticCurveTo(-headR + 2, headY + 18, -headR + 3, headY + 14);
      ctx.quadraticCurveTo(-headR + 1 + cw, headY + 8, -headR + 2, headY + 2);
      ctx.closePath(); ctx.fill();
      // Right curls
      ctx.beginPath();
      ctx.moveTo(headR, headY);
      ctx.quadraticCurveTo(headR + 4 - cw, headY + 8, headR + 1 + cw, headY + 16);
      ctx.quadraticCurveTo(headR - 2, headY + 18, headR - 3, headY + 14);
      ctx.quadraticCurveTo(headR - 1 - cw, headY + 8, headR - 2, headY + 2);
      ctx.closePath(); ctx.fill();
      // Hair outline
      ctx.strokeStyle = O; ctx.lineWidth = OW;
      ctx.beginPath(); ctx.arc(0, headY, headR + 1.5, Math.PI + 0.3, -0.3); ctx.stroke();
      // Curl outlines
      ctx.beginPath();
      ctx.moveTo(-headR, headY);
      ctx.quadraticCurveTo(-headR - 4 + cw, headY + 8, -headR - 1 - cw, headY + 16);
      ctx.quadraticCurveTo(-headR + 2, headY + 18, -headR + 3, headY + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(headR, headY);
      ctx.quadraticCurveTo(headR + 4 - cw, headY + 8, headR + 1 + cw, headY + 16);
      ctx.quadraticCurveTo(headR - 2, headY + 18, headR - 3, headY + 14);
      ctx.stroke();
      // Fringe
      ctx.fillStyle = s.hair;
      ctx.beginPath();
      ctx.moveTo(-8, headY - 5);
      ctx.quadraticCurveTo(-4, headY - 2, 0, headY - 6);
      ctx.quadraticCurveTo(4, headY - 2, 8, headY - 5);
      ctx.lineTo(9, headY - 9); ctx.lineTo(-9, headY - 9);
      ctx.closePath(); ctx.fill();
    }

    // -------- FACE --------
    // Cheeks
    ctx.fillStyle = 'rgba(255,120,120,0.3)';
    ctx.beginPath(); ctx.ellipse(-6, headY + 3, 2.8, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6, headY + 3, 2.8, 1.8, 0, 0, Math.PI * 2);  ctx.fill();

    // Eyes (small round dots with shine)
    const pdx = Math.sign(this.vx || 0) * 0.6;
    const pdy = this.vy > 0 ? 0.5 : -0.4;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(-4 + pdx, headY - 0.5 + pdy, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + pdx, headY - 0.5 + pdy, 1.8, 0, Math.PI * 2);  ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-3.5 + pdx, headY - 1.2 + pdy, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4.5 + pdx, headY - 1.2 + pdy, 0.6, 0, Math.PI * 2);  ctx.fill();

    // Mouth
    ctx.strokeStyle = '#8a4535';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (this.state === 'missed') {
      ctx.arc(0, headY + 6, 2, 0.3, Math.PI - 0.3, true);
    } else if (isBounced) {
      ctx.arc(0, headY + 5, 2.5, 0.1, Math.PI - 0.1);
    } else {
      ctx.arc(0, headY + 5, 1.8, 0.2, Math.PI - 0.2);
    }
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// --- Dual Character System ---
const chars = [new Character(0), new Character(1)];
let dropTimer = 0;
let dropCharId = -1;
let gameOverTriggered = false;


function switchCharPositions() {
  // Find the sitting character and swap it to the other end of the seesaw
  for (const c of chars) {
    if (c.state === 'sitting') {
      const oldEnd = c.sittingEnd;
      const newEnd = oldEnd === 'left' ? 'right' : 'left';
      // Check the other character isn't sitting on the target end
      const other = chars[1 - c.id];
      if (other.state === 'sitting' && other.sittingEnd === newEnd) {
        // Can't swap - play error feedback
        playTone(200, 0.1, 'square', 0.08);
        screenShake = 1;
        return;
      }
      c.sittingEnd = newEnd;
      // Immediately update position (don't wait for next frame)
      const hw = seesaw.w / 2;
      c.x = seesaw.x + (newEnd === 'left' ? -hw * 0.6 : hw * 0.6);
      c.y = seesaw.y - CONFIG.CHAR_RADIUS;
      // Visual feedback
      particles.push(...createParticles(c.x, c.y, 4, c.style.top));
      playTone(500, 0.08, 'sine', 0.12);
      screenShake = 2;
      return;
    }
  }
}

function updateChars(dt) {
  // Drop timer for second character
  if (dropTimer > 0) {
    dropTimer -= dt;
    if (dropTimer <= 0 && dropCharId >= 0) {
      const c = chars[dropCharId];
      if (c.state === 'waiting') c.launch();
      dropCharId = -1;
    }
  }
  chars.forEach(c => c.update(dt));
}


// --- Flowers (dense rows, same style per row, full-row refresh) ---
let flowerRows = []; // array of FlowerRow objects

class FlowerRow {
  constructor(rowIndex) {
    this.rowIndex = rowIndex;
    this.y = CONFIG.FLOWER_ROW_TOP + rowIndex * CONFIG.FLOWER_ROW_SPACING;
    this.baseSpeed = CONFIG.FLOWER_SPEEDS[rowIndex] || 1;
    this.style = CONFIG.FLOWER_ROW_STYLES[rowIndex] || CONFIG.FLOWER_ROW_STYLES[0];
    this.offset = 0; // horizontal scroll offset
    // Calculate count: fill screen width with no gaps (diameter = 2*radius)
    const diameter = CONFIG.FLOWER_RADIUS * 2;
    this.count = Math.ceil(CONFIG.WIDTH / diameter) + 2; // +2 for seamless wrap
    this.diameter = diameter;
    // Per-flower active state
    this.active = new Array(this.count).fill(true);
    this.special = new Array(this.count).fill(false); // special flower flags
    this.specialSpawned = false; // whether a special flower exists in this row
    this._activeCount = this.count; // cached active count
    this.respawnTimer = 0;
    this.respawning = false;
  }

  resetRow() {
    this.active.fill(true);
    this.special.fill(false);
    this.specialSpawned = false;
    this._activeCount = this.count;
    this.respawning = false;
    this.respawnTimer = 0;
  }

  allEaten() {
    return this.active.every(a => !a);
  }

  eat(index) {
    const wasSpecial = this.special[index];
    this.active[index] = false;
    this.special[index] = false;
    this._activeCount--;
    const pos = this.getFlowerPos(index);
    const particleColor = wasSpecial ? this.style.specialPetal : this.style.petal;
    particles.push(...createParticles(pos.x, pos.y, wasSpecial ? 12 : 6, particleColor));
    // If special flower eaten, refresh entire row
    if (wasSpecial) {
      this.resetRow();
      return true; // signal: was special
    }
    // Check if whole row is cleared
    if (this.allEaten() && !this.respawning) {
      this.respawning = true;
      this.respawnTimer = CONFIG.FLOWER_ROW_RESPAWN_DELAY;
    }
    return false;
  }

  getFlowerPos(index) {
    let x = index * this.diameter + this.diameter / 2 + this.offset;
    // Wrap into visible range with seamless tiling
    const totalWidth = this.count * this.diameter;
    x = ((x % totalWidth) + totalWidth) % totalWidth - this.diameter;
    return { x, y: this.y };
  }

  activeCount() {
    return this._activeCount;
  }

  update(dt) {
    this.offset += this.baseSpeed * speedMultiplier * 0.7;
    // Handle row respawn
    if (this.respawning) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.resetRow();
      }
    }
    // Spawn special flower when active < 30% and no special exists
    if (!this.specialSpawned && !this.respawning) {
      const ratio = this.activeCount() / this.count;
      if (ratio > 0 && ratio < CONFIG.FLOWER_SPECIAL_THRESHOLD) {
        // Find an inactive slot near the edge (entering from scroll direction)
        const enterFromRight = this.baseSpeed > 0;
        const start = enterFromRight ? this.count - 1 : 0;
        const step = enterFromRight ? -1 : 1;
        for (let i = start; i >= 0 && i < this.count; i += step) {
          if (!this.active[i]) {
            this.active[i] = true;
            this.special[i] = true;
            this.specialSpawned = true;
            this._activeCount++;
            break;
          }
        }
      }
    }
  }

  draw(ctx) {
    const r = CONFIG.FLOWER_RADIUS;
    const totalWidth = this.count * this.diameter;
    const bob = Math.sin(animFrame * 0.03 + this.rowIndex) * 2;
    const y = this.y + bob;
    const petalCount = 6;
    const normalSpin = animFrame * 0.008;
    const specialSpin = animFrame * 0.04;
    const petalRx = r * 0.44;
    const petalRy = r * 0.34;
    const petalDist = r * 0.58;
    const centerR = r * 0.35;
    const highlightR = r * 0.15;

    // Collect visible flower positions, split by normal/special
    const normals = [];
    const specials = [];
    for (let i = 0; i < this.count; i++) {
      if (!this.active[i]) continue;
      let x = i * this.diameter + this.diameter / 2 + this.offset;
      x = ((x % totalWidth) + totalWidth) % totalWidth - this.diameter;
      if (x < -r * 2 || x > CONFIG.WIDTH + r * 2) continue;
      (this.special[i] ? specials : normals).push(x);
    }

    // --- Draw normal flowers (batched) ---
    if (normals.length > 0) {
      // Petals
      ctx.fillStyle = this.style.petal;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      for (let fi = 0; fi < normals.length; fi++) {
        const x = normals[fi];
        for (let p = 0; p < petalCount; p++) {
          const angle = (p / petalCount) * Math.PI * 2 + normalSpin;
          const px = x + Math.cos(angle) * petalDist;
          const py = y + Math.sin(angle) * petalDist;
          ctx.moveTo(px + petalRx, py);
          ctx.ellipse(px, py, petalRx, petalRy, angle, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      // Centers
      ctx.fillStyle = this.style.center;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let fi = 0; fi < normals.length; fi++) {
        const x = normals[fi];
        ctx.moveTo(x + centerR, y);
        ctx.arc(x, y, centerR, 0, Math.PI * 2);
      }
      ctx.fill();

      // Highlights
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      for (let fi = 0; fi < normals.length; fi++) {
        const x = normals[fi];
        ctx.moveTo(x - 1.5 + highlightR, y - 1.5);
        ctx.arc(x - 1.5, y - 1.5, highlightR, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // --- Draw special flowers (fewer, separate batch) ---
    if (specials.length > 0) {
      // Glow
      ctx.fillStyle = this.style.specialPetal;
      ctx.globalAlpha = 0.2 + Math.sin(animFrame * 0.08) * 0.08;
      ctx.beginPath();
      for (let fi = 0; fi < specials.length; fi++) {
        const x = specials[fi];
        ctx.moveTo(x + r * 1.05, y);
        ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
      }
      ctx.fill();

      // Petals
      ctx.fillStyle = this.style.specialPetal;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let fi = 0; fi < specials.length; fi++) {
        const x = specials[fi];
        for (let p = 0; p < petalCount; p++) {
          const angle = (p / petalCount) * Math.PI * 2 + specialSpin;
          const px = x + Math.cos(angle) * petalDist;
          const py = y + Math.sin(angle) * petalDist;
          ctx.moveTo(px + petalRx, py);
          ctx.ellipse(px, py, petalRx, petalRy, angle, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      // Centers
      ctx.fillStyle = this.style.specialCenter;
      ctx.beginPath();
      for (let fi = 0; fi < specials.length; fi++) {
        const x = specials[fi];
        ctx.moveTo(x + centerR, y);
        ctx.arc(x, y, centerR, 0, Math.PI * 2);
      }
      ctx.fill();

      // Highlights
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      for (let fi = 0; fi < specials.length; fi++) {
        const x = specials[fi];
        ctx.moveTo(x - 1.5 + highlightR, y - 1.5);
        ctx.arc(x - 1.5, y - 1.5, highlightR, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  // Find adjacent active flowers from a starting index in a given direction
  // Returns array of indices of consecutive active flowers
  getAdjacentActive(startIdx, direction) {
    const result = [];
    let idx = startIdx + direction;
    while (idx >= 0 && idx < this.count && this.active[idx]) {
      result.push(idx);
      idx += direction;
    }
    return result;
  }

  // Check if there is an active flower near a given X position
  hasFlowerNearX(cx) {
    const r = CONFIG.FLOWER_RADIUS;
    const totalWidth = this.count * this.diameter;
    for (let i = 0; i < this.count; i++) {
      if (!this.active[i]) continue;
      let x = i * this.diameter + this.diameter / 2 + this.offset;
      x = ((x % totalWidth) + totalWidth) % totalWidth - this.diameter;
      if (Math.abs(cx - x) < this.diameter) return true;
    }
    return false;
  }

  // Check collision with a point (character position)
  checkCollision(cx, cy, charRadius) {
    const r = CONFIG.FLOWER_RADIUS;
    const totalWidth = this.count * this.diameter;
    const hitDist = charRadius + r - 4;

    for (let i = 0; i < this.count; i++) {
      if (!this.active[i]) continue;
      let x = i * this.diameter + this.diameter / 2 + this.offset;
      x = ((x % totalWidth) + totalWidth) % totalWidth - this.diameter;
      if (x < -r * 2 || x > CONFIG.WIDTH + r * 2) continue;
      const dx = cx - x;
      const dy = cy - this.y;
      if (dx * dx + dy * dy < hitDist * hitDist) {
        return i; // hit this flower
      }
    }
    return -1; // no hit
  }
}

function initFlowers() {
  flowerRows = [];
  for (let row = 0; row < CONFIG.FLOWER_ROWS; row++) {
    flowerRows.push(new FlowerRow(row));
  }
}

// --- Particles ---
let particles = [];
let scorePopups = [];

function createParticles(x, y, count, color) {
  const p = [];
  for (let i = 0; i < count; i++) {
    p.push({
      x, y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6 - 2,
      life: 1,
      color,
      size: 2 + Math.random() * 3
    });
  }
  return p;
}

// Swap-and-pop removal: O(1) per removal instead of O(n) splice
function swapRemoveDead(arr, isDead) {
  let write = 0;
  for (let read = 0; read < arr.length; read++) {
    if (!isDead(arr[read])) {
      arr[write] = arr[read];
      write++;
    }
  }
  arr.length = write;
}

function updateParticles(dt) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= 0.03;
  }
  swapRemoveDead(particles, p => p.life <= 0);

  for (let i = 0; i < scorePopups.length; i++) {
    scorePopups[i].t -= 0.02;
    scorePopups[i].y -= 1.5;
  }
  swapRemoveDead(scorePopups, sp => sp.t <= 0);

  for (let i = 0; i < comboPopups.length; i++) {
    comboPopups[i].t -= 0.015;
    comboPopups[i].y -= 1.2;
  }
  swapRemoveDead(comboPopups, cp => cp.t <= 0);
  // Combo timer
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      combo = 0;
    }
  }
}

function drawParticles(ctx) {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  scorePopups.forEach(sp => {
    ctx.save();
    ctx.globalAlpha = sp.t;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = '#e91e63';
    ctx.lineWidth = 3;
    const label = '+' + (sp.points || 1);
    ctx.strokeText(label, sp.x, sp.y);
    ctx.fillText(label, sp.x, sp.y);
    ctx.restore();
  });

  ctx.globalAlpha = 1;
}

// --- Screen shake ---
let screenShake = 0;

// --- Cached background gradient (avoid recreating every frame) ---
let _cachedBgGrad = null;
let _cachedBgWidth = 0;
let _cachedBgHeight = 0;

// --- Cached static ground layer (grass + small flowers, no animation) ---
let _groundCanvas = null;
let _groundW = 0;
let _groundH = 0;

function getGroundCanvas() {
  const groundTop = CONFIG.GROUND_TOP || (CONFIG.HEIGHT - 40);
  const groundH = CONFIG.HEIGHT - groundTop;
  if (_groundCanvas && _groundW === CONFIG.WIDTH && _groundH === groundH) return { canvas: _groundCanvas, top: groundTop };

  _groundCanvas = document.createElement('canvas');
  _groundCanvas.width = CONFIG.WIDTH;
  _groundCanvas.height = groundH + 20; // extra for grass blades above
  _groundW = CONFIG.WIDTH;
  _groundH = groundH;

  const gc = _groundCanvas.getContext('2d');
  const oTop = 20; // offset: grass blades can extend 20px above ground

  // Ground fill
  gc.fillStyle = '#81c784';
  gc.fillRect(0, oTop, CONFIG.WIDTH, groundH);
  gc.fillStyle = '#66bb6a';
  gc.fillRect(0, oTop, CONFIG.WIDTH, 4);

  // Small ground flowers (static)
  for (let i = 0; i < 8; i++) {
    const gfx = (i * 167 + 40) % CONFIG.WIDTH;
    const gfy = oTop + 8 + (i % 2) * 4;
    const colors = ['#fff176', '#ef9a9a', '#b39ddb', '#80deea'];
    gc.fillStyle = colors[i % colors.length];
    gc.beginPath();
    gc.arc(gfx, gfy, 3, 0, Math.PI * 2);
    gc.fill();
    gc.fillStyle = '#a5d6a7';
    gc.fillRect(gfx - 0.5, gfy, 1, 5);
  }

  return { canvas: _groundCanvas, top: groundTop };
}

function getCachedBgGrad(ctx) {
  if (!_cachedBgGrad || _cachedBgWidth !== CONFIG.WIDTH || _cachedBgHeight !== CONFIG.HEIGHT) {
    _cachedBgGrad = ctx.createLinearGradient(0, 0, 0, CONFIG.HEIGHT);
    _cachedBgGrad.addColorStop(0, '#e3f2fd');
    _cachedBgGrad.addColorStop(0.4, '#bbdefb');
    _cachedBgGrad.addColorStop(0.75, '#c8e6c9');
    _cachedBgGrad.addColorStop(1, '#a5d6a7');
    _cachedBgWidth = CONFIG.WIDTH;
    _cachedBgHeight = CONFIG.HEIGHT;
  }
  return _cachedBgGrad;
}

// --- Utility ---
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// --- HUD ---
function drawHUD(ctx) {
  // Score
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  roundRect(ctx, 16, 12, 160, 42, 12);
  ctx.fill();
  ctx.fillStyle = '#e91e63';
  ctx.font = 'bold 22px "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Score: ' + score, 32, 40);

  // Mobile swap button is drawn in gameLoop (always visible)

  // Pause button
  drawIconButton(ctx, CONFIG.WIDTH - 148, 16, 36, paused ? '\u25B6' : '\u23F8');

  // Leaderboard icon
  drawIconButton(ctx, CONFIG.WIDTH - 100, 16, 36, '\u{1F3C6}');

  // Mute icon
  drawIconButton(ctx, CONFIG.WIDTH - 52, 16, 36, muted ? '\u{1F507}' : '\u{1F50A}');
}

function drawIconButton(ctx, x, y, size, emoji) {
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  roundRect(ctx, x, y, size + 4, size + 4, 10);
  ctx.fill();
  ctx.font = `${size - 6}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x + size / 2 + 2, y + size / 2 + 3);
  ctx.textBaseline = 'alphabetic';
}

// --- Mobile Swap Button ---
// Circle button, left-center area, always visible on mobile
const SWAP_BTN = { cx: 85, cy: 390, radius: 72 };

function drawMobileSwapButton(ctx) {
  const b = SWAP_BTN;
  const canUse = (gameState === 'playing' || gameState === 'countdown') && !paused;

  // Dimmer when not usable, brighter when pressed
  const alpha = _swapBtnPressed ? 0.4 : (canUse ? 0.18 : 0.1);
  const iconAlpha = _swapBtnPressed ? 0.7 : (canUse ? 0.3 : 0.12);

  // Circle bg
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(b.cx, b.cy, b.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(233,30,99,${iconAlpha * 0.6})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(b.cx, b.cy, b.radius, 0, Math.PI * 2);
  ctx.stroke();

  // Swap arrows icon
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.strokeStyle = `rgba(233,30,99,${iconAlpha})`;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  // Left arrow
  ctx.beginPath();
  ctx.moveTo(26, -11); ctx.lineTo(-26, -11);
  ctx.moveTo(-19, -19); ctx.lineTo(-26, -11); ctx.lineTo(-19, -3);
  ctx.stroke();
  // Right arrow
  ctx.beginPath();
  ctx.moveTo(-26, 11); ctx.lineTo(26, 11);
  ctx.moveTo(19, 3); ctx.lineTo(26, 11); ctx.lineTo(19, 19);
  ctx.stroke();
  ctx.restore();

  // Flashing hint text during countdown
  if (gameState === 'countdown') {
    const blink = Math.sin(Date.now() * 0.006) * 0.5 + 0.5; // 0~1 oscillation
    ctx.fillStyle = `rgba(233,30,99,${blink * 0.7})`;
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('点击切换跷跷板方向', b.cx - b.radius, b.cy + b.radius + 28);
  }
}

let _swapBtnPressed = false;

function isTouchInSwapBtn(gx, gy) {
  const b = SWAP_BTN;
  const dx = gx - b.cx;
  const dy = gy - b.cy;
  // Generous hit area: radius + 20px padding
  const hitR = b.radius + 20;
  return dx * dx + dy * dy <= hitR * hitR;
}

// --- Leaderboard Panel (Online) ---
function drawLeaderboardPanel(ctx) {
  if (!showLeaderboard) return;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  const pw = 440, ph = 480;
  const px = (CONFIG.WIDTH - pw) / 2, py = (CONFIG.HEIGHT - ph) / 2;

  ctx.fillStyle = '#fff';
  roundRect(ctx, px, py, pw, ph, 20);
  ctx.fill();
  ctx.strokeStyle = '#e91e63';
  ctx.lineWidth = 3;
  roundRect(ctx, px, py, pw, ph, 20);
  ctx.stroke();

  ctx.fillStyle = '#e91e63';
  ctx.font = 'bold 26px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('\u{1F3C6} 排行榜', CONFIG.WIDTH / 2, py + 44);

  const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
  const listTop = py + 60;
  const rowH = 30;

  if (onlineScoresLoading && !onlineScoresLoaded) {
    ctx.fillStyle = '#999';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('加载中...', CONFIG.WIDTH / 2, listTop + 60);
  } else if (onlineScores.length === 0) {
    ctx.fillStyle = '#999';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('暂无记录', CONFIG.WIDTH / 2, listTop + 60);
  } else {
    const show = Math.min(onlineScores.length, 12);
    for (let i = 0; i < show; i++) {
      const entry = onlineScores[i];
      const rank = i < 3 ? medals[i] : `${i + 1}.`;
      const name = (entry.name || '匿名').slice(0, 8);
      const platformTag = entry.platform === 'mobile' ? '📱' : '💻';
      const y = listTop + i * rowH + 18;

      ctx.fillStyle = '#555';
      ctx.font = '19px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(rank, CONFIG.WIDTH / 2 - 170, y);
      ctx.fillText(name, CONFIG.WIDTH / 2 - 115, y);
      ctx.textAlign = 'right';
      ctx.fillText(`${entry.score}  ${platformTag}`, CONFIG.WIDTH / 2 + 170, y);
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#999';
  ctx.font = '15px "Segoe UI", sans-serif';
  ctx.fillText('点击任意位置关闭', CONFIG.WIDTH / 2, py + ph - 20);
}

// --- Menu Screen ---
function drawMenu(ctx) {
  // Background decor - floating circles
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 12; i++) {
    const decorColors = ['#e91e63', '#ff9800', '#ffeb3b', '#4caf50', '#2196f3', '#9c27b0', '#00bcd4', '#ff5722'];
    ctx.fillStyle = decorColors[i % decorColors.length];
    const ax = (i * 137 + animFrame * 0.3) % CONFIG.WIDTH;
    const ay = 100 + Math.sin(animFrame * 0.02 + i) * 80 + i * 45;
    ctx.beginPath();
    ctx.arc(ax, ay, 20 + i * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Title
  ctx.fillStyle = '#e91e63';
  ctx.font = 'bold 56px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 6;
  ctx.strokeText('Flower Bounce', CONFIG.WIDTH / 2, 220);
  ctx.fillText('Flower Bounce', CONFIG.WIDTH / 2, 220);

  // Subtitle (concise, no long hint)
  ctx.fillStyle = '#5d4037';
  ctx.font = '20px "Segoe UI", sans-serif';
  ctx.fillText('Collect flowers!', CONFIG.WIDTH / 2, 270);

  // Start button
  const bw = 220, bh = 56;
  const bx = (CONFIG.WIDTH - bw) / 2, by = 320;
  const hovered = isInsideButton(bx, by, bw, bh);
  ctx.fillStyle = hovered ? '#c2185b' : '#e91e63';
  roundRect(ctx, bx, by, bw, bh, 28);
  ctx.fill();
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  roundRect(ctx, bx + 2, by + 3, bw, bh, 28);
  ctx.fill();
  ctx.fillStyle = hovered ? '#c2185b' : '#e91e63';
  roundRect(ctx, bx, by, bw, bh, 28);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px "Segoe UI", sans-serif';
  ctx.fillText('Start Game', CONFIG.WIDTH / 2, by + 37);

  // Leaderboard icon
  drawIconButton(ctx, CONFIG.WIDTH / 2 + 130, 328, 44, '\u{1F3C6}');

  // Mute icon
  drawIconButton(ctx, CONFIG.WIDTH / 2 + 190, 328, 44, muted ? '\u{1F507}' : '\u{1F50A}');

  // Draw leaderboard if open
  drawLeaderboardPanel(ctx);
}

let hoverMouseX = 0, hoverMouseY = 0;
function isInsideButton(bx, by, bw, bh) {
  return hoverMouseX >= bx && hoverMouseX <= bx + bw && hoverMouseY >= by && hoverMouseY <= by + bh;
}

// --- Game Over Screen ---
function drawGameOver(ctx) {
  // Dim
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  nameInputCursor += 1;

  // --- Name Input Phase ---
  if (showNameInput) {
    const pw = 420, ph = 260;
    const px = (CONFIG.WIDTH - pw) / 2, py = (CONFIG.HEIGHT - ph) / 2;

    ctx.fillStyle = '#fff';
    roundRect(ctx, px, py, pw, ph, 22);
    ctx.fill();
    ctx.strokeStyle = '#e91e63';
    ctx.lineWidth = 3;
    roundRect(ctx, px, py, pw, ph, 22);
    ctx.stroke();

    ctx.fillStyle = '#d32f2f';
    ctx.font = 'bold 34px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', CONFIG.WIDTH / 2, py + 50);

    ctx.fillStyle = '#333';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillText('Score: ' + score, CONFIG.WIDTH / 2, py + 90);

    // Name label
    ctx.fillStyle = '#888';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('输入昵称提交排行榜', CONFIG.WIDTH / 2, py + 125);

    // Name input box
    const ibw = 280, ibh = 44;
    const ibx = (CONFIG.WIDTH - ibw) / 2, iby = py + 138;
    ctx.fillStyle = '#f5f5f5';
    roundRect(ctx, ibx, iby, ibw, ibh, 10);
    ctx.fill();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    roundRect(ctx, ibx, iby, ibw, ibh, 10);
    ctx.stroke();

    // Name text + cursor
    ctx.fillStyle = nameInputText ? '#333' : '#bbb';
    ctx.font = '22px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const displayText = nameInputText || '点击输入昵称...';
    const cursorBlink = Math.floor(nameInputCursor / 30) % 2 === 0;
    ctx.fillText(displayText + (nameInputText && cursorBlink ? '|' : ''), CONFIG.WIDTH / 2, iby + 30);

    // Submit button
    const sbw = 160, sbh = 44;
    const sbx = (CONFIG.WIDTH - sbw) / 2 - 90, sby = py + ph - 62;
    const submitHover = isInsideButton(sbx, sby, sbw, sbh);
    ctx.fillStyle = submitHover ? '#c2185b' : '#e91e63';
    roundRect(ctx, sbx, sby, sbw, sbh, 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('提交分数', sbx + sbw / 2, sby + 30);

    // Skip button
    const skbx = sbx + sbw + 20, skby = sby;
    const skipHover = isInsideButton(skbx, skby, sbw, sbh);
    ctx.fillStyle = skipHover ? '#888' : '#aaa';
    roundRect(ctx, skbx, skby, sbw, sbh, 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('跳过', skbx + sbw / 2, skby + 30);

    return; // don't draw the normal game over below
  }

  // --- Normal Game Over with Online Leaderboard ---
  const pw = 420, ph = 500;
  const px = (CONFIG.WIDTH - pw) / 2, py = (CONFIG.HEIGHT - ph) / 2;

  ctx.fillStyle = '#fff';
  roundRect(ctx, px, py, pw, ph, 22);
  ctx.fill();
  ctx.strokeStyle = '#e91e63';
  ctx.lineWidth = 3;
  roundRect(ctx, px, py, pw, ph, 22);
  ctx.stroke();

  // Header: Game Over
  ctx.fillStyle = '#d32f2f';
  ctx.font = 'bold 34px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Game Over', CONFIG.WIDTH / 2, py + 48);

  // Player info: nickname + current score
  const displayName = playerName || '匿名';
  ctx.fillStyle = '#555';
  ctx.font = '20px "Segoe UI", sans-serif';
  ctx.fillText(displayName, CONFIG.WIDTH / 2, py + 80);
  ctx.fillStyle = '#e91e63';
  ctx.font = 'bold 30px "Segoe UI", sans-serif';
  ctx.fillText('' + score, CONFIG.WIDTH / 2, py + 115);

  // Divider line
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 30, py + 128);
  ctx.lineTo(px + pw - 30, py + 128);
  ctx.stroke();

  // Online scores list (no title, directly show ranking)
  const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
  const listTop = py + 135;
  const rowH = 28;
  const myName = playerName || '匿名';
  const myPlatform = isMobile ? 'mobile' : 'desktop';

  // Build a merged ranking list: take DB data, but ensure the player's
  // entry reflects max(DB score, current game score) so it's always correct
  // regardless of whether the async DB update has completed yet.
  const merged = buildMergedScores(onlineScores, myName, score, myPlatform);

  if (onlineScoresLoading && !onlineScoresLoaded && merged.length === 0) {
    ctx.fillStyle = '#999';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('加载中...', CONFIG.WIDTH / 2, listTop + 50);
  } else if (merged.length === 0) {
    ctx.fillStyle = '#999';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无记录', CONFIG.WIDTH / 2, listTop + 50);
  } else {
    // Find my rank in the full merged list (by name match)
    const myRankIdx = merged.findIndex(e => e.name === myName);
    // Show top 10, but ensure my entry is always visible
    const showList = merged.slice(0, 10);
    let myAppended = false;
    if (myRankIdx >= 10) {
      showList.push(merged[myRankIdx]);
      myAppended = true;
    }

    for (let i = 0; i < showList.length; i++) {
      const entry = showList[i];
      const actualRank = (myAppended && i === showList.length - 1) ? myRankIdx + 1 : i + 1;
      const rank = actualRank <= 3 ? medals[actualRank - 1] : `${actualRank}.`;
      const name = (entry.name || '匿名').slice(0, 8);
      const platformTag = entry.platform === 'mobile' ? '\u{1F4F1}' : '\u{1F4BB}';
      const y = listTop + i * rowH + 14;

      // Draw separator before appended "my entry" row
      if (myAppended && i === showList.length - 1) {
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(px + 40, y - 16);
        ctx.lineTo(px + pw - 40, y - 16);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Highlight my row (match by name)
      const isMe = entry.name === myName;
      if (isMe) {
        ctx.fillStyle = 'rgba(233,30,99,0.08)';
        roundRect(ctx, px + 20, y - 16, pw - 40, rowH, 6);
        ctx.fill();
      }
      ctx.fillStyle = isMe ? '#e91e63' : '#555';
      ctx.font = isMe ? 'bold 18px "Segoe UI", sans-serif' : '18px "Segoe UI", sans-serif';

      ctx.textAlign = 'left';
      ctx.fillText(`${rank}`, CONFIG.WIDTH / 2 - 160, y);
      ctx.fillText(`${name}`, CONFIG.WIDTH / 2 - 110, y);
      ctx.textAlign = 'right';
      ctx.fillText(`${entry.score}  ${platformTag}`, CONFIG.WIDTH / 2 + 160, y);
    }
  }

  ctx.textAlign = 'center';

  // Play Again button
  const bw = 200, bh = 50;
  const bx = (CONFIG.WIDTH - bw) / 2, by = py + ph - 68;
  const hovered = isInsideButton(bx, by, bw, bh);
  ctx.fillStyle = hovered ? '#c2185b' : '#e91e63';
  roundRect(ctx, bx, by, bw, bh, 25);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px "Segoe UI", sans-serif';
  ctx.fillText('Play Again', CONFIG.WIDTH / 2, by + 33);
}

// Build a display-only leaderboard that merges three data sources for the
// player's score: DB, current game, and localStorage best. This guarantees
// the displayed score is always the all-time highest, even if DB writes fail.
function buildMergedScores(dbScores, myName, currentScore, platform) {
  const now = new Date().toISOString();
  // Local best score (localStorage is always writable, so this is reliable)
  const localScores = getTopScores();
  const localBest = localScores.length > 0 ? localScores[0] : 0;

  let found = false;
  const result = dbScores.map(e => {
    if (e.name === myName) {
      found = true;
      const best = Math.max(e.score, currentScore, localBest);
      if (best !== e.score) {
        return { ...e, score: best, platform, created_at: now };
      }
      return e;
    }
    return e;
  });
  // Player has no DB record yet — add with best known score
  if (myName && !found) {
    const best = Math.max(currentScore, localBest);
    result.push({ name: myName, score: best, platform, created_at: now });
  }
  result.sort((a, b) => b.score - a.score);
  return result;
}

// --- Game Over Logic ---
function gameOver() {
  if (gameOverTriggered) return;
  gameOverTriggered = true;
  gameState = 'gameover';
  paused = false;
  stopBGM();
  saveScore(score);
  screenShake = 8;
  // If player already has a name, auto-submit and show leaderboard directly
  // Submit the local all-time best (not just this game's score) to DB
  if (playerName) {
    showNameInput = false;
    const localBest = Math.max(score, ...(getTopScores()));
    submitOnlineScore(playerName, localBest);
  } else {
    showNameInput = true;
    nameInputText = '';
    nameInputCursor = 0;
    if (_nameInputEl) _nameInputEl.value = '';
    fetchOnlineScores();
  }
}

// --- Countdown ---
function startCountdown() {
  // Reset game data immediately so the scene renders during countdown
  score = 0;
  bounceCount = 0;
  speedMultiplier = CONFIG.SPEED_INITIAL;
  speedTimer = 0;
  speedHoldTimer = 0;
  showSpeedUp = 0;
  particles = [];
  scorePopups = [];
  screenShake = 0;
  initFlowers();
  // Reset both characters: B sits on right end, A shown at drop position during countdown
  const dropX = CONFIG.WIDTH / 2 - CONFIG.SEESAW_WIDTH * 0.3;
  const dropY = CONFIG.FLOWER_ROW_TOP + CONFIG.FLOWER_ROWS * CONFIG.FLOWER_ROW_SPACING + 40;
  chars[0].setWaiting(dropX, dropY);
  // B starts sitting on right end of seesaw
  chars[1].x = CONFIG.WIDTH / 2 + seesaw.w / 2 * 0.6;
  chars[1].y = CONFIG.SEESAW_Y - CONFIG.CHAR_RADIUS;
  chars[1].vx = 0; chars[1].vy = 0;
  chars[1].sitOnEnd('right');
  dropTimer = 0; dropCharId = -1;
  gameOverTriggered = false;
  seesaw.x = CONFIG.WIDTH / 2;
  // Countdown state: start at 4 with same interval, so "3" appears after 550ms delay
  countdownNum = 4;
  countdownTimer = 350;
  gameState = 'countdown';
}

function updateCountdown(dt) {
  countdownTimer -= dt;
  if (countdownTimer <= 0) {
    countdownNum--;
    if (countdownNum === 0) {
      // Show "GO!" for 280ms before starting
      countdownTimer = 280;
      playCountdownTick(0);
    } else if (countdownNum < 0) {
      // GO! display time elapsed, now actually start
      gameState = 'playing';
      startBGM();
      // Drop char A from its current waiting position (follows seesaw area)
      const dropY = CONFIG.FLOWER_ROW_TOP + CONFIG.FLOWER_ROWS * CONFIG.FLOWER_ROW_SPACING + 40;
      chars[0].reset(chars[0].x, dropY);
      // Reset combo state
      combo = 0; comboTimer = 0; bestCombo = 0;
      comboPopups = [];
    } else {
      countdownTimer = 350;
      playCountdownTick(countdownNum);
    }
  }
}

function drawCountdown(ctx) {
  // Don't draw countdown number during the initial delay (countdownNum > 3)
  if (countdownNum > 3) return;
  const label = countdownNum > 0 ? String(countdownNum) : 'GO!';
  // Pulsing scale: big at start of each second, shrinks toward next
  const totalMs = countdownNum > 0 ? 550 : 400;
  const progress = 1 - (countdownTimer / totalMs); // 0→1 over the period
  const scale = 1.4 - progress * 0.5;           // 1.4 → 0.9
  const alpha = progress < 0.85 ? 1 : 1 - (progress - 0.85) / 0.15; // fade out near end

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2);
  ctx.scale(scale, scale);

  // Background circle
  ctx.fillStyle = countdownNum > 0 ? 'rgba(233,30,99,0.18)' : 'rgba(76,175,80,0.22)';
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, Math.PI * 2);
  ctx.fill();

  // Text
  const color = countdownNum > 0 ? '#e91e63' : '#2e7d32';
  ctx.fillStyle = color;
  ctx.font = `bold ${countdownNum > 0 ? 120 : 80}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.strokeText(label, 0, 0);
  ctx.fillText(label, 0, 0);
  ctx.restore();

  // --- Drop preview indicator for waiting character A ---
  const charA = chars[0];
  if (charA.state === 'waiting') {
    const px = charA.x;
    const py = charA.y;
    const pulse = Math.sin(animFrame * 0.1) * 0.3 + 0.7; // 0.4~1.0 pulsing

    // Pulsing down arrow below character
    ctx.save();
    ctx.globalAlpha = pulse * 0.8;
    const arrowY = py + 30 + Math.sin(animFrame * 0.08) * 6; // bobbing arrow
    ctx.fillStyle = '#e91e63';
    ctx.beginPath();
    ctx.moveTo(px, arrowY + 18);
    ctx.lineTo(px - 12, arrowY);
    ctx.lineTo(px - 4, arrowY);
    ctx.lineTo(px - 4, arrowY - 14);
    ctx.lineTo(px + 4, arrowY - 14);
    ctx.lineTo(px + 4, arrowY);
    ctx.lineTo(px + 12, arrowY);
    ctx.closePath();
    ctx.fill();

    // "Ready!" label
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#e91e63';
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeText('Ready!', px, py - 30);
    ctx.fillText('Ready!', px, py - 30);
    ctx.restore();

    // Landing zone indicator on seesaw (dashed circle showing where char will land)
    ctx.save();
    const landX = seesaw.x - seesaw.w / 2 * 0.6; // left end of seesaw (opposite to B sitting on right)
    const landY = seesaw.y - CONFIG.CHAR_RADIUS;
    ctx.globalAlpha = pulse * 0.35;
    ctx.strokeStyle = '#e91e63';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(landX, landY, CONFIG.CHAR_RADIUS + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// --- Drop shadow indicator during gameplay ---
function drawDropIndicator(ctx) {
  chars.forEach(c => {
    // Show drop shadow for characters that are falling/flying (in the air, moving down)
    if ((c.state === 'falling' || c.state === 'flying' || c.state === 'bounced') && c.vy !== undefined) {
      // Project where the character will be at seesaw height
      const targetY = seesaw.y - CONFIG.CHAR_RADIUS;
      if (c.y < targetY - 20) {
        // Shadow on ground / seesaw level
        const shadowX = c.x;
        const shadowY = seesaw.y;
        const heightRatio = Math.min(1, (targetY - c.y) / 400); // farther = smaller shadow
        const shadowSize = CONFIG.CHAR_RADIUS * (1.2 - heightRatio * 0.6);
        const shadowAlpha = 0.2 + (1 - heightRatio) * 0.25;

        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.ellipse(shadowX, shadowY + 8, shadowSize, shadowSize * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  });
}

// --- Start Game (routes through countdown) ---
function startGame() {
  initAudio();
  startCountdown();
}

// --- Main Loop ---
function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop); // always schedule next frame first
  try {
  const dt = Math.min(timestamp - lastTime, 33);
  lastTime = timestamp;
  animFrame++;

  // Poll leaderboard for real-time updates when visible
  pollOnlineScores(dt);

  ctx.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  // Background gradient (cached)
  ctx.fillStyle = getCachedBgGrad(ctx);
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  // Subtle cloud decor
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 350 + animFrame * 0.15) % (CONFIG.WIDTH + 200)) - 100;
    const cy = 30 + i * 25;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 30, cy - 8, 40, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground (static layer cached)
  const ground = getGroundCanvas();
  ctx.drawImage(ground.canvas, 0, ground.top - 20);
  // Animated grass blades (drawn on top)
  ctx.strokeStyle = '#4caf50';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const gx = (i * 22 + 5) % CONFIG.WIDTH;
    const gy = ground.top;
    const sway = Math.sin(animFrame * 0.02 + i * 0.7) * 3;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + sway, gy - 10, gx + sway * 1.5, gy - 14 - (i % 3) * 3);
    ctx.stroke();
  }

  if (gameState === 'menu') {
    drawMenu(ctx);
    return;
  }

  // Screen shake
  let didShake = false;
  if (screenShake > 0) {
    didShake = true;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    screenShake *= 0.85;
    if (screenShake < 0.3) screenShake = 0;
  }

  if (gameState === 'countdown') {
    // Scene is live (flowers move, seesaw follows mouse, sitting char follows seesaw)
    updateCountdown(dt);
    seesaw.update();
    chars.forEach(c => { if (c.state === 'sitting') c.update(dt); });
    // Waiting char A follows seesaw left-end during countdown (so drop position matches seesaw)
    const waitingChar = chars.find(c => c.state === 'waiting');
    if (waitingChar) {
      const targetX = seesaw.x - seesaw.w / 2 * 0.6; // above the left end (opposite of B on right)
      waitingChar.x += (targetX - waitingChar.x) * 0.1; // smooth follow
    }
    flowerRows.forEach(r => r.update(dt));
    updateParticles(dt);
  }

  if (gameState === 'playing' && !paused) {
    // Speed system - cycles: ramp up to max, hold, then reset to 1.0
    if (speedMultiplier >= CONFIG.SPEED_MAX) {
      // Holding at max speed
      speedHoldTimer += dt;
      if (speedHoldTimer >= CONFIG.SPEED_MAX_HOLD) {
        // Reset back to initial speed
        speedMultiplier = CONFIG.SPEED_INITIAL;
        speedTimer = 0;
        speedHoldTimer = 0;
      }
    } else {
      speedTimer += dt;
      if (speedTimer >= CONFIG.SPEED_INTERVAL) {
        speedTimer = 0;
        speedMultiplier += CONFIG.SPEED_INCREMENT;
        if (speedMultiplier >= CONFIG.SPEED_MAX) {
          speedMultiplier = CONFIG.SPEED_MAX;
          speedHoldTimer = 0; // start hold timer
        }
        speedMultiplier = Math.round(speedMultiplier * 100) / 100;
        showSpeedUp = 1;
        playSpeedUpSound();
      }
    }

    seesaw.update();
    updateChars(dt);
    flowerRows.forEach(r => r.update(dt));
    updateParticles(dt);
  }

  // Draw scene
  flowerRows.forEach(r => r.draw(ctx));
  drawDropIndicator(ctx); // Drop shadow indicator for falling characters
  seesaw.draw(ctx);
  chars.forEach(c => c.draw(ctx));
  drawParticles(ctx);

  if (gameState === 'countdown') {
    drawCountdown(ctx);
  }

  // Pause overlay
  if (paused && gameState === 'playing') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAUSED', CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 20);
    ctx.font = '22px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ddd';
    ctx.fillText(isMobile ? '点击任意位置继续' : 'Click pause or press P to resume', CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 + 25);
    ctx.textBaseline = 'alphabetic';
  }

  // Speed-up notification (disabled)
  showSpeedUp = 0;

  drawHUD(ctx);

  if (didShake) ctx.restore();

  if (gameState === 'gameover') {
    drawGameOver(ctx);
  }

  // Draw leaderboard on top if open during game
  if (showLeaderboard && gameState !== 'menu') {
    drawLeaderboardPanel(ctx);
  }

  // Mobile swap button — always visible on top layer
  if (isMobile) {
    drawMobileSwapButton(ctx);
  }

  } catch (e) { console.error('Game loop error:', e); }
}

// --- Input Handling ---
function canvasToGame(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / rect.width * CONFIG.WIDTH,
    y: (clientY - rect.top) / rect.height * CONFIG.HEIGHT
  };
}

function onMouseMove(e) {
  const pos = canvasToGame(e.clientX, e.clientY);
  mouseX = pos.x;
  hoverMouseX = pos.x;
  hoverMouseY = pos.y;
}

function handleGameClick(gx, gy) {
  // Leaderboard close
  if (showLeaderboard) {
    showLeaderboard = false;
    playClickSound();
    return;
  }

  if (gameState === 'menu') {
    // Start button
    const bw = 220, bh = 56;
    const bx = (CONFIG.WIDTH - bw) / 2, by = 320;
    if (gx >= bx && gx <= bx + bw && gy >= by && gy <= by + bh) {
      playClickSound();
      startGame();
      return;
    }
    // Leaderboard icon
    if (gx >= CONFIG.WIDTH / 2 + 130 && gx <= CONFIG.WIDTH / 2 + 178 && gy >= 328 && gy <= 376) {
      playClickSound();
      showLeaderboard = true; fetchOnlineScores();
      return;
    }
    // Mute icon
    if (gx >= CONFIG.WIDTH / 2 + 190 && gx <= CONFIG.WIDTH / 2 + 238 && gy >= 328 && gy <= 376) {
      muted = !muted;
      playClickSound();
      return;
    }
  }

  if (gameState === 'playing') {
    // Pause button
    if (gx >= CONFIG.WIDTH - 148 && gx <= CONFIG.WIDTH - 108 && gy >= 16 && gy <= 56) {
      paused = !paused;
      playClickSound();
      return;
    }
    // Leaderboard icon (top right)
    if (gx >= CONFIG.WIDTH - 100 && gx <= CONFIG.WIDTH - 60 && gy >= 16 && gy <= 56) {
      playClickSound();
      showLeaderboard = true; fetchOnlineScores();
      return;
    }
    // Mute icon
    if (gx >= CONFIG.WIDTH - 52 && gx <= CONFIG.WIDTH - 12 && gy >= 16 && gy <= 56) {
      muted = !muted;
      if (muted) stopBGM(); else startBGM();
      playClickSound();
      return;
    }
    // Click anywhere else: swap sitting character to other end (only when not paused)
    if (!paused) {
      switchCharPositions();
    }
    return;
  }

  if (gameState === 'gameover') {
    if (showNameInput) {
      // Name input phase
      const pw = 420, ph = 260;
      const py = (CONFIG.HEIGHT - ph) / 2;

      // Name input box — focus hidden HTML input
      const ibw = 280, ibh = 44;
      const ibx = (CONFIG.WIDTH - ibw) / 2, iby = py + 138;
      if (gx >= ibx && gx <= ibx + ibw && gy >= iby && gy <= iby + ibh) {
        focusNameInput();
        return;
      }

      // Submit button
      const sbw = 160, sbh = 44;
      const sbx = (CONFIG.WIDTH - sbw) / 2 - 90, sby = py + ph - 62;
      if (gx >= sbx && gx <= sbx + sbw && gy >= sby && gy <= sby + sbh) {
        playerName = nameInputText || '匿名';
        localStorage.setItem('flowerBounce_name', playerName);
        const localBest = Math.max(score, ...(getTopScores()));
        submitOnlineScore(playerName, localBest);
        showNameInput = false;
        blurNameInput();
        playClickSound();
        return;
      }

      // Skip button
      const skbx = sbx + sbw + 20, skby = sby;
      if (gx >= skbx && gx <= skbx + sbw && gy >= skby && gy <= skby + sbh) {
        showNameInput = false;
        blurNameInput();
        playClickSound();
        return;
      }
      return;
    }

    // Normal game over — Play Again button
    const pw = 420, ph = 500;
    const py = (CONFIG.HEIGHT - ph) / 2;
    const bw = 200, bh = 50;
    const bx = (CONFIG.WIDTH - bw) / 2, by = py + ph - 68;
    if (gx >= bx && gx <= bx + bw && gy >= by && gy <= by + bh) {
      playClickSound();
      startGame();
      return;
    }
  }
}

function onClick(e) {
  initAudio();
  const pos = canvasToGame(e.clientX, e.clientY);
  handleGameClick(pos.x, pos.y);
}

// --- Touch Support ---
// Multi-touch: right hand controls seesaw, left hand taps swap button
let _lastTouchX = CONFIG.WIDTH / 2;
let _lastTouchY = CONFIG.HEIGHT / 2;
let _touchActive = false;
let _touchStartPos = null;
const TAP_MOVE_THRESHOLD = 15;

// Track which touch IDs are controlling seesaw vs swap button
let _seesawTouchId = null;
let _swapTouchId = null;

function _findSeesawTouch(touches) {
  // Find a non-swap-button touch to drive the seesaw
  for (let i = 0; i < touches.length; i++) {
    const pos = canvasToGame(touches[i].clientX, touches[i].clientY);
    if (!isTouchInSwapBtn(pos.x, pos.y)) return touches[i];
  }
  return touches[0]; // fallback
}

function onTouchMove(e) {
  e.preventDefault();
  // Update seesaw position from any non-swap-button touch
  for (let i = 0; i < e.touches.length; i++) {
    const t = e.touches[i];
    const pos = canvasToGame(t.clientX, t.clientY);
    // If this touch started on the swap button, skip it for seesaw control
    if (t.identifier === _swapTouchId) continue;
    mouseX = pos.x;
    hoverMouseX = pos.x;
    hoverMouseY = pos.y;
    _lastTouchX = pos.x;
    _lastTouchY = pos.y;
    _touchActive = true;
    break; // use first valid touch for seesaw
  }
}

function onTouchStart(e) {
  e.preventDefault();
  initAudio();

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const pos = canvasToGame(t.clientX, t.clientY);

    // Check if this touch lands on the swap button (works during playing and countdown)
    if (isMobile && (gameState === 'playing' || gameState === 'countdown') && !paused && isTouchInSwapBtn(pos.x, pos.y)) {
      _swapTouchId = t.identifier;
      _swapBtnPressed = true;
      switchCharPositions();
      continue; // don't move seesaw for this touch
    }

    // Otherwise this touch controls the seesaw
    mouseX = pos.x;
    hoverMouseX = pos.x;
    hoverMouseY = pos.y;
    _lastTouchX = pos.x;
    _lastTouchY = pos.y;
    _touchActive = true;
    _touchStartPos = { x: pos.x, y: pos.y };
    _seesawTouchId = t.identifier;
  }
}

function onTouchEnd(e) {
  e.preventDefault();

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];

    // Swap button touch released
    if (t.identifier === _swapTouchId) {
      _swapTouchId = null;
      _swapBtnPressed = false;
      continue;
    }

    // Seesaw touch released — check for tap
    if (t.identifier === _seesawTouchId) {
      _seesawTouchId = null;
    }
  }

  // If no more touches, check for tap action (menu, gameover, UI buttons)
  if (e.touches.length === 0) {
    _touchActive = false;
    if (!_touchStartPos) return;

    const endX = _lastTouchX, endY = _lastTouchY;
    const dx = Math.abs(endX - _touchStartPos.x);
    const dy = Math.abs(endY - _touchStartPos.y);
    const isTap = dx < TAP_MOVE_THRESHOLD && dy < TAP_MOVE_THRESHOLD;
    _touchStartPos = null;

    if (!isTap) return;

    if (gameState === 'playing' && paused) {
      paused = false;
      playClickSound();
      return;
    }

    if (gameState === 'playing' && !paused) {
      // UI buttons (single tap)
      const gx = endX, gy = endY;
      if (gx >= CONFIG.WIDTH - 148 && gx <= CONFIG.WIDTH - 108 && gy >= 16 && gy <= 56) {
        paused = true; playClickSound(); return;
      }
      if (gx >= CONFIG.WIDTH - 100 && gx <= CONFIG.WIDTH - 60 && gy >= 16 && gy <= 56) {
        playClickSound(); showLeaderboard = true; fetchOnlineScores(); return;
      }
      if (gx >= CONFIG.WIDTH - 52 && gx <= CONFIG.WIDTH - 12 && gy >= 16 && gy <= 56) {
        muted = !muted; if (muted) stopBGM(); else startBGM(); playClickSound(); return;
      }
      // No swap on right-hand tap — swap is handled by the dedicated button
    } else {
      // Non-gameplay: menu, gameover etc — single tap works as click
      handleGameClick(endX, endY);
    }
  }
}

// --- Keyboard Support ---
function onKeyDown(e) {
  if (e.key === 'p' || e.key === 'P') {
    if (gameState === 'playing') {
      paused = !paused;
      playClickSound();
    }
  }
  if (e.key === ' ') {
    e.preventDefault(); // prevent page scroll
    if (gameState === 'menu') {
      initAudio();
      playClickSound();
      startGame();
    } else if (gameState === 'gameover') {
      initAudio();
      playClickSound();
      startGame();
    } else if (gameState === 'playing') {
      paused = !paused;
      playClickSound();
    }
  }
  if (e.key === 'Enter') {
    if (gameState === 'menu' || gameState === 'gameover') {
      initAudio();
      playClickSound();
      startGame();
    } else if (gameState === 'playing' && !paused) {
      switchCharPositions();
    }
  }
  if (e.key === 'm' || e.key === 'M') {
    muted = !muted;
    if (muted) stopBGM(); else if (gameState === 'playing' || gameState === 'countdown') startBGM();
  }
}

// --- Init ---
// --- Name Input via hidden HTML element ---
let _nameInputEl = null;

function initNameInput() {
  _nameInputEl = document.getElementById('name-input');
  if (!_nameInputEl) return;
  _nameInputEl.value = nameInputText;
  _nameInputEl.addEventListener('input', () => {
    nameInputText = (_nameInputEl.value || '').slice(0, 8);
  });
  // On blur, sync value back
  _nameInputEl.addEventListener('blur', () => {
    nameInputText = (_nameInputEl.value || '').slice(0, 8);
  });
}

function focusNameInput() {
  if (!_nameInputEl) return;
  _nameInputEl.value = nameInputText;
  _nameInputEl.style.left = '50%';
  _nameInputEl.style.opacity = '0';
  _nameInputEl.style.pointerEvents = 'auto';
  _nameInputEl.focus();
  // On mobile, font-size >= 16px prevents auto-zoom
}

function blurNameInput() {
  if (!_nameInputEl) return;
  _nameInputEl.blur();
  _nameInputEl.style.left = '-9999px';
  _nameInputEl.style.pointerEvents = 'none';
}

function init() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  canvas.width = CONFIG.WIDTH;
  canvas.height = CONFIG.HEIGHT;
  initNameInput();

  // Pre-fetch leaderboard and subscribe to realtime changes
  fetchOnlineScores();
  subscribeToScores();

  // Mouse
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);

  // Touch
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

  // Keyboard
  window.addEventListener('keydown', onKeyDown);

  // Prevent context menu and other mobile gestures
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());

  // Handle resize / orientation change
  window.addEventListener('resize', onResize);
  onResize();

  // Pause BGM when tab is hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopBGM();
      if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    } else {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      if (!muted && (gameState === 'playing' || gameState === 'countdown')) startBGM();
    }
  });

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function onResize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CONFIG.WIDTH * dpr;
  canvas.height = CONFIG.HEIGHT * dpr;
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Invalidate cached gradient on resize
  _cachedBgGrad = null;
  _groundCanvas = null;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
