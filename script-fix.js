/* script-fix.js - Hotfix voor document upload bugs
 * Dit bestand overschrijft de gebroken handleFileUpload functie
 * en voegt globale exports toe voor downloadPlan en printPlan
 */

(function() {
  console.log('script-fix.js wordt geladen...');
  
  // Globale referenties naar DOM elementen
  const fileInput = document.getElementById('fileInput');
  const documentList = document.getElementById('documentList');
  const uploadedDocsTitle = document.getElementById('uploadedDocsTitle');
  const documentPreview = document.getElementById('documentPreviewContainer');
  const extractTermsBtn = document.getElementById('extractTerms');
  
  // State (hergebruik uploadedDocuments van originele script of maak nieuwe)
  if (typeof window.uploadedDocuments === 'undefined') {
    window.uploadedDocuments = [];
  }
  
  // GECORRIGEERDE handleFileUpload functie
  async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Preview container leegmaken
    if (documentPreview) {
      documentPreview.innerHTML = '';
    }
    
    for (let file of files) {
      const fileExtension = file.name.split('.').pop().toLowerCase();
      
      // Bepaal het juiste leestype op basis van extensie
      if (fileExtension === 'pdf' || fileExtension === 'docx' || fileExtension === 'doc') {
        // Lees als ArrayBuffer voor PDF en Word
        const reader = new FileReader();
        reader.onload = async function(e) {
          const arrayBuffer = e.target.result;
          let extractedText = '';
          
          try {
            if (fileExtension === 'pdf' && typeof pdfjsLib !== 'undefined') {
              // Extract text from PDF
              const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
              for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                extractedText += pageText + '\\n';
              }
              
              // Render preview
              if (documentPreview) {
                const page = await pdf.getPage(1);
                const scale = 1.0;
                const viewport = page.getViewport({ scale: scale });
                const canvas = document.createElement('canvas');
                canvas.className = 'pdf-preview-canvas';
                const context = canvas.getContext('2d');
                const maxWidth = 600;
                const ratio = maxWidth / viewport.width;
                canvas.width = maxWidth;
                canvas.height = viewport.height * ratio;
                const scaledViewport = page.getViewport({ scale: scale * ratio });
                await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
                const wrapper = document.createElement('div');
                wrapper.className = 'preview-item pdf-preview';
                wrapper.innerHTML = `<h5>📄 PDF Document - Pagina 1 van ${pdf.numPages}</h5>`;
                wrapper.appendChild(canvas);
                documentPreview.appendChild(wrapper);
              }
            } else if ((fileExtension === 'docx' || fileExtension === 'doc') && typeof mammoth !== 'undefined') {
              // Extract text from Word
              const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
              extractedText = result.value;
              
              // Render preview
              if (documentPreview) {
                const htmlResult = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
                const wrapper = document.createElement('div');
                wrapper.className = 'preview-item word-preview';
                wrapper.innerHTML = `<h5>📝 Word Document: ${file.name}</h5><div class="word-content">${htmlResult.value}</div>`;
                documentPreview.appendChild(wrapper);
              }
            }
          } catch (error) {
            console.error(`Fout bij verwerken van ${file.name}:`, error);
            extractedText = '[Fout bij extractie]';
          }
          
          // Voeg document toe aan lijst
          window.uploadedDocuments.push({
            name: file.name,
            content: extractedText,
            type: file.type,
            arrayBuffer: arrayBuffer
          });
          
          updateDocumentList();
          console.log(`Bestand verwerkt: ${file.name}`);
        };
        reader.readAsArrayBuffer(file);
      } else {
        // Lees als text voor txt, json, etc.
        const reader = new FileReader();
        reader.onload = function(e) {
          const textContent = e.target.result;
          
          window.uploadedDocuments.push({
            name: file.name,
            content: textContent,
            type: file.type
          });
          
          // Render text preview
          if (documentPreview) {
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-item text-preview';
            wrapper.innerHTML = `<h5>📃 Tekst Document: ${file.name}</h5><pre>${textContent.substring(0, 2000)}${textContent.length > 2000 ? '\\n\\n... (bestand afgekort voor preview)' : ''}</pre>`;
            documentPreview.appendChild(wrapper);
          }
          
          updateDocumentList();
          console.log(`Bestand verwerkt: ${file.name}`);
        };
        reader.readAsText(file);
      }
    }
  }
  
  // Update document list in UI
  function updateDocumentList() {
    if (!documentList) return;
    
    documentList.innerHTML = '';
    window.uploadedDocuments.forEach((doc, index) => {
      const li = document.createElement('li');
      li.className = 'uploaded-document-item';
      li.innerHTML = `<span>📄 ${doc.name}</span><button class="doc-remove-btn" data-index="${index}">✕</button>`;
      documentList.appendChild(li);
    });
    
    // Update button state
    if (extractTermsBtn) {
      extractTermsBtn.disabled = window.uploadedDocuments.length === 0;
    }
    
    // Toon/verberg de titel
    if (uploadedDocsTitle) {
      uploadedDocsTitle.style.display = window.uploadedDocuments.length > 0 ? 'block' : 'none';
    }
  }
  
  // Remove document handler
  function removeDocument(index) {
    window.uploadedDocuments.splice(index, 1);
    updateDocumentList();
    if (documentPreview) {
      documentPreview.innerHTML = '';
    }
  }
  
  // Event listeners setup
  if (fileInput) {
    // Remove old listeners (if any)
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    
    // Add new listener
    newFileInput.addEventListener('change', handleFileUpload);
    console.log('File input listener toegevoegd');
  }
  
  // Remove document button handler (delegated)
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('doc-remove-btn')) {
      const index = parseInt(e.target.dataset.index);
      removeDocument(index);
    }
  });
  
  // Export global functies voor downloadPlan en printPlan
  // (deze werden in originele script wel gedefinieerd maar niet geëxporteerd)
  window.downloadPlan = function() {
    const planOutput = document.getElementById('planOutput');
    if (!planOutput) return;
    
    const content = planOutput.innerHTML;
    const styles = `
      <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
        .plan-header { background: #f0f9ff; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        h2 { color: #1e40af; margin: 0 0 15px 0; }
        .bundel-section { background: #fff; padding: 20px; margin: 15px 0; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        h3 { margin: 0 0 15px 0; }
        .section { margin: 10px 0; padding: 10px; background: #f8fafc; border-radius: 5px; }
        .section h4 { margin: 0 0 8px 0; color: #475569; font-size: 14px; }
        ul { padding-left: 20px; }
      </style>
    `;
    
    const blob = new Blob([styles + content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const patientNaam = document.getElementById('patientNaam')?.value || 'patient';
    a.download = `zorgplan_${patientNaam}_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  window.printPlan = function() {
    window.print();
  };
  
  console.log('script-fix.js geladen!  Upload fix actief ✓');
})();
