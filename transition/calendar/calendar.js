// ============================================
// 银壶编年史 - 日历逻辑
// ============================================

const calendarModal = document.getElementById('calendarModal');
const closeCalendar = document.getElementById('closeCalendar');
const calendarMain = document.getElementById('calendarMain');
const editorPanel = document.getElementById('editorPanel');
const annalsPanel = document.getElementById('annalsPanel');
const chronicleContainer = document.querySelector('.chronicle-container');
const chronicleTitle = document.getElementById('chronicleTitle');

const compactCalendar = window.matchMedia('(max-width: 767px)');
let mobilePanel = 'calendar';
function showMobilePanel(panel) {
    mobilePanel = panel === 'editor' && !selectedDate ? 'calendar' : panel;
    if (chronicleContainer) chronicleContainer.dataset.mobilePanel = mobilePanel;
}
if (chronicleContainer) chronicleContainer.dataset.mobilePanel = mobilePanel;

// Only switch views; keep editor DOM, selection and draft alive across resizing.
if (chronicleContainer) {
    let swipe = null;
    let suppressClickUntil = 0;
    chronicleContainer.addEventListener('pointerdown', event => {
        if (!compactCalendar.matches || event.pointerType !== 'touch' || !event.isPrimary ||
            chronicleContainer.classList.contains('journal-mode') ||
            event.target.closest('button, a, input, textarea, .forge-text, .annals-list, .chronicle-timeline, .journal-index')) return;
        swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    chronicleContainer.addEventListener('pointerup', event => {
        if (!swipe || event.pointerId !== swipe.id) return;
        const dx = event.clientX - swipe.x;
        const dy = event.clientY - swipe.y;
        swipe = null;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const panels = selectedDate ? ['calendar', 'editor', 'annals'] : ['calendar', 'annals'];
        const index = panels.indexOf(mobilePanel);
        showMobilePanel(panels[(index + (dx < 0 ? 1 : -1) + panels.length) % panels.length]);
        suppressClickUntil = performance.now() + 400;
    });
    chronicleContainer.addEventListener('pointercancel', () => { swipe = null; });
    chronicleContainer.addEventListener('click', event => {
        if (performance.now() < suppressClickUntil) {
            event.preventDefault(); event.stopImmediatePropagation();
        }
    }, true);
}

let currentDate = new Date();
let selectedDate = null;
let notes = {};
const noteRecords = new Map();
let calendarSyncPromise = null;

function formatIsoDate(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function mapAnniversaryRecord(row) {
    const [year, month, day] = row.event_date.split('-').map(Number);
    return {
        _id: row.id,
        _version: row.version,
        date: row.event_date,
        dateStr: `${year}年${month}月${day}日`,
        title: row.title,
        desc: row.description
    };
}

function handleSharedError(error) {
    console.error('BlackDoor shared calendar error:', error);
    const message = error?.code === 'VERSION_CONFLICT'
        ? '这条内容已被其他访客修改，已重新载入共享版本。'
        : (error?.message || '共享数据保存失败，请稍后重试。');
    window.alert(message);
    if (error?.code === 'VERSION_CONFLICT') syncSharedCalendar({ allowImport: false });
}

async function syncSharedCalendar({ allowImport = true } = {}) {
    if (calendarSyncPromise) return calendarSyncPromise;
    calendarSyncPromise = (async () => {
        const api = await window.BlackDoorReady;
        if (allowImport && api.legacyCalendar.pending()) {
            const legacy = api.legacyCalendar.read();
            const total = legacy.dayNotes.length + legacy.anniversaries.length + legacy.journals.length;
            if (window.confirm(`检测到 ${total} 条本地日历数据，是否导入共享空间？原本地数据会保留。`)) {
                const result = await api.legacyCalendar.import();
                if (result.failed) {
                    window.alert(`已导入 ${result.imported} 条，${result.failed} 条失败；本地数据仍然保留。`);
                }
            }
        }

        const data = await api.calendar.loadAll();
        notes = {};
        noteRecords.clear();
        data.dayNotes.forEach(row => {
            notes[row.note_date] = row.content;
            noteRecords.set(row.note_date, row);
        });

        annals = data.anniversaries.map(mapAnniversaryRecord);
        journalNotes = {};
        journalRecords.clear();
        data.journals.forEach(row => {
            journalNotes[row.period_key] = row.content;
            journalRecords.set(row.period_key, row);
        });

        renderCalendar();
        renderAnnals();
        renderTimeline();
        if (isJournalOpen()) renderJournal();
    })().catch(handleSharedError).finally(() => {
        calendarSyncPromise = null;
    });
    return calendarSyncPromise;
}

// ============================================
// 关闭弹窗
// ============================================
function closeCalendarModal(force = false) {
    if (!force && requestJournalExit(() => closeCalendarModal(true))) return;
    calendarModal.classList.remove('active');
    closeEditor();
    closeJournalView(false);
    showMobilePanel('calendar');
}

function closeEditor() {
    stopWeaver();
    if (editorPanel) {
        editorPanel.classList.remove('active');
        editorPanel.classList.add('collapsed');
    }
    if (forgePanel) forgePanel.classList.remove('visible', 'silvered');
    if (typewriterEl) typewriterEl.classList.remove('ready');
    setForgeText('');
    document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('active'));
    selectedDate = null;
    if (mobilePanel === 'editor') showMobilePanel('calendar');
}

// ============================================
// 事件绑定
// ============================================
if (closeCalendar) {
    closeCalendar.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeCalendarModal();
    });
}

if (calendarModal) {
    calendarModal.addEventListener('click', (e) => {
        if (e.target === calendarModal) {
            closeCalendarModal();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && calendarModal && calendarModal.classList.contains('active')) {
        if (isJournalGuardOpen()) {
            hideJournalExitGuard();
            return;
        }
        closeCalendarModal();
    }
});

// ============================================
// 月份导航
// ============================================
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');

if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
        closeEditor();
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
        closeEditor();
    });
}

// ============================================
// 渲染日历
// ============================================
function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const currentMonthEl = document.getElementById('currentMonth');
    if (currentMonthEl) {
        currentMonthEl.textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
    }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const grid = document.getElementById('daysGrid');
    if (!grid) return;
  
    grid.innerHTML = '';

    // 上月日期
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        grid.appendChild(createDayCell(day, true));
        
    }

    // 当月日期
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = year === today.getFullYear() && 
                       month === today.getMonth() && 
                       day === today.getDate();
        
        const dateKey = formatIsoDate(year, month + 1, day);
        const hasNote = notes[dateKey] && notes[dateKey].trim() !== '';
        
        // 检查是否是纪念日
        const anniversary = annals.find(a => {
            const d = new Date(a.date);
            return d.getMonth() === month && d.getDate() === day;
        });
        grid.appendChild(createDayCell(day, false, isToday, hasNote, dateKey, anniversary));
    }

    // 下月日期
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
        grid.appendChild(createDayCell(day, true));
    }
}

// ============================================
// 创建日期格子
// ============================================
function createDayCell(day, isOtherMonth, isToday = false, hasNote = false, dateKey = null, anniversary = null) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (isOtherMonth) cell.classList.add('other-month');
    if (isToday) cell.classList.add('today');
    if (hasNote) cell.classList.add('has-note');
    if (anniversary) cell.classList.add('anniversary');
    if (dateKey) cell.dataset.dateKey = dateKey;
    
    const numberEl = document.createElement('div');
    numberEl.className = 'day-number';
    numberEl.textContent = day;
    cell.appendChild(numberEl);

    if (hasNote && dateKey) {
        const preview = notes[dateKey].substring(0, 16);
        const previewEl = document.createElement('div');
        previewEl.className = 'day-note-preview';
        previewEl.textContent = `${preview}${notes[dateKey].length > 16 ? '...' : ''}`;
        cell.appendChild(previewEl);
    }

    // 纪念日标记
    if (anniversary && !isOtherMonth) {
        const markEl = document.createElement('div');
        markEl.className = 'day-anniversary-mark';
        markEl.title = anniversary.title;
        markEl.textContent = '◆';
        cell.appendChild(markEl);
    }

    if (!isOtherMonth && dateKey) {
        cell.addEventListener('click', () => openEditor(dateKey, day, cell));
    }
    
    return cell;
}

// ============================================
// 打开编辑器
// ============================================
function openEditor(dateKey, day, cellElement) {
    selectedDate = dateKey;
    showMobilePanel('editor');
    
    if (editorPanel) {
        editorPanel.classList.remove('collapsed');
        editorPanel.classList.add('active');
    }

    document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.trace-svg').forEach(s => s.remove());
    playTrace(cellElement);
    
    setForgeText(notes[dateKey] || '');
    startWeaver();
}
// ============================================
// 点击描边动画：红线绕一圈后变紫色选中态
// ============================================
function playTrace(cell) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'trace-svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', '1');
    rect.setAttribute('y', '1');
    rect.setAttribute('width', '98');
    rect.setAttribute('height', '98');
    rect.setAttribute('pathLength', '100');
    svg.appendChild(rect);
    cell.appendChild(svg);
    rect.addEventListener('animationend', () => {
        svg.remove();
        cell.classList.add('active');
    });
}

// ============================================
// 保存笔记
// ============================================
const saveNoteBtn = document.getElementById('saveNote');
const cancelEditBtn = document.getElementById('cancelEdit');
if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', async () => {
        if (!selectedDate) return;
        saveNoteBtn.disabled = true;
        const content = weaver.text;   // 保留原文（含开头空格），只用 trim 判空
        const existing = noteRecords.get(selectedDate);

        try {
            const api = await window.BlackDoorReady;
            if (content.trim()) {
                const saved = await api.calendar.saveDayNote({
                    id: existing?.id,
                    noteDate: selectedDate,
                    content,
                    version: existing?.version
                });
                notes[selectedDate] = saved.content;
                noteRecords.set(selectedDate, saved);
            } else if (existing) {
                await api.calendar.softDeleteDayNote({ id: existing.id, version: existing.version });
                delete notes[selectedDate];
                noteRecords.delete(selectedDate);
            }
            renderCalendar();
        } catch (error) {
            handleSharedError(error);
        } finally {
            saveNoteBtn.disabled = false;
        }
    });
}
if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', closeEditor);
}

// ============================================
// 渲染纪念日列表
// ============================================
function renderAnnals() {
    const listEl = document.getElementById('annalsList');
    const countEl = document.getElementById('annalsCount');
    if (!listEl) return;
    
    // 距离下一个周年还有多少天（今年的周年已过则算明年的）
    const daysToNext = (a) => {
        const d = new Date(a.date);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
        if (next < today) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
        return Math.round((next - today) / (1000 * 60 * 60 * 24));
    };
    const sorted = [...annals].sort((a, b) => daysToNext(a) - daysToNext(b));
    
    listEl.innerHTML = '';
    sorted.forEach(a => {
        const item = document.createElement('div');
        item.className = 'annal-item';
        
        const header = document.createElement('div');
        header.className = 'annal-item-header';
        
        const dateEl = document.createElement('div');
        dateEl.className = 'annal-date';
        dateEl.textContent = a.dateStr;
        
        const titleEl = document.createElement('div');
        titleEl.className = 'annal-title';
        titleEl.textContent = a.title;
        
        const descEl = document.createElement('div');
        descEl.className = 'annal-desc';
        descEl.textContent = a.desc;
        
        const daysEl = document.createElement('div');
        daysEl.className = 'annal-days';
        const diffDays = Math.floor((new Date(new Date().toDateString()) - new Date(a.date)) / (1000 * 60 * 60 * 24));
        daysEl.textContent = `距今 ${diffDays} 天`;
        
        header.appendChild(dateEl);
        header.appendChild(titleEl);
        item.appendChild(header);
        item.appendChild(descEl);
        item.appendChild(daysEl);
        
        let clickTimer = null;
        item.title = '双击编辑';
        item.addEventListener('click', () => {
            if (clickTimer !== null) {
                clearTimeout(clickTimer);
                clickTimer = null;
                editingIndex = annals.indexOf(a);
                annalDateInput.value = a.date;
                annalNameInput.value = a.title;
                annalDescInput.value = a.desc;
                annalStoreBtn.textContent = 'Save';
                annalsPanelEl.classList.add('editing');
                return;
            }
            clickTimer = setTimeout(() => {
            clickTimer = null;
            if (!item.isConnected || !calendarModal.classList.contains('active')) return;
            // 再次点击同一个纪念日：跳回当前日期
            if (item.classList.contains('active')) {
                item.classList.remove('active');
                currentDate = new Date();
                renderCalendar();
                setTimeout(() => {
                    document.querySelectorAll('.day-cell').forEach(c => {
                        if (c.classList.contains('today')) c.click();
                    });
                }, 100);
                return;
            }

            // 跳转到纪念日：先清除其他条目的选中态
            document.querySelectorAll('.annal-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const [y, m, d] = a.date.split('-').map(Number);
            currentDate = new Date(y, m - 1, 1);
            renderCalendar();
            setTimeout(() => {
                const cells = document.querySelectorAll('.day-cell');
                cells.forEach(c => {
                    const dayNum = c.querySelector('.day-number');
                    if (dayNum && parseInt(dayNum.textContent) === d && !c.classList.contains('other-month')) {
                        c.click();
                    }
                });
            }, 100);
            }, 350);
        });
        
        listEl.appendChild(item);
    });
    
    if (countEl) countEl.textContent = `${annals.length} 个纪念日`;
}



// ============================================
// 纪念日共享数据
// ============================================
let annals = [];

// ============================================
// 渲染时间轴：事件按日期间距真实分布 + 绳子波浪
// ============================================
const TL_PX_PER_DAY = 3.2;   // 时间密度：每一天占多少像素，调大拉得更开
const TL_MIN_GAP = 110;      // 相邻事件最小水平间距(px)，防止日期太近时文字相撞
const TL_PAD = 90;           // 两端留白

// 三种绳结，交错使用（viewBox 均为 0 0 56 28，结心在 27,14 附近）
const TL_KNOTS = [
    // Ⅰ 不对称蝴蝶结：左侧两个交叠的大小圈，右侧一个圈 + 一根散绳头
    `<g class="knot-sway">
        <path class="knot-loop" d="M27 14 C20 3 7 3 6 9.5 C5 16 18 19 27 14"/>
        <path class="knot-loop" d="M27 14 C22 7 12 7 11.5 11.5 C11 16 20 17.5 27 14"/>
        <path class="knot-loop" d="M27 14 C33 5 43 5 44 10 C45 15 35 18 27 14"/>
        <path class="knot-loop" d="M27 14 C31 19 36 22 42 21.5 C46 21.2 49 19.3 50.5 16.5"/>
        <ellipse class="knot-core" cx="27" cy="14" rx="3.6" ry="2.8"/>
    </g>`,
    // Ⅱ 双钱结：上下两个反向环在结心相压，两根绳头一上一下分开
    `<g class="knot-sway">
        <path class="knot-loop" d="M28 14 C23 4 10 3 8.5 9 C7 15 20 18 28 14"/>
        <path class="knot-loop" d="M28 14 C33 24 46 25 47.5 19 C49 13 36 10 28 14"/>
        <path class="knot-loop" d="M28 14 C24 18.5 18 21.5 12 21"/>
        <path class="knot-loop" d="M28 14 C32 9.5 38 6.5 44 7"/>
        <ellipse class="knot-core" cx="28" cy="14" rx="3.2" ry="3.2"/>
    </g>`,
    // Ⅲ 单环卷尾结：右侧一个大环，左侧两根绳头一卷一垂
    `<g class="knot-sway">
        <path class="knot-loop" d="M27 14 C33 3 46 3 47 9.5 C48 16 35 19 27 14"/>
        <path class="knot-loop" d="M27 14 C22 9.5 17 7.5 12.5 8.5 C8.8 9.3 7 11.8 7.6 14.3 C8.1 16.3 10.5 17 12 15.8"/>
        <path class="knot-loop" d="M27 14 C23 18.5 17.5 21.5 12 21"/>
        <ellipse class="knot-core" cx="27" cy="14" rx="3.4" ry="2.9"/>
    </g>`
];

function renderTimeline() {
    const container = document.getElementById('timelineEvents');
    if (!container) return;

    container.innerHTML = '';

    const now = new Date();
    const events = [...annals].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!events.length) return;

    // ---- 按日期计算横向位置（时间越远，离得越远） ----
    const DAY = 86400000;
    const t0 = new Date(events[0].date).getTime();
    const xs = events.map(e => Math.round((new Date(e.date) - t0) / DAY * TL_PX_PER_DAY));
    for (let i = 1; i < xs.length; i++) {           // 日期太近时撑开最小间距
        if (xs[i] - xs[i - 1] < TL_MIN_GAP) xs[i] = xs[i - 1] + TL_MIN_GAP;
    }
    const totalW = xs[xs.length - 1] + TL_PAD * 2;

    const inner = document.createElement('div');
    inner.className = 'timeline-inner';
    inner.style.width = totalW + 'px';

    // ---- 绳子：一整条可变形的 SVG 路径（hover 时掀起波浪） ----
    inner.innerHTML = `
        <svg class="timeline-rope" width="${totalW}" height="100%"
             viewBox="0 0 ${totalW} 100" preserveAspectRatio="none">
            <path class="rope-path" d="M0 50 L${totalW} 50"/>
        </svg>
    `;

    // ---- 事件：绝对定位在各自的日期刻度上，三种绳结交错 ----
    events.forEach((item, i) => {
        const date = new Date(item.date);
        const isNear = Math.abs(now - date) < (1000 * 60 * 60 * 24 * 30); // 30天内

        const el = document.createElement('div');
        el.className = 'timeline-event';
        el.style.left = (xs[i] + TL_PAD) + 'px';
        el.dataset.ropeX = xs[i] + TL_PAD;

        const dotClass = item.type === 'gold' ? 'gold' : (isNear ? 'active' : '');

        el.innerHTML = `
            <svg class="timeline-knot ${dotClass}" viewBox="0 0 56 28" xmlns="http://www.w3.org/2000/svg">
                ${TL_KNOTS[i % TL_KNOTS.length]}
            </svg>
            <div class="timeline-date">${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}</div>
            <div class="timeline-label">${item.title}</div>
        `;

        inner.appendChild(el);
    });

    container.appendChild(inner);
    setupRopeWobble(inner, container);

    // 初始显示最新时间：滚动条拉到最右端
    requestAnimationFrame(() => {
        container.scrollLeft = container.scrollWidth;
    });
}

// ---- 绳子波浪：悬停在绳子任意位置，绳面在指针处掀起大浪，绳结随浪起伏 ----
function setupRopeWobble(inner, container) {
    const path = inner.querySelector('.rope-path');
    if (!path) return;
    const W = parseFloat(inner.style.width);
    const knots = [...inner.querySelectorAll('.timeline-event')].map(el => ({
        x: parseFloat(el.dataset.ropeX),
        svg: el.querySelector('.timeline-knot')
    }));

    let target = null;   // 指针在绳上的 x 坐标
    let amp = 0;         // 当前振幅（缓动趋近目标，移开后自然平息）
    let phase = 0;
    let raf = null;

    const AMP_MAX = 15;   // 最大振幅（viewBox 单位，越大浪越高）
    const SIGMA = 120;    // 波包宽度，越大波及范围越广
    const WAVE_K = 20;    // 波长系数，越小波越疏

    // 波面上 x 处的纵向偏移
    const waveY = (x, x0) =>
        amp * Math.exp(-((x - x0) * (x - x0)) / (2 * SIGMA * SIGMA)) * Math.sin((x - x0) / WAVE_K - phase);

    function draw() {
        if (target === null && amp < 0.2) {   // 完全平息：回到直线、结归位
            path.setAttribute('d', `M0 50 L${W} 50`);
            knots.forEach(k => { k.svg.style.transform = ''; });
            raf = null;
            return;
        }
        phase += 0.28;
        amp += ((target !== null ? AMP_MAX : 0) - amp) * 0.1;
        const x0 = target || 0;

        let d = 'M0 50';
        for (let x = 10; x <= W; x += 8) {
            d += ` L${x} ${(50 + waveY(x, x0)).toFixed(1)}`;
        }
        path.setAttribute('d', d);

        // 绳结跟着所在位置的波面一起上下
        const pxPerUnit = inner.clientHeight / 100;
        knots.forEach(k => {
            const dy = waveY(k.x, x0) * pxPerUnit;
            k.svg.style.transform = `translate(-50%, -50%) translateY(${dy.toFixed(1)}px)`;
        });

        raf = requestAnimationFrame(draw);
    }

    // 悬停绳子任意位置都起浪（坐标要算上横向滚动）
    inner.addEventListener('mousemove', (e) => {
        const r = inner.getBoundingClientRect();
        target = e.clientX - r.left;
        if (!raf) raf = requestAnimationFrame(draw);
    });
    inner.addEventListener('mouseleave', () => { target = null; });
}

// ============================================
// 初始化
// ============================================
syncSharedCalendar();

// 脚本仅在首次点击日历图标时动态加载；加载完成后立即显示弹窗。
if (calendarModal && !calendarModal.classList.contains('active')) {
    requestAnimationFrame(() => calendarModal.classList.add('active'));
}

// 弹窗打开时把时间轴滚到最新
// （初次 renderTimeline 时弹窗还是 display:none，scrollWidth 为 0，直接滚会失效）
if (calendarModal) {
    new MutationObserver(() => {
        if (calendarModal.classList.contains('active')) {
            const c = document.getElementById('timelineEvents');
            if (c) requestAnimationFrame(() => { c.scrollLeft = c.scrollWidth; });
        }
    }).observe(calendarModal, { attributes: true, attributeFilter: ['class'] });
}

// ============================================
// 红线织机：金属面板银化 → 打字机镌刻
// ============================================
const weaverStage = document.getElementById('weaverStage');
const weaverCanvas = document.getElementById('weaverCanvas');
const weaverCtx = weaverCanvas ? weaverCanvas.getContext('2d') : null;
const forgePanel = document.getElementById('forgePanel');
const forgeText = document.getElementById('forgeText');
const typewriterEl = document.getElementById('typewriter');
const twCapture = document.getElementById('twCapture');

const WEAVER_DUR = { forge: 650 };   // 银化时长(ms)，可调  // 银化时长(ms)，可调

const weaver = {
    phase: 'idle',
    t0: 0,
    lastT: 0,
    typeThreads: [],
    text: '',
    caret: 0,   // 光标位置（字符下标）
    raf: null
};

let imeComposing = false;

// ---- 打字机键盘 ----
const TW_ROWS = [
    ['q','w','e','r','t','y','u','i','o','p','？'],
    ['a','s','d','f','g','h','j','k','l','！'],
    ['z','x','c','v','b','n','m','，','。','⌫']
];
const twKeyMap = {};

function buildTypewriter() {
    if (!typewriterEl) return;
    TW_ROWS.forEach(row => {
        const rowEl = document.createElement('div');
        rowEl.className = 'tw-row';
        row.forEach(label => {
            const key = document.createElement('button');
            key.className = 'tw-key';
            key.textContent = label;
            key.addEventListener('click', () => {
                if (weaver.phase !== 'ready') return;
                flashKey(key);
                if (label === '⌫') {
                    if (weaver.caret > 0) {
                        weaver.text = weaver.text.slice(0, weaver.caret - 1) + weaver.text.slice(weaver.caret);
                        weaver.caret--;
                    }
                    syncCapture();
                    renderForgeText();
                }
                else {
                    typeChar(label, key);
                }
                refocusCapture();
            });
            twKeyMap[label] = key;
            rowEl.appendChild(key);
        });
        typewriterEl.appendChild(rowEl);
    });
}

function typeChar(ch, keyEl) {
    weaver.text = weaver.text.slice(0, weaver.caret) + ch + weaver.text.slice(weaver.caret);
    weaver.caret++;
    syncCapture();
    renderForgeText();
    spawnTypeThread(keyEl);
}

function flashKey(key) {
    key.classList.add('pressed');
    setTimeout(() => key.classList.remove('pressed'), 140);
}

function refocusCapture() {
    if (twCapture) twCapture.focus({ preventScroll: true });
}

function syncCapture() {
    if (!twCapture || imeComposing) return;  // 组词中禁止回写，否则会打断输入法
    if (twCapture.value !== weaver.text) twCapture.value = weaver.text;
    twCapture.setSelectionRange(weaver.caret, weaver.caret);
}

// ---- 镌刻文字 ----
function renderForgeText() {
    if (!forgeText) return;
    forgeText.innerHTML = '';
    const caretPos = Math.max(0, Math.min(weaver.caret, weaver.text.length));
    let caretEl = null;
    for (let i = 0; i < weaver.text.length; i++) {
        if (i === caretPos) {
            caretEl = document.createElement('span');
            caretEl.className = 'forge-caret';
            forgeText.appendChild(caretEl);
        }
        const span = document.createElement('span');
        span.textContent = weaver.text[i];
        forgeText.appendChild(span);
    }
    if (!caretEl) {  // 光标在末尾
        caretEl = document.createElement('span');
        caretEl.className = 'forge-caret';
        forgeText.appendChild(caretEl);
    }
        // 隐藏输入框跟随光标：输入法候选框会出现在字条旁边
    if (twCapture && caretEl) {
        const cRect = caretEl.getBoundingClientRect();
        const pRect = twCapture.offsetParent ? twCapture.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
        twCapture.style.left = (cRect.left - pRect.left) + 'px';
        twCapture.style.top = (cRect.top - pRect.top) + 'px';
    }
    mechScrollToCaret(caretEl);
}

function setForgeText(str) {
    weaver.text = str || '';
    weaver.caret = weaver.text.length;  // 默认光标在末尾
    syncCapture();
    renderForgeText();
}

function spawnTypeThread(keyEl) {
    if (!weaverCanvas || !forgeText) return;
    const cRect = weaverCanvas.getBoundingClientRect();  // 画布实际显示位置
    let x1, y1;
    // 找不到对应按键时，取键盘第一排中间键作为牵引起点
    if (!keyEl && typewriterEl) {
        const keys = typewriterEl.querySelectorAll('.tw-key');
        if (keys.length) keyEl = keys[Math.floor(keys.length / 2)];
    }
    if (keyEl) {
        const k = keyEl.getBoundingClientRect();
        x1 = k.left + k.width / 2 - cRect.left;   // 按钮上边缘中点（画布坐标系）
        y1 = k.top - 2 - cRect.top;
    } else {
        x1 = cRect.width / 2;
        y1 = cRect.height;
    }
    const last = forgeText.lastElementChild;
    let x2 = cRect.width / 2, y2 = cRect.height / 2;
    if (last) {
        const s = last.getBoundingClientRect();
        x2 = s.left + s.width / 2 - cRect.left;
        y2 = s.top + s.height / 2 - cRect.top;
    }
    weaver.typeThreads.push({ x1, y1, x2, y2, life: 1 });
}

// ---- 画布与流程控制 ----
function resizeWeaverCanvas() {
    if (!weaverCanvas) return;
    const r = weaverCanvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (weaverCanvas.width !== w || weaverCanvas.height !== h) {
        weaverCanvas.width = w;
        weaverCanvas.height = h;
    }
}

function startWeaver() {
    if (!weaverCanvas || !forgePanel) return;
    stopWeaver();
    resizeWeaverCanvas();
    forgePanel.classList.remove('visible', 'silvered');
    if (typewriterEl) typewriterEl.classList.remove('ready');
    weaver.phase = 'forge';
    weaver.t0 = performance.now();
    weaver.lastT = weaver.t0;
    weaver.typeThreads = [];
    void forgePanel.offsetWidth;  // 强制重绘，保证银化动画每次都重播
    forgePanel.classList.add('visible');
    forgePanel.classList.add('silvered');
    weaver.raf = requestAnimationFrame(weaverFrame);
}

function stopWeaver() {
    if (weaver.raf) cancelAnimationFrame(weaver.raf);
    weaver.raf = null;
    weaver.phase = 'idle';
    if (weaverCtx && weaverCanvas) weaverCtx.clearRect(0, 0, weaverCanvas.width, weaverCanvas.height);
}

function weaverFrame(now) {
    resizeWeaverCanvas();
    const dt = Math.min(0.05, (now - weaver.lastT) / 1000);
    weaver.lastT = now;
    const elapsed = now - weaver.t0;
    const ctx = weaverCtx;
    ctx.clearRect(0, 0, weaverCanvas.width, weaverCanvas.height);
    const stageRect = weaverStage.getBoundingClientRect();

    // 银化完成后出打字机和小鱼
    if (weaver.phase === 'forge' && elapsed > WEAVER_DUR.forge) {
        weaver.phase = 'ready';
        typewriterEl.classList.add('ready');
        if (!window.matchMedia('(pointer: coarse)').matches) refocusCapture();
    }

    // 打字牵引红线
    drawTypeThreads(dt);

    // 小鱼
    weaver.excitement = (weaver.excitement || 0) * Math.pow(0.95, dt * 60);
    weaver.raf = requestAnimationFrame(weaverFrame);
}

function drawTypeThreads(dt) {
    const ctx = weaverCtx;
    for (let i = weaver.typeThreads.length - 1; i >= 0; i--) {
        const t = weaver.typeThreads[i];
        t.life -= dt * 0.45;  // 红线停留时间，改小这个数字 = 停留更久
        if (t.life <= 0) { weaver.typeThreads.splice(i, 1); continue; }
        const ctrlX = (t.x1 + t.x2) / 2;
        const ctrlY = Math.min(t.y1, t.y2) - 30 - (1 - t.life) * 20;
        ctx.strokeStyle = `rgba(167, 27, 32, ${t.life * 0.85})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.quadraticCurveTo(ctrlX, ctrlY, t.x2, t.y2);
        ctx.stroke();
    }
}

if (twCapture) {
    twCapture.addEventListener('compositionstart', () => { imeComposing = true; });
    twCapture.addEventListener('compositionend', () => { imeComposing = false; });

    // 中文组词中：每按一个拼音字母，就从对应字母键牵线到光标
    twCapture.addEventListener('keydown', (e) => {
        if (weaver.phase !== 'ready') return;
        const isImeKey = imeComposing || e.key === 'Process';
        if (!isImeKey) return;
        if (e.code && e.code.startsWith('Key')) {
            const keyEl = twKeyMap[e.code.slice(3).toLowerCase()];
            if (keyEl) {
                flashKey(keyEl);
                spawnTypeThread(keyEl);
            }
        }
    });

    twCapture.addEventListener('input', (e) => {
        if (weaver.phase !== 'ready') return;

        // 输入框的值永远是唯一真相：组词时拼音直接上板，上屏后自动变成汉字
        const oldLen = weaver.text.length;
        weaver.text = twCapture.value;
        weaver.caret = twCapture.selectionStart;
        renderForgeText();

        // 组词过程中不牵线（拼音字母的线由上面的 keydown 负责）
        if (!e.isComposing && weaver.text.length > oldLen) {
            const ch = weaver.text[weaver.caret - 1];
            const keyEl = (ch && twKeyMap[ch]) ? twKeyMap[ch] : null;
            if (keyEl) flashKey(keyEl);
            spawnTypeThread(keyEl);
        }
    });

    twCapture.addEventListener('keyup', () => {
        if (weaver.phase !== 'ready' || imeComposing) return;
        if (twCapture.selectionStart !== weaver.caret) {
            weaver.caret = twCapture.selectionStart;
            renderForgeText();
        }
    });
}

if (weaverStage) {
    weaverStage.addEventListener('click', () => {
        if (weaver.phase === 'ready') refocusCapture();
    });
}

buildTypewriter();

// ---- 字条滚动：打满自动上卷 + 可上下拖动 ----
// 机械感卷动：让光标进入视野
function mechScrollToCaret(caretEl) {
    if (!forgeText || !caretEl) return;
    const viewTop = forgeText.scrollTop;
    const viewBottom = viewTop + forgeText.clientHeight;
    const cTop = caretEl.offsetTop;
    const cBottom = cTop + caretEl.offsetHeight;
    let target = null;
    if (cBottom > viewBottom) target = cBottom - forgeText.clientHeight + 8;
    else if (cTop < viewTop) target = Math.max(0, cTop - 8);
    if (target === null) return;
    const start = forgeText.scrollTop;
    const dist = target - start;
    if (dist === 0) return;
    const steps = Math.min(10, Math.max(3, Math.round(Math.abs(dist) / 8)));
    let i = 0;
    const tick = () => {
        i++;
        forgeText.scrollTop = start + dist * (i / steps);
        if (i < steps) setTimeout(tick, 24);
    };
    setTimeout(tick, 24);
}

if (forgeText) {
    let dragY = null, dragMoved = 0;
    forgeText.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return; // Native vertical scrolling on phones.
        dragY = e.clientY;
        dragMoved = 0;
        forgeText.classList.add('dragging');
        forgeText.setPointerCapture(e.pointerId);
    });
    forgeText.addEventListener('pointermove', (e) => {
        if (dragY === null) return;
        const dy = e.clientY - dragY;
        dragMoved += Math.abs(dy);
        forgeText.scrollTop -= dy;
        dragY = e.clientY;
    });
    const endDrag = (e) => {
        if (dragY !== null && dragMoved < 3) {
            // 视为点击：光标放到点中的那个字后面
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (el && el.parentNode === forgeText && !el.classList.contains('forge-caret')) {
                let count = 0, found = -1;
                for (const child of forgeText.children) {
                    if (child === el) { found = count + 1; break; }
                    if (!child.classList.contains('forge-caret')) count++;
                }
                if (found >= 0) {
                    weaver.caret = found;
                    syncCapture();
                    renderForgeText();
                    refocusCapture();
                }
            }
        }
        dragY = null;
        forgeText.classList.remove('dragging');
    };
    ['pointerup', 'pointercancel'].forEach(ev => forgeText.addEventListener(ev, endDrag));

    forgeText.addEventListener('wheel', (e) => {
        e.preventDefault();
        forgeText.scrollTop += e.deltaY;
    }, { passive: false });
}

// ============================================
// 新增纪念日面板
// ============================================
const annalsPanelEl = document.getElementById('annalsPanel');
const addAnnalBtn = document.getElementById('addAnnal');
const annalDateInput = document.getElementById('annalDateInput');
const annalNameInput = document.getElementById('annalNameInput');
const annalDescInput = document.getElementById('annalDescInput');
const annalStoreBtn = document.getElementById('annalStore');
let editingIndex = null;

if (addAnnalBtn) {
    addAnnalBtn.addEventListener('click', () => {
        annalsPanelEl.classList.toggle('editing');
        if (annalsPanelEl.classList.contains('editing')) {
            annalDateInput.value = '';
            annalNameInput.value = '';
            annalDescInput.value = '';
            annalDateInput.focus();
        }
        editingIndex = null;
        annalStoreBtn.textContent = 'Store';
    });
}

if (annalStoreBtn) {
    annalStoreBtn.addEventListener('click', async () => {
        // 手动输入的日期：兼容 2026.7.25 / 2026-07-25 / 2026/7/25
        const raw = annalDateInput.value.trim().replace(/[./年月]/g, '-').replace(/日/g, '');
        const parts = raw.split('-').map(Number);
        const title = annalNameInput.value.trim();
        const desc = annalDescInput.value.trim();
        
        const valid = parts.length === 3 && parts.every(n => !isNaN(n) && n > 0)
                   && parts[0] >= 1900 && parts[0] <= 2100
                   && parts[1] >= 1 && parts[1] <= 12
                   && parts[2] >= 1 && parts[2] <= 31;
        
        if (!valid || !title) {
            annalsPanelEl.style.transform = 'translateX(-3px)';  // 格式不对或缺名字：顿一下提示
            setTimeout(() => { annalsPanelEl.style.transform = ''; }, 120);
            return;
        }
        const [y, m, d] = parts;
        const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const existing = editingIndex !== null ? annals[editingIndex] : null;
        annalStoreBtn.disabled = true;
        try {
            const api = await window.BlackDoorReady;
            const saved = await api.calendar.saveAnniversary({
                id: existing?._id,
                eventDate: date,
                title,
                description: desc,
                version: existing?._version
            });
            const entry = mapAnniversaryRecord(saved);
            if (editingIndex !== null) annals[editingIndex] = entry;
            else annals.push(entry);

            editingIndex = null;
            annalStoreBtn.textContent = 'Store';
            annals.sort((a, b) => a.date.localeCompare(b.date));
            annalsPanelEl.classList.remove('editing');
            renderAnnals();
            renderTimeline();
        } catch (error) {
            handleSharedError(error);
        } finally {
            annalStoreBtn.disabled = false;
        }
    });
}

// ============================================
// 时间轴：悬停两侧自动滚动
// ============================================
(function () {
    const panel = document.querySelector('.chronicle-timeline');
    const track = document.querySelector('.timeline-events');
    if (!panel || !track) {
        console.warn('timeline hover scroll: 未找到 .chronicle-timeline 或 .timeline-events');
        return;
    }

    const ZONE = 0.18;     // 两侧各 18% 为触发区
    const MAX_SPEED = 15;   // 每帧最大滚动像素
    let dir = 0, speed = 0, raf = null;

    const step = () => {
        track.scrollLeft += dir * speed;
        if (dir !== 0) {
            raf = requestAnimationFrame(step);
        } else {
            raf = null;
        }
    };

    panel.addEventListener('mousemove', (e) => {
        const r = panel.getBoundingClientRect();
        const p = (e.clientX - r.left) / r.width;
        if (p < ZONE) {
            dir = -1;
            speed = Math.max(1, MAX_SPEED * (1 - p / ZONE));
        } else if (p > 1 - ZONE) {
            dir = 1;
            speed = Math.max(1, MAX_SPEED * (1 - (1 - p) / ZONE));
        } else {
            dir = 0;
        }
        if (dir !== 0 && raf === null) raf = requestAnimationFrame(step);
    });

    panel.addEventListener('mouseleave', () => { dir = 0; });
})();

// ============================================
// 红线手记：独立存储（redlineJournal），与日历格子完全解耦
// ============================================
let journalNotes = {};
const journalRecords = new Map();

const journalToggleBtn = document.getElementById('journalToggle');
const journalPanel = document.getElementById('journalPanel');
const journalMain = document.getElementById('journalMain');
const journalList = document.getElementById('journalList');
const journalIndex = document.getElementById('journalIndex');
const journalSummary = document.getElementById('journalSummary');
const journalStatus = document.getElementById('journalStatus');
const journalNewBtn = document.getElementById('journalNew');
const journalNewPanel = document.getElementById('journalNewPanel');
const journalNewDate = document.getElementById('journalNewDate');
const journalNewText = document.getElementById('journalNewText');
const journalNewCancel = document.getElementById('journalNewCancel');
const journalNewAdd = document.getElementById('journalNewAdd');
const journalFormMessage = document.getElementById('journalFormMessage');

let journalScrollFrame = null;
let journalFlashTimer = null;

// 顶部关闭逻辑仍引用这几个守卫函数；手记改为即存即改后不再需要，保留空实现
function requestJournalExit() { return false; }
function isJournalGuardOpen() { return false; }
function hideJournalExitGuard() {}

function isJournalOpen() {
    return Boolean(journalPanel && journalPanel.classList.contains('active'));
}

// ---- 日期解析：手记使用独立键格式 YYYY-MM-DD（补零）；区间手记为 YYYY-MM-DD~YYYY-MM-DD ----
function parseJournalDay(year, month, day) {
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
    const maxDay = new Date(year, month, 0).getDate();
    if (day > maxDay) return null;
    return {
        year, month, day,
        key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
}

function parseJournalStorageKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:~(\d{4})-(\d{2})-(\d{2}))?$/.exec(key);
    if (!match) return null;
    const start = parseJournalDay(Number(match[1]), Number(match[2]), Number(match[3]));
    if (!start) return null;
    if (!match[4]) return { ...start, endKey: null };
    const end = parseJournalDay(Number(match[4]), Number(match[5]), Number(match[6]));
    if (!end || end.key <= start.key) return null;
    return { ...start, endKey: end.key };
}

// 解析单侧日期；结束端可省略年份（8.10）或年月（10），由 fallback 补齐
function parseJournalDateSide(raw, fallback) {
    const normalized = raw.trim()
        .replace(/[./年月]/g, '-')
        .replace(/日/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    if (!normalized) return null;
    const parts = normalized.split('-');
    if (parts.some(part => !/^\d+$/.test(part))) return null;
    let year, month, day;
    if (parts.length === 3) {
        [year, month, day] = parts.map(Number);
    } else if (parts.length === 2 && fallback) {
        year = fallback.year;
        [month, day] = parts.map(Number);
    } else if (parts.length === 1 && fallback) {
        year = fallback.year;
        month = fallback.month;
        day = Number(parts[0]);
    } else {
        return null;
    }
    return parseJournalDay(year, month, day);
}

function parseJournalDateInput(raw) {
    const sides = raw.split(/[~～–—至到]/);
    if (sides.length > 2) return null;
    if (sides.length === 2) {
        const start = parseJournalDateSide(sides[0], null);
        if (!start) return null;
        const end = parseJournalDateSide(sides[1], start);
        if (!end) return null;
        if (start.key === end.key) return { ...start, endKey: null };   // 起止同一天：按单日存
        return start.key < end.key
            ? { ...start, endKey: end.key }
            : { ...end, endKey: start.key };                            // 写反了自动交换
    }
    const single = parseJournalDateSide(raw, null);
    return single ? { ...single, endKey: null } : null;
}

function formatJournalDateKey(key) {
    const parsed = parseJournalStorageKey(key);
    if (!parsed) return key;
    const pad = n => String(n).padStart(2, '0');
    const startStr = `${parsed.year}.${pad(parsed.month)}.${pad(parsed.day)}`;
    if (!parsed.endKey) return startStr;
    const end = parseJournalStorageKey(parsed.endKey);
    const endStr = end.year === parsed.year
        ? `${pad(end.month)}.${pad(end.day)}`                              // 同年省略年份
        : `${end.year}.${pad(end.month)}.${pad(end.day)}`;
    return `${startStr} ~ ${endStr}`;
}

function getJournalKeys() {
    return Object.keys(journalNotes)
        .filter(key => typeof journalNotes[key] === 'string' && journalNotes[key].trim() !== '')
        .sort((a, b) => b.localeCompare(a));  // ISO 键可直接按字典序倒排（新→旧）
}

function autoGrowJournalText(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
}

function findJournalEntry(key) {
    if (!journalList) return null;
    return [...journalList.querySelectorAll('.journal-entry')]
        .find(entry => entry.dataset.noteKey === key) || null;
}

function scrollJournalToKey(key, focusEditor = false) {
    const entry = findJournalEntry(key);
    if (!entry) return;
    entry.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focusEditor) {
        const textarea = entry.querySelector('.journal-text');
        if (textarea) setTimeout(() => textarea.focus({ preventScroll: true }), 320);
    }
}

function setJournalFlash(message, isError = false) {
    if (!journalStatus) return;
    if (journalFlashTimer) clearTimeout(journalFlashTimer);
    journalStatus.textContent = message;
    journalStatus.classList.toggle('dirty', isError);
    journalFlashTimer = setTimeout(updateJournalState, 2600);
}

// ---- Store 按钮：只提交这一篇 ----
function createJournalStoreButton(key, entry, textarea) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'journal-store btn-primary';
    button.textContent = 'Store';
    button.disabled = true;
    button.setAttribute('aria-label', `保存 ${formatJournalDateKey(key)} 的手记`);

    button.addEventListener('click', async () => {
        const content = textarea.value;   // 保留原文（含开头空格），只用 trim 判空
        if (!content.trim()) {
            setJournalFlash('正文不能为空；如需移除请使用 Delete', true);
            entry.classList.add('invalid');
            setTimeout(() => entry.classList.remove('invalid'), 900);
            textarea.focus();
            return;
        }
        button.disabled = true;
        try {
            const record = journalRecords.get(key);
            const parsed = parseJournalStorageKey(key);
            const api = await window.BlackDoorReady;
            const saved = await api.calendar.saveJournal({
                id: record?.id,
                periodKey: key,
                startDate: parsed.key,
                endDate: parsed.endKey,
                content,
                version: record?.version
            });
            journalNotes[key] = saved.content;
            journalRecords.set(key, saved);
            entry.classList.remove('dirty');
            setJournalFlash('Stored');
        } catch (error) {
            button.disabled = false;
            handleSharedError(error);
        }
    });
    return button;
}

// ---- Delete 按钮：两次点击确认，立即移除这一篇 ----
function createJournalDeleteButton(key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'journal-delete btn-ghost';
    button.textContent = 'Delete';
    button.setAttribute('aria-label', `删除 ${formatJournalDateKey(key)} 的手记`);
    let confirming = false;
    let resetTimer = null;

    button.addEventListener('click', async () => {
        if (!confirming) {
            confirming = true;
            button.classList.add('confirming');
            button.textContent = 'Confirm';
            resetTimer = setTimeout(() => {
                confirming = false;
                button.classList.remove('confirming');
                button.textContent = 'Delete';
            }, 4000);
            return;
        }

        if (resetTimer) clearTimeout(resetTimer);
        button.disabled = true;
        try {
            const record = journalRecords.get(key);
            if (record) {
                const api = await window.BlackDoorReady;
                await api.calendar.softDeleteJournal({ id: record.id, version: record.version });
            }
            delete journalNotes[key];
            journalRecords.delete(key);
            renderJournal();
            setJournalFlash('Deleted');
        } catch (error) {
            button.disabled = false;
            handleSharedError(error);
        }
    });
    return button;
}

function createJournalEntry(key) {
    const entry = document.createElement('article');
    entry.className = 'journal-entry';
    entry.dataset.noteKey = key;

    const head = document.createElement('div');
    head.className = 'journal-entry-head';
    const date = document.createElement('div');
    date.className = 'journal-date';
    date.textContent = formatJournalDateKey(key);

    const textarea = document.createElement('textarea');
    textarea.className = 'journal-text';
    textarea.value = journalNotes[key] || '';
    textarea.setAttribute('aria-label', `${formatJournalDateKey(key)} 的手记正文`);

    const actions = document.createElement('div');
    actions.className = 'journal-entry-actions';
    const storeBtn = createJournalStoreButton(key, entry, textarea);
    actions.append(storeBtn, createJournalDeleteButton(key));

    head.append(date, actions);

    textarea.addEventListener('input', () => {
        const baseline = typeof journalNotes[key] === 'string' ? journalNotes[key] : '';
        const dirty = textarea.value !== baseline;
        entry.classList.toggle('dirty', dirty);
        storeBtn.disabled = !dirty;
        autoGrowJournalText(textarea);
    });

    entry.append(head, textarea);
    return entry;
}

function createJournalIndexItem(key) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'journal-index-item';
    item.dataset.noteKey = key;
    item.textContent = formatJournalDateKey(key);
    item.addEventListener('click', () => scrollJournalToKey(key, true));
    return item;
}

function renderJournal() {
    if (!journalList || !journalIndex) return;
    const oldScrollTop = journalMain ? journalMain.scrollTop : 0;
    const keys = getJournalKeys();
    journalList.innerHTML = '';
    journalIndex.innerHTML = '';

    if (!keys.length) {
        const empty = document.createElement('div');
        empty.className = 'journal-empty';
        empty.textContent = '尚无手记，从 New 写下第一篇';
        journalList.appendChild(empty);
    } else {
        keys.forEach(key => {
            journalList.appendChild(createJournalEntry(key));
            journalIndex.appendChild(createJournalIndexItem(key));
        });
        // 条目入列后再统一量高（此时已可测得真实 scrollHeight）
        journalList.querySelectorAll('.journal-text').forEach(autoGrowJournalText);
    }

    if (journalMain) journalMain.scrollTop = oldScrollTop;
    updateJournalState();
    requestAnimationFrame(syncJournalIndex);
}

function syncJournalIndex() {
    journalScrollFrame = null;
    if (!journalMain || !journalList || !journalIndex) return;
    const entries = [...journalList.querySelectorAll('.journal-entry')];
    if (!entries.length) return;
    const mainTop = journalMain.getBoundingClientRect().top + 115;
    let active = entries[0];
    let bestDistance = Infinity;
    entries.forEach(entry => {
        const distance = Math.abs(entry.getBoundingClientRect().top - mainTop);
        if (distance < bestDistance) {
            active = entry;
            bestDistance = distance;
        }
    });
    journalIndex.querySelectorAll('.journal-index-item').forEach(item => {
        item.classList.toggle('active', item.dataset.noteKey === active.dataset.noteKey);
    });
}

function updateJournalState() {
    const count = getJournalKeys().length;
    if (journalSummary) journalSummary.textContent = `${count} ${count === 1 ? 'note' : 'notes'}`;
    if (journalStatus) {
        journalStatus.textContent = 'All notes stored';
        journalStatus.classList.remove('dirty');
    }
}

function setJournalNewPanel(open, clear = false) {
    if (!journalNewPanel || !journalNewBtn) return;
    journalNewPanel.classList.toggle('open', open);
    journalNewPanel.setAttribute('aria-hidden', String(!open));
    journalNewBtn.setAttribute('aria-expanded', String(open));
    if (clear) {
        journalNewDate.value = '';
        journalNewText.value = '';
        journalFormMessage.textContent = '';
    }
    if (open) setTimeout(() => journalNewDate.focus(), 180);
}

// ---- 新增手记：立即写入独立存储，不再经过草稿 ----
async function addJournalEntry() {
    if (!journalNewDate || !journalNewText || !journalFormMessage) return;
    const parsed = parseJournalDateInput(journalNewDate.value);
    const content = journalNewText.value;   // 保留原文（含开头空格）
    if (!parsed) {
        journalFormMessage.textContent = '请输入有效日期，例如 2026.8.3 或 2026.8.3~8.10';
        journalNewDate.focus();
        return;
    }
    if (!content.trim()) {
        journalFormMessage.textContent = '正文不能为空';
        journalNewText.focus();
        return;
    }

    const storageKey = parsed.endKey ? `${parsed.key}~${parsed.endKey}` : parsed.key;
    const existing = journalRecords.get(storageKey);
    try {
        const api = await window.BlackDoorReady;
        const saved = await api.calendar.saveJournal({
            id: existing?.id,
            periodKey: storageKey,
            startDate: parsed.key,
            endDate: parsed.endKey,
            content,
            version: existing?.version
        });
        journalNotes[storageKey] = saved.content;
        journalRecords.set(storageKey, saved);
        setJournalNewPanel(false, true);
        renderJournal();
        scrollJournalToKey(storageKey, true);
        setJournalFlash(existing ? '该日期已有手记，已更新' : 'Stored');
    } catch (error) {
        handleSharedError(error);
    }
}

function openJournalView() {
    closeEditor();   // 仅收起日历编辑器，不再读取/搬运它的内容
    if (chronicleContainer) chronicleContainer.classList.add('journal-mode');
    if (journalPanel) {
        journalPanel.classList.add('active');
        journalPanel.setAttribute('aria-hidden', 'false');
    }
    if (journalToggleBtn) {
        journalToggleBtn.classList.add('journal-on');
        journalToggleBtn.setAttribute('aria-pressed', 'true');
        journalToggleBtn.setAttribute('aria-label', '返回日历');
        journalToggleBtn.title = '返回日历';
    }
    if (chronicleTitle) chronicleTitle.textContent = '红线手记';
    renderJournal();
}

function closeJournalView() {
    if (chronicleContainer) chronicleContainer.classList.remove('journal-mode');
    if (journalPanel) {
        journalPanel.classList.remove('active');
        journalPanel.setAttribute('aria-hidden', 'true');
    }
    if (journalToggleBtn) {
        journalToggleBtn.classList.remove('journal-on');
        journalToggleBtn.setAttribute('aria-pressed', 'false');
        journalToggleBtn.setAttribute('aria-label', '打开笔记集');
        journalToggleBtn.title = '打开笔记集';
    }
    if (chronicleTitle) chronicleTitle.textContent = '红线编年';
    setJournalNewPanel(false, true);
    // 不再回跳日历格子、不再恢复编辑器选中态：两边互不知晓
}

if (journalToggleBtn) {
    journalToggleBtn.addEventListener('click', () => {
        if (isJournalOpen()) closeJournalView();
        else openJournalView();
    });
}

if (journalNewBtn && journalNewPanel) {
    journalNewBtn.addEventListener('click', () => {
        setJournalNewPanel(!journalNewPanel.classList.contains('open'));
    });
}
if (journalNewCancel) journalNewCancel.addEventListener('click', () => setJournalNewPanel(false, true));
if (journalNewAdd) journalNewAdd.addEventListener('click', addJournalEntry);
if (journalNewText) {
    journalNewText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            addJournalEntry();
        }
    });
}

if (journalMain) {
    journalMain.addEventListener('scroll', () => {
        if (journalScrollFrame === null) journalScrollFrame = requestAnimationFrame(syncJournalIndex);
    }, { passive: true });
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!calendarModal?.classList.contains('active')) return;
    if (document.querySelector('.journal-entry.dirty')) return;
    syncSharedCalendar({ allowImport: false });
});

window.renderCalendar = renderCalendar;

