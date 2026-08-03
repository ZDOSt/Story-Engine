import { normalizeWorldState, WORLD_TIME_SLOTS } from './world-state.js';

export const WORLD_MEMORY_VERSION = 1;
export const WORLD_MEMORY_PATCH_VERSION = 1;
export const WORLD_MEMORY_DELTA_START = 'BEGIN_WORLD_MEMORY_DELTA';
export const WORLD_MEMORY_DELTA_END = 'END_WORLD_MEMORY_DELTA';
export const WORLD_MEMORY_DELTA_FENCE = '```story_engine_world_memory_delta';
export const WORLD_MEMORY_DELTA_FENCE_END = '```';

const ARCHIVE_TYPES = Object.freeze(['npc', 'location', 'faction', 'event']);
const PLAN_KINDS = Object.freeze(['scheduled', 'npc', 'faction', 'power_actor']);
const PLAN_STATUSES = Object.freeze(['active', 'completed', 'cancelled']);
const EVIDENCE_ROUTES = Object.freeze(['location', 'actor', 'news', 'investigation']);
const ARCHIVE_LIMIT = 72;
const ARCHIVE_HISTORY_LIMIT = 6;
const ARCHIVE_CONNECTION_LIMIT = 8;
const PLAN_LIMIT = 18;
const PLAN_CONSEQUENCE_LIMIT = 8;
const PLAN_EVIDENCE_LIMIT = 12;
const MAX_ARCHIVE_DELTAS = 6;
const MAX_PLAN_CREATES = 2;
const MAX_PLAN_CANCELLATIONS = 2;
const MAX_DISCOVERIES = 4;
const NARRATOR_ARCHIVE_LIMIT = 8;
const NARRATOR_EVIDENCE_LIMIT = 2;
const UPDATE_ARCHIVE_DETAIL_LIMIT = 12;
const UPDATE_INACTIVE_PLAN_LIMIT = 6;
const MAX_DELAY_SLOTS = 4 * 120;
const EVIDENCE_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'by', 'for', 'from', 'has', 'have',
    'he', 'her', 'hers', 'him', 'his', 'i', 'in', 'into', 'is', 'it', 'its', 'of', 'on',
    'or', 's', 'she', 'that', 'the', 'their', 'them', 'they', 'this', 'to', 'was', 'were',
    'with',
]);

export const WORLD_MEMORY_DELTA_CONTRACT = [
    'STRICT WORLD MEMORY DELTA CONTRACT:',
    '- This block updates discovered descriptive memory and private off-screen progression. It never narrates and never changes mechanical state.',
    '- DescriptiveArchive contains only important NPCs, locations, factions, and major events that FINAL_NARRATION actually establishes or reveals to {{user}}.',
    '- Never create an NPC archive entry for {{user}} or the player persona.',
    '- Keep archive facts concise. Update an existing id/name in place. Do not duplicate stats, wounds, status effects, inventory, gear, currency, rapport, disposition, rolls, or mechanics.',
    '- Every archive delta evidence field must copy a concrete contiguous phrase or sentence from FINAL_NARRATION that grounds the update.',
    '- Archive fields are descriptive: identity/name, role, affiliation, description, history, connections, last known status, and last known location.',
    '- The archive update context lists every stored identity but includes details only for relevant or recent entries. Omitted stored details remain preserved; output only new or changed facts.',
    '- WorldProgression is PRIVATE. Never copy hidden causes, plans, actors, or consequences into DescriptiveArchive unless FINAL_NARRATION visibly reveals them.',
    '- The progression update context includes every active plan plus a small inactive-plan index. Never recreate an inactive plan unless a newly established objective genuinely begins again.',
    '- Create a scheduled/NPC/faction plan only from an explicit established intention, deadline, promise, threat, departure, project, or ongoing objective.',
    '- For scheduled/NPC/faction plan creation, cause must copy the concrete FINAL_NARRATION phrase or sentence that establishes the plan. Power-actor plans grounded in POWER_ACTOR_STATE are exempt.',
    '- {{user}} is never a world-plan actor. Never schedule, advance, or complete future actions on behalf of {{user}} or the player persona.',
    '- A power_actor plan may also be created from an exact existing power actor in POWER_ACTOR_STATE when that actor has no pending event and no active world plan. Ground it only in established reach, reasons, resources, and context.',
    '- Do not manufacture daily activity. Create at most the few durable developments that can materially change later scenes.',
    '- Cancel only an exact active plan when FINAL_NARRATION explicitly resolves, abandons, supersedes, or makes its objective impossible. reason must copy the concrete FINAL_NARRATION phrase or sentence that grounds the cancellation.',
    '- Off-screen consequences may change NPCs, factions, locations, preparations, access, rumors, resources, or plans. They must never retroactively injure {{user}}, remove {{user}} possessions, force {{user}} actions, or declare an unseen effect already happened to {{user}}.',
    '- Enmity may affect a power actor plan priority or severity, but it does not require hostility and never overrides established motives.',
    '- plans.create and plans.cancel are the only plan operations in this post-narration block. Due-plan advancement is deterministic and already resolved before narration.',
    '- discoveries may contain only an exact id from AUTHORIZED_WORLD_EVIDENCE plus an exact contiguous quote from FINAL_NARRATION that visibly presents that evidence. Never mark merely available or omitted evidence as discovered.',
    '- Use delayDays/delaySlots as a relative delay from the current final world time. Three days means delayDays=3 and delaySlots=0.',
    '- Return the exact JSON shape shown below. Use empty arrays when nothing changes.',
].join('\n');

export const WORLD_MEMORY_DELTA_TEMPLATE = `${WORLD_MEMORY_DELTA_FENCE}
${WORLD_MEMORY_DELTA_START}
{
  "archive": [],
  "plans": {
    "create": [],
    "cancel": []
  },
  "discoveries": []
}
${WORLD_MEMORY_DELTA_END}
${WORLD_MEMORY_DELTA_FENCE_END}`;

export function normalizeDescriptiveArchive(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const rawEntries = Array.isArray(source.entries) ? source.entries : Array.isArray(value) ? value : [];
    const entries = [];
    const byId = new Map();
    const byEntity = new Map();

    for (const rawEntry of rawEntries) {
        const entry = normalizeArchiveEntry(rawEntry);
        if (!entry) continue;
        const idKey = cleanId(entry.id);
        const entityKey = archiveEntryKey(entry);
        const existingIndex = byId.get(idKey) ?? byEntity.get(entityKey);
        if (existingIndex == null) {
            byId.set(idKey, entries.length);
            byEntity.set(entityKey, entries.length);
            entries.push(entry);
        } else {
            entries[existingIndex] = mergeArchiveEntries(entries[existingIndex], entry);
            byId.set(cleanId(entries[existingIndex].id), existingIndex);
            byEntity.set(archiveEntryKey(entries[existingIndex]), existingIndex);
        }
    }

    return {
        version: WORLD_MEMORY_VERSION,
        entries: entries.slice(-ARCHIVE_LIMIT),
    };
}

export function normalizeWorldProgression(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const rawPlans = Array.isArray(source.plans) ? source.plans : Array.isArray(value) ? value : [];
    const plans = [];
    const byId = new Map();

    for (const rawPlan of rawPlans) {
        const plan = normalizePlan(rawPlan);
        if (!plan) continue;
        const existingIndex = byId.get(plan.id);
        if (existingIndex == null) {
            byId.set(plan.id, plans.length);
            plans.push(plan);
        } else {
            plans[existingIndex] = plan;
        }
    }

    const active = plans.filter(plan => plan.status === 'active');
    const historyLimit = Math.max(0, PLAN_LIMIT - active.length);
    const inactive = plans.filter(plan => plan.status !== 'active');
    const history = historyLimit > 0 ? inactive.slice(-historyLimit) : [];
    const retainedIds = new Set([...active, ...history].map(plan => plan.id));

    return {
        version: WORLD_MEMORY_VERSION,
        plans: plans.filter(plan => retainedIds.has(plan.id)),
    };
}

export function normalizeWorldMemoryDelta(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const planSource = source.plans && typeof source.plans === 'object' ? source.plans : {};
    return {
        archive: list(source.archive)
            .map(normalizeArchiveDeltaEntry)
            .filter(Boolean)
            .slice(0, MAX_ARCHIVE_DELTAS),
        plans: {
            create: list(planSource.create)
                .map(normalizePlanCreateDelta)
                .filter(Boolean)
                .slice(0, MAX_PLAN_CREATES),
            cancel: list(planSource.cancel)
                .map(normalizePlanCancelDelta)
                .filter(Boolean)
                .slice(0, MAX_PLAN_CANCELLATIONS),
        },
        discoveries: list(source.discoveries)
            .map(normalizeEvidenceDiscovery)
            .filter(Boolean)
            .slice(0, MAX_DISCOVERIES),
    };
}

export function parseWorldMemoryDelta(text, options = {}) {
    const source = String(text ?? '');
    const match = source.match(/BEGIN_WORLD_MEMORY_DELTA\s*([\s\S]*?)\s*END_WORLD_MEMORY_DELTA/i);
    if (!match && options.requireEnvelope !== false) {
        throw new Error('world memory delta block was missing BEGIN_WORLD_MEMORY_DELTA/END_WORLD_MEMORY_DELTA.');
    }
    const body = match ? match[1] : source;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('world memory delta did not contain a JSON object.');
    let parsed;
    try {
        parsed = JSON.parse(body.slice(start, end + 1));
    } catch (error) {
        throw new Error(`world memory delta JSON was invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    return normalizeWorldMemoryDelta(parsed);
}

export function applyWorldMemoryDelta(memory = {}, delta = {}, options = {}) {
    let archive = normalizeDescriptiveArchive(memory.archive);
    let progression = normalizeWorldProgression(memory.progression);
    const normalizedDelta = normalizeWorldMemoryDelta(delta);
    const beforeWorldState = normalizeWorldState(options.beforeWorldState || {});
    const afterWorldState = normalizeWorldState(options.afterWorldState || beforeWorldState);
    const messageKey = cleanText(options.messageKey, 160) || `clock-${worldClockIndex(afterWorldState)}`;
    const powerActors = options.powerActors && typeof options.powerActors === 'object' ? options.powerActors : {};
    const protectedUserNames = uniqueText(options.protectedUserNames, 120);
    const narrationAuthority = typeof options.narrationText === 'string' ? options.narrationText : null;
    const audit = [];

    const promoted = normalizeEntityPromotions(options.promotions);
    if (promoted.length) {
        archive = renameArchiveEntities(archive, promoted);
        progression = renameProgressionEntities(progression, promoted);
    }

    for (const rawEntryDelta of normalizedDelta.archive) {
        const entryDelta = promoteArchiveDelta(rawEntryDelta, promoted);
        if (entryDelta.type === 'npc' && isProtectedPlayerEntity(entryDelta.name, protectedUserNames)) {
            audit.push(`archive_rejected_player:${entryDelta.name}`);
            continue;
        }
        if (narrationAuthority !== null && !isGroundedInNarration(entryDelta.evidence, narrationAuthority)) {
            audit.push(`archive_rejected_ungrounded:${entryDelta.type}/${entryDelta.name}`);
            continue;
        }
        if (archiveDeltaHasIdentityConflict(archive, entryDelta)) {
            audit.push(`archive_rejected_identity_conflict:${entryDelta.id}/${entryDelta.type}/${entryDelta.name}`);
            continue;
        }
        archive = upsertArchiveDelta(archive, entryDelta, messageKey);
        audit.push(`archive:${entryDelta.type}/${entryDelta.name}`);
    }

    const authorizedEvidence = new Map(list(options.authorizedEvidence)
        .map(normalizeAuthorizedEvidence)
        .filter(Boolean)
        .map(item => [item.id, item]));
    const discoveredIds = [];
    for (const discovery of normalizedDelta.discoveries) {
        const authorized = authorizedEvidence.get(discovery.id);
        if (!authorized) {
            audit.push(`discovery_rejected_unauthorized:${discovery.id}`);
            continue;
        }
        if (narrationAuthority === null || !exactQuoteAppearsInNarration(discovery.quote, narrationAuthority)) {
            audit.push(`discovery_rejected_unquoted:${discovery.id}`);
            continue;
        }
        if (!quoteMatchesAuthorizedEvidence(discovery.quote, authorized)) {
            audit.push(`discovery_rejected_mismatched_quote:${discovery.id}`);
            continue;
        }
        discoveredIds.push(discovery.id);
    }
    if (discoveredIds.length) {
        const discovery = discoverProgressionEvidence(progression, archive, discoveredIds, {
            messageKey,
            worldState: afterWorldState,
        });
        progression = discovery.progression;
        archive = discovery.archive;
        audit.push(...discovery.discoveredIds.map(id => `discovered:${id}`));
    }

    for (const cancellation of normalizedDelta.plans.cancel) {
        const index = progression.plans.findIndex(plan => plan.id === cancellation.planId && plan.status === 'active');
        if (index < 0) continue;
        const plan = progression.plans[index];
        if (narrationAuthority !== null && !isGroundedInNarration(cancellation.reason, narrationAuthority)) {
            audit.push(`cancel_rejected_ungrounded:${plan.id}`);
            continue;
        }
        progression.plans[index] = normalizePlan({
            ...plan,
            status: 'cancelled',
            cancellationReason: cancellation.reason,
            updatedAt: messageKey,
        });
        audit.push(`cancelled:${plan.id}`);
    }

    for (const rawCreation of normalizedDelta.plans.create) {
        const creation = promotePlanCreateDelta(rawCreation, promoted);
        if (isProtectedPlayerEntity(creation.actor, protectedUserNames)) {
            audit.push(`create_rejected:${creation.actor}/${creation.objective}`);
            continue;
        }
        if (creation.kind !== 'power_actor'
            && narrationAuthority !== null
            && !isGroundedInNarration(creation.cause, narrationAuthority)) {
            audit.push(`create_rejected:${creation.actor}/${creation.objective}`);
            continue;
        }
        if (activePlanCount(progression) >= PLAN_LIMIT) {
            audit.push(`create_rejected_capacity:${creation.actor}/${creation.objective}`);
            continue;
        }
        if (!canCreatePlan(creation, progression, powerActors)) {
            audit.push(`create_rejected:${creation.actor}/${creation.objective}`);
            continue;
        }
        const plan = createPlanFromDelta(creation, afterWorldState, messageKey);
        if (!plan) continue;
        progression.plans.push(plan);
        audit.push(`created:${plan.id}`);
    }

    progression = normalizeWorldProgression(progression);
    archive = normalizeDescriptiveArchive(archive);
    return { archive, progression, audit };
}

export function prepareWorldMemoryNarration(options = {}) {
    const archive = normalizeDescriptiveArchive(options.archive);
    const progression = normalizeWorldProgression(options.progression);
    const worldState = normalizeWorldState(options.worldState || {});
    const resolution = options.resolutionPacket && typeof options.resolutionPacket === 'object'
        ? options.resolutionPacket
        : {};
    const latestUserText = cleanText(options.latestUserText, 2000);
    const sceneNames = uniqueText([collectSceneNames(resolution), options.sceneNames], 120);
    const observableEvidence = [];

    for (const plan of progression.plans) {
        for (const evidence of plan.evidence) {
            if (evidence.discovered || !isEvidenceRouteOpen(evidence, {
                worldState,
                resolution,
                latestUserText,
                sceneNames,
            })) continue;
            observableEvidence.push({
                id: evidence.id,
                topic: evidence.topic,
                text: evidence.text,
                route: evidence.route,
                location: evidence.location,
                actor: evidence.actor,
            });
            if (observableEvidence.length >= NARRATOR_EVIDENCE_LIMIT) break;
        }
        if (observableEvidence.length >= NARRATOR_EVIDENCE_LIMIT) break;
    }

    const establishedArchive = relevantArchiveEntries(archive, {
        worldState,
        latestUserText,
        sceneNames,
    }).slice(-NARRATOR_ARCHIVE_LIMIT);

    return {
        establishedArchive,
        observableEvidence,
    };
}

export function buildWorldMemoryUpdateContext(options = {}) {
    const archive = normalizeDescriptiveArchive(options.archive);
    const progression = normalizeWorldProgression(options.progression);
    const context = {
        worldState: normalizeWorldState(options.worldState || {}),
        resolution: options.resolutionPacket && typeof options.resolutionPacket === 'object'
            ? options.resolutionPacket
            : {},
        latestUserText: cleanText(options.focusText, 12000),
        sceneNames: uniqueText([collectSceneNames(options.resolutionPacket || {}), options.sceneNames], 120),
    };
    const relevant = archive.entries.filter(entry => archiveEntryIsRelevant(entry, context));
    const detailEntries = [];
    const detailIds = new Set();
    const addDetail = entry => {
        if (!entry || detailIds.has(entry.id) || detailEntries.length >= UPDATE_ARCHIVE_DETAIL_LIMIT) return;
        detailIds.add(entry.id);
        detailEntries.push(compactArchiveEntryForUpdate(entry));
    };
    relevant.slice(-UPDATE_ARCHIVE_DETAIL_LIMIT).forEach(addDetail);
    [...archive.entries].reverse().forEach(addDetail);

    const activePlans = progression.plans
        .filter(plan => plan.status === 'active')
        .map(compactActivePlanForUpdate);
    const recentInactivePlans = progression.plans
        .filter(plan => plan.status !== 'active')
        .slice(-UPDATE_INACTIVE_PLAN_LIMIT)
        .map(plan => ({
            id: plan.id,
            kind: plan.kind,
            actor: plan.actor,
            objective: plan.objective,
            status: plan.status,
            stageLabel: plan.stageLabel,
        }));

    return {
        archive: {
            version: WORLD_MEMORY_VERSION,
            index: archive.entries.map(entry => ({
                id: entry.id,
                type: entry.type,
                name: entry.name,
                updatedAt: entry.updatedAt,
            })),
            relevantDetails: detailEntries,
        },
        progression: {
            version: WORLD_MEMORY_VERSION,
            activePlans,
            recentInactivePlans,
        },
    };
}

export function progressionHasActivePlanForActor(value = {}, actor = '') {
    const key = entityKey(actor);
    if (!key) return false;
    return normalizeWorldProgression(value).plans.some(plan =>
        plan.status === 'active' && entityKey(plan.actor) === key,
    );
}

export function isPlanDue(planValue = {}, worldState = {}) {
    const plan = normalizePlan(planValue);
    if (!plan || plan.status !== 'active') return false;
    return worldClockIndex(worldState) >= clockObjectIndex(plan.nextCheckpoint);
}

export function worldClockIndex(value = {}) {
    const state = normalizeWorldState(value);
    const slot = Math.max(0, WORLD_TIME_SLOTS.indexOf(state.timeOfDay));
    return Math.max(0, (state.dayIndex - 1) * WORLD_TIME_SLOTS.length + slot);
}

export function normalizeWorldProgressionAdvancements(value = []) {
    return list(value)
        .map(normalizePlanAdvanceDelta)
        .filter(Boolean)
        .slice(0, PLAN_LIMIT);
}

export function buildWorldProgressionSemanticContext(value = {}, worldState = {}) {
    const state = normalizeWorldState(worldState);
    return normalizeWorldProgression(value).plans
        .filter(plan => plan.status === 'active')
        .map(plan => ({
            ...compactActivePlanForUpdate(plan),
            dueNow: isPlanDue(plan, state),
        }));
}

export function getDueWorldPlanIds(value = {}, worldState = {}) {
    return normalizeWorldProgression(value).plans
        .filter(plan => isPlanDue(plan, worldState))
        .map(plan => plan.id);
}

export function validateWorldProgressionAdvancementCoverage(value = {}, advancements = [], worldState = {}, options = {}) {
    const progression = normalizeWorldProgression(value);
    const normalized = normalizeWorldProgressionAdvancements(advancements);
    const actualDueIds = new Set(getDueWorldPlanIds(progression, worldState));
    const requiredIds = Array.isArray(options.requiredPlanIds)
        ? uniqueText(options.requiredPlanIds, 100).filter(id => actualDueIds.has(cleanId(id))).map(cleanId)
        : [...actualDueIds];
    const required = new Set(requiredIds);
    const counts = new Map();
    for (const advancement of normalized) {
        counts.set(advancement.planId, (counts.get(advancement.planId) || 0) + 1);
    }
    const missing = [...required].filter(id => !counts.has(id));
    const duplicate = [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    const unexpected = [...counts.keys()].filter(id => !required.has(id));
    const incomplete = normalized
        .filter(item => required.has(item.planId) && item.evidence.length === 0)
        .map(item => item.planId);
    return {
        progression,
        advancements: normalized,
        duePlanIds: [...required],
        missing,
        duplicate,
        unexpected,
        incomplete,
        valid: missing.length === 0
            && duplicate.length === 0
            && (options.allowUnexpected === true || unexpected.length === 0)
            && incomplete.length === 0,
    };
}

export function advanceDueWorldPlans(value = {}, advancements = [], worldState = {}, options = {}) {
    const coverage = validateWorldProgressionAdvancementCoverage(value, advancements, worldState, options);
    if (options.strict !== false && !coverage.valid) {
        const details = [
            coverage.missing.length ? `missing=${coverage.missing.join(',')}` : '',
            coverage.duplicate.length ? `duplicate=${coverage.duplicate.join(',')}` : '',
            coverage.unexpected.length ? `unexpected=${coverage.unexpected.join(',')}` : '',
            coverage.incomplete.length ? `missingEvidence=${coverage.incomplete.join(',')}` : '',
        ].filter(Boolean).join(' ');
        throw new Error(`World progression advancement coverage failed. ${details}`.trim());
    }

    const progression = normalizeWorldProgression(coverage.progression);
    const byId = new Map(coverage.advancements.map(item => [item.planId, item]));
    const protectedUserNames = uniqueText(options.protectedUserNames, 120);
    const powerActors = options.powerActors && typeof options.powerActors === 'object' ? options.powerActors : {};
    const messageKey = cleanText(options.messageKey, 160) || `clock-${worldClockIndex(worldState)}`;
    const audit = [];

    for (const planId of coverage.duePlanIds) {
        const index = progression.plans.findIndex(plan => plan.id === planId && plan.status === 'active');
        const advancement = byId.get(planId);
        if (index < 0 || !advancement) continue;
        const plan = progression.plans[index];
        if (isProtectedPlayerEntity(plan.actor, protectedUserNames)
            || plan.lastAdvancedKey === messageKey
            || !isSafeOffscreenConsequence(advancement.consequence, protectedUserNames)
            || advancement.evidence.some(item => !isSafeOffscreenConsequence(item.text, protectedUserNames))) {
            if (options.strict !== false) throw new Error(`World progression advancement was unsafe for plan ${plan.id}.`);
            audit.push(`advance_rejected:${plan.id}`);
            continue;
        }
        if (plan.kind === 'power_actor'
            && !powerActorPlanAvailable(plan.actor, powerActors, { allowActivePlan: true })) {
            if (options.strict !== false) throw new Error(`World progression power actor was unavailable for plan ${plan.id}.`);
            audit.push(`advance_power_actor_blocked:${plan.id}`);
            continue;
        }
        const advanced = advancePlan(plan, advancement, worldState, messageKey);
        progression.plans[index] = advanced;
        audit.push(`advanced:${plan.id}:${advanced.stage}`);
    }

    return {
        progression: normalizeWorldProgression(progression),
        duePlanIds: coverage.duePlanIds,
        advancements: coverage.advancements,
        audit,
    };
}

export function createWorldMemoryPatch(beforeValue = {}, afterValue = {}) {
    const before = normalizeWorldMemoryState(beforeValue);
    const after = normalizeWorldMemoryState(afterValue);
    const beforeArchive = new Map(before.archive.entries.map(entry => [entry.id, entry]));
    const afterArchive = new Map(after.archive.entries.map(entry => [entry.id, entry]));
    const archiveUpsert = [...afterArchive.values()].filter(entry => !sameStructuredValue(beforeArchive.get(entry.id), entry));
    const archiveRemove = [...beforeArchive.keys()].filter(id => !afterArchive.has(id));
    const beforePlans = new Map(before.progression.plans.map(plan => [plan.id, plan]));
    const afterPlans = new Map(after.progression.plans.map(plan => [plan.id, plan]));
    const planPatches = [];

    for (const [id, plan] of afterPlans) {
        const patch = createPlanPatch(beforePlans.get(id), plan);
        if (patch) planPatches.push(patch);
    }
    for (const id of beforePlans.keys()) {
        if (!afterPlans.has(id)) planPatches.push({ id, remove: true });
    }

    return {
        version: WORLD_MEMORY_PATCH_VERSION,
        archiveUpsert,
        archiveRemove,
        planPatches,
    };
}

export function applyWorldMemoryPatch(value = {}, patchValue = {}) {
    const patch = normalizeWorldMemoryPatch(patchValue);
    const memory = normalizeWorldMemoryState(value);
    const removedArchive = new Set(patch.archiveRemove);
    const archiveById = new Map(memory.archive.entries
        .filter(entry => !removedArchive.has(entry.id))
        .map(entry => [entry.id, entry]));
    for (const entry of patch.archiveUpsert) archiveById.set(entry.id, entry);

    const plansById = new Map(memory.progression.plans.map(plan => [plan.id, plan]));
    for (const planPatch of patch.planPatches) {
        if (planPatch.remove) {
            plansById.delete(planPatch.id);
            continue;
        }
        const current = plansById.get(planPatch.id) || { id: planPatch.id };
        const consequences = applyKeyedPatch(
            list(current.consequences),
            planPatch.consequenceUpsert,
            planPatch.consequenceRemove,
            item => String(clampInt(item?.stage, 1, 24, 1)),
        );
        const evidence = applyKeyedPatch(
            list(current.evidence),
            planPatch.evidenceUpsert,
            planPatch.evidenceRemove,
            item => cleanId(item?.id),
        );
        const next = normalizePlan({
            ...current,
            ...planPatch.set,
            id: planPatch.id,
            consequences,
            evidence,
        });
        if (next) plansById.set(planPatch.id, next);
    }

    return normalizeWorldMemoryState({
        archive: { entries: [...archiveById.values()] },
        progression: { plans: [...plansById.values()] },
    });
}

export function normalizeWorldMemoryState(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        archive: normalizeDescriptiveArchive(source.archive || source.descriptiveArchive || {}),
        progression: normalizeWorldProgression(source.progression || source.worldProgression || {}),
    };
}

function normalizeArchiveEntry(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const type = normalizeEnum(source.type, ARCHIVE_TYPES, '');
    const name = cleanText(source.name, 120);
    if (!type || !name) return null;
    return {
        id: cleanId(source.id) || stableId('archive', `${type}|${name}`),
        type,
        name,
        summary: cleanText(source.summary, 280),
        role: cleanText(source.role, 160),
        affiliation: cleanText(source.affiliation, 160),
        description: cleanText(source.description, 280),
        history: uniqueText(source.history, 240).slice(-ARCHIVE_HISTORY_LIMIT),
        connections: uniqueText(source.connections, 160).slice(-ARCHIVE_CONNECTION_LIMIT),
        lastKnownStatus: cleanText(source.lastKnownStatus, 200),
        lastKnownLocation: cleanText(source.lastKnownLocation, 160),
        updatedAt: cleanText(source.updatedAt, 160),
    };
}

function normalizeArchiveDeltaEntry(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const type = normalizeEnum(source.type, ARCHIVE_TYPES, '');
    const name = cleanText(source.name, 120);
    const evidence = cleanText(source.evidence, 320);
    if (!type || !name || !evidence) return null;
    return {
        id: cleanId(source.id),
        type,
        name,
        summary: cleanText(source.summary, 280),
        role: cleanText(source.role, 160),
        affiliation: cleanText(source.affiliation, 160),
        description: cleanText(source.description, 280),
        history: uniqueText(source.history, 240).slice(-ARCHIVE_HISTORY_LIMIT),
        connections: uniqueText(source.connections, 160).slice(-ARCHIVE_CONNECTION_LIMIT),
        lastKnownStatus: cleanText(source.lastKnownStatus, 200),
        lastKnownLocation: cleanText(source.lastKnownLocation, 160),
        evidence,
    };
}

function archiveEntryKey(entry = {}) {
    return `${normalizeEnum(entry.type, ARCHIVE_TYPES, '')}:${entityKey(entry.name)}`;
}

function mergeArchiveEntries(before, after) {
    return normalizeArchiveEntry({
        ...before,
        ...Object.fromEntries(Object.entries(after).filter(([, value]) => value !== '' && value != null)),
        id: before.id || after.id,
        type: before.type || after.type,
        name: before.name || after.name,
        history: uniqueText([...(before.history || []), ...(after.history || [])], 240).slice(-ARCHIVE_HISTORY_LIMIT),
        connections: uniqueText([...(before.connections || []), ...(after.connections || [])], 160).slice(-ARCHIVE_CONNECTION_LIMIT),
    });
}

function archiveDeltaHasIdentityConflict(archiveValue, entryDelta) {
    const wantedId = cleanId(entryDelta.id);
    if (!wantedId) return false;
    const existing = normalizeDescriptiveArchive(archiveValue).entries.find(entry => entry.id === wantedId);
    return Boolean(existing && (
        existing.type !== entryDelta.type
        || entityKey(existing.name) !== entityKey(entryDelta.name)
    ));
}

function upsertArchiveDelta(archiveValue, entryDelta, messageKey) {
    const archive = normalizeDescriptiveArchive(archiveValue);
    const wantedId = cleanId(entryDelta.id);
    const wantedName = entityKey(entryDelta.name);
    const index = archive.entries.findIndex(entry =>
        (wantedId && entry.id === wantedId)
        || (entry.type === entryDelta.type && entityKey(entry.name) === wantedName),
    );
    const next = normalizeArchiveEntry({
        ...(index >= 0 ? archive.entries[index] : {}),
        ...entryDelta,
        id: index >= 0 ? archive.entries[index].id : wantedId,
        updatedAt: messageKey,
    });
    if (!next) return archive;
    if (index >= 0) {
        const merged = mergeArchiveEntries(archive.entries[index], next);
        archive.entries.splice(index, 1);
        archive.entries.push(merged);
    } else {
        archive.entries.push(next);
    }
    archive.entries = archive.entries.slice(-ARCHIVE_LIMIT);
    return archive;
}

function normalizePlan(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const id = cleanId(source.id);
    const kind = normalizeEnum(source.kind, PLAN_KINDS, '');
    const actor = cleanText(source.actor, 120);
    const objective = cleanText(source.objective, 240);
    if (!id || !kind || !actor || !objective) return null;
    const status = normalizeEnum(source.status, PLAN_STATUSES, 'active');
    return {
        id,
        kind,
        actor,
        objective,
        target: cleanText(source.target, 160),
        location: cleanText(source.location, 160),
        cause: cleanText(source.cause, 280),
        resources: uniqueText(source.resources, 160).slice(0, 8),
        prerequisites: uniqueText(source.prerequisites, 180).slice(0, 8),
        stage: clampInt(source.stage, 0, 24, 0),
        stageLabel: cleanText(source.stageLabel, 160),
        status,
        nextCheckpoint: normalizeClockObject(source.nextCheckpoint),
        consequences: list(source.consequences)
            .map(normalizeConsequence)
            .filter(Boolean)
            .slice(-PLAN_CONSEQUENCE_LIMIT),
        evidence: list(source.evidence)
            .map(normalizeEvidence)
            .filter(Boolean)
            .slice(-PLAN_EVIDENCE_LIMIT),
        cancellationReason: cleanText(source.cancellationReason, 240),
        createdAt: cleanText(source.createdAt, 160),
        updatedAt: cleanText(source.updatedAt, 160),
        lastAdvancedKey: cleanText(source.lastAdvancedKey, 160),
    };
}

function normalizePlanCreateDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const kind = normalizeEnum(source.kind, PLAN_KINDS, '');
    const actor = cleanText(source.actor, 120);
    const objective = cleanText(source.objective, 240);
    const cause = cleanText(source.cause, 280);
    if (!kind || !actor || !objective || !cause) return null;
    return {
        kind,
        actor,
        objective,
        target: cleanText(source.target, 160),
        location: cleanText(source.location, 160),
        cause,
        resources: uniqueText(source.resources, 160).slice(0, 8),
        prerequisites: uniqueText(source.prerequisites, 180).slice(0, 8),
        delayDays: clampInt(source.delayDays, 0, 120, 0),
        delaySlots: clampInt(source.delaySlots, 0, MAX_DELAY_SLOTS, 0),
    };
}

function normalizePlanAdvanceDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const planId = cleanId(source.planId);
    const consequence = cleanText(source.consequence, 360);
    const stageLabel = cleanText(source.stageLabel, 160);
    if (!planId || !consequence || !stageLabel) return null;
    return {
        planId,
        stageLabel,
        consequence,
        status: normalizeEnum(source.status, ['active', 'completed'], 'active'),
        nextDelayDays: clampInt(source.nextDelayDays, 0, 120, 0),
        nextDelaySlots: clampInt(source.nextDelaySlots, 0, MAX_DELAY_SLOTS, 0),
        evidence: list(source.evidence)
            .map(normalizeEvidenceDelta)
            .filter(Boolean)
            .slice(0, 4),
    };
}

function normalizePlanCancelDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const planId = cleanId(source.planId);
    const reason = cleanText(source.reason, 240);
    if (!planId || !reason) return null;
    return { planId, reason };
}

function normalizeEvidenceDiscovery(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const id = cleanId(source.id);
    const quote = cleanText(source.quote, 500);
    if (!id || quote.length < 8) return null;
    return { id, quote };
}

function normalizeAuthorizedEvidence(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const id = cleanId(source.id);
    if (!id) return null;
    return {
        id,
        topic: cleanText(source.topic, 160),
        text: cleanText(source.text, 320),
    };
}

function normalizeConsequence(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const summary = cleanText(source.summary, 360);
    if (!summary) return null;
    return {
        stage: clampInt(source.stage, 1, 24, 1),
        label: cleanText(source.label, 160),
        summary,
        at: normalizeClockObject(source.at),
        evidenceIds: uniqueText(source.evidenceIds, 100).slice(0, 8),
    };
}

function normalizeEvidence(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const id = cleanId(source.id);
    const topic = cleanText(source.topic, 160);
    const text = cleanText(source.text, 320);
    const route = normalizeEnum(source.route, EVIDENCE_ROUTES, '');
    if (!id || !topic || !text || !route) return null;
    return {
        id,
        topic,
        text,
        route,
        location: cleanText(source.location, 160),
        actor: cleanText(source.actor, 120),
        discovered: normalizeBoolean(source.discovered),
        createdAt: normalizeClockObject(source.createdAt),
        discoveredAt: cleanText(source.discoveredAt, 160),
    };
}

function normalizeEvidenceDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const topic = cleanText(source.topic, 160);
    const text = cleanText(source.text, 320);
    const route = normalizeEnum(source.route, EVIDENCE_ROUTES, '');
    const location = cleanText(source.location, 160);
    const actor = cleanText(source.actor, 120);
    if (!topic || !text || !route) return null;
    if (route === 'location' && !location) return null;
    if (route === 'actor' && !actor) return null;
    if (route === 'news' && !location && !actor) return null;
    if (route === 'investigation' && !location && !actor) return null;
    return { topic, text, route, location, actor };
}

function createPlanFromDelta(delta, worldState, messageKey) {
    const currentIndex = worldClockIndex(worldState);
    const delay = normalizedDelaySlots(delta.delayDays, delta.delaySlots);
    const fingerprint = `${delta.kind}|${delta.actor}|${delta.objective}|${delta.target}|${messageKey}`;
    return normalizePlan({
        id: stableId('plan', fingerprint),
        ...delta,
        stage: 0,
        stageLabel: 'Established',
        status: 'active',
        nextCheckpoint: clockIndexToObject(currentIndex + delay),
        consequences: [],
        evidence: [],
        createdAt: messageKey,
        updatedAt: messageKey,
    });
}

function canCreatePlan(delta, progression, powerActors) {
    const actorKey = entityKey(delta.actor);
    const objectiveKey = entityKey(delta.objective);
    if (!actorKey || !objectiveKey) return false;
    if (progression.plans.some(plan =>
        plan.status === 'active'
        && entityKey(plan.actor) === actorKey
        && entityKey(plan.objective) === objectiveKey,
    )) return false;
    const knownPowerActor = findPowerActor(delta.actor, powerActors);
    if (knownPowerActor && delta.kind !== 'power_actor') return false;
    if (delta.kind === 'power_actor') {
        if (progressionHasActivePlanForActor(progression, delta.actor)) return false;
        return powerActorPlanAvailable(delta.actor, powerActors);
    }
    return true;
}

function activePlanCount(value = {}) {
    return normalizeWorldProgression(value).plans.filter(plan => plan.status === 'active').length;
}

function powerActorPlanAvailable(actor, powerActors, options = {}) {
    const match = findPowerActor(actor, powerActors);
    if (!match) return false;
    const state = match[1] && typeof match[1] === 'object' ? match[1] : {};
    const hasAuthority = options.allowActivePlan === true
        || Number(state.enmity || 0) > 0
        || Boolean(state.pendingEvent?.id)
        || Boolean(state.activeAgent?.name);
    if (!hasAuthority) return false;
    if (state.pendingEvent?.id && options.allowPending !== true) return false;
    return true;
}

function findPowerActor(actor, powerActors) {
    const key = entityKey(actor);
    if (!key) return null;
    return Object.entries(powerActors || {}).find(([name, state]) =>
        entityKey(name) === key || entityKey(state?.name) === key,
    ) || null;
}

function advancePlan(plan, delta, worldState, messageKey) {
    const stage = plan.stage + 1;
    const evidence = delta.evidence.map((item, index) => normalizeEvidence({
        ...item,
        id: stableId('evidence', `${plan.id}|${stage}|${index}|${item.topic}|${item.text}`),
        createdAt: normalizeClockObject(worldState),
        discovered: false,
    })).filter(Boolean);
    const status = delta.status;
    const delay = status === 'active'
        ? normalizedDelaySlots(delta.nextDelayDays, delta.nextDelaySlots)
        : 0;
    const nextCheckpoint = status === 'active'
        ? clockIndexToObject(worldClockIndex(worldState) + delay)
        : normalizeClockObject(worldState);
    return normalizePlan({
        ...plan,
        stage,
        stageLabel: delta.stageLabel,
        status,
        nextCheckpoint,
        consequences: [
            ...plan.consequences,
            {
                stage,
                label: delta.stageLabel,
                summary: delta.consequence,
                at: normalizeClockObject(worldState),
                evidenceIds: evidence.map(item => item.id),
            },
        ],
        evidence: [...plan.evidence, ...evidence],
        updatedAt: messageKey,
        lastAdvancedKey: messageKey,
    });
}

function discoverProgressionEvidence(progressionValue, archiveValue, ids, options = {}) {
    const progression = normalizeWorldProgression(progressionValue);
    let archive = normalizeDescriptiveArchive(archiveValue);
    const wanted = new Set(ids);
    const discoveredIds = [];
    progression.plans = progression.plans.map(plan => {
        const evidence = plan.evidence.map(item => {
            if (item.discovered || !wanted.has(item.id)) return item;
            discoveredIds.push(item.id);
            archive = promoteEvidenceToArchive(archive, item, options);
            return {
                ...item,
                discovered: true,
                discoveredAt: options.messageKey || '',
            };
        });
        return normalizePlan({ ...plan, evidence });
    }).filter(Boolean);
    return { progression: normalizeWorldProgression(progression), archive, discoveredIds };
}

function promoteEvidenceToArchive(archiveValue, evidence, options = {}) {
    return upsertArchiveDelta(archiveValue, {
        id: stableId('archive', `event|${evidence.topic}`),
        type: 'event',
        name: evidence.topic,
        summary: evidence.text,
        role: '',
        affiliation: '',
        description: '',
        history: [evidence.text],
        connections: evidence.actor ? [evidence.actor] : [],
        lastKnownStatus: evidence.text,
        lastKnownLocation: evidence.location || normalizeWorldState(options.worldState || {}).place,
        evidence: evidence.text,
    }, options.messageKey || 'discovered');
}

function isEvidenceRouteOpen(evidence, context) {
    const locationOpen = locationIsCurrent(evidence.location, context);
    const actorOpen = actorIsPresent(evidence.actor, context);
    const semanticText = [
        context.latestUserText,
        context.resolution?.GOAL,
        context.resolution?.RollReason,
        context.resolution?.identifyGoal,
        context.resolution?.identifyChallenge,
    ].filter(Boolean).join(' ');
    switch (evidence.route) {
        case 'location':
            return locationOpen;
        case 'actor':
            return actorOpen;
        case 'news':
            return (locationOpen || actorOpen) && /\b(news|rumou?r|report|message|notice|announcement|ask around|what happened|heard)\b/i.test(semanticText);
        case 'investigation':
            return (locationOpen || actorOpen) && /\b(investigat|search|inspect|examine|look into|ask about|trace|follow up|find out|check)\w*/i.test(semanticText);
        default:
            return false;
    }
}

function locationIsCurrent(location, context) {
    const wanted = entityKey(location);
    if (!wanted) return false;
    const state = context.worldState || {};
    return [state.reputationLocation, state.place, state.area].some(value => {
        const current = entityKey(value);
        return current && (
            current === wanted
            || ` ${current} `.includes(` ${wanted} `)
            || ` ${wanted} `.includes(` ${current} `)
        );
    });
}

function actorIsPresent(actor, context) {
    const wanted = entityKey(actor);
    if (!wanted) return false;
    return (context.sceneNames || []).some(name => entityKey(name) === wanted);
}

function entityAppearsInScene(entity, context) {
    const wanted = entityKey(entity);
    if (!wanted) return false;
    if ((context.sceneNames || []).some(name => entityKey(name) === wanted)) return true;
    const state = context.worldState || {};
    if ([state.reputationLocation, state.place, state.area].some(value => entityKey(value) === wanted)) return true;
    return textContainsEntity(context.latestUserText, entity);
}

function relevantArchiveEntries(archive, context) {
    return archive.entries.filter(entry => archiveEntryIsRelevant(entry, context)).map(entry => ({
        type: entry.type,
        name: entry.name,
        summary: entry.summary,
        role: entry.role,
        affiliation: entry.affiliation,
        description: entry.description,
        history: entry.history,
        connections: entry.connections,
        lastKnownStatus: entry.lastKnownStatus,
        lastKnownLocation: entry.lastKnownLocation,
    }));
}

function archiveEntryIsRelevant(entry, context) {
    if (entityAppearsInScene(entry.name, context)) return true;
    if (entry.lastKnownLocation && entityAppearsInScene(entry.lastKnownLocation, context)) return true;
    if (entry.affiliation && entityAppearsInScene(entry.affiliation, context)) return true;
    return entry.connections.some(connection => entityAppearsInScene(connection, context));
}

function compactArchiveEntryForUpdate(entry) {
    return {
        id: entry.id,
        type: entry.type,
        name: entry.name,
        summary: cleanText(entry.summary, 180),
        role: cleanText(entry.role, 100),
        affiliation: cleanText(entry.affiliation, 100),
        description: cleanText(entry.description, 180),
        recentHistory: entry.history.slice(-2).map(item => cleanText(item, 160)),
        connections: entry.connections.slice(-4).map(item => cleanText(item, 100)),
        lastKnownStatus: cleanText(entry.lastKnownStatus, 140),
        lastKnownLocation: cleanText(entry.lastKnownLocation, 100),
        updatedAt: entry.updatedAt,
    };
}

function compactActivePlanForUpdate(plan) {
    return {
        id: plan.id,
        kind: plan.kind,
        actor: plan.actor,
        objective: plan.objective,
        target: plan.target,
        location: plan.location,
        cause: cleanText(plan.cause, 240),
        resources: plan.resources.slice(-4).map(item => cleanText(item, 120)),
        prerequisites: plan.prerequisites.slice(-4).map(item => cleanText(item, 140)),
        stage: plan.stage,
        stageLabel: plan.stageLabel,
        nextCheckpoint: plan.nextCheckpoint,
        recentConsequences: plan.consequences.slice(-3).map(item => ({
            stage: item.stage,
            label: item.label,
            summary: cleanText(item.summary, 240),
            at: item.at,
        })),
        unresolvedEvidence: plan.evidence
            .filter(item => !item.discovered)
            .slice(-4)
            .map(item => ({
                id: item.id,
                topic: item.topic,
                text: cleanText(item.text, 200),
                route: item.route,
                location: item.location,
                actor: item.actor,
            })),
    };
}

function normalizeWorldMemoryPatch(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    if (Number(source.version) !== WORLD_MEMORY_PATCH_VERSION) {
        return {
            version: WORLD_MEMORY_PATCH_VERSION,
            archiveUpsert: [],
            archiveRemove: [],
            planPatches: [],
        };
    }
    return {
        version: WORLD_MEMORY_PATCH_VERSION,
        archiveUpsert: list(source.archiveUpsert).map(normalizeArchiveEntry).filter(Boolean),
        archiveRemove: uniqueText(source.archiveRemove, 100).map(cleanId).filter(Boolean),
        planPatches: list(source.planPatches).map(normalizePlanPatch).filter(Boolean),
    };
}

function createPlanPatch(beforeValue, afterValue) {
    const before = beforeValue ? normalizePlan(beforeValue) : null;
    const after = normalizePlan(afterValue);
    if (!after) return null;
    const set = {};
    for (const field of planPatchSetFields()) {
        if (!before || !sameStructuredValue(before[field], after[field])) set[field] = after[field];
    }
    const beforeConsequences = new Map(list(before?.consequences).map(item => [String(item.stage), item]));
    const afterConsequences = new Map(after.consequences.map(item => [String(item.stage), item]));
    const consequenceUpsert = [...afterConsequences.values()]
        .filter(item => !sameStructuredValue(beforeConsequences.get(String(item.stage)), item));
    const consequenceRemove = [...beforeConsequences.keys()].filter(key => !afterConsequences.has(key)).map(Number);
    const beforeEvidence = new Map(list(before?.evidence).map(item => [item.id, item]));
    const afterEvidence = new Map(after.evidence.map(item => [item.id, item]));
    const evidenceUpsert = [...afterEvidence.values()]
        .filter(item => !sameStructuredValue(beforeEvidence.get(item.id), item));
    const evidenceRemove = [...beforeEvidence.keys()].filter(id => !afterEvidence.has(id));
    if (!Object.keys(set).length
        && !consequenceUpsert.length
        && !consequenceRemove.length
        && !evidenceUpsert.length
        && !evidenceRemove.length) return null;
    return {
        id: after.id,
        set,
        consequenceUpsert,
        consequenceRemove,
        evidenceUpsert,
        evidenceRemove,
    };
}

function normalizePlanPatch(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const id = cleanId(source.id);
    if (!id) return null;
    if (source.remove === true) return { id, remove: true };
    const rawSet = source.set && typeof source.set === 'object' ? source.set : {};
    const set = {};
    for (const field of planPatchSetFields()) {
        if (Object.prototype.hasOwnProperty.call(rawSet, field)) set[field] = rawSet[field];
    }
    return {
        id,
        set,
        consequenceUpsert: list(source.consequenceUpsert).map(normalizeConsequence).filter(Boolean),
        consequenceRemove: list(source.consequenceRemove).map(item => clampInt(item, 1, 24, 1)),
        evidenceUpsert: list(source.evidenceUpsert).map(normalizeEvidence).filter(Boolean),
        evidenceRemove: uniqueText(source.evidenceRemove, 100).map(cleanId).filter(Boolean),
    };
}

function planPatchSetFields() {
    return [
        'kind', 'actor', 'objective', 'target', 'location', 'cause', 'resources', 'prerequisites',
        'stage', 'stageLabel', 'status', 'nextCheckpoint', 'cancellationReason', 'createdAt',
        'updatedAt', 'lastAdvancedKey',
    ];
}

function applyKeyedPatch(currentValue, upsertValue, removeValue, keyFor) {
    const removed = new Set(list(removeValue).map(item => String(item)));
    const current = list(currentValue).filter(item => !removed.has(String(keyFor(item))));
    const byKey = new Map(current.map((item, index) => [String(keyFor(item)), index]));
    for (const item of list(upsertValue)) {
        const key = String(keyFor(item));
        if (!key) continue;
        const index = byKey.get(key);
        if (index == null) {
            byKey.set(key, current.length);
            current.push(item);
        } else {
            current[index] = item;
        }
    }
    return current;
}

function sameStructuredValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function collectSceneNames(resolution = {}) {
    return uniqueText([
        resolution.NPCInScene,
        resolution.ActionTargets,
        resolution.OppTargets?.NPC,
        resolution.hostilesInScene?.NPC,
        resolution.BenefitedObservers,
        resolution.HarmedObservers,
        resolution.NPCAwareOfUser,
    ], 120);
}

function renameArchiveEntities(value, promotions) {
    const archive = normalizeDescriptiveArchive(value);
    archive.entries = archive.entries.map(entry => normalizeArchiveEntry({
        ...entry,
        name: promotedName(entry.name, promotions),
        affiliation: promotedName(entry.affiliation, promotions),
        connections: entry.connections.map(name => promotedName(name, promotions)),
    })).filter(Boolean);
    return normalizeDescriptiveArchive(archive);
}

function renameProgressionEntities(value, promotions) {
    const progression = normalizeWorldProgression(value);
    progression.plans = progression.plans.map(plan => normalizePlan({
        ...plan,
        actor: promotedName(plan.actor, promotions),
        target: promotedName(plan.target, promotions),
        evidence: plan.evidence.map(item => ({
            ...item,
            actor: promotedName(item.actor, promotions),
        })),
    })).filter(Boolean);
    return normalizeWorldProgression(progression);
}

function normalizeEntityPromotions(value) {
    return list(value).map(item => ({
        oldName: cleanText(item?.oldName, 120),
        newName: cleanText(item?.newName, 120),
    })).filter(item => item.oldName && item.newName && entityKey(item.oldName) !== entityKey(item.newName));
}

function promotedName(value, promotions) {
    let current = value;
    const seen = new Set();
    while (true) {
        const key = entityKey(current);
        if (!key || seen.has(key)) return current;
        seen.add(key);
        const match = promotions.find(item => entityKey(item.oldName) === key);
        if (!match) return current;
        current = match.newName;
    }
}

function promoteArchiveDelta(value, promotions) {
    if (!promotions.length) return value;
    return {
        ...value,
        name: promotedName(value.name, promotions),
        affiliation: promotedName(value.affiliation, promotions),
        connections: value.connections.map(name => promotedName(name, promotions)),
    };
}

function promotePlanCreateDelta(value, promotions) {
    if (!promotions.length) return value;
    return {
        ...value,
        actor: promotedName(value.actor, promotions),
        target: promotedName(value.target, promotions),
    };
}

function isSafeOffscreenConsequence(value, protectedUserNames = []) {
    const text = maskProtectedUserNames(cleanText(value, 500), protectedUserNames);
    if (!text) return false;
    const user = String.raw`(?:\{\{user\}\}|the user|the player(?: character)?|the protagonist|you)`;
    const protectedReference = new RegExp(
        `(?:^|[^A-Za-z0-9_])${user}(?:'s)?(?=$|[^A-Za-z0-9_])|\\b(?:your|yours|yourself|yourselves)\\b`,
        'i',
    );
    return !protectedReference.test(text);
}

function isProtectedPlayerEntity(value, protectedUserNames = []) {
    const key = entityKey(value);
    if (!key) return false;
    if ([
        'user', 'the user', 'player', 'the player', 'player character', 'the player character',
        'protagonist', 'the protagonist', 'pc', 'the pc', 'you', 'yourself', 'yourselves',
        'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', 'ourselves',
    ].includes(key)) {
        return true;
    }
    return uniqueText(protectedUserNames, 120).some(name => entityKey(name) === key);
}

function isGroundedInNarration(value, narrationText) {
    const evidence = comparisonText(value);
    const narration = comparisonText(narrationText, 50000);
    return evidence.length >= 4 && narration.includes(evidence);
}

function exactQuoteAppearsInNarration(value, narrationText) {
    const quote = cleanText(value, 500).normalize('NFKC');
    if (quote.length < 8) return false;
    return String(narrationText ?? '').normalize('NFKC').replace(/\s+/g, ' ').includes(quote);
}

function comparisonText(value, maxLength = 500) {
    return cleanText(value, maxLength)
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function quoteMatchesAuthorizedEvidence(value, authorized = {}) {
    const quote = comparisonText(value, 500);
    const reference = comparisonText(authorized.text || authorized.topic, 800);
    if (!quote || !reference) return false;
    if (quote === reference || quote.includes(reference)) return true;

    const quoteTokens = meaningfulEvidenceTokens(quote);
    const referenceTokens = meaningfulEvidenceTokens(reference);
    const overlap = [...quoteTokens].filter(token => referenceTokens.has(token));
    if (referenceTokens.size < 4 || quoteTokens.size < 4 || overlap.length < 4) return false;

    const referenceCoverage = overlap.length / referenceTokens.size;
    const quoteRelevance = overlap.length / quoteTokens.size;
    return referenceCoverage >= 0.8 && quoteRelevance >= 0.7;
}

function meaningfulEvidenceTokens(value) {
    return new Set(String(value || '')
        .split(' ')
        .filter(token => token && !EVIDENCE_STOP_WORDS.has(token)));
}

function maskProtectedUserNames(value, names) {
    let text = String(value ?? '').normalize('NFKC');
    const normalizedNames = uniqueText(names, 120)
        .map(name => name.normalize('NFKC'))
        .sort((left, right) => right.length - left.length);
    for (const name of normalizedNames) {
        if (name.length < 2) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'giu'), '$1{{user}}');
    }
    return text;
}

function normalizedDelaySlots(days, slots) {
    const total = clampInt(days, 0, 120, 0) * WORLD_TIME_SLOTS.length + clampInt(slots, 0, MAX_DELAY_SLOTS, 0);
    return Math.max(1, Math.min(MAX_DELAY_SLOTS, total || 1));
}

function normalizeClockObject(value = {}) {
    const state = normalizeWorldState(value || {});
    return { dayIndex: state.dayIndex, timeOfDay: state.timeOfDay };
}

function clockObjectIndex(value = {}) {
    const dayIndex = clampInt(value.dayIndex, 1, 9999, 1);
    const slot = Math.max(0, WORLD_TIME_SLOTS.indexOf(String(value.timeOfDay || '').toLowerCase()));
    return (dayIndex - 1) * WORLD_TIME_SLOTS.length + slot;
}

function clockIndexToObject(index) {
    const safe = Math.max(0, Math.floor(Number(index) || 0));
    return {
        dayIndex: Math.floor(safe / WORLD_TIME_SLOTS.length) + 1,
        timeOfDay: WORLD_TIME_SLOTS[safe % WORLD_TIME_SLOTS.length] || WORLD_TIME_SLOTS[0],
    };
}

function stableId(prefix, value) {
    const text = String(value || prefix);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function cleanId(value) {
    return cleanText(value, 100).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function entityKey(value) {
    return comparisonText(value, 180);
}

function textContainsEntity(text, entity) {
    const source = entityKey(text);
    const wanted = entityKey(entity);
    if (!source || !wanted || wanted.length < 3) return false;
    return ` ${source} `.includes(` ${wanted} `);
}

function cleanText(value, maxLength = 240) {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^["']|["']$/g, '')
        .trim()
        .slice(0, maxLength);
}

function uniqueText(value, maxLength = 240) {
    const stack = Array.isArray(value) ? [...value] : value == null ? [] : [value];
    const result = [];
    const seen = new Set();
    while (stack.length) {
        const current = stack.shift();
        if (Array.isArray(current)) {
            stack.unshift(...current);
            continue;
        }
        const text = cleanText(current, maxLength);
        const key = text.toLowerCase();
        if (!text || seen.has(key) || ['none', '(none)', 'unchanged'].includes(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}

function list(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeEnum(value, allowed, fallback) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return allowed.includes(text) ? text : fallback;
}

function normalizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    return ['y', 'yes', 'true', '1'].includes(String(value ?? '').trim().toLowerCase());
}

function clampInt(value, min, max, fallback) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}
