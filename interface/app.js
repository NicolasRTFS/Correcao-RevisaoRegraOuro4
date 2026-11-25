const FIELD_COLORS = {
  "Categoria": "#7c5bd6",
  "Marca": "#2278c7",
  "Modelo": "#d14d72",
  "Ano": "#c07a16",
  "Estado de uso": "#268b74",
  "Chassi": "#c74440",
  "Motor": "#687a22",
  "Numero_serie": "#8d5b3d",
};

const FIELD_LABELS = {
  "Numero_serie": "Número de série",
};

const CATEGORY_OPTIONS = [
  "Motoniveladoras e Patrols",
  "Trator de Esteira",
  "Trator Agricola",
  "Colheitadeiras e Colhedoras",
  "Escavadeira",
  "Retroescavadeira",
  "Pa Carregadeira",
  "Rolo Compactador",
  "-",
];

const VIN_YEAR_CODES = [
  "A", "B", "C", "D", "E", "F", "G", "H", "J", "K",
  "L", "M", "N", "P", "R", "S", "T", "V", "W", "X", "Y",
  "1", "2", "3", "4", "5", "6", "7", "8", "9",
];

// Regras conservadoras extraídas das tabelas de WMI/WMC fornecidas. Prefixos
// genéricos (como 9B9, 949 e 9BL) não recebem Marca, pois dependem de outra
// base. Modelo só é sugerido quando o código aparece diretamente no PIN.
const CHASSIS_PREFIX_RULES = {
  XUG: { brand: "XCMG", modelLength: 4, serialStart: 11, yearMode: "partial" },
  CAT: { brand: "CATERPILLAR", modelLength: 5, serialStart: 9, yearMode: "factory", category: ["0313D", "Escavadeira"] },
  "1BZ": { brand: "JOHN DEERE", modelLength: 4, serialStart: 11, category: ["620G", "Motoniveladoras e Patrols"] },
  HBZ: { brand: "CASE", modelLength: 5, serialStart: 11 },
  NKJ: { brand: "NEW HOLLAND", modelLength: 4, serialStart: 11, category: ["L320", "Pa Carregadeira"] },
  HCC: { brand: "CASE", modelLength: 5, serialStart: 11 },
  SEM: { brand: "SEM", modelLength: 5, serialStart: 11, yearMode: "partial" },
  JAF: { modelLength: 4, serialStart: 11, category: ["L218", "Pa Carregadeira"] },
  NHN: { brand: "NEW HOLLAND", modelLength: 5, serialStart: 11, category: ["TT475", "Trator Agricola"] },
  MIM: { modelLength: 5, serialStart: 11 },
  RDV: { modelLength: 5, serialStart: 11 },
  "1BM": { brand: "JOHN DEERE", modelLength: 5, serialStart: 11, category: ["5080E", "Trator Agricola"] },
  "1F9": { brand: "JOHN DEERE", modelLength: 5, serialStart: 11, category: ["160GX", "Escavadeira"] },
  "9B9": { serialStart: 11 },
  "000": { yearMode: "none" },
  GEO: { brand: "JCB", modelLength: 5, serialStart: 11, yearMode: "partial" },
  LSW: { brand: "LS TRACTOR", modelLength: 4, serialStart: 11, yearMode: "partial" },
  "93Z": { brand: "IVECO", serialStart: 11 },
  "949": { serialStart: 11 },
  "953": { brand: "VOLKSWAGEN", serialStart: 11 },
  "9BL": { serialStart: 11 },
  "9BM": { brand: "MERCEDES-BENZ", serialStart: 11 },
  AGT: { modelLength: 5, serialStart: 11, yearMode: "factory" },
  CLG: { brand: "LIUGONG", modelLength: 4, serialStart: 11, yearMode: "partial", category: ["835H", "Pa Carregadeira"] },
  FTC: { brand: "FOTON/LOVOL", modelLength: 5, serialStart: 11, yearMode: "partial" },
  GAT: { brand: "JCB", modelLength: 5, serialStart: 11, yearMode: "factory", category: ["VM115", "Rolo Compactador"] },
  KRT: { modelLength: 5, serialStart: 11, yearMode: "partial" },
  MDI: { brand: "MAHINDRA", modelLength: 5, serialStart: 11, category: ["09501", "Trator Agricola"] },
  S0R: { brand: "JCB", modelLength: 3, serialStart: 10, category: ["3CX", "Retroescavadeira"] },
  SOR: { brand: "JCB", modelLength: 3, serialStart: 10, category: ["3CX", "Retroescavadeira"] },
};

const CHASSIS_VIN_PREFIXES = new Set(["93Z", "949", "953", "9B9", "9BM"]);
const CHASSIS_MIXED_PREFIXES = new Set(["1F9", "9BL"]);
const CHASSIS_NONSTANDARD_PIN_PREFIXES = new Set(["MIM", "RDV", "AGT", "KRT"]);

function chassisPattern(prefix) {
  if (CHASSIS_VIN_PREFIXES.has(prefix)) return "VIN";
  if (CHASSIS_MIXED_PREFIXES.has(prefix)) return "VIN/PIN";
  if (CHASSIS_NONSTANDARD_PIN_PREFIXES.has(prefix)) return "PIN não padronizado";
  if (prefix === "000") return "fora do padrão WMI/WMC";
  if (CHASSIS_PREFIX_RULES[prefix]) return "PIN";
  return "VIN/PIN moderno não confirmado";
}

function chassisSuggestionReason(prefix, explanation) {
  return [
    `Início do código: ${prefix}.`,
    `Padrão identificado: ${chassisPattern(prefix)}.`,
    explanation,
  ].join("\n");
}

const state = {
  mode: null,
  index: 0,
  total: 0,
  fields: [],
  record: null,
  originalRecord: null,
  spans: {},
  comments: [],
  criteria: [],
  status: "pendente",
  activeField: null,
  saving: false,
  navigating: false,
  lastUnlocked: false,
  checkpointIndex: 0,
  checkpointAutomatic: false,
  dirty: false,
  inputTimer: null,
  sessionPositions: { correcao: null, revisao: null },
  commentsPinned: false,
  commentsCloseTimer: null,
  commentsAnimationTimer: null,
  criteriaPinned: false,
  criteriaCloseTimer: null,
  criteriaAnimationTimer: null,
  categoryFilter: "",
  searchMode: false,
  checkMode: false,
};

const $ = (selector) => document.querySelector(selector);
const modeScreen = $("#mode-screen");
const unavailableScreen = $("#unavailable-screen");
const workspace = $("#workspace");
const description = $("#description");
const fieldsContainer = $("#fields");

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const button = $("#theme-toggle");
  button.textContent = dark ? "☀" : "☾";
  button.setAttribute("aria-label", dark ? "Ativar modo claro" : "Ativar modo noturno");
  button.title = dark ? "Ativar modo claro" : "Ativar modo noturno";
}

let savedTheme = "light";
try {
  savedTheme = localStorage.getItem("amostra-tema") || "light";
} catch (_) { /* O tema continua claro se o armazenamento estiver indisponível. */ }
applyTheme(savedTheme);
$("#theme-toggle").addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  try { localStorage.setItem("amostra-tema", nextTheme); } catch (_) { /* Sem persistência. */ }
});

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.erro || "Não foi possível concluir a operação.");
  return body;
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function openSearch(value, emptyMessage = "Não há conteúdo para pesquisar.") {
  const query = (value || "").trim();
  if (!query) {
    showToast(emptyMessage);
    return false;
  }
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const searchTab = window.open(searchUrl, "_blank");
  if (searchTab) searchTab.opener = null;
  if (!searchTab) {
    showToast("O navegador bloqueou a nova aba. Permita pop-ups para usar a pesquisa.", true);
    return false;
  }
  return true;
}

function setSaveState(text) {
  $("#save-state").textContent = text;
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function normalizeCategoryText(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function focusCategoryDropdown() {
  const select = document.querySelector('.field-card[data-field="Categoria"] select');
  select?.focus();
  if (typeof select?.showPicker === "function") {
    try { select.showPicker(); } catch (_) { /* O foco já deixa a lista pronta para uso. */ }
  }
}

function descriptionText() {
  return description.innerText.replace(/\r/g, "").replace(/\n$/, "");
}

function buildHighlightedHtml(text, spans, additionalSpans = []) {
  const ordered = [
    ...Object.entries(spans).map(([field, span]) => ({ field, ...span })),
    ...additionalSpans,
  ]
    .filter((span) => Number.isInteger(span.start) && Number.isInteger(span.end) && span.start < span.end && span.end <= text.length)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = 0;
  let html = "";
  for (const span of ordered) {
    if (span.start < cursor) continue;
    html += escapeHtml(text.slice(cursor, span.start));
    const selected = escapeHtml(text.slice(span.start, span.end));
    const color = FIELD_COLORS[span.field];
    const classes = ["highlight", span.className || ""].filter(Boolean).join(" ");
    html += `<span class="${classes}" data-field="${escapeAttribute(span.field)}" style="background:${color}2e;border-bottom:2px solid ${color}">${selected}</span>`;
    cursor = span.end;
  }
  return html + escapeHtml(text.slice(cursor));
}

function compactTextWithOffsets(value) {
  let compact = "";
  const starts = [];
  const ends = [];
  for (let index = 0; index < value.length;) {
    const character = String.fromCodePoint(value.codePointAt(index));
    const nextIndex = index + character.length;
    const normalized = normalizeCategoryText(character).replace(/\s/gu, "");
    for (const normalizedCharacter of normalized) {
      compact += normalizedCharacter;
      starts.push(index);
      ends.push(nextIndex);
    }
    index = nextIndex;
  }
  return { compact, starts, ends };
}

function findCategoryHighlights(text, category) {
  if (!category || category === "-") return [];
  if (normalizeCategoryText(category) === "motoniveladoras e patrols") {
    return [...text.matchAll(/\b(?:motoniveladoras?|patrols?)\b/giu)].map((match) => ({
      field: "Categoria",
      start: match.index,
      end: match.index + match[0].length,
    }));
  }
  if (normalizeCategoryText(category) === "pa carregadeira") {
    const matches = [];
    const addMatch = (start, end) => {
      if (!matches.some((match) => start < match.end && end > match.start)) {
        matches.push({ field: "Categoria", start, end });
      }
    };
    for (const match of text.matchAll(/\bp[áa]\s*carregadeiras?\b/giu)) {
      addMatch(match.index, match.index + match[0].length);
    }
    for (const match of text.matchAll(/\bpa\b/giu)) {
      addMatch(match.index, match.index + match[0].length);
    }
    for (const match of text.matchAll(/\bmini(carregadeiras?)\b/giu)) {
      const innerStart = match.index + match[0].length - match[1].length;
      addMatch(innerStart, innerStart + match[1].length);
    }
    for (const match of text.matchAll(/\b(?:carregadeiras?|carregador(?:es)?)\b/giu)) {
      addMatch(match.index, match.index + match[0].length);
    }
    return matches.sort((a, b) => a.start - b.start);
  }
  const needle = normalizeCategoryText(category).replace(/\s/gu, "");
  if (!needle) return [];
  const indexedText = compactTextWithOffsets(text);
  const matches = [];
  let searchFrom = 0;
  while (searchFrom < indexedText.compact.length) {
    const compactStart = indexedText.compact.indexOf(needle, searchFrom);
    if (compactStart < 0) break;
    const compactEnd = compactStart + needle.length - 1;
    matches.push({
      field: "Categoria",
      start: indexedText.starts[compactStart],
      end: indexedText.ends[compactEnd],
    });
    searchFrom = compactEnd + 1;
  }
  return matches;
}

function findUsageStateHighlights(text, usageState) {
  const normalizedState = normalizeCategoryText((usageState || "").trim());
  let expression;
  if (/^nov[oa]s?$/u.test(normalizedState)) {
    expression = /\bnov[oa]s?\b/giu;
  } else if (/^usad[oa]s?$/u.test(normalizedState)) {
    expression = /\busad[oa]s?\b/giu;
  } else {
    return [];
  }
  return [...text.matchAll(expression)].map((match) => ({
    field: "Estado de uso",
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function findVinYearCodeHighlight(text) {
  const analysis = vinYearAnalysis();
  if (!analysis) return [];
  const currentYear = (state.record.Ano || "").trim();
  const pending = currentYear === "";
  const accepted = currentYear === String(analysis.year);
  if (!pending && !accepted) return [];
  const chassis = (state.record.Chassi || "").trim();
  let chassisStart = -1;
  const savedSpan = state.spans.Chassi;
  if (
    savedSpan &&
    Number.isInteger(savedSpan.start) &&
    Number.isInteger(savedSpan.end) &&
    savedSpan.end - savedSpan.start >= 10
  ) {
    chassisStart = savedSpan.start;
  } else {
    chassisStart = text.toLocaleLowerCase("pt-BR").indexOf(
      chassis.toLocaleLowerCase("pt-BR"),
    );
  }
  if (chassisStart < 0) return [];
  return [{
    field: "Ano",
    start: chassisStart + 9,
    end: chassisStart + 10,
    className: pending
      ? "vin-year-code-highlight pulsing"
      : "vin-year-code-highlight",
  }];
}

function splitHighlightAroundBlocks(field, span, blocks) {
  let pieces = [{ field, start: span.start, end: span.end }];
  for (const block of blocks) {
    pieces = pieces.flatMap((piece) => {
      if (piece.end <= block.start || piece.start >= block.end) return [piece];
      const result = [];
      if (piece.start < block.start) {
        result.push({ ...piece, end: block.start });
      }
      if (piece.end > block.end) {
        result.push({ ...piece, start: block.end });
      }
      return result;
    });
  }
  return pieces;
}

function inferMissingSpans(targetFields = state.fields) {
  const text = state.record.descricao_produto || "";
  const normalizedText = text.toLocaleLowerCase("pt-BR");
  const occupied = Object.values(state.spans);
  const candidates = targetFields
    .filter((field) => field !== "Categoria")
    .filter((field) => !state.spans[field])
    .map((field) => ({ field, value: (state.record[field] || "").trim() }))
    .filter(({ value }) => value && value !== "-" && value.length > 1)
    .sort((a, b) => b.value.length - a.value.length);

  for (const { field, value } of candidates) {
    const normalizedValue = value.toLocaleLowerCase("pt-BR");
    let start = normalizedText.indexOf(normalizedValue);
    while (start >= 0) {
      const end = start + value.length;
      const overlaps = occupied.some((span) => start < span.end && end > span.start);
      if (!overlaps) {
        const span = { start, end };
        state.spans[field] = span;
        occupied.push(span);
        break;
      }
      start = normalizedText.indexOf(normalizedValue, start + 1);
    }
  }
}

function renderDescription() {
  hideHighlightTooltip();
  const text = state.record.descricao_produto || "";
  const categoryHighlights = findCategoryHighlights(text, state.record.Categoria || "");
  const usageStateHighlights = findUsageStateHighlights(
    text,
    state.record["Estado de uso"] || "",
  ).filter((usageSpan) =>
    !categoryHighlights.some((categorySpan) =>
      usageSpan.start < categorySpan.end && usageSpan.end > categorySpan.start
    )
  );
  const vinYearCodeHighlight = findVinYearCodeHighlight(text);
  const automaticHighlights = [
    ...categoryHighlights,
    ...usageStateHighlights,
    ...vinYearCodeHighlight,
  ];
  const manualHighlights = Object.entries(state.spans)
    .filter(([field]) => field !== "Categoria")
    .flatMap(([field, span]) =>
      splitHighlightAroundBlocks(field, span, automaticHighlights)
    );
  description.innerHTML = buildHighlightedHtml(
    text,
    {},
    [...manualHighlights, ...automaticHighlights],
  );
  description.contentEditable = "false";
}

function hideHighlightTooltip() {
  $("#highlight-tooltip").classList.add("hidden");
}

function showHighlightTooltip(highlight) {
  const field = highlight.dataset.field;
  if (!field) return;
  const label = FIELD_LABELS[field] || field;
  const value = state.record[field] || "Campo vazio";
  const tooltip = $("#highlight-tooltip");
  tooltip.textContent = `${label}: ${value}`;
  tooltip.classList.remove("hidden");

  const targetBounds = highlight.getBoundingClientRect();
  const tooltipBounds = tooltip.getBoundingClientRect();
  const margin = 8;
  const left = Math.max(
    margin,
    Math.min(
      targetBounds.left + (targetBounds.width - tooltipBounds.width) / 2,
      window.innerWidth - tooltipBounds.width - margin,
    ),
  );
  const preferredTop = targetBounds.top - tooltipBounds.height - margin;
  const top = preferredTop >= margin
    ? preferredTop
    : targetBounds.bottom + margin;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function updateChassisValidation(card, editor, value) {
  if (card.dataset.field !== "Chassi") return;
  const characterCount = Array.from(value || "").length;
  const invalid = characterCount > 0 && characterCount !== 17;
  card.classList.toggle("invalid-chassis", invalid);
  editor.setAttribute("aria-invalid", String(invalid));
  editor.title = characterCount === 0
    ? "Chassi vazio."
    : (invalid
      ? `O Chassi deve ter exatamente 17 caracteres. Tamanho atual: ${characterCount}.`
      : "Chassi com 17 caracteres.");
}

function vinYearAnalysis() {
  const chassis = (state.record.Chassi || "").trim().toLocaleUpperCase("pt-BR");
  if (chassis.length !== 17) return null;
  const rule = CHASSIS_PREFIX_RULES[chassis.slice(0, 3)];
  if (rule?.yearMode === "factory" || rule?.yearMode === "none") return null;
  const code = chassis[9];
  const codeIndex = VIN_YEAR_CODES.indexOf(code);
  if (codeIndex < 0) return null;

  const candidates = [1980 + codeIndex, 2010 + codeIndex]
    .filter((year) => year <= 2039);
  const emissionMatch = (state.record.data_emissao || "").match(/\b(?:19|20)\d{2}\b/u);
  const referenceYear = emissionMatch
    ? Number(emissionMatch[0])
    : new Date().getFullYear();
  const plausible = candidates.filter((year) => year <= referenceYear + 1);
  const year = plausible.length
    ? Math.max(...plausible)
    : Math.min(...candidates);
  return {
    year,
    code,
    prefix: chassis.slice(0, 3),
    partial: rule?.yearMode === "partial",
  };
}

function vinYearSuggestion() {
  if ((state.record.Ano || "").trim()) return null;
  return vinYearAnalysis();
}

function chassisSuggestionForField(field, includeFilled = false) {
  if (!includeFilled && (state.record[field] || "").trim()) return null;
  if (field === "Ano") {
    const year = includeFilled ? vinYearAnalysis() : vinYearSuggestion();
    if (!year) return null;
    return {
      value: String(year.year),
      title: chassisSuggestionReason(
        year.prefix,
        `${year.partial ? "Estimativa" : "Décimo caractere"} do Chassi: ${year.code}. Clique para usar ${year.year}.${year.partial ? " Confirme, pois este prefixo possui decodificação parcial do ano." : ""}`,
      ),
    };
  }

  const chassis = (state.record.Chassi || "").trim().toLocaleUpperCase("pt-BR");
  if (chassis.length !== 17) return null;
  const prefix = chassis.slice(0, 3);
  const rule = CHASSIS_PREFIX_RULES[prefix];
  if (!rule) return null;
  if (field === "Marca" && rule.brand) {
    return {
      value: rule.brand,
      title: chassisSuggestionReason(
        prefix,
        `Fabricante sugerido pelo prefixo ${prefix}.`,
      ),
    };
  }
  const modelCode = rule.modelLength
    ? chassis.slice(3, 3 + rule.modelLength)
    : "";
  if (field === "Modelo" && modelCode) {
    return {
      value: modelCode,
      title: chassisSuggestionReason(
        prefix,
        `Código de modelo obtido das posições 4 a ${3 + rule.modelLength} do PIN. Confirme a grafia no equipamento.`,
      ),
    };
  }
  if (
    field === "Categoria" &&
    rule.category &&
    modelCode.startsWith(rule.category[0])
  ) {
    return {
      value: rule.category[1],
      title: chassisSuggestionReason(
        prefix,
        `Categoria inferida do código de modelo ${rule.category[0]} para o prefixo ${prefix}.`,
      ),
    };
  }
  if (field === "Numero_serie" && Number.isInteger(rule.serialStart)) {
    const value = chassis.slice(rule.serialStart);
    return {
      value,
      title: chassisSuggestionReason(
        prefix,
        prefix === "CAT"
          ? "Número de série Caterpillar: posições 10 a 17 (oito caracteres)."
          : `Número de série sugerido a partir das posições ${rule.serialStart + 1} a 17.`,
      ),
    };
  }
  return null;
}

function normalizeChassisComparison(value) {
  return String(value || "").trim().toLocaleUpperCase("pt-BR");
}

function fieldHasChassisMismatch(field) {
  if (!state.checkMode) return false;
  const suggestion = chassisSuggestionForField(field, true);
  if (!suggestion) return false;
  return normalizeChassisComparison(state.record[field]) !==
    normalizeChassisComparison(suggestion.value);
}

function displayedChassisSuggestionForField(field) {
  const suggestion = chassisSuggestionForField(field);
  if (suggestion) return suggestion;
  return fieldHasChassisMismatch(field)
    ? chassisSuggestionForField(field, true)
    : null;
}

function acceptChassisSuggestion(field, value = displayedChassisSuggestionForField(field)?.value) {
  if (!field || value === undefined || value === null || value === "") return;
  state.record[field] = String(value);
  delete state.spans[field];
  renderDescription();
  renderFields();
  markDirty();
  showToast(`${FIELD_LABELS[field] || field} aplicado a partir do código do Chassi.`);
}

function returnVinYearSuggestion() {
  const suggestion = vinYearSuggestion();
  if (!suggestion) return;
  state.record.Ano = "";
  delete state.spans.Ano;
  renderDescription();
  renderFields();
  markDirty();
  showToast("A sugestão de Ano continua disponível.");
}

function updateChassisSuggestionsUI() {
  for (const field of state.fields) {
    const card = [...document.querySelectorAll(".field-card")]
      .find((candidate) => candidate.dataset.field === field);
    const control = card?.querySelector(".field-control");
    if (!control) continue;
    control.querySelector(".chassis-suggestion")?.remove();
    const suggestion = displayedChassisSuggestionForField(field);
    card.classList.toggle("has-chassis-suggestion", Boolean(suggestion));
    card.classList.toggle("has-chassis-mismatch", fieldHasChassisMismatch(field));
    if (!suggestion) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chassis-suggestion";
    button.dataset.field = field;
    button.dataset.value = suggestion.value;
    button.textContent = `Sugestão: ${suggestion.value}`;
    button.title = suggestion.title;
    control.appendChild(button);
  }
}

function renderFields() {
  fieldsContainer.innerHTML = "";
  for (const [fieldIndex, field] of state.fields.entries()) {
    const card = document.createElement("div");
    card.className = "field-card" + (state.activeField === field ? " active" : "");
    card.style.setProperty("--field-color", FIELD_COLORS[field]);
    card.dataset.field = field;
    let control;
    if (field === "Categoria") {
      const currentValue = state.record[field] || "";
      const normalizedFilter = normalizeCategoryText(state.categoryFilter);
      const values = normalizedFilter
        ? CATEGORY_OPTIONS.filter((value) =>
          normalizeCategoryText(value).includes(normalizedFilter)
        )
        : (CATEGORY_OPTIONS.includes(currentValue) || !currentValue
          ? CATEGORY_OPTIONS
          : [currentValue, ...CATEGORY_OPTIONS]);
      const options = normalizedFilter
        ? [
          `<option value="" selected disabled>${values.length ? `Filtro: ${escapeHtml(state.categoryFilter)}` : "Nenhuma categoria encontrada"}</option>`,
          ...values.map((value) =>
            `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`
          ),
        ].join("")
        : [
          `<option value="" ${currentValue === "" ? "selected" : ""}>Campo vazio</option>`,
          ...values.map((value) =>
            `<option value="${escapeAttribute(value)}" ${currentValue === value ? "selected" : ""}>${escapeHtml(value)}</option>`
          ),
        ].join("");
      control = `<select aria-label="Categoria">${options}</select>`;
    } else {
      control = `<input type="text" value="${escapeAttribute(state.record[field] || "")}" aria-label="${escapeAttribute(FIELD_LABELS[field] || field)}">`;
    }
    const suggestion = displayedChassisSuggestionForField(field);
    card.classList.toggle("has-chassis-suggestion", Boolean(suggestion));
    card.classList.toggle("has-chassis-mismatch", fieldHasChassisMismatch(field));
    const suggestionControl = suggestion
      ? `<button type="button" class="chassis-suggestion" data-field="${escapeAttribute(field)}" data-value="${escapeAttribute(suggestion.value)}" title="${escapeAttribute(suggestion.title)}">Sugestão: ${escapeHtml(suggestion.value)}</button>`
      : "";
    card.innerHTML = `
      <span class="swatch"></span>
      <label><kbd>${fieldIndex + 1}</kbd>${escapeHtml(FIELD_LABELS[field] || field)}</label>
      <div class="field-control">${control}${suggestionControl}</div>
    `;
    const editor = card.querySelector("input, select");
    updateChassisValidation(card, editor, state.record[field] || "");
    card.addEventListener("click", (event) => {
      if (event.target.closest(".chassis-suggestion")) return;
      if (!event.shiftKey || field === "Categoria") return;
      const value = (state.record[field] || "").trim();
      if (!value) {
        showToast(`${FIELD_LABELS[field] || field} está vazio; não há conteúdo para pesquisar.`);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openSearch(value);
    }, true);
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      activateField(field, false);
      openFieldContextMenu(field, event.clientX, event.clientY);
    });
    card.addEventListener("dblclick", (event) => {
      const suggestion = displayedChassisSuggestionForField(field);
      if (!suggestion) return;
      event.preventDefault();
      acceptChassisSuggestion(field, suggestion.value);
    });
    card.addEventListener("click", (event) => {
      if (event.target.closest("input, select, button")) return;
      if (state.activeField === field) {
        deactivateField();
        return;
      }
      if (field === "Categoria") {
        state.categoryFilter = "";
        renderFields();
        activateField(field, false);
        focusCategoryDropdown();
      } else {
        activateField(field, true);
      }
    });
    editor.addEventListener("click", (event) => {
      event.stopPropagation();
      if (editor instanceof HTMLInputElement) editor.select();
    });
    editor.addEventListener("focus", () => {
      activateField(field, false);
      if (editor instanceof HTMLInputElement) editor.select();
    });
    editor.addEventListener("input", () => {
      if (field === "Categoria") state.categoryFilter = "";
      state.record[field] = editor.value;
      updateChassisValidation(card, editor, editor.value);
      updateChassisSuggestionsUI();
      // Um valor digitado manualmente deixa de representar necessariamente o
      // trecho antes selecionado.
      if (state.spans[field]) delete state.spans[field];
      renderDescription();
      syncActiveFieldUI();
      markDirty();
    });
    editor.addEventListener("keydown", (event) => {
      if (
        field === "Ano" &&
        editor instanceof HTMLInputElement &&
        event.key.toLocaleLowerCase("pt-BR") === "x" &&
        vinYearSuggestion()
      ) {
        event.preventDefault();
        event.stopPropagation();
        returnVinYearSuggestion();
        return;
      }
      if (
        editor instanceof HTMLSelectElement &&
        (event.code === "Digit1" || event.code === "Numpad1")
      ) {
        event.preventDefault();
        event.stopPropagation();
        deactivateField(true);
        return;
      }
      if (
        editor instanceof HTMLSelectElement &&
        /^\p{L}$/u.test(event.key) &&
        !event.ctrlKey && !event.altKey && !event.metaKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        state.categoryFilter += event.key;
        renderFields();
        activateField("Categoria", false);
        focusCategoryDropdown();
        return;
      }
      if (
        editor instanceof HTMLSelectElement &&
        event.key === "Backspace" &&
        state.categoryFilter
      ) {
        event.preventDefault();
        event.stopPropagation();
        state.categoryFilter = state.categoryFilter.slice(0, -1);
        renderFields();
        activateField("Categoria", false);
        focusCategoryDropdown();
        return;
      }
      if (
        editor instanceof HTMLSelectElement &&
        (event.key === "Backspace" || event.key === "Delete")
      ) {
        event.preventDefault();
        editor.value = "";
        state.record[field] = "";
        delete state.spans[field];
        renderDescription();
        syncActiveFieldUI();
        markDirty();
      }
    });
    fieldsContainer.appendChild(card);
  }
  syncActiveFieldUI();
}

fieldsContainer.addEventListener("click", (event) => {
  const suggestion = event.target.closest(".chassis-suggestion");
  if (!suggestion) return;
  event.preventDefault();
  event.stopPropagation();
  acceptChassisSuggestion(suggestion.dataset.field, suggestion.dataset.value);
});

$("#check-mode").addEventListener("change", (event) => {
  state.checkMode = event.target.checked;
  renderFields();
  showToast(state.checkMode
    ? "Modo checagem ativado: divergências com as sugestões estão em laranja."
    : "Modo checagem desativado.");
});

function syncActiveFieldUI() {
  document.querySelectorAll(".field-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.field === state.activeField);
  });
  $("#clear-field").disabled = !state.activeField;
  $("#reset-field").disabled =
    !state.activeField ||
    state.record[state.activeField] === state.originalRecord[state.activeField];
}

function activateField(field, focusDescription = true) {
  if (state.searchMode) setSearchMode(false);
  state.activeField = field;
  syncActiveFieldUI();
  if (focusDescription) description.focus();
}

function setSearchMode(active) {
  state.searchMode = active;
  document.querySelector(".fields-panel").classList.toggle("search-active", active);
  if (active && state.activeField) deactivateField(true);
}

function deactivateField(blurEditor = false) {
  const refreshCategory =
    state.activeField === "Categoria" && Boolean(state.categoryFilter);
  if (state.activeField === "Categoria") state.categoryFilter = "";
  state.activeField = null;
  syncActiveFieldUI();
  window.getSelection()?.removeAllRanges();
  if (blurEditor && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  if (refreshCategory) renderFields();
}

function closeFieldContextMenu() {
  $("#field-context-menu").classList.add("hidden");
}

function openFieldContextMenu(field, clientX, clientY) {
  const menu = $("#field-context-menu");
  $("#context-field-name").textContent = FIELD_LABELS[field] || field;
  $("#context-reset").disabled =
    state.record[field] === state.originalRecord[field];
  $("#context-clear").disabled = !state.record[field];
  menu.classList.remove("hidden");

  const margin = 8;
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(margin, Math.min(clientX, window.innerWidth - bounds.width - margin))}px`;
  menu.style.top = `${Math.max(margin, Math.min(clientY, window.innerHeight - bounds.height - margin))}px`;
}

function clearActiveField() {
  if (!state.activeField) return;
  state.record[state.activeField] = "";
  delete state.spans[state.activeField];
  renderDescription();
  renderFields();
  markDirty();
}

function resetActiveField() {
  if (!state.activeField) return;
  const field = state.activeField;
  state.record[field] = state.originalRecord[field] || "";
  delete state.spans[field];
  inferMissingSpans([field]);
  renderDescription();
  renderFields();
  markDirty();
  showToast(`${FIELD_LABELS[field] || field} restaurado para o valor original.`);
}

function renderSummary(summary) {
  state.total = summary.total;
  state.lastUnlocked = summary.ultimo_liberado;
  state.checkpointIndex = summary.indice_atual;
  state.checkpointAutomatic = summary.checkpoint_automatico;
  $("#counter").textContent = `Registro ${state.index + 1} de ${summary.total}`;
  $("#counter").classList.toggle("is-checkpoint", state.index === state.checkpointIndex);
  $("#checkpoint-label").textContent = `${state.checkpointAutomatic ? "Checkpoint automático" : "Checkpoint"}: registro ${state.checkpointIndex + 1}`;
  $("#progress-summary").textContent = `${summary.atencao} com atenção · ${summary.pendentes} sem marcador`;
  $("#progress-bar").style.width = `${summary.total ? ((state.index + 1) / summary.total) * 100 : 0}%`;
  $("#checkpoint-marker").style.left = `${summary.total ? ((state.checkpointIndex + 1) / summary.total) * 100 : 0}%`;
  $("#checkpoint-marker").title = `Checkpoint no registro ${state.checkpointIndex + 1}`;
  $("#previous").disabled = state.index <= 0;
  $("#next").disabled = state.index >= summary.total - 1;
  $("#first").disabled = state.index <= 0;
  $("#last").disabled = !state.lastUnlocked || state.index >= summary.total - 1;
  $("#last").title = state.lastUnlocked
    ? "Ir diretamente ao último registro"
    : "Disponível depois que você chegar manualmente ao último registro";
  $("#return-checkpoint").disabled = state.index === state.checkpointIndex;
  $("#return-checkpoint").title = state.index === state.checkpointIndex
    ? "Você já está no checkpoint"
    : `Voltar ao registro ${state.checkpointIndex + 1}`;
  $("#checkpoint").classList.toggle("automatic", state.checkpointAutomatic);
  $("#checkpoint").title = state.checkpointAutomatic
    ? "Modo automático ativo. Clique uma vez para fixar no registro atual."
    : "Clique para fixar; clique duas vezes para ativar o acompanhamento automático.";
}

function animateCheckpoint() {
  const counter = $("#counter");
  const bubble = $("#checkpoint-bubble");
  const action = state.mode === "correcao" ? "corrigido" : "revisado";
  bubble.textContent = `Último dado ${action}: ${state.index + 1}`;

  counter.classList.remove("checkpoint-flash");
  bubble.classList.remove("visible");
  // Reinicia as animações mesmo quando o mesmo checkpoint é confirmado duas vezes.
  void counter.offsetWidth;
  counter.classList.add("checkpoint-flash");
  bubble.classList.add("visible");
  clearTimeout(animateCheckpoint.timer);
  animateCheckpoint.timer = setTimeout(() => {
    counter.classList.remove("checkpoint-flash");
    bubble.classList.remove("visible");
  }, 2900);
}

function renderAttentionState() {
  const attention = state.status === "atencao";
  document.querySelector(".description-panel").classList.toggle("attention", attention);
  document.querySelector(".fields-panel").classList.toggle("attention", attention);
  $("#attention").textContent = attention ? "Remover atenção" : "Despender atenção";
  $("#attention").classList.toggle("active", attention);
}

function closeComments() {
  clearTimeout(state.commentsCloseTimer);
  state.commentsPinned = false;
  const popover = $("#comment-popover");
  if (popover.classList.contains("hidden")) return;
  clearTimeout(state.commentsAnimationTimer);
  popover.classList.remove("open");
  popover.classList.add("closing");
  state.commentsAnimationTimer = setTimeout(() => {
    popover.classList.add("hidden");
    popover.classList.remove("closing");
  }, 115);
}

function openComments({ focusInput = true, pinned = false } = {}) {
  closeCriteria();
  clearTimeout(state.commentsCloseTimer);
  clearTimeout(state.commentsAnimationTimer);
  state.commentsPinned = pinned;
  renderComments();
  const popover = $("#comment-popover");
  const alreadyOpen =
    !popover.classList.contains("hidden") &&
    !popover.classList.contains("closing");
  if (alreadyOpen) {
    if (focusInput) $("#comment-text").focus();
    return;
  }
  popover.classList.remove("hidden", "closing", "open");
  void popover.offsetWidth;
  popover.classList.add("open");
  if (focusInput) $("#comment-text").focus();
}

function scheduleCommentsClose() {
  clearTimeout(state.commentsCloseTimer);
  state.commentsCloseTimer = setTimeout(() => {
    const hoveringIcon = $("#review-comment-indicator").matches(":hover");
    const hoveringPopover = $("#comment-popover").matches(":hover");
    if (!state.commentsPinned && !hoveringIcon && !hoveringPopover) closeComments();
  }, 140);
}

function renderComments() {
  const list = $("#comment-list");
  list.replaceChildren();
  if (state.comments.length === 0) {
    const empty = document.createElement("p");
    empty.className = "comment-empty";
    empty.textContent = "Nenhum comentário neste dado.";
    list.appendChild(empty);
  } else {
    state.comments.forEach((comment, index) => {
      const item = document.createElement("article");
      item.className = "comment-item";
      const content = document.createElement("div");
      content.className = "comment-content";
      const author = document.createElement("span");
      author.className = `comment-author ${comment.autor}`;
      author.textContent = {
        corretor: "Corretor",
        revisor: "Revisor",
        nao_identificado: "Sem identificação",
      }[comment.autor] || "Sem identificação";
      const text = document.createElement("p");
      text.textContent = comment.texto;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "comment-remove";
      remove.textContent = "Remover";
      remove.addEventListener("click", async () => {
        state.comments.splice(index, 1);
        renderComments();
        await saveRecord();
        showToast("Comentário removido.");
      });
      content.append(author, text);
      item.append(content, remove);
      list.appendChild(item);
    });
  }

  const correctionMode = state.mode === "correcao";
  $("#comment-form").classList.remove("hidden");
  $("#comment-button").classList.toggle("hidden", !correctionMode);
  $("#comment-button").textContent = state.comments.length
    ? `Comentários (${state.comments.length})`
    : "Comentários";
  $("#review-comment-indicator").classList.toggle(
    "hidden",
    state.comments.length === 0,
  );
}

function closeCriteria() {
  clearTimeout(state.criteriaCloseTimer);
  state.criteriaPinned = false;
  const popover = $("#criteria-popover");
  if (popover.classList.contains("hidden")) return;
  clearTimeout(state.criteriaAnimationTimer);
  popover.classList.remove("open");
  popover.classList.add("closing");
  state.criteriaAnimationTimer = setTimeout(() => {
    popover.classList.add("hidden");
    popover.classList.remove("closing");
  }, 115);
}

function openCriteria({ focusInput = true, pinned = false } = {}) {
  closeComments();
  clearTimeout(state.criteriaCloseTimer);
  clearTimeout(state.criteriaAnimationTimer);
  state.criteriaPinned = pinned;
  renderCriteria();
  const popover = $("#criteria-popover");
  const alreadyOpen =
    !popover.classList.contains("hidden") &&
    !popover.classList.contains("closing");
  if (alreadyOpen) {
    if (focusInput) $("#criteria-text").focus();
    return;
  }
  popover.classList.remove("hidden", "closing", "open");
  void popover.offsetWidth;
  popover.classList.add("open");
  if (focusInput) $("#criteria-text").focus();
}

function scheduleCriteriaClose() {
  clearTimeout(state.criteriaCloseTimer);
  state.criteriaCloseTimer = setTimeout(() => {
    const hoveringButton = $("#criteria-button").matches(":hover");
    const hoveringPopover = $("#criteria-popover").matches(":hover");
    if (!state.criteriaPinned && !hoveringButton && !hoveringPopover) closeCriteria();
  }, 140);
}

function renderCriteria() {
  const list = $("#criteria-list");
  list.replaceChildren();
  if (state.criteria.length === 0) {
    const empty = document.createElement("p");
    empty.className = "comment-empty";
    empty.textContent = "Nenhum critério registrado neste dado.";
    list.appendChild(empty);
  } else {
    state.criteria.forEach((criterion, index) => {
      const item = document.createElement("article");
      item.className = "comment-item criterion-item";
      const content = document.createElement("div");
      content.className = "comment-content";
      const number = document.createElement("strong");
      number.className = "criterion-number";
      number.textContent = `${index + 1}.`;
      const author = document.createElement("span");
      author.className = `comment-author ${criterion.autor}`;
      author.textContent = {
        corretor: "Corretor",
        revisor: "Revisor",
        nao_identificado: "Sem identificação",
      }[criterion.autor] || "Sem identificação";
      const text = document.createElement("p");
      text.textContent = criterion.texto;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "comment-remove";
      remove.textContent = "Remover";
      remove.addEventListener("click", async () => {
        state.criteria.splice(index, 1);
        renderCriteria();
        await saveRecord();
        showToast("Critério removido.");
      });
      content.append(number, author, text);
      item.append(content, remove);
      list.appendChild(item);
    });
  }
  const count = state.criteria.length;
  $("#criteria-button").textContent = count ? `☷ ${count}` : "☷";
  $("#criteria-button").title = count
    ? `${count} critério${count === 1 ? "" : "s"} utilizado${count === 1 ? "" : "s"}`
    : "Ver ou adicionar critérios";
}

function renderRecord(data) {
  state.record = data.registro;
  state.originalRecord = data.registro_original;
  state.spans = data.estado.spans || {};
  state.comments = data.estado.comentarios || [];
  state.criteria = data.estado.criterios || [];
  state.status = data.estado.status;
  state.activeField = null;
  state.categoryFilter = "";
  setSearchMode(false);
  state.dirty = false;
  state.sessionPositions[state.mode] = data.index;
  inferMissingSpans();
  renderDescription();
  renderFields();
  renderSummary(data.resumo);
  const detailParts = ["data_emissao", "unidade_comercial", "valor_unitario_comercial", "ncm_produto"]
    .filter((key) => state.record[key])
    .map((key) => `${key.replaceAll("_", " ")}: ${state.record[key]}`);
  $("#record-details").textContent = detailParts.join("  ·  ");
  renderAttentionState();
  closeFieldContextMenu();
  closeComments();
  closeCriteria();
  renderComments();
  renderCriteria();
  setSaveState("Tudo salvo");
}

async function loadRecord(index) {
  try {
    setSaveState("Carregando…");
    const data = await request(`/api/registro?indice=${index}&modo=${state.mode}`);
    state.index = index;
    renderRecord(data);
    return true;
  } catch (error) {
    showToast(error.message, true);
    setSaveState("Erro ao carregar");
    return false;
  }
}

function markDirty() {
  state.dirty = true;
  setSaveState("Alterações pendentes…");
  clearTimeout(state.inputTimer);
  state.inputTimer = setTimeout(() => saveRecord(), 550);
}

async function saveRecord(status = state.status) {
  clearTimeout(state.inputTimer);
  state.status = status;
  if (state.saving) {
    state.dirty = true;
    return;
  }
  state.saving = true;
  state.dirty = false;
  setSaveState("Salvando…");
  try {
    const data = await request("/api/registro", {
      method: "POST",
      body: JSON.stringify({
        index: state.index,
        registro: state.record,
        spans: state.spans,
        comentarios: state.comments,
        criterios: state.criteria,
        status: state.status,
        modo: state.mode,
      }),
    });
    // Se outra ação ocorreu durante esta requisição, preserve o estado mais
    // recente; ele será enviado logo abaixo pelo salvamento encadeado.
    if (!state.dirty) state.status = data.estado.status;
    renderSummary(data.resumo);
    setSaveState("Tudo salvo");
  } catch (error) {
    state.dirty = true;
    showToast(error.message, true);
    setSaveState("Falha ao salvar");
  } finally {
    state.saving = false;
    if (state.dirty) saveRecord();
  }
}

async function saveProgress(
  index,
  reachedLastManually = false,
  setCheckpoint = false,
  checkpointMode = null,
) {
  const summary = await request("/api/progresso", {
    method: "POST",
    body: JSON.stringify({
      index,
      modo: state.mode,
      ultimo_alcancado_manualmente: reachedLastManually,
      definir_checkpoint: setCheckpoint,
      modo_checkpoint: checkpointMode,
    }),
  });
  renderSummary(summary);
}

async function goToIndex(target, reachedLastManually = false) {
  if (state.navigating) return;
  state.navigating = true;
  try {
    if (state.dirty || state.saving) {
      await saveRecord();
      while (state.saving) await new Promise((resolve) => setTimeout(resolve, 30));
    }
    target = Math.max(0, Math.min(state.total - 1, target));
    if (target !== state.index) {
      const loaded = await loadRecord(target);
      // A posição vista fica apenas nesta sessão. Persistimos durante a
      // navegação somente o desbloqueio conquistado ao alcançar o último item.
      if (loaded && (reachedLastManually || state.checkpointAutomatic)) {
        await saveProgress(target, reachedLastManually, false);
      }
    }
  } catch (error) {
    showToast(`Não foi possível salvar a posição: ${error.message}`, true);
  } finally {
    state.navigating = false;
  }
}

async function navigate(offset) {
  const target = Math.max(0, Math.min(state.total - 1, state.index + offset));
  const reachedLastManually = offset > 0 && target === state.total - 1;
  await goToIndex(target, reachedLastManually);
}

function selectionOffsets(root, range) {
  const before = range.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}

function applySelection() {
  if (!state.activeField && !state.searchMode) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (!description.contains(range.commonAncestorContainer)) return;
  const offsets = selectionOffsets(description, range);
  const text = descriptionText();
  if (offsets.start >= offsets.end) return;

  if (state.searchMode) {
    const selectedText = text.slice(offsets.start, offsets.end);
    selection.removeAllRanges();
    setSearchMode(false);
    openSearch(selectedText, "Selecione um trecho da descrição para pesquisar.");
    return;
  }

  if (state.activeField === "Categoria") {
    selection.removeAllRanges();
    deactivateField();
    showToast("A Categoria deve ser escolhida na lista, sem seleção na descrição.");
    return;
  }

  // Um trecho pertence a um único campo; seleções sobrepostas anteriores são
  // removidas para manter o realce e os offsets determinísticos.
  for (const [field, span] of Object.entries(state.spans)) {
    if (field !== state.activeField && offsets.start < span.end && offsets.end > span.start) {
      delete state.spans[field];
    }
  }
  state.spans[state.activeField] = offsets;
  state.record[state.activeField] = text.slice(offsets.start, offsets.end);
  state.record.descricao_produto = text;
  selection.removeAllRanges();
  renderDescription();
  renderFields();
  markDirty();
}

description.addEventListener("mouseup", applySelection);
description.addEventListener("mouseover", (event) => {
  const highlight = event.target.closest?.(".highlight");
  if (highlight && description.contains(highlight)) showHighlightTooltip(highlight);
});
description.addEventListener("mouseout", (event) => {
  const highlight = event.target.closest?.(".highlight");
  if (!highlight) return;
  const nextHighlight = event.relatedTarget?.closest?.(".highlight");
  if (nextHighlight === highlight) return;
  hideHighlightTooltip();
});
description.addEventListener("keyup", (event) => {
  if (event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) applySelection();
});
description.addEventListener("beforeinput", (event) => event.preventDefault());
description.addEventListener("paste", (event) => event.preventDefault());
description.addEventListener("drop", (event) => event.preventDefault());
window.addEventListener("scroll", hideHighlightTooltip, true);
window.addEventListener("resize", hideHighlightTooltip);

$("#clear-field").addEventListener("click", () => {
  clearActiveField();
});

$("#reset-field").addEventListener("click", () => {
  resetActiveField();
});

$("#context-clear").addEventListener("click", () => {
  clearActiveField();
  closeFieldContextMenu();
});
$("#context-reset").addEventListener("click", () => {
  resetActiveField();
  closeFieldContextMenu();
});
$("#field-context-menu").addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", closeFieldContextMenu);
window.addEventListener("blur", closeFieldContextMenu);
window.addEventListener("resize", closeFieldContextMenu);
window.addEventListener("scroll", closeFieldContextMenu, true);

$("#previous").addEventListener("click", () => navigate(-1));
$("#next").addEventListener("click", () => navigate(1));
$("#first").addEventListener("click", () => goToIndex(0));
$("#last").addEventListener("click", () => {
  if (state.lastUnlocked) goToIndex(state.total - 1);
});
$("#return-checkpoint").addEventListener("click", () => {
  if (state.index !== state.checkpointIndex) goToIndex(state.checkpointIndex);
});
async function confirmCheckpoint(checkpointMode) {
  try {
    if (state.dirty || state.saving) {
      await saveRecord();
      while (state.saving) await new Promise((resolve) => setTimeout(resolve, 30));
    }
    await saveProgress(state.index, false, true, checkpointMode);
    animateCheckpoint();
    const label = state.mode === "correcao" ? "Correção" : "Revisão";
    showToast(
      checkpointMode === "automatico"
        ? `Checkpoint automático de ${label.toLowerCase()} ativado no registro ${state.index + 1}.`
        : `${label} fixada no registro ${state.index + 1}.`,
    );
  } catch (error) {
    showToast(`Não foi possível salvar o checkpoint: ${error.message}`, true);
  }
}

let checkpointClickTimer;
$("#checkpoint").addEventListener("click", (event) => {
  if (event.detail !== 1) return;
  clearTimeout(checkpointClickTimer);
  checkpointClickTimer = setTimeout(() => confirmCheckpoint("fixo"), 260);
});
$("#checkpoint").addEventListener("dblclick", (event) => {
  event.preventDefault();
  clearTimeout(checkpointClickTimer);
  confirmCheckpoint("automatico");
});

document.addEventListener("keydown", (event) => {
  if (workspace.classList.contains("hidden") || event.repeat) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  if (event.key === "Escape" && !$("#field-context-menu").classList.contains("hidden")) {
    event.preventDefault();
    closeFieldContextMenu();
    return;
  }
  if (event.key === "Escape" && !$("#comment-popover").classList.contains("hidden")) {
    event.preventDefault();
    closeComments();
    return;
  }
  if (event.key === "Escape" && !$("#criteria-popover").classList.contains("hidden")) {
    event.preventDefault();
    closeCriteria();
    return;
  }
  if (event.key === "Escape" && state.activeField) {
    event.preventDefault();
    deactivateField(true);
    return;
  }
  if (event.key === "Escape" && state.searchMode) {
    event.preventDefault();
    setSearchMode(false);
    return;
  }

  const target = event.target;
  const digitMatch = event.code.match(/^(?:Digit|Numpad)([1-8])$/);
  const digitShortcutBlocked =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable;
  if (
    event.key.toLocaleLowerCase("pt-BR") === "x" &&
    state.activeField === "Ano" &&
    vinYearSuggestion()
  ) {
    event.preventDefault();
    returnVinYearSuggestion();
    return;
  }
  if (
    (event.code === "Digit9" || event.code === "Numpad9") &&
    !digitShortcutBlocked
  ) {
    event.preventDefault();
    setSearchMode(!state.searchMode);
    showToast(state.searchMode ? "Pesquisa por seleção ativada." : "Pesquisa por seleção desativada.");
    return;
  }
  if (digitMatch && !digitShortcutBlocked) {
    event.preventDefault();
    const field = state.fields[Number(digitMatch[1]) - 1];
    if (!field) return;
    if (state.activeField === field) {
      deactivateField(true);
      return;
    }
    if (state.activeField === "Categoria") {
      state.categoryFilter = "";
      renderFields();
    }
    if (field === "Categoria") {
      state.categoryFilter = "";
      renderFields();
      activateField(field, false);
      focusCategoryDropdown();
    } else {
      // Mantém o foco fora dos editores para permitir vários atalhos numéricos
      // em sequência; o clique seguinte na descrição fará a seleção do trecho.
      activateField(field, false);
    }
    return;
  }

  const isEditing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable;
  if (isEditing) return;
  // Enter e Espaço preservam a ação nativa quando um botão está focado.
  if (
    target instanceof HTMLButtonElement &&
    (event.key === "Enter" || event.code === "NumpadEnter" || event.key === " ")
  ) return;

  if (
    ["ArrowRight", " ", "Enter"].includes(event.key) ||
    event.code === "NumpadEnter"
  ) {
    event.preventDefault();
    navigate(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    navigate(-1);
  }
});

$("#attention").addEventListener("click", async () => {
  const adding = state.status !== "atencao";
  state.status = adding ? "atencao" : "pendente";
  renderAttentionState();
  await saveRecord(state.status);
  showToast(adding ? "Atenção marcada para este registro." : "Marcador de atenção removido.");
});

$("#comment-button").addEventListener("click", (event) => {
  event.stopPropagation();
  openComments({ focusInput: true, pinned: true });
});
$("#review-comment-indicator").addEventListener("click", (event) => {
  event.stopPropagation();
  openComments({ focusInput: true, pinned: true });
});
$("#review-comment-indicator").addEventListener("mouseenter", () => {
  if (!state.commentsPinned) openComments({ focusInput: false, pinned: false });
});
$("#review-comment-indicator").addEventListener("mouseleave", scheduleCommentsClose);
$("#comment-popover").addEventListener("mouseenter", () => {
  clearTimeout(state.commentsCloseTimer);
});
$("#comment-popover").addEventListener("mouseleave", scheduleCommentsClose);
$("#close-comments").addEventListener("click", closeComments);
$("#comment-popover").addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", (event) => {
  if (!$("#comment-popover").contains(event.target)) closeComments();
});
$("#comment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#comment-text");
  const comment = input.value.trim();
  if (!comment) {
    showToast("Digite um comentário antes de adicionar.");
    return;
  }
  state.comments.push({
    texto: comment,
    autor: state.mode === "correcao" ? "corretor" : "revisor",
  });
  input.value = "";
  renderComments();
  await saveRecord();
  showToast("Comentário adicionado.");
});

$("#criteria-button").addEventListener("click", (event) => {
  event.stopPropagation();
  openCriteria({ focusInput: true, pinned: true });
});
$("#criteria-button").addEventListener("mouseenter", () => {
  if (!state.criteriaPinned) openCriteria({ focusInput: false, pinned: false });
});
$("#criteria-button").addEventListener("mouseleave", scheduleCriteriaClose);
$("#criteria-popover").addEventListener("mouseenter", () => {
  clearTimeout(state.criteriaCloseTimer);
});
$("#criteria-popover").addEventListener("mouseleave", scheduleCriteriaClose);
$("#close-criteria").addEventListener("click", closeCriteria);
$("#criteria-popover").addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", (event) => {
  if (!$("#criteria-popover").contains(event.target)) closeCriteria();
});
$("#criteria-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#criteria-text");
  const criterion = input.value.trim();
  if (!criterion) {
    showToast("Digite um critério antes de adicionar.");
    return;
  }
  state.criteria.push({
    texto: criterion,
    autor: state.mode === "correcao" ? "corretor" : "revisor",
  });
  input.value = "";
  renderCriteria();
  await saveRecord();
  showToast("Critério adicionado.");
});

async function setMode(mode) {
  try {
    const summary = await request(`/api/resumo?modo=${mode}`);
    state.mode = mode;
    state.total = summary.total;
    state.fields = summary.campos;
    const sessionIndex = state.sessionPositions[mode];
    const returnIndex = sessionIndex === null ? summary.indice_atual : sessionIndex;
    state.index = Math.max(0, Math.min(returnIndex, summary.total - 1));
    modeScreen.classList.add("hidden");
    unavailableScreen.classList.add("hidden");
    workspace.classList.remove("hidden");
    const correction = mode === "correcao";
    $("#mode-title").textContent = correction ? "Modo de correção" : "Modo de revisão";
    $("#edit-hint").textContent = "Somente seleção";
    $("#checkpoint").textContent = correction ? "Corrigido até aqui" : "Revisado até aqui";
    $("#selection-instruction").textContent = correction
      ? "Selecione trechos da descrição e edite somente os campos extraídos. Quando o Chassi permitir uma decodificação segura, use os botões de sugestão ao lado dos campos vazios. As mudanças são salvas automaticamente no arquivo de correção."
      : "Revise os trechos e edite somente os campos extraídos do arquivo de correção. Quando o Chassi permitir uma decodificação segura, use os botões de sugestão ao lado dos campos vazios.";
    await loadRecord(state.index);
  } catch (error) {
    if (mode === "revisao") {
      modeScreen.classList.add("hidden");
      workspace.classList.add("hidden");
      unavailableScreen.classList.remove("hidden");
      $("#unavailable-message").textContent = error.message;
    } else {
      showToast(error.message, true);
    }
  }
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
$("#change-mode").addEventListener("click", async () => {
  if (state.dirty) await saveRecord();
  workspace.classList.add("hidden");
  modeScreen.classList.remove("hidden");
});
$("#start-correction").addEventListener("click", () => setMode("correcao"));
$("#back-to-modes").addEventListener("click", () => {
  unavailableScreen.classList.add("hidden");
  modeScreen.classList.remove("hidden");
});

window.addEventListener("beforeunload", (event) => {
  if (state.dirty || state.saving) {
    event.preventDefault();
    event.returnValue = "";
  }
});
