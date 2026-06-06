// ============================================================
//  SmartHelmet — Worker Safety Checklist Controller
//  Manages interactive checklists, compliance score math,
//  and localStorage persistence.
// ============================================================

// Workers initial static state
const DEFAULT_WORKERS = {
  w1: {
    name: "Marcus Vance",
    id: "M-204",
    role: "Drill Operator",
    avatar: "MV",
    checklist: {
      helmet: true,
      suit: true,
      boots: true,
      mask: false,
      harness: false,
      lamp: true,
      comms: true
    }
  },
  w2: {
    name: "Elena Rostova",
    id: "M-108",
    role: "Safety Officer",
    avatar: "ER",
    checklist: {
      helmet: true,
      suit: true,
      boots: true,
      mask: true,
      harness: true,
      lamp: true,
      comms: true
    }
  },
  w3: {
    name: "Tariq Mahmood",
    id: "M-315",
    role: "Ventilation Tech",
    avatar: "TM",
    checklist: {
      helmet: true,
      suit: false,
      boots: true,
      mask: true,
      harness: false,
      lamp: true,
      comms: false
    }
  }
};

const CHECKLIST_WEIGHTS = {
  helmet: 20,
  suit: 15,
  boots: 15,
  mask: 15,
  harness: 15,
  lamp: 10,
  comms: 10
};

let workers = {};

function init() {
  loadState();
  renderWorkerCards();
  updateScores();
  setupEventListeners();
}

function loadState() {
  try {
    const saved = localStorage.getItem('smSafetyWorkers');
    workers = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_WORKERS));
  } catch (e) {
    workers = JSON.parse(JSON.stringify(DEFAULT_WORKERS));
  }
}

function saveState() {
  try {
    localStorage.setItem('smSafetyWorkers', JSON.stringify(workers));
  } catch (e) {
    console.error("Failed to save safety state", e);
  }
}

function renderWorkerCards() {
  const container = document.getElementById('workerCardsCol');
  if (!container) return;
  container.innerHTML = '';

  Object.entries(workers).forEach(([wKey, worker]) => {
    const card = document.createElement('div');
    card.className = 'worker-card';
    card.id = `card-${wKey}`;
    
    // Build Checklist Items HTML
    let checklistHtml = '';
    Object.entries(CHECKLIST_WEIGHTS).forEach(([itemKey, weight]) => {
      const isChecked = worker.checklist[itemKey];
      const displayName = getDisplayName(itemKey);
      checklistHtml += `
        <label class="check-item ${isChecked ? 'checked' : ''}" data-worker="${wKey}" data-item="${itemKey}">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleCheckItem('${wKey}', '${itemKey}', this.checked)">
          <span class="check-label-text">${displayName}</span>
          <span class="check-weight">+${weight}%</span>
        </label>
      `;
    });

    card.innerHTML = `
      <div class="worker-header">
        <div class="worker-avatar">${worker.avatar}</div>
        <div class="worker-info">
          <div class="worker-name">${worker.name}</div>
          <div class="worker-meta">ID: ${worker.id} &nbsp;·&nbsp; ${worker.role}</div>
        </div>
        <div class="worker-badge-wrap">
          <span class="worker-badge" id="badge-${wKey}">Calculating</span>
        </div>
      </div>
      
      <div class="worker-score-bar-wrap">
        <span class="worker-score-lbl">Compliance Score</span>
        <div class="worker-score-track">
          <div class="worker-score-fill" id="fill-${wKey}"></div>
        </div>
        <span class="worker-score-num" id="score-${wKey}">0%</span>
      </div>

      <div class="checklist-grid">
        ${checklistHtml}
      </div>
    `;
    container.appendChild(card);
  });
}

function getDisplayName(key) {
  const names = {
    helmet: "Smart Helmet",
    suit: "Flame-Resistant Suit",
    boots: "Steel-Toe Boots",
    mask: "Respirator Mask",
    harness: "Safety Harness",
    lamp: "Cap Lamp & Battery",
    comms: "Comms & SCSR"
  };
  return names[key] || key;
}

window.toggleCheckItem = function(wKey, itemKey, isChecked) {
  workers[wKey].checklist[itemKey] = isChecked;
  saveState();
  
  // Visual highlight for the item card
  const label = document.querySelector(`label[data-worker="${wKey}"][data-item="${itemKey}"]`);
  if (label) {
    if (isChecked) {
      label.classList.add('checked');
    } else {
      label.classList.remove('checked');
    }
  }
  
  updateScores();
};

function updateScores() {
  let totalScoreSum = 0;
  let workerCount = 0;
  
  // Aggregate item compliance counts for the summary
  const itemCounts = { helmet: 0, suit: 0, boots: 0, mask: 0, harness: 0, lamp: 0, comms: 0 };

  Object.entries(workers).forEach(([wKey, worker]) => {
    workerCount++;
    let score = 0;
    
    Object.entries(worker.checklist).forEach(([itemKey, isChecked]) => {
      if (isChecked) {
        score += CHECKLIST_WEIGHTS[itemKey];
        itemCounts[itemKey]++;
      }
    });
    
    totalScoreSum += score;
    
    // Update individual worker UI
    const scoreNumEl = document.getElementById(`score-${wKey}`);
    const scoreFillEl = document.getElementById(`fill-${wKey}`);
    const badgeEl = document.getElementById(`badge-${wKey}`);
    const cardEl = document.getElementById(`card-${wKey}`);
    
    if (scoreNumEl) scoreNumEl.textContent = `${score}%`;
    if (scoreFillEl) {
      scoreFillEl.style.width = `${score}%`;
      // Update color class
      scoreFillEl.className = 'worker-score-fill';
      if (score >= 85) scoreFillEl.classList.add('safe');
      else if (score >= 50) scoreFillEl.classList.add('warn');
      else scoreFillEl.classList.add('danger');
    }
    
    if (badgeEl && cardEl) {
      let level = 'danger';
      let text = 'Critical';
      
      if (score >= 85) {
        level = 'safe';
        text = 'Compliant';
      } else if (score >= 50) {
        level = 'warn';
        text = 'Warning';
      }
      
      badgeEl.className = `worker-badge ${level}`;
      badgeEl.textContent = text;
      
      // Update card side border class
      cardEl.className = `worker-card state-${level}`;
    }
  });
  
  // Update Team average
  const teamAverage = workerCount > 0 ? Math.round(totalScoreSum / workerCount) : 0;
  
  const teamValEl = document.getElementById('teamScoreVal');
  const teamVerdictEl = document.getElementById('teamScoreVerdict');
  if (teamValEl) teamValEl.textContent = teamAverage;
  
  if (teamVerdictEl) {
    let lvl = 'danger';
    let text = 'Critical Warning';
    if (teamAverage >= 85) {
      lvl = 'safe';
      text = 'Fully Compliant';
    } else if (teamAverage >= 50) {
      lvl = 'warn';
      text = 'Partial Compliance';
    }
    teamVerdictEl.className = `summary-verdict ${lvl}`;
    teamVerdictEl.textContent = text;
  }
  
  // Draw canvas score ring
  if (window.drawScoreRing) {
    window.drawScoreRing('teamScoreRing', teamAverage);
  }
  
  // Update category breakdowns
  Object.entries(itemCounts).forEach(([itemKey, count]) => {
    const rate = Math.round((count / workerCount) * 100);
    const breakValEl = document.getElementById(`break-${itemKey}`);
    if (breakValEl) {
      breakValEl.textContent = `${rate}% (${count}/${workerCount})`;
    }
  });
}

function setupEventListeners() {
  const btnReset = document.getElementById('btnResetAll');
  const btnAll = document.getElementById('btnCheckAll');
  
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm("Are you sure you want to reset all worker checklists?")) {
        Object.keys(workers).forEach(wKey => {
          Object.keys(workers[wKey].checklist).forEach(itemKey => {
            workers[wKey].checklist[itemKey] = false;
          });
        });
        saveState();
        renderWorkerCards();
        updateScores();
      }
    });
  }
  
  if (btnAll) {
    btnAll.addEventListener('click', () => {
      Object.keys(workers).forEach(wKey => {
        Object.keys(workers[wKey].checklist).forEach(itemKey => {
          workers[wKey].checklist[itemKey] = true;
        });
      });
      saveState();
      renderWorkerCards();
      updateScores();
    });
  }
}

// Initialise checklist logic on load
window.addEventListener('load', init);
