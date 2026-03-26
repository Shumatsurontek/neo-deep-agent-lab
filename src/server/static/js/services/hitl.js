import { authHeaders } from './api.js';
import { readSSEStream } from '../utils/sse.js';
import { escapeHtml, renderMarkdown } from '../utils/markdown.js';

let hitlEnabled = false;
let hitlPendingActions = [];

/**
 * Load HITL status from the server.
 *
 * @param {object} deps - { hitlTrack }
 */
export async function loadHitlStatus(deps) {
    const { hitlTrack } = deps;
    try {
        const res = await fetch('/hitl', { headers: authHeaders() });
        const data = await res.json();
        hitlEnabled = data.enabled;
        hitlTrack.classList.toggle('on', hitlEnabled);
    } catch (e) { /* silent */ }
}

/**
 * Toggle HITL on/off.
 *
 * @param {object} deps - { hitlTrack }
 */
export async function toggleHitl(deps) {
    const { hitlTrack } = deps;
    hitlEnabled = !hitlEnabled;
    hitlTrack.classList.toggle('on', hitlEnabled);
    try {
        await fetch('/hitl', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ enabled: hitlEnabled }),
        });
    } catch (e) {
        hitlEnabled = !hitlEnabled;
        hitlTrack.classList.toggle('on', hitlEnabled);
    }
}

/**
 * Handle HITL decision (approve/reject/edit) and resume the agent stream.
 *
 * @param {string} type - Decision type: 'approve', 'reject', or 'edit'
 * @param {object} deps - {
 *   hitlOverlay, hitlEditArea, getHitlEditing, getHitlPendingActions,
 *   getLastAssistantGroup, createToolStep, finalizeToolStep, scrollToBottom,
 *   showHitlModal, setIsStreaming, sendBtn, setStatus, inputEl,
 *   refreshContext, refreshPromptPreview, ctxTabPrompt, chat
 * }
 */
export async function hitlDecide(type, deps) {
    const {
        hitlOverlay, hitlEditArea,
        getHitlEditing, getHitlPendingActions,
        getLastAssistantGroup, createToolStep, finalizeToolStep, scrollToBottom,
        showHitlModal, setIsStreaming, sendBtn, setStatus, inputEl,
        refreshContext, refreshPromptPreview, ctxTabPrompt, chat,
    } = deps;

    hitlOverlay.classList.remove('open');
    const pendingActions = getHitlPendingActions();

    let decisions;
    if (type === 'approve') {
        decisions = [{ type: 'approve' }];
    } else if (type === 'reject') {
        decisions = [{ type: 'reject', message: 'Utilisateur a rejete la requete.' }];
    } else if (type === 'edit' || getHitlEditing()) {
        const action = pendingActions[0];
        decisions = [{
            type: 'edit',
            edited_action: {
                name: action.name,
                args: { ...action.args, query: hitlEditArea.value }
            }
        }];
    }

    // Resume agent -- reuse stashed group and state from the interrupted stream
    const g = window._hitlPendingGroup || getLastAssistantGroup();
    const state = window._hitlPendingState || { fullText: '', activeTools: {}, toolIdx: 0, interrupted: false };
    state.interrupted = false;
    window._hitlPendingGroup = null;
    window._hitlPendingState = null;

    const callbacks = { createToolStep, finalizeToolStep, showHitlModal, scrollToBottom, renderMarkdown, escapeHtml };

    try {
        const res = await fetch('/resume', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ decisions }),
        });
        await readSSEStream(res, g, state, callbacks);
    } catch (e) { /* silent */ }

    for (const [, entry] of Object.entries(state.activeTools)) finalizeToolStep(entry.step, '(no result)', null);

    g.textEl.classList.remove('typing');
    setIsStreaming(false);
    sendBtn.disabled = false;
    setStatus('ready');
    inputEl.focus();
    refreshContext();
    if (ctxTabPrompt.style.display !== 'none') refreshPromptPreview();
}

export function setHitlPendingActions(actions) {
    hitlPendingActions = actions;
}

export function getHitlPendingActions() {
    return hitlPendingActions;
}

export function isHitlEnabled() {
    return hitlEnabled;
}
