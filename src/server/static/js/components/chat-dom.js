import { escapeHtml } from '../utils/markdown.js';

/* ── DOM builders ────────────────────────────── */
export function appendUserBubble(chatEl, text) {
    const d = document.createElement('div');
    d.className = 'msg-user fade-in';
    d.innerHTML = `<div class="msg-user-bubble">${escapeHtml(text)}</div>`;
    chatEl.appendChild(d);
    scrollToBottom(chatEl);
}

export function createAssistantGroup(chatEl) {
    const outer = document.createElement('div');
    outer.className = 'msg-assistant fade-in';
    const group = document.createElement('div');
    group.className = 'msg-group';
    const av = document.createElement('div');
    av.className = 'avatar';
    av.textContent = 'A';
    const content = document.createElement('div');
    content.className = 'msg-content';
    const stepsEl = document.createElement('div');
    stepsEl.className = 'msg-steps';
    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    content.appendChild(stepsEl);
    content.appendChild(textEl);
    group.appendChild(av);
    group.appendChild(content);
    outer.appendChild(group);
    chatEl.appendChild(outer);
    scrollToBottom(chatEl);
    return { outer, textEl, stepsEl };
}

/* ── Tool steps ──────────────────────────────── */
export function createToolStep(toolName, stepsEl, deps) {
    const details = document.createElement('details');
    details.className = 'tool-step running';
    const summary = document.createElement('summary');
    summary.innerHTML = `
        <svg class="spinner-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--accent-yellow)">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        <span class="tool-name running">${escapeHtml(toolName)}</span>
        <span class="tool-badge">running</span>`;
    const body = document.createElement('div');
    body.className = 'tool-body';
    details.appendChild(summary);
    details.appendChild(body);
    stepsEl.appendChild(details);
    if (deps) scrollToBottom(deps.chat);
    return { details, summary, body };
}

export function finalizeToolStep(step, toolOutput, toolInput, deps) {
    const { details, summary, body } = step;
    details._rawOutput = toolOutput;
    details._rawInput = toolInput;
    details.classList.remove('running');
    details.classList.add('done');

    const parsed = parseTableData(toolOutput);

    const icon = summary.querySelector('svg');
    if (icon) {
        icon.classList.remove('spinner-icon');
        icon.outerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--accent-green)">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>`;
    }

    const nameEl = summary.querySelector('.tool-name');
    if (nameEl) { nameEl.classList.remove('running'); nameEl.classList.add('done'); }

    const badge = summary.querySelector('.tool-badge');
    if (badge) {
        badge.textContent = parsed ? `${parsed.rows.length} row${parsed.rows.length !== 1 ? 's' : ''}` : `${toolOutput.length} B`;
    }

    let html = '';
    if (toolInput && typeof toolInput === 'object' && Object.keys(toolInput).length > 0) {
        const display = toolInput.query || toolInput.table_name || JSON.stringify(toolInput, null, 2);
        html += `<div style="margin-bottom:8px">
            <div class="tool-section-label">input</div>
            <pre class="tool-query">${escapeHtml(display)}</pre>
        </div>`;
    }

    if (parsed) {
        html += `<div>
            <div class="tool-section-label">output</div>
            <div class="result-wrap">${renderResultTable(parsed)}</div>
            <div class="tool-actions">${actionButtons()}</div>
        </div>`;
    } else if (toolOutput.includes('/download/')) {
        const dlMatch = toolOutput.match(/\/download\/([a-f0-9-]+)\/([^\s]+)/);
        const rowMatch = toolOutput.match(/(\d+) lignes/);
        const isImage = dlMatch && /\.(png|jpg|jpeg|svg)$/i.test(dlMatch[2]);
        if (dlMatch && isImage) {
            html += `<div style="padding:4px 0">
                <img src="/download/${dlMatch[1]}/${dlMatch[2]}" class="chart-img" alt="${escapeHtml(dlMatch[2])}" onload="scrollToBottom()" />
                <div style="margin-top:4px">
                    <a href="/download/${dlMatch[1]}/${dlMatch[2]}" download class="dl-card">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        <span class="dl-card-name">${escapeHtml(dlMatch[2])}</span>
                    </a>
                </div>
            </div>`;
        } else if (dlMatch) {
            html += `<div style="padding:4px 0">
                <a href="/download/${dlMatch[1]}/${dlMatch[2]}" download class="dl-card">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    <span class="dl-card-name">${escapeHtml(dlMatch[2])}</span>
                    ${rowMatch ? `<span class="dl-card-meta">${rowMatch[1]} rows</span>` : ''}
                </a>
            </div>`;
        }
    } else {
        const trunc = toolOutput.length > 3000 ? toolOutput.slice(0, 3000) + '\n...' : toolOutput;
        html += `<div>
            <div class="tool-section-label">output</div>
            <pre class="tool-query" style="color:var(--text-primary);max-height:220px;overflow-y:auto">${escapeHtml(trunc)}</pre>
            <div class="tool-actions">${actionButtons()}</div>
        </div>`;
    }

    body.innerHTML = html;

    if (body.querySelector('.chart-img')) {
        details.open = true;
        if (deps) scrollToBottom(deps.chat);
    }

    const copyBtn = body.querySelector('.btn-copy');
    const csvBtn = body.querySelector('.btn-csv');
    const jsonBtn = body.querySelector('.btn-json');
    if (copyBtn) copyBtn.onclick = () => copyClip(copyBtn, toolOutput);
    if (csvBtn) csvBtn.onclick = () => downloadCSV(parsed || toolOutput, toolInput);
    if (jsonBtn) jsonBtn.onclick = () => downloadJSON(parsed || toolOutput, toolInput);
}

export function getLastAssistantGroup(chatEl) {
    const msgs = chatEl.querySelectorAll('.msg-assistant');
    if (msgs.length) {
        const last = msgs[msgs.length - 1];
        return {
            outer: last,
            textEl: last.querySelector('.msg-text'),
            stepsEl: last.querySelector('.msg-steps'),
        };
    }
    return createAssistantGroup(chatEl);
}

export function scrollToBottom(chatEl) {
    requestAnimationFrame(() => { chatEl.scrollTop = chatEl.scrollHeight; });
}

/* ── Action buttons HTML ─────────────────────── */
function actionButtons() {
    return `
        <button class="tool-action-btn btn-copy">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            copy
        </button>
        <button class="tool-action-btn btn-csv">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            csv
        </button>
        <button class="tool-action-btn btn-json">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            json
        </button>`;
}

/* ── Table parsing & rendering ───────────────── */
export function parseTableData(text) {
    if (!text || typeof text !== 'string') return null;
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;
    if (lines[0].includes('|')) {
        const parseRow = r => r.split('|').map(c => c.trim()).filter(c => c !== '');
        const headers = parseRow(lines[0]);
        if (!headers.length) return null;
        let start = 1;
        if (lines[1] && /^[\s|+\-:=]+$/.test(lines[1])) start = 2;
        const rows = [];
        for (let i = start; i < lines.length; i++) {
            if (/^[\s|+\-:=]+$/.test(lines[i])) continue;
            if (/^\*?\(?\d+ (?:total )?rows?\)?/.test(lines[i].trim())) continue;
            const cells = parseRow(lines[i]);
            if (cells.length) rows.push(cells);
        }
        return rows.length ? { headers, rows } : null;
    }
    if (lines[0].includes(',') && lines[0].split(',').length >= 2) {
        const headers = lines[0].split(',').map(c => c.trim());
        const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim())).filter(r => r.length);
        return rows.length ? { headers, rows } : null;
    }
    return null;
}

export function renderResultTable(data) {
    let h = '<table class="result-table"><thead><tr>';
    for (const col of data.headers) h += `<th>${escapeHtml(col)}</th>`;
    h += '</tr></thead><tbody>';
    for (const row of data.rows) {
        h += '<tr>';
        for (let i = 0; i < data.headers.length; i++) {
            const c = row[i] || '';
            const d = c.length > 100 ? c.slice(0, 100) + '...' : c;
            h += `<td title="${escapeHtml(c)}">${escapeHtml(d)}</td>`;
        }
        h += '</tr>';
    }
    return h + '</tbody></table>';
}

/* ── Download & Copy ─────────────────────────── */
export function copyClip(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        const orig = btn.innerHTML;
        btn.textContent = 'copied';
        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1200);
    });
}

export function downloadCSV(data, input) {
    let csv;
    if (data?.headers && data?.rows) {
        const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
        csv = data.headers.map(esc).join(',') + '\n' + data.rows.map(r => r.map(c => esc(c || '')).join(',')).join('\n');
    } else { csv = typeof data === 'string' ? data : JSON.stringify(data); }
    dl(csv, fname(input, 'csv'), 'text/csv');
}

export function downloadJSON(data, input) {
    let json;
    if (data?.headers && data?.rows) {
        json = JSON.stringify(data.rows.map(r => { const o = {}; data.headers.forEach((h, i) => o[h] = r[i] || null); return o; }), null, 2);
    } else { json = typeof data === 'string' ? JSON.stringify({ result: data }, null, 2) : JSON.stringify(data, null, 2); }
    dl(json, fname(input, 'json'), 'application/json');
}

export function fname(input, ext) {
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    let n = 'result';
    if (input?.table_name) n = input.table_name;
    else if (input?.query) { const m = input.query.match(/(?:FROM|JOIN)\s+(\w+)/i); if (m) n = m[1]; }
    return `${n}_${ts}.${ext}`;
}

function dl(content, filename, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
