import { findTrackerEntryName, normalizeTrackerEntry, normalizeTrackerUserState } from './engines.js';
import { normalizeWorldState } from './world-state.js';

export const SCENE_ITEM_LIMIT = 40;

const DELTA_LIST_FIELDS = Object.freeze([
    'gearAdd',
    'gearRemove',
    'inventoryAdd',
    'inventoryRemove',
]);

export function buildSceneItemStateKey(worldState = {}) {
    const state = normalizeWorldState(worldState);
    if (!state.positionEstablished && !state.reputationLocation && !state.place && !state.area) {
        return 'unknown-scene';
    }
    return [
        state.reputationLocation || '(none)',
        state.place || '(none)',
        state.area || '(none)',
        state.indoors ? 'indoors' : 'outdoors',
    ].map(normalizeKeyPart).join('|');
}

export function normalizeSceneItemState(value = {}, worldState = null) {
    const source = value && typeof value === 'object' ? value : {};
    const expectedKey = worldState == null ? '' : buildSceneItemStateKey(worldState);
    const storedKey = cleanSceneKey(source.sceneKey);
    const sceneKey = expectedKey || storedKey || 'unknown-scene';
    const keyChanged = Boolean(expectedKey && storedKey && expectedKey !== storedKey);
    const items = keyChanged ? [] : normalizeSceneItems(source.items);
    return {
        sceneKey,
        initialized: keyChanged ? false : source.initialized === true,
        items,
    };
}

export function sceneItemStateForModel(value = {}, worldState = null) {
    const state = normalizeSceneItemState(value, worldState);
    return {
        sceneKey: state.sceneKey,
        initialized: state.initialized,
        items: state.items.map(item => ({ name: item.name, evidence: item.evidence })),
    };
}

export function findSceneItemMatch(value, requestedItem, worldState = null) {
    const state = normalizeSceneItemState(value, worldState);
    const match = findUniqueItemMatch(state.items.map(item => item.name), requestedItem);
    if (!match) return null;
    const stored = state.items.find(item => normalizeItemKey(item.name) === normalizeItemKey(match))
        || state.items.find(item => itemNamesMatch(item.name, match));
    return stored ? { ...stored } : null;
}

export function reconcilePostNarrationPossessionDelta({
    snapshot = {},
    delta = {},
    narration = '',
    itemUse = {},
    worldState = null,
    userNames = [],
} = {}) {
    const audit = [];
    const userBefore = normalizeTrackerUserState(snapshot?.user || {});
    const npcsBefore = normalizeNpcSnapshot(snapshot?.npcs || {});
    const sceneBefore = normalizeSceneItemState(snapshot?.sceneItems || {}, worldState || snapshot?.worldState || {});
    const result = {
        ...delta,
        user: cloneActorDelta(delta?.user),
        npcs: Array.isArray(delta?.npcs)
            ? delta.npcs.map(item => cloneActorDelta(item, item?.NPC))
            : [],
        sceneItems: cloneSceneItemDelta(delta?.sceneItems),
    };

    canonicalizeActorRemovals(result.user, userBefore, 'user', audit);
    for (const npcDelta of result.npcs) {
        const currentName = findTrackerEntryName(npcsBefore, npcDelta?.NPC);
        if (currentName) npcDelta.NPC = currentName;
        canonicalizeActorRemovals(
            npcDelta,
            currentName ? npcsBefore[currentName] : {},
            currentName || npcDelta?.NPC || 'NPC',
            audit,
        );
    }

    groundUserDelta(result.user, {
        before: userBefore,
        narration,
        itemUse,
        userNames,
        audit,
    });
    groundNpcDeltas(result.npcs, {
        before: npcsBefore,
        narration,
        userDelta: result.user,
        audit,
    });
    reconcileUserEquipmentMoves(result.user, userBefore, narration, userNames, audit);
    reconcileNpcEquipmentMoves(result.npcs, npcsBefore, narration, audit);
    reconcileActorTransfers(result, {
        userBefore,
        npcsBefore,
        narration,
        userNames,
        audit,
    });
    reconcileDuplicateActorChanges(result.user, audit, 'user');
    for (const npcDelta of result.npcs) {
        reconcileDuplicateActorChanges(npcDelta, audit, npcDelta?.NPC || 'NPC');
    }

    const sceneDelta = groundSceneItemDelta({
        before: sceneBefore,
        proposed: result.sceneItems,
        narration,
        itemUse,
        userDelta: result.user,
        npcDeltas: result.npcs,
        userBefore,
        npcsBefore,
        audit,
    });
    result.sceneItems = sceneDelta;
    const sceneItems = applySceneItemDelta(sceneBefore, sceneDelta, narration);

    return { delta: result, sceneItems, audit };
}

function groundUserDelta(userDelta, { before, narration, itemUse, userNames, audit }) {
    for (const field of ['inventoryAdd', 'gearAdd']) {
        const kind = field === 'gearAdd' ? 'gear_add' : 'inventory_add';
        userDelta[field] = cleanItemList(userDelta[field]).filter(item => {
            if (trackerListHas(before[field === 'gearAdd' ? 'gear' : 'inventory'], item)) return false;
            if (itemUseBlocksAddition(itemUse, item)) {
                audit.push(`POSSESSION rejected ${field}=${item}: pre-narration item authority marked the attempted item unavailable`);
                return false;
            }
            if (!narrationSupportsUserChange(narration, item, kind, userNames)) {
                audit.push(`POSSESSION rejected ${field}=${item}: final narration does not establish the user possession change`);
                return false;
            }
            return true;
        });
    }

    for (const field of ['inventoryRemove', 'gearRemove']) {
        const kind = field === 'gearRemove' ? 'gear_remove' : 'inventory_remove';
        userDelta[field] = cleanItemList(userDelta[field]).filter(item => {
            if (field === 'inventoryRemove' && narrationRetainsUserPossession(narration, item, userNames)) {
                audit.push(`POSSESSION rejected ${field}=${item}: final narration keeps the item in user possession`);
                return false;
            }
            if (!narrationSupportsUserChange(narration, item, kind, userNames)
                && !pairedUserEquipmentMove(userDelta, item, field)) {
                audit.push(`POSSESSION rejected ${field}=${item}: final narration does not establish the user possession change`);
                return false;
            }
            return true;
        });
    }
}

function groundNpcDeltas(npcDeltas, { before, narration, userDelta, audit }) {
    for (const npcDelta of npcDeltas) {
        const name = String(npcDelta?.NPC || '').trim();
        const state = before[name] || {};
        for (const field of ['inventoryAdd', 'gearAdd']) {
            const kind = field === 'gearAdd' ? 'gear_add' : 'inventory_add';
            npcDelta[field] = cleanItemList(npcDelta[field]).filter(item => {
                if (trackerListHas(state[field === 'gearAdd' ? 'gear' : 'inventory'], item)) return false;
                const pairedUserRemove = actorDeltaHasItem(userDelta, ['inventoryRemove', 'gearRemove'], item);
                if (!pairedUserRemove && !narrationSupportsNpcChange(narration, name, item, kind)) {
                    audit.push(`POSSESSION rejected ${name}.${field}=${item}: final narration does not establish the NPC possession change`);
                    return false;
                }
                return true;
            });
        }
        for (const field of ['inventoryRemove', 'gearRemove']) {
            const kind = field === 'gearRemove' ? 'gear_remove' : 'inventory_remove';
            npcDelta[field] = cleanItemList(npcDelta[field]).filter(item => {
                if (field === 'inventoryRemove' && narrationRetainsNpcPossession(narration, name, item)) {
                    audit.push(`POSSESSION rejected ${name}.${field}=${item}: final narration keeps the item in that NPC's possession`);
                    return false;
                }
                const pairedUserAdd = actorDeltaHasItem(userDelta, ['inventoryAdd', 'gearAdd'], item);
                const pairedEquipmentMove = pairedActorEquipmentMove(npcDelta, item, field);
                if (!pairedUserAdd && !pairedEquipmentMove && !narrationSupportsNpcChange(narration, name, item, kind)) {
                    audit.push(`POSSESSION rejected ${name}.${field}=${item}: final narration does not establish the NPC possession change`);
                    return false;
                }
                return true;
            });
        }
    }
}

function reconcileNpcEquipmentMoves(npcDeltas, before, narration, audit) {
    for (const delta of npcDeltas) {
        const name = String(delta?.NPC || '').trim();
        const state = before[name] || {};
        for (const item of [...delta.gearAdd]) {
            const inventoryMatch = findUniqueItemMatch(state.inventory, item);
            if (!inventoryMatch) continue;
            if (!narrationSupportsNpcChange(narration, name, item, 'gear_add')) {
                removeMatchingDeltaItem(delta.gearAdd, item);
                audit.push(`POSSESSION rejected ${name}.gearAdd=${item}: existing inventory item was not explicitly equipped`);
                continue;
            }
            removeMatchingDeltaItem(delta.gearAdd, item);
            addUniqueItem(delta.gearAdd, inventoryMatch);
            addUniqueItem(delta.inventoryRemove, inventoryMatch);
        }
        for (const item of [...delta.inventoryAdd]) {
            const gearMatch = findUniqueItemMatch(state.gear, item);
            if (!gearMatch) continue;
            if (!narrationSupportsNpcChange(narration, name, item, 'inventory_add')
                || !narrationSupportsNpcEquipmentStow(narration, name, item)) {
                removeMatchingDeltaItem(delta.inventoryAdd, item);
                audit.push(`POSSESSION rejected ${name}.inventoryAdd=${item}: existing gear item was not explicitly stowed or unequipped`);
                continue;
            }
            removeMatchingDeltaItem(delta.inventoryAdd, item);
            addUniqueItem(delta.inventoryAdd, gearMatch);
            addUniqueItem(delta.gearRemove, gearMatch);
        }
    }
}

function reconcileUserEquipmentMoves(delta, before, narration, userNames, audit) {
    for (const item of [...delta.gearAdd]) {
        const inventoryMatch = findUniqueItemMatch(before.inventory, item);
        if (!inventoryMatch) continue;
        if (!narrationSupportsUserChange(narration, item, 'gear_add', userNames)) {
            removeMatchingDeltaItem(delta.gearAdd, item);
            audit.push(`POSSESSION rejected gearAdd=${item}: existing inventory item was not explicitly equipped`);
            continue;
        }
        removeMatchingDeltaItem(delta.gearAdd, item);
        addUniqueItem(delta.gearAdd, inventoryMatch);
        addUniqueItem(delta.inventoryRemove, inventoryMatch);
    }
    for (const item of [...delta.inventoryAdd]) {
        const gearMatch = findUniqueItemMatch(before.gear, item);
        if (!gearMatch) continue;
        if (!narrationSupportsUserChange(narration, item, 'inventory_add', userNames)
            || !narrationSupportsEquipmentStow(narration, item, userNames)) {
            removeMatchingDeltaItem(delta.inventoryAdd, item);
            audit.push(`POSSESSION rejected inventoryAdd=${item}: existing gear item was not explicitly stowed or unequipped`);
            continue;
        }
        removeMatchingDeltaItem(delta.inventoryAdd, item);
        addUniqueItem(delta.inventoryAdd, gearMatch);
        addUniqueItem(delta.gearRemove, gearMatch);
    }
}

function reconcileActorTransfers(result, { userBefore, npcsBefore, narration, userNames, audit }) {
    for (const item of [...result.user.inventoryAdd, ...result.user.gearAdd]) {
        const matches = [];
        for (const [NPC, state] of Object.entries(npcsBefore)) {
            for (const field of ['gear', 'inventory']) {
                const stored = findUniqueItemMatch(state[field], item);
                if (stored) matches.push({ NPC, field, item: stored });
            }
        }
        if (matches.length !== 1) continue;
        const match = matches[0];
        if (!narrationSupportsNpcChange(narration, match.NPC, item, `${match.field}_remove`)) continue;
        const npcDelta = ensureNpcDelta(result.npcs, match.NPC);
        addUniqueItem(npcDelta[`${match.field}Remove`], match.item);
        audit.push(`POSSESSION paired ${match.NPC}.${match.field}Remove=${match.item} with user acquisition`);
    }

    for (const npcDelta of result.npcs) {
        for (const field of ['inventoryAdd', 'gearAdd']) {
            for (const item of npcDelta[field]) {
                for (const [userField, removeField] of [['inventory', 'inventoryRemove'], ['gear', 'gearRemove']]) {
                    const stored = findUniqueItemMatch(userBefore[userField], item);
                    if (!stored) continue;
                    if (!narrationSupportsUserChange(narration, stored, `${userField}_remove`, userNames)) continue;
                    addUniqueItem(result.user[removeField], stored);
                    audit.push(`POSSESSION paired user.${removeField}=${stored} with ${npcDelta.NPC}.${field}`);
                }
            }
        }
    }
}

function groundSceneItemDelta({ before, proposed, narration, itemUse, userDelta, npcDeltas, userBefore, npcsBefore, audit }) {
    const add = [];
    const remove = [];
    for (const item of cleanItemList(proposed?.add)) {
        const canonicalActorRemoval = findUniqueItemMatch([
            ...userDelta.inventoryRemove,
            ...userDelta.gearRemove,
            ...npcDeltas.flatMap(delta => [...delta.inventoryRemove, ...delta.gearRemove]),
        ], item);
        const sceneItem = canonicalActorRemoval || item;
        const actorAddition = actorDeltaHasItem(userDelta, ['inventoryAdd', 'gearAdd'], sceneItem)
            || npcDeltas.some(delta => actorDeltaHasItem(delta, ['inventoryAdd', 'gearAdd'], sceneItem));
        const existingOwner = canonicalActorRemoval
            ? ''
            : findExistingActorOwnership(userBefore, npcsBefore, sceneItem);
        if (actorAddition || existingOwner) {
            const reason = actorAddition ? 'the item remains with an actor' : `the item is already carried by ${existingOwner}`;
            audit.push(`SCENE_ITEM rejected add=${item}: ${reason}, not loose in the scene`);
            continue;
        }
        if (itemUseBlocksAddition(itemUse, sceneItem)) {
            audit.push(`SCENE_ITEM rejected add=${item}: pre-narration item authority marked the attempted item unavailable`);
            continue;
        }
        const evidence = findSceneItemEstablishment(narration, sceneItem);
        if (!evidence) {
            audit.push(`SCENE_ITEM rejected add=${item}: final narration does not establish a loose current-scene item`);
            continue;
        }
        addUniqueItem(add, sceneItem);
    }

    for (const item of cleanItemList(proposed?.remove)) {
        const stored = findUniqueItemMatch(before.items.map(entry => entry.name), item);
        if (!stored) {
            audit.push(`SCENE_ITEM rejected remove=${item}: no unique saved current-scene item matches`);
            continue;
        }
        const actorAcquired = actorDeltaHasItem(userDelta, ['inventoryAdd', 'gearAdd'], stored)
            || npcDeltas.some(delta => actorDeltaHasItem(delta, ['inventoryAdd', 'gearAdd'], stored));
        if (!actorAcquired && !findSceneItemRemoval(narration, stored)) {
            audit.push(`SCENE_ITEM rejected remove=${item}: final narration does not establish that the item left the scene`);
            continue;
        }
        addUniqueItem(remove, stored);
    }

    for (const actorDelta of [userDelta, ...npcDeltas]) {
        for (const item of [...actorDelta.inventoryAdd, ...actorDelta.gearAdd]) {
            const stored = findUniqueItemMatch(before.items.map(entry => entry.name), item);
            if (stored) addUniqueItem(remove, stored);
        }
    }

    for (const item of [...userDelta.inventoryRemove, ...userDelta.gearRemove]) {
        if (findSceneItemEstablishment(narration, item)) addUniqueItem(add, item);
    }
    for (const npcDelta of npcDeltas) {
        for (const item of [...npcDelta.inventoryRemove, ...npcDelta.gearRemove]) {
            if (findSceneItemEstablishment(narration, item)) addUniqueItem(add, item);
        }
    }

    reconcileSameTurnSceneTransitions(add, remove, narration);
    return {
        add,
        remove,
        provided: proposed?.provided === true || add.length > 0 || remove.length > 0,
    };
}

function applySceneItemDelta(before, delta, narration) {
    const state = normalizeSceneItemState(before);
    const removed = new Set();
    for (const item of delta.remove || []) {
        const stored = findUniqueItemMatch(state.items.map(entry => entry.name), item);
        if (stored) removed.add(normalizeItemKey(stored));
    }
    const items = state.items.filter(item => !removed.has(normalizeItemKey(item.name)));
    for (const item of delta.add || []) {
        const evidence = findSceneItemEstablishment(narration, item)?.evidence || '';
        const existing = findUniqueItemMatch(items.map(entry => entry.name), item);
        if (existing) continue;
        items.push(normalizeSceneItem({ name: item, evidence }));
    }
    return {
        sceneKey: state.sceneKey,
        initialized: state.initialized || delta?.provided === true || items.length !== state.items.length,
        items: normalizeSceneItems(items),
    };
}

function canonicalizeActorRemovals(delta, before, label, audit) {
    for (const [field, stateField] of [['inventoryRemove', 'inventory'], ['gearRemove', 'gear']]) {
        const canonical = [];
        for (const item of cleanItemList(delta?.[field])) {
            const match = findUniqueItemMatch(before?.[stateField] || [], item);
            if (!match) {
                audit.push(`POSSESSION rejected ${label}.${field}=${item}: no unique saved ${stateField} entry matches`);
                continue;
            }
            addUniqueItem(canonical, match);
        }
        delta[field] = canonical;
    }
}

function reconcileDuplicateActorChanges(delta, audit, label) {
    for (const [addField, removeField] of [['inventoryAdd', 'inventoryRemove'], ['gearAdd', 'gearRemove']]) {
        for (const addItem of [...delta[addField]]) {
            const removeItem = findUniqueItemMatch(delta[removeField], addItem);
            if (!removeItem) continue;
            removeMatchingDeltaItem(delta[addField], addItem);
            removeMatchingDeltaItem(delta[removeField], removeItem);
            audit.push(`POSSESSION collapsed ${label} ${addField}/${removeField} same-item no-op=${addItem}`);
        }
    }
    for (const inventoryItem of [...delta.inventoryAdd]) {
        const equippedItem = findUniqueItemMatch(delta.gearAdd, inventoryItem);
        if (!equippedItem) continue;
        removeMatchingDeltaItem(delta.inventoryAdd, inventoryItem);
        audit.push(`POSSESSION collapsed ${label} inventoryAdd/gearAdd duplicate=${inventoryItem}; equipped state retained`);
    }
}

function reconcileSameTurnSceneTransitions(add, remove, narration) {
    for (const addItem of [...add]) {
        const removeItem = findUniqueItemMatch(remove, addItem);
        if (!removeItem) continue;
        const addEvent = findSceneItemEstablishment(narration, addItem);
        const removeEvent = findSceneItemRemoval(narration, removeItem);
        if (removeEvent && (!addEvent || removeEvent.index > addEvent.index)) {
            removeMatchingDeltaItem(add, addItem);
        } else {
            removeMatchingDeltaItem(remove, removeItem);
        }
    }
}

function narrationSupportsUserChange(narration, item, kind, userNames = []) {
    const sentences = itemSentences(narration, item);
    const actorPattern = userActorPattern(userNames);
    const verbs = changeVerbPattern(kind);
    if (!verbs) return false;
    return sentences.some(({ normalized }) => {
        if (sentenceIsNonFactual(normalized)) return false;
        const subjectAction = subjectPerformsChange(normalized, actorPattern, verbs);
        const passiveToUser = kind.endsWith('_add')
            && (/\b(?:hand|hands|handed|give|gives|gave|given|pass|passes|passed|return|returns|returned|deliver|delivers|delivered)\s+(?:the\s+)?[^.!?]{0,80}?\s+to\s+you\b/i.test(normalized)
                || /\b(?:hands|gives|passes|returns|delivers)\s+you\b/i.test(normalized));
        const passiveFromUser = kind.endsWith('_remove')
            && /\b(?:taken|seized|removed|snatched|stolen)\s+from\s+you\b/i.test(normalized);
        const possessionTransition = kind.endsWith('_add')
            ? /\b(?:into|in|onto|on)\s+your\s+(?:hand|hands|pocket|pockets|bag|pack|pouch|belt|gear|inventory|possession)\b/i.test(normalized)
            : /\b(?:from|out of|off)\s+your\s+(?:hand|hands|pocket|pockets|bag|pack|pouch|belt|gear|inventory|possession)\b/i.test(normalized);
        return subjectAction || passiveToUser || passiveFromUser || possessionTransition;
    });
}

function narrationSupportsNpcChange(narration, npcName, item, kind) {
    const name = normalizeNarrationText(npcName);
    if (!name) return false;
    const namePattern = escapeRegex(name).replace(/\s+/g, '\\s+');
    const verbs = changeVerbPattern(kind);
    if (!verbs) return false;
    return itemSentences(narration, item).some(({ normalized }) => (
        !sentenceIsNonFactual(normalized)
        && subjectPerformsChange(normalized, namePattern, verbs)
    ));
}

function narrationSupportsEquipmentStow(narration, item, userNames = []) {
    const actorPattern = userActorPattern(userNames);
    return itemSentences(narration, item).some(({ normalized }) => (
        !sentenceIsNonFactual(normalized)
        && new RegExp(`\\b(?:${actorPattern})\\b`, 'i').test(normalized)
        && /\b(?:stow|stows|stowed|pack|packs|packed|pocket|pockets|pocketed|sheathe|sheathes|sheathed|holster|holsters|holstered|unequip|unequips|unequipped|remove|removes|removed|doff|doffs|doffed)\b/i.test(normalized)
    ));
}

function narrationRetainsUserPossession(narration, item, userNames = []) {
    const names = userNames
        .map(normalizeNarrationText)
        .filter(Boolean)
        .map(name => `${escapeRegex(name).replace(/\s+/g, '\\s+')}[\'\u2019]s`);
    const owner = `(?:my|your${names.length ? `|${names.join('|')}` : ''})`;
    return itemSentences(narration, item).some(({ normalized }) => (
        !sentenceIsNonFactual(normalized)
        && itemPlacedInPersonalPossession(normalized, item, owner, '(?:in|into|inside|onto|on|at|against)')
    ));
}

function narrationRetainsNpcPossession(narration, npcName, item) {
    const name = normalizeNarrationText(npcName);
    if (!name) return false;
    const owner = `(?:his|her|their|its|${escapeRegex(name).replace(/\s+/g, '\\s+')}[\'\u2019]s)`;
    return itemSentences(narration, item).some(({ normalized }) => (
        !sentenceIsNonFactual(normalized)
        && itemPlacedInPersonalPossession(normalized, item, owner, '(?:in|into|inside|onto|on|at|against)')
    ));
}

function narrationSupportsNpcEquipmentStow(narration, npcName, item) {
    const name = normalizeNarrationText(npcName);
    if (!name) return false;
    const namePattern = escapeRegex(name).replace(/\s+/g, '\\s+');
    return itemSentences(narration, item).some(({ normalized }) => (
        !sentenceIsNonFactual(normalized)
        && new RegExp(`\\b${namePattern}\\b`, 'i').test(normalized)
        && /\b(?:stow|stows|stowed|pack|packs|packed|pocket|pockets|pocketed|sheathe|sheathes|sheathed|holster|holsters|holstered|unequip|unequips|unequipped|remove|removes|removed|doff|doffs|doffed)\b/i.test(normalized)
    ));
}

function subjectPerformsChange(text, actorPattern, verbs) {
    const match = new RegExp(`\\b(?:${actorPattern})\\b(?:\\s+[a-z0-9'-]+){0,4}\\s+\\b(?:${verbs})\\b`, 'i').exec(text);
    if (!match) return false;
    const delegated = new RegExp(
        `\\b(?:${actorPattern})\\b(?:\\s+(?:then|now|immediately|quietly|carefully|closely|simply|just|reluctantly|silently)){0,3}\\s+`
        + '\\b(?:watch|watches|watched|see|sees|saw|observe|observes|observed|notice|notices|noticed|witness|witnesses|witnessed|hear|hears|heard|tell|tells|told|ask|asks|asked|order|orders|ordered|command|commands|commanded|urge|urges|urged|signal|signals|signaled|allow|allows|allowed|let|lets|make|makes|made|help|helps|helped)\\b',
        'i',
    ).test(match[0]);
    return !delegated;
}

function findSceneItemEstablishment(narration, item) {
    const sentences = itemSentences(narration, item);
    for (const sentence of sentences) {
        const text = sentence.normalized;
        if (sentenceIsNonFactual(text)) continue;
        const established = /\bthere\s+(?:is|are|was|were|sits?|rests?|lies?|lay)\b/i.test(text)
            || /\b(?:rests?|sits?|lies?|lay|leans?|stands?|hangs?|waits?|remains?|appears?|visible|spotted)\b/i.test(text)
            || /\b(?:place|places|placed|set|sets|put|puts|drop|drops|dropped|leave|leaves|left)\b/i.test(text)
            || /\b(?:on|upon|in|inside|beside|near|against|under|over|atop|across)\s+(?:the|a|an|your|their)\b/i.test(text);
        const heldOnly = /\b(?:holds?|carries|carried|wears?|wore|grips?|clutches?|offers?|offered|shows?|showed|presents?|presented|hands?|handed|gives?|gave|passes?|passed)\b/i.test(text)
            && !/\b(?:place|places|placed|set|sets|put|puts|drop|drops|dropped|leave|leaves|left)\b/i.test(text);
        const placedInPersonalPossession = itemPlacedInPersonalPossession(text, item);
        if (established && !heldOnly && !placedInPersonalPossession) {
            return { evidence: sentence.original.slice(0, 180), index: sentence.index };
        }
    }
    return null;
}

function findSceneItemRemoval(narration, item) {
    const sentences = itemSentences(narration, item);
    for (const sentence of sentences) {
        const text = sentence.normalized;
        if (sentenceIsNonFactual(text)) continue;
        if (/\bt(?:ake|akes|ook)\s+(?:a|another)\s+(?:look|glance|picture|photo|breath|seat)\b/i.test(text)) continue;
        if (/\b(?:pick(?:s|ed)?\s+up|take|takes|took|taken|grab|grabs|grabbed|collect|collects|collected|retrieve|retrieves|retrieved|carry|carries|carried)\b/i.test(text)
            || /\b(?:destroy|destroys|destroyed|shatter|shatters|shattered|burn|burns|burned|burnt|consume|consumes|consumed|eat|eats|ate|drink|drinks|drank|discard|discards|discarded|remove|removes|removed)\b/i.test(text)) {
            return { evidence: sentence.original.slice(0, 180), index: sentence.index };
        }
    }
    return null;
}

function itemSentences(narration, item) {
    const source = stripQuotedText(String(narration || ''));
    const rows = [];
    const matcher = /[^.!?\r\n]+[.!?]?/g;
    for (const match of source.matchAll(matcher)) {
        const original = match[0].trim();
        if (!original) continue;
        for (const clause of splitStrongNarrationClauses(original, match.index || 0)) {
            if (!textContainsItem(clause.original, item)) continue;
            rows.push(clause);
        }
    }
    return rows;
}

function splitStrongNarrationClauses(value, baseIndex) {
    const source = String(value || '');
    const rows = [];
    const boundary = /[;\u2014]|\b(?:while|whereas|but)\b/gi;
    let start = 0;
    for (const match of source.matchAll(boundary)) {
        const end = match.index || 0;
        const original = source.slice(start, end).trim();
        if (original) rows.push({ original, normalized: normalizeNarrationText(original), index: baseIndex + start });
        start = end + match[0].length;
    }
    const original = source.slice(start).trim();
    if (original) rows.push({ original, normalized: normalizeNarrationText(original), index: baseIndex + start });
    return rows;
}

function textContainsItem(text, item) {
    const source = normalizeNarrationText(text);
    return itemTextVariants(item).some(variant => {
        const pattern = escapeRegex(variant).replace(/\s+/g, '\\s+');
        return new RegExp(`(?:^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(source);
    });
}

function sentenceIsNonFactual(text) {
    return /\b(?:wish|wishes|wanted|wants|hope|hopes|imagine|imagines|pretend|pretends|rumou?r|suppose|supposes|hypothetical|if only|might have|could have|would have)\b/i.test(text)
        || /\b(?:no|not|never|without|missing|absent|cannot|can't|doesn't|didn't|don't)\b/i.test(text);
}

function changeVerbPattern(kind) {
    switch (kind) {
        case 'inventory_add':
            return 'pick(?:s|ed)?\\s+up|take|takes|took|receive|receives|received|accept|accepts|accepted|pocket|pockets|pocketed|collect|collects|collected|keep|keeps|kept|stow|stows|stowed|carry|carries|carried|hold|holds|held|grab|grabs|grabbed|retrieve|retrieves|retrieved|pull|pulls|pulled|acquire|acquires|acquired|gain|gains|gained|claim|claims|claimed|secure|secures|secured|sling|slings|slung|holster|holsters|holstered|sheathe|sheathes|sheathed|handed|given|passed|returned|delivered';
        case 'inventory_remove':
            return 'drop|drops|dropped|leave|leaves|left|give|gives|gave|hand|hands|handed|discard|discards|discarded|consume|consumes|consumed|drink|drinks|drank|eat|eats|ate|spend|spends|spent|lose|loses|lost|destroy|destroys|destroyed|break|breaks|broke|seize|seizes|seized|remove|removes|removed|taken';
        case 'gear_add':
            return 'equip|equips|equipped|wear|wears|wore|don|dons|donned|strap|straps|strapped|sling|slings|slung|holster|holsters|holstered|sheathe|sheathes|sheathed';
        case 'gear_remove':
            return 'unequip|unequips|unequipped|remove|removes|removed|doff|doffs|doffed|unstrap|unstraps|unstrapped|unsling|unslings|unslung|unholster|unholsters|unholstered';
        default:
            return '';
    }
}

function pairedUserEquipmentMove(delta, item, removeField) {
    return pairedActorEquipmentMove(delta, item, removeField);
}

function pairedActorEquipmentMove(delta, item, removeField) {
    const addField = removeField === 'inventoryRemove' ? 'gearAdd' : 'inventoryAdd';
    return actorDeltaHasItem(delta, [addField], item);
}

function findExistingActorOwnership(userBefore, npcsBefore, item) {
    if (trackerListHas(userBefore?.inventory, item) || trackerListHas(userBefore?.gear, item)) return 'user';
    for (const [name, state] of Object.entries(npcsBefore || {})) {
        if (trackerListHas(state?.inventory, item) || trackerListHas(state?.gear, item)) return name;
    }
    return '';
}

function itemPlacedInPersonalPossession(
    text,
    item,
    owner = '(?:my|your|his|her|their|our|its|[\\p{L}][\\p{L}\\p{N}\u2019\'-]*[\'\u2019]s)',
    preposition = '(?:in|into|inside|onto|on|at|against|from)',
) {
    const container = '(?:hand|hands|pocket|pockets|bag|pack|pouch|belt|holster|sheath|clothing|coat|robe|back|gear|inventory|possession)';
    return itemTextVariants(item).some(variant => {
        const itemPattern = escapeRegex(variant).replace(/\s+/g, '\\s+');
        return new RegExp(
            `(?:^|[^a-z0-9])${itemPattern}(?=$|[^a-z0-9])[^.!?]{0,55}?\\b${preposition}\\s+(?:the\\s+)?${owner}\\s+${container}\\b`,
            'iu',
        ).test(text);
    });
}

function itemUseBlocksAddition(itemUse, item) {
    const attempted = String(itemUse?.Attempted ?? itemUse?.attempted ?? '').trim().toUpperCase() === 'Y'
        || itemUse?.attempted === true;
    const available = String(itemUse?.Available ?? itemUse?.available ?? '').trim().toUpperCase() === 'Y'
        || itemUse?.available === true;
    const authorityItem = itemUse?.SavedItem || itemUse?.Item || itemUse?.item;
    return attempted && !available && itemNamesMatch(authorityItem, item);
}

function normalizeNpcSnapshot(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(Object.entries(source).map(([name, state]) => [name, normalizeTrackerEntry(state)]));
}

function cloneActorDelta(value = {}, NPC = undefined) {
    const source = value && typeof value === 'object' ? value : {};
    const result = { ...source };
    for (const field of DELTA_LIST_FIELDS) result[field] = cleanItemList(source[field]);
    if (NPC !== undefined) result.NPC = NPC;
    return result;
}

function cloneSceneItemDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        add: cleanItemList(source.add),
        remove: cleanItemList(source.remove),
        provided: typeof source.provided === 'boolean'
            ? source.provided
            : Object.hasOwn(source, 'add') || Object.hasOwn(source, 'remove'),
    };
}

function ensureNpcDelta(npcs, NPC) {
    let delta = npcs.find(item => normalizeItemKey(item?.NPC) === normalizeItemKey(NPC));
    if (!delta) {
        delta = cloneActorDelta({}, NPC);
        npcs.push(delta);
    }
    return delta;
}

function actorDeltaHasItem(delta, fields, item) {
    return fields.some(field => Boolean(findUniqueItemMatch(delta?.[field] || [], item)));
}

function cleanItemList(value) {
    const source = Array.isArray(value) ? value : [];
    const result = [];
    for (const item of source) addUniqueItem(result, cleanItemName(item));
    return result.slice(0, SCENE_ITEM_LIMIT);
}

function normalizeSceneItems(value) {
    const source = Array.isArray(value) ? value : [];
    const result = [];
    const seen = new Set();
    for (const item of source) {
        const normalized = normalizeSceneItem(item);
        const key = normalizeItemKey(normalized?.name);
        if (!normalized || !key || seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }
    return result.slice(-SCENE_ITEM_LIMIT);
}

function normalizeSceneItem(value) {
    const source = typeof value === 'string' ? { name: value } : value;
    if (!source || typeof source !== 'object') return null;
    const name = cleanItemName(source.name ?? source.item);
    if (!name) return null;
    const evidence = String(source.evidence || '').trim().replace(/\s+/g, ' ').slice(0, 180);
    return { name, evidence };
}

function findUniqueItemMatch(items, requested) {
    const list = cleanItemList(items);
    const wanted = cleanItemName(requested);
    if (!wanted) return '';
    const exact = list.filter(item => normalizeItemKey(item) === normalizeItemKey(wanted));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return '';
    const matches = list.filter(item => itemNamesMatch(item, wanted));
    return matches.length === 1 ? matches[0] : '';
}

function trackerListHas(items, wanted) {
    return Boolean(findUniqueItemMatch(items, wanted));
}

function itemNamesMatch(left, right) {
    const leftVariants = itemTextVariants(left);
    const rightVariants = itemTextVariants(right);
    return leftVariants.some(a => rightVariants.some(b => a === b || a.endsWith(` ${b}`) || b.endsWith(` ${a}`)));
}

function itemTextVariants(value) {
    const raw = String(value || '');
    const variants = [
        raw,
        raw.replace(/\([^)]*\)/g, ' '),
        raw.split(/[;,]/)[0],
        raw.replace(/\([^)]*\)/g, ' ').split(/[;,]/)[0],
    ].map(normalizeItemKey).filter(Boolean);
    for (const variant of [...variants]) {
        const words = variant.split(/\s+/);
        if (words.length > 1) variants.push(words.at(-1));
    }
    return [...new Set(variants)];
}

function addUniqueItem(list, item) {
    const text = cleanItemName(item);
    if (!text || list.some(existing => normalizeItemKey(existing) === normalizeItemKey(text))) return;
    list.push(text);
}

function removeMatchingDeltaItem(list, item) {
    const match = findUniqueItemMatch(list, item);
    if (!match) return;
    const key = normalizeItemKey(match);
    const index = list.findIndex(entry => normalizeItemKey(entry) === key);
    if (index >= 0) list.splice(index, 1);
}

function cleanItemName(value) {
    const text = String(value ?? '').trim().replace(/^\[|\]$/g, '').replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 140);
}

function normalizeItemKey(value) {
    return cleanItemName(value)
        .toLowerCase()
        .replace(/['\u2019]s\b/g, '')
        .replace(/^(?:a|an|the|my|your|his|her|their|our)\s+/, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function cleanSceneKey(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 520);
}

function normalizeKeyPart(value) {
    return String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() || '(none)';
}

function normalizeNarrationText(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripQuotedText(value) {
    return String(value || '').replace(
        /"[^"\r\n]*"|\u201c[^\u201d\r\n]*\u201d|\u2018[^\u2019\r\n]*\u2019|(^|[\s([{])'[^'\r\n]*'(?=$|[\s)\]}.!?,;:])/gm,
        match => ' '.repeat(match.length),
    );
}

function userActorPattern(userNames = []) {
    const names = ['you', '{{user}}', ...userNames]
        .map(normalizeNarrationText)
        .filter(Boolean)
        .map(escapeRegex);
    return [...new Set(names)].join('|');
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
