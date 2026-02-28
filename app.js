// ── Auth ──────────────────────────────────────────────────────────────────────
let authToken = localStorage.getItem('ktp_auth_token') || null;

const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': authToken ? `Bearer ${authToken}` : '',
});

const showApp = () => {
    const overlay = document.getElementById('loginOverlay');
    const app = document.getElementById('appContainer');
    overlay.classList.add('fade-out');
    setTimeout(() => {
        overlay.style.display = 'none';
        app.style.visibility = 'visible';
    }, 380);
};

const doLogout = async () => {
    try {
        await fetch('api/logout', { method: 'POST', headers: getAuthHeaders() });
    } catch { }
    authToken = null;
    localStorage.removeItem('ktp_auth_token');
    location.reload();
};

// ── Auth Check / Login Form ───────────────────────────────────────────────────
(async () => {
    const overlay = document.getElementById('loginOverlay');

    // 1. If we have a stored token, verify it with the server
    if (authToken) {
        try {
            const res = await fetch('api/auth-check', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (res.ok) {
                // Token valid — go straight to app
                showApp();
                return; // exit IIFE, init() runs at bottom of file normally
            }
        } catch { }
        // Token invalid / server unreachable — clear it
        authToken = null;
        localStorage.removeItem('ktp_auth_token');
    }

    // 2. No valid token — show login form
    // (overlay is visible by default; app is hidden)

    // Eye toggle
    const eyeBtn = document.getElementById('loginEyeBtn');
    const eyeIcon = document.getElementById('loginEyeIcon');
    const pwdInput = document.getElementById('loginPassword');
    eyeBtn?.addEventListener('click', () => {
        const isText = pwdInput.type === 'text';
        pwdInput.type = isText ? 'password' : 'text';
        eyeIcon.className = isText ? 'ph ph-eye' : 'ph ph-eye-slash';
    });

    // Form submit
    const form = document.getElementById('loginForm');
    const errorBox = document.getElementById('loginError');
    const errorText = document.getElementById('loginErrorText');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const btnText = document.getElementById('loginBtnText');

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.classList.add('hidden');
        submitBtn.disabled = true;
        btnText.textContent = 'Вход...';
        submitBtn.querySelector('i').className = 'ph ph-spinner';

        const login = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        try {
            const res = await fetch('api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                authToken = data.token;
                localStorage.setItem('ktp_auth_token', authToken);
                btnText.textContent = 'Добро пожаловать!';
                submitBtn.querySelector('i').className = 'ph ph-check';
                submitBtn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
                setTimeout(() => showApp(), 400);
            } else {
                throw new Error(data.error || 'Ошибка');
            }
        } catch (err) {
            errorText.textContent = err.message;
            errorBox.classList.remove('hidden');
            // Re-trigger shake animation
            errorBox.style.animation = 'none';
            errorBox.offsetHeight; // reflow
            errorBox.style.animation = '';
            submitBtn.disabled = false;
            btnText.textContent = 'Войти';
            submitBtn.querySelector('i').className = 'ph ph-arrow-right';
        }
    });
})();

// Core State
let userProfile = {
    HolydayDates: [],
    HolydayDatesString: "не настроено",
    Subjects: []
};

let activeSubjectUid = null;
let editingSubjectUid = null;
let editingTopicUid = null;
let activeTopicObserver = null;

// Unique ID Generator
const generateUid = (prefix) => prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

const ensureUids = () => {
    if (!userProfile.Subjects) return;
    userProfile.Subjects.forEach(s => {
        if (!s._uid) s._uid = generateUid('sub');
        if (s.Topics) {
            s.Topics.forEach(t => {
                if (!t._uid) t._uid = generateUid('top');
            });
        }
        if (s.ShownTopics) {
            s.ShownTopics.forEach(t => {
                if (!t._uid) t._uid = generateUid('top');
            });
        }
    });
};

// DOM Elements
const el = {
    subjectList: document.getElementById('subjectList'),
    emptyState: document.getElementById('emptyState'),
    subjectView: document.getElementById('subjectView'),
    subjectNameHeader: document.getElementById('subjectNameHeader'),
    subjectClassBadge: document.getElementById('subjectClassBadge'),
    subjectDates: document.getElementById('subjectDates'),
    topicTableBody: document.getElementById('topicTableBody'),

    // Modals
    subjectModal: document.getElementById('subjectModal'),
    topicModal: document.getElementById('topicModal'),
    holidaysModal: document.getElementById('holidaysModal'),
    pasteExcelModal: document.getElementById('pasteExcelModal'),

    // Inputs (Subject)
    subjNameInput: document.getElementById('subjNameInput'),
    subjClassInput: document.getElementById('subjClassInput'),
    subjStartInput: document.getElementById('subjStartInput'),
    subjEndInput: document.getElementById('subjEndInput'),
    daysContainer: document.getElementById('daysContainer'),

    // Inputs (Topic)
    topicIdInput: document.getElementById('topicIdInput'),
    topicDateInput: document.getElementById('topicDateInput'),
    topicNameInput: document.getElementById('topicNameInput'),
    topicHwInput: document.getElementById('topicHwInput'),
    topicLinkInput: document.getElementById('topicLinkInput'),
    topicSectionInput: document.getElementById('topicSectionInput'),

    // Inputs (Excel Paste)
    excelPasteArea: document.getElementById('excelPasteArea'),

    // Inputs (Holidays)
    holidayStartInput: document.getElementById('holidayStartInput'),
    holidayEndInput: document.getElementById('holidayEndInput'),
    holidaysList: document.getElementById('holidaysList')
};

// Utilities
const formatDate = (val) => {
    if (!val) return "-";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateForInput = (val) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split('T')[0];
};

const showModal = (modalId) => {
    document.getElementById(modalId).classList.add('active');
};

const hideModal = (modalId) => {
    document.getElementById(modalId).classList.remove('active');
};

// Russian plural form: declOfNum(5, ['час', 'часа', 'часов']) => 'часов'
const declOfNum = (n, forms) => {
    const abs = Math.abs(n) % 100;
    const n1 = abs % 10;
    if (abs > 10 && abs < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
};

// Initialization and Rendering
const init = async () => {
    // Step 1: Load from localStorage immediately for fast startup
    const saved = localStorage.getItem('ktp_userProfile');
    if (saved) {
        try {
            userProfile = { ...userProfile, ...JSON.parse(saved) };
            if (!userProfile.HolydayDates) userProfile.HolydayDates = [];
        } catch (e) {
            console.error("Failed to parse local storage data.");
        }
    }

    // Merge topics from Sections into root ShownTopics.
    // The C# app stores full data (HomeWork, Link etc.) in Sections[].ShownTopics,
    // while root ShownTopics can have empty HomeWork strings from older saves.
    // Strategy: ALWAYS rebuild from Sections when Sections are present, copying
    // over any existing root fields that Sections topics lack (like _uid).
    const flattenSections = (profile) => {
        if (!profile.Subjects) return;
        profile.Subjects.forEach(s => {
            if (!s.Sections || s.Sections.length === 0) return;

            // Collect all topics from Sections in order
            const secTopics = [];
            s.Sections.forEach(sec => {
                const topics = sec.ShownTopics || sec.Topics || [];
                topics.forEach(t => {
                    secTopics.push({ ...t, Section: sec.Name });
                });
            });

            if (secTopics.length === 0) return;

            // Build a lookup from root ShownTopics by (Id, Section) to preserve _uid and edits
            const rootLookup = new Map();
            (s.ShownTopics || []).forEach(rt => {
                const key = `${rt.Section || ''}__${rt.Id}__${rt.Name}`;
                rootLookup.set(key, rt);
            });

            // Rebuild ShownTopics: take Sections data (which has HomeWork) and
            // merge in _uid and any other web-app-specific fields from root
            s.ShownTopics = secTopics.map(st => {
                const key = `${st.Section || ''}__${st.Id}__${st.Name}`;
                const root = rootLookup.get(key);
                if (root) {
                    // Prefer Sections data for content fields, root for identity fields
                    return {
                        ...root,           // Keep _uid and other web-app fields
                        HomeWork: st.HomeWork || root.HomeWork || '',
                        Link: st.Link || root.Link || '',
                        Name: st.Name || root.Name,
                        Date: root.Date || st.Date,
                        Section: st.Section,
                        AdditionalInfo: st.AdditionalInfo || root.AdditionalInfo || '',
                    };
                }
                return st;
            });
        });
    };

    flattenSections(userProfile);
    ensureUids();
    renderSidebar();
    if (userProfile.Subjects && userProfile.Subjects.length > 0) {
        selectSubject(userProfile.Subjects[0]._uid);
    } else {
        renderMainArea();
    }

    // Step 2: Check if server mode is active and load from Yandex Disk
    const serverActive = await detectServerMode();
    if (serverActive) {
        const loaded = await loadFromYandex();
        if (loaded) {
            flattenSections(userProfile);
            ensureUids();
            renderSidebar();
            if (userProfile.Subjects && userProfile.Subjects.length > 0) {
                selectSubject(userProfile.Subjects[0]._uid);
            } else {
                renderMainArea();
            }
        }
    }
};

const renderSidebar = () => {
    el.subjectList.innerHTML = '';
    if (!userProfile.Subjects) return;

    userProfile.Subjects.forEach(subject => {
        const li = document.createElement('li');
        li.className = `subject-item ${subject._uid === activeSubjectUid ? 'active' : ''}`;
        li.innerHTML = `
            <i class="ph ph-book-open"></i>
            <div style="flex:1">
                <div style="font-size:0.9rem">${subject.Name || 'Без названия'}</div>
                <div style="font-size:0.75rem; color: var(--text-muted)">${subject.ClassName || '-'}</div>
            </div>
        `;
        li.onclick = () => selectSubject(subject._uid);
        el.subjectList.appendChild(li);
    });
};

const selectSubject = (uid) => {
    activeSubjectUid = uid;
    renderSidebar();
    renderMainArea();

    // Close mobile side menu if open
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('show');
};

// ─── Persistence ────────────────────────────────────────────────────────────

const saveToLocal = () => {
    localStorage.setItem('ktp_userProfile', JSON.stringify(userProfile));
};

// Show a toast notification
const showToast = (message, type = 'info') => {
    let toaster = document.getElementById('ktp-toaster');
    if (!toaster) {
        toaster = document.createElement('div');
        toaster.id = 'ktp-toaster';
        toaster.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            z-index: 99999; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none;
        `;
        document.body.appendChild(toaster);
    }
    const toast = document.createElement('div');
    const colors = { info: '#3B82F6', success: '#22c55e', error: '#EF4444', loading: '#f97316' };
    const icons = { info: 'ph-info', success: 'ph-check-circle', error: 'ph-x-circle', loading: 'ph-spinner' };
    toast.style.cssText = `
        background: #1E293B; border: 1px solid rgba(255,255,255,0.12); color: #F8FAFC;
        padding: 10px 18px; border-radius: 10px; font-size: 0.875rem; display: flex; align-items: center; gap: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4); transition: opacity 0.3s; opacity: 1;
        border-left: 3px solid ${colors[type] || colors.info};
    `;
    toast.innerHTML = `<i class="ph ${icons[type] || 'ph-info'}" style="color:${colors[type]}; font-size:1.1rem;${type === 'loading' ? ' animation: spin 1s linear infinite;' : ''}"></i> ${message}`;
    toaster.appendChild(toast);
    if (type !== 'loading') {
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
    }
    return toast; // return so caller can remove it manually (for loading)
};

// Detect if we are running under the Node.js server (has /api/ktp endpoint)
let isServerMode = false;
const detectServerMode = async () => {
    try {
        const res = await fetch('api/yandex/status', {
            method: 'GET',
            headers: { 'Authorization': authToken ? `Bearer ${authToken}` : '' }
        }).catch(() => null);
        if (res && res.ok) {
            const data = await res.json();
            isServerMode = data.connected === true;
            if (isServerMode) {
                console.log('[KTP] Server mode active. Yandex Disk connected:', data.user);
                updateYandexStatusBadge(true, data.user);
            } else {
                updateYandexStatusBadge(false, 'ошибка токена');
            }
        }
    } catch {
        isServerMode = false;
    }
    return isServerMode;
};

const updateYandexStatusBadge = (connected, user) => {
    const badge = document.getElementById('yandexStatusBadge');
    const saveBtn = document.getElementById('saveYandexBtn');
    const loadBtn = document.getElementById('loadYandexBtn');
    if (badge) {
        if (connected) {
            badge.innerHTML = `<i class="ph ph-cloud-check" style="color:#22c55e"></i> <span style="font-size:0.75rem; color:#22c55e">${user}</span>`;
            badge.title = 'Яндекс Диск подключён';
        } else {
            badge.innerHTML = `<i class="ph ph-cloud-slash" style="color:#EF4444"></i> <span style="font-size:0.75rem; color:#EF4444">Нет соединения</span>`;
            badge.title = 'Яндекс Диск недоступен';
        }
    }
    if (saveBtn) saveBtn.style.display = connected ? 'flex' : 'none';
    if (loadBtn) loadBtn.style.display = connected ? 'flex' : 'none';
};

// Helper called after cloud data load to re-render everything
window.initAfterLoad = () => {
    if (userProfile.Subjects) {
        ensureUids();
        renderSidebar();
        const firstUid = userProfile.Subjects[0]?._uid;
        if (firstUid) selectSubject(firstUid);
        else renderMainArea();
    }
};

// Load from Yandex Disk via server proxy
const loadFromYandex = async () => {
    const loadingToast = showToast('Загрузка с Яндекс Диска...', 'loading');
    try {
        const res = await fetch('api/ktp', {
            headers: { 'Authorization': authToken ? `Bearer ${authToken}` : '' }
        });
        if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
        const data = await res.json();
        if (data && (data.Subjects || data.subjects)) {
            userProfile = { ...userProfile, ...data };
            if (!userProfile.HolydayDates) userProfile.HolydayDates = [];
            saveToLocal(); // also keep local copy
            loadingToast.remove();
            showToast('Данные загружены с Яндекс Диска ☁️', 'success');
            return true;
        } else {
            throw new Error('Данные повреждены или пусты');
        }
    } catch (err) {
        loadingToast.remove();
        showToast(`Ошибка загрузки: ${err.message}`, 'error');
        console.error('[KTP] Yandex load error:', err);
        return false;
    }
};

// ─── Prepare a clean copy for saving (mirrors C# app JSON structure) ─────────
// The web app:
//   1. Adds _uid to every topic (web-only field, must be stripped)
//   2. Flattens Sections → ShownTopics (setting topic.Section = section name)
//   3. User edits may change Date, HomeWork, Link, AdditionalInfo on ShownTopics
//
// Before saving we must:
//   a) Write edits back into Sections[].ShownTopics (the authoritative source for C#)
//   b) Strip _uid from ShownTopics, Topics and Sections topics
//   c) Keep the root-level ShownTopics in sync too (for backward compat)
const stripWebFields = (topic) => {
    const t = { ...topic };
    delete t._uid;
    return t;
};

const prepareForSave = () => {
    // Deep clone so we never mutate the live userProfile
    const snapshot = JSON.parse(JSON.stringify(userProfile));

    snapshot.Subjects.forEach(subj => {
        // Build a lookup from the flat (web) ShownTopics by Id+Name+Section
        const webLookup = new Map();
        (subj.ShownTopics || []).forEach(wt => {
            const key = `${wt.Section || ''}__${wt.Id}__${wt.Name}`;
            webLookup.set(key, wt);
        });

        // 1. Sync edits back into Sections[].ShownTopics
        if (subj.Sections && subj.Sections.length > 0) {
            subj.Sections.forEach(sec => {
                const sTopics = sec.ShownTopics || sec.Topics || [];
                sec.ShownTopics = sTopics.map(st => {
                    const key = `${sec.Name}__${st.Id}__${st.Name}`;
                    const webTopic = webLookup.get(key);
                    if (webTopic) {
                        // Merge editable fields from web back to section topic
                        const mergedDate = webTopic.Date ?? st.Date;
                        const dateStr = mergedDate
                            ? new Date(mergedDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : (st.DateString || '');
                        return stripWebFields({
                            ...st,
                            Date: mergedDate,
                            DateString: dateStr,
                            HomeWork: webTopic.HomeWork ?? st.HomeWork ?? '',
                            Link: webTopic.Link ?? st.Link ?? '',
                            IsVisibleLink: webTopic.IsVisibleLink ?? st.IsVisibleLink ?? false,
                            AdditionalInfo: webTopic.AdditionalInfo ?? st.AdditionalInfo ?? '',
                            Name: webTopic.Name ?? st.Name,
                        });
                    }
                    return stripWebFields(st);
                });
                // Also clear Topics if ShownTopics is the canonical list
                if (sec.Topics) sec.Topics = sec.Topics.map(stripWebFields);
            });

            // 2. Rebuild root ShownTopics from Sections (so C# reads a consistent list)
            subj.ShownTopics = subj.Sections.flatMap(sec =>
                (sec.ShownTopics || []).map(st => stripWebFields({ ...st, Section: sec.Name }))
            );
        } else {
            // No Sections — just strip _uid from root ShownTopics
            if (subj.ShownTopics) subj.ShownTopics = subj.ShownTopics.map(stripWebFields);
            if (subj.Topics) subj.Topics = subj.Topics.map(stripWebFields);
        }
    });

    return snapshot;
};

// Save to Yandex Disk via server proxy
const saveToYandex = async () => {
    const loadingToast = showToast('Сохранение на Яндекс Диске...', 'loading');
    try {
        const payload = prepareForSave();          // clean copy, C#-compatible
        const res = await fetch('api/ktp', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        loadingToast.remove();
        if (res.ok && data.success) {
            showToast('Сохранено на Яндекс Диске ✓', 'success');
        } else {
            throw new Error(data.error || 'Неизвестная ошибка');
        }
    } catch (err) {
        loadingToast.remove();
        showToast(`Ошибка сохранения: ${err.message}`, 'error');
        console.error('[KTP] Yandex save error:', err);
    }
};

// Global handlers
window.showHolidays = () => {
    try {
        renderHolidays();
        showModal('holidaysModal');
    } catch (e) {
        console.error("Holidays error:", e);
        // Fallback: still try to show modal even if render fails
        showModal('holidaysModal');
    }
};

const renderMainArea = () => {
    if (!activeSubjectUid) {
        el.emptyState.classList.remove('hidden');
        el.subjectView.classList.add('hidden');
        document.getElementById('mobileSubjectBanner')?.classList.add('hidden');
        return;
    }

    const subject = userProfile.Subjects.find(s => s._uid === activeSubjectUid);
    if (!subject) return;

    el.emptyState.classList.add('hidden');
    el.subjectView.classList.remove('hidden');

    const subjectName = subject.Name || 'Без названия';
    const className = subject.ClassName || '';

    el.subjectNameHeader.innerText = subjectName;
    el.subjectClassBadge.innerHTML = `<i class="ph ph-student"></i> ${className || '-'}`;
    el.subjectDates.innerHTML = `<i class="ph ph-calendar"></i> ${formatDate(subject.StartDate)} - ${formatDate(subject.EndDate)}`;

    // Ensure ShownTopics exists to draw data
    if (!subject.ShownTopics && subject.Topics) {
        subject.ShownTopics = [...subject.Topics];
    }

    // Render topics
    el.topicTableBody.innerHTML = '';
    const topics = subject.ShownTopics || [];

    // ── Update mobile subject banner ───────────────────────────────────────
    const banner = document.getElementById('mobileSubjectBanner');
    const bannerName = document.getElementById('mobileSubjectName');
    const bannerCount = document.getElementById('mobileSubjectCount');
    if (banner && bannerName && bannerCount) {
        bannerName.textContent = className ? `${subjectName} · ${className}` : subjectName;
        const topicCount = topics.length;
        bannerCount.innerHTML = `<i class="ph ph-clock" style="font-size:0.8rem"></i> ${topicCount} ${declOfNum(topicCount, ['час', 'часа', 'часов'])}`;
        banner.classList.remove('hidden');
    }

    if (topics.length === 0) {
        el.topicTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted)">Темы пока отсутствуют</td></tr>`;
    } else {
        // Group by Section
        const sortedTopics = [...topics].sort((a, b) => (a.Id || 0) - (b.Id || 0));

        const sectionsMap = new Map();
        sortedTopics.forEach(topic => {
            const sec = topic.Section ? topic.Section.trim() : "Без раздела";
            if (!sectionsMap.has(sec)) {
                sectionsMap.set(sec, []);
            }
            sectionsMap.get(sec).push(topic);
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let closestTopicUid = null;
        let minDiff = Infinity;
        let closestPastTopicUid = null;
        let maxPastDiff = -Infinity;

        sectionsMap.forEach((secTopics, secName) => {
            if (secName !== "Без раздела") {
                const secTr = document.createElement('tr');
                secTr.className = 'section-row';
                secTr.style.background = 'rgba(255,255,255,0.03)';
                secTr.innerHTML = `<td colspan="4" style="font-weight: 600; color: var(--accent-primary); letter-spacing: 0.02em;">${secName}</td>`;
                el.topicTableBody.appendChild(secTr);
            }

            secTopics.forEach(topic => {
                if (topic.Date) {
                    const topicDate = new Date(topic.Date);
                    if (!isNaN(topicDate.getTime())) {
                        topicDate.setHours(0, 0, 0, 0);
                        const diff = topicDate.getTime() - today.getTime();
                        if (diff >= 0 && diff < minDiff) {
                            minDiff = diff;
                            closestTopicUid = topic._uid;
                        }
                        if (diff <= 0 && diff > maxPastDiff) {
                            maxPastDiff = diff;
                            closestPastTopicUid = topic._uid;
                        }
                    }
                }

                const tr = document.createElement('tr');
                tr.id = `topic-row-${topic._uid}`;
                let linkHtml = '';
                if (topic.Link) {
                    const urlMatch = topic.Link.match(/https?:\/\/[^\s]+/);
                    const hrefUrl = urlMatch ? urlMatch[0] : topic.Link;
                    linkHtml = `<a href="${hrefUrl}" target="_blank" class="topic-link tooltip" data-tooltip="Открыть"><i class="ph ph-link"></i></a>`;
                }

                const hwText = topic.HomeWork || topic.homeWork || topic.homework;
                // Escape quotes for html attributes
                const escTooltip = hwText ? hwText.replace(/"/g, '&quot;') : '';

                const hwHtml = hwText ? `
                    <div style="margin-top: 6px;">
                        <div class="topic-hw tooltip" data-tooltip="${escTooltip}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 450px; font-size: 0.8rem; color: var(--text-muted);">
                            <span style="font-weight:600; color:var(--text-secondary);">Д/З:</span> ${hwText}
                        </div>
                    </div>` : '';

                const copyBtnHtml = hwText ? `
                    <button class="btn btn-icon" onclick="copyHw(this)" data-hw="${escTooltip}" data-tooltip="Копировать Д/З">
                        <i class="ph ph-copy"></i>
                    </button>
                ` : '';

                tr.innerHTML = `
                    <td style="color: var(--text-muted)">${topic.Id}</td>
                    <td class="topic-date">${formatDate(topic.Date)}</td>
                    <td style="max-width: 450px;">
                        <div style="font-weight: 500; white-space: normal; line-height: 1.4; padding-right: 12px;">${topic.Name || 'Без названия'}</div>
                        ${hwHtml}
                    </td>
                    <td style="vertical-align: middle;">
                        <div class="td-actions" style="display: flex; gap: 8px; align-items: center; justify-content: flex-start;">
                            ${linkHtml}
                            ${copyBtnHtml}
                            <button class="btn btn-icon" onclick="editTopic('${topic._uid}')" data-tooltip="Редактировать">
                                <i class="ph ph-pencil-simple"></i>
                            </button>
                            <button class="btn btn-icon danger" onclick="deleteTopic('${topic._uid}')" data-tooltip="Удалить">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                el.topicTableBody.appendChild(tr);
            });
        });

        if (!closestTopicUid) closestTopicUid = closestPastTopicUid;

        // Floating action button for scrolling to active/nearest topic
        const btnScroll = document.getElementById('scrollToActiveBtn');
        if (closestTopicUid) {
            if (btnScroll) {
                btnScroll.classList.remove('hidden');
                btnScroll.onclick = () => {
                    const row = document.getElementById(`topic-row-${closestTopicUid}`);
                    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                };
            }
            setTimeout(() => {
                const row = document.getElementById(`topic-row-${closestTopicUid}`);
                if (row) {
                    // Highlight the row
                    if (activeTopicObserver) activeTopicObserver.disconnect();

                    row.classList.add('active-topic-row');

                    // Setup Intersection Observer to hide FAB when active row is visible
                    if (btnScroll && window.IntersectionObserver) {
                        activeTopicObserver = new IntersectionObserver((entries) => {
                            if (entries[0].isIntersecting) {
                                btnScroll.classList.add('hidden');
                            } else {
                                btnScroll.classList.remove('hidden');
                            }
                        }, { threshold: 0.1 });
                        activeTopicObserver.observe(row);
                    }

                    // First scroll if needed
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        } else {
            if (btnScroll) btnScroll.classList.add('hidden');
        }
    }
};

// ============================================
// Subject Settings (CRUD)
// ============================================

const dayNames = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

document.getElementById('addSubjectBtn').onclick = () => {
    editingSubjectUid = null;
    document.getElementById('subjectModalTitle').innerText = 'Новый предмет';
    el.subjNameInput.value = '';
    el.subjClassInput.value = '';
    el.subjStartInput.value = '';
    el.subjEndInput.value = '';

    // Clear checkboxes
    const checkboxes = el.daysContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);

    showModal('subjectModal');
};

document.getElementById('editSubjectBtn').onclick = () => {
    if (!activeSubjectUid) return;
    const subject = userProfile.Subjects.find(s => s._uid === activeSubjectUid);
    if (!subject) return;

    editingSubjectUid = activeSubjectUid;
    document.getElementById('subjectModalTitle').innerText = 'Редактировать предмет';
    el.subjNameInput.value = subject.Name;
    el.subjClassInput.value = subject.ClassName;
    el.subjStartInput.value = formatDateForInput(subject.StartDate);
    el.subjEndInput.value = formatDateForInput(subject.EndDate);

    // Sync checkboxes
    const checkboxes = el.daysContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        const dayModel = subject.DaysOfWeek ? subject.DaysOfWeek.find(d => d.Name === cb.dataset.day) : null;
        cb.checked = dayModel ? dayModel.IsChecked : false;
    });

    showModal('subjectModal');
};

document.getElementById('saveSubjectBtn').onclick = () => {
    let subject;

    // Serialize days
    const daysArr = [];
    const checkboxes = el.daysContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        daysArr.push({
            Name: cb.dataset.day,
            IsChecked: cb.checked
        });
    });

    if (editingSubjectUid) {
        // Edit
        subject = userProfile.Subjects.find(s => s._uid === editingSubjectUid);
        if (subject) {
            subject.Name = el.subjNameInput.value;
            subject.ClassName = el.subjClassInput.value;
            subject.StartDate = el.subjStartInput.value ? new Date(el.subjStartInput.value).toISOString() : null;
            subject.EndDate = el.subjEndInput.value ? new Date(el.subjEndInput.value).toISOString() : null;
            subject.DaysOfWeek = daysArr;
        }
    } else {
        // Add
        const newId = (userProfile.Subjects && userProfile.Subjects.length > 0) ? Math.max(...userProfile.Subjects.map(s => s.Id || 0)) + 1 : 1;
        const newUid = generateUid('sub');
        subject = {
            Name: el.subjNameInput.value || "Новый предмет",
            Id: newId,
            _uid: newUid,
            ClassName: el.subjClassInput.value,
            IsComplete: false,
            StartDate: el.subjStartInput.value ? new Date(el.subjStartInput.value).toISOString() : new Date().toISOString(),
            EndDate: el.subjEndInput.value ? new Date(el.subjEndInput.value).toISOString() : new Date().toISOString(),
            DaysOfWeek: daysArr,
            Topics: [],
            ShownTopics: [],
            Sections: []
        };
        if (!userProfile.Subjects) userProfile.Subjects = [];
        userProfile.Subjects.push(subject);
        activeSubjectUid = newUid;
    }

    saveToLocal();
    hideModal('subjectModal');
    renderSidebar();
    renderMainArea();
};

document.getElementById('deleteSubjectBtn').onclick = () => {
    if (confirm("Вы уверены, что хотите удалить этот предмет? Это действие необратимо.")) {
        userProfile.Subjects = userProfile.Subjects.filter(s => s._uid !== activeSubjectUid);
        activeSubjectUid = null;
        saveToLocal();
        renderSidebar();
        renderMainArea();
    }
};

// ============================================
// Holidays configuration
// ============================================
const renderHolidays = () => {
    el.holidaysList.innerHTML = '';
    if (!userProfile.HolydayDates) userProfile.HolydayDates = [];

    // Sort uniquely
    const uniqueDatesSet = new Set((userProfile.HolydayDates || []).map(d => {
        try {
            return new Date(d).toISOString().split('T')[0];
        } catch (e) { return null; }
    }).filter(x => x));

    const datesStr = Array.from(uniqueDatesSet).sort();

    // Save back normalized
    userProfile.HolydayDates = datesStr;

    if (datesStr.length === 0) {
        el.holidaysList.innerHTML = '<span style="color:var(--text-muted); font-size: 0.85rem;">Нет каникул</span>';
        return;
    }

    // Group into ranges
    const ranges = [];
    let currentRange = null;

    for (let i = 0; i < datesStr.length; i++) {
        const dateObj = new Date(datesStr[i]);
        if (!currentRange) {
            currentRange = { start: dateObj, end: dateObj, startStr: datesStr[i], endStr: datesStr[i] };
            continue;
        }

        const prevDate = new Date(currentRange.end);
        prevDate.setDate(prevDate.getDate() + 1);

        if (dateObj.getTime() === prevDate.getTime()) {
            // Is consecutive
            currentRange.end = dateObj;
            currentRange.endStr = datesStr[i];
        } else {
            // End of consecutive range
            ranges.push(currentRange);
            currentRange = { start: dateObj, end: dateObj, startStr: datesStr[i], endStr: datesStr[i] };
        }
    }
    if (currentRange) ranges.push(currentRange);

    ranges.forEach(range => {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.style.background = 'rgba(239, 68, 68, 0.2)';
        badge.style.color = 'var(--danger)';
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.gap = '8px';
        badge.style.border = '1px solid rgba(239, 68, 68, 0.3)';

        const isSingleDay = range.startStr === range.endStr;
        const displayStr = isSingleDay ? formatDate(range.start) : `${formatDate(range.start)} - ${formatDate(range.end)}`;

        badge.innerHTML = `
            <span style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="editHolidayRange('${range.startStr}', '${range.endStr}')" title="Нажмите, чтобы изменить">
               <i class="ph ph-calendar-x"></i> 
               <span style="text-decoration: underline dotted rgba(239, 68, 68, 0.5);">${displayStr}</span>
            </span>
            <i class="ph ph-x" style="cursor: pointer; font-size: 1rem; padding:2px;" onclick="removeHolidayRange('${range.startStr}', '${range.endStr}')" title="Удалить"></i>
        `;
        el.holidaysList.appendChild(badge);
    });
};

window.editHolidayRange = (startStr, endStr) => {
    el.holidayStartInput.value = startStr;
    el.holidayEndInput.value = endStr;
};

window.removeHolidayRange = (startStr, endStr) => {
    const start = new Date(startStr);
    const end = new Date(endStr);

    // Filter out all dates within this range
    userProfile.HolydayDates = userProfile.HolydayDates.filter(dStr => {
        const d = new Date(dStr);
        return d < start || d > end;
    });

    saveToLocal();
    renderHolidays();
};

document.getElementById('addHolidayBtn').onclick = () => {
    const startVal = document.getElementById('holidayStartInput').value;
    const endVal = document.getElementById('holidayEndInput').value;
    if (!startVal) return;

    if (!userProfile.HolydayDates) userProfile.HolydayDates = [];

    const startDate = new Date(startVal);
    // If no end date, set end date equal to start date
    const endDate = endVal ? new Date(endVal) : new Date(startDate);

    // Normalize dates to prevent infinite loops if end < start
    if (endDate < startDate) return;

    let currentDate = new Date(startDate);
    let addedAny = false;

    while (currentDate <= endDate) {
        const iso = currentDate.toISOString();
        const isoShort = iso.split('T')[0];

        // Prevent dups
        const exists = userProfile.HolydayDates.find(d => d.split('T')[0] === isoShort);
        if (!exists) {
            userProfile.HolydayDates.push(iso);
            addedAny = true;
        }

        // Increment day by 1
        currentDate.setDate(currentDate.getDate() + 1);
    }

    if (addedAny) {
        saveToLocal();
        renderHolidays();
        document.getElementById('holidayStartInput').value = '';
        document.getElementById('holidayEndInput').value = '';
    }
};

window.removeHoliday = (isoDate) => {
    userProfile.HolydayDates = userProfile.HolydayDates.filter(d => d !== isoDate);
    saveToLocal();
    renderHolidays();
};


// ============================================
// Auto Distribution (Распределить даты)
// ============================================
document.getElementById('autoDateBtn').onclick = () => {
    if (!activeSubjectUid) return;
    const subject = userProfile.Subjects.find(s => s._uid === activeSubjectUid);
    if (!subject) return;

    if (!confirm("Внимание! При авто-распределении дат текущие выданные даты будут перезаписаны начиная с первой (с учетом каникул и дней недели). Продолжить?")) {
        return;
    }

    const mapDays = {
        "воскресенье": 0, "понедельник": 1, "вторник": 2,
        "среда": 3, "четверг": 4, "пятница": 5, "суббота": 6
    };

    let activeDays = [];
    if (subject.DaysOfWeek) {
        subject.DaysOfWeek.forEach(d => {
            if (d.IsChecked) activeDays.push(mapDays[d.Name]);
        });
    }

    if (activeDays.length === 0) {
        alert("Пожалуйста, выберите дни недели в настройках предмета (Редактировать предмет)");
        return;
    }

    const start = new Date(subject.StartDate);
    const end = new Date(subject.EndDate);
    const holidays = (userProfile.HolydayDates || []).map(d => d.split('T')[0]);

    const topics = subject.ShownTopics || [];
    // Important: we apply dates sequentially purely by topics array order
    let current = new Date(start);
    let assignedCount = 0;

    for (let i = 0; i < topics.length; i++) {
        let foundDate = false;

        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            const dow = current.getDay();

            // Check if day is active AND not a holiday
            if (activeDays.includes(dow) && !holidays.includes(dateStr)) {
                topics[i].Date = current.toISOString();
                current.setDate(current.getDate() + 1); // step forward for the next iteration
                foundDate = true;
                assignedCount++;
                break;
            }
            // Step forward
            current.setDate(current.getDate() + 1);
        }

        if (!foundDate) {
            topics[i].Date = null;
        }
    }

    saveToLocal();
    renderMainArea();

    if (assignedCount < topics.length) {
        alert(`Не хватило учебных дней для ${topics.length - assignedCount} тем. Продлите окончание или добавьте больше дней.`);
    } else {
        alert(`Даты успешно распределены для ${assignedCount} тем!`);
    }
};

// ============================================
// Paste from Excel
// ============================================
document.getElementById('pasteExcelBtn').onclick = () => {
    el.excelPasteArea.value = '';
    showModal('pasteExcelModal');
};

document.getElementById('savePasteExcelBtn').onclick = () => {
    const text = el.excelPasteArea.value;
    if (!text || text.trim() === '') {
        hideModal('pasteExcelModal');
        return;
    }

    const subject = userProfile.Subjects.find(s => s._uid === activeSubjectUid);
    if (!subject) return;

    if (!subject.ShownTopics) subject.ShownTopics = [];

    let baseId = subject.ShownTopics.length > 0 ? Math.max(...subject.ShownTopics.map(t => t.Id || 0)) + 1 : 1;
    const lines = text.split('\n');

    let lastSection = "";
    let added = 0;

    lines.forEach(line => {
        // Skip truly empty lines
        if (!line.trim()) return;

        // Split by Tab WITHOUT trimming the whole line first to preserve leading tabs!
        let parts = line.split('\t').map(p => p.trim());
        let section = "", name = "", hw = "";

        const hasSection = document.getElementById('colSectionCb')?.checked ?? true;
        const hasTopic = document.getElementById('colTopicCb')?.checked ?? true;
        const hasHw = document.getElementById('colHwCb')?.checked ?? true;

        let colIndex = 0;

        // Process Section
        if (hasSection) {
            if (parts.length > colIndex && parts[colIndex] !== "") {
                section = parts[colIndex];
                lastSection = section; // update inheritance
            } else {
                section = lastSection;
            }
            colIndex++;
        } else {
            section = lastSection;
        }

        // Process Topic
        if (hasTopic) {
            name = parts.length > colIndex ? parts[colIndex] : "";
            colIndex++;
        }

        // Process Homework
        if (hasHw) {
            hw = parts.length > colIndex ? parts[colIndex] : "";
            colIndex++;
        }

        // Skip adding a topic if there's no name and no homework 
        // (this usually means it's just a section header row or empty cells)
        if (!name && !hw) {
            return;
        }

        subject.ShownTopics.push({
            Id: baseId++,
            _uid: generateUid('top'),
            Date: null,
            Name: name || 'Без названия',
            HomeWork: hw,
            AdditionalInfo: "",
            Link: "",
            IsActive: false,
            IsComplete: false,
            IsSelected: false,
            Section: section,
            IsVisible: true,
            IsVisibleLink: false
        });
        added++;
    });

    saveToLocal();
    hideModal('pasteExcelModal');
    renderMainArea();
    alert(`Добавлено ${added} тем.`);
};


// ============================================
// CRUD Single Topic
// ============================================
document.getElementById('addTopicBtn').onclick = () => {
    const subject = userProfile.Subjects.find(s => s._uid === activeSubjectUid);
    if (!subject) return;

    editingTopicUid = null;
    document.getElementById('topicModalTitle').innerText = 'Добавить тему';

    const newId = (subject.ShownTopics && subject.ShownTopics.length > 0)
        ? Math.max(...subject.ShownTopics.map(t => t.Id || 0)) + 1
        : 1;

    el.topicIdInput.value = newId;
    el.topicDateInput.value = '';
    el.topicNameInput.value = '';
    el.topicHwInput.value = '';
    el.topicLinkInput.value = '';
    el.topicSectionInput.value = '';

    showModal('topicModal');
};

window.editTopic = (uid) => {
    const subject = userProfile.Subjects.find(s => s._uid === activeSubjectUid);
    if (!subject) return;

    const topic = subject.ShownTopics.find(t => t._uid === uid);
    if (!topic) return;

    editingTopicUid = uid;
    document.getElementById('topicModalTitle').innerText = 'Редактировать тему';

    el.topicIdInput.value = topic.Id;
    el.topicDateInput.value = formatDateForInput(topic.Date);
    el.topicNameInput.value = topic.Name;
    el.topicHwInput.value = topic.HomeWork;
    el.topicLinkInput.value = topic.Link;
    el.topicSectionInput.value = topic.Section || '';

    showModal('topicModal');
};

document.getElementById('saveTopicBtn').onclick = () => {
    const subject = userProfile.Subjects.find(s => s._uid === activeSubjectUid);
    if (!subject) return;

    if (!subject.ShownTopics) subject.ShownTopics = [];

    if (editingTopicUid) {
        // Edit 
        const topic = subject.ShownTopics.find(t => t._uid === editingTopicUid);
        if (topic) {
            topic.Id = parseInt(el.topicIdInput.value) || topic.Id;
            const newDate = el.topicDateInput.value ? new Date(el.topicDateInput.value) : null;
            topic.Date = newDate ? newDate.toISOString() : null;
            topic.DateString = newDate ? newDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
            topic.Name = el.topicNameInput.value;
            topic.HomeWork = el.topicHwInput.value;
            topic.Link = el.topicLinkInput.value;
            topic.IsVisibleLink = !!el.topicLinkInput.value;
            topic.Section = el.topicSectionInput.value;
        }
    } else {
        // Add
        const newDateObj = el.topicDateInput.value ? new Date(el.topicDateInput.value) : null;
        const newTopic = {
            Id: parseInt(el.topicIdInput.value) || 1,
            _uid: generateUid('top'),
            Date: newDateObj ? newDateObj.toISOString() : null,
            DateString: newDateObj ? newDateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
            Name: el.topicNameInput.value || 'Новая тема',
            HomeWork: el.topicHwInput.value,
            AdditionalInfo: '',
            Link: el.topicLinkInput.value,
            IsActive: false,
            IsComplete: false,
            IsSelected: false,
            Section: el.topicSectionInput.value,
            IsVisible: true,
            IsVisibleLink: !!el.topicLinkInput.value
        };
        subject.ShownTopics.push(newTopic);
    }

    saveToLocal();
    hideModal('topicModal');
    renderMainArea();
};

window.deleteTopic = (uid) => {
    if (confirm("Вы уверены, что хотите удалить тему?")) {
        const subject = userProfile.Subjects.find(s => s._uid === activeSubjectUid);
        if (subject && subject.ShownTopics) {
            subject.ShownTopics = subject.ShownTopics.filter(t => t._uid !== uid);
            saveToLocal();
            renderMainArea();
        }
    }
};

window.copyHw = (btn) => {
    const text = btn.dataset.hw;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = 'ph ph-check';
            icon.style.color = 'var(--accent-primary)';
            setTimeout(() => {
                icon.className = 'ph ph-copy';
                icon.style.color = '';
            }, 1500);
        }
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
};

// ============================================
// Modals and JSON I/O
// ============================================
document.getElementById('closeSubjectModal').onclick = () => hideModal('subjectModal');
document.getElementById('cancelSubjectModal').onclick = () => hideModal('subjectModal');
document.getElementById('closeTopicModal').onclick = () => hideModal('topicModal');
document.getElementById('cancelTopicModal').onclick = () => hideModal('topicModal');
document.getElementById('closeHolidaysModal').onclick = () => hideModal('holidaysModal');
document.getElementById('doneHolidaysBtn').onclick = () => hideModal('holidaysModal');
document.getElementById('closePasteExcelModal').onclick = () => hideModal('pasteExcelModal');
document.getElementById('cancelPasteExcelModal').onclick = () => hideModal('pasteExcelModal');

// Upload JSON
document.getElementById('loadJsonInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (data && Array.isArray(data.Subjects)) {
                userProfile = data;
                if (!userProfile.HolydayDates) userProfile.HolydayDates = [];

                // Flatten sections
                userProfile.Subjects.forEach(s => {
                    if (s.Sections && s.Sections.length > 0) {
                        let allTopics = [];
                        s.Sections.forEach(sec => {
                            if (sec.ShownTopics) {
                                sec.ShownTopics.forEach(t => {
                                    t.Section = sec.Name; // inherit section name
                                    allTopics.push(t);
                                });
                            }
                        });
                        s.ShownTopics = allTopics;
                    }
                });

                ensureUids(); // Regenerate UIDs for new imported data
                saveToLocal();
                alert('Данные успешно загружены!');
                activeSubjectUid = userProfile.Subjects.length > 0 ? userProfile.Subjects[0]._uid : null;
                renderSidebar();
                renderMainArea();
            } else {
                alert('Неверный формат JSON файла!');
            }
        } catch (err) {
            alert('Ошибка чтения JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = null; // reset
});

// Download JSON
document.getElementById('saveJsonBtn').onclick = () => {
    // Reconstruct Sections and Topics for C# App compatibility
    userProfile.Subjects.forEach(s => {
        if (s.ShownTopics) {
            const secMap = new Map();
            s.ShownTopics.forEach(t => {
                const secName = t.Section || "Без раздела";
                if (!secMap.has(secName)) secMap.set(secName, []);
                secMap.get(secName).push(t);
            });

            s.Sections = [];
            let secId = 1;
            secMap.forEach((topics, name) => {
                s.Sections.push({
                    Id: secId++,
                    Name: name,
                    Topics: [...topics],
                    ShownTopics: [...topics]
                });
            });

            s.Topics = [...s.ShownTopics];
        }
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userProfile, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "ktp.json");
    dlAnchorElem.click();
    dlAnchorElem.remove();
};

// Mobile Navigation
document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarOverlay')?.classList.add('show');
});

document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('show');
});

// Start
init();
