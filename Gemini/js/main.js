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
  const RENAME_DEBOUNCE_MS = 700;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 16; // r=16 in SVG

  function padScore(n) {
    return String(Math.floor(n)).padStart(6, '0');
  }

  function formatScore(n) {
    return Math.round(Number(n) || 0).toLocaleString('en-US');
  }

  function init() {
    const canvas = document.getElementById('game-canvas');
    const postFX = new G.PostFXRenderer(canvas);
    const sceneRenderer = new G.SceneRenderer();
    const sound = new G.SoundEngine();
    const Scores = G.Scores;

    // DOM elements
    const elHud = document.getElementById('hud');
    const elScore = document.getElementById('hud-score');
    const elBest = document.getElementById('hud-best');
    const elTitleBest = document.getElementById('title-best');
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
    const elHowSteerKey = document.getElementById('how-steer-key');
    const elHowSteerDesc = document.getElementById('how-steer-desc');

    const elOverlayTitle = document.getElementById('overlay-title');
    const elOverlayPause = document.getElementById('overlay-pause');
    const elOverlayClear = document.getElementById('overlay-clear');
    const elOverlayHighScores = document.getElementById('overlay-highscores');
    const elOverlayGameOver = document.getElementById('overlay-gameover');

    const elHsTabs = document.getElementById('hs-tabs');
    const elHsList = document.getElementById('hs-list');
    const elHsMsg = document.getElementById('hs-msg');
    const elBtnHsBack = document.getElementById('btn-hs-back');

    const elGoStatusLine = document.getElementById('go-status-line');
    const elGoTabs = document.getElementById('go-tabs');
    const elGoList = document.getElementById('go-list');
    const elGoSharedMsg = document.getElementById('go-shared-msg');
    const elGoInitialsWrap = document.getElementById('go-initials-wrap');
    const elInitials = document.getElementById('go-initials');
    const elBtnRetry = document.getElementById('btn-retry');

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
    let highScoresOpen = false;
    let renameTimer = null;

    // State for the current finished run & shared views
    let currentRun = {
      deviceListed: false,
      deviceIndex: -1,
      sharedSent: false,
      sharedKey: null,
      score: 0,
      stageNum: 1,
      paxUsed: false
    };

    let goSharedState = { loading: false, error: false, top: [], rank: 0, fetched: false };
    let hsSharedState = { loading: false, error: false, top: [], rank: 0 };

    function syncTitleBest() {
      const best = Scores.getDeviceBest();
      if (elTitleBest) elTitleBest.textContent = padScore(best);
      if (elBest) elBest.textContent = padScore(best);
    }

    function showStageBanner(level) {
      elBannerEyebrow.textContent = level.code;
      elBannerTitle.textContent = level.name;
      elBannerSub.textContent = level.subtitle;
      elStageBanner.classList.remove('hidden');
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

    function renderScoresList(containerEl, rows, highlightIndex) {
      containerEl.textContent = '';
      containerEl.classList.toggle('two-col-wide', rows.length > 5);

      for (let i = 0; i < rows.length; i++) {
        const entry = rows[i];
        const rowEl = document.createElement('div');
        rowEl.className = 'score-row-item';
        rowEl.setAttribute('role', 'listitem');
        if (i === 0) rowEl.classList.add('is-top1');
        if (i === highlightIndex || entry.me === true) {
          rowEl.classList.add('is-current');
        }

        const rankEl = document.createElement('span');
        rankEl.className = 'sc-rank';
        rankEl.textContent = '#' + (i + 1);

        const nameEl = document.createElement('span');
        nameEl.className = 'sc-name';
        nameEl.textContent = entry.n ? entry.n : '\u2014';

        const scoreEl = document.createElement('span');
        scoreEl.className = 'sc-score';
        scoreEl.textContent = formatScore(entry.s);

        const levelEl = document.createElement('span');
        levelEl.className = 'sc-level';
        levelEl.textContent = 'Sector ' + entry.w;

        const dateEl = document.createElement('span');
        dateEl.className = 'sc-date';
        dateEl.textContent = Scores.formatDateDisplay(entry.d);

        rowEl.appendChild(rankEl);
        rowEl.appendChild(nameEl);
        rowEl.appendChild(scoreEl);
        rowEl.appendChild(levelEl);
        rowEl.appendChild(dateEl);
        containerEl.appendChild(rowEl);
      }
    }

    function syncTabButtons() {
      const enabled = Scores.isSharedEnabled();
      const activeTab = Scores.getActiveTab();
      elHsTabs.classList.toggle('hidden', !enabled);
      elGoTabs.classList.toggle('hidden', !enabled);

      document.querySelectorAll('[data-score-tab]').forEach((btn) => {
        const isActive = btn.dataset.scoreTab === activeTab;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }

    function setMsg(el, text) {
      if (text) {
        el.textContent = text;
        el.classList.remove('hidden');
      } else {
        el.textContent = '';
        el.classList.add('hidden');
      }
    }

    function renderHighScoresView() {
      syncTabButtons();
      const tab = Scores.getActiveTab();
      if (tab === 'device' || !Scores.isSharedEnabled()) {
        const list = Scores.loadDeviceScores();
        renderScoresList(elHsList, list, -1);
        setMsg(elHsMsg, list.length === 0 ? 'No scores yet.' : '');
        return;
      }

      // Shared "Everyone" tab on High Scores screen
      renderScoresList(elHsList, hsSharedState.top, -1);
      if (hsSharedState.loading && hsSharedState.top.length === 0) {
        setMsg(elHsMsg, 'Fetching the shared list\u2026');
      } else if (hsSharedState.error) {
        setMsg(elHsMsg, 'The shared list cannot be reached right now.');
      } else if (hsSharedState.top.length === 0) {
        setMsg(elHsMsg, 'No scores yet.');
      } else {
        setMsg(elHsMsg, '');
      }
    }

    function renderGameOverView() {
      syncTabButtons();
      const tab = Scores.getActiveTab();
      if (tab === 'device' || !Scores.isSharedEnabled()) {
        const list = Scores.loadDeviceScores();
        const hl = currentRun.deviceListed ? currentRun.deviceIndex : -1;
        renderScoresList(elGoList, list, hl);
        setMsg(elGoSharedMsg, list.length === 0 ? 'No scores yet.' : '');
        return;
      }

      // Shared "Everyone" tab on Game Over screen
      renderScoresList(elGoList, goSharedState.top, -1);
      if (goSharedState.loading && goSharedState.top.length === 0) {
        setMsg(elGoSharedMsg, 'Fetching the shared list\u2026');
      } else if (goSharedState.error) {
        const suffix = currentRun.deviceListed ? ' Your score is kept on this device.' : '';
        setMsg(elGoSharedMsg, 'The shared list cannot be reached right now.' + suffix);
      } else if (goSharedState.top.length === 0) {
        setMsg(elGoSharedMsg, 'No scores yet.');
      } else if (goSharedState.rank > goSharedState.top.length) {
        setMsg(elGoSharedMsg, `Your score is number ${goSharedState.rank} on the shared list.`);
      } else {
        setMsg(elGoSharedMsg, '');
      }
    }

    async function fetchSharedForHighScores() {
      if (!Scores.isSharedEnabled()) return;
      hsSharedState = { loading: true, error: false, top: [], rank: 0 };
      renderHighScoresView();
      const res = await Scores.fetchSharedTop();
      if (res.stale || !highScoresOpen) return;
      if (res.ok) {
        hsSharedState = { loading: false, error: false, top: res.top, rank: res.rank };
      } else {
        hsSharedState = { loading: false, error: true, top: [], rank: 0 };
      }
      renderHighScoresView();
    }

    async function fetchSharedForGameOverReadOnly() {
      if (!Scores.isSharedEnabled()) return;
      goSharedState = { loading: true, error: false, top: [], rank: 0, fetched: true };
      renderGameOverView();
      const res = await Scores.fetchSharedTop();
      if (res.stale || game.mode !== 'gameOver') return;
      if (res.ok) {
        goSharedState = { loading: false, error: false, top: res.top, rank: 0, fetched: true };
      } else {
        goSharedState = { loading: false, error: true, top: [], rank: 0, fetched: true };
      }
      renderGameOverView();
    }

    function openHighScores() {
      highScoresOpen = true;
      elOverlayTitle.classList.add('hidden');
      elOverlayHighScores.classList.remove('hidden');
      renderHighScoresView();
      if (Scores.isSharedEnabled() && Scores.getActiveTab() === 'shared') {
        fetchSharedForHighScores();
      }
      elBtnHsBack.focus();
    }

    function closeHighScores() {
      if (!highScoresOpen) return;
      highScoresOpen = false;
      Scores.cancelPendingSharedRequests();
      elOverlayHighScores.classList.add('hidden');
      if (game.mode === 'attract') {
        syncTitleBest();
        elOverlayTitle.classList.remove('hidden');
      }
    }

    function handleTabSwitch(tab) {
      Scores.saveActiveTab(tab);
      syncTabButtons();
      if (highScoresOpen) {
        renderHighScoresView();
        if (tab === 'shared') {
          fetchSharedForHighScores();
        }
      } else if (game.mode === 'gameOver') {
        renderGameOverView();
        if (tab === 'shared' && !currentRun.sharedSent && !goSharedState.fetched && !goSharedState.loading) {
          fetchSharedForGameOverReadOnly();
        }
      }
    }

    function updateHud(data) {
      elScore.textContent = padScore(data.score);
      elBest.textContent = padScore(data.bestScore);
      elStage.textContent = data.stageCode;
      elStageName.textContent = data.stageName;

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

      const pct = Math.round(data.progress * 100);
      elPercent.textContent = pct + '%';
      elProgressRing.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - data.progress));

      if (data.overdriveTimer > 0) {
        elOverdrive.classList.remove('hidden');
        elOdTimer.textContent = data.overdriveTimer.toFixed(1) + 's';
      } else {
        elOverdrive.classList.add('hidden');
      }

      elGapPips.forEach((pip, idx) => {
        const fill = Math.max(0, Math.min(1, data.gapCharges - idx));
        const bar = pip.querySelector('.gap-pip-fill');
        bar.style.width = (fill * 100).toFixed(1) + '%';
        pip.classList.toggle('charging', fill > 0 && fill < 1);
      });

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
      highScoresOpen = false;
      elOverlayTitle.classList.add('hidden');
      elOverlayPause.classList.add('hidden');
      elOverlayClear.classList.add('hidden');
      elOverlayHighScores.classList.add('hidden');
      elOverlayGameOver.classList.add('hidden');
    }

    function handleGameOver(payload) {
      if (renameTimer) {
        clearTimeout(renameTimer);
        renameTimer = null;
      }
      Scores.cancelPendingSharedRequests();

      // Clear any previous run's "me" mark before recording this finished run
      goSharedState = { loading: false, error: false, top: [], rank: 0, fetched: false };

      const storedInitials = Scores.getStoredInitials();
      const score = Math.round(Number(payload.score) || 0);
      const stageNum = Math.max(1, Math.round(Number(payload.stageNum) || 1));
      const paxUsed = Boolean(payload.paxUsed);

      let deviceRes;
      if (paxUsed) {
        const list = Scores.loadDeviceScores();
        deviceRes = {
          listed: false,
          rank: 0,
          entryIndex: -1,
          isNewBest: false,
          best: list.length ? list[0].s : 0,
          list
        };
      } else {
        deviceRes = Scores.recordDeviceScore(score, stageNum, storedInitials);
      }

      game.syncBestScore();
      syncTitleBest();

      document.getElementById('go-score').textContent = padScore(score);
      document.getElementById('go-stage').textContent = String(stageNum).padStart(2, '0');

      // Status line above the list
      elGoStatusLine.className = 'go-status-line';
      if (paxUsed) {
        elGoStatusLine.textContent = 'Practice mode (PAX) was active during this run, so the score did not count toward your best score.';
        elGoStatusLine.classList.add('is-pax');
      } else if (deviceRes.isNewBest) {
        elGoStatusLine.textContent = 'That is your best yet.';
      } else if (deviceRes.listed) {
        elGoStatusLine.textContent = `That is number ${deviceRes.rank} on this device.`;
      } else {
        elGoStatusLine.textContent = `Your best is ${formatScore(deviceRes.best)}.`;
        elGoStatusLine.classList.add('is-muted');
      }

      const shouldSendShared = Scores.isSharedEnabled() && !paxUsed && score > 0;
      const runKey = shouldSendShared ? Scores.generateRunKey() : null;

      currentRun = {
        deviceListed: deviceRes.listed,
        deviceIndex: deviceRes.entryIndex,
        sharedSent: shouldSendShared,
        sharedKey: runKey,
        score,
        stageNum,
        paxUsed
      };

      // Initials field shown only when run is on device list OR sent to shared service
      const showInitials = deviceRes.listed || shouldSendShared;
      elGoInitialsWrap.classList.toggle('hidden', !showInitials);
      elInitials.value = storedInitials;

      elOverlayGameOver.classList.remove('hidden');

      if (shouldSendShared) {
        goSharedState = { loading: true, error: false, top: [], rank: 0, fetched: true };
        renderGameOverView();
        Scores.submitSharedScore({ k: runKey, n: storedInitials, s: score, w: stageNum }).then((res) => {
          if (res.stale || currentRun.sharedKey !== runKey || game.mode !== 'gameOver') return;
          if (res.ok) {
            goSharedState = { loading: false, error: false, top: res.top, rank: res.rank, fetched: true };
          } else {
            goSharedState = { loading: false, error: true, top: [], rank: 0, fetched: true };
          }
          renderGameOverView();
        });
      } else {
        renderGameOverView();
        if (Scores.isSharedEnabled() && Scores.getActiveTab() === 'shared') {
          fetchSharedForGameOverReadOnly();
        }
      }

      // Focus management: first time (no stored initials) -> initials input; else -> Play Again button
      if (showInitials && storedInitials === '') {
        elInitials.focus();
      } else {
        elBtnRetry.focus();
      }
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
        syncTitleBest();
        elOverlayTitle.classList.remove('hidden');
      } else if (newState === 'playing') {
        if (renameTimer) {
          clearTimeout(renameTimer);
          renameTimer = null;
        }
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
        handleGameOver(payload);
      }
    }

    const game = new G.GameEngine(sound, sceneRenderer, updateHud, onStateChange);
    G._instance = game;
    syncTitleBest();

    // Initialize Control Scheme pickers (Title + Pause)
    document.querySelectorAll('.scheme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.init();
        const scheme = game.setControlScheme(btn.dataset.scheme);
        syncControlSchemeUI(scheme);
      });
    });
    syncControlSchemeUI(game.controlScheme);

    // Tab buttons ("This device" / "Everyone")
    document.querySelectorAll('[data-score-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.init();
        handleTabSwitch(btn.dataset.scoreTab);
      });
    });
    syncTabButtons();

    // High Scores modal open / close
    document.getElementById('btn-highscores').addEventListener('click', () => {
      sound.init();
      openHighScores();
    });
    elBtnHsBack.addEventListener('click', () => {
      sound.init();
      closeHighScores();
    });

    // Initials input: strict key isolation, auto-repeat ignored, immediate local save, 700ms shared rename
    elInitials.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        elBtnRetry.focus();
      }
    });

    elInitials.addEventListener('input', () => {
      const clean = Scores.sanitizeInitials(elInitials.value);
      if (elInitials.value !== clean) {
        elInitials.value = clean;
      }

      if (currentRun.deviceListed) {
        Scores.updateDeviceEntryInitials(currentRun.deviceIndex, clean);
      } else {
        Scores.saveStoredInitials(clean);
      }

      // Immediately update highlighted row in local shared view as well
      for (const row of goSharedState.top) {
        if (row.me === true) row.n = clean;
      }
      renderGameOverView();

      // Debounced 700ms rename to shared service with same run key k
      if (currentRun.sharedSent && currentRun.sharedKey && Scores.isSharedEnabled()) {
        if (renameTimer) clearTimeout(renameTimer);
        const keyForRename = currentRun.sharedKey;
        const scoreForRename = currentRun.score;
        const stageForRename = currentRun.stageNum;
        renameTimer = setTimeout(() => {
          renameTimer = null;
          if (currentRun.sharedKey !== keyForRename) return;
          Scores.submitSharedScore({
            k: keyForRename,
            n: Scores.getStoredInitials(),
            s: scoreForRename,
            w: stageForRename
          }).then((res) => {
            if (res.stale || currentRun.sharedKey !== keyForRename || game.mode !== 'gameOver') return;
            if (res.ok) {
              goSharedState = { loading: false, error: false, top: res.top, rank: res.rank, fetched: true };
            } else {
              goSharedState = { loading: false, error: true, top: goSharedState.top, rank: goSharedState.rank, fetched: true };
            }
            renderGameOverView();
          });
        }, RENAME_DEBOUNCE_MS);
      }
    });

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
    elBtnRetry.addEventListener('click', () => game.startNewGame(game.selectedStartStage));
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
      // While the initials field has focus, ALL game keys and PAX detection are off
      if (document.activeElement === elInitials) {
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          elBtnRetry.focus();
        }
        return;
      }

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
          if (paxModeBeforeP === 'playing' && game.mode === 'paused') {
            game.setPaused(false);
          } else if (paxModeBeforeP === 'paused' && game.mode === 'playing') {
            game.setPaused(true);
          }
          paxModeBeforeP = null;
          return;
        }
      }

      // High-scores overlay: Escape and Enter close it and must NOT start a game
      if (highScoresOpen) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          closeHighScores();
        }
        return;
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
          // If another button like "High scores" or a scheme button is focused, let it act
          if (document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement.id !== 'btn-play') {
            return;
          }
          e.preventDefault();
          game.startNewGame();
          return;
        }
        if (game.mode === 'stageClear') {
          e.preventDefault();
          game.nextStage();
          return;
        }
        if (game.mode === 'gameOver') {
          if (document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement !== elBtnRetry) {
            return;
          }
          e.preventDefault();
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
      if (document.activeElement === elInitials) return;
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
