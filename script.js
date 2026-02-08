/* ============================
   ZORGSTART - COMPLETE WORKFLOW
   OnePatient Integration + Zorgplan Generator
   ============================ */

(() => {
  "use strict";

  // ==================== CONFIGURATIE ====================
  const CONFIG = {
    onePatientLoginUrl: "https://test.login.bingli.be/#/login?redirectUrl=https%3A%2F%2Ftest.onepatient.bingli.be%2Fauth-callback",
    onePatientDashboard: "https://test.onepatient.bingli.be/dashboard",
    onePatientUser: "jan.avonds@altrio.be",
    zorgbundelsUrl: "https://jvnds1969-png.github.io/Zorgbundels-en-probleemgebieden/script.js",
    providersUrl: "https://jvnds1969-png.github.io/Zorgverleners/providers.json",
    bcfiUrl: "https://www.bcfi.be/nl/chapters"
  };

  // ==================== STATE ====================
  let ZORGBUNDELS = [];
  let PROVIDERS = [];
  let uploadedFiles = [];
  let activeFile = null;
  let patientData = { naam: "", geboortedatum: "", leeftijd: 0 };
  let phrData = null; // PHR van OnePatient
  let foundTerms = { medisch: [], patient: [] };
  let selectedBundles = [];
  let currentZorgplan = { prof: "", patient: "" };
  let onePatientWindow = null;

  // ==================== DOM ELEMENTS ====================
  const $ = (id) => document.getElementById(id);
  const uploadZone = $("uploadZone");
  const fileInput = $("fileInput");
  const documentList = $("documentList");
  const uploadedDocsTitle = $("uploadedDocsTitle");
  const previewSection = $("documentPreviewSection");
  const previewContainer = $("documentPreviewContainer");
  const extractBtn = $("extractTerms");
  const patientNaamInput = $("patientNaam");
  const patientGeboortedatumInput = $("patientGeboortedatum");
  
  // Stap 2
  const foundTermsDiv = $("foundTerms");
  const suggestedBundlesDiv = $("suggestedBundles");
  const medicatieInfoDiv = $("medicatieInfo");
  const generatePlanBtn = $("generatePlan");
  
  // Stap 3 & 4
  const viewProfRadio = $("viewProf");
  const viewPatientRadio = $("viewPatient");
  const zorgplanOutput = $("zorgplanOutput");
  const downloadBtn = $("downloadPlan");
  const printBtn = $("printPlan");

  // Status indicator (nieuw element)
  let statusDiv = null;

  // ==================== PDF.js WORKER ====================
  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // ==================== INIT ====================
  async function init() {
    createStatusIndicator();
    updateStatus("Systeem laden...", "loading");
    
    // Laad zorgbundels data
    await loadZorgbundelsData();
    
    // Laad providers data
    await loadProvidersData();
    
    // Bind events
    bindEvents();
    
    // Reset UI
    resetUI();
    
    updateStatus("Klaar om documenten te ontvangen", "ready");
  }

  function createStatusIndicator() {
    statusDiv = document.createElement("div");
    statusDiv.id = "statusIndicator";
    statusDiv.className = "status-indicator";
    const step1 = document.querySelector("#stap1 .step-content");
    if (step1) {
      step1.insertBefore(statusDiv, step1.firstChild);
    }
  }

  function updateStatus(message, type = "info") {
    if (!statusDiv) return;
    const icons = {
      loading: "⏳",
      ready: "✅",
      error: "❌",
      info: "ℹ️",
      warning: "⚠️",
      onepatient: "🏥"
    };
    statusDiv.innerHTML = `<span class="status-icon">${icons[type] || "ℹ️"}</span> ${message}`;
    statusDiv.className = `status-indicator status-${type}`;
  }

  // ==================== DATA LOADING ====================
  async function loadZorgbundelsData() {
    try {
      const response = await fetch(CONFIG.zorgbundelsUrl, { cache: "no-store" });
      const scriptText = await response.text();
      const match = scriptText.match(/const\s+zorgbundels\s*=\s*(\[[\s\S]+?\]);/);
      if (match && match[1]) {
        ZORGBUNDELS = eval(match[1]);
        console.log(`✅ Geladen: ${ZORGBUNDELS.length} zorgbundels`);
      }
    } catch (error) {
      console.error("❌ Kan zorgbundels niet laden:", error);
      // Fallback
      ZORGBUNDELS = [
        { nr: 1, naam: "Diabetes", medischLexicon: ["diabetes mellitus", "DM2"], patientLexicon: ["Ik heb suikerziekte"] }
      ];
    }
  }

  async function loadProvidersData() {
    try {
      const response = await fetch(CONFIG.providersUrl, { cache: "no-store" });
      PROVIDERS = await response.json();
      console.log(`✅ Geladen: ${PROVIDERS.length} providers`);
    } catch (error) {
      console.error("❌ Kan providers niet laden:", error);
      PROVIDERS = [];
    }
  }

  // ==================== EVENT BINDING ====================
  function bindEvents() {
    // Upload zone
    uploadZone?.addEventListener("click", () => fileInput?.click());
    uploadZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragover");
    });
    uploadZone?.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
    uploadZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragover");
      handleFiles(e.dataTransfer?.files);
    });
    
    fileInput?.addEventListener("change", (e) => {
      handleFiles(e.target.files);
      e.target.value = "";
    });

    // Patient gegevens
    patientNaamInput?.addEventListener("input", updatePatientData);
    patientGeboortedatumInput?.addEventListener("change", updatePatientData);

    // Analyseer knop - DIT IS DE HOOFDTRIGGER
    extractBtn?.addEventListener("click", startAnalyseWorkflow);

    // Genereer zorgplan
    generatePlanBtn?.addEventListener("click", generateZorgplan);

    // Weergave wisselen
    viewProfRadio?.addEventListener("change", () => renderZorgplan("prof"));
    viewPatientRadio?.addEventListener("change", () => renderZorgplan("patient"));

    // Download/Print
    downloadBtn?.addEventListener("click", downloadZorgplan);
    printBtn?.addEventListener("click", printZorgplan);
  }

  // ==================== PATIENT DATA ====================
  function updatePatientData() {
    patientData.naam = patientNaamInput?.value || "";
    patientData.geboortedatum = patientGeboortedatumInput?.value || "";
    
    if (patientData.geboortedatum) {
      const birthDate = new Date(patientData.geboortedatum);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      patientData.leeftijd = age;
    }
  }

  // ==================== FILE HANDLING ====================
  function handleFiles(files) {
    if (!files || files.length === 0) return;
    
    const allowed = Array.from(files).filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".txt");
    });

    if (allowed.length === 0) {
      updateStatus("Alleen PDF, DOCX of TXT bestanden toegestaan", "error");
      return;
    }

    allowed.forEach(file => {
      if (!uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
        uploadedFiles.push(file);
      }
    });

    activeFile = allowed[allowed.length - 1];
    renderUploadedList();
    previewFile(activeFile);
    
    if (extractBtn) extractBtn.disabled = false;
    updateStatus(`${uploadedFiles.length} document(en) geladen - Klaar voor analyse`, "ready");
  }

  function renderUploadedList() {
    if (!documentList) return;
    documentList.innerHTML = "";
    
    uploadedFiles.forEach((file, idx) => {
      const li = document.createElement("li");
      li.className = "uploaded-doc-item";
      
      const isActive = file === activeFile;
      li.innerHTML = `
        <div class="uploaded-doc-left">
          <strong>${escapeHtml(file.name)}</strong>
          <div class="uploaded-doc-meta">${formatBytes(file.size)} • ${file.type || "onbekend"}</div>
          ${isActive ? '<div class="active-badge">Actief document</div>' : ''}
        </div>
        <div class="uploaded-doc-actions">
          <button type="button" class="btn-secondary btn-preview" data-idx="${idx}">Preview</button>
          <button type="button" class="btn-secondary btn-remove" data-idx="${idx}">Verwijder</button>
        </div>
      `;
      documentList.appendChild(li);
    });

    // Event listeners voor knoppen
    documentList.querySelectorAll(".btn-preview").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        activeFile = uploadedFiles[idx];
        renderUploadedList();
        previewFile(activeFile);
      });
    });

    documentList.querySelectorAll(".btn-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        uploadedFiles.splice(idx, 1);
        if (activeFile && !uploadedFiles.includes(activeFile)) {
          activeFile = uploadedFiles[uploadedFiles.length - 1] || null;
        }
        renderUploadedList();
        if (activeFile) previewFile(activeFile);
        else resetPreview();
        if (extractBtn) extractBtn.disabled = uploadedFiles.length === 0;
      });
    });

    if (uploadedDocsTitle) {
      uploadedDocsTitle.style.display = uploadedFiles.length > 0 ? "block" : "none";
    }
  }

  // ==================== PREVIEW ====================
  async function previewFile(file) {
    if (!file || !previewContainer) return;
    
    previewContainer.innerHTML = '<div class="loading">Document laden...</div>';
    if (previewSection) previewSection.style.display = "block";

    const name = file.name.toLowerCase();
    
    try {
      if (name.endsWith(".pdf")) {
        await previewPdf(file);
      } else if (name.endsWith(".docx")) {
        await previewDocx(file);
      } else if (name.endsWith(".txt")) {
        await previewTxt(file);
      }
    } catch (err) {
      console.error(err);
      previewContainer.innerHTML = `<div class="error-msg">Preview mislukt: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function previewPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    previewContainer.innerHTML = "";
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    previewContainer.appendChild(canvas);
    
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: viewport
    }).promise;
  }

  async function previewDocx(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.convertToHtml({ arrayBuffer });
    previewContainer.innerHTML = `<div class="docx-preview">${result.value || "<em>Leeg document</em>"}</div>`;
  }

  async function previewTxt(file) {
    const text = await file.text();
    previewContainer.innerHTML = `<pre class="txt-preview">${escapeHtml(text)}</pre>`;
  }

  function resetPreview() {
    if (previewContainer) previewContainer.innerHTML = "";
    if (previewSection) previewSection.style.display = "none";
  }

  // ==================== HOOFDWORKFLOW: ANALYSEER ====================
  async function startAnalyseWorkflow() {
    if (uploadedFiles.length === 0) {
      updateStatus("Geen documenten geselecteerd", "error");
      return;
    }

    updatePatientData();
    
    if (!patientData.naam || !patientData.geboortedatum) {
      updateStatus("Vul eerst patiëntnaam en geboortedatum in", "warning");
      return;
    }

    // STAP 1: Open OnePatient en login
    updateStatus("OnePatient openen en inloggen...", "onepatient");
    
    const loginSuccess = await openOnePatientAndLogin();
    if (!loginSuccess) {
      updateStatus("OnePatient login niet bevestigd - Ga verder in demo-modus", "warning");
    }

    // STAP 2: Verstuur documenten naar OnePatient (gesimuleerd in testfase)
    updateStatus
