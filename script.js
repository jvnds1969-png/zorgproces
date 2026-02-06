/* ============================
   Zorgstart - COMPLETE WORKFLOW
   Document upload > Scraping > Lexicon matching >
   Zorgbundels > Zorgplan generatie
   ============================ */

(() => {
  "use strict";

  // ==================== ZORGBUNDELS DATA ====================
  // Geladen van: https://jvnds1969-png.github.io/Zorgbundels-en-probleemgebieden/
  let ZORGBUNDELS = [];

  // Fetch zorgbundels data bij startup
  async function loadZorgbundelsData() {
    try {
      const response = await fetch(
        "https://jvnds1969-png.github.io/Zorgbundels-en-probleemgebieden/script.js",
        { cache: "no-store" }
      );
      const scriptText = await response.text();

      // Extract const zorgbundels = [...] via regex
      const match = scriptText.match(/const\s+zorgbundels\s*=\s*(\[[\s\S]+?\]);/);
      if (match && match[1]) {
        // Safely evaluate the array
        // eslint-disable-next-line no-eval
        ZORGBUNDELS = eval(match[1]);
        console.log(`✅ Geladen: ${ZORGBUNDELS.length} zorgbundels`);
      } else {
        console.warn("⚠️ Geen 'zorgbundels' array gevonden in script.js");
      }
    } catch (error) {
      console.error("❌ Kan zorgbundels niet laden:", error);
      // Fallback: hardcoded subset (basis diabetesbundel)
      ZORGBUNDELS = [
        {
          nr: 1,
          naam: "Diabetes met verhoogd thuisrisico",
          medischLexicon: ["diabetes mellitus", "DM2", "insulinetherapie", "orale antidiabetica"],
          patientLexicon: ["Ik heb suikerziekte", "Mijn suiker schommelt"],
        },
      ];
    }
  }

  // ==================== DOM ELEMENTS ====================
  const uploadZone = document.getElementById("uploadZone");
  let fileInput = document.getElementById("fileInput");

  // Create fileInput if missing
  if (!fileInput) {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "fileInput";
    input.accept = ".pdf,.docx,.txt";
    input.multiple = true; // ✅ meerdere tegelijk
    input.style.display = "none";
    document.body.appendChild(input);
    fileInput = input;
  } else {
    // Ensure multiple even if in HTML
    fileInput.multiple = true; // ✅ meerdere tegelijk
    // (accept laten zoals in HTML, maar zet veilig als het ontbreekt)
    if (!fileInput.accept) fileInput.accept = ".pdf,.docx,.txt";
  }

  const documentList = document.getElementById("documentList");
  const uploadedDocsTitle = document.getElementById("uploadedDocsTitle");
  const previewSection = document.getElementById("documentPreviewSection");
  const previewContainer = document.getElementById("documentPreviewContainer");
  const extractBtn = document.getElementById("extractTerms");

  // Step 2 elements
  const foundTermsDiv = document.getElementById("foundTerms");
  const suggestedBundlesDiv = document.getElementById("suggestedBundles");
  const medicatieInfoDiv = document.getElementById("medicatieInfo");
  const generatePlanBtn = document.getElementById("generatePlan");

  // Step 3 elements
  const viewProfRadio = document.getElementById("viewProf");
  const viewPatientRadio = document.getElementById("viewPatient");

  // Step 4 elements
  const zorgplanOutput = document.getElementById("zorgplanOutput");
  const downloadBtn = document.getElementById("downloadPlan");
  const printBtn = document.getElementById("printPlan");

  // Helpers: stap containers (kunnen ontbreken)
  const stap2El = document.getElementById("stap2");
  const stap3El = document.getElementById("stap3");
  const stap4El = document.getElementById("stap4");

  // ==================== STATE ====================
  let uploadedFiles = []; // ✅ multiple
  let activeFile = null; // ✅ actief document (preview/analyse)

  let currentTextContent = "";
  let patientNaam = "";
  let patientGeboortedatum = "";
  let patientLeeftijd = 0;
  let foundMedicalTerms = [];
  let foundPatientTerms = [];
  let selectedBundles = [];
  let currentZorgplan = { prof: "", patient: "" };

  // ==================== PDF.js WORKER ====================
  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // ==================== HELPER FUNCTIONS ====================
  function safeSetHtml(el, html) {
    if (el) el.innerHTML = html;
  }
  function safeSetDisplay(el, val) {
    if (el) el.style.display = val;
  }
  function safeDisable(el, val) {
    if (el) el.disabled = val;
  }

  function resetPreview() {
    if (previewContainer) previewContainer.innerHTML = "";
    safeSetDisplay(previewSection, "none");
    currentTextContent = "";
  }

  function resetWorkflow() {
    currentTextContent = "";
    foundMedicalTerms = [];
    foundPatientTerms = [];
    selectedBundles = [];
    currentZorgplan = { prof: "", patient: "" };

    safeSetHtml(foundTermsDiv, "<p>Geen analyse uitgevoerd</p>");
    safeSetHtml(suggestedBundlesDiv, "<p>Geen bundels geselecteerd</p>");
    safeSetHtml(medicatieInfoDiv, "<p>Geen medicatie-informatie beschikbaar</p>");
    safeSetHtml(zorgplanOutput, "<p>Genereer eerst een zorgplan</p>");

    safeDisable(generatePlanBtn, true);
    stap2El?.classList.remove("active");
    stap3El?.classList.remove("active");
    stap4El?.classList.remove("active");
  }

  function formatBytes(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    let b = bytes;
    let i = 0;
    while (b >= 1024 && i < units.length - 1) {
      b /= 1024;
      i++;
    }
    return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));
  }

  function showError(msg) {
    if (!previewContainer) return;
    previewContainer.innerHTML = `<div class="error-msg"><strong>Kan niet tonen</strong><p>${escapeHtml(
      msg
    )}</p></div>`;
    safeSetDisplay(previewSection, "block");
  }

  // ==================== FILE HANDLING ====================
  function isAllowed(file) {
    const name = (file?.name || "").toLowerCase();
    return name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".txt");
  }

  function renderUploadedList() {
    if (!documentList || !uploadedDocsTitle || !extractBtn) return;

    documentList.innerHTML = "";

    uploadedFiles.forEach((file, idx) => {
      const li = document.createElement("li");
      li.className = "uploaded-doc-item";

      const left = document.createElement("div");
      left.className = "uploaded-doc-left";

      const isActive = activeFile && file === activeFile;
      left.innerHTML = `
        <strong>${escapeHtml(file.name)}</strong>
        <div class="uploaded-doc-meta">${formatBytes(file.size)} • ${escapeHtml(file.type || "onbekend")}</div>
        ${isActive ? `<div class="uploaded-doc-meta"><em>Actief document</em></div>` : ""}
      `;

      const actions = document.createElement("div");
      actions.className = "uploaded-doc-actions";

      const btnPreview = document.createElement("button");
      btnPreview.type = "button";
      btnPreview.className = "btn-secondary";
      btnPreview.textContent = "Preview";
      btnPreview.addEventListener("click", () => {
        activeFile = file;
        resetPreview();
        resetWorkflow();
        renderUploadedList();
        previewFile(file);
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
    extractBtn.disabled = uploadedFiles.length === 0;
  }

  function removeFileAt(index) {
    if (index < 0 || index >= uploadedFiles.length) return;

    const removed = uploadedFiles.splice(index, 1)[0];

    // als het actieve document verwijderd is: kies nieuw actief of null
    if (activeFile === removed) {
      activeFile = uploadedFiles.length ? uploadedFiles[uploadedFiles.length - 1] : null;
    }

    // UI reset
    resetPreview();
    resetWorkflow();
    renderUploadedList();

    if (activeFile) previewFile(activeFile);
    else {
      if (fileInput) fileInput.value = "";
      safeDisable(extractBtn, true);
    }
  }

  function removeCurrentFile() {
    uploadedFiles = [];
    activeFile = null;
    if (fileInput) fileInput.value = "";
    if (documentList) documentList.innerHTML = "";
    safeSetDisplay(uploadedDocsTitle, "none");
    safeDisable(extractBtn, true);
    resetPreview();
    resetWorkflow();
  }

  function handleFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (list.length === 0) return;

    const allowed = list.filter(isAllowed);
    const rejected = list.filter((f) => !isAllowed(f));

    if (rejected.length) {
      showError("Een of meerdere bestanden zijn niet ondersteund. Gebruik .pdf, .docx of .txt");
    }
    if (allowed.length === 0) return;

    for (const f of allowed) {
      const key = `${f.name}__${f.size}__${f.lastModified}`;
      const exists = uploadedFiles.some((x) => `${x.name}__${x.size}__${x.lastModified}` === key);
      if (!exists) uploadedFiles.push(f);
    }

    activeFile = allowed[allowed.length - 1];

    resetPreview();
    resetWorkflow();
    renderUploadedList();
    previewFile(activeFile);
  }

  // ==================== PREVIEW FUNCTIONS ====================
  async function previewPdf(file) {
    try {
      if (!window.pdfjsLib?.getDocument) {
        showError("PDF.js is niet geladen");
        return;
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      if (!previewContainer) return;
      previewContainer.innerHTML = "";
      safeSetDisplay(previewSection, "block");

      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      previewContainer.appendChild(canvas);
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Extract text from ALL pages for analysis
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const pg = await pdf.getPage(i);
        const textContent = await pg.getTextContent();
        const pageText = (textContent.items || []).map((it) => it.str).join(" ");
        fullText += pageText + " ";
      }

      currentTextContent = fullText.trim() || "(Geen tekst gevonden - mogelijk gescand document)";
    } catch (err) {
      console.error(err);
      showError("PDF preview mislukt");
    }
  }

  async function previewDocx(file) {
    try {
      if (!window.mammoth?.convertToHtml) {
        showError("Mammoth.js is niet geladen");
        return;
      }

      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.convertToHtml({ arrayBuffer });

      if (!previewContainer) return;
      previewContainer.innerHTML = "";
      safeSetDisplay(previewSection, "block");

      const wrapper = document.createElement("div");
      wrapper.style.padding = "12px";
      wrapper.style.border = "1px solid #e2e8f0";
      wrapper.style.background = "#fff";
      wrapper.style.borderRadius = "10px";
      wrapper.innerHTML = result.value || "_Leeg document_";

      wrapper.querySelectorAll("table").forEach((t) => {
        t.style.borderCollapse = "collapse";
        t.style.width = "100%";
      });
      wrapper.querySelectorAll("td,th").forEach((c) => {
        c.style.border = "1px solid #e2e8f0";
        c.style.padding = "6px";
        c.style.verticalAlign = "top";
      });

      previewContainer.appendChild(wrapper);

      const tmp = document.createElement("div");
      tmp.innerHTML = result.value || "";
      currentTextContent = tmp.textContent?.replace(/\s+/g, " ").trim() || "(Geen tekst)";
    } catch (err) {
      console.error(err);
      showError("DOCX preview mislukt");
    }
  }

  async function previewTxt(file) {
    try {
      const text = await file.text();
      currentTextContent = text.trim() || "(Leeg tekstbestand)";

      if (!previewContainer) return;
      previewContainer.innerHTML = "";
      safeSetDisplay(previewSection, "block");

      const pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.style.padding = "12px";
      pre.style.border = "1px solid #e2e8f0";
      pre.style.background = "#fff";
      pre.style.borderRadius = "10px";
      pre.textContent = text;
      previewContainer.appendChild(pre);
    } catch (err) {
      console.error(err);
      showError("TXT preview mislukt");
    }
  }

  async function previewFile(file) {
    if (!file) return;

    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".pdf")) return previewPdf(file);
    if (name.endsWith(".docx")) return previewDocx(file);
    if (name.endsWith(".txt")) return previewTxt(file);

    showError("Bestandstype niet ondersteund. Gebruik .pdf, .docx of .txt");
  }

  // ==================== ANALYSIS: TERMS + BUNDLES ====================
  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function findTermsInText(text) {
    const t = normalize(text);
    const foundMed = new Set();
    const foundPat = new Set();

    for (const b of ZORGBUNDELS || []) {
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
        : `<p><strong>Medisch lexicon:</strong></p><ul>${med
            .map((t) => `<li>${escapeHtml(t)}</li>`)
            .join("")}</ul>`;

    const patHtml =
      pat.length === 0
        ? "<p><strong>Patiëntlexicon:</strong> geen termen gevonden</p>"
        : `<p><strong>Patiëntlexicon:</strong></p><ul>${pat
            .map((t) => `<li>${escapeHtml(t)}</li>`)
            .join("")}</ul>`;

    foundTermsDiv.innerHTML = medHtml + patHtml;
  }

  function renderSuggestedBundles(bundles) {
    if (!suggestedBundlesDiv) return;

    if (!bundles || bundles.length === 0) {
      suggestedBundlesDiv.innerHTML = "<p>Geen bundels geselecteerd</p>";
      selectedBundles = [];
      safeDisable(generatePlanBtn, true);
      return;
    }

    suggestedBundlesDiv.innerHTML = `
      <div class="bundle-list">
        ${bundles
          .map((b) => {
            return `
              <label class="bundle-item">
                <input type="checkbox" data-bundle-nr="${escapeHtml(String(b.nr ?? ""))}" checked>
                <span><strong>${escapeHtml(b.naam || "Onbenoemde bundel")}</strong></span>
              </label>
            `;
          })
          .join("")}
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

  // ==================== ZORGPLAN GENERATIE (BASIS) ====================
  function buildZorgplanText() {
    const bundleNames = (selectedBundles || []).map((b) => b.naam).filter(Boolean);

    const prof = `
Zorgplan (professioneel)

Patiënt: ${patientNaam || "-"}
Geboortedatum: ${patientGeboortedatum || "-"}
Leeftijd: ${patientLeeftijd || "-"}

Geselecteerde zorgbundels:
- ${bundleNames.length ? bundleNames.join("\n- ") : "-"}

Gevonden termen (medisch):
- ${(foundMedicalTerms || []).length ? foundMedicalTerms.join("\n- ") : "-"}

Gevonden termen (patiënt):
- ${(foundPatientTerms || []).length ? foundPatientTerms.join("\n- ") : "-"}
`.trim();

    const patient = `
Zorgplan (patiënt)

Patiënt: ${patientNaam || "-"}

Wat we hebben herkend in je document:
- ${bundleNames.length ? bundleNames.join("\n- ") : "-"}
`.trim();

    return { prof, patient };
  }

  function renderZorgplan(view) {
    if (!zorgplanOutput) return;
    const txt = view === "patient" ? currentZorgplan.patient : currentZorgplan.prof;
    zorgplanOutput.innerHTML = `<pre style="white-space:pre-wrap">${escapeHtml(txt || "")}</pre>`;
  }

  // ==================== ACTIONS ====================
  function onExtractTerms() {
    if (!activeFile) {
      showError("Geen bestand geselecteerd");
      return;
    }

    stap2El?.classList.add("active");

    const terms = findTermsInText(currentTextContent || "");
    foundMedicalTerms = terms.medisch;
    foundPatientTerms = terms.patient;
    renderFoundTerms();

    const bundles = suggestBundles(currentTextContent || "");
    renderSuggestedBundles(bundles);

    safeSetHtml(medicatieInfoDiv, "<p>Geen medicatie-informatie beschikbaar</p>");
  }

  function onGeneratePlan() {
    stap3El?.classList.add("active");
    stap4El?.classList.add("active");

    currentZorgplan = buildZorgplanText();

    if (viewPatientRadio?.checked) renderZorgplan("patient");
    else renderZorgplan("prof");

    if (downloadBtn) downloadBtn.disabled = false;
    if (printBtn) printBtn.disabled = false;
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function onDownload() {
    const view = viewPatientRadio?.checked ? "patient" : "prof";
    const content = view === "patient" ? currentZorgplan.patient : currentZorgplan.prof;
    downloadText("zorgplan.txt", content || "");
  }

  function onPrint() {
    const view = viewPatientRadio?.checked ? "patient" : "prof";
    const content = view === "patient" ? currentZorgplan.patient : currentZorgplan.prof;

    const w = window.open("", "_blank");
    if (!w) return;

    w.document.open();
    w.document.write(`
      <html><head><title>Zorgplan</title>
      <meta charset="utf-8" />
      <style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:20px}
        pre{white-space:pre-wrap}
      </style>
      </head><body>
      <pre>${escapeHtml(content || "")}</pre>
      </body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
  }

  // ==================== EVENTS: UPLOAD UI ====================
  function bindUploadZone() {
    if (!uploadZone) return;

    uploadZone.addEventListener("click", () => fileInput?.click());

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
    fileInput.addEventListener("change", (e) => {
      handleFiles(e.target?.files || []);
      // belangrijk: laat opnieuw selecteren van dezelfde files toe
      // (change event vuurt soms niet als je exact dezelfde selectie herhaalt)
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

  // ==================== INIT ====================
  async function init() {
    safeDisable(extractBtn, true);
    safeDisable(generatePlanBtn, true);
    if (downloadBtn) downloadBtn.disabled = true;
    if (printBtn) printBtn.disabled = true;

    bindUploadZone();
    bindFileInput();
    bindButtons();

    await loadZorgbundelsData();

    resetWorkflow();
    resetPreview();
    renderUploadedList();
  }

  // Zorg dat dit pas start als DOM klaar is
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
