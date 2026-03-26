import { escapeHtml } from '../utils/markdown.js';

/**
 * Render the context data into the sidebar DOM elements.
 * `deps` must provide: ctxSchemaList, ctxSchemaCount, ctxUserList, ctxUserCount,
 *   ctxScratchpadList, ctxNoteCount, rewardStats, rwAvg, rwPos, rwNeg,
 *   ctxSummary, ctxSummaryStatus
 */
export function renderContextData(data, deps) {
    // Schema
    const schemaEl = deps.ctxSchemaList;
    deps.ctxSchemaCount.textContent = data.schema_tables.length;
    if (data.schema_tables.length) {
        schemaEl.innerHTML = data.schema_tables.map(t =>
            `<div class="ctx-item schema"><span class="ctx-item-text">${escapeHtml(t)}</span></div>`
        ).join('');
    } else {
        schemaEl.innerHTML = '<span class="ctx-empty">aucun schema en cache</span>';
    }

    // User context
    const userEl = deps.ctxUserList;
    deps.ctxUserCount.textContent = data.user_context.length;
    if (data.user_context.length) {
        userEl.innerHTML = data.user_context.map((c, i) => {
            const isAgent = c.source === 'agent';
            const srcTag = isAgent
                ? '<span style="font-size:8px;color:var(--accent-purple);margin-right:4px">AGENT</span>'
                : '<span style="font-size:8px;color:var(--accent-blue);margin-right:4px">USER</span>';
            return `<div class="ctx-item user" style="border-left-color:var(${isAgent ? '--accent-purple' : '--accent-blue'})">
                <div class="ctx-item-row">
                    <span class="ctx-item-text" title="${escapeHtml(c.text)}">${srcTag}${escapeHtml(c.text)}</span>
                    <button class="ctx-remove" onclick="removeUserContext(${i})">&times;</button>
                </div>
            </div>`;
        }).join('');
    } else {
        userEl.innerHTML = '<span class="ctx-empty">aucun contexte</span>';
    }

    // Scratchpad with rewards
    const scratchEl = deps.ctxScratchpadList;
    deps.ctxNoteCount.textContent = data.scratchpad.length;
    if (data.scratchpad.length) {
        scratchEl.innerHTML = data.scratchpad.map((n, i) => {
            const scoreClass = n.score > 0 ? 'positive' : n.score < 0 ? 'negative' : 'neutral';
            const scoreStr = n.score > 0 ? `+${n.score}` : `${n.score}`;
            return `<div class="ctx-item note">
                <div class="ctx-item-row">
                    <div class="ctx-item-actions">
                        <button class="ctx-reward-btn up" onclick="rewardNote(${i}, 1)" title="+1">&#9650;</button>
                        <span class="ctx-score ${scoreClass}">${scoreStr}</span>
                        <button class="ctx-reward-btn down" onclick="rewardNote(${i}, -1)" title="-1">&#9660;</button>
                    </div>
                    <span class="ctx-item-text">${escapeHtml(n.note)}</span>
                </div>
            </div>`;
        }).join('');

        // Reward stats
        const rs = data.reward_summary;
        deps.rewardStats.style.display = 'flex';
        deps.rwAvg.textContent = rs.avg_score.toFixed(1);
        deps.rwPos.textContent = rs.positive;
        deps.rwNeg.textContent = rs.negative;
    } else {
        scratchEl.innerHTML = '<span class="ctx-empty">aucune note</span>';
        deps.rewardStats.style.display = 'none';
    }

    // Recalled memories
    const recallEl = deps.ctxRecallList;
    const recallData = data.last_recall || [];
    deps.ctxRecallCount.textContent = recallData.length;
    if (recallData.length) {
        recallEl.innerHTML = recallData.map(r => {
            const scoreStr = (r.score != null) ? r.score.toFixed(2) : '?';
            const threadTag = r.source_thread
                ? `<span style="font-size:8px;color:#f0883e;margin-right:4px">${escapeHtml(r.source_thread.slice(0, 8))}</span>`
                : '';
            return `<div class="ctx-item note" style="border-left-color:#f0883e">
                <div class="ctx-item-row">
                    <span style="font-size:8px;color:var(--text-muted);margin-right:4px">${scoreStr}</span>
                    ${threadTag}
                    <span class="ctx-item-text" title="${escapeHtml(r.text)}">${escapeHtml(r.text)}</span>
                </div>
            </div>`;
        }).join('');
    } else {
        recallEl.innerHTML = '<span class="ctx-empty">aucun souvenir rappele</span>';
    }

    // Summary
    const summaryEl = deps.ctxSummary;
    const summaryStatus = deps.ctxSummaryStatus;
    if (data.summary) {
        summaryEl.innerHTML = `<div class="ctx-item summary"><span class="ctx-item-text">${escapeHtml(data.summary)}</span></div>`;
        summaryStatus.textContent = 'active';
    } else {
        summaryEl.innerHTML = '<span class="ctx-empty">aucun resume</span>';
        summaryStatus.textContent = '-';
    }
}

/**
 * Render the prompt preview data into the sidebar.
 * `deps` must provide: ctxTokenEst, promptPreview
 */
export function renderPromptPreview(data, deps) {
    deps.ctxTokenEst.textContent = `~${data.token_estimate} tokens`;

    const container = deps.promptPreview;
    container.innerHTML = data.sections.map(s => {
        const chars = s.content.length;
        return `<div class="prompt-section" data-id="${s.id}">
            <div class="prompt-section-hdr" onclick="this.parentElement.classList.toggle('open')">
                <span class="label">${escapeHtml(s.label)}</span>
                <span class="chars">${chars} chars</span>
            </div>
            <div class="prompt-section-body">${escapeHtml(s.content)}</div>
        </div>`;
    }).join('');
}
