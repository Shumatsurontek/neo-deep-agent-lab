/**
 * SSE event handler (shared between chat and resume).
 *
 * @param {object} ev        - Parsed SSE event
 * @param {object} g         - Assistant group { textEl, stepsEl }
 * @param {object} state     - Mutable stream state { fullText, activeTools, toolIdx, interrupted }
 * @param {object} callbacks - { createToolStep, finalizeToolStep, showHitlModal, scrollToBottom, renderMarkdown, escapeHtml }
 */
export function handleSSEEvent(ev, g, state, callbacks) {
    const { createToolStep, finalizeToolStep, showHitlModal, scrollToBottom, renderMarkdown, escapeHtml } = callbacks;

    switch (ev.type) {
        case 'text-delta':
            state.fullText += ev.content;
            g.textEl.innerHTML = renderMarkdown(state.fullText);
            scrollToBottom();
            break;
        case 'tool-call-start': {
            const key = ev.tool_name + '_' + (state.toolIdx++);
            state.activeTools[key] = { step: createToolStep(ev.tool_name, g.stepsEl), name: ev.tool_name };
            break;
        }
        case 'tool-call-end': {
            const mk = Object.keys(state.activeTools).find(k => state.activeTools[k].name === ev.tool_name);
            if (mk) { finalizeToolStep(state.activeTools[mk].step, ev.tool_output || '', ev.tool_input || null); delete state.activeTools[mk]; }
            break;
        }
        case 'interrupt-request':
            // Flag that we're paused for HITL -- don't cleanup active tools
            state.interrupted = true;
            showHitlModal(ev.action_requests, ev.review_configs);
            break;
        case 'error':
            g.textEl.innerHTML += `<div class="msg-error">${escapeHtml(ev.message)}</div>`;
            break;
        case 'done': break;
    }
}

/**
 * Read an SSE stream from a fetch Response and dispatch events.
 *
 * @param {Response} response - fetch Response with readable body
 * @param {object}   g        - Assistant group { textEl, stepsEl }
 * @param {object}   state    - Mutable stream state
 * @param {object}   callbacks - Same callbacks object as handleSSEEvent
 */
export async function readSSEStream(response, g, state, callbacks) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let ev;
            try { ev = JSON.parse(line.slice(6)); } catch { continue; }
            handleSSEEvent(ev, g, state, callbacks);
        }
    }
}
