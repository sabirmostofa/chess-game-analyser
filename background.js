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

function normalizeWindowId(value) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }
  return null;
}

function normalizePlayerColor(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "white" || normalized === "black") {
    return normalized;
  }
  return null;
}

function resolvePlayerColorFromGame(game, username) {
  const normalizedUser = normalizeForCompare(username);
  if (!normalizedUser) {
    return null;
  }

  const whiteUser = normalizeForCompare(game?.white?.username);
  if (normalizedUser === whiteUser) {
    return "white";
  }

  const blackUser = normalizeForCompare(game?.black?.username);
  if (normalizedUser === blackUser) {
    return "black";
  }

  return null;
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

function buildImportedGameAnalysisUrl(gameId, playerColor = null) {
  const color = normalizePlayerColor(playerColor);
  const colorSegment = color === "black" ? "/black" : "";
  return `https://lichess.org/${encodeURIComponent(gameId)}${colorSegment}`;
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

function tryBuildDirectAnalysisUrl(pgn, playerColor = null) {
  const compact = buildCompactAnalysisPgn(pgn);
  if (!compact) {
    return null;
  }

  const color = normalizePlayerColor(playerColor);
  const colorQuery = color === "black" ? "?color=black" : "";
  const url = `https://lichess.org/analysis/pgn/${encodeURIComponent(compact)}${colorQuery}`;
  if (url.length > MAX_DIRECT_ANALYSIS_URL_LENGTH) {
    return null;
  }

  return url;
}

async function createTabInTargetWindow(url, targetWindowId = null) {
  const normalizedWindowId = normalizeWindowId(targetWindowId);
  if (normalizedWindowId !== null) {
    try {
      return await chrome.tabs.create({ url, windowId: normalizedWindowId });
    } catch {
      // Fallback if the target window no longer exists.
    }
  }

  return chrome.tabs.create({ url });
}

async function ensureBoardRenderedOrReloadOnce(tabId) {
  if (typeof tabId !== "number") {
    return;
  }

  try {
    await waitForTabComplete(tabId, 20000);
  } catch {
    // Continue to best-effort DOM checks even if complete event timing was missed.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        function injectBoardBackgroundFallback() {
          if (document.getElementById("lichess-importer-board-fallback-style")) {
            return;
          }

          const style = document.createElement("style");
          style.id = "lichess-importer-board-fallback-style";
          style.textContent = `
            .is2d cg-board {
              background-color: #b58863 !important;
              background-image: conic-gradient(
                #f0d9b5 90deg,
                #b58863 0 180deg,
                #f0d9b5 0 270deg,
                #b58863 0
              ) !important;
              background-size: 25% 25% !important;
              background-position: 0 0 !important;
            }
          `;
          document.head.appendChild(style);
        }

        function boardHasGeometryAndPieces() {
          const board = document.querySelector("cg-board");
          const wrap = document.querySelector(".main-board .cg-wrap");
          if (!(board instanceof HTMLElement) || !(wrap instanceof HTMLElement)) {
            return false;
          }

          const boardRect = board.getBoundingClientRect();
          const wrapRect = wrap.getBoundingClientRect();
          if (boardRect.width < 40 || boardRect.height < 40 || wrapRect.width < 40 || wrapRect.height < 40) {
            return false;
          }

          const pieceCount = board.querySelectorAll("piece").length;
          return pieceCount > 0;
        }

        injectBoardBackgroundFallback();

        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
          if (boardHasGeometryAndPieces()) {
            return;
          }
          await sleep(250);
        }

        // Prevent reload loops: one auto-reload attempt per URL path+query per tab session.
        const key = `lichessImporterReloaded:${location.pathname}${location.search}`;
        if (sessionStorage.getItem(key) === "1") {
          return;
        }

        sessionStorage.setItem(key, "1");
        location.reload();
      }
    });
  } catch {
    // Best effort only; import should still complete.
  }
}

async function resolveTargetBrowserWindowId(preferredWindowId = null, fallbackWindowId = null) {
  const preferred = normalizeWindowId(preferredWindowId);
  if (preferred !== null) {
    try {
      const win = await chrome.windows.get(preferred);
      if (win?.type === "normal") {
        return preferred;
      }
    } catch {
      // Ignore stale/missing windows and continue resolving.
    }
  }

  const fallback = normalizeWindowId(fallbackWindowId);
  if (fallback !== null) {
    try {
      const win = await chrome.windows.get(fallback);
      if (win?.type === "normal") {
        return fallback;
      }
    } catch {
      // Ignore stale/missing windows and continue resolving.
    }
  }

  try {
    const windows = await chrome.windows.getAll();
    const focusedNormal = windows.find((win) => win.type === "normal" && win.focused);
    if (focusedNormal?.id !== undefined) {
      return focusedNormal.id;
    }

    const anyNormal = windows.find((win) => win.type === "normal");
    if (anyNormal?.id !== undefined) {
      return anyNormal.id;
    }
  } catch {
    // If querying windows fails, fall back to default tab creation behavior.
  }

  return null;
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

async function submitPgnViaPasteForm(pgn, playerColor = null, targetWindowId = null) {
  const tab = await createTabInTargetWindow(LICHESS_PASTE_URL, targetWindowId);
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

  const analysisUrl = buildImportedGameAnalysisUrl(gameId, playerColor);
  await chrome.tabs.update(tabId, { url: analysisUrl });
  if (normalizePlayerColor(playerColor) === "black") {
    await ensureBoardRenderedOrReloadOnce(tabId);
  }
  return analysisUrl;
}

async function importLatestGameByUsername(rawUsername, targetWindowId = null) {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    throw new Error("Enter your Chess.com username.");
  }

  const latestGame = await getMostRecentGame(username);
  const playerColor = resolvePlayerColorFromGame(latestGame, username);
  await chrome.storage.local.set({ chessComUsername: username });

  const directUrl = tryBuildDirectAnalysisUrl(latestGame.pgn, playerColor);
  let lichessUrl;
  let method;
  try {
    lichessUrl = await submitPgnViaPasteForm(latestGame.pgn, playerColor, targetWindowId);
    method = "paste-form-import";
  } catch (pasteError) {
    if (!directUrl) {
      throw pasteError;
    }

    lichessUrl = directUrl;
    method = "direct-analysis-pgn";
    const tab = await createTabInTargetWindow(lichessUrl, targetWindowId);
    if (normalizePlayerColor(playerColor) === "black") {
      await ensureBoardRenderedOrReloadOnce(tab?.id);
    }
  }

  return {
    username,
    endTime: latestGame.end_time || null,
    sourceGameUrl: latestGame.url || null,
    lichessUrl,
    method
  };
}

async function importSpecificGamePgn(pgn, playerColor = null, targetWindowId = null) {
  if (!pgn) {
    throw new Error("Selected game has no PGN.");
  }

  const normalizedColor = normalizePlayerColor(playerColor);
  const directUrl = tryBuildDirectAnalysisUrl(pgn, normalizedColor);
  let lichessUrl;
  let method;
  try {
    lichessUrl = await submitPgnViaPasteForm(pgn, normalizedColor, targetWindowId);
    method = "paste-form-import";
  } catch (pasteError) {
    if (!directUrl) {
      throw pasteError;
    }

    lichessUrl = directUrl;
    method = "direct-analysis-pgn";
    const tab = await createTabInTargetWindow(lichessUrl, targetWindowId);
    if (normalizedColor === "black") {
      await ensureBoardRenderedOrReloadOnce(tab?.id);
    }
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

async function openInputPopup(
  reason,
  errorMessage = "",
  username = "",
  targetWindowId = null
) {
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
  if (normalizeWindowId(targetWindowId) !== null) {
    params.set("targetWindowId", String(targetWindowId));
  }

  const url = chrome.runtime.getURL(`popup.html?${params.toString()}`);
  await chrome.windows.create({
    url,
    type: "popup",
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT
  });
}

async function openChooserPopup(username, targetWindowId = null) {
  const params = new URLSearchParams();
  if (username) {
    params.set("username", username);
  }
  if (normalizeWindowId(targetWindowId) !== null) {
    params.set("targetWindowId", String(targetWindowId));
  }

  const url = chrome.runtime.getURL(`chooser.html?${params.toString()}`);
  await chrome.windows.create({
    url,
    type: "popup",
    width: CHOOSER_WIDTH,
    height: CHOOSER_HEIGHT
  });
}

async function handleToolbarClick(tab = null) {
  const targetWindowId = normalizeWindowId(tab?.windowId);
  const { chessComUsername, manualSelectionEnabled } = await chrome.storage.local.get([
    "chessComUsername",
    "manualSelectionEnabled"
  ]);
  const username = normalizeUsername(chessComUsername);
  if (!username) {
    await openInputPopup("missing_username", "", "", targetWindowId);
    return;
  }

  if (manualSelectionEnabled === true) {
    await openChooserPopup(username, targetWindowId);
    return;
  }

  try {
    await importLatestGameByUsername(username, targetWindowId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = shouldShowUsernamePopupForError(message) ? "username_error" : "api_error";
    await openInputPopup(reason, message, username, targetWindowId);
  }
}

chrome.action.onClicked.addListener((tab) => {
  handleToolbarClick(tab).catch(() => {
    // Keep click handling resilient. Errors are already handled by opening a popup.
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "import-latest-game") {
    (async () => {
      const senderWindowId = normalizeWindowId(_sender?.tab?.windowId);
      const targetWindowId = normalizeWindowId(message.targetWindowId);
      const resolvedTargetWindowId = await resolveTargetBrowserWindowId(
        targetWindowId,
        senderWindowId
      );
      const result = await importLatestGameByUsername(
        message.username,
        resolvedTargetWindowId
      );
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
      const senderWindowId = normalizeWindowId(_sender?.tab?.windowId);
      const targetWindowId = normalizeWindowId(message.targetWindowId);
      const resolvedTargetWindowId = await resolveTargetBrowserWindowId(
        targetWindowId,
        senderWindowId
      );
      const result = await importSpecificGamePgn(
        message.pgn,
        message.playerColor,
        resolvedTargetWindowId
      );
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
