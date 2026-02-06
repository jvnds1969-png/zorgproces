/* ============================
   Zorgstart - Upload & Preview
   PDF (pdf.js) + DOCX (mammoth)
   ============================ */

(() => {
  // ---- Elements
  const uploadZone = document.getElementById("uploadZone");
  let fileInput = document.getElementById("fileInput");
     
  // Create fileInput if it doesn't exist (was commented out in HTML)
  if (!fileInput) {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'fileInput';
    input.accept = '.pdf,.docx,.txt';
    input.style.display = 'none';
    document.body.appendChild(input);
    fileInput = input; // Update the const reference
  }
  const documentList = document.getElementById("documentList");
  const uploadedDocsTitle = document.getElementById("uploadedDocsTitle");

  const previewSection = document.getElementById("documentPreviewSection");
  const previewContainer = document.getElementById("documentPreviewContainer");

  const extractBtn = document.getElementById("extractTerms");

  // ---- State (1 document "onder punt 1")
  let currentFile = null;
  let currentTextContent = ""; // voor latere analyse

  // ---- PDF.js worker (belangrijk!)
  // pdfjsLib wordt gezet door de CDN script tag.
  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // ---- Helpers
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
      "'": "&#039;",
    }[m]));
  }

  function showError(msg) {
    previewContainer.innerHTML = `<div style="padding:12px;border:1px solid #e2e8f0;background:#fff;border-radius:10px;">
      <strong>Kan niet tonen</strong><div style="margin-top:6px;">${escapeHtml(msg)}</div>
    </div>`;
    previewSection.style.display = "block";
  }

  // ---- File handling
  function isAllowed(file) {
    const name = (file.name || "").toLowerCase();
    const okExt =
      name.endsWith(".pdf") ||
      name.endsWith(".docx") ||
      name.endsWith(".txt");

    // .doc is bewust NIET toegestaan: browser parsing is onbetrouwbaar zonder server.
    return okExt;
  }

  function handleFile(file) {
    if (!file) return;

    if (!isAllowed(file)) {
      showError("Bestandstype niet ondersteund. Gebruik .pdf, .docx of .txt (geen .doc).");
      return;
    }

    currentFile = file;
    resetPreview();
    setUploadedUI(file);
    previewFile(file);
  }

  // ---- Preview: PDF
  async function previewPdf(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      previewContainer.innerHTML = "";
      previewSection.style.display = "block";

      // Render eerste pagina (snel + bruikbaar)
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.25 });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      previewContainer.appendChild(canvas);

      await page.render({ canvasContext: ctx, viewport }).promise;

      // (Optioneel) tekst extractie voor “Analyseer”
      const textContent = await page.getTextContent();
      currentTextContent = (textContent.items || [])
        .map((it) => it.str)
        .join(" ")
        .trim();

      if (!currentTextContent) {
        currentTextContent = "(Geen tekst gevonden op pagina 1 - mogelijk gescand document.)";
      }
    } catch (err) {
      console.error(err);
      showError("PDF preview mislukt. Mogelijk is het document beschadigd of te groot.");
    }
  }

  // ---- Preview: DOCX
  async function previewDocx(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();

      // mammoth output naar HTML
      const result = await window.mammoth.convertToHtml({ arrayBuffer });

      previewContainer.innerHTML = "";
      previewSection.style.display = "block";

      const wrapper = document.createElement("div");
      wrapper.style.padding = "12px";
      wrapper.style.border = "1px solid #e2e8f0";
      wrapper.style.background = "#fff";
      wrapper.style.borderRadius = "10px";
      wrapper.innerHTML = result.value || "<em>Leeg document</em>";

      // basis styling voor docx html
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

      // Tekst voor analyse
      const tmp = document.createElement("div");
      tmp.innerHTML = result.value || "";
      currentTextContent = tmp.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!currentTextContent) currentTextContent = "(Geen tekst gevonden in dit Word-document.)";
    } catch (err) {
      console.error(err);
      showError("DOCX preview mislukt. Gebruik bij voorkeur een .docx (geen .doc).");
    }
  }

  // ---- Preview: TXT
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
      showError("TXT preview mislukt.");
    }
  }

  async function previewFile(file) {
    if (!file) return;

    const name = (file.name || "").toLowerCase();

    if (name.endsWith(".pdf")) return previewPdf(file);
    if (name.endsWith(".docx")) return previewDocx(file);
    if (name.endsWith(".txt")) return previewTxt(file);

    showError("Bestandstype niet ondersteund voor preview.");
  }

  // ---- Upload-zone events (klik + keyboard)
  uploadZone.addEventListener("click", () => fileInput.click());
  uploadZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0] || null;
    handleFile(file);
  });

  // ---- Drag & drop
  ["dragenter", "dragover"].forEach((evt) => {
    uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove("dragover");
    });
  });

  uploadZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0] || null;
    handleFile(file);
  });

  // ---- Analyse button (nu gewoon proof-of-life: toont tekstlengte)
  extractBtn.addEventListener("click", () => {
    if (!currentFile) return;

    // Hier kan jij later jouw term-extractie pipeline hangen
    alert(`Document geladen: ${currentFile.name}\nTekst (eerste extract): ${Math.min(currentTextContent.length, 500)} tekens beschikbaar.`);
  });

  // ---- Optional: expose for debugging
  window.__zorgstartUpload = {
    getCurrentText: () => currentTextContent,
    getCurrentFile: () => currentFile
  };
})();
