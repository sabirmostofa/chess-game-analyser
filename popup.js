const usernameInput = document.getElementById("username");
const importBtn = document.getElementById("importBtn");
const statusEl = document.getElementById("status");
const settingsBtn = document.getElementById("settingsBtn");
const query = new URLSearchParams(window.location.search);

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
  statusEl.className = kind;
}

async function loadSavedUsername() {
  const providedUsername = query.get("username");
  if (providedUsername) {
    usernameInput.value = providedUsername;
    return;
  }

  const { chessComUsername } = await chrome.storage.local.get("chessComUsername");
  if (chessComUsername) {
    usernameInput.value = chessComUsername;
  }
}

function applyLaunchReasonMessage() {
  const reason = query.get("reason");
  const error = query.get("error");

  if (reason === "missing_username") {
    setStatus("Set your Chess.com username, then click import.", "error");
    return;
  }

  if (reason === "username_error") {
    setStatus(error || "Username issue. Please verify and try again.", "error");
    return;
  }

  if (reason === "api_error") {
    setStatus(error || "API error. Please retry.", "error");
  }
}

function sendImportRequest(username) {
  const targetWindowId = getTargetWindowId();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "import-latest-game",
        username,
        targetWindowId
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          resolve({
            ok: false,
            error: runtimeError.message || "Unknown runtime error."
          });
          return;
        }
        resolve(response);
      }
    );
  });
}

async function onImportClick() {
  const username = usernameInput.value.trim();
  if (!username) {
    setStatus("Please enter your Chess.com username.", "error");
    usernameInput.focus();
    return;
  }

  importBtn.disabled = true;
  setStatus("Fetching latest game...");

  const result = await sendImportRequest(username);
  if (!result?.ok) {
    setStatus(result?.error || "Import failed.", "error");
    importBtn.disabled = false;
    return;
  }

  if (result.method === "direct-analysis-pgn") {
    setStatus("Opened analysis board from compact PGN URL.", "ok");
  } else {
    setStatus("Imported via lichess.org/paste form and opened analysis.", "ok");
  }
  importBtn.disabled = false;
}

importBtn.addEventListener("click", onImportClick);
settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
applyLaunchReasonMessage();
loadSavedUsername().catch((error) => {
  setStatus(`Could not load saved username: ${error.message}`, "error");
});
