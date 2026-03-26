import { authHeaders } from './api.js';
import { escapeHtml } from '../utils/markdown.js';

/**
 * Refresh the context sidebar with current schema, user context, scratchpad, and summary.
 *
 * @param {object} deps - {
 *   ctxSchemaList, ctxSchemaCount, ctxUserList, ctxUserCount,
 *   ctxScratchpadList, ctxNoteCount, rewardStats, rwAvg, rwPos, rwNeg,
 *   ctxRecallList, ctxRecallCount, ctxSummary, ctxSummaryStatus
 * }
 */
export async function refreshContext(deps) {
    const {
        ctxSchemaList, ctxSchemaCount, ctxUserList, ctxUserCount,
        ctxScratchpadList, ctxNoteCount, rewardStats, rwAvg, rwPos, rwNeg,
        ctxRecallList, ctxRecallCount, ctxSummary, ctxSummaryStatus,
    } = deps;

    try {
        const res = await fetch('/context', { headers: authHeaders() });
        const data = await res.json();

        // Schema
        ctxSchemaCount.textContent = data.schema_tables.length;
        if (data.schema_tables.length) {
            ctxSchemaList.innerHTML = data.schema_tables.map(t =>
                `<div class="ctx-item schema"><span class="ctx-item-text">${escapeHtml(t)}</span></div>`
            ).join('');
        } else {
            ctxSchemaList.innerHTML = '<span class="ctx-empty">aucun schema en cache</span>';
        }

        // User context
        ctxUserCount.textContent = data.user_context.length;
        if (data.user_context.length) {
            ctxUserList.innerHTML = data.user_context.map((c, i) => {
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
            ctxUserList.innerHTML = '<span class="ctx-empty">aucun contexte</span>';
        }

        // Scratchpad with rewards
        ctxNoteCount.textContent = data.scratchpad.length;
        if (data.scratchpad.length) {
            ctxScratchpadList.innerHTML = data.scratchpad.map((n, i) => {
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
            rewardStats.style.display = 'flex';
            rwAvg.textContent = rs.avg_score.toFixed(1);
            rwPos.textContent = rs.positive;
            rwNeg.textContent = rs.negative;
        } else {
            ctxScratchpadList.innerHTML = '<span class="ctx-empty">aucune note</span>';
            rewardStats.style.display = 'none';
        }

        // Recalled memories
        const recallData = data.last_recall || [];
        ctxRecallCount.textContent = recallData.length;
        if (recallData.length) {
            ctxRecallList.innerHTML = recallData.map(r => {
                const scoreStr = (r.score != null) ? r.score.toFixed(2) : '?';
                const threadShort = r.source_thread ? r.source_thread.slice(0, 8) : '';
                return `<div class="ctx-item note" style="border-left-color:#f0883e">
                    <div class="ctx-item-row">
                        <span style="font-size:8px;color:#f0883e;margin-right:4px">${scoreStr}</span>
                        <span style="font-size:8px;color:var(--text-muted);margin-right:4px">${escapeHtml(threadShort)}</span>
                        <span class="ctx-item-text" title="${escapeHtml(r.text)}">${escapeHtml(r.text)}</span>
                    </div>
                </div>`;
            }).join('');
        } else {
            ctxRecallList.innerHTML = '<span class="ctx-empty">aucun souvenir</span>';
        }

        // Summary
        if (data.summary) {
            ctxSummary.innerHTML = `<div class="ctx-item summary"><span class="ctx-item-text">${escapeHtml(data.summary)}</span></div>`;
            ctxSummaryStatus.textContent = 'active';
        } else {
            ctxSummary.innerHTML = '<span class="ctx-empty">aucun resume</span>';
            ctxSummaryStatus.textContent = '-';
        }
    } catch (e) { /* silent */ }
}

/**
 * Add user context text.
 *
 * @param {object} deps - { ctxInput, refreshContext }
 */
export async function addUserContext(deps) {
    const { ctxInput, refreshContextFn } = deps;
    const text = ctxInput.value.trim();
    if (!text) return;
    try {
        await fetch('/context', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ context: text }),
        });
        ctxInput.value = '';
        refreshContextFn();
    } catch (e) { /* silent */ }
}

/**
 * Remove a user context entry by index.
 *
 * @param {number} index - Index of the context entry to remove
 * @param {function} refreshContextFn - Callback to refresh context after removal
 */
export async function removeUserContext(index, refreshContextFn) {
    try {
        await fetch(`/context/${index}`, { method: 'DELETE', headers: authHeaders() });
        refreshContextFn();
    } catch (e) { /* silent */ }
}

/**
 * Reward (upvote/downvote) a scratchpad note.
 *
 * @param {number} index - Index of the scratchpad note
 * @param {number} delta - Reward delta (+1 or -1)
 * @param {object} deps  - { refreshContextFn, ctxTabPrompt, refreshPromptPreviewFn }
 */
export async function rewardNote(index, delta, deps) {
    const { refreshContextFn, ctxTabPrompt, refreshPromptPreviewFn } = deps;
    try {
        await fetch(`/scratchpad/${index}/reward`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ delta }),
        });
        refreshContextFn();
        if (ctxTabPrompt.style.display !== 'none') refreshPromptPreviewFn();
    } catch (e) { /* silent */ }
}

/**
 * Refresh the prompt preview panel.
 *
 * @param {object} deps - { ctxTokenEst, promptPreview }
 */
export async function refreshPromptPreview(deps) {
    const { ctxTokenEst, promptPreview } = deps;
    try {
        const res = await fetch('/prompt-preview', { headers: authHeaders() });
        const data = await res.json();

        ctxTokenEst.textContent = `~${data.token_estimate} tokens`;

        promptPreview.innerHTML = data.sections.map(s => {
            const chars = s.content.length;
            return `<div class="prompt-section" data-id="${s.id}">
                <div class="prompt-section-hdr" onclick="this.parentElement.classList.toggle('open')">
                    <span class="label">${escapeHtml(s.label)}</span>
                    <span class="chars">${chars} chars</span>
                </div>
                <div class="prompt-section-body">${escapeHtml(s.content)}</div>
            </div>`;
        }).join('');
    } catch (e) { /* silent */ }
}
