const WIKI_ORIGIN = "https://it.wikipedia.org";
const API_URL = `${WIKI_ORIGIN}/w/api.php`;
const OTHER_VALUE = "__other__";
const CUSTOM_FAENZA_LAVEZZOLA = "Schema Faenza-Lavezzola FL85";
const LINES = [
  { label: "Piacenza–Bologna", article: "Ferrovia Milano-Bologna" },
  { label: "Fidenza–Salsomaggiore", article: "Ferrovia Fidenza-Salsomaggiore" },
  { label: "Bologna–Pistoia", article: "Ferrovia Bologna-Pistoia" },
  { label: "Bologna–Rimini", article: "Ferrovia Bologna-Ancona" },
  { label: "Castel Bolognese–Ravenna", article: "Ferrovia Castel Bolognese-Ravenna" },
  { label: "Faenza–Ravenna", article: "Ferrovia Faenza-Ravenna" },
  { label: "Ferrara–Rimini", article: "Ferrovia Ferrara-Rimini" },
  { label: "Occhiobello–Bologna", article: "Ferrovia Padova-Bologna" },
  { label: "Bologna–Prato", article: "Ferrovia Bologna-Firenze (direttissima)" },
  { label: "Poggio Rusco–Bologna", article: "Ferrovia Verona-Bologna" },
  { label: "Lavino–Bologna San Ruffillo", article: "Linea di cintura di Bologna" },
  { label: "Suzzara–Modena", article: "Ferrovia Verona-Mantova-Modena" },
  { label: "Faenza–Lavezzola", article: CUSTOM_FAENZA_LAVEZZOLA, custom: true }
];
const DEFAULT_LINE = LINES[0];

const elements = {
  form: document.querySelector("#line-form"),
  select: document.querySelector("#line-select"),
  otherInput: document.querySelector("#other-line-input"),
  viewButton: document.querySelector("#view-button"),
  heading: document.querySelector("#heading"),
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  sourceLink: document.querySelector("#source-link"),
  customSource: document.querySelector("#custom-source"),
  copyLink: document.querySelector("#copy-link"),
  status: document.querySelector("#status"),
  statusTitle: document.querySelector("#status-title"),
  statusCopy: document.querySelector("#status-copy"),
  shell: document.querySelector("#diagram-shell"),
  diagram: document.querySelector("#diagram"),
  wikiAttribution: document.querySelector("#wiki-attribution"),
  customAttribution: document.querySelector("#custom-attribution"),
  licenseSource: document.querySelector("#license-source"),
  empty: document.querySelector("#empty"),
  emptyCopy: document.querySelector("#empty-copy")
};

function normalizeTitle(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/\+/g, " "))
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return String(value || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  }
}

function resolveLine(value) {
  const title = normalizeTitle(value);
  if (!title || title === OTHER_VALUE) return DEFAULT_LINE;

  const normalized = title.toLocaleLowerCase("it");
  const preset = LINES.find((line) =>
    line.article.toLocaleLowerCase("it") === normalized ||
    line.label.toLocaleLowerCase("it") === normalized
  );
  if (preset) return preset;

  const article = /^(ferrovia|linea)\s/i.test(title)
    ? title
    : `Ferrovia ${title.replace(/[–—]/g, "-")}`;
  const label = article.replace(/^(ferrovia|linea)\s+/i, "");
  return { label, article, manual: true };
}

function setManualMode(enabled, value = "") {
  elements.otherInput.hidden = !enabled;
  elements.viewButton.hidden = !enabled;
  elements.otherInput.required = enabled;
  if (enabled) elements.otherInput.value = value;
}

function wikiPageUrl(title) {
  return `${WIKI_ORIGIN}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function apiUrl(params) {
  const query = new URLSearchParams({
    action: "parse",
    format: "json",
    formatversion: "2",
    origin: "*",
    redirects: "1",
    ...params
  });
  return `${API_URL}?${query}`;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Wikipedia ha risposto con codice ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.info || "Errore restituito da Wikipedia");
  return data;
}

function textMatchesDiagramHeading(value) {
  return /^(stazioni\s+e\s+fermate|stazioni|percorso)$/i.test(String(value || "").replace(/\s+/g, " ").trim());
}

function selectDiagram(root) {
  const tables = [...root.querySelectorAll("table")];
  const titled = tables.filter((table) => {
    const labels = [...table.querySelectorAll("caption, th, td")].slice(0, 6);
    return labels.some((element) => textMatchesDiagramHeading(element.textContent));
  });

  const candidates = titled.length ? titled : tables.filter((table) => {
    const text = table.textContent.replace(/\s+/g, " ");
    const imageCount = table.querySelectorAll("img").length;
    const rowCount = table.querySelectorAll("tr").length;
    return /Stazioni e fermate/i.test(text) || (imageCount >= 8 && rowCount >= 8);
  });

  return candidates.sort((a, b) => {
    const score = (table) => table.querySelectorAll("tr").length * 4 + table.querySelectorAll("img").length;
    return score(b) - score(a);
  })[0] || null;
}

function absolutizeUrl(value) {
  if (!value || value.startsWith("data:") || value.startsWith("#")) return value;
  if (value.startsWith("//")) return `https:${value}`;
  try { return new URL(value, WIKI_ORIGIN).href; } catch { return value; }
}

function prepareDiagram(table) {
  const clone = table.cloneNode(true);
  clone.removeAttribute("id");
  clone.querySelectorAll("script, style, link, .mw-editsection").forEach((node) => node.remove());

  clone.querySelectorAll("a[href]").forEach((link) => {
    link.href = absolutizeUrl(link.getAttribute("href"));
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });

  clone.querySelectorAll("img").forEach((image) => {
    const source = image.getAttribute("src");
    if (source) image.src = absolutizeUrl(source);
    const srcset = image.getAttribute("srcset");
    if (srcset) {
      image.srcset = srcset.split(",").map((candidate) => {
        const parts = candidate.trim().split(/\s+/);
        parts[0] = absolutizeUrl(parts[0]);
        return parts.join(" ");
      }).join(", ");
    }
    image.loading = "lazy";
    image.decoding = "async";
  });

  return clone;
}

const FAENZA_LAVEZZOLA_STOPS = [
  { km: "17+052", name: "Faenza", kind: "station", branch: "per Bologna, Firenze e Rimini" },
  { km: "8+137 / 7+621", name: "Granarolo Faentino", kind: "station", branch: "per Ravenna", note: "termine tratto elettrificato da Faenza" },
  { km: "4+189", name: "Cotignola", kind: "stop" },
  { km: "13+968 / 0+000", name: "Lugo", kind: "station", branch: "per Castel Bolognese e Ravenna", note: "cambio progressiva chilometrica" },
  { km: "5+442", name: "Sant’Agata sul Santerno", kind: "stop" },
  { km: "8+182", name: "Massa Lombarda", kind: "station" },
  { km: "13+062", name: "San Patrizio", kind: "stop" },
  { km: "15+423", name: "Conselice", kind: "station" },
  { km: "18+516", name: "Conselice Zona Industriale", kind: "station" },
  { km: "22+196", name: "Lavezzola", kind: "station", branch: "per Ferrara e Rimini" }
];

function renderCustomDiagram() {
  const wrapper = document.createElement("div");
  wrapper.className = "custom-route-wrap";

  const summary = document.createElement("div");
  summary.className = "custom-route-summary";
  ["39,248 km", "binario semplice", "3 kV CC Faenza–Granarolo"].forEach((value) => {
    const item = document.createElement("span");
    item.textContent = value;
    summary.append(item);
  });

  const table = document.createElement("table");
  table.className = "custom-route";
  table.innerHTML = `
    <caption>Schema della linea</caption>
    <colgroup><col class="km-column"><col class="track-column"><col class="place-column"><col class="note-column"></colgroup>
    <thead><tr><th>PK</th><th aria-label="Tracciato"></th><th>Località di servizio</th><th>Collegamenti e note</th></tr></thead>
  `;

  const body = document.createElement("tbody");
  FAENZA_LAVEZZOLA_STOPS.forEach((stop) => {
    const row = document.createElement("tr");
    row.className = `route-row route-${stop.kind}`;

    const km = document.createElement("td");
    km.className = "route-km";
    km.textContent = stop.km;

    const symbol = document.createElement("td");
    symbol.className = `route-symbol${stop.branch ? " has-branch" : ""}`;
    symbol.innerHTML = `<span class="route-node" aria-hidden="true"></span>`;

    const place = document.createElement("td");
    place.className = "route-place";
    const name = document.createElement(stop.kind === "station" ? "strong" : "em");
    name.textContent = stop.name;
    place.append(name);

    const details = document.createElement("td");
    details.className = "route-details";
    if (stop.branch) {
      const branch = document.createElement("span");
      branch.className = "route-connection";
      branch.textContent = `→ ${stop.branch}`;
      details.append(branch);
    }
    if (stop.note) {
      const note = document.createElement("small");
      note.textContent = stop.note;
      details.append(note);
    }

    row.append(km, symbol, place, details);
    body.append(row);
  });
  table.append(body);

  const legend = document.createElement("div");
  legend.className = "custom-route-legend";
  legend.innerHTML = `
    <span><i class="legend-symbol station-symbol" aria-hidden="true"></i>stazione / località di servizio</span>
    <span><i class="legend-symbol stop-symbol" aria-hidden="true"></i>fermata</span>
    <span>PK riportate nel FL 85; doppia PK nei punti di cambio progressiva</span>
  `;

  wrapper.append(summary, table, legend);
  return wrapper;
}

function setSourceMode(isCustom) {
  elements.sourceLink.hidden = isCustom;
  elements.customSource.hidden = !isCustom;
  elements.wikiAttribution.hidden = isCustom;
  elements.customAttribution.hidden = !isCustom;
}

function setView(view) {
  elements.status.hidden = view !== "loading";
  elements.heading.hidden = view !== "result";
  elements.shell.hidden = view !== "result";
  if (view !== "result") {
    elements.wikiAttribution.hidden = true;
    elements.customAttribution.hidden = true;
  }
  elements.empty.hidden = view !== "empty";
}

function updateLocation(title) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("linea", title.replace(/ /g, "_"));
  history.replaceState({ title }, "", url);
}

async function loadLine(rawValue, shouldUpdateLocation = true) {
  const line = resolveLine(rawValue);
  elements.select.value = line.manual ? OTHER_VALUE : line.article;
  setManualMode(Boolean(line.manual), line.manual ? line.label : "");
  elements.statusTitle.textContent = "Caricamento dello schema…";
  elements.statusCopy.textContent = line.custom
    ? "Ricostruzione dal Fascicolo Linea 85 RFI."
    : "Recupero la versione più recente da Wikipedia.";
  setView("loading");

  try {
    if (line.custom) {
      elements.diagram.classList.add("custom-diagram");
      elements.diagram.replaceChildren(renderCustomDiagram());
      elements.title.textContent = line.label;
      elements.subtitle.textContent = "Schema linea · Fascicolo Linea 85";
      document.title = `${line.label} · Fascicolo Linea 85`;
      if (shouldUpdateLocation) updateLocation(line.article);
      setView("result");
      setSourceMode(true);
      return;
    }

    const page = await getJson(apiUrl({ page: line.article, prop: "text" }));
    const canonicalTitle = page.parse?.title || line.article;
    const template = document.createElement("template");
    template.innerHTML = page.parse?.text || "";
    const table = selectDiagram(template.content);
    if (!table) throw new Error("La voce non contiene un diagramma riconoscibile.");

    const pageUrl = wikiPageUrl(canonicalTitle);
    elements.diagram.classList.remove("custom-diagram");
    elements.diagram.replaceChildren(prepareDiagram(table));
    elements.title.textContent = line.label;
    elements.subtitle.textContent = "Stazioni e fermate";
    elements.sourceLink.href = pageUrl;
    elements.licenseSource.href = pageUrl;
    document.title = `${line.label} · Stazioni e fermate`;
    if (shouldUpdateLocation) updateLocation(line.article);
    setView("result");
    setSourceMode(false);
  } catch (error) {
    elements.emptyCopy.textContent = error instanceof Error ? error.message : "Non è stato possibile caricare lo schema.";
    document.title = "Schema non trovato · Schemi ferroviari";
    setView("empty");
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (elements.select.value === OTHER_VALUE) loadLine(elements.otherInput.value);
});

elements.select.addEventListener("change", () => {
  if (elements.select.value === OTHER_VALUE) {
    setManualMode(true);
    elements.otherInput.focus();
    return;
  }
  setManualMode(false);
  loadLine(elements.select.value);
});

elements.copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    const original = elements.copyLink.textContent;
    elements.copyLink.textContent = "Link copiato";
    window.setTimeout(() => { elements.copyLink.textContent = original; }, 1800);
  } catch {
    window.prompt("Copia questo link:", window.location.href);
  }
});

window.addEventListener("popstate", () => {
  const title = new URLSearchParams(window.location.search).get("linea") || DEFAULT_LINE.article;
  loadLine(title, false);
});

const initialTitle = new URLSearchParams(window.location.search).get("linea") || DEFAULT_LINE.article;
loadLine(initialTitle, false);
