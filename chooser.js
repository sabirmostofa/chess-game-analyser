const gamesEl = document.getElementById("games");
const statusEl = document.getElementById("status");
const subtitleEl = document.getElementById("subtitle");
const settingsBtn = document.getElementById("settingsBtn");
const query = new URLSearchParams(window.location.search);

let cachedGames = [];

function getTargetWindowId() {
  const raw = query.get("targetWindowId");
  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return null;
}

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
}

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        resolve({ ok: false, error: runtimeError.message || "Unknown runtime error." });
        return;
      }
      resolve(response);
    });
  });
}

function formatWhen(epochSeconds) {
  if (!epochSeconds) {
    return "Unknown time";
  }
  return new Date(epochSeconds * 1000).toLocaleString();
}

function outcomeClass(outcome) {
  const v = String(outcome || "").toLowerCase();
  if (v === "win") {
    return "win";
  }
  if (v === "loss") {
    return "loss";
  }
  return "draw";
}

function renderGames() {
  gamesEl.innerHTML = "";
  if (!cachedGames.length) {
    setStatus("No recent games found.", "error");
    return;
  }

  for (let i = 0; i < cachedGames.length; i += 1) {
    const game = cachedGames[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game";
    btn.dataset.index = String(i);
    btn.innerHTML = `
      <div class="row">
        <div class="main">vs ${game.opponent}</div>
        <span class="badge ${outcomeClass(game.outcome)}">${game.outcome}</span>
      </div>
      <div class="meta">${game.color} • ${game.timeClass || "unknown"} • ${game.rated ? "rated" : "casual"}</div>
      <div class="meta">${formatWhen(game.endTime)}</div>
    `;
    btn.addEventListener("click", onGameClick);
    gamesEl.appendChild(btn);
  }
}

async function onGameClick(event) {
  const target = event.currentTarget;
  const index = Number(target.dataset.index);
  const game = cachedGames[index];
  if (!game?.pgn) {
    setStatus("Selected game has no PGN.", "error");
    return;
  }

  const allButtons = document.querySelectorAll(".game");
  allButtons.forEach((b) => {
    b.disabled = true;
  });
  setStatus("Importing selected game...");

  const result = await sendMessage({
    type: "import-selected-game",
    pgn: game.pgn,
    playerColor: String(game.color || "").toLowerCase(),
    targetWindowId: getTargetWindowId()
  });

  if (!result?.ok) {
    setStatus(result?.error || "Import failed.", "error");
    allButtons.forEach((b) => {
      b.disabled = false;
    });
    return;
  }

  setStatus("Opened selected game on Lichess analysis.", "ok");
  window.close();
}

async function getUsername() {
  const fromQuery = String(query.get("username") || "").trim();
  if (fromQuery) {
    return fromQuery;
  }

  const { chessComUsername } = await chrome.storage.local.get("chessComUsername");
  return String(chessComUsername || "").trim();
}

async function loadRecentGames() {
  const username = await getUsername();
  if (!username) {
    setStatus("No saved username. Open settings.", "error");
    return;
  }

  subtitleEl.textContent = `Last 10 games for ${username}`;
  setStatus("Loading recent games...");

  const result = await sendMessage({
    type: "get-recent-games",
    username
  });

  if (!result?.ok) {
    setStatus(result?.error || "Failed to load games.", "error");
    return;
  }

  cachedGames = result.games || [];
  setStatus("");
  renderGames();
}

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadRecentGames().catch((error) => {
  setStatus(`Load failed: ${error.message}`, "error");
});
