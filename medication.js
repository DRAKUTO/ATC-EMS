// ============================================================
// MEDICATION REQUEST (medication.html)
// Uses the REAL Supabase tables: medications, promo_codes,
// medication_requests. Prices are recomputed server-side by a
// Postgres trigger - the frontend never controls prices/status.
// ============================================================

// ---- DOM refs (null-safe so this file is safe on any page) ----
const medCatalogGrid = document.getElementById('medCatalog');
const medLoginModal = document.getElementById('medLoginModal');
const medRequestModal = document.getElementById('medRequestModal');
const medSuccessModal = document.getElementById('medSuccessModal');
const myRequestsSection = document.getElementById('myRequestsSection');
const myRequestsList = document.getElementById('myRequestsList');

const medModalImage = document.getElementById('medModalImage');
const medModalName = document.getElementById('medModalName');
const medModalDesc = document.getElementById('medModalDesc');
const medModalUnitPrice = document.getElementById('medModalUnitPrice');
const medQtyMinus = document.getElementById('medQtyMinus');
const medQtyPlus = document.getElementById('medQtyPlus');
const medQtyInput = document.getElementById('medQty');
const medSubtotalEl = document.getElementById('medSubtotal');
const medPromoInput = document.getElementById('medPromoInput');
const medPromoApplyBtn = document.getElementById('medPromoApplyBtn');
const medPromoMessage = document.getElementById('medPromoMessage');
const medDiscountRow = document.getElementById('medDiscountRow');
const medDiscountEl = document.getElementById('medDiscountValue');
const medFinalRow = document.getElementById('medFinalRow');
const medFinalEl = document.getElementById('medFinalValue');
const medRequestBtn = document.getElementById('medRequestBtn');
const medRequestCancelBtn = document.getElementById('medRequestCancelBtn');
const medSuccessCode = document.getElementById('medSuccessCode');
const medCopyBtn = document.getElementById('medCopyBtn');
const medCopyFeedback = document.getElementById('medCopyFeedback');

let medCurrent = null;      // the medication currently in the request modal
let medAppliedPromo = null; // { code, type, value } after a valid APPLY
let medSubmitLock = false;

// ---- tiny helpers ----
function medMoney(n) {
  return '$' + (Number(n || 0)).toFixed(2);
}

function medFormatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear();
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

// ---- toast ----
function showMedToast(message, type) {
  let toast = document.getElementById('medToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'medToast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'med-toast ' + (type === 'error' ? 'med-toast-error' : 'med-toast-success') + ' show';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 3500);
}

// ---- image fallback (offline / broken image URLs) ----
function medImgFallback(img) {
  img.onerror = null;
  img.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="#0d6b8a"/><text x="50%" y="50%" fill="#ffffff" font-family="Arial" font-size="22" text-anchor="middle" dominant-baseline="middle">ATLANTIC EMS</text></svg>'
  );
}

// ---- catalog ----
async function loadMedications() {
  if (!medCatalogGrid) return;
  medCatalogGrid.innerHTML = '<p class="med-loading">Loading pharmacy...</p>';
  try {
    const { data, error } = await supabase.from('medications').select('*').order('name');
    if (error) throw error;
    if (!data || !data.length) {
      medCatalogGrid.innerHTML = '<p class="med-empty">No medications available right now.</p>';
      return;
    }
    medCatalogGrid.innerHTML = '';
    data.forEach(function (med) { medCatalogGrid.appendChild(medCard(med)); });
  } catch (err) {
    console.error('Medications: failed to load catalog', err);
    medCatalogGrid.innerHTML = '<p class="med-empty">Unable to load the pharmacy right now. Please try again later.</p>';
  }
}

function medCard(med) {
  const available = !!med.is_available && Number(med.stock) > 0;

  const article = document.createElement('article');
  article.className = 'med-card';

  const img = document.createElement('img');
  img.className = 'med-card-img';
  img.alt = med.name || 'Medication';
  img.loading = 'lazy';
  img.src = med.image_url || '';
  img.onerror = function () { medImgFallback(img); };
  article.appendChild(img);

  const badge = document.createElement('span');
  badge.className = 'med-card-badge ' + (available ? 'med-badge-ok' : 'med-badge-off');
  badge.textContent = available ? 'Available' : 'Out of Stock';
  article.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'med-card-body';

  const name = document.createElement('h3');
  name.className = 'med-card-name';
  name.textContent = med.name || 'Medication';
  body.appendChild(name);

  const desc = document.createElement('p');
  desc.className = 'med-card-desc';
  desc.textContent = med.description || '';
  body.appendChild(desc);

  const price = document.createElement('div');
  price.className = 'med-card-price';
  price.textContent = medMoney(med.price);
  body.appendChild(price);

  if (available) {
    const stock = document.createElement('div');
    stock.className = 'med-card-stock';
    stock.textContent = 'In stock: ' + med.stock;
    body.appendChild(stock);
  }

  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-sm';
  btn.type = 'button';
  btn.textContent = 'Request';
  btn.disabled = !available;
  btn.addEventListener('click', function () { openMedRequest(med); });
  body.appendChild(btn);

  article.appendChild(body);
  return article;
}

// ---- request modal ----
function openMedRequest(med) {
  if (!medRequestModal || !med) return;
  medCurrent = med;
  medAppliedPromo = null;
  if (medModalImage) {
    medModalImage.src = med.image_url || '';
    medModalImage.onerror = function () { medImgFallback(medModalImage); };
  }
  if (medModalName) medModalName.textContent = med.name || '';
  if (medModalDesc) medModalDesc.textContent = med.description || '';
  if (medModalUnitPrice) medModalUnitPrice.textContent = medMoney(med.price);
  if (medQtyInput) medQtyInput.value = '1';
  if (medPromoInput) medPromoInput.value = '';
  hidePromoResults();
  updateMedSubtotal();
  medRequestModal.classList.add('active');
}

function closeMedRequest() {
  if (!medRequestModal) return;
  medRequestModal.classList.remove('active');
  medCurrent = null;
  medAppliedPromo = null;
}

function updateMedQty(delta) {
  if (!medCurrent || !medQtyInput) return;
  let qty = parseInt(medQtyInput.value, 10) || 1;
  qty += delta;
  if (qty < 1) qty = 1;
  const max = Math.max(1, Number(medCurrent.stock) || 999);
  if (qty > max) qty = max;
  medQtyInput.value = String(qty);
  updateMedSubtotal();
}

function computeMedDiscount(amount, promo) {
  if (!promo) return 0;
  const value = Number(promo.value) || 0;
  if (promo.type === 'fixed') return Math.min(value, amount);
  return Math.round(amount * value) / 100;
}

function updateMedSubtotal() {
  if (!medCurrent || !medSubtotalEl) return;
  const qty = parseInt(medQtyInput ? medQtyInput.value : '1', 10) || 1;
  const unit = Number(medCurrent.price) || 0;
  const subtotal = unit * qty;
  medSubtotalEl.textContent = medMoney(subtotal);
  if (medAppliedPromo) {
    const discount = computeMedDiscount(subtotal, medAppliedPromo);
    if (medDiscountEl) medDiscountEl.textContent = '-' + medMoney(discount);
    if (medFinalEl) medFinalEl.textContent = medMoney(subtotal - discount);
  }
}

function hidePromoResults() {
  if (medPromoMessage) { medPromoMessage.textContent = ''; medPromoMessage.className = 'med-promo-msg'; }
  if (medDiscountRow) medDiscountRow.style.display = 'none';
  if (medFinalRow) medFinalRow.style.display = 'none';
  if (medPromoInput) medPromoInput.classList.remove('med-promo-invalid', 'med-promo-valid');
}

function showPromoError(msg) {
  if (!medPromoMessage) return;
  medPromoMessage.className = 'med-promo-msg med-promo-msg-error';
  medPromoMessage.textContent = msg;
}

// ---- promo code APPLY ----
async function applyMedPromo() {
  if (!medPromoInput || !medPromoApplyBtn) return;
  const code = medPromoInput.value.trim();
  if (!code) { showPromoError('Please enter a promo code.'); return; }
  medPromoApplyBtn.disabled = true;
  const original = medPromoApplyBtn.textContent;
  medPromoApplyBtn.textContent = 'Checking...';
  try {
    const { data, error } = await supabase.rpc('validate_promo_code', { p_code: code });
    if (error) throw error;
    const res = data || {};
    if (res.valid) {
      medAppliedPromo = { code: code, type: res.discount_type, value: res.discount_value };
      if (medPromoInput) { medPromoInput.classList.add('med-promo-valid'); medPromoInput.classList.remove('med-promo-invalid'); }
      if (medPromoMessage) { medPromoMessage.className = 'med-promo-msg med-promo-msg-ok'; medPromoMessage.textContent = res.message || 'Promo code applied successfully.'; }
      if (medDiscountRow) medDiscountRow.style.display = 'flex';
      if (medFinalRow) medFinalRow.style.display = 'flex';
      updateMedSubtotal();
    } else {
      medAppliedPromo = null;
      if (medPromoInput) { medPromoInput.classList.add('med-promo-invalid'); medPromoInput.classList.remove('med-promo-valid'); }
      showPromoError(res.message || 'Invalid promo code.');
      if (medDiscountRow) medDiscountRow.style.display = 'none';
      if (medFinalRow) medFinalRow.style.display = 'none';
    }
  } catch (err) {
    console.error('Medications: promo check failed', err);
    medAppliedPromo = null;
    showPromoError('Unable to check the promo code. Please try again.');
  } finally {
    medPromoApplyBtn.disabled = false;
    medPromoApplyBtn.textContent = original;
  }
}

// ---- request code ----
function generateRequestCode() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'MED-' + yyyy + mm + dd + '-' + suffix;
}

// ---- submit ----
async function submitMedRequest() {
  if (!medCurrent || medSubmitLock) return;
  const user = await getAuthUser();
  if (!user) {
    closeMedRequest();
    if (medLoginModal) medLoginModal.classList.add('active');
    return;
  }

  const qty = parseInt(medQtyInput ? medQtyInput.value : '1', 10) || 1;
  medSubmitLock = true;
  if (medRequestBtn) medRequestBtn.disabled = true;
  const original = medRequestBtn ? medRequestBtn.textContent : '';
  if (medRequestBtn) medRequestBtn.textContent = 'Submitting...';

  let successCode = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const payload = {
      request_code: generateRequestCode(),
      discord_id: user.discordId,
      discord_name: user.name,
      medication_id: medCurrent.id,
      quantity: qty
    };
    if (medAppliedPromo && medAppliedPromo.code) payload.promo_code = medAppliedPromo.code;
    try {
      const { data, error } = await supabase
        .from('medication_requests')
        .insert([payload])
        .select('request_code')
        .maybeSingle();
      if (error) throw error;
      if (data && data.request_code) { successCode = data.request_code; break; }
    } catch (err) {
      console.error('Medications: insert failed on attempt ' + (attempt + 1), err);
    }
  }

  medSubmitLock = false;
  if (medRequestBtn) { medRequestBtn.disabled = false; medRequestBtn.textContent = original; }

  if (successCode) {
    closeMedRequest();
    showMedSuccess(successCode);
    loadMyRequests();
  } else {
    showMedToast('Unable to submit your request. Please try again later.', 'error');
  }
}

// ---- success modal ----
function showMedSuccess(code) {
  if (!medSuccessModal) return;
  if (medSuccessCode) medSuccessCode.value = code;
  if (medCopyFeedback) { medCopyFeedback.textContent = '✓ Copied successfully'; medCopyFeedback.style.display = 'none'; }
  medSuccessModal.classList.add('active');
}

function closeMedSuccess() {
  if (medSuccessModal) medSuccessModal.classList.remove('active');
}

function copyMedCode() {
  if (!medSuccessCode) return;
  const done = function () {
    if (medCopyFeedback) { medCopyFeedback.style.display = 'block'; }
    setTimeout(function () { if (medCopyFeedback) medCopyFeedback.style.display = 'none'; }, 3000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(medSuccessCode.value).then(done).catch(function () {
      fallbackCopy(medSuccessCode.value);
      done();
    });
  } else {
    fallbackCopy(medSuccessCode.value);
    done();
  }
}

// ---- copy a code from the MY REQUESTS list ----
function copyAnyCode(code, btn) {
  const done = function () {
    const old = btn.textContent;
    btn.textContent = '✓ Copied';
    setTimeout(function () { btn.textContent = old; }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(done).catch(function () { fallbackCopy(code); done(); });
  } else {
    fallbackCopy(code);
    done();
  }
}

// ---- MY REQUESTS (own requests only, RLS enforced server-side) ----
async function loadMyRequests() {
  if (!myRequestsSection || !myRequestsList) return;
  const user = await getAuthUser();
  if (!user) { myRequestsSection.style.display = 'none'; return; }
  myRequestsSection.style.display = 'block';
  myRequestsList.innerHTML = '<p class="med-empty">Loading your requests...</p>';
  try {
    const { data, error } = await supabase
      .from('medication_requests')
      .select('*')
      .eq('discord_id', user.discordId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data || !data.length) {
      myRequestsList.innerHTML = '<p class="med-empty">You have not submitted any medication requests yet.</p>';
      return;
    }
    myRequestsList.innerHTML = '';
    data.forEach(function (r) { myRequestsList.appendChild(medRequestCard(r)); });
  } catch (err) {
    console.error('Medications: failed to load requests', err);
    myRequestsList.innerHTML = '<p class="med-empty">Unable to load your requests right now.</p>';
  }
}

function medRequestCard(r) {
  const status = String(r.status || 'PENDING').toUpperCase();
  let statusLine = '';
  if (status === 'IN_PROGRESS' && r.assigned_doctor_name) {
    statusLine = '<div class="med-req-status-line">Assigned to ' + escapeHtml(r.assigned_doctor_name) + '</div>';
  } else if (status === 'READY' || status === 'COMPLETED') {
    statusLine = '<div class="med-req-status-line med-req-ok">Completed by ' + escapeHtml(r.assigned_doctor_name || r.completed_by || 'an EMS doctor') + '</div>';
  } else if (status === 'REJECTED') {
    statusLine = '<div class="med-req-status-line med-req-rejected">Rejected' + (r.rejected_by ? ' by ' + escapeHtml(r.rejected_by) : '') + ': ' + escapeHtml(r.rejection_reason || 'No reason provided.') + '</div>';
  }

  const article = document.createElement('article');
  article.className = 'med-req-card';
  article.innerHTML =
    '<div class="med-req-head">' +
      '<span class="med-req-code">' + escapeHtml(r.request_code || '') + '</span>' +
      '<span class="med-req-status status-' + escapeHtml(status.toLowerCase()) + '">' + escapeHtml(r.status || 'PENDING') + '</span>' +
    '</div>' +
    '<div class="med-req-grid">' +
      '<div class="med-req-col"><span class="med-req-label">Medication</span><span class="med-req-value">' + escapeHtml(r.medication_name || '') + '</span></div>' +
      '<div class="med-req-col"><span class="med-req-label">Quantity</span><span class="med-req-value">x' + Number(r.quantity || 0) + '</span></div>' +
      '<div class="med-req-col"><span class="med-req-label">Original Price</span><span class="med-req-value">' + medMoney(r.original_price) + '</span></div>' +
      '<div class="med-req-col"><span class="med-req-label">Discount</span><span class="med-req-value med-req-discount">-' + medMoney(r.discount_amount) + '</span></div>' +
      '<div class="med-req-col"><span class="med-req-label">Final Price</span><span class="med-req-value">' + medMoney(r.final_price) + '</span></div>' +
      '<div class="med-req-col"><span class="med-req-label">Date</span><span class="med-req-value">' + medFormatDate(r.created_at) + '</span></div>' +
    '</div>' +
    statusLine +
    '<button type="button" class="btn btn-outline btn-sm med-req-copy" data-code="' + escapeHtml(r.request_code || '') + '">COPY CODE</button>';

  const copyBtn = article.querySelector('.med-req-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      copyAnyCode(copyBtn.getAttribute('data-code') || '', copyBtn);
    });
  }
  return article;
}

// ---- page auth state ----
function updateMedAuthState() {
  if (!myRequestsSection) return;
  getAuthUser().then(function (user) {
    if (user) {
      myRequestsSection.style.display = 'block';
      loadMyRequests();
    } else {
      myRequestsSection.style.display = 'none';
    }
  });
}

function closeMedLogin() {
  if (medLoginModal) medLoginModal.classList.remove('active');
}

// ---- init ----
(function initMedication() {
  if (!document.getElementById('medicationPage')) return;

  loadMedications();

  if (medQtyMinus) medQtyMinus.addEventListener('click', function () { updateMedQty(-1); });
  if (medQtyPlus) medQtyPlus.addEventListener('click', function () { updateMedQty(1); });
  if (medQtyInput) {
    medQtyInput.addEventListener('change', function () {
      let v = parseInt(medQtyInput.value, 10) || 1;
      if (v < 1) v = 1;
      medQtyInput.value = String(v);
      updateMedSubtotal();
    });
  }
  if (medPromoApplyBtn) medPromoApplyBtn.addEventListener('click', applyMedPromo);
  if (medRequestBtn) medRequestBtn.addEventListener('click', submitMedRequest);
  if (medRequestCancelBtn) medRequestCancelBtn.addEventListener('click', closeMedRequest);
  if (medCopyBtn) medCopyBtn.addEventListener('click', copyMedCode);

  [medLoginModal, medRequestModal, medSuccessModal].forEach(function (m) {
    if (!m) return;
    m.addEventListener('click', function (e) {
      if (e.target === m) m.classList.remove('active');
    });
  });

  if (supabase && supabase.auth) {
    supabase.auth.onAuthStateChange(function () { updateMedAuthState(); });
  }
  updateMedAuthState();
})();
