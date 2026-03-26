/* ── HTML escaping ───────────────────────────── */
export function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

/* ── Markdown renderer ───────────────────────── */
const _dlSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>';

export function renderMarkdown(text) {
    // 1. Extract download URLs BEFORE escaping (raw text from LLM)
    const placeholders = [];
    function ph(html) { const k = `\u200BPHL${placeholders.length}PHR\u200B`; placeholders.push(html); return k; }

    // Strip any raw HTML tags the LLM might produce (prevent XSS + broken rendering)
    let raw = text.replace(/<[^>]+>/g, '');

    // Replace image download links with placeholders
    raw = raw.replace(/\/download\/([a-f0-9-]+)\/([^\s)]+\.(?:png|jpg|jpeg|svg))/gi, (_, id, f) => {
        const df = decodeURIComponent(f);
        return ph(
            `<img src="/download/${id}/${f}" class="chart-img" alt="${escapeHtml(df)}" />` +
            `<br><a href="/download/${id}/${f}" download class="dl-inline">${_dlSvg} ${escapeHtml(df)}</a>`
        );
    });
    // Replace other download links with placeholders
    raw = raw.replace(/\/download\/([a-f0-9-]+)\/([^\s)]+)/g, (_, id, f) => {
        const df = decodeURIComponent(f);
        return ph(`<a href="/download/${id}/${f}" download class="dl-inline">${_dlSvg} ${escapeHtml(df)}</a>`);
    });

    // 2. Now escape everything else
    let h = escapeHtml(raw);

    // 3. Markdown transforms on the escaped string
    // Code blocks first (protect contents from further transforms)
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) =>
        ph(`<pre class="tool-query" style="color:var(--text-primary);margin:6px 0">${c}</pre>`)
    );
    h = h.replace(/`([^`]+)`/g, (_, c) => ph(`<code>${c}</code>`));

    h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Tables
    h = h.replace(/((?:\|.*\|(?:\n|$))+)/g, (match) => {
        const rows = match.trim().split('\n').filter(r => r.trim());
        if (rows.length < 2) return match;
        const pr = r => r.split('|').filter(c => c.trim() !== '').map(c => c.trim());
        const hdrs = pr(rows[0]);
        const si = rows[1] && /^[\s|-]+$/.test(rows[1]) ? 2 : 1;
        let t = '<div style="overflow-x:auto;margin:6px 0"><table class="md-table"><thead><tr>';
        for (const hd of hdrs) t += `<th>${hd}</th>`;
        t += '</tr></thead><tbody>';
        for (let i = si; i < rows.length; i++) { const cs = pr(rows[i]); t += '<tr>'; for (const c of cs) t += `<td>${c}</td>`; t += '</tr>'; }
        return t + '</tbody></table></div>';
    });

    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    h = h.replace(/\n\n/g, '</p><p>');
    h = h.replace(/\n/g, '<br>');

    // 4. Restore placeholders (raw HTML blocks)
    for (let i = 0; i < placeholders.length; i++) {
        h = h.replace(`\u200BPHL${i}PHR\u200B`, placeholders[i]);
    }

    return `<p>${h}</p>`;
}
