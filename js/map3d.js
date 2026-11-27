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
  // The plates are buttons that answer for their building, so the layer must not
  // be aria-hidden: focusable content inside an aria-hidden subtree is an axe
  // violation and screen readers would skip real controls.
  labelLayer.setAttribute('role', 'group');
  labelLayer.setAttribute('aria-label', 'Campus buildings');
  wrap.appendChild(labelLayer);
  const plates = new Map();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // A flat colour behind a 3D campus reads as a viewport, not a place. A vertical
  // gradient costs one small canvas texture and makes the horizon legible.
  scene.background = (() => {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0b2f4a');
    grad.addColorStop(0.55, '#0a2337');
    grad.addColorStop(1, '#071a28');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  scene.fog = new THREE.Fog('#0a2337', 1000, 2400);

  const camera = new THREE.PerspectiveCamera(46, 1, 1, 6000);

  // ------------------------------------------------------------------ ground
  // A lawn, not a grid. The technical grid read as a CAD viewer; grass and a
  // soft vignette make the blocks look like buildings on a campus.
  const groundGeo = new THREE.PlaneGeometry(2600, 2600, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: '#123b2c', roughness: 0.98, metalness: 0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  ground.receiveShadow = true;
  scene.add(ground);

  // Faint radial darkening at the edges, so the eye stays on the campus.
  {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 40, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const vignette = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 2600),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    vignette.rotation.x = -Math.PI / 2;
    vignette.position.y = -0.6;
    scene.add(vignette);
  }

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
    const roofMat = new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0, -0.05, 0.16), roughness: 0.8 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.02, 3, b.h * 1.02), roofMat);
    roof.position.y = height + 1.5;
    roof.castShadow = true;
    g.add(roof);

    // A low parapet around the roof edge: a bare slab top reads as a cardboard
    // box, a rim makes it read as a building with a roof.
    {
      const rimMat = new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0, -0.1, 0.26), roughness: 0.75 });
      const t = 2.4;
      const rimH = 2.6;
      const y = height + 3 + rimH / 2;
      const parts = [
        // [width, depth, x, z] - two long walls, two end walls.
        [b.w * 1.02, t, 0, (b.h * 1.02) / 2 - t / 2],
        [b.w * 1.02, t, 0, -(b.h * 1.02) / 2 + t / 2],
        [t, b.h * 1.02, (b.w * 1.02) / 2 - t / 2, 0],
        [t, b.h * 1.02, -(b.w * 1.02) / 2 + t / 2, 0]
      ];
      for (const [w, d, x, z] of parts) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, rimH, d), rimMat);
        m.position.set(x, y, z);
        m.castShadow = true;
        g.add(m);
      }
    }

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

    // A door on the side that faces the middle of campus, with a canopy over it
    // and a step: the door alone read as a dark rectangle on a box.
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x0d2a3d, roughness: 0.5, metalness: 0.2 });
    const doorW = Math.min(22, b.w * 0.24);
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, FLOOR_H * 0.72, 2), doorMat);
    door.position.set(0, FLOOR_H * 0.36, b.h / 2 + 0.4);
    g.add(door);
    {
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0xdfeef7, roughness: 0.6, metalness: 0.05 });
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(doorW * 1.6, 2, 12), canopyMat);
      canopy.position.set(0, FLOOR_H * 0.78, b.h / 2 + 6);
      canopy.castShadow = true;
      g.add(canopy);
      const stepMat = new THREE.MeshStandardMaterial({ color: 0x39616f, roughness: 0.95 });
      const step = new THREE.Mesh(new THREE.BoxGeometry(doorW * 1.5, 2, 10), stepMat);
      step.position.set(0, 1, b.h / 2 + 7);
      step.receiveShadow = true;
      g.add(step);
    }

    const plate = document.createElement('button');
    plate.type = 'button';
    plate.className = 'mapPlate';
    plate.dataset.building = b.id;
    plate.textContent = shortName(b);
    // The plate names its own building, so it is also a direct way in.
    plate.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const place = placeOfBuilding(b.id);
      if (!place) return;
      focus(place);
      if (typeof canvas.onPick === 'function') canvas.onPick(place);
    });
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
  // Walkways joining the building plots, drawn as pale slabs on the lawn.
  {
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x2f5f6d, roughness: 0.92, metalness: 0.02 });
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
    // Keep the Thai classifier. Stripping "อาคาร" from อาคารวิทยาศาสตร์ left
    // "วิทยาศาสตร์", which reads as the school subject, not a building. A plate
    // has to name a place, not a noun.
    if (lang === 'th' && b.th) return String(b.th).trim() || b.id;
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
    // Prefer the record that describes the whole building. `places.find` returned
    // whichever room happened to come first, so tapping the IT block answered
    // with the dean's office and hid the other floors.
    const exact = places.find((p) => p.building === id && p.type === 'building');
    if (exact) return exact;
    // Library, Science, Administration and the dorms have no whole-building
    // record, so synthesise one from the building table instead of answering with
    // an arbitrary room. The app then lists the rooms that are inside it.
    const b = byBuilding.get(id);
    if (!b) return null;
    return {
      id: b.id,
      type: 'building',
      building: b.id,
      floor: 1,
      room: b.en,
      en: b.en,
      th: b.th,
      names: b.names,
      aliases: [],
      hours: '',
      tags: ['building'],
      synthetic: true
    };
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
    // Screen position of each building's centre. Tapping a name plate is not a
    // valid hit test: plates are nudged off their roof to avoid overlaps, so a
    // tap under a moved plate proves nothing. These are the real targets.
    const rect = canvas.getBoundingClientRect();
    const screen = {};
    for (const [id, g] of groupOf) {
      const p = new THREE.Vector3(g.group.position.x, g.height * 0.5, g.group.position.z).project(camera);
      screen[id] = [Math.round((p.x * 0.5 + 0.5) * rect.width), Math.round((-p.y * 0.5 + 0.5) * rect.height)];
    }
    return {
      originId,
      selectedId,
      hasRoute: Boolean(routeLine),
      originVisible: originDot.visible,
      plates: [...plates.keys()].length,
      radius: Math.round(radius),
      target: [Math.round(targetGoal.x), Math.round(targetGoal.z)],
      camera: [Math.round(camGoal.x), Math.round(camGoal.y), Math.round(camGoal.z)],
      screen
    };
  }

  // Walking distance from the chosen origin to the selected building, in metres.
  // The layout is illustrative, so this is an approximation, and the UI says so.
  // It follows the same corner points the drawn route uses, so the number and the
  // line cannot disagree. World z is -planY, the same convention drawRoute uses;
  // mixing the two put the corners on the wrong side of the campus.
  function routeInfo() {
    const from = byBuilding.get(originId);
    const to = byBuilding.get(selectedId);
    if (!from || !to || from.id === to.id) return null;
    const nearestSpine = (x, z) => {
      const cands = [{ x: 0, z }, { x, z: 0 }, { x: 0, z: -300 }];
      return cands.sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];
    };
    const fz = -from.y;
    const tz = -to.y;
    const p0 = nearestSpine(from.x, fz);
    const p1 = nearestSpine(to.x, tz);
    const legs = [
      Math.hypot(p0.x - from.x, p0.z - fz),
      Math.hypot(p1.x - p0.x, p1.z - p0.z),
      Math.hypot(to.x - p1.x, tz - p1.z)
    ];
    const units = legs.reduce((n, v) => n + v, 0);
    const metres = Math.round(units * 1.1 / 10) * 10;
    // Clock face: 0 = north (up on the plan), 90 = east.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
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
    // Walk the campus spines instead of cutting across the blocks. The app draws
    // a central avenue, an east-west spine and links to the dorms, so the route
    // follows those; a straight bezier ran through the Administration Building.
    const nearestSpine = (x, z) => {
      // Spine points: x=0 running north-south, z=0 running east-west, z=-300 east.
      const cands = [
        { x: 0, z },
        { x, z: 0 },
        { x: 0, z: -300 }
      ];
      return cands.sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];
    };
    const p0 = nearestSpine(a.x, a.z);
    const p1 = nearestSpine(b.x, b.z);
    // Keep only corners that are not already on the line (a building standing on
    // a spine needs no detour), then dedupe, so the dashes never bunch.
    const pts = [a, new THREE.Vector3(p0.x, 6, p0.z), new THREE.Vector3(p1.x, 6, p1.z), b]
      .filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 8);
    const curve = new THREE.CatmullRomCurve3(pts.length >= 2 ? pts : [a, b], false, 'centripetal', 0.4);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(70));
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
    // Restore the *opening* framing. A fixed theta/phi/radius did not match what
    // fitCamera() computes for the current aspect ratio, so "reset" landed at a
    // different distance than the first paint.
    fitCamera();
    syncOrbitFromGoal();
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
    // The page draws controls over the map. A label underneath them is
    // unreadable, so the origin box is reserved space that no plate may enter.
    // (The walking hint moved into the panel: it is no longer drawn over the map.)
    const reserved = [];
    for (const sel of ['#originBox', '#mapReset']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      reserved.push({
        x1: r.left - rect.left - 4,
        y1: r.top - rect.top - 4,
        x2: r.right - rect.left + 4,
        y2: r.bottom - rect.top + 4
      });
    }
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
      const px = Math.max(pad + pw / 2, Math.min(rect.width - pad - pw / 2, sx));
      // A short stage (phone with the answer open) cannot fit every label on one
      // row, so a clashing plate is nudged to a neighbouring row before giving up.
      // The row step is the plate height plus a hair, so rows never touch.
      const step = ph + 3;
      // On a very short stage the usable band can be negative: the map may be
      // shorter than one plate. Clamping with Math.min then produced a position
      // below the canvas, which is why a plate was clipped by overflow:hidden.
      // Floor the band at one row.
      const minY = pad + ph;
      const maxY = Math.max(minY, rect.height - pad);
      let box = null;
      let py = 0;
      let fx = px;
      // Only one row of vertical slack, and no sideways shoving. A plate moved far
      // from its own roof ends up over a different building and steals taps: on a
      // 236px phone stage the "IT" plate landed 9px from the Administration block,
      // so tapping Administration answered "IT Building". A name near its roof, or
      // no name, beats a name in the wrong place.
      const tries = [[0, 0], [0, -step], [0, step], [0, -2 * step]];
      for (const [dx, dy] of tries) {
        const tryX = Math.max(pad + pw / 2, Math.min(rect.width - pad - pw / 2, px + dx));
        const tryY = Math.max(minY, Math.min(maxY, sy + dy));
        const candidate = { x1: tryX - pw / 2, y1: tryY - ph, x2: tryX + pw / 2, y2: tryY };
        // A plate taller than the band cannot be shown without covering the note.
        if (tryY - ph < pad) continue;
        const clash = (p) => !(candidate.x2 < p.x1 || candidate.x1 > p.x2 || candidate.y2 < p.y1 || candidate.y1 > p.y2);
        const hit = placed.some(clash) || reserved.some(clash);
        if (!hit) { box = candidate; py = tryY; fx = tryX; break; }
      }
      if (!box) {
        // Every row near this roof is taken. The selected or hovered building keeps
        // its name even if it covers a neighbour; the rest wait for a zoom.
        const fallback = { x1: px - pw / 2, y1: 0, x2: px + pw / 2, y2: 0 };
        const py0 = Math.max(minY, Math.min(maxY, sy));
        fallback.y1 = py0 - ph;
        fallback.y2 = py0;
        const overControl = reserved.some((p) => !(fallback.x2 < p.x1 || fallback.x1 > p.x2 || fallback.y2 < p.y1 || fallback.y1 > p.y2));
        if (!hot || overControl) {
          plate.style.opacity = '0';
          plate.style.visibility = 'hidden';
          continue;
        }
        py = py0;
        box = fallback;
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
