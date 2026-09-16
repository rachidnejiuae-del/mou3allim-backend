<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Mon profil — Mou3allim</title>
<link rel="stylesheet" href="src/style.css" />
<style>
  .dash-wrap { max-width: 680px; margin: 0 auto; padding: 40px 24px 80px; }
  .dash-wrap h1 { font-size: 28px; margin-bottom: 4px; }
  .dash-wrap .sub { color: var(--muted); margin-bottom: 24px; }

  .identity-card {
    display: flex; align-items: center; gap: 12px; background: var(--card);
    border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 16px;
  }
  .identity-card .name { font-weight: 700; font-size: 15px; }
  .identity-card .phone { font-size: 13px; color: var(--muted); }

  .sub-badge {
    display: flex; align-items: center; gap: 8px; background: var(--teal-tint); color: var(--teal-dark);
    border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 20px; font-size: 14px; font-weight: 600;
  }
  .sub-badge.warning { background: #FFF3DD; color: #8A6116; }

  .price-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .price-row input { width: 110px; text-align: right; }

  .code-section { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 24px; margin-top: 28px; }

  .visible-note { background:#FFF8E7; border:1px solid #F0D48A; border-radius:12px; padding:12px 14px; font-size:13px; color:#7A5E12; line-height:1.5; margin-bottom:20px; }
  .level-group { margin-bottom: 12px; }
  .level-group-title { font-size: 13px; font-weight: 700; color: var(--muted); margin-bottom: 6px; }
</style>
</head>
<body>

<div id="nav-root"></div>

<div class="dash-wrap">
  <h1 class="display" data-i18n="dash_title">Votre profil professeur</h1>
  <p class="sub" data-i18n="dash_subtitle">Complétez votre profil, puis activez-le avec un code prépayé</p>

  <div id="dashContent">
    <div class="skeleton" style="height:300px;"></div>
  </div>
</div>

<script src="src/api.js"></script>
<script src="src/i18n.js"></script>
<script src="src/nav.js"></script>
<script>
  renderNav();
  if (!requireAuth('teacher')) { /* redirected */ }

  let profileData = null;
  let subjectsCatalog = [];
  let governorates = [];
  let degreesCatalog = [];
  let experienceCatalog = [];
  let levelsCatalog = []; // [{group, items:[...]}]
  let availableAreas = [];
  let selectedAreas = [];
  let selectedSubjects = []; // [{subject_id, name, price_per_hour}]
  let selectedLevels = [];   // [level_name]
  let selectedGovernorate = null;
  let selectedDegree = '';
  let selectedExperience = '';
  let subscription = null;

  async function init() {
    try {
      const [subjRes, govRes, profileRes, degRes, expRes, lvlRes] = await Promise.all([
        api.getSubjects(), api.getGovernorates(), api.getMyProfile(),
        api.getDegrees(), api.getExperience(), api.getLevels(),
      ]);
      subjectsCatalog = subjRes.subjects;
      governorates = govRes.governorates;
      degreesCatalog = degRes.degrees || [];
      experienceCatalog = expRes.experience || [];
      levelsCatalog = lvlRes.levels || [];
      profileData = profileRes.profile;
      selectedGovernorate = profileData.governorate;
      selectedAreas = profileData.areas || [];
      selectedLevels = profileData.levels || [];
      selectedDegree = profileData.degree || '';
      selectedExperience = profileData.experience || '';
      selectedSubjects = (profileData.subjects || []).map(s => ({
        subject_id: s.subject_id, name: s.name, price_per_hour: String(s.price_per_hour),
      }));

      if (selectedGovernorate) {
        const areaRes = await api.getAreas(selectedGovernorate);
        availableAreas = areaRes.areas || [];
      }

      try {
        const subRes = await api.getMySubscription();
        subscription = subRes.subscription;
      } catch {}

      render();
    } catch (err) {
      document.getElementById('dashContent').innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
    }
  }

  function render() {
    const days = subscription ? daysRemaining(subscription.ends_at) : null;

    // Smart subscription banner: hidden only if the teacher has a REAL paid
    // subscription (prepaid code) that is still active. Shown for trials,
    // expired, or no subscription — inviting them to subscribe via WhatsApp.
    const ref = subscription ? (subscription.payment_reference || '') : '';
    const isRealPaid = subscription && days > 0 && ref.indexOf('prepaid:') === 0;
    const subMsg = encodeURIComponent("مرحبا 👋 نحب نفعّل اشتراكي في Mou3allim (15 دينار في الشهر) باش نبقى ظاهر للأولياء. شنوّة الخطوات ؟");
    const subBanner = isRealPaid ? '' : `
      <a href="https://wa.me/21628357354?text=${subMsg}" target="_blank" style="text-decoration:none;display:block;margin-bottom:16px;">
        <div style="background:linear-gradient(135deg,#F2A63B,#E8912A);border-radius:16px;padding:16px 18px;box-shadow:0 8px 22px rgba(232,163,61,.32);display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          <div style="font-size:34px;line-height:1;">⭐</div>
          <div style="flex:1;min-width:180px;">
            <div style="color:#fff;font-size:16px;font-weight:800;margin-bottom:2px;">Activez votre abonnement</div>
            <div style="color:#FFF3E0;font-size:13px;line-height:1.4;">Restez visible par les parents. 15 DT/mois. Cliquez pour nous contacter sur WhatsApp.</div>
          </div>
          <div style="background:#fff;color:#C9861F;font-weight:800;padding:9px 16px;border-radius:999px;font-size:13px;white-space:nowrap;">💬 Je m'abonne</div>
        </div>
      </a>`;

    document.getElementById('dashContent').innerHTML = `
      ${subBanner}
      <div class="identity-card">
        <img src="${getAvatar(profileData)}" alt="" onerror="this.src='${MALE_AVATAR}'" style="width:44px;height:44px;border-radius:50%;object-fit:cover;" />
        <div>
          <div class="name">${escapeHtml(profileData.full_name)}</div>
          <div class="phone">${escapeHtml(profileData.phone)}</div>
        </div>
      </div>

      ${days !== null ? `
        <div class="sub-badge ${days <= 7 ? 'warning' : ''}">
          ⏱ ${days > 0 ? `${t('dash_sub_active')} — ${days} ${t('dash_sub_days_left')}` : t('dash_sub_expired')}
        </div>
      ` : ''}

      <div class="visible-note">
        ℹ️ Ces informations (diplôme, expérience, niveaux, matières, zone) seront <strong>visibles par les parents</strong>. Veuillez les renseigner avec exactitude.
      </div>

      <div class="field">
        <label>Niveau / Diplôme</label>
        <select class="input" id="degreeSelect">
          <option value="">— Choisissez —</option>
          ${degreesCatalog.map(d => `<option value="${escapeHtml(d)}" ${d === selectedDegree ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>Expérience</label>
        <select class="input" id="experienceSelect">
          <option value="">— Choisissez —</option>
          ${experienceCatalog.map(e => `<option value="${escapeHtml(e)}" ${e === selectedExperience ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>Niveaux enseignés</label>
        <div id="levelsWrap"></div>
      </div>

      <div class="field">
        <label>${t('dash_bio')}</label>
        <textarea class="textarea input" id="bioInput" placeholder="${t('dash_bio_placeholder')}">${escapeHtml(profileData.bio || '')}</textarea>
      </div>

      <div class="field">
        <label>${t('dash_governorate')}</label>
        <div class="chips" id="govChips"></div>
      </div>

      <div class="field" id="areaField" style="display:${availableAreas.length ? '' : 'none'};">
        <label>${t('dash_areas')}</label>
        <div class="chips" id="areaChipsWrap"></div>
      </div>

      <div class="field">
        <label>${t('dash_subjects')}</label>
        <div class="chips" id="subjectChipsWrap"></div>
      </div>

      <div id="priceRows"></div>

      <button class="btn btn-primary btn-block" id="saveProfileBtn" style="margin-top:8px;">${t('dash_save')}</button>

      <div class="code-section">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span>🎟️</span><strong>${t('dash_code_title')}</strong>
        </div>
        <p class="text-muted" style="font-size:13px;margin-bottom:16px;">${t('dash_code_hint')}</p>
        <div class="field">
          <input class="input" id="codeInput" placeholder="MOU3-XXXX-XXXX" style="text-align:center;font-weight:700;letter-spacing:1px;text-transform:uppercase;" />
        </div>
        <button class="btn btn-amber btn-block" id="activateBtn">${t('dash_activate')}</button>
        <a href="https://wa.me/21628357354?text=${subMsg}" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:8px;background:#25D366;color:#fff;text-decoration:none;padding:13px;border-radius:999px;font-weight:700;font-size:14px;margin-top:12px;">
          💬 Demander mon abonnement
        </a>
        <a href="payment.html" style="display:block; text-align:center; margin-top:12px; font-size:13px; font-weight:600; color:var(--teal-dark);">
          ${t('dash_no_code_link')}
        </a>
      </div>

      <p class="text-muted text-center" style="font-size:12px;margin-top:16px;">${t('dash_note')}</p>

      <div class="text-center" style="margin-top:24px;">
        <a href="#" id="logoutLink" style="color:var(--danger); font-weight:600; font-size:14px;">${t('dash_logout')}</a>
      </div>
    `;

    renderGovChips();
    renderSubjectChips();
    renderPriceRows();
    renderLevels();
    wireEvents();
  }

  function renderLevels() {
    const el = document.getElementById('levelsWrap');
    el.innerHTML = levelsCatalog.map(group => `
      <div class="level-group">
        <div class="level-group-title">${escapeHtml(group.group)}</div>
        <div class="chips">
          ${group.items.map(lvl => `
            <button type="button" class="chip ${selectedLevels.includes(lvl) ? 'active' : ''}" data-level="${escapeHtml(lvl)}">${escapeHtml(lvl)}</button>
          `).join('')}
        </div>
      </div>
    `).join('');
    el.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
      const lvl = btn.dataset.level;
      selectedLevels = selectedLevels.includes(lvl)
        ? selectedLevels.filter(x => x !== lvl)
        : [...selectedLevels, lvl];
      renderLevels();
    }));
  }

  function renderGovChips() {
    const el = document.getElementById('govChips');
    el.innerHTML = governorates.map(g => `
      <button type="button" class="chip ${g === selectedGovernorate ? 'active' : ''}" data-gov="${escapeHtml(g)}">${escapeHtml(g)}</button>
    `).join('');
    el.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', async () => {
      selectedGovernorate = btn.dataset.gov;
      selectedAreas = [];
      try {
        const res = await api.getAreas(selectedGovernorate);
        availableAreas = res.areas || [];
      } catch { availableAreas = []; }
      document.getElementById('areaField').style.display = availableAreas.length ? '' : 'none';
      renderGovChips();
      renderAreaChips();
    }));
  }

  function renderAreaChips() {
    const el = document.getElementById('areaChipsWrap');
    if (!el) return;
    el.innerHTML = availableAreas.map(a => `
      <button type="button" class="chip ${selectedAreas.includes(a) ? 'active' : ''}" data-area="${escapeHtml(a)}">${escapeHtml(a)}</button>
    `).join('');
    el.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
      const a = btn.dataset.area;
      selectedAreas = selectedAreas.includes(a) ? selectedAreas.filter(x => x !== a) : [...selectedAreas, a];
      renderAreaChips();
    }));
  }

  function renderSubjectChips() {
    const el = document.getElementById('subjectChipsWrap');
    el.innerHTML = subjectsCatalog.map(s => `
      <button type="button" class="chip ${selectedSubjects.some(x => x.subject_id === s.id) ? 'active' : ''}" data-id="${s.id}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</button>
    `).join('');
    el.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id, 10);
      const name = btn.dataset.name;
      const exists = selectedSubjects.find(x => x.subject_id === id);
      selectedSubjects = exists
        ? selectedSubjects.filter(x => x.subject_id !== id)
        : [...selectedSubjects, { subject_id: id, name, price_per_hour: '' }];
      renderSubjectChips();
      renderPriceRows();
    }));
  }

  function renderPriceRows() {
    const el = document.getElementById('priceRows');
    el.innerHTML = selectedSubjects.map(s => `
      <div class="price-row">
        <span style="font-weight:600;font-size:14px;">${escapeHtml(s.name)}</span>
        <input class="input" type="number" placeholder="${t('price_dt')}" data-id="${s.subject_id}" value="${s.price_per_hour}" />
      </div>
    `).join('');
    el.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
      const id = parseInt(input.dataset.id, 10);
      const sub = selectedSubjects.find(x => x.subject_id === id);
      if (sub) sub.price_per_hour = input.value;
    }));
  }

  function wireEvents() {
    document.getElementById('degreeSelect').addEventListener('change', (e) => { selectedDegree = e.target.value; });
    document.getElementById('experienceSelect').addEventListener('change', (e) => { selectedExperience = e.target.value; });
    document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
    document.getElementById('activateBtn').addEventListener('click', activateCode);
    document.getElementById('logoutLink').addEventListener('click', (e) => {
      e.preventDefault(); auth.clear(); window.location.href = 'index.html';
    });
  }

  async function saveProfile() {
    if (!selectedDegree) { showToast('Choisissez votre niveau / diplôme.'); return; }
    if (!selectedExperience) { showToast('Choisissez votre expérience.'); return; }
    if (selectedLevels.length === 0) { showToast('Cochez au moins un niveau enseigné.'); return; }
    if (!selectedGovernorate) { showToast('Choisissez un gouvernorat.'); return; }
    if (selectedSubjects.length === 0 || selectedSubjects.some(s => !s.price_per_hour)) {
      showToast('Choisissez au moins une matière et un prix pour chacune.');
      return;
    }
    const btn = document.getElementById('saveProfileBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      await api.updateMyProfile({
        bio: document.getElementById('bioInput').value,
        governorate: selectedGovernorate,
        degree: selectedDegree,
        experience: selectedExperience,
        levels: selectedLevels,
        subjects: selectedSubjects.map(s => ({ subject_id: s.subject_id, price_per_hour: parseFloat(s.price_per_hour) })),
        areas: selectedAreas,
      });
      showToast('Profil enregistré !');
      btn.disabled = false; btn.textContent = t('dash_saved');
    } catch (err) {
      showToast(err.message);
      btn.disabled = false; btn.textContent = t('dash_save');
    }
  }

  async function activateCode() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code) return showToast('Entrez votre code prépayé.');
    const btn = document.getElementById('activateBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      await api.redeemCode(code);
      showToast('Abonnement activé !');
      const subRes = await api.getMySubscription();
      subscription = subRes.subscription;
      render();
    } catch (err) {
      showToast(err.message);
      btn.disabled = false; btn.textContent = t('dash_activate');
    }
  }

  init();
</script>
</body>
</html>
