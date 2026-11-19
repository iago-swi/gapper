window.Gapper = window.Gapper || {};

(function (G) {
  'use strict';

  const LEVELS = [
    {
      id: 1,
      code: 'SECTOR 01',
      name: 'PRISM CIRCUIT',
      subtitle: 'TRACE ALL CONDUITS • SEVER TO SURVIVE',
      cols: 10,
      rows: 6,
      playerSpeed: 215,
      seekerBaseSpeed: 132,
      seekers: [
        { type: 'hunter', spawn: 'topRight', delay: 0.4 }
      ],
      palette: {
        swatch: 'linear-gradient(90deg, #32d8ff, #ffcf56)',
        railBase: '#2792d8',
        railCore: '#6feaff',
        railPainted: '#ffb838',
        railPaintedCore: '#fff1a6',
        cellFillA: 'rgba(255, 178, 46, 0.28)',
        cellFillB: 'rgba(255, 102, 74, 0.16)',
        cellBorder: '#ffd978',
        cellGlow: '#ff9d2e',
        boardTint: [0.06, 0.14, 0.28],
        nebulaA: [0.03, 0.12, 0.26],
        nebulaB: [0.16, 0.05, 0.24],
        nebulaAccent: [0.18, 0.72, 0.95]
      },
      rects: [
        [0, 0, 2, 2], [2, 0, 3, 2], [5, 0, 3, 2], [8, 0, 2, 2],
        [0, 2, 3, 2], [3, 2, 2, 2], [5, 2, 2, 2], [7, 2, 3, 2],
        [0, 4, 2, 2], [2, 4, 3, 2], [5, 4, 3, 2], [8, 4, 2, 2]
      ]
    },
    {
      id: 2,
      code: 'SECTOR 02',
      name: 'EMERALD LATTICE',
      subtitle: 'STALKER DETECTED • ANTICIPATES YOUR TURNS',
      cols: 12,
      rows: 6,
      playerSpeed: 222,
      seekerBaseSpeed: 142,
      seekers: [
        { type: 'hunter', spawn: 'topRight', delay: 0.3 },
        { type: 'stalker', spawn: 'topLeft', delay: 1.5 }
      ],
      palette: {
        swatch: 'linear-gradient(90deg, #27f2a8, #ff4fa3)',
        railBase: '#18a87e',
        railCore: '#5effcf',
        railPainted: '#ff4298',
        railPaintedCore: '#ffc4e2',
        cellFillA: 'rgba(255, 68, 156, 0.28)',
        cellFillB: 'rgba(130, 56, 255, 0.18)',
        cellBorder: '#ff8cc4',
        cellGlow: '#ff3895',
        boardTint: [0.04, 0.20, 0.18],
        nebulaA: [0.02, 0.18, 0.16],
        nebulaB: [0.22, 0.04, 0.22],
        nebulaAccent: [0.15, 0.92, 0.65]
      },
      rects: [
        [0, 0, 2, 2], [0, 2, 2, 2], [0, 4, 2, 2],
        [2, 0, 2, 3], [2, 3, 2, 3],
        [4, 0, 4, 2], [4, 2, 2, 2], [6, 2, 2, 2], [4, 4, 4, 2],
        [8, 0, 2, 3], [8, 3, 2, 3],
        [10, 0, 2, 2], [10, 2, 2, 2], [10, 4, 2, 2]
      ]
    },
    {
      id: 3,
      code: 'SECTOR 03',
      name: 'SOLAR CITADEL',
      subtitle: 'CENTRAL VOID • USE THE ABYSS TO LOOP PURSUERS',
      cols: 12,
      rows: 8,
      playerSpeed: 228,
      seekerBaseSpeed: 148,
      seekers: [
        { type: 'hunter', spawn: 'topRight', delay: 0.2 },
        { type: 'stalker', spawn: 'topLeft', delay: 1.2 }
      ],
      palette: {
        swatch: 'linear-gradient(90deg, #8b68ff, #ff6c3b)',
        railBase: '#6f4de0',
        railCore: '#baa6ff',
        railPainted: '#ff6933',
        railPaintedCore: '#ffe0a8',
        cellFillA: 'rgba(255, 108, 52, 0.30)',
        cellFillB: 'rgba(255, 48, 104, 0.18)',
        cellBorder: '#ffa97a',
        cellGlow: '#ff5e2e',
        boardTint: [0.14, 0.08, 0.28],
        nebulaA: [0.12, 0.05, 0.26],
        nebulaB: [0.28, 0.08, 0.09],
        nebulaAccent: [0.62, 0.38, 1.0]
      },
      rects: [
        [0, 0, 2, 3], [0, 3, 2, 2], [0, 5, 2, 3],
        [2, 0, 2, 2], [2, 2, 2, 2], [2, 4, 2, 2], [2, 6, 2, 2],
        [4, 0, 2, 3], [6, 0, 2, 3],
        [4, 5, 2, 3], [6, 5, 2, 3],
        [8, 0, 2, 2], [8, 2, 2, 2], [8, 4, 2, 2], [8, 6, 2, 2],
        [10, 0, 2, 3], [10, 3, 2, 2], [10, 5, 2, 3]
      ]
    },
    {
      id: 4,
      code: 'SECTOR 04',
      name: 'CRYOGENIC NEXUS',
      subtitle: 'SURGE SENTINEL ACTIVE • ACCELERATES ON STRAIGHTS',
      cols: 12,
      rows: 8,
      playerSpeed: 234,
      seekerBaseSpeed: 152,
      seekers: [
        { type: 'hunter', spawn: 'topRight', delay: 0.2 },
        { type: 'stalker', spawn: 'topLeft', delay: 1.0 },
        { type: 'surge', spawn: 'topCenter', delay: 2.2 }
      ],
      palette: {
        swatch: 'linear-gradient(90deg, #6ee7ff, #ff2e6d)',
        railBase: '#2c8fc4',
        railCore: '#a6f4ff',
        railPainted: '#ff2b6a',
        railPaintedCore: '#ffb8d1',
        cellFillA: 'rgba(255, 44, 108, 0.28)',
        cellFillB: 'rgba(255, 128, 70, 0.16)',
        cellBorder: '#ff8ab0',
        cellGlow: '#ff2468',
        boardTint: [0.05, 0.16, 0.26],
        nebulaA: [0.03, 0.14, 0.25],
        nebulaB: [0.26, 0.03, 0.14],
        nebulaAccent: [0.38, 0.88, 1.0]
      },
      rects: [
        [0, 0, 2, 2], [0, 2, 2, 4], [0, 6, 2, 2],
        [2, 0, 3, 2], [2, 2, 3, 2], [2, 4, 3, 2], [2, 6, 3, 2],
        [5, 0, 2, 3], [5, 3, 2, 2], [5, 5, 2, 3],
        [7, 0, 3, 2], [7, 2, 3, 2], [7, 4, 3, 2], [7, 6, 3, 2],
        [10, 0, 2, 2], [10, 2, 2, 4], [10, 6, 2, 2]
      ]
    },
    {
      id: 5,
      code: 'SECTOR 05',
      name: 'TWIN MONOLITHS',
      subtitle: 'DUAL CHAMBERS • TRAP SEEKERS IN THE BRIDGE',
      cols: 14,
      rows: 8,
      playerSpeed: 240,
      seekerBaseSpeed: 158,
      seekers: [
        { type: 'hunter', spawn: 'topRight', delay: 0.2 },
        { type: 'stalker', spawn: 'topLeft', delay: 1.0 },
        { type: 'surge', spawn: 'topCenter', delay: 2.0 }
      ],
      palette: {
        swatch: 'linear-gradient(90deg, #567dff, #ffe066)',
        railBase: '#4060d8',
        railCore: '#9cb5ff',
        railPainted: '#ffd54a',
        railPaintedCore: '#fff7c7',
        cellFillA: 'rgba(255, 212, 72, 0.28)',
        cellFillB: 'rgba(72, 232, 255, 0.16)',
        cellBorder: '#ffe894',
        cellGlow: '#ffc933',
        boardTint: [0.08, 0.10, 0.28],
        nebulaA: [0.06, 0.08, 0.26],
        nebulaB: [0.22, 0.16, 0.04],
        nebulaAccent: [0.35, 0.56, 1.0]
      },
      rects: [
        [0, 0, 3, 2], [0, 2, 3, 4], [0, 6, 3, 2],
        [3, 0, 2, 3], [3, 5, 2, 3],
        [5, 0, 2, 2], [7, 0, 2, 2], [5, 2, 4, 2], [5, 4, 4, 2], [5, 6, 2, 2], [7, 6, 2, 2],
        [9, 0, 2, 3], [9, 5, 2, 3],
        [11, 0, 3, 2], [11, 2, 3, 4], [11, 6, 3, 2]
      ]
    },
    {
      id: 6,
      code: 'SECTOR 06',
      name: 'HYPERCUBE CORE',
      subtitle: 'MAXIMUM VELOCITY • MASTER THE PRISM',
      cols: 14,
      rows: 8,
      playerSpeed: 248,
      seekerBaseSpeed: 165,
      seekers: [
        { type: 'hunter', spawn: 'topRight', delay: 0.2 },
        { type: 'stalker', spawn: 'topLeft', delay: 0.9 },
        { type: 'surge', spawn: 'topCenter', delay: 1.7 },
        { type: 'hunter', spawn: 'midRight', delay: 2.6 }
      ],
      palette: {
        swatch: 'linear-gradient(90deg, #00f5d4, #ff66c4, #ffe66d)',
        railBase: '#00a89e',
        railCore: '#66fff2',
        railPainted: '#ff6ad5',
        railPaintedCore: '#fff2a6',
        cellFillA: 'rgba(255, 108, 214, 0.28)',
        cellFillB: 'rgba(64, 248, 224, 0.20)',
        cellBorder: '#ffb8ef',
        cellGlow: '#ff52cc',
        boardTint: [0.06, 0.16, 0.22],
        nebulaA: [0.04, 0.16, 0.22],
        nebulaB: [0.24, 0.05, 0.24],
        nebulaAccent: [0.0, 0.96, 0.84]
      },
      rects: [
        [0, 0, 2, 2], [0, 2, 2, 2], [0, 4, 2, 2], [0, 6, 2, 2],
        [2, 0, 3, 3], [2, 3, 3, 2], [2, 5, 3, 3],
        [5, 0, 4, 2], [5, 2, 2, 2], [7, 2, 2, 2], [5, 4, 2, 2], [7, 4, 2, 2], [5, 6, 4, 2],
        [9, 0, 3, 3], [9, 3, 3, 2], [9, 5, 3, 3],
        [12, 0, 2, 2], [12, 2, 2, 2], [12, 4, 2, 2], [12, 6, 2, 2]
      ]
    }
  ];

  /**
   * Builds an exact planar graph (nodes, atomic edges, cell-edge bindings, adjacency)
   * from a level definition of non-overlapping axis-aligned rectangles.
   */
  function buildLevelGraph(levelDef) {
    const rects = levelDef.rects.map((r, idx) => ({
      id: idx,
      x: r[0],
      y: r[1],
      w: r[2],
      h: r[3],
      x2: r[0] + r[2],
      y2: r[1] + r[3],
      edges: [],
      completed: false,
      completeAnim: 0,
      isCorner: false,
      patternSeed: (idx * 7 + levelDef.id * 13) % 4
    }));

    const hSegs = [];
    const vSegs = [];
    const nodeMap = new Map();

    function ensureNode(gx, gy) {
      const key = gx + ',' + gy;
      let node = nodeMap.get(key);
      if (!node) {
        node = {
          id: nodeMap.size,
          gx,
          gy,
          nx: gx / levelDef.cols,
          ny: gy / levelDef.rows,
          x: 0,
          y: 0,
          adj: { up: null, down: null, left: null, right: null }
        };
        nodeMap.set(key, node);
      }
      return node;
    }

    for (const r of rects) {
      hSegs.push({ y: r.y, x1: r.x, x2: r.x2 });
      hSegs.push({ y: r.y2, x1: r.x, x2: r.x2 });
      vSegs.push({ x: r.x, y1: r.y, y2: r.y2 });
      vSegs.push({ x: r.x2, y1: r.y, y2: r.y2 });
      ensureNode(r.x, r.y);
      ensureNode(r.x2, r.y);
      ensureNode(r.x, r.y2);
      ensureNode(r.x2, r.y2);
    }

    // Add all H-V intersection vertices
    for (const h of hSegs) {
      for (const v of vSegs) {
        if (v.x >= h.x1 && v.x <= h.x2 && h.y >= v.y1 && h.y <= v.y2) {
          ensureNode(v.x, h.y);
        }
      }
    }

    const nodes = Array.from(nodeMap.values());
    const edges = [];

    function liesOnHorizontalBorder(mx, y) {
      for (const r of rects) {
        if ((r.y === y || r.y2 === y) && mx > r.x && mx < r.x2) return true;
      }
      return false;
    }

    function liesOnVerticalBorder(x, my) {
      for (const r of rects) {
        if ((r.x === x || r.x2 === x) && my > r.y && my < r.y2) return true;
      }
      return false;
    }

    // Group by gy for horizontal edges
    const byRow = new Map();
    for (const n of nodes) {
      if (!byRow.has(n.gy)) byRow.set(n.gy, []);
      byRow.get(n.gy).push(n);
    }
    for (const [gy, rowNodes] of byRow.entries()) {
      rowNodes.sort((a, b) => a.gx - b.gx);
      for (let i = 0; i < rowNodes.length - 1; i++) {
        const a = rowNodes[i];
        const b = rowNodes[i + 1];
        const mx = (a.gx + b.gx) * 0.5;
        if (liesOnHorizontalBorder(mx, gy)) {
          const edge = {
            id: edges.length,
            a: a.id,
            b: b.id,
            orientation: 'H',
            gridLen: b.gx - a.gx,
            lengthPx: 1,
            intervals: [],
            painted: false,
            paintFlash: 0,
            cells: [],
            gap: null
          };
          edges.push(edge);
          a.adj.right = { edgeId: edge.id, neighborId: b.id, dir: 'right', toEnd: 1 };
          b.adj.left = { edgeId: edge.id, neighborId: a.id, dir: 'left', toEnd: 0 };
        }
      }
    }

    // Group by gx for vertical edges
    const byCol = new Map();
    for (const n of nodes) {
      if (!byCol.has(n.gx)) byCol.set(n.gx, []);
      byCol.get(n.gx).push(n);
    }
    for (const [gx, colNodes] of byCol.entries()) {
      colNodes.sort((a, b) => a.gy - b.gy);
      for (let i = 0; i < colNodes.length - 1; i++) {
        const a = colNodes[i];
        const b = colNodes[i + 1];
        const my = (a.gy + b.gy) * 0.5;
        if (liesOnVerticalBorder(gx, my)) {
          const edge = {
            id: edges.length,
            a: a.id,
            b: b.id,
            orientation: 'V',
            gridLen: b.gy - a.gy,
            lengthPx: 1,
            intervals: [],
            painted: false,
            paintFlash: 0,
            cells: [],
            gap: null
          };
          edges.push(edge);
          a.adj.down = { edgeId: edge.id, neighborId: b.id, dir: 'down', toEnd: 1 };
          b.adj.up = { edgeId: edge.id, neighborId: a.id, dir: 'up', toEnd: 0 };
        }
      }
    }

    // Bind cells to boundary edges
    for (const e of edges) {
      const na = nodes[e.a];
      const nb = nodes[e.b];
      const mx = (na.gx + nb.gx) * 0.5;
      const my = (na.gy + nb.gy) * 0.5;
      for (const r of rects) {
        if (e.orientation === 'H') {
          if ((my === r.y || my === r.y2) && mx > r.x && mx < r.x2) {
            r.edges.push(e.id);
            e.cells.push(r.id);
          }
        } else {
          if ((mx === r.x || mx === r.x2) && my > r.y && my < r.y2) {
            r.edges.push(e.id);
            e.cells.push(r.id);
          }
        }
      }
    }

    // Identify 4 corner cells (for Prism Overdrive bonus)
    const cornerTargets = [
      { x: 0, y: 0 },
      { x: levelDef.cols, y: 0 },
      { x: 0, y: levelDef.rows },
      { x: levelDef.cols, y: levelDef.rows }
    ];
    const cornerCellIds = [];
    for (const target of cornerTargets) {
      let best = null;
      let bestDist = Infinity;
      for (const r of rects) {
        const cx = r.x + r.w * 0.5;
        const cy = r.y + r.h * 0.5;
        const d = Math.hypot(cx - target.x, cy - target.y);
        if (d < bestDist) {
          bestDist = d;
          best = r;
        }
      }
      if (best && !best.isCorner) {
        best.isCorner = true;
        cornerCellIds.push(best.id);
      }
    }

    // Helper to find nearest node to a target grid coordinate
    function nearestNode(tx, ty) {
      let best = nodes[0];
      let bestD = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.gx - tx, n.gy - ty);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best.id;
    }

    const spawns = {
      player: nearestNode(levelDef.cols * 0.5, levelDef.rows),
      topLeft: nearestNode(0, 0),
      topRight: nearestNode(levelDef.cols, 0),
      topCenter: nearestNode(levelDef.cols * 0.5, 0),
      midRight: nearestNode(levelDef.cols, levelDef.rows * 0.5),
      bottomLeft: nearestNode(0, levelDef.rows),
      bottomRight: nearestNode(levelDef.cols, levelDef.rows)
    };

    // Detect any rectangular architectural void cutouts (uncovered grid zones)
    const voidRects = [];
    const covered = Array.from({ length: levelDef.rows }, () => Array(levelDef.cols).fill(false));
    for (const r of rects) {
      for (let gy = r.y; gy < r.y2; gy++) {
        for (let gx = r.x; gx < r.x2; gx++) {
          covered[gy][gx] = true;
        }
      }
    }
    const visitedVoid = Array.from({ length: levelDef.rows }, () => Array(levelDef.cols).fill(false));
    for (let gy = 0; gy < levelDef.rows; gy++) {
      for (let gx = 0; gx < levelDef.cols; gx++) {
        if (covered[gy][gx] || visitedVoid[gy][gx]) continue;
        // Flood-expand maximal rectangle
        let w = 1;
        while (gx + w < levelDef.cols && !covered[gy][gx + w] && !visitedVoid[gy][gx + w]) w++;
        let h = 1;
        outer: while (gy + h < levelDef.rows) {
          for (let dx = 0; dx < w; dx++) {
            if (covered[gy + h][gx + dx] || visitedVoid[gy + h][gx + dx]) break outer;
          }
          h++;
        }
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) visitedVoid[gy + dy][gx + dx] = true;
        }
        voidRects.push({ x: gx, y: gy, w, h });
      }
    }

    return {
      level: levelDef,
      cols: levelDef.cols,
      rows: levelDef.rows,
      nodes,
      edges,
      cells: rects,
      voidRects,
      cornerCellIds,
      spawns
    };
  }

  G.LEVELS = LEVELS;
  G.buildLevelGraph = buildLevelGraph;
})(window.Gapper);
