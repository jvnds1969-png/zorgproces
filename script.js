/* ============================
   Zorgstart — Upload + Analyse (client-side)
   - Multi-upload (PDF/DOCX/TXT)
   - Preview
   - Extract text (PDF.js + Mammoth)
   - Lexicon matching (placeholder lexicon)
   - OnePatient login redirect (user-driven)
   - Upload placeholder (requires API/token/backend)
   ============================ */

(() => {
  // ---------------------------
  // CONFIG
  // ---------------------------
  const BINGLI_LOGIN_URL =
    "https://test.login.bingli.be/#/login?redirectUrl=" +
    encodeURIComponent("https://test.onepatient.bingli.be/auth-callback");

  // !!! Belangrijk:
  // In pure frontend kan je niet betrouwbaar “token” uit OnePatient/Bingli halen,
  // tenzij er een gedocumenteerde flow is die een token teruggeeft aan jouw origin.
  // Daarom is uploadToOnePatient() hieronder een placeholder.

  // Voorbeeld lexicon (vervang door jouw echte lexicon-lijst)
  // Tip: laad dit via fetch('lexicon.json') als je het extern wil beheren.
  const LEXICON = [
    "diabetes",
    "hypertensie",
    "valrisico",
    "wondzorg",
    "anticoagulantia",
    "palliatief",
    "delier",
    "COPD",
    "hartfalen",
    "mobiliteit",
    "incontinentie",
    "voeding",
    "cognitie"
  ];

  // ---------------------------
  // DOM
  // ---------------------------
  const el = {
    patientNaam: document.getElementById("patientNaam"),
    patientGeboortedatum: document.getElementById("patientGeboortedatum"),
    patientLeeftijd: document.getElementById("patientLeeftijd"),

    uploadZone: document.getElementById("uploadZone"),
    fileInput: document.getElementById("fileInput"),
    uploadedDocsTitle: document.getElementById("uploadedDocsTitle"),
    documentList: document.getElementById("documentList"),

    documentPreviewSection: document.getElementById("documentPreviewSection"),
    documentPreviewContainer: document.getElementById("documentPreviewContainer"),

    analysisStatus: document.getElementById("analysisStatus"),

    extractTerms: document.getElementById("extractTerms"),
    openBingliLogin: document.getElementById("openBingliLogin"),
    uploadToOnePatientBtn: document.getElementById("uploadToOnePatientBtn"),

    foundTerms: document.getElementById("foundTerms"),
    suggestedBundles: document.getElementById("suggestedBundles"),
    medicatieInfo: document.getElementById("medicatieInfo"),

    stap2: document.getElementById("stap2"),
  };

  // ---------------------------
  // STATE
  // ---------------------------
  /** @type {{id:string, file:File, name:string, type:string, size:number, text?:string}[]} */
  let docs = [];
  let activeDocId = null;

  // ---------------------------
  // HELPERS
  // ---------------------------
  function uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
  }

  function showStatus(msg, kind = "info") {
    el.analysisStatus.style.display = "block";
    el.analysisStatus.textContent = msg;
    el.analysisStatus.dataset.kind = kind;
  }

  function clearStatus() {
    el.analysisStatus.style.display = "none";
    el.analysisStatus.textContent = "";
    delete el.analysisStatus.dataset.kind;
  }

  function setButtons() {
    const hasDocs = docs.length > 0;
    el.extractTerms.disabled = !hasDocs;
    el.openBingliLogin.disabled = !hasDocs;
    // Upload naar OnePatient pas mogelijk als jij een token/endpoint configureert
    el.uploadToOnePatientBtn.disabled = !hasDocs;
  }

  function calcAge(dateStr) {
    if (!dateStr) return null;
    const dob = new Date(dateStr);
    if (Number.isNaN(dob.getTime())) return null;

    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  }

  function humanSize(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    let v = bytes, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function escapeHtml(str) {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------------------------
  // RENDER
  // ---------------------------
  function renderDocList() {
    el.documentList.innerHTML = "";
    if (docs.length === 0) {
      el.uploadedDocsTitle.style.display = "none";
      el.documentPreviewSection.style.display = "none";
      el.documentPreviewContainer.innerHTML = "";
      activeDocId = null;
      return;
    }

    el.uploadedDocsTitle.style.display = "block";

    docs.forEach((d) => {
      const li = document.createElement("li");
      li.className = "uploaded-document-item";
      li.dataset.id = d.id;

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "2px";

      const title = document.createElement("div");
      title.innerHTML = `<strong>${escapeHtml(d.name)}</strong>`;

      const meta = document.createElement("div");
      meta.style.opacity = "0.75";
      meta.style.fontSize = "0.9em";
      meta.textContent = `${d.type || "unknown"} • ${humanSize(d.size)}`;

      left.appendChild(title);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      const btnView = document.createElement("button");
      btnView.className = "btn-secondary";
      btnView.type = "button";
      btnView.textContent = "Preview";
      btnView.addEventListener("click", () => previewDoc(d.id));

      const btnRemove = document.createElement("button");
      btnRemove.className = "btn-secondary";
      btnRemove.type = "button";
      btnRemove.textContent = "Verwijder";
      btnRemove.addEventListener("click", () => removeDoc(d.id));

      actions.appendChild(btnView);
      actions.appendChild(btnRemove);

      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";
      li.style.gap = "12px";

      li.appendChild(left);
      li.appendChild(actions);

      el.documentList.appendChild(li);
    });
  }

  async function previewDoc(docId) {
    const d = docs.find(x => x.id === docId);
    if (!d) return;

    activeDocId = docId;
    el.documentPreviewSection.style.display = "block";
    el.documentPreviewContainer.innerHTML = "<div>Preview laden…</div>";

    try {
      // Voor preview: toon korte text-extract (sneller + uniform)
      const text = await extractTextFromFile(d.file);
      d.text = text;

      const snippet = text.trim().slice(0, 4000);
      el.documentPreviewContainer.innerHTML =
        `<pre style="white-space:pre-wrap; margin:0;">${escapeHtml(snippet || "(geen tekst gevonden)")}</pre>`;
    } catch (e) {
      el.documentPreviewContainer.innerHTML =
        `<div style="color:#b00020;">Kon preview niet maken: ${escapeHtml(String(e?.message || e))}</div>`;
    }
  }

  function removeDoc(docId) {
    docs = docs.filter(d => d.id !== docId);
    if (activeDocId === docId) activeDocId = null;
    renderDocList();
    setButtons();
    if (docs.length === 0) clearStatus();
  }

  // ---------------------------
  // FILE INGESTION
  // ---------------------------
  function addFiles(fileList) {
    const arr = Array.from(fileList || []);
    if (arr.length === 0) return;

    const allowed = new Set(["application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain"
    ]);

    arr.forEach((file) => {
      // accept via ext fallback
      const nameLower = (file.name || "").toLowerCase();
      const okByExt = nameLower.endsWith(".pdf") || nameLower.endsWith(".docx") || nameLower.endsWith(".txt");
      const ok = allowed.has(file.type) || okByExt;

      if (!ok) return;

      docs.push({
        id: uid(),
        file,
        name: file.name,
        type: file.type || (nameLower.endsWith(".pdf") ? "application/pdf" : nameLower.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain"),
        size: file.size
      });
    });

    renderDocList();
    setButtons();

    // Auto-preview eerste doc als er nog geen actieve is
    if (!activeDocId && docs.length > 0) {
      previewDoc(docs[0].id);
    }
  }

  // ---------------------------
  // TEXT EXTRACTION
  // ---------------------------
  async function extractTextFromFile(file) {
    const nameLower = (file.name || "").toLowerCase();

    if (file.type === "application/pdf" || nameLower.endsWith(".pdf")) {
      return await extractTextFromPdf(file);
    }
    if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      nameLower.endsWith(".docx")
    ) {
      return await extractTextFromDocx(file);
    }
    if (file.type === "text/plain" || nameLower.endsWith(".txt")) {
      return await file.text();
    }

    // fallback: try as text
    return await file.text();
  }

  async function extractTextFromDocx(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return (result?.value || "").trim();
  }

  async function extractTextFromPdf(file) {
    // PDF.js worker config
    // eslint-disable-next-line no-undef
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const data = new Uint8Array(await file.arrayBuffer());
    // eslint-disable-next-line no-undef
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(it => it.str);
      fullText += strings.join(" ") + "\n";
    }
    return fullText.trim();
  }

  // ---------------------------
  // LEXICON MATCHING + PROBLEEMGEBIEDEN
  // ---------------------------
  function findLexiconTerms(text) {
    const t = (text || "").toLowerCase();
    const hits = [];

    for (const term of LEXICON) {
      const norm = term.toLowerCase().trim();
      if (!norm) continue;

      // eenvoudige woordgrens matching (best effort)
      const re = new RegExp(`\\b${escapeRegExp(norm)}\\b`, "i");
      if (re.test(t)) hits.push(term);
    }
    return Array.from(new Set(hits));
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function inferProblemAreas(terms) {
    // Placeholder mapping (vervang door jouw echte mapping naar probleemgebieden/zorgbundels)
    const map = [
      { area: "Chronische aandoeningen", keys: ["diabetes", "hypertensie", "COPD", "hartfalen"] },
      { area: "Valpreventie & mobiliteit", keys: ["valrisico", "mobiliteit"] },
      { area: "Wondzorg", keys: ["wondzorg"] },
      { area: "Medicatie & therapietrouw", keys: ["anticoagulantia"] },
      { area: "Cognitie & delier", keys: ["cognitie", "delier"] },
      { area: "Voeding", keys: ["voeding"] },
      { area: "Incontinentie", keys: ["incontinentie"] },
      { area: "Palliatieve zorg", keys: ["palliatief"] },
    ];

    const out = [];
    for (const row of map) {
      if (row.keys.some(k => terms.map(x => x.toLowerCase()).includes(k.toLowerCase()))) {
        out.push(row.area);
      }
    }
    return out.length ? out : ["(Nog geen probleemgebieden gevonden — lexicon uitbreiden of tekstextract checken)"];
  }

  function gotoStep2() {
    document.querySelectorAll(".workflow-step").forEach(s => s.classList.remove("active"));
    el.stap2.classList.add("active");
    el.stap2.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------------------
  // ONEPATIENT/BINGLI FLOW (SAFE)
  // ---------------------------
  function openBingliLogin() {
    // User-driven login (geen automatische credential handling)
    window.open(BINGLI_LOGIN_URL, "_blank", "noopener,noreferrer");
    showStatus("Login-scherm geopend in een nieuw tabblad. Log in en ga terug naar Zorgstart om te uploaden.", "info");
  }

  async function uploadToOnePatient() {
    // ⚠️ Dit is een placeholder: je hebt een documented endpoint + token nodig
    // Opties:
    // 1) Backend/proxy (aanbevolen)
    // 2) Frontend direct, maar alleen als API CORS toestaat en je een bearer token hebt

    // Voorbeeld van wat je nodig hebt:
    // const token = "..."; // via backend of officiële flow
    // const endpoint = "https://test.onepatient.bingli.be/api/.../documents";

    throw new Error(
      "Upload naar OnePatient is nog niet geconfigureerd: API endpoint + auth token ontbreken. " +
      "Geef je developer de OnePatient/Bingli API specs (upload endpoint + auth), of zet een kleine proxy."
    );
  }

  // ---------------------------
  // EVENTS
  // ---------------------------
  el.patientGeboortedatum.addEventListener("change", () => {
    const age = calcAge(el.patientGeboortedatum.value);
    el.patientLeeftijd.textContent = (age === null ? "-" : String(age));
  });

  el.uploadZone.addEventListener("click", () => el.fileInput.click());
  el.uploadZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") el.fileInput.click();
  });

  el.fileInput.addEventListener("change", (e) => {
    addFiles(e.target.files);
    // reset zodat dezelfde file opnieuw kan gekozen worden
    el.fileInput.value = "";
  });

  el.uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.uploadZone.classList.add("dragover");
  });
  el.uploadZone.addEventListener("dragleave", () => {
    el.uploadZone.classList.remove("dragover");
  });
  el.uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.uploadZone.classList.remove("dragover");
    addFiles(e.dataTransfer.files);
  });

  el.openBingliLogin.addEventListener("click", openBingliLogin);

  el.uploadToOnePatientBtn.addEventListener("click", async () => {
    try {
      showStatus("Upload naar OnePatient starten…", "info");
      await uploadToOnePatient();
      showStatus("Upload gelukt.", "success");
    } catch (e) {
      showStatus(String(e?.message || e), "error");
    }
  });

  el.extractTerms.addEventListener("click", async () => {
    if (docs.length === 0) return;

    try {
      showStatus("Tekst extraheren uit documenten…", "info");

      // Extract text for all docs
      for (const d of docs) {
        if (!d.text) d.text = await extractTextFromFile(d.file);
      }

      const combinedText = docs.map(d => `--- ${d.name} ---\n${d.text || ""}`).join("\n\n");
      const terms = findLexiconTerms(combinedText);
      const areas = inferProblemAreas(terms);

      el.foundTerms.innerHTML = terms.length
        ? `<ul>${terms.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
        : "<div>(Geen lexicon-termen gevonden)</div>";

      el.suggestedBundles.innerHTML =
        `<ul>${areas.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul>`;

      el.medicatieInfo.innerHTML =
        `<pre style="white-space:pre-wrap; margin:0;">${escapeHtml(combinedText.slice(0, 20000))}</pre>`;

      showStatus("Analyse klaar. (Volgende stap: PHR-aanmaak via OnePatient upload/API)", "success");
      gotoStep2();
    } catch (e) {
      showStatus(`Analyse faalde: ${String(e?.message || e)}`, "error");
    }
  });

  // init
  clearStatus();
  setButtons();
})();
