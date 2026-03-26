/**
 * HITL modal DOM management.
 * `deps` must provide: hitlOverlay, hitlQuery, hitlEditArea, hitlDescription
 */

let hitlEditing = false;

export function showModal(actionRequests, reviewConfigs, deps) {
    hitlEditing = false;
    deps.hitlEditArea.style.display = 'none';
    deps.hitlQuery.style.display = 'block';

    if (actionRequests.length > 0) {
        const action = actionRequests[0];
        deps.hitlDescription.textContent = action.description || '';
        const query = action.args?.query || JSON.stringify(action.args, null, 2);
        deps.hitlQuery.textContent = query;
        deps.hitlEditArea.value = query;
    }
    deps.hitlOverlay.classList.add('open');
}

export function hideModal(deps) {
    deps.hitlOverlay.classList.remove('open');
}

export function toggleEdit(deps) {
    hitlEditing = !hitlEditing;
    deps.hitlEditArea.style.display = hitlEditing ? 'block' : 'none';
    deps.hitlQuery.style.display = hitlEditing ? 'none' : 'block';
    if (hitlEditing) deps.hitlEditArea.focus();
}

export function isEditing() {
    return hitlEditing;
}
