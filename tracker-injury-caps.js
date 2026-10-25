const NONE = '(none)';

const SEVERITY_RANK = Object.freeze({
    none: 0,
    minor: 1,
    moderate: 2,
    severe: 3,
    critical: 4,
});

const CONDITION_RANK = Object.freeze({
    unchanged: 0,
    healthy: 0,
    bruised: 1,
    wounded: 2,
    badly_wounded: 3,
    critical: 4,
    dead: 5,
});

export function collectContextualInjuryCaps(report) {
    const aggressionResults = report?.finalNarrativeHandoff?.aggressionResults || report?.aggressionResults || {};
    const caps = [];
    const seen = new Set();

    for (const [sourceName, result] of Object.entries(aggressionResults || {})) {
        for (const injury of [result?.InflictedTargetInjury, result?.InflictedUserInjury]) {
            if (!injury || injury.InjuryDetailMode !== 'narrator_contextual') continue;
            const targetType = injury.targetType === 'user' ? 'user' : 'npc';
            const target = targetType === 'user' ? '{{user}}' : cleanValue(injury.target || injury.NPC);
            if (targetType === 'npc' && !isReal(target)) continue;
            const severityLimit = normalizeSeverity(injury.InjurySeverityLimit || injury.severity);
            const cap = {
                source: cleanValue(injury.sourceNpc || sourceName),
                target,
                targetType,
                severityLimit,
                condition: conditionFromSeverity(severityLimit),
                context: cleanValue(injury.InjuryContextHint || injury.attackType || injury.NarrationRule),
            };
            const key = [
                cap.source.toLowerCase(),
                cap.targetType,
                cap.target.toLowerCase(),
                cap.severityLimit,
            ].join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            caps.push(cap);
        }
    }

    return caps;
}

export function formatContextualInjuryCapsForPrompt(caps) {
    const normalized = normalizeContextualInjuryCaps(caps);
    if (!normalized.length) return '';
    return normalized.map(cap => [
        `source:${valueOrNone(cap.source)}`,
        `target:${cap.targetType === 'user' ? 'user/persona' : valueOrNone(cap.target)}`,
        `severityLimit:${valueOrNone(cap.severityLimit)}`,
        `conditionLimit:${valueOrNone(cap.condition)}`,
        `context:${valueOrNone(cap.context)}`,
    ].join(' | ')).join('\n');
}

export function applyContextualInjuryCapsToTrackerDelta(delta, caps) {
    const capByTarget = mergeCapsByTarget(caps);
    if (!capByTarget.size || !delta || typeof delta !== 'object') return delta;

    const result = clone(delta);
    const userCap = capByTarget.get('user');
    if (userCap && result.user) {
        result.user = clampActorDeltaToCap(result.user, userCap);
    }

    if (Array.isArray(result.npcs)) {
        result.npcs = result.npcs
            .map(item => {
                const key = `npc:${normalizeNameKey(item?.NPC)}`;
                const cap = capByTarget.get(key);
                return cap ? clampActorDeltaToCap(item, cap) : item;
            })
            .filter(item => hasTrackerDeltaChange(item, false));
    }

    return result;
}

function normalizeContextualInjuryCaps(caps) {
    return Array.isArray(caps)
        ? caps.map(cap => ({
            source: cleanValue(cap?.source),
            target: cap?.targetType === 'user' ? '{{user}}' : cleanValue(cap?.target),
            targetType: cap?.targetType === 'user' ? 'user' : 'npc',
            severityLimit: normalizeSeverity(cap?.severityLimit),
            condition: conditionFromSeverity(normalizeSeverity(cap?.severityLimit)),
            context: cleanValue(cap?.context),
        })).filter(cap => cap.targetType === 'user' || isReal(cap.target))
        : [];
}

function mergeCapsByTarget(caps) {
    const merged = new Map();
    for (const cap of normalizeContextualInjuryCaps(caps)) {
        const key = cap.targetType === 'user' ? 'user' : `npc:${normalizeNameKey(cap.target)}`;
        if (!key || key === 'npc:') continue;
        const existing = merged.get(key);
        if (!existing || severityRank(cap.severityLimit) > severityRank(existing.severityLimit)) {
            merged.set(key, cap);
        }
    }
    return merged;
}

function clampActorDeltaToCap(actorDelta, cap) {
    const source = actorDelta && typeof actorDelta === 'object' ? actorDelta : {};
    const cappedWounds = filterEffectsToSeverityCap(source.woundsAdd, cap.severityLimit);
    const cappedStatus = filterEffectsToSeverityCap(source.statusAdd, cap.severityLimit);
    const hasConcreteEffect = cappedWounds.length > 0 || cappedStatus.length > 0;
    return {
        ...source,
        condition: hasConcreteEffect ? clampConditionToSeverity(source.condition, cap.severityLimit) : 'unchanged',
        woundsAdd: cappedWounds,
        statusAdd: cappedStatus,
    };
}

function clampConditionToSeverity(condition, severityLimit) {
    const normalized = normalizeCondition(condition);
    if (normalized === 'dead') return conditionFromSeverity(severityLimit);
    const capRank = severityRank(severityLimit);
    if ((CONDITION_RANK[normalized] ?? 0) <= capRank) return normalized;
    return conditionFromSeverity(severityLimit);
}

function filterEffectsToSeverityCap(items, severityLimit) {
    if (!Array.isArray(items)) return [];
    return items.filter(item => {
        const text = cleanValue(item);
        return text && !effectExceedsSeverityCap(text, severityLimit);
    });
}

function effectExceedsSeverityCap(value, severityLimit) {
    const text = String(value || '').toLowerCase();
    const capRank = severityRank(severityLimit);
    if (capRank < SEVERITY_RANK.critical && /\b(dead|dying|fatal|severed|amputated|missing|shattered|crushed|paraly[sz]ed|paralysis|unconscious|ruptured|spine broken|broken spine|neck broken|broken neck)\b/.test(text)) {
        return true;
    }
    if (capRank < SEVERITY_RANK.severe && /\b(broken|fractured|dislocated|crippled|deep|heavy bleeding|bleeding heavily|gouged|impaled|stabbed|pierced|torn|mangled|burned badly|badly burned|blinded)\b/.test(text)) {
        return true;
    }
    if (capRank < SEVERITY_RANK.moderate) {
        const hasMinorQualifier = /\b(minor|small|shallow|superficial|thin|light|surface|surface-level|scratch|scratched|nick)\b/.test(text);
        if (!hasMinorQualifier && /\b(sprained|strained|poisoned|sickened|stunned|concussed|concussion|head injury|exhausted|numb|wounded|ongoing breathing trouble)\b/.test(text)) {
            return true;
        }
    }
    return false;
}

function hasTrackerDeltaChange(delta, includePlayerFields) {
    if (!delta || typeof delta !== 'object') return false;
    if (normalizeCondition(delta.condition) !== 'unchanged') return true;
    if (!includePlayerFields && cleanValue(delta.personalitySummary)) return true;
    // An NPC can pick something up in the same scene where they get hurt. Filtering only
    // wounds and gear dropped an inventory-only delta, so prose said they had it and the
    // tracker never recorded it. Both branches now consider the same carrying fields.
    const fields = includePlayerFields
        ? ['woundsAdd', 'woundsRemove', 'statusAdd', 'statusRemove', 'gearAdd', 'gearRemove', 'inventoryAdd', 'inventoryRemove', 'tasksAdd', 'tasksRemove', 'commitmentsAdd', 'commitmentsRemove']
        : ['woundsAdd', 'woundsRemove', 'statusAdd', 'statusRemove', 'gearAdd', 'gearRemove', 'inventoryAdd', 'inventoryRemove', 'tasksAdd', 'tasksRemove', 'commitmentsAdd', 'commitmentsRemove'];
    return fields.some(field => Array.isArray(delta[field]) && delta[field].length > 0);
}

function normalizeSeverity(value) {
    const text = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ['minor', 'moderate', 'severe', 'critical'].includes(text) ? text : 'minor';
}

function normalizeCondition(value) {
    const text = String(value ?? 'unchanged').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return Object.prototype.hasOwnProperty.call(CONDITION_RANK, text) ? text : 'unchanged';
}

function conditionFromSeverity(severity) {
    const normalized = normalizeSeverity(severity);
    if (normalized === 'critical') return 'critical';
    if (normalized === 'severe') return 'badly_wounded';
    if (normalized === 'moderate') return 'wounded';
    return 'bruised';
}

function severityRank(value) {
    return SEVERITY_RANK[normalizeSeverity(value)] ?? SEVERITY_RANK.minor;
}

function normalizeNameKey(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanValue(value) {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 180);
}

function isReal(value) {
    return Boolean(cleanValue(value));
}

function valueOrNone(value) {
    return cleanValue(value) || NONE;
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}
