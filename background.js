const CHESS_COM_API = "https://api.chess.com/pub/player";
const LICHESS_PASTE_URL = "https://lichess.org/paste";
const MAX_DIRECT_ANALYSIS_URL_LENGTH = 2200;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
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
  return `https://lichess.org/analysis/${encodeURIComponent(gameId)}`;
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
    func: (pgnText) => {
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "import-latest-game") {
    return false;
  }

  (async () => {
    const username = String(message.username || "").replace(/\s+/g, "");
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

    sendResponse({
      ok: true,
      username,
      endTime: latestGame.end_time || null,
      sourceGameUrl: latestGame.url || null,
      lichessUrl,
      method
    });
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return true;
});
