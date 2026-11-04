/* ==========================================================================
   FLYER PUSAT — MIS SENGKANG
   Mesin render berbasis <canvas> (tanpa html2canvas).
   Semua koordinat memakai "ruang desain" 400 × 500, lalu diskalakan ke
   resolusi ekspor sehingga hasil selalu tajam & posisinya identik dengan
   pratinjau.
   ========================================================================== */
(() => {
'use strict';

const W0 = 400, H0 = 500;
const $ = (id) => document.getElementById(id);

const FONT_MAIN = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_META = '"Google Sans", "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_GOLD = '"Cinzel Decorative", Georgia, serif';

/* --------------------------------------------------------------------------
   KONFIGURASI TIER (warna, template, posisi) — hasil ukur dari layout asli
   -------------------------------------------------------------------------- */
const TIER_STD = {
    key: 't1', tpl: 'template/1juz.png', bg: '#070a12',
    glow: 'rgba(0,245,160,0.15)',
    name: '#00F5A0', nameShadow: 'rgba(0,245,160,0.2)', nameFont: FONT_MAIN,
    badgeBorder: '#00F5A0', badgeBg: 'rgba(0,245,160,0.1)', badgeText: '#364115',
    h6: '#00F5A0', val: '#f8fafc',
    meta: '#ffffff', metaAlign: 'left', metaDx: 35,
};
const TIER_5 = Object.assign({}, TIER_STD, {
    key: 't5', tpl: 'template/5juz.png',
    name: '#00D9F6', nameShadow: 'rgba(0,217,246,0.2)',
    badgeBorder: '#00D9F6', badgeBg: 'rgba(0,217,246,0.1)', badgeText: '#052e3b',
    h6: '#00D9F6',
});
const TIER_GOLD = Object.assign({}, TIER_STD, {
    key: 'gold', tpl: 'template/30juz.png', bg: '#0d0d06',
    glow: 'rgba(255,215,0,0.25)',
    name: '#FFD700', nameShadow: 'rgba(255,215,0,0.3)', nameFont: FONT_GOLD,
    badgeBorder: '#FFD700', badgeBg: 'rgba(255,215,0,0.15)', badgeText: '#364115',
    h6: '#364115',
    meta: '#364115', metaAlign: 'center', metaDx: 50,
});
const TIERS = {
    'Simaan 1 Juz': TIER_STD,
    'Simaan 5 Juz': TIER_5,
    'Simaan 10 Juz': TIER_5,
    'Simaan 20 Juz': TIER_5,
    'Simaan 30 Juz': TIER_GOLD,
};

// Geometri (ruang desain 400×500) — diukur dari layout CSS asli
const GEO = {
    avatar: { x: 80, y: 37, w: 400, h: 400 },
    nameBox: { x: 100, y: 152, w: 200, h: 90, ox: 100, oy: 0,
               m: [0.6, -0.010473, 0.0524852, 0.599909, -110, 35] },
    metaBox: { x: 63.5, y: 242, w: 273, h: 50, dy: 150 },
    badgeBox: { x: 30, y: 306, w: 200, h: 80, ox: 100, oy: 0,
                m: [0.6, -0.0419561, 0.0419497, 0.599909, -20, -45] },
    total: { cx: 250, h6y: 352.5, valy: 371 },
};

const OFFSET_KEYS = [
    ['foto', 'Foto'], ['nama', 'Nama'], ['meta', 'Info (asal/ortu)'],
    ['badge', 'Badge Juz'], ['total', 'Total hafalan'],
];
const LS_KEY = 'flyerhub.offsets.v1';

/* --------------------------------------------------------------------------
   STATE
   -------------------------------------------------------------------------- */
const state = {
    mode: 'manual',
    santri: '', jenis: 'Simaan 1 Juz', detail: '', total: '',
    aiName: '', aiSantri: '', aiData: '',
    aiBg: null,           // { img, ok, name }
};
let offsets = loadOffsets();

function loadOffsets() {
    const base = {};
    OFFSET_KEYS.forEach(([k]) => base[k] = { x: 0, y: 0 });
    try {
        const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
        if (raw) OFFSET_KEYS.forEach(([k]) => {
            if (raw[k]) base[k] = { x: Number(raw[k].x) || 0, y: Number(raw[k].y) || 0 };
        });
    } catch (e) { /* storage tidak tersedia — abaikan */ }
    return base;
}
function saveOffsets() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(offsets)); } catch (e) { /* abaikan */ }
}

/* --------------------------------------------------------------------------
   UTIL
   -------------------------------------------------------------------------- */
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function findSantri(name) {
    const n = norm(name);
    if (!n || typeof DATA_SANTRI === 'undefined') return null;
    return DATA_SANTRI.find((s) => norm(s.nama) === n) || null;
}

function safeName(s) {
    return (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'flyer';
}

let toastTimer = 0;
function toast(msg, isErr = false, ms = 3800) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* --------------------------------------------------------------------------
   PEMUATAN GAMBAR (template, logo, foto)
   -------------------------------------------------------------------------- */
const imgCache = new Map();           // src -> {img, ok}
function getImg(src) {
    let e = imgCache.get(src);
    if (e) return e;
    e = { img: new Image(), ok: null };
    e.img.crossOrigin = 'anonymous';
    e.img.decoding = 'async';
    e.img.onload = () => { e.ok = true; requestRender(); };
    e.img.onerror = () => { e.ok = false; requestRender(); };
    e.img.src = src;
    imgCache.set(src, e);
    return e;
}

/* Foto Cloudinary: minta versi resolusi tinggi TANPA kompresi q_auto/f_auto
   (penyebab foto buram/artefak). Jika transformasi ditolak, jatuh ke URL asli. */
function photoCandidates(url) {
    const out = [];
    const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?:[^/]+\/)*?(v\d+\/.+)$/);
    if (m) {
        out.push(m[1] + 'c_limit,w_2000/' + m[2]);   // tajam, ukuran dibatasi
        out.push(m[1] + m[2]);                       // file asli tanpa transformasi
    }
    out.push(url);
    return [...new Set(out)];
}

const photoState = new Map();         // url -> {cands, idx, img, ok}
function getPhoto(url) {
    if (!url) return null;
    let st = photoState.get(url);
    if (!st) {
        st = { cands: photoCandidates(url), idx: 0, img: null, ok: null };
        photoState.set(url, st);
        loadPhoto(st);
    }
    return st;
}
function loadPhoto(st) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => { st.img = img; st.ok = true; requestRender(); };
    img.onerror = () => {
        st.idx++;
        if (st.idx < st.cands.length) loadPhoto(st);
        else { st.ok = false; requestRender(); }
    };
    img.src = st.cands[st.idx];
}

function activeSantri() {
    return state.mode === 'manual' ? findSantri(state.santri) : findSantri(state.aiSantri);
}
function currentTier() { return TIERS[state.jenis] || TIER_STD; }

/* Aset yang dibutuhkan flyer saat ini */
function neededAssets() {
    const list = [];
    if (state.mode === 'manual') {
        list.push({ kind: 'template', e: getImg(currentTier().tpl) });
    } else {
        list.push({ kind: 'logo', e: getImg('template/logomahad.png') });
        if (state.aiBg) list.push({ kind: 'bg', e: state.aiBg });
    }
    const s = activeSantri();
    if (s && s.foto) list.push({ kind: 'foto', e: getPhoto(s.foto) });
    return list;
}

function waitAssets(timeout = 20000) {
    const t0 = Date.now();
    return new Promise((resolve) => {
        const tick = () => {
            const pending = neededAssets().some((a) => a.e.ok === null);
            if (!pending || Date.now() - t0 > timeout) resolve();
            else setTimeout(tick, 60);
        };
        tick();
    });
}

async function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return;
    const specs = [
        '700 22px "Plus Jakarta Sans"', '600 14px "Plus Jakarta Sans"',
        '800 19px "Plus Jakarta Sans"', '400 10px "Google Sans"',
        '700 22px "Cinzel Decorative"',
    ];
    const timeout = new Promise((r) => setTimeout(r, 4000));
    try { await Promise.race([Promise.all(specs.map((f) => document.fonts.load(f, 'Aa Bb 123'))), timeout]); }
    catch (e) { /* pakai font cadangan */ }
}

/* --------------------------------------------------------------------------
   PRIMITIF GAMBAR TEKS
   -------------------------------------------------------------------------- */
function measureSp(ctx, text, sp) {
    if (!sp) return ctx.measureText(text).width;
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + sp;
    return w;                       // seperti CSS: spasi juga setelah karakter terakhir
}

function drawSp(ctx, text, x, y, sp, align) {
    ctx.textBaseline = 'middle';
    if (!sp) { ctx.textAlign = align; ctx.fillText(text, x, y); return; }
    const w = measureSp(ctx, text, sp);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textAlign = 'left';
    for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
}

function wrapText(ctx, text, maxW, sp = 0) {
    const lines = [];
    String(text).split('\n').forEach((para) => {
        const words = para.split(/\s+/).filter(Boolean);
        let cur = '';
        words.forEach((w) => {
            const t = cur ? cur + ' ' + w : w;
            if (!cur || measureSp(ctx, t, sp) <= maxW) cur = t;
            else { lines.push(cur); cur = w; }
        });
        if (cur) lines.push(cur);
    });
    return lines;
}

function drawCover(ctx, img, x, y, w, h) {
    const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/* --------------------------------------------------------------------------
   RENDER: FLYER MANUAL
   -------------------------------------------------------------------------- */
function buildMeta(s) {
    if (!s) return 'Alamat • Orang Tua • Halaqah';
    const ortu = [];
    if (s.ayah) ortu.push('Bapak ' + s.ayah);
    if (s.ibu) ortu.push('Ibu ' + s.ibu);
    const parts = [];
    if (s.alamat) parts.push('Asal: ' + s.alamat);
    if (ortu.length) parts.push('Putra dari ' + ortu.join(' & '));
    if (s.halaqah) parts.push('Halaqah: ' + s.halaqah);
    return parts.join(' • ');
}

function drawManual(ctx, s) {
    const t = currentTier();
    const santri = findSantri(state.santri);
    const displayName = santri ? santri.nama : (state.santri.trim() || 'Nama Santri');

    // 1) latar + cahaya + template
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W0, H0);
    const g = ctx.createRadialGradient(200, 150, 0, 200, 150, 403);
    g.addColorStop(0, t.glow); g.addColorStop(0.7, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W0, H0);
    const tpl = getImg(t.tpl);
    if (tpl.ok) ctx.drawImage(tpl.img, 0, 0, W0, H0);

    // 2) foto santri
    if (santri && santri.foto) {
        const p = getPhoto(santri.foto);
        if (p && p.ok) {
            const a = GEO.avatar, o = offsets.foto;
            ctx.save();
            ctx.beginPath(); ctx.rect(a.x + o.x, a.y + o.y, a.w, a.h); ctx.clip();
            drawCover(ctx, p.img, a.x + o.x, a.y + o.y, a.w, a.h);
            ctx.restore();
        }
    }

    // 3) NAMA (miring + skala, sama seperti CSS asli)
    {
        const b = GEO.nameBox, o = offsets.nama;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.translate(b.x + b.ox, b.y + b.oy);
        ctx.transform(...b.m);
        ctx.translate(-b.ox, -b.oy);
        let fs = 22.4, lines;
        for (;;) {
            ctx.font = `700 ${fs}px ${t.nameFont}`;
            lines = wrapText(ctx, displayName, b.w);
            if (lines.length * fs * 1.1 <= b.h || fs <= 12) break;
            fs -= 0.8;
        }
        const lh = fs * 1.1, top = b.h / 2 - (lines.length * lh) / 2;
        ctx.fillStyle = t.name;
        ctx.shadowColor = t.nameShadow; ctx.shadowBlur = 10 * s;
        lines.forEach((ln, i) => drawSp(ctx, ln, b.w / 2, top + lh * (i + 0.5), 0, 'center'));
        ctx.restore();
    }

    // 4) INFO (asal • orang tua • halaqah)
    {
        const b = GEO.metaBox, o = offsets.meta;
        const bx = b.x + t.metaDx + o.x, by = b.y + b.dy + o.y;
        ctx.save();
        ctx.beginPath(); ctx.rect(bx, by, b.w, b.h); ctx.clip();
        ctx.fillStyle = t.meta;
        let fs = 9.6, lines, lh;
        for (;;) {
            ctx.font = `400 ${fs}px ${FONT_META}`;
            lh = fs * 1.3;
            lines = wrapText(ctx, buildMeta(santri), b.w);
            if (lines.length * lh <= b.h + 0.5 || fs <= 7.2) break;
            fs -= 0.4;
        }
        lines.forEach((ln, i) => drawSp(ctx, ln, t.metaAlign === 'center' ? bx + b.w / 2 : bx,
            by + lh * (i + 0.5), 0, t.metaAlign));
        ctx.restore();
    }

    // 5) BADGE TIER
    {
        const b = GEO.badgeBox, o = offsets.badge;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.translate(b.x + b.ox, b.y + b.oy);
        ctx.transform(...b.m);
        ctx.translate(-b.ox, -b.oy);
        roundRectPath(ctx, 0.5, 0.5, b.w - 1, b.h - 1, 30);
        ctx.fillStyle = t.badgeBg; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = t.badgeBorder; ctx.stroke();

        ctx.font = `600 13.6px ${FONT_MAIN}`;
        ctx.fillStyle = t.badgeText;
        const sp = 1, inner = b.w - 2 - 32;
        let lines = wrapText(ctx, state.jenis.toUpperCase(), inner, sp);
        if (state.detail.trim()) lines = lines.concat(wrapText(ctx, state.detail.trim().toUpperCase(), inner, sp));
        lines = lines.slice(0, 4);
        const lh = 17, top = b.h / 2 - (lines.length * lh) / 2;
        lines.forEach((ln, i) => drawSp(ctx, ln, b.w / 2, top + lh * (i + 0.5), sp, 'center'));
        ctx.restore();
    }

    // 6) TOTAL HAFALAN
    {
        const o = offsets.total, G = GEO.total;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.font = `700 10.4px ${FONT_MAIN}`;
        ctx.fillStyle = t.h6;
        drawSp(ctx, 'TOTAL HAFALAN', G.cx, G.h6y, 1.5, 'center');

        const val = state.total.trim() || '-';
        let fs = 19.2;
        ctx.font = `700 ${fs}px ${FONT_MAIN}`;
        while (ctx.measureText(val).width > 200 && fs > 9) { fs -= 0.5; ctx.font = `700 ${fs}px ${FONT_MAIN}`; }
        ctx.fillStyle = t.val;
        drawSp(ctx, val, G.cx, G.valy, 0, 'center');
        ctx.restore();
    }
}

/* --------------------------------------------------------------------------
   RENDER: FLYER AI CUSTOM
   -------------------------------------------------------------------------- */
function drawAI(ctx, s) {
    const santri = findSantri(state.aiSantri);

    // latar
    const bg = ctx.createLinearGradient(0, 0, 0, H0);
    bg.addColorStop(0, '#111a2e'); bg.addColorStop(1, '#070a12');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W0, H0);
    if (!state.aiBg || !state.aiBg.ok) {
        const g = ctx.createRadialGradient(200, 160, 0, 200, 160, 280);
        g.addColorStop(0, 'rgba(181,23,158,0.28)'); g.addColorStop(1, 'rgba(181,23,158,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W0, H0);
    } else {
        drawCover(ctx, state.aiBg.img, 0, 0, W0, H0);
    }

    // foto (berdiri di dasar kanvas, proporsi dijaga)
    if (santri && santri.foto) {
        const p = getPhoto(santri.foto);
        if (p && p.ok) {
            const bx = 40, by = 100, bw = 320, bh = 400;
            const r = Math.min(bw / p.img.naturalWidth, bh / p.img.naturalHeight);
            const dw = p.img.naturalWidth * r, dh = p.img.naturalHeight * r;
            ctx.drawImage(p.img, bx + (bw - dw) / 2, by + bh - dh, dw, dh);
        }
    }

    // gradasi bawah agar teks terbaca
    const gb = ctx.createLinearGradient(0, 330, 0, H0);
    gb.addColorStop(0, 'rgba(7,10,18,0)'); gb.addColorStop(1, 'rgba(7,10,18,0.9)');
    ctx.fillStyle = gb; ctx.fillRect(0, 330, W0, H0 - 330);

    // judul/tema
    if (state.aiName.trim()) {
        ctx.save();
        ctx.font = `700 17px ${FONT_MAIN}`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 6 * s;
        const lines = wrapText(ctx, state.aiName.trim(), 210).slice(0, 2);
        lines.forEach((ln, i) => drawSp(ctx, ln, 200, 44 + i * 22, 0, 'center'));
        ctx.restore();
    }

    // nama + info santri
    const nm = santri ? santri.nama : state.aiSantri.trim();
    if (nm) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6 * s;
        let fs = 20; ctx.font = `700 ${fs}px ${FONT_MAIN}`;
        while (ctx.measureText(nm).width > 360 && fs > 11) { fs -= 0.5; ctx.font = `700 ${fs}px ${FONT_MAIN}`; }
        ctx.fillStyle = '#ffffff';
        drawSp(ctx, nm, 200, 430, 0, 'center');
        if (santri) {
            ctx.font = `400 9.6px ${FONT_META}`;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            const info = [santri.halaqah && 'Halaqah ' + santri.halaqah, santri.alamat].filter(Boolean).join(' • ');
            drawSp(ctx, info, 200, 452, 0, 'center');
        }
        ctx.restore();
    }

    // logo mahad (kiri atas) — dilewati bila file tidak ada
    const logo = getImg('template/logomahad.png');
    if (logo.ok) {
        ctx.save(); ctx.globalAlpha = 0.9;
        ctx.drawImage(logo.img, 20, 20, 70, 70 * logo.img.naturalHeight / logo.img.naturalWidth);
        ctx.restore();
    }

    // watermark
    ctx.font = `400 10.4px ${FONT_MAIN}`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    drawSp(ctx, 'MIS SENGKANG OFFICIAL WATERMARK', 380, 486, 1, 'right');
}

/* --------------------------------------------------------------------------
   PIPELINE RENDER
   -------------------------------------------------------------------------- */
function drawFlyer(ctx, s) {
    ctx.save();
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (state.mode === 'manual') drawManual(ctx, s); else drawAI(ctx, s);
    ctx.restore();
}

let rafId = 0;
function requestRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; renderPreview(); });
}

function renderPreview() {
    const c = $('flyer-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    drawFlyer(ctx, c.width / W0);
    updateStageStatus();
}

function updateStageStatus() {
    const box = $('stage-status');
    const msgs = [];
    neededAssets().forEach((a) => {
        if (a.e.ok !== false) return;
        if (a.kind === 'template') msgs.push(`Template "${currentTier().tpl}" tidak ditemukan. Periksa nama file & foldernya (huruf besar/kecil berpengaruh di hosting).`);
        if (a.kind === 'foto') msgs.push('Foto santri gagal dimuat (periksa koneksi atau URL foto).');
    });
    box.textContent = msgs.join(' ');
    box.hidden = msgs.length === 0;
}

/* --------------------------------------------------------------------------
   EKSPOR (download / share)
   -------------------------------------------------------------------------- */
function pickExportWidth() {
    const v = $('export-size').value;
    if (v !== 'auto') return Number(v);
    let nw = 1080;
    const src = state.mode === 'manual' ? getImg(currentTier().tpl)
        : (state.aiBg && state.aiBg.ok ? state.aiBg : null);
    if (src && src.ok) nw = src.img.naturalWidth;
    return Math.min(2160, Math.max(1080, nw));
}

async function buildExportBlob() {
    await ensureFonts();
    await waitAssets();
    const w = pickExportWidth(), h = Math.round(w * H0 / W0);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    drawFlyer(c.getContext('2d'), w / W0);

    const fmt = $('export-format').value === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((resolve, reject) => {
        try { c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob-null'))), fmt, 0.95); }
        catch (e) { reject(e); }
    });
    const ext = fmt === 'image/jpeg' ? 'jpg' : 'png';
    const base = state.mode === 'manual'
        ? `Flyer_${safeName(state.santri || 'Santri')}_${safeName(state.jenis)}`
        : `Flyer_${safeName(state.aiName || state.aiSantri || 'AI_Custom')}_AI`;
    return { blob, name: `${base}.${ext}`, w, h };
}

function explainExportError(e) {
    console.error('Ekspor gagal:', e);
    if (e && (e.name === 'SecurityError' || /tainted|insecure/i.test(String(e.message)))) {
        toast('Browser memblokir ekspor karena gambar berasal dari sumber tanpa izin CORS atau halaman dibuka lewat file://. Buka lewat hosting/Live Server.', true, 7000);
    } else {
        toast('Gagal membuat gambar. Coba lagi atau pilih ukuran lebih kecil.', true, 5000);
    }
}

function validate() {
    if (state.mode === 'manual' && !state.santri.trim()) {
        toast('Isi dulu nama santri (ketik & pilih dari database).', true);
        $('input-santri').focus();
        return false;
    }
    return true;
}

function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
}

async function withBusy(btn, label, fn) {
    if (btn.disabled) return;
    const old = btn.innerHTML;
    btn.disabled = true; btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}

async function doDownload() {
    if (!validate()) return;
    await withBusy($('btn-download'), '⏳ Memproses gambar...', async () => {
        try {
            const { blob, name, w, h } = await buildExportBlob();
            triggerDownload(blob, name);
            toast(`✅ Flyer disiapkan (${w}×${h}px). Jika tidak muncul, pakai "Buka gambar" di bawah.`);
        } catch (e) { explainExportError(e); }
    });
}

async function doOpenImage() {
    if (!validate()) return;
    await withBusy($('btn-open-image'), 'Memproses...', async () => {
        try {
            const { blob } = await buildExportBlob();
            const img = $('modal-img');
            if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
            const url = URL.createObjectURL(blob);
            img.dataset.url = url; img.src = url;
            $('img-modal').hidden = false;
        } catch (e) { explainExportError(e); }
    });
}

/* --------------------------------------------------------------------------
   CAPTION, SALIN, SHARE
   -------------------------------------------------------------------------- */
function buildCaption() {
    const s = findSantri(state.mode === 'manual' ? state.santri : state.aiSantri);
    const typed = state.mode === 'manual' ? state.santri : state.aiSantri;
    const nama = s ? s.nama : (typed.trim() || '[Nama Santri]');
    const ortu = [];
    if (s ? s.ayah : true) ortu.push('Bapak ' + (s ? s.ayah : '[Nama Ayah]'));
    if (s ? s.ibu : true) ortu.push('Ibu ' + (s ? s.ibu : '[Nama Ibu]'));
    const detail = state.detail.trim();
    const target = state.mode === 'manual'
        ? (detail ? `${state.jenis} (${detail})` : state.jenis)
        : (state.aiName.trim() || 'program hafalan Al-Qur’an');
    const total = state.mode === 'manual' && state.total.trim()
        ? ` Total hafalan Ananda saat ini: *${state.total.trim()}*.` : '';

    return `🌹 *Barakallahu Fiikum wa Ahsanal Jaza’* 🌹\n\nAlhamdulillahirabbil ‘alamin, selamat kepada Ananda *${nama}*, putra dari ${ortu.join(' dan ')}, yang telah berhasil menyelesaikan *${target}*.${total}\n\nSemoga pencapaian ini menjadi langkah awal yang penuh keberkahan dalam perjalanan bersama Al-Qur’an. Semoga Allah ﷻ senantiasa menjaga hati dan lisan Ananda untuk terus mencintai, menghafal, memahami, serta mengamalkan ayat-ayat-Nya.\n\nKami berdoa semoga Ananda diberikan keistiqamahan dalam menjaga hafalan, ditambahkan ilmu yang bermanfaat, akhlak yang mulia, serta menjadi anak yang shalih dan membanggakan kedua orang tua.\n\nSemoga Al-Qur’an yang telah dihafal menjadi cahaya dalam kehidupan, penuntun menuju kebaikan, serta menjadi sebab hadirnya mahkota kemuliaan dan penyejuk hati bagi kedua orang tua serta keluarga di akhirat kelak.\n\nبارك الله فيكم ونفع بكم القرآن وأهله\nAamiin Ya Rabbal ‘Alamin.\n\n✨ *MIS SENGKANG*\n_“Mencetak Generasi Qur’ani yang Berilmu, Berakhlak, dan Berprestasi.”_`;
}

async function copyText(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* lanjut ke cadangan */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
}

async function doCopyCaption() {
    const ok = await copyText(buildCaption());
    toast(ok ? '📋 Caption berhasil disalin. Silakan tempel di WhatsApp/media sosial.' : 'Gagal menyalin otomatis. Salin manual dari pratinjau.', !ok);
}

function openWhatsAppText(caption) {
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(caption), '_blank', 'noopener');
}

async function doShareWA() {
    if (!validate()) return;
    const caption = buildCaption();
    const canShareFiles = !!(navigator.share && navigator.canShare);
    if (!canShareFiles) {                       // desktop / browser lama
        openWhatsAppText(caption);
        toast('Caption dibuka di WhatsApp. Unduh flyer lalu lampirkan secara manual.');
        return;
    }
    await withBusy($('btn-wa'), '⏳ Menyiapkan...', async () => {
        try {
            const { blob, name } = await buildExportBlob();
            const file = new File([blob], name, { type: blob.type });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], text: caption });
                return;
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return;     // pengguna membatalkan
            console.warn('Share file gagal, pakai teks saja:', e);
        }
        openWhatsAppText(caption);
        toast('Caption dibuka di WhatsApp. Unduh flyer lalu lampirkan secara manual.');
    });
}

/* --------------------------------------------------------------------------
   PROMPT GENERATOR (TAB AI)
   -------------------------------------------------------------------------- */
function generateAIPrompt() {
    const theme = $('ai-flyer-name').value.trim() || 'Flyer Prestasi Santri';
    const data = $('ai-custom-prompt-data').value.trim();
    const s = findSantri($('ai-santri').value);
    const lines = [
        'Buatkan LATAR desain flyer digital berorientasi potret, rasio 4:5 (1080 × 1350 px) untuk lembaga pendidikan tahfizh "MIS Sengkang".',
        '',
        `TEMA / JUDUL: ${theme}`,
    ];
    if (s) {
        lines.push('', 'DATA SANTRI:',
            `- Nama: ${s.nama}`,
            s.alamat && `- Asal: ${s.alamat}`,
            (s.ayah || s.ibu) && `- Orang tua: ${[s.ayah && 'Bapak ' + s.ayah, s.ibu && 'Ibu ' + s.ibu].filter(Boolean).join(' & ')}`,
            s.halaqah && `- Halaqah: ${s.halaqah}`);
    }
    if (data) lines.push('', 'KETERANGAN TAMBAHAN:', data);
    lines.push('',
        'ARAHAN DESAIN:',
        '- Gaya elegan bernuansa Islami: ornamen geometris/arabesque halus, kaligrafi samar sebagai tekstur, cahaya lembut, palet warna harmonis (hijau zamrud / biru malam / emas) yang selaras dengan tema.',
        '- Sisakan area kosong di tengah–bawah (sekitar 70% tinggi kanvas) untuk foto santri berlatar transparan.',
        '- Sisakan area kosong di kiri atas (±20% lebar) untuk logo mahad, dan satu baris judul di tengah atas.',
        '- Sisakan pita/area gelap di ±20% bagian bawah agar teks nama berwarna putih tetap terbaca jelas.',
        '- JANGAN menuliskan teks apa pun di dalam gambar (nama, judul, dan lainnya akan ditambahkan terpisah).',
        '- Tanpa wajah/orang, tanpa logo merek lain, tanpa watermark. Resolusi tinggi, tajam, tanpa blur.',
        '',
        'Setelah gambar jadi, unggah pada kolom "Upload Gambar Latar" di Flyer Hub.');
    $('ai-prompt-out').value = lines.filter((l) => typeof l === 'string').join('\n');
    $('ai-prompt-out-wrap').hidden = false;
    $('ai-prompt-out').scrollTop = 0;
    toast('🔮 Prompt dibuat. Salin dan tempel ke AI pembuat gambar.');
}

function onAiUpload(ev) {
    const f = ev.target.files && ev.target.files[0];
    const hint = $('ai-upload-hint');
    if (state.aiBg && state.aiBg.url) URL.revokeObjectURL(state.aiBg.url);
    if (!f) { state.aiBg = null; hint.textContent = ''; hint.className = 'hint'; requestRender(); return; }
    if (!/^image\//.test(f.type)) {
        toast('File harus berupa gambar (PNG/JPG/WebP).', true);
        ev.target.value = ''; return;
    }
    const url = URL.createObjectURL(f);
    const entry = { img: new Image(), ok: null, url, name: f.name };
    entry.img.onload = () => {
        entry.ok = true;
        hint.textContent = `✓ ${f.name} (${entry.img.naturalWidth}×${entry.img.naturalHeight}px)` +
            (entry.img.naturalWidth < 1000 ? ' — resolusi rendah, hasil bisa kurang tajam.' : '');
        hint.className = 'hint ' + (entry.img.naturalWidth < 1000 ? 'warn' : 'ok');
        requestRender();
    };
    entry.img.onerror = () => {
        entry.ok = false; state.aiBg = null;
        toast('Gambar tidak bisa dibaca. Coba format lain.', true);
        requestRender();
    };
    entry.img.src = url;
    state.aiBg = entry;
}

/* --------------------------------------------------------------------------
   UI
   -------------------------------------------------------------------------- */
function updateSantriHint() {
    const h = $('santri-hint');
    const v = state.santri.trim();
    if (!v) { h.textContent = ''; h.className = 'hint'; return; }
    const s = findSantri(v);
    if (!s) {
        h.textContent = 'Belum cocok dengan database — pilih dari daftar saran agar data & foto terisi otomatis.';
        h.className = 'hint warn'; return;
    }
    h.textContent = `✓ ${s.halaqah} • ${s.alamat}` + (s.foto ? '' : ' • (belum ada foto)');
    h.className = 'hint ' + (s.foto ? 'ok' : 'warn');
}

function readInputs() {
    state.santri = $('input-santri').value;
    state.jenis = $('input-juz').value;
    state.detail = $('input-nama-juz').value;
    state.total = $('input-total-hafalan').value;
    state.aiName = $('ai-flyer-name').value;
    state.aiSantri = $('ai-santri').value;
    updateSantriHint();
    requestRender();
}

function switchGate(mode) {
    state.mode = mode;
    const man = mode === 'manual';
    $('form-gate-manual').hidden = !man;
    $('form-gate-ai').hidden = man;
    $('gate-manual-btn').classList.toggle('active-gate-manual', man);
    $('gate-ai-btn').classList.toggle('active-gate-ai', !man);
    $('gate-manual-btn').setAttribute('aria-selected', String(man));
    $('gate-ai-btn').setAttribute('aria-selected', String(!man));
    const st = $('engine-status');
    st.textContent = man ? '⚙️ MANUAL ENGINE ACTIVE' : '🤖 AI CORE ENGINE READY';
    st.style.color = man ? '#00f2fe' : '#ff5dff';
    $('btn-download').classList.toggle('ai-mode', !man);
    requestRender();
}

function buildCalibUI() {
    const grid = $('calib-grid');
    grid.innerHTML = '';
    const head = ['', 'X (→)', 'Y (↓)'];
    head.forEach((t) => { const d = document.createElement('div'); d.className = 'lbl'; d.textContent = t; grid.appendChild(d); });
    OFFSET_KEYS.forEach(([k, label]) => {
        const l = document.createElement('div'); l.className = 'lbl'; l.textContent = label; grid.appendChild(l);
        ['x', 'y'].forEach((ax) => {
            const i = document.createElement('input');
            i.type = 'number'; i.step = '1'; i.inputMode = 'numeric';
            i.value = offsets[k][ax]; i.dataset.k = k; i.dataset.ax = ax;
            i.setAttribute('aria-label', `${label} ${ax.toUpperCase()}`);
            i.addEventListener('input', () => {
                offsets[k][ax] = Number(i.value) || 0; saveOffsets(); requestRender();
            });
            grid.appendChild(i);
        });
    });
}

function init() {
    // daftar santri
    const dl = $('data-santri-list');
    if (typeof DATA_SANTRI !== 'undefined') {
        const frag = document.createDocumentFragment();
        DATA_SANTRI.forEach((s) => {
            const o = document.createElement('option');
            o.value = s.nama; o.label = `${s.halaqah} • ${s.alamat}`;
            frag.appendChild(o);
        });
        dl.appendChild(frag);
        $('santri-count').textContent = DATA_SANTRI.length + ' santri';
    } else {
        toast('data.js tidak termuat — daftar santri kosong.', true, 8000);
    }

    buildCalibUI();

    // login -> dashboard
    $('btn-enter').addEventListener('click', () => {
        $('login-view').hidden = true;
        $('dashboard-view').hidden = false;
        $('glow-core').classList.add('big');
        window.scrollTo(0, 0);
        readInputs();
    });

    // input
    ['input-santri', 'input-juz', 'input-nama-juz', 'input-total-hafalan', 'ai-flyer-name', 'ai-santri']
        .forEach((id) => { $(id).addEventListener('input', readInputs); $(id).addEventListener('change', readInputs); });
    $('ai-flyer-upload').addEventListener('change', onAiUpload);

    $('gate-manual-btn').addEventListener('click', () => switchGate('manual'));
    $('gate-ai-btn').addEventListener('click', () => switchGate('ai'));

    $('btn-gen-prompt').addEventListener('click', generateAIPrompt);
    $('btn-copy-prompt').addEventListener('click', async () => {
        const ok = await copyText($('ai-prompt-out').value);
        toast(ok ? '📋 Prompt disalin.' : 'Gagal menyalin. Blok teks lalu salin manual.', !ok);
    });

    $('btn-download').addEventListener('click', doDownload);
    $('btn-wa').addEventListener('click', doShareWA);
    $('btn-copy-caption').addEventListener('click', doCopyCaption);
    $('btn-open-image').addEventListener('click', doOpenImage);

    $('btn-calib-reset').addEventListener('click', () => {
        OFFSET_KEYS.forEach(([k]) => offsets[k] = { x: 0, y: 0 });
        saveOffsets(); buildCalibUI(); requestRender();
    });

    // modal
    const closeModal = () => { $('img-modal').hidden = true; };
    $('btn-modal-close').addEventListener('click', closeModal);
    $('img-modal').addEventListener('click', (e) => { if (e.target.id === 'img-modal') closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    // render ulang ketika font selesai dimuat
    if (document.fonts) {
        document.fonts.addEventListener('loadingdone', requestRender);
        document.fonts.ready.then(requestRender);
    }
    ensureFonts().then(requestRender);

    readInputs();
    getImg(TIER_STD.tpl);               // pemanasan template default
}

document.addEventListener('DOMContentLoaded', init);

// hook kecil untuk pengujian/debug di konsol
window.FlyerHub = { state, offsets, drawFlyer, buildExportBlob, findSantri };
})();
