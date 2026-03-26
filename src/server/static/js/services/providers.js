import { authHeaders } from './api.js';

let providersData = [];
let currentProvider = '';
let currentModel = '';

/**
 * Load available providers and populate the provider select.
 *
 * @param {object} deps - { providerSelect, modelSelect }
 */
export async function loadProviders(deps) {
    const { providerSelect, modelSelect } = deps;
    try {
        const res = await fetch('/providers', { headers: authHeaders() });
        const data = await res.json();
        providersData = data.providers;
        currentProvider = data.current.provider;
        currentModel = data.current.model;
        providerSelect.innerHTML = '';
        for (const p of providersData) {
            const opt = document.createElement('option');
            opt.value = p.id;
            const noModels = p.available === false || p.models.length === 0;
            opt.textContent = p.name + (noModels ? ' (offline)' : ` (${p.models.length})`);
            opt.disabled = noModels;
            if (p.id === currentProvider && !noModels) opt.selected = true;
            providerSelect.appendChild(opt);
        }
        populateModels(currentProvider, currentModel, modelSelect);
    } catch (e) { /* silent */ }
}

/**
 * Populate the model select for a given provider.
 *
 * @param {string}      providerId    - Provider ID
 * @param {string}      selectedModel - Model to mark as selected
 * @param {HTMLElement}  modelSelect   - The model <select> element
 */
export function populateModels(providerId, selectedModel, modelSelect) {
    const provider = providersData.find(p => p.id === providerId);
    if (!provider) return;
    modelSelect.innerHTML = '';
    for (const m of provider.models) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === selectedModel) opt.selected = true;
        modelSelect.appendChild(opt);
    }
}

/**
 * Handle provider <select> change.
 *
 * @param {object} deps - { providerSelect, modelSelect, providerStatus, sendBtn }
 */
export function onProviderChange(deps) {
    const { providerSelect, modelSelect, providerStatus, sendBtn } = deps;
    const newProvider = providerSelect.value;
    const provider = providersData.find(p => p.id === newProvider);
    if (!provider) return;
    populateModels(newProvider, provider.models[0], modelSelect);
    switchProvider(newProvider, provider.models[0], deps);
}

/**
 * Handle model <select> change.
 *
 * @param {object} deps - { providerSelect, modelSelect, providerStatus, sendBtn }
 */
export function onModelChange(deps) {
    const { providerSelect, modelSelect } = deps;
    switchProvider(providerSelect.value, modelSelect.value, deps);
}

/**
 * Switch the active provider and model on the server.
 *
 * @param {string} provider - Provider ID
 * @param {string} model    - Model name
 * @param {object} deps     - { providerStatus, sendBtn }
 */
export async function switchProvider(provider, model, deps) {
    const { providerStatus, sendBtn } = deps;
    if (provider === currentProvider && model === currentModel) return;
    providerStatus.style.display = 'inline';
    sendBtn.disabled = true;
    try {
        const res = await fetch('/provider', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ provider, model }),
        });
        const data = await res.json();
        if (data.status === 'ok') {
            currentProvider = data.provider;
            currentModel = data.model;
        }
    } catch (e) { /* silent */ }
    providerStatus.style.display = 'none';
    sendBtn.disabled = false;
}

/**
 * Expose current state for external reads.
 */
export function getProvidersState() {
    return { providersData, currentProvider, currentModel };
}
