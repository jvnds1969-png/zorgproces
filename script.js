/* script.js - Zorgplanproces v2.0 met OnePatient integratie
 * 
 * FLOW:
 * 1. Document Uploaden -> Doorsturen naar OnePatient voor PHR
 * 2. Na OnePatient PHR -> Gegevens importeren
 * 3. Lexicon-matching + prioritering + leeftijdsaanpassing
 * 4. Zorgbundels voorstellen
 * 5. Zorgplan genereren (Professioneel + Patientversie 14-jarige taal)
 * 6. Woningaanpassingen & hulpmiddelen per bundel
 * 7. Aanbevolen zorgverleners met filters
 */

(() => {
  // ========================
  // CONFIGURATIE
  // ========================
  const ONEPATIENT_URL = "https://test.onepatient.bingli.be";
  const ONEPATIENT_LOGIN = "https://test.login.bingli.be/#/login?redirectUrl=https:%2F%2Ftest.onepatient.bingli.be%2Fauth-callback";

  // ========================
  // HELPERS
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
    return String(s || "").toLowerCase().trim();
  }

  function berekenLeeftijd(geboortedatum) {
    if (!geboortedatum) return null;
    const geb = new Date(geboortedatum);
    const nu = new Date();
    let leeftijd = nu.getFullYear() - geb.getFullYear();
    const m = nu.getMonth() - geb.getMonth();
    if (m < 0 || (m === 0 && nu.getDate() < geb.getDate())) leeftijd--;
    return leeftijd;
  }

  // ========================
  // MEDISCH LEXICON - ZORGBUNDELS
  // ========================
  const zorgbundels = [
    {
      nr: 1,
      naam: "Diabetes met verhoogd thuisrisico",
      kortNaam: "Diabetes",
      medischLexicon: ["diabetes mellitus","DM2","DM1","insulinetherapie","orale antidiabetica","hypoglycemie","hyperglycemie","verhoogd HbA1c","diabetische voet","glucose","metformine","insuline"],
      patientLexicon: ["suikerziekte","suiker schommelt","hypo","insuline"],
      klinisch: "Glycemies, hypo-/hypersymptomen, voetstatus, gewicht.",
      educatie: "Herkenning hypo/hyper, correcte meting, medicatieschema.",
      functioneel: "Glucosemeter, strips, weekdoos, voedingsondersteuning.",
      coordinatie: "Afstemming huisarts-diabetesverpleegkundige-dietist-thuiszorg.",
      monitoring: "Herhaalde hypo's of glycemie >20 mmol/L -> huisarts; acuut -> 112.",
      zorgverleners: ["Huisarts","Diabetesverpleegkundige","Thuisverpleging","Dietist","Apotheker"],
      woningaanpassingen: ["Goede verlichting voor voetcontrole","Koelkast voor insuline"],
      hulpmiddelen: ["Glucosemeter","Teststrips","Weekdoos","Diabetesdagboek","Insulinepen"]
    },
    {
      nr: 2,
      naam: "Polyfarmacie & medicatieveiligheid",
      kortNaam: "Polyfarmacie",
      medischLexicon: ["polyfarmacie","multimedicatie","STOPP/START","bijwerkingen","medicatie-ontrouw","interacties","medicatiereview","spierkrampen"],
      patientLexicon: ["veel pillen","medicatie veranderd","iets verkeerd nemen"],
      klinisch: "Bijwerkingen, therapietrouw, aantal medicaties.",
      educatie: "Uitleg schema, risico dubbelgebruik, teach-back.",
      functioneel: "Weekdoos, visueel schema, medicatierol.",
      coordinatie: "Medicatiereview huisarts-apotheker.",
      monitoring: "Ernstige bijwerkingen -> huisarts; intoxicatie -> 112.",
      zorgverleners: ["Huisarts","Apotheker","Thuisverpleging"],
      woningaanpassingen: ["Goed verlichte medicatieplek"],
      hulpmiddelen: ["Medicijndoos met dagvakken","Medicatieschema op zichtbare plek","Medicatierol"]
    },
    {
      nr: 3,
      naam: "Cardiovasculair hoog risico (CVRM)",
      kortNaam: "CVRM",
      medischLexicon: ["hypertensie","hypercholesterolemie","CVRM","obesitas","roker","coronaire hartziekte","atheromatose","calcificatie","angina","myocardinfarct","CVA","TIA","bloeddruk","cholesterol","LDL","statine","ACE-remmer","ARB","arteriele hypertensie"],
      patientLexicon: ["bloeddruk te hoog","hoge cholesterol","beweeg weinig","hartziekten in familie"],
      klinisch: "Bloeddruk, lipiden, BMI, SCORE2.",
      educatie: "Uitleg risico, leefstijl, therapietrouw.",
      functioneel: "Beweegprogramma, rookstop, dieetadvies.",
      coordinatie: "POH-CVRM met huisarts, dietist, kinesitherapeut.",
      monitoring: "Nieuwe angina/TIA -> huisarts; acuut -> 112.",
      zorgverleners: ["Huisarts","POH/Praktijkverpleegkundige","Cardioloog","Dietist","Kinesitherapeut"],
      woningaanpassingen: ["Goede verlichting","Trap vermijden of traplift"],
      hulpmiddelen: ["Bloeddrukmeter (gevalideerd)","Weegschaal","Pillendoos"]
    },
    {
      nr: 4,
      naam: "Cardio-vasculaire instabiliteit",
      kortNaam: "Hartritme/Kleppen",
      medischLexicon: ["atriumfibrilleren","syncope","hartritmestoornis","orthostatische hypotensie","tachycardie","AVNRT","SVT","kleplijden","regurgitatie","stenose","mitralisklep","aortaklep","palpitaties","collaps","supraventriculaire tachycardie"],
      patientLexicon: ["plots duizelig","hart slaat raar","flauwgevallen","hartkloppingen"],
      klinisch: "Pols, ritme, bloeddruk, valincidenten.",
      educatie: "Herkennen alarmsymptomen, veilig opstaan.",
      functioneel: "Mobiliteitshulpmiddelen, personenalarm.",
      coordinatie: "Huisarts-cardioloog-thuiszorg.",
      monitoring: "Syncope of collaps -> huisarts; pijn op borst -> 112.",
      zorgverleners: ["Huisarts","Cardioloog","Thuisverpleging"],
      woningaanpassingen: ["Handgrepen badkamer","Antislipmatten","Opstapje vermijden"],
      hulpmiddelen: ["Personenalarmering","Saturatiemeter","Smartwatch met hartslagmeting"]
    },
    {
      nr: 5,
      naam: "Chronische respiratoire kwetsbaarheid (COPD/Astma)",
      kortNaam: "COPD/Astma",
      medischLexicon: ["COPD","astma","exacerbatie","dyspnoe","zuurstoftherapie","FEV1","spirometrie","inhalator","puffer","bronchodilatator","corticosteroid"],
      patientLexicon: ["snel buiten adem","puffer helpt niet","bang geen lucht te krijgen"],
      klinisch: "Dyspnoe, saturatie, exacerbaties.",
      educatie: "Actieplan, inhalatietechniek, rookstop.",
      functioneel: "Beweegprogramma, hulpmiddelen.",
      coordinatie: "Huisarts-longverpleegkundige-longarts.",
      monitoring: "Ernstige dyspnoe/cyanose -> 112.",
      zorgverleners: ["Huisarts","Longarts","Longverpleegkundige","Kinesitherapeut"],
      woningaanpassingen: ["Goede ventilatie","Rookvrije omgeving","Allergeenarm"],
      hulpmiddelen: ["Saturatiemeter","Vernevelaar","Rollator/loophulp"]
    },
    {
      nr: 6,
      naam: "Metabool-renale kwetsbaarheid (CNI & hartfalen)",
      kortNaam: "CNI/Hartfalen",
      medischLexicon: ["chronische nierinsufficiëntie","CNI","hartfalen","oedeem","hyperkaliemie","eGFR","creatinine","diuretica","vochtretentie","NT-proBNP","nierinsufficiëntie","nierfunctie"],
      patientLexicon: ["benen staan dik","vocht vast","nieren werken niet goed"],
      klinisch: "eGFR, gewicht, elektrolyten, dyspnoe.",
      educatie: "Vocht- en zoutbeperking, alarmsignalen.",
      functioneel: "Weegschaal, dieetondersteuning.",
      coordinatie: "Huisarts-nefroloog-cardioloog.",
      monitoring: "+2 kg/3 dagen of ernstige dyspnoe -> huisarts/112.",
      zorgverleners: ["Huisarts","Nefroloog","Cardioloog","Dietist"],
      woningaanpassingen: ["Slaapkamer beneden","Koele omgeving"],
      hulpmiddelen: ["Weegschaal (dagelijks)","Vochtbalansschema","Zoutarm kookboek"]
    },
    {
      nr: 7,
      naam: "Functionele achteruitgang & valrisico",
      kortNaam: "Valrisico",
      medischLexicon: ["valincident","frailty","sarcopenie","ADL-verlies","mobiliteit","loopstoornis"],
      patientLexicon: ["al gevallen","durf niet meer buiten","schrik om te vallen"],
      klinisch: "Mobiliteit, ADL/iADL, spierkracht.",
      educatie: "Valpreventie, veilig bewegen.",
      functioneel: "Woningaanpassingen, hulpmiddelen.",
      coordinatie: "Multidisciplinair plan.",
      monitoring: "Herhaald vallen -> huisarts; letsel -> 112.",
      zorgverleners: ["Huisarts","Kinesitherapeut","Ergotherapeut"],
      woningaanpassingen: ["Drempels verwijderen","Nachtverlichting","Douche ipv bad","Handgrepen"],
      hulpmiddelen: ["Rollator","Looprek","Antislipsokken","Heupbeschermer"]
    },
    {
      nr: 8,
      naam: "Ondervoeding",
      kortNaam: "Ondervoeding",
      medischLexicon: ["ondervoeding","gewichtsverlies","dysfagie","sarcopenie","BMI","MUST","SNAQ"],
      patientLexicon: ["geen eetlust","vermager","eten lukt niet goed"],
      klinisch: "Gewicht, MUST/SNAQ65+.",
      educatie: "Eiwit- en energieverrijking.",
      functioneel: "Maaltijdservice, drinkvoeding.",
      coordinatie: "Dietist als spil.",
      monitoring: ">5 kg verlies -> huisarts.",
      zorgverleners: ["Dietist","Huisarts","Thuiszorg"],
      woningaanpassingen: ["Toegankelijke keuken"],
      hulpmiddelen: ["Weegschaal","Drinkvoeding","Eiwitrijke supplementen"]
    },
    {
      nr: 9,
      naam: "Cognitieve kwetsbaarheid",
      kortNaam: "Cognitie/Dementie",
      medischLexicon: ["dementie","MCI","delier","geheugenstoornis","Alzheimer","cognitieve achteruitgang"],
      patientLexicon: ["vergeet veel","raakt snel in de war"],
      klinisch: "Geheugen, orientatie, ADL.",
      educatie: "Structuur, veiligheid, uitleg mantelzorg.",
      functioneel: "Herinneringshulpmiddelen.",
      coordinatie: "Huisarts-casemanager.",
      monitoring: "Acuut delier -> huisarts/spoed.",
      zorgverleners: ["Huisarts","Geriater","Thuiszorg","Casemanager dementie"],
      woningaanpassingen: ["Vaste routines","Kalender zichtbaar","Veilige omgeving"],
      hulpmiddelen: ["Medicijndispenser met alarm","GPS-tracker","Klok met datum"]
    },
    {
      nr: 10,
      naam: "Psychosociaal lijden & eenzaamheid",
      kortNaam: "GGZ/Eenzaamheid",
      medischLexicon: ["depressie","angst","eenzaamheid","slaapproblemen","insomnie","paniekaanval","somberheid"],
      patientLexicon: ["voel me alleen","slaap slecht","te veel"],
      klinisch: "Screening depressie/angst.",
      educatie: "Psycho-educatie.",
      functioneel: "Sociale toeleiding.",
      coordinatie: "Huisarts-POH-GGZ.",
      monitoring: "Suicidaliteit -> crisisdienst.",
      zorgverleners: ["Huisarts","Psycholoog","Maatschappelijk werker","POH-GGZ"],
      woningaanpassingen: ["Prikkelarme ruimte","Rustige slaapkamer"],
      hulpmiddelen: ["Slaapdagboek","Ontspanningsapp","Lichttherapielamp"]
    },
    {
      nr: 11,
      naam: "Mantelzorger-overbelasting",
      kortNaam: "Mantelzorg",
      medischLexicon: ["mantelzorgbelasting","respijtzorg","zorglast"],
      patientLexicon: ["wordt mij te zwaar","kan dit niet meer alleen"],
      klinisch: "Draagkracht mantelzorger.",
      educatie: "Grenzen stellen, ondersteuning.",
      functioneel: "Respijtzorg.",
      coordinatie: "Mantelzorger expliciet in zorgplan.",
      monitoring: "Ernstige uitputting -> huisarts.",
      zorgverleners: ["Huisarts","Mantelzorgsteunpunt","Thuiszorg"],
      woningaanpassingen: [],
      hulpmiddelen: ["Respijtzorg-informatie","Mantelzorgpas"]
    },
    {
      nr: 12,
      naam: "Veiligheid & angst om alleen te zijn",
      kortNaam: "Veiligheid/Alarm",
      medischLexicon: ["valangst","alleenwonend","personenalarm"],
      patientLexicon: ["bang dat ik val","wat als ik alleen ben"],
      klinisch: "Valrisico, angstniveau.",
      educatie: "Gebruik alarm.",
      functioneel: "Alarm/valdetectie.",
      coordinatie: "Huisarts-alarmcentrale.",
      monitoring: "Herhaald alarmgebruik -> evaluatie.",
      zorgverleners: ["Thuiszorg","Huisarts"],
      woningaanpassingen: ["Goed verlichte gangen","Telefoon binnen bereik"],
      hulpmiddelen: ["Personenalarmering","Valdetectie-systeem","Sleutelkluis"]
    },
    {
      nr: 13,
      naam: "Palliatieve zorgnoden",
      kortNaam: "Palliatief",
      medischLexicon: ["palliatief","terminaal","comfortzorg","advance care planning","ACP","euthanasie","levensverwachting"],
      patientLexicon: ["wil comfort","wil thuis blijven"],
      klinisch: "Symptoomlast.",
      educatie: "Advance care planning.",
      functioneel: "Zorgbed, ADL-hulp.",
      coordinatie: "Palliatief team.",
      monitoring: "Onvoldoende comfort -> palliatief team.",
      zorgverleners: ["Huisarts","Palliatief team","Thuisverpleging"],
      woningaanpassingen: ["Zorgbed op gelijkvloers","Rustige omgeving"],
      hulpmiddelen: ["Hoog-laag bed","Anti-decubitusmatras","Medicatiepomp"]
    },
    {
      nr: 14,
      naam: "Incontinentie & delirium-risico",
      kortNaam: "Incontinentie/Delier",
      medischLexicon: ["urine-incontinentie","delirium","nachtelijke onrust","blaasretentie","katheter"],
      patientLexicon: ["geraak niet op tijd op toilet"],
      klinisch: "Mictiepatroon, verwardheid.",
      educatie: "Toiletgedrag, deliersignalen.",
      functioneel: "Incontinentiemateriaal.",
      coordinatie: "Huisarts-thuiszorg.",
      monitoring: "Acuut delier -> spoed.",
      zorgverleners: ["Huisarts","Thuisverpleging","Uroloog"],
      woningaanpassingen: ["Toilet dichtbij slaapkamer","Nachtverlichting"],
      hulpmiddelen: ["Incontinentiemateriaal","Postoel","Urinaal"]
    },
    {
      nr: 15,
      naam: "Zintuiglijke beperkingen",
      kortNaam: "Zien/Horen",
      medischLexicon: ["slechtziend","slechthorend","maculadegeneratie","cataract","glaucoom","presbyacusis"],
      patientLexicon: ["hoor niet goed","zie niet goed"],
      klinisch: "Functioneren met hulpmiddelen.",
      educatie: "Aangepaste communicatie.",
      functioneel: "Bril, hoortoestel.",
      coordinatie: "Huisarts-oogarts/audioloog.",
      monitoring: "Plots verlies -> specialist.",
      zorgverleners: ["Huisarts","Oogarts","Audioloog","Optometrist"],
      woningaanpassingen: ["Goede verlichting","Contrastrijk interieur"],
      hulpmiddelen: ["Vergrootglas","Hoortoestel","Belsysteem met licht"]
    },
    {
      nr: 16,
      naam: "Verslaving & ontwrichtend gedrag",
      kortNaam: "Verslaving",
      medischLexicon: ["alcoholmisbruik","middelengebruik","agressie","verslaving","ontwenning"],
      patientLexicon: ["drinkt te veel","escaleert thuis"],
      klinisch: "Gebruikspatroon, veiligheid.",
      educatie: "Motiverende gespreksvoering.",
      functioneel: "Praktische steun gezin.",
      coordinatie: "Huisarts-CGG-maatschappelijk werk.",
      monitoring: "Agressie/intoxicatie -> spoed.",
      zorgverleners: ["Huisarts","CGG","Maatschappelijk werker","Verslavingszorg"],
      woningaanpassingen: ["Veilige opberging medicatie/alcohol"],
      hulpmiddelen: []
    }
  ];

  // ========================
  // PRIORITERINGSLOGICA
  // ========================
  const priorityRules = {
    hoog: {
      bundels: [3, 4, 5, 6, 13],
      termen: ["coronaire","atheromatose","hartfalen","syncope","exacerbatie","palliatief","terminaal","eGFR","nierinsufficiëntie","diffuse","LAD"]
    },
    midden: {
      bundels: [1, 2, 7, 9, 10],
      termen: ["hypertensie","hypercholesterolemie","diabetes","polyfarmacie","valrisico","dementie","depressie"]
    },
    laag: {
      bundels: [8, 11, 12, 14, 15, 16],
      termen: ["ondervoeding","mantelzorg","incontinentie","slechtziend"]
    }
  };

  function bepaalPrioriteit(bundel, gevondenTermen) {
    const heeftHoogeTerm = gevondenTermen.some(t => 
      priorityRules.hoog.termen.some(ht => norm(t).includes(norm(ht)))
    );
    if (heeftHoogeTerm || priorityRules.hoog.bundels.includes(bundel.nr)) {
      return { niveau: "hoog", emoji: "\uD83D\uDD34", kleur: "#ef4444" };
    }
    if (priorityRules.midden.bundels.includes(bundel.nr)) {
      return { niveau: "midden", emoji: "\uD83D\uDFE0", kleur: "#f59e0b" };
    }
    return { niveau: "laag", emoji: "\uD83D\uDFE2", kleur: "#22c55e" };
  }

  // ========================
  // LEEFTIJDSCATEGORIEEN
  // ========================
  function bepaalLeeftijdsCategorie(leeftijd) {
    if (!leeftijd || leeftijd < 18) return null;
    if (leeftijd < 40) return { 
      categorie: "jong_volwassene", 
      naam: "Jong volwassene (18-40)", 
      aanpak: "Agressieve risicofactorcontrole, focus op leefstijl, langetermijndoelen"
    };
    if (leeftijd < 65) return { 
      categorie: "middelbare_leeftijd", 
      naam: "Middelbare leeftijd (40-65)", 
      aanpak: "Secundaire preventie, strikte targets (LDL <1.4-1.8), actieve screening"
    };
    if (leeftijd < 80) return { 
      categorie: "oudere_volwassene", 
      naam: "Oudere volwassene (65-80)", 
      aanpak: "Balans behandeling/kwaliteit van leven, minder strikte targets, valrisico meewegen"
    };
    return { 
      categorie: "kwetsbare_oudere", 
      naam: "Kwetsbare oudere (80+)", 
      aanpak: "Symptoomcontrole en comfort, shared decision making, polyfarmacie saneren"
    };
  }

  // ========================
  // STATE
  // ========================
  let uploadedDocuments = [];
  let patientGegevens = { naam: "", geboortedatum: "", leeftijd: null };
  let extractedTerms = [];
  let matchedBundles = [];
  let selectedBundles = [];
  let planMode = "professional";

 // ========================
// DOM ELEMENTS
// ========================
const stap1 = document.getElementById('stap1');
const stap2 = document.getElementById('stap2');
const stap3 = document.getElementById('stap3');
const stap4 = document.getElementById('stap4');
const fileInput = document.getElementById('fileInput');
const documentList = document.getElementById('documentList');
    const uploadedDocsTitle = document.getElementById('uploadedDocsTitle');
const extractTermsBtn = document.getElementById('extractTerms');
const extractedTermsDiv = document.getElementById('extractedTerms');
const bundleList = document.getElementById('bundleList');
const generatePlanBtn = document.getElementById('generatePlan');
const planOutput = document.getElementById('planOutput');
const modeToggle = document.getElementById('modeToggle');
const modeProfessional = document.getElementById('modeProfessional');
const modePatient = document.getElementById('modePatient');

// Patient input fields
const patientNaam = document.getElementById('patientNaam');
const patientGeboortedatum = document.getElementById('patientGeboortedatum');

 // ========================
// UTILITY FUNCTIONS
// ========================
function norm(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function berekenLeeftijd(geboortedatum) {
  const vandaag = new Date();
  const geboorte = new Date(geboortedatum);
  let leeftijd = vandaag.getFullYear() - geboorte.getFullYear();
  const m = vandaag.getMonth() - geboorte.getMonth();
  if (m < 0 || (m === 0 && vandaag.getDate() < geboorte.getDate())) {
    leeftijd--;
  }
  return leeftijd;
}

function updatePatientInfo() {
  patientGegevens.naam = patientNaam?.value || '';
  patientGegevens.geboortedatum = patientGeboortedatum?.value || '';
  if (patientGegevens.geboortedatum) {
    patientGegevens.leeftijd = berekenLeeftijd(patientGegevens.geboortedatum);
  }
}

 // ========================
// DOCUMENT HANDLING
// ========================
function handleFileUpload(event) {
  const files = event.target.files;
  for (let file of files) {
    const reader = new FileReader();
    reader.onload = function(e) {
      uploadedDocuments.push({
        name: file.name,
        content: e.target.result,
        type: file.type
      });
      updateDocumentList();
    };
    reader.readAsText(file);
  }
}

function updateDocumentList() {
  if (!documentList) return;
  documentList.innerHTML = '';
  uploadedDocuments.forEach((doc, index) => {
          const li = document.createElement('li');
      li.className = 'uploaded-document-item';
      li.innerHTML = `      <span class="doc-icon">📄</span>
        <span class="doc-name">${doc.name}</span>
        <button type="button" class="doc-remove-btn" data-index="${index}">✕</button>`;
    documentList.appendChild(li);
  });
  if (extractTermsBtn) {
    extractTermsBtn.disabled = uploadedDocuments.length === 0;
  }
      // Toon/verberg de titel 'Opgeladen documenten'
    if (uploadedDocsTitle) {
      uploadedDocsTitle.style.display = uploadedDocuments.length > 0 ? 'block' : 'none';
    }
}

function removeDocument(index) {
  uploadedDocuments.splice(index, 1);
  updateDocumentList();
}

 // ========================
// TERM EXTRACTION & MATCHING
// ========================
function extractTermsFromDocuments() {
  updatePatientInfo();
  extractedTerms = [];
  const allText = uploadedDocuments.map(d => d.content).join(' ').toLowerCase();
  
  zorgbundels.forEach(bundel => {
    bundel.medischLexicon.forEach(term => {
      if (allText.includes(norm(term)) || allText.includes(term.toLowerCase())) {
        if (!extractedTerms.includes(term)) {
          extractedTerms.push(term);
        }
      }
    });
    bundel.patientLexicon.forEach(term => {
      if (allText.includes(norm(term)) || allText.includes(term.toLowerCase())) {
        if (!extractedTerms.includes(term)) {
          extractedTerms.push(term);
        }
      }
    });
  });
  
  displayExtractedTerms();
  matchBundels();
}

function displayExtractedTerms() {
  if (!extractedTermsDiv) return;
  if (extractedTerms.length === 0) {
    extractedTermsDiv.innerHTML = '<p class="no-terms">Geen medische termen gevonden in de documenten.</p>';
    return;
  }
  
  let html = '<div class="terms-grid">';
  extractedTerms.forEach(term => {
    html += `<span class="term-tag">${term}</span>`;
  });
  html += '</div>';
  extractedTermsDiv.innerHTML = html;
}

 function matchBundels() {
  matchedBundles = [];
  
  zorgbundels.forEach(bundel => {
    const matchedTerms = [];
    
    bundel.medischLexicon.forEach(term => {
      if (extractedTerms.some(et => norm(et).includes(norm(term)) || norm(term).includes(norm(et)))) {
        matchedTerms.push(term);
      }
    });
    
    bundel.patientLexicon.forEach(term => {
      if (extractedTerms.some(et => norm(et).includes(norm(term)) || norm(term).includes(norm(et)))) {
        matchedTerms.push(term);
      }
    });
    
    if (matchedTerms.length > 0) {
      const prioriteit = bepaalPrioriteit(bundel, matchedTerms);
      matchedBundles.push({
        bundel: bundel,
        matchedTerms: matchedTerms,
        prioriteit: prioriteit
      });
    }
  });
  
  // Sort by priority
  matchedBundles.sort((a, b) => {
    const order = { hoog: 0, midden: 1, laag: 2 };
    return order[a.prioriteit.niveau] - order[b.prioriteit.niveau];
  });
  
  displayBundelList();
  showStap(2);
}

 function displayBundelList() {
  if (!bundleList) return;
  bundleList.innerHTML = '';
  
  if (matchedBundles.length === 0) {
    bundleList.innerHTML = '<p class="no-bundles">Geen zorgbundels gevonden op basis van de documenten.</p>';
    return;
  }
  
  matchedBundles.forEach((match, index) => {
    const div = document.createElement('div');
    div.className = 'bundle-item';
    div.innerHTML = `
      <div class="bundle-header">
        <input type="checkbox" id="bundle_${index}" checked onchange="toggleBundle(${index})">
        <label for="bundle_${index}">
          <span class="priority-indicator" style="background-color: ${match.prioriteit.kleur}">${match.prioriteit.emoji}</span>
          <strong>${match.bundel.naam}</strong>
        </label>
      </div>
      <div class="bundle-details">
        <p class="matched-terms">Gevonden termen: ${match.matchedTerms.join(', ')}</p>
        <p class="bundle-priority">Prioriteit: ${match.prioriteit.niveau}</p>
      </div>
    `;
    bundleList.appendChild(div);
  });
  
  selectedBundles = matchedBundles.map(m => m.bundel);
  if (generatePlanBtn) {
    generatePlanBtn.disabled = false;
  }
}

function toggleBundle(index) {
  const checkbox = document.getElementById(`bundle_${index}`);
  const bundel = matchedBundles[index].bundel;
  
  if (checkbox.checked) {
    if (!selectedBundles.includes(bundel)) {
      selectedBundles.push(bundel);
    }
  } else {
    selectedBundles = selectedBundles.filter(b => b.nr !== bundel.nr);
  }
}

 // ========================
// ZORGPLAN GENERATION
// ========================
function generateZorgplan() {
  if (selectedBundles.length === 0) {
    alert('Selecteer minstens één zorgbundel.');
    return;
  }
  
  const leeftijdsInfo = bepaalLeeftijdsCategorie(patientGegevens.leeftijd);
  
  if (planMode === 'professional') {
    generateProfessionalPlan(leeftijdsInfo);
  } else {
    generatePatientPlan(leeftijdsInfo);
  }
  
  showStap(4);
}

 function generateProfessionalPlan(leeftijdsInfo) {
  if (!planOutput) return;
  
  let html = '<div class="zorgplan professional">';
  
  // Header
  html += `
    <div class="plan-header">
      <h2>📋 Zorgplan - Professionele Versie</h2>
      <div class="patient-info">
        <p><strong>Patiënt:</strong> ${patientGegevens.naam || 'Onbekend'}</p>
        <p><strong>Geboortedatum:</strong> ${patientGegevens.geboortedatum || 'Onbekend'}</p>
        <p><strong>Leeftijd:</strong> ${patientGegevens.leeftijd || 'Onbekend'} jaar</p>
        ${leeftijdsInfo ? `<p><strong>Categorie:</strong> ${leeftijdsInfo.naam}</p>` : ''}
        ${leeftijdsInfo ? `<p><strong>Aanpak:</strong> ${leeftijdsInfo.aanpak}</p>` : ''}
      </div>
      <p class="plan-date">Aangemaakt: ${new Date().toLocaleDateString('nl-BE')}</p>
    </div>
  `;
  
  // Sort bundles by priority
  const sortedBundles = [...selectedBundles].sort((a, b) => {
    const matchA = matchedBundles.find(m => m.bundel.nr === a.nr);
    const matchB = matchedBundles.find(m => m.bundel.nr === b.nr);
    const order = { hoog: 0, midden: 1, laag: 2 };
    return order[matchA?.prioriteit?.niveau || 'laag'] - order[matchB?.prioriteit?.niveau || 'laag'];
  });

     // Bundels
  sortedBundles.forEach(bundel => {
    const match = matchedBundles.find(m => m.bundel.nr === bundel.nr);
    const prioriteit = match?.prioriteit || { niveau: 'laag', emoji: '🟢', kleur: '#22c55e' };
    
    html += `
      <div class="bundel-section" style="border-left: 4px solid ${prioriteit.kleur}">
        <h3>${prioriteit.emoji} ${bundel.naam}</h3>
        <div class="bundel-content">
          <div class="section">
            <h4>🎯 Klinische focus</h4>
            <p>${bundel.klinisch}</p>
          </div>
          <div class="section">
            <h4>📚 Educatie</h4>
            <p>${bundel.educatie}</p>
          </div>
          <div class="section">
            <h4>⚙️ Functioneel</h4>
            <p>${bundel.functioneel}</p>
          </div>
          <div class="section">
            <h4>🔗 Coördinatie</h4>
            <p>${bundel.coordinatie}</p>
          </div>
          <div class="section">
            <h4>🚨 Monitoring / Alarmsignalen</h4>
            <p>${bundel.monitoring}</p>
          </div>
          <div class="section">
            <h4>🏠 Woningaanpassingen</h4>
            <ul>${bundel.woningaanpassingen.map(w => `<li>${w}</li>`).join('')}</ul>
          </div>
          <div class="section">
            <h4>🦯 Hulpmiddelen</h4>
            <ul>${bundel.hulpmiddelen.length > 0 ? bundel.hulpmiddelen.map(h => `<li>${h}</li>`).join('') : '<li>Geen specifieke hulpmiddelen</li>'}</ul>
          </div>
          <div class="section">
            <h4>👥 Zorgverleners</h4>
            <ul>${bundel.zorgverleners.map(z => `<li>${z}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  planOutput.innerHTML = html;
}

 function generatePatientPlan(leeftijdsInfo) {
  if (!planOutput) return;
  
  let html = '<div class="zorgplan patient-version">';
  
  // Header
  html += `
    <div class="plan-header patient">
      <h2>💚 Jouw Persoonlijk Zorgplan</h2>
      <div class="patient-info">
        <p><strong>Hallo ${patientGegevens.naam || 'daar'}!</strong></p>
        <p>Dit is jouw zorgplan. Hier staat wat belangrijk is voor jouw gezondheid.</p>
      </div>
      <p class="plan-date">Gemaakt op: ${new Date().toLocaleDateString('nl-BE')}</p>
    </div>
  `;
  
  // Sort bundles by priority
  const sortedBundles = [...selectedBundles].sort((a, b) => {
    const matchA = matchedBundles.find(m => m.bundel.nr === a.nr);
    const matchB = matchedBundles.find(m => m.bundel.nr === b.nr);
    const order = { hoog: 0, midden: 1, laag: 2 };
    return order[matchA?.prioriteit?.niveau || 'laag'] - order[matchB?.prioriteit?.niveau || 'laag'];
  });

     // Patient-friendly content for each bundle
  sortedBundles.forEach(bundel => {
    const match = matchedBundles.find(m => m.bundel.nr === bundel.nr);
    const prioriteit = match?.prioriteit || { niveau: 'laag', emoji: '🟢', kleur: '#22c55e' };
    
    const priorityText = prioriteit.niveau === 'hoog' ? 'Heel belangrijk' : 
                          prioriteit.niveau === 'midden' ? 'Belangrijk' : 'Goed om te weten';
    
    html += `
      <div class="bundel-section patient" style="border-left: 4px solid ${prioriteit.kleur}">
        <h3>${prioriteit.emoji} ${bundel.kortNaam}</h3>
        <p class="priority-label">${priorityText}</p>
        
        <div class="patient-content">
          <div class="what-is-this">
            <h4>❓ Wat betekent dit?</h4>
            <p>${getPatientExplanation(bundel)}</p>
          </div>
          
          <div class="what-to-do">
            <h4>✅ Wat kun je zelf doen?</h4>
            <p>${bundel.educatie}</p>
          </div>
          
          <div class="warning-signs">
            <h4>⚠️ Let op! Bel de dokter als...</h4>
            <p>${bundel.monitoring}</p>
          </div>
          
          <div class="home-changes">
            <h4>🏠 Tips voor thuis</h4>
            <ul>
              ${bundel.woningaanpassingen.map(w => `<li>${w}</li>`).join('')}
              ${bundel.hulpmiddelen.length > 0 ? bundel.hulpmiddelen.map(h => `<li>${h}</li>`).join('') : ''}
            </ul>
          </div>
          
          <div class="who-helps">
            <h4>👨‍⚕️ Wie kan je helpen?</h4>
            <ul>${bundel.zorgverleners.map(z => `<li>${z}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  planOutput.innerHTML = html;
}

 function getPatientExplanation(bundel) {
  const explanations = {
    1: "Je hebt een hoger risico op hart- en vaatziekten. Dit betekent dat je extra moet letten op je gezondheid.",
    2: "Je hebt diabetes. Dit betekent dat je lichaam moeite heeft met suiker verwerken.",
    3: "Je hart pompt niet zo goed als zou moeten. Daarom voel je je soms moe of kortademig.",
    4: "Je longen werken niet zo goed. Daarom kun je soms moeilijker ademen.",
    5: "Je nieren werken minder goed. Ze kunnen je bloed niet zo goed schoonmaken.",
    6: "Je hebt een groter risico om te vallen. We willen dat voorkomen.",
    7: "Je gebruikt veel medicijnen. Het is belangrijk dat je ze goed inneemt.",
    8: "Je eet misschien niet genoeg of niet gezond genoeg.",
    9: "Je geheugen werkt anders dan vroeger. We helpen je daarmee.",
    10: "Je voelt je misschien somber of angstig. Dat is niet gek en er is hulp voor.",
    11: "Je zorgt voor iemand anders. Dat is mooi maar ook zwaar.",
    12: "Je hebt pijn die lang aanhoudt. We zoeken naar manieren om je te helpen.",
    13: "Je bent ernstig ziek. We willen dat je zo comfortabel mogelijk bent.",
    14: "Je hebt soms moeite om op tijd naar het toilet te gaan of bent soms verward.",
    15: "Je ziet of hoort minder goed. Er zijn hulpmiddelen die kunnen helpen.",
    16: "Je hebt moeite met alcohol of andere middelen. Er is hulp beschikbaar."
  };
  return explanations[bundel.nr] || bundel.klinisch;
}

 // ========================
// NAVIGATION & UI
// ========================
function showStap(stapNr) {
  [stap1, stap2, stap3, stap4].forEach((stap, index) => {
    if (stap) {
      stap.classList.toggle('active', index + 1 <= stapNr);
      stap.classList.toggle('completed', index + 1 < stapNr);
    }
  });
}

function setMode(mode) {
  planMode = mode;
  if (modeProfessional) modeProfessional.classList.toggle('active', mode === 'professional');
  if (modePatient) modePatient.classList.toggle('active', mode === 'patient');
  
  // Regenerate plan if already generated
  if (planOutput && planOutput.innerHTML !== '') {
    generateZorgplan();
  }
}

function downloadPlan() {
  const content = planOutput?.innerHTML || '';
  const blob = new Blob([`<html><head><meta charset="utf-8"><style>${getStyles()}</style></head><body>${content}</body></html>`], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zorgplan_${patientGegevens.naam || 'patient'}_${new Date().toISOString().split('T')[0]}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function printPlan() {
  window.print();
}

 function getStyles() {
  return `
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    .plan-header { background: #f0f9ff; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
    .plan-header h2 { margin: 0 0 15px 0; color: #1e40af; }
    .patient-info p { margin: 5px 0; }
    .bundel-section { background: #fff; padding: 20px; margin: 15px 0; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .bundel-section h3 { margin: 0 0 15px 0; }
    .section { margin: 10px 0; padding: 10px; background: #f8fafc; border-radius: 5px; }
    .section h4 { margin: 0 0 8px 0; color: #475569; font-size: 14px; }
    .section p, .section ul { margin: 0; }
    .section ul { padding-left: 20px; }
    .priority-label { font-size: 12px; color: #666; font-weight: bold; margin: 5px 0; }
    .patient-version .bundel-section { font-size: 16px; line-height: 1.6; }
  `;
}

 // ========================
// EVENT LISTENERS
// ========================
document.addEventListener('DOMContentLoaded', function() {
  // File input
  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
  }

    // Upload zone click handler
  const uploadZone = document.getElementById('uploadZone');
  if (uploadZone && fileInput) {
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        const event = { target: { files: e.dataTransfer.files } };
        handleFileUpload(event);
      }
    });
  }
  
  // Extract terms button
  if (extractTermsBtn) {
    extractTermsBtn.addEventListener('click', extractTermsFromDocuments);
  }
  
  // Generate plan button
  if (generatePlanBtn) {
    generatePlanBtn.addEventListener('click', generateZorgplan);
  }
  
  // Mode toggle buttons
  if (modeProfessional) {
    modeProfessional.addEventListener('click', () => setMode('professional'));
  }
  if (modePatient) {
    modePatient.addEventListener('click', () => setMode('patient'));
  }
  
  // Patient info inputs
  if (patientNaam) {
    patientNaam.addEventListener('change', updatePatientInfo);
  }
  if (patientGeboortedatum) {
    patientGeboortedatum.addEventListener('change', updatePatientInfo);
  }
  
  // Initialize
  showStap(1);
  console.log('Zorgplan applicatie geladen!');

    // Maak functies globaal beschikbaar voor onclick handlers
  window.removeDocument = removeDocument;
  window.toggleBundle = toggleBundle;
});
