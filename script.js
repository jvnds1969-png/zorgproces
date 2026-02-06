/* ============================
   Zorgstart - COMPLETE WORKFLOW
   Document upload > Scraping > Lexicon matching > 
   Zorgbundels > Zorgplan generatie
   ============================ */

(() => {
  // ==================== ZORGBUNDELS DATA ====================
  // Geladen van: https://jvnds1969-png.github.io/Zorgbundels-en-probleemgebieden/
  let ZORGBUNDELS = [];
  
  // Fetch zorgbundels data bij startup
  async function loadZorgbundelsData() {
    try {
      const response = await fetch('https://jvnds1969-png.github.io/Zorgbundels-en-probleemgebieden/script.js');
      const scriptText = await response.text();
      
      // Extract const zorgbundels = [...] via regex
      const match = scriptText.match(/const\s+zorgbundels\s*=\s*(\[[\s\S]+?\]);/);
      if (match && match[1]) {
        // Safely evaluate the array
        ZORGBUNDELS = eval(match[1]);
        console.log(`✅ Geladen: ${ZORGBUNDELS.length} zorgbundels`);
      }
    } catch (error) {
      console.error('❌ Kan zorgbundels niet laden:', error);
      // Fallback: hardcoded subset (basis diabetesbundel)
      ZORGBUNDELS = [{
        nr: 1,
        naam: "Diabetes met verhoogd thuisrisico",
        medischLexicon: ["diabetes mellitus","DM2","insulinetherapie","orale antidiabetica"],
        patientLexicon: ["Ik heb suikerziekte","Mijn suiker schommelt"]
      }];
    }
  }

  // ==================== DOM ELEMENTS ====================
  const uploadZone = document.getElementById("uploadZone");
  let fileInput = document.getElementById("fileInput");
  
  // Create fileInput if missing
  if (!fileInput) {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'fileInput';
    input.accept = '.pdf,.docx,.txt';
    input.style.display = 'none';
    document.body.appendChild(input);
    fileInput = input;
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

  // ==================== STATE ====================
  let currentFile = null;
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
  function resetPreview() {
    previewContainer.innerHTML = "";
    previewSection.style.display = "none";
    currentTextContent = "";
  }

  function setUploadedUI(file) {
    documentList.innerHTML = "";
    const li = document.createElement("li");
    li.className = "uploaded-doc-item";
    
    const left = document.createElement("div");
    left.className = "uploaded-doc-left";
    left.innerHTML = `<strong>${escapeHtml(file.name)}</strong><div class="uploaded-doc-meta">${formatBytes(file.size)} • ${escapeHtml(file.type || "onbekend")}</div>`;
    
    const actions = document.createElement("div");
    actions.className = "uploaded-doc-actions";
    
    const btnPreview = document.createElement("button");
    btnPreview.type = "button";
    btnPreview.className = "btn-secondary";
    btnPreview.textContent = "Preview";
    btnPreview.addEventListener("click", () => previewFile(file));
    
    const btnRemove = document.createElement("button");
    btnRemove.type = "button";
    btnRemove.className = "btn-secondary";
    btnRemove.textContent = "Verwijder";
    btnRemove.addEventListener("click", () => removeCurrentFile());
    
    actions.appendChild(btnPreview);
    actions.appendChild(btnRemove);
    li.appendChild(left);
    li.appendChild(actions);
    documentList.appendChild(li);
    
    uploadedDocsTitle.style.display = "block";
    extractBtn.disabled = false;
  }

  function removeCurrentFile() {
    currentFile = null;
    fileInput.value = "";
    documentList.innerHTML = "";
    uploadedDocsTitle.style.display = "none";
    extractBtn.disabled = true;
    resetPreview();
    resetWorkflow();
  }

  function resetWorkflow() {
    currentTextContent = "";
    foundMedicalTerms = [];
    foundPatientTerms = [];
    selectedBundles = [];
    currentZorgplan = { prof: "", patient: "" };
    
    foundTermsDiv.innerHTML = "<p>Geen analyse uitgevoerd</p>";
    suggestedBundlesDiv.innerHTML = "<p>Geen bundels geselecteerd</p>";
    medicatieInfoDiv.innerHTML = "<p>Geen medicatie-informatie beschikbaar</p>";
    zorgplanOutput.innerHTML = "<p>Genereer eerst een zorgplan</p>";
    
    generatePlanBtn.disabled = true;
    document.getElementById("stap2").classList.remove("active");
    document.getElementById("stap3").classList.remove("active");
    document.getElementById("stap4").classList.remove("active");
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
      "\"": "&quot;",
      "'": "&#39;"
    }[m]));
  }

  function showError(msg) {
    previewContainer.innerHTML = `<div class="error-msg"><strong>Kan niet tonen</strong><p>${escapeHtml(msg)}</p></div>`;
    previewSection.style.display = "block";
  }

  // ==================== FILE HANDLING ====================
  function isAllowed(file) {
    const name = (file.name || "").toLowerCase();
    return name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".txt");
  }

  function handleFile(file) {
    if (!file) return;
    if (!isAllowed(file)) {
      showError("Bestandstype niet ondersteund. Gebruik .pdf, .docx of .txt");
      return;
    }
    currentFile = file;
    resetPreview();
    resetWorkflow();
    setUploadedUI(file);
    previewFile(file);
  }

  // ==================== PREVIEW FUNCTIONS ====================
  async function previewPdf(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      previewContainer.innerHTML = "";
      previewSection.style.display = "block";

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
        const pageText = (textContent.items || []).map(it => it.str).join(" ");
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
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.convertToHtml({ arrayBuffer });
      previewContainer.innerHTML = "";
      previewSection.style.display = "block";

      const wrapper = document.createElement("div");
      wrapper.style.padding = "12px";
      wrapper.style.border = "1px solid #e2e8f0";
      wrapper.style.background = "#fff";
      wrapper.style.borderRadius = "10px";
      wrapper.innerHTML = result.value || "_Leeg document_";
      
      wrapper.querySelectorAll("table").forEach(t => {
        t.style.borderCollapse = "collapse";
        t.style.width = "100%";
      });
      wrapper.querySelectorAll("td,th").forEach(c => {
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
      previewContainer.innerHTML = "";
      previewSection.style.display = "block";
      
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
    const
