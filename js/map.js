// AIU Compass - schematic campus map on canvas 2D.
// No dependencies, works offline, runs on a phone.

export function createMap(canvas, campus) {
  const ctx = canvas.getContext('2d');
  const buildings = campus.buildings || [];
  const places = campus.places || [];
  const byBuilding = new Map(buildings.map((b) => [b.id, b]));

  const cam = { x: 0, y: 0, zoom: 0.62 };
  const target = { x: 0, y: 0, zoom: 0.62 };
  let highlight = null;   // building id
  let route = null;       // {from:{x,y}, to:{x,y}}
  let dpr = 1;
  let raf = null;
  let last = 0;

  // Bounding box of the campus, used to centre and fit the view on any screen.
  const bounds = buildings.reduce((acc, b) => ({
    minX: Math.min(acc.minX, b.x - b.w / 2),
    maxX: Math.max(acc.maxX, b.x + b.w / 2),
    minY: Math.min(acc.minY, b.y - b.h / 2),
    maxY: Math.max(acc.maxY, b.y + b.h / 2)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);

  function fitZoom() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return 0.62;
    const pad = 0.86;
    return Math.min((rect.width * pad) / spanX, (rect.height * pad) / spanY);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const z = fitZoom();
    if (!highlight) {
      cam.x = target.x = centerX;
      cam.y = target.y = centerY;
      cam.zoom = target.zoom = z;
    }
    draw();
  }

  function worldToScreen(x, y) {
    const w = canvas.width, h = canvas.height;
    return {
      x: w / 2 + (x - cam.x) * cam.zoom * dpr,
      y: h / 2 + (y - cam.y) * cam.zoom * dpr
    };
  }

  function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawGround(s) {
    const w = canvas.width, h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, h));
    g.addColorStop(0, '#071d2f');
    g.addColorStop(1, '#04121f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // faint grid for depth
    const step = 60 * s * dpr;
    if (step > 12) {
      ctx.strokeStyle = 'rgba(110,190,230,0.07)';
      ctx.lineWidth = 1;
      const ox = ((w / 2) - cam.x * s * dpr) % step;
      const oy = ((h / 2) - cam.y * s * dpr) % step;
      for (let x = ox; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = oy; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }
  }

  function drawRoute(s) {
    if (!route) return;
    const a = worldToScreen(route.from.x, route.from.y);
    const b = worldToScreen(route.to.x, route.to.y);
    const midY = (a.y + b.y) / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(53,224,161,0.85)';
    ctx.lineWidth = Math.max(2, 3 * dpr);
    ctx.setLineDash([8 * dpr, 6 * dpr]);
    ctx.lineDashOffset = -(performance.now() / 40) % 1000;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x, midY);
    ctx.lineTo(b.x, midY);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();

    // origin marker
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath();
    ctx.arc(a.x, a.y, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(s = cam.zoom) {
    drawGround(s);
    drawRoute(s);
    if (!Number.isFinite(s) || s <= 0) return;

    for (const b of buildings) {
      const p = worldToScreen(b.x, b.y);
      const w = b.w * s * dpr;
      const h = b.h * s * dpr;
      const isHot = highlight === b.id;
      const x = p.x - w / 2, y = p.y - h / 2;

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(x + 4 * dpr, y + 6 * dpr, w, h, 8 * dpr);
      ctx.fill();

      const grad = ctx.createLinearGradient(x, y, x, y + h);
      const base = b.color || '#1d6b5a';
      grad.addColorStop(0, base);
      grad.addColorStop(1, shade(base, -28));
      ctx.fillStyle = grad;
      roundRect(x, y, w, h, 8 * dpr);
      ctx.fill();

      ctx.strokeStyle = isHot ? 'rgba(53,224,161,0.95)' : 'rgba(150,220,255,0.22)';
      ctx.lineWidth = (isHot ? 3 : 1) * dpr;
      ctx.stroke();

      if (isHot) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320);
        ctx.save();
        ctx.shadowColor = 'rgba(53,224,161,0.9)';
        ctx.shadowBlur = (18 + pulse * 16) * dpr;
        ctx.strokeStyle = 'rgba(53,224,161,0.65)';
        ctx.lineWidth = 2 * dpr;
        roundRect(x - 5 * dpr, y - 5 * dpr, w + 10 * dpr, h + 10 * dpr, 12 * dpr);
        ctx.stroke();
        ctx.restore();
      }

      // label
      const fs = Math.max(9, Math.min(15, 11 * s)) * dpr * 0.9;
      if (fs >= 8 * dpr) {
        ctx.font = `600 ${fs}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isHot ? '#eafff6' : 'rgba(235,248,255,0.86)';
        const label = b.en.replace(' Building', '').replace('Dormitory', 'Dorm');
        if (w > ctx.measureText(label).width + 8 * dpr) {
          ctx.fillText(label, p.x, p.y);
        }
      }
    }

    // compass + scale hint
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${11 * dpr}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(157,184,204,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText('schematic · not to scale', canvas.width - 12 * dpr, canvas.height - 12 * dpr);
  }

  function shade(hex, amt) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    const c = [1, 2, 3].map((i) => Math.max(0, Math.min(255, parseInt(m[i], 16) + amt)));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function tick(now) {
    const dt = Math.min(64, now - (last || now));
    last = now;
    const k = ease(Math.min(1, dt / 220));
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - cam.y) * k;
    cam.zoom += (target.zoom - cam.zoom) * k;
    draw(cam.zoom);
    raf = requestAnimationFrame(tick);
  }

  function start() {
    resize();
    window.addEventListener('resize', resize);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function buildingOf(place) {
    if (!place) return null;
    return byBuilding.get(place.building) || null;
  }

  function focus(place, opts = {}) {
    const b = buildingOf(place);
    if (!b) { clear(); return; }
    highlight = b.id;
    target.x = b.x;
    target.y = b.y;
    target.zoom = Math.max(1.1, fitZoom() * (opts.zoomFactor || 1.45));
    const here = byBuilding.get('it') || buildings[0];
    route = here && here.id !== b.id
      ? { from: { x: here.x, y: here.y + here.h / 2 }, to: { x: b.x, y: b.y + b.h / 2 } }
      : null;
  }

  function reset() {
    highlight = null;
    route = null;
    target.x = centerX;
    target.y = centerY;
    target.zoom = fitZoom();
  }

  function clear() {
    highlight = null;
    route = null;
  }

  // tap a building to see what it is
  canvas.addEventListener('pointerdown', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * dpr;
    const py = (ev.clientY - rect.top) * dpr;
    for (const b of buildings) {
      const p = worldToScreen(b.x, b.y);
      const w = b.w * cam.zoom * dpr, h = b.h * cam.zoom * dpr;
      if (px > p.x - w / 2 && px < p.x + w / 2 && py > p.y - h / 2 && py < p.y + h / 2) {
        const place = places.find((pl) => pl.building === b.id);
        if (place && typeof canvas.onPick === 'function') canvas.onPick(place);
        focus(place);
        return;
      }
    }
  });

  return { start, stop, focus, reset, clear, resize, cam, target };
}
