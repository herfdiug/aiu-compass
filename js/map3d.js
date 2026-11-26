// AIU Compass - 3D campus view on Three.js.
// Buildings are extruded blocks on a ground plane, with an orbit camera,
// hover/tap picking, a route line from the visitor's origin, and a floating
// label for the selected building. No textures, so it stays small and offline.

import * as THREE from '../vendor/three.module.js';

const LABEL_FONT = '600 13px "Segoe UI", system-ui, sans-serif';

export function createMap(canvas, campus) {
  const buildings = (campus.buildings || []).filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y));
  const places = campus.places || [];
  const byBuilding = new Map(buildings.map((b) => [b.id, b]));

  // The app owns the language; this module only asks for the short code.
  let currentLang = () => 'en';

  const wrap = canvas.parentElement;

  // One always-on name plate per building: without them the blocks are abstract.
  // (The old single floating label was removed: it duplicated the plate of the
  // selected building and read as a rendering glitch.)
  const labelLayer = document.createElement('div');
  labelLayer.className = 'mapLabels';
  labelLayer.setAttribute('aria-hidden', 'true');
  wrap.appendChild(labelLayer);
  const plates = new Map();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#071d2f');
  scene.fog = new THREE.Fog('#071d2f', 900, 2100);

  const camera = new THREE.PerspectiveCamera(46, 1, 1, 6000);

  // ------------------------------------------------------------------ ground
  const groundGeo = new THREE.PlaneGeometry(2600, 2600, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: '#0a2438', roughness: 0.96, metalness: 0.02 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(2600, 52, 0x1d5c7a, 0x12384f);
  grid.material.opacity = 0.34;
  grid.material.transparent = true;
  grid.position.y = 0;
  scene.add(grid);

  // ------------------------------------------------------------------ lights
  scene.add(new THREE.HemisphereLight(0xa8dcff, 0x0a1c2c, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(-420, 780, 460);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -700;
  sun.shadow.camera.right = 700;
  sun.shadow.camera.top = 700;
  sun.shadow.camera.bottom = -700;
  sun.shadow.camera.far = 2400;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x3fa8d8, 0.6);
  rim.position.set(500, 300, -600);
  scene.add(rim);

  // ------------------------------------------------------------------ geometry
  const groupOf = new Map();
  const meshOf = new Map();
  const pickables = [];

  const FLOOR_H = 26;

  for (const b of buildings) {
    const floors = Math.max(1, Math.min(6, b.floors || 2));
    const height = FLOOR_H * floors;
    const g = new THREE.Group();
    g.position.set(b.x, 0, -b.y); // canvas y grows downward, world z grows toward the viewer

    const base = new THREE.Color(b.color || '#1d6b5a');
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, height, b.h),
      new THREE.MeshStandardMaterial({ color: base, roughness: 0.62, metalness: 0.08 })
    );
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.buildingId = b.id;
    g.add(body);
    pickables.push(body);

    // Floor bands: one thin line per floor reads as storeys at a glance.
    const bandMat = new THREE.LineBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.22 });
    for (let f = 1; f < floors; f++) {
      const y = f * FLOOR_H;
      const pts = [
        new THREE.Vector3(-b.w / 2, y, -b.h / 2),
        new THREE.Vector3(b.w / 2, y, -b.h / 2),
        new THREE.Vector3(b.w / 2, y, b.h / 2),
        new THREE.Vector3(-b.w / 2, y, b.h / 2),
        new THREE.Vector3(-b.w / 2, y, -b.h / 2)
      ];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), bandMat));
    }

    // Roof cap, slightly lighter, so the top plane reads clearly from above.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w * 1.02, 3, b.h * 1.02),
      new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0, -0.05, 0.16), roughness: 0.8 })
    );
    roof.position.y = height + 1.5;
    roof.castShadow = true;
    g.add(roof);

    scene.add(g);
    groupOf.set(b.id, { group: g, body, height, roof, wing: Boolean(b.wing) });
    meshOf.set(b.id, b);

    // Windows: a lit grid on each long face, so the blocks read as buildings
    // rather than extruded rectangles. One InstancedMesh per building keeps the
    // draw calls low enough to stay smooth on a phone.
    const cols = Math.max(2, Math.round(b.w / 26));
    const rows = Math.max(1, floors - 1) * 2;
    const winW = Math.min(14, (b.w / cols) * 0.5);
    const winH = Math.min(11, FLOOR_H * 0.34);
    const winGeo = new THREE.PlaneGeometry(winW, winH);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0xbfe8ff,
      emissive: 0x2b6f8f,
      emissiveIntensity: 0.75,
      roughness: 0.35,
      metalness: 0.1
    });
    const count = cols * rows * 2;
    const winMesh = new THREE.InstancedMesh(winGeo, winMat, count);
    winMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const dummy = new THREE.Object3D();
    let wi = 0;
    for (const side of [1, -1]) {
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = -b.w / 2 + (b.w / cols) * (c + 0.5);
          const y = FLOOR_H * 0.55 + (FLOOR_H * 1.06) * r;
          if (y > height - winH) continue;
          dummy.position.set(x, y, side * (b.h / 2 + 0.6));
          dummy.rotation.set(0, side > 0 ? 0 : Math.PI, 0);
          dummy.updateMatrix();
          winMesh.setMatrixAt(wi++, dummy.matrix);
        }
      }
    }
    winMesh.count = wi;
    winMesh.instanceMatrix.needsUpdate = true;
    g.add(winMesh);

    // A door on the side that faces the middle of campus.
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x0d2a3d, roughness: 0.5, metalness: 0.2 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(Math.min(22, b.w * 0.24), FLOOR_H * 0.72, 2), doorMat);
    door.position.set(0, FLOOR_H * 0.36, b.h / 2 + 0.4);
    g.add(door);

    const plate = document.createElement('span');
    plate.className = 'mapPlate';
    plate.textContent = shortName(b);
    labelLayer.appendChild(plate);
    plates.set(b.id, plate);
  }

  // ------------------------------------------------------------------ greenery
  // Trees and hedges give the ground plane scale. Positions are derived from the
  // building layout, so this stays in step with the data.
  {
    const trunkGeo = new THREE.CylinderGeometry(2.4, 3.2, 16, 6);
    const leafGeo = new THREE.ConeGeometry(13, 34, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f7a4d, roughness: 0.9 });
    const spots = [];
    for (const b of buildings) {
      if (b.wing) continue;
      // Two trees on the corners of each building plot, kept clear of the walls.
      const ox = b.w / 2 + 34;
      const oz = b.h / 2 + 34;
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        spots.push([b.x + sx * ox, -(b.y + sz * oz)]);
      }
    }
    // A tree-lined avenue down the middle of campus.
    for (let i = -4; i <= 4; i++) {
      spots.push([-70, -(i * 85)]);
      spots.push([70, -(i * 85)]);
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
    const d = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      d.position.set(x, 8, z);
      d.rotation.set(0, (i * 1.7) % Math.PI, 0);
      d.scale.setScalar(0.85 + ((i * 37) % 10) / 28);
      d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
      d.position.set(x, 34, z);
      d.updateMatrix();
      leaves.setMatrixAt(i, d.matrix);
    });
    trunks.castShadow = true;
    leaves.castShadow = true;
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    scene.add(trunks, leaves);
  }

  // ------------------------------------------------------------------ pathways
  // Walkways joining the building plots, drawn as thin slabs on the ground.
  {
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x123c52, roughness: 0.9, metalness: 0.05 });
    const addPath = (x1, z1, x2, z2, width) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const geo = new THREE.PlaneGeometry(width, len);
      const m = new THREE.Mesh(geo, pathMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
      m.position.set((x1 + x2) / 2, -0.4, (z1 + z2) / 2);
      m.receiveShadow = true;
      scene.add(m);
    };
    // East-west spine through the academic buildings, then north-south links.
    addPath(-230, 0, 250, 0, 30);
    addPath(0, 0, 0, -300, 26);
    addPath(-190, 0, -190, -130, 22);
    addPath(190, 0, 190, -130, 22);
    addPath(-200, 130, 200, 130, 22);
    addPath(0, -300, -283, -300, 18);
  }

  function shortName(b) {
    const lang = (typeof currentLang === 'function' && currentLang()) || 'en';
    if (lang === 'th' && b.th) {
      return String(b.th).replace('อาคาร', '').replace('หอพัก', '').trim() || b.id;
    }
    if (lang !== 'en' && b.names && b.names[lang]) return b.names[lang];
    return String(b.en || b.id)
      .replace('Business and Information Technology Center', 'IT')
      .replace(' Building', '')
      .replace(' Hall', '')
      .replace('AIU ', '');
  }

  // Highlight ring on the ground under the selected building.
  const ringGeo = new THREE.RingGeometry(1, 1.14, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x35e0a1, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  // Route line from the visitor's origin to the target.
  let routeLine = null;
  const routeMat = new THREE.LineDashedMaterial({ color: 0x35e0a1, dashSize: 16, gapSize: 10, linewidth: 1 });
  const originDot = new THREE.Mesh(
    new THREE.SphereGeometry(9, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0x4fc3f7, emissive: 0x1f6f92, roughness: 0.4 })
  );
  originDot.visible = false;
  scene.add(originDot);

  // ------------------------------------------------------------------ camera
  const bounds = buildings.reduce((acc, b) => ({
    minX: Math.min(acc.minX, b.x - b.w / 2),
    maxX: Math.max(acc.maxX, b.x + b.w / 2),
    minY: Math.min(acc.minY, b.y - b.h / 2),
    maxY: Math.max(acc.maxY, b.y + b.h / 2)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  // The visitor starts by picking where they are; the default is only a fallback.
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = -(bounds.minY + bounds.maxY) / 2;
  const span = Math.max(420, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY));

  const target = new THREE.Vector3(centerX, 0, centerZ);
  const camPos = new THREE.Vector3(centerX, span * 0.95, centerZ + span * 1.1);
  const camGoal = camPos.clone();
  const targetGoal = target.clone();

  // Orbit state must exist before fitCamera() touches it.
  let theta = 0.34;
  let phi = 0.86;
  let radius = span * 1.3;

  function fitCamera() {
    // Fit both axes: a portrait phone and a wide desktop need different distances.
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const aspect = w / h;
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const pad = 1.18;
    const neededV = (span * pad) / 2 / Math.tan(vFov / 2);
    const neededH = (span * pad) / 2 / Math.tan(hFov / 2);
    const dist = Math.max(neededV, neededH);
    camGoal.set(targetGoal.x + dist * 0.2, dist * 0.72, targetGoal.z + dist * 0.86);
    radius = Math.hypot(camGoal.x - targetGoal.x, camGoal.y - targetGoal.y, camGoal.z - targetGoal.z);
  }

  camera.position.copy(camPos);
  camera.lookAt(target);
  fitCamera();
  camPos.copy(camGoal);

  // ------------------------------------------------------------------ picking
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoverId = null;
  let selectedId = null;

  function pickAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.buildingId : null;
  }

  function placeOfBuilding(id) {
    return places.find((p) => p.building === id) || null;
  }

  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch') return;
    const id = pickAt(ev.clientX, ev.clientY);
    hoverId = id;
    canvas.style.cursor = id ? 'pointer' : 'grab';
  });

  let downAt = null;
  canvas.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener('pointerup', (ev) => {
    if (!downAt) return;
    const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
    downAt = null;
    if (moved > 8) return; // that was an orbit drag, not a tap
    const id = pickAt(ev.clientX, ev.clientY);
    if (!id) return;
    const place = placeOfBuilding(id);
    if (place) {
      focus(place);
      if (typeof canvas.onPick === 'function') canvas.onPick(place);
    }
  });

  // Simple orbit: drag to rotate the camera around the target.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function syncOrbitFromGoal() {
    const dx = camGoal.x - targetGoal.x;
    const dy = camGoal.y - targetGoal.y;
    const dz = camGoal.z - targetGoal.z;
    const len = Math.max(1, Math.hypot(dx, dy, dz));
    radius = len;
    theta = Math.atan2(dx, dz);
    phi = Math.asin(Math.max(-0.95, Math.min(0.95, dy / len)));
  }
  syncOrbitFromGoal();

  canvas.addEventListener('pointerdown', (ev) => {
    dragging = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - lastX;
    const dy = ev.clientY - lastY;
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    theta -= dx * 0.006;
    phi = Math.max(0.18, Math.min(1.32, phi + dy * 0.004));
    camGoal.set(
      targetGoal.x + radius * Math.cos(phi) * Math.sin(theta),
      targetGoal.y + radius * Math.sin(phi),
      targetGoal.z + radius * Math.cos(phi) * Math.cos(theta)
    );
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const k = Math.exp(ev.deltaY * 0.0012);
    radius = Math.max(140, Math.min(2600, radius * k));
    camGoal.set(
      targetGoal.x + radius * Math.cos(phi) * Math.sin(theta),
      targetGoal.y + radius * Math.sin(phi),
      targetGoal.z + radius * Math.cos(phi) * Math.cos(theta)
    );
  }, { passive: false });

  // ------------------------------------------------------------------ states
  // No default origin: the visitor says where they are, or no route is drawn.
  let originId = null;

  function setOrigin(id) {
    originId = id || null;
    drawRoute();
  }

  // Exposed so the app (and tests) can assert what is actually on screen.
  function debug() {
    return {
      originId,
      selectedId,
      hasRoute: Boolean(routeLine),
      originVisible: originDot.visible,
      plates: [...plates.keys()].length,
      radius: Math.round(radius),
      target: [Math.round(targetGoal.x), Math.round(targetGoal.z)],
      camera: [Math.round(camGoal.x), Math.round(camGoal.y), Math.round(camGoal.z)]
    };
  }

  // Walking distance from the chosen origin to the selected building, in metres.
  // The layout is illustrative, so this is an approximation, and the UI says so.
  function routeInfo() {
    const from = byBuilding.get(originId);
    const to = byBuilding.get(selectedId);
    if (!from || !to || from.id === to.id) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const units = Math.hypot(dx, dy);
    const metres = Math.round(units * 1.1 / 10) * 10;
    // Clock face: 0 = north (up on the plan), 90 = east.
    const bearing = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    return { from: from.id, to: to.id, metres, minutes: Math.max(1, Math.round(metres / 75)), bearing };
  }

  // Re-label the plates after a language switch.
  function relabel() {
    for (const [id, plate] of plates) {
      const b = byBuilding.get(id);
      if (b) plate.textContent = shortName(b);
    }
  }

  function setLang(fn) {
    currentLang = typeof fn === 'function' ? fn : () => 'en';
    relabel();
  }

  function drawRoute() {
    if (routeLine) {
      scene.remove(routeLine);
      routeLine.geometry.dispose();
      routeLine = null;
    }
    const from = byBuilding.get(originId);
    const to = selectedId ? byBuilding.get(selectedId) : null;
    if (!from || !to || from.id === to.id) {
      originDot.visible = Boolean(from);
      if (from) originDot.position.set(from.x, 6, -from.y);
      return;
    }
    const a = new THREE.Vector3(from.x, 6, -from.y);
    const b = new THREE.Vector3(to.x, 6, -to.y);
    const mid = new THREE.Vector3((a.x + b.x) / 2, 6, (a.z + b.z) / 2);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(60));
    routeLine = new THREE.Line(geo, routeMat);
    routeLine.computeLineDistances();
    scene.add(routeLine);
    originDot.visible = true;
    originDot.position.copy(a);
  }

  function focus(place, opts) {
    const b = place && byBuilding.get(place.building);
    if (!b) { clear(); return; }
    selectedId = b.id;
    // Default framing keeps the whole campus in view and only leans toward the
    // target, because moving the camera onto a corner building pushed most name
    // plates off screen and the visitor lost the campus around the answer.
    // "Show me on the map" passes a zoom and does fly in.
    const zoom = opts && Number.isFinite(opts.zoom) ? opts.zoom : 1;
    const lean = Math.min(0.72, 0.18 + 0.3 * zoom);
    const tx = centerX + (b.x - centerX) * lean;
    const tz = centerZ + (-b.y - centerZ) * lean;
    targetGoal.set(tx, 0, tz);
    const dist = Math.max(520, span * 1.32 / Math.max(1, zoom * 0.85));
    radius = dist;
    phi = 0.9;
    camGoal.set(
      targetGoal.x + dist * Math.cos(phi) * Math.sin(theta),
      targetGoal.y + dist * Math.sin(phi),
      targetGoal.z + dist * Math.cos(phi) * Math.cos(theta)
    );
    drawRoute();
  }

  function reset() {
    selectedId = null;
    targetGoal.set(centerX, 0, centerZ);
    theta = 0.34;
    phi = 0.86;
    radius = span * 1.3;
    camGoal.set(
      targetGoal.x + radius * Math.cos(phi) * Math.sin(theta),
      targetGoal.y + radius * Math.sin(phi),
      targetGoal.z + radius * Math.cos(phi) * Math.cos(theta)
    );
    drawRoute();
  }

  function clear() {
    selectedId = null;
    drawRoute();
  }

  // ------------------------------------------------------------------ loop
  let raf = null;
  let lastT = 0;

  const tmp = new THREE.Vector3();

  function tick(now) {
    const dt = Math.min(64, now - (lastT || now));
    lastT = now;
    const k = 1 - Math.pow(0.0018, dt / 1000);

    camPos.lerp(camGoal, k);
    target.lerp(targetGoal, k);
    camera.position.copy(camPos);
    camera.lookAt(target);

    // Keep every name plate pinned above its roof, and hide any that collide.
    const rect = canvas.getBoundingClientRect();
    const placed = [];
    const ordered = [...groupOf.keys()].sort((a, b) => {
      if (a === selectedId) return -1;
      if (b === selectedId) return 1;
      if (a === hoverId) return -1;
      if (b === hoverId) return 1;
      return 0;
    });
    for (const id of ordered) {
      const g = groupOf.get(id);
      const plate = plates.get(id);
      if (!g || !plate) continue;
      tmp.set(g.group.position.x, g.height + 10, g.group.position.z).project(camera);
      if (tmp.z > 1) { plate.style.opacity = '0'; plate.style.visibility = 'hidden'; continue; }
      const sx = (tmp.x * 0.5 + 0.5) * rect.width;
      // A wing shares its neighbour's plot, so its plate is lifted one row to keep
      // both names readable ("Solomon" and "Sarah") instead of hiding one.
      const wingLift = g.wing ? 34 : 0;
      const sy = (-tmp.y * 0.5 + 0.5) * rect.height - wingLift;
      const hot = id === selectedId || id === hoverId;

      // Keep a plate that would cross the edge by shifting it inside, instead of
      // dropping it: a corner building used to lose its name entirely.
      const pad = 6;
      const pw = plate.offsetWidth || 44;
      const ph = plate.offsetHeight || 18;
      // The stage note bar sits on the bottom of the stage. A plate must clear it,
      // or the label covers the disclaimer (and on a phone the two collide).
      const noteEl = document.getElementById('stageNote');
      const noteH = noteEl ? Math.ceil(noteEl.getBoundingClientRect().height) : 0;
      const px = Math.max(pad + pw / 2, Math.min(rect.width - pad - pw / 2, sx));
      // A short stage (phone with the answer open) cannot fit every label on one
      // row, so a clashing plate is nudged to a neighbouring row before giving up.
      // The row step is the plate height plus a hair, so rows never touch.
      const step = ph + 3;
      let box = null;
      let py = 0;
      let fx = px;
      // Vertical rows first (a label stays over its own roof), then sideways, which
      // is better than losing the name on a short phone stage.
      const tries = [];
      for (const dy of [0, -step, step, -2 * step, 2 * step, -3 * step, 3 * step, -4 * step, 4 * step, -5 * step, 5 * step]) tries.push([0, dy]);
      for (const dy of [0, -step, step, -2 * step, 2 * step]) {
        for (const dx of [pw * 0.7, -pw * 0.7, pw * 1.3, -pw * 1.3]) tries.push([dx, dy]);
      }
      for (const [dx, dy] of tries) {
        const tryX = Math.max(pad + pw / 2, Math.min(rect.width - pad - pw / 2, px + dx));
        const tryY = Math.max(pad + ph, Math.min(rect.height - pad - noteH, sy + dy));
        const candidate = { x1: tryX - pw / 2, y1: tryY - ph, x2: tryX + pw / 2, y2: tryY };
        const hit = placed.some((p) => !(candidate.x2 < p.x1 || candidate.x1 > p.x2 || candidate.y2 < p.y1 || candidate.y1 > p.y2));
        if (!hit) { box = candidate; py = tryY; fx = tryX; break; }
      }
      if (!box) {
        // Every row near this roof is taken. The selected or hovered building keeps
        // its name even if it covers a neighbour; the rest wait for a zoom.
        if (!hot) {
          plate.style.opacity = '0';
          plate.style.visibility = 'hidden';
          continue;
        }
        py = Math.max(pad + ph, Math.min(rect.height - pad - noteH, sy));
        box = { x1: px - pw / 2, y1: py - ph, x2: px + pw / 2, y2: py };
        fx = px;
      }
      placed.push(box);
      plate.style.visibility = 'visible';
      plate.style.transform = `translate(-50%, -100%) translate(${fx}px, ${py}px)`;
      plate.style.opacity = hot ? '1' : '0.82';
      plate.classList.toggle('hot', hot);
    }

    // Hover lift, so the pointer has feedback without a tooltip.
    for (const [id, g] of groupOf) {
      const hot = id === selectedId || id === hoverId;
      g.body.material.emissive = g.body.material.emissive || new THREE.Color(0x000000);
      g.body.material.emissive.setHex(hot ? 0x123b2c : 0x000000);
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
  }

  function start() {
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
    }
    // If the GPU drops the context (tab asleep, driver reset, another tab taking
    // the GPU), the campus used to stay blank with no way back. Reload once so a
    // visitor sees a map rather than an empty panel.
    canvas.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      window.setTimeout(() => {
        try { location.reload(); } catch { /* ignore */ }
      }, 600);
    }, false);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  drawRoute();
  reset();

  return { start, stop, focus, reset, clear, resize, setOrigin, relabel, setLang, debug, routeInfo, get origin() { return originId; } };
}
