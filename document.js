// ============================================================
// MEDICAL DOCUMENTS (medical-certificate.html, medical-test.html)
// Shared logic for looking up a medical certificate or a medical
// test result with the code given by an EMS doctor.
//
// SECURITY:
//   - Search requires a real Discord session (getAuthUser from
//     script.js). No session -> login modal, nothing is queried.
//   - The lookup filters by the document code AND the current
//     user's discord_id.
//   - RLS on the table guarantees that rows of other users are
//     never returned, so a foreign code is indistinguishable from
//     a missing one (no information leak).
//   - Files are never stored in the DB. Only a storage path is
//     kept in file_url and the client requests a short-lived
//     SIGNED URL after it proved ownership.
// ============================================================

(function () {
  const pageId = document.body ? document.body.id : '';
  const DOC_TYPE = pageId === 'certificatePage' ? 'certificate' : (pageId === 'testPage' ? 'test' : null);
  if (!DOC_TYPE) return;

  const cfg = DOC_TYPE === 'certificate' ? {
    table: 'medical_certificates',
    codeColumn: 'certificate_code',
    dateColumn: 'certificate_date',
    title: 'MEDICAL CERTIFICATE',
    notFoundTitle: 'CERTIFICATE NOT FOUND',
    notFoundMsg: 'No medical certificate was found for your account. Please check the code provided by your EMS doctor.',
    downloadLabel: 'DOWNLOAD CERTIFICATE',
    hasViewButton: false,
    filenameBase: 'certificate',
    fields: [
      ['Certificate ID', 'certificate_code'],
      ['Patient', 'patient_name'],
      ['Doctor', 'doctor_name'],
      ['Hospital', 'hospital_name'],
      ['Certificate Type', 'certificate_type'],
      ['Date', 'certificate_date'],
      ['Content', 'content']
    ]
  } : {
    table: 'medical_tests',
    codeColumn: 'test_code',
    dateColumn: 'test_date',
    title: 'MEDICAL TEST RESULT',
    notFoundTitle: 'MEDICAL TEST NOT FOUND',
    notFoundMsg: 'No medical test was found for your account. Please check the code provided by your EMS doctor.',
    downloadLabel: 'DOWNLOAD TEST',
    hasViewButton: true,
    filenameBase: 'test',
    fields: [
      ['Test ID', 'test_code'],
      ['Patient', 'patient_name'],
      ['Doctor', 'doctor_name'],
      ['Test Type', 'test_type'],
      ['Date', 'test_date'],
      ['Result', 'result'],
      ['Notes', 'notes']
    ]
  };

  // ---- DOM refs ----
  const docForm = document.getElementById('docForm');
  const docCodeInput = document.getElementById('docCodeInput');
  const docSearchBtn = document.getElementById('docSearchBtn');
  const docResult = document.getElementById('docResult');
  const docLoginModal = document.getElementById('docLoginModal');
  const bucket = 'medical-documents';

  let searchLock = false;

  // ---- helpers ----
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(v) {
    if (!v) return '';
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
  }

  function fileExt(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function showToast(message, type) {
    let toast = document.getElementById('docToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'docToast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'med-toast ' + (type === 'error' ? 'med-toast-error' : 'med-toast-success') + ' show';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 3500);
  }

  // ---- storage (private bucket -> short-lived signed URL) ----
  async function getSignedUrl(path, seconds) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path; // already a permanent URL
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds || 120);
      if (error) throw error;
      return data && data.signedUrl;
    } catch (err) {
      console.error('Doc: failed to sign file', err);
      return null;
    }
  }

  function downloadBlob(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'document';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function downloadDoc(fileUrl, filename) {
    const url = await getSignedUrl(fileUrl, 60);
    if (!url) { showToast('Unable to download the document. Please try again later.', 'error'); return; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      downloadBlob(objUrl, filename);
      setTimeout(function () { URL.revokeObjectURL(objUrl); }, 4000);
    } catch (err) {
      // Cross-origin edge case: fall back to opening the signed URL.
      window.open(url, '_blank');
    }
  }

  // ---- rendering ----
  function clearResult() {
    if (docResult) docResult.innerHTML = '';
  }

  function renderDoc(row) {
    if (!docResult) return;
    const status = String(row.status || 'VALID').toUpperCase();
    const revoked = status === 'REVOKED';
    const wf = String(row.workflow_status || 'READY').toUpperCase();
    const ready = (wf === 'READY' || wf === 'COMPLETED') && !revoked;
    const code = row[cfg.codeColumn] || '';
    const ext = fileExt(row.file_url);

    let html =
      '<div class="doc-viewer-card">' +
        '<div class="doc-viewer-head">' +
          '<h3 class="doc-viewer-title">' + esc(cfg.title) + '</h3>' +
          '<span class="doc-status-badge doc-status-' + esc(status.toLowerCase()) + '">' + esc(status) + '</span>' +
        '</div>' +
        '<div class="doc-body">';

    if (ready) {
      cfg.fields.forEach(function (f) {
        let val = row[f[1]];
        if (f[1] === cfg.dateColumn) val = fmtDate(val);
        if (val == null || val === '') return;
        html += '<div class="doc-row"><span class="doc-label">' + esc(f[0]) + '</span><span class="doc-value">' + esc(val) + '</span></div>';
      });
    }

    html += '</div>';

    if (revoked) {
      html +=
        '<div class="doc-unavailable">' +
          '<h4>Document Unavailable</h4>' +
          '<p>This medical document is no longer valid.</p>' +
        '</div>';
    } else if (wf === 'REJECTED') {
      html +=
        '<div class="doc-unavailable">' +
          '<h4>Document Rejected</h4>' +
          '<p>This document was not approved. Please contact your EMS doctor for details.</p>' +
        '</div>';
    } else if (!ready) {
      html +=
        '<div class="doc-unavailable">' +
          '<h4>Document Not Ready</h4>' +
          '<p>This document is still being processed. Please check again later.</p>' +
        '</div>';
    } else {
      if (row.file_url) html += '<div id="docFileArea"></div>';
      if (row.file_url) {
        html +=
          '<div class="doc-actions">';
        if (cfg.hasViewButton) {
          html += '<button type="button" class="btn btn-outline" id="docViewBtn">VIEW DOCUMENT</button>';
        }
        html += '<button type="button" class="btn btn-primary" id="docDownloadBtn">' + esc(cfg.downloadLabel) + '</button></div>';
      }
    }

    html += '</div>';
    docResult.innerHTML = html;
    docResult.style.display = 'block';

    if (ready && row.file_url) {
      attachFile(row.file_url, (code || cfg.filenameBase) + (ext ? '.' + ext : ''));
    }
  }

  async function attachFile(fileUrl, filename) {
    const area = document.getElementById('docFileArea');
    if (!area) return;
    const url = await getSignedUrl(fileUrl, 120);
    if (!url) { area.innerHTML = '<p class="med-empty">The document file could not be loaded.</p>'; return; }

    const ext = fileExt(fileUrl);
    if (ext === 'pdf') {
      area.innerHTML = '<div class="doc-iframe-wrap"><iframe class="doc-pdf" src="' + esc(url) + '" title="Medical document"></iframe></div>';
    } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].indexOf(ext) !== -1) {
      area.innerHTML = '<img class="doc-img" src="' + esc(url) + '" alt="Medical document">';
    } else {
      area.innerHTML = '<p class="med-empty">No preview available for this file type.</p>';
    }

    const downloadBtn = document.getElementById('docDownloadBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () { downloadDoc(fileUrl, filename); });
    }
    const viewBtn = document.getElementById('docViewBtn');
    if (viewBtn) {
      viewBtn.addEventListener('click', function () { window.open(url, '_blank'); });
    }
  }

  function renderNotFound() {
    if (!docResult) return;
    docResult.innerHTML =
      '<div class="doc-notfound">' +
        '<h3>' + esc(cfg.notFoundTitle) + '</h3>' +
        '<p>' + esc(cfg.notFoundMsg) + '</p>' +
        '<button type="button" class="btn btn-outline" id="docTryAgainBtn">TRY AGAIN</button>' +
      '</div>';
    docResult.style.display = 'block';
    const btn = document.getElementById('docTryAgainBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        clearResult();
        docResult.style.display = 'none';
        if (docCodeInput) { docCodeInput.value = ''; docCodeInput.focus(); }
      });
    }
  }

  // ---- search ----
  async function handleDocSearch(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (searchLock) return;

    // 1) Discord session first.
    const user = await getAuthUser();
    if (!user) {
      if (docLoginModal) docLoginModal.classList.add('active');
      return;
    }

    // 2) Code required.
    const code = docCodeInput ? docCodeInput.value.trim() : '';
    if (!code) {
      showToast('Please enter the ID provided by your EMS doctor.', 'error');
      if (docCodeInput) docCodeInput.focus();
      return;
    }

    // 3) Query by code AND discord_id (RLS double-checks ownership).
    searchLock = true;
    if (docSearchBtn) { docSearchBtn.disabled = true; }
    const original = docSearchBtn ? docSearchBtn.textContent : '';
    if (docSearchBtn) docSearchBtn.textContent = 'SEARCHING...';

    try {
      const { data, error } = await supabase
        .from(cfg.table)
        .select('*')
        .eq(cfg.codeColumn, code)
        .eq('discord_id', user.discordId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        renderDoc(data);
      } else {
        // Same message whether the code does not exist or belongs to
        // another user - never reveal the existence of foreign documents.
        renderNotFound();
      }
    } catch (err) {
      console.error('Doc: search failed', err);
      showToast('Unable to search right now. Please try again later.', 'error');
    } finally {
      searchLock = false;
      if (docSearchBtn) { docSearchBtn.disabled = false; docSearchBtn.textContent = original; }
    }
  }

  // ---- modal ----
  function closeDocLogin() {
    if (docLoginModal) docLoginModal.classList.remove('active');
  }
  window.closeDocLogin = closeDocLogin;

  // ---- init ----
  if (docForm) docForm.addEventListener('submit', handleDocSearch);
  if (docSearchBtn) docSearchBtn.addEventListener('click', handleDocSearch);
  if (docLoginModal) {
    docLoginModal.addEventListener('click', function (e) {
      if (e.target === docLoginModal) closeDocLogin();
    });
  }
})();
