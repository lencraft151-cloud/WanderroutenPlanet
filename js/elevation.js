// Höhenprofil als leichtgewichtiges Canvas-Diagramm mit Hover/Touch-Interaktion.

import { haversine } from './routing.js';

const PAD = { top: 10, right: 10, bottom: 20, left: 42 };

function niceStep(range, maxTicks) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  for (const s of steps) {
    if (range / s <= maxTicks) return s;
  }
  return steps[steps.length - 1];
}

export class ElevationChart {
  constructor(canvas, { onHover, onLeave } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onHover = onHover;
    this.onLeave = onLeave;
    this.points = null; // [{ dist, ele, lat, lon }]
    this.hoverIndex = -1;

    new ResizeObserver(() => this.render()).observe(canvas);

    canvas.addEventListener('pointermove', (e) => this.handlePointer(e));
    canvas.addEventListener('pointerdown', (e) => this.handlePointer(e));
    canvas.addEventListener('pointerleave', () => {
      this.hoverIndex = -1;
      this.render();
      if (this.onLeave) this.onLeave();
    });
  }

  // coords: [[lat, lon, ele], ...] – Punkte ohne Höhe übernehmen den letzten Wert.
  setData(coords) {
    const points = [];
    let dist = 0;
    let lastEle = null;
    let hasEle = false;
    for (let i = 0; i < coords.length; i++) {
      const [lat, lon, ele] = coords[i];
      if (i > 0) dist += haversine(coords[i - 1][0], coords[i - 1][1], lat, lon);
      if (ele != null && !Number.isNaN(ele)) { lastEle = ele; hasEle = true; }
      points.push({ dist, ele: lastEle, lat, lon });
    }
    if (!hasEle || points.length < 2) {
      this.points = null;
      this.render();
      return false;
    }
    this.points = points.filter((p) => p.ele != null);
    this.hoverIndex = -1;
    this.render();
    return true;
  }

  clear() {
    this.points = null;
    this.hoverIndex = -1;
    this.render();
  }

  hasData() {
    return this.points !== null;
  }

  handlePointer(e) {
    if (!this.points) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const plotW = rect.width - PAD.left - PAD.right;
    const totalDist = this.points[this.points.length - 1].dist;
    const target = ((x - PAD.left) / plotW) * totalDist;
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const diff = Math.abs(this.points[i].dist - target);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    this.hoverIndex = best;
    this.render();
    const p = this.points[best];
    if (this.onHover) this.onHover(p.lat, p.lon, p.ele, p.dist);
  }

  render() {
    const { canvas, ctx } = this;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!this.points) return;

    const W = rect.width;
    const H = rect.height;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const pts = this.points;
    const totalDist = pts[pts.length - 1].dist || 1;

    let minEle = Infinity;
    let maxEle = -Infinity;
    for (const p of pts) {
      if (p.ele < minEle) minEle = p.ele;
      if (p.ele > maxEle) maxEle = p.ele;
    }
    if (maxEle - minEle < 20) { maxEle += 10; minEle -= 10; }
    const eleStep = niceStep(maxEle - minEle, 5);
    minEle = Math.floor(minEle / eleStep) * eleStep;
    maxEle = Math.ceil(maxEle / eleStep) * eleStep;

    const xOf = (d) => PAD.left + (d / totalDist) * plotW;
    const yOf = (e) => PAD.top + (1 - (e - minEle) / (maxEle - minEle)) * plotH;

    // Gitter + Y-Beschriftung (Höhe in m)
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#889';
    ctx.strokeStyle = '#e4e7ea';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let e = minEle; e <= maxEle; e += eleStep) {
      const y = yOf(e);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.fillText(`${e}`, PAD.left - 5, y);
    }

    // X-Beschriftung (Distanz in km)
    const kmTotal = totalDist / 1000;
    const kmStep = niceStep(kmTotal, 6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let km = 0; km <= kmTotal + 1e-9; km += kmStep) {
      const x = xOf(km * 1000);
      ctx.fillText(`${km}`, x, H - PAD.bottom + 4);
    }
    ctx.textAlign = 'left';
    ctx.fillText('km', W - PAD.right - 14, H - PAD.bottom + 4);

    // Fläche + Linie
    const gradient = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
    gradient.addColorStop(0, 'rgba(45, 125, 70, 0.35)');
    gradient.addColorStop(1, 'rgba(45, 125, 70, 0.05)');
    ctx.beginPath();
    ctx.moveTo(xOf(pts[0].dist), yOf(pts[0].ele));
    for (const p of pts) ctx.lineTo(xOf(p.dist), yOf(p.ele));
    ctx.lineTo(xOf(pts[pts.length - 1].dist), H - PAD.bottom);
    ctx.lineTo(xOf(pts[0].dist), H - PAD.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(xOf(pts[0].dist), yOf(pts[0].ele));
    for (const p of pts) ctx.lineTo(xOf(p.dist), yOf(p.ele));
    ctx.strokeStyle = '#2d7d46';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hover-Markierung mit Tooltip
    if (this.hoverIndex >= 0 && this.hoverIndex < pts.length) {
      const p = pts[this.hoverIndex];
      const x = xOf(p.dist);
      const y = yOf(p.ele);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, H - PAD.bottom);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#d63a2f';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const label = `${(p.dist / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km · ${Math.round(p.ele)} m`;
      ctx.font = '11px system-ui, sans-serif';
      const tw = ctx.measureText(label).width + 12;
      const tx = Math.min(Math.max(x - tw / 2, PAD.left), W - PAD.right - tw);
      ctx.fillStyle = 'rgba(30, 36, 33, 0.88)';
      ctx.beginPath();
      ctx.roundRect(tx, PAD.top, tw, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tx + tw / 2, PAD.top + 9);
    }
  }
}
