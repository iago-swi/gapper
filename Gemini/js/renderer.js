window.Gapper = window.Gapper || {};

(function (G) {
  'use strict';

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  class SceneRenderer {
    constructor() {
      this.layout = {
        boardX: 0,
        boardY: 0,
        boardW: 100,
        boardH: 100,
        cellPx: 40,
        pad: 22,
        scale: 1
      };
    }

    computeLayout(graph, width, height, dpr) {
      const topSafe = 86 * dpr;
      const bottomSafe = 54 * dpr;
      const sideSafe = 44 * dpr;
      const availW = Math.max(200, width - sideSafe * 2);
      const availH = Math.max(160, height - topSafe - bottomSafe);

      const cellPx = Math.min(availW / graph.cols, availH / graph.rows);
      const boardW = cellPx * graph.cols;
      const boardH = cellPx * graph.rows;
      const boardX = (width - boardW) * 0.5;
      const boardY = topSafe + (availH - boardH) * 0.5;

      this.layout = {
        boardX,
        boardY,
        boardW,
        boardH,
        cellPx,
        pad: Math.max(14 * dpr, cellPx * 0.34),
        dpr
      };

      // Update pixel coordinates on nodes and pixel lengths on edges
      for (const n of graph.nodes) {
        n.x = boardX + n.gx * cellPx;
        n.y = boardY + n.gy * cellPx;
      }
      for (const e of graph.edges) {
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        e.lengthPx = Math.max(1, Math.hypot(nb.x - na.x, nb.y - na.y));
      }
    }

    render(ctx, width, height, dpr, state) {
      const graph = state.graph;
      if (!graph) return;

      this.computeLayout(graph, width, height, dpr);
      const L = this.layout;
      const pal = graph.level.palette;
      const t = state.time;
      const od = state.overdriveTimer > 0 ? Math.min(1, state.overdriveTimer / 1.2) : 0;

      ctx.clearRect(0, 0, width, height);
      ctx.save();

      // Micro screen-shake & gentle float
      const shakeX = (Math.random() - 0.5) * 2 * state.shake * dpr;
      const shakeY = (Math.random() - 0.5) * 2 * state.shake * dpr;
      const floatY = Math.sin(t * 1.15) * 2.2 * dpr;
      ctx.translate(shakeX, shakeY + floatY);

      this._drawBoardChassis(ctx, graph, L, pal, t, state.progress, od);
      this._drawSurfaceLights(ctx, state, graph, L, t, od);
      this._drawCells(ctx, graph, L, pal, t, od, state.cornerCount);
      this._drawConduits(ctx, graph, L, pal, t, od);
      this._drawNodes(ctx, graph, L, pal, t, od);
      this._drawGaps(ctx, graph, L, t);
      this._drawShard(ctx, state.shard, L, t);
      this._drawPlayerTrail(ctx, state.player, L, t, od);
      this._drawSeekers(ctx, state.seekers, graph, L, t, od);
      this._drawPlayer(ctx, state.player, L, t, od);
      this._drawRings(ctx, state.rings, dpr);
      this._drawParticles(ctx, state.particles, dpr);
      this._drawPopups(ctx, state.popups, dpr);

      ctx.restore();
    }

    _drawBoardChassis(ctx, graph, L, pal, t, progress, od) {
      const x = L.boardX - L.pad;
      const y = L.boardY - L.pad;
      const w = L.boardW + L.pad * 2;
      const h = L.boardH + L.pad * 2;
      const radius = 22 * L.dpr;

      // Soft ambient drop-shadow beneath floating obsidian monolith
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
      ctx.shadowBlur = 48 * L.dpr;
      ctx.shadowOffsetY = 22 * L.dpr;
      roundedRectPath(ctx, x, y + 6 * L.dpr, w, h, radius);
      ctx.fillStyle = 'rgba(4, 7, 18, 0.78)';
      ctx.fill();
      ctx.restore();

      // 3D Extruded Obsidian Slab Lower Bevel (gives true floating monolith depth)
      ctx.save();
      roundedRectPath(ctx, x, y + 7 * L.dpr, w, h, radius);
      const sideGrad = ctx.createLinearGradient(x, y + h, x + w, y + h);
      sideGrad.addColorStop(0, 'rgba(12, 22, 46, 0.92)');
      sideGrad.addColorStop(0.5, 'rgba(24, 42, 76, 0.88)');
      sideGrad.addColorStop(1, 'rgba(12, 22, 46, 0.92)');
      ctx.fillStyle = sideGrad;
      ctx.fill();
      ctx.strokeStyle = od > 0 ? 'rgba(255, 224, 112, 0.55)' : pal.railCore + '44';
      ctx.lineWidth = 1.2 * L.dpr;
      ctx.stroke();
      ctx.restore();

      // Deck body: dark translucent smoked obsidian glass
      ctx.save();
      roundedRectPath(ctx, x, y, w, h, radius);
      const deckGrad = ctx.createLinearGradient(x, y, x + w, y + h);
      const rT = Math.round(pal.boardTint[0] * 120);
      const gT = Math.round(pal.boardTint[1] * 120);
      const bT = Math.round(pal.boardTint[2] * 120);
      deckGrad.addColorStop(0, `rgba(${8 + rT}, ${12 + gT}, ${26 + bT}, 0.82)`);
      deckGrad.addColorStop(0.5, `rgba(6, 10, 22, 0.86)`);
      deckGrad.addColorStop(1, `rgba(${10 + rT}, ${10 + gT}, ${24 + bT}, 0.84)`);
      ctx.fillStyle = deckGrad;
      ctx.fill();

      // Clip interior for subtle glass sheen & micro technical grid
      ctx.clip();

      // Diagonal subtle glass reflection sheen
      const sheenX = x + ((Math.sin(t * 0.25) * 0.35 + 0.5) * w);
      const sheenGrad = ctx.createLinearGradient(sheenX - w * 0.4, y, sheenX + w * 0.4, y + h);
      sheenGrad.addColorStop(0, 'rgba(255,255,255,0)');
      sheenGrad.addColorStop(0.48, 'rgba(180,230,255,0.032)');
      sheenGrad.addColorStop(0.52, 'rgba(255,255,255,0.055)');
      sheenGrad.addColorStop(0.56, 'rgba(180,230,255,0.02)');
      sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(x, y, w, h);

      // Subtle architectural micro-dots on grid intersections
      ctx.fillStyle = 'rgba(160, 215, 255, 0.055)';
      const step = L.cellPx * 0.5;
      for (let gx = L.boardX; gx <= L.boardX + L.boardW + 1; gx += step) {
        for (let gy = L.boardY; gy <= L.boardY + L.boardH + 1; gy += step) {
          ctx.fillRect(gx - 0.8 * L.dpr, gy - 0.8 * L.dpr, 1.6 * L.dpr, 1.6 * L.dpr);
        }
      }
      ctx.restore();

      // Carved Architectural Abyss Windows (lets WebGL2 Nebula shine straight through!)
      if (graph.voidRects && graph.voidRects.length) {
        const vPad = 7 * L.dpr;
        for (const vr of graph.voidRects) {
          const vx = L.boardX + vr.x * L.cellPx + vPad;
          const vy = L.boardY + vr.y * L.cellPx + vPad;
          const vw = Math.max(8, vr.w * L.cellPx - vPad * 2);
          const vh = Math.max(8, vr.h * L.cellPx - vPad * 2);

          // Punch transparent window through deck slab so nebula glows beneath
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          roundedRectPath(ctx, vx, vy, vw, vh, 10 * L.dpr);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
          ctx.fill();
          ctx.restore();

          // Luminous inner window rim & holographic core ring
          ctx.save();
          roundedRectPath(ctx, vx, vy, vw, vh, 10 * L.dpr);
          ctx.strokeStyle = od > 0 ? 'rgba(255, 224, 112, 0.7)' : pal.railCore + '77';
          ctx.lineWidth = 1.6 * L.dpr;
          ctx.stroke();

          const vmx = vx + vw * 0.5;
          const vmy = vy + vh * 0.5;
          const vRad = Math.min(vw, vh) * 0.34;
          ctx.translate(vmx, vmy);
          ctx.rotate(t * 0.45);
          ctx.strokeStyle = od > 0 ? 'rgba(255, 224, 112, 0.32)' : pal.railCore + '35';
          ctx.lineWidth = 1.2 * L.dpr;
          ctx.setLineDash([8 * L.dpr, 6 * L.dpr]);
          ctx.beginPath();
          ctx.arc(0, 0, vRad, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Outer luminous bezel border
      ctx.save();
      roundedRectPath(ctx, x, y, w, h, radius);
      const borderGrad = ctx.createLinearGradient(x, y, x + w, y + h);
      if (od > 0.01) {
        borderGrad.addColorStop(0, 'rgba(255, 224, 112, 0.85)');
        borderGrad.addColorStop(0.5, 'rgba(72, 245, 255, 0.7)');
        borderGrad.addColorStop(1, 'rgba(255, 224, 112, 0.85)');
      } else {
        borderGrad.addColorStop(0, pal.railCore + '88');
        borderGrad.addColorStop(0.5, 'rgba(180, 225, 255, 0.16)');
        borderGrad.addColorStop(1, pal.railPainted + (progress > 0.35 ? '88' : '44'));
      }
      ctx.strokeStyle = borderGrad;
      ctx.lineWidth = 1.6 * L.dpr;
      ctx.stroke();

      // Fine corner brackets on the monolithic chassis
      const bLen = 18 * L.dpr;
      const ins = 6 * L.dpr;
      ctx.strokeStyle = od > 0 ? '#ffe484' : pal.railCore;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5 * L.dpr;
      const corners = [
        [x + ins, y + ins, 1, 1],
        [x + w - ins, y + ins, -1, 1],
        [x + ins, y + h - ins, 1, -1],
        [x + w - ins, y + h - ins, -1, -1]
      ];
      for (const [cx, cy, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * bLen, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + sy * bLen);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawSurfaceLights(ctx, state, graph, L, t, od) {
      // Soft dynamic ambient light pools cast onto the obsidian glass slab
      const x = L.boardX - L.pad;
      const y = L.boardY - L.pad;
      const w = L.boardW + L.pad * 2;
      const h = L.boardH + L.pad * 2;
      const dpr = L.dpr;

      ctx.save();
      roundedRectPath(ctx, x, y, w, h, 22 * dpr);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';

      const drawPool = (px, py, rad, c0) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, c0);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      };

      // Player pool light
      if (state.player && state.player.deadTimer <= 0) {
        drawPool(
          state.player.x + (state.player.visOffX || 0),
          state.player.y + (state.player.visOffY || 0),
          L.cellPx * 1.45,
          od > 0 ? 'rgba(255, 214, 78, 0.24)' : 'rgba(56, 232, 255, 0.22)'
        );
      }

      // Seeker pool lights
      for (const s of state.seekers) {
        if (s.respawnTimer > 0) continue;
        const col = od > 0
          ? 'rgba(72, 236, 255, 0.16)'
          : s.type === 'stalker'
            ? 'rgba(184, 77, 255, 0.20)'
            : s.type === 'surge'
              ? 'rgba(255, 168, 42, 0.22)'
              : 'rgba(255, 42, 92, 0.20)';
        drawPool(s.x, s.y, L.cellPx * 1.15, col);
      }

      // Flickering electric pool lights beneath active Plasma Gaps
      for (const e of graph.edges) {
        if (!e.gap) continue;
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        const gx = lerp(na.x, nb.x, e.gap.t);
        const gy = lerp(na.y, nb.y, e.gap.t);
        const flicker = 0.16 + 0.08 * Math.sin(t * 48 + e.id * 7);
        drawPool(gx, gy, L.cellPx * 0.95, `rgba(92, 246, 255, ${flicker})`);
      }

      ctx.restore();
    }

    _drawCells(ctx, graph, L, pal, t, od, cornerCount) {
      const inset = 5.5 * L.dpr;

      for (const cell of graph.cells) {
        const cx = L.boardX + cell.x * L.cellPx;
        const cy = L.boardY + cell.y * L.cellPx;
        const cw = cell.w * L.cellPx;
        const ch = cell.h * L.cellPx;
        const ix = cx + inset;
        const iy = cy + inset;
        const iw = Math.max(4, cw - inset * 2);
        const ih = Math.max(4, ch - inset * 2);
        const rad = 6 * L.dpr;

        if (!cell.completed) {
          // Recessed smoked-glass chamber well
          roundedRectPath(ctx, ix, iy, iw, ih, rad);
          ctx.fillStyle = 'rgba(3, 6, 15, 0.44)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(130, 195, 255, 0.08)';
          ctx.lineWidth = 1 * L.dpr;
          ctx.stroke();

          // Corner chamber diamond indicator (Prism Overdrive targets!)
          if (cell.isCorner) {
            const mx = cx + cw * 0.5;
            const my = cy + ch * 0.5;
            const pulse = 0.65 + 0.35 * Math.sin(t * 3.4 + cell.id);
            const r = Math.min(iw, ih) * 0.16 * (0.94 + pulse * 0.12);

            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(Math.PI * 0.25);
            ctx.strokeStyle = `rgba(255, 214, 96, ${0.32 + pulse * 0.32})`;
            ctx.lineWidth = 1.5 * L.dpr;
            ctx.strokeRect(-r, -r, r * 2, r * 2);
            ctx.fillStyle = `rgba(255, 226, 130, ${0.14 + pulse * 0.16})`;
            ctx.fillRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
            ctx.restore();
          }
        } else {
          // Illuminated Crystalline Sealed Chamber!
          const anim = Math.min(1, cell.completeAnim);
          const flash = Math.max(0, 1 - anim * 1.6);
          const breathe = 0.88 + 0.12 * Math.sin(t * 2.4 + cell.id * 0.8);

          ctx.save();
          roundedRectPath(ctx, ix, iy, iw, ih, rad);

          const grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
          if (od > 0.01) {
            grad.addColorStop(0, `rgba(255, 220, 92, ${0.38 * breathe})`);
            grad.addColorStop(0.5, `rgba(72, 245, 255, ${0.24 * breathe})`);
            grad.addColorStop(1, `rgba(255, 160, 72, ${0.32 * breathe})`);
          } else {
            grad.addColorStop(0, pal.cellFillA);
            grad.addColorStop(1, pal.cellFillB);
          }
          ctx.fillStyle = grad;
          ctx.fill();

          // Clip for holographic filigree and diagonal crystal light-sweep
          ctx.clip();

          // Subtle geometric holographic filigree pattern
          ctx.strokeStyle = od > 0 ? 'rgba(255, 244, 175, 0.28)' : pal.cellBorder;
          ctx.globalAlpha = 0.22 * breathe;
          ctx.lineWidth = 1.1 * L.dpr;

          const mx = ix + iw * 0.5;
          const my = iy + ih * 0.5;
          const innerPad = Math.min(iw, ih) * 0.18;
          ctx.strokeRect(ix + innerPad, iy + innerPad, iw - innerPad * 2, ih - innerPad * 2);

          if (cell.patternSeed === 0 || cell.patternSeed === 2) {
            const dr = Math.min(iw, ih) * 0.24;
            ctx.beginPath();
            ctx.moveTo(mx, my - dr);
            ctx.lineTo(mx + dr, my);
            ctx.lineTo(mx, my + dr);
            ctx.lineTo(mx - dr, my);
            ctx.closePath();
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(ix + innerPad, my);
            ctx.lineTo(ix + iw - innerPad, my);
            ctx.moveTo(mx, iy + innerPad);
            ctx.lineTo(mx, iy + ih - innerPad);
            ctx.stroke();
          }

          // Corner chamber lit star emblem
          if (cell.isCorner) {
            const r = Math.min(iw, ih) * 0.16;
            ctx.save();
            ctx.globalAlpha = 0.85;
            ctx.translate(mx, my);
            ctx.rotate(Math.PI * 0.25 + t * 0.4);
            ctx.fillStyle = '#fff5b8';
            ctx.fillRect(-r * 0.65, -r * 0.65, r * 1.3, r * 1.3);
            ctx.restore();
          }

          // Diagonal luminous crystal light-sweep on seal completion!
          if (anim < 1) {
            const sweepPos = lerp(-0.4, 1.4, anim);
            const sx = ix + sweepPos * iw;
            const sw = Math.max(iw, ih) * 0.45;
            const sweepGrad = ctx.createLinearGradient(sx - sw, iy, sx + sw, iy + ih);
            sweepGrad.addColorStop(0, 'rgba(255,255,255,0)');
            sweepGrad.addColorStop(0.5, `rgba(255,255,255,${0.75 * (1 - anim)})`);
            sweepGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalAlpha = 1;
            ctx.fillStyle = sweepGrad;
            ctx.fillRect(ix, iy, iw, ih);
          }

          // Initial bright flash pop
          if (flash > 0.01) {
            ctx.globalAlpha = flash * 0.55;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(ix, iy, iw, ih);
          }

          ctx.restore();

          // Luminous etched crystal border
          ctx.save();
          roundedRectPath(ctx, ix, iy, iw, ih, rad);
          ctx.strokeStyle = od > 0 ? '#ffe588' : pal.cellBorder;
          ctx.globalAlpha = 0.52 + flash * 0.48;
          ctx.lineWidth = (1.3 + flash * 1.8) * L.dpr;
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    _drawConduits(ctx, graph, L, pal, t, od) {
      const dpr = L.dpr;
      ctx.lineCap = 'round';

      // Layer 1: Recessed dark metallic rail trenches
      ctx.strokeStyle = 'rgba(2, 5, 14, 0.85)';
      ctx.lineWidth = 7.5 * dpr;
      ctx.beginPath();
      for (const e of graph.edges) {
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
      }
      ctx.stroke();

      // Layer 2: Unpainted optical conduits (carved around active gaps)
      const drawEdgeSpan = (na, nb, s0, s1) => {
        if (s1 - s0 <= 0.005) return;
        ctx.moveTo(lerp(na.x, nb.x, s0), lerp(na.y, nb.y, s0));
        ctx.lineTo(lerp(na.x, nb.x, s1), lerp(na.y, nb.y, s1));
      };

      const subtractGap = (s0, s1, gap) => {
        if (!gap) return [[s0, s1]];
        const g0 = Math.max(0, gap.t - gap.halfT);
        const g1 = Math.min(1, gap.t + gap.halfT);
        const out = [];
        if (s0 < g0) out.push([s0, Math.min(s1, g0)]);
        if (s1 > g1) out.push([Math.max(s0, g1), s1]);
        return out;
      };

      // Outer base glow
      ctx.strokeStyle = pal.railBase;
      ctx.lineWidth = 4.2 * dpr;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      for (const e of graph.edges) {
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        for (const [s0, s1] of subtractGap(0, 1, e.gap)) {
          drawEdgeSpan(na, nb, s0, s1);
        }
      }
      ctx.stroke();

      // Crisp inner filament
      ctx.strokeStyle = pal.railCore;
      ctx.lineWidth = 1.6 * dpr;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      for (const e of graph.edges) {
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        for (const [s0, s1] of subtractGap(0, 1, e.gap)) {
          drawEdgeSpan(na, nb, s0, s1);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Layer 3: Painted / Claimed blazing plasma conduits
      const paintedOuter = od > 0.01 ? '#ffdd59' : pal.railPainted;
      const paintedCore = od > 0.01 ? '#ffffff' : pal.railPaintedCore;

      // Outer plasma aura
      ctx.strokeStyle = paintedOuter;
      ctx.lineWidth = 6.2 * dpr;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (const e of graph.edges) {
        if (!e.intervals.length) continue;
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        for (const [a, b] of e.intervals) {
          for (const [s0, s1] of subtractGap(a, b, e.gap)) {
            drawEdgeSpan(na, nb, s0, s1);
          }
        }
      }
      ctx.stroke();

      // Hot-white laser filament core
      ctx.strokeStyle = paintedCore;
      ctx.lineWidth = 2.4 * dpr;
      ctx.globalAlpha = 0.98;
      ctx.beginPath();
      for (const e of graph.edges) {
        if (!e.intervals.length) continue;
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        for (const [a, b] of e.intervals) {
          for (const [s0, s1] of subtractGap(a, b, e.gap)) {
            drawEdgeSpan(na, nb, s0, s1);
          }
        }
      }
      ctx.stroke();

      // Hot-white ignition surge on newly completed rails
      for (const e of graph.edges) {
        if (e.paintFlash <= 0.01) continue;
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = e.paintFlash * 0.9;
        ctx.lineWidth = (3 + e.paintFlash * 6) * dpr;
        ctx.beginPath();
        for (const [s0, s1] of subtractGap(0, 1, e.gap)) {
          drawEdgeSpan(na, nb, s0, s1);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Flowing energy data pulses along painted edges
      ctx.fillStyle = '#ffffff';
      for (const e of graph.edges) {
        if (!e.painted) continue;
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        const p = (t * 0.72 + e.id * 0.23) % 1;
        if (e.gap && Math.abs(p - e.gap.t) < e.gap.halfT + 0.04) continue;
        const px = lerp(na.x, nb.x, p);
        const py = lerp(na.y, nb.y, p);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(px, py, 2.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    _drawNodes(ctx, graph, L, pal, t, od) {
      const dpr = L.dpr;
      for (const n of graph.nodes) {
        // Check if any incident edge is painted
        let anyPainted = false;
        let allPainted = true;
        for (const k of ['up', 'down', 'left', 'right']) {
          const link = n.adj[k];
          if (!link) continue;
          const e = graph.edges[link.edgeId];
          if (e.painted) anyPainted = true;
          else allPainted = false;
        }

        const r = (allPainted ? 4.4 : anyPainted ? 3.8 : 3.2) * dpr;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 1.8 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(4, 8, 18, 0.9)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        if (allPainted) {
          ctx.fillStyle = od > 0 ? '#fff5ad' : pal.railPaintedCore;
        } else if (anyPainted) {
          ctx.fillStyle = od > 0 ? '#ffdd59' : pal.railPainted;
        } else {
          ctx.fillStyle = pal.railCore;
        }
        ctx.fill();
      }
    }

    _drawGaps(ctx, graph, L, t) {
      const dpr = L.dpr;
      for (const e of graph.edges) {
        if (!e.gap) continue;
        const gap = e.gap;
        const na = graph.nodes[e.a];
        const nb = graph.nodes[e.b];
        const g0 = Math.max(0.05, gap.t - gap.halfT);
        const g1 = Math.min(0.95, gap.t + gap.halfT);

        const x0 = lerp(na.x, nb.x, g0);
        const y0 = lerp(na.y, nb.y, g0);
        const x1 = lerp(na.x, nb.x, g1);
        const y1 = lerp(na.y, nb.y, g1);
        const mx = (x0 + x1) * 0.5;
        const my = (y0 + y1) * 0.5;
        const pct = Math.max(0, gap.timer / gap.maxTimer);

        // Dark severed void slot
        ctx.save();
        ctx.strokeStyle = 'rgba(2, 4, 12, 0.95)';
        ctx.lineWidth = 10 * dpr;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        // Circular heal countdown halo around the plasma rift
        const haloR = Math.max(13 * dpr, Math.hypot(x1 - x0, y1 - y0) * 0.55);
        ctx.strokeStyle = 'rgba(72, 245, 255, 0.22)';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(mx, my, haloR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = pct < 0.25 ? '#ffaa44' : '#64f7ff';
        ctx.lineWidth = 2.6 * dpr;
        ctx.beginPath();
        ctx.arc(mx, my, haloR, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * pct);
        ctx.stroke();

        // Molten glowing severed rail end-caps
        for (const [ex, ey] of [[x0, y0], [x1, y1]]) {
          const capGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, 9 * dpr);
          capGrad.addColorStop(0, '#ffffff');
          capGrad.addColorStop(0.35, '#7df9ff');
          capGrad.addColorStop(1, 'rgba(30, 180, 255, 0)');
          ctx.fillStyle = capGrad;
          ctx.beginPath();
          ctx.arc(ex, ey, 9 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }

        // Jagged crackling plasma lightning arcs jumping across the gap!
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / len;
        const ny = dx / len;
        const segs = 6;

        for (let bolt = 0; bolt < 2; bolt++) {
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          for (let i = 1; i < segs; i++) {
            const f = i / segs;
            const jitter = (Math.sin(t * 58 + i * 17.3 + bolt * 9.1 + e.id * 5) +
              (Math.random() - 0.5) * 1.4) * (4.5 * dpr) * Math.sin(f * Math.PI);
            ctx.lineTo(x0 + dx * f + nx * jitter, y0 + dy * f + ny * jitter);
          }
          ctx.lineTo(x1, y1);
          ctx.strokeStyle = bolt === 0 ? '#50eeff' : '#ffffff';
          ctx.lineWidth = (bolt === 0 ? 3.2 : 1.3) * dpr;
          ctx.globalAlpha = bolt === 0 ? 0.85 : 0.95;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    _drawShard(ctx, shard, L, t) {
      if (!shard || !shard.active) return;
      const dpr = L.dpr;
      const x = shard.x;
      const y = shard.y;
      const pulse = 0.85 + 0.15 * Math.sin(t * 7);
      const r = 11 * dpr * pulse;

      ctx.save();
      ctx.translate(x, y);

      // Expanding aura ring
      const ringP = (t * 1.2) % 1;
      ctx.strokeStyle = `rgba(255, 222, 100, ${(1 - ringP) * 0.65})`;
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.1 + ringP * 1.5), 0, Math.PI * 2);
      ctx.stroke();

      // Rotating golden prism diamond
      ctx.rotate(t * 2.2);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.4);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, '#ffe066');
      grad.addColorStop(1, 'rgba(255, 160, 30, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff5bd';
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.72, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.72, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4 * dpr;
      ctx.stroke();

      ctx.restore();
    }

    _drawPlayerTrail(ctx, player, L, t, od) {
      const trail = player.trail;
      if (!trail || trail.length < 2) return;
      const dpr = L.dpr;

      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        const f = i / trail.length;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = od > 0
          ? `rgba(255, 224, 96, ${f * 0.62})`
          : `rgba(72, 245, 255, ${f * 0.52})`;
        ctx.lineWidth = (2 + f * 9) * dpr;
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawPlayer(ctx, player, L, t, od) {
      if (!player || player.deadTimer > 0) return;
      const dpr = L.dpr;
      const x = player.x + (player.visOffX || 0);
      const y = player.y + (player.visOffY || 0);
      const r = 12.5 * dpr;

      ctx.save();
      ctx.translate(x, y);

      // Soft luminous glow aura
      const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
      if (od > 0) {
        aura.addColorStop(0, 'rgba(255, 250, 210, 0.95)');
        aura.addColorStop(0.4, 'rgba(255, 206, 68, 0.55)');
        aura.addColorStop(1, 'rgba(255, 160, 20, 0)');
      } else {
        aura.addColorStop(0, 'rgba(220, 255, 255, 0.95)');
        aura.addColorStop(0.4, 'rgba(56, 232, 255, 0.52)');
        aura.addColorStop(1, 'rgba(24, 140, 255, 0)');
      }
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2);
      ctx.fill();

      // Orbiting diegetic Gap-charge motes!
      const charges = Math.floor(player.gapCharges);
      for (let i = 0; i < charges; i++) {
        const ang = t * 3.4 + (i * Math.PI * 2) / Math.max(1, charges);
        const ox = Math.cos(ang) * (r * 1.62);
        const oy = Math.sin(ang) * (r * 1.62);
        ctx.fillStyle = '#a4fbff';
        ctx.beginPath();
        ctx.arc(ox, oy, 2.7 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Outer counter-rotating gyroscopic diamond ring
      ctx.save();
      ctx.rotate(t * 2.6);
      ctx.strokeStyle = od > 0 ? '#ffe787' : '#64f5ff';
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      ctx.restore();

      // Inner diamond prism core oriented slightly toward movement
      ctx.save();
      ctx.rotate(-t * 1.8 + Math.PI * 0.25);
      ctx.fillStyle = od > 0 ? '#ffd748' : '#2ee8ff';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(r * 0.95, 0);
      ctx.lineTo(0, r * 0.95);
      ctx.lineTo(-r * 0.95, 0);
      ctx.closePath();
      ctx.fill();

      // White-hot crystalline nucleus
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Subtle directional momentum chevron
      const dirAngle = player.facing === 'right' ? 0
        : player.facing === 'down' ? Math.PI * 0.5
        : player.facing === 'left' ? Math.PI
        : -Math.PI * 0.5;
      ctx.save();
      ctx.rotate(dirAngle);
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.8 * dpr;
      ctx.beginPath();
      ctx.moveTo(r * 0.95, -r * 0.38);
      ctx.lineTo(r * 1.42, 0);
      ctx.lineTo(r * 0.95, r * 0.38);
      ctx.stroke();
      ctx.restore();

      // Invulnerability spawn shield
      if (player.invulnTimer > 0) {
        const shieldAlpha = 0.45 + 0.35 * Math.sin(t * 18);
        ctx.strokeStyle = `rgba(140, 250, 255, ${shieldAlpha})`;
        ctx.lineWidth = 2.2 * dpr;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + t * 1.5;
          const px = Math.cos(a) * r * 1.95;
          const py = Math.sin(a) * r * 1.95;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }

      ctx.restore();
    }

    _drawSeekers(ctx, seekers, graph, L, t, od) {
      const dpr = L.dpr;

      for (const s of seekers) {
        if (s.respawnTimer > 0) {
          // Draw glowing portal warning at spawn node when about to re-materialize
          const node = graph.nodes[s.spawnNodeId];
          if (node && s.respawnTimer < 1.2) {
            const p = 1 - s.respawnTimer / 1.2;
            ctx.save();
            ctx.strokeStyle = `rgba(255, 70, 110, ${p * 0.85})`;
            ctx.lineWidth = 2 * dpr;
            ctx.beginPath();
            ctx.arc(node.x, node.y, (22 - p * 12) * dpr, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          continue;
        }

        const x = s.x + (s.stunTimer > 0 ? (Math.random() - 0.5) * 5 * dpr : 0);
        const y = s.y + (s.stunTimer > 0 ? (Math.random() - 0.5) * 5 * dpr : 0);
        const r = 13 * dpr;
        const vulnerable = od > 0.01;

        // Seeker trail
        if (s.trail && s.trail.length > 1) {
          ctx.save();
          ctx.lineCap = 'round';
          for (let i = 1; i < s.trail.length; i++) {
            const f = i / s.trail.length;
            ctx.beginPath();
            ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y);
            ctx.lineTo(s.trail[i].x, s.trail[i].y);
            if (vulnerable) {
              ctx.strokeStyle = `rgba(92, 224, 255, ${f * 0.45})`;
            } else if (s.type === 'stalker') {
              ctx.strokeStyle = `rgba(186, 86, 255, ${f * 0.5})`;
            } else if (s.type === 'surge') {
              ctx.strokeStyle = `rgba(255, 168, 42, ${f * 0.58})`;
            } else {
              ctx.strokeStyle = `rgba(255, 48, 92, ${f * 0.5})`;
            }
            ctx.lineWidth = (1.5 + f * 6.5) * dpr;
            ctx.stroke();
          }
          ctx.restore();
        }

        ctx.save();
        ctx.translate(x, y);

        // Colors by type / state
        let mainCol = '#ff2e63';
        let coreCol = '#ffd0dc';
        let glowRgba = 'rgba(255, 46, 99, 0.55)';
        if (vulnerable) {
          mainCol = '#4ae8ff';
          coreCol = '#ffffff';
          glowRgba = 'rgba(74, 232, 255, 0.55)';
        } else if (s.type === 'stalker') {
          mainCol = '#b84dff';
          coreCol = '#f0ccff';
          glowRgba = 'rgba(184, 77, 255, 0.55)';
        } else if (s.type === 'surge') {
          mainCol = s.surging ? '#fff07c' : '#ff8c24';
          coreCol = '#ffffff';
          glowRgba = s.surging ? 'rgba(255, 240, 124, 0.78)' : 'rgba(255, 140, 36, 0.6)';
        }

        // Aura glow
        const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.3);
        aura.addColorStop(0, glowRgba);
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.3, 0, Math.PI * 2);
        ctx.fill();

        // Distinct geometric predator silhouettes
        if (s.type === 'hunter') {
          // 4-point spinning razor star
          ctx.save();
          ctx.rotate(t * (s.stunTimer > 0 ? 12 : -4.2));
          ctx.fillStyle = mainCol;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const rad = i % 2 === 0 ? r * 1.18 : r * 0.45;
            const a = (i * Math.PI) / 4;
            if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
            else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = coreCol;
          ctx.lineWidth = 1.4 * dpr;
          ctx.stroke();
          ctx.restore();
        } else if (s.type === 'stalker') {
          // Twin-bladed interceptor hexagon + rotating spikes
          ctx.save();
          ctx.rotate(t * 3.6);
          ctx.strokeStyle = mainCol;
          ctx.lineWidth = 2.6 * dpr;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            const px = Math.cos(a) * r * 1.02;
            const py = Math.sin(a) * r * 1.02;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = mainCol + 'aa';
          ctx.fill();
          ctx.stroke();

          ctx.rotate(-t * 7.2);
          ctx.strokeStyle = coreCol;
          ctx.lineWidth = 1.6 * dpr;
          ctx.beginPath();
          ctx.moveTo(-r * 1.25, 0);
          ctx.lineTo(r * 1.25, 0);
          ctx.moveTo(0, -r * 1.25);
          ctx.lineTo(0, r * 1.25);
          ctx.stroke();
          ctx.restore();
        } else {
          // Surge sentinel: tri-fin high-voltage prism
          ctx.save();
          ctx.rotate(t * (s.surging ? 10 : 4.5));
          ctx.fillStyle = mainCol;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const rad = i % 2 === 0 ? r * 1.25 : r * 0.48;
            const a = (i * Math.PI) / 3;
            if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
            else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();
          ctx.restore();
        }

        // Predator inner eye core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
        ctx.fill();

        // Vulnerable Overdrive target ring
        if (vulnerable) {
          const blink = 0.5 + 0.5 * Math.sin(t * 20);
          ctx.strokeStyle = `rgba(255, 232, 118, ${0.45 + blink * 0.5})`;
          ctx.lineWidth = 1.8 * dpr;
          ctx.setLineDash([4 * dpr, 3 * dpr]);
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Electric stun arcs when slammed into a Gap
        if (s.stunTimer > 0) {
          ctx.strokeStyle = '#8efbff';
          ctx.lineWidth = 1.8 * dpr;
          for (let k = 0; k < 3; k++) {
            const a1 = Math.random() * Math.PI * 2;
            const a2 = a1 + 1.1;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a1) * r * 1.35, Math.sin(a1) * r * 1.35);
            ctx.lineTo((Math.random() - 0.5) * r, (Math.random() - 0.5) * r);
            ctx.lineTo(Math.cos(a2) * r * 1.35, Math.sin(a2) * r * 1.35);
            ctx.stroke();
          }
        }

        ctx.restore();
      }
    }

    _drawRings(ctx, rings, dpr) {
      for (const ring of rings) {
        const p = 1 - ring.life / ring.maxLife;
        const r = lerp(ring.r0, ring.r1, 1 - Math.pow(1 - p, 3));
        const alpha = (1 - p) * ring.alpha;
        ctx.save();
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = (ring.lineWidth * (1 - p * 0.6)) * dpr;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, r * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawParticles(ctx, particles, dpr) {
      for (const p of particles) {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        if (p.shape === 'spark') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * dpr;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.032, p.y - p.vy * 0.032);
          ctx.stroke();
        } else if (p.shape === 'shard') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          const s = p.size * dpr * (0.4 + alpha * 0.6);
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.7, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s * 0.7, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * dpr * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    _drawPopups(ctx, popups, dpr) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const pop of popups) {
        const p = 1 - pop.life / pop.maxLife;
        const alpha = p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.15) / 0.85);
        const scale = p < 0.14 ? lerp(0.65, 1.12, p / 0.14) : lerp(1.12, 1.0, (p - 0.14) / 0.25);

        ctx.save();
        ctx.translate(pop.x, pop.y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        ctx.font = `900 ${Math.round(pop.size * dpr)}px Orbitron, "Segoe UI", sans-serif`;
        ctx.lineWidth = 4 * dpr;
        ctx.strokeStyle = 'rgba(4, 8, 18, 0.88)';
        ctx.strokeText(pop.text, 0, 0);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  G.SceneRenderer = SceneRenderer;
})(window.Gapper);
