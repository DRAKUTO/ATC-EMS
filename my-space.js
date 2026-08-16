// ============================================================
// ATLANTIC EMS - MY SPACE (EMS / Doctor panel)
// Handles medication requests, appointments, tests, certificates,
// patients, created documents and staff activity history.
// All privileged operations run through SECURITY DEFINER RPCs and
// RLS policies on the Supabase side.
//
// NOTE ON IDENTITIES
//   accounts.id        = Supabase Auth user UUID  (auth.uid())
//   accounts.account_id = Discord User ID (text)
//   USER.id      (JS)  = uuid   -> used only for the UI
//   USER.discordId(JS) = text   -> what the DB stores in
//     assigned_doctor_id / created_by_doctor_id / rejected_by ...
// ============================================================

(function () {
  'use strict';

  var USER = null;

  var ACTIVE_TAB = 'medRequests';

  var currentReject = null; // { rpc, baseParams, tab }
  var currentView = null;   // { path, name }
  var currentEdit = null;   // { table, id }
  var currentConfirm = null;// { onConfirm }

  var DOC_TYPES = {
    test: ['Blood Test', 'Radiology', 'Laboratory', 'Urine Test', 'CT Scan', 'MRI', 'Other'],
    cert: ['Fitness To Work', 'Medical Leave', 'Health Clearance', 'Physical Examination', 'Other']
  };

  var STATUS_META = {
    PENDING:     { label: 'PENDING',     cls: 'st-pending' },
    IN_PROGRESS: { label: 'IN PROGRESS', cls: 'st-progress' },
    READY:       { label: 'READY',       cls: 'st-ready' },
    REJECTED:    { label: 'REJECTED',    cls: 'st-rejected' },
    COMPLETED:   { label: 'COMPLETED',   cls: 'st-ready' },
    REVOKED:     { label: 'REVOKED',     cls: 'st-rejected' }
  };

  // ---------- helpers ----------
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(v) {
    if (!v) return '-';
    return new Date(v).toLocaleString();
  }

  function timeAgo(v) {
    if (!v) return '';
    var s = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
    return new Date(v).toLocaleDateString();
  }

  function badge(status) {
    var m = STATUS_META[status] || { label: status || '-', cls: 'st-pending' };
    return '<span class="st-badge ' + m.cls + '">' + m.label + '</span>';
  }

  function msToast(msg, type) {
    var old = document.getElementById('msToast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = 'msToast';
    t.className = 'ms-toast ' + (type || '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 3200);
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) { btn.dataset.orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Please wait...'; }
    else { btn.disabled = false; if (btn.dataset.orig) { btn.innerHTML = btn.dataset.orig; delete btn.dataset.orig; } }
  }

  function openModal(id) { var m = document.getElementById(id); if (m) m.classList.add('active'); }
  function closeModal(id) { var m = document.getElementById(id); if (m) m.classList.remove('active'); }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', initMySpace);

  function initMySpace() {
    bindTabs();
    bindCreateModal();
    bindEditForm();
    bindConfirmModal();
    bindRejectModal();

    document.getElementById('createDocBtn').addEventListener('click', function () {
      setDocType('test');
      openModal('docCreateModal');
    });

    guardAccess('EMS').then(function (user) {
      if (!user) return;
      USER = user;
      loadTab(ACTIVE_TAB);
    });
  }

  // ---------- tabs ----------
  function bindTabs() {
    var tabs = document.querySelectorAll('#panelTabs .panel-tab');
    Array.prototype.forEach.call(tabs, function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        ACTIVE_TAB = btn.dataset.tab;
        var panes = document.querySelectorAll('.panel-pane');
        Array.prototype.forEach.call(panes, function (p) { p.classList.remove('active'); });
        var pane = document.getElementById('pane-' + ACTIVE_TAB);
        if (pane) pane.classList.add('active');
        loadTab(ACTIVE_TAB);
      });
    });
  }

  function listEl(tab) { return document.getElementById(tab + 'List'); }

  function setLoading(tab, msg) {
    var el = listEl(tab);
    if (el) el.innerHTML = '<p class="med-empty">' + esc(msg || 'Loading...') + '</p>';
  }

  function setEmpty(tab, msg) {
    var el = listEl(tab);
    if (el) el.innerHTML = '<p class="med-empty">' + esc(msg || 'No records yet.') + '</p>';
  }

  function loadTab(tab) {
    switch (tab) {
      case 'medRequests': return loadMedRequests();
      case 'appointments': return loadAppointments();
      case 'tests': return loadTests();
      case 'certificates': return loadCertificates();
      case 'patients': return loadPatients();
      case 'createdDocs': return loadCreatedDocs();
      case 'history': return loadHistory();
    }
  }

  function assignedToMe(r) {
    return r.assigned_doctor_id && USER && r.assigned_doctor_id === USER.discordId;
  }

  function canManageDoc(r) {
    return USER && (r.created_by_doctor_id === USER.discordId || USER.role === 'Manager');
  }

  // ============================================================
  // MEDICATION REQUESTS
  // ============================================================
  function loadMedRequests() {
    setLoading('medRequests');
    supabase.from('medication_requests')
      .select('*').order('created_at', { ascending: false }).limit(100)
      .then(function (res) {
        if (res.error) return setEmpty('medRequests', 'Error loading requests.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('medRequests', 'No medication requests yet.');
        listEl('medRequests').innerHTML = rows.map(renderMedRequest).join('');
      });
  }

  function renderMedRequest(r) {
    var h = '<div class="req-card">';
    h += '<div class="req-card-head">';
    h += '<div><div class="req-patient">' + esc(r.discord_name || 'Unknown') + '</div>';
    h += '<div class="req-sub">' + esc(r.request_code || r.discord_id || '') + ' &middot; ' + timeAgo(r.created_at) + '</div></div>';
    h += badge(r.status);
    h += '</div>';
    h += '<div class="req-grid">';
    h += '<div class="req-cell"><span class="req-label">MEDICATION</span><span class="req-value">' + esc(r.medication_name) + '</span></div>';
    h += '<div class="req-cell"><span class="req-label">QUANTITY</span><span class="req-value">x' + Number(r.quantity || 0) + '</span></div>';
    h += '<div class="req-cell"><span class="req-label">FINAL PRICE</span><span class="req-value">$' + Number(r.final_price || 0).toFixed(2) + '</span></div>';
    h += '<div class="req-cell"><span class="req-label">PATIENT ID</span><span class="req-value">' + esc(r.discord_id || '') + '</span></div>';
    h += '</div>';

    var mine = assignedToMe(r);

    if (r.status === 'PENDING') {
      h += '<div class="req-assign">Unassigned &middot; ready for pick up</div>';
      h += '<div class="req-actions"><button class="btn btn-primary btn-sm" data-act="take-med" data-id="' + r.id + '">TAKE REQUEST</button></div>';
    } else if (r.status === 'IN_PROGRESS') {
      if (mine) {
        h += '<div class="req-assign">Assigned to you</div>';
        h += '<div class="req-actions">';
        h += '<button class="btn btn-success btn-sm" data-act="ready-med" data-id="' + r.id + '">MARK READY</button>';
        h += '<button class="btn btn-danger btn-sm" data-act="reject-med" data-id="' + r.id + '">REJECT</button>';
        h += '<button class="btn btn-outline btn-sm" data-act="pending-med" data-id="' + r.id + '">RETURN TO PENDING</button>';
        h += '</div>';
      } else {
        h += '<div class="req-assign">Assigned to ' + esc(r.assigned_doctor_name || 'another EMS doctor') + '</div>';
      }
    } else if (r.status === 'READY' || r.status === 'COMPLETED') {
      h += '<div class="req-done">Completed by ' + esc(r.assigned_doctor_name || r.completed_by || 'an EMS doctor') + (r.completed_at ? ' &middot; ' + fmtDate(r.completed_at) : '') + '</div>';
    } else if (r.status === 'REJECTED') {
      h += '<div class="req-rejected">Rejected by ' + esc(r.rejected_by || 'an EMS doctor') + ': ' + esc(r.rejection_reason || 'No reason provided.') + '</div>';
    }

    h += '</div>';
    return h;
  }

  // ============================================================
  // MEDICAL APPOINTMENTS
  // ============================================================
  function loadAppointments() {
    setLoading('appointments');
    supabase.from('medical_appointments')
      .select('*').order('created_at', { ascending: false }).limit(100)
      .then(function (res) {
        if (res.error) return setEmpty('appointments', 'Error loading appointments.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('appointments', 'No medical appointments yet.');
        listEl('appointments').innerHTML = rows.map(renderAppointment).join('');
      });
  }

  function renderAppointment(r) {
    var patient = [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || r.discord_name || 'Unknown';
    var type = r.request_type || 'Medical Appointment';
    if (r.request_type === 'Other' && r.custom_request_type) type = r.custom_request_type;

    var h = '<div class="req-card">';
    h += '<div class="req-card-head">';
    h += '<div><div class="req-patient">' + esc(patient) + '</div>';
    h += '<div class="req-sub">' + esc(r.appointment_code || r.discord_id || '') + ' &middot; ' + timeAgo(r.created_at) + '</div></div>';
    h += badge(r.status);
    h += '</div>';
    h += '<div class="req-grid">';
    h += '<div class="req-cell"><span class="req-label">APPOINTMENT</span><span class="req-value">' + esc(type) + '</span></div>';
    h += '<div class="req-cell"><span class="req-label">PREFERRED DATE</span><span class="req-value">' + esc(r.preferred_date || '-') + '</span></div>';
    h += '<div class="req-cell"><span class="req-label">PREFERRED TIME</span><span class="req-value">' + esc(r.preferred_time || '-') + '</span></div>';
    h += '<div class="req-cell"><span class="req-label">PATIENT ID</span><span class="req-value">' + esc(r.discord_id || '') + '</span></div>';
    h += '</div>';
    if (r.symptoms) h += '<div class="req-notes">' + esc(r.symptoms) + '</div>';

    var mine = assignedToMe(r);

    if (r.status === 'PENDING') {
      h += '<div class="req-assign">Unassigned &middot; ready for pick up</div>';
      h += '<div class="req-actions"><button class="btn btn-primary btn-sm" data-act="take-appt" data-id="' + r.id + '">TAKE REQUEST</button></div>';
    } else if (r.status === 'IN_PROGRESS') {
      if (mine) {
        h += '<div class="req-assign">Assigned to you</div>';
        h += '<div class="req-actions">';
        h += '<button class="btn btn-success btn-sm" data-act="ready-appt" data-id="' + r.id + '">MARK READY</button>';
        h += '<button class="btn btn-danger btn-sm" data-act="reject-appt" data-id="' + r.id + '">REJECT</button>';
        h += '<button class="btn btn-outline btn-sm" data-act="pending-appt" data-id="' + r.id + '">RETURN TO PENDING</button>';
        h += '</div>';
      } else {
        h += '<div class="req-assign">Assigned to ' + esc(r.assigned_doctor_name || 'another EMS doctor') + '</div>';
      }
    } else if (r.status === 'READY' || r.status === 'COMPLETED') {
      h += '<div class="req-done">Completed by ' + esc(r.assigned_doctor_name || r.completed_by || 'an EMS doctor') + (r.completed_at ? ' &middot; ' + fmtDate(r.completed_at) : '') + '</div>';
    } else if (r.status === 'REJECTED') {
      h += '<div class="req-rejected">Rejected by ' + esc(r.rejected_by || 'an EMS doctor') + ': ' + esc(r.rejection_reason || 'No reason provided.') + '</div>';
    }

    h += '</div>';
    return h;
  }

  // ============================================================
  // DOCUMENTS: TESTS & CERTIFICATES (shared rendering)
  // ============================================================
  function loadTests() {
    setLoading('tests');
    supabase.from('medical_tests')
      .select('*').order('created_at', { ascending: false }).limit(100)
      .then(function (res) {
        if (res.error) return setEmpty('tests', 'Error loading tests.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('tests', 'No medical tests yet.');
        listEl('tests').innerHTML = rows.map(function (r) { return renderDocument(r, 'tests'); }).join('');
      });
  }

  function loadCertificates() {
    setLoading('certificates');
    supabase.from('medical_certificates')
      .select('*').order('created_at', { ascending: false }).limit(100)
      .then(function (res) {
        if (res.error) return setEmpty('certificates', 'Error loading certificates.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('certificates', 'No medical certificates yet.');
        listEl('certificates').innerHTML = rows.map(function (r) { return renderDocument(r, 'certificates'); }).join('');
      });
  }

  function loadCreatedDocs() {
    setLoading('createdDocs');
    var t = supabase.from('medical_tests').select('*').eq('created_by_doctor_id', USER.discordId).order('created_at', { ascending: false }).limit(100);
    var c = supabase.from('medical_certificates').select('*').eq('created_by_doctor_id', USER.discordId).order('created_at', { ascending: false }).limit(100);
    Promise.all([t, c]).then(function (res) {
      var tests = (res[0].data || []);
      var certs = (res[1].data || []);
      var rows = certs.concat(tests);
      rows.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      if (!rows.length) return setEmpty('createdDocs', 'You have not created any documents yet.');
      listEl('createdDocs').innerHTML = rows.map(function (r) {
        var table = (r.test_code ? 'medical_tests' : 'medical_certificates');
        return renderDocument(r, table, true);
      }).join('');
    });
  }

  function renderDocument(r, table, own) {
    var isTest = table === 'medical_tests';
    var code = isTest ? r.test_code : r.certificate_code;
    var type = isTest ? r.test_type : r.certificate_type;
    var text = isTest ? r.result : r.content;
    var wf = r.workflow_status || 'PENDING';

    var h = '<div class="req-card">';
    h += '<div class="req-card-head">';
    h += '<div><div class="req-code">' + esc(code || '') + '</div>';
    h += '<div class="req-sub">' + esc(type || '') + ' &middot; ' + esc(r.patient_name || 'Unknown') + ' &middot; ' + timeAgo(r.created_at) + '</div></div>';
    h += badge(wf);
    h += '</div>';
    h += '<div class="req-cell"><span class="req-label">PATIENT ID</span><span class="req-value">' + esc(r.discord_id || '') + '</span></div>';
    if (text) h += '<div class="req-notes">' + esc(text) + '</div>';

    if (wf === 'REJECTED') {
      h += '<div class="req-rejected">Rejected: ' + esc(r.rejection_reason || 'No reason provided.') + '</div>';
    }

    h += '<div class="req-actions">';
    if (r.file_url) {
      h += '<button class="btn btn-outline btn-sm" data-act="view-doc" data-table="' + table + '" data-id="' + r.id + '">VIEW FILE</button>';
    }
    if (canManageDoc(r) && r.status !== 'REVOKED') {
      if (wf === 'PENDING') {
        h += '<button class="btn btn-success btn-sm" data-act="ready-doc" data-table="' + table + '" data-id="' + r.id + '">MARK READY</button>';
      }
      if (wf !== 'READY') {
        h += '<button class="btn btn-danger btn-sm" data-act="reject-doc" data-table="' + table + '" data-id="' + r.id + '">REJECT</button>';
      }
      h += '<button class="btn btn-outline btn-sm" data-act="edit-doc" data-table="' + table + '" data-id="' + r.id + '">EDIT</button>';
      h += '<button class="btn btn-danger btn-sm" data-act="delete-doc" data-table="' + table + '" data-id="' + r.id + '">DELETE</button>';
    }
    h += '</div>';
    h += '</div>';
    return h;
  }

  // ============================================================
  // PATIENTS
  // ============================================================
  function loadPatients() {
    setLoading('patients');
    var q1 = supabase.from('medication_requests').select('discord_id,discord_name');
    var q2 = supabase.from('medical_appointments').select('discord_id,patient_first_name,patient_last_name,discord_name');
    var q3 = supabase.from('medical_tests').select('discord_id,patient_name');
    var q4 = supabase.from('medical_certificates').select('discord_id,patient_name');
    Promise.all([q1, q2, q3, q4]).then(function (res) {
      var map = {};
      var order = [];
      res.forEach(function (r) {
        (r.data || []).forEach(function (row) {
          var key = row.discord_id;
          if (key && !map[key]) {
            var name = row.patient_name;
            if (!name && row.patient_first_name) name = [row.patient_first_name, row.patient_last_name].filter(Boolean).join(' ');
            if (!name) name = row.discord_name;
            map[key] = name || 'Unknown';
            order.push(key);
          }
        });
      });
      if (!order.length) return setEmpty('patients', 'No patients found yet.');
      var el = listEl('patients');
      el.innerHTML = order.map(function (key) {
        return '<div class="req-card patient-row">' +
          '<div class="patient-avatar">' + esc((map[key] || '?').charAt(0).toUpperCase()) + '</div>' +
          '<div class="patient-info"><div class="req-patient">' + esc(map[key]) + '</div>' +
          '<div class="req-sub">Discord ID: ' + esc(key) + '</div></div></div>';
      }).join('');
    });
  }

  // ============================================================
  // HISTORY
  // ============================================================
  function loadHistory() {
    setLoading('history');
    supabase.from('staff_activities')
      .select('*').order('created_at', { ascending: false }).limit(100)
      .then(function (res) {
        if (res.error) return setEmpty('history', 'No activity records yet.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('history', 'No activity recorded yet.');
        var el = listEl('history');
        el.innerHTML = rows.map(function (r) {
          return '<div class="req-card history-row">' +
            '<div class="history-icon"></div>' +
            '<div class="history-body">' +
              '<div class="history-text">' + esc(r.actor_name || r.actor_id || 'Staff') + ' &middot; ' + esc(r.action) + ' &middot; ' + esc(r.table_name) + (r.record_code ? ' &middot; ' + esc(r.record_code) : '') + '</div>' +
              (r.detail ? '<div class="req-sub">' + esc(r.detail) + '</div>' : '') +
              '<div class="req-sub">' + fmtDate(r.created_at) + '</div>' +
            '</div></div>';
        }).join('');
      });
  }

  // ============================================================
  // BUTTON DELEGATION (all list actions)
  // ============================================================
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var id = btn.dataset.id;
    var table = btn.dataset.table;

    switch (act) {
      case 'take-med': return runTake('take_med_request', { request_id: id }, 'medRequests');
      case 'take-appt': return runTake('take_appointment', { appointment_id: id }, 'appointments');
      case 'ready-med': return runSetStatus('set_med_request_status', { request_id: id, new_status: 'READY' }, 'medRequests', btn);
      case 'pending-med': return runSetStatus('set_med_request_status', { request_id: id, new_status: 'PENDING' }, 'medRequests', btn);
      case 'reject-med': return openReject('set_med_request_status', { request_id: id }, 'medRequests');
      case 'ready-appt': return runSetStatus('set_appointment_status', { appointment_id: id, new_status: 'READY' }, 'appointments', btn);
      case 'pending-appt': return runSetStatus('set_appointment_status', { appointment_id: id, new_status: 'PENDING' }, 'appointments', btn);
      case 'reject-appt': return openReject('set_appointment_status', { appointment_id: id }, 'appointments');
      case 'ready-doc': return runSetStatus(table === 'medical_tests' ? 'set_test_status' : 'set_certificate_status',
          (table === 'medical_tests' ? { test_id: id } : { certificate_id: id }), (table === 'medical_tests' ? 'tests' : 'certificates'), btn);
      case 'reject-doc': return openReject(table === 'medical_tests' ? 'set_test_status' : 'set_certificate_status',
          (table === 'medical_tests' ? { test_id: id } : { certificate_id: id }), (table === 'medical_tests' ? 'tests' : 'certificates'));
      case 'view-doc': return openDocView(table, id);
      case 'edit-doc': return openDocEdit(table, id);
      case 'delete-doc': return openDocDelete(table, id);
    }
  });

  function runTake(rpcName, params, tab) {
    supabase.rpc(rpcName, params).then(function (res) {
      if (res.error) { msToast(res.error.message || 'Failed to take request.', 'error'); return; }
      msToast('Request assigned to you successfully.');
      loadTab(tab);
    });
  }

  function runSetStatus(rpcName, params, tab, btn) {
    setBtnLoading(btn, true);
    supabase.rpc(rpcName, params).then(function (res) {
      setBtnLoading(btn, false);
      if (res.error) { msToast(res.error.message || 'Failed to update status.', 'error'); return; }
      msToast('Status updated.');
      loadTab(tab);
    });
  }

  // ---------- reject modal ----------
  function openReject(rpcName, baseParams, tab) {
    currentReject = { rpcName: rpcName, baseParams: baseParams, tab: tab };
    document.getElementById('rejectReasonInput').value = '';
    openModal('rejectModal');
  }

  function closeRejectModal() { closeModal('rejectModal'); currentReject = null; }

  function confirmReject() {
    if (!currentReject) return;
    var reason = document.getElementById('rejectReasonInput').value.trim();
    if (!reason) { msToast('A rejection reason is required.', 'error'); return; }
    var params = Object.assign({}, currentReject.baseParams, { new_status: 'REJECTED', rejection_reason: reason });
    var tab = currentReject.tab;
    var btn = document.getElementById('rejectConfirmBtn');
    setBtnLoading(btn, true);
    supabase.rpc(currentReject.rpcName, params).then(function (res) {
      setBtnLoading(btn, false);
      if (res.error) { msToast(res.error.message || 'Failed to reject.', 'error'); return; }
      msToast('Request rejected.');
      closeRejectModal();
      loadTab(tab);
    });
  }

  // ---------- view document ----------
  function openDocView(table, id) {
    supabase.from(table).select('*').eq('id', id).single().then(function (res) {
      if (res.error || !res.data) { msToast('Document not found.', 'error'); return; }
      var r = res.data;
      var code = table === 'medical_tests' ? r.test_code : r.certificate_code;
      var name = r.file_name || code || 'document';
      currentView = { path: r.file_url, name: name };
      document.getElementById('docViewTitle').textContent = code || 'Document';
      document.getElementById('docViewArea').innerHTML = '<p class="med-empty">Generating secure link...</p>';
      openModal('docViewModal');

      supabase.storage.from('medical-documents').createSignedUrl(r.file_url, 120)
        .then(function (sr) {
          if (sr.error || !sr.data || !sr.data.signedUrl) {
            document.getElementById('docViewArea').innerHTML = '<p class="med-empty">Unable to open the file.</p>';
            return;
          }
          var url = sr.data.signedUrl;
          var isPdf = /\.pdf$/i.test(r.file_url);
          var isImg = /\.(png|jpe?g|gif|webp)$/i.test(r.file_url);
          if (isPdf) {
            document.getElementById('docViewArea').innerHTML = '<iframe class="doc-frame" src="' + esc(url) + '" title="Document preview"></iframe>';
          } else if (isImg) {
            document.getElementById('docViewArea').innerHTML = '<div class="doc-img-wrap"><img src="' + esc(url) + '" alt="Document preview"></div>';
          } else {
            document.getElementById('docViewArea').innerHTML = '<p class="med-empty"><a href="' + esc(url) + '" target="_blank" rel="noopener">Open file</a></p>';
          }
        });
    });
  }

  function closeDocView() { closeModal('docViewModal'); currentView = null; }

  function docViewDownload() {
    if (!currentView || !currentView.path) return;
    supabase.storage.from('medical-documents').createSignedUrl(currentView.path, 60, { download: currentView.name })
      .then(function (sr) {
        if (sr.error || !sr.data || !sr.data.signedUrl) { msToast('Unable to download.', 'error'); return; }
        window.open(sr.data.signedUrl, '_blank');
      });
  }

  // ---------- edit document ----------
  function openDocEdit(table, id) {
    supabase.from(table).select('*').eq('id', id).single().then(function (res) {
      if (res.error || !res.data) { msToast('Document not found.', 'error'); return; }
      var r = res.data;
      currentEdit = { table: table, id: id };
      document.getElementById('docEditType').value = (table === 'medical_tests' ? r.test_type : r.certificate_type) || '';
      document.getElementById('docEditDescription').value = (table === 'medical_tests' ? r.result : r.content) || '';
      var fe = document.getElementById('docEditFileInput');
      if (fe) fe.value = '';
      openModal('docEditModal');
    });
  }

  function closeDocEdit() { closeModal('docEditModal'); currentEdit = null; }

  function bindEditForm() {
    var form = document.getElementById('docEditForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!currentEdit) return;
      var desc = document.getElementById('docEditDescription').value.trim();
      if (!desc) { msToast('Description is required.', 'error'); return; }
      var file = document.getElementById('docEditFileInput') && document.getElementById('docEditFileInput').files[0];
      var btn = document.getElementById('docEditSaveBtn');
      setBtnLoading(btn, true);

      if (file) {
        var fileErr = validateDocFile(file);
        if (fileErr) { setBtnLoading(btn, false); msToast(fileErr, 'error'); return; }
      }

      var apply = function (payload) {
        supabase.from(currentEdit.table).update(payload).eq('id', currentEdit.id).select().single()
          .then(function (res) {
            setBtnLoading(btn, false);
            if (res.error) { msToast(res.error.message || 'Failed to save document.', 'error'); return; }
            if (!res.data) { msToast('You do not have permission to edit this document.', 'error'); return; }
            msToast('Document updated.');
            closeDocEdit();
            loadTab(ACTIVE_TAB);
            loadCreatedDocs();
          });
      };

      var isTest = currentEdit.table === 'medical_tests';
      if (file) {
        var path = (isTest ? 'tests/' : 'certificates/') + currentEdit.id + '-' + Date.now() + fileExt(file.name);
        supabase.storage.from('medical-documents').upload(path, file, { upsert: true })
          .then(function (up) {
            if (up.error) { setBtnLoading(btn, false); msToast(up.error.message || 'Upload failed.', 'error'); return; }
            var payload = { file_url: path, file_name: file.name };
            if (isTest) payload.result = desc; else payload.content = desc;
            apply(payload);
          });
      } else {
        var payload2 = {};
        if (isTest) payload2.result = desc; else payload2.content = desc;
        apply(payload2);
      }
    });
  }

  // ---------- delete document ----------
  function openDocDelete(table, id) {
    document.getElementById('confirmTitle').textContent = 'Delete Document?';
    document.getElementById('confirmMsg').textContent = 'This document and its file will be permanently removed. This action cannot be undone.';
    currentConfirm = {
      onConfirm: function (btn) {
        setBtnLoading(btn, true);
        supabase.from(table).select('file_url').eq('id', id).single().then(function (qr) {
          if (qr.data && qr.data.file_url) {
            supabase.storage.from('medical-documents').remove([qr.data.file_url]);
          }
          supabase.from(table).delete().eq('id', id).select().then(function (res) {
            setBtnLoading(btn, false);
            if (res.error) { msToast(res.error.message || 'Failed to delete.', 'error'); return; }
            if (!res.data || !res.data.length) { msToast('You do not have permission to delete this document.', 'error'); return; }
            msToast('Document deleted.');
            closeConfirmModal();
            loadTab(ACTIVE_TAB);
            loadCreatedDocs();
          });
        });
      }
    };
    openModal('confirmModal');
  }

  function bindConfirmModal() {
    document.getElementById('confirmOkBtn').addEventListener('click', function () {
      if (!currentConfirm) return;
      currentConfirm.onConfirm(this);
    });
  }

  function closeConfirmModal() { closeModal('confirmModal'); currentConfirm = null; }

  // ============================================================
  // CREATE DOCUMENT
  // ============================================================
  var docType = 'test';

  function setDocType(type) {
    docType = type;
    var btns = document.querySelectorAll('.doc-type-btn');
    Array.prototype.forEach.call(btns, function (b) { b.classList.toggle('active', b.dataset.dtype === type); });
    var sel = document.getElementById('docTypeSelect');
    sel.innerHTML = '';
    (DOC_TYPES[type] || []).forEach(function (t) {
      var o = document.createElement('option');
      o.value = t; o.textContent = t;
      sel.appendChild(o);
    });
  }

  function closeDocCreate() {
    closeModal('docCreateModal');
    document.getElementById('docCreateForm').reset();
  }

  function bindCreateModal() {
    document.getElementById('docCreateForm').addEventListener('submit', function (e) {
      e.preventDefault();
      submitCreateDoc();
    });
  }

  function fileExt(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? '.' + m[1].toLowerCase() : '';
  }

  // High-entropy document code. 6 characters from a 32-char alphabet
  // (no 0/O/1/I/L) = ~1 billion combos per date. Document codes are also
  // embedded in the private storage file path, so high entropy makes
  // path enumeration of other patients' files impractical.
  function makeDocCode(prefix) {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var date = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var rand = '';
    for (var i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
    return prefix + date + '-' + rand;
  }

  // ---- upload validation (allowlist by extension + size) ----
  var ALLOWED_DOC_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
  var MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB, matches the bucket limit

  function validateDocFile(file) {
    if (!file) return 'Please upload the document file.';
    var m = /\.([a-z0-9]+)$/i.exec(file.name || '');
    var ext = m ? m[1].toLowerCase() : '';
    if (ALLOWED_DOC_EXT.indexOf(ext) === -1) {
      return 'Unsupported file type. Only PDF, PNG, JPG, JPEG, GIF and WEBP are allowed.';
    }
    if (file.size > MAX_DOC_BYTES) {
      return 'File is too large. Maximum size is 10 MB.';
    }
    return null;
  }

  function submitCreateDoc() {
    var discordId = document.getElementById('docPatientDiscordId').value.trim();
    var pName = document.getElementById('docPatientName').value.trim();
    var typeVal = document.getElementById('docTypeSelect').value;
    var desc = document.getElementById('docDescription').value.trim();
    var file = document.getElementById('docFileInput').files[0];

    if (!discordId) return msToast('Patient Discord ID is required.', 'error');
    if (!/^\d+$/.test(discordId)) return msToast('Patient Discord ID must contain only digits.', 'error');
    if (!pName) return msToast('Patient name is required.', 'error');
    if (!typeVal) return msToast('Document type is required.', 'error');
    if (!desc) return msToast('Description is required.', 'error');
    var fileErr = validateDocFile(file);
    if (fileErr) return msToast(fileErr, 'error');

    var isTest = docType === 'test';
    var table = isTest ? 'medical_tests' : 'medical_certificates';
    var code = makeDocCode(isTest ? 'TEST-' : 'CERT-');
    var path = (isTest ? 'tests/' : 'certificates/') + code + fileExt(file.name);

    var btn = document.getElementById('docCreateSubmitBtn');
    setBtnLoading(btn, true);

    supabase.storage.from('medical-documents').upload(path, file)
      .then(function (up) {
        if (up.error) { setBtnLoading(btn, false); return msToast(up.error.message || 'Upload failed.', 'error'); }
        var payload = { discord_id: discordId, discord_name: pName, patient_name: pName, file_url: path, file_name: file.name, workflow_status: 'PENDING' };
        if (isTest) {
          payload.test_code = code; payload.test_type = typeVal; payload.result = desc;
        } else {
          payload.certificate_code = code; payload.certificate_type = typeVal; payload.content = desc;
        }

        supabase.from(table).insert(payload).select().single().then(function (res) {
          setBtnLoading(btn, false);
          if (res.error) {
            supabase.storage.from('medical-documents').remove([path]);
            return msToast(res.error.message || 'Failed to create document.', 'error');
          }
          document.getElementById('docSuccessCode').value = code;
          closeDocCreate();
          openModal('docSuccessModal');
          loadTab(ACTIVE_TAB);
          loadCreatedDocs();
        });
      });
  }

  function closeDocSuccess() { closeModal('docSuccessModal'); }

  function copyDocSuccessCode() {
    var input = document.getElementById('docSuccessCode');
    input.select();
    input.setSelectionRange(0, 99999);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(function () {
        document.getElementById('docSuccessFeedback').textContent = 'Copied!';
      });
    } else if (ok) {
      document.getElementById('docSuccessFeedback').textContent = 'Copied!';
    }
  }

  // expose functions used by inline onclick attributes
  window.closeDocCreate = closeDocCreate;
  window.closeDocSuccess = closeDocSuccess;
  window.copyDocSuccessCode = copyDocSuccessCode;
  window.closeRejectModal = closeRejectModal;
  window.confirmReject = confirmReject;
  window.closeDocView = closeDocView;
  window.docViewDownload = docViewDownload;
  window.closeDocEdit = closeDocEdit;
  window.closeConfirmModal = closeConfirmModal;
  window.setDocType = setDocType;
})();
