let chromeURLPattern =
  /^https?:\/\/chrome.google.com\/webstore\/.+?\/([a-z]{32})(?=[\/#?]|$)/;
let chromeNewURLPattern =
  /^https?:\/\/chromewebstore.google.com\/detail\/.+?\/([a-z]{32})(?=[\/#?]|$)/;
let microsoftURLPattern =
  /^https?:\/\/microsoftedge.microsoft.com\/addons\/detail\/.+?\/([a-z]{32})(?=[\/#?]|$)/;

function ready() {
  applyI18n();
  document.getElementById("downloadZIP").onclick = async function () {
    let queryOptions = { active: true, currentWindow: true };
    let [tab] = await chrome.tabs.query(queryOptions);
    showZipProgress(getMessage("status_start", "Starting download..."), 0);
    chrome.runtime.sendMessage({ download: "zip", tab: tab });
  };
  document.getElementById("downloadCRX").onclick = async function () {
    let queryOptions = { active: true, currentWindow: true };
    let [tab] = await chrome.tabs.query(queryOptions);
    chrome.runtime.sendMessage({ download: "crx", tab: tab });
  };

  document.getElementById("convertCRXToZip").onchange = function (files) {
    setTimeout(() => {
      document.getElementById("loader").style.display = "none";
      document.getElementById("downloadCRXToZip").style.display = "block";
    }, 2000);
    document.getElementById("loader").style.display = "block";
    document.getElementById("downloadCRXToZip").style.display = "none";

    return false;
  };
  document.getElementById("downloadCRXToZip").onclick = function () {
    var file = document.getElementById("convertCRXToZip").files[0];

    var reader = new FileReader();
    reader.onload = function (e) {
      var data = reader.result;
      var buf = new Uint8Array(data);
      var publicKeyLength, signatureLength, header, zipStartOffset;
      if (buf[4] === 2) {
        header = 16;
        publicKeyLength =
          0 + buf[8] + (buf[9] << 8) + (buf[10] << 16) + (buf[11] << 24);
        signatureLength =
          0 + buf[12] + (buf[13] << 8) + (buf[14] << 16) + (buf[15] << 24);
        zipStartOffset = header + publicKeyLength + signatureLength;
      } else {
        publicKeyLength =
          0 +
          buf[8] +
          (buf[9] << 8) +
          (buf[10] << 16) +
          ((buf[11] << 24) >>> 0);
        zipStartOffset = 12 + publicKeyLength;
      }
      // 16 = Magic number (4), CRX format version (4), lengths (2x4)
      var zip = buf.slice(zipStartOffset, buf.length);
      var fileName = file.name.replace(".crx", ".zip");
      var blob = new Blob([zip], { type: "application/octet-stream" });
      var url = window.URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: fileName,
        saveAs: false,
      });
    };
    reader.readAsArrayBuffer(file);
  };
  chrome.tabs.query({ active: true, currentWindow: true }, function (tab) {
    tab = tab[0];
    var id = chromeURLPattern.exec(tab.url);

    if (!id) {
      id = chromeNewURLPattern.exec(tab.url);
    }
    var edgeId = microsoftURLPattern.exec(tab.url);

    document.getElementById("info").style.display = "block";
    var elements = document.getElementsByClassName("defaultBtn");
    var length = elements.length;
    for (var i = 0; i < length; i++) {
      elements[i].style.display = "none";
    }

    if (edgeId !== null && edgeId[1] !== null) {
      document.getElementById("info").style.display = "none";
      document.getElementById("downloadCRX").style.display = "block";
    } else if (id !== null && id[1] !== null) {
      document.getElementById("info").style.display = "none";
      var elements = document.getElementsByClassName("defaultBtn");
      var length = elements.length;
      for (var i = 0; i < length; i++) {
        elements[i].style.display = "block";
      }
    }
  });
}

function showZipProgress(message, percent) {
  const progress = document.getElementById("zipProgress");
  const status = document.getElementById("zipStatus");
  const bar = document.getElementById("zipBar");
  if (!progress || !status || !bar) return;
  progress.style.display = "block";
  status.textContent = message;
  bar.style.width = Math.max(0, Math.min(100, percent)) + "%";
}

function hideZipProgress() {
  const progress = document.getElementById("zipProgress");
  if (progress) progress.style.display = "none";
}

chrome.runtime.onMessage.addListener(function (message) {
  if (!message || message.type !== "zip-progress") return;
  if (message.stage === "start") {
    showZipProgress(getMessage("status_downloading", "Downloading CRX"), 0);
    return;
  }
  if (message.stage === "downloading") {
    const progressText = buildProgressText(
      getMessage("status_downloading", "Downloading CRX"),
      message.loaded,
      message.total,
    );
    const percent = getPercent(message.loaded, message.total);
    showZipProgress(progressText, percent);
    return;
  }
  if (message.stage === "converting") {
    const progressText = buildProgressText(
      getMessage("status_converting", "Converting to ZIP"),
      message.loaded,
      message.total,
    );
    showZipProgress(progressText, 100);
    return;
  }
  if (message.stage === "complete") {
    showZipProgress(
      getMessage("status_complete", "ZIP ready. Starting download..."),
      100,
    );
    setTimeout(() => hideZipProgress(), 1200);
    return;
  }
  if (message.stage === "error") {
    const fallback =
      message.message === "Network error"
        ? getMessage("status_network_error", "Network error.")
        : getMessage("status_failed", "Download failed.");
    showZipProgress(fallback, 0);
    return;
  }
});

function applyI18n() {
  const nodes = document.querySelectorAll("[data-i18n]");
  for (const node of nodes) {
    const key = node.getAttribute("data-i18n");
    if (!key) continue;
    node.textContent = getMessage(key, node.textContent);
  }
  const titleNodes = document.querySelectorAll("[data-i18n-title]");
  for (const node of titleNodes) {
    const key = node.getAttribute("data-i18n-title");
    if (!key) continue;
    node.setAttribute("title", getMessage(key, node.getAttribute("title")));
  }
}

function getMessage(key, fallback) {
  if (chrome.i18n && chrome.i18n.getMessage) {
    const value = chrome.i18n.getMessage(key);
    if (value) return value;
  }
  return fallback || "";
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return (
    value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1) +
    " " +
    units[unitIndex]
  );
}

function getPercent(loaded, total) {
  if (!total) return 50;
  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
}

function buildProgressText(label, loaded, total) {
  if (total) {
    return `${label}... ${formatBytes(loaded)} / ${formatBytes(total)} (${getPercent(loaded, total)}%)`;
  }
  if (loaded) {
    return `${label}... ${formatBytes(loaded)}`;
  }
  return `${label}...`;
}
ready();
