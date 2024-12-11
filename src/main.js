import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Set worker path to local file
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';


let pdfDoc = null;
let currentPage = 1;
let signaturePad = null;
let currentScale = 1.5;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize signature pad
    const canvas = document.getElementById('signature-pad');
    signaturePad = new SignaturePad(canvas);

    // Event listeners
    document.getElementById('document-upload').addEventListener('change', handleFileUpload);
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
    document.getElementById('save-signature').addEventListener('click', handleSaveSignature);
    document.getElementById('clear-signature').addEventListener('click', () => signaturePad.clear());
    document.getElementById('download-doc').addEventListener('click', handleDownload);

    // Initialize signature pad with proper size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
});

function resizeCanvas() {
    const canvas = document.getElementById('signature-pad');
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.classList.remove('hidden');

        try {
            const arrayBuffer = await file.arrayBuffer();
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            currentPage = 1;
            await renderPage(currentPage);
            updatePageControls();
        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Error loading PDF. Please try again.');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    }
}

async function renderPage(pageNumber) {
    if (!pdfDoc) return;

    try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: currentScale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const pdfViewer = document.getElementById('pdf-viewer');
        pdfViewer.innerHTML = '';
        pdfViewer.appendChild(canvas);

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

    } catch (error) {
        console.error('Error rendering page:', error);
        alert('Error rendering page. Please try again.');
    }
}

function changePage(delta) {
    if (!pdfDoc) return;

    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= pdfDoc.numPages) {
        currentPage = newPage;
        renderPage(currentPage);
        updatePageControls();
    }
}

function updatePageControls() {
    const pageNum = document.getElementById('page-num');
    pageNum.textContent = `Page ${currentPage} of ${pdfDoc.numPages}`;
}

class SignaturePad {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isDrawing = false;
        this.points = [];

        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.setupListeners();
    }

    setupListeners() {
        this.canvas.addEventListener('pointerdown', this.startDrawing.bind(this));
        this.canvas.addEventListener('pointermove', this.draw.bind(this));
        this.canvas.addEventListener('pointerup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('pointerout', this.stopDrawing.bind(this));
    }

    startDrawing(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.points = [[x, y]];
    }

    draw(e) {
        if (!this.isDrawing) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.points.push([x, y]);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
    }

    stopDrawing() {
        this.isDrawing = false;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.points = [];
    }

    isEmpty() {
        return this.points.length === 0;
    }

    toDataURL() {
        return this.canvas.toDataURL('image/png');
    }
}

async function handleSaveSignature() {
  if (signaturePad.isEmpty()) {
      alert('Please draw a signature first');
      return;
  }

  // Create signature image
  const signatureImage = document.createElement('img');
  signatureImage.src = signaturePad.toDataURL();
  signatureImage.className = 'signature-preview';
  signatureImage.style.maxWidth = '200px';

  // Remove existing signature if any
  const existingSignature = document.querySelector('.signature-preview');
  if (existingSignature) {
      existingSignature.remove();
  }

  // Add to PDF viewer
  const pdfViewer = document.getElementById('pdf-viewer');
  pdfViewer.appendChild(signatureImage);

  // Initialize position at center of viewer
  const viewerRect = pdfViewer.getBoundingClientRect();
  const initialX = (viewerRect.width - signatureImage.offsetWidth) / 2;
  const initialY = viewerRect.height / 4; // Position at first quarter of height
  
  signatureImage.style.left = `${initialX}px`;
  signatureImage.style.top = `${initialY}px`;

  makeDraggable(signatureImage);
}

function makeDraggable(element) {
  let active = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  element.addEventListener('mousedown', dragStart, false);
  element.addEventListener('touchstart', dragStart, false);
  document.addEventListener('mousemove', drag, false);
  document.addEventListener('touchmove', drag, false);
  document.addEventListener('mouseup', dragEnd, false);
  document.addEventListener('touchend', dragEnd, false);

  function dragStart(e) {
      if (e.type === 'touchstart') {
          initialX = e.touches[0].clientX - xOffset;
          initialY = e.touches[0].clientY - yOffset;
      } else {
          initialX = e.clientX - xOffset;
          initialY = e.clientY - yOffset;
      }

      if (e.target === element) {
          active = true;
      }
  }

  function drag(e) {
      if (active) {
          e.preventDefault();

          const pdfViewer = document.getElementById('pdf-viewer');
          const rect = pdfViewer.getBoundingClientRect();

          if (e.type === 'touchmove') {
              currentX = e.touches[0].clientX - initialX;
              currentY = e.touches[0].clientY - initialY;
          } else {
              currentX = e.clientX - initialX;
              currentY = e.clientY - initialY;
          }

          // Constrain movement within PDF viewer bounds
          currentX = Math.min(Math.max(0, currentX), rect.width - element.offsetWidth);
          currentY = Math.min(Math.max(0, currentY), rect.height - element.offsetHeight);

          xOffset = currentX;
          yOffset = currentY;

          element.style.left = `${currentX}px`;
          element.style.top = `${currentY}px`;
      }
  }

  function dragEnd() {
      initialX = currentX;
      initialY = currentY;
      active = false;
  }
}

// Update the CSS for the PDF viewer and signature
const style = document.createElement('style');
style.textContent = `
  #pdf-viewer {
      position: relative !important;
      overflow: hidden;
  }

  .signature-preview {
      position: absolute !important;
      cursor: move;
      z-index: 1000;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
  }

  #pdf-viewer canvas {
      z-index: 1;
  }
`;
document.head.appendChild(style);

async function handleDownload() {
    if (!pdfDoc) {
        alert('Please upload a PDF first');
        return;
    }

    const signature = document.querySelector('.signature-preview');
    if (!signature) {
        alert('Please add a signature first');
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('hidden');

    try {
        const pdfCanvas = document.querySelector('#pdf-viewer canvas');
        const signaturePosition = {
            x: parseInt(signature.style.left) / pdfCanvas.width,
            y: 1 - (parseInt(signature.style.top) + signature.height) / pdfCanvas.height,
            width: signature.width / pdfCanvas.width,
            height: signature.height / pdfCanvas.height
        };

        // Create new PDF with signature
        const pdfBytes = await createSignedPDF(signaturePosition);
        
        // Download the PDF
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'signed-document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading PDF:', error);
        alert('Error generating PDF. Please try again.');
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

async function createSignedPDF(signaturePosition) {
    const formData = new FormData();
    const pdfFile = document.getElementById('document-upload').files[0];
    const pdfArrayBuffer = await pdfFile.arrayBuffer();
    
    const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    const page = pages[currentPage - 1];

    const signatureImage = document.querySelector('.signature-preview');
    const signatureBytes = await fetch(signatureImage.src).then(res => res.arrayBuffer());
    const signatureEmbed = await pdfDoc.embedPng(signatureBytes);

    const { width, height } = page.getSize();
    page.drawImage(signatureEmbed, {
        x: width * signaturePosition.x,
        y: height * signaturePosition.y,
        width: width * signaturePosition.width,
        height: height * signaturePosition.height
    });

    return await pdfDoc.save();
}