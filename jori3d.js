import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceMotion = false; // 전시용: 기기의 '동작 줄이기' 설정과 상관없이 움직임을 켠다
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
                set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } } };

/* ---------- tooltips: hover on desktop, tap on touch ---------- */
const tip = $('#tip');
let tipFor = null, tipTimer = 0;
function placeTip(el, x, y) {
  const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  const cx = x ?? r.left + r.width / 2, cy = y ?? r.top;
  let top = cy - th - 14;
  if (top < 8) top = (y ?? r.bottom) + 18;
  tip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, cx - tw / 2)) + 'px';
  tip.style.top = Math.min(innerHeight - th - 8, top) + 'px';
}
function showTip(el, x, y) { tip.innerHTML = el.dataset.tip; tipFor = el; tip.classList.add('show'); placeTip(el, x, y); }
function hideTip() { tip.classList.remove('show'); tipFor = null; }
document.addEventListener('pointerover', e => {
  if (e.pointerType === 'touch') return;
  const el = e.target.closest('[data-tip]'); if (el && el !== tipFor) showTip(el, e.clientX, e.clientY);
});
document.addEventListener('pointermove', e => { if (tipFor && e.pointerType !== 'touch') placeTip(tipFor, e.clientX, e.clientY); });
document.addEventListener('pointerout', e => {
  const el = e.target.closest('[data-tip]');
  if (el && !el.contains(e.relatedTarget)) { const next = e.relatedTarget?.closest?.('[data-tip]'); if (!next) hideTip(); }
});
document.addEventListener('pointerup', e => {
  if (e.pointerType !== 'touch') return;
  const el = e.target.closest('[data-tip]');
  clearTimeout(tipTimer);
  if (el) { showTip(el); tipTimer = setTimeout(hideTip, 3400); } else hideTip();
});
document.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
document.addEventListener('focusout', hideTip);
addEventListener('scroll', hideTip, { passive: true });

/* ---------- page theme: follows the system until someone picks one ---------- */
const root = document.documentElement, darkMq = matchMedia('(prefers-color-scheme: dark)');
const effectiveTheme = () => root.dataset.theme || (darkMq.matches ? 'dark' : 'light');
const syncTheme = () => $$('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === effectiveTheme())));
if (!root.dataset.theme && store.get('jori-theme')) root.dataset.theme = store.get('jori-theme');
syncTheme(); darkMq.addEventListener('change', syncTheme);
$$('[data-theme-set]').forEach(b => b.addEventListener('click', () => { root.dataset.theme = b.dataset.themeSet; store.set('jori-theme', b.dataset.themeSet); syncTheme(); }));

/* ---------- turnaround rows ---------- */
const turn = $('#turnaround');
function setRows(r) { turn.dataset.rows = r; $$('button[data-rows]', turn).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.rows === r))); }
let rowsChosen = false;
$$('button[data-rows]', turn).forEach(b => b.addEventListener('click', () => { rowsChosen = true; setRows(b.dataset.rows); }));
// tall screens leave room above the strip: show colour and mesh rows together until someone picks a tab
const tgridEl = $('.tgrid', turn);
new ResizeObserver(() => {
  if (rowsChosen || !tgridEl.clientWidth) return;
  const figure = (tgridEl.clientWidth / 6 - 6) * 840 / 432;          // one figure's height at the strip's width
  setRows(tgridEl.clientHeight >= figure * 1.75 + 40 ? 'both' : 'shaded');
}).observe(tgridEl);

/* ---------- degree ruler (ticks every 15°, labels every 45°) ---------- */
const ruler = $('#ruler'), rhead = $('#rhead');
for (let d = 0; d <= 360; d += 15) {
  const t = document.createElement('div'); t.className = 'tick' + (d % 45 ? ' minor' : ''); t.style.left = (d / 360 * 100) + '%'; ruler.append(t);
  if (d % 45 === 0) {
    const l = document.createElement('div'); l.className = 'deg' + (d === 0 ? ' edge-l' : d === 360 ? ' edge-r' : '') + (d % 90 ? ' odd' : '');
    l.textContent = String(d).padStart(3, '0') + '°'; l.style.left = (d / 360 * 100) + '%'; ruler.append(l);
  }
}
const VIEW_ANGLES = $$('.view', turn).map(v => Number(v.dataset.angle));

/* ---------- 3D ---------- */
const viewer = $('#viewer'), canvas = $('#stage'), statusEl = $('#vstatus'), badge = $('#vbadge'), degEl = $('#vdeg');
const status = msg => { statusEl.textContent = msg; };
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  status('이 브라우저에서는 3D를 켤 수 없어 정면 이미지만 보여 준다.');
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); // 전시용 아이패드(미니 5세대)에서 덜 버벅이게 2배 대신 1.5배
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const TARGET = new THREE.Vector3(0, 0.091, 0);
const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 10);
scene.add(camera);
// lights ride with the camera, so every angle is lit like the board renders (turntable, not orbiting sun)
const key = new THREE.DirectionalLight(0xfff0e0, 2.1); key.position.set(-0.45, 0.55, 0.6); camera.add(key);
const fill = new THREE.DirectionalLight(0xe2eaff, 0.55); fill.position.set(0.6, 0.05, 0.35); camera.add(fill);
const rim = new THREE.DirectionalLight(0xffd6a8, 1.5); rim.position.set(0.25, 0.45, -0.7); camera.add(rim);
key.target = rim.target = fill.target = new THREE.Object3D(); camera.add(key.target); key.target.position.set(0, 0, -0.55);

// a plain wheel scrolls the page; ⌘/Ctrl + wheel (or a trackpad pinch, which arrives as ctrl+wheel) zooms
viewer.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); }, { capture: true });
const controls = new OrbitControls(camera, canvas);
controls.target.copy(TARGET);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
controls.minDistance = 0.2; controls.maxDistance = 0.95;
controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.78;
controls.autoRotateSpeed = -6.5;               // about 9 s a turn; negative: angle counts up 0° → 45° → 90° like the turnaround order
const REST = { az: -14, polar: 82, dist: 0.56 };   // a little off-axis at rest, so the volume reads
function placeCamera(azDeg, polarDeg, dist) {
  const s = new THREE.Spherical(dist, THREE.MathUtils.degToRad(polarDeg), THREE.MathUtils.degToRad(azDeg));
  camera.position.copy(TARGET).add(new THREE.Vector3().setFromSpherical(s)); controls.update();
}
placeCamera(REST.az, REST.polar, REST.dist);
const azDeg = () => ((THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()) % 360) + 360) % 360;
let tween = null;
function turnTo(deg, ms = 650) {
  const from = azDeg(); const d = ((deg - from + 540) % 360) - 180;
  tween = { from, d, t0: performance.now(), ms: reduceMotion ? 0 : ms };
}
function applyAz(deg) {
  const off = camera.position.clone().sub(controls.target); const s = new THREE.Spherical().setFromVector3(off);
  s.theta = THREE.MathUtils.degToRad(deg); off.setFromSpherical(s); camera.position.copy(controls.target).add(off); controls.update();
}

// soft contact shadow
const sh = document.createElement('canvas'); sh.width = sh.height = 128;
{ const g = sh.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(20,12,6,.42)'); gr.addColorStop(1, 'rgba(20,12,6,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.12), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.0004; scene.add(shadow);

/* spin control */
const spinBtn = $('#spin'), spinIco = $('#spin-ico');
let spinOn = !reduceMotion, resumeAt = 0;
function setSpin(on) {
  spinOn = on; controls.autoRotate = on; spinBtn.setAttribute('aria-pressed', String(on));
  spinIco.setAttribute('d', on ? 'M7 5h4v14H7zm6 0h4v14h-4z' : 'M8 5v14l11-7z');
}
setSpin(spinOn);
spinBtn.addEventListener('click', () => setSpin(!spinOn));
$('#front').addEventListener('click', () => { setSpin(false); userZoomed = false; fit(); turnTo(REST.az < 0 ? 360 + REST.az : REST.az); });
controls.addEventListener('start', () => { controls.autoRotate = false; tween = null; });
controls.addEventListener('end', () => { resumeAt = performance.now() + 2600; });

/* ---------- models ---------- */
const loader = new GLTFLoader();
// the artifact host serves text, not .glb/.bin, so the binaries ship as base64 text and are decoded here
async function fetchBin(url) {
  const text = (await (await fetch(url)).text()).trim();
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(text).buffer;
  const bin = atob(text), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
const loadGlb = async url => loader.parseAsync(await fetchBin(url), '');
const texLoader = new THREE.TextureLoader();
const loadTex = (url, srgb) => texLoader.loadAsync(url).then(t => { t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
const CLAY = 0xb4aea7, BASE = 0xd9d4cd, INK = 0x1b1511;
let mode = 'tex', pose = '', figure = null, rig = null, rigLoading = null, ready = false;

async function loadFigure() {
  const [gltf, map, rough, normal, quadBuf, anchors] = await Promise.all([
    loadGlb('assets/jori_figure.glb.txt'), loadTex('assets/jori_color.jpg', true), loadTex('assets/jori_rough.jpg'),
    loadTex('assets/jori_normal.jpg'), fetchBin('assets/jori_quads.bin.txt'), fetch('assets/anchors.json').then(r => r.json())]);
  let mesh; gltf.scene.traverse(n => { if (n.isMesh) mesh = n; });
  const mats = {
    tex: new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0, normalMap: normal, normalScale: new THREE.Vector2(0.6, 0.6) }),
    clay: new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.62, metalness: 0 }),
    wire: new THREE.MeshStandardMaterial({ color: BASE, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    support: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }),
  };
  const qg = new THREE.BufferGeometry(); qg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(quadBuf), 3));
  const lines = new THREE.LineSegments(qg, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.6 }));
  lines.visible = false;
  const group = new THREE.Group(); group.add(gltf.scene, lines); scene.add(group);
  return { group, mesh, mats, lines, anchors };
}

// face ink + mirrored lip texels, copied from the app's jori-face-material.js so the rig looks the same as in the app
function readableFace(material) {
  if (!material.map) return material;
  const copy = material.clone();
  copy.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec2 _jori_mirror_uv; varying vec2 vJoriMirrorUv; varying vec3 vJoriBindPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvJoriBindPosition = position; vJoriMirrorUv = _jori_mirror_uv;');
    shader.fragmentShader = 'varying vec2 vJoriMirrorUv; varying vec3 vJoriBindPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 fp=vJoriBindPosition;
      float lip=(1.0-smoothstep(0.046,0.065,abs(fp.x+0.023)))*(1.0-smoothstep(0.022,0.034,abs(fp.y-0.718)))*smoothstep(0.28,0.31,fp.z);
      float symmetry=step(-0.0252,fp.x)*(1.0-smoothstep(0.051,0.066,abs(fp.x+0.0252)))*(1.0-smoothstep(0.028,0.039,abs(fp.y-0.718)))*smoothstep(0.29,0.32,fp.z);
      diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(map,vJoriMirrorUv).rgb,symmetry);
      float browX=min(abs(fp.x-0.144),abs(fp.x+0.176));
      float brow=(1.0-smoothstep(0.044,0.066,browX))*(1.0-smoothstep(0.021,0.030,abs(fp.y-0.977)))*smoothstep(0.21,0.27,fp.z);
      float luminance=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
      float ink=1.0-smoothstep(0.19,0.31,luminance);
      diffuseColor.rgb*=1.0-max(lip*0.42,brow*0.58)*ink;
      // board page only: soften the highlights painted into the texture (the app keeps the original)
      float hl=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
      diffuseColor.rgb*=mix(1.0,0.84,smoothstep(0.6,0.95,hl));`);
  };
  copy.customProgramCacheKey = () => 'jori-face-ink-v2-soft';
  copy.toneMapped = false;     // baked, unlit colours: keep them as painted
  return copy;
}

// face presets from the app's jori-expressions.js
const EXPRESSION = { Greeting: 'smile', Speaking: 'smile', Celebrate: 'smile', PointRight: 'smile', Listening: 'focus', Observing: 'focus', Thinking: 'thinking', Error: 'thinking' };
function faceTargets(clip, time) {
  const ex = EXPRESSION[clip] || 'neutral';
  const t = { blinkLeft: 0, blinkRight: 0, mouthClosed: 1, mouthOpen: 0, smile: 0.65, happy: 0, mouthRound: 0, sad: 0, browRaise: 0, browThink: 0, focus: 0 };
  if (ex === 'smile') { t.smile = 0.8; t.happy = 0.9; t.mouthClosed = 0; t.mouthOpen = 0.25; }
  if (ex === 'focus') t.focus = 0.65;
  if (ex === 'thinking') t.browThink = 0.8;
  const phase = time % 4.1, blink = phase < 0.16 ? Math.sin(phase / 0.16 * Math.PI) : 0;
  t.blinkLeft = t.blinkRight = blink;
  if (clip === 'Speaking') { t.mouthClosed = 0; t.happy = 0.55; t.mouthOpen = 0.18 + 0.6 * Math.pow(Math.sin(time * 12), 2); }
  return t;
}

async function loadRig() {
  const g = await loadGlb('assets/jori_rig.glb.txt');
  const model = g.scene; model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const s = 0.18 / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
  const meshes = []; model.traverse(n => { if (n.isMesh) meshes.push(n); });
  for (const m of meshes) {
    m.frustumCulled = false;
    m.userData.tex = readableFace(m.material);
    m.userData.clay = new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.62, metalness: 0 });
    m.userData.base = new THREE.MeshStandardMaterial({ color: BASE, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    // a second skinned mesh on the same skeleton draws the triangle wire over the clay
    const w = new THREE.SkinnedMesh(m.geometry, new THREE.MeshBasicMaterial({ color: INK, wireframe: true, transparent: true, opacity: 0.3 }));
    w.bind(m.skeleton, m.bindMatrix);
    w.morphTargetInfluences = m.morphTargetInfluences; w.morphTargetDictionary = m.morphTargetDictionary;
    w.position.copy(m.position); w.quaternion.copy(m.quaternion); w.scale.copy(m.scale);
    w.frustumCulled = false; w.visible = false; m.parent.add(w); m.userData.wire = w;
  }
  const group = new THREE.Group(); group.add(model); group.visible = false; scene.add(group);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(g.animations.map(c => [c.name, mixer.clipAction(c)]));
  return { group, meshes, mixer, actions, faces: meshes.filter(m => m.morphTargetInfluences), current: null };
}

/* ---------- display mode ---------- */
const MODE_LABEL = { tex: '컬러', clay: '형태', wire: '면 구조', support: '받침대' };
function applyMode() {
  if (figure) { figure.mesh.material = figure.mats[mode]; figure.lines.visible = mode === 'wire'; }
  if (rig) for (const m of rig.meshes) {
    m.material = mode === 'tex' ? m.userData.tex : mode === 'wire' ? m.userData.base : m.userData.clay;
    m.userData.wire.visible = mode === 'wire';
  }
  $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  updateBadge();
}
function setMode(m) {
  if (m === 'support' && pose) setPose('');   // the support map belongs to the print figure
  mode = m; applyMode();
}
$$('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

/* ---------- pose ---------- */
const POSE_LABEL = Object.fromEntries($$('[data-pose]').map(b => [b.dataset.pose, b.textContent.trim()]));
function updateBadge() {
  badge.textContent = pose ? `앱 모델 · ${POSE_LABEL[pose]} · ${MODE_LABEL[mode]}` : `피규어 · ${MODE_LABEL[mode]}`;
  $('[data-mode="support"]').disabled = false;
}
async function setPose(name) {
  pose = name;
  $$('[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pose === name)));
  if (!name) {
    if (figure) figure.group.visible = true;
    if (rig) rig.group.visible = false;
    updateBadge(); return;
  }
  if (mode === 'support') { mode = 'tex'; applyMode(); }
  if (!rig) {
    status('움직이는 앱 모델 불러오는 중…');
    try { rig = await (rigLoading ||= loadRig()); } catch (err) { status('앱 모델을 불러오지 못했다. 새로고침하면 다시 시도한다.'); console.warn(err); return; }
    status(''); applyMode();
  }
  if (pose !== name) return;            // another chip was pressed while loading
  if (figure) figure.group.visible = false;
  rig.group.visible = true;
  const next = rig.actions.get(name) || rig.actions.get('Idle');
  if (rig.current !== next) { rig.current?.fadeOut(0.25); next.reset().fadeIn(0.25).play(); rig.current = next; }
  updateBadge();
}
$$('[data-pose]').forEach(b => b.addEventListener('click', () => setPose(b.dataset.pose)));

/* ---------- links from the board into the viewer ---------- */
function bringViewer() { const r = viewer.getBoundingClientRect(); if (r.bottom < 80 || r.top > innerHeight - 80) viewer.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); }
$$('[data-action]').forEach(el => el.addEventListener('click', () => {
  const [kind, val] = el.dataset.action.split(':');
  if (kind === 'mode') { if (val !== 'support' || true) setMode(val); bringViewer(); }
}));
$$('.view', turn).forEach(v => v.addEventListener('click', () => { setSpin(false); turnTo(Number(v.dataset.angle)); bringViewer(); }));

/* ruler: drag, click, keys */
function rulerDeg(e) { const r = ruler.getBoundingClientRect(); return Math.max(0, Math.min(359.9, (e.clientX - r.left) / r.width * 360)); }
let dragging = false;
ruler.addEventListener('pointerdown', e => { dragging = true; ruler.setPointerCapture(e.pointerId); setSpin(false); tween = null; applyAz(rulerDeg(e)); hideTip(); });
ruler.addEventListener('pointermove', e => { if (dragging) applyAz(rulerDeg(e)); });
ruler.addEventListener('pointerup', () => { dragging = false; });
ruler.addEventListener('keydown', e => {
  const step = e.shiftKey ? 45 : 15;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setSpin(false); turnTo(azDeg() + (e.key === 'ArrowRight' ? step : -step), 250); }
});

/* ---------- hotspots ---------- */
const hots = $$('.hot').map(el => ({ el, key: el.dataset.hot }));
const tmp = new THREE.Vector3(), nrm = new THREE.Vector3(), toCam = new THREE.Vector3();
function updateHotspots(w, h) {
  const show = figure && !pose && ready;
  for (const hs of hots) {
    const a = show && figure.anchors[hs.key];
    if (!a) { hs.el.hidden = true; continue; }
    tmp.fromArray(a.p); nrm.fromArray(hs.key === 'neck' ? [0.45, 0, 0.9] : a.n).normalize();
    toCam.copy(camera.position).sub(tmp).normalize();
    const facing = nrm.dot(toCam) > 0.2;
    tmp.project(camera);
    hs.el.hidden = !facing;
    if (facing) { hs.el.style.left = ((tmp.x + 1) / 2 * w) + 'px'; hs.el.style.top = ((1 - tmp.y) / 2 * h) + 'px'; }
  }
}

/* ---------- size, visibility, loop ---------- */
// fit the 18 cm figure between the badge and the control bar, at any panel shape
let W = 0, H = 0, visible = true, userZoomed = false;
canvas.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) userZoomed = true; }, { passive: true });
canvas.addEventListener('touchstart', e => { if (e.touches.length > 1) userZoomed = true; }, { passive: true });
function fit() {
  const r = viewer.getBoundingClientRect(); W = r.width; H = r.height; if (!W || !H) return;
  renderer.setSize(W, H, false); camera.aspect = W / H;
  const bottom = 64, top = $('.vtop', viewer).offsetHeight + 16;   // degree readout below, status + buttons above
  const usable = Math.max(120, H - bottom - top), shift = Math.round((bottom - top) / 2);
  if (shift > 0) camera.setViewOffset(W, H + 2 * shift, 0, 2 * shift, W, H); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  REST.dist = Math.min(0.95, Math.max(0.3, 0.104 / t * H / usable, 0.064 / (t * (W / H))));
  if (!userZoomed) { const off = camera.position.clone().sub(controls.target).setLength(REST.dist); camera.position.copy(controls.target).add(off); controls.update(); }
}
new ResizeObserver(fit).observe(viewer);
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(viewer);

const timer = new THREE.Timer();
let lastDeg = -1, lastView = null;
function frame(now) {
  requestAnimationFrame(frame);
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  if (!visible || document.hidden || !W) return;
  if (!controls.autoRotate && spinOn && !dragging && !tween && resumeAt && now > resumeAt) { controls.autoRotate = true; resumeAt = 0; }
  if (tween) {
    const k = tween.ms ? Math.min(1, (now - tween.t0) / tween.ms) : 1;
    applyAz(tween.from + tween.d * (1 - Math.pow(1 - k, 3)));
    if (k >= 1) tween = null;
  }
  controls.update(dt);
  if (rig && rig.group.visible) {
    rig.mixer.update(dt);
    const ft = faceTargets(pose, timer.getElapsed());
    for (const m of rig.faces) for (const [name, v] of Object.entries(ft)) {
      const i = m.morphTargetDictionary[name];
      if (i !== undefined) m.morphTargetInfluences[i] += (v - m.morphTargetInfluences[i]) * Math.min(1, dt * 12);
    }
  }
  renderer.render(scene, camera);
  updateHotspots(W, H);
  const d = azDeg(), shown = Math.round(d) % 360;
  if (shown !== lastDeg) {
    lastDeg = shown;
    degEl.textContent = String(shown).padStart(3, '0') + '°';
    rhead.style.left = (d / 360 * 100) + '%';
    ruler.setAttribute('aria-valuenow', String(shown));
    let best = 0, bestD = 999;
    VIEW_ANGLES.forEach((a, i) => { const dd = Math.abs(((d - a + 540) % 360) - 180); if (dd < bestD) { bestD = dd; best = i; } });
    if (best !== lastView) { $$('.view', turn).forEach((v, i) => v.classList.toggle('on', i === best)); lastView = best; }
  }
}
requestAnimationFrame(frame);

loadFigure().then(f => {
  figure = f; applyMode(); ready = true;
  viewer.classList.add('ready'); turn.classList.add('synced'); status('');
}).catch(err => { status('3D 모델을 불러오지 못해 정면 이미지만 보여 준다.'); console.warn(err); });
