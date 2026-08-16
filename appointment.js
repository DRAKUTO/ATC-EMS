// ============================================================
// MEDICAL APPOINTMENT (medical-appointment.html)
// Uses the REAL Supabase table: medical_appointments.
// - discord_id / discord_name are derived from the Discord
//   session (getAuthUser) and are ALSO re-derived server-side
//   by a Postgres trigger - the frontend never controls them.
// - status always starts as PENDING (enforced by trigger).
// - Deletion is a SOFT DELETE (deleted_at) restricted to the
//   user's own rows by RLS + a protect trigger.
// - The success modal only opens after a real INSERT succeeds.
// ============================================================

// ---- DOM refs (null-safe so this file is safe on any page) ----
const apptForm = document.getElementById('apptForm');
const apptFirstName = document.getElementById('apptFirstName');
const apptLastName = document.getElementById('apptLastName');
const apptDiscordName = document.getElementById('apptDiscordName');
const apptRequestType = document.getElementById('apptRequestType');
const apptCustomTypeWrapper = document.getElementById('apptCustomTypeWrapper');
const apptCustomType = document.getElementById('apptCustomType');
const apptDate = document.getElementById('apptDate');
const apptTime = document.getElementById('apptTime');
const apptSymptoms = document.getElementById('apptSymptoms');
const apptSubmitBtn = document.getElementById('apptSubmitBtn');

const apptLoginModal = document.getElementById('apptLoginModal');
const apptSuccessModal = document.getElementById('apptSuccessModal');
const apptSuccessCode = document.getElementById('apptSuccessCode');
const apptCopyBtn = document.getElementById('apptCopyBtn');
const apptCopyFeedback = document.getElementById('apptCopyFeedback');
const apptDetailsModal = document.getElementById('apptDetailsModal');
const apptDetailList = document.getElementById('apptDetailList');
const apptDeleteModal = document.getElementById('apptDeleteModal');
const apptDeleteConfirmBtn = document.getElementById('apptDeleteConfirmBtn');
const apptDeleteCancelBtn = document.getElementById('apptDeleteCancelBtn');

const apptRequestsSection = document.getElementById('apptRequestsSection');
const apptRequestsList = document.getElementById('apptRequestsList');

let apptDeleteTarget = null; // row being soft-deleted
let apptSubmitLock = false;

const APPT_REQUEST_TYPES = [
  'Medical Consultation',
  'Surgery',
  'Radiology Examination',
  'Medical Examination',
  'Laboratory Test',
  'Emergency Consultation',
  'Other'
];

// ---- tiny helpers ----
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ISO "YYYY-MM-DD" -> "DD/MM/YYYY"
function apptFmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear();
}

function apptFmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  let hh = String(d.getHours()).padStart(2, '0');
  let mn = String(d.getMinutes()).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear() + ' ' + hh + ':' + mn;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function apptFallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

function apptCopyToClipboard(text, onDone) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onDone).catch(function () {
      apptFallbackCopy(text);
      onDone();
    });
  } else {
    apptFallbackCopy(text);
    onDone();
  }
}

// ---- toast (reuses the global med-toast styling) ----
function showApptToast(message, type) {
  let toast = document.getElementById('apptToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'apptToast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'med-toast ' + (type === 'error' ? 'med-toast-error' : 'med-toast-success') + ' show';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 3500);
}

// ---- inline field errors ----
function clearApptErrors() {
  document.querySelectorAll('.appt-field-error').forEach(function (el) { el.textContent = ''; });
  document.querySelectorAll('.appt-invalid').forEach(function (el) { el.classList.remove('appt-invalid'); });
}

function setApptError(field, message) {
  if (!field) return;
  field.classList.add('appt-invalid');
  const errEl = document.querySelector('.appt-field-error[data-for="' + field.id + '"]');
  if (errEl) errEl.textContent = message;
}

// ---- auth: fill the read-only Discord Name field ----
function apptFillDiscordName(user) {
  if (!apptDiscordName) return;
  apptDiscordName.value = user ? user.name : 'Not logged in';
  apptDiscordName.classList.toggle('appt-discord-empty', !user);
}

function updateApptAuthState() {
  getAuthUser().then(function (user) {
    apptFillDiscordName(user);
    if (!apptRequestsSection) return;
    if (user) {
      apptRequestsSection.style.display = 'block';
      loadApptRequests();
    } else {
      apptRequestsSection.style.display = 'none';
      if (apptRequestsList) apptRequestsList.innerHTML = '';
    }
  });
}

// ---- form interaction ----
function apptHandleTypeChange() {
  if (!apptCustomTypeWrapper) return;
  const isOther = apptRequestType && apptRequestType.value === 'Other';
  apptCustomTypeWrapper.style.display = isOther ? 'block' : 'none';
  if (!isOther && apptCustomType) apptCustomType.value = '';
  if (apptCustomType) apptCustomType.classList.remove('appt-invalid');
  const errEl = apptCustomType ? document.querySelector('.appt-field-error[data-for="' + apptCustomType.id + '"]') : null;
  if (errEl) errEl.textContent = '';
}

// ---- validation ----
function validateApptForm() {
  const errors = [];
  const firstName = apptFirstName ? apptFirstName.value.trim() : '';
  const lastName = apptLastName ? apptLastName.value.trim() : '';
  const type = apptRequestType ? apptRequestType.value : '';
  const custom = apptCustomType ? apptCustomType.value.trim() : '';
  const dateVal = apptDate ? apptDate.value : '';
  const timeVal = apptTime ? apptTime.value : '';
  const symptoms = apptSymptoms ? apptSymptoms.value.trim() : '';

  if (!firstName) { setApptError(apptFirstName, 'First name is required.'); errors.push('firstName'); }
  if (!lastName) { setApptError(apptLastName, 'Last name is required.'); errors.push('lastName'); }
  if (!type) { setApptError(apptRequestType, 'Please select a request type.'); errors.push('type'); }
  if (type === 'Other' && !custom) { setApptError(apptCustomType, 'Please specify your request type.'); errors.push('custom'); }
  if (!dateVal) {
    setApptError(apptDate, 'Preferred date is required.');
    errors.push('date');
  } else if (dateVal < todayISO()) {
    setApptError(apptDate, 'Preferred date cannot be in the past.');
    errors.push('date');
  }
  if (!timeVal) { setApptError(apptTime, 'Preferred time is required.'); errors.push('time'); }
  if (!symptoms) { setApptError(apptSymptoms, 'Please describe your symptoms or the reason for your request.'); errors.push('symptoms'); }

  return errors;
}

// ---- request ID ----
function generateApptCode() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'APT-' + yyyy + mm + dd + '-' + suffix;
}

// ---- submit ----
async function submitApptRequest(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (apptSubmitLock) return;

  // 1) Auth check FIRST: not logged in -> login modal, never send.
  const user = await getAuthUser();
  if (!user) {
    if (apptLoginModal) apptLoginModal.classList.add('active');
    return;
  }

  // 2) Validate every field.
  clearApptErrors();
  if (validateApptForm().length > 0) return;

  const firstName = apptFirstName.value.trim();
  const lastName = apptLastName.value.trim();
  const type = apptRequestType.value;
  const custom = type === 'Other' ? apptCustomType.value.trim() : '';
  const dateVal = apptDate.value;
  const timeVal = apptTime.value;
  const symptoms = apptSymptoms.value.trim();

  // 3) Send the real INSERT to Supabase (retry on code collision).
  apptSubmitLock = true;
  if (apptSubmitBtn) apptSubmitBtn.disabled = true;
  const originalBtn = apptSubmitBtn ? apptSubmitBtn.textContent : '';
  if (apptSubmitBtn) apptSubmitBtn.textContent = 'Sending...';

  let successCode = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const payload = {
      appointment_code: generateApptCode(),
      discord_id: user.discordId,
      discord_name: user.name,
      patient_first_name: firstName,
      patient_last_name: lastName,
      request_type: type,
      custom_request_type: custom,
      preferred_date: dateVal,
      preferred_time: timeVal,
      symptoms: symptoms
    };
    try {
      const { data, error } = await supabase
        .from('medical_appointments')
        .insert([payload])
        .select('appointment_code')
        .maybeSingle();
      if (error) throw error;
      if (data && data.appointment_code) { successCode = data.appointment_code; break; }
    } catch (err) {
      console.error('Appointment: insert failed on attempt ' + (attempt + 1), err);
    }
  }

  apptSubmitLock = false;
  if (apptSubmitBtn) { apptSubmitBtn.disabled = false; apptSubmitBtn.textContent = originalBtn; }

  // 4) Success ONLY after a real INSERT returned a stored code.
  if (successCode) {
    if (apptForm) apptForm.reset();
    apptFillDiscordName(user);
    apptHandleTypeChange();
    showApptSuccess(successCode);
    loadApptRequests();
  } else {
    showApptToast('Unable to submit your request. Please try again later.', 'error');
  }
}

// ---- success modal ----
function showApptSuccess(code) {
  if (!apptSuccessModal) return;
  if (apptSuccessCode) apptSuccessCode.value = code;
  if (apptCopyFeedback) { apptCopyFeedback.textContent = '✓ COPIED SUCCESSFULLY'; apptCopyFeedback.style.display = 'none'; }
  apptSuccessModal.classList.add('active');
}

function closeApptSuccess() {
  if (apptSuccessModal) apptSuccessModal.classList.remove('active');
}

function copyApptSuccessCode() {
  if (!apptSuccessCode) return;
  apptCopyToClipboard(apptSuccessCode.value, function () {
    if (apptCopyFeedback) apptCopyFeedback.style.display = 'block';
    setTimeout(function () { if (apptCopyFeedback) apptCopyFeedback.style.display = 'none'; }, 3000);
  });
}

// ---- MY MEDICAL REQUESTS (own rows only, RLS + deleted_at filter) ----
async function loadApptRequests() {
  if (!apptRequestsSection || !apptRequestsList) return;
  const user = await getAuthUser();
  if (!user) { apptRequestsSection.style.display = 'none'; return; }
  apptRequestsSection.style.display = 'block';
  apptRequestsList.innerHTML = '<p class="med-loading">Loading your requests...</p>';
  try {
    const { data, error } = await supabase
      .from('medical_appointments')
      .select('*')
      .eq('discord_id', user.discordId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data || !data.length) {
      apptRequestsList.innerHTML = '<p class="med-empty">No medical requests yet.</p>';
      return;
    }
    apptRequestsList.innerHTML = '';
    data.forEach(function (r) { apptRequestsList.appendChild(apptRequestCard(r)); });
  } catch (err) {
    console.error('Appointment: failed to load requests', err);
    apptRequestsList.innerHTML = '<p class="med-empty">Unable to load your requests right now.</p>';
  }
}

function apptRequestCard(r) {
  const article = document.createElement('article');
  article.className = 'appt-req-card';

  const typeLabel = r.request_type === 'Other' && r.custom_request_type
    ? r.request_type + ' - ' + r.custom_request_type
    : (r.request_type || '');

  const status = String(r.status || 'PENDING').toUpperCase();
  let statusLine = '';
  if (status === 'IN_PROGRESS' && r.assigned_doctor_name) {
    statusLine = '<div class="appt-req-status-line">Assigned to ' + esc(r.assigned_doctor_name) + '</div>';
  } else if (status === 'READY' || status === 'COMPLETED') {
    statusLine = '<div class="appt-req-status-line appt-req-ok">Completed by ' + esc(r.assigned_doctor_name || r.completed_by || 'an EMS doctor') + '</div>';
  } else if (status === 'REJECTED') {
    statusLine = '<div class="appt-req-status-line appt-req-rejected">Rejected' + (r.rejected_by ? ' by ' + esc(r.rejected_by) : '') + ': ' + esc(r.rejection_reason || 'No reason provided.') + '</div>';
  }

  const head = document.createElement('div');
  head.className = 'appt-req-head';
  head.innerHTML =
    '<span class="appt-req-code">' + esc(r.appointment_code || '') + '</span>' +
    '<span class="appt-req-status status-' + esc(status.toLowerCase()) + '">' + esc(r.status || 'PENDING') + '</span>';
  article.appendChild(head);

  const info = document.createElement('div');
  info.className = 'appt-req-info';
  info.innerHTML =
    '<div class="appt-req-row"><span class="appt-req-label">Request Type</span><span class="appt-req-value">' + esc(typeLabel) + '</span></div>' +
    '<div class="appt-req-row"><span class="appt-req-label">Patient</span><span class="appt-req-value">' + esc(r.patient_first_name || '') + ' ' + esc(r.patient_last_name || '') + '</span></div>' +
    '<div class="appt-req-row"><span class="appt-req-label">Date</span><span class="appt-req-value">' + esc(apptFmtDate(r.preferred_date)) + '</span></div>' +
    '<div class="appt-req-row"><span class="appt-req-label">Time</span><span class="appt-req-value">' + esc(r.preferred_time || '') + '</span></div>';
  article.appendChild(info);

  if (statusLine) {
    const sl = document.createElement('div');
    sl.innerHTML = statusLine;
    article.appendChild(sl.firstChild);
  }

  const actions = document.createElement('div');
  actions.className = 'appt-req-actions';
  actions.innerHTML =
    '<button type="button" class="btn btn-outline btn-sm" data-action="details">VIEW DETAILS</button>' +
    '<button type="button" class="btn btn-outline btn-sm" data-action="copy">COPY ID</button>' +
    '<button type="button" class="btn btn-danger btn-sm" data-action="delete">DELETE</button>';
  article.appendChild(actions);

  actions.querySelector('[data-action="details"]').addEventListener('click', function () { showApptDetails(r); });
  actions.querySelector('[data-action="copy"]').addEventListener('click', function () {
    apptCopyToClipboard(r.appointment_code || '', function () { showApptToast('✓ Copied successfully', 'success'); });
  });
  actions.querySelector('[data-action="delete"]').addEventListener('click', function () { openApptDelete(r); });

  return article;
}

// ---- VIEW DETAILS ----
function showApptDetails(r) {
  if (!apptDetailsModal || !apptDetailList) return;
  const rows = [
    ['Request ID', r.appointment_code || ''],
    ['Discord Name', r.discord_name || ''],
    ['First Name', r.patient_first_name || ''],
    ['Last Name', r.patient_last_name || ''],
    ['Request Type', r.request_type === 'Other' && r.custom_request_type ? r.request_type + ' - ' + r.custom_request_type : (r.request_type || '')],
    ['Date', apptFmtDate(r.preferred_date)],
    ['Time', r.preferred_time || ''],
    ['Symptoms', r.symptoms || ''],
    ['Assigned Doctor', r.assigned_doctor_name || ''],
    ['Rejection Reason', r.rejection_reason || ''],
    ['Status', r.status || 'PENDING'],
    ['Created At', apptFmtDateTime(r.created_at)]
  ];
  apptDetailList.innerHTML = rows.map(function (row) {
    return '<div class="appt-detail-row"><span class="appt-detail-label">' + esc(row[0]) + '</span><span class="appt-detail-value">' + esc(row[1]) + '</span></div>';
  }).join('');
  apptDetailsModal.classList.add('active');
}

function closeApptDetails() {
  if (apptDetailsModal) apptDetailsModal.classList.remove('active');
}

// ---- DELETE (soft delete via deleted_at) ----
function openApptDelete(r) {
  apptDeleteTarget = r;
  if (apptDeleteModal) apptDeleteModal.classList.add('active');
}

function closeApptDelete() {
  if (apptDeleteModal) apptDeleteModal.classList.remove('active');
  apptDeleteTarget = null;
}

async function confirmApptDelete() {
  if (!apptDeleteTarget) return;
  const target = apptDeleteTarget;
  if (apptDeleteConfirmBtn) apptDeleteConfirmBtn.disabled = true;
  try {
    const { error } = await supabase
      .from('medical_appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', target.id);
    if (error) throw error;
    closeApptDelete();
    showApptToast('Request deleted.', 'success');
    loadApptRequests();
  } catch (err) {
    console.error('Appointment: soft delete failed', err);
    closeApptDelete();
    showApptToast('Unable to delete the request. Please try again later.', 'error');
  } finally {
    if (apptDeleteConfirmBtn) apptDeleteConfirmBtn.disabled = false;
  }
}

// ---- modals ----
function closeApptLogin() {
  if (apptLoginModal) apptLoginModal.classList.remove('active');
}

// ---- init ----
(function initAppointment() {
  if (!document.getElementById('appointmentPage')) return;

  if (apptDate) apptDate.min = todayISO();
  apptHandleTypeChange();

  if (apptRequestType) apptRequestType.addEventListener('change', apptHandleTypeChange);
  if (apptForm) apptForm.addEventListener('submit', submitApptRequest);
  if (apptCopyBtn) apptCopyBtn.addEventListener('click', copyApptSuccessCode);
  if (apptDeleteCancelBtn) apptDeleteCancelBtn.addEventListener('click', closeApptDelete);
  if (apptDeleteConfirmBtn) apptDeleteConfirmBtn.addEventListener('click', confirmApptDelete);

  [apptLoginModal, apptSuccessModal, apptDetailsModal, apptDeleteModal].forEach(function (m) {
    if (!m) return;
    m.addEventListener('click', function (e) {
      if (e.target === m) m.classList.remove('active');
    });
  });

  if (supabase && supabase.auth) {
    supabase.auth.onAuthStateChange(function () { updateApptAuthState(); });
  }
  updateApptAuthState();
})();
