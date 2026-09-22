const WIKI_ORIGIN = "https://it.wikipedia.org";
const API_URL = `${WIKI_ORIGIN}/w/api.php`;
const DEFAULT_LINE = "Ferrovia Milano-Bologna";

const elements = {
  form: document.querySelector("#line-form"),
  input: document.querySelector("#line-input"),
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
  emptyCopy: document.querySelector("#empty-copy"),
  exampleLine: document.querySelector("#example-line")
};

function normalizeTitle(value) {
  const decoded = decodeURIComponent(String(value || "").replace(/\+/g, " "));
  return decoded.replace(/_/g, " ").replace(/\s+/g, " ").trim() || DEFAULT_LINE;
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

function cleanHeading(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("it");
}

function findPathSection(sections) {
  const exact = sections.find((section) => cleanHeading(section.line) === "percorso");
  if (exact) return exact.index;
  return sections.find((section) => /percorso|tracciato|stazioni e fermate/.test(cleanHeading(section.line)))?.index;
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

async function loadLine(rawTitle, shouldUpdateLocation = true) {
  const title = normalizeTitle(rawTitle);
  elements.input.value = title;
  elements.statusTitle.textContent = "Caricamento dello schema…";
  elements.statusCopy.textContent = "Recupero la versione più recente da Wikipedia.";
  setView("loading");

  try {
    const metadata = await getJson(apiUrl({ page: title, prop: "sections" }));
    const canonicalTitle = metadata.parse?.title || title;
    const sectionIndex = findPathSection(metadata.parse?.sections || []);
    if (!sectionIndex) throw new Error("La voce non contiene una sezione Percorso riconoscibile.");

    const section = await getJson(apiUrl({ page: canonicalTitle, prop: "text", section: sectionIndex }));
    const template = document.createElement("template");
    template.innerHTML = section.parse?.text || "";
    const table = selectDiagram(template.content);
    if (!table) throw new Error("La sezione Percorso non contiene un diagramma riconoscibile.");

    const pageUrl = wikiPageUrl(canonicalTitle);
    elements.diagram.replaceChildren(prepareDiagram(table));
    elements.title.textContent = canonicalTitle;
    elements.sourceLink.href = `${pageUrl}#Percorso`;
    elements.licenseSource.href = pageUrl;
    document.title = `${canonicalTitle} · Stazioni e fermate`;
    if (shouldUpdateLocation) updateLocation(canonicalTitle);
    setView("result");
  } catch (error) {
    elements.emptyCopy.textContent = error instanceof Error ? error.message : "Non è stato possibile caricare lo schema.";
    document.title = "Schema non trovato · Schemi ferroviari Wikipedia";
    setView("empty");
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadLine(elements.input.value);
});

elements.exampleLine.addEventListener("click", () => loadLine("Ferrovia Parma-La Spezia"));

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
  const title = new URLSearchParams(window.location.search).get("linea") || DEFAULT_LINE;
  loadLine(title, false);
});

const initialTitle = new URLSearchParams(window.location.search).get("linea") || DEFAULT_LINE;
loadLine(initialTitle, false);
