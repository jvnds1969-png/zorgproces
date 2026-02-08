/* ============================
   Zorgstart — COMPLETE WORKFLOW (Front-end)
   Upload > Preview > Tekstextractie (alle docs) > Lexicon match > Bundels > Dubbel zorgplan (HTML)
   ============================ */

(() => {
  "use strict";

  // ==================== ZORGBUNDELS DATA ====================
  // Geladen van: https://jvnds1969-png.github.io/Zorgbundels-en-probleemgebieden/
  let ZORGBUNDELS = [];

  async function loadZorgbundelsData() {
    try {
      const response = await fetch(
        "https://jvnds1969-png.github.io/Zorgbundels-en-probleemgebieden/script.js",
        { cache: "no-store" }
      );
      const scriptText = await response.text();

      // Extract: const zorgbundels = [...]
      const match = scriptText.match(/const\s+zorgbundels\s*=\s*(\[[\s\S]+?\]);/);
      if (match && match[1]) {
        // eslint-disable-next-line no-eval
        ZORGBUNDELS = eval(match[1]);
        console.log(`✅ Geladen: ${ZORGBUNDELS.length} zorgbundels`);
      } else {
        console.warn("⚠️ Geen 'zorgbundels' array gevonden in script.js");
        ZORGBUNDELS = [];
      }
    } catch (error) {
      console.error("❌ Kan zorgbundels niet laden:", error);
      // fallback minimal
      ZORGBUNDELS = [
        {
          nr: 1,
          naam: "Diabetes (fallback)",
          medischLexicon: ["diabetes mellitus", "DM2", "insulinetherapie"],
          patientLexicon: ["Ik heb suikerziekte"],
          klinisch: "Glycemie opvolgen",
          educatie: "Hypo/hyper herkennen",
          functioneel: "Glucosemeter",
          coordinatie: "Huisarts + thuisverpleging",
          monitoring: "Ernstige klachten → huisarts/112",
          zorgverleners: "Huisarts, thuisverpleging",
          bronnen: []
        }
      ];
    }
  }

  // ==================== PDF.js WORKER ====================
  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // ==================== DOM ====================
  const uploadZone = document.getElementById("uploadZone");
  let fileInput = document.getElementById("fileInput");

  const documentList = document.getElementById("documentList");
  const uploadedDocsTitle = document.getElementById("uploadedDocsTitle");
  const previewSection = document.getElementById("documentPreviewSection");
  const previewContainer = document.getElementById("documentPreviewContainer");

  const extractBtn = document.getElementById("extractTerms");
  const generatePlanBtn = document.getElementById("generatePlan");

  const foundTermsDiv = document.getElementById("foundTerms");
  const suggestedBundlesDiv = document.getElementById("suggestedBundles");
  const medicatieInfoDiv = document.getElementById("medicatieInfo");

  const viewProfRadio = document.getElementById("viewProf");
  const viewPatientRadio = document.getElementById("viewPatient");

  const zorgplanOutput = document.getElementById("zorgplanOutput");
  const downloadBtn = document.getElementById("downloadPlan");
  const printBtn = document.getElementById("printPlan");

  const stap2El = document.getElementById("stap2");
  const stap3El = document.getElementById("stap3");
  const stap4El = document.getElementById("stap4");

  const patientNaamInput = document.getElementById("patientNaam");
  const patientGeboortedatumInput = document.getElementById("patientGeboortedatum");
  const patientLeeftijdEl = document.getElementById("patientLeeftijd");

  const statusBox = document.getElementById("analysisStatus");

  // Create fileInput if missing (safety)
  if (!fileInput) {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "fileInput";
    input.accept = ".pdf,.docx,.txt";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    fileInput = input;
  } else {
    fileInput.multiple = true;
    if (!fileInput.accept) fileInput.accept = ".pdf,.docx,.txt";
  }

  // ==================== STATE ====================
  /** @type {File[]} */
  let uploadedFiles = [];
  /** @type {File|null} */
  let activeFile = null;

  // per file extracted text cache: key -> text
  const extractedTextByKey = new Map(); // key => text

  let currentTextContent = ""; // concatenated for analysis
  let patientNaam = "";
  let patientGeboortedatum = "";
  let patientLeeftijd = 0;

  let foundMedicalTerms = [];
  let foundPatientTerms = [];
  let selectedBundles = [];

  let currentZorgplan = { prof: "", patient: "" };

  // ==================== HELPERS ====================
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));
  }

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function setStatus(html, show = true) {
    if (!statusBox) return;
    statusBox.innerHTML = html;
    statusBox.style.display = show ? "block" : "none";
  }

  function safeDisable(el, val) {
    if (el) el.disabled = !!val;
  }

  function safeShow(el, show) {
    if (el) el.style.display = show ? "block" : "none";
  }

  function formatBytes(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    let b = bytes || 0;
    let i = 0;
    while (b >= 1024 && i < units.length - 1) {
      b /= 1024;
      i++;
    }
    return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function fileKey(file) {
    return `${file.name}__${file.size}__${file.lastModified}`;
  }

  function isAllowed(file) {
    const name = (file?.name || "").toLowerCase();
    return name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".txt");
  }

  function calcAge(isoDate) {
    if (!isoDate) return 0;
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return 0;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
  }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function ageFocusText(age) {
    if (!age) return "Leeftijd onbekend: standaard focus op veilige opstart, educatie en opvolging.";
    if (age < 65) return "Focus: zelfmanagement, digitale tools, actieve revalidatie en preventie.";
    if (age <= 75) return "Focus: therapietrouw, valpreventie, begeleide educatie en opvolging.";
    if (age <= 85) return "Focus: ADL-ondersteuning, mantelzorgbetrokkenheid, vereenvoudiging en veiligheid.";
    return "Focus: comfort, maximale thuisondersteuning, anticiperende zorgplanning/palliatieve overwegingen.";
  }

  function isKwetsbaarFromText(text) {
    const t = normalize(text || "");
    const signals = [
      "frailty", "kwetsbaar", "adl", "adl-hulp", "val", "vallen", "valrisico",
      "ondervoeding", "malnutritie", "eenzaamheid", "sociaal isolement",
      "dement", "mci", "cognit", "verward", "alleenwon", "woont alleen"
    ];
    return signals.some(s => t.includes(s));
  }

  function inferMedicationSignals(text) {
    const t = normalize(text || "");
    const hardSignals = ["polyfarmacie","multimedicatie","medicatielijst","therapiewijziging","interacties","stopp/start","hoogrisico-medicatie"];
    const score = hardSignals.reduce((acc, s) => acc + (t.includes(s) ? 1 : 0), 0);

    const countDose = (t.match(/\bmg\b/g) || []).length
      + (t.match(/\btablet\b/g) || []).length
      + (t.match(/\bcapsul/g) || []).length;

    const likelyPolypharmacy = score >= 1 || countDose >= 6;
    return { likelyPolypharmacy };
  }

  // ==================== UI RESET ====================
  function resetPreview() {
    if (previewContainer) previewContainer.innerHTML = "";
    safeShow(previewSection, false);
  }

  function resetWorkflow() {
    currentTextContent = "";
    foundMedicalTerms = [];
    foundPatientTerms = [];
    selectedBundles = [];
    currentZorgplan = { prof: "", patient: "" };

    if (foundTermsDiv) foundTermsDiv.innerHTML = "<p>Geen analyse uitgevoerd</p>";
    if (suggestedBundlesDiv) suggestedBundlesDiv.innerHTML = "<p>Geen bundels geselecteerd</p>";
    if (medicatieInfoDiv) medicatieInfoDiv.innerHTML = "<p>Geen medicatie-informatie beschikbaar</p>";
    if (zorgplanOutput) zorgplanOutput.innerHTML = "<p>Genereer eerst een zorgplan</p>";

    setStatus("", false);

    safeDisable(generatePlanBtn, true);
    if (downloadBtn) downloadBtn.disabled = true;
    if (printBtn) printBtn.disabled = true;

    stap2El?.classList.remove("active");
    stap3El?.classList.remove("active");
    stap4El?.classList.remove("active");
  }

  // ==================== LIST RENDER ====================
  function renderUploadedList() {
    if (!documentList || !uploadedDocsTitle) return;

    documentList.innerHTML = "";

    uploadedFiles.forEach((file, idx) => {
      const li = document.createElement("li");
      li.className = "uploaded-doc-item";

      const left = document.createElement("div");
      left.className = "uploaded-doc-left";
      const isActive = activeFile && file === activeFile;

      left.innerHTML = `
        <strong>${escapeHtml(file.name)}</strong>
        <div class="uploaded-doc-meta">${escapeHtml(file.type || "onbekend")} • ${formatBytes(file.size)}</div>
        ${isActive ? `<div class="uploaded-doc-meta"><em>Actief document</em></div>` : ""}
      `;

      const actions = document.createElement("div");
      actions.className = "uploaded-doc-actions";

      const btnPreview = document.createElement("button");
      btnPreview.type = "button";
      btnPreview.className = "btn-secondary";
      btnPreview.textContent = "Preview";
      btnPreview.addEventListener("click", async () => {
        activeFile = file;
        renderUploadedList();
        await previewFile(file);
      });

      const btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className = "btn-secondary";
      btnRemove.textContent = "Verwijder";
      btnRemove.addEventListener("click", () => removeFileAt(idx));

      actions.appendChild(btnPreview);
      actions.appendChild(btnRemove);

      li.appendChild(left);
      li.appendChild(actions);
      documentList.appendChild(li);
    });

    uploadedDocsTitle.style.display = uploadedFiles.length ? "block" : "none";
    safeDisable(extractBtn, uploadedFiles.length === 0);
  }

  function removeFileAt(index) {
    if (index < 0 || index >= uploadedFiles.length) return;
    const removed = uploadedFiles.splice(index, 1)[0];
    extractedTextByKey.delete(fileKey(removed));

    if (activeFile === removed) {
      activeFile = uploadedFiles.length ? uploadedFiles[uploadedFiles.length - 1] : null;
    }

    resetPreview();
    resetWorkflow();
    renderUploadedList();

    if (activeFile) previewFile(activeFile);
    else {
      if (fileInput) fileInput.value = "";
      safeDisable(extractBtn, true);
    }
  }

  // ==================== FILE INGEST ====================
  function handleFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    const allowed = list.filter(isAllowed);
    const rejected = list.filter(f => !isAllowed(f));

    if (rejected.length) {
      setStatus("⚠️ Een of meerdere bestanden zijn niet ondersteund. Gebruik .pdf, .docx of .txt.", true);
    }

    if (!allowed.length) return;

    for (const f of allowed) {
      const key = fileKey(f);
      const exists = uploadedFiles.some(x => fileKey(x) === key);
      if (!exists) uploadedFiles.push(f);
    }

    activeFile = allowed[allowed.length - 1];

    resetWorkflow();
    renderUploadedList();
    previewFile(activeFile);
  }

  // ==================== PREVIEW + EXTRACTION ====================
  function showError(msg) {
    if (!previewContainer) return;
    previewContainer.innerHTML = `
      <div class="error-msg">
        <strong>Kan niet tonen</strong>
        <p>${escapeHtml(msg)}</p>
      </div>
    `;
    safeShow(previewSection, true);
  }

  async function extractTextFromPdf(file) {
    if (!window.pdfjsLib?.getDocument) throw new Error("PDF.js is niet geladen");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const textContent = await pg.getTextContent();
      const pageText = (textContent.items || []).map(it => it.str).join(" ");
      fullText += pageText + " ";
    }
    return fullText.replace(/\s+/g, " ").trim();
  }

  async function extractTextFromDocx(file) {
    if (!window.mammoth) throw new Error("Mammoth.js is niet geladen");
    const arrayBuffer = await file.arrayBuffer();

    // Prefer raw text if available; fallback to html->text
    if (typeof window.mammoth.extractRawText === "function") {
      const res = await window.mammoth.extractRawText({ arrayBuffer });
      return (res.value || "").replace(/\s+/g, " ").trim();
    }

    if (typeof window.mammoth.convertToHtml !== "function") {
      throw new Error("Mammoth.js convertToHtml ontbreekt");
    }

    const result = await window.mammoth.convertToHtml({ arrayBuffer });
    const tmp = document.createElement("div");
    tmp.innerHTML = result.value || "";
    return (tmp.textContent || "").replace(/\s+/g, " ").trim();
  }

  async function extractTextFromTxt(file) {
    const text = await file.text();
    return (text || "").replace(/\s+/g, " ").trim();
  }

  async function extractTextForFile(file) {
    const key = fileKey(file);
    if (extractedTextByKey.has(key)) return extractedTextByKey.get(key) || "";

    const name = (file.name || "").toLowerCase();
    let txt = "";

    if (name.endsWith(".pdf")) txt = await extractTextFromPdf(file);
    else if (name.endsWith(".docx")) txt = await extractTextFromDocx(file);
    else if (name.endsWith(".txt")) txt = await extractTextFromTxt(file);
    else txt = "";

    extractedTextByKey.set(key, txt || "");
    return txt || "";
  }

  async function previewPdf(file) {
    if (!window.pdfjsLib?.getDocument) {
      showError("PDF.js is niet geladen");
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    if (!previewContainer) return;
    previewContainer.innerHTML = "";
    safeShow(previewSection, true);

    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.25 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    previewContainer.appendChild(canvas);

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Cache extracted text (all pages)
    const txt = await extractTextFromPdf(file);
    extractedTextByKey.set(fileKey(file), txt);
  }

  async function previewDocx(file) {
    if (!window.mammoth?.convertToHtml) {
      showError("Mammoth.js is niet geladen");
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.convertToHtml({ arrayBuffer });

    if (!previewContainer) return;
    previewContainer.innerHTML = "";
    safeShow(previewSection, true);

    const wrapper = document.createElement("div");
    wrapper.className = "docx-preview";
    wrapper.innerHTML = result.value || "<em>Leeg document</em>";

    previewContainer.appendChild(wrapper);

    // Cache extracted text
    const tmp = document.createElement("div");
    tmp.innerHTML = result.value || "";
    const txt = (tmp.textContent || "").replace(/\s+/g, " ").trim();
    extractedTextByKey.set(fileKey(file), txt);
  }

  async function previewTxt(file) {
    const raw = await file.text();
    const txt = (raw || "").trim();

    if (!previewContainer) return;
    previewContainer.innerHTML = "";
    safeShow(previewSection, true);

    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.textContent = raw || "";
    previewContainer.appendChild(pre);

    extractedTextByKey.set(fileKey(file), (txt || "").replace(/\s+/g, " ").trim());
  }

  async function previewFile(file) {
    if (!file) return;

    try {
      const name = (file.name || "").toLowerCase();
      if (name.endsWith(".pdf")) return await previewPdf(file);
      if (name.endsWith(".docx")) return await previewDocx(file);
      if (name.endsWith(".txt")) return await previewTxt(file);
      showError("Bestandstype niet ondersteund. Gebruik .pdf, .docx of .txt");
    } catch (e) {
      console.error(e);
      showError(e.message || "Preview mislukt");
    }
  }

  // ==================== TERM MATCHING + BUNDLES ====================
  function findTermsInText(text) {
    const t = normalize(text);
    const foundMed = new Set();
    const foundPat = new Set();

    for (const b of (ZORGBUNDELS || [])) {
      (b.medischLexicon || []).forEach((term) => {
        const nt = normalize(term);
        if (nt && t.includes(nt)) foundMed.add(term);
      });
      (b.patientLexicon || []).forEach((term) => {
        const nt = normalize(term);
        if (nt && t.includes(nt)) foundPat.add(term);
      });
    }

    return {
      medisch: Array.from(foundMed),
      patient: Array.from(foundPat),
    };
  }

  function scoreBundle(bundle, text) {
    const t = normalize(text);
    let score = 0;

    (bundle.medischLexicon || []).forEach((term) => {
      const nt = normalize(term);
      if (nt && t.includes(nt)) score += 2;
    });
    (bundle.patientLexicon || []).forEach((term) => {
      const nt = normalize(term);
      if (nt && t.includes(nt)) score += 1;
    });

    return score;
  }

  function suggestBundles(text) {
    const scored = (ZORGBUNDELS || [])
      .map((b) => ({ b, s: scoreBundle(b, text) }))
      .filter((x) => x.s > 0)
      .sort((a, c) => c.s - a.s);

    return scored.map((x) => x.b);
  }

  function renderFoundTerms() {
    if (!foundTermsDiv) return;

    const med = foundMedicalTerms || [];
    const pat = foundPatientTerms || [];

    const medHtml =
      med.length === 0
        ? "<p><strong>Medisch lexicon:</strong> geen termen gevonden</p>"
        : `<p><strong>Medisch lexicon:</strong></p><ul>${med.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;

    const patHtml =
      pat.length === 0
        ? "<p><strong>Patiëntlexicon:</strong> geen termen gevonden</p>"
        : `<p><strong>Patiëntlexicon:</strong></p><ul>${pat.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;

    foundTermsDiv.innerHTML = medHtml + patHtml;
  }

  function renderSuggestedBundles(bundles) {
    if (!suggestedBundlesDiv) return;

    if (!bundles || bundles.length === 0) {
      suggestedBundlesDiv.innerHTML = "<p>Geen bundels gevonden. (Tip: voeg meer documenten toe.)</p>";
      selectedBundles = [];
      safeDisable(generatePlanBtn, true);
      return;
    }

    suggestedBundlesDiv.innerHTML = `
      <div class="bundle-list">
        ${bundles.map((b) => `
          <label class="bundle-item">
            <input type="checkbox" data-bundle-nr="${escapeHtml(String(b.nr ?? ""))}" checked>
            <span><strong>${escapeHtml(b.naam || "Onbenoemde bundel")}</strong></span>
          </label>
        `).join("")}
      </div>
    `;

    selectedBundles = bundles.slice();

    suggestedBundlesDiv.querySelectorAll('input[type="checkbox"][data-bundle-nr]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const checkedNrs = Array.from(
          suggestedBundlesDiv.querySelectorAll('input[type="checkbox"][data-bundle-nr]:checked')
        ).map((x) => x.getAttribute("data-bundle-nr"));

        selectedBundles = (bundles || []).filter((b) => checkedNrs.includes(String(b.nr ?? "")));
        safeDisable(generatePlanBtn, selectedBundles.length === 0);
      });
    });

    safeDisable(generatePlanBtn, selectedBundles.length === 0);
  }

  function renderMedicationBlock() {
    if (!medicatieInfoDiv) return;

    const signals = inferMedicationSignals(currentTextContent || "");
    medicatieInfoDiv.innerHTML = `
      <div class="medicatie-block">
        <p><strong>Medicatie staat centraal.</strong> In de definitieve flow komt de medicatietabel (naam, dosis, indicatie, interacties) uit de PHR (OnePatient).</p>
        <ul>
          <li><strong>Signalen polyfarmacie/medicatieveiligheid:</strong> ${signals.likelyPolypharmacy ? "JA (bundel 2 wordt automatisch toegevoegd bij plan)" : "geen duidelijke signalen in tekst"}</li>
        </ul>
        <p>BCFI lookup gebeurt idealiter server-side (CORS). Hier tonen we alvast de structuur en signalen.</p>
      </div>
    `;
  }

  function ensureBundle2AutoSelectedIfNeeded() {
    const signals = inferMedicationSignals(currentTextContent || "");
    if (!signals.likelyPolypharmacy) return;

    const has2 = (selectedBundles || []).some(b => String(b.nr) === "2");
    if (has2) return;

    const b2 = (ZORGBUNDELS || []).find(b => String(b.nr) === "2");
    if (b2) selectedBundles = [b2, ...(selectedBundles || [])];
  }

 // ==================== ZORGPLAN GENERATIE — “PDF-STIJL” ====================

// Mini helpers
function bulletList(items) {
  const clean = (items || []).map(s => String(s || "").trim()).filter(Boolean);
  if (!clean.length) return "<p>-</p>";
  return `<ul>${clean.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}

function fmtDateISO(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("nl-BE", { day: "2-digit", month: "long", year: "numeric" });
}

function nowDateHuman() {
  return new Date().toLocaleDateString("nl-BE", { day: "2-digit", month: "long", year: "numeric" });
}

function toB1Sentence(s) {
  return String(s || "")
    .replace(/\b(HbA1c|eGFR|TIA|CVA|COPD|ADL|iADL|AF|ICD|POH|CVRM)\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getBundleByNr(nr) {
  return (ZORGBUNDELS || []).find(b => String(b.nr) === String(nr)) || null;
}

function ensureBundle2IfPolyfarmacie() {
  const signals = inferMedicationSignals(currentTextContent || "");
  if (!signals.likelyPolypharmacy) return;

  const has2 = (selectedBundles || []).some(b => String(b.nr) === "2");
  if (!has2) {
    const b2 = getBundleByNr(2);
    if (b2) selectedBundles = [b2, ...(selectedBundles || [])];
  }
}

function ageFocusParagraph(age) {
  if (!age) return "Leeftijd onbekend: focus op veilige opstart, educatie en opvolging.";
  if (age < 65) return "Focus: zelfmanagement, digitale tools en actieve revalidatie.";
  if (age <= 75) return "Focus: therapietrouw, valpreventie en begeleide educatie.";
  if (age <= 85) return "Focus: ADL-ondersteuning, mantelzorgbetrokkenheid, vereenvoudiging en veiligheid.";
  return "Focus: comfort, maximale thuisondersteuning en anticiperende zorgplanning.";
}

function kwetsbaarheidsExtraDienstenBlock() {
  const kwetsbaar = patientLeeftijd >= 65 && isKwetsbaarFromText(currentTextContent || "");
  if (!kwetsbaar) return "";
  return `
    <h3>Aanvullende diensten (65+ & kwetsbaarheid)</h3>
    <ul>
      <li>Warme maaltijden aan huis (Delimeal)</li>
      <li>Boodschappen aan huis (toe te voegen in providers.json)</li>
      <li>Tuinonderhoud (toe te voegen in providers.json)</li>
    </ul>
  `;
}

// Probleemgebieden “zoals in PDF”: bundelnaam + kernwoorden
function buildProbleemgebieden() {
  const t = normalize(currentTextContent || "");

  // scoreer bundels (zoals je logica): medisch=2, patient=1
  const scored = (ZORGBUNDELS || [])
    .map(b => ({ b, s: scoreBundle(b, currentTextContent || "") }))
    .filter(x => x.s > 0)
    .sort((a, c) => c.s - a.s);

  const relevant = scored.map(x => x.b);

  // map kernwoorden: neem zinnen uit patientLexicon die effectief gevonden zijn
  const foundPat = new Set((foundPatientTerms || []).map(x => normalize(x)));

  const probleemgebieden = relevant.map((b, idx) => {
    const kernwoorden = (b.patientLexicon || [])
      .filter(p => foundPat.has(normalize(p)))
      .slice(0, 6);

    const medMatches = (b.medischLexicon || [])
      .filter(m => t.includes(normalize(m)))
      .slice(0, 8);

    return {
      index: idx + 1,
      bundel: b,
      kernwoorden,
      medMatches
    };
  });

  return probleemgebieden;
}

// Acties per bundel: uit 7 domeinen naar “Concrete acties”
function bundleToActies(bundle) {
  const acties = [];

  if (bundle.educatie) acties.push(`Educatie/instructie: ${bundle.educatie}`);
  if (bundle.functioneel) acties.push(`Praktisch/functioneel: ${bundle.functioneel}`);
  if (bundle.coordinatie) acties.push(`Afstemming/coördinatie: ${bundle.coordinatie}`);
  if (bundle.klinisch) acties.push(`Klinische opvolging: ${bundle.klinisch}`);
  if (bundle.monitoring) acties.push(`Monitoring & escalatie: ${bundle.monitoring}`);

  // Zorgverleners als actie
  if (bundle.zorgverleners) acties.push(`Betrokken zorgverleners: ${bundle.zorgverleners}`);

  // bronnen in professionele versie (kort)
  if (Array.isArray(bundle.bronnen) && bundle.bronnen.length) {
    const top = bundle.bronnen.slice(0, 5).map(b => `${b.naam}${b.jaar ? ` (${b.jaar})` : ""}`);
    acties.push(`Bronnen (selectie): ${top.join(" • ")}`);
  }

  return acties;
}

function planHeaderBlock() {
  return `
    <h2>ZORGPLAN VOOR ${escapeHtml(patientNaam || "-")}</h2>
    <p><strong>Datum:</strong> ${escapeHtml(nowDateHuman())}</p>
    <p><strong>Opgesteld op basis van:</strong> ${escapeHtml((uploadedFiles || []).map(f => f.name).join(", ") || "-")}</p>
    <hr>
    <h3>PATIËNTGEGEVENS</h3>
    <p><strong>Naam:</strong> ${escapeHtml(patientNaam || "-")}</p>
    <p><strong>Geboortedatum:</strong> ${escapeHtml(patientGeboortedatum ? `${fmtDateISO(patientGeboortedatum)} (${patientLeeftijd || "-"} jaar)` : "-")}</p>
    <p><strong>Leeftijdsfocus:</strong> ${escapeHtml(ageFocusParagraph(patientLeeftijd))}</p>
  `;
}

function opnameredenBlock() {
  // Zonder PHR: we kunnen dit niet betrouwbaar afleiden. We zetten een invulblok zoals in je PDF.
  return `
    <h3>OPNAMEREDEN</h3>
    <p><em>Te verfijnen: in de definitieve flow komt dit automatisch uit OnePatient (PHR).</em></p>
    <p>____________________________________________________________</p>
  `;
}

function probleemgebiedenBlock(probleemgebieden) {
  if (!probleemgebieden.length) {
    return `
      <h3>GEDETECTEERDE PROBLEEMGEBIEDEN</h3>
      <p><em>Geen probleemgebieden gedetecteerd op basis van de huidige tekst.</em></p>
    `;
  }

  return `
    <h3>GEDETECTEERDE PROBLEEMGEBIEDEN</h3>
    <p>Op basis van de opgeladen documenten zijn volgende probleemgebieden geïdentificeerd:</p>
    ${probleemgebieden.map(pg => `
      <div class="problem-block">
        <p><strong>${pg.index}. ${escapeHtml(pg.bundel.naam || "Probleemgebied")}</strong></p>
        ${pg.medMatches.length ? `<p><strong>Medische signalen:</strong> ${escapeHtml(pg.medMatches.join(" • "))}</p>` : ""}
        ${pg.kernwoorden.length
          ? `<p><strong>Kernwoorden patiënt/mantelzorger:</strong></p>${bulletList(pg.kernwoorden.map(k => `"${k}"`))}`
          : `<p><strong>Kernwoorden patiënt/mantelzorger:</strong> <em>geen expliciete patiëntzinnen gevonden</em></p>`
        }
      </div>
    `).join("")}
  `;
}

function aangewezenBundelsBlock() {
  const bundles = selectedBundles || [];
  if (!bundles.length) {
    return `<h3>AANGEWEZEN ZORGBUNDELS</h3><p><em>Geen bundels geselecteerd.</em></p>`;
  }

  return `
    <h3>AANGEWEZEN ZORGBUNDELS</h3>
    <p>Op basis van bovenstaande probleemgebieden worden volgende zorgbundels aanbevolen:</p>
    ${bundles.map((b, i) => {
      const acties = bundleToActies(b);
      return `
        <div class="bundle-plan-block">
          <p><strong>${i + 1}. ${escapeHtml(b.naam || "Zorgbundel")}</strong></p>
          <p><strong>Doel:</strong> ${escapeHtml(b.doel || "Veilige opstart en gerichte opvolging in de thuissituatie.")}</p>
          <p><strong>Concrete acties:</strong></p>
          ${bulletList(acties)}
          <p><strong>Timing:</strong> Onmiddellijk (tenzij anders afgesproken)</p>
          <p><strong>Frequentie:</strong> Initieel intensief, daarna afbouw volgens klinische evolutie</p>
          <p><strong>Uitvoerders:</strong> ${escapeHtml(b.zorgverleners || "Huisarts + betrokken disciplines + nurseline/coördinatie")}</p>
        </div>
      `;
    }).join("")}
  `;
}

function medicatieCentraalBlock() {
  const signals = inferMedicationSignals(currentTextContent || "");
  return `
    <h3>MEDICATIE (CENTRAAL)</h3>
    <p><em>Definitieve flow: medicatie komt gestructureerd uit OnePatient PHR + BCFI lookup per middel.</em></p>
    <p><strong>Medicatieveiligheid/polyfarmacie-signaal:</strong> ${signals.likelyPolypharmacy ? "JA (Medicatieveiligheidsbundel automatisch actief)" : "geen duidelijke signalen in tekst"}</p>
    <p>____________________________________________________________</p>
  `;
}

function adviesVoorVerpleegkundigenBlock() {
  // Genereer “focuspunten” op basis van geselecteerde bundels (monitoring + educatie + veiligheid)
  const bundles = selectedBundles || [];
  const tips = [];

  for (const b of bundles) {
    if (b.monitoring) tips.push(`Escalatie: ${b.monitoring}`);
    if (b.educatie) tips.push(`Instructie: ${b.educatie}`);
    if (b.functioneel) tips.push(`Praktisch: ${b.functioneel}`);
  }

  const uniq = Array.from(new Set(tips.map(x => x.trim()))).slice(0, 12);

  return `
    <h3>ADVIES VOOR VERPLEEGKUNDIGEN</h3>
    <p><strong>Belangrijkste aandachtspunten:</strong></p>
    ${uniq.length ? bulletList(uniq) : "<p><em>Geen specifieke adviezen afgeleid.</em></p>"}
  `;
}

function uitlegVoorPatientBlock() {
  const bundles = selectedBundles || [];
  const bullets = bundles.slice(0, 6).map(b => {
    const whenCall = b.monitoring ? `Wanneer bellen: ${toB1Sentence(b.monitoring)}` : "Wanneer bellen: als iets niet goed voelt.";
    const help = b.functioneel ? toB1Sentence(b.functioneel) : "Extra hulp waar nodig.";
    return `We helpen rond: ${toB1Sentence(b.naam || "zorgthema")}. ${help}. ${whenCall}`;
  });

  return `
    <h3>UITLEG VOOR PATIËNT (begrijpelijke taal)</h3>
    <p>Beste ${escapeHtml(patientNaam || "patiënt")},</p>
    <p>U bent onlangs thuis gekomen. Dit zorgplan helpt u en uw familie, en ook de zorgverleners die u ondersteunen.</p>

    <p><strong>Wat betekent dit concreet?</strong></p>
    ${bullets.length ? bulletList(bullets) : "<p><em>Er zijn nog geen zorgthema’s geselecteerd.</em></p>"}

    <p><strong>Wanneer moet u de dokter bellen?</strong></p>
    <ul>
      <li>Als u koorts krijgt (&gt; 38°C)</li>
      <li>Als u valt</li>
      <li>Als u plots veel zieker wordt of zich erg ongerust voelt</li>
      <li>Als u verward raakt</li>
      <li>Als u veel minder eet of drinkt dan normaal</li>
    </ul>

    <p><strong>Belangrijke nummers</strong></p>
    <ul>
      <li>Huisarts: ______________________</li>
      <li>Thuisverpleging: ______________________</li>
      <li>Nurseline/coördinatie: ______________________</li>
      <li>Noodgevallen: 112</li>
    </ul>
  `;
}

function volgendeStappenBlock() {
  return `
    <h3>VOLGENDE STAPPEN</h3>
    <p><strong>Onmiddellijk te starten:</strong></p>
    <ul>
      <li>Afstemming zorgverleners + start van gekozen bundels</li>
      <li>Medicatiecheck (zeker bij veranderingen)</li>
    </ul>

    <p><strong>Binnen 1 week:</strong></p>
    <ul>
      <li>Eerste evaluatie van veiligheid/werking thuis</li>
      <li>Praktische hulpmiddelen en afspraken bevestigen</li>
    </ul>

    <p><strong>Binnen 2 weken:</strong></p>
    <ul>
      <li>Eerste structurele evaluatie</li>
      <li>Bijsturen zorgplan waar nodig</li>
    </ul>

    <p><strong>Structureel:</strong></p>
    <ul>
      <li>Regelmatige opvolging (initieel wekelijks, later tweewekelijks/maandelijks)</li>
      <li>Herbeoordeling bundels bij wijziging toestand</li>
    </ul>
  `;
}

function afsluitingBlock() {
  const nextEval = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
  })();

  return `
    <hr>
    <h3>AFSLUITING</h3>
    <p>Dit zorgplan is opgesteld op basis van de meest recente informatie in de opgeladen documenten en de zorgbundels binnen Zorgstart.</p>
    <p>Het plan is dynamisch en wordt aangepast aan veranderende noden.</p>
    <p><strong>Opgesteld:</strong> ${escapeHtml(nowDateHuman())}</p>
    <p><strong>Volgende evaluatie:</strong> ${escapeHtml(nextEval)}</p>
  `;
}

function buildZorgplanHtmlProf() {
  ensureBundle2IfPolyfarmacie();

  const probleemgebieden = buildProbleemgebieden();

  return `
    <div class="zorgplan zorgplan-prof">
      ${planHeaderBlock()}
      ${opnameredenBlock()}
      ${probleemgebiedenBlock(probleemgebieden)}
      ${aangewezenBundelsBlock()}
      ${medicatieCentraalBlock()}
      ${kwetsbaarheidsExtraDienstenBlock()}
      ${adviesVoorVerpleegkundigenBlock()}
      ${volgendeStappenBlock()}
      ${afsluitingBlock()}
    </div>
  `;
}

function buildZorgplanHtmlPatient() {
  ensureBundle2IfPolyfarmacie();

  return `
    <div class="zorgplan zorgplan-patient">
      <h2>Uw Zorgplan</h2>
      <p><strong>Naam:</strong> ${escapeHtml(patientNaam || "-")}</p>
      <p><strong>Datum:</strong> ${escapeHtml(nowDateHuman())}</p>
      <p><strong>Leeftijd:</strong> ${escapeHtml(patientLeeftijd ? String(patientLeeftijd) : "-")}</p>
      <hr>

      ${uitlegVoorPatientBlock()}
      ${kwetsbaarheidsExtraDienstenBlock()}
      ${volgendeStappenBlock()}
      ${afsluitingBlock()}
    </div>
  `;
}

// === vervang je onGeneratePlan door dit ===
function onGeneratePlan() {
  stap3El?.classList.add("active");
  stap4El?.classList.add("active");

  currentZorgplan = {
    prof: buildZorgplanHtmlProf(),
    patient: buildZorgplanHtmlPatient()
  };

  if (viewPatientRadio?.checked) renderZorgplan("patient");
  else renderZorgplan("prof");

  if (downloadBtn) downloadBtn.disabled = false;
  if (printBtn) printBtn.disabled = false;

  setStatus("✅ Zorgplan gegenereerd (PDF-stijl).", true);
}

// === vervang je onDownload door dit ===
function onDownload() {
  const view = viewPatientRadio?.checked ? "patient" : "prof";
  const html = view === "patient" ? currentZorgplan.patient : currentZorgplan.prof;

  const wrapper = `
    <!doctype html>
    <html lang="nl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Zorgplan</title>
      </head>
      <body>${html}</body>
    </html>
  `;

  downloadHtml("zorgplan.html", wrapper);
}

// === vervang je onPrint door dit ===
function onPrint() {
  const view = viewPatientRadio?.checked ? "patient" : "prof";
  const html = view === "patient" ? currentZorgplan.patient : currentZorgplan.prof;
  printHtml(html || "<p>Leeg</p>");
}
