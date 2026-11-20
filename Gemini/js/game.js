window.Gapper = window.Gapper || {};

(function (G) {
  'use strict';

  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const TURN_LEFT = { up: 'left', left: 'down', down: 'right', right: 'up' };
  const TURN_RIGHT = { up: 'right', right: 'down', down: 'left', left: 'up' };
  const DIRS = ['up', 'down', 'left', 'right'];

  const LATE_TURN_WINDOW = 0.3;
  const FIRST_PERSON_QUEUE_TTL = 1.0;
  const VISUAL_OFFSET_DECAY_RATE = 30;
  const BEST_STORAGE_KEY = 'gapper_prism_best';
  const CONTROL_STORAGE_KEY = 'gapper_prism_controls';

  function safeStorageGet(key) {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, val) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, val);
    } catch (_) {}
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  class GameEngine {
    constructor(sound, renderer, onHudUpdate, onStateChange) {
      this.sound = sound;
      this.renderer = renderer;
      this.onHudUpdate = onHudUpdate;
      this.onStateChange = onStateChange;

      this.mode = 'attract'; // 'attract' | 'playing' | 'paused' | 'stageClear' | 'gameOver'
      this.stageIndex = 0;
      this.selectedStartStage = 0;

      this.score = 0;
      this.bestScore = Number(safeStorageGet(BEST_STORAGE_KEY) || 0);
      this.controlScheme = safeStorageGet(CONTROL_STORAGE_KEY) === 'first' ? 'first' : 'third';
      this.paxEnabled = false;
      this.paxUsedThisGame = false;
      this.lives = 3;
      this.combo = 1;
      this.comboTimer = 0;
      this.maxComboThisStage = 1;
      this.seekersBlockedThisStage = 0;
      this.totalCellsSealed = 0;

      this.time = 0;
      this.hitStop = 0;
      this.shake = 0;
      this.chroma = 0;
      this.overdriveTimer = 0;
      this.overdriveTriggered = false;
      this.overdriveKills = 0;
      this.stageClearDelay = 0;

      this.graph = null;
      this.player = null;
      this.seekers = [];
      this.shard = { active: false, nodeId: 0, x: 0, y: 0, timer: 0, cooldown: 9 };

      this.particles = [];
      this.rings = [];
      this.popups = [];
      this.shockwaves = [];

      // Input state
      this.heldDirs = [];
      this.queuedDir = null;
      this.queuedRelTurn = null;
      this.queuedRelTimer = 0;

      this.progress = 0;
      this.cornerCount = 0;

      // Attract mode AI state
      this.aiTimer = 0;
      this.aiGapCooldown = 3.5;

      this._loadStage(0, true);
    }

    startNewGame(startStageIndex = this.selectedStartStage) {
      this.sound.init();
      this.selectedStartStage = startStageIndex;
      this.stageIndex = startStageIndex;
      this.score = 0;
      this.lives = 3;
      this.totalCellsSealed = 0;
      this.paxUsedThisGame = this.paxEnabled;
      this.mode = 'playing';
      this._loadStage(this.stageIndex, false);
      this.onStateChange('playing', this.graph.level);
      this._emitHud();
    }

    setControlScheme(scheme) {
      const next = scheme === 'first' ? 'first' : 'third';
      this.controlScheme = next;
      safeStorageSet(CONTROL_STORAGE_KEY, next);
      this.clearInputs();
      if (this.mode === 'playing' && next === 'first' && this.player && this.player.deadTimer <= 0) {
        if (this.player.mode === 'node' && !this.player.dir) {
          this._startAutoMoveFirstPerson();
        }
      }
      return this.controlScheme;
    }

    togglePax() {
      this.paxEnabled = !this.paxEnabled;
      if (this.paxEnabled && (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'stageClear')) {
        this.paxUsedThisGame = true;
      }
      return this.paxEnabled;
    }

    setPaused(shouldPause) {
      if (shouldPause && this.mode === 'playing') {
        this.mode = 'paused';
        this.sound.setAmbientIntensity(false, 0, false);
        this.onStateChange('paused', this.graph.level);
      } else if (!shouldPause && this.mode === 'paused') {
        this.mode = 'playing';
        if (this.controlScheme === 'first' && this.player && this.player.deadTimer <= 0) {
          if (this.player.mode === 'node' && !this.player.dir && this.player.lastEdgeId === -1) {
            this._startAutoMoveFirstPerson();
          }
        }
        this.onStateChange('playing', this.graph.level);
      }
    }

    restartStage() {
      this.sound.init();
      this.mode = 'playing';
      this._loadStage(this.stageIndex, false);
      this.onStateChange('playing', this.graph.level);
      this._emitHud();
    }

    nextStage() {
      this.sound.init();
      this.stageIndex = (this.stageIndex + 1) % G.LEVELS.length;
      if (this.lives < 4) this.lives++;
      this.mode = 'playing';
      this._loadStage(this.stageIndex, false);
      this.onStateChange('playing', this.graph.level);
      this._emitHud();
    }

    returnToTitle() {
      this.mode = 'attract';
      this._loadStage(this.selectedStartStage, true);
      this.sound.setAmbientIntensity(false, 0, false);
      this.onStateChange('attract', this.graph.level);
    }

    togglePause() {
      if (this.mode === 'playing') {
        this.setPaused(true);
      } else if (this.mode === 'paused') {
        this.setPaused(false);
      }
    }

    previewStage(idx) {
      this.selectedStartStage = idx;
      if (this.mode === 'attract') {
        this._loadStage(idx, true);
      }
    }

    _loadStage(idx, isAttract) {
      const def = G.LEVELS[idx % G.LEVELS.length];
      this.graph = G.buildLevelGraph(def);

      this.combo = 1;
      this.comboTimer = 0;
      this.maxComboThisStage = 1;
      this.seekersBlockedThisStage = 0;
      this.overdriveTimer = 0;
      this.overdriveTriggered = false;
      this.overdriveKills = 0;
      this.stageClearDelay = 0;
      this.progress = 0;
      this.cornerCount = 0;
      this.particles = [];
      this.rings = [];
      this.popups = [];
      this.shockwaves = [];
      this.heldDirs = [];
      this.queuedDir = null;
      this.queuedRelTurn = null;
      this.queuedRelTimer = 0;

      const startNode = this.graph.nodes[this.graph.spawns.player];
      this.player = {
        mode: 'node',
        nodeId: startNode.id,
        edgeId: -1,
        t: 0,
        dir: null,
        facing: 'up',
        lastEdgeId: -1,
        entryNodeId: -1,
        entryEdgeWasPainted: false,
        entryEdgePrevIntervals: [],
        reversing: false,
        visOffX: 0,
        visOffY: 0,
        x: startNode.x,
        y: startNode.y,
        trail: [],
        gapCharges: 3,
        maxGapCharges: 3,
        invulnTimer: isAttract ? 999 : 2.2,
        deadTimer: 0
      };

      if (!isAttract && this.controlScheme === 'first') {
        this._startAutoMoveFirstPerson();
      }

      this.seekers = def.seekers.map((cfg, sIdx) => {
        const spawnId = this.graph.spawns[cfg.spawn] ?? this.graph.spawns.topRight;
        const n = this.graph.nodes[spawnId];
        return {
          id: sIdx,
          type: cfg.type,
          spawnNodeId: spawnId,
          mode: 'node',
          nodeId: spawnId,
          edgeId: -1,
          t: 0,
          dir: null,
          prevDir: null,
          straightCount: 0,
          surging: false,
          x: n.x,
          y: n.y,
          trail: [],
          stunTimer: 0,
          trappedTimer: 0,
          respawnTimer: isAttract ? cfg.delay * 0.5 : cfg.delay + 0.4
        };
      });

      this.shard = { active: false, nodeId: 0, x: 0, y: 0, timer: 0, cooldown: 8.5 };
      this.aiTimer = 0;
      this.aiGapCooldown = 2.5;
    }

    // ==================== INPUT & IMMEDIATE STEERING ====================
    _canEnterFromNode(node, dir) {
      if (!node || !dir) return false;
      const link = node.adj[dir];
      if (!link) return false;
      const edge = this.graph.edges[link.edgeId];
      const enterT = link.toEnd === 1 ? 0 : 1;
      if (edge.gap) {
        const g0 = edge.gap.t - edge.gap.halfT;
        const g1 = edge.gap.t + edge.gap.halfT;
        if ((enterT === 0 && g0 < 0.04) || (enterT === 1 && g1 > 0.96)) {
          return false;
        }
      }
      return true;
    }

    _enterEdgeFromNode(node, dir, initialDistPx = 0) {
      if (!this._canEnterFromNode(node, dir)) return false;
      const p = this.player;
      const link = node.adj[dir];
      const edge = this.graph.edges[link.edgeId];
      const enterT = link.toEnd === 1 ? 0 : 1;

      p.entryNodeId = node.id;
      p.entryEdgeWasPainted = edge.painted;
      p.entryEdgePrevIntervals = edge.intervals.map((iv) => [iv[0], iv[1]]);
      p.reversing = false;

      p.mode = 'edge';
      p.edgeId = edge.id;
      p.dir = dir;
      p.facing = dir;
      p.t = enterT;

      if (initialDistPx > 0) {
        const lenPx = Math.max(1, edge.lengthPx);
        let frac = clamp(initialDistPx / lenPx, 0, 0.96);
        if (edge.gap) {
          const g0 = edge.gap.t - edge.gap.halfT - 0.025;
          const g1 = edge.gap.t + edge.gap.halfT + 0.025;
          if (enterT === 0) frac = Math.min(frac, Math.max(0, g0));
          else frac = Math.min(frac, Math.max(0, 1 - g1));
        }
        if (enterT === 0) {
          p.t = frac;
          this._paintEdgeInterval(edge, 0, p.t);
        } else {
          p.t = 1 - frac;
          this._paintEdgeInterval(edge, p.t, 1);
        }
      }

      this._syncEntityPositions();
      return true;
    }

    _startAutoMoveFirstPerson() {
      const p = this.player;
      if (!p || p.mode !== 'node') return false;
      const node = this.graph.nodes[p.nodeId];
      const pref = [p.facing || 'up', 'up', 'right', 'left', 'down'];
      for (const d of pref) {
        if (this._enterEdgeFromNode(node, d)) {
          return true;
        }
      }
      return false;
    }

    _tryLateTurn(turnDir) {
      const p = this.player;
      if (!p || p.mode !== 'edge' || p.reversing || p.entryNodeId < 0) return false;
      if (turnDir === p.dir || turnDir === OPPOSITE[p.dir]) return false;

      const oldEdge = this.graph.edges[p.edgeId];
      if (!oldEdge) return false;

      const distFrac = (p.entryNodeId === oldEdge.a) ? p.t : (1 - p.t);
      if (distFrac > LATE_TURN_WINDOW + 1e-9) return false;

      const entryNode = this.graph.nodes[p.entryNodeId];
      if (!this._canEnterFromNode(entryNode, turnDir)) return false;

      // Preserve current drawn position so we can smoothly blend without jumping
      this._syncEntityPositions();
      const oldVisX = p.x + p.visOffX;
      const oldVisY = p.y + p.visOffY;

      // Abandoned old segment does not count as traced
      if (!p.entryEdgeWasPainted) {
        oldEdge.intervals = p.entryEdgePrevIntervals.map((iv) => [iv[0], iv[1]]);
        oldEdge.painted = false;
        oldEdge.paintFlash = 0;
      }

      const travelledPx = distFrac * Math.max(1, oldEdge.lengthPx);
      this._enterEdgeFromNode(entryNode, turnDir, travelledPx);

      // Visual offset = old drawn position minus new logical position
      p.visOffX = oldVisX - p.x;
      p.visOffY = oldVisY - p.y;
      return true;
    }

    setDirectionDown(dir) {
      if (!DIRS.includes(dir)) return;
      if (this.mode !== 'playing' || !this.player || this.player.deadTimer > 0) return;

      const p = this.player;

      if (this.controlScheme === 'first') {
        // First person: only LEFT and RIGHT are used; UP and DOWN do nothing
        if (dir !== 'left' && dir !== 'right') return;
        const travel = p.dir || p.facing || 'up';
        const turnDir = dir === 'left' ? TURN_LEFT[travel] : TURN_RIGHT[travel];

        if (p.mode === 'node') {
          const node = this.graph.nodes[p.nodeId];
          if (this._enterEdgeFromNode(node, turnDir)) {
            this.queuedRelTurn = null;
            this.queuedRelTimer = 0;
            return;
          }
          this.queuedRelTurn = dir;
          this.queuedRelTimer = FIRST_PERSON_QUEUE_TTL;
          return;
        }

        if (p.mode === 'edge') {
          if (this._tryLateTurn(turnDir)) {
            this.queuedRelTurn = null;
            this.queuedRelTimer = 0;
            return;
          }
          this.queuedRelTurn = dir;
          this.queuedRelTimer = FIRST_PERSON_QUEUE_TTL;
        }
        return;
      }

      // Third person: 4-way steering handled immediately inside keydown/touch
      this.heldDirs = this.heldDirs.filter((d) => d !== dir);
      this.heldDirs.push(dir);
      this.queuedDir = dir;

      if (p.mode === 'node') {
        const node = this.graph.nodes[p.nodeId];
        if (this._enterEdgeFromNode(node, dir)) {
          this.queuedDir = null;
        }
        return;
      }

      if (p.mode === 'edge') {
        // Immediate mid-segment reversal
        if (dir === OPPOSITE[p.dir]) {
          p.dir = dir;
          p.facing = dir;
          p.reversing = true;
          this.queuedDir = null;
          return;
        }
        // Late-turn window (<= 0.3 of segment past entry junction)
        if (dir !== p.dir) {
          if (this._tryLateTurn(dir)) {
            this.queuedDir = null;
            return;
          }
        }
      }
    }

    setDirectionUp(dir) {
      this.heldDirs = this.heldDirs.filter((d) => d !== dir);
    }

    clearInputs() {
      this.heldDirs = [];
      this.queuedDir = null;
      this.queuedRelTurn = null;
      this.queuedRelTimer = 0;
    }

    _getDesiredDirThirdPerson() {
      if (this.queuedDir) return this.queuedDir;
      if (this.heldDirs.length > 0) {
        return this.heldDirs[this.heldDirs.length - 1];
      }
      return null;
    }

    triggerGap() {
      if (this.mode !== 'playing' && this.mode !== 'attract') return false;
      if (!this.player || this.player.deadTimer > 0) return false;
      if (this.player.gapCharges < 1) return false;

      // Count active gaps
      let activeGaps = 0;
      for (const e of this.graph.edges) {
        if (e.gap) activeGaps++;
      }
      if (activeGaps >= 3) return false;

      const p = this.player;
      let targetEdge = null;
      let gapT = 0.5;

      // Priority 1: Behind player on current edge if far enough from entry node
      if (p.mode === 'edge' && p.edgeId >= 0) {
        const edge = this.graph.edges[p.edgeId];
        if (!edge.gap) {
          const movingToB = (p.dir === 'right' || p.dir === 'down');
          const halfT = Math.min(0.20, 0.34 / edge.gridLen);
          if (movingToB && p.t >= 0.30) {
            targetEdge = edge;
            gapT = clamp(p.t - halfT - 0.12, halfT + 0.06, p.t - halfT - 0.05);
          } else if (!movingToB && p.t <= 0.70) {
            targetEdge = edge;
            gapT = clamp(p.t + halfT + 0.12, p.t + halfT + 0.05, 1 - halfT - 0.06);
          }
        }
      }

      // Priority 2: The edge the player just came from
      if (!targetEdge && p.lastEdgeId >= 0) {
        const lastE = this.graph.edges[p.lastEdgeId];
        if (lastE && !lastE.gap) {
          targetEdge = lastE;
          gapT = 0.5;
        }
      }

      // Priority 3: Adjacent edge toward nearest active Seeker
      if (!targetEdge) {
        const refNodeId = p.mode === 'node'
          ? p.nodeId
          : (p.t < 0.5 ? this.graph.edges[p.edgeId].a : this.graph.edges[p.edgeId].b);
        const refNode = this.graph.nodes[refNodeId];
        const seeker = this._nearestSeekerTo(p.x, p.y);
        let bestScore = Infinity;
        for (const dir of DIRS) {
          const link = refNode.adj[dir];
          if (!link) continue;
          const e = this.graph.edges[link.edgeId];
          if (e.gap || e.id === p.edgeId) continue;
          const nb = this.graph.nodes[link.neighborId];
          const d = seeker ? Math.hypot(nb.x - seeker.x, nb.y - seeker.y) : 0;
          if (d < bestScore) {
            bestScore = d;
            targetEdge = e;
            gapT = 0.5;
          }
        }
      }

      if (!targetEdge) return false;

      const halfT = Math.min(0.20, 0.34 / targetEdge.gridLen);
      gapT = clamp(gapT, halfT + 0.06, 1 - halfT - 0.06);
      targetEdge.gap = {
        t: gapT,
        halfT,
        timer: 4.8,
        maxTimer: 4.8,
        blockedSeekers: new Set()
      };

      p.gapCharges = Math.max(0, p.gapCharges - 1);

      const na = this.graph.nodes[targetEdge.a];
      const nb = this.graph.nodes[targetEdge.b];
      const gx = lerp(na.x, nb.x, gapT);
      const gy = lerp(na.y, nb.y, gapT);

      if (this.mode === 'playing') this.sound.playGapCreate();
      this.shake = Math.max(this.shake, 5.5);
      this.chroma = Math.max(this.chroma, 0.42);
      this._spawnShockwave(gx, gy, 0.72, 0.36);
      this._spawnRing(gx, gy, 8, 56, '#64f7ff', 2.8, 0.42);
      this._spawnBurst(gx, gy, 18, '#7af8ff', 'spark', 260);
      this._spawnBurst(gx, gy, 6, '#ffffff', 'dot', 140);
      this._emitHud();
      return true;
    }

    // ==================== MAIN TICK ====================
    update(dt, canvasW, canvasH, dpr) {
      this.canvasW = canvasW;
      this.canvasH = canvasH;
      this.dpr = dpr;

      // Ensure pixel coords are synced before movement
      if (this.graph) {
        this.renderer.computeLayout(this.graph, canvasW, canvasH, dpr);
        this._syncEntityPositions();
      }

      if (this.mode === 'paused') {
        this.time += dt * 0.25;
        return;
      }

      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 26);
      this.chroma = Math.max(0, this.chroma - dt * 2.6);

      // Update FX even during hitStop for juicy punch
      this._updateParticles(dt);
      this._updateShockwaves(dt);

      if (this.hitStop > 0) {
        this.hitStop -= dt;
        return;
      }

      if (this.mode === 'stageClear' || this.mode === 'gameOver') {
        this._updateCellAnims(dt);
        return;
      }

      if (this.stageClearDelay > 0) {
        this.stageClearDelay -= dt;
        this._updateCellAnims(dt);
        if (this.stageClearDelay <= 0) {
          if (this.mode === 'attract') {
            this._loadStage((this.selectedStartStage + 1) % G.LEVELS.length, true);
          } else {
            this._finishStageClear();
          }
        }
        return;
      }

      // Timers
      if (this.queuedRelTimer > 0) {
        this.queuedRelTimer -= dt;
        if (this.queuedRelTimer <= 0) {
          this.queuedRelTimer = 0;
          this.queuedRelTurn = null;
        }
      }
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) {
          this.combo = 1;
          this._emitHud();
        }
      }
      if (this.overdriveTimer > 0) {
        this.overdriveTimer = Math.max(0, this.overdriveTimer - dt);
        if (this.overdriveTimer === 0) {
          this.overdriveKills = 0;
        }
      }

      // Update Gaps
      for (const e of this.graph.edges) {
        if (e.gap) {
          e.gap.timer -= dt;
          if (e.gap.timer <= 0) {
            const na = this.graph.nodes[e.a];
            const nb = this.graph.nodes[e.b];
            const gx = lerp(na.x, nb.x, e.gap.t);
            const gy = lerp(na.y, nb.y, e.gap.t);
            this._spawnBurst(gx, gy, 7, '#64f7ff', 'dot', 85);
            e.gap = null;
          }
        }
      }

      this._updateCellAnims(dt);
      this._updateShard(dt);

      // Attract AI steers the demo player smoothly
      if (this.mode === 'attract') {
        this._updateAttractAI(dt);
      }

      this._updatePlayer(dt);
      this._updateSeekers(dt);
      this._checkCollisions();

      if (this.mode === 'playing') {
        this.sound.setAmbientIntensity(true, this.progress, this.overdriveTimer > 0);
        this._emitHud();
      }
    }

    _syncEntityPositions() {
      const sync = (ent) => {
        if (!ent) return;
        if (ent.mode === 'node') {
          const n = this.graph.nodes[ent.nodeId];
          ent.x = n.x;
          ent.y = n.y;
        } else if (ent.edgeId >= 0) {
          const e = this.graph.edges[ent.edgeId];
          const na = this.graph.nodes[e.a];
          const nb = this.graph.nodes[e.b];
          ent.x = lerp(na.x, nb.x, ent.t);
          ent.y = lerp(na.y, nb.y, ent.t);
        }
      };
      sync(this.player);
      for (const s of this.seekers) sync(s);
      if (this.shard.active) {
        const sn = this.graph.nodes[this.shard.nodeId];
        this.shard.x = sn.x;
        this.shard.y = sn.y;
      }
    }

    _updateCellAnims(dt) {
      for (const c of this.graph.cells) {
        if (c.completed && c.completeAnim < 1) {
          c.completeAnim = Math.min(1, c.completeAnim + dt * 1.9);
        }
      }
      for (const e of this.graph.edges) {
        if (e.paintFlash > 0) {
          e.paintFlash = Math.max(0, e.paintFlash - dt * 2.8);
        }
      }
    }

    _updatePlayer(dt) {
      const p = this.player;
      if (!p) return;

      if (p.deadTimer > 0) {
        p.deadTimer -= dt;
        if (p.deadTimer <= 0) {
          this._respawnPlayer();
        }
        return;
      }

      if (p.invulnTimer > 0 && this.mode === 'playing') {
        p.invulnTimer = Math.max(0, p.invulnTimer - dt);
      }

      // Passive Gap charge regeneration
      if (p.gapCharges < p.maxGapCharges) {
        p.gapCharges = Math.min(p.maxGapCharges, p.gapCharges + dt / 4.2);
      }

      // Smoothly decay visual offset from late turns (~0.1s)
      if (p.visOffX !== 0 || p.visOffY !== 0) {
        const decay = Math.exp(-VISUAL_OFFSET_DECAY_RATE * dt);
        p.visOffX *= decay;
        p.visOffY *= decay;
        if (Math.abs(p.visOffX) < 0.05) p.visOffX = 0;
        if (Math.abs(p.visOffY) < 0.05) p.visOffY = 0;
      }

      const speedScale = (this.renderer.layout.cellPx / 72);
      const speedPx = this.graph.level.playerSpeed * speedScale * (this.overdriveTimer > 0 ? 1.18 : 1.0);
      let remainingDist = speedPx * dt;
      const useFirstPerson = (this.mode === 'playing' && this.controlScheme === 'first');

      // Safety loop (max 3 transitions in 1 frame)
      for (let step = 0; step < 3 && remainingDist > 0.01; step++) {
        if (p.mode === 'node') {
          const node = this.graph.nodes[p.nodeId];
          let chosen = null;

          if (useFirstPerson) {
            if (!p.dir) {
              // Waiting at a junction for LEFT or RIGHT (measured from arrival facing)
              break;
            }
            const travel = p.dir;
            const leftDir = TURN_LEFT[travel];
            const rightDir = TURN_RIGHT[travel];

            // 1. Queued relative turn if open
            if (this.queuedRelTurn && this.queuedRelTimer > 0) {
              const qDir = this.queuedRelTurn === 'left' ? leftDir : rightDir;
              if (this._canEnterFromNode(node, qDir)) {
                chosen = qDir;
                this.queuedRelTurn = null;
                this.queuedRelTimer = 0;
              }
            }

            // 2. Otherwise straight on if open
            if (!chosen && this._canEnterFromNode(node, travel)) {
              chosen = travel;
            }

            // 3. Otherwise if exactly one of left/right is open, take it unprompted
            if (!chosen) {
              const leftOpen = this._canEnterFromNode(node, leftDir);
              const rightOpen = this._canEnterFromNode(node, rightDir);
              if (leftOpen && !rightOpen) {
                chosen = leftDir;
              } else if (rightOpen && !leftOpen) {
                chosen = rightDir;
              } else {
                // Both open (or dead end): stop and wait, keeping arrival facing
                p.dir = null;
                p.facing = travel;
                break;
              }
            }
          } else {
            const desired = this._getDesiredDirThirdPerson();
            if (desired && this._canEnterFromNode(node, desired)) {
              chosen = desired;
            } else if (p.dir && this._canEnterFromNode(node, p.dir)) {
              chosen = p.dir;
            }
            if (!chosen) {
              p.dir = null;
              break;
            }
          }

          if (!this._enterEdgeFromNode(node, chosen)) {
            p.dir = null;
            break;
          }
          if (!useFirstPerson && chosen === this.queuedDir) {
            this.queuedDir = null;
          }
        }

        if (p.mode === 'edge') {
          const edge = this.graph.edges[p.edgeId];
          const movingToB = (p.dir === 'right' || p.dir === 'down');

          const dT = remainingDist / edge.lengthPx;
          const prevT = p.t;
          let nextT = movingToB ? prevT + dT : prevT - dT;

          // Respect active Gap barrier on this edge
          if (edge.gap) {
            const g0 = edge.gap.t - edge.gap.halfT - 0.025;
            const g1 = edge.gap.t + edge.gap.halfT + 0.025;
            if (movingToB && prevT <= edge.gap.t && nextT > g0) {
              nextT = Math.max(prevT, g0);
              this._paintEdgeInterval(edge, prevT, nextT);
              p.t = nextT;
              remainingDist = 0;
              break;
            }
            if (!movingToB && prevT >= edge.gap.t && nextT < g1) {
              nextT = Math.min(prevT, g1);
              this._paintEdgeInterval(edge, nextT, prevT);
              p.t = nextT;
              remainingDist = 0;
              break;
            }
          }

          if (nextT >= 1) {
            this._paintEdgeInterval(edge, prevT, 1);
            remainingDist -= (1 - prevT) * edge.lengthPx;
            p.mode = 'node';
            p.nodeId = edge.b;
            p.lastEdgeId = edge.id;
            p.edgeId = -1;
            p.t = 1;
            p.reversing = false;
          } else if (nextT <= 0) {
            this._paintEdgeInterval(edge, 0, prevT);
            remainingDist -= prevT * edge.lengthPx;
            p.mode = 'node';
            p.nodeId = edge.a;
            p.lastEdgeId = edge.id;
            p.edgeId = -1;
            p.t = 0;
            p.reversing = false;
          } else {
            this._paintEdgeInterval(edge, Math.min(prevT, nextT), Math.max(prevT, nextT));
            p.t = nextT;
            remainingDist = 0;
          }
        }
      }

      this._syncEntityPositions();

      // Update glowing ribbon trail (tracks drawn visual position seamlessly)
      const visX = p.x + p.visOffX;
      const visY = p.y + p.visOffY;
      const lastPt = p.trail[p.trail.length - 1];
      if (!lastPt || Math.hypot(visX - lastPt.x, visY - lastPt.y) > 2.5 * this.dpr) {
        p.trail.push({ x: visX, y: visY });
        if (p.trail.length > 18) p.trail.shift();
      }
    }

    _paintEdgeInterval(edge, s, e) {
      if (e - s <= 0.0005 || edge.painted) return;
      const a = clamp(s, 0, 1);
      const b = clamp(e, 0, 1);
      edge.intervals.push([a, b]);
      edge.intervals.sort((x, y) => x[0] - y[0]);

      // Merge overlapping intervals
      const merged = [];
      for (const cur of edge.intervals) {
        if (!merged.length || cur[0] > merged[merged.length - 1][1] + 0.025) {
          merged.push([cur[0], cur[1]]);
        } else {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], cur[1]);
        }
      }
      edge.intervals = merged;

      // Check full edge completion
      if (merged.length === 1 && merged[0][0] <= 0.035 && merged[0][1] >= 0.965) {
        edge.intervals = [[0, 1]];
        edge.painted = true;
        edge.paintFlash = 1;
        if (this.mode === 'playing') {
          this._addScore(15);
          this.sound.playEdgePainted();
        }
        this._checkCompletedCells(edge);
      }
    }

    _checkCompletedCells(edge) {
      const newlyCompleted = [];
      for (const cellId of edge.cells) {
        const cell = this.graph.cells[cellId];
        if (cell.completed) continue;
        let allPainted = true;
        for (const eid of cell.edges) {
          if (!this.graph.edges[eid].painted) {
            allPainted = false;
            break;
          }
        }
        if (allPainted) {
          cell.completed = true;
          cell.completeAnim = 0;
          newlyCompleted.push(cell);
        }
      }

      if (!newlyCompleted.length) return;

      const pal = this.graph.level.palette;
      const L = this.renderer.layout;

      if (this.comboTimer > 0) {
        this.combo = Math.min(8, this.combo + newlyCompleted.length);
      } else {
        this.combo = newlyCompleted.length > 1 ? 2 : 1;
      }
      this.comboTimer = 4.6;
      this.maxComboThisStage = Math.max(this.maxComboThisStage, this.combo);

      const multiBonus = newlyCompleted.length > 1 ? 2 : 1;
      let totalPts = 0;

      for (const cell of newlyCompleted) {
        const cx = L.boardX + (cell.x + cell.w * 0.5) * L.cellPx;
        const cy = L.boardY + (cell.y + cell.h * 0.5) * L.cellPx;
        const pts = (100 + cell.w * cell.h * 20) * this.combo * multiBonus;
        totalPts += pts;

        if (this.mode === 'playing') {
          this.totalCellsSealed++;
          this.player.gapCharges = Math.min(this.player.maxGapCharges, this.player.gapCharges + 0.5);
        }

        // Juicy crystalline burst & shockwave
        this._spawnShockwave(cx, cy, newlyCompleted.length > 1 ? 0.9 : 0.55, 0.45);
        this._spawnRing(cx, cy, 12, Math.max(cell.w, cell.h) * L.cellPx * 0.65 / this.dpr, pal.cellBorder, 3.2, 0.55);
        this._spawnBurst(cx, cy, 18, pal.cellBorder, 'shard', 210);
        this._spawnBurst(cx, cy, 14, '#ffffff', 'spark', 280);

        if (this.mode === 'playing') {
          const label = newlyCompleted.length > 1
            ? `DOUBLE SEAL +${pts}`
            : (this.combo > 1 ? `+${pts} x${this.combo}` : `+${pts}`);
          this._spawnPopup(cx, cy, label, newlyCompleted.length > 1 ? '#ffe478' : pal.cellBorder, newlyCompleted.length > 1 ? 18 : 14);
        }
      }

      if (this.mode === 'playing') {
        this._addScore(totalPts);
        this.sound.playCellSeal(this.combo, newlyCompleted.length);
      }

      this.shake = Math.max(this.shake, newlyCompleted.length > 1 ? 8 : 4.2);
      this.chroma = Math.max(this.chroma, newlyCompleted.length > 1 ? 0.58 : 0.25);
      if (newlyCompleted.length > 1) this.hitStop = 0.045;

      // Recalculate sector progress & corner count
      let completedCount = 0;
      let corners = 0;
      for (const c of this.graph.cells) {
        if (c.completed) {
          completedCount++;
          if (c.isCorner) corners++;
        }
      }
      this.progress = completedCount / this.graph.cells.length;
      this.cornerCount = corners;

      // Trigger PRISM OVERDRIVE when all 4 corners are sealed!
      if (!this.overdriveTriggered && corners === this.graph.cornerCellIds.length && completedCount < this.graph.cells.length) {
        this.overdriveTriggered = true;
        this.overdriveTimer = 6.5;
        this.overdriveKills = 0;
        this.player.gapCharges = this.player.maxGapCharges;
        const bx = L.boardX + L.boardW * 0.5;
        const by = L.boardY + L.boardH * 0.5;
        this._spawnShockwave(bx, by, 1.15, 0.72);
        this._spawnRing(bx, by, 20, L.boardW * 0.65 / this.dpr, '#ffe478', 4.5, 0.75);
        this._spawnBurst(bx, by, 34, '#ffe478', 'shard', 360);
        if (this.mode === 'playing') {
          this.sound.playOverdrive();
          this._spawnPopup(bx, by - 14 * this.dpr, 'PRISM OVERDRIVE!', '#fff3a8', 22);
        }
        this.shake = 10;
        this.chroma = 0.75;
      }

      // Check Sector Complete!
      if (completedCount === this.graph.cells.length) {
        this.stageClearDelay = 1.15;
        const bx = L.boardX + L.boardW * 0.5;
        const by = L.boardY + L.boardH * 0.5;
        this._spawnShockwave(bx, by, 1.35, 0.85);
        this._spawnBurst(bx, by, 56, pal.cellBorder, 'shard', 420);
        this._spawnBurst(bx, by, 40, '#ffffff', 'spark', 460);
        if (this.mode === 'playing') {
          this.sound.playLevelClear();
          this._spawnPopup(bx, by, 'SECTOR ILLUMINATED!', '#ffe885', 24);
        }
        this.shake = 12;
        this.chroma = 0.85;
      }
    }

    // ==================== SEEKER AI & PATHFINDING ====================
    _updateSeekers(dt) {
      const speedScale = (this.renderer.layout.cellPx / 72);
      const vulnerable = this.overdriveTimer > 0;
      const pNodeId = this._playerNearestNodeId();

      for (const s of this.seekers) {
        if (s.respawnTimer > 0) {
          s.respawnTimer -= dt;
          if (s.respawnTimer <= 0) {
            const sn = this.graph.nodes[s.spawnNodeId];
            s.mode = 'node';
            s.nodeId = sn.id;
            s.edgeId = -1;
            s.t = 0;
            s.dir = null;
            s.prevDir = null;
            s.straightCount = 0;
            s.surging = false;
            s.stunTimer = 0;
            s.trappedTimer = 0;
            s.x = sn.x;
            s.y = sn.y;
            s.trail = [];
            this._spawnRing(sn.x, sn.y, 4, 34, '#ff4d79', 2.4, 0.35);
          }
          continue;
        }

        if (s.stunTimer > 0) {
          s.stunTimer -= dt;
          continue;
        }

        // Check if trapped between Gaps!
        if (this._isSeekerTrapped(s)) {
          s.trappedTimer += dt;
          if (Math.random() < 0.45) {
            this._spawnBurst(s.x, s.y, 2, '#7af8ff', 'spark', 120);
          }
          if (s.trappedTimer >= 0.4) {
            this._shatterSeeker(s, 'TRAPPED!', 500);
          }
          continue;
        } else {
          s.trappedTimer = Math.max(0, s.trappedTimer - dt * 2);
        }

        let baseSpd = this.graph.level.seekerBaseSpeed;
        if (s.type === 'stalker') baseSpd *= 1.03;
        if (s.type === 'surge') baseSpd *= (s.surging ? 1.38 : 0.96);
        if (vulnerable) baseSpd *= 0.72;
        else baseSpd *= (1 + this.progress * 0.14); // Gentle tension ramp as board fills!

        let remainingDist = baseSpd * speedScale * dt;

        for (let step = 0; step < 3 && remainingDist > 0.01; step++) {
          if (s.mode === 'node') {
            const targetId = this._pickSeekerTarget(s, pNodeId);
            const chosen = this._chooseSeekerDirection(s, targetId, vulnerable);
            if (!chosen) {
              s.surging = false;
              break;
            }
            const node = this.graph.nodes[s.nodeId];
            const link = node.adj[chosen];
            const edge = this.graph.edges[link.edgeId];

            if (s.type === 'surge') {
              if (chosen === s.prevDir) {
                s.straightCount++;
                s.surging = s.straightCount >= 1 && !vulnerable;
              } else {
                s.straightCount = 0;
                s.surging = false;
              }
            }
            s.prevDir = chosen;
            s.mode = 'edge';
            s.edgeId = edge.id;
            s.t = link.toEnd === 1 ? 0 : 1;
            s.dir = chosen;
          }

          if (s.mode === 'edge') {
            const edge = this.graph.edges[s.edgeId];
            const movingToB = (s.dir === 'right' || s.dir === 'down');
            const dT = remainingDist / edge.lengthPx;
            const prevT = s.t;
            const nextT = movingToB ? prevT + dT : prevT - dT;

            // Check collision with active Plasma Gap!
            if (edge.gap) {
              const g0 = edge.gap.t - edge.gap.halfT - 0.03;
              const g1 = edge.gap.t + edge.gap.halfT + 0.03;
              const hitFromA = movingToB && prevT <= edge.gap.t + 0.05 && nextT >= g0;
              const hitFromB = !movingToB && prevT >= edge.gap.t - 0.05 && nextT <= g1;
              if (hitFromA || hitFromB) {
                s.t = hitFromA ? Math.min(prevT, g0) : Math.max(prevT, g1);
                s.dir = OPPOSITE[s.dir];
                s.stunTimer = 1.35;
                s.surging = false;
                s.straightCount = 0;
                this._onSeekerBlockedByGap(s, edge.gap);
                remainingDist = 0;
                break;
              }
            }

            if (nextT >= 1) {
              remainingDist -= (1 - prevT) * edge.lengthPx;
              s.mode = 'node';
              s.nodeId = edge.b;
              s.edgeId = -1;
              s.t = 1;
            } else if (nextT <= 0) {
              remainingDist -= prevT * edge.lengthPx;
              s.mode = 'node';
              s.nodeId = edge.a;
              s.edgeId = -1;
              s.t = 0;
            } else {
              s.t = nextT;
              remainingDist = 0;
            }
          }
        }

        // Sync coords & trail
        this._syncEntityPositions();
        const lastPt = s.trail[s.trail.length - 1];
        if (!lastPt || Math.hypot(s.x - lastPt.x, s.y - lastPt.y) > 3 * this.dpr) {
          s.trail.push({ x: s.x, y: s.y });
          if (s.trail.length > 10) s.trail.shift();
        }
      }
    }

    _onSeekerBlockedByGap(seeker, gap) {
      this._syncEntityPositions();
      this._spawnBurst(seeker.x, seeker.y, 18, '#7af8ff', 'spark', 260);
      this._spawnRing(seeker.x, seeker.y, 6, 44, '#64f7ff', 2.5, 0.38);
      this._spawnShockwave(seeker.x, seeker.y, 0.52, 0.28);
      this.shake = Math.max(this.shake, 4.5);

      if (!gap.blockedSeekers.has(seeker.id)) {
        gap.blockedSeekers.add(seeker.id);
        if (this.mode === 'playing') {
          this.seekersBlockedThisStage++;
          this._addScore(150);
          this.player.gapCharges = Math.min(this.player.maxGapCharges, this.player.gapCharges + 0.35);
          this.sound.playGapBlock();
          this._spawnPopup(seeker.x, seeker.y - 14 * this.dpr, '+150 BLOCKED!', '#7af8ff', 13);
        }
      }
    }

    _isSeekerTrapped(s) {
      if (s.mode === 'node') {
        const node = this.graph.nodes[s.nodeId];
        for (const d of DIRS) {
          const link = node.adj[d];
          if (link && !this.graph.edges[link.edgeId].gap) return false;
        }
        return true;
      }
      if (s.mode === 'edge') {
        const edge = this.graph.edges[s.edgeId];
        if (!edge.gap) return false;
        // Seeker is on one side of a gapped edge — check if the node on its side has any other open exit
        const sideNodeId = s.t < edge.gap.t ? edge.a : edge.b;
        const sideNode = this.graph.nodes[sideNodeId];
        for (const d of DIRS) {
          const link = sideNode.adj[d];
          if (link && link.edgeId !== edge.id && !this.graph.edges[link.edgeId].gap) {
            return false;
          }
        }
        return true;
      }
      return false;
    }

    _pickSeekerTarget(s, playerNodeId) {
      if (s.type === 'stalker') {
        // Look 2 nodes ahead of player's facing direction
        let cur = playerNodeId;
        const f = this.player.facing || 'up';
        for (let i = 0; i < 2; i++) {
          const link = this.graph.nodes[cur].adj[f];
          if (link) cur = link.neighborId;
        }
        return cur;
      }
      return playerNodeId;
    }

    _chooseSeekerDirection(s, targetNodeId, flee) {
      const startId = s.nodeId;
      const startNode = this.graph.nodes[startId];

      // Gather un-gapped options
      const openDirs = [];
      for (const d of DIRS) {
        const link = startNode.adj[d];
        if (link && !this.graph.edges[link.edgeId].gap) {
          openDirs.push(d);
        }
      }
      if (!openDirs.length) return null;

      if (flee) {
        // Pick open neighbor furthest from player
        let bestDir = openDirs[0];
        let bestDist = -1;
        for (const d of openDirs) {
          const nb = this.graph.nodes[startNode.adj[d].neighborId];
          const dist = Math.hypot(nb.x - this.player.x, nb.y - this.player.y);
          if (dist > bestDist) {
            bestDist = dist;
            bestDir = d;
          }
        }
        return bestDir;
      }

      // BFS shortest path respecting active Gaps
      const visited = new Set([startId]);
      const queue = [];
      for (const d of openDirs) {
        const nbId = startNode.adj[d].neighborId;
        if (nbId === targetNodeId) return d;
        visited.add(nbId);
        queue.push({ nodeId: nbId, firstDir: d });
      }

      let bestFallbackDir = openDirs[0];
      let bestFallbackDist = Infinity;
      const targetNode = this.graph.nodes[targetNodeId];

      while (queue.length) {
        const cur = queue.shift();
        const cn = this.graph.nodes[cur.nodeId];
        const dist = Math.hypot(cn.gx - targetNode.gx, cn.gy - targetNode.gy);
        if (dist < bestFallbackDist) {
          bestFallbackDist = dist;
          bestFallbackDir = cur.firstDir;
        }
        for (const d of DIRS) {
          const link = cn.adj[d];
          if (!link || this.graph.edges[link.edgeId].gap) continue;
          if (visited.has(link.neighborId)) continue;
          if (link.neighborId === targetNodeId) return cur.firstDir;
          visited.add(link.neighborId);
          queue.push({ nodeId: link.neighborId, firstDir: cur.firstDir });
        }
      }

      return bestFallbackDir;
    }

    // ==================== COLLISIONS & SHARDS ====================
    _checkCollisions() {
      const p = this.player;
      if (!p || p.deadTimer > 0) return;

      // Data Shard pickup
      if (this.shard.active) {
        if (Math.hypot(p.x - this.shard.x, p.y - this.shard.y) < 22 * this.dpr) {
          this.shard.active = false;
          this.shard.cooldown = 11;
          p.gapCharges = p.maxGapCharges;
          this._spawnRing(this.shard.x, this.shard.y, 8, 52, '#ffe066', 3, 0.45);
          this._spawnBurst(this.shard.x, this.shard.y, 20, '#ffe066', 'shard', 220);
          if (this.mode === 'playing') {
            this._addScore(300);
            this.sound.playShardPickup();
            this._spawnPopup(this.shard.x, this.shard.y - 12 * this.dpr, '+300 FULL GAP!', '#ffe878', 14);
          }
        }
      }

      // Seeker collisions
      const hitDist = 19 * this.dpr;
      for (const s of this.seekers) {
        if (s.respawnTimer > 0) continue;
        if (Math.hypot(p.x - s.x, p.y - s.y) < hitDist) {
          if (this.overdriveTimer > 0) {
            this.overdriveKills++;
            this._shatterSeeker(s, `SHATTER +${400 * this.overdriveKills}`, 400 * this.overdriveKills);
          } else if (!this.paxEnabled && p.invulnTimer <= 0 && this.mode === 'playing') {
            this._onPlayerHit();
            break;
          }
        }
      }
    }

    _shatterSeeker(s, label, pts) {
      this._spawnShockwave(s.x, s.y, 0.92, 0.48);
      this._spawnRing(s.x, s.y, 10, 74, '#ffe478', 3.5, 0.5);
      this._spawnBurst(s.x, s.y, 26, '#ff4d79', 'shard', 320);
      this._spawnBurst(s.x, s.y, 18, '#7af8ff', 'spark', 360);
      this.shake = 9;
      this.chroma = 0.65;
      this.hitStop = 0.055;
      s.respawnTimer = 4.2;
      s.trail = [];
      if (this.mode === 'playing') {
        this._addScore(pts);
        this.sound.playSeekerShatter();
        this._spawnPopup(s.x, s.y - 12 * this.dpr, label, '#ffe885', 16);
      }
    }

    _onPlayerHit() {
      const p = this.player;
      this.lives--;
      this.combo = 1;
      this.comboTimer = 0;
      this.sound.playPlayerHit();
      this._spawnShockwave(p.x, p.y, 1.15, 0.62);
      this._spawnRing(p.x, p.y, 10, 90, '#ff3e66', 4, 0.55);
      this._spawnBurst(p.x, p.y, 34, '#64f7ff', 'shard', 340);
      this._spawnBurst(p.x, p.y, 24, '#ff3e66', 'spark', 380);
      this.shake = 14;
      this.chroma = 0.95;
      this.hitStop = 0.08;
      p.deadTimer = 1.05;
      p.trail = [];
      this._emitHud();

      if (this.lives <= 0) {
        setTimeout(() => {
          if (this.mode === 'playing' && this.lives <= 0) {
            this._triggerGameOver();
          }
        }, 900);
      }
    }

    _respawnPlayer() {
      if (this.lives <= 0) return;
      const startNode = this.graph.nodes[this.graph.spawns.player];
      const p = this.player;
      p.mode = 'node';
      p.nodeId = startNode.id;
      p.edgeId = -1;
      p.t = 0;
      p.dir = null;
      p.facing = 'up';
      p.lastEdgeId = -1;
      p.entryNodeId = -1;
      p.entryEdgeWasPainted = false;
      p.entryEdgePrevIntervals = [];
      p.reversing = false;
      p.visOffX = 0;
      p.visOffY = 0;
      p.x = startNode.x;
      p.y = startNode.y;
      p.trail = [];
      p.invulnTimer = 2.6;
      p.gapCharges = Math.max(p.gapCharges, 2);
      this.clearInputs();

      if (this.controlScheme === 'first') {
        this._startAutoMoveFirstPerson();
      }

      // Gently reset Seekers that are camping right on top of the spawn
      for (const s of this.seekers) {
        if (s.respawnTimer <= 0 && Math.hypot(s.x - startNode.x, s.y - startNode.y) < 120 * this.dpr) {
          s.respawnTimer = 1.0;
          s.trail = [];
        }
      }
      this._spawnRing(startNode.x, startNode.y, 6, 48, '#64f7ff', 2.8, 0.45);
    }

    _updateShard(dt) {
      if (this.shard.active) {
        this.shard.timer -= dt;
        if (this.shard.timer <= 0) {
          this.shard.active = false;
          this.shard.cooldown = 10;
        }
      } else {
        this.shard.cooldown -= dt;
        if (this.shard.cooldown <= 0 && this.progress < 0.92) {
          // Spawn at a random node reasonably far from player
          const candidates = this.graph.nodes.filter((n) =>
            Math.hypot(n.x - this.player.x, n.y - this.player.y) > 100 * this.dpr
          );
          if (candidates.length) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            this.shard.active = true;
            this.shard.nodeId = pick.id;
            this.shard.x = pick.x;
            this.shard.y = pick.y;
            this.shard.timer = 9.5;
            this._spawnRing(pick.x, pick.y, 4, 38, '#ffe066', 2.2, 0.4);
          } else {
            this.shard.cooldown = 4;
          }
        }
      }
    }

    // ==================== ATTRACT MODE DEMO AI ====================
    _updateAttractAI(dt) {
      const p = this.player;
      this.aiGapCooldown -= dt;

      // Drop a dramatic plasma gap when a Seeker gets close!
      const nearest = this._nearestSeekerTo(p.x, p.y);
      if (nearest && this.aiGapCooldown <= 0 && p.gapCharges >= 1) {
        if (Math.hypot(p.x - nearest.x, p.y - nearest.y) < 115 * this.dpr) {
          if (this.triggerGap()) {
            this.aiGapCooldown = 4.2;
          }
        }
      }

      if (p.mode !== 'node') return;
      const node = this.graph.nodes[p.nodeId];
      let bestDir = null;
      let bestScore = -Infinity;

      for (const d of DIRS) {
        const link = node.adj[d];
        if (!link) continue;
        const e = this.graph.edges[link.edgeId];
        if (e.gap) continue;
        const nb = this.graph.nodes[link.neighborId];

        let sc = e.painted ? 1 : 22;
        if (d === p.dir) sc += 4;
        if (d === OPPOSITE[p.dir]) sc -= 8;
        if (nearest) {
          const distNow = Math.hypot(node.x - nearest.x, node.y - nearest.y);
          const distNext = Math.hypot(nb.x - nearest.x, nb.y - nearest.y);
          if (distNext < 75 * this.dpr) sc -= 35;
          else if (distNext > distNow) sc += 6;
        }
        sc += Math.random() * 4;
        if (sc > bestScore) {
          bestScore = sc;
          bestDir = d;
        }
      }

      if (bestDir) {
        this.queuedDir = bestDir;
      }
    }

    // ==================== HELPERS & FX ====================
    _playerNearestNodeId() {
      const p = this.player;
      if (p.mode === 'node') return p.nodeId;
      const e = this.graph.edges[p.edgeId];
      return p.t < 0.5 ? e.a : e.b;
    }

    _nearestSeekerTo(x, y) {
      let best = null;
      let bestD = Infinity;
      for (const s of this.seekers) {
        if (s.respawnTimer > 0) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    }

    _addScore(pts) {
      this.score += Math.round(pts);
      if (!this.paxUsedThisGame && this.score > this.bestScore) {
        this.bestScore = this.score;
        safeStorageSet(BEST_STORAGE_KEY, String(this.bestScore));
      }
    }

    _finishStageClear() {
      this.mode = 'stageClear';
      const stageBonus = 1000 + this.stageIndex * 500;
      this._addScore(stageBonus);
      this.sound.setAmbientIntensity(false, 0, false);
      this.onStateChange('stageClear', {
        level: this.graph.level,
        bonus: stageBonus,
        maxCombo: this.maxComboThisStage,
        blocks: this.seekersBlockedThisStage,
        score: this.score
      });
    }

    _triggerGameOver() {
      this.mode = 'gameOver';
      this.sound.setAmbientIntensity(false, 0, false);
      this.onStateChange('gameOver', {
        score: this.score,
        bestScore: this.bestScore,
        isNewBest: !this.paxUsedThisGame && this.score > 0 && this.score >= this.bestScore,
        paxUsed: this.paxUsedThisGame,
        stageNum: this.stageIndex + 1,
        cellsSealed: this.totalCellsSealed
      });
    }

    _spawnBurst(x, y, count, color, shape, maxSpd) {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (0.25 + Math.random() * 0.75) * maxSpd * this.dpr;
        const life = 0.28 + Math.random() * 0.45;
        this.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          size: shape === 'shard' ? (3 + Math.random() * 4) : (1.5 + Math.random() * 2.2),
          color,
          shape,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 12,
          life,
          maxLife: life
        });
      }
    }

    _spawnRing(x, y, r0, r1, color, lineWidth, life) {
      this.rings.push({ x, y, r0, r1, color, lineWidth, alpha: 0.9, life, maxLife: life });
    }

    _spawnPopup(x, y, text, color, size = 14) {
      this.popups.push({ x, y, text, color, size, life: 1.05, maxLife: 1.05 });
    }

    _spawnShockwave(x, y, strength, maxRadius) {
      if (!this.canvasW || !this.canvasH) return;
      this.shockwaves.push({
        uvX: x / this.canvasW,
        uvY: y / this.canvasH,
        radius: 0.01,
        maxRadius,
        strength,
        maxStrength: strength
      });
      if (this.shockwaves.length > 4) this.shockwaves.shift();
    }

    _updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.08, dt);
        p.vy *= Math.pow(0.08, dt);
        p.rot += p.vrot * dt;
      }

      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life -= dt;
        if (r.life <= 0) this.rings.splice(i, 1);
      }

      for (let i = this.popups.length - 1; i >= 0; i--) {
        const pop = this.popups[i];
        pop.life -= dt;
        pop.y -= 34 * this.dpr * dt;
        if (pop.life <= 0) this.popups.splice(i, 1);
      }
    }

    _updateShockwaves(dt) {
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const s = this.shockwaves[i];
        s.radius += dt * 0.72;
        const p = s.radius / s.maxRadius;
        s.strength = s.maxStrength * Math.max(0, 1 - p);
        if (p >= 1) this.shockwaves.splice(i, 1);
      }
    }

    getFXState() {
      const px = this.player && this.canvasW ? this.player.x / this.canvasW : 0.5;
      const py = this.player && this.canvasH ? this.player.y / this.canvasH : 0.5;
      return {
        time: this.time,
        chroma: this.chroma,
        overdrive: this.overdriveTimer > 0 ? Math.min(1, this.overdriveTimer / 1.0) : 0,
        progress: this.progress,
        playerUvX: clamp(px, 0, 1),
        playerUvY: clamp(py, 0, 1),
        palette: this.graph.level.palette,
        shockwaves: this.shockwaves
      };
    }

    _emitHud() {
      if (!this.onHudUpdate || !this.graph || !this.player) return;
      this.onHudUpdate({
        score: this.score,
        bestScore: this.bestScore,
        combo: this.combo,
        lives: this.lives,
        gapCharges: this.player.gapCharges,
        progress: this.progress,
        stageCode: this.graph.level.code,
        stageName: this.graph.level.name,
        overdriveTimer: this.overdriveTimer
      });
    }
  }

  G.GameEngine = GameEngine;
})(window.Gapper);
