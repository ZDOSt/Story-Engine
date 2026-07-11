export const HIDDEN_HEALTH_VERSION = 1;

export const USER_BASE_MAX_HP = 10;
export const ADVENTURING_NPC_BASE_MAX_HP = 10;

const NPC_MAX_HP_RANGE_BY_RANK = Object.freeze({
    Weak: [3, 8],
    Average: [9, 15],
    Trained: [16, 25],
    Elite: [26, 40],
    Boss: [50, 70],
    none: [9, 15],
});

const DAMAGE_BY_OUTCOME_TIER = Object.freeze({
    Success: 3,
    Minor_Success: 3,
    Moderate_Success: 6,
    Critical_Success: 9,
});

const DAMAGE_BY_SEVERITY = Object.freeze({
    minor: 3,
    moderate: 6,
    severe: 9,
    critical: 9,
    fatal: 999,
});

const MAGIC_HEAL_BY_OUTCOME_TIER = Object.freeze({
    Success: 3,
    Minor_Success: 3,
    Moderate_Success: 6,
    Critical_Success: 9,
});

const NATURAL_HEAL_BY_OUTCOME_TIER = Object.freeze({
    Success: 1,
    Minor_Success: 1,
    Moderate_Success: 2,
    Critical_Success: 3,
});

const IMPAIRMENT_BY_CONDITION = Object.freeze({
    healthy: 0,
    bruised: -1,
    wounded: -2,
    badly_wounded: -4,
    critical: -6,
    incapacitated: -999,
    dead: -999,
});

const HEALING_DC_BY_CONDITION = Object.freeze({
    healthy: 13,
    bruised: 13,
    wounded: 16,
    badly_wounded: 19,
    critical: 19,
    incapacitated: 19,
    dead: 19,
});

const TRACKED_CONDITIONS = Object.freeze(['healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'incapacitated', 'dead']);
const CONDITION_MAX_SEVERITY = Object.freeze({
    healthy: 'none',
    bruised: 'minor',
    wounded: 'moderate',
    badly_wounded: 'severe',
    critical: 'critical',
    incapacitated: 'critical',
    dead: 'critical',
});
const SEVERITY_ORDER = Object.freeze(['minor', 'moderate', 'severe', 'critical']);

export function cloneHiddenHealth(value) {
    return value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : normalizeHiddenHealth(value);
}

export function normalizeHiddenHealth(value = {}, refs = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const seed = normalizeHealthSeed(source.seed || refs.seed || createRandomHealthSeed());
    const userRef = refs.user || {};
    const npcRefs = refs.npcs && typeof refs.npcs === 'object' ? refs.npcs : {};
    const existingNpcs = source.npcs && typeof source.npcs === 'object' ? source.npcs : {};
    const npcs = {};

    for (const name of uniqueStrings([...Object.keys(existingNpcs), ...Object.keys(npcRefs)])) {
        if (!isRealName(name)) continue;
        npcs[name] = normalizeHealthActor(existingNpcs[name], {
            maxHp: defaultNpcMaxHp(npcRefs[name], name, seed),
            condition: normalizeCondition(npcRefs[name]?.condition),
            actorType: 'npc',
        });
    }

    return {
        version: HIDDEN_HEALTH_VERSION,
        seed,
        user: normalizeHealthActor(source.user, {
            maxHp: Math.max(USER_BASE_MAX_HP, numberOr(userRef?.maxHp, USER_BASE_MAX_HP)),
            condition: normalizeCondition(userRef?.condition),
            actorType: 'user',
        }),
        npcs,
        updatedAt: Math.max(0, Math.floor(Number(source.updatedAt || 0))),
    };
}

export function defaultNpcMaxHp(entry = {}, name = '', seed = '') {
    const rank = normalizeRank(entry?.currentCoreStats?.Rank || entry?.Rank || 'none');
    const base = rollHiddenNpcMaxHp(rank, entry, name, seed);
    return isAdventuringScaleNpc(entry)
        ? Math.max(ADVENTURING_NPC_BASE_MAX_HP, base)
        : base;
}

export function damageForOutcomeTier(outcomeTier) {
    return DAMAGE_BY_OUTCOME_TIER[String(outcomeTier || '').trim()] || 0;
}

export function damageForSeverity(severity) {
    return DAMAGE_BY_SEVERITY[String(severity || '').trim().toLowerCase()] || 0;
}

export function magicHealAmountForOutcomeTier(outcomeTier) {
    return MAGIC_HEAL_BY_OUTCOME_TIER[String(outcomeTier || '').trim()] || 0;
}

export function naturalHealAmountForOutcomeTier(outcomeTier) {
    return NATURAL_HEAL_BY_OUTCOME_TIER[String(outcomeTier || '').trim()] || 0;
}

export function safeSceneHealingAmount(isMagic) {
    return isMagic ? 9 : 3;
}

export function naturalRecoveryAmountPerDay() {
    return 2;
}

export function naturalFullRecoveryAmount() {
    return 9999;
}

export function hiddenHealthPenaltyForCondition(condition) {
    return IMPAIRMENT_BY_CONDITION[normalizeCondition(condition)] ?? 0;
}

export function healingDcForCondition(condition) {
    return HEALING_DC_BY_CONDITION[normalizeCondition(condition)] || 13;
}

export function healingDcForTargets(health, targets = []) {
    const normalized = normalizeHiddenHealth(health);
    const conditions = targets
        .map(target => getHealthActorCondition(normalized, target))
        .filter(Boolean);
    if (!conditions.length) return 13;
    return Math.max(...conditions.map(healingDcForCondition));
}

export function getHealthActorCondition(health, target = {}) {
    const actor = getHealthActor(health, target);
    return actor ? conditionFromHealthActor(actor) : normalizeCondition(target.condition);
}

export function getHealthActor(health, target = {}) {
    const normalized = normalizeHiddenHealth(health);
    const targetType = String(target.targetType || target.type || '').toLowerCase();
    if (targetType === 'user') return normalized.user;
    const name = String(target.name || target.NPC || target.target || '').trim();
    if (!name) return null;
    return normalized.npcs[name] || null;
}

export function conditionFromHealthActor(actor = {}) {
    const maxHp = Math.max(1, Math.floor(Number(actor.maxHp || USER_BASE_MAX_HP)));
    const currentHp = clampInt(actor.currentHp, 0, maxHp);
    if (actor.dead === true) return 'dead';
    if (currentHp <= 0) {
        if (actor.nonlethalDefeat === true) return 'incapacitated';
        return 'dead';
    }
    const ratio = currentHp / maxHp;
    if (ratio >= 1) return 'healthy';
    if (ratio >= 0.76) return 'bruised';
    if (ratio >= 0.51) return 'wounded';
    if (ratio >= 0.26) return 'badly_wounded';
    return 'critical';
}

export function applyHiddenHealthEvents(health, events = [], refs = {}) {
    const next = normalizeHiddenHealth(health, refs);
    let changed = false;

    for (const event of Array.isArray(events) ? events : []) {
        const applied = applyHiddenHealthEvent(next, event, refs);
        changed = changed || applied;
    }

    if (changed) next.updatedAt = Date.now();
    return next;
}

export function applyHiddenHealthToTrackerState(state = {}, health) {
    const normalized = normalizeHiddenHealth(health);
    const result = {
        user: state.user && typeof state.user === 'object' ? { ...state.user } : {},
        npcs: state.npcs && typeof state.npcs === 'object' ? { ...state.npcs } : {},
    };

    if (result.user) {
        result.user = reconcileVisibleInjuryState(result.user, conditionFromHealthActor(normalized.user));
    }

    for (const [name, entry] of Object.entries(result.npcs || {})) {
        const actor = normalized.npcs[name];
        if (!actor) continue;
        result.npcs[name] = reconcileVisibleInjuryState(entry || {}, conditionFromHealthActor(actor));
    }

    return result;
}

export function renameHiddenHealthNpc(health, oldName, newName) {
    const oldKey = String(oldName || '').trim();
    const newKey = String(newName || '').trim();
    if (!oldKey || !newKey || oldKey.toLowerCase() === newKey.toLowerCase()) return normalizeHiddenHealth(health);
    const next = normalizeHiddenHealth(health);
    if (!next.npcs[oldKey]) return next;
    next.npcs[newKey] = mergeHealthActors(next.npcs[oldKey], next.npcs[newKey]);
    delete next.npcs[oldKey];
    next.updatedAt = Date.now();
    return next;
}

export function applyProgressionHealthMilestone(root, companionNames = []) {
    if (!root || typeof root !== 'object') return false;
    root.health = normalizeHiddenHealth(root.health, { user: root.user || {}, npcs: root.npcs || {} });
    let changed = increaseActorMaxAndCurrent(root.health.user, 1);

    for (const name of uniqueStrings(companionNames)) {
        if (!isRealName(name)) continue;
        const entry = root.npcs?.[name] || {};
        const actor = root.health.npcs[name] || normalizeHealthActor(null, {
            maxHp: Math.max(ADVENTURING_NPC_BASE_MAX_HP, defaultNpcMaxHp(entry, name, root.health.seed)),
            condition: normalizeCondition(entry.condition),
            actorType: 'npc',
        });
        actor.maxHp = Math.max(ADVENTURING_NPC_BASE_MAX_HP, Number(actor.maxHp || 0));
        actor.currentHp = clampInt(actor.currentHp, 0, actor.maxHp);
        changed = increaseActorMaxAndCurrent(actor, 1) || changed;
        root.health.npcs[name] = actor;
    }

    if (changed) root.health.updatedAt = Date.now();
    return changed;
}

function applyHiddenHealthEvent(health, event = {}, refs = {}) {
    const target = resolveEventTarget(health, event, refs);
    if (!target.actor) return false;
    const before = JSON.stringify(target.actor);
    const kind = String(event.kind || '').toLowerCase();

    if (kind === 'damage') {
        applyDamageEvent(target.actor, event);
    } else if (kind === 'heal') {
        applyHealEvent(target.actor, event);
    } else if (kind === 'recovery') {
        applyRecoveryEvent(target.actor, event);
    } else if (kind === 'progression') {
        increaseActorMaxAndCurrent(target.actor, Math.max(1, Math.floor(Number(event.amount || 1))));
    }

    return before !== JSON.stringify(target.actor);
}

function resolveEventTarget(health, event = {}, refs = {}) {
    const targetType = String(event.targetType || event.type || '').toLowerCase();
    if (targetType === 'user') return { actor: health.user, name: 'user' };

    const name = String(event.target || event.NPC || event.name || '').trim();
    if (!name) return { actor: null, name: '' };
    if (!health.npcs[name]) {
        const entry = refs.npcs?.[name] || {};
        health.npcs[name] = normalizeHealthActor(null, {
            maxHp: defaultNpcMaxHp(entry, name, health.seed),
            condition: normalizeCondition(entry.condition),
            actorType: 'npc',
        });
    }
    return { actor: health.npcs[name], name };
}

function applyDamageEvent(actor, event = {}) {
    if (actor.dead === true) return;
    const amount = Math.max(0, Math.floor(Number(event.amount || 0)));
    const fatal = event.fatal === true || String(event.fatal || '').toUpperCase() === 'Y';
    const nonlethal = event.nonlethal === true || String(event.nonlethal || '').toUpperCase() === 'Y';
    actor.maxHp = Math.max(1, Math.floor(Number(actor.maxHp || USER_BASE_MAX_HP)));
    actor.currentHp = fatal ? 0 : clampInt(Number(actor.currentHp || 0) - amount, 0, actor.maxHp);
    actor.lastDamageAt = Date.now();
    actor.lastDamageStateKey = rawHealthStateKey(actor);
    if (fatal || (actor.currentHp <= 0 && !nonlethal)) {
        actor.dead = true;
        actor.nonlethalDefeat = false;
        actor.defeatedCondition = 'dead';
    } else if (actor.currentHp <= 0 && nonlethal) {
        actor.nonlethalDefeat = true;
        actor.defeatedCondition = 'incapacitated';
    }
}

function applyHealEvent(actor, event = {}) {
    if (actor.dead === true) return;
    const amount = Math.max(0, Math.floor(Number(event.amount || 0)));
    if (amount <= 0) return;
    const naturalTreatment = event.naturalTreatment === true || String(event.naturalTreatment || '').toUpperCase() === 'Y';
    if (naturalTreatment) {
        const treatmentKey = String(event.treatmentKey || healthDamageStateKey(actor));
        if (actor.naturalTreatmentKey === treatmentKey) return;
        actor.naturalTreatmentKey = treatmentKey;
        actor.naturalTreatmentAt = Date.now();
    }
    actor.maxHp = Math.max(1, Math.floor(Number(actor.maxHp || USER_BASE_MAX_HP)));
    actor.currentHp = clampInt(Number(actor.currentHp || 0) + amount, 0, actor.maxHp);
    if (actor.currentHp > 0) {
        actor.nonlethalDefeat = false;
        actor.defeatedCondition = 'none';
    }
    if (actor.currentHp >= actor.maxHp) {
        actor.naturalTreatmentKey = '';
    }
}

function applyRecoveryEvent(actor, event = {}) {
    if (actor.dead === true) return;
    const amount = Math.max(0, Math.floor(Number(event.amount || naturalRecoveryAmountPerDay())));
    if (amount <= 0 || Number(actor.currentHp || 0) >= Number(actor.maxHp || 0)) return;
    actor.currentHp = clampInt(Number(actor.currentHp || 0) + amount, 0, Math.max(1, Math.floor(Number(actor.maxHp || USER_BASE_MAX_HP))));
    if (actor.currentHp > 0) {
        actor.nonlethalDefeat = false;
        actor.defeatedCondition = 'none';
    }
    if (actor.currentHp >= actor.maxHp) {
        actor.naturalTreatmentKey = '';
    }
}

function normalizeHealthActor(value, defaults = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const maxHp = Math.max(1, Math.floor(Number(source.maxHp || defaults.maxHp || USER_BASE_MAX_HP)));
    const condition = normalizeCondition(defaults.condition || source.condition);
    const currentDefault = currentHpFromCondition(condition, maxHp);
    const currentHp = clampInt(source.currentHp ?? currentDefault, 0, maxHp);
    const dead = source.dead === true || condition === 'dead';
    const nonlethalDefeat = source.nonlethalDefeat === true || condition === 'incapacitated';
    return {
        version: HIDDEN_HEALTH_VERSION,
        actorType: defaults.actorType || source.actorType || 'npc',
        maxHp,
        currentHp: dead || nonlethalDefeat ? Math.min(currentHp, 0) : currentHp,
        dead,
        nonlethalDefeat: dead ? false : nonlethalDefeat,
        defeatedCondition: dead ? 'dead' : nonlethalDefeat ? 'incapacitated' : 'none',
        naturalTreatmentKey: String(source.naturalTreatmentKey || ''),
        naturalTreatmentAt: Math.max(0, Math.floor(Number(source.naturalTreatmentAt || 0))),
        lastDamageAt: Math.max(0, Math.floor(Number(source.lastDamageAt || 0))),
        lastDamageStateKey: String(source.lastDamageStateKey || ''),
    };
}

function mergeHealthActors(oldActor, newActor) {
    if (!newActor) return oldActor;
    const oldNormalized = normalizeHealthActor(oldActor);
    const newNormalized = normalizeHealthActor(newActor);
    const maxHp = Math.max(oldNormalized.maxHp, newNormalized.maxHp);
    return normalizeHealthActor({
        ...newNormalized,
        maxHp,
        currentHp: Math.min(oldNormalized.currentHp, newNormalized.currentHp),
        dead: oldNormalized.dead || newNormalized.dead,
        nonlethalDefeat: oldNormalized.nonlethalDefeat || newNormalized.nonlethalDefeat,
        defeatedCondition: oldNormalized.defeatedCondition !== 'none' ? oldNormalized.defeatedCondition : newNormalized.defeatedCondition,
    });
}

function increaseActorMaxAndCurrent(actor, amount) {
    const inc = Math.max(0, Math.floor(Number(amount || 0)));
    if (!actor || inc <= 0) return false;
    actor.maxHp = Math.max(1, Math.floor(Number(actor.maxHp || USER_BASE_MAX_HP))) + inc;
    if (actor.dead === true) return true;
    actor.currentHp = clampInt(Number(actor.currentHp || 0) + inc, 0, actor.maxHp);
    return true;
}

function currentHpFromCondition(condition, maxHp) {
    const normalized = normalizeCondition(condition);
    if (normalized === 'dead' || normalized === 'incapacitated') return 0;
    if (normalized === 'critical') return Math.max(1, Math.floor(maxHp * 0.25));
    if (normalized === 'badly_wounded') return Math.max(1, Math.floor(maxHp * 0.5));
    if (normalized === 'wounded') return Math.max(1, Math.floor(maxHp * 0.75));
    if (normalized === 'bruised') return Math.max(1, Math.floor(maxHp * 0.9));
    return maxHp;
}

function healthDamageStateKey(actor = {}) {
    if (actor.lastDamageStateKey) return String(actor.lastDamageStateKey);
    return rawHealthStateKey(actor);
}

function rawHealthStateKey(actor = {}) {
    return [
        Math.max(0, Math.floor(Number(actor.currentHp || 0))),
        Math.max(1, Math.floor(Number(actor.maxHp || USER_BASE_MAX_HP))),
        conditionFromHealthActor(actor),
    ].join(':');
}

function normalizeCondition(value) {
    const text = String(value || 'healthy').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (text === 'defeated') return 'incapacitated';
    return TRACKED_CONDITIONS.includes(text)
        ? text
        : 'healthy';
}

function reconcileVisibleInjuryState(entry = {}, condition) {
    const normalizedCondition = normalizeCondition(condition);
    const next = {
        ...(entry || {}),
        condition: normalizedCondition,
    };
    next.wounds = reconcileVisibleSeverityList(next.wounds, normalizedCondition, 'wound');
    next.statusEffects = reconcileVisibleSeverityList(next.statusEffects, normalizedCondition, 'status');
    return next;
}

function reconcileVisibleSeverityList(items = [], condition, type) {
    const list = Array.isArray(items) ? items : [];
    const maxSeverity = CONDITION_MAX_SEVERITY[normalizeCondition(condition)] || 'none';
    return list
        .map(item => reconcileVisibleSeverityItem(item, maxSeverity, type))
        .filter(Boolean);
}

function reconcileVisibleSeverityItem(item, maxSeverity, type) {
    const text = String(item || '').trim();
    if (!text) return '';
    if (type === 'status' && isPersistentNonInjuryStatus(text)) return text;
    if (maxSeverity === 'none' && isInjuryDerivedText(text, type)) return '';
    const currentSeverity = detectVisibleSeverity(text);
    if (!currentSeverity) return text;
    if (severityRank(currentSeverity) <= severityRank(maxSeverity)) return text;
    if (maxSeverity === 'none') return '';
    return replaceVisibleSeverity(text, maxSeverity);
}

function isInjuryDerivedText(text, type) {
    const source = String(text || '').toLowerCase();
    if (type === 'status' && isPersistentNonInjuryStatus(source)) return false;
    if (detectVisibleSeverity(source)) return true;
    if (type === 'wound') {
        return /\b(injury|wound|bruise|bruised|cut|gash|burn|bleeding|sprain|strain|broken|fractured|dislocated|crippled|mangled|torn|stabbed|pierced|impaled)\b/.test(source);
    }
    return /\b(impairment|injur|wound|bruis|bleed|burn|mobility|grip|combat|breathing|focus|balance|vision|stamina|physical)\b/.test(source);
}

function isPersistentNonInjuryStatus(text) {
    const source = String(text || '').toLowerCase();
    return /\b(poison(?:ed)?|venom|curse(?:d)?|hex(?:ed)?|disease(?:d)?|sick(?:ened)?|fever|restrain(?:ed|t)?|bound|pinned|immobili[sz]ed|paraly[sz](?:ed|is)|asleep|sedated|drugged|charmed|silenced|gagged)\b/.test(source);
}

function detectVisibleSeverity(text) {
    const source = String(text || '').toLowerCase();
    if (/\b(critical|fatal|dying|near death)\b/.test(source)) return 'critical';
    if (/\b(severe|badly|serious|grave|gravely|broken|fractured|dislocated|crippled|mangled|shattered|crushed|impaled|heavy bleeding|bleeding heavily)\b/.test(source)) return 'severe';
    if (/\b(moderate|wounded|sprained|strained|gashed|bleeding|poisoned|sickened|dazed|stunned|concussed|exhausted|numb)\b/.test(source)) return 'moderate';
    if (/\b(minor|bruised|bruise|scratch|scratched|sore|shallow|nick|aching|winded|fatigued)\b/.test(source)) return 'minor';
    return '';
}

function replaceVisibleSeverity(text, nextSeverity) {
    const source = String(text || '').trim();
    const severityPattern = /\b(critical|fatal|dying|near death|severe|badly|serious|grave|gravely|moderate|wounded|minor|bruised)\b/i;
    if (severityPattern.test(source)) {
        return source.replace(severityPattern, nextSeverity);
    }
    return `${nextSeverity} ${source}`.replace(/\s+/g, ' ').trim();
}

function severityRank(severity) {
    if (severity === 'none') return -1;
    const index = SEVERITY_ORDER.indexOf(severity);
    return index >= 0 ? index : -1;
}

function normalizeRank(value) {
    return ['Weak', 'Average', 'Trained', 'Elite', 'Boss', 'none'].includes(value) ? value : 'none';
}

function rollHiddenNpcMaxHp(rank, entry = {}, name = '', seed = '') {
    const normalizedRank = normalizeRank(rank);
    const [min, max] = NPC_MAX_HP_RANGE_BY_RANK[normalizedRank] || NPC_MAX_HP_RANGE_BY_RANK.none;
    const low = Math.max(1, Math.floor(Number(min || 1)));
    const high = Math.max(low, Math.floor(Number(max || low)));
    if (high <= low) return low;
    const seedText = [
        normalizeHealthSeed(seed || createRandomHealthSeed()),
        normalizedRank,
        String(name || entry?.NPC || entry?.name || entry?.id || 'npc'),
        normalizeRank(entry?.currentCoreStats?.Rank || entry?.Rank || normalizedRank),
        String(entry?.currentCoreStats?.MainStat || entry?.MainStat || 'none'),
    ].join('|');
    const span = high - low + 1;
    return low + (stableHash(seedText) % span);
}

function normalizeHealthSeed(value) {
    const text = String(value || '').trim();
    return text || createRandomHealthSeed();
}

function createRandomHealthSeed() {
    const cryptoObject = globalThis.crypto;
    if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
        const buffer = new Uint32Array(2);
        cryptoObject.getRandomValues(buffer);
        return `${buffer[0].toString(36)}${buffer[1].toString(36)}`;
    }
    return `${Date.now().toString(36)}${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36)}`;
}

function stableHash(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function isAdventuringScaleNpc(entry = {}) {
    if (entry?.hiddenHealthScale === 'adventuring' || entry?.adventuringScale === 'Y') return true;
    const rank = normalizeRank(entry?.currentCoreStats?.Rank || entry?.Rank || 'none');
    if (['Trained', 'Elite', 'Boss'].includes(rank)) return true;
    const disposition = entry?.currentDisposition && typeof entry.currentDisposition === 'object'
        ? entry.currentDisposition
        : {};
    if (Number(disposition.H || 0) >= 3) return true;
    const source = [
        entry?.personalitySummary,
        entry?.userHistory && typeof entry.userHistory === 'object' ? JSON.stringify(entry.userHistory) : entry?.userHistory,
        Array.isArray(entry?.gear) ? entry.gear.join(' ') : '',
    ].filter(Boolean).join(' ').toLowerCase();
    return /\b(adventur(?:e|er|ing)|companion|party|ally|enemy|hostile|bandit|raider|soldier|guard|knight|warrior|fighter|mercenary|assassin|monster|beast|mage|wizard|cultist|boss|elite)\b/.test(source);
}

function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampInt(value, min, max) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function uniqueStrings(items = []) {
    const result = [];
    const seen = new Set();
    for (const item of items) {
        const text = String(item || '').trim();
        const key = text.toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}

function isRealName(value) {
    const text = String(value || '').trim();
    return Boolean(text && !['(none)', 'none', 'null', 'undefined', 'n/a', 'unknown'].includes(text.toLowerCase()));
}
