const WIKI_ORIGIN = "https://it.wikipedia.org";
const API_URL = `${WIKI_ORIGIN}/w/api.php`;
const OTHER_VALUE = "__other__";
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
  { label: "Suzzara–Modena", article: "Ferrovia Verona-Mantova-Modena" }
];
const DEFAULT_LINE = LINES[0];

const elements = {
  form: document.querySelector("#line-form"),
  select: document.querySelector("#line-select"),
  otherInput: document.querySelector("#other-line-input"),
  viewButton: document.querySelector("#view-button"),
  heading: document.querySelector("#heading"),
  title: document.querySelector("#page-title"),
  sourceLink: document.querySelector("#source-link"),
  copyLink: document.querySelector("#copy-link"),
  status: document.querySelector("#status"),
  statusTitle: document.querySelector("#status-title"),
  statusCopy: document.querySelector("#status-copy"),
  shell: document.querySelector("#diagram-shell"),
  diagram: document.querySelector("#diagram"),
  attribution: document.querySelector("#attribution"),
  licenseSource: document.querySelector("#license-source"),
  empty: document.querySelector("#empty"),
  emptyCopy: document.querySelector("#empty-copy")
};

function normalizeTitle(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/\+/g, " "))
      .replace(/_/g, " " )
      .replace(/\s+/g, " " )
      .trim();
  } catch {
    return String(value || "").replace(/_/g, " " ).replace(/\s+/g, " " ).trim();
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
  return /^(stazioni\s+e\s+fermate|stazioni|percorso)$/i.test(String(value || "").replace(/\s+/g, " " ).trim());
}

function selectDiagram(root) {
  const tables = [...root.querySelectorAll("table")];
  const titled = tables.filter((table) => {
    const labels = [...table.querySelectorAll("caption, th, td")].slice(0, 6);
    return labels.some((element) => textMatchesDiagramHeading(element.textContent));
  });

  const candidates = titled.length ? titled : tables.filter((table) => {
    const text = table.textContent.replace(/\s+/g, " " );
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
        return parts.join(" " );
      }).join(", " );
    }
    image.loading = "lazy";
    image.decoding = "async";
  });

  return clone;
}

function setView(view) {
  elements.status.hidden = view !== "loading";
  elements.heading.hidden = view !== "result";
  elements.shell.hidden = view !== "result";
  elements.attribution.hidden = view !== "result";
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
  elements.statusCopy.textContent = "Recupero la versione più recente da Wikipedia.";
  setView("loading");

  try {
    const page = await getJson(apiUrl({ page: line.article, prop: "text" }));
    const canonicalTitle = page.parse?.title || line.article;
    const template = document.createElement("template");
    template.innerHTML = page.parse?.text || "";
    const table = selectDiagram(template.content);
    if (!table) throw new Error("La voce non contiene un diagramma riconoscibile.");

    const pageUrl = wikiPageUrl(canonicalTitle);
    elements.diagram.replaceChildren(prepareDiagram(table));
    elements.title.textContent = line.label;
    elements.sourceLink.href = pageUrl;
    elements.licenseSource.href = pageUrl;
    document.title = `${line.label} · Stazioni e fermate`;
    if (shouldUpdateLocation) updateLocation(line.article);
    setView("result");
  } catch (error) {
    elements.emptyCopy.textContent = error instanceof Error ? error.message : "Non è stato possibile caricare lo schema.";
    document.title = "Schema non trovato · Schemi ferroviari Wikipedia";
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
