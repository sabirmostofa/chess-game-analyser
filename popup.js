const usernameInput = document.getElementById("username");
const importBtn = document.getElementById("importBtn");
const statusEl = document.getElementById("status");

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = kind;
}

async function loadSavedUsername() {
  const { chessComUsername } = await chrome.storage.local.get("chessComUsername");
  if (chessComUsername) {
    usernameInput.value = chessComUsername;
  }
}

function sendImportRequest(username) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "import-latest-game",
        username
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
loadSavedUsername().catch((error) => {
  setStatus(`Could not load saved username: ${error.message}`, "error");
});
