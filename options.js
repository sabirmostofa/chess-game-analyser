const usernameInput = document.getElementById("username");
const settingsForm = document.getElementById("settingsForm");
const saveBtn = document.getElementById("saveBtn");
const manualSelectionInput = document.getElementById("manualSelectionEnabled");
const statusEl = document.getElementById("status");
const CHESS_COM_PLAYER_API = "https://api.chess.com/pub/player";
const SAVE_BUTTON_TEXT = "Save settings";

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = kind;
}

function normalizeUsername(value) {
  return String(value || "").replace(/\s+/g, "");
}

async function verifyChessComUsername(username) {
  const response = await fetch(`${CHESS_COM_PLAYER_API}/${encodeURIComponent(username)}`);
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`Chess.com API error (${response.status}).`);
  }
  return true;
}

async function loadSettings() {
  const { chessComUsername, manualSelectionEnabled } = await chrome.storage.local.get([
    "chessComUsername",
    "manualSelectionEnabled"
  ]);
  if (chessComUsername) {
    usernameInput.value = chessComUsername;
  }
  manualSelectionInput.checked = manualSelectionEnabled === true;
}

async function saveSettings() {
  const username = normalizeUsername(usernameInput.value);
  if (!username) {
    setStatus("Username cannot be empty.", "error");
    usernameInput.focus();
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Verifying...";
  setStatus("Verifying username...");

  try {
    const exists = await verifyChessComUsername(username);
    if (!exists) {
      setStatus("Chess.com username not found.", "error");
      usernameInput.focus();
      return;
    }

    await chrome.storage.local.set({
      chessComUsername: username,
      manualSelectionEnabled: manualSelectionInput.checked
    });
    usernameInput.value = username;
    setStatus("Settings saved.", "ok");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = SAVE_BUTTON_TEXT;
  }
}

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSettings().catch((error) => {
    setStatus(`Save failed: ${error.message}`, "error");
  });
});

manualSelectionInput.addEventListener("change", () => {
  chrome.storage.local
    .set({ manualSelectionEnabled: manualSelectionInput.checked })
    .then(() => {
      setStatus("Manual selection mode saved.", "ok");
    })
    .catch((error) => {
      setStatus(`Save failed: ${error.message}`, "error");
    });
});

loadSettings().catch((error) => {
  setStatus(`Load failed: ${error.message}`, "error");
});
