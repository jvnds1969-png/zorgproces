document.addEventListener("DOMContentLoaded", () => {
  // ========================
  // ZORGBUNDELS DATA (jouw bestaande dataset)
  // ========================
  const zorgbundels = [
    {
      nr: 1,
      naam: "Diabetes met verhoogd thuisrisico",
      medischLexicon: [
        "diabetes mellitus",
        "DM2",
        "insulinetherapie",
        "hypoglycemie",
        "hyperglycemie",
        "HbA1c",
        "diabetische voet",
        "glucosecontrole",
        "suikerziekte",
      ],
      patientLexicon: [
        "suikerziekte",
        "suiker schommelt",
        "suiker te hoog",
        "suiker te laag",
        "bang voor hypo",
        "insuline",
        "veel plassen",
      ],
      klinisch: "Glycemies, symptomen hypo/hyper, voetstatus, gewicht.",
      educatie: "Hypo-/hyperherkenning, glucosemeting, medicatieschema.",
      functioneel: "Glucosemeter, weekdoos, voedingsadvies.",
      coordinatie: "Huisarts-POH-dietist-thuisverpleging.",
      monitoring: "Herhaalde hypos, glycemie >20, voetulcus.",
      zorgverleners: [
        "Huisarts",
        "POH/diabetesverpleegkundige",
        "Thuisverpleging",
        "Dietist",
        "Podotherapeut",
        "Apotheker",
      ],
    },
    {
      nr: 2,
      naam: "Polyfarmacie en medicatieveiligheid",
      medischLexicon: [
        "polyfarmacie",
        "multimedicatie",
        "medicatielijst",
        "bijwerkingen",
        "medicatiefouten",
        "non-compliance",
        "STOPP/START",
        "hoogrisico-medicatie",
      ],
      patientLexicon: [
        "veel pillen",
        "medicijnen veranderd",
        "suf van medicatie",
        "vergeet medicijnen",
      ],
      klinisch: "Bijwerkingen, therapietrouw, aantal medicaties.",
      educatie: "Medicatieschema, gevaar dubbelgebruik.",
      functioneel: "Weekdoos, medicatierol, alarmen.",
      coordinatie: "Huisarts-apotheker-thuisverpleging.",
      monitoring: "Ernstige bijwerkingen, dubbelgebruik.",
      zorgverleners: ["Huisarts", "Huisapotheker", "Thuisverpleging", "POH-ouderen"],
    },
    {
      nr: 3,
      naam: "Cardiovasculair hoog risico",
      medischLexicon: [
        "hypertensie",
        "hoge bloeddruk",
        "cholesterol",
        "CVRM",
        "hartinfarct",
        "CVA",
        "TIA",
        "obesitas",
        "roker",
      ],
      patientLexicon: ["hoge bloeddruk", "cholesterol", "roken", "weinig beweging", "TIA gehad"],
      klinisch: "Bloeddruk, lipiden, gewicht, rookstatus.",
      educatie: "Leefstijl, beweging, rookstop.",
      functioneel: "GLI, beweegprogramma, gezonde voeding.",
      coordinatie: "POH-CVRM, dietist, fysiotherapeut.",
      monitoring: "Zeer hoge bloeddruk, nieuwe angina/TIA.",
      zorgverleners: ["Huisarts", "POH-CVRM", "Dietist", "Fysiotherapeut", "Apotheker"],
    },
    {
      nr: 7,
      naam: "Functionele achteruitgang en valrisico",
      medischLexicon: ["mobiliteitsbeperking", "valincident", "frailty", "sarcopenie", "ADL-hulp"],
      patientLexicon: ["gevallen", "niet zeker stappen", "opstaan moeilijk", "zwakker", "valangst"],
      klinisch: "Mobiliteit, ADL, spierkracht, valincidenten.",
      educatie: "Valrisico, veilig bewegen, hulpmiddelen.",
      functioneel: "Oefenprogramma, woningaanpassingen.",
      coordinatie: "Huisarts-kine-ergo-thuiszorg.",
      monitoring: "Meerdere vallen, ernstige valangst.",
      zorgverleners: ["Huisarts", "Kinesitherapeut", "Ergotherapeut", "Thuisverpleging"],
    },
    {
      nr: 9,
      naam: "Cognitieve kwetsbaarheid",
      medischLexicon: ["dementie", "Alzheimer", "MCI", "delirium", "verwardheid", "geheugenstoornissen"],
      patientLexicon: ["vergeet veel", "te ingewikkeld", "kluts kwijt", "pillen vergeten", "in de war"],
      klinisch: "Orientatie, geheugen, ADL-zelfstandigheid.",
      educatie: "Structuur, compensaties, medicatieondersteuning.",
      functioneel: "Dag-/weekschemas, herinneringshulpmiddelen.",
      coordinatie: "Huisarts-geriater-casemanager-thuiszorg.",
      monitoring: "Acuut delier, wegloopgedrag.",
      zorgverleners: ["Huisarts", "Geriater", "Casemanager", "Thuisverpleging"],
    },
    {
      nr: 10,
      naam: "Psychosociaal lijden en eenzaamheid",
      medischLexicon: ["depressie", "angst", "rouw", "suicidale gedachten", "slaapproblemen", "eenzaamheid"],
      patientLexicon: ["alleen", "te veel", "slecht slapen", "nergens zin in", "niet meer zitten"],
      klinisch: "Depressie-/angstscreening, slaap.",
      educatie: "Psycho-educatie, coping, zelfhulp.",
      functioneel: "Sociale activiteiten, lotgenotengroepen.",
      coordinatie: "Huisarts-POH-GGZ-psycholoog.",
      monitoring: "Suicidegedachten, ernstige depressie.",
      zorgverleners: ["Huisarts", "POH-GGZ", "Psycholoog", "Maatschappelijk werker"],
    },
  ];

  // ========================
  // STATE
  // ========================
  let extractedTerms = [];
  let matchedBundles = [];
  let selectedBundles = [];
  let uploadedDocuments = [];
  let planMode = "professional";

  // ========================
  // DOM
  // ========================
  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("fileInput");
  const uploadedFiles = document.getElementById("uploadedFiles");
  const startAnalyse = document.getElementById("startAnalyse");

  const extractedData = document.getElementById("extractedData");
  const lexiconMatches = document.getElementById("lexiconMatches");
  const problemAreas = document.getElementById("problemAreas");
  const suggestedBundles = document.getElementById("suggestedBundles");

  const carePlan = document.getElementById("carePlan");
  const recommendedProviders = document.getElementById("recommendedProviders");
  const btnProfessional = document.getElementById("btnProfessional");
  const btnPatient = document.getElementById("btnPatient");
  const exportPlan = document.getElementById("exportPlan");

  const patientInfo = document.getElementById("patientInfo");
  const saveToHospital = document.getElementById("saveToHospital");

  // Guard: als je ooit elementen weglaat in HTML, crasht script niet.
  if (!uploadZone || !fileInput) {
    console.warn("UploadZone of fileInput niet gevonden. Check je HTML id's.");
    return;
  }

  // ========================
  // HELPERS
  // ========================
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function show(el) {
    if (el) el.classList.remove("hidden");
  }
  function hide(el) {
    if (el) el.classList.add("hidden");
  }

  // ========================
  // UPLOAD UI
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

    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;

    uploadedDocuments.push(...files);
    renderUploadedFiles();
  });

  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    uploadedDocuments.push(...files);
    renderUploadedFiles();
    e.target.value = ""; // reset
  });

  function renderUploadedFiles() {
    if (!uploadedFiles || !startAnalyse) return;

    if (uploadedDocuments.length === 0) {
      hide(uploadedFiles);
      hide(startAnalyse);
      uploadZone.classList.remove("hidden");
      return;
    }

    uploadZone.classList.add("hidden");
    show(uploadedFiles);
    show(startAnalyse);

    uploadedFiles.innerHTML = uploadedDocuments
      .map(
        (file, index) => `
        <div class="file-item">
          <span class="file-icon">📄</span>
          <span class="file-name">${escapeHtml(file.name)}</span>
          <button type="button" class="remove-btn" data-index="${index}" aria-label="Verwijder">❌</button>
        </div>
      `
      )
      .join("");

    // Delegated click
    uploadedFiles.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-index"));
        if (Number.isFinite(idx)) {
          uploadedDocuments.splice(idx, 1);
          renderUploadedFiles();
          if (uploadedDocuments.length === 0) resetAll();
        }
      });
    });
  }

  // ========================
  // RESET
  // ========================
  function resetAll() {
    extractedTerms = [];
    matchedBundles = [];
    selectedBundles = [];
    if (extractedData) extractedData.innerHTML = "Wacht op document...";
    if (lexiconMatches) lexiconMatches.innerHTML = "";
    if (problemAreas) problemAreas.innerHTML = "";
    if (suggestedBundles) suggestedBundles.innerHTML = "";
    if (carePlan) carePlan.innerHTML = "";
    if (recommendedProviders) recommendedProviders.innerHTML = "";
    if (exportPlan) hide(exportPlan);
  }

  // ========================
  // START ANALYSE
  // ========================
  if (startAnalyse) {
    startAnalyse.addEventListener("click", async () => {
      if (!uploadedDocuments.length) return;

      if (extractedData) {
        extractedData.innerHTML = `<div class="loading">Analyseren van ${uploadedDocuments.length} document(en)...</div>`;
      }

      // Lees alle documenten: txt/json als text; pdf als "niet-parsable zonder pdf-parser"
      let allText = "";
      let filesRead = 0;

      uploadedDocuments.forEach((file) => {
        // PDF in pure frontend zonder pdf.js: geen betrouwbare tekstextractie
        const isPdf =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

        if (isPdf) {
          allText += `\n--- ${file.name} ---\n[PDF geüpload. Tekstextractie vereist pdf.js of backend.]\n`;
          filesRead++;
          if (filesRead === uploadedDocuments.length) analyzeContent(allText, uploadedDocuments.map((f) => f.name).join(", "));
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          allText += `\n--- ${file.name} ---\n${String(e.target.result || "")}\n`;
          filesRead++;
          if (filesRead === uploadedDocuments.length) {
            analyzeContent(allText, uploadedDocuments.map((f) => f.name).join(", "));
          }
        };
        reader.onerror = () => {
          allText += `\n--- ${file.name} ---\n[Kon bestand niet lezen]\n`;
          filesRead++;
          if (filesRead === uploadedDocuments.length) analyzeContent(allText, uploadedDocuments.map((f) => f.name).join(", "));
        };
        reader.readAsText(file);
      });
    });
  }

  // ========================
  // ANALYSE & MATCHING
  // ========================
  function analyzeContent(content, filenameList) {
    const text = normalize(content);
    const found = new Set();

    zorgbundels.forEach((bundle) => {
      [...bundle.medischLexicon, ...bundle.patientLexicon].forEach((term) => {
        const t = normalize(term);
        if (t && text.includes(t)) found.add(term);
      });
    });

    extractedTerms = Array.from(found);

    if (extractedData) {
      if (extractedTerms.length) {
        extractedData.innerHTML =
          `<div class="extracted-item"><strong>Bestanden:</strong> ${escapeHtml(filenameList)}</div>` +
          `<div class="extracted-item"><strong>Gevonden termen:</strong> ${escapeHtml(extractedTerms.join(", "))}</div>` +
          `<div class="extracted-item"><strong>Totaal:</strong> ${extractedTerms.length} termen gedetecteerd</div>`;
      } else {
        extractedData.innerHTML =
          `<div class="extracted-item"><strong>Bestanden:</strong> ${escapeHtml(filenameList)}</div>` +
          `<div class="extracted-item" style="color:#ef4444">Geen termen gevonden in de leesbare tekst. (PDF? Dan heb je pdf.js of backend nodig.)</div>`;
      }
    }

    matchWithLexicon();
  }

  function matchWithLexicon() {
    matchedBundles = [];
    const matchedTerms = [];

    extractedTerms.forEach((term) => {
      const termLower = normalize(term);
      zorgbundels.forEach((bundle) => {
        const allTerms = [...bundle.medischLexicon, ...bundle.patientLexicon];
        allTerms.forEach((lexTerm) => {
          const lexLower = normalize(lexTerm);
          if (!lexLower) return;

          if (termLower.includes(lexLower) || lexLower.includes(termLower)) {
            if (!matchedBundles.includes(bundle)) matchedBundles.push(bundle);
            matchedTerms.push({ term, lexicon: lexTerm, bundle: bundle.naam });
          }
        });
      });
    });

    if (lexiconMatches) {
      lexiconMatches.innerHTML =
        matchedTerms.length > 0
          ? matchedTerms
              .map(
                (m) =>
                  `<span class="match-tag" title="${escapeHtml(m.bundle)}">${escapeHtml(
                    m.term
                  )} - ${escapeHtml(m.lexicon)}</span>`
              )
              .join("")
          : "<p>Geen matches gevonden</p>";
    }

    renderProblemAreas();
  }

  // ========================
  // PROBLEM AREAS
  // ========================
  function renderProblemAreas() {
    if (!problemAreas) return;

    if (matchedBundles.length === 0) {
      problemAreas.innerHTML = '<p class="empty">Upload een document om probleemgebieden te detecteren</p>';
      selectedBundles = [];
      if (suggestedBundles) suggestedBundles.innerHTML = "";
      if (carePlan) carePlan.innerHTML = "";
      if (recommendedProviders) recommendedProviders.innerHTML = "";
      if (exportPlan) hide(exportPlan);
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
          <p class="problem-desc">${escapeHtml(bundle.klinisch)}</p>
        </div>
      `
      )
      .join("");

    selectedBundles = [...matchedBundles];

    // checkbox events
    problemAreas.querySelectorAll('input[type="checkbox"][data-nr]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const nr = Number(cb.getAttribute("data-nr"));
        toggleBundle(nr);
      });
    });

    renderSuggestedBundles();
  }

  function toggleBundle(nr) {
    const bundle = zorgbundels.find((b) => b.nr === nr);
    if (!bundle) return;

    const idx = selectedBundles.findIndex((b) => b.nr === nr);
    if (idx > -1) selectedBundles.splice(idx, 1);
    else selectedBundles.push(bundle);

    renderSuggestedBundles();
    renderCarePlan();
    renderProviders();
  }

  // ========================
  // SUGGESTED BUNDLES
  // ========================
  function renderSuggestedBundles() {
    if (!suggestedBundles) return;

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
            <div class="detail-row"><strong>Klinisch:</strong> ${escapeHtml(b.klinisch)}</div>
            <div class="detail-row"><strong>Educatie:</strong> ${escapeHtml(b.educatie)}</div>
            <div class="detail-row"><strong>Functioneel:</strong> ${escapeHtml(b.functioneel)}</div>
            <div class="detail-row"><strong>Coordinatie:</strong> ${escapeHtml(b.coordinatie)}</div>
            <div class="detail-row alert"><strong>Monitoring:</strong> ${escapeHtml(b.monitoring)}</div>
          </div>
        </div>
      `
      )
      .join("");

    renderCarePlan();
    renderProviders();
  }

  // ========================
  // CARE PLAN TOGGLE
  // ========================
  if (btnProfessional) {
    btnProfessional.addEventListener("click", () => {
      planMode = "professional";
      btnProfessional.classList.add("active");
      if (btnPatient) btnPatient.classList.remove("active");
      renderCarePlan();
    });
  }

  if (btnPatient) {
    btnPatient.addEventListener("click", () => {
      planMode = "patient";
      btnPatient.classList.add("active");
      if (btnProfessional) btnProfessional.classList.remove("active");
      renderCarePlan();
    });
  }

  function renderCarePlan() {
    if (!carePlan) return;

    if (selectedBundles.length === 0) {
      carePlan.innerHTML = '<p class="empty">Selecteer zorgbundels om zorgplan te genereren</p>';
      if (exportPlan) hide(exportPlan);
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
                <tr><th>Klinische opvolging</th><td>${escapeHtml(b.klinisch)}</td></tr>
                <tr><th>Educatie</th><td>${escapeHtml(b.educatie)}</td></tr>
                <tr><th>Functioneel</th><td>${escapeHtml(b.functioneel)}</td></tr>
                <tr><th>Coordinatie</th><td>${escapeHtml(b.coordinatie)}</td></tr>
                <tr class="alert-row"><th>Escalatie</th><td>${escapeHtml(b.monitoring)}</td></tr>
              </table>
            </div>
          `
            )
            .join("")}
        </div>
      `;
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
              <div class="simple-item"><span class="icon">Wat moet ik weten?</span><p>${escapeHtml(simplifyText(b.educatie))}</p></div>
              <div class="simple-item"><span class="icon">Wat heb ik nodig?</span><p>${escapeHtml(simplifyText(b.functioneel))}</p></div>
              <div class="simple-item alert"><span class="icon">Wanneer bellen?</span><p>${escapeHtml(simplifyText(b.monitoring))}</p></div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    }

    if (exportPlan) show(exportPlan);

    // je patientInfo tonen wanneer er een plan is (als je dat zo bedoelt)
    if (patientInfo) show(patientInfo);
  }

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

  // ========================
  // PROVIDERS
  // ========================
  function renderProviders() {
    if (!recommendedProviders) return;

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
        </div>
      `
      )
      .join("");
  }

  // ========================
  // EXPORT (placeholder)
  // ========================
  if (exportPlan) {
    exportPlan.addEventListener("click", () => {
      alert("Zorgplan export functionaliteit - In een volledige implementatie zou dit een PDF genereren.");
    });
  }

  // ========================
  // OPSLAAN NAAR ZIEKENHUIS
  // ========================
  if (saveToHospital) {
    saveToHospital.addEventListener("click", () => {
      const patientName = document.getElementById("patientName")?.value || "";
      const patientAfdeling = document.getElementById("patientAfdeling")?.value || "";
      const patientBirthdate = document.getElementById("patientBirthdate")?.value || "";
      const patientDischargeDate = document.getElementById("patientDischargeDate")?.value || "";
      const patientSpecialist = document.getElementById("patientSpecialist")?.value || "";

      if (!patientName || !patientAfdeling || !patientBirthdate || !patientDischargeDate || !patientSpecialist) {
        alert("⚠️ Vul alle velden in om de patiënt op te slaan.");
        return;
      }

      let patients = JSON.parse(localStorage.getItem("hospitalPatients") || "[]");

      const newPatient = {
        nr: patients.length + 1,
        naam: patientName,
        afdeling: patientAfdeling,
        geboortedatum: patientBirthdate,
        ontslagdatum: patientDischargeDate,
        specialist: patientSpecialist,
        zorgplan: carePlan ? carePlan.innerHTML : "",
        selectedBundles: selectedBundles.map((b) => b.naam),
        timestamp: new Date().toISOString(),
      };

      patients.push(newPatient);
      localStorage.setItem("hospitalPatients", JSON.stringify(patients));

      alert("✅ Patiënt " + patientName + " is opgeslagen in Mijn Patiënten!");

      if (confirm("Wilt u terug naar de Ziekenhuis pagina?")) {
        window.location.href = "https://jvnds1969-png.github.io/Ziekenhuis/";
      }
    });
  }

  // Init
  resetAll();
  renderUploadedFiles();
});
