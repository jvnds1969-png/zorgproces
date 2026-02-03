/* script.js — Zorgplanproces (client-side)
   - Upload: PDF/TXT/JSON
   - PDF tekst extractie met pdf.js
   - Lexicon-matching + bundelvoorstel
   - Geen upload naar OnePatient (geen API)
*/

(() => {
  // ========================
  // Helpers
  // ========================
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function norm(s) {
    return String(s || "").toLowerCase();
  }

  // ========================
  // PDF.js (veilig initialiseren)
  // ========================
  function ensurePdfJs() {
    if (!window.pdfjsLib) throw new Error("pdf.js is niet geladen. Check je <script src=...pdf.min.js> vóór script.js.");
    // CDN worker
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";
    } catch (_) {}
  }

  async function extractTextFromPdf(file) {
    ensurePdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;

    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((it) => it.str);
      text += `\n\n--- Pagina ${i} ---\n` + strings.join(" ");
    }
    return text;
  }

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Kon het bestand niet lezen."));
      reader.onload = (e) => resolve(String(e.target.result || ""));
      reader.readAsText(file);
    });
  }

  // ========================
  // State
  // ========================
  let uploadedDocuments = [];
  let extractedTerms = [];
  let matchedBundles = [];
  let selectedBundles = [];
  let planMode = "professional"; // default

  // ========================
  // DOM Ready
  // ========================
  document.addEventListener("DOMContentLoaded", () => {
    // Elementen (moeten bestaan in je HTML)
    const uploadZone = $("uploadZone");
    const fileInput = $("fileInput");
    const uploadedFiles = $("uploadedFiles");
    const startAnalyse = $("startAnalyse");

    const extractedData = $("extractedData");
    const lexiconMatches = $("lexiconMatches");
    const problemAreas = $("problemAreas");
    const suggestedBundles = $("suggestedBundles");
    const carePlan = $("carePlan");
    const recommendedProviders = $("recommendedProviders");

    const btnProfessional = $("btnProfessional");
    const btnPatient = $("btnPatient");
    const exportPlan = $("exportPlan");

    const patientInfo = $("patientInfo");
    const saveToHospital = $("saveToHospital");

    // Basis checks (zodat je meteen ziet als een ID ontbreekt)
    const mustHave = [
      uploadZone, fileInput, uploadedFiles, startAnalyse,
      extractedData, lexiconMatches, problemAreas, suggestedBundles,
      carePlan, recommendedProviders, btnProfessional, btnPatient, exportPlan,
      patientInfo, saveToHospital
    ];
    if (mustHave.some((x) => !x)) {
      console.error("Niet alle verplichte HTML elementen zijn gevonden. Check je id's in de HTML.");
    }

    // ========================
    // Upload UI events
    // ========================
    uploadZone.addEventListener("click", () => fileInput.click());

    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragover");
    });
    uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragover");
      if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
    });

    fileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) addFiles(files);
      fileInput.value = ""; // reset
    });

    function addFiles(files) {
      // filter: pdf/txt/json
      const allowed = files.filter((f) => {
        const name = f.name.toLowerCase();
        return name.endsWith(".pdf") || name.endsWith(".txt") || name.endsWith(".json");
      });

      if (allowed.length === 0) {
        alert("⚠️ Upload enkel PDF, TXT of JSON.");
        return;
      }

      uploadedDocuments.push(...allowed);
      renderUploadedFiles();
    }

    function renderUploadedFiles() {
      if (uploadedDocuments.length === 0) {
        uploadedFiles.classList.add("hidden");
        startAnalyse.classList.add("hidden");
        uploadZone.classList.remove("hidden");
        return;
      }

      uploadZone.classList.add("hidden");
      uploadedFiles.classList.remove("hidden");
      startAnalyse.classList.remove("hidden");

      uploadedFiles.innerHTML = uploadedDocuments
        .map(
          (file, index) => `
          <div class="file-item">
            <span class="file-icon">📄</span>
            <span class="file-name">${escapeHtml(file.name)}</span>
            <button type="button" class="remove-btn" data-index="${index}">❌</button>
          </div>`
        )
        .join("");

      uploadedFiles.querySelectorAll(".remove-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-index"));
          uploadedDocuments.splice(idx, 1);
          renderUploadedFiles();
          if (uploadedDocuments.length === 0) resetAll();
        });
      });
    }

    // ========================
    // Analyse flow
    // ========================
    startAnalyse.addEventListener("click", async () => {
      if (uploadedDocuments.length === 0) return;

      resetAll(false); // reset output, behoud uploads
      extractedData.innerHTML = `<div class="loading">Analyseren van ${uploadedDocuments.length} document(en)...</div>`;

      try {
        const contents = [];
        for (const file of uploadedDocuments) {
          const lower = file.name.toLowerCase();
          if (lower.endsWith(".pdf")) {
            const pdfText = await extractTextFromPdf(file);
            contents.push(`\n--- ${file.name} ---\n${pdfText}\n`);
          } else {
            const text = await readTextFile(file);
            contents.push(`\n--- ${file.name} ---\n${text}\n`);
          }
        }

        const allContent = contents.join("\n");
        analyzeContent(allContent, uploadedDocuments.map((f) => f.name).join(", "));
      } catch (err) {
        console.error(err);
        extractedData.innerHTML = `<div class="extracted-item" style="color:#ef4444">
          Fout bij analyse: ${escapeHtml(err.message || String(err))}
        </div>`;
      }
    });

    function analyzeContent(content, filenameList) {
      const text = norm(content);
      const foundTerms = new Set();

      // zorgbundels komt uit je HTML inline script (const zorgbundels = [...])
      if (!Array.isArray(window.zorgbundels) && typeof zorgbundels === "undefined") {
        extractedData.innerHTML = `<div class="extracted-item" style="color:#ef4444">
          Ik vind de variabele <strong>zorgbundels</strong> niet. Zorg dat die nog in de pagina bestaat.
        </div>`;
        return;
      }
      const bundles = (typeof zorgbundels !== "undefined") ? zorgbundels : window.zorgbundels;

      bundles.forEach((bundle) => {
        [...(bundle.medischLexicon || []), ...(bundle.patientLexicon || [])].forEach((term) => {
          if (term && text.includes(norm(term))) foundTerms.add(term);
        });
      });

      extractedTerms = [...foundTerms];

      if (extractedTerms.length > 0) {
        extractedData.innerHTML =
          `<div class="extracted-item"><strong>Bestanden:</strong> ${escapeHtml(filenameList)}</div>` +
          `<div class="extracted-item"><strong>Gevonden termen:</strong> ${escapeHtml(extractedTerms.join(", "))}</div>` +
          `<div class="extracted-item"><strong>Totaal:</strong> ${extractedTerms.length} termen gedetecteerd</div>`;
      } else {
        extractedData.innerHTML =
          `<div class="extracted-item"><strong>Bestanden:</strong> ${escapeHtml(filenameList)}</div>` +
          `<div class="extracted-item" style="color:#ef4444">Geen lexicon-termen gevonden. (Bij PDF: check of het geen gescande afbeelding is.)</div>`;
      }

      matchWithLexicon(bundles);
    }

    function matchWithLexicon(bundles) {
      matchedBundles = [];
      const matchedTerms = [];

      extractedTerms.forEach((term) => {
        const termLower = norm(term);

        bundles.forEach((bundle) => {
          const allTerms = [...(bundle.medischLexicon || []), ...(bundle.patientLexicon || [])];

          allTerms.forEach((lexTerm) => {
            const a = termLower;
            const b = norm(lexTerm);
            if (!a || !b) return;

            if (a.includes(b) || b.includes(a)) {
              if (!matchedBundles.includes(bundle)) matchedBundles.push(bundle);
              matchedTerms.push({ term, lexicon: lexTerm, bundle: bundle.naam });
            }
          });
        });
      });

      lexiconMatches.innerHTML =
        matchedTerms.length > 0
          ? matchedTerms
              .slice(0, 80)
              .map(
                (m) =>
                  `<span class="match-tag" title="${escapeHtml(m.bundle)}">${escapeHtml(
                    m.term
                  )} - ${escapeHtml(m.lexicon)}</span>`
              )
              .join("")
          : "<p>Geen matches gevonden</p>";

      renderProblemAreas(bundles);
    }

    function renderProblemAreas(bundles) {
      if (matchedBundles.length === 0) {
        problemAreas.innerHTML = `<p class="empty">Geen probleemgebieden gedetecteerd. Upload een document met medische tekst.</p>`;
        suggestedBundles.innerHTML = "";
        carePlan.innerHTML = "";
        recommendedProviders.innerHTML = "";
        exportPlan.classList.add("hidden");
        return;
      }

      problemAreas.innerHTML = matchedBundles
        .map(
          (bundle) => `
          <div class="problem-card" data-nr="${bundle.nr}">
            <label>
              <input type="checkbox" checked data-nr="${bundle.nr}">
              <span class="problem-name">${bundle.nr}. ${escapeHtml(bundle.naam)}</span>
            </label>
            <p class="problem-desc">${escapeHtml(bundle.klinisch || "")}</p>
          </div>`
        )
        .join("");

      selectedBundles = [...matchedBundles];

      problemAreas.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener("change", () => {
          const nr = Number(cb.getAttribute("data-nr"));
          toggleBundle(nr, bundles);
        });
      });

      renderSuggestedBundles();
    }

    function toggleBundle(nr, bundles) {
      const bundle = bundles.find((b) => b.nr === nr);
      const idx = selectedBundles.findIndex((b) => b.nr === nr);
      if (idx > -1) selectedBundles.splice(idx, 1);
      else if (bundle) selectedBundles.push(bundle);

      renderSuggestedBundles();
      renderCarePlan();
      renderProviders();
    }

    function renderSuggestedBundles() {
      if (selectedBundles.length === 0) {
        suggestedBundles.innerHTML = '<p class="empty">Selecteer probleemgebieden</p>';
        return;
      }

      suggestedBundles.innerHTML = selectedBundles
        .map(
          (b) => `
          <div class="bundle-card">
            <h4>${b.nr}. ${escapeHtml(b.naam)}</h4>
            <div class="bundle-details">
              <div class="detail-row"><strong>Klinisch:</strong> ${escapeHtml(b.klinisch || "")}</div>
              <div class="detail-row"><strong>Educatie:</strong> ${escapeHtml(b.educatie || "")}</div>
              <div class="detail-row"><strong>Functioneel:</strong> ${escapeHtml(b.functioneel || "")}</div>
              <div class="detail-row"><strong>Coördinatie:</strong> ${escapeHtml(b.coordinatie || "")}</div>
              <div class="detail-row alert"><strong>Monitoring:</strong> ${escapeHtml(b.monitoring || "")}</div>
            </div>
          </div>`
        )
        .join("");

      renderCarePlan();
      renderProviders();
    }

    // ========================
    // Zorgplan toggle
    // ========================
    btnProfessional.addEventListener("click", () => {
      planMode = "professional";
      btnProfessional.classList.add("active");
      btnPatient.classList.remove("active");
      renderCarePlan();
    });

    btnPatient.addEventListener("click", () => {
      planMode = "patient";
      btnPatient.classList.add("active");
      btnProfessional.classList.remove("active");
      renderCarePlan();
    });

    function simplifyName(name) {
      const map = {
        "Diabetes met verhoogd thuisrisico": "Uw suikerziekte",
        "Polyfarmacie en medicatieveiligheid": "Uw medicijnen",
        "Cardiovasculair hoog risico": "Uw hart en bloedvaten",
        "Functionele achteruitgang en valrisico": "Veilig bewegen",
        "Cognitieve kwetsbaarheid": "Uw geheugen",
        "Psychosociaal lijden en eenzaamheid": "Uw gemoedstoestand",
      };
      return map[name] || name;
    }

    function simplifyText(text) {
      return String(text || "").replace(/\./g, ". ").replace(/,/g, ", ");
    }

    function renderCarePlan() {
      if (selectedBundles.length === 0) {
        carePlan.innerHTML = '<p class="empty">Selecteer zorgbundels om zorgplan te genereren</p>';
        exportPlan.classList.add("hidden");
        patientInfo.classList.add("hidden");
        return;
      }

      if (planMode === "professional") {
        carePlan.innerHTML = `
          <div class="plan-professional">
            <h3>Professioneel Zorgplan</h3>
            ${selectedBundles
              .map(
                (b) => `
              <div class="plan-section">
                <h4>${b.nr}. ${escapeHtml(b.naam)}</h4>
                <table class="plan-table">
                  <tr><th>Klinische opvolging</th><td>${escapeHtml(b.klinisch || "")}</td></tr>
                  <tr><th>Educatie</th><td>${escapeHtml(b.educatie || "")}</td></tr>
                  <tr><th>Functioneel</th><td>${escapeHtml(b.functioneel || "")}</td></tr>
                  <tr><th>Coördinatie</th><td>${escapeHtml(b.coordinatie || "")}</td></tr>
                  <tr class="alert-row"><th>Escalatie</th><td>${escapeHtml(b.monitoring || "")}</td></tr>
                </table>
              </div>`
              )
              .join("")}
          </div>`;
        patientInfo.classList.remove("hidden");
      } else {
        carePlan.innerHTML = `
          <div class="plan-patient">
            <h3>Uw Persoonlijk Zorgplan</h3>
            <p class="intro">Dit plan helpt u om goed voor uzelf te zorgen thuis.</p>
            ${selectedBundles
              .map(
                (b) => `
              <div class="plan-section-simple">
                <h4>${escapeHtml(simplifyName(b.naam))}</h4>
                <div class="simple-item"><span class="icon">Wat moet ik weten?</span><p>${escapeHtml(
                  simplifyText(b.educatie)
                )}</p></div>
                <div class="simple-item"><span class="icon">Wat heb ik nodig?</span><p>${escapeHtml(
                  simplifyText(b.functioneel)
                )}</p></div>
                <div class="simple-item alert"><span class="icon">Wanneer bellen?</span><p>${escapeHtml(
                  simplifyText(b.monitoring)
                )}</p></div>
              </div>`
              )
              .join("")}
          </div>`;
        patientInfo.classList.remove("hidden");
      }

      exportPlan.classList.remove("hidden");
    }

    function renderProviders() {
      if (selectedBundles.length === 0) {
        recommendedProviders.innerHTML = '<p class="empty">Geen aanbevelingen beschikbaar</p>';
        return;
      }

      const allProviders = new Set();
      selectedBundles.forEach((b) => (b.zorgverleners || []).forEach((z) => allProviders.add(z)));

      recommendedProviders.innerHTML = Array.from(allProviders)
        .map(
          (provider) => `
          <div class="provider-card">
            <span class="provider-icon">+</span>
            <span class="provider-name">${escapeHtml(provider)}</span>
          </div>`
        )
        .join("");

      // Voeg een duidelijke "OnePatient" CTA toe (zonder upload, alleen openen)
      const cta = document.createElement("div");
      cta.className = "onepatient-cta";
      cta.innerHTML = `
        <div style="margin-top:12px;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;">
          <strong>OnePatient</strong><br>
          Wil je dat OnePatient hier een PHR van maakt? Open OnePatient en upload dezelfde documenten daar.
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <a class="marketplace-link" href="https://test.onepatient.bingli.be/dashboard" target="_blank" rel="noopener">Open OnePatient dashboard</a>
          </div>
          <div style="margin-top:8px;font-size:12px;color:#64748b;">
            (Automatisch doorsturen kan niet zolang er geen API is.)
          </div>
        </div>`;
      recommendedProviders.appendChild(cta);
    }

    // ========================
    // Export (placeholder)
    // ========================
    exportPlan.addEventListener("click", () => {
      alert("Export naar PDF: dit is een placeholder. (Client-side print/PDF kan later toegevoegd worden.)");
    });

    // ========================
    // Opslaan naar Mijn Patiënten (localStorage)
    // ========================
    saveToHospital.addEventListener("click", () => {
      const patientName = $("patientName").value;
      const patientAfdeling = $("patientAfdeling").value;
      const patientBirthdate = $("patientBirthdate").value;
      const patientDischargeDate = $("patientDischargeDate").value;
      const patientSpecialist = $("patientSpecialist").value;

      if (!patientName || !patientAfdeling || !patientBirthdate || !patientDischargeDate || !patientSpecialist) {
        alert("⚠️ Vul alle velden in om de patiënt op te slaan.");
        return;
      }

      const patients = JSON.parse(localStorage.getItem("hospitalPatients") || "[]");
      const newPatient = {
        nr: patients.length + 1,
        naam: patientName,
        afdeling: patientAfdeling,
        geboortedatum: patientBirthdate,
        ontslagdatum: patientDischargeDate,
        specialist: patientSpecialist,
        zorgplan: carePlan.innerHTML,
        selectedBundles: selectedBundles.map((b) => b.naam),
        timestamp: new Date().toISOString(),
      };

      patients.push(newPatient);
      localStorage.setItem("hospitalPatients", JSON.stringify(patients));

      alert("✅ Patiënt " + patientName + " is opgeslagen in Mijn Patiënten!");
      if (confirm("Wilt u OnePatient openen om documenten daar te uploaden?")) {
        window.open("https://test.onepatient.bingli.be/dashboard", "_blank", "noopener");
      }
    });

    // ========================
    // Reset
    // ========================
    function resetAll(clearUploads = true) {
      extractedTerms = [];
      matchedBundles = [];
      selectedBundles = [];
      extractedData.innerHTML = "Wacht op document...";
      lexiconMatches.innerHTML = "";
      problemAreas.innerHTML = "";
      suggestedBundles.innerHTML = "";
      carePlan.innerHTML = "";
      recommendedProviders.innerHTML = "";
      exportPlan.classList.add("hidden");
      patientInfo.classList.add("hidden");
      planMode = "professional";
      btnProfessional.classList.add("active");
      btnPatient.classList.remove("active");

      if (clearUploads) {
        uploadedDocuments = [];
        renderUploadedFiles();
      }
    }

    // Init UI
    resetAll(false);
    renderUploadedFiles();
  });
})();
