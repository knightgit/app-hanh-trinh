'use strict';
/* ============================================================
   HÀNH TRÌNH v7 — Fix load + Multi-stop + Weather + Toll + Views + Haptic
   ============================================================ */

/* ---------- Polyfill ---------- */
if (typeof structuredClone === 'undefined') {
    window.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

/* ============ UTILS ============ */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function toast(msg, type='success') {
    const colors = { success:'bg-emerald-500', error:'bg-appRed', info:'bg-appDark' };
    const el = document.createElement('div');
    el.className = `toast ${colors[type]} text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg mb-2`;
    el.textContent = msg;
    $('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 2600);
}

function isSafeUrl(u) {
    try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; }
    catch { return false; }
}

function parseLatLng(url) {
    if (!url) return null;
    const patterns = [
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
        /q=(-?\d+\.\d+),(-?\d+\.\d+)/,
        /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
        /destination=(-?\d+\.\d+),(-?\d+\.\d+)/,
    ];
    for (const re of patterns) {
        const m = url.match(re);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    }
    return null;
}

/* ---- Haversine distance (km) ---- */
function haversine(a, b) {
    const R = 6371;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const h = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---- Haptic feedback ---- */
function haptic(pattern = 10) {
    if (!STATE.config.haptic) return;
    if ('vibrate' in navigator) {
        try { navigator.vibrate(pattern); } catch {}
    }
}
// Wrappers cho ngữ cảnh khác nhau
const hapticTap = () => haptic(8);
const hapticSuccess = () => haptic([10, 30, 20]);
const hapticWarn = () => haptic([20, 40, 20, 40]);
const hapticDelete = () => haptic([15, 25, 15]);

/* ============ STORAGE ============ */
const Storage = {
    KEY: 'appDataV7',
    CFG: 'appConfigV7',
    load() {
        try {
            return {
                data: JSON.parse(localStorage.getItem(this.KEY) || 'null'),
                config: JSON.parse(localStorage.getItem(this.CFG) || 'null'),
            };
        } catch (e) {
            console.error('Storage load fail', e);
            return { data: null, config: null };
        }
    },
    saveImmediate(itinerary, config) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(itinerary));
            localStorage.setItem(this.CFG, JSON.stringify(config));
        } catch (e) {
            toast('Lưu thất bại: bộ nhớ đầy', 'error');
        }
    },
};

/* ============ COLOR & ICON ============ */
const COLOR_MAP = {
    indigo:  { bg:'bg-indigo-500',  light:'bg-indigo-100 text-indigo-700',   hex:'#6366F1' },
    orange:  { bg:'bg-orange-500',  light:'bg-orange-100 text-orange-700',   hex:'#F97316' },
    red:     { bg:'bg-red-500',     light:'bg-red-100 text-red-700',          hex:'#EF4444' },
    pink:    { bg:'bg-pink-500',    light:'bg-pink-100 text-pink-700',        hex:'#EC4899' },
    emerald: { bg:'bg-emerald-500', light:'bg-emerald-100 text-emerald-700', hex:'#10B981' },
    blue:    { bg:'bg-blue-500',    light:'bg-blue-100 text-blue-700',        hex:'#3B82F6' },
    amber:   { bg:'bg-amber-500',   light:'bg-amber-100 text-amber-700',     hex:'#F59E0B' },
    teal:    { bg:'bg-teal-500',    light:'bg-teal-100 text-teal-700',        hex:'#14B8A6' },
    purple:  { bg:'bg-purple-500',  light:'bg-purple-100 text-purple-700',   hex:'#A855F7' },
    slate:   { bg:'bg-slate-500',   light:'bg-slate-100 text-slate-700',     hex:'#64748B' },
};

const ICON_LIBRARY = [
    'fa-house-flag','fa-mug-hot','fa-gas-pump','fa-camera-retro','fa-mountain',
    'fa-utensils','fa-bed','fa-tree','fa-fish','fa-umbrella-beach',
    'fa-mosque','fa-church','fa-monument','fa-landmark','fa-store',
    'fa-cart-shopping','fa-shop','fa-route','fa-flag-checkered','fa-binoculars',
    'fa-water','fa-wind','fa-fire','fa-bridge','fa-tower-cell',
    'fa-circle-parking','fa-bicycle','fa-motorcycle','fa-car','fa-train',
    'fa-plane','fa-anchor','fa-tent','fa-campground','fa-leaf'
];

/* ============ STATE ============ */
const DEFAULT_CONFIG = {
    showMap: false,
    groupView: true,
    weather: true,
    haptic: true,

    tollGroup: 1,
    types: {
        start:  { name:'Vị trí',    icon:'fa-house-flag',   color:'indigo' },
        rest:   { name:'Trạm nghỉ', icon:'fa-mug-hot',      color:'orange' },
        gas:    { name:'Trạm xăng', icon:'fa-gas-pump',     color:'red' },
        scenic: { name:'Ngắm cảnh', icon:'fa-camera-retro', color:'pink' },
        pass:   { name:'Đường đèo', icon:'fa-mountain',     color:'emerald' },
    },
    routes: [
        { id:'all',     name:'Tuyến chung' },
        { id:'route_1', name:'Tuyến QL1A' },
        { id:'route_2', name:'Tuyến Cao Tốc' },
    ]
};
const DEFAULT_DATA = [
    { id:1, type:'start', route:'all',     name:'Nhà SG - Chung cư An Khang',      desc:'Điểm xuất phát · 28-30 Đường 19, An Phú, Q.2, TP.HCM · Kiểm tra xe, đổ đầy xăng', mapLink:'https://www.google.com/maps/search/?api=1&query=Chung+c%C6%B0+An+Khang+%C4%91%C6%B0%E1%BB%9Dng+19+An+Ph%C3%BA+Qu%E1%BA%ADn+2+TP+HCM' },
    { id:2, type:'rest',  route:'route_2', name:'Điểm dừng chân Xuân Anh',         desc:'Nghỉ ngơi, ăn uống dọc cao tốc / QL28B',                                             mapLink:'https://www.google.com/maps/search/?api=1&query=%C4%90i%E1%BB%83m+d%E1%BB%ABng+ch%C3%A2n+Xu%C3%A2n+Anh+B%C3%ACnh+Thu%E1%BA%ADn' },
    { id:3, type:'rest',  route:'route_2', name:'Điểm dừng chân Dốc đá',           desc:'Nghỉ ngơi trên đèo · cẩn thận xe tải',                                               mapLink:'https://www.google.com/maps/search/?api=1&query=%C4%90i%E1%BB%83m+d%E1%BB%ABng+ch%C3%A2n+D%E1%BB%91c+%C4%91%C3%A1+B%C3%ACnh+Thu%E1%BA%ADn' },
    { id:4, type:'pass',  route:'route_1', name:'Đèo Đa Mi',                       desc:'QL55 · Đa Mi, Hàm Thuận Bắc, Bình Thuận · số thấp, cẩn thận xe ngược chiều',        mapLink:'https://www.google.com/maps/@11.2971,107.8836,15z' },
    { id:5, type:'pass',  route:'route_1', name:'Đèo Gia Bắc',                     desc:'QL28 · Hàm Thuận Bắc → Di Linh · dài ~10km, cao 800m, đường hẹp 1 làn',            mapLink:'https://www.google.com/maps/@11.2862,108.1018,15z' },
    { id:6, type:'pass',  route:'route_2', name:'Đèo Đại Ninh',                    desc:'QL28B · Bắc Bình (Bình Thuận) → Đức Trọng (Lâm Đồng) · đỉnh 12km, nhiều cua gấp', mapLink:'https://www.google.com/maps/@11.5031,108.3491,15z' },
    { id:7, type:'start', route:'all',     name:'Nhà ĐL - 6 La Sơn Phu tử',        desc:'Điểm đến · Phường Xuân Hương, TP. Đà Lạt, Lâm Đồng',                               mapLink:'https://www.google.com/maps/search/?api=1&query=6+La+S%C6%A1n+Phu+T%E1%BB%AD+%C4%90%C3%A0+L%E1%BA%A1t+L%C3%A2m+%C4%90%E1%BB%93ng' },
];

const STATE = {
    config: structuredClone(DEFAULT_CONFIG),
    itinerary: structuredClone(DEFAULT_DATA),
    isEditMode: false,
    currentFilter: 'all',
    searchQuery: '',
};

function loadState() {
    const { data, config } = Storage.load();
    if (config && typeof config === 'object') {
        STATE.config = {
            ...DEFAULT_CONFIG,
            ...config,
            types: { ...DEFAULT_CONFIG.types, ...(config.types || {}) },
            routes: Array.isArray(config.routes) && config.routes.length ? config.routes : DEFAULT_CONFIG.routes,
        };
    }
    if (Array.isArray(data) && data.length) {
        STATE.itinerary = data;
    }
    STATE.currentFilter = sessionStorage.getItem('filter') || 'all';
}

const persistDebounced = debounce(() => Storage.saveImmediate(STATE.itinerary, STATE.config), 200);
function persist() { persistDebounced(); }
function persistNow() { Storage.saveImmediate(STATE.itinerary, STATE.config); }

// Flush trước khi đóng tab
window.addEventListener('beforeunload', persistNow);
window.addEventListener('pagehide', persistNow);

/* ============ WEATHER MODULE (Open-Meteo) ============ */
const Weather = {
    cache: new Map(),
    TTL: 30 * 60 * 1000,    // 30 phút

    async fetch(lat, lng) {
        const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
        const now = Date.now();
        const cached = this.cache.get(key);
        if (cached && now - cached.t < this.TTL) return cached.data;

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const j = await res.json();
            const data = {
                temp: Math.round(j.current.temperature_2m),
                code: j.current.weather_code,
                wind: Math.round(j.current.wind_speed_10m),
            };
            this.cache.set(key, { t: now, data });
            return data;
        } catch (e) { return null; }
    },

    codeToIcon(code) {
        // WMO codes simplified
        if (code === 0) return { icon:'fa-sun', label:'Nắng' };
        if (code <= 3) return { icon:'fa-cloud-sun', label:'Có mây' };
        if (code <= 48) return { icon:'fa-smog', label:'Sương mù' };
        if (code <= 67) return { icon:'fa-cloud-rain', label:'Mưa' };
        if (code <= 77) return { icon:'fa-snowflake', label:'Tuyết' };
        if (code <= 82) return { icon:'fa-cloud-showers-heavy', label:'Mưa rào' };
        if (code <= 99) return { icon:'fa-cloud-bolt', label:'Dông' };
        return { icon:'fa-cloud', label:'—' };
    },

    tempClass(t) {
        if (t >= 35) return 'hot';
        if (t >= 28) return 'warm';
        if (t < 18) return 'cold';
        return '';
    },

    async render(item) {
        if (!STATE.config.weather) return '';
        const c = parseLatLng(item.mapLink);
        if (!c) return '';
        const data = await this.fetch(c.lat, c.lng);
        if (!data) return '';
        const { icon, label } = this.codeToIcon(data.code);
        return `<span class="wx-chip ${this.tempClass(data.temp)}" title="${esc(label)} · gió ${data.wind} km/h">
            <i class="fa-solid ${icon}"></i>${data.temp}°
        </span>`;
    },

    async paint(itemId) {
        const item = STATE.itinerary.find(i => i.id === itemId);
        if (!item) return;
        const slot = document.querySelector(`[data-wx="${itemId}"]`);
        if (!slot) return;
        slot.innerHTML = await this.render(item);
    },

    async paintAll(list) {
        for (const it of list) this.paint(it.id);
    }
};

/* ============ TOLL ESTIMATOR (VN expressway) ============ */
const Toll = {
    // VND / km / PCU theo Nghị định 130/2024 (Level 1)
    rates: { 1: 1300, 2: 1950, 3: 2600, 4: 3250, 5: 5200 },
    estimate(km, group = 1) {
        const rate = this.rates[group] || this.rates[1];
        return Math.round(km * rate);
    },
    format(vnd) {
        return vnd.toLocaleString('vi-VN') + ' ₫';
    }
};

/* ============ NAV APPS (Multi-stop + deeplink) ============ */
const NavApps = {
    apps: [
        { id:'google',   name:'Google Maps', icon:'fa-solid fa-map',          color:'text-appBlue', bg:'bg-blue-100' },
        { id:'waze',     name:'Waze',         icon:'fa-solid fa-car-side',     color:'text-[#05C8C6]', bg:'bg-teal-100' },
        { id:'apple',    name:'Apple Maps',   icon:'fa-brands fa-apple',       color:'text-slate-800', bg:'bg-slate-200' },
        { id:'vietmap',  name:'Vietmap Live', icon:'fa-solid fa-location-dot', color:'text-orange-600', bg:'bg-orange-100' },
        { id:'copy',     name:'Copy tọa độ',  icon:'fa-solid fa-copy',         color:'text-slate-600', bg:'bg-slate-100' },
    ],

    // Single destination
    urlFor(app, item) {
        const c = parseLatLng(item.mapLink);
        const q = encodeURIComponent(item.name);
        switch (app) {
            case 'google':
                if (c) return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`;
                return `https://www.google.com/maps/search/?api=1&query=${q}`;
            case 'waze':
                if (c) return `https://waze.com/ul?ll=${c.lat},${c.lng}&navigate=yes`;
                return `https://waze.com/ul?q=${q}&navigate=yes`;
            case 'apple':
                if (c) return `https://maps.apple.com/?daddr=${c.lat},${c.lng}&dirflg=d`;
                return `https://maps.apple.com/?q=${q}`;
            case 'vietmap':
                // Vietmap Live không có public URL scheme; fallback mở web/Play Store kèm clipboard
                return null;
            case 'copy':
                return null;
        }
    },

    // Multi-stop URL (chỉ Google Maps support tốt)
    multiUrl(app, list) {
        const valid = list.map(i => ({ item: i, c: parseLatLng(i.mapLink) })).filter(x => x.c);
        if (valid.length < 2) return null;
        const origin = valid[0].c;
        const destination = valid[valid.length - 1].c;
        const waypoints = valid.slice(1, -1).map(x => `${x.c.lat},${x.c.lng}`).join('|');

        switch (app) {
            case 'google': {
                let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`;
                if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
                return url;
            }
            case 'apple': {
                // Apple Maps không hỗ trợ nhiều waypoint qua URL → mở từng cặp
                return `https://maps.apple.com/?saddr=${origin.lat},${origin.lng}&daddr=${destination.lat},${destination.lng}&dirflg=d`;
            }
            case 'waze': {
                // Waze cũng chỉ hỗ trợ destination cuối
                return `https://waze.com/ul?ll=${destination.lat},${destination.lng}&navigate=yes`;
            }
            case 'vietmap':
                return null;
            case 'copy':
                return null;
        }
        return null;
    },

    async open(app, item) {
        hapticTap();
        if (app === 'copy') {
            const c = parseLatLng(item.mapLink);
            const text = c ? `${c.lat},${c.lng}` : item.mapLink;
            try {
                await navigator.clipboard.writeText(text);
                toast('Đã copy tọa độ: ' + text);
            } catch { toast('Không thể copy', 'error'); }
            return;
        }
        if (app === 'vietmap') {
            const c = parseLatLng(item.mapLink);
            if (c) {
                try { await navigator.clipboard.writeText(`${c.lat},${c.lng}`); } catch {}
                toast('Đã copy tọa độ. Mở Vietmap Live...');
            }
            // Thử mở app, fallback Play Store
            const intent = `intent://maps?q=${encodeURIComponent(item.name)}#Intent;scheme=vietmap;package=vn.vietmap.live;end`;
            const isAndroid = /android/i.test(navigator.userAgent);
            const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
            if (isAndroid) {
                window.location.href = intent;
                setTimeout(() => window.open('https://play.google.com/store/apps/details?id=vn.vietmap.live','_blank'), 800);
            } else if (isIOS) {
                window.open('https://apps.apple.com/vn/app/vietmap-live/id1451715807','_blank');
            } else {
                window.open('https://vietmap.vn/vietmap-live','_blank');
            }
            return;
        }
        const url = this.urlFor(app, item);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    },

    async openMulti(app, list) {
        hapticTap();
        if (app === 'copy') {
            const coords = list.map(i => {
                const c = parseLatLng(i.mapLink);
                return c ? `${i.name}: ${c.lat},${c.lng}` : i.name;
            }).join('\n');
            try { await navigator.clipboard.writeText(coords); toast('Đã copy lộ trình'); }
            catch { toast('Không thể copy', 'error'); }
            return;
        }
        if (app === 'vietmap') {
            const last = list[list.length - 1];
            this.open('vietmap', last);
            return;
        }
        const url = this.multiUrl(app, list);
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
            // Google Maps URL chỉ hỗ trợ ~10 waypoints; nếu nhiều hơn cảnh báo
            const validCount = list.filter(i => parseLatLng(i.mapLink)).length;
            if (validCount > 10 && app === 'google') {
                toast('⚠ Google Maps chỉ hỗ trợ tối đa 10 điểm', 'info');
            }
        } else {
            toast('App này không hỗ trợ nhiều điểm', 'error');
        }
    }
};

/* ============ MODALS ============ */
const Modals = {
    closeTimer: null,
    open(sheet) {
        hapticTap();
        clearTimeout(this.closeTimer);
        $('sheet-overlay').classList.remove('hidden');
        requestAnimationFrame(() => {
            $('sheet-overlay').classList.remove('opacity-0');
            sheet.classList.remove('translate-y-full');
        });
    },
    closeAll() {
        ['location-sheet','settings-sheet','type-editor','nav-sheet'].forEach(id => $(id).classList.add('translate-y-full'));
        $('sheet-overlay').classList.add('opacity-0');
        clearTimeout(this.closeTimer);
        this.closeTimer = setTimeout(() => $('sheet-overlay').classList.add('hidden'), 300);
        document.activeElement?.blur();
    },
    closeTypeEditor() {
        $('type-editor').classList.add('translate-y-full');
    }
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') Modals.closeAll(); });

/* ============ NAV SHEET ============ */
const NavSheet = {
    currentItem: null,
    currentList: null,

    openSingle(itemId) {
        const item = STATE.itinerary.find(i => i.id === itemId);
        if (!item) return;
        this.currentItem = item;
        this.currentList = null;
        $('nav-sheet-title').textContent = 'Mở "' + item.name + '" bằng';
        $('nav-sheet-desc').textContent = 'Chọn ứng dụng điều hướng';
        $('multi-options').classList.add('hidden');
        this.renderApps(false);
        Modals.open($('nav-sheet'));
    },

    openMulti() {
        const list = UI.getFiltered();
        if (list.length < 2) { toast('Cần ít nhất 2 điểm có tọa độ', 'error'); return; }
        const withCoords = list.filter(i => parseLatLng(i.mapLink));
        if (withCoords.length < 2) { toast('Cần ít nhất 2 điểm có tọa độ', 'error'); return; }

        this.currentItem = null;
        this.currentList = withCoords;
        $('nav-sheet-title').textContent = `Đi qua ${withCoords.length} điểm`;
        $('nav-sheet-desc').textContent = 'Chọn app để mở toàn bộ lộ trình';
        $('multi-options').classList.remove('hidden');
        this.renderApps(true);
        this.updateSummary();
        $('toll-group').value = STATE.config.tollGroup;
        $('toll-group').onchange = e => {
            STATE.config.tollGroup = Number(e.target.value);
            persist();
            this.updateSummary();
        };
        Modals.open($('nav-sheet'));
    },

    renderApps(isMulti) {
        const container = $('nav-apps-container');
        container.innerHTML = NavApps.apps.map(a => {
            const disabled = isMulti && !['google','apple','waze','copy'].includes(a.id) && a.id !== 'vietmap';
            return `
            <button data-action="navOpen" data-app="${a.id}" class="nav-app-btn ${disabled ? 'opacity-40' : ''}" ${disabled ? 'disabled' : ''}>
                <div class="w-12 h-12 rounded-2xl ${a.bg} flex items-center justify-center text-xl ${a.color}">
                    <i class="${a.icon}"></i>
                </div>
                <span class="text-[11px] font-bold text-appDark text-center">${a.name}</span>
            </button>`;
        }).join('');
    },

    updateSummary() {
        const list = this.currentList || [];
        const pts = list.map(i => parseLatLng(i.mapLink)).filter(Boolean);
        let totalKm = 0;
        for (let i = 1; i < pts.length; i++) totalKm += haversine(pts[i-1], pts[i]);
        const toll = Toll.estimate(totalKm, STATE.config.tollGroup);
        $('route-summary').textContent = list.map(i => i.name).join(' → ');
        $('summary-distance').textContent = totalKm.toFixed(1) + ' km';
        $('summary-toll').textContent = '~ ' + Toll.format(toll);
    },

    handleOpen(app) {
        if (this.currentList) NavApps.openMulti(app, this.currentList);
        else if (this.currentItem) NavApps.open(app, this.currentItem);
        Modals.closeAll();
    }
};

/* ============ MINI MAPS ============ */
const MiniMaps = {
    instances: new Map(),
    init(list) {
        if (typeof L === 'undefined') return;
        this.instances.forEach(m => m.remove());
        this.instances.clear();
        list.forEach(item => {
            const el = $(`map-${item.id}`);
            if (!el) return;
            const lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            const m = L.map(el, {
                center:[lat,lng], zoom:14, zoomControl:false, attributionControl:true,
                dragging:false, scrollWheelZoom:false, doubleClickZoom:false, touchZoom:false
            });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OSM', maxZoom:18 }).addTo(m);
            L.marker([lat,lng]).addTo(m);
            this.instances.set(item.id, m);
        });
    }
};

/* ============ UI: FILTERS / TIMELINE ============ */
const UI = {
    renderFilters() {
        $('filter-container').innerHTML = STATE.config.routes.map(r => `
            <button data-action="setFilter" data-id="${esc(r.id)}" id="chip-${esc(r.id)}" role="tab"
                class="filter-chip shrink-0 px-4 py-2 rounded-full text-sm font-bold bg-white text-slate-500 border border-slate-200 transition">
                ${esc(r.name)}
            </button>`).join('');
        this.updateChips();
        $('loc-type').innerHTML = Object.entries(STATE.config.types).map(([k,v]) => `<option value="${esc(k)}">${esc(v.name)}</option>`).join('');
        $('loc-route').innerHTML = STATE.config.routes.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    },

    updateChips() {
        document.querySelectorAll('.filter-chip').forEach(b => {
            b.className = "filter-chip shrink-0 px-4 py-2 rounded-full text-sm font-bold bg-white text-slate-500 border border-slate-200 transition";
            b.setAttribute('aria-selected','false');
        });
        const a = $(`chip-${STATE.currentFilter}`);
        if (a) {
            a.className = "filter-chip shrink-0 px-4 py-2 rounded-full text-sm font-bold bg-appDark text-white shadow-md transition";
            a.setAttribute('aria-selected','true');
        }
    },

    getFiltered() {
        let list = STATE.currentFilter === 'all'
            ? STATE.itinerary
            : STATE.itinerary.filter(i => i.route === STATE.currentFilter);
        const q = STATE.searchQuery.trim().toLowerCase();
        if (q) list = list.filter(i => (i.name||'').toLowerCase().includes(q) || (i.desc||'').toLowerCase().includes(q));
        return list;
    },

    render() {
        const list = this.getFiltered();
        const empty = $('empty-state');
        const container = $('timeline-container');

        if (!list.length) {
            container.innerHTML = '';
            empty.classList.remove('hidden');
            $('empty-msg').textContent = STATE.searchQuery ? 'Không tìm thấy kết quả.' : 'Chưa có điểm dừng.';
            return;
        }
        empty.classList.add('hidden');

        container.className = 'scroll-area hide-scroll px-5 pt-5 relative';
        const grouped = STATE.currentFilter === 'all' && STATE.config.groupView && !STATE.searchQuery;
        container.innerHTML = grouped
            ? this.renderGrouped(list)
            : list.map((i, idx) => this.renderCard(i, idx === list.length - 1)).join('');

        if (STATE.config.showMap) MiniMaps.init(list);
        if (STATE.isEditMode) this.attachDrag();
        if (STATE.config.weather) Weather.paintAll(list);
    },


    renderGrouped(list) {
        const routeMap = Object.fromEntries(STATE.config.routes.map(r => [r.id, r.name]));
        const groups = {};
        list.forEach(it => { (groups[it.route] = groups[it.route] || []).push(it); });
        const order = STATE.config.routes.map(r => r.id);
        return order.filter(id => groups[id]).map(id => {
            const items = groups[id];
            return `
            <div class="mb-1 group-divider text-center text-xs font-bold text-slate-500 uppercase tracking-wider py-3">
                <span>${esc(routeMap[id] || 'Khác')}</span>
            </div>
            ${items.map((it, i) => this.renderCard(it, i === items.length - 1)).join('')}`;
        }).join('');
    },

    renderCard(item, isLast) {
        const type = STATE.config.types[item.type] || STATE.config.types[Object.keys(STATE.config.types)[0]];
        const c = COLOR_MAP[type.color] || COLOR_MAP.slate;
        const routeName = STATE.config.routes.find(r => r.id === item.route)?.name || '⚠ Đã xóa';
        const descHtml = item.desc ? `<p class="text-[13px] text-slate-500 mt-1.5 leading-relaxed whitespace-pre-wrap">${esc(item.desc)}</p>` : '';
        const coords = parseLatLng(item.mapLink);
        const mapHtml = (STATE.config.showMap && coords)
            ? `<div class="mini-map" data-lat="${coords.lat}" data-lng="${coords.lng}" id="map-${item.id}"></div>` : '';

        const actions = STATE.isEditMode
            ? `<div class="flex flex-col gap-2">
                <button data-action="openAddSheet" data-id="${item.id}" aria-label="Sửa" class="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90"><i class="fa-solid fa-pen"></i></button>
                <button data-action="deleteItem" data-id="${item.id}" aria-label="Xóa" class="w-10 h-10 rounded-full bg-red-100 text-appRed flex items-center justify-center active:scale-90"><i class="fa-solid fa-trash"></i></button>
              </div>`
            : `<div class="flex flex-col gap-2">
                <button data-action="openNav" data-id="${item.id}" aria-label="Điều hướng" class="w-10 h-10 rounded-full bg-[#E5F0FF] text-appBlue flex items-center justify-center active:scale-90"><i class="fa-solid fa-location-arrow"></i></button>
              </div>`;

        return `
        <div class="card-wrap relative pl-11 pb-5" ${STATE.isEditMode ? `draggable="true" data-id="${item.id}"` : ''}>
            ${!isLast ? '<div class="timeline-line absolute left-[19px] top-8 bottom-[-10px] w-[2px] bg-slate-200"></div>' : ''}
            <div class="timeline-dot absolute left-0 top-1 w-10 h-10 rounded-full flex items-center justify-center text-white z-10 border-4 border-appBg ${c.bg}">
                <i class="fa-solid ${esc(type.icon)} text-[12px]"></i>
            </div>
            <div class="bg-white rounded-3xl shadow-soft p-4 flex justify-between items-start gap-3 border border-slate-100/50">
                <div class="flex-1 min-w-0 pt-0.5">
                    <div class="flex gap-1.5 mb-2 flex-wrap items-center">
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${c.light}">${esc(type.name)}</span>
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500">${esc(routeName)}</span>
                        <span data-wx="${item.id}"></span>
                    </div>
                    <h3 class="text-[17px] font-bold text-appDark leading-snug break-words">${esc(item.name)}</h3>
                    ${descHtml}
                    ${mapHtml}
                </div>
                <div class="shrink-0 pt-0.5">${actions}</div>
            </div>
        </div>`;
    },

    /* Drag reorder */
    dragSrcId: null,
    attachDrag() {
        document.querySelectorAll('[draggable="true"]').forEach(el => {
            el.addEventListener('dragstart', e => {
                hapticTap();
                this.dragSrcId = Number(el.dataset.id);
                el.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
                document.querySelectorAll('.drop-target').forEach(x => x.classList.remove('drop-target'));
            });
            el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drop-target'); });
            el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
            el.addEventListener('drop', e => {
                e.preventDefault();
                const tgt = Number(el.dataset.id);
                if (this.dragSrcId && this.dragSrcId !== tgt) {
                    const s = STATE.itinerary.findIndex(i => i.id === this.dragSrcId);
                    const t = STATE.itinerary.findIndex(i => i.id === tgt);
                    if (s >= 0 && t >= 0) {
                        const [m] = STATE.itinerary.splice(s, 1);
                        STATE.itinerary.splice(t, 0, m);
                        persist(); this.render();
                        hapticSuccess();
                    }
                }
            });
        });
    }
};

/* ============ LOCATION (ADD/EDIT) ============ */
const Location = {
    lastDeleted: null,

    openSheet(id = null) {
        $('form-error').classList.add('hidden');
        $('location-form').reset();
        $('edit-id').value = '';
        $('sheet-title').textContent = id ? 'Sửa địa điểm' : 'Thêm điểm dừng';

        if (id) {
            const item = STATE.itinerary.find(i => i.id === id);
            if (item) {
                $('edit-id').value = item.id;
                $('loc-name').value = item.name;
                $('loc-link').value = item.mapLink;
                $('loc-desc').value = item.desc || '';
                $('loc-type').value = item.type;
                $('loc-route').value = item.route || 'all';
            }
        } else {
            $('loc-route').value = STATE.currentFilter !== 'all' ? STATE.currentFilter : 'all';
        }
        Modals.open($('location-sheet'));
        setTimeout(() => $('loc-link').focus(), 320);
    },

    save(e) {
        e.preventDefault();
        const name = $('loc-name').value.trim();
        const link = $('loc-link').value.trim();
        const errEl = $('form-error'), errMsg = $('form-error-msg');

        if (!name) { errMsg.textContent = 'Vui lòng nhập Tên địa điểm.'; errEl.classList.remove('hidden'); hapticWarn(); return; }
        if (!isSafeUrl(link)) { errMsg.textContent = 'Link không hợp lệ (cần http/https).'; errEl.classList.remove('hidden'); hapticWarn(); return; }

        const editId = $('edit-id').value;
        const data = {
            id: editId ? Number(editId) : Date.now(),
            name, desc: $('loc-desc').value.trim(),
            type: $('loc-type').value, route: $('loc-route').value, mapLink: link
        };
        if (editId) {
            const idx = STATE.itinerary.findIndex(i => i.id === Number(editId));
            if (idx > -1) STATE.itinerary[idx] = data;
        } else STATE.itinerary.push(data);

        persistNow();
        UI.render();
        Modals.closeAll();
        toast(editId ? 'Đã cập nhật' : 'Đã thêm điểm dừng');
        hapticSuccess();
    },

    remove(id) {
        const item = STATE.itinerary.find(i => i.id === id);
        if (!item) return;
        this.lastDeleted = { item, index: STATE.itinerary.indexOf(item) };
        STATE.itinerary = STATE.itinerary.filter(i => i.id !== id);
        persistNow();
        UI.render();
        hapticDelete();
        this.showUndo();
    },

    showUndo() {
        const el = document.createElement('div');
        el.className = 'toast bg-appDark text-white text-sm font-semibold pl-4 pr-2 py-2 rounded-full shadow-lg mb-2 flex items-center gap-3 pointer-events-auto';
        el.innerHTML = `<span>Đã xóa</span><button class="bg-appBlue px-3 py-1 rounded-full text-xs">Hoàn tác</button>`;
        el.querySelector('button').onclick = () => {
            if (this.lastDeleted) {
                STATE.itinerary.splice(this.lastDeleted.index, 0, this.lastDeleted.item);
                this.lastDeleted = null;
                persistNow(); UI.render();
                el.remove(); hapticSuccess();
            }
        };
        $('toast-container').appendChild(el);
        setTimeout(() => el.remove(), 4000);
    },

    fetchCtrl: null,
    fetchTitle: debounce(async function(url) {
        if (!isSafeUrl(url)) return;
        const loading = $('link-loading');
        const nameInp = $('loc-name');
        if (nameInp.value.trim()) return;
        Location.fetchCtrl?.abort();
        Location.fetchCtrl = new AbortController();
        loading.classList.remove('hidden');
        try {
            const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: Location.fetchCtrl.signal });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!data.contents) return;
            const doc = new DOMParser().parseFromString(data.contents, 'text/html');
            let title = doc.querySelector('meta[property="og:title"]')?.content || doc.querySelector('title')?.innerText || '';
            title = title.replace(/(\s*[-–·|]\s*Google Maps?)/gi, '').trim();
            if (title && !/google maps/i.test(title)) nameInp.value = title;
        } catch (err) {
            if (err.name !== 'AbortError') console.warn('Fetch title failed', err);
        } finally {
            loading.classList.add('hidden');
        }
    }, 600),

};

/* ============ SETTINGS ============ */
const Settings = {
    tempRoutes: [],
    tempTypes: {},

    open() {
        this.tempRoutes = structuredClone(STATE.config.routes);
        this.tempTypes = structuredClone(STATE.config.types);
        this.renderTypes();
        this.renderRoutes();
        $('cfg-show-map').checked  = !!STATE.config.showMap;
        $('cfg-group-view').checked = !!STATE.config.groupView;
        $('cfg-weather').checked   = !!STATE.config.weather;
        $('cfg-haptic').checked    = !!STATE.config.haptic;
        Modals.open($('settings-sheet'));
    },

    renderTypes() {
        $('settings-types-container').innerHTML = Object.entries(this.tempTypes).map(([k, t]) => {
            const c = COLOR_MAP[t.color] || COLOR_MAP.slate;
            return `<div class="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-100">
                <div class="w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center text-white text-sm"><i class="fa-solid ${esc(t.icon)}"></i></div>
                <div class="flex-1 text-sm font-bold text-appDark">${esc(t.name)}</div>
                <button data-action="openTypeEditor" data-key="${esc(k)}" class="w-8 h-8 text-slate-500 rounded-lg active:scale-90"><i class="fa-solid fa-pen text-xs"></i></button>
            </div>`;
        }).join('');
    },

    renderRoutes() {
        $('settings-routes-container').innerHTML = this.tempRoutes.map((r, i) => `
            <div class="flex items-center gap-2">
                <input type="text" value="${esc(r.name)}" maxlength="40" data-action="updateRoute" data-index="${i}"
                    class="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-appBlue">
                <button data-action="removeRoute" data-index="${i}" aria-label="Xóa" class="w-9 h-9 flex items-center justify-center text-red-500 bg-red-50 rounded-lg active:scale-90"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>`).join('');
    },

    save() {
        if (Object.keys(this.tempTypes).length === 0) { toast('Cần ít nhất 1 loại điểm', 'error'); hapticWarn(); return; }
        const cleaned = this.tempRoutes.filter(r => r.name.trim());
        const validRoutes = new Set(cleaned.map(r => r.id));
        const validTypes = new Set(Object.keys(this.tempTypes));
        STATE.itinerary.forEach(it => {
            if (!validRoutes.has(it.route)) it.route = 'all';
            if (!validTypes.has(it.type)) it.type = Object.keys(this.tempTypes)[0];
        });
        STATE.config.routes = cleaned;
        STATE.config.types = this.tempTypes;
        STATE.config.showMap = $('cfg-show-map').checked;
        STATE.config.groupView = $('cfg-group-view').checked;
        STATE.config.weather = $('cfg-weather').checked;
        STATE.config.haptic = $('cfg-haptic').checked;
        if (!validRoutes.has(STATE.currentFilter)) STATE.currentFilter = 'all';
        persistNow();
        UI.renderFilters(); UI.render();
        Modals.closeAll(); toast('Đã lưu cấu hình'); hapticSuccess();
    },

    addRoute() { this.tempRoutes.push({ id: 'route_' + Date.now(), name: 'Tuyến mới' }); this.renderRoutes(); hapticTap(); },
    updateRoute(i, v) { this.tempRoutes[i].name = v; },
    removeRoute(i) {
        if (this.tempRoutes.length <= 1) { toast('Cần ít nhất 1 tuyến', 'error'); return; }
        const id = this.tempRoutes[i].id;
        const used = STATE.itinerary.filter(x => x.route === id).length;
        const fallback = this.tempRoutes.find(r => r.id !== id)?.id || 'all';
        if (used > 0 && !confirm(`Tuyến có ${used} điểm. Sẽ chuyển sang tuyến khác. Tiếp tục?`)) return;
        STATE.itinerary.forEach(it => { if (it.route === id) it.route = fallback; });
        this.tempRoutes.splice(i, 1); this.renderRoutes(); hapticDelete();
    }
};

/* ============ TYPE EDITOR ============ */
const TypeEditor = {
    editingKey: null,
    pickedColor: 'blue',
    pickedIcon: 'fa-flag',

    open(key = '') {
        this.editingKey = key || null;
        const types = Settings.tempTypes;
        const data = key ? types[key] : { name:'', icon:'fa-flag', color:'blue' };
        this.pickedColor = data.color;
        this.pickedIcon = data.icon;
        $('type-editor-title').textContent = key ? 'Sửa loại điểm' : 'Thêm loại mới';
        $('type-edit-key').value = key || '';
        $('type-edit-name').value = data.name || '';
        $('type-delete-btn').classList.toggle('hidden', !key);
        this.renderColors();
        this.renderIcons();
        Modals.open($('type-editor'));
    },

    renderColors() {
        $('color-picker').innerHTML = Object.entries(COLOR_MAP).map(([k,v]) =>
            `<div class="swatch ${k === this.pickedColor ? 'active' : ''}" style="background:${v.hex}" data-action="pickColor" data-color="${k}"></div>`
        ).join('');
    },

    renderIcons() {
        $('icon-picker').innerHTML = ICON_LIBRARY.map(i =>
            `<div class="icon-cell ${i === this.pickedIcon ? 'active' : ''}" data-action="pickIcon" data-icon="${i}"><i class="fa-solid ${i}"></i></div>`
        ).join('');
    },

    pickColor(c) { this.pickedColor = c; this.renderColors(); hapticTap(); },
    pickIcon(i) { this.pickedIcon = i; this.renderIcons(); hapticTap(); },

    save() {
        const name = $('type-edit-name').value.trim();
        if (!name) { toast('Cần tên loại', 'error'); hapticWarn(); return; }
        const key = this.editingKey || ('type_' + Date.now());
        Settings.tempTypes[key] = { name, icon: this.pickedIcon, color: this.pickedColor };
        Settings.renderTypes();
        Modals.closeTypeEditor();
        hapticSuccess();
    },

    remove() {
        if (!this.editingKey) return;
        if (Object.keys(Settings.tempTypes).length <= 1) { toast('Phải còn ít nhất 1 loại', 'error'); return; }
        if (!confirm('Xóa loại này?')) return;
        delete Settings.tempTypes[this.editingKey];
        Settings.renderTypes();
        Modals.closeTypeEditor();
        hapticDelete();
    }
};


/* ============ PWA ============ */
const PWA = {
    deferredPrompt: null,
    init() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW reg fail', err));
            });
        }
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            if (!sessionStorage.getItem('install-dismissed')) $('install-banner').classList.remove('hidden');
        });
        $('install-btn').onclick = async () => {
            if (!this.deferredPrompt) return;
            this.deferredPrompt.prompt();
            await this.deferredPrompt.userChoice;
            this.deferredPrompt = null;
            $('install-banner').classList.add('hidden');
        };
        $('install-dismiss').onclick = () => {
            $('install-banner').classList.add('hidden');
            sessionStorage.setItem('install-dismissed','1');
        };
        const update = () => {
            const s = $('offline-status');
            if (navigator.onLine) s.textContent = '';
            else { s.textContent = '● Offline'; s.classList.add('text-amber-600'); }
        };
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        update();
    }
};

/* ============ EVENT DELEGATION (1 nguồn duy nhất) ============ */
function setupEvents() {
    // Search
    $('search-input').addEventListener('input', debounce(e => {
        STATE.searchQuery = e.target.value;
        UI.render();
    }, 200));

    // Link input → fetch title
    $('loc-link').addEventListener('input', e => Location.fetchTitle(e.target.value.trim()));

    // Form submit
    $('location-form').addEventListener('submit', e => Location.save(e));

    // Global click delegation
    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id ? Number(btn.dataset.id) : null;
        const key = btn.dataset.key || '';

        switch (action) {
            case 'closeModals': Modals.closeAll(); break;
            case 'closeTypeEditor': Modals.closeTypeEditor(); break;
            case 'openAddSheet': Location.openSheet(id); hapticTap(); break;
            case 'deleteItem':
                if (confirm('Xóa điểm dừng này?')) Location.remove(id);
                break;
            case 'openNav': NavSheet.openSingle(id); break;
            case 'openMultiNav': NavSheet.openMulti(); break;
            case 'navOpen': NavSheet.handleOpen(btn.dataset.app); break;
            case 'setFilter':
                STATE.currentFilter = btn.dataset.id;
                sessionStorage.setItem('filter', STATE.currentFilter);
                UI.updateChips(); UI.render(); hapticTap();
                break;
            case 'toggleEditMode': {
                STATE.isEditMode = !STATE.isEditMode;
                const b = $('toggle-edit-btn');
                b.innerHTML = STATE.isEditMode ? '<i class="fa-solid fa-check text-appBlue"></i>' : '<i class="fa-solid fa-pen-to-square"></i>';
                b.classList.toggle('bg-blue-100', STATE.isEditMode);
                UI.render(); hapticTap();
                break;
            }
            case 'toggleSearch': {
                const w = $('search-wrap');
                w.classList.toggle('hidden');
                if (!w.classList.contains('hidden')) $('search-input').focus();
                hapticTap();
                break;
            }
            case 'clearSearch':
                $('search-input').value = ''; STATE.searchQuery = ''; UI.render(); hapticTap();
                break;
            case 'openSettings': Settings.open(); hapticTap(); break;
            case 'saveSettings': Settings.save(); break;
            case 'addNewRoute': Settings.addRoute(); break;
            case 'removeRoute': Settings.removeRoute(Number(btn.dataset.index)); break;
            case 'openTypeEditor': TypeEditor.open(key); hapticTap(); break;
            case 'pickColor': TypeEditor.pickColor(btn.dataset.color); break;
            case 'pickIcon': TypeEditor.pickIcon(btn.dataset.icon); break;
            case 'saveType': TypeEditor.save(); break;
            case 'deleteType': TypeEditor.remove(); break;
        }
    });

    // Input delegation cho route name
    document.addEventListener('input', e => {
        const el = e.target.closest('[data-action="updateRoute"]');
        if (el) Settings.updateRoute(Number(el.dataset.index), el.value);
    });
}

/* ============ START ============ */
function start() {
    try {
        loadState();
        UI.renderFilters();
        UI.render();
        setupEvents();
        PWA.init();
        console.log('[Hành Trình] App loaded. Items:', STATE.itinerary.length);
    } catch (err) {
        console.error('Start error:', err);
        document.body.innerHTML = `<div style="padding:40px;text-align:center;font-family:system-ui">
            <h2>Lỗi khởi động</h2>
            <p style="color:#666">${err.message}</p>
            <button onclick="localStorage.clear();location.reload()" style="margin-top:20px;padding:12px 24px;background:#0A7AFF;color:white;border:none;border-radius:8px">Reset & Reload</button>
        </div>`;
    }
}

// Đảm bảo DOM sẵn sàng
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
