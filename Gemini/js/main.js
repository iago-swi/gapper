window.Gapper = window.Gapper || {};

(function (G) {
  'use strict';

  const KEY_TO_DIR = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };

  const SCHEME_DESC = {
    third: 'Arrow keys or WASD point where to go in four directions.',
    first: 'Left/Right or A/D turn relative to travel \u2014 ship moves automatically.'
  };

  const SWIPE_THRESHOLD_PX = 14; // <= 16 CSS pixels
  const RING_CIRCUMFERENCE = 2 * Math.PI * 16; // r=16 in SVG

  function padScore(n) {
    return String(Math.floor(n)).padStart(6, '0');
  }

  function init() {
    const canvas = document.getElementById('game-canvas');
    const postFX = new G.PostFXRenderer(canvas);
    const sceneRenderer = new G.SceneRenderer();
    const sound = new G.SoundEngine();

    // DOM elements
    const elHud = document.getElementById('hud');
    const elScore = document.getElementById('hud-score');
    const elBest = document.getElementById('hud-best');
    const elCombo = document.getElementById('hud-combo');
    const elStage = document.getElementById('hud-stage');
    const elStageName = document.getElementById('hud-stage-name');
    const elProgressRing = document.getElementById('hud-progress-ring');
    const elPercent = document.getElementById('hud-percent');
    const elOverdrive = document.getElementById('overdrive-banner');
    const elOdTimer = document.getElementById('od-timer');
    const elGapPips = document.querySelectorAll('#hud-gaps .gap-pip');
    const elLives = document.getElementById('hud-lives');
    const elControlsBar = document.getElementById('controls-bar');
    const elControlsSteerHint = document.getElementById('controls-steer-hint');
    const elTouchControls = document.getElementById('touch-controls');
    const elPaxBadge = document.getElementById('pax-badge');
    const elGoPaxNote = document.getElementById('go-pax-note');
    const elHowSteerKey = document.getElementById('how-steer-key');
    const elHowSteerDesc = document.getElementById('how-steer-desc');

    const elOverlayTitle = document.getElementById('overlay-title');
    const elOverlayPause = document.getElementById('overlay-pause');
    const elOverlayClear = document.getElementById('overlay-clear');
    const elOverlayGameOver = document.getElementById('overlay-gameover');

    const elStageBanner = document.getElementById('stage-banner');
    const elBannerEyebrow = document.getElementById('banner-eyebrow');
    const elBannerTitle = document.getElementById('banner-title');
    const elBannerSub = document.getElementById('banner-sub');

    const elSectorButtons = document.getElementById('sector-buttons');

    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    let lastLivesRendered = -1;
    let lastComboRendered = 1;
    let bannerTimeout = null;
    let wasPaused = false;

    function showStageBanner(level) {
      elBannerEyebrow.textContent = level.code;
      elBannerTitle.textContent = level.name;
      elBannerSub.textContent = level.subtitle;
      elStageBanner.classList.remove('hidden');
      // Restart CSS animation cleanly
      elStageBanner.style.animation = 'none';
      void elStageBanner.offsetWidth;
      elStageBanner.style.animation = '';
      clearTimeout(bannerTimeout);
      bannerTimeout = setTimeout(() => {
        elStageBanner.classList.add('hidden');
      }, 1900);
    }

    function syncControlSchemeUI(scheme) {
      const isFirst = scheme === 'first';
      document.querySelectorAll('[data-scheme-picker]').forEach((picker) => {
        picker.querySelectorAll('.scheme-btn').forEach((btn) => {
          const active = btn.dataset.scheme === scheme;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        const desc = picker.querySelector('[data-scheme-desc]');
        if (desc) desc.textContent = SCHEME_DESC[scheme] || SCHEME_DESC.third;
      });

      if (elControlsSteerHint) {
        elControlsSteerHint.innerHTML = isFirst
          ? '<kbd>A</kbd>/<kbd>D</kbd> or <kbd>←→</kbd> Turn'
          : '<kbd>WASD</kbd> / <kbd>↑↓←→</kbd> Move';
      }
      if (elHowSteerKey && elHowSteerDesc) {
        if (isFirst) {
          elHowSteerKey.textContent = 'A/D / LEFT-RIGHT';
          elHowSteerDesc.textContent = 'Turn left or right relative to your travel';
        } else {
          elHowSteerKey.textContent = 'WASD / ARROWS';
          elHowSteerDesc.textContent = 'Trace luminous conduits along the grid';
        }
      }
      if (elTouchControls) {
        elTouchControls.classList.toggle('first-person', isFirst);
      }
    }

    function updateHud(data) {
      elScore.textContent = padScore(data.score);
      elBest.textContent = padScore(data.bestScore);
      elStage.textContent = data.stageCode;
      elStageName.textContent = data.stageName;

      // Combo badge
      if (data.combo > 1) {
        if (lastComboRendered !== data.combo) {
          elCombo.textContent = 'x' + data.combo;
          elCombo.classList.remove('hidden');
          elCombo.style.animation = 'none';
          void elCombo.offsetWidth;
          elCombo.style.animation = '';
          lastComboRendered = data.combo;
        }
      } else {
        elCombo.classList.add('hidden');
        lastComboRendered = 1;
      }

      // Progress ring
      const pct = Math.round(data.progress * 100);
      elPercent.textContent = pct + '%';
      elProgressRing.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - data.progress));

      // Overdrive banner
      if (data.overdriveTimer > 0) {
        elOverdrive.classList.remove('hidden');
        elOdTimer.textContent = data.overdriveTimer.toFixed(1) + 's';
      } else {
        elOverdrive.classList.add('hidden');
      }

      // Gap pips (3 continuous fill pips)
      elGapPips.forEach((pip, idx) => {
        const fill = Math.max(0, Math.min(1, data.gapCharges - idx));
        const bar = pip.querySelector('.gap-pip-fill');
        bar.style.width = (fill * 100).toFixed(1) + '%';
        pip.classList.toggle('charging', fill > 0 && fill < 1);
      });

      // Lives icons
      if (data.lives !== lastLivesRendered) {
        lastLivesRendered = data.lives;
        const maxSlots = Math.max(3, data.lives);
        elLives.innerHTML = '';
        for (let i = 0; i < maxSlots; i++) {
          const icon = document.createElement('div');
          icon.className = 'life-prism' + (i >= data.lives ? ' lost' : '');
          elLives.appendChild(icon);
        }
      }
    }

    function hideAllOverlays() {
      elOverlayTitle.classList.add('hidden');
      elOverlayPause.classList.add('hidden');
      elOverlayClear.classList.add('hidden');
      elOverlayGameOver.classList.add('hidden');
    }

    function onStateChange(newState, payload) {
      const resumedFromPause = wasPaused && newState === 'playing';
      wasPaused = (newState === 'paused');

      hideAllOverlays();
      if (newState === 'attract') {
        elHud.classList.add('hidden');
        elControlsBar.classList.add('hidden');
        elTouchControls.classList.add('hidden');
        elStageBanner.classList.add('hidden');
        elOverlayTitle.classList.remove('hidden');
      } else if (newState === 'playing') {
        elHud.classList.remove('hidden');
        elControlsBar.classList.remove('hidden');
        if (isTouchDevice) elTouchControls.classList.remove('hidden');
        if (!resumedFromPause && payload && payload.code) {
          showStageBanner(payload);
        }
      } else if (newState === 'paused') {
        elOverlayPause.classList.remove('hidden');
      } else if (newState === 'stageClear') {
        document.getElementById('clear-title').textContent = payload.level.code + ' COMPLETE';
        document.getElementById('clear-bonus').textContent = '+' + payload.bonus.toLocaleString();
        document.getElementById('clear-chain').textContent = 'x' + payload.maxCombo;
        document.getElementById('clear-blocks').textContent = String(payload.blocks);
        document.getElementById('clear-score').textContent = padScore(payload.score);
        elOverlayClear.classList.remove('hidden');
      } else if (newState === 'gameOver') {
        document.getElementById('go-score').textContent = padScore(payload.score);
        document.getElementById('go-best').textContent = padScore(payload.bestScore);
        document.getElementById('go-stage').textContent = String(payload.stageNum).padStart(2, '0');
        document.getElementById('go-cells').textContent = String(payload.cellsSealed);
        document.getElementById('go-new-best').classList.toggle('hidden', !payload.isNewBest);
        if (elGoPaxNote) {
          elGoPaxNote.classList.toggle('hidden', !payload.paxUsed);
        }
        elOverlayGameOver.classList.remove('hidden');
      }
    }

    const game = new G.GameEngine(sound, sceneRenderer, updateHud, onStateChange);
    G._instance = game;

    // Initialize Control Scheme pickers (Title + Pause)
    document.querySelectorAll('.scheme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.init();
        const scheme = game.setControlScheme(btn.dataset.scheme);
        syncControlSchemeUI(scheme);
      });
    });
    syncControlSchemeUI(game.controlScheme);

    // Build Sector Picker buttons on Title Screen
    G.LEVELS.forEach((lvl, idx) => {
      const btn = document.createElement('button');
      btn.className = 'sector-btn' + (idx === 0 ? ' active' : '');
      btn.innerHTML = `<span>0${lvl.id}</span><span class="sector-swatch" style="background:${lvl.palette.swatch}"></span>`;
      btn.title = `${lvl.code}: ${lvl.name}`;
      btn.addEventListener('click', () => {
        sound.init();
        elSectorButtons.querySelectorAll('.sector-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        game.previewStage(idx);
      });
      elSectorButtons.appendChild(btn);
    });

    // Button listeners
    document.getElementById('btn-play').addEventListener('click', () => game.startNewGame());
    document.getElementById('btn-resume').addEventListener('click', () => game.togglePause());
    document.getElementById('btn-restart').addEventListener('click', () => game.restartStage());
    document.getElementById('btn-menu').addEventListener('click', () => game.returnToTitle());
    document.getElementById('btn-next-stage').addEventListener('click', () => game.nextStage());
    document.getElementById('btn-retry').addEventListener('click', () => game.startNewGame(game.selectedStartStage));
    document.getElementById('btn-go-menu').addEventListener('click', () => game.returnToTitle());
    document.getElementById('btn-pause').addEventListener('click', () => game.togglePause());

    const btnSound = document.getElementById('btn-sound');
    const iconSoundOn = document.getElementById('icon-sound-on');
    const iconSoundOff = document.getElementById('icon-sound-off');
    function handleMuteToggle() {
      sound.init();
      const muted = sound.toggleMute();
      iconSoundOn.classList.toggle('hidden', muted);
      iconSoundOff.classList.toggle('hidden', !muted);
    }
    btnSound.addEventListener('click', handleMuteToggle);

    // Hidden practice mode sequence buffer (last 3 typed characters, case-insensitive)
    let paxBuffer = '';
    let paxModeBeforeP = null;

    // Keyboard input (handled immediately on keydown; auto-repeat ignored)
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.repeat) return;

      sound.init();

      const typedKey = typeof e.key === 'string' ? e.key.toLowerCase() : '';

      // Track last 3 typed characters on any screen for PAX toggle
      if (typedKey.length === 1) {
        if (typedKey === 'p') {
          paxModeBeforeP = game.mode;
        }
        paxBuffer = (paxBuffer + typedKey).slice(-3);
        if (paxBuffer === 'pax') {
          paxBuffer = '';
          const active = game.togglePax();
          if (elPaxBadge) elPaxBadge.classList.toggle('hidden', !active);
          // Undo any pause/resume toggled by the leading 'P'
          if (paxModeBeforeP === 'playing' && game.mode === 'paused') {
            game.setPaused(false);
          } else if (paxModeBeforeP === 'paused' && game.mode === 'playing') {
            game.setPaused(true);
          }
          paxModeBeforeP = null;
          return;
        }
      }

      if (e.code === 'KeyM') {
        handleMuteToggle();
        return;
      }

      if (e.code === 'Escape' || typedKey === 'p' || e.code === 'KeyP') {
        if (game.mode === 'playing' || game.mode === 'paused') {
          game.togglePause();
        }
        return;
      }

      if (e.code === 'Enter') {
        if (game.mode === 'attract') {
          game.startNewGame();
          return;
        }
        if (game.mode === 'stageClear') {
          game.nextStage();
          return;
        }
        if (game.mode === 'gameOver') {
          game.startNewGame(game.selectedStartStage);
          return;
        }
      }

      if (e.code === 'KeyR' && game.mode === 'playing') {
        game.restartStage();
        return;
      }

      if (game.mode === 'playing') {
        const dir = KEY_TO_DIR[e.code];
        if (dir) {
          game.setDirectionDown(dir);
          return;
        }
        if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') {
          game.triggerGap();
        }
      }
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      const dir = KEY_TO_DIR[e.code];
      if (dir) game.setDirectionUp(dir);
    });

    window.addEventListener('blur', () => {
      game.clearInputs();
    });

    // Touch D-Pad + Gap button (act on touch-down, not release)
    document.querySelectorAll('.dpad-btn').forEach((btn) => {
      const dir = btn.dataset.dir;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sound.init();
        game.setDirectionDown(dir);
      });
      btn.addEventListener('pointerup', () => game.setDirectionUp(dir));
      btn.addEventListener('pointercancel', () => game.setDirectionUp(dir));
      btn.addEventListener('pointerleave', () => game.setDirectionUp(dir));
    });

    document.getElementById('touch-gap').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sound.init();
      game.triggerGap();
    });

    // Playfield touch controls:
    // - Third person: swipe registers after <= 16 CSS pixels (14 px)
    // - First person: tap left/right half of screen on touch-down
    let activeTouch = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || game.mode !== 'playing') return;
      e.preventDefault();
      sound.init();
      if (game.controlScheme === 'first') {
        const side = e.clientX < window.innerWidth * 0.5 ? 'left' : 'right';
        game.setDirectionDown(side);
        activeTouch = null;
      } else {
        activeTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    }, { passive: false });

    canvas.addEventListener('pointermove', (e) => {
      if (!activeTouch || e.pointerId !== activeTouch.id || game.mode !== 'playing') return;
      if (game.controlScheme !== 'third') return;
      const dx = e.clientX - activeTouch.x;
      const dy = e.clientY - activeTouch.y;
      if (Math.hypot(dx, dy) >= SWIPE_THRESHOLD_PX) {
        const dir = Math.abs(dx) >= Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up');
        game.setDirectionDown(dir);
        activeTouch.x = e.clientX;
        activeTouch.y = e.clientY;
      }
    }, { passive: true });

    const endTouch = (e) => {
      if (activeTouch && e.pointerId === activeTouch.id) {
        activeTouch = null;
      }
    };
    canvas.addEventListener('pointerup', endTouch);
    canvas.addEventListener('pointercancel', endTouch);

    // Responsive DPR Resize
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    function handleResize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      postFX.resize(window.innerWidth, window.innerHeight, dpr);
    }
    window.addEventListener('resize', handleResize);
    handleResize();

    // Main Render Loop
    let lastTs = performance.now();
    let lastGamepadDir = null;
    function frame(ts) {
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;

      // Optional Gamepad polling (edge-triggered so it never repeats)
      if (game.mode === 'playing' && navigator.getGamepads) {
        const gp = navigator.getGamepads()[0];
        if (gp) {
          const ax = gp.axes[0] || 0;
          const ay = gp.axes[1] || 0;
          let gpDir = null;
          if (Math.abs(ax) > 0.45 || Math.abs(ay) > 0.45) {
            if (Math.abs(ax) > Math.abs(ay)) {
              gpDir = ax > 0 ? 'right' : 'left';
            } else {
              gpDir = ay > 0 ? 'down' : 'up';
            }
          }
          if (gpDir !== lastGamepadDir) {
            if (lastGamepadDir) game.setDirectionUp(lastGamepadDir);
            if (gpDir) game.setDirectionDown(gpDir);
            lastGamepadDir = gpDir;
          }
          if (gp.buttons[0] && gp.buttons[0].pressed && !gp._gapWasDown) {
            game.triggerGap();
          }
          gp._gapWasDown = !!(gp.buttons[0] && gp.buttons[0].pressed);
        }
      }

      game.update(dt, postFX.width, postFX.height, dpr);
      sceneRenderer.render(postFX.getSceneContext(), postFX.width, postFX.height, dpr, game);
      postFX.present(game.getFXState());

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.Gapper);
