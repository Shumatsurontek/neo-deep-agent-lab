import { initSession, authHeaders } from './services/api.js';
import { sendChatMessage, resetChat, loadHistory } from './services/chat.js';
import { refreshContext, addUserContext, removeUserContext, rewardNote, refreshPromptPreview } from './services/context.js';
import { loadProviders, onProviderChange, onModelChange } from './services/providers.js';
import { loadHitlStatus, toggleHitl, hitlDecide, setHitlPendingActions, getHitlPendingActions } from './services/hitl.js';
import { scrollToBottom, appendUserBubble, createAssistantGroup, createToolStep, finalizeToolStep, getLastAssistantGroup } from './components/chat-dom.js';
import { showModal as showHitlModalDOM, hideModal as hideHitlModal, toggleEdit as hitlToggleEditDOM, isEditing as isHitlEditing } from './components/hitl-modal.js';
import { renderMarkdown, escapeHtml } from './utils/markdown.js';

/* ── DOM references ──────────────────────────── */
const elements = {
    chat: document.getElementById('chat'),
    inputEl: document.getElementById('input'),
    sendBtn: document.getElementById('sendBtn'),
    statusDot: document.getElementById('statusDot'),
    statusLabel: document.getElementById('statusLabel'),
    providerSelect: document.getElementById('providerSelect'),
    modelSelect: document.getElementById('modelSelect'),
    providerStatus: document.getElementById('providerStatus'),
    hitlTrack: document.getElementById('hitlTrack'),
    ctxSidebar: document.getElementById('ctxSidebar'),
    ctxToggle: document.getElementById('ctxToggle'),
    ctxInput: document.getElementById('ctxInput'),
    ctxSchemaList: document.getElementById('ctxSchemaList'),
    ctxSchemaCount: document.getElementById('ctxSchemaCount'),
    ctxUserList: document.getElementById('ctxUserList'),
    ctxUserCount: document.getElementById('ctxUserCount'),
    ctxScratchpadList: document.getElementById('ctxScratchpadList'),
    ctxNoteCount: document.getElementById('ctxNoteCount'),
    rewardStats: document.getElementById('rewardStats'),
    rwAvg: document.getElementById('rwAvg'),
    rwPos: document.getElementById('rwPos'),
    rwNeg: document.getElementById('rwNeg'),
    ctxRecallList: document.getElementById('ctxRecallList'),
    ctxRecallCount: document.getElementById('ctxRecallCount'),
    ctxSummary: document.getElementById('ctxSummary'),
    ctxSummaryStatus: document.getElementById('ctxSummaryStatus'),
    ctxTokenEst: document.getElementById('ctxTokenEst'),
    promptPreview: document.getElementById('promptPreview'),
    ctxTabLive: document.getElementById('ctxTabLive'),
    ctxTabPrompt: document.getElementById('ctxTabPrompt'),
    hitlOverlay: document.getElementById('hitlOverlay'),
    hitlQuery: document.getElementById('hitlQuery'),
    hitlEditArea: document.getElementById('hitlEditArea'),
    hitlDescription: document.getElementById('hitlDescription'),
};

/* ── Streaming state ─────────────────────────── */
let isStreaming = false;

function setStatus(state) {
    elements.statusDot.className = state === 'streaming' ? 'status-dot streaming' : 'status-dot';
    elements.statusLabel.textContent = state === 'streaming' ? 'streaming' : 'ready';
}

/* ── Bound helper functions (closures over elements) ── */

function boundAppendUserBubble(text) {
    appendUserBubble(elements.chat, text);
}

function boundCreateAssistantGroup() {
    return createAssistantGroup(elements.chat);
}

function boundCreateToolStep(toolName, stepsEl) {
    return createToolStep(toolName, stepsEl, { chat: elements.chat });
}

function boundFinalizeToolStep(step, toolOutput, toolInput) {
    return finalizeToolStep(step, toolOutput, toolInput, { chat: elements.chat });
}

function boundScrollToBottom() {
    scrollToBottom(elements.chat);
}

function boundGetLastAssistantGroup() {
    return getLastAssistantGroup(elements.chat);
}

function boundRefreshContext() {
    refreshContext(contextDeps);
}

function boundRefreshPromptPreview() {
    refreshPromptPreview(promptDeps);
}

function boundShowHitlModal(actionRequests, reviewConfigs) {
    setHitlPendingActions(actionRequests);
    showHitlModalDOM(actionRequests, reviewConfigs, {
        hitlOverlay: elements.hitlOverlay,
        hitlQuery: elements.hitlQuery,
        hitlEditArea: elements.hitlEditArea,
        hitlDescription: elements.hitlDescription,
    });
}

/* ── Deps objects for services ───────────────── */

const contextDeps = {
    ctxSchemaList: elements.ctxSchemaList,
    ctxSchemaCount: elements.ctxSchemaCount,
    ctxUserList: elements.ctxUserList,
    ctxUserCount: elements.ctxUserCount,
    ctxScratchpadList: elements.ctxScratchpadList,
    ctxNoteCount: elements.ctxNoteCount,
    rewardStats: elements.rewardStats,
    rwAvg: elements.rwAvg,
    rwPos: elements.rwPos,
    rwNeg: elements.rwNeg,
    ctxRecallList: elements.ctxRecallList,
    ctxRecallCount: elements.ctxRecallCount,
    ctxSummary: elements.ctxSummary,
    ctxSummaryStatus: elements.ctxSummaryStatus,
};

const promptDeps = {
    ctxTokenEst: elements.ctxTokenEst,
    promptPreview: elements.promptPreview,
};

const providerDeps = {
    providerSelect: elements.providerSelect,
    modelSelect: elements.modelSelect,
    providerStatus: elements.providerStatus,
    sendBtn: elements.sendBtn,
};

const hitlDeps = {
    hitlTrack: elements.hitlTrack,
};

const chatDeps = {
    chat: elements.chat,
    inputEl: elements.inputEl,
    sendBtn: elements.sendBtn,
    setIsStreaming: (v) => { isStreaming = v; },
    getIsStreaming: () => isStreaming,
    setStatus,
    appendUserBubble: boundAppendUserBubble,
    createAssistantGroup: boundCreateAssistantGroup,
    createToolStep: boundCreateToolStep,
    finalizeToolStep: boundFinalizeToolStep,
    showHitlModal: boundShowHitlModal,
    scrollToBottom: boundScrollToBottom,
    refreshContext: boundRefreshContext,
    refreshPromptPreview: boundRefreshPromptPreview,
    ctxTabPrompt: elements.ctxTabPrompt,
    renderMarkdown,
};

const hitlDecideDeps = {
    hitlOverlay: elements.hitlOverlay,
    hitlEditArea: elements.hitlEditArea,
    getHitlEditing: () => isHitlEditing(),
    getHitlPendingActions,
    getLastAssistantGroup: boundGetLastAssistantGroup,
    createToolStep: boundCreateToolStep,
    finalizeToolStep: boundFinalizeToolStep,
    scrollToBottom: boundScrollToBottom,
    showHitlModal: boundShowHitlModal,
    setIsStreaming: (v) => { isStreaming = v; },
    sendBtn: elements.sendBtn,
    setStatus,
    inputEl: elements.inputEl,
    refreshContext: boundRefreshContext,
    refreshPromptPreview: boundRefreshPromptPreview,
    ctxTabPrompt: elements.ctxTabPrompt,
    chat: elements.chat,
};

/* ── Wire up event handlers ──────────────────── */

// Form submission / send button
window.sendMessage = (e) => {
    e.preventDefault();
    const text = elements.inputEl.value.trim();
    sendChatMessage(text, chatDeps);
};

// Reset chat
window.resetChat = () => {
    resetChat({ chat: elements.chat, refreshContext: boundRefreshContext });
};

// Context sidebar toggle
window.toggleCtxSidebar = () => {
    elements.ctxSidebar.classList.toggle('open');
    elements.ctxToggle.classList.toggle('active', elements.ctxSidebar.classList.contains('open'));
    if (elements.ctxSidebar.classList.contains('open')) {
        boundRefreshContext();
        boundRefreshPromptPreview();
    }
};

// Context sidebar tab switching
window.switchCtxTab = (tab) => {
    document.querySelectorAll('.ctx-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    elements.ctxTabLive.style.display = tab === 'live' ? '' : 'none';
    elements.ctxTabPrompt.style.display = tab === 'prompt' ? '' : 'none';
    if (tab === 'prompt') boundRefreshPromptPreview();
};

// Add user context
window.addUserContext = () => {
    addUserContext({ ctxInput: elements.ctxInput, refreshContextFn: boundRefreshContext });
};

// Remove user context by index
window.removeUserContext = (index) => {
    removeUserContext(index, boundRefreshContext);
};

// Reward a scratchpad note
window.rewardNote = (index, delta) => {
    rewardNote(index, delta, {
        refreshContextFn: boundRefreshContext,
        ctxTabPrompt: elements.ctxTabPrompt,
        refreshPromptPreviewFn: boundRefreshPromptPreview,
    });
};

// Provider switching
window.onProviderChange = () => { onProviderChange(providerDeps); };
window.onModelChange = () => { onModelChange(providerDeps); };

// HITL toggle
window.toggleHitl = () => { toggleHitl(hitlDeps); };

// HITL modal decisions
window.hitlDecide = (type) => { hitlDecide(type, hitlDecideDeps); };

// HITL toggle edit
window.hitlToggleEdit = () => {
    hitlToggleEditDOM({
        hitlEditArea: elements.hitlEditArea,
        hitlQuery: elements.hitlQuery,
    });
};

// scrollToBottom needs to be global for onload handlers in chart images
window.scrollToBottom = boundScrollToBottom;

// Context input enter key
elements.ctxInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); window.addUserContext(); }
});

/* ── Init ────────────────────────────────────── */
(async () => {
    await initSession();
    loadProviders(providerDeps);
    loadHistory({
        chat: elements.chat,
        appendUserBubble: boundAppendUserBubble,
        createAssistantGroup: boundCreateAssistantGroup,
        createToolStep: boundCreateToolStep,
        finalizeToolStep: boundFinalizeToolStep,
        scrollToBottom: boundScrollToBottom,
        renderMarkdown,
    });
    loadHitlStatus(hitlDeps);
    boundRefreshContext();
    elements.inputEl.focus();
})();
