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

  // ==================== ZORGPLAN GENERATIE (VOLLEDIG) ====================
  function bundleDomainsTableHTML(bundle, age) {
    const focus = ageFocusText(age);

    const bronnen = Array.isArray(bundle.bronnen) && bundle.bronnen.length
      ? `<ul>${
          bundle.bronnen.slice(0, 8).map(b =>
            `<li><strong>${escapeHtml(b.naam || "Bron")}</strong>${b.jaar ? ` (${escapeHtml(String(b.jaar))})` : ""} — ${escapeHtml(b.boodschap || "")}</li>`
          ).join("")
        }</ul>`
      : `<p><em>Geen bronnen opgelijst.</em></p>`;

    return `
      <div class="bundle-block">
        <h3>${escapeHtml(bundle.naam || "Zorgbundel")}</h3>
        <p class="bundle-focus"><strong>Leeftijdsfocus:</strong> ${escapeHtml(focus)}</p>

        <div class="bundle-table-wrap">
          <table class="bundle-table">
            <thead>
              <tr><th>Domein</th><th>Inhoud</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>Klinisch</strong></td><td>${escapeHtml(bundle.klinisch || "-")}</td></tr>
              <tr><td><strong>Educatie</strong></td><td>${escapeHtml(bundle.educatie || "-")}</td></tr>
              <tr><td><strong>Functioneel</strong></td><td>${escapeHtml(bundle.functioneel || "-")}</td></tr>
              <tr><td><strong>Coördinatie</strong></td><td>${escapeHtml(bundle.coordinatie || "-")}</td></tr>
              <tr><td><strong>Monitoring & escalatie</strong></td><td>${escapeHtml(bundle.monitoring || "-")}</td></tr>
              <tr><td><strong>Zorgverleners</strong></td><td>${escapeHtml(bundle.zorgverleners || "-")}</td></tr>
            </tbody>
          </table>
        </div>

        <details class="bundle-sources">
          <summary><strong>Bronnen</strong></summary>
          ${bronnen}
        </details>
      </div>
    `;
  }

  function toB1(text) {
    // Licht “B1”-achtig: minder afkortingen/jargon. (Later verfijnen per bundel.)
    return String(text || "")
      .replace(/\b(HbA1c|eGFR|TIA|CVA|COPD|ADL|iADL|AF|ICD|POH|CVRM)\b/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function professionalPlanHTML() {
    ensureBundle2AutoSelectedIfNeeded();

    const dateStr = todayISO();
    const bundles = selectedBundles || [];
    const kwetsbaar = patientLeeftijd >= 65 && isKwetsbaarFromText(currentTextContent || "");

    const header = `
      <div class="plan-header">
        <h2>Zorgplan (professioneel)</h2>
        <p><strong>Datum:</strong> ${escapeHtml(dateStr)}</p>
        <p><strong>Patiënt:</strong> ${escapeHtml(patientNaam || "-")} — <strong>Geboortedatum:</strong> ${escapeHtml(patientGeboortedatum || "-")} — <strong>Leeftijd:</strong> ${escapeHtml(patientLeeftijd ? String(patientLeeftijd) : "-")}</p>
        <p><strong>Brondocument(en):</strong> ${escapeHtml((uploadedFiles || []).map(f => f.name).join(", ") || "-")}</p>
      </div>
    `;

    const medicatie = `
      <div class="medicatie-block">
        <h3>Medicatie-overzicht (centraal)</h3>
        <p><em>Definitieve flow: medicatie komt gestructureerd uit OnePatient PHR + BCFI lookup per middel.</em></p>
        <ul>
          <li><strong>Medicatieveiligheid/polyfarmacie-signaal:</strong> ${inferMedicationSignals(currentTextContent || "").likelyPolypharmacy ? "JA (bundel 2 actief)" : "geen duidelijke signalen"}</li>
        </ul>
      </div>
    `;

    const extraServices = kwetsbaar ? `
      <div class="extra-services">
        <h3>Aanvullende diensten (65+ & kwetsbaarheid)</h3>
        <ul>
          <li>Warme maaltijden aan huis (Delimeal)</li>
          <li>Boodschappen aan huis (toe te voegen in providers.json)</li>
          <li>Tuinonderhoud (toe te voegen in providers.json)</li>
        </ul>
      </div>
    ` : "";

    const bundleBlocks = bundles.length
      ? bundles.map(b => bundleDomainsTableHTML(b, patientLeeftijd)).join("")
      : `<p><em>Geen bundels geselecteerd.</em></p>`;

    const alarms = bundles.length ? `
      <div class="alarms-block">
        <h3>Alarmsignalen & escalatie (per bundel)</h3>
        <ul>
          ${bundles.map(b => `<li><strong>${escapeHtml(b.naam || "")}:</strong> ${escapeHtml(b.monitoring || "-")}</li>`).join("")}
        </ul>
      </div>
    ` : "";

    const evalBlock = `
      <div class="eval-block">
        <h3>Evaluatie</h3>
        <ul>
          <li>Eerste evaluatie: <strong>over 2 weken</strong></li>
          <li>Daarna: <strong>maandelijks</strong> (of sneller bij alarmsignalen)</li>
        </ul>
      </div>
    `;

    return `
      <div class="zorgplan zorgplan-prof">
        ${header}
        ${medicatie}
        ${extraServices}
        ${bundleBlocks}
        ${alarms}
        ${evalBlock}
      </div>
    `;
  }

  function patientPlanHTML() {
    ensureBundle2AutoSelectedIfNeeded();

    const dateStr = todayISO();
    const bundles = selectedBundles || [];
    const kwetsbaar = patientLeeftijd >= 65 && isKwetsbaarFromText(currentTextContent || "");

    const header = `
      <div class="plan-header">
        <h2>Uw Zorgplan</h2>
        <p><strong>Naam:</strong> ${escapeHtml(patientNaam || "-")}</p>
        <p><strong>Datum:</strong> ${escapeHtml(dateStr)}</p>
      </div>
    `;

    const whatsUp = `
      <div class="patient-section">
        <h3>Wat we hebben herkend</h3>
        <ul>
          ${
            bundles.length
              ? bundles.map(b => `<li>${escapeHtml(toB1(b.naam || ""))}</li>`).join("")
              : "<li>We konden nog geen duidelijke zorgthema’s herkennen.</li>"
          }
        </ul>
      </div>
    `;

    const medicatie = `
      <div class="patient-section">
        <h3>Uw medicatie</h3>
        <p>Neem uw medicatie zoals afgesproken. Bij twijfel: contacteer uw huisarts of apotheker.</p>
        <p><em>In de definitieve versie halen we uw medicatielijst exact uit uw documenten via OnePatient.</em></p>
      </div>
    `;

    const extra = kwetsbaar ? `
      <div class="patient-section">
        <h3>Extra hulp thuis</h3>
        <p>Omdat u mogelijk wat extra steun kan gebruiken, stellen we deze hulp voor:</p>
        <ul>
          <li>Warme maaltijden aan huis</li>
          <li>Boodschappen aan huis</li>
          <li>Tuinonderhoud</li>
        </ul>
      </div>
    ` : "";

    const perTopic = bundles.length
      ? bundles.map(b => `
          <div class="patient-topic">
            <h3>${escapeHtml(toB1(b.naam || "Zorgthema"))}</h3>
            <ul>
              <li><strong>Wat volgen we op?</strong> ${escapeHtml(toB1(b.klinisch || "-"))}</li>
              <li><strong>Wat moet u weten?</strong> ${escapeHtml(toB1(b.educatie || "-"))}</li>
              <li><strong>Wat kan helpen?</strong> ${escapeHtml(toB1(b.functioneel || "-"))}</li>
              <li><strong>Wie helpt mee?</strong> ${escapeHtml(toB1(b.zorgverleners || "-"))}</li>
              <li><strong>Wanneer bellen?</strong> ${escapeHtml(toB1(b.monitoring || "-"))}</li>
            </ul>
          </div>
        `).join("")
      : "";

    const next = `
      <div class="patient-section">
        <h3>Volgende stap</h3>
        <ul>
          <li>Eerste opvolging: <strong>over 2 weken</strong>.</li>
          <li>Daarna: <strong>maandelijks</strong> of sneller als dat nodig is.</li>
        </ul>
      </div>
    `;

    return `
      <div class="zorgplan zorgplan-patient">
        ${header}
        ${whatsUp}
        ${medicatie}
        ${extra}
        ${perTopic}
        ${next}
      </div>
    `;
  }

  function buildZorgplan() {
    const prof = professionalPlanHTML();
    const patient = patientPlanHTML();
    return { prof, patient };
  }

  function renderZorgplan(view) {
    if (!zorgplanOutput) return;
    const html = view === "patient" ? currentZorgplan.patient : currentZorgplan.prof;
    zorgplanOutput.innerHTML = html || "<p>Geen zorgplan</p>";
  }

  function downloadHtml(filename, html) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function printHtml(html) {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(`
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Zorgplan</title>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
        </head>
        <body>
          ${html}
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  }

  // ==================== ACTIONS ====================
  async function ensureAllTextsExtracted() {
    // Extract text for every uploaded file (sequential for stability)
    for (let i = 0; i < uploadedFiles.length; i++) {
      const f = uploadedFiles[i];
      const key = fileKey(f);

      if (!extractedTextByKey.has(key)) {
        setStatus(`⏳ Tekst uitlezen (${i + 1}/${uploadedFiles.length}): <strong>${escapeHtml(f.name)}</strong>`, true);
        try {
          await extractTextForFile(f);
        } catch (e) {
          console.error(e);
          // store placeholder so we don't retry endlessly
          extractedTextByKey.set(key, "");
        }
      }
    }

    const all = uploadedFiles.map(f => extractedTextByKey.get(fileKey(f)) || "").join(" ").replace(/\s+/g, " ").trim();
    return all;
  }

  async function onExtractTerms() {
    if (!uploadedFiles.length) {
      setStatus("❌ Geen bestanden opgeladen.", true);
      return;
    }

    patientNaam = patientNaamInput?.value?.trim() || "";
    patientGeboortedatum = patientGeboortedatumInput?.value || "";
    patientLeeftijd = calcAge(patientGeboortedatum);

    if (patientLeeftijdEl) patientLeeftijdEl.textContent = patientLeeftijd ? String(patientLeeftijd) : "-";

    stap2El?.classList.add("active");
    safeDisable(extractBtn, true);
    safeDisable(generatePlanBtn, true);
    setStatus("⏳ Analyse gestart…", true);

    try {
      // 1) Extract all texts (even if user didn't preview)
      currentTextContent = await ensureAllTextsExtracted();

      if (!currentTextContent || currentTextContent.length < 10) {
        setStatus("⚠️ We vonden weinig/geen tekst. Mogelijk is het een gescande PDF. (OCR is nog niet voorzien.)", true);
      } else {
        setStatus("✅ Tekst uit documenten gehaald. Lexicon matching…", true);
      }

      // 2) Lexicon matching + bundles
      const terms = findTermsInText(currentTextContent || "");
      foundMedicalTerms = terms.medisch;
      foundPatientTerms = terms.patient;
      renderFoundTerms();

      const bundles = suggestBundles(currentTextContent || "");
      renderSuggestedBundles(bundles);

      // 3) Medicatie block (placeholder + signal)
      renderMedicationBlock();

      setStatus("✅ Analyse klaar. Selecteer bundels en genereer het zorgplan.", true);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Analyse mislukt: ${escapeHtml(e.message || String(e))}`, true);
    } finally {
      safeDisable(extractBtn, false);
    }
  }

  function onGeneratePlan() {
    // Step 3/4 active
    stap3El?.classList.add("active");
    stap4El?.classList.add("active");

    // Build
    currentZorgplan = buildZorgplan();

    // Render correct view
    if (viewPatientRadio?.checked) renderZorgplan("patient");
    else renderZorgplan("prof");

    if (downloadBtn) downloadBtn.disabled = false;
    if (printBtn) printBtn.disabled = false;

    setStatus("✅ Zorgplan gegenereerd.", true);
  }

  function onDownload() {
    const view = viewPatientRadio?.checked ? "patient" : "prof";
    const html = view === "patient" ? currentZorgplan.patient : currentZorgplan.prof;
    downloadHtml("zorgplan.html", html || "<p>Leeg</p>");
  }

  function onPrint() {
    const view = viewPatientRadio?.checked ? "patient" : "prof";
    const html = view === "patient" ? currentZorgplan.patient : currentZorgplan.prof;
    printHtml(html || "<p>Leeg</p>");
  }

  // ==================== EVENTS ====================
  function bindUploadZone() {
    if (!uploadZone) return;

    const trigger = () => fileInput?.click();

    uploadZone.addEventListener("click", trigger);
    uploadZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger();
      }
    });

    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragover");
    });
    uploadZone.addEventListener("dragleave", () => {
      uploadZone.classList.remove("dragover");
    });
    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragover");
      handleFiles(e.dataTransfer?.files || []);
    });
  }

  function bindFileInput() {
    if (!fileInput) return;
    fileInput.multiple = true;

    fileInput.addEventListener("change", (e) => {
      handleFiles(e.target?.files || []);
      // allow re-select same file set
      e.target.value = "";
    });
  }

  function bindButtons() {
    extractBtn?.addEventListener("click", onExtractTerms);
    generatePlanBtn?.addEventListener("click", onGeneratePlan);

    viewProfRadio?.addEventListener("change", () => renderZorgplan("prof"));
    viewPatientRadio?.addEventListener("change", () => renderZorgplan("patient"));

    downloadBtn?.addEventListener("click", onDownload);
    printBtn?.addEventListener("click", onPrint);
  }

  function bindPatientFields() {
    patientGeboortedatumInput?.addEventListener("change", () => {
      const age = calcAge(patientGeboortedatumInput.value);
      if (patientLeeftijdEl) patientLeeftijdEl.textContent = age ? String(age) : "-";
    });
  }

  // ==================== INIT ====================
  async function init() {
    safeDisable(extractBtn, true);
    safeDisable(generatePlanBtn, true);
    if (downloadBtn) downloadBtn.disabled = true;
    if (printBtn) printBtn.disabled = true;

    bindUploadZone();
    bindFileInput();
    bindButtons();
    bindPatientFields();

    await loadZorgbundelsData();

    resetWorkflow();
    resetPreview();
    renderUploadedList();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
