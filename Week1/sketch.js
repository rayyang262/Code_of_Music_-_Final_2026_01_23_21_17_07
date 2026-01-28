const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let screenW = 0;
let screenH = 0;

// Marble properties
const marble = {
  x: 0,
  y: 0,
  radius: 12,
  vx: 0,
  vy: 0,
  fadeAlpha: 255
};

// Spawn point
const spawnPoint = { x: 100, y: 100 };

// Walls (rectangles)
let walls = [
  { x: 100, y: 200, w: 200, h: 30 },
  { x: 500, y: 400, w: 150, h: 40 },
  { x: 200, y: 550, w: 300, h: 25 }
];

// Holes (circles)
let holes = [];

// Board stack and depth
let boards = [];
let depth = 0;
let lastFallenHole = null; // Track which hole was fallen into
let isFalling = false;
let levelTransitioning = false; // Prevent multiple nextLevel calls
let fadeTimer = 0;
const fadeSpeed = 5;

// Physics constants
const acceleration = 0.5;
const friction = 0.95;
const maxVelocity = 8;
const FALL_K = 0.65; // higher = easier to fall, lower = harder
// const holeThreshold = marble.radius;
const holeGrowthRate = 0.15;  // Growth when marble is near
const holeStrongGrowthRate = 0.8;  // Growth when clicked
const holeDecayRate = 0.08;  // Decay when not near
const holeProximityRange = 200;  // Distance at which marble affects hole
const holeMinSize = 5;  // Minimum size before hole disappears

// Tilt state
let tiltX = 0;
let tiltY = 0;

// Keyboard state
const keys = {};

// Resize canvas to fill window
// function resizeCanvas() {
//   cw = window.innerWidth;
//   ch = window.innerHeight;
//   marble.x = spawnPoint.x;
//   marble.y = spawnPoint.y;
// }
function cw() { return window.innerWidth; }
function ch() { return window.innerHeight; }

if (marble.x + marble.radius > cw()) { marble.x = cw() - marble.radius; marble.vx = 0; }
if (marble.y + marble.radius > ch()) { marble.y = ch() - marble.radius; marble.vy = 0; }

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;

  screenW = window.innerWidth;
  screenH = window.innerHeight;

  canvas.style.width = screenW + 'px';
  canvas.style.height = screenH + 'px';

  canvas.width = Math.floor(screenW * dpr);
  canvas.height = Math.floor(screenH * dpr);

  // draw using CSS pixel coordinates
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Check if a position is valid (not overlapping with walls or existing holes)
function isValidHolePosition(x, y, radius) {
  // Check distance from other holes
  for (let hole of holes) {
    const dx = x - hole.x;
    const dy = y - hole.y;
    const distance = Math.hypot(dx, dy);
    // if (distance < radius + hole.radius + 60) return false;
    const otherR = getHoleRadius(hole);
    if (distance < radius + otherR + 60) return false;
  }

  // Check overlap with walls
  for (let wall of walls) {
    if (x > wall.x - radius && x < wall.x + wall.w + radius &&
        y > wall.y - radius && y < wall.y + wall.h + radius) {
      return false;
    }
  }

  // Check canvas bounds
  if (x - radius < 20 || x + radius > cw() - 20 ||
      y - radius < 100 || y + radius > ch() - 20) {
    return false;
  }

  return true;
}

// Find a valid random position for a new hole
function findValidHolePosition(maxAttempts = 50) {
  const baseRadius = 30 + Math.random() * 20;
  
  for (let i = 0; i < maxAttempts; i++) {
    const x = 50 + Math.random() * (cw() - 100);
    const y = 120 + Math.random() * (ch() - 150);
    
    if (isValidHolePosition(x, y, baseRadius)) {
      return { x, y, baseRadius };
    }
  }
  
  // Fallback: return a position, may overlap slightly
  return {
    x: 50 + Math.random() * (cw() - 100),
    y: 120 + Math.random() * (ch() - 150),
    baseRadius: 30 + Math.random() * 20
  };
}

// Generate random vibrant color
function generateRandomColor() {
  const hue = Math.random() * 360;
  const saturation = 70 + Math.random() * 30; // 70-100%
  const lightness = 50 + Math.random() * 20; // 50-70%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Add a new hole with given label
function addThoughtHole(label) {
  if (!label.trim()) return;
  
  const position = findValidHolePosition();
  holes.push({
    x: position.x,
    y: position.y,
    baseRadius: position.baseRadius,
    label: label.trim(),
    color: generateRandomColor(),
    growth: 0,
    maxGrowth: 40
  });
}

// Update hole growth/decay based on marble proximity
function updateHolesGrowth() {
  for (let hole of holes) {
    const dx = marble.x - hole.x;
    const dy = marble.y - hole.y;
    const distance = Math.hypot(dx, dy);

    // Marble nearby: grow
    if (distance < holeProximityRange && !isFalling) {
      hole.growth = Math.min(hole.growth + holeGrowthRate, hole.maxGrowth);
    } else {
      // Decay when not near marble
      hole.growth = Math.max(hole.growth - holeDecayRate, 0);
    }
  }
  // Do not remove holes - keep them persistent
}

// Get current radius of hole including growth
function getHoleRadius(hole) {
  return hole.baseRadius + hole.growth;
}

// Get alpha based on growth (stronger when larger)
function getHoleAlpha(hole) {
  const radius = getHoleRadius(hole);
  const maxRadius = hole.baseRadius + hole.maxGrowth;
  return 0.3 + (radius / maxRadius) * 0.7;
}

// Handle hole click
function onCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  for (let hole of holes) {
    const dx = clickX - hole.x;
    const dy = clickY - hole.y;
    const distance = Math.hypot(dx, dy);
    const radius = getHoleRadius(hole);

    if (distance < radius) {
      // Strong growth on click
      hole.growth = Math.min(hole.growth + holeStrongGrowthRate, hole.maxGrowth);
      break;
    }
  }
}

// Setup UI event listeners
function setupUI() {
  const input = document.getElementById('thought-input');
  const button = document.getElementById('add-thought-btn');

  button.addEventListener('click', () => {
    addThoughtHole(input.value);
    input.value = '';
    input.blur();
  });

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addThoughtHole(input.value);
      input.value = '';
      input.blur();
    }
  });
}

// Word relationships for generating related thoughts
const wordRelations = {
  'love': ['passion', 'connection', 'warmth'],
  'fear': ['anxiety', 'dread', 'worry'],
  'dream': ['hope', 'vision', 'aspiration'],
  'music': ['harmony', 'rhythm', 'melody'],
  'hope': ['faith', 'optimism', 'light'],
  'pain': ['hurt', 'sorrow', 'ache'],
  'joy': ['happiness', 'delight', 'bliss'],
  'death': ['loss', 'change', 'ending'],
  'life': ['journey', 'existence', 'living'],
  'time': ['moment', 'hours', 'eternity'],
  'beauty': ['grace', 'elegance', 'wonder'],
  'truth': ['honesty', 'reality', 'clarity'],
  'nature': ['earth', 'wild', 'growth'],
  'mind': ['thought', 'reason', 'spirit'],
  'heart': ['love', 'feeling', 'soul']
};

function getRelatedWords(word) {
  const lowerWord = word.toLowerCase();
  if (wordRelations[lowerWord]) {
    return wordRelations[lowerWord];
  }
  // Return null to indicate we need to fetch from API
  return null;
}

// Fetch related words from Datamuse API
async function fetchRelatedWords(word) {
  try {
    const response = await fetch(`https://api.datamuse.com/words?rel_jjb=${word}&max=3`);
    if (!response.ok) throw new Error('API failed');
    const data = await response.json();
    
    if (data.length > 0) {
      return data.slice(0, 3).map(item => item.word);
    }
    
    // Fallback: try another API endpoint for related concepts
    const response2 = await fetch(`https://api.datamuse.com/words?ml=${word}&max=3`);
    if (!response2.ok) throw new Error('API failed');
    const data2 = await response2.json();
    
    if (data2.length > 0) {
      return data2.slice(0, 3).map(item => item.word);
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch related words:', error);
    return null;
  }
}

function hashStringToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMazeGrid(cols, rows, rand) {
  const cells = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      visited: false,
      w: [true, true, true, true], // top,right,bottom,left
    }))
  );

  let cx = 0, cy = 0;
  cells[cy][cx].visited = true;
  const stack = [];

  function neighbors(x, y) {
    const out = [];
    if (y > 0 && !cells[y - 1][x].visited) out.push({ x, y: y - 1, dir: 0 });
    if (x < cols - 1 && !cells[y][x + 1].visited) out.push({ x: x + 1, y, dir: 1 });
    if (y < rows - 1 && !cells[y + 1][x].visited) out.push({ x, y: y + 1, dir: 2 });
    if (x > 0 && !cells[y][x - 1].visited) out.push({ x: x - 1, y, dir: 3 });
    return out;
  }

  function knockDown(x, y, nx, ny, dir) {
    cells[y][x].w[dir] = false;
    cells[ny][nx].w[(dir + 2) % 4] = false;
  }

  while (true) {
    const nbs = neighbors(cx, cy);
    if (nbs.length) {
      const pick = nbs[Math.floor(rand() * nbs.length)];
      stack.push({ x: cx, y: cy });
      knockDown(cx, cy, pick.x, pick.y, pick.dir);
      cx = pick.x; cy = pick.y;
      cells[cy][cx].visited = true;
    } else if (stack.length) {
      const b = stack.pop();
      cx = b.x; cy = b.y;
    } else break;
  }

  return cells;
}

function mazeWallsToRects(cells, rect, t) {
  const rows = cells.length;
  const cols = cells[0].length;
  const cellW = rect.w / cols;
  const cellH = rect.h / rows;
  const out = [];

  // Outer boundary
  out.push({ x: rect.x, y: rect.y, w: rect.w, h: t });
  out.push({ x: rect.x, y: rect.y + rect.h - t, w: rect.w, h: t });
  out.push({ x: rect.x, y: rect.y, w: t, h: rect.h });
  out.push({ x: rect.x + rect.w - t, y: rect.y, w: t, h: rect.h });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      const x0 = rect.x + c * cellW;
      const y0 = rect.y + r * cellH;

      if (cell.w[0]) out.push({ x: x0, y: y0, w: cellW, h: t });                         // top
      if (cell.w[1]) out.push({ x: x0 + cellW - t, y: y0, w: t, h: cellH });              // right
      if (cell.w[2]) out.push({ x: x0, y: y0 + cellH - t, w: cellW, h: t });              // bottom
      if (cell.w[3]) out.push({ x: x0, y: y0, w: t, h: cellH });                          // left
    }
  }
  return out;
}


function generateBoard() {
  // Cover entire screen with minimal margins
  const margin = 10;

  const mazeRect = {
    x: margin,
    y: margin,
    w: cw() - margin * 2,
    h: ch() - margin * 2
  };

  const seed = hashStringToSeed(`depth:${depth}`);
  const rand = mulberry32(seed);

  const targetCell = 80; // smaller = denser walls
  const cols = Math.max(10, Math.floor(mazeRect.w / targetCell));
  const rows = Math.max(8,  Math.floor(mazeRect.h / targetCell));

  const thickness = 12;

  const cells = generateMazeGrid(cols, rows, rand);
  const newWalls = mazeWallsToRects(cells, mazeRect, thickness);

  // Reset holes for each new level
  const newHoles = [];

  return { walls: newWalls, holes: newHoles, mazeRect };
}

// Save current board and load new one
async function nextLevel() {
  // Prevent calling nextLevel multiple times
  if (levelTransitioning) return;
  levelTransitioning = true;
  
  boards.push({ walls, holes, depth });
  depth++;

  const newBoard = generateBoard();
  walls = newBoard.walls;
  
  // If we fell into a thought hole, generate 3 related thoughts
  if (lastFallenHole) {
    let relatedWords = getRelatedWords(lastFallenHole.label);
    
    // If not in predefined relations, fetch from API
    if (!relatedWords) {
      relatedWords = await fetchRelatedWords(lastFallenHole.label);
    }
    
    // If still no related words, use generic fallback
    if (!relatedWords) {
      relatedWords = [
        lastFallenHole.label + "ness",
        lastFallenHole.label + "ing",
        lastFallenHole.label + "ful"
      ].map(w => w.slice(0, 20)).filter(w => w.length > lastFallenHole.label.length && w.length <= 20);
    }
    
    // Ensure we only have 3 related words max
    relatedWords = relatedWords.slice(0, 3);
    
    // Filter out duplicate words that already exist
    const existingLabels = new Set(holes.map(h => h.label.toLowerCase()));
    relatedWords = relatedWords.filter(word => !existingLabels.has(word.toLowerCase()));
    
    // Keep existing holes and add exactly 3 new related thought holes
    for (let i = 0; i < relatedWords.length && i < 3; i++) {
      const position = findValidHolePosition();
      if (position) {
        holes.push({
          x: position.x,
          y: position.y,
          baseRadius: position.baseRadius,
          label: relatedWords[i],
          color: generateRandomColor(),
          growth: 0,
          maxGrowth: 40
        });
      }
    }
    
    lastFallenHole = null; // Reset for next time
  }

  // spawn point derived from maze rect (safe)
  const spawnX = newBoard.mazeRect.x + 40;
  const spawnY = newBoard.mazeRect.y + 40;

  marble.x = spawnX;
  marble.y = spawnY;
  marble.vx = 0;
  marble.vy = 0;
  marble.fadeAlpha = 255;
  isFalling = false;
  fadeTimer = 0;
  levelTransitioning = false; // Allow next level transition
}

// // Check hole collisions
// function checkHoleCollisions() {
//   for (let hole of holes) {
//     const dx = marble.x - hole.x;
//     const dy = marble.y - hole.y;
//     const distance = Math.hypot(dx, dy);
//     const radius = getHoleRadius(hole);
    
//     if (distance < radius + holeThreshold) {
//       isFalling = true;
//       fadeTimer = 0;
//     }
//   }
// }

function checkHoleCollisions() {
  for (let hole of holes) {
    const dx = marble.x - hole.x;
    const dy = marble.y - hole.y;
    const distance = Math.hypot(dx, dy);
    const hr = getHoleRadius(hole);

    // fall only when the marble center is well inside the hole
    if (distance < (hr - marble.radius * FALL_K)) {
      isFalling = true;
      fadeTimer = 0;
      lastFallenHole = hole; // Track which hole was fallen into
      return;
    }
  }
}

// Update marble physics
function updateMarble() {
  if (isFalling) {
    fadeTimer += fadeSpeed;
    marble.fadeAlpha = Math.max(0, 255 - fadeTimer);
    
    if (fadeTimer >= 255) {
      nextLevel();
    }
    return;
  }

  // Apply acceleration based on tilt
  marble.vx += tiltX * acceleration;
  marble.vy += tiltY * acceleration;

  // Clamp velocity to max speed
  const speed = Math.hypot(marble.vx, marble.vy);
  if (speed > maxVelocity) {
    marble.vx = (marble.vx / speed) * maxVelocity;
    marble.vy = (marble.vy / speed) * maxVelocity;
  }

  // Apply friction
  marble.vx *= friction;
  marble.vy *= friction;

  // Update position
  marble.x += marble.vx;
  marble.y += marble.vy;

  // Check wall collisions
  checkWallCollisions();

  // Check hole collisions
  checkHoleCollisions();

  // Update hole growth/decay
  updateHolesGrowth();

  // Keep within bounds
  if (marble.x - marble.radius < 0) {
    marble.x = marble.radius;
    marble.vx = 0;
  }
  if (marble.x + marble.radius > cw()) {
    marble.x = cw() - marble.radius;
    marble.vx = 0;
  }
  if (marble.y - marble.radius < 0) {
    marble.y = marble.radius;
    marble.vy = 0;
  }
  if (marble.y + marble.radius > ch()) {
    marble.y = ch() - marble.radius;
    marble.vy = 0;
  }
}

// Check wall collisions
function checkWallCollisions() {
  for (let wall of walls) {
    // Find closest point on rectangle to circle center
    const closestX = Math.max(wall.x, Math.min(marble.x, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(marble.y, wall.y + wall.h));

    // Distance between circle center and closest point
    const dx = marble.x - closestX;
    const dy = marble.y - closestY;
    const distance = Math.hypot(dx, dy);

    // Collision detected
    if (distance < marble.radius) {
      // Normalize collision vector
      const nx = dx / distance || 0;
      const ny = dy / distance || 0;

      // Push marble out of wall
      const overlap = marble.radius - distance;
      marble.x += nx * overlap;
      marble.y += ny * overlap;

      // Reflect velocity along collision normal
      const dotProduct = marble.vx * nx + marble.vy * ny;
      marble.vx = (marble.vx - 2 * dotProduct * nx) * 0.8;
      marble.vy = (marble.vy - 2 * dotProduct * ny) * 0.8;
    }
  }
}

// Draw scene
function draw() {
  // Background - solid black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, cw(), ch());

  // Draw walls
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  for (let wall of walls) {
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
  }

  // Draw wall shadows
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  for (let wall of walls) {
    ctx.fillRect(wall.x + 3, wall.y + 3, wall.w, wall.h);
  }

  // Draw holes
  for (let hole of holes) {
    const radius = getHoleRadius(hole);
    const alpha = getHoleAlpha(hole);

    // Hole shadow
    ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * alpha})`;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Hole rim - use hole's random color
    ctx.strokeStyle = hole.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Hole label
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hole.label, hole.x, hole.y);
  }

  // Draw marble at current position
  const centerX = marble.x;
  const centerY = marble.y;
  const radius = marble.radius;

  // Marble shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(centerX, centerY + radius + 10, radius * 1.2, radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Marble body with fade
  const marbleGradient = ctx.createRadialGradient(centerX - 10, centerY - 10, 5, centerX, centerY, radius);
  marbleGradient.addColorStop(0, '#ff6b9d');
  marbleGradient.addColorStop(0.7, '#c44569');
  marbleGradient.addColorStop(1, '#8b2d5f');
  ctx.fillStyle = marbleGradient;
  ctx.globalAlpha = marble.fadeAlpha / 255;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Marble highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(centerX - 12, centerY - 12, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Draw depth display
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Depth: ${depth}`, 20, 20);
}

// Animation loop
function animate() {
  updateTilt();
  updateMarble();
  draw();
  requestAnimationFrame(animate);
}

// Handle keyboard input
function updateTilt() {
  tiltX = 0;
  tiltY = 0;

  // WASD controls
  if (keys['w'] || keys['ArrowUp']) tiltY = -1;
  if (keys['s'] || keys['ArrowDown']) tiltY = 1;
  if (keys['a'] || keys['ArrowLeft']) tiltX = -1;
  if (keys['d'] || keys['ArrowRight']) tiltX = 1;
}

// Event listeners
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  keys[e.key] = true;
  updateTilt();
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
  keys[e.key] = false;
  updateTilt();
});

window.addEventListener('resize', resizeCanvas);

// Click handler for holes
canvas.addEventListener('click', onCanvasClick);

// Initial setup
resizeCanvas();
setupUI();
animate();

