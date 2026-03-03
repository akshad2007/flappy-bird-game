const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreValue = document.getElementById("scoreValue");
const highScoreValue = document.getElementById("highScoreValue");
const finalScoreValue = document.getElementById("finalScoreValue");
const startOverlay = document.getElementById("startOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const restartButton = document.getElementById("restartButton");

const FLOOR_RATIO = 0.16;
const BIRD_X_RATIO = 0.28;

const state = {
  mode: "start", // start | playing | gameover
  bird: {
    x: 0,
    y: 0,
    radius: 16,
    velocity: 0,
  },
  gravity: 1900,
  jumpForce: -560,
  pipes: [],
  score: 0,
  highScore: Number(localStorage.getItem("flappyHighScore") || 0),
  elapsed: 0,
  baseSpeed: 160,
  speed: 160,
  spawnInterval: 1.4,
  spawnTimer: 0,
  lastTime: 0,
};

highScoreValue.textContent = String(state.highScore);

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  state.bird.x = rect.width * BIRD_X_RATIO;
  state.bird.radius = Math.max(12, rect.width * 0.035);

  // Keep bird and pipes in bounds after resize.
  const playableHeight = rect.height * (1 - FLOOR_RATIO);
  state.bird.y = Math.min(state.bird.y || rect.height / 2, playableHeight - state.bird.radius);
  state.pipes = state.pipes.filter((pipe) => pipe.x + pipe.width > -8);
}

function resetGame({ keepStartScreen = false } = {}) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  state.mode = keepStartScreen ? "start" : "playing";
  state.bird.y = height * 0.45;
  state.bird.velocity = 0;
  state.pipes = [];
  state.score = 0;
  state.elapsed = 0;
  state.speed = state.baseSpeed;
  state.spawnTimer = 0;
  scoreValue.textContent = "0";
  finalScoreValue.textContent = "0";
  gameOverOverlay.classList.remove("visible");
  if (!keepStartScreen) startOverlay.classList.remove("visible");
}

function createPipe() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const floorY = height * (1 - FLOOR_RATIO);
  const pipeWidth = Math.max(52, width * 0.14);
  const gapBase = Math.max(128, height * 0.26);
  const gap = Math.max(104, gapBase - state.elapsed * 1.3); // Slightly smaller over time.

  const topMin = 50;
  const topMax = floorY - gap - 80;
  const topHeight = Math.random() * (topMax - topMin) + topMin;

  state.pipes.push({
    x: width + 8,
    width: pipeWidth,
    topHeight,
    gap,
    passed: false,
  });
}

function playTone(freq, duration, type = "sine", gainValue = 0.025) {
  const AudioContextRef = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextRef) return;

  if (!playTone.ctx) {
    playTone.ctx = new AudioContextRef();
  }

  const audioCtx = playTone.ctx;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = freq;
  gain.gain.value = gainValue;
  oscillator.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  oscillator.start(now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.stop(now + duration);
}

function flap() {
  if (state.mode === "start") {
    resetGame();
  }

  if (state.mode !== "playing") return;
  state.bird.velocity = state.jumpForce;
  playTone(530, 0.12, "triangle", 0.035);
}

function endGame() {
  state.mode = "gameover";
  finalScoreValue.textContent = String(state.score);
  gameOverOverlay.classList.add("visible");
  playTone(130, 0.28, "sawtooth", 0.04);

  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem("flappyHighScore", String(state.highScore));
    highScoreValue.textContent = String(state.highScore);
  }
}

function update(dt) {
  if (state.mode !== "playing") return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const floorY = height * (1 - FLOOR_RATIO);

  state.elapsed += dt;
  state.speed = Math.min(300, state.baseSpeed + state.elapsed * 3.5);

  state.spawnTimer += dt;
  if (state.spawnTimer >= state.spawnInterval) {
    state.spawnTimer = 0;
    createPipe();
  }

  state.bird.velocity += state.gravity * dt;
  state.bird.y += state.bird.velocity * dt;

  if (state.bird.y + state.bird.radius >= floorY) {
    state.bird.y = floorY - state.bird.radius;
    endGame();
    return;
  }

  if (state.bird.y - state.bird.radius <= 0) {
    state.bird.y = state.bird.radius;
    state.bird.velocity = 0;
  }

  state.pipes.forEach((pipe) => {
    pipe.x -= state.speed * dt;

    const bird = state.bird;
    const birdLeft = bird.x - bird.radius;
    const birdRight = bird.x + bird.radius;
    const birdTop = bird.y - bird.radius;
    const birdBottom = bird.y + bird.radius;

    const inPipeX = birdRight > pipe.x && birdLeft < pipe.x + pipe.width;
    const hitTop = birdTop < pipe.topHeight;
    const hitBottom = birdBottom > pipe.topHeight + pipe.gap;

    if (inPipeX && (hitTop || hitBottom)) {
      endGame();
    }

    if (!pipe.passed && pipe.x + pipe.width < bird.x) {
      pipe.passed = true;
      state.score += 1;
      scoreValue.textContent = String(state.score);
      playTone(760, 0.09, "square", 0.022);
    }
  });

  state.pipes = state.pipes.filter((pipe) => pipe.x + pipe.width > -16);
}

function drawBird() {
  const bird = state.bird;

  ctx.save();
  ctx.translate(bird.x, bird.y);
  const angle = Math.max(-0.45, Math.min(1.05, bird.velocity / 650));
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.arc(0, 0, bird.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#facc15";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(bird.radius * 0.32, -bird.radius * 0.25, bird.radius * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = "#111827";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bird.radius * 0.65, 1);
  ctx.lineTo(bird.radius * 1.25, -5);
  ctx.lineTo(bird.radius * 1.22, 8);
  ctx.closePath();
  ctx.fillStyle = "#fb923c";
  ctx.fill();

  ctx.restore();
}

function drawPipes() {
  const height = canvas.clientHeight;
  const floorY = height * (1 - FLOOR_RATIO);

  state.pipes.forEach((pipe) => {
    const bodyGradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipe.width, 0);
    bodyGradient.addColorStop(0, "#16a34a");
    bodyGradient.addColorStop(1, "#15803d");

    ctx.fillStyle = bodyGradient;
    ctx.fillRect(pipe.x, 0, pipe.width, pipe.topHeight);
    ctx.fillRect(pipe.x, pipe.topHeight + pipe.gap, pipe.width, floorY - (pipe.topHeight + pipe.gap));

    ctx.fillStyle = "#166534";
    const capHeight = 13;
    ctx.fillRect(pipe.x - 3, pipe.topHeight - capHeight, pipe.width + 6, capHeight);
    ctx.fillRect(pipe.x - 3, pipe.topHeight + pipe.gap, pipe.width + 6, capHeight);
  });
}

function drawScene() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const floorY = height * (1 - FLOOR_RATIO);

  ctx.clearRect(0, 0, width, height);

  // Clouds
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  const t = performance.now() * 0.01;
  for (let i = 0; i < 3; i += 1) {
    const cx = ((t * (0.2 + i * 0.05) + i * 160) % (width + 120)) - 80;
    const cy = 90 + i * 55;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 34, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPipes();

  // Floor
  ctx.fillStyle = "#5e9f3c";
  ctx.fillRect(0, floorY, width, height - floorY);

  // Floor stripe
  ctx.fillStyle = "#85c45f";
  for (let x = 0; x < width; x += 28) {
    ctx.fillRect(x, floorY + 8, 14, 5);
  }

  drawBird();
}

function loop(timestamp) {
  if (!state.lastTime) state.lastTime = timestamp;
  const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000);
  state.lastTime = timestamp;

  update(dt);
  drawScene();
  requestAnimationFrame(loop);
}

function onPrimaryAction(event) {
  if (event.type === "touchstart") {
    event.preventDefault();
  }

  if (state.mode === "gameover") return;
  flap();
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (state.mode === "gameover") {
      resetGame();
      return;
    }
    flap();
  }

  if (event.code === "KeyR" && state.mode === "gameover") {
    event.preventDefault();
    resetGame();
  }
});

canvas.addEventListener("touchstart", onPrimaryAction, { passive: false });
canvas.addEventListener("mousedown", onPrimaryAction);
restartButton.addEventListener("click", () => resetGame());

resizeCanvas();
resetGame({ keepStartScreen: true });
requestAnimationFrame(loop);
