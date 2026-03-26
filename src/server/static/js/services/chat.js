import { authHeaders, setToken } from './api.js';
import { readSSEStream } from '../utils/sse.js';
import { escapeHtml, renderMarkdown } from '../utils/markdown.js';

/**
 * Send a chat message and stream the response.
 *
 * @param {string} text - User message text
 * @param {object} deps - {
 *   chat, inputEl, sendBtn, isStreaming (getter/setter),
 *   setStatus, appendUserBubble, createAssistantGroup, createToolStep,
 *   finalizeToolStep, showHitlModal, scrollToBottom,
 *   refreshContext, refreshPromptPreview, ctxTabPrompt
 * }
 */
export async function sendChatMessage(text, deps) {
    const {
        chat, inputEl, sendBtn,
        setIsStreaming, getIsStreaming,
        setStatus, appendUserBubble, createAssistantGroup,
        createToolStep, finalizeToolStep, showHitlModal, scrollToBottom,
        refreshContext, refreshPromptPreview, ctxTabPrompt,
    } = deps;

    if (!text || getIsStreaming()) return;

    setIsStreaming(true);
    sendBtn.disabled = true;
    inputEl.value = '';
    setStatus('streaming');

    appendUserBubble(text);
    const g = createAssistantGroup();
    g.textEl.classList.add('typing');

    const state = { fullText: '', activeTools: {}, toolIdx: 0, interrupted: false };

    const callbacks = { createToolStep, finalizeToolStep, showHitlModal, scrollToBottom, renderMarkdown, escapeHtml };

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ message: text }),
        });
        await readSSEStream(res, g, state, callbacks);
    } catch (err) {
        g.textEl.innerHTML += `<div class="msg-error">network: ${escapeHtml(err.message)}</div>`;
    }

    if (state.interrupted) {
        // HITL pause -- keep tools running, stash state for resume
        window._hitlPendingState = state;
        window._hitlPendingGroup = g;
        return;
    }

    for (const [, entry] of Object.entries(state.activeTools)) finalizeToolStep(entry.step, '(no result)', null);

    g.textEl.classList.remove('typing');
    setIsStreaming(false);
    sendBtn.disabled = false;
    setStatus('ready');
    inputEl.focus();

    // Auto-refresh context sidebar after agent response
    refreshContext();
    if (ctxTabPrompt.style.display !== 'none') refreshPromptPreview();
}

/**
 * Reset the chat session.
 *
 * @param {object} deps - { chat, refreshContext }
 */
export async function resetChat(deps) {
    const { chat, refreshContext } = deps;
    const resetRes = await fetch('/reset', { method: 'POST', headers: authHeaders() });
    const resetData = await resetRes.json();
    if (resetData.token) setToken(resetData.token);
    chat.innerHTML = `<div class="welcome"><h2>Deep Agent Lab</h2><p>Conversation reinitialisee.</p></div>`;
    refreshContext();
}

/**
 * Load conversation history and rebuild the chat DOM.
 *
 * @param {object} deps - {
 *   chat, appendUserBubble, createAssistantGroup,
 *   createToolStep, finalizeToolStep, scrollToBottom, renderMarkdown
 * }
 */
export async function loadHistory(deps) {
    const {
        chat, appendUserBubble, createAssistantGroup,
        createToolStep, finalizeToolStep, scrollToBottom,
    } = deps;

    try {
        const res = await fetch('/history', { headers: authHeaders() });
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
            chat.innerHTML = '';
            let currentGroup = null;
            // Map tool_call_id -> step for pairing calls with results
            const pendingSteps = {};

            for (const msg of data.messages) {
                if (msg.role === 'user') {
                    appendUserBubble(msg.content);
                    currentGroup = null;
                } else if (msg.role === 'tool_call') {
                    // Start a new assistant group if needed
                    if (!currentGroup) currentGroup = createAssistantGroup();
                    const step = createToolStep(msg.tool_name, currentGroup.stepsEl);
                    if (msg.tool_call_id) pendingSteps[msg.tool_call_id] = { step, input: msg.tool_input };
                } else if (msg.role === 'tool_result') {
                    if (!currentGroup) currentGroup = createAssistantGroup();
                    const pending = msg.tool_call_id && pendingSteps[msg.tool_call_id];
                    if (pending) {
                        finalizeToolStep(pending.step, msg.tool_output || '', pending.input || null);
                        delete pendingSteps[msg.tool_call_id];
                    } else {
                        // Orphan tool result -- create step inline
                        const step = createToolStep(msg.tool_name, currentGroup.stepsEl);
                        finalizeToolStep(step, msg.tool_output || '', null);
                    }
                } else if (msg.role === 'assistant') {
                    if (!currentGroup) currentGroup = createAssistantGroup();
                    currentGroup.textEl.innerHTML = renderMarkdown(msg.content);
                    currentGroup = null;
                }
            }
            // Finalize any orphaned tool steps
            for (const [, p] of Object.entries(pendingSteps)) {
                finalizeToolStep(p.step, '(no result)', p.input || null);
            }
            scrollToBottom();
        }
    } catch (e) { /* silent */ }
}
