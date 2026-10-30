import * as THREE from 'three';

const params = new URLSearchParams(location.search);
const matchId = params.get('match');
const gameName = params.get('game') || 'ludo';

const PLAYER_COLORS = { red: 0xe74c3c, green: 0x2ecc71, yellow: 0xf1c40f, blue: 0x3498db };
const PLAYERS = ['red', 'green', 'yellow', 'blue'];
const STARTS = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const MAIN_TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0]
];

const BASE_POS = {
  red: [[1,1],[1,4],[4,1],[4,4]],
  green: [[1,10],[1,13],[4,10],[4,13]],
  yellow: [[10,10],[10,13],[13,10],[13,13]],
  blue: [[10,1],[10,4],[13,1],[13,4]],
};

const HOME_COL = {
  red: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,7]],
  green: [[1,7],[2,7],[3,7],[4,7],[5,7],[7,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,7]],
  blue: [[13,7],[12,7],[11,7],[10,7],[9,7],[7,7]],
};

const SIZE = 15;
const toWorld = (r, c) =>
  new THREE.Vector3((c - SIZE / 2 + 0.5), 0, (r - SIZE / 2 + 0.5));

const getPlayerForPos = (player, pos) => {
  if (pos < 0) return null;
  if (pos <= 50) return MAIN_TRACK[(STARTS[player] + pos) % 52];
  return HOME_COL[player][pos - 51];
};

const isSafe = (player, pos) => {
  if (pos < 0 || pos > 50) return true;
  return SAFE.has((STARTS[player] + pos) % 52);
};

// --- state ---
const state = {
  me: null, match: null,
  tokens: { red: [-1,-1,-1,-1], green: [-1,-1,-1,-1], yellow: [-1,-1,-1,-1], blue: [-1,-1,-1,-1] },
  currentPlayer: 'red',
  dice: null,
  myColor: 'red',
  finished: false,
  awaitingRoll: true,
};

// --- three.js setup ---
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientWidth);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d18);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 18, 14);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(8, 20, 10);
dir.castShadow = true;
scene.add(dir);

const board = new THREE.Mesh(
  new THREE.BoxGeometry(15, 0.4, 15),
  new THREE.MeshStandardMaterial({ color: 0x1a1f35, roughness: 0.7 })
);
board.position.y = -0.2;
board.receiveShadow = true;
scene.add(board);

MAIN_TRACK.forEach(([r, c], i) => {
  const safe = SAFE.has(i);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.1, 0.9),
    new THREE.MeshStandardMaterial({
      color: safe ? 0x6ea8ff : 0x2a3350,
      emissive: safe ? 0x1a3a66 : 0x000000,
      roughness: 0.6,
    })
  );
  const p = toWorld(r, c);
  mesh.position.set(p.x, 0.05, p.z);
  mesh.receiveShadow = true;
  scene.add(mesh);
});

Object.entries(HOME_COL).forEach(([player, cells]) => {
  cells.forEach(([r, c]) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.1, 0.9),
      new THREE.MeshStandardMaterial({
        color: PLAYER_COLORS[player],
        emissive: PLAYER_COLORS[player],
        emissiveIntensity: 0.2,
        roughness: 0.5,
      })
    );
    const p = toWorld(r, c);
    mesh.position.set(p.x, 0.06, p.z);
    scene.add(mesh);
  });
});

Object.entries(BASE_POS).forEach(([player, cells]) => {
  const cx = cells.reduce((s, [r]) => s + r, 0) / 4;
  const cz = cells.reduce((s, [, c]) => s + c, 0) / 4;
  const center = toWorld(cx, cz);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.1, 2.6),
    new THREE.MeshStandardMaterial({
      color: PLAYER_COLORS[player], transparent: true, opacity: 0.35,
    })
  );
  mesh.position.set(center.x, 0.07, center.z);
  scene.add(mesh);
});

const tokenMeshes = {};
PLAYERS.forEach(p => {
  tokenMeshes[p] = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 24, 16),
      new THREE.MeshStandardMaterial({
        color: PLAYER_COLORS[p], roughness: 0.25, metalness: 0.3,
        emissive: PLAYER_COLORS[p], emissiveIntensity: 0.15,
      })
    );
    mesh.castShadow = true;
    mesh.userData = { player: p, idx: i };
    mesh.position.y = 0.35;
    scene.add(mesh);
    tokenMeshes[p].push(mesh);
  }
});

function renderTokens() {
  PLAYERS.forEach(p => {
    state.tokens[p].forEach((pos, i) => {
      const mesh = tokenMeshes[p][i];
      if (pos === 56) { mesh.visible = false; return; }
      mesh.visible = true;
      const cell = pos < 0 ? BASE_POS[p][i] : getPlayerForPos(p, pos);
      const w = toWorld(cell[0], cell[1]);
      mesh.position.set(w.x, 0.35, w.z);
    });
  });
}

function resize() {
  const w = canvas.clientWidth;
  renderer.setSize(w, w);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

(function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
})();

// --- networking ---
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/ws';
let socket = null;
let reconnectTimer = null;
let backoff = 1000;

function connect() {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    backoff = 1000;
    socket.send(JSON.stringify({ type: 'join', matchId }));
    document.getElementById('opp').textContent = state.match?.player_b
      ? `vs player #${state.match.player_b}`
      : 'waiting for opponent…';
  };

  socket.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'move' && msg.from !== state.me.id) {
      applyMove(msg.payload.player, msg.payload.idx, msg.payload.newPos);
      renderTokens();
    }
  };

  socket.onclose = () => {
    document.getElementById('opp').textContent = 'reconnecting…';
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 15000);
  };

  socket.onerror = () => socket.close();
}

function sendMove(player, idx, newPos) {
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify({ type: 'move', payload: { player, idx, newPos } }));
  }
}

// --- game logic ---
function canMove(player, pos, roll) {
  if (pos < 0) return roll === 6;
  if (pos + roll > 56) return false;
  return true;
}

function applyMove(player, idx, newPos) {
  state.tokens[player][idx] = newPos;
  if (newPos >= 0 && newPos <= 50 && !isSafe(player, newPos)) {
    const [r, c] = getPlayerForPos(player, newPos);
    for (const other of PLAYERS) {
      if (other === player) continue;
      state.tokens[other].forEach((op, oi) => {
        if (op < 0 || op > 50) return;
        const [orr, occ] = getPlayerForPos(other, op);
        if (orr === r && occ === c) state.tokens[other][oi] = -1;
      });
    }
  }
  if (state.tokens[player].every(p => p === 56)) finishMatch(player);
}

async function finishMatch(winnerColor) {
  state.finished = true;
  document.getElementById('roll').disabled = true;
  document.getElementById('opp').textContent = `${winnerColor} wins!`;
  const winnerId = (state.myColor === winnerColor) ? state.me.id : state.match.player_b;
  try {
    await fetch(`/api/games/${matchId}/finish`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner_id: winnerId }),
    });
  } catch {}
}

// --- token click picking ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pickToken(ev) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(tokenMeshes[state.myColor], false);
  if (!hits.length) return null;
  return hits[0].object.userData;
}

canvas.addEventListener('click', (ev) => {
  if (state.finished || state.dice === null) return;
  const hit = pickToken(ev);
  if (!hit) return;
  const pos = state.tokens[hit.player][hit.idx];
  if (!canMove(hit.player, pos, state.dice)) return;
  const newPos = pos < 0 ? 0 : pos + state.dice;
  applyMove(hit.player, hit.idx, newPos);
  renderTokens();
  sendMove(hit.player, hit.idx, newPos);
  state.dice = null;
  document.getElementById('dice').textContent = '?';
  document.getElementById('roll').disabled = false;
});

// --- roll button ---
document.getElementById('roll').onclick = () => {
  if (state.finished || state.dice !== null) return;
  const d = 1 + Math.floor(Math.random() * 6);
  state.dice = d;
  document.getElementById('dice').textContent = d;

  const movable = state.tokens[state.myColor]
    .map((pos, i) => canMove(state.myColor, pos, d) ? i : -1)
    .filter(i => i >= 0);

  if (!movable.length) {
    state.dice = null;
    document.getElementById('roll').disabled = false;
    return;
  }
  if (movable.length === 1) {
    const idx = movable[0];
    const pos = state.tokens[state.myColor][idx];
    const newPos = pos < 0 ? 0 : pos + d;
    applyMove(state.myColor, idx, newPos);
    renderTokens();
    sendMove(state.myColor, idx, newPos);
    state.dice = null;
    document.getElementById('dice').textContent = '?';
    document.getElementById('roll').disabled = false;
  }
};

document.getElementById('back').onclick = () => location.href = '/lobby.html';

// --- bootstrap ---
(async () => {
  const me = await fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json());
  state.me = me.user;
  document.getElementById('bal').textContent = me.user.balance;

  const m = await fetch(`/api/games/${matchId}`, { credentials: 'include' }).then(r => r.json());
  state.match = m.match;
  state.myColor = (me.user.id === m.match.player_a) ? 'red' : 'green';

  renderTokens();
  connect();
})();
