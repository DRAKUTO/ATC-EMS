// ============================================================
// ATLANTIC EMS - MANAGEMENT (Manager-only panel)
// Dashboard, users, EMS/Doctors, roles, joining CV, medical
// requests, medical documents, contact messages, comments,
// statistics and settings.
// Privileged operations run through SECURITY DEFINER RPCs.
// ============================================================

(function () {
  'use strict';

  var USER = null;
  var ACTIVE_TAB = 'dashboard';

  var currentConfirm = null;  // { onConfirm }
  var currentCv = null;       // application row being reviewed
  var currentView = null;     // { path, name }

  var STATUS_META = {
    PENDING:     { label: 'PENDING',     cls: 'st-pending' },
    IN_PROGRESS: { label: 'IN PROGRESS', cls: 'st-progress' },
    READY:       { label: 'READY',       cls: 'st-ready' },
    REJECTED:    { label: 'REJECTED',    cls: 'st-rejected' },
    APPROVED:    { label: 'APPROVED',    cls: 'st-ready' },
    REVOKED:     { label: 'REVOKED',     cls: 'st-rejected' }
  };

  var ROLE_BADGE = {
    Manager: '<span class="role-badge role-manager">MANAGER</span>',
    EMS: '<span class="role-badge role-ems">EMS</span>',
    user: '<span class="role-badge role-user">USER</span>'
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

  function mgToast(msg, type) {
    var old = document.getElementById('mgToast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = 'mgToast';
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
  document.addEventListener('DOMContentLoaded', initManagement);

  function initManagement() {
    bindTabs();
    bindConfirmModal();
    bindSettings();
    bindUsersFilters();
    var banBtn = document.getElementById('banConfirmBtn');
    if (banBtn) banBtn.addEventListener('click', confirmBanAction);

    guardAccess('Manager').then(function (user) {
      if (!user) return;
      USER = user;
      loadTab(ACTIVE_TAB);
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

  function loadTab(tab) {
    switch (tab) {
      case 'dashboard': return loadDashboard();
      case 'users': return loadUsers();
      case 'ems': return loadEms();
      case 'roles': return loadRoles();
      case 'cv': return loadCv();
      case 'mrequests': return loadMRequests();
      case 'mdocs': return loadMDocs();
      case 'messages': return loadMessages();
      case 'comments': return loadComments();
      case 'statistics': return loadStatistics();
      case 'settings': return loadSettings();
    }
  }

  function count(table) {
    return supabase.from(table).select('*', { count: 'exact', head: true })
      .then(function (r) { return r.count != null ? r.count : 0; });
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  function loadDashboard() {
    setLoading('dashboard');
    Promise.all([
      count('accounts'),
      count('medication_requests'),
      count('medical_appointments'),
      count('medical_tests'),
      count('medical_certificates'),
      count('contacts'),
      count('comments'),
      count('applications'),
      supabase.from('staff_activities').select('*').order('created_at', { ascending: false }).limit(10)
    ]).then(function (r) {
      var el = listEl('dashboard');
      var cards = [
        ['Users', r[0]], ['Medication Requests', r[1]], ['Appointments', r[2]],
        ['Medical Tests', r[3]], ['Certificates', r[4]], ['Contact Messages', r[5]],
        ['Comments', r[6]], ['Joining CV', r[7]]
      ];
      el.innerHTML =
        '<div class="stat-grid">' + cards.map(function (c) {
          return '<div class="stat-card"><div class="stat-value">' + c[1] + '</div><div class="stat-label">' + esc(c[0]) + '</div></div>';
        }).join('') + '</div>' +
        '<h3 class="panel-subtitle">Recent Activity</h3>' +
        ((r[8].data || []).length ? r[8].data.map(function (a) {
          var text = a.actor_name + ' ' + a.action + ' ' + a.table_name;
          if (a.record_code) text += ' ' + a.record_code;
          if (a.detail) text += ' - ' + a.detail;
          return '<div class="req-card history-row"><div class="history-icon"></div>' +
            '<div class="history-body"><div class="history-text">' + esc(text) + '</div>' +
            '<div class="req-sub">' + fmtDate(a.created_at) + '</div></div></div>';
        }).join('') : '<p class="med-empty">No recent activity.</p>');
    });
  }

  // ============================================================
  // USERS (all accounts)
  // ============================================================
  var usersCache = [];

  function loadUsers() {
    setLoading('users');
    supabase.from('accounts').select('*').order('created_at', { ascending: false }).limit(1000)
      .then(function (res) {
        if (res.error) return setEmpty('users', 'Error loading users.');
        usersCache = res.data || [];
        renderUsersStats(usersCache);
        renderUsers();
      });
  }

  function loadEms() {
    setLoading('ems');
    supabase.from('accounts').select('*').in('role', ['EMS', 'Manager']).order('created_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) return setEmpty('ems', 'Error loading staff.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('ems', 'No EMS doctors or managers yet.');
        var el = listEl('ems');
        el.innerHTML = rows.map(renderUserRow).join('');
      });
  }

  function renderUsersStats(rows) {
    var counts = { user: 0, EMS: 0, Manager: 0, banned: 0, active: 0 };
    rows.forEach(function (u) {
      if (counts[u.role] != null) counts[u.role]++;
      if (u.is_banned) counts.banned++; else counts.active++;
    });
    var el = document.getElementById('usersStats');
    if (!el) return;
    el.innerHTML =
      '<div class="stat-card"><div class="stat-value">' + rows.length + '</div><div class="stat-label">Total Users</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + counts.user + '</div><div class="stat-label">Users</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + counts.EMS + '</div><div class="stat-label">Total EMS</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + counts.Manager + '</div><div class="stat-label">Total Managers</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + counts.banned + '</div><div class="stat-label">Banned Users</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + counts.active + '</div><div class="stat-label">Active Accounts</div></div>';
  }

  function renderUsers() {
    var q = ((document.getElementById('usersSearchInput') || {}).value || '').trim().toLowerCase();
    var roleF = ((document.getElementById('usersRoleFilter') || {}).value) || '';
    var banF = ((document.getElementById('usersBanFilter') || {}).value) || '';
    var rows = usersCache.filter(function (u) {
      if (roleF && u.role !== roleF) return false;
      if (banF === 'banned' && !u.is_banned) return false;
      if (banF === 'active' && u.is_banned) return false;
      if (q) {
        var hay = ((u.name || '') + ' ' + (u.account_id || '') + ' ' + (u.id || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var el = listEl('users');
    if (!rows.length) return setEmpty('users', 'No users match the current filters.');
    el.innerHTML = rows.map(renderUserRow).join('');
  }

  function bindUsersFilters() {
    ['usersSearchInput', 'usersRoleFilter', 'usersBanFilter'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', renderUsers);
      if (el.tagName === 'SELECT') el.addEventListener('change', renderUsers);
    });
  }

  function renderUserRow(u) {
    var isSelf = USER && u.account_id === USER.discordId;
    var h = '<div class="req-card user-card">';
    h += '<div class="user-card-head">';
    h += '<div class="patient-avatar">' + esc((u.name || '?').charAt(0).toUpperCase()) + '</div>';
    h += '<div class="patient-info">';
    h += '<div class="req-patient">' + esc(u.name || '-') + ' ' + (ROLE_BADGE[u.role] || '') + (u.is_banned ? '<span class="role-badge role-banned">BANNED</span>' : '') + (isSelf ? '<span class="role-badge role-user">YOU</span>' : '') + '</div>';
    h += '<div class="req-sub">Discord ID: ' + esc(u.account_id || '-') + ' &middot; UUID: ' + esc(u.id || '-') + '</div>';
    h += '<div class="req-sub">Created: ' + fmtDate(u.created_at) + '</div>';
    if (u.is_banned) {
      h += '<div class="req-sub">Ban date: ' + fmtDate(u.banned_at) + (u.banned_by ? ' &middot; by ' + esc(u.banned_by) : '') + '</div>';
      h += '<div class="req-sub">Ban reason: ' + esc(u.ban_reason || '-') + '</div>';
    }
    h += '</div></div>';
    h += '<div class="req-actions">';
    h += '<select class="form-control role-select" data-act="role-change" data-id="' + esc(u.account_id) + '" data-name="' + esc(u.name || u.account_id) + '" data-prev="' + esc(u.role) + '">' +
      '<option value="user"' + (u.role === 'user' ? ' selected' : '') + '>User</option>' +
      '<option value="EMS"' + (u.role === 'EMS' ? ' selected' : '') + '>EMS</option>' +
      '<option value="Manager"' + (u.role === 'Manager' ? ' selected' : '') + '>Manager</option>' +
      '</select>';
    if (u.is_banned) {
      h += '<button class="btn btn-success btn-sm" data-act="unban-user" data-id="' + esc(u.account_id) + '">UNBAN</button>';
    } else if (!isSelf) {
      h += '<button class="btn btn-outline btn-sm" data-act="ban-user" data-id="' + esc(u.account_id) + '" data-name="' + esc(u.name || u.account_id) + '">BAN</button>';
    }
    if (!isSelf) {
      h += '<button class="btn btn-danger btn-sm" data-act="delete-user" data-id="' + esc(u.account_id) + '">DELETE</button>';
    }
    h += '</div></div>';
    return h;
  }

  // ============================================================
  // ROLES (summary)
  // ============================================================
  function loadRoles() {
    setLoading('roles');
    supabase.from('accounts').select('role').limit(1000)
      .then(function (res) {
        var rows = res.data || [];
        var counts = { user: 0, EMS: 0, Manager: 0 };
        rows.forEach(function (r) { if (counts[r.role] != null) counts[r.role]++; });
        var total = rows.length;
        var el = listEl('roles');
        el.innerHTML =
          '<div class="stat-grid">' +
            '<div class="stat-card"><div class="stat-value">' + total + '</div><div class="stat-label">Total Accounts</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + counts.user + '</div><div class="stat-label">Users</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + counts.EMS + '</div><div class="stat-label">EMS Doctors</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + counts.Manager + '</div><div class="stat-label">Managers</div></div>' +
          '</div>' +
          '<div class="info-box"><strong>Roles</strong> - Users have patient access. EMS doctors can open <a href="my-space.html">MY SPACE</a> to manage requests and create medical documents. Managers have all EMS powers plus this MANAGEMENT panel. The system automatically prevents removing the last remaining Manager.</div>';
      });
  }

  // ============================================================
  // JOINING CV
  // ============================================================
  function loadCv() {
    setLoading('cv');
    supabase.from('applications').select('*').order('created_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) return setEmpty('cv', 'Error loading applications.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('cv', 'No joining applications yet.');
        var el = listEl('cv');
        el.innerHTML = rows.map(function (a) {
          var h = '<div class="req-card cv-card">';
          h += '<div class="req-card-head">';
          h += '<div><div class="req-patient">' + esc(a.full_name || 'Unknown') + ' ' + badge(a.status || 'PENDING') + '</div>';
          h += '<div class="req-sub">' + esc(a.application_id || a.account_id || '') + ' &middot; ' + timeAgo(a.created_at) + '</div></div></div>';
          var fields = [
            ['Discord ID', 'account_id'],
            ['Real Age', 'real_age'],
            ['Real Sex', 'real_sex'],
            ['RP First Name', 'rp_first_name'],
            ['RP Last Name', 'rp_last_name'],
            ['RP Age', 'rp_age'],
            ['RP Sex', 'rp_sex'],
            ['Roleplay Experience', 'roleplay_experience'],
            ['EMS Experience', 'ems_experience'],
            ['Availability', 'availability'],
            ['Quality', 'quality'],
            ['Rules Accepted', 'rules_accepted']
          ];
          fields.forEach(function (f) {
            var val = a[f[1]];
            if (f[1] === 'rules_accepted') val = val ? 'Yes' : 'No';
            if (val == null || val === '') return;
            h += '<div class="req-cell"><span class="req-label">' + esc(f[0]) + '</span><span class="req-value">' + esc(val) + '</span></div>';
          });
          if (a.status === 'REJECTED' && a.rejection_reason) h += '<div class="req-rejected">Rejected: ' + esc(a.rejection_reason) + '</div>';
          if (a.status !== 'APPROVED' && a.status !== 'REJECTED') {
            h += '<div class="req-actions">' +
              '<button class="btn btn-success btn-sm" data-act="cv-review" data-id="' + a.id + '">REVIEW</button>' +
              '</div>';
          }
          h += '</div>';
          return h;
        }).join('');
      });
  }

  // ============================================================
  // MEDICAL REQUESTS (med + appointments)
  // ============================================================
  function loadMRequests() {
    setLoading('mrequests');
    var q1 = supabase.from('medication_requests').select('*').order('created_at', { ascending: false }).limit(200);
    var q2 = supabase.from('medical_appointments').select('*').order('created_at', { ascending: false }).limit(200);
    Promise.all([q1, q2]).then(function (res) {
      var el = listEl('mrequests');
      var html = '';
      html += '<h3 class="panel-subtitle">Medication Requests</h3>';
      var meds = res[0].data || [];
      html += meds.length ? meds.map(function (r) { return renderMgRequest(r, false); }).join('') : '<p class="med-empty">No medication requests.</p>';
      html += '<h3 class="panel-subtitle">Medical Appointments</h3>';
      var appts = res[1].data || [];
      html += appts.length ? appts.map(function (r) { return renderMgRequest(r, true); }).join('') : '<p class="med-empty">No appointments.</p>';
      el.innerHTML = html;
    });
  }

  function renderMgRequest(r, isAppointment) {
    var h = '<div class="req-card">';
    h += '<div class="req-card-head"><div><div class="req-patient">' + esc(r.discord_name || 'Unknown') + '</div>' +
      '<div class="req-sub">' + esc(r.request_code || r.appointment_code || r.discord_id || '') + ' &middot; ' + timeAgo(r.created_at) + '</div></div>' + badge(r.status) + '</div>';
    if (r.medication_name) {
      h += '<div class="req-grid"><div class="req-cell"><span class="req-label">MEDICATION</span><span class="req-value">' + esc(r.medication_name) + '</span></div>' +
        '<div class="req-cell"><span class="req-label">QUANTITY</span><span class="req-value">x' + Number(r.quantity || 0) + '</span></div>' +
        '<div class="req-cell"><span class="req-label">FINAL PRICE</span><span class="req-value">$' + Number(r.final_price || 0).toFixed(2) + '</span></div>' +
        '<div class="req-cell"><span class="req-label">PATIENT ID</span><span class="req-value">' + esc(r.discord_id || '') + '</span></div></div>';
    } else {
      var type = r.request_type || 'Medical Appointment';
      if (r.request_type === 'Other' && r.custom_request_type) type = r.custom_request_type;
      h += '<div class="req-grid"><div class="req-cell"><span class="req-label">APPOINTMENT</span><span class="req-value">' + esc(type) + '</span></div>' +
        '<div class="req-cell"><span class="req-label">PREFERRED DATE</span><span class="req-value">' + esc(r.preferred_date || '-') + '</span></div>' +
        '<div class="req-cell"><span class="req-label">PREFERRED TIME</span><span class="req-value">' + esc(r.preferred_time || '-') + '</span></div>' +
        '<div class="req-cell"><span class="req-label">PATIENT ID</span><span class="req-value">' + esc(r.discord_id || '') + '</span></div></div>';
      if (r.symptoms) h += '<div class="req-notes">' + esc(r.symptoms) + '</div>';
    }
    if (r.status === 'REJECTED') h += '<div class="req-rejected">Rejected by ' + esc(r.rejected_by || 'an EMS doctor') + ': ' + esc(r.rejection_reason || 'No reason.') + '</div>';
    if ((r.status === 'READY' || r.status === 'COMPLETED') && (r.assigned_doctor_name || r.completed_at)) {
      h += '<div class="req-done">Completed by ' + esc(r.assigned_doctor_name || r.completed_by || 'an EMS doctor') + (r.completed_at ? ' &middot; ' + fmtDate(r.completed_at) : '') + '</div>';
    }
    var takeRpc = isAppointment ? 'take_appointment' : 'take_med_request';
    var setRpc = isAppointment ? 'set_appointment_status' : 'set_med_request_status';
    h += '<div class="req-actions">';
    h += '<button class="btn btn-primary btn-sm" data-act="mg-take" data-rpc="' + takeRpc + '" data-id="' + r.id + '">TAKE</button>';
    h += '<button class="btn btn-success btn-sm" data-act="mg-status" data-rpc="' + setRpc + '" data-status="READY" data-id="' + r.id + '">READY</button>';
    h += '<button class="btn btn-danger btn-sm" data-act="mg-reject" data-rpc="' + setRpc + '" data-id="' + r.id + '">REJECT</button>';
    h += '<button class="btn btn-outline btn-sm" data-act="mg-status" data-rpc="' + setRpc + '" data-status="PENDING" data-id="' + r.id + '">RETURN</button>';
    h += '</div></div>';
    return h;
  }

  // ============================================================
  // MEDICAL DOCUMENTS (tests + certs)
  // ============================================================
  function loadMDocs() {
    setLoading('mdocs');
    var q1 = supabase.from('medical_tests').select('*').order('created_at', { ascending: false }).limit(200);
    var q2 = supabase.from('medical_certificates').select('*').order('created_at', { ascending: false }).limit(200);
    Promise.all([q1, q2]).then(function (res) {
      var el = listEl('mdocs');
      var html = '';
      html += '<h3 class="panel-subtitle">Medical Tests</h3>';
      var tests = res[0].data || [];
      html += tests.length ? tests.map(function (r) { return renderMgDoc(r, 'medical_tests'); }).join('') : '<p class="med-empty">No tests.</p>';
      html += '<h3 class="panel-subtitle">Medical Certificates</h3>';
      var certs = res[1].data || [];
      html += certs.length ? certs.map(function (r) { return renderMgDoc(r, 'medical_certificates'); }).join('') : '<p class="med-empty">No certificates.</p>';
      el.innerHTML = html;
    });
  }

  function renderMgDoc(r, table) {
    var code = table === 'medical_tests' ? r.test_code : r.certificate_code;
    var type = table === 'medical_tests' ? r.test_type : r.certificate_type;
    var text = table === 'medical_tests' ? r.result : r.content;
    var wf = r.workflow_status || 'PENDING';
    var h = '<div class="req-card">';
    h += '<div class="req-card-head"><div><div class="req-code">' + esc(code || '') + '</div>' +
      '<div class="req-sub">' + esc(type || '') + ' &middot; ' + esc(r.patient_name || 'Unknown') + ' &middot; ' + timeAgo(r.created_at) + '</div></div>' + badge(wf) + '</div>';
    if (text) h += '<div class="req-notes">' + esc(text) + '</div>';
    if (wf === 'REJECTED') h += '<div class="req-rejected">Rejected by ' + esc(r.rejected_by || 'an EMS doctor') + ': ' + esc(r.rejection_reason || 'No reason.') + '</div>';
    h += '<div class="req-actions">';
    if (r.file_url) h += '<button class="btn btn-outline btn-sm" data-act="mg-doc-view" data-path="' + esc(r.file_url) + '" data-name="' + esc(r.file_name || code || 'doc') + '">VIEW FILE</button>';
    h += '<button class="btn btn-success btn-sm" data-act="mg-doc-status" data-rpc="' + (table === 'medical_tests' ? 'set_test_status' : 'set_certificate_status') + '" data-status="READY" data-id="' + r.id + '">READY</button>';
    h += '<button class="btn btn-danger btn-sm" data-act="mg-doc-reject" data-rpc="' + (table === 'medical_tests' ? 'set_test_status' : 'set_certificate_status') + '" data-id="' + r.id + '">REJECT</button>';
    h += '<button class="btn btn-danger btn-sm" data-act="mg-doc-delete" data-table="' + table + '" data-id="' + r.id + '">DELETE</button>';
    h += '</div></div>';
    return h;
  }

  // ============================================================
  // MESSAGES & COMMENTS
  // ============================================================
  function loadMessages() {
    setLoading('messages');
    supabase.from('contacts').select('*').order('created_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) return setEmpty('messages', 'Error loading messages.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('messages', 'No contact messages yet.');
        var el = listEl('messages');
        el.innerHTML = rows.map(function (c) {
          var h = '<div class="req-card msg-card' + (c.is_read ? '' : ' msg-unread') + '">';
          h += '<div class="req-card-head"><div><div class="req-patient">' + esc(c.name || 'Unknown') + (c.is_read ? '' : ' <span class="role-badge role-ems">NEW</span>') + '</div>' +
            '<div class="req-sub">' + esc(c.email || '') + ' &middot; ' + esc(c.subject || '') + ' &middot; ' + timeAgo(c.created_at) + '</div></div></div>';
          h += '<div class="req-notes">' + esc(c.message || c.content || '') + '</div>';
          h += '<div class="req-actions">';
          if (!c.is_read) h += '<button class="btn btn-outline btn-sm" data-act="msg-read" data-id="' + c.id + '">MARK READ</button>';
          h += '<button class="btn btn-danger btn-sm" data-act="msg-delete" data-id="' + c.id + '">DELETE</button>';
          h += '</div></div>';
          return h;
        }).join('');
      });
  }

  function loadComments() {
    setLoading('comments');
    supabase.from('comments').select('*').order('created_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) return setEmpty('comments', 'Error loading comments.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('comments', 'No comments yet.');
        var el = listEl('comments');
        el.innerHTML = rows.map(function (c) {
          var author = c.discord_name || ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Anonymous';
          var h = '<div class="req-card msg-card">';
          h += '<div class="req-card-head"><div><div class="req-patient">' + esc(author) + '</div>' +
            '<div class="req-sub">Discord: ' + esc(c.account_id || '') + ' &middot; ' + timeAgo(c.created_at) + '</div></div></div>';
          h += '<div class="req-notes">' + esc(c.message || '') + '</div>';
          h += '<div class="req-actions"><button class="btn btn-danger btn-sm" data-act="cmt-delete" data-id="' + c.id + '">DELETE</button></div></div>';
          return h;
        }).join('');
      });
  }

  // ============================================================
  // STATISTICS
  // ============================================================
  function loadStatistics() {
    setLoading('statistics');
    var specs = [
      { table: 'medication_requests', col: 'status' },
      { table: 'medical_appointments', col: 'status' },
      { table: 'medical_tests', col: 'workflow_status' },
      { table: 'medical_certificates', col: 'workflow_status' },
      { table: 'applications', col: 'status' }
    ];
    Promise.all(specs.map(function (s) {
      return supabase.from(s.table).select(s.col).limit(1000).then(function (r) {
        var m = { PENDING: 0, IN_PROGRESS: 0, READY: 0, REJECTED: 0 };
        (r.data || []).forEach(function (x) { if (m[x[s.col]] != null) m[x[s.col]]++; });
        return { table: s.table, m: m, total: (r.data || []).length };
      });
    })).then(function (results) {
      var el = listEl('statistics');
      var html = '<div class="stat-grid">';
      html += results.map(function (r) {
        return '<div class="stat-card"><div class="stat-value">' + r.total + '</div><div class="stat-label">' + esc(r.table) + '</div></div>';
      }).join('');
      html += '</div>';
      html += '<div class="stat-table">';
      html += '<div class="stat-row stat-head"><span>Table</span><span>Pending</span><span>In Progress</span><span>Ready</span><span>Rejected</span></div>';
      results.forEach(function (r) {
        html += '<div class="stat-row"><span class="stat-name">' + esc(r.table) + '</span>' +
          '<span>' + r.m.PENDING + '</span><span>' + r.m.IN_PROGRESS + '</span><span>' + r.m.READY + '</span><span>' + r.m.REJECTED + '</span></div>';
      });
      html += '</div>';
      el.innerHTML = html;
    });
  }

  // ============================================================
  // SETTINGS
  // ============================================================
  function loadSettings() {
    setLoading('settings');
    supabase.from('settings').select('*').order('key', { ascending: true }).limit(200)
      .then(function (res) {
        if (res.error) return setEmpty('settings', 'Error loading settings.');
        var rows = res.data || [];
        if (!rows.length) return setEmpty('settings', 'No settings yet.');
        var el = listEl('settings');
        el.innerHTML = rows.map(function (s) {
          return '<div class="req-card">' +
            '<div class="req-card-head"><div><div class="req-patient">' + esc(s.key) + '</div>' +
            '<div class="req-sub">Updated ' + timeAgo(s.updated_at) + '</div></div></div>' +
            '<div class="req-actions">' +
            '<input type="text" class="form-control setting-input" value="' + esc(s.value) + '" data-key="' + esc(s.key) + '">' +
            '<button class="btn btn-primary btn-sm" data-act="set-setting" data-key="' + esc(s.key) + '">SAVE</button>' +
            '</div></div>';
        }).join('');
      });
  }

  function bindSettings() {
    var input = document.getElementById('settingsSearchInput');
    if (input) {
      input.addEventListener('input', function () {
        var q = input.value.trim().toLowerCase();
        Array.prototype.forEach.call(document.querySelectorAll('#settingsList .req-card'), function (card) {
          card.style.display = (card.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
        });
      });
    }
  }

  // ============================================================
  // ACTION DELEGATION
  // ============================================================
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    var id = el.dataset.id;

    switch (act) {
      case 'ban-user': return confirmBan(id, el.dataset.name);
      case 'unban-user': return runRpc('unban_account', { account_id: id }, 'User unbanned.', 'users');
      case 'delete-user': return confirmDeleteUser(id);
      case 'cv-review': return openCvReview(id);
      case 'mg-take': return runRpc(el.dataset.rpc,
          (el.dataset.rpc === 'take_appointment' ? { appointment_id: id } : { request_id: id }),
          'Request taken.', 'mrequests');
      case 'mg-status': return runRpc(el.dataset.rpc,
          (el.dataset.rpc === 'set_med_request_status' ? { request_id: id } :
           el.dataset.rpc === 'set_appointment_status' ? { appointment_id: id } : { test_id: id }),
          'Status updated.', 'mrequests');
      case 'mg-reject': return openMgReject(el.dataset.rpc, id, 'mrequests');
      case 'mg-doc-status': return runRpc(el.dataset.rpc,
          (el.dataset.rpc === 'set_test_status' ? { test_id: id } : { certificate_id: id }),
          'Status updated.', 'mdocs');
      case 'mg-doc-reject': return openMgReject(el.dataset.rpc, id, 'mdocs');
      case 'mg-doc-view': return openMgDocView(el.dataset.path, el.dataset.name);
      case 'mg-doc-delete': return confirmMgDocDelete(el.dataset.table, id);
      case 'msg-read': return runRpc('mark_contact_read', { contact_id: id }, 'Marked as read.', 'messages');
      case 'msg-delete': return confirmGeneric('Delete message?', 'This message will be permanently removed.', function () {
          return runRpc('delete_contact', { contact_id: id }, 'Message deleted.', 'messages'); });
      case 'cmt-delete': return confirmGeneric('Delete comment?', 'This comment will be permanently removed.', function () {
          return runRpc('delete_comment', { comment_id: id }, 'Comment deleted.', 'comments'); });
      case 'set-setting': return saveSetting(el.dataset.key, el.parentElement.querySelector('.setting-input'));
    }
  });

  document.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-act="role-change"]');
    if (!sel) return;
    var id = sel.dataset.id;
    var name = sel.dataset.name || 'this user';
    var role = sel.value;
    var prev = sel.dataset.prev;
    document.getElementById('confirmTitle').textContent = 'Change role?';
    document.getElementById('confirmMsg').textContent = 'Set ' + name + ' to role "' + role + '"?';
    currentConfirm = {
      onConfirm: function (btn) {
        setBtnLoading(btn, true);
        supabase.rpc('set_account_role', { account_id: id, new_role: role }).then(function (res) {
          setBtnLoading(btn, false);
          closeConfirmModal();
          if (res.error) { mgToast(res.error.message || 'Failed to change role.', 'error'); sel.value = prev; loadTab('users'); return; }
          mgToast('Role updated.');
          loadTab('users');
        });
      },
      onCancel: function () { if (sel) sel.value = prev; }
    };
    openModal('confirmModal');
  });

  function runRpc(rpcName, params, okMsg, tab) {
    return supabase.rpc(rpcName, params).then(function (res) {
      if (res.error) { mgToast(res.error.message || 'Operation failed.', 'error'); return; }
      if (okMsg) mgToast(okMsg);
      if (tab) loadTab(tab);
    });
  }

  var currentBan = null; // { id, name }

  function confirmBan(id, name) {
    currentBan = { id: id, name: name || 'this user' };
    document.getElementById('banModalName').textContent =
      'Ban ' + currentBan.name + '? The user will be blocked from logging in and accessing services.';
    document.getElementById('banModalReason').value = '';
    openModal('banModal');
  }

  function closeBanModal() { closeModal('banModal'); currentBan = null; }

  function confirmBanAction() {
    if (!currentBan) return;
    var btn = document.getElementById('banConfirmBtn');
    var reason = document.getElementById('banModalReason').value.trim();
    setBtnLoading(btn, true);
    supabase.rpc('ban_account', { account_id: currentBan.id, ban_reason: reason }).then(function (res) {
      setBtnLoading(btn, false);
      if (res.error) { mgToast(res.error.message || 'Failed to ban.', 'error'); return; }
      mgToast('User banned.');
      closeBanModal();
      loadTab('users');
    });
  }

  function confirmDeleteUser(id) {
    document.getElementById('confirmTitle').textContent = 'Delete this user?';
    document.getElementById('confirmMsg').textContent = 'The account will be permanently deleted. Their medical requests, documents and logs remain in the records (history is kept). This cannot be undone.';
    currentConfirm = { onConfirm: function (btn) {
        setBtnLoading(btn, true);
        supabase.rpc('delete_account', { account_id: id }).then(function (res) {
          setBtnLoading(btn, false);
          if (res.error) { mgToast(res.error.message || 'Failed to delete.', 'error'); return; }
          mgToast('User deleted.');
          closeConfirmModal();
          loadTab('users');
        });
      } };
    openModal('confirmModal');
  }

  function confirmGeneric(title, msg, fn) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    currentConfirm = { onConfirm: function (btn) {
        setBtnLoading(btn, true);
        Promise.resolve(fn()).then(function () { setBtnLoading(btn, false); closeConfirmModal(); });
      } };
    openModal('confirmModal');
  }

  function bindConfirmModal() {
    document.getElementById('confirmOkBtn').addEventListener('click', function () {
      if (!currentConfirm) return;
      currentConfirm.onConfirm(this);
    });
    var cancelBtn = document.getElementById('confirmCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelConfirm);
    var closeBtn = document.getElementById('confirmModalClose');
    if (closeBtn) closeBtn.addEventListener('click', cancelConfirm);
  }

  function cancelConfirm() {
    if (currentConfirm && currentConfirm.onCancel) currentConfirm.onCancel();
    closeConfirmModal();
  }

  function closeConfirmModal() { closeModal('confirmModal'); currentConfirm = null; }

  // ---------- CV review ----------
  function openCvReview(id) {
    supabase.from('applications').select('*').eq('id', id).single().then(function (res) {
      if (res.error || !res.data) { mgToast('Application not found.', 'error'); return; }
      currentCv = res.data;
      document.getElementById('cvReviewReason').value = '';
      openModal('cvReviewModal');
    });
  }

  function closeCvReview() { closeModal('cvReviewModal'); currentCv = null; }

  function cvApprove() {
    if (!currentCv) return;
    var btn = document.getElementById('cvApproveBtn');
    setBtnLoading(btn, true);
    supabase.rpc('approve_application', { application_id: currentCv.id }).then(function (res) {
      setBtnLoading(btn, false);
      if (res.error) { mgToast(res.error.message || 'Failed to approve.', 'error'); return; }
      mgToast('Application approved. Note: approval does not automatically grant the EMS role.');
      closeCvReview();
      loadTab('cv');
    });
  }

  function cvReject() {
    if (!currentCv) return;
    var reason = document.getElementById('cvReviewReason').value.trim();
    if (!reason) { mgToast('A rejection reason is required.', 'error'); return; }
    var btn = document.getElementById('cvRejectBtn');
    setBtnLoading(btn, true);
    supabase.rpc('reject_application', { application_id: currentCv.id, rejection_reason: reason }).then(function (res) {
      setBtnLoading(btn, false);
      if (res.error) { mgToast(res.error.message || 'Failed to reject.', 'error'); return; }
      mgToast('Application rejected.');
      closeCvReview();
      loadTab('cv');
    });
  }

  // ---------- reject request (manager) ----------
  function openMgReject(rpcName, id, tab) {
    var reason = prompt('Rejection reason (required):');
    if (!reason || !reason.trim()) { mgToast('A rejection reason is required.', 'error'); return; }
    var params = { new_status: 'REJECTED', rejection_reason: reason };
    if (rpcName === 'set_med_request_status') params.request_id = id;
    else if (rpcName === 'set_appointment_status') params.appointment_id = id;
    else if (rpcName === 'set_test_status') params.test_id = id;
    else params.certificate_id = id;
    runRpc(rpcName, params, 'Request rejected.', tab || 'mrequests');
  }

  // ---------- document view / delete (manager) ----------
  function openMgDocView(path, name) {
    currentView = { path: path, name: name };
    document.getElementById('docViewTitle').textContent = name;
    document.getElementById('docViewArea').innerHTML = '<p class="med-empty">Generating secure link...</p>';
    openModal('docViewModal');

    supabase.storage.from('medical-documents').createSignedUrl(path, 120)
      .then(function (sr) {
        if (sr.error || !sr.data || !sr.data.signedUrl) {
          document.getElementById('docViewArea').innerHTML = '<p class="med-empty">Unable to open the file.</p>';
          return;
        }
        var url = sr.data.signedUrl;
        var isPdf = /\.pdf$/i.test(path);
        var isImg = /\.(png|jpe?g|gif|webp)$/i.test(path);
        if (isPdf) {
          document.getElementById('docViewArea').innerHTML = '<iframe class="doc-frame" src="' + esc(url) + '" title="Document preview"></iframe>';
        } else if (isImg) {
          document.getElementById('docViewArea').innerHTML = '<div class="doc-img-wrap"><img src="' + esc(url) + '" alt="Document preview"></div>';
        } else {
          document.getElementById('docViewArea').innerHTML = '<p class="med-empty"><a href="' + esc(url) + '" target="_blank" rel="noopener">Open file</a></p>';
        }
      });
  }

  function closeDocView() { closeModal('docViewModal'); currentView = null; }

  function docViewDownload() {
    if (!currentView) return;
    supabase.storage.from('medical-documents').createSignedUrl(currentView.path, 60, { download: currentView.name })
      .then(function (sr) {
        if (sr.error || !sr.data || !sr.data.signedUrl) { mgToast('Unable to download.', 'error'); return; }
        window.open(sr.data.signedUrl, '_blank');
      });
  }

  function confirmMgDocDelete(table, id) {
    document.getElementById('confirmTitle').textContent = 'Delete document?';
    document.getElementById('confirmMsg').textContent = 'This document and its file will be permanently removed. This cannot be undone.';
    currentConfirm = { onConfirm: function (btn) {
        setBtnLoading(btn, true);
        supabase.from(table).select('file_url').eq('id', id).single().then(function (qr) {
          if (qr.data && qr.data.file_url) {
            supabase.storage.from('medical-documents').remove([qr.data.file_url]);
          }
          supabase.from(table).delete().eq('id', id).select().then(function (res) {
            setBtnLoading(btn, false);
            if (res.error) { mgToast(res.error.message || 'Failed to delete.', 'error'); return; }
            mgToast('Document deleted.');
            closeConfirmModal();
            loadTab('mdocs');
          });
        });
      } };
    openModal('confirmModal');
  }

  // ---------- settings save ----------
  function saveSetting(key, input) {
    var val = input ? input.value : '';
    supabase.rpc('update_setting', { setting_key: key, setting_value: val }).then(function (res) {
      if (res.error) { mgToast(res.error.message || 'Failed to save setting.', 'error'); return; }
      mgToast('Setting saved.');
      loadTab('settings');
    });
  }

  // expose functions used by inline onclick
  window.closeCvReview = closeCvReview;
  window.cvApprove = cvApprove;
  window.cvReject = cvReject;
  window.closeConfirmModal = closeConfirmModal;
  window.closeDocView = closeDocView;
  window.docViewDownload = docViewDownload;
  window.closeBanModal = closeBanModal;
})();
