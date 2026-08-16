// AUTH STATE
let currentUser = null;

// Becomes true only when the session was verified through Supabase Auth.
// The role links in the navigation bar are ONLY rendered from a real
// session - a localStorage-only copy is never trusted for privileges.
let realSession = false;

// ── Discord OAuth2 login (via Supabase Auth) ──
async function loginWithDiscord() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: 'identify email'
      }
    });
    if (error) throw error;
  } catch (err) {
    console.error('Discord login error:', err);
    alert('Discord login failed. Make sure the Discord provider is enabled in your Supabase dashboard (Authentication → Providers → Discord) and that this site URL is added to the redirect allow list.');
  }
}

// Map a Supabase auth user to the app's currentUser
function mapAuthUser(u) {
  const meta = u.user_metadata || {};
  const identities = u.identities || [];
  const discordIdentity = identities.find(i => i.provider === 'discord') || {};
  const identityData = discordIdentity.identity_data || {};
  return {
    id: u.id,
    discordId: identityData.id || meta.provider_id || u.id,
    email: u.email || identityData.email || '',
    name: meta.full_name || meta.name || meta.global_name || identityData.username || meta.preferred_username || 'Discord User',
    username: meta.preferred_username || identityData.username || '',
    avatar: meta.avatar_url || identityData.avatar_url || '',
    profession: meta.profession || ''
  };
}

// Find (or auto-create) the accounts row for the signed-in user.
//   accounts.id        = Supabase Auth user UUID (auth.uid())
//   accounts.account_id = Discord User ID
// These are DIFFERENT values; ensureAccount keeps them straight.
// A new account always starts as role 'user'. If the account already
// exists, its role is read but NEVER reset (Manager/EMS are preserved).
async function ensureAccount(user) {
  const db = realDb();
  if (!db || !user || !user.discordId) return null;
  let account = null;
  try {
    const { data: existing } = await db
      .from('accounts')
      .select('id, role, is_banned, ban_reason')
      .eq('id', user.id)
      .maybeSingle();
    if (existing) {
      account = existing;
      // Keep the stored Discord name fresh (role is untouched by the trigger).
      db.from('accounts').update({ name: user.name }).eq('id', user.id)
        .then(() => {})
        .catch(() => {});
    } else {
      const { data: inserted, error: insErr } = await db
        .from('accounts')
        .insert([{ id: user.id, name: user.name, account_id: user.discordId }])
        .select('id, role, is_banned, ban_reason')
        .maybeSingle();
      if (inserted) {
        account = inserted;
      } else if (insErr) {
        // Probably a race (account created in another tab) — read it back.
        const { data: retry } = await db
          .from('accounts')
          .select('id, role, is_banned, ban_reason')
          .eq('id', user.id)
          .maybeSingle();
        if (retry) account = retry;
      }
    }
  } catch (err) {
    console.error('Account: ensureAccount failed', err);
  }
  if (account) {
    // ROLE + BAN STATE ALWAYS COME FROM SUPABASE, never localStorage.
    currentUser.role = account.role || 'user';
    currentUser.isBanned = !!account.is_banned;
    currentUser.banReason = account.ban_reason || '';
    user.role = currentUser.role;
    user.isBanned = currentUser.isBanned;
    user.banReason = currentUser.banReason;
    saveSession(currentUser);
    if (user.isBanned) showBanNotice(user);
  }
  return account;
}

// Return the mapped Discord user when a real session exists, otherwise null.
async function getAuthUser() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data && data.session && data.session.user) {
      const user = mapAuthUser(data.session.user);
      await ensureAccount(user);
      return user;
    }
  } catch (err) {
    console.error('Auth: session check failed', err);
  }
  return null;
}

// Require a real Discord session. Returns the mapped user, or shows the
// login prompt and returns null when the visitor is not signed in.
async function requireAuth() {
  const user = await getAuthUser();
  if (user) return user;
  if (joiningLoginModal) {
    showJoiningLoginModal();
  } else {
    alert('Please login with Discord to continue.');
    loginWithDiscord();
  }
  return null;
}

// React to auth events (sign-in / sign-out / token refresh)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
    if (session?.user) {
      realSession = true;
      currentUser = mapAuthUser(session.user);
      saveSession(currentUser);
      cleanOAuthUrl();
      // Load role/ban from the DB FIRST, then render the nav accordingly.
      ensureAccount(currentUser).then(() => {
        updateNavForAuth();
        updateJoiningAuthState();
      });
    }
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    realSession = false;
    clearSession();
    updateNavForAuth();
    updateJoiningAuthState();
  }
});

// After an OAuth callback, remove the "#access_token=..." fragment from the
// URL bar. The session itself stays managed by Supabase Auth (localStorage).
// The access token is never logged or rendered.
function cleanOAuthUrl() {
  try {
    if (window.location.hash && /access_token|refresh_token|error/.test(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch (e) { /* ignore */ }
}

// Restore session on page load (real Supabase session first, then legacy local)
supabase.auth.getSession().then(({ data }) => {
  if (data?.session?.user) {
    realSession = true;
    currentUser = mapAuthUser(data.session.user);
    saveSession(currentUser);
    ensureAccount(currentUser).then(() => {
      updateNavForAuth();
      updateJoiningAuthState();
    });
  } else {
    loadSession();
  }
}).catch(() => loadSession());

function updateNavForAuth() {
  const navUser = document.getElementById('navUser');
  const navLogin = document.getElementById('navLogin');
  if (currentUser) {
    if (navLogin) navLogin.style.display = 'none';
    navUser.style.display = 'inline-flex';
    const initial = (currentUser.name || 'U').charAt(0).toUpperCase();
    const avatarImg = document.getElementById('userAvatarImg');
    if (currentUser.avatar && avatarImg) {
      avatarImg.src = currentUser.avatar;
      avatarImg.style.display = '';
      document.getElementById('userInitials').style.display = 'none';
    } else {
      if (avatarImg) avatarImg.style.display = 'none';
      const initialsEl = document.getElementById('userInitials');
      if (initialsEl) {
        initialsEl.style.display = '';
        initialsEl.textContent = initial;
      }
    }
    document.getElementById('navUserName').textContent = 'Hi, ' + (currentUser.name.split(' ')[0] || 'User');
    document.getElementById('dropdownName').textContent = currentUser.name;
    document.getElementById('dropdownEmail').textContent = currentUser.email;
    document.getElementById('dropdownProfessionLabel').textContent = currentUser.profession || 'Patient';
  } else {
    if (navLogin) navLogin.style.display = '';
    navUser.style.display = 'none';
  }
  updateRoleNav();
}

// ROLE-BASED NAVIGATION -------------------------------------------------
// Inject the correct privileged link into the nav bar:
//   Manager -> MANAGEMENT,  EMS -> MY SPACE,  user / banned / logged-out -> none.
// The link is cosmetic only; every protected page re-checks the role in
// the database through guardAccess() before showing any content.
function updateRoleNav() {
  const navMenu = document.getElementById('navMenu');
  if (!navMenu) return;

  let roleLink = document.getElementById('roleNavLink');
  let label = null;
  let href = null;

  if (realSession && currentUser && !currentUser.isBanned) {
    if (currentUser.role === 'Manager') { label = 'MANAGEMENT'; href = 'management.html'; }
    else if (currentUser.role === 'EMS') { label = 'MY SPACE'; href = 'my-space.html'; }
  }

  if (!href) {
    if (roleLink) roleLink.remove();
    return;
  }

  if (!roleLink) {
    roleLink = document.createElement('a');
    roleLink.id = 'roleNavLink';
    roleLink.className = 'nav-link nav-role-link';
    roleLink.addEventListener('click', function () {
      const hm = document.getElementById('hamburger');
      const nm = document.getElementById('navMenu');
      if (hm) hm.classList.remove('active');
      if (nm) nm.classList.remove('active');
    });
    navMenu.appendChild(roleLink);
  }
  roleLink.href = href;
  roleLink.textContent = label;
}

// BAN NOTICE ------------------------------------------------------------
// Shown after login whenever the Supabase accounts row says the user is
// banned. The DB (authorize / authorize_staff) blocks them everywhere.
function showBanNotice(user) {
  let overlay = document.getElementById('banOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'banOverlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-content">' +
        '<button class="modal-close" onclick="document.getElementById(\'banOverlay\').classList.remove(\'active\')" aria-label="Close">&times;</button>' +
        '<h3 class="modal-title">ACCOUNT SUSPENDED</h3>' +
        '<p class="modal-desc" id="banReasonText">Your account has been suspended.</p>' +
      '</div>';
    document.body.appendChild(overlay);
  }
  const reason = (user && user.banReason) ? 'Your account has been suspended. Reason: ' + user.banReason : 'Your account has been suspended.';
  const txt = document.getElementById('banReasonText');
  if (txt) txt.textContent = reason;
  overlay.classList.add('active');
}

// ACCESS GUARD for protected pages --------------------------------------
// Expected DOM (my-space.html / management.html):
//   <div id="guardWrapper">
//     <div id="guardLoading">...</div>
//     <div id="guardDenied" style="display:none">
//       <h1 id="guardTitle">ACCESS DENIED</h1>
//       <p id="guardMsg">...</p>
//     </div>
//     <div id="guardContent" style="display:none">...</div>
//   </div>
// Returns the authenticated user on success, otherwise null.
async function guardAccess(requiredRole) {
  const loadingEl = document.getElementById('guardLoading');
  const deniedEl  = document.getElementById('guardDenied');
  const contentEl = document.getElementById('guardContent');
  const titleEl   = document.getElementById('guardTitle');
  const msgEl     = document.getElementById('guardMsg');

  const fail = (title, msg) => {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'none';
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = msg;
    if (deniedEl) deniedEl.style.display = 'block';
  };

  const user = await getAuthUser();
  if (!user) {
    fail('ACCESS DENIED', "You don't have permission to access this page.");
    return null;
  }
  if (user.isBanned) {
    fail('ACCOUNT SUSPENDED', 'Your account has been suspended.' + (user.banReason ? ' Reason: ' + user.banReason : ''));
    return null;
  }
  const ok = requiredRole === 'Manager'
    ? user.role === 'Manager'
    : (user.role === 'EMS' || user.role === 'Manager');
  if (!ok) {
    fail('ACCESS DENIED', "You don't have permission to access this page.");
    return null;
  }

  if (loadingEl) loadingEl.style.display = 'none';
  if (deniedEl) deniedEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';
  return user;
}

// The localStorage copy is ONLY a cosmetic UI cache (name, avatar).
// Role and ban state are authorization decisions and are NEVER stored
// here — they are always re-read from the Supabase accounts table
// (see ensureAccount / guardAccess).
function saveSession(user) {
  const session = { id: user.id, name: user.name, email: user.email, profession: user.profession || 'Patient', avatar: user.avatar || '' };
  localStorage.setItem('atlantic_session', JSON.stringify(session));
}

function loadSession() {
  const saved = localStorage.getItem('atlantic_session');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      updateNavForAuth();
      updateJoiningAuthState();
      return true;
    } catch(e) {}
  }
  return false;
}

function clearSession() {
  localStorage.removeItem('atlantic_session');
}

function logout() {
  currentUser = null;
  realSession = false;
  clearSession();
  supabase.auth.signOut();
  closeUserMenu();
  updateNavForAuth();
}

function toggleUserMenu(e) {
  e.stopPropagation();
  document.getElementById('userDropdown').classList.toggle('active');
}

document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('userDropdown');
  const profile = document.getElementById('userProfile');
  if (dropdown.classList.contains('active') && profile && !profile.contains(e.target)) {
    dropdown.classList.remove('active');
  }
});

function closeUserMenu() {
  document.getElementById('userDropdown').classList.remove('active');
}

// SCROLL EFFECT FOR HEADER
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) { header.classList.add('scrolled'); }
  else { header.classList.remove('scrolled'); }
});

// MOBILE MENU TOGGLE
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navMenu.classList.toggle('active');
});

document.querySelectorAll('.nav-menu .nav-link').forEach(link => {
  if (link.classList.contains('nav-dropdown-link')) return;
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
  });
});

// NAV DROPDOWN (EMS JOB) - toggle on click
document.querySelectorAll('.nav-dropdown-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    link.closest('.nav-dropdown').classList.toggle('open');
  });
});

// Close open dropdown when clicking outside
document.addEventListener('click', (e) => {
  document.querySelectorAll('.nav-dropdown.open').forEach(dd => {
    if (!dd.contains(e.target)) dd.classList.remove('open');
  });
});

// Dropdown menu links close the mobile menu
document.querySelectorAll('.dropdown-link').forEach(link => {
  link.addEventListener('click', () => {
    const dd = link.closest('.nav-dropdown');
    if (dd) dd.classList.remove('open');
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
  });
});

// CONTACT MODAL
const contactModal = document.getElementById('contactModal');

function openContactModal() {
  if (!contactModal) return;
  contactModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeContactModal() {
  if (!contactModal) return;
  contactModal.classList.remove('active');
  document.body.style.overflow = 'auto';
}

if (contactModal) {
  contactModal.addEventListener('click', (e) => {
    if (e.target === contactModal) closeContactModal();
  });
}

// --- SUPABASE HELPERS ---

function setButtonLoading(btn, text) {
  btn.textContent = text;
  btn.disabled = true;
}

function resetButton(btn, text) {
  btn.textContent = text;
  btn.disabled = false;
  btn.style.backgroundColor = '';
  btn.style.backgroundImage = '';
}

function showSuccess(btn, text) {
  btn.textContent = text;
  btn.style.backgroundColor = '#28c76f';
  btn.style.backgroundImage = 'none';
}

// CONTACT FORM
async function handleFormSubmit(e) {
  e.preventDefault();
  const user = await requireAuth();
  if (!user) return;
  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn.textContent;
  setButtonLoading(btn, 'Sending...');

  const formData = {
    account_id: user.discordId,
    discord_name: user.name,
    name: document.getElementById('contactName').value,
    email: document.getElementById('contactEmail').value,
    subject: document.getElementById('contactSubject').value,
    message: document.getElementById('contactMsg').value
  };

  const { error } = await supabase.from('contacts').insert([formData]);

  if (error) {
    alert('Error sending message: ' + error.message);
    resetButton(btn, original);
    return;
  }

  showSuccess(btn, 'Message Sent! ✓');
  setTimeout(() => {
    e.target.reset();
    closeContactModal();
    setTimeout(() => resetButton(btn, original), 500);
  }, 1500);
}

// CONTACT SECTION FORM
async function handleContactSectionSubmit(e) {
  e.preventDefault();
  const user = await requireAuth();
  if (!user) return;
  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn.textContent;
  setButtonLoading(btn, 'Sending...');

  const formData = {
    account_id: user.discordId,
    discord_name: user.name,
    name: document.getElementById('csName').value,
    email: document.getElementById('csEmail').value,
    subject: document.getElementById('csSubject').value,
    message: document.getElementById('csMsg').value
  };

  const { error } = await supabase.from('contacts').insert([formData]);

  if (error) {
    alert('Error sending message: ' + error.message);
    resetButton(btn, original);
    return;
  }

  showSuccess(btn, 'Message Sent! ✓');
  setTimeout(() => {
    e.target.reset();
    setTimeout(() => resetButton(btn, original), 500);
  }, 1500);
}

// TESTIMONIAL CAROUSEL
const track = document.getElementById('carouselTrack');
const slides = track ? Array.from(track.children) : [];
const nextBtn = document.getElementById('btnNext');
const prevBtn = document.getElementById('btnPrev');
const dotsContainer = document.getElementById('carouselDots');
const dots = dotsContainer ? Array.from(dotsContainer.children) : [];

let currentSlideIndex = 0;
let carouselTimer = null;

function updateSlidePosition() {
  if (!track) return;
  track.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  dots.forEach(dot => dot.classList.remove('active'));
  dots[currentSlideIndex].classList.add('active');
}

function nextSlide() {
  if (!slides.length) return;
  currentSlideIndex = (currentSlideIndex + 1) % slides.length;
  updateSlidePosition();
}

function prevSlide() {
  if (!slides.length) return;
  currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
  updateSlidePosition();
}

if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); resetAutoPlay(); });
if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); resetAutoPlay(); });

dots.forEach((dot, index) => {
  dot.addEventListener('click', () => {
    currentSlideIndex = index;
    updateSlidePosition();
    resetAutoPlay();
  });
});

function startAutoPlay() { carouselTimer = setInterval(nextSlide, 5000); }
function stopAutoPlay() { clearInterval(carouselTimer); }
function resetAutoPlay() { stopAutoPlay(); startAutoPlay(); }

if (track) startAutoPlay();

const carouselOuter = document.querySelector('.carousel-outer');
if (carouselOuter) {
  carouselOuter.addEventListener('mouseenter', stopAutoPlay);
  carouselOuter.addEventListener('mouseleave', startAutoPlay);
}

// ===== CONTACT PAGE FORM (dedicated contact.html) =====
async function handleContactPageSubmit(e) {
  e.preventDefault();
  const user = await requireAuth();
  if (!user) return;
  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn.textContent;
  setButtonLoading(btn, 'Sending...');

  const formData = {
    account_id: user.discordId,
    discord_name: user.name,
    first_name: document.getElementById('contactFirstName').value,
    last_name: document.getElementById('contactLastName').value,
    subject: document.getElementById('contactSubject').value,
    message: document.getElementById('contactMessage').value
  };

  const { error } = await supabase.from('contacts').insert([formData]);

  if (error) {
    alert('Error sending message: ' + error.message);
    resetButton(btn, original);
    return;
  }

  showSuccess(btn, 'Message Sent! ✓');
  setTimeout(() => {
    e.target.reset();
    setTimeout(() => resetButton(btn, original), 500);
  }, 1500);
}

// ===== COMMENTS SECTION (contact.html) =====
const commentList = document.getElementById('commentList');

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCommentDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}

function commentCard(c) {
  const full = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Anonymous';
  const initials = full.split(' ').map(n => n[0] || '').join('').slice(0, 2).toUpperCase() || 'U';
  return `
    <div class="comment-item">
      <div class="comment-item-header">
        <div class="comment-avatar">${escapeHtml(initials)}</div>
        <div>
          <div class="comment-name">${escapeHtml(full)}</div>
          <div class="comment-date">${escapeHtml(formatCommentDate(c.created_at))}</div>
        </div>
      </div>
      <p class="comment-text">${escapeHtml(c.message)}</p>
    </div>
  `;
}

async function loadComments() {
  if (!commentList) return;

  const { data, error } = await supabase
    .from('comments')
    .select()
    .order('created_at', { ascending: false });

  if (error) {
    commentList.innerHTML = '<p class="comment-empty">Unable to load comments.</p>';
    return;
  }

  if (!data || data.length === 0) {
    commentList.innerHTML = '<p class="comment-empty">No comments yet. Be the first to leave one!</p>';
    return;
  }

  commentList.innerHTML = data.map(commentCard).join('');
}

async function handleCommentSubmit(e) {
  e.preventDefault();
  const user = await requireAuth();
  if (!user) return;
  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn.textContent;
  setButtonLoading(btn, 'Posting...');

  const formData = {
    account_id: user.discordId,
    discord_name: user.name,
    first_name: document.getElementById('commentFirstName').value,
    last_name: document.getElementById('commentLastName').value,
    message: document.getElementById('commentMessage').value
  };

  const { error } = await supabase.from('comments').insert([formData]);

  if (error) {
    alert('Error posting comment: ' + error.message);
    resetButton(btn, original);
    return;
  }

  showSuccess(btn, 'Posted! ✓');
  e.target.reset();
  setTimeout(() => resetButton(btn, original), 500);
  loadComments();
}

// ===== JOINING JOB (joining.html) =====
const joiningForm = document.getElementById('joiningForm');
const joiningFormWrapper = document.getElementById('joiningFormWrapper');
const joiningLoginRequired = document.getElementById('joiningLoginRequired');
const joiningLoginModal = document.getElementById('joiningLoginModal');
const joiningSuccess = document.getElementById('joiningSuccess');
const joiningSubmitBtn = document.getElementById('joiningSubmitBtn');
const joiningError = document.getElementById('joiningError');
const joiningOrderCodeInput = document.getElementById('joiningOrderCode');
const joiningCopyFeedback = document.getElementById('joiningCopyFeedback');

// The form is always readable; login is enforced at submit time.
function updateJoiningAuthState() {
  if (!joiningFormWrapper) return;
  joiningFormWrapper.style.display = 'block';
  if (joiningLoginRequired) joiningLoginRequired.style.display = 'none';
}

function markInvalid(el, invalid) {
  if (!el) return;
  const group = el.closest('.form-group');
  if (invalid) {
    el.classList.add('invalid');
    if (group) group.classList.add('invalid');
  } else {
    el.classList.remove('invalid');
    if (group) group.classList.remove('invalid');
  }
}

function showJoiningError(messages) {
  if (!joiningError) return;
  joiningError.innerHTML = '<strong>Please fix the following:</strong> ' + messages.join(', ');
  joiningError.style.display = 'block';
  joiningError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideJoiningError() {
  if (joiningError) joiningError.style.display = 'none';
}

function validateJoiningForm() {
  const textFields = [
    ['realFullName', 'Real Full Name'],
    ['realAge', 'Real Age'],
    ['rpFirstName', 'Roleplay First Name'],
    ['rpLastName', 'Roleplay Last Name'],
    ['rpAge', 'Roleplay Age'],
    ['rpQuality', 'Quality']
  ];
  const radioGroups = [
    ['realSex', 'Real Sex'],
    ['rpSex', 'Roleplay Sex'],
    ['rpExp', 'Roleplay Experience'],
    ['emsExp', 'EMS Experience'],
    ['availability', 'Availability']
  ];

  const errors = [];

  textFields.forEach(([id, label]) => {
    const el = document.getElementById(id);
    const ok = el && el.value.trim() !== '';
    markInvalid(el, !ok);
    if (!ok) errors.push(label);
  });

  radioGroups.forEach(([name, label]) => {
    const checked = document.querySelector('input[name="' + name + '"]:checked');
    const first = document.querySelector('input[name="' + name + '"]');
    const group = first ? first.closest('.form-group') : null;
    if (group) group.classList.toggle('invalid', !checked);
    if (!checked) errors.push(label);
  });

  const agree = document.getElementById('joiningAgree');
  markInvalid(agree, !agree.checked);
  const agreeBox = agree ? agree.closest('.joining-agreement') : null;
  if (agreeBox) agreeBox.classList.toggle('invalid', !agree.checked);
  if (!agree.checked) errors.push('Rules agreement');

  return errors;
}

function collectJoiningFormData(user) {
  const radio = (name) => {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  };
  return {
    account_id: user.discordId || '',
    discord_name: user.name || '',
    full_name: document.getElementById('realFullName').value.trim(),
    real_age: Number(document.getElementById('realAge').value) || null,
    real_sex: radio('realSex'),
    rp_first_name: document.getElementById('rpFirstName').value.trim(),
    rp_last_name: document.getElementById('rpLastName').value.trim(),
    rp_age: Number(document.getElementById('rpAge').value) || null,
    rp_sex: radio('rpSex'),
    roleplay_experience: radio('rpExp'),
    ems_experience: radio('emsExp'),
    availability: radio('availability'),
    quality: document.getElementById('rpQuality').value.trim(),
    rules_accepted: document.getElementById('joiningAgree').checked,
    status: 'PENDING'
  };
}

// Real Supabase database access (NOT the localStorage fallback).
function realDb() {
  return (window.supabase && window.supabase.real && window.supabase.real.from)
    ? window.supabase.real
    : null;
}

function generateApplicationId() {
  const now = new Date();
  const ymd = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let rnd = '';
  for (let i = 0; i < 6; i++) {
    rnd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'EMS-' + ymd + '-' + rnd;
}

function showJoiningLoginModal() {
  if (joiningLoginModal) {
    joiningLoginModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    return;
  }
  if (joiningLoginRequired) joiningLoginRequired.style.display = 'block';
}

function closeJoiningLoginModal() {
  if (!joiningLoginModal) return;
  joiningLoginModal.classList.remove('active');
  document.body.style.overflow = 'auto';
}

if (joiningLoginModal) {
  joiningLoginModal.addEventListener('click', (e) => {
    if (e.target === joiningLoginModal) closeJoiningLoginModal();
  });
}

function showJoiningSuccess(appId) {
  if (joiningOrderCodeInput) joiningOrderCodeInput.value = appId;
  if (joiningCopyFeedback) { joiningCopyFeedback.textContent = ''; joiningCopyFeedback.style.display = 'none'; }
  if (joiningForm) joiningForm.style.display = 'none';
  if (joiningSuccess) {
    joiningSuccess.style.display = 'block';
    joiningSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function handleJoiningSubmit(e) {
  e.preventDefault();
  hideJoiningError();

  const btn = joiningSubmitBtn;
  const original = btn.textContent;

  // 1) Verify the REAL Supabase auth session at submit time.
  //    Logged-out users get the Discord login modal; nothing is sent.
  let authUser = null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData && sessionData.session && sessionData.session.user) {
      authUser = mapAuthUser(sessionData.session.user);
    }
  } catch (err) {
    console.error('Joining: getSession() failed', err);
  }

  if (!authUser) {
    showJoiningLoginModal();
    return;
  }

  currentUser = authUser;
  saveSession(currentUser);

  // Make sure the accounts row exists (RLS requires it for the insert).
  await ensureAccount(authUser);

  // 2) Validate every required field — never reload the page on errors.
  const errors = validateJoiningForm();
  if (errors.length) {
    showJoiningError(errors);
    return;
  }

  const db = realDb();
  if (!db) {
    alert('Unable to submit your application. The database connection is unavailable.');
    return;
  }

  setButtonLoading(btn, 'Sending...');

  // 3) Reuse an existing PENDING application for this Discord user if present.
  try {
    const { data: existing } = await db
      .from('applications')
      .select('application_id')
      .eq('account_id', authUser.discordId)
      .eq('status', 'PENDING')
      .maybeSingle();
    if (existing && existing.application_id) {
      showJoiningSuccess(existing.application_id);
      resetButton(btn, original);
      return;
    }
  } catch (err) {
    console.error('Joining: pending-check failed', err);
  }

  // 4) Insert into the REAL Supabase database (never localStorage).
  let insertedId = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const appId = generateApplicationId();
    const payload = collectJoiningFormData(authUser);
    payload.application_id = appId;
    try {
      const { data, error } = await db
        .from('applications')
        .insert([payload])
        .select('application_id')
        .maybeSingle();
      if (error) {
        lastError = error;
        console.error('Joining: insert failed (attempt ' + (attempt + 1) + '):', error);
        continue;
      }
      insertedId = (data && data.application_id) ? data.application_id : appId;
      break;
    } catch (err) {
      lastError = err;
      console.error('Joining: insert threw (attempt ' + (attempt + 1) + '):', err);
    }
  }

  if (!insertedId) {
    console.error('Joining: application could not be saved to Supabase:', lastError);
    alert('Unable to submit your application. Please try again later.');
    resetButton(btn, original);
    return;
  }

  // 5) Success screen ONLY after a real, successful INSERT.
  showJoiningSuccess(insertedId);
  resetButton(btn, original);
}

function copyJoiningCode() {
  const input = document.getElementById('joiningOrderCode');
  if (!input || !input.value) return;
  input.select();
  input.setSelectionRange(0, 99999);
  const showFeedback = () => {
    if (joiningCopyFeedback) {
      joiningCopyFeedback.textContent = 'Application ID copied successfully.';
      joiningCopyFeedback.style.display = 'block';
      setTimeout(() => { joiningCopyFeedback.style.display = 'none'; }, 2500);
    }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(showFeedback).catch(() => {
        if (document.execCommand('copy')) showFeedback();
      });
    } else if (document.execCommand('copy')) {
      showFeedback();
    }
  } catch (err) {
    console.error('Joining: clipboard failed', err);
  }
}

function resetJoiningForm() {
  if (joiningForm) {
    joiningForm.reset();
    joiningForm.style.display = 'block';
  }
  if (joiningSuccess) joiningSuccess.style.display = 'none';
  hideJoiningError();
}

updateJoiningAuthState();
