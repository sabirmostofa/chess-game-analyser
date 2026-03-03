const CHESS_COM_API = "https://api.chess.com/pub/player";
const LICHESS_PASTE_URL = "https://lichess.org/paste";
const MAX_DIRECT_ANALYSIS_URL_LENGTH = 2200;
const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 420;
const CHOOSER_WIDTH = 420;
const CHOOSER_HEIGHT = 620;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function normalizeUsername(value) {
  return String(value || "").replace(/\s+/g, "");
}

function normalizeForCompare(value) {
  return String(value || "").trim().toLowerCase();
}

function summarizeGameForChooser(game, username) {
  const normalizedUser = normalizeForCompare(username);
  const whiteUser = normalizeForCompare(game?.white?.username);
  const blackUser = normalizeForCompare(game?.black?.username);

  const isWhite = normalizedUser === whiteUser;
  const isBlack = normalizedUser === blackUser;
  const color = isWhite ? "White" : isBlack ? "Black" : "Unknown";
  const opponent = isWhite ? game?.black?.username : isBlack ? game?.white?.username : "Unknown";

  const resultRaw = isWhite ? game?.white?.result : isBlack ? game?.black?.result : "";
  let outcome = "Draw";
  if (resultRaw === "win") {
    outcome = "Win";
  } else if (
    ["agreed", "stalemate", "repetition", "insufficient", "50move", "timevsinsufficient"].includes(
      String(resultRaw)
    )
  ) {
    outcome = "Draw";
  } else if (resultRaw) {
    outcome = "Loss";
  }

  return {
    id: String(game.uuid || game.url || `${game.end_time}-${Math.random()}`),
    opponent: opponent || "Unknown",
    color,
    outcome,
    endTime: Number(game.end_time || game.start_time || 0),
    gameUrl: game.url || "",
    timeClass: game.time_class || "",
    rated: Boolean(game.rated),
    pgn: game.pgn
  };
}

async function getMostRecentGame(username) {
  const archivesUrl = `${CHESS_COM_API}/${encodeURIComponent(username)}/games/archives`;
  const archivesPayload = await fetchJson(archivesUrl);
  const archives = archivesPayload.archives || [];

  if (!archives.length) {
    throw new Error("No game archives found for this Chess.com username.");
  }

  for (let i = archives.length - 1; i >= 0; i -= 1) {
    const archiveUrl = archives[i];
    const archivePayload = await fetchJson(archiveUrl);
    const games = archivePayload.games || [];

    if (!games.length) {
      continue;
    }

    let latestGame = games[0];
    for (const game of games) {
      const bestKnownTime = Number(latestGame.end_time || latestGame.start_time || 0);
      const thisTime = Number(game.end_time || game.start_time || 0);
      if (thisTime > bestKnownTime) {
        latestGame = game;
      }
    }

    if (!latestGame.pgn) {
      throw new Error("Latest game did not include PGN data.");
    }

    return latestGame;
  }

  throw new Error("No games found in recent archives.");
}

function compareByLatestTimeDesc(a, b) {
  const aTime = Number(a.end_time || a.start_time || 0);
  const bTime = Number(b.end_time || b.start_time || 0);
  return bTime - aTime;
}

async function getRecentGames(username, limit = 10) {
  const archivesUrl = `${CHESS_COM_API}/${encodeURIComponent(username)}/games/archives`;
  const archivesPayload = await fetchJson(archivesUrl);
  const archives = archivesPayload.archives || [];

  if (!archives.length) {
    throw new Error("No game archives found for this Chess.com username.");
  }

  const seen = new Set();
  const collected = [];

  for (let i = archives.length - 1; i >= 0 && collected.length < limit; i -= 1) {
    const archivePayload = await fetchJson(archives[i]);
    const games = (archivePayload.games || []).slice().sort(compareByLatestTimeDesc);

    for (const game of games) {
      const key = String(game.uuid || game.url || `${game.end_time}-${game.pgn?.length || 0}`);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (!game.pgn) {
        continue;
      }

      collected.push(game);
      if (collected.length >= limit) {
        break;
      }
    }
  }

  if (!collected.length) {
    throw new Error("No games found in recent archives.");
  }

  return collected.sort(compareByLatestTimeDesc).slice(0, limit);
}

function extractImportedGameId(url) {
  if (!url) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== "lichess.org") {
    return null;
  }

  const firstSegment = parsed.pathname.split("/").filter(Boolean)[0] || "";
  if (/^[A-Za-z0-9]{8}$/.test(firstSegment)) {
    return firstSegment;
  }

  return null;
}

function buildAnalysisUrl(gameId) {
  return `https://lichess.org/${encodeURIComponent(gameId)}#analysis`;
}

function buildCompactAnalysisPgn(pgn) {
  return pgn
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("["))
    .join(" ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tryBuildDirectAnalysisUrl(pgn) {
  const compact = buildCompactAnalysisPgn(pgn);
  if (!compact) {
    return null;
  }

  const url = `https://lichess.org/analysis/pgn/${encodeURIComponent(compact)}`;
  if (url.length > MAX_DIRECT_ANALYSIS_URL_LENGTH) {
    return null;
  }

  return url;
}

async function waitForTabComplete(tabId, timeoutMs = 15000) {
  const current = await chrome.tabs.get(tabId);
  if (current?.status === "complete") {
    return;
  }

  await new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Lichess paste page to load."));
    }, timeoutMs);

    function cleanup() {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId) {
        return;
      }
      if (changeInfo.status === "complete") {
        cleanup();
        resolve();
      }
    }

    function onRemoved(removedTabId) {
      if (removedTabId !== tabId) {
        return;
      }
      cleanup();
      reject(new Error("Lichess tab was closed before import could run."));
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

async function submitPgnViaPasteForm(pgn) {
  const tab = await chrome.tabs.create({ url: LICHESS_PASTE_URL });
  const tabId = tab?.id;
  if (typeof tabId !== "number") {
    throw new Error("Could not open Lichess paste page.");
  }

  await waitForTabComplete(tabId);

  await chrome.scripting.executeScript({
    target: { tabId },
    func: async (pgnText) => {
      const form = document.querySelector('form[action="/import"]');
      const textarea = document.querySelector('textarea[name="pgn"]');
      if (!form || !textarea) {
        throw new Error("Could not find Lichess import form.");
      }
      textarea.value = pgnText;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.submit();
      }
    },
    args: [pgn]
  });

  const gameId = await new Promise((resolve) => {
    const timeoutMs = 25000;
    let done = false;

    function finish(id) {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve(id);
    }

    const timer = setTimeout(() => finish(null), timeoutMs);

    function onUpdated(updatedTabId, _changeInfo, updatedTab) {
      if (updatedTabId !== tabId) {
        return;
      }
      const found = extractImportedGameId(updatedTab?.url || "");
      if (found) {
        finish(found);
      }
    }

    function onRemoved(removedTabId) {
      if (removedTabId !== tabId) {
        return;
      }
      finish(null);
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });

  if (!gameId) {
    throw new Error(
      "Lichess form submit did not redirect to a game URL. Check the opened tab for captcha/verification."
    );
  }

  const analysisUrl = buildAnalysisUrl(gameId);
  await chrome.tabs.update(tabId, { url: analysisUrl });
  return analysisUrl;
}

async function importLatestGameByUsername(rawUsername) {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    throw new Error("Enter your Chess.com username.");
  }

  const latestGame = await getMostRecentGame(username);
  await chrome.storage.local.set({ chessComUsername: username });

  const directUrl = tryBuildDirectAnalysisUrl(latestGame.pgn);
  let lichessUrl;
  let method;
  try {
    lichessUrl = await submitPgnViaPasteForm(latestGame.pgn);
    method = "paste-form-import";
  } catch (pasteError) {
    if (!directUrl) {
      throw pasteError;
    }

    lichessUrl = directUrl;
    method = "direct-analysis-pgn";
    await chrome.tabs.create({ url: lichessUrl });
  }

  return {
    username,
    endTime: latestGame.end_time || null,
    sourceGameUrl: latestGame.url || null,
    lichessUrl,
    method
  };
}

async function importSpecificGamePgn(pgn) {
  if (!pgn) {
    throw new Error("Selected game has no PGN.");
  }

  const directUrl = tryBuildDirectAnalysisUrl(pgn);
  let lichessUrl;
  let method;
  try {
    lichessUrl = await submitPgnViaPasteForm(pgn);
    method = "paste-form-import";
  } catch (pasteError) {
    if (!directUrl) {
      throw pasteError;
    }

    lichessUrl = directUrl;
    method = "direct-analysis-pgn";
    await chrome.tabs.create({ url: lichessUrl });
  }

  return { lichessUrl, method };
}

function shouldShowUsernamePopupForError(errorMessage) {
  const msg = String(errorMessage || "").toLowerCase();
  return (
    msg.includes("enter your chess.com username") ||
    msg.includes("no game archives found") ||
    msg.includes("request failed (404)") ||
    msg.includes("request failed (410)")
  );
}

async function openInputPopup(reason, errorMessage = "", username = "") {
  const params = new URLSearchParams();
  if (reason) {
    params.set("reason", reason);
  }
  if (errorMessage) {
    params.set("error", errorMessage);
  }
  if (username) {
    params.set("username", username);
  }

  const url = chrome.runtime.getURL(`popup.html?${params.toString()}`);
  await chrome.windows.create({
    url,
    type: "popup",
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT
  });
}

async function openChooserPopup(username) {
  const params = new URLSearchParams();
  if (username) {
    params.set("username", username);
  }

  const url = chrome.runtime.getURL(`chooser.html?${params.toString()}`);
  await chrome.windows.create({
    url,
    type: "popup",
    width: CHOOSER_WIDTH,
    height: CHOOSER_HEIGHT
  });
}

async function handleToolbarClick() {
  const { chessComUsername, manualSelectionEnabled } = await chrome.storage.local.get([
    "chessComUsername",
    "manualSelectionEnabled"
  ]);
  const username = normalizeUsername(chessComUsername);
  if (!username) {
    await openInputPopup("missing_username");
    return;
  }

  if (manualSelectionEnabled === true) {
    await openChooserPopup(username);
    return;
  }

  try {
    await importLatestGameByUsername(username);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = shouldShowUsernamePopupForError(message) ? "username_error" : "api_error";
    await openInputPopup(reason, message, username);
  }
}

chrome.action.onClicked.addListener(() => {
  handleToolbarClick().catch(() => {
    // Keep click handling resilient. Errors are already handled by opening a popup.
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "import-latest-game") {
    (async () => {
      const result = await importLatestGameByUsername(message.username);
      sendResponse({
        ok: true,
        ...result
      });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return true;
  }

  if (message?.type === "get-recent-games") {
    (async () => {
      const username = normalizeUsername(message.username);
      if (!username) {
        throw new Error("Enter your Chess.com username.");
      }

      const games = await getRecentGames(username, 10);
      const summaries = games.map((game) => summarizeGameForChooser(game, username));
      sendResponse({
        ok: true,
        username,
        games: summaries
      });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return true;
  }

  if (message?.type === "import-selected-game") {
    (async () => {
      const result = await importSpecificGamePgn(message.pgn);
      sendResponse({
        ok: true,
        ...result
      });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return true;
  }

  return false;
});
