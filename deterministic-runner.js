import {
    createDice,
    combatOutcome,
    nonHostileOutcome,
    counterBonusFromPotential,
    aggressionReactionOutcome,
    routeDispositionTarget,
    resolveStakeChangeByOutcome,
    applyMeaningfulBenefitReferee,
    relationToUserAction,
    proactivityRefereeGuard,
    updateRapport,
    applyPhysicalBoundaryPressure,
    applyHostilePhysicalPressure,
    deriveDirection,
    updateDisposition,
    classifyDisposition,
    checkThreshold,
    mergeSlowBondEvidence,
    slowBondEvidenceCount,
    isSlowBondEligible,
    getChaosContext,
    classifyBand,
    classifyMagnitude,
    pickAnchor,
    pickVector,
    classifyAction,
    deriveImpulse,
    classifyProactivityTier,
    thresholdFromTier,
    selectIntent,
    isImmediateAttackIntent,
    isImmediateAttackIntentForType,
    buildNarrationGuidance,
    buildPersistencePolicy,
    trackerSummary,
    normalizeTrackerEntry,
    normalizeNpcRaceProfile,
    normalizeProactivityMemory,
    normalizeTrackerUserState,
    normalizeBoundCompanionState,
    applyBoundCompanionDelta,
    normalizePendingBoundaryState,
    normalizeTrackerCondition,
    normalizeTargets,
    sanitizeTargets,
    sameTargets,
    targetSummary,
    findTrackerEntryName,
    hasMagicStoneEntry,
    normalizeNameKey,
    normalizeActionMarkers,
    normalizeCore,
    getUserCoreStats,
    statValue,
    normalizeChallengeType,
    normalizeSocialTactic,
    deterministicStatsForChallenge,
    dispositionMemoryKey,
    normalizeSocialResolutionMemory,
    parseFinalState,
    deriveLock,
    landedBool,
    sameName,
    toRealArray,
    showNone,
    firstReal,
    isReal,
    bool,
    yn,
    unique,
    clamp,
    formatTargets,
    formatDisposition,
    compact,
    stableStringify,
} from './engines.js';
import { deterministicPersonalitySummaryForName, USER_KNOWLEDGE_CONFIDENCE, USER_KNOWLEDGE_SCOPES, USER_KNOWLEDGE_TRUTH, USER_REPUTATION_VALENCES } from './tracker-delta-contract.js';
import {
    applyHiddenHealthEvents,
    applyHiddenHealthToTrackerState,
    damageForOutcomeTier,
    damageForSeverity,
    getHealthActor,
    getHealthActorCondition,
    healingDcForTargets,
    hiddenHealthPenaltyForCondition,
    magicHealAmountForOutcomeTier,
    naturalFullRecoveryAmount,
    naturalHealAmountForOutcomeTier,
    normalizeHiddenHealth,
    safeSceneHealingAmount,
} from './health-state.js';
import { normalizeWorldState } from './world-state.js';
import { buildDeterministicLootEnvelope, getNpcLootRankProfile, normalizeEconomyState, resolveEquipmentDefense } from './economy.js';
import { persistMetadata, saveMetadataDebounced } from './st-adapter.js';

const NONE = '(none)';
const NAME_REGISTRY_KEY = 'structuredPreflightNameRegistry';
const USER_PROACTIVITY_TARGET = '{{user}}';
const USER_KNOWLEDGE_LEDGER_VERSION = 1;
const ENVIRONMENT_DIFFICULTY_BONUSES = Object.freeze({
    none: 0,
    easy: 0,
    average: 4,
    hard: 8,
    extreme: 12,
});
const HARM_MODES = Object.freeze(['lethal', 'nonlethal', 'restraint_control', 'none']);
const GENERATED_CORE_RANGES = Object.freeze({
    Weak: [1, 2],
    Average: [2, 5],
    Trained: [5, 8],
    Elite: [8, 11],
    Boss: [11, 14],
    none: [1, 1],
});
const CAPABILITY_POOL_RANK_TABLES = Object.freeze({
    common: Object.freeze([
        Object.freeze({ max: 15, rank: 'Weak' }),
        Object.freeze({ max: 95, rank: 'Average' }),
        Object.freeze({ max: 99, rank: 'Trained' }),
        Object.freeze({ max: 100, rank: 'Elite' }),
    ]),
    trained: Object.freeze([
        Object.freeze({ max: 20, rank: 'Average' }),
        Object.freeze({ max: 90, rank: 'Trained' }),
        Object.freeze({ max: 100, rank: 'Elite' }),
    ]),
    elite: Object.freeze([
        Object.freeze({ max: 20, rank: 'Trained' }),
        Object.freeze({ max: 100, rank: 'Elite' }),
    ]),
    boss: Object.freeze([
        Object.freeze({ max: 100, rank: 'Boss' }),
    ]),
});
const RAPPORT_ACTIVE_IDLE_LIMIT_MS = 10 * 60 * 1000;
const RAPPORT_COOLDOWN_MS = 30 * 60 * 1000;
const PARTNER_MEANINGFUL_COOLDOWN_HOUR_MS = 60 * 60 * 1000;

function normalizeResolutionHarmMode(value, semantic = {}) {
    const challengeType = normalizeChallengeType(semantic?.challengeType, semantic?.rollNeeded ?? semantic?.RollNeeded ?? 'Y');
    const isCombat = isCombatChallengeType(challengeType);
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const aliases = {
        lethal: 'lethal',
        deadly: 'lethal',
        fatal: 'lethal',
        lethal_attack: 'lethal',
        nonlethal: 'nonlethal',
        non_lethal: 'nonlethal',
        nonfatal: 'nonlethal',
        non_fatal: 'nonlethal',
        unarmed: 'nonlethal',
        brawl: 'nonlethal',
        restraint: 'restraint_control',
        control: 'restraint_control',
        restraint_control: 'restraint_control',
        control_restraint: 'restraint_control',
        grapple: 'restraint_control',
        grappling: 'restraint_control',
        pin: 'restraint_control',
        pinned: 'restraint_control',
        none: 'none',
        no_harm: 'none',
        noharm: 'none',
    };
    if (bool(semantic?.restraintControl?.present ?? semantic?.restraintControl?.Present)) return 'restraint_control';
    if (challengeType === 'restraint') return 'restraint_control';
    if (!isCombat) return 'none';
    if (aliases[text] && aliases[text] !== 'none') return aliases[text];
    if (isCombat) return 'nonlethal';
    return 'none';
}

function isCombatChallengeType(value) {
    return value === 'mundane_combat' || value === 'supernatural_combat';
}

function isAttackChallengeType(value) {
    return isCombatChallengeType(value);
}

function normalizeBoundaryObject(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        Present: bool(source.present ?? source.Present) ? 'Y' : 'N',
        BoundaryId: String(source.boundaryId ?? source.BoundaryId ?? '(none)').trim() || '(none)',
        TargetNPC: String(source.targetNPC ?? source.TargetNPC ?? '(none)').trim() || '(none)',
        Type: String(source.type ?? source.Type ?? 'none').trim() || 'none',
        Response: String(source.response ?? source.Response ?? 'none').trim() || 'none',
        ObjectOrAccess: String(source.objectOrAccess ?? source.ObjectOrAccess ?? '(none)').trim() || '(none)',
        Evidence: String(source.evidence ?? source.Evidence ?? '(none)').trim() || '(none)',
    };
}

function neutralBoundaryBreak() {
    return {
        Present: 'N',
        BoundaryId: '(none)',
        TargetNPC: '(none)',
        Type: 'none',
        Response: 'none',
        ObjectOrAccess: '(none)',
        Evidence: '(none)',
    };
}

function normalizeBoundaryTypeForMatch(value) {
    const text = String(value || 'none').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['object', 'item', 'item_access', 'possession', 'inventory'].includes(text)) return 'object_access';
    if (['space', 'access', 'entry', 'door', 'doorway'].includes(text)) return 'space_access';
    if (['leave', 'leaving', 'exit'].includes(text)) return 'departure';
    if (['physical_restraint', 'grapple', 'pin', 'hold'].includes(text)) return 'restraint';
    return text;
}

function validateBoundaryBreakAgainstPending(value, pendingBoundarySnapshot = {}, audit = null) {
    const boundaryBreak = normalizeBoundaryObject(value);
    if (boundaryBreak.Present !== 'Y') return boundaryBreak;

    const pendingBoundary = normalizePendingBoundaryState(pendingBoundarySnapshot);
    const mismatches = [];
    if (!pendingBoundary.active) mismatches.push('no active pending boundary');
    if (!isReal(boundaryBreak.BoundaryId) || boundaryBreak.BoundaryId !== pendingBoundary.boundaryId) mismatches.push('boundaryId mismatch');
    if (!isReal(boundaryBreak.TargetNPC) || !sameName(boundaryBreak.TargetNPC, pendingBoundary.targetNPC)) mismatches.push('target mismatch');
    if (normalizeBoundaryTypeForMatch(boundaryBreak.Type) !== normalizeBoundaryTypeForMatch(pendingBoundary.type)) mismatches.push('type mismatch');
    if (!mismatches.length) return boundaryBreak;

    audit?.push(`2.3c.1 rejectedBoundaryBreak=${compact({
        reasons: mismatches,
        supplied: boundaryBreak,
        active: pendingBoundary,
        result: 'Present=N',
    })}`);
    return neutralBoundaryBreak();
}

function restraintTargetName(semantic, targets = {}) {
    const restraint = normalizeBoundaryObject(semantic?.restraintControl);
    if (restraint.Present === 'Y' && isReal(restraint.TargetNPC)) return restraint.TargetNPC;
    return firstReal(targets.ActionTargets) || firstReal(targets.OppTargets?.NPC) || '(none)';
}

function boundaryPressureTargetName(semantic, targets = {}) {
    const pressure = normalizeBoundaryObject(semantic?.boundaryPressure);
    if (pressure.Present === 'Y' && isReal(pressure.TargetNPC)) return pressure.TargetNPC;
    return firstReal(targets.ActionTargets) || firstReal(targets.OppTargets?.NPC) || '(none)';
}

function dispositionForTarget(name, trackerSnapshot = {}) {
    const entry = normalizeTrackerEntry(trackerSnapshot?.[name] || {});
    return entry.currentDisposition || { B: 2, F: 2, H: 2 };
}

function isCrisisDisposition(disposition = {}) {
    return Number(disposition.F || 0) >= 3 || Number(disposition.H || 0) >= 3;
}

function isImmediateOpposedBoundaryContext({ target, targets, semantic, trackerSnapshot }) {
    if (!isReal(target)) return false;
    const disposition = dispositionForTarget(target, trackerSnapshot);
    if (Number(disposition.B || 0) <= 1) return true;
    if (isCrisisDisposition(disposition)) return true;
    if (bool(semantic?.activeHostileThreat)) return true;
    if (toRealArray(targets.hostilesInScene?.NPC).some(name => sameName(name, target))) return true;
    return false;
}

function boundaryWarningThresholdForTarget(name, trackerSnapshot = {}) {
    const disposition = dispositionForTarget(name, trackerSnapshot);
    return Number(disposition.B || 0) >= 4 && !isCrisisDisposition(disposition) ? 2 : 1;
}

function applyRestraintBoundaryGate({ semantic, restraintControl, boundaryPressure, boundaryBreak: suppliedBoundaryBreak, targets, rollNeeded, challengeType, socialTactic, rollReason, stakesRule, trackerSnapshot, pendingBoundarySnapshot = {}, audit }) {
    const restraint = normalizeBoundaryObject(restraintControl ?? semantic?.restraintControl);
    const pressure = normalizeBoundaryObject(boundaryPressure ?? semantic?.boundaryPressure);
    const boundaryBreak = normalizeBoundaryObject(suppliedBoundaryBreak ?? semantic?.boundaryBreak);
    const pendingBoundary = normalizePendingBoundaryState(pendingBoundarySnapshot);
    const hasRestraint = restraint.Present === 'Y';
    const hasBoundaryPressure = pressure.Present === 'Y';
    const hasBoundaryBreak = boundaryBreak.Present === 'Y' && pendingBoundary.active;
    if (!hasRestraint && !hasBoundaryPressure && !hasBoundaryBreak) {
        return { rollNeeded, challengeType, socialTactic, rollReason, stakesRule, restraint, boundaryPressure: pressure, boundaryBreak, gate: null };
    }

    const target = hasBoundaryBreak
        ? boundaryBreak.TargetNPC
        : hasRestraint ? restraintTargetName(semantic, targets) : boundaryPressureTargetName(semantic, targets);
    const immediateContest = (hasRestraint || hasBoundaryPressure) && isImmediateOpposedBoundaryContext({ target, targets, semantic, trackerSnapshot });
    const threshold = boundaryWarningThresholdForTarget(target, trackerSnapshot);
    const warnings = pendingBoundary.active ? pendingBoundary.warnings : 0;
    const breakForcesRoll = hasBoundaryBreak && warnings >= threshold;
    const breakGetsWarning = hasBoundaryBreak && !breakForcesRoll;
    const gate = {
        target,
        restraint: hasRestraint ? 'Y' : 'N',
        boundaryPressure: hasBoundaryPressure ? 'Y' : 'N',
        boundaryBreak: hasBoundaryBreak ? 'Y' : 'N',
        immediateContest: immediateContest ? 'Y' : 'N',
        warnings,
        threshold,
        pendingBoundary: pendingBoundary.active ? 'Y' : 'N',
        pendingBoundaryId: pendingBoundary.active ? pendingBoundary.boundaryId : '(none)',
    };

    if (immediateContest || breakForcesRoll) {
        const nextRollReason = immediateContest
            ? 'restraint targets an enemy/crisis/opposing NPC and is immediately contested'
            : 'user continues or escalates after a stored NPC boundary';
        audit.push(`2.4g boundaryRestraintGate=${compact({ ...gate, action: 'force_roll' })}`);
        return {
            rollNeeded: 'Y',
            challengeType: hasRestraint ? 'restraint' : 'environment',
            socialTactic: 'none',
            rollReason: normalizeRollReason(rollReason, nextRollReason),
            stakesRule: 'deterministic_boundary_restraint_gate',
            restraint,
            boundaryPressure: pressure,
            boundaryBreak,
            gate: { ...gate, action: 'force_roll' },
        };
    }

    if (hasRestraint || hasBoundaryPressure || breakGetsWarning) {
        audit.push(`2.4g boundaryRestraintGate=${compact({ ...gate, action: breakGetsWarning ? 'second_warning_no_roll' : 'grace_no_roll' })}`);
        return {
            rollNeeded: 'N',
            challengeType: 'none',
            socialTactic: 'none',
            rollReason: breakGetsWarning
                ? 'trusted boundary grace gives one more warning before a roll'
                : 'restraint/boundary pressure is handled by relationship boundary grace unless opposed or broken',
            stakesRule: 'deterministic_boundary_restraint_grace',
            restraint,
            boundaryPressure: pressure,
            boundaryBreak,
            gate: { ...gate, action: breakGetsWarning ? 'second_warning_no_roll' : 'grace_no_roll' },
        };
    }

    return { rollNeeded, challengeType, socialTactic, rollReason, stakesRule, restraint, boundaryPressure: pressure, boundaryBreak, gate };
}

function harmModeAllowsHpDamage(harmMode) {
    return harmMode === 'lethal' || harmMode === 'nonlethal';
}

function packetNestedPresent(packet, key) {
    const value = packet?.[key];
    return value?.Present === 'Y' || value?.present === true;
}

function packetHarmfulAttackActive(packet) {
    return packet?.RollNeeded === 'Y'
        && ['lethal', 'nonlethal'].includes(String(packet?.harmMode || '').toLowerCase())
        && ['mundane_combat', 'supernatural_combat'].includes(packet?.challengeType);
}

function packetBoundaryActivityActive(packet) {
    return packetNestedPresent(packet, 'boundaryPressure')
        || packetNestedPresent(packet, 'boundaryBreak')
        || (packet?.RollNeeded === 'Y' && packet?.challengeType === 'restraint');
}

const NPC_PROACTIVITY_CAP = 3;
const NAME_POOL_SIZE = 3;
const DEFAULT_NAME_STYLE = 'Balanced Fantasy';
const POWER_ACTOR_ENMITY_VERSION = 1;
const POWER_ACTOR_EVENT_FITS = Object.freeze(['none', 'use_now', 'defer', 'drop']);
const POWER_ACTOR_EVENT_TYPES = Object.freeze(['none', 'minor_obstruction', 'warning', 'ambush', 'frame_user', 'plant_contact', 'agent_mislead', 'agent_report', 'agent_sabotage']);
const POWER_ACTOR_CONTACT_GENDERS = Object.freeze(['none', 'male', 'female', 'unknown']);
const POWER_ACTOR_EVENT_HISTORY_LIMIT = 12;
const POWER_ACTOR_EVENT_COOLDOWN_MS = Object.freeze({
    minor_obstruction: 2 * 60 * 60 * 1000,
    warning: 2 * 60 * 60 * 1000,
    ambush: 4 * 60 * 60 * 1000,
    frame_user: 5 * 60 * 60 * 1000,
    plant_contact: 6 * 60 * 60 * 1000,
    agent_mislead: 3 * 60 * 60 * 1000,
    agent_report: 3 * 60 * 60 * 1000,
    agent_sabotage: 4 * 60 * 60 * 1000,
});
const USER_OWNED_ITEM_SOURCES = Object.freeze(['gear', 'inventory']);
const USER_ITEM_UNAVAILABLE_REASON = 'not in saved user gear/inventory';

function normalizeEnvironmentDifficultyForRoll(value) {
    const tier = String(value ?? '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ENVIRONMENT_DIFFICULTY_BONUSES, tier)) {
        return ENVIRONMENT_DIFFICULTY_BONUSES[tier];
    }
    const number = Number(value);
    return [0, 4, 8, 12].includes(number) ? number : 0;
}

function woundPenaltyAppliesToResolution(challengeType, oppStat) {
    return isCombatChallengeType(challengeType) || oppStat === 'ENV';
}

function environmentDifficultySource(semantic = {}) {
    const tier = semantic.environmentDifficultyTier;
    const tierText = String(tier ?? '').trim().toLowerCase();
    if (tier !== undefined && tier !== null && tierText && tierText !== 'none') return tier;
    return semantic.environmentDifficulty;
}

function normalizeSemanticActionUnits(units, actions = ['a1'], semantic = {}) {
    const markers = Array.isArray(actions) && actions.length ? actions : ['a1'];
    const source = Array.isArray(units) ? units : [];
    const fallback = cleanText(
        semantic.identifyChallenge
        || semantic.explicitMeans
        || semantic.identifyGoal
        || '{{user}} takes the latest explicit action',
    ) || '{{user}} takes the latest explicit action';
    return markers.slice(0, 3).map((marker, index) => {
        const unit = source[index] && typeof source[index] === 'object' ? source[index] : {};
        const action = cleanText(unit.action ?? unit.Action ?? unit.description ?? unit.Description) || fallback;
        const evidence = cleanText(unit.evidence ?? unit.Evidence) || NONE;
        return {
            id: `A${index + 1}`,
            marker,
            action,
            evidence,
        };
    });
}

function deriveResolutionActionMarkers(semantic = {}, challengeType = 'none') {
    const unitCount = Array.isArray(semantic.actionUnits) ? semantic.actionUnits.length : 0;
    const count = isCombatChallengeType(challengeType)
        ? Math.max(1, Math.min(3, unitCount || 1))
        : 1;
    return Array.from({ length: count }, (_, index) => `a${index + 1}`);
}

function formatActionUnitsAudit(units = []) {
    const items = Array.isArray(units) ? units : [];
    return items.length
        ? items.map(unit => `${unit.id}: ${unit.action} | evidence="${unit.evidence || NONE}"`).join('; ')
        : NONE;
}

const NAME_STYLE_PROFILES = Object.freeze({
    'Balanced Fantasy': {
        key: 'balanced',
        label: 'Balanced Fantasy',
        sounds: {
            onsets: ['', 'd', 'h', 'l', 'm', 'n', 'r', 's', 't', 'v', 'y', 'z'],
            clusters: ['sh', 'th'],
            vowels: ['a', 'e', 'i', 'o', 'u'],
            codas: ['', '', '', 'n', 'r', 'l', 's'],
        },
        rules: {
            person: { min: 2, max: 2, maxLength: 8, clusterChance: 0.06, codaChance: 0.12, endingChance: 0.38 },
            location: { min: 2, max: 3, maxLength: 12, clusterChance: 0.08, codaChance: 0.18, suffixChance: 0.38 },
            maleEndings: ['an', 'ar', 'en', 'ir', 'on'],
            femaleEndings: ['a', 'ia', 'ara', 'ira', 'e'],
            neutralEndings: ['a', 'an', 'en', 'ira', 'ra'],
            locationSuffixes: ['ara', 'ora', 'ira', 'en', 'al', 'um'],
        },
    },
    'Modern': {
        key: 'modern',
        label: 'Modern',
        modern: true,
        sounds: {
            onsets: ['', 'b', 'c', 'd', 'f', 'h', 'j', 'l', 'm', 'n', 'r', 's', 't', 'v', 'w'],
            clusters: ['br', 'cl', 'gr', 'st', 'tr'],
            vowels: ['a', 'e', 'i', 'o', 'u'],
            codas: ['', 'n', 'r', 'l', 's', 't', 'd'],
        },
        rules: {
            person: { min: 1, max: 1, maxLength: 10, clusterChance: 0, codaChance: 0, endingChance: 0 },
            location: { min: 1, max: 1, maxLength: 14, clusterChance: 0, codaChance: 0, suffixChance: 0 },
            maleNames: ['Adrian', 'Marcus', 'Victor', 'Nolan', 'Ethan', 'Kevin', 'Brian', 'Simon', 'Lucas', 'Caleb', 'Julian', 'Martin', 'Wesley', 'Carter', 'David', 'James', 'Robert', 'Michael'],
            femaleNames: ['Olivia', 'Sophia', 'Amelia', 'Elena', 'Rachel', 'Hannah', 'Megan', 'Julia', 'Carmen', 'Monica', 'Isabel', 'Vanessa', 'Serena', 'Denise', 'Sarah', 'Alice', 'Eleanor', 'Natalie'],
            neutralNames: ['Adrian', 'Morgan', 'Taylor', 'Jordan', 'Casey', 'Robin', 'Riley', 'Avery', 'Cameron', 'Quinn'],
            locationNames: ['Riverton', 'Riverside', 'Brookfield', 'Fairview', 'Westbridge', 'Oakmont', 'Hillcrest', 'Pinecrest', 'Lakewood', 'Redford', 'Ashfield', 'Eastvale', 'Millhaven', 'Briarwood', 'Clearwater', 'Northgate', 'Westhaven', 'Kingsport'],
            maleEndings: [''],
            femaleEndings: [''],
            neutralEndings: [''],
            locationSuffixes: [''],
        },
    },
    'Tolkienic / Lyrical': {
        key: 'lyrical',
        label: 'Tolkienic / Lyrical',
        sounds: {
            onsets: ['', 'l', 'm', 'n', 'r', 's', 'th', 'v'],
            clusters: ['el', 'al', 'la', 'th', 'nd', 'rn', 'll'],
            vowels: ['a', 'e', 'i', 'ia', 'ae', 'ei'],
            codas: ['', 'l', 'n', 'r', 'nd', 'th'],
        },
        rules: {
            person: { min: 2, max: 3, maxLength: 10, clusterChance: 0.14, codaChance: 0.28, endingChance: 0.70 },
            location: { min: 2, max: 4, maxLength: 14, clusterChance: 0.16, codaChance: 0.38, suffixChance: 0.38 },
            maleEndings: ['el', 'ion', 'or', 'dir', 'las', 'ren'],
            femaleEndings: ['iel', 'ien', 'ia', 'wen', 'elle', 'ael'],
            neutralEndings: ['el', 'ien', 'or', 'ael', 'ion'],
            locationSuffixes: ['lond', 'riel', 'mere', 'dell', 'vale', 'dor'],
        },
    },
    'Celtic-Inspired Fantasy': {
        key: 'celtic',
        label: 'Celtic-Inspired Fantasy',
        sounds: {
            onsets: ['', 'b', 'c', 'd', 'f', 'g', 'l', 'm', 'n', 'r', 's', 't'],
            clusters: ['br', 'gw', 'll', 'rh', 'dr', 'cr', 'wyn'],
            vowels: ['a', 'e', 'i', 'o', 'u', 'ae', 'ei'],
            codas: ['', 'n', 'r', 'l', 'th', 'dd', 's'],
        },
        rules: {
            person: { min: 2, max: 3, maxLength: 9, clusterChance: 0.24, codaChance: 0.36, endingChance: 0.62 },
            location: { min: 2, max: 3, maxLength: 14, clusterChance: 0.28, codaChance: 0.48, suffixChance: 0.48 },
            maleEndings: ['an', 'wyn', 'oc', 'ren', 'eth', 'or'],
            femaleEndings: ['wen', 'a', 'elle', 'wyn', 'eth', 'ia'],
            neutralEndings: ['an', 'wyn', 'eth', 'el', 'a'],
            locationSuffixes: ['mere', 'wyn', 'dun', 'ford', 'glen', 'bryn'],
        },
    },
    'Norse / Old Germanic Fantasy': {
        key: 'norse',
        label: 'Norse / Old Germanic Fantasy',
        sounds: {
            onsets: ['', 'b', 'd', 'g', 'h', 'k', 'r', 's', 't', 'v'],
            clusters: ['bj', 'sk', 'st', 'gr', 'kn', 'th', 'vr'],
            vowels: ['a', 'e', 'i', 'o', 'u', 'y'],
            codas: ['', 'n', 'r', 'k', 'th', 'ld', 'ng', 'rn'],
        },
        rules: {
            person: { min: 1, max: 2, maxLength: 9, clusterChance: 0.36, codaChance: 0.70, endingChance: 0.58 },
            location: { min: 2, max: 3, maxLength: 14, clusterChance: 0.34, codaChance: 0.76, suffixChance: 0.62 },
            maleEndings: ['ar', 'rik', 'ulf', 'vald', 'sten', 'orn'],
            femaleEndings: ['a', 'hild', 'run', 'dis', 'frid', 'yn'],
            neutralEndings: ['ar', 'en', 'ulf', 'rik', 'a'],
            locationSuffixes: ['heim', 'gard', 'vik', 'hold', 'fjord', 'mark'],
        },
    },
    'Persian / Byzantine Fantasy': {
        key: 'persian-byzantine',
        label: 'Persian / Byzantine Fantasy',
        sounds: {
            onsets: ['', 'd', 'm', 'n', 'r', 's', 'v', 'z', 'sh', 'kh'],
            clusters: ['az', 'dar', 'mir', 'nav', 'ros', 'shar'],
            vowels: ['a', 'i', 'o', 'u', 'aa', 'ei'],
            codas: ['', 'n', 'r', 'sh', 'z', 'kh', 'm'],
        },
        rules: {
            person: { min: 2, max: 3, maxLength: 10, clusterChance: 0.20, codaChance: 0.44, endingChance: 0.66 },
            location: { min: 2, max: 3, maxLength: 14, clusterChance: 0.24, codaChance: 0.50, suffixChance: 0.64 },
            maleEndings: ['an', 'ir', 'os', 'ad', 'esh', 'ius'],
            femaleEndings: ['a', 'ara', 'ira', 'in', 'esh', 'ia'],
            neutralEndings: ['an', 'ir', 'esh', 'a', 'os'],
            locationSuffixes: ['abad', 'shahr', 'dara', 'kesh', 'polis', 'sara'],
        },
    },
    'Slavic-Inspired Fantasy': {
        key: 'slavic',
        label: 'Slavic-Inspired Fantasy',
        sounds: {
            onsets: ['', 'b', 'd', 'k', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z'],
            clusters: ['br', 'dr', 'kr', 'sl', 'sv', 'vl', 'zm', 'tr'],
            vowels: ['a', 'e', 'i', 'o', 'u'],
            codas: ['', 'k', 'v', 'n', 'r', 'sk', 'mir'],
        },
        rules: {
            person: { min: 2, max: 3, maxLength: 10, clusterChance: 0.32, codaChance: 0.58, endingChance: 0.62 },
            location: { min: 2, max: 3, maxLength: 14, clusterChance: 0.34, codaChance: 0.66, suffixChance: 0.58 },
            maleEndings: ['ov', 'ak', 'ir', 'en', 'mir', 'ek'],
            femaleEndings: ['a', 'ova', 'ina', 'ena', 'ira', 'ka'],
            neutralEndings: ['ov', 'ak', 'in', 'a', 'mir'],
            locationSuffixes: ['grad', 'sk', 'mir', 'gorod', 'ovka', 'drev'],
        },
    },
    'Classical / Romance Fantasy': {
        key: 'classical-romance',
        label: 'Classical / Romance Fantasy',
        sounds: {
            onsets: ['', 'c', 'd', 'f', 'l', 'm', 'n', 'r', 's', 't', 'v'],
            clusters: ['cl', 'fl', 'pr', 'tr', 'val', 'mar'],
            vowels: ['a', 'e', 'i', 'o', 'u', 'ia', 'io'],
            codas: ['', 'n', 'r', 's', 'l'],
        },
        rules: {
            person: { min: 2, max: 3, maxLength: 10, clusterChance: 0.18, codaChance: 0.36, endingChance: 0.72 },
            location: { min: 2, max: 3, maxLength: 14, clusterChance: 0.20, codaChance: 0.44, suffixChance: 0.56 },
            maleEndings: ['us', 'ian', 'or', 'ius', 'en', 'io'],
            femaleEndings: ['a', 'ia', 'ina', 'ella', 'ara', 'ora'],
            neutralEndings: ['us', 'ia', 'or', 'um', 'a'],
            locationSuffixes: ['polis', 'ara', 'ium', 'ona', 'vale', 'port'],
        },
    },
    'Dark Low Fantasy': {
        key: 'dark-low',
        label: 'Dark Low Fantasy',
        sounds: {
            onsets: ['', 'b', 'd', 'g', 'k', 'm', 'r', 's', 't', 'v', 'z'],
            clusters: ['gr', 'kr', 'dr', 'sk', 'vr', 'th', 'br'],
            vowels: ['a', 'e', 'o', 'u'],
            codas: ['', 'k', 'g', 'rn', 'rd', 'sk', 'th', 'm'],
        },
        rules: {
            person: { min: 1, max: 2, maxLength: 9, clusterChance: 0.38, codaChance: 0.74, endingChance: 0.48 },
            location: { min: 2, max: 3, maxLength: 14, clusterChance: 0.40, codaChance: 0.78, suffixChance: 0.64 },
            maleEndings: ['ar', 'ek', 'orn', 'ath', 'un', 'osk'],
            femaleEndings: ['a', 'eth', 'ra', 'un', 'ska', 'en'],
            neutralEndings: ['ar', 'ek', 'ath', 'un', 'ra'],
            locationSuffixes: ['fen', 'mire', 'barrow', 'hold', 'scar', 'watch'],
        },
    },
});

const ROLE_NAME_PREFIXES = Object.freeze([
    'ass', 'ban', 'but', 'cap', 'cou', 'doc', 'gat', 'gua', 'hea', 'inn', 'kin', 'kni',
    'lad', 'lor', 'mag', 'mer', 'mes', 'pri', 'que', 'rai', 'sol', 'str', 'wit',
]);

export function buildTrackerSnapshot(context) {
    const source = context?.chatMetadata?.structuredPreflightTracker?.npcs || {};
    const snapshot = {};

    for (const [name, value] of Object.entries(source)) {
        snapshot[name] = normalizeTrackerEntry(value);
    }

    return snapshot;
}

export function buildPlayerTrackerSnapshot(context) {
    const trackerUser = context?.chatMetadata?.structuredPreflightTracker?.user || {};
    return normalizeTrackerUserState(trackerUser);
}

export function buildPowerActorSnapshot(context) {
    return normalizePowerActors(context?.chatMetadata?.structuredPreflightTracker?.powerActors || {});
}

export function buildUserKnowledgeSnapshot(context) {
    return normalizeUserKnowledgeLedger(context?.chatMetadata?.structuredPreflightTracker?.userKnowledge || {});
}

export function buildUserReputationSnapshot(context) {
    return normalizeUserReputation(context?.chatMetadata?.structuredPreflightTracker?.userReputation || {});
}

export function buildWorldStateSnapshot(context) {
    return normalizeWorldState(context?.chatMetadata?.structuredPreflightTracker?.worldState || {});
}

export function buildEconomySnapshot(context) {
    return normalizeEconomyState(context?.chatMetadata?.structuredPreflightTracker?.economy || {});
}

export function buildBoundCompanionSnapshot(context) {
    return normalizeBoundCompanionState(context?.chatMetadata?.structuredPreflightTracker?.boundCompanion || {});
}

export function buildPendingBoundarySnapshot(context) {
    return normalizePendingBoundaryState(context?.chatMetadata?.structuredPreflightTracker?.pendingBoundary || {});
}

function runDeterministicLootDiscovery({ search = {}, trackerSnapshot = {}, hiddenHealth = null, context = null, adventureGenre = 'Fantasy', audit = [] } = {}) {
    if (search?.Attempted !== 'Y') return { packet: null };

    const requestedTarget = String(search?.Target || '').trim();
    const target = findTrackedLootTargetName(trackerSnapshot, requestedTarget);
    if (!target) {
        const packet = {
            Attempted: 'Y',
            Status: 'unknown_target',
            Target: requestedTarget || NONE,
            TargetKind: search?.TargetKind || 'other',
            Rule: 'No deterministic loot may be generated because the searched target is not a tracked NPC/body.',
        };
        audit.push(`2.9 lootDiscovery=${compact(packet)}`);
        return { packet };
    }

    const state = normalizeTrackerEntry(trackerSnapshot[target] || {});
    const healthCondition = getHealthActorCondition(hiddenHealth, { targetType: 'npc', name: target, condition: state.condition });
    if (state.condition !== 'dead' && healthCondition !== 'dead') {
        const packet = {
            Attempted: 'Y',
            Status: 'target_not_dead',
            Target: target,
            TargetKind: search?.TargetKind || 'other',
            Rule: 'Do not generate corpse loot. The target is not deterministically dead; ordinary living-NPC access and boundary rules remain authoritative.',
        };
        audit.push(`2.9 lootDiscovery=${compact(packet)}`);
        return { packet };
    }

    if (state.lootSearchCompleted) {
        const packet = {
            Attempted: 'Y',
            Status: 'already_searched',
            Target: target,
            TargetKind: search?.TargetKind || 'other',
            ExistingGear: showNone(state.gear),
            ExistingInventory: showNone(state.inventory),
            ExistingCurrency: showNone(state.currency),
            Rule: 'This body/remains has already been searched. Reveal no new possessions, currency, equipment, magic stones, clues, or containers; only established remaining items may still be present.',
        };
        audit.push(`2.9 lootDiscovery=${compact(packet)}`);
        return { packet };
    }

    const rank = normalizeLootRank(state.currentCoreStats?.Rank);
    const envelope = buildDeterministicLootEnvelope({
        rank,
        target,
        targetKind: search?.TargetKind,
        genre: adventureGenre,
        seed: hiddenHealth?.seed || context?.chatMetadata?.structuredPreflightTracker?.health?.seed || 'story-engine-loot',
    });
    const hasEstablishedMagicStone = hasMagicStoneEntry([...state.gear, ...state.inventory]);
    const packet = {
        Attempted: 'Y',
        Status: 'reveal_once',
        Target: target,
        TargetKind: envelope.targetKind,
        Rank: envelope.rank,
        EquipmentTier: envelope.equipmentTier,
        EquipmentValueRange: envelope.equipmentValueRange,
        MaterialGuidance: envelope.materialGuidance,
        ExistingGear: showNone(state.gear),
        ExistingInventory: showNone(state.inventory),
        ExistingCurrency: showNone(state.currency),
        CurrencyTier: envelope.currencyTier,
        CurrencyAmount: state.currency.length ? NONE : (envelope.currencyAmount || NONE),
        MagicStone: hasEstablishedMagicStone ? null : envelope.magicStone,
        MaxNewMundaneItems: envelope.maxNewMundaneItems,
        Rule: 'Reveal this loot only once. Preserve established gear and possessions. The narrator may choose a small number of concrete mundane possessions within the listed physical quality/value envelope. Do not create magical items, powers, bonuses, rarity labels, plot-critical clues, secret documents, or keys unless already established. Discovery does not transfer ownership to {{user}}.',
    };
    audit.push(`2.9 lootDiscovery=${compact(packet)}`);
    return { packet };
}

function buildNpcEquipmentProfiles({ resolutionPacket = {}, trackerBefore = {}, trackerAfter = {}, generatedNpcStats = [], adventureGenre = 'Fantasy', context = null } = {}) {
    const generatedByName = new Map((generatedNpcStats || [])
        .filter(item => isReal(item?.NPC))
        .map(item => [normalizeNameKey(item.NPC), item]));
    const tracked = { ...(trackerBefore || {}), ...(trackerAfter || {}) };
    const latestUserText = getLatestUserTextFromContext(context);
    const referencedSearchedRemains = Object.entries(tracked)
        .filter(([name, value]) => {
            const state = normalizeTrackerEntry(value);
            return state.condition === 'dead'
                && state.lootSearchCompleted
                && searchedRemainsReferencedByInput(name, state, latestUserText);
        })
        .map(([name]) => name);
    const names = unique([
        ...toRealArray(resolutionPacket?.NPCInScene),
        ...referencedSearchedRemains,
    ]);
    return names.map(name => {
        const trackedName = findTrackedNpcName(trackerAfter, name) || findTrackedNpcName(trackerBefore, name) || name;
        const state = normalizeTrackerEntry(trackerAfter?.[trackedName] || trackerBefore?.[trackedName] || {});
        const generated = generatedByName.get(normalizeNameKey(trackedName));
        const rank = normalizeLootRank(state.currentCoreStats?.Rank || generated?.FinalRank || generated?.Rank);
        const profile = getNpcLootRankProfile(rank, adventureGenre);
        return {
            NPC: trackedName,
            Rank: profile.rank,
            EquipmentTier: profile.equipmentTier,
            EquipmentValueRange: profile.equipmentValueRange,
            MaterialGuidance: profile.materialGuidance,
            EstablishedGear: showNone(state.gear),
            EstablishedInventory: showNone(state.inventory),
            EstablishedCurrency: showNone(state.currency),
        };
    }).filter(item => isReal(item.NPC));
}

function searchedRemainsReferencedByInput(name, state, latestUserText) {
    const text = String(latestUserText || '').toLowerCase();
    if (!text) return false;
    return [name, ...state.aliases, ...state.gear, ...state.inventory, ...state.currency]
        .map(item => String(item || '').trim().toLowerCase())
        .filter(item => item.length >= 3)
        .some(item => new RegExp(`\\b${escapeRegExp(item)}\\b`, 'i').test(text));
}

function findTrackedNpcName(snapshot = {}, wanted = '') {
    return findTrackerEntryName(snapshot, wanted);
}

function findTrackedLootTargetName(snapshot = {}, wanted = '') {
    const exact = findTrackedNpcName(snapshot, wanted);
    if (exact) return exact;
    const wantedKey = normalizeLootTargetReference(wanted);
    if (!wantedKey) return '';
    const matches = Object.entries(snapshot || {})
        .filter(([name, value]) => [name, ...normalizeTrackerEntry(value).aliases]
            .some(reference => normalizeLootTargetReference(reference) === wantedKey))
        .map(([name]) => name);
    return matches.length === 1 ? matches[0] : '';
}

function normalizeLootTargetReference(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/'s\b/g, ' ')
        .replace(/\b(?:the|a|an|dead|defeated|fallen|slain|body|corpse|remains|of)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeLootRank(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'weak') return 'Weak';
    if (text === 'trained') return 'Trained';
    if (text === 'elite') return 'Elite';
    if (text === 'boss') return 'Boss';
    return 'Average';
}

export function buildAdventureIntroNameGeneration(context, adventurePrompt = '') {
    const audit = [];
    const prompt = String(adventurePrompt || '').trim();
    const ledger = {
        chaosSemantic: { sceneSummary: prompt },
        resolutionEngine: {
            identifyGoal: 'Adventure intro',
            identifyChallenge: prompt,
            explicitMeans: prompt,
        },
        relationshipEngine: [],
    };
    return runNameGeneration(ledger, audit, context, 'adventure_intro');
}

export async function saveTrackerUpdate(context, trackerUpdate, options = {}) {
    if (!context?.chatMetadata || !trackerUpdate) return;

    const root = context.chatMetadata.structuredPreflightTracker || { npcs: {}, user: {}, rapportClock: normalizeRapportClock() };
    root.npcs = root.npcs || {};
    root.user = normalizeTrackerUserState(root.user || {});
    root.powerActors = normalizePowerActors(root.powerActors || {});
    root.userKnowledge = normalizeUserKnowledgeLedger(root.userKnowledge || {});
    root.userReputation = normalizeUserReputation(root.userReputation || {});
    root.worldState = normalizeWorldState(root.worldState || {});
    root.economy = normalizeEconomyState(root.economy || {});
    root.boundCompanion = normalizeBoundCompanionState(root.boundCompanion || {});
    root.pendingBoundary = normalizePendingBoundaryState(root.pendingBoundary || {});
    root.rapportClock = normalizeRapportClock(root.rapportClock);
    root.health = normalizeHiddenHealth(root.health, { user: root.user, npcs: root.npcs });

    for (const [name, value] of Object.entries(trackerUpdate.npcs || {})) {
        root.npcs[name] = normalizeTrackerEntry({
            ...(root.npcs[name] || {}),
            ...(value || {}),
        });
    }
    if (trackerUpdate.user) {
        root.user = normalizeTrackerUserState({
            ...root.user,
            ...trackerUpdate.user,
        });
    }
    if (trackerUpdate.powerActors) {
        root.powerActors = normalizePowerActors({
            ...root.powerActors,
            ...trackerUpdate.powerActors,
        });
    }
    if (trackerUpdate.userKnowledge) {
        root.userKnowledge = normalizeUserKnowledgeLedger(trackerUpdate.userKnowledge);
    }
    if (trackerUpdate.userReputation) {
        root.userReputation = normalizeUserReputation(trackerUpdate.userReputation);
    }
    if (trackerUpdate.worldState) {
        root.worldState = normalizeWorldState(trackerUpdate.worldState);
    }
    if (trackerUpdate.economy) {
        root.economy = normalizeEconomyState(trackerUpdate.economy);
    }
    if (trackerUpdate.boundCompanion) {
        root.boundCompanion = normalizeBoundCompanionState(trackerUpdate.boundCompanion);
    }
    if (trackerUpdate.pendingBoundary) {
        root.pendingBoundary = normalizePendingBoundaryState(trackerUpdate.pendingBoundary);
    }
    if (trackerUpdate.health) {
        root.health = normalizeHiddenHealth(trackerUpdate.health, { user: root.user, npcs: root.npcs });
    } else {
        root.health = normalizeHiddenHealth(root.health, { user: root.user, npcs: root.npcs });
    }

    context.chatMetadata.structuredPreflightTracker = root;

    if (options.save === false) return;

    await persistMetadata(context);
}

export function normalizeRapportClockState(value = {}) {
    return normalizeRapportClock(value);
}

export function runDeterministicEngines(ledger, trackerSnapshot, context, type, options = {}) {
    const audit = [];
    const dice = createDice();
    const refereeContext = buildRefereeContext(context);
    const playerTrackerSnapshot = normalizeTrackerUserState(options?.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context));
    const worldState = normalizeWorldState(options?.worldStateSnapshot || buildWorldStateSnapshot(context));
    const boundCompanionBefore = normalizeBoundCompanionState(options?.boundCompanionSnapshot || buildBoundCompanionSnapshot(context));
    const pendingBoundaryBefore = normalizePendingBoundaryState(options?.pendingBoundarySnapshot || buildPendingBoundarySnapshot(context));
    const healthNpcRefsBefore = buildHiddenHealthNpcRefs(trackerSnapshot, ledger, context);
    const healthBefore = normalizeHiddenHealth(context?.chatMetadata?.structuredPreflightTracker?.health, {
        user: playerTrackerSnapshot,
        npcs: healthNpcRefsBefore,
    });
    const rapportClock = advanceRapportClock(context, audit);
    const resolution = runResolution(ledger, trackerSnapshot, dice, audit, context, refereeContext, playerTrackerSnapshot, healthBefore, pendingBoundaryBefore);
    const relationships = runRelationships(ledger, trackerSnapshot, resolution.packet, audit, refereeContext, context, rapportClock, dice);
    const chaos = runChaos(ledger, relationships.handoffs, resolution.packet, dice, audit);
    const name = runNameGeneration(ledger, audit, context, type);
    const injuryTrackerUpdate = applyInflictedNpcInjuriesToTrackerUpdate(resolution.packet, relationships.trackerUpdate, trackerSnapshot, audit);
    const proactivity = runProactivity(ledger, relationships.handoffs, resolution.packet, chaos.handoff, dice, audit, refereeContext, context, rapportClock);
    applyProactivityMemoryResults(injuryTrackerUpdate, relationships.handoffs, proactivity.results, dice, audit, rapportClock);
    const aggression = runAggression(ledger, trackerSnapshot, injuryTrackerUpdate, proactivity.results, resolution.packet, dice, audit, context, refereeContext, playerTrackerSnapshot);
    const healthEvents = collectHiddenHealthEvents({
        ledger,
        resolutionPacket: resolution.packet,
        aggression,
        context,
        trackerSnapshot,
        relationshipTrackerUpdate: injuryTrackerUpdate,
        healthBefore,
    });
    const healthRefsAfterTurn = {
        user: playerTrackerSnapshot,
        npcs: buildHiddenHealthNpcRefs({
            ...(trackerSnapshot || {}),
            ...(injuryTrackerUpdate || {}),
        }, ledger, context),
    };
    const healthAfterUserAction = applyHiddenHealthEvents(
        healthBefore,
        healthEvents.filter(event => event?.source === 'user_action'),
        healthRefsAfterTurn,
    );
    const healthAfter = applyHiddenHealthEvents(healthBefore, healthEvents, healthRefsAfterTurn);
    const lootDiscovery = runDeterministicLootDiscovery({
        search: resolution.packet?.LootSearch,
        trackerSnapshot: {
            ...(trackerSnapshot || {}),
            ...(injuryTrackerUpdate || {}),
        },
        hiddenHealth: healthAfterUserAction,
        context,
        adventureGenre: options?.adventureGenre || 'Fantasy',
        audit,
    });
    if (lootDiscovery.packet) resolution.packet.LootDiscovery = lootDiscovery.packet;
    const trackerDeltas = runTrackerUpdates(ledger, trackerSnapshot, injuryTrackerUpdate, context, audit, aggression.userTrackerDelta, aggression.npcTrackerDeltas, healthAfter, playerTrackerSnapshot);
    const userReputation = mergeUserReputationLedger(buildUserReputationSnapshot(context), ledger?.trackerUpdateEngine?.userReputation || {});
    const powerActors = runPowerActorEnmity(ledger, context, audit, dice, rapportClock, name, playerTrackerSnapshot);
    const boundCompanion = runBoundCompanionEngine({
        before: boundCompanionBefore,
        semanticDelta: ledger?.trackerUpdateEngine?.boundCompanion,
        resolutionPacket: resolution.packet,
        worldState,
        relationships: relationships.handoffs,
        context,
        rapportClock,
        dice,
        audit,
    });

    const visibleTrackerUpdate = {
        npcs: trackerDeltas.npcs,
        user: trackerDeltas.user,
        powerActors: powerActors.trackerUpdate,
        userReputation,
        worldState,
    };
    const trackerUpdate = {
        ...visibleTrackerUpdate,
        health: healthAfter,
        boundCompanion: boundCompanion.state,
        pendingBoundary: pendingBoundaryBefore,
    };
    const narrativeResolutionPacket = applyHiddenHealthToResolutionPacket(resolution.packet, healthAfter);
    const generatedNpcStats = mergeGeneratedNpcStats([
        ...(resolution.generatedNpcStats || []),
        ...(relationships.generatedNpcStats || []),
    ]);
    const npcEquipmentProfiles = buildNpcEquipmentProfiles({
        resolutionPacket: narrativeResolutionPacket,
        trackerBefore: trackerSnapshot,
        trackerAfter: trackerDeltas.npcs,
        generatedNpcStats,
        adventureGenre: options?.adventureGenre || 'Fantasy',
        context,
    });
    const finalNarrativeHandoff = {
        generationType: type || 'normal',
        resolutionPacket: narrativeResolutionPacket,
        npcHandoffs: relationships.handoffs,
        chaosHandoff: chaos.handoff,
        nameGeneration: name,
        proactivityResults: proactivity.results,
        aggressionResults: aggression.results,
        powerActorPressure: powerActors.handoff,
        boundCompanion: boundCompanion.handoff,
        generatedNpcStats,
        npcEquipmentProfiles,
        sceneState: worldState,
        persistencePolicy: buildPersistencePolicy(),
        resultLine: resolution.resultLine,
        narrationGuidance: buildNarrationGuidance(narrativeResolutionPacket, relationships.handoffs, chaos.handoff, proactivity.results, aggression.results),
        sceneTrackerUpdate: visibleTrackerUpdate,
    };

    audit.push(`TRACKER_UPDATE_SAVED=${trackerSummary(visibleTrackerUpdate)}`);
    audit.push('RESULT_LINE=' + resolution.resultLine);

    return {
        auditLines: audit,
        semanticLedger: ledger,
        finalNarrativeHandoff,
        trackerUpdate,
        hiddenHealth: {
            before: healthBefore,
            after: healthAfter,
            events: healthEvents,
        },
    };
}

const BOUND_COMPANION_COOLDOWN_ACTIVE_MS = 20 * 60 * 1000;

function runBoundCompanionEngine({ before = {}, semanticDelta = {}, resolutionPacket = {}, worldState = {}, relationships = [], context = {}, rapportClock = {}, dice = null, audit = [] } = {}) {
    let state = applyBoundCompanionDelta(before, semanticDelta);
    if (!state.active) {
        audit.push('STEP 6.8 BOUND_COMPANION=absent');
        return { state, handoff: null };
    }

    const directAddress = isBoundCompanionDirectAddress(state, resolutionPacket);
    const triggers = directAddress
        ? ['direct_address']
        : collectBoundCompanionTriggers({ resolutionPacket, worldState, relationships });
    const activeMs = Math.max(0, Math.floor(Number(rapportClock?.activeMs || 0)));

    if (directAddress) {
        audit.push(`STEP 6.8 BOUND_COMPANION=direct_response triggers=${compact(triggers)}`);
        return {
            state,
            handoff: buildBoundCompanionHandoff(state, {
                mode: 'direct_response',
                triggers,
                reason: 'The latest user input directly addressed the established bound companion.',
            }),
        };
    }

    if (!triggers.length) {
        audit.push('STEP 6.8 BOUND_COMPANION=silence reason=no_trigger');
        return {
            state,
            handoff: buildBoundCompanionHandoff(state, {
                mode: 'silence',
                triggers,
                reason: 'No safe scene trigger for unsolicited inner commentary is active.',
            }),
        };
    }

    const cooldownUntil = Math.max(0, Number(state.lastInterjectionAtActiveMs || 0) + BOUND_COMPANION_COOLDOWN_ACTIVE_MS);
    if (state.hasInterjected && activeMs < cooldownUntil) {
        audit.push(`STEP 6.8 BOUND_COMPANION=silence reason=cooldown activeMs=${activeMs} cooldownUntil=${cooldownUntil}`);
        return {
            state,
            handoff: buildBoundCompanionHandoff(state, {
                mode: 'silence',
                triggers,
                reason: 'The active bound companion is on cooldown and does not initiate dialogue this beat.',
            }),
        };
    }

    const threshold = boundCompanionInterjectionThreshold(triggers);
    const die = typeof dice?.d100 === 'function' ? dice.d100() : Math.floor(Math.random() * 100) + 1;
    if (die > threshold) {
        audit.push(`STEP 6.8 BOUND_COMPANION=silence die=${die} threshold=${threshold} triggers=${compact(triggers)}`);
        return {
            state,
            handoff: buildBoundCompanionHandoff(state, {
                mode: 'silence',
                triggers,
                reason: 'A safe trigger exists, but the deterministic interjection roll did not fire.',
            }),
        };
    }

    state = normalizeBoundCompanionState({
        ...state,
        hasInterjected: true,
        lastInterjectionAtActiveMs: activeMs,
        lastInterjectionKey: boundCompanionTriggerKey(triggers, context),
    });
    audit.push(`STEP 6.8 BOUND_COMPANION=interjection die=${die} threshold=${threshold} triggers=${compact(triggers)}`);
    return {
        state,
        handoff: buildBoundCompanionHandoff(state, {
            mode: 'interjection',
            triggers,
            reason: 'A safe scene trigger fired the deterministic unsolicited interjection gate.',
        }),
    };
}

function buildBoundCompanionHandoff(state = {}, options = {}) {
    const companion = normalizeBoundCompanionState(state);
    if (!companion.active) return null;
    return {
        active: 'Y',
        mode: options.mode || 'silence',
        name: companion.name || '(unnamed bound companion)',
        type: companion.type || 'other',
        vessel: companion.vessel || '{{user}}',
        voice: companion.voice || '(none)',
        evidence: companion.evidence || '(none)',
        triggers: Array.isArray(options.triggers) ? options.triggers : [],
        reason: options.reason || '(none)',
    };
}

function boundCompanionInterjectionThreshold(triggers = []) {
    const set = new Set(triggers);
    if (set.has('danger_or_combat')) return 25;
    if (set.has('strange_magic_or_lore') || set.has('moral_choice_or_temptation')) return 20;
    if (set.has('social_stakes')) return 15;
    if (set.has('new_place') || set.has('new_notable_npc')) return 12;
    return 10;
}

function boundCompanionTriggerKey(triggers = [], context = {}) {
    const chatLength = Array.isArray(context?.chat) ? context.chat.length : 0;
    return `${chatLength}:${triggers.join('|')}`.slice(0, 120);
}

function isBoundCompanionDirectAddress(state = {}, resolutionPacket = {}) {
    const source = boundCompanionSourceText(resolutionPacket);
    if (!source) return false;
    const name = String(state.name || '').trim();
    if (name && new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(source)) {
        return /\b(?:ask|asks|asked|say|says|said|tell|tells|told|speak|speaks|spoke|call|calls|called|answer|answers|answered|reply|replies|replied|whisper|whispers|whispered|think|thinks|thought)\b/i.test(source)
            || /["']/.test(source);
    }
    const vessel = String(state.vessel || '').trim();
    const vesselAddressed = vessel
        && vessel.length <= 60
        && !/\{\{user\}\}|user|body|mind|head/i.test(vessel)
        && new RegExp(`\\b${escapeRegExp(vessel)}\\b`, 'i').test(source);
    return (vesselAddressed || /\b(?:inner voice|voice in my head|voice inside|inside my head|inside my mind|in my mind|mentally)\b/i.test(source))
        && /\b(?:ask|say|tell|speak|call|answer|reply|whisper|think)\b/i.test(source);
}

function collectBoundCompanionTriggers({ resolutionPacket = {}, relationships = [] } = {}) {
    const source = boundCompanionSourceText(resolutionPacket);
    const triggers = [];
    const add = trigger => {
        if (!triggers.includes(trigger)) triggers.push(trigger);
    };

    if (resolutionPacket?.activeHostileThreat === 'Y'
        || isCombatChallengeType(resolutionPacket?.challengeType)
        || toRealArray(resolutionPacket?.hostilesInScene?.NPC).length > 0) {
        add('danger_or_combat');
    }
    if (resolutionPacket?.challengeType === 'social'
        && (resolutionPacket?.RollNeeded === 'Y' || toRealArray(resolutionPacket?.OppTargets?.NPC).length > 0)) {
        add('social_stakes');
    }
    if (Array.isArray(relationships) && relationships.some(item => item?.InitPreset && item.InitPreset !== 'existing')) {
        add('new_notable_npc');
    }
    if (/\b(?:enter|enters|entered|arrive|arrives|arrived|reach|reaches|reached|approach|approaches|approached|walk into|step into|come to|came to|cross into)\b.{0,80}\b(?:city|town|village|settlement|camp|guild|inn|tavern|shop|market|temple|shrine|church|castle|fort|gate|dungeon|ruin|tower|estate|manor|palace|road|forest|cave|cell|prison|arena|district|harbor|port)\b/i.test(source)) {
        add('new_place');
    }
    if (/\b(?:spell|magic|mana|arcane|ritual|sigil|rune|curse|divine|demon|spirit|soul|artifact|relic|ancient|lore|prophecy|goddess|god|temple|shrine|monster|nonhuman|portal|summon|summoning)\b/i.test(source)) {
        add('strange_magic_or_lore');
    }
    if (/\b(?:tempt|temptation|mercy|spare|execute|betray|sacrifice|oath|promise|corrupt|forgive|vengeance|revenge|deal|pact|offer|choice|choose|refuse|accept)\b/i.test(source)) {
        add('moral_choice_or_temptation');
    }
    return triggers.slice(0, 4);
}

function boundCompanionSourceText(resolutionPacket = {}) {
    return [
        resolutionPacket?.GOAL,
        resolutionPacket?.RollReason,
        resolutionPacket?.UserAbilityUse?.Evidence,
        resolutionPacket?.UserAbilityUse?.NarrativeEffect,
        resolutionPacket?.ClaimCheck?.Claim,
        ...(Array.isArray(resolutionPacket?.actionUnits) ? resolutionPacket.actionUnits.flatMap(unit => [unit?.action, unit?.evidence]) : []),
    ].filter(Boolean).join(' ');
}

function buildHiddenHealthNpcRefs(trackerSnapshot = {}, ledger = {}, context = null) {
    const refs = {};
    for (const [name, entry] of Object.entries(trackerSnapshot || {})) {
        if (!isReal(name)) continue;
        refs[name] = { ...(entry || {}) };
    }

    const semantic = ledger?.resolutionEngine || {};
    const targets = semantic.identifyTargets || {};
    const markAdventuringScale = name => {
        if (!isReal(name)) return;
        refs[name] = {
            ...(refs[name] || {}),
            hiddenHealthScale: 'adventuring',
        };
    };

    for (const name of toRealArray(targets.hostilesInScene?.NPC)) markAdventuringScale(name);
    for (const name of toRealArray(targets.OppTargets?.NPC)) markAdventuringScale(name);

    const combatOrHostilePhysical = isCombatChallengeType(normalizeChallengeType(semantic.challengeType, semantic.rollNeeded ?? 'Y'))
        || hasCombatActionLanguage([
            semantic.identifyGoal,
            semantic.identifyChallenge,
            semantic.explicitMeans,
        ].filter(Boolean).join(' '));
    if (combatOrHostilePhysical) {
        for (const name of toRealArray(targets.ActionTargets)) markAdventuringScale(name);
        for (const name of toRealArray(targets.HarmedObservers)) markAdventuringScale(name);
    }

    applyGeneratedCapabilityHealthRefs(refs, ledger, semantic, targets, context);

    return refs;
}

function applyGeneratedCapabilityHealthRefs(refs, ledger, resolutionEngine, targets, context) {
    const primaryTarget = firstReal(targets?.OppTargets?.NPC);
    const applyProfile = (npc, options = {}) => {
        if (!isReal(npc)) return;
        const refName = Object.keys(refs).find(name => sameName(name, npc));
        if (!refName || refs[refName]?.currentCoreStats) return;
        const profile = resolveGeneratedCoreProfile(ledger, resolutionEngine, npc, { ...options, context });
        refs[refName] = {
            ...refs[refName],
            Rank: profile.finalRank,
            MainStat: profile.seed.MainStat,
        };
    };

    applyProfile(primaryTarget);
    for (const item of ledger?.relationshipEngine || []) {
        if (sameName(item?.NPC, primaryTarget)) continue;
        applyProfile(item?.NPC, { relationshipOnly: true });
    }
}

function applyHiddenHealthToResolutionPacket(packet = {}, healthAfter = null) {
    if (!packet || typeof packet !== 'object' || !Array.isArray(packet.InflictedInjuries)) return packet;
    return {
        ...packet,
        InflictedInjuries: packet.InflictedInjuries.map(injury => {
            if (!isReal(injury?.NPC)) return injury;
            const condition = getHealthActorCondition(healthAfter, { targetType: 'npc', name: injury.NPC });
            return condition
                ? { ...injury, condition }
                : injury;
        }),
    };
}

function normalizeRapportClock(value = {}) {
    return {
        activeMs: Math.max(0, Math.floor(Number(value?.activeMs || 0))),
        lastActivityAt: Math.max(0, Math.floor(Number(value?.lastActivityAt || 0))),
        activeDeltaMs: Math.max(0, Math.floor(Number(value?.activeDeltaMs || 0))),
        idleGapIgnored: value?.idleGapIgnored === 'Y' ? 'Y' : 'N',
    };
}

function advanceRapportClock(context, audit) {
    if (!context?.chatMetadata) {
        const clock = normalizeRapportClock();
        audit.push(`RAPPORT_CLOCK=${compact({ ...clock, activeDeltaMs: 0, idleGapIgnored: 'N' })}`);
        return clock;
    }

    const root = context.chatMetadata.structuredPreflightTracker || { npcs: {}, user: {}, rapportClock: normalizeRapportClock() };
    const previous = normalizeRapportClock(root.rapportClock);
    const now = Date.now();
    const elapsedMs = previous.lastActivityAt > 0 ? Math.max(0, now - previous.lastActivityAt) : 0;
    const activeDeltaMs = elapsedMs > 0 && elapsedMs <= RAPPORT_ACTIVE_IDLE_LIMIT_MS ? elapsedMs : 0;
    const idleGapIgnored = elapsedMs > RAPPORT_ACTIVE_IDLE_LIMIT_MS ? 'Y' : 'N';
    const clock = {
        activeMs: previous.activeMs + activeDeltaMs,
        lastActivityAt: now,
        activeDeltaMs,
        idleGapIgnored,
    };

    root.npcs = root.npcs || {};
    root.user = root.user || {};
    root.rapportClock = {
        activeMs: clock.activeMs,
        lastActivityAt: clock.lastActivityAt,
    };
    context.chatMetadata.structuredPreflightTracker = root;
    audit.push(`RAPPORT_CLOCK=${compact({ ...clock, elapsedMs, activeDeltaMs, idleGapIgnored })}`);
    return clock;
}

function runPowerActorEnmity(ledger, context, audit, dice, rapportClock = normalizeRapportClock(), nameGeneration = null, playerTrackerSnapshot = null) {
    const before = buildPowerActorSnapshot(context);
    const trackerUpdate = {};
    const handoffEntries = [];
    const semanticEffects = Array.isArray(ledger?.powerActorEnmity?.effects) ? ledger.powerActorEnmity.effects : [];
    const eventShapes = Array.isArray(ledger?.powerEventShape?.events) ? ledger.powerEventShape.events : [];
    let shapedEventHandoff = null;

    audit.push(`STEP 3P: EXECUTE PowerActorEnmity USING SEMANTIC_LEDGER`);
    audit.push(`3P.0 currentPowerActors=${powerActorSummary(before)}`);
    audit.push(`3P.1 semanticPowerActorEffects=${semanticEffects.length ? compact(semanticEffects) : 'none'}`);
    const effects = semanticEffects;
    audit.push(`3P.1a semanticPowerEventShapes=${eventShapes.length ? compact(eventShapes) : 'none'}`);

    for (const rawShape of eventShapes) {
        const shape = normalizePowerEventShape(rawShape);
        if (!shape) {
            audit.push(`3P.1b ignoredPowerEventShape=${compact({ reason: 'invalid shape', rawShape })}`);
            continue;
        }
        const actorName = findExistingPowerActorName(trackerUpdate, shape.actor)
            || findExistingPowerActorName(before, shape.actor)
            || shape.actor;
        const previous = normalizePowerActorState(trackerUpdate[actorName] || before[actorName] || {});
        if (!previous.name || previous.enmity <= 0 || !previous.pendingEvent.id) {
            audit.push(`3P.1c ignoredPowerEventShape=${compact({ actor: shape.actor, reason: 'no matching pending power event' })}`);
            continue;
        }
        if (previous.pendingEvent.id !== shape.eventId) {
            audit.push(`3P.1d ignoredPowerEventShape=${compact({ actor: actorName, reason: 'event id mismatch', expected: previous.pendingEvent.id, received: shape.eventId })}`);
            continue;
        }

        const applied = applyPowerEventShape(previous, shape, rapportClock, audit);
        trackerUpdate[actorName] = applied.state;
        if (applied.handoffEntry) handoffEntries.push(applied.handoffEntry);
        if (applied.surfaceEvent && !shapedEventHandoff) shapedEventHandoff = applied.surfaceEvent;
        audit.push(`3P.1e powerEventShapeApplied=${compact(applied.audit)}`);
    }

    for (const rawEffect of effects) {
        let effect = normalizePowerActorEffect(rawEffect);
        if (!effect) {
            audit.push(`3P.2 ignoredPowerActorEffect=${compact({ reason: 'invalid/no reach/no known actor/no enmity effect', rawEffect })}`);
            continue;
        }

        effect = reroutePowerActorEffectToCurrentCandidate(effect, ledger, before, trackerUpdate, audit, playerTrackerSnapshot);
        const previousName = findExistingPowerActorName(trackerUpdate, effect.actor)
            || findExistingPowerActorName(before, effect.actor)
            || effect.actor;
        const previous = normalizePowerActorState(trackerUpdate[previousName] || before[previousName] || {});
        const delta = powerActorEnmityDelta(effect.severity);
        if (delta <= 0) {
            audit.push(`3P.3 ignoredPowerActorEffect=${compact({ actor: effect.actor, reason: 'zero delta', severity: effect.severity })}`);
            continue;
        }
        if (isDuplicatePowerActorEffect(effect, previous)) {
            audit.push(`3P.3a ignoredPowerActorEffect=${compact({
                actor: previousName,
                reason: 'duplicate historical/stored power actor effect',
                effect: effect.effect,
                severity: effect.severity,
                effectReason: effect.reason,
            })}`);
            continue;
        }

        const reasons = unique([...previous.reasons, effect.reason]).slice(-8);
        const responseHistory = previous.responseHistory;
        const enmity = clamp(previous.enmity + delta, 0, 20);
        const tier = powerActorTier(enmity);
        const next = normalizePowerActorState({
            ...previous,
            version: POWER_ACTOR_ENMITY_VERSION,
            name: previousName,
            type: effect.actorType || previous.type,
            enmity,
            tier,
            reasons,
            responseHistory,
            lastEffect: {
                effect: effect.effect,
                severity: effect.severity,
                reason: effect.reason,
                delta,
                at: Date.now(),
            },
        });
        trackerUpdate[previousName] = next;
        handoffEntries.push(powerActorHandoffEntry(next));
        audit.push(`3P.4 powerActorEnmityUpdate=${compact({ actor: previousName, delta, enmity: `${previous.enmity}->${next.enmity}`, tier: `${previous.tier}->${next.tier}`, effect: effect.effect, reason: effect.reason })}`);
    }

    const proactivity = shapedEventHandoff
        ? { handoffEvent: shapedEventHandoff }
        : runPowerActorProactivity({ before, trackerUpdate, handoffEntries, dice, rapportClock, nameGeneration, audit });

    for (const [name, state] of Object.entries({ ...before, ...trackerUpdate })) {
        const normalized = normalizePowerActorState(state);
        if (normalized.enmity <= 0) continue;
        if (!handoffEntries.some(entry => sameName(entry.Actor, name))) {
            handoffEntries.push(powerActorHandoffEntry(normalized));
        }
    }

    const handoff = {
        version: POWER_ACTOR_ENMITY_VERSION,
        entries: handoffEntries
            .filter(entry => entry.Enmity > 0)
            .sort((a, b) => b.Enmity - a.Enmity || String(a.Actor).localeCompare(String(b.Actor)))
            .slice(0, 8),
        event: shapedEventHandoff || proactivity?.handoffEvent || null,
    };
    audit.push(`3P.5 powerActorPressureHandoff=${handoff.entries.length ? compact(handoff.entries) : 'none'}`);
    audit.push(`3P.6 powerEventHandoff=${handoff.event ? compact(handoff.event) : 'none'}`);
    return { trackerUpdate, handoff };
}

function isDuplicatePowerActorEffect(effect, previousState) {
    const previous = normalizePowerActorState(previousState || {});
    const reasonKey = normalizeNameKey(effect.reason);
    if (!reasonKey) return false;
    if (previous.reasons.some(reason => normalizeNameKey(reason) === reasonKey)) return true;
    const last = previous.lastEffect || {};
    return last.effect === effect.effect
        && last.severity === effect.severity
        && normalizeNameKey(last.reason) === reasonKey;
}

function reroutePowerActorEffectToCurrentCandidate(effect, ledger, before, trackerUpdate, audit, playerTrackerSnapshot = null) {
    const candidates = currentPowerActorCandidates(ledger).filter(candidate => candidate.isPowerActor && candidate.hasReach);
    if (!candidates.length) return effect;
    if (candidates.some(candidate => sameName(candidate.actor, effect.actor))) return effect;

    const source = powerActorLatestActionSource(ledger, null, effect, playerTrackerSnapshot);
    const mentioned = candidates.filter(candidate => sourceMentionsPowerActor(candidate.actor, source));
    const preferred = mentioned.length === 1 ? mentioned[0] : null;
    if (!preferred) return effect;

    const retargeted = {
        ...effect,
        actor: preferred.actor,
        actorType: preferred.actorType || effect.actorType,
    };
    audit?.push(`3P.2a powerActorEffectRetargeted=${compact({
        hardRule: 'current action power actor candidate owns latest enmity effect over older snapshot actor',
        from: effect.actor,
        to: retargeted.actor,
        reason: effect.reason,
    })}`);
    return retargeted;
}

function currentPowerActorCandidates(ledger) {
    const currentNames = unique([
        ...toRealArray(ledger?.resolutionEngine?.identifyTargets?.PowerActors),
        ...toRealArray(ledger?.resolutionEngine?.identifyTargets?.ActionTargets),
        ...toRealArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.NPC),
        ...toRealArray(ledger?.resolutionEngine?.identifyTargets?.BenefitedObservers),
        ...toRealArray(ledger?.resolutionEngine?.identifyTargets?.HarmedObservers),
        ...toRealArray(ledger?.resolutionEngine?.identifyTargets?.NPCAwareOfUser),
    ]);
    const currentKeys = new Set(currentNames.map(normalizeNameKey).filter(Boolean));
    return (Array.isArray(ledger?.powerActorEnmity?.assessments) ? ledger.powerActorEnmity.assessments : [])
        .map(normalizePowerActorAssessmentForRunner)
        .filter(candidate => candidate.actor && (currentKeys.has(normalizeNameKey(candidate.actor)) || currentKeys.size === 0));
}

function normalizePowerActorAssessmentForRunner(value) {
    const source = value && typeof value === 'object' ? value : {};
    const actor = cleanPowerActorScalar(source.actor ?? source.Actor, 100);
    const reach = Array.isArray(source.reach ?? source.Reach)
        ? (source.reach ?? source.Reach).map(item => cleanPowerActorScalar(item, 80)).filter(Boolean)
        : String(source.reach ?? source.Reach ?? '')
            .split(',')
            .map(item => cleanPowerActorScalar(item, 80))
            .filter(Boolean);
    return {
        actor,
        isPowerActor: bool(source.isPowerActor ?? source.IsPowerActor),
        hasReach: reach.length > 0 || bool(source.isPowerActor ?? source.IsPowerActor),
        actorType: cleanPowerActorScalar(source.actorType ?? source.ActorType, 80) || 'power actor',
        evidence: cleanPowerActorScalar(source.evidence ?? source.Evidence, 180),
        assessmentReason: cleanPowerActorScalar(source.assessmentReason ?? source.AssessmentReason ?? source.reason ?? source.Reason, 180),
    };
}

function powerActorLatestActionSource(ledger, context, effect = null, playerTrackerSnapshot = null) {
    const semantic = ledger?.resolutionEngine || {};
    const itemUse = normalizeItemUseForHandoff(semantic.itemUse, context, null, playerTrackerSnapshot);
    return [
        context ? getLatestUserTextFromContext(context) : '',
        semantic.identifyGoal,
        semantic.identifyChallenge,
        semantic.explicitMeans,
        itemUse.Item,
        itemUse.Evidence,
        itemUse.NoEffectReason,
        ...toRealArray(semantic.identifyTargets?.PowerActors),
        ...toRealArray(semantic.identifyTargets?.ActionTargets),
        ...toRealArray(semantic.identifyTargets?.HarmedObservers),
        ...toRealArray(semantic.identifyTargets?.NPCAwareOfUser),
        effect?.actor,
        effect?.reason,
    ].filter(Boolean).join(' ').toLowerCase();
}

function sourceMentionsPowerActor(actor, source) {
    const key = normalizeNameKey(actor);
    if (!key) return false;
    return String(source || '').toLowerCase().includes(key);
}

function normalizePowerActorEffect(value) {
    const source = value && typeof value === 'object' ? value : {};
    const actor = cleanPowerActorScalar(source.actor ?? source.Actor, 100);
    if (!actor) return null;
    const hasReach = bool(source.hasReach ?? source.HasReach);
    const knownToActor = bool(source.knownToActor ?? source.KnownToActor);
    const effect = normalizePowerActorEffectType(source.effect ?? source.Effect);
    const severity = normalizePowerActorSeverity(source.severity ?? source.Severity);
    if (!hasReach || !knownToActor || effect === 'none' || severity === 'none') return null;
    return {
        actor,
        actorType: cleanPowerActorScalar(source.actorType ?? source.ActorType, 80) || 'power actor',
        hasReach: true,
        effect,
        severity,
        reason: cleanPowerActorScalar(source.reason ?? source.Reason, 180) || effect.replace(/_/g, ' '),
        knownToActor: true,
    };
}

function normalizePowerActors(value) {
    const source = value && typeof value === 'object' ? value : {};
    const result = {};
    for (const [name, state] of Object.entries(source)) {
        const normalized = normalizePowerActorState({ ...(state || {}), name: state?.name || name });
        if (!normalized.name || (normalized.enmity <= 0 && !normalized.pendingEvent.id && !normalized.activeAgent.name)) continue;
        result[normalized.name] = normalized;
    }
    return result;
}

function normalizePowerActorState(value = {}) {
    const name = cleanPowerActorScalar(value.name ?? value.Actor, 100);
    const enmity = clamp(Math.floor(Number(value.enmity ?? value.Enmity ?? 0) || 0), 0, 20);
    const pendingEvent = normalizePowerActorPendingEvent(value.pendingEvent ?? value.PendingEvent);
    const activeAgent = normalizePowerActorAgent(value.activeAgent ?? value.ActiveAgent);
    return {
        version: POWER_ACTOR_ENMITY_VERSION,
        name,
        type: cleanPowerActorScalar(value.type ?? value.actorType ?? value.Type, 80) || 'power actor',
        enmity,
        tier: powerActorTier(enmity),
        reasons: normalizePowerActorStringList(value.reasons ?? value.Reasons).slice(-8),
        responseHistory: normalizePowerActorStringList(value.responseHistory ?? value.ResponseHistory).slice(-12),
        lastEffect: normalizePowerActorLastEffect(value.lastEffect ?? value.LastEffect),
        cooldownUntilActiveMs: Math.max(0, Math.floor(Number(value.cooldownUntilActiveMs ?? value.CooldownUntilActiveMs ?? 0) || 0)),
        lastProactivityAtActiveMs: Math.max(0, Math.floor(Number(value.lastProactivityAtActiveMs ?? value.LastProactivityAtActiveMs ?? 0) || 0)),
        pendingEvent,
        activeAgent,
    };
}

function normalizePowerActorPendingEvent(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const id = cleanPowerActorScalar(source.id ?? source.Id, 80);
    const eventType = normalizePowerActorEventType(source.eventType ?? source.EventType);
    if (!id || eventType === 'none') return emptyPowerActorPendingEvent();
    return {
        id,
        eventType,
        severityBand: normalizePowerActorEventBand(source.severityBand ?? source.SeverityBand),
        createdAtActiveMs: Math.max(0, Math.floor(Number(source.createdAtActiveMs ?? source.CreatedAtActiveMs ?? 0) || 0)),
        actor: cleanPowerActorScalar(source.actor ?? source.Actor, 100),
        actorType: cleanPowerActorScalar(source.actorType ?? source.ActorType, 80) || 'power actor',
        reason: cleanPowerActorScalar(source.reason ?? source.Reason, 180),
        premise: cleanPowerActorScalar(source.premise ?? source.Premise, 220),
        contactName: cleanPowerActorScalar(source.contactName ?? source.ContactName, 80),
        contactGender: normalizePowerActorContactGender(source.contactGender ?? source.ContactGender),
        status: normalizePowerActorPendingStatus(source.status ?? source.Status),
        attempts: clamp(Math.floor(Number(source.attempts ?? source.Attempts ?? 0) || 0), 0, 5),
    };
}

function emptyPowerActorPendingEvent() {
    return {
        id: '',
        eventType: 'none',
        severityBand: 'none',
        createdAtActiveMs: 0,
        actor: '',
        actorType: 'power actor',
        reason: '',
        premise: '',
        contactName: '',
        contactGender: 'none',
        status: 'none',
        attempts: 0,
    };
}

function normalizePowerActorAgent(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const name = cleanPowerActorScalar(source.name ?? source.Name, 80);
    if (!name) return emptyPowerActorAgent();
    return {
        name,
        gender: normalizePowerActorContactGender(source.gender ?? source.Gender),
        coverRole: cleanPowerActorScalar(source.coverRole ?? source.CoverRole, 120) || 'scene contact',
        plantedAtActiveMs: Math.max(0, Math.floor(Number(source.plantedAtActiveMs ?? source.PlantedAtActiveMs ?? 0) || 0)),
        lastActionAtActiveMs: Math.max(0, Math.floor(Number(source.lastActionAtActiveMs ?? source.LastActionAtActiveMs ?? 0) || 0)),
        actionCount: clamp(Math.floor(Number(source.actionCount ?? source.ActionCount ?? 0) || 0), 0, 999),
    };
}

function emptyPowerActorAgent() {
    return {
        name: '',
        gender: 'none',
        coverRole: '',
        plantedAtActiveMs: 0,
        lastActionAtActiveMs: 0,
        actionCount: 0,
    };
}

function normalizePowerActorLastEffect(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        effect: normalizePowerActorEffectType(source.effect ?? source.Effect),
        severity: normalizePowerActorSeverity(source.severity ?? source.Severity),
        reason: cleanPowerActorScalar(source.reason ?? source.Reason, 180),
        delta: clamp(Math.floor(Number(source.delta ?? source.Delta ?? 0) || 0), 0, 5),
        at: Math.max(0, Math.floor(Number(source.at ?? source.At ?? 0) || 0)),
    };
}

function normalizePowerEventShape(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const eventId = cleanPowerActorScalar(source.eventId ?? source.EventId, 80);
    const actor = cleanPowerActorScalar(source.actor ?? source.Actor, 100);
    const fit = normalizePowerActorEventFit(source.fit ?? source.Fit);
    const eventType = normalizePowerActorEventType(source.eventType ?? source.EventType);
    if (!eventId || !actor || fit === 'none') return null;
    return {
        eventId,
        actor,
        eventType,
        fit,
        visibleInstruction: cleanPowerActorScalar(source.visibleInstruction ?? source.VisibleInstruction, 360),
        contactName: cleanPowerActorScalar(source.contactName ?? source.ContactName, 80),
        contactGender: normalizePowerActorContactGender(source.contactGender ?? source.ContactGender),
        surfaceRole: cleanPowerActorScalar(source.surfaceRole ?? source.SurfaceRole, 120),
        deferReason: cleanPowerActorScalar(source.deferReason ?? source.DeferReason, 160),
    };
}

function normalizePowerActorEventType(value) {
    const text = cleanPowerActorScalar(value, 80).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_ACTOR_EVENT_TYPES.includes(text) ? text : 'none';
}

function normalizePowerActorEventBand(value) {
    const text = cleanPowerActorScalar(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
    return ['none', 'noticed', 'obstructive', 'retaliation', 'covert', 'strategic'].includes(text) ? text : 'none';
}

function normalizePowerActorPendingStatus(value) {
    const text = cleanPowerActorScalar(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
    return ['none', 'pending', 'shaped', 'deferred', 'dropped'].includes(text) ? text : 'pending';
}

function normalizePowerActorContactGender(value) {
    const text = cleanPowerActorScalar(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_ACTOR_CONTACT_GENDERS.includes(text) ? text : 'unknown';
}

function normalizePowerActorEventFit(value) {
    const text = cleanPowerActorScalar(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_ACTOR_EVENT_FITS.includes(text) ? text : 'none';
}

function isSafePowerEventVisibleInstruction(value) {
    const text = cleanPowerActorScalar(value, 360);
    if (!text) return false;
    return !/\b(?:spy|spies|agent|infiltrat(?:e|es|ed|ing|or|ors|ion)|sponsor|handler|hidden\s+(?:motive|allegiance|alignment|orders?)|secret\s+(?:motive|allegiance|alignment|orders?)|betray(?:al|s|ed|ing)?|double\s+agent|plant(?:ed)?\s+(?:contact|operative)|covert\s+operative)\b/i.test(text);
}

function powerActorEnmityDelta(severity) {
    if (severity === 'major') return 3;
    if (severity === 'meaningful') return 2;
    if (severity === 'minor') return 1;
    return 0;
}

function powerActorTier(enmity) {
    const value = Math.max(0, Math.floor(Number(enmity || 0)));
    if (value >= 5) return 'Strategic Campaign';
    if (value >= 4) return 'Infiltration Eligible';
    if (value >= 3) return 'Direct Retaliation Eligible';
    if (value >= 2) return 'Obstructive';
    if (value >= 1) return 'Noticed';
    return 'Unaware';
}

function powerActorHandoffEntry(state) {
    const normalized = normalizePowerActorState(state);
    return {
        Actor: normalized.name,
        Type: normalized.type,
        Enmity: normalized.enmity,
        Tier: normalized.tier,
        Reasons: normalized.reasons,
        LastEffect: normalized.lastEffect,
    };
}

function runPowerActorProactivity({ before, trackerUpdate, handoffEntries, dice, rapportClock, nameGeneration, audit }) {
    const activeMs = Math.max(0, Math.floor(Number(rapportClock?.activeMs || 0)));
    const actors = Object.entries({ ...before, ...trackerUpdate })
        .map(([name, state]) => normalizePowerActorState({ ...(state || {}), name: state?.name || name }))
        .filter(state => state.name && state.enmity > 0);
    audit.push(`3P.7 powerActorProactivityCandidates=${actors.length ? powerActorSummary(Object.fromEntries(actors.map(state => [state.name, state]))) : 'none'}`);

    const actorWithPending = actors.find(state => state.pendingEvent.id);
    if (actorWithPending) {
        audit.push(`3P.8 powerActorProactivityBlocked=pendingEvent:${actorWithPending.name}/${actorWithPending.pendingEvent.id}`);
        return { handoffEvent: null };
    }

    const agentActor = actors.find(state => state.activeAgent.name);
    const candidatePool = agentActor ? [agentActor] : actors.filter(state => activeMs >= state.cooldownUntilActiveMs);
    if (!candidatePool.length) {
        audit.push('3P.8 powerActorProactivityBlocked=cooldown_or_no_actor');
        return { handoffEvent: null };
    }

    const candidates = candidatePool
        .map(state => {
            const die = typeof dice?.d20 === 'function' ? dice.d20() : Math.floor(Math.random() * 20) + 1;
            const threshold = powerActorProactivityThreshold(state);
            return { state, die, threshold, passes: die >= threshold };
        })
        .sort((a, b) => b.state.enmity - a.state.enmity || b.die - a.die);
    audit.push(`3P.8 powerActorProactivityRolls=${compact(candidates.map(item => ({ actor: item.state.name, die: item.die, threshold: item.threshold, passes: item.passes ? 'Y' : 'N' })))}`);

    const selected = candidates.find(item => item.passes);
    if (!selected) return { handoffEvent: null };

    const eventDie = typeof dice?.d100 === 'function' ? dice.d100() : Math.floor(Math.random() * 100) + 1;
    const pendingEvent = buildPowerActorPendingEvent(selected.state, eventDie, activeMs, nameGeneration);
    if (!pendingEvent.id) {
        audit.push(`3P.9 powerActorProactivityNoEvent=${compact({ actor: selected.state.name, eventDie })}`);
        return { handoffEvent: null };
    }

    const previous = normalizePowerActorState(trackerUpdate[selected.state.name] || before[selected.state.name] || selected.state);
    const next = normalizePowerActorState({
        ...previous,
        pendingEvent,
        lastProactivityAtActiveMs: activeMs,
    });
    trackerUpdate[next.name] = next;
    audit.push(`3P.9 powerActorPendingEventCreated=${compact({ actor: next.name, eventType: pendingEvent.eventType, band: pendingEvent.severityBand, eventId: pendingEvent.id, nextTurn: 'semantic_shape_required' })}`);
    upsertPowerActorHandoffEntry(handoffEntries, next);
    return { handoffEvent: null };
}

function applyPowerEventShape(previous, shape, rapportClock, audit) {
    const activeMs = Math.max(0, Math.floor(Number(rapportClock?.activeMs || 0)));
    const pending = previous.pendingEvent;
    const eventType = normalizePowerActorEventType(shape.eventType && shape.eventType !== 'none' ? shape.eventType : pending.eventType);
    let nextPending = emptyPowerActorPendingEvent();
    let actorHandoffEntry = null;
    let surfaceEvent = null;
    let activeAgent = previous.activeAgent;
    const responseHistory = [...previous.responseHistory];
    const auditInfo = {
        actor: previous.name,
        eventId: pending.id,
        eventType,
        fit: shape.fit,
    };

    if (shape.fit === 'defer') {
        const attempts = pending.attempts + 1;
        nextPending = attempts >= 3
            ? emptyPowerActorPendingEvent()
            : normalizePowerActorPendingEvent({
                ...pending,
                attempts,
                status: 'pending',
            });
        auditInfo.result = nextPending.id ? 'deferred' : 'dropped_after_defers';
    } else if (shape.fit === 'drop') {
        auditInfo.result = 'dropped';
    } else if (!isSafePowerEventVisibleInstruction(shape.visibleInstruction)) {
        const attempts = pending.attempts + 1;
        nextPending = attempts >= 3
            ? emptyPowerActorPendingEvent()
            : normalizePowerActorPendingEvent({
                ...pending,
                attempts,
                status: 'pending',
            });
        auditInfo.result = nextPending.id ? 'unsafe_instruction_deferred' : 'unsafe_instruction_dropped';
    } else {
        responseHistory.push(powerActorResponseHistoryLine(eventType, shape.visibleInstruction));
        surfaceEvent = {
            EventType: eventType,
            VisibleInstruction: shape.visibleInstruction,
            ContactName: shape.contactName || pending.contactName,
            ContactGender: shape.contactGender || pending.contactGender,
            SurfaceRole: shape.surfaceRole,
        };
        auditInfo.result = 'handoff_created';
        if (eventType === 'plant_contact') {
            activeAgent = normalizePowerActorAgent({
                name: shape.contactName || pending.contactName,
                gender: shape.contactGender || pending.contactGender,
                coverRole: shape.surfaceRole || 'new scene contact',
                plantedAtActiveMs: activeMs,
                lastActionAtActiveMs: activeMs,
                actionCount: 0,
            });
            auditInfo.hiddenAgent = activeAgent.name;
        } else if (eventType.startsWith('agent_') && previous.activeAgent.name) {
            activeAgent = normalizePowerActorAgent({
                ...previous.activeAgent,
                lastActionAtActiveMs: activeMs,
                actionCount: previous.activeAgent.actionCount + 1,
            });
        }
    }

    const cooldownUntilActiveMs = (surfaceEvent || shape.fit === 'drop')
        ? powerActorCooldownUntil(activeMs, eventType)
        : previous.cooldownUntilActiveMs;
    const state = normalizePowerActorState({
        ...previous,
        pendingEvent: nextPending,
        activeAgent,
        cooldownUntilActiveMs,
        responseHistory: responseHistory.slice(-POWER_ACTOR_EVENT_HISTORY_LIMIT),
    });
    actorHandoffEntry = surfaceEvent ? powerActorHandoffEntry(state) : null;
    return {
        state,
        handoffEntry: actorHandoffEntry,
        surfaceEvent,
        audit: auditInfo,
    };
}

function upsertPowerActorHandoffEntry(entries, state) {
    const entry = powerActorHandoffEntry(state);
    const index = entries.findIndex(item => sameName(item.Actor, entry.Actor));
    if (index >= 0) entries[index] = entry;
    else entries.push(entry);
}

function powerActorProactivityThreshold(state) {
    const enmity = Math.max(0, Math.floor(Number(state?.enmity || 0)));
    if (state?.activeAgent?.name) return 16;
    if (enmity >= 5) return 16;
    if (enmity >= 4) return 17;
    if (enmity >= 3) return 18;
    if (enmity >= 2) return 19;
    return 20;
}

function buildPowerActorPendingEvent(state, die, activeMs, nameGeneration) {
    const normalized = normalizePowerActorState(state);
    const eventType = selectPowerActorEventType(normalized, die);
    if (eventType === 'none') return emptyPowerActorPendingEvent();
    const contact = eventType === 'plant_contact'
        ? choosePowerActorContact(nameGeneration, die)
        : {};
    return normalizePowerActorPendingEvent({
        id: `${normalizeNameKey(normalized.name).slice(0, 28) || 'power'}-${activeMs}-${eventType}-${die}`,
        eventType,
        severityBand: powerActorEventBand(normalized.enmity),
        createdAtActiveMs: activeMs,
        actor: normalized.name,
        actorType: normalized.type,
        reason: normalized.reasons[normalized.reasons.length - 1] || normalized.lastEffect.reason || 'hidden opposition pressure',
        premise: powerActorEventPremise(normalized, eventType),
        contactName: contact.name || '',
        contactGender: contact.gender || 'none',
        status: 'pending',
        attempts: 0,
    });
}

function selectPowerActorEventType(state, die) {
    if (state?.activeAgent?.name) {
        if (die >= 76) return 'agent_sabotage';
        if (die >= 46) return 'agent_mislead';
        return 'agent_report';
    }
    const enmity = Math.max(0, Math.floor(Number(state?.enmity || 0)));
    if (enmity >= 5) {
        if (die >= 82) return 'plant_contact';
        if (die >= 61) return 'frame_user';
        if (die >= 36) return 'ambush';
        if (die >= 16) return 'warning';
        return 'minor_obstruction';
    }
    if (enmity >= 4) {
        if (die >= 86) return 'plant_contact';
        if (die >= 66) return 'frame_user';
        if (die >= 41) return 'ambush';
        if (die >= 21) return 'warning';
        return 'minor_obstruction';
    }
    if (enmity >= 3) {
        if (die >= 70) return 'ambush';
        if (die >= 36) return 'warning';
        return 'minor_obstruction';
    }
    if (enmity >= 2) {
        return die >= 61 ? 'warning' : 'minor_obstruction';
    }
    return 'minor_obstruction';
}

function powerActorEventBand(enmity) {
    const value = Math.max(0, Math.floor(Number(enmity || 0)));
    if (value >= 5) return 'strategic';
    if (value >= 4) return 'covert';
    if (value >= 3) return 'retaliation';
    if (value >= 2) return 'obstructive';
    if (value >= 1) return 'noticed';
    return 'none';
}

function powerActorEventPremise(state, eventType) {
    const actor = state?.name || 'a power actor';
    const agent = state?.activeAgent?.name || 'the planted contact';
    switch (eventType) {
        case 'minor_obstruction':
            return `${actor} causes a small practical obstacle that fits the current location or activity.`;
        case 'warning':
            return `${actor} sends or arranges a warning, threat, demand, or sign of displeasure.`;
        case 'ambush':
            return `${actor} arranges direct hostile pressure such as hired attackers, guards, or a trap.`;
        case 'frame_user':
            return `${actor} arranges a false accusation, planted evidence, rumor, or official trouble.`;
        case 'plant_contact':
            return `${actor} introduces a plausible new contact through ordinary scene logic.`;
        case 'agent_mislead':
            return `${agent} steers {{user}} toward a worse route, choice, delay, lead, or contact through ordinary conversation.`;
        case 'agent_report':
            return `${agent} quietly creates an opportunity for information about {{user}} plans to leave the scene.`;
        case 'agent_sabotage':
            return `${agent} creates a subtle practical setback while staying plausible in the current scene.`;
        default:
            return '';
    }
}

function choosePowerActorContact(nameGeneration, die) {
    const pool = nameGeneration?.namePool || {};
    const useFemale = die % 2 === 0;
    const bucket = useFemale ? 'female' : 'male';
    const names = Array.isArray(pool[bucket]) ? pool[bucket].filter(isReal) : [];
    const fallback = Array.isArray(pool[useFemale ? 'male' : 'female']) ? pool[useFemale ? 'male' : 'female'].filter(isReal) : [];
    const selected = names[0] || fallback[0] || '';
    return {
        name: selected,
        gender: selected ? (names[0] ? bucket : (useFemale ? 'male' : 'female')) : 'unknown',
    };
}

function powerActorCooldownUntil(activeMs, eventType) {
    return clamp(activeMs + (POWER_ACTOR_EVENT_COOLDOWN_MS[eventType] || (2 * 60 * 60 * 1000)), 0, 1000000000000);
}

function powerActorResponseHistoryLine(eventType, instruction) {
    return `${eventType}: ${cleanPowerActorScalar(instruction, 160)}`;
}

function powerActorSummary(powerActors) {
    const entries = Object.entries(powerActors || {});
    if (!entries.length) return 'none';
    return entries
        .map(([name, state]) => {
            const normalized = normalizePowerActorState({ ...(state || {}), name });
            return `${normalized.name}/${normalized.enmity}/${normalized.tier}`;
        })
        .join('; ');
}

function findExistingPowerActorName(powerActors, actor) {
    const key = normalizeNameKey(actor);
    if (!key) return '';
    return Object.keys(powerActors || {}).find(name => normalizeNameKey(name) === key) || '';
}

function normalizePowerActorEffectType(value) {
    const text = cleanPowerActorScalar(value, 80).toLowerCase().replace(/[\s-]+/g, '_');
    const allowed = ['none', 'thwart', 'expose', 'harm_assets', 'steal', 'humiliate', 'help_enemy', 'disrupt_operation', 'kill_or_capture_people', 'damage_reputation_or_income'];
    return allowed.includes(text) ? text : 'none';
}

function normalizePowerActorSeverity(value) {
    const text = cleanPowerActorScalar(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
    return ['none', 'minor', 'meaningful', 'major'].includes(text) ? text : 'none';
}

function normalizePowerActorStringList(value) {
    const source = Array.isArray(value) ? value : [];
    return unique(source.map(item => cleanPowerActorScalar(item, 180)).filter(Boolean)).slice(0, 20);
}

function cleanPowerActorScalar(value, maxLength = 120) {
    const text = String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^["']|["']$/g, '')
        .trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, maxLength);
}

export function mergeUserKnowledgeLedger(before = {}, delta = {}) {
    const base = normalizeUserKnowledgeLedger(before);
    const incoming = normalizeUserKnowledgeDelta(delta);
    return normalizeUserKnowledgeLedger({
        version: USER_KNOWLEDGE_LEDGER_VERSION,
        personal: mergeUserKnowledgeBucket(base.personal, incoming.personal, 'personal'),
        reputation: mergeUserKnowledgeBucket(base.reputation, incoming.reputation, 'reputation'),
    });
}

function normalizeUserKnowledgeLedger(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        version: USER_KNOWLEDGE_LEDGER_VERSION,
        personal: Array.isArray(source.personal)
            ? source.personal.map(normalizePersonalKnowledgeEntry).filter(Boolean).slice(-80)
            : [],
        reputation: Array.isArray(source.reputation)
            ? source.reputation.map(normalizeReputationKnowledgeEntry).filter(Boolean).slice(-80)
            : [],
    };
}

function normalizeUserKnowledgeDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        personal: Array.isArray(source.personal)
            ? source.personal.map(normalizePersonalKnowledgeEntry).filter(Boolean)
            : [],
        reputation: Array.isArray(source.reputation)
            ? source.reputation.map(normalizeReputationKnowledgeEntry).filter(Boolean)
            : [],
    };
}

function normalizePersonalKnowledgeEntry(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const knownBy = cleanKnowledgeScalar(source.knownBy, 140);
    const line = cleanKnowledgeScalar(source.line, 220);
    if (!knownBy || !line) return null;
    const topic = cleanKnowledgeScalar(source.topic, 140) || NONE;
    const scope = normalizeUserKnowledgeScope(source.scope);
    const truth = normalizeUserKnowledgeTruth(source.truth);
    const confidence = normalizeUserKnowledgeConfidence(source.confidence);
    const id = cleanKnowledgeId(source.id) || makeKnowledgeId('pk', [knownBy, scope, topic, truth, confidence, line]);
    return {
        id,
        type: 'personalKnowledge',
        knownBy,
        scope,
        topic,
        truth,
        confidence,
        line,
        reason: cleanKnowledgeScalar(source.reason, 220) || NONE,
        createdAt: normalizeKnowledgeTimestamp(source.createdAt),
        updatedAt: normalizeKnowledgeTimestamp(source.updatedAt),
    };
}

function normalizeReputationKnowledgeEntry(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const line = cleanKnowledgeScalar(source.line, 220);
    if (!line) return null;
    const scope = normalizeUserKnowledgeScope(source.scope);
    const valence = normalizeUserKnowledgeValence(source.valence);
    const topic = cleanKnowledgeScalar(source.topic, 140) || NONE;
    const truth = normalizeUserKnowledgeTruth(source.truth);
    const confidence = normalizeUserKnowledgeConfidence(source.confidence);
    const origin = cleanKnowledgeScalar(source.origin, 160) || NONE;
    const id = cleanKnowledgeId(source.id) || makeKnowledgeId('rk', [scope, valence, topic, truth, confidence, line, origin]);
    return {
        id,
        type: 'reputationKnowledge',
        scope,
        valence,
        topic,
        truth,
        confidence,
        line,
        origin,
        reason: cleanKnowledgeScalar(source.reason, 220) || NONE,
        createdAt: normalizeKnowledgeTimestamp(source.createdAt),
        updatedAt: normalizeKnowledgeTimestamp(source.updatedAt),
    };
}

function mergeUserKnowledgeBucket(before = [], incoming = [], bucket) {
    const byKey = new Map();
    for (const entry of before || []) {
        const normalized = bucket === 'reputation'
            ? normalizeReputationKnowledgeEntry(entry)
            : normalizePersonalKnowledgeEntry(entry);
        if (!normalized) continue;
        byKey.set(userKnowledgeMergeKey(normalized), normalized);
    }
    const now = Date.now();
    for (const entry of incoming || []) {
        const normalized = bucket === 'reputation'
            ? normalizeReputationKnowledgeEntry(entry)
            : normalizePersonalKnowledgeEntry(entry);
        if (!normalized) continue;
        const key = userKnowledgeMergeKey(normalized);
        const previous = byKey.get(key);
        byKey.set(key, {
            ...(previous || {}),
            ...normalized,
            id: previous?.id || normalized.id,
            createdAt: previous?.createdAt || now,
            updatedAt: now,
        });
    }
    return Array.from(byKey.values()).slice(-80);
}

function userKnowledgeMergeKey(entry) {
    if (entry.type === 'reputationKnowledge') {
        return ['reputation', entry.scope, entry.valence, entry.topic, entry.truth, normalizeKnowledgeLineKey(entry.line)].join('|');
    }
    return ['personal', entry.knownBy, entry.scope, entry.topic, entry.truth, normalizeKnowledgeLineKey(entry.line)].join('|');
}

const USER_REPUTATION_VERSION = 1;
const USER_REPUTATION_HISTORY_LIMIT = 40;

export function mergeUserReputationLedger(before = {}, delta = {}) {
    const base = normalizeUserReputation(before);
    const incoming = normalizeUserReputationDelta(delta);
    const locations = { ...base.locations };
    const history = [...base.history];
    const now = Date.now();
    let fameAwarded = 0;
    let infamyAwarded = 0;

    for (const entry of incoming.events) {
        const location = normalizeReputationLocation(entry.location);
        if (!location) continue;
        const locationKey = findExistingReputationLocationKey(locations, location) || location;
        const previous = normalizeUserReputationLocation(locations[locationKey] || { location: locationKey });
        const rawFameDelta = clamp(Math.floor(Number(entry.fameDelta || 0)), 0, 1);
        const rawInfamyDelta = clamp(Math.floor(Number(entry.infamyDelta || 0)), 0, 1);
        const fameDelta = fameAwarded ? 0 : rawFameDelta;
        const infamyDelta = infamyAwarded ? 0 : rawInfamyDelta;
        if (!fameDelta && !infamyDelta) continue;
        fameAwarded += fameDelta;
        infamyAwarded += infamyDelta;
        const next = normalizeUserReputationLocation({
            ...previous,
            location: previous.location || locationKey,
            fame: previous.fame + fameDelta,
            infamy: previous.infamy + infamyDelta,
            updatedAt: now,
        });
        if (locationKey !== next.location && locations[locationKey]) delete locations[locationKey];
        locations[next.location] = next;
        history.push(normalizeUserReputationEvent({
            ...entry,
            location: next.location,
            fameDelta,
            infamyDelta,
            createdAt: now,
        }));
    }

    return normalizeUserReputation({
        version: USER_REPUTATION_VERSION,
        locations,
        history: history.filter(Boolean).slice(-USER_REPUTATION_HISTORY_LIMIT),
    });
}

export function normalizeUserReputation(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const locations = {};
    const rawLocations = source.locations && typeof source.locations === 'object' ? source.locations : {};
    for (const [key, entry] of Object.entries(rawLocations)) {
        const normalized = normalizeUserReputationLocation({ ...(entry || {}), location: entry?.location || key });
        if (!normalized.location) continue;
        locations[normalized.location] = normalized;
    }
    const history = Array.isArray(source.history)
        ? source.history.map(normalizeUserReputationEvent).filter(Boolean).slice(-USER_REPUTATION_HISTORY_LIMIT)
        : [];
    return {
        version: USER_REPUTATION_VERSION,
        locations,
        history,
    };
}

function normalizeUserReputationDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const events = Array.isArray(source.events)
        ? source.events.map(normalizeUserReputationEvent).filter(Boolean)
        : [];
    return { events };
}

function normalizeUserReputationLocation(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const location = normalizeReputationLocation(source.location);
    if (!location) return { location: '', fame: 0, infamy: 0, updatedAt: 0 };
    return {
        location,
        fame: clamp(Math.floor(Number(source.fame || 0)), 0, 999),
        infamy: clamp(Math.floor(Number(source.infamy || 0)), 0, 999),
        updatedAt: Math.max(0, Math.floor(Number(source.updatedAt || 0))),
    };
}

function findExistingReputationLocationKey(locations = {}, location = '') {
    const wanted = normalizeReputationLocation(location).toLowerCase();
    if (!wanted) return '';
    return Object.keys(locations || {}).find(key => normalizeReputationLocation(key).toLowerCase() === wanted)
        || Object.values(locations || {}).map(entry => normalizeReputationLocation(entry?.location)).find(existing => existing.toLowerCase() === wanted)
        || '';
}

function normalizeUserReputationEvent(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const location = normalizeReputationLocation(source.location);
    if (!location) return null;
    const fameDelta = clamp(Math.floor(Number(source.fameDelta || 0)), 0, 1);
    const infamyDelta = clamp(Math.floor(Number(source.infamyDelta || 0)), 0, 1);
    if (!fameDelta && !infamyDelta) return null;
    return {
        location,
        fameDelta,
        infamyDelta,
        reason: cleanKnowledgeScalar(source.reason, 220) || NONE,
        evidence: cleanKnowledgeScalar(source.evidence, 220) || NONE,
        createdAt: normalizeKnowledgeTimestamp(source.createdAt),
    };
}

function normalizeReputationLocation(value) {
    const text = cleanKnowledgeScalar(value, 120);
    if (!text || text === NONE) return '';
    return text.replace(/\s+/g, ' ').trim();
}

function normalizeUserKnowledgeScope(value) {
    const text = cleanKnowledgeScalar(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
    return USER_KNOWLEDGE_SCOPES.includes(text) ? text : 'private';
}

function normalizeUserKnowledgeValence(value) {
    const text = cleanKnowledgeScalar(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
    return USER_REPUTATION_VALENCES.includes(text) ? text : 'good';
}

function normalizeUserKnowledgeTruth(value) {
    const text = cleanKnowledgeScalar(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
    return USER_KNOWLEDGE_TRUTH.includes(text) ? text : 'true';
}

function normalizeUserKnowledgeConfidence(value) {
    const text = cleanKnowledgeScalar(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
    return USER_KNOWLEDGE_CONFIDENCE.includes(text) ? text : 'certain';
}

function cleanKnowledgeScalar(value, maxLength = 160) {
    const text = String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^["']|["']$/g, '')
        .trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, maxLength);
}

function cleanKnowledgeId(value) {
    return cleanKnowledgeScalar(value, 80).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

function normalizeKnowledgeLineKey(value) {
    return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function makeKnowledgeId(prefix, parts) {
    const raw = parts.map(part => String(part ?? '').trim().toLowerCase()).join('|');
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index += 1) {
        hash ^= raw.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function normalizeKnowledgeTimestamp(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeUserAbilityUseForHandoff(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const rawUsed = bool(source.used ?? source.Used);
    const attempted = bool(source.attempted ?? source.Attempted ?? rawUsed);
    const available = bool(source.available ?? source.Available ?? rawUsed);
    const used = attempted && available && rawUsed;
    const abilityName = String(source.abilityName ?? source.AbilityName ?? '').trim();
    const evidence = String(source.evidence ?? source.Evidence ?? '').trim();
    const narrativeEffect = String(source.narrativeEffect ?? source.NarrativeEffect ?? '').trim();
    const noEffectReason = String(source.noEffectReason ?? source.NoEffectReason ?? '').trim();
    return {
        Used: used ? 'Y' : 'N',
        Attempted: attempted ? 'Y' : 'N',
        Available: attempted && available ? 'Y' : 'N',
        AbilityName: attempted && isReal(abilityName) ? abilityName : NONE,
        Evidence: attempted && isReal(evidence) ? evidence : NONE,
        NarrativeEffect: attempted && isReal(narrativeEffect) ? narrativeEffect : NONE,
        NoEffectReason: attempted && !available && isReal(noEffectReason) ? noEffectReason : NONE,
        MechanicalScope: 'flavor_only_no_bonus',
    };
}

function normalizeItemUseForHandoff(value = {}, context = null, audit = null, playerTrackerSnapshot = null) {
    const source = value && typeof value === 'object' ? value : {};
    let attempted = bool(source.attempted ?? source.Attempted);
    const rawAvailable = bool(source.available ?? source.Available);
    const item = String(source.item ?? source.Item ?? '').trim();
    const rawSource = String(source.source ?? source.Source ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    let itemSource = normalizeItemUseSource(rawSource);
    const evidence = String(source.evidence ?? source.Evidence ?? '').trim();
    let noEffectReason = String(source.noEffectReason ?? source.NoEffectReason ?? '').trim();
    if (!attempted) itemSource = 'none';
    let available = attempted && rawAvailable && itemUseSourceIsAvailable(itemSource);
    if (attempted && itemUseLooksLikeSceneObjectAccess(item, evidence, context)) {
        audit?.push(`2.7s.0b deterministicSceneObjectItemUseRepair=${compact({
            hardRule: 'scene, environmental, or NPC-offered objects are not personal gear/inventory itemUse',
            item,
            evidence,
            correctedTo: 'not itemUse',
        })}`);
        attempted = false;
        available = false;
        itemSource = 'none';
        noEffectReason = NONE;
    }
    const savedItemMatch = attempted ? playerTrackerItemMatch(context, item, playerTrackerSnapshot) : null;
    const savedItemSource = savedItemMatch?.source || null;
    if (attempted && !available && savedItemSource) {
        audit?.push(`2.7s.0 deterministicItemAvailabilityRepair=${compact({
            hardRule: 'saved user gear/inventory overrides semantic false unavailable result',
            item,
            semanticSource: itemSource,
            correctedTo: savedItemSource,
        })}`);
        available = true;
        itemSource = savedItemSource;
        noEffectReason = NONE;
    }
    if (available && savedItemSource && USER_OWNED_ITEM_SOURCES.includes(itemSource) && itemSource !== savedItemSource) {
        audit?.push(`2.7s.0a deterministicItemSourceRepair=${compact({
            hardRule: 'item source must match saved user gear/inventory',
            item,
            semanticSource: itemSource,
            correctedTo: savedItemSource,
        })}`);
        itemSource = savedItemSource;
    }
    if (available && itemUseRequiresPlayerTrackerItem(itemSource, item, evidence, context) && !playerTrackerHasItem(context, item, playerTrackerSnapshot)) {
        audit?.push(`2.7s.1 deterministicItemAvailability=${compact({
            hardRule: 'user-owned item sources require saved user gear/inventory; latest user wording cannot create possession',
            item,
            source: itemSource,
            evidence,
            correctedTo: 'unavailable',
        })}`);
        available = false;
        itemSource = 'unavailable';
        noEffectReason = USER_ITEM_UNAVAILABLE_REASON;
    }
    if (attempted && !available) itemSource = 'unavailable';
    if (attempted && !available && latestUserInputClaimsItemPossession(item, evidence, context)) {
        noEffectReason = USER_ITEM_UNAVAILABLE_REASON;
    }
    const packet = {
        Attempted: attempted ? 'Y' : 'N',
        Available: available ? 'Y' : 'N',
        Item: attempted && isReal(item) ? item : NONE,
        Source: itemSource,
        Evidence: attempted && isReal(evidence) ? evidence : NONE,
        NoEffectReason: attempted && !available && isReal(noEffectReason) ? noEffectReason : NONE,
    };
    if (attempted && available && savedItemMatch?.item && savedItemMatch.item !== item) {
        packet.SavedItem = savedItemMatch.item;
    }
    return packet;
}

function normalizeLootSearchForHandoff(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const attempted = bool(source.attempted ?? source.Attempted);
    const target = String(source.target ?? source.Target ?? '').trim();
    const rawKind = String(source.targetKind ?? source.TargetKind ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const targetKind = ['humanoid', 'monster', 'other'].includes(rawKind) ? rawKind : 'other';
    const evidence = String(source.evidence ?? source.Evidence ?? '').trim();
    const validAttempt = attempted && isReal(target);
    return {
        Attempted: validAttempt ? 'Y' : 'N',
        Target: validAttempt ? target : NONE,
        TargetKind: validAttempt ? targetKind : 'other',
        Evidence: validAttempt && isReal(evidence) ? evidence : NONE,
    };
}

function itemUseRequiresPlayerTrackerItem(source, item, evidence, context) {
    return USER_OWNED_ITEM_SOURCES.includes(source)
        || latestUserInputClaimsItemPossession(item, evidence, context);
}

function itemUseLooksLikeSceneObjectAccess(item, evidence, context) {
    const itemText = normalizeItemMatchText(item);
    if (!itemText) return false;
    const source = normalizeItemPossessionClaimText([
        evidence,
        getLatestUserTextFromContext(context),
    ].filter(Boolean).join(' '));
    if (!source || latestUserInputClaimsCarriedItemSource(item, evidence, context)) return false;
    const itemPattern = itemText.split(/\s+/).filter(Boolean).map(escapeRegex).join('\\s+');
    const sceneSource = '(?:table|desk|counter|shelf|floor|ground|road|street|path|trail|dirt|sand|snow|grass|bed|chair|bench|couch|sofa|wall|rack|crate|barrel|box|chest|corpse|body|display|case|window|altar|pedestal|bar|stool|cart|wagon|doorstep)';
    const scenePrep = '(?:from|off|off\\s+of|on|in|inside|at|under|beneath|beside|by|near|nearby|next\\s+to|behind|against)';
    const sceneAction = '(?:grab|grabs|take|takes|pick\\s+up|picks\\s+up|lift|lifts|snatch|snatches|collect|collects|retrieve|retrieves)';
    const transferVerb = '(?:hand|hands|handed|offer|offers|offered|give|gives|gave|pass|passes|passed)';
    return new RegExp(`\\b${itemPattern}\\b.{0,80}\\b${scenePrep}\\b.{0,30}\\b${sceneSource}\\b`).test(source)
        || new RegExp(`\\b${sceneAction}\\b.{0,80}\\b${itemPattern}\\b.{0,80}\\b${scenePrep}\\b.{0,30}\\b${sceneSource}\\b`).test(source)
        || new RegExp(`\\b${transferVerb}\\b.{0,80}\\b(?:me|to\\s+me|toward\\s+me|over)\\b.{0,80}\\b${itemPattern}\\b`).test(source)
        || new RegExp(`\\b${itemPattern}\\b.{0,80}\\b${transferVerb}\\b.{0,80}\\b(?:me|to\\s+me|toward\\s+me|over)\\b`).test(source);
}

function latestUserInputClaimsItemPossession(item, evidence, context) {
    const itemText = normalizeItemMatchText(item);
    if (!itemText) return false;
    const source = normalizeItemPossessionClaimText([
        evidence,
        getLatestUserTextFromContext(context),
    ].filter(Boolean).join(' '));
    if (!source) return false;
    const words = itemText.split(/\s+/).filter(Boolean);
    const tail = words[words.length - 1];
    const itemPattern = words.length > 1
        ? words.map(escapeRegex).join('\\s+')
        : escapeRegex(tail);
    const carriedPlaces = '(?:belt|hip|waist|hand|hands|pocket|bag|pack|pouch|sheath|holster|back|shoulder|side)';
    return new RegExp(`\\bmy\\s+${itemPattern}\\b`).test(source)
        || new RegExp(`\\b${itemPattern}\\s+(?:at|on|in|from)\\s+my\\s+${carriedPlaces}\\b`).test(source)
        || new RegExp(`\\b(?:draw|pull|take|retrieve|produce|unsheathe)\\b.{0,60}\\b${itemPattern}\\b.{0,60}\\b(?:from|off|at|on|in)\\s+my\\s+${carriedPlaces}\\b`).test(source)
        || new RegExp(`\\b${tail ? escapeRegex(tail) : itemPattern}\\b.{0,60}\\b(?:from|off|at|on|in)\\s+my\\s+${carriedPlaces}\\b`).test(source);
}

function latestUserInputClaimsCarriedItemSource(item, evidence, context) {
    const itemText = normalizeItemMatchText(item);
    if (!itemText) return false;
    const source = normalizeItemPossessionClaimText([
        evidence,
        getLatestUserTextFromContext(context),
    ].filter(Boolean).join(' '));
    if (!source) return false;
    const words = itemText.split(/\s+/).filter(Boolean);
    const tail = words[words.length - 1];
    const itemPattern = words.length > 1
        ? words.map(escapeRegex).join('\\s+')
        : escapeRegex(tail);
    const carriedPlaces = '(?:belt|hip|waist|hand|hands|pocket|bag|pack|pouch|sheath|holster|back|shoulder|side)';
    return new RegExp(`\\b${itemPattern}\\s+(?:at|on|in|from)\\s+my\\s+${carriedPlaces}\\b`).test(source)
        || new RegExp(`\\b(?:draw|pull|take|retrieve|produce|unsheathe)\\b.{0,60}\\b${itemPattern}\\b.{0,60}\\b(?:from|off|at|on|in)\\s+my\\s+${carriedPlaces}\\b`).test(source)
        || new RegExp(`\\b${tail ? escapeRegex(tail) : itemPattern}\\b.{0,60}\\b(?:from|off|at|on|in)\\s+my\\s+${carriedPlaces}\\b`).test(source);
}

function playerTrackerHasItem(context, item, playerTrackerSnapshot = null) {
    return Boolean(playerTrackerItemMatch(context, item, playerTrackerSnapshot));
}

function playerTrackerItemSource(context, item, playerTrackerSnapshot = null) {
    return playerTrackerItemMatch(context, item, playerTrackerSnapshot)?.source || null;
}

function playerTrackerItemMatch(context, item, playerTrackerSnapshot = null) {
    const requested = String(item ?? '').trim();
    if (!isReal(requested)) return null;
    const user = playerTrackerSnapshot
        ? normalizeTrackerUserState(playerTrackerSnapshot)
        : buildPlayerTrackerSnapshot(context);
    const gearItem = toRealArray(user.gear).find(tracked => itemNamesMatch(tracked, requested));
    if (gearItem) return { source: 'gear', item: gearItem };
    const inventoryItem = toRealArray(user.inventory).find(tracked => itemNamesMatch(tracked, requested));
    if (inventoryItem) return { source: 'inventory', item: inventoryItem };
    return null;
}

function itemNamesMatch(owned, requested) {
    const requestedText = normalizeItemMatchText(requested);
    if (!requestedText) return false;
    const ownedVariants = itemMatchTextVariants(owned);
    return ownedVariants.some(ownedText => normalizedItemNamesMatch(ownedText, requestedText));
}

function normalizedItemNamesMatch(ownedText, requestedText) {
    if (!ownedText || !requestedText) return false;
    if (ownedText === requestedText) return true;
    if (itemPhraseEndsWith(ownedText, requestedText)) return true;
    const ownedCompact = ownedText.replace(/\s+/g, '');
    const requestedCompact = requestedText.replace(/\s+/g, '');
    return ownedCompact === requestedCompact || ownedCompact.endsWith(requestedCompact);
}

function itemMatchTextVariants(value) {
    const raw = String(value ?? '');
    return Array.from(new Set([
        normalizeItemMatchText(raw),
        normalizeItemMatchText(raw.replace(/\([^)]*\)/g, ' ')),
        normalizeItemMatchText(raw.split(/[;,]/)[0]),
        normalizeItemMatchText(raw.replace(/\([^)]*\)/g, ' ').split(/[;,]/)[0]),
    ].filter(Boolean)));
}

function itemPhraseEndsWith(value, suffix) {
    return value.endsWith(` ${suffix}`);
}

function normalizeItemMatchText(value) {
    const stopWords = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'their', 'our', 'at', 'from', 'in', 'on', 'of', 'with', 'to']);
    return String(value ?? '')
        .toLowerCase()
        .replace(/['\u2019]s\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(word => word && !stopWords.has(word))
        .join(' ');
}

function normalizeItemPossessionClaimText(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/['\u2019]s\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeItemUseSource(value) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const allowed = ['none', 'gear', 'inventory', 'unavailable'];
    return allowed.includes(text) ? text : 'unavailable';
}

function itemUseSourceIsAvailable(source) {
    return ['gear', 'inventory'].includes(source);
}

function normalizeClaimCheckForHandoff(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const present = bool(source.present ?? source.Present);
    const stakesImpact = bool(source.stakesImpact ?? source.StakesImpact);
    const claim = String(source.claim ?? source.Claim ?? '').trim();
    const targetNPC = String(source.targetNPC ?? source.TargetNPC ?? '').trim();
    const truthStatus = normalizeClaimTruthStatus(source.truthStatus ?? source.TruthStatus);
    const npcAccess = normalizeClaimNpcAccess(source.npcAccess ?? source.NPCAccess);
    const reason = String(source.reason ?? source.Reason ?? '').trim();
    return {
        Present: present ? 'Y' : 'N',
        Claim: present && isReal(claim) ? claim : NONE,
        TargetNPC: present && isReal(targetNPC) ? targetNPC : NONE,
        TruthStatus: present ? truthStatus : 'none',
        NPCAccess: present ? npcAccess : 'none',
        StakesImpact: present && stakesImpact ? 'Y' : 'N',
        Reason: present && isReal(reason) ? reason : NONE,
    };
}

function normalizeClaimTruthStatus(value) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ['none', 'known_true', 'known_false', 'unsupported', 'unknown'].includes(text) ? text : 'unknown';
}

function normalizeClaimNpcAccess(value) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ['none', 'direct', 'partial', 'unknown'].includes(text) ? text : 'unknown';
}

function isStakeBearingUntrustedClaim(claimCheck) {
    const normalized = normalizeClaimCheckForHandoff(claimCheck);
    return normalized.Present === 'Y'
        && normalized.StakesImpact === 'Y'
        && ['known_false', 'unsupported'].includes(normalized.TruthStatus);
}

function getAcceptedOfferedObjectNoRollEvidence(semantic, semanticRollNeeded, context) {
    if (semanticRollNeeded !== 'Y') return null;
    const exchange = getLatestRelationshipExchange(context);
    const userText = relationshipText(exchange.user || getLatestUserTextFromContext(context)).toLowerCase();
    const assistantText = relationshipText(exchange.assistant).toLowerCase();
    if (!userText || !assistantText) return null;
    if (!userAcceptsOfferedObjectText(userText)) return null;
    if (!assistantOffersObjectToUserText(assistantText, extractAcceptedObjectTerms(userText))) return null;
    if (acceptedOfferTextIsForcefulContest(userText) || acceptedOfferTextIgnoresRefusal(userText) || hasDirectBodilyAggression(userText)) return null;

    return {
        rollNeeded: 'N',
        rule: 'hard_override_accepted_offered_object_no_roll',
        reason: 'NPC-offered object accepted by user; ordinary transfer has no fresh contest unless refusal, withdrawal, force, theft, or danger is explicit.',
        evidence: {
            hardRule: 'ResolutionEngine.rollNeeded: accepting an item clearly offered, handed, passed, or given by an NPC is ordinary transfer, not a possession contest',
            from: 'Y',
            to: 'N',
            userText: userText.slice(0, 180),
            assistantText: assistantText.slice(0, 180),
        },
    };
}

function getFriendlyNpcObjectAccessNoRollEvidence(semantic, semanticRollNeeded, context, trackerSnapshot, targets, routeContext = {}) {
    if (semanticRollNeeded !== 'Y') return null;
    if (normalizeBoundaryObject(semantic?.boundaryBreak).Present === 'Y') return null;
    const challengeType = normalizeChallengeType(routeContext.challengeType || semantic?.challengeType, semanticRollNeeded);
    if (isCombatChallengeType(challengeType)) return null;
    if (toRealArray(targets?.hostilesInScene?.NPC).length || toRealArray(targets?.OppTargets?.ENV).length) return null;

    const source = [
        getLatestUserTextFromContext(context),
        semanticSourceText(semantic),
    ].filter(Boolean).join(' ').toLowerCase();
    if (!source || !friendlyNpcObjectAccessText(source) || hasDirectBodilyAggression(source)) return null;

    const opposingTargets = toRealArray(targets?.OppTargets?.NPC);
    if (opposingTargets.some(name => !friendlyNpcObjectAccessEligible(name, trackerSnapshot))) return null;

    const directTargets = unique([...opposingTargets, ...toRealArray(targets?.ActionTargets)])
        .filter(name => friendlyNpcObjectAccessEligible(name, trackerSnapshot));
    if (!directTargets.length) return null;
    const mentionedTargets = directTargets.filter(name => sourceMentionsNpcOrAlias(source, { NPC: name, ...normalizeTrackerEntry(trackerSnapshot?.[name] || {}) }));
    const target = mentionedTargets[0] || (directTargets.length === 1 ? directTargets[0] : null);
    if (!target) return null;

    return {
        rollNeeded: 'N',
        rule: 'hard_override_friendly_object_access_no_roll',
        reason: 'Friendly B3+ NPC object access is narrator-managed scene friction, not a deterministic possession contest.',
        evidence: {
            hardRule: 'ResolutionEngine.rollNeeded: B3+ friendly NPC object access is narrated by context and should not become dice, boundary pressure, or relationship damage unless it is combat or direct bodily aggression',
            from: 'Y',
            to: 'N',
            NPC: target,
            disposition: formatDisposition(normalizeTrackerEntry(trackerSnapshot?.[target] || {}).currentDisposition),
            userText: String(getLatestUserTextFromContext(context) || '').slice(0, 180),
        },
    };
}

function friendlyNpcObjectAccessEligible(name, trackerSnapshot) {
    if (!isReal(name)) return false;
    const state = normalizeTrackerEntry(trackerSnapshot?.[name] || {});
    const disposition = state.currentDisposition;
    if (!disposition) return false;
    return Number(disposition.B || 0) >= 3
        && Number(disposition.F || 0) < 3
        && Number(disposition.H || 0) < 3
        && state.dominantLock === 'None'
        && state.pressureMode === 'none'
        && state.condition !== 'dead';
}

function friendlyNpcObjectAccessText(source) {
    const text = normalizeItemPossessionClaimText(source);
    if (!text) return false;
    return /\b(?:take|takes|took|grab|grabs|grabbed|borrow|borrows|borrowed|use|uses|used|pick\s+up|picks\s+up|picked\s+up|draw|draws|drew|pull|pulls|pulled|lift|lifts|lifted|collect|collects|collected|handle|handles|handled|hold|holds|held|keep|keeps|kept|accept|accepts|accepted|receive|receives|received|snatch|snatches|snatched|steal|steals|stole|stolen|rip|rips|ripped|yank|yanks|yanked|wrench|wrenches|wrenched|seize|seizes|seized|give|gives|gave|hand|hands|handed|pass|passes|passed|return|returns|returned|bring|brings|brought|drop|drops|dropped|remove|removes|removed|let\s+go|release|releases|released|take\s+back|take\s+from)\b/.test(text)
        && /\b(?:phone|wallet|purse|bag|pack|pouch|sword|weapon|dagger|knife|blade|key|book|scroll|letter|coin|money|item|object|thing|tool|staff|wand|ring|amulet|bottle|cup|glass|map|note|paper|gear|equipment|possession|it|that|this|mine|yours|hers|his|theirs)\b/.test(text);
}

function userAcceptsOfferedObjectText(text) {
    const source = normalizeItemPossessionClaimText(text);
    if (!source) return false;
    if (/\b(?:no thanks|no thank you|refuse|decline|reject|do not accept|don't accept|cannot accept|can't accept|won't accept|give it back|push it away)\b/.test(source)) return false;
    return /\b(?:i\s+)?(?:take|takes|accept|accepts|grab|grabs|receive|receives|keep|keeps|collect|collects|pick\s+up|picks\s+up|take\s+hold\s+of|reach\s+for|reaches\s+for|borrow|borrows|use|uses)\b/.test(source);
}

function extractAcceptedObjectTerms(text) {
    const source = normalizeItemPossessionClaimText(text);
    const terms = [];
    const verbPattern = '(?:take|takes|accept|accepts|grab|grabs|receive|receives|keep|keeps|collect|collects|pick\\s+up|picks\\s+up|take\\s+hold\\s+of|reach\\s+for|reaches\\s+for|borrow|borrows|use|uses)';
    const regex = new RegExp(`\\b${verbPattern}\\s+(?:the\\s+|a\\s+|an\\s+|his\\s+|her\\s+|their\\s+|your\\s+|my\\s+)?([a-z0-9][a-z0-9\\s]{0,60})`, 'g');
    for (const match of source.matchAll(regex)) {
        const phrase = String(match[1] || '')
            .split(/\b(?:from|off|out|into|in|on|with|while|and|then|before|after|to|toward|over|away)\b/)[0]
            .trim();
        if (!phrase || /^(?:it|that|this|one|thing|item|object)$/.test(phrase)) continue;
        const normalized = normalizeItemMatchText(phrase);
        if (normalized) terms.push(normalized);
    }
    return unique(terms);
}

function assistantOffersObjectToUserText(text, acceptedTerms = []) {
    const source = normalizeItemPossessionClaimText(text);
    if (!source) return false;
    if (/\b(?:does\s+not|doesn\s+t|did\s+not|didn\s+t|can\s+not|cannot|can\s+t|will\s+not|won\s+t|refuses?\s+to|declines?\s+to)\s+(?:hand|offer|give|pass|lend|let|allow)\b/.test(source)) return false;
    if (/\b(?:keeps?\s+hold|does\s+not\s+let\s+go|won\s+t\s+let\s+go|pulls?\s+(?:it|that|this)\s+back|out\s+of\s+reach|if\s+you\s+can\s+take|can\s+t\s+have|cannot\s+have|not\s+yours)\b/.test(source)) return false;

    const directedOffer = /\b(?:hand|hands|handed|offer|offers|offered|give|gives|gave|pass|passes|passed|present|presents|presented|extend|extends|extended|slide|slides|slid|push|pushes|pushed|lend|lends|lent|loan|loans|loaned)\b.{0,100}\b(?:you|your|to\s+you|toward\s+you|for\s+you|into\s+your\s+hand|over)\b/.test(source)
        || /\b(?:hold|holds|held|holding)\b.{0,80}\bout\b.{0,60}\b(?:you|to\s+you|toward\s+you|for\s+you|over)\b/.test(source)
        || /\b(?:use|take|borrow)\s+(?:mine|my|this|the)\b/.test(source)
        || /\byou\s+can\s+(?:use|take|borrow|have|hold|keep)\b/.test(source);
    if (!directedOffer) return false;

    const sourceItems = normalizeItemMatchText(source);
    return !acceptedTerms.length || acceptedTerms.some(term => sourceItems.includes(term) || normalizedItemNamesMatch(sourceItems, term));
}

function acceptedOfferTextIsForcefulContest(text) {
    const source = normalizeItemPossessionClaimText(text);
    return /\b(?:snatch|snatches|snatched|steal|steals|stole|stolen|rip|rips|ripped|yank|yanks|yanked|wrench|wrenches|wrenched|seize|seizes|seized|force|forces|forced|shove|shoves|shoved|barge|barges|barged)\b/.test(source)
        || /\b(?:from|out\s+of)\s+(?:his|her|their)\s+(?:grip|grasp|possession|bag|pocket|belt|pouch|sheath|holster)\b/.test(source);
}

function acceptedOfferTextIgnoresRefusal(text) {
    const source = normalizeItemPossessionClaimText(text);
    return /\b(?:despite|ignoring|ignore|after|even\s+though)\b.{0,80}\b(?:refus|said\s+no|told\s+me\s+no|told\s+me\s+stop|pulls?\s+away|withdraws?|stop)\b/.test(source);
}

function getStakeBearingClaimStakesEvidence(semantic, semanticRollNeeded) {
    const claim = normalizeClaimCheckForHandoff(semantic?.claimCheck);
    if (!isStakeBearingUntrustedClaim(claim)) return null;
    if (semanticRollNeeded === 'Y') return null;
    return {
        rollNeeded: 'Y',
        rule: 'hard_override_stake_bearing_claim_roll',
        evidence: {
            hardRule: 'ResolutionEngine.rollNeeded: known-false or unsupported factual claim with material NPC stakes requires a belief contest',
            from: 'N',
            to: 'Y',
            claim: claim.Claim,
            targetNPC: claim.TargetNPC,
            truthStatus: claim.TruthStatus,
            npcAccess: claim.NPCAccess,
            reason: claim.Reason,
        },
    };
}

function getUnavailablePersonalItemNoRollEvidence(itemUse) {
    if (itemUse?.Attempted !== 'Y' || itemUse?.Available !== 'N') return null;
    return {
        rollNeeded: 'N',
        rule: 'deterministic_unavailable_personal_item_no_effect',
        evidence: {
            hardRule: 'Unavailable personal gear/inventory cannot produce item-dependent success, hits, injuries, access, consumption, or effects',
            item: itemUse.Item,
            source: itemUse.Source,
            noEffectReason: itemUse.NoEffectReason,
        },
    };
}

function normalizeRollReason(value, fallback = NONE) {
    const text = String(value ?? '').trim();
    return isReal(text) ? text.slice(0, 500) : fallback;
}

function socialTacticMemoryBucket(socialTactic) {
    if (socialTactic === 'bluff') return 'Bluff';
    if (socialTactic === 'intimidate') return 'Intimidate';
    return null;
}

function getNegativeSocialRepeatNoRollEvidence({ rollNeeded, challengeType, socialTactic, targets, trackerSnapshot }) {
    if (rollNeeded !== 'Y') return null;
    if (challengeType !== 'social') return null;
    const memoryBucket = socialTacticMemoryBucket(socialTactic);
    if (!memoryBucket) return null;
    const blocked = [];
    for (const npc of toRealArray(targets?.OppTargets?.NPC)) {
        const state = normalizeTrackerEntry(trackerSnapshot?.[npc] || {});
        const memory = normalizeSocialResolutionMemory(state.socialResolutionMemory);
        const entry = memory[memoryBucket];
        const currentDisposition = dispositionMemoryKey(state.currentDisposition);
        if (entry?.resolved === 'Y' && entry.disposition === currentDisposition) {
            blocked.push({
                NPC: npc,
                bucket: memoryBucket,
                priorOutcome: entry.outcome,
                disposition: currentDisposition,
            });
        }
    }
    if (!blocked.length) return null;
    const priorOutcome = blocked.every(item => item.priorOutcome === blocked[0].priorOutcome)
        ? blocked[0].priorOutcome
        : 'mixed';
    const reason = memoryBucket === 'Bluff'
        ? priorOutcome === 'success'
            ? 'Bluff was already accepted by the same target under the current disposition; maintain or test that fiction without a new bluff roll.'
            : 'Bluff already failed against the same target under the current disposition; the target remains suspicious and repeated deception does not get a new roll.'
        : priorOutcome === 'success'
            ? 'Intimidation already succeeded against the same target under the current disposition; carry forward fear/compliance without a new intimidation roll.'
            : 'Intimidation already failed against the same target under the current disposition; further threats are aftermath, escalation, pressure, or combat setup rather than a new intimidation roll.';
    return {
        rollNeeded: 'N',
        rule: 'deterministic_negative_social_already_resolved',
        reason,
        evidence: {
            hardRule: 'Resolved Bluff or Intimidate cannot be rerolled against the same NPC while their saved disposition is unchanged; this memory is bucket-specific, so Bluff does not block Intimidate and Intimidate does not block Bluff.',
            from: 'Y',
            to: 'N',
            blocked,
        },
    };
}

function runResolution(ledger, trackerSnapshot, dice, audit, context, refereeContext, playerTrackerSnapshot = null, hiddenHealthSnapshot = null, pendingBoundarySnapshot = {}) {
    const semantic = ledger.resolutionEngine || {};
    const targetClassifier = buildTargetClassifier(ledger, trackerSnapshot, context, hiddenHealthSnapshot);
    const rawTargets = normalizeTargets(semantic.identifyTargets);
    const identityTargets = removeUserReferencesFromTargets(rawTargets, refereeContext);
    const goal = String(semantic.identifyGoal || 'Normal_Interaction');
    const semanticRollNeeded = bool(semantic.rollNeeded) ? 'Y' : 'N';
    let challengeType = normalizeChallengeType(semantic.challengeType, semanticRollNeeded);
    let socialTactic = normalizeSocialTactic(semantic.socialTactic, challengeType);
    let rollReason = normalizeRollReason(semantic.rollReason);
    const itemUseAudit = [];
    const itemUse = normalizeItemUseForHandoff(semantic.itemUse, context, itemUseAudit, playerTrackerSnapshot);
    const lootSearch = normalizeLootSearchForHandoff(semantic.lootSearch);
    const intimacyAdvanceExplicit = bool(semantic.intimacyAdvanceExplicit) ? 'Y' : 'N';
    let restraintControl = normalizeBoundaryObject(semantic.restraintControl);
    let boundaryPressure = normalizeBoundaryObject(semantic.boundaryPressure);
    let boundaryBreak = normalizeBoundaryObject(semantic.boundaryBreak);
    const pendingBoundaryForResolution = normalizePendingBoundaryState(pendingBoundarySnapshot);
    boundaryBreak = validateBoundaryBreakAgainstPending(boundaryBreak, pendingBoundaryForResolution, audit);
    const healingAttempt = classifyHealingAttempt(semantic, goal, context);
    const healingHasActiveStakes = healingAttempt.isHealing && bool(semantic.activeHostileThreat);
    let healingStaticDc = null;

    const rollPool = [dice.d20(), dice.d20(), dice.d20(), dice.d20(), dice.d20(), dice.d20()];
    audit.push('STEP 1: SILENT SEMANTIC PASS COMPLETE');
    audit.push('SEMANTIC_LEDGER=');
    audit.push(stableStringify(ledger));
    if (ledger.deterministicOverrides?.semanticLedgerExtraction) {
        audit.push(`SEMANTIC_LEDGER_EXTRACTION=${compact(ledger.deterministicOverrides.semanticLedgerExtraction)}`);
    }
    if (ledger.deterministicOverrides?.semanticLedgerRepair) {
        audit.push(`SEMANTIC_LEDGER_REPAIR=${compact(ledger.deterministicOverrides.semanticLedgerRepair)}`);
    }
    if (ledger.deterministicOverrides?.userCoreStats) {
        audit.push(`DETERMINISTIC_OVERRIDE.userCoreStats=${compact(ledger.deterministicOverrides.userCoreStats)}`);
    }
    audit.push('---');
    audit.push('STEP 2: EXECUTE ResolutionEngine(input) USING SEMANTIC_LEDGER');
    audit.push(`2.0 roll_pool=[r0=${rollPool[0]},r1=${rollPool[1]},r2=${rollPool[2]},r3=${rollPool[3]},r4=${rollPool[4]},r5=${rollPool[5]}]`);
    audit.push(`2.1 identifyGoal=${goal}`);
    audit.push(`2.1a identifyChallenge=${semantic.identifyChallenge || semantic.explicitMeans || goal}`);
    audit.push(`2.2 identifyTargets.semantic=${formatTargets(rawTargets)}`);
    if (!sameTargets(rawTargets, identityTargets)) {
        audit.push(`2.2a deterministicUserTargetNormalization=${compact({
            hardRule: 'Active persona names and {{user}} aliases are the player, not NPC targets; remove them from living NPC target/observer lists',
            from: targetSummary(rawTargets),
            to: targetSummary(identityTargets),
        })}`);
    }

    audit.push(`2.3 intimacyAdvanceExplicit=${intimacyAdvanceExplicit}`);
    audit.push(`2.3a restraintControl=${compact(restraintControl)}`);
    audit.push(`2.3b boundaryPressure=${compact(boundaryPressure)}`);
    audit.push(`2.3c boundaryBreak=${compact(boundaryBreak)}`);
    audit.push(`2.3b healingAttempt=${healingAttempt.isHealing ? (healingAttempt.isMagic ? 'magic' : 'natural') : 'N'} activeStakes=${healingHasActiveStakes ? 'Y' : 'N'}`);
    const pureLoveDeclarationEvidence = getPureLoveDeclarationNoRollEvidence(semantic, goal, refereeContext);
    const companionCommandNoRollEvidence = getDirectedCompanionCommandNoRollEvidence(semantic, identityTargets, trackerSnapshot, targetClassifier, context);
    const acceptedOfferedObjectEvidence = getAcceptedOfferedObjectNoRollEvidence(semantic, semanticRollNeeded, context);
    const friendlyObjectAccessEvidence = getFriendlyNpcObjectAccessNoRollEvidence(semantic, semanticRollNeeded, context, trackerSnapshot, identityTargets, { challengeType, socialTactic });
    const stakeBearingClaimEvidence = getStakeBearingClaimStakesEvidence(semantic, semanticRollNeeded);
    const stakesOverrideEvidence = companionCommandNoRollEvidence
        || pureLoveDeclarationEvidence
        || getRomanceNoRollOverrideEvidence(semantic, semanticRollNeeded, boundaryBreak.Present, intimacyAdvanceExplicit)
        || acceptedOfferedObjectEvidence
        || friendlyObjectAccessEvidence
        || stakeBearingClaimEvidence;
    let rollNeeded = stakesOverrideEvidence?.rollNeeded || semanticRollNeeded;
    let stakesRule = stakesOverrideEvidence?.rule || 'semantic_final';
    if (stakesOverrideEvidence?.reason) {
        rollReason = normalizeRollReason(stakesOverrideEvidence.reason, rollReason);
    }
    if (stakeBearingClaimEvidence && challengeType === 'none') {
        challengeType = 'social';
        socialTactic = 'bluff';
        rollReason = normalizeRollReason(rollReason, 'stakes-bearing factual claim');
    }
    const unavailableItemEvidence = getUnavailablePersonalItemNoRollEvidence(itemUse);
    if (unavailableItemEvidence) {
        rollNeeded = unavailableItemEvidence.rollNeeded;
        stakesRule = unavailableItemEvidence.rule;
        rollReason = `unavailable personal item: ${itemUse.Item} is not in saved user gear/inventory; the item-dependent action cannot resolve`;
    }
    if (healingAttempt.isHealing && healingHasActiveStakes && rollNeeded !== 'Y') {
        rollNeeded = 'Y';
        stakesRule = 'deterministic_active_healing_roll';
        rollReason = 'healing or treatment under active danger uses the current injury DC';
        challengeType = 'environment';
        socialTactic = 'none';
    } else if (healingAttempt.isHealing && healingHasActiveStakes && rollNeeded === 'Y') {
        stakesRule = 'deterministic_active_healing_roll';
        challengeType = 'environment';
        socialTactic = 'none';
        rollReason = normalizeRollReason(rollReason, 'healing or treatment under active danger uses the current injury DC');
    } else if (healingAttempt.isHealing && !healingHasActiveStakes) {
        rollNeeded = 'N';
        stakesRule = 'deterministic_safe_healing_no_roll';
        rollReason = 'safe-scene healing or treatment resolves automatically';
        audit.push(`2.4f cooperativeAidNoLivingOppositionRepair=${compact({
            hardRule: 'safe-scene cooperative healing/treatment is direct aid and does not make the helped living target opposition',
            targets: showNone(resolveHealingHealthTargets(semantic, { ActionTargets: identityTargets.ActionTargets }, hiddenHealthSnapshot, context).map(target => target.name || '{{user}}')),
        })}`);
    }
    if (rollNeeded === 'N') {
        challengeType = 'none';
        socialTactic = 'none';
    }
    audit.push(`2.4a semanticRollNeeded=${semanticRollNeeded}`);
    audit.push(`2.4a.2 semanticChallengeType=${challengeType}/${socialTactic}`);
    audit.push(`2.4a.2a semanticChallengeTypeEvidence=${semantic.challengeTypeEvidence || NONE}`);
    audit.push(`2.4a.3 semanticRollReason=${rollReason}`);
    audit.push(`2.4b deterministicStakesRule=${stakesRule}`);
    if (stakesOverrideEvidence) {
        audit.push(`2.4c deterministicStakesEvidence=${compact(stakesOverrideEvidence.evidence)}`);
    }
    if (unavailableItemEvidence) {
        audit.push(`2.4c.0 deterministicUnavailableItem=${compact(unavailableItemEvidence.evidence)}`);
    }
    audit.push(`2.4 rollNeeded=${rollNeeded}`);
    audit.push(...itemUseAudit);

    const semanticTargetsForResolution = companionCommandNoRollEvidence
        ? normalizeDirectedCompanionCommandTargets(identityTargets, targetClassifier, semantic, trackerSnapshot, context, audit)
        : identityTargets;
    const sanitizedTargets = sanitizeTargets(semanticTargetsForResolution, targetClassifier, { rollNeeded, goal, boundaryBreak: boundaryBreak.Present });
    const claimTargets = repairStakeBearingClaimTargets(sanitizedTargets, targetClassifier, semantic, { rollNeeded }, audit);
    const directedCompanionTargets = repairDirectedCompanionAttackHostilePool(claimTargets, ledger, trackerSnapshot, semantic, context, audit);
    const stealthRepair = repairStealthTargets(directedCompanionTargets, targetClassifier, semantic, { rollNeeded, challengeType, socialTactic }, audit);
    if (stealthRepair.rollNeeded) {
        rollNeeded = stealthRepair.rollNeeded;
        stakesRule = stealthRepair.rule || stakesRule;
        rollReason = stealthRepair.rollReason || rollReason;
        challengeType = stealthRepair.challengeType || challengeType;
        socialTactic = stealthRepair.socialTactic || socialTactic;
    }
    let targets = repairLivingOppositionTargets(stealthRepair.targets, targetClassifier, { rollNeeded, semantic, goal, boundaryBreak: boundaryBreak.Present, context }, audit);
    const boundaryGate = applyRestraintBoundaryGate({
        semantic,
        restraintControl,
        boundaryPressure,
        boundaryBreak,
        targets,
        rollNeeded,
        challengeType,
        socialTactic,
        rollReason,
        stakesRule,
        trackerSnapshot,
        pendingBoundarySnapshot,
        audit,
    });
    rollNeeded = boundaryGate.rollNeeded;
    challengeType = boundaryGate.challengeType;
    socialTactic = boundaryGate.socialTactic;
    rollReason = boundaryGate.rollReason;
    stakesRule = boundaryGate.stakesRule;
    restraintControl = boundaryGate.restraint;
    boundaryPressure = boundaryGate.boundaryPressure;
    boundaryBreak = boundaryGate.boundaryBreak;
    if (rollNeeded === 'N') {
        targets = sanitizeTargets(targets, targetClassifier, { rollNeeded, goal, boundaryBreak: boundaryBreak.Present });
    }
    const negativeSocialRepeatEvidence = getNegativeSocialRepeatNoRollEvidence({ rollNeeded, challengeType, socialTactic, targets, trackerSnapshot });
    if (negativeSocialRepeatEvidence) {
        rollNeeded = negativeSocialRepeatEvidence.rollNeeded;
        stakesRule = negativeSocialRepeatEvidence.rule;
        rollReason = negativeSocialRepeatEvidence.reason || 'repeated same-bucket negative social attempt already resolved for current disposition';
        challengeType = 'none';
        socialTactic = 'none';
        targets = sanitizeTargets(targets, targetClassifier, { rollNeeded, goal, boundaryBreak: boundaryBreak.Present });
        audit.push(`2.4c.1 deterministicNegativeSocialRepeat=${compact(negativeSocialRepeatEvidence.evidence)}`);
    }
    audit.push(`2.4d identifyTargets.final=${formatTargets(targets)}`);
    if (!sameTargets(rawTargets, targets)) {
        audit.push(`2.4e deterministicTargetSanitizer=${compact({
            reason: rollNeeded === 'N'
                ? 'living targets only; non-living blockers moved to ENV; no-stakes living opposition converted to ActionTargets'
                : 'living targets only; non-living blockers moved to ENV; direct targets removed from observer lists',
            from: targetSummary(rawTargets),
            to: targetSummary(targets),
        })}`);
    }

    const targetNpcInScene = unique([
        ...targets.ActionTargets,
        ...targets.OppTargets.NPC,
        ...targets.BenefitedObservers,
        ...targets.HarmedObservers,
        ...targets.NPCAwareOfUser,
    ].filter(name => isReal(name) && targetClassifier.isLiving(name)));
    const pendingNpcInScene = pendingProactivityResponseNpcNames(trackerSnapshot, context, targetNpcInScene);
    const npcInScene = unique([...targetNpcInScene, ...pendingNpcInScene]);
    audit.push(`2.5 NPCInScene=[${npcInScene.join(',') || NONE}]`);
    if (pendingNpcInScene.length) {
        audit.push(`2.5a pendingProactivityResponseNpc=[${pendingNpcInScene.join(',')}]`);
    }

    let actions = ['a1'];
    let actionUnits = normalizeSemanticActionUnits(semantic.actionUnits, actions, semantic);
    let outcome = {
        OutcomeTier: 'NONE',
        LandedActions: '(none)',
        Outcome: 'no_roll',
        CounterPotential: 'none',
    };
    let resultLine = 'No roll';
    let combatActionSequence = false;
    let userImpairment = noUserImpairment();
    let npcImpairment = noNpcImpairment();
    let userAttackDie = null;
    let primaryOppTarget = null;
    let resolvedOppStat = 'ENV';
    let resolvedUserStat = null;
    let environmentDifficulty = 0;
    let targetCore = null;
    let equipmentDefense = noEquipmentDefense('no qualifying mundane physical defender roll');
    const generatedNpcStats = [];

    if (rollNeeded === 'N') {
        userImpairment = evaluateUserImpairment(ledger, context, semantic, goal, null, rollNeeded);
        if (healingAttempt.isHealing && !healingHasActiveStakes) {
            outcome = { OutcomeTier: 'Critical_Success', LandedActions: 1, Outcome: 'success', CounterPotential: 'none' };
            resultLine = 'Safe-scene healing or treatment succeeds automatically at the highest tier.';
        }
        audit.push('2.6 rollNeeded=N');
        audit.push('2.6a actions=[a1]');
        audit.push(`2.6a.0 actionUnits=[${formatActionUnitsAudit(actionUnits)}]`);
        audit.push(`2.6a.1 UserImpairmentEngine=${compact(userImpairment)}`);
        audit.push(`2.6a.2 NPCImpairmentEngine=${compact(npcImpairment)}`);
        audit.push(`2.6b resolveOutcome=${compact(outcome)}`);
    } else {
        actions = deriveResolutionActionMarkers(semantic, challengeType);
        actionUnits = normalizeSemanticActionUnits(semantic.actionUnits, actions, semantic);
        let { userStat, oppStat } = deterministicStatsForChallenge(challengeType, socialTactic);
        const stealthOpposition = challengeType === 'stealth' && firstReal(targets.OppTargets.NPC);
        if (healingAttempt.isHealing) {
            userStat = 'MND';
            oppStat = 'ENV';
            healingStaticDc = healingDcForTargets(hiddenHealthSnapshot, resolveHealingHealthTargets(semantic, { ActionTargets: targets.ActionTargets }, hiddenHealthSnapshot, context));
        }
        const userCore = getUserCoreStats(ledger);
        let oppTargetsNpcFirst = firstReal(targets.OppTargets.NPC);
        if (oppStat !== 'ENV' && !oppTargetsNpcFirst) {
            const livingActionTarget = firstReal(toRealArray(targets.ActionTargets).filter(name => targetClassifier.isLiving(name)));
            if (livingActionTarget && !isDirectedCompanionCommandAction(semantic, goal, targets, context)) {
                targets.OppTargets.NPC = unique([...toRealArray(targets.OppTargets.NPC), livingActionTarget]);
                audit.push(`2.7c.3 deterministicLivingOppTargetFallback=${compact({
                    hardRule: 'stakes-bearing living ActionTarget supplies opposing NPC when semantic omitted OppTargets.NPC',
                    target: livingActionTarget,
                })}`);
            } else if (livingActionTarget) {
                oppStat = 'ENV';
                audit.push(`2.7c.3 directedCompanionCommandNoLivingOppTargetFallback=${compact({
                    hardRule: 'a directed ally command does not make the commanded ally the opposing NPC',
                    target: livingActionTarget,
                })}`);
            } else {
                oppStat = 'ENV';
            }
        }
        oppTargetsNpcFirst = firstReal(targets.OppTargets.NPC);
        resolvedOppStat = oppStat;
        resolvedUserStat = userStat;
        const envDifficultySource = environmentDifficultySource(semantic);
        environmentDifficulty = oppStat === 'ENV' && challengeType === 'environment'
            ? normalizeEnvironmentDifficultyForRoll(envDifficultySource)
            : 0;
        const currentTargetCore = oppTargetsNpcFirst ? trackerSnapshot[oppTargetsNpcFirst]?.currentCoreStats : null;

        audit.push('2.7 rollNeeded=Y');
        audit.push(`2.7a actions=[${actions.join(',')}]`);
        audit.push(`2.7a.1 actionUnits=[${formatActionUnitsAudit(actionUnits)}]`);
        audit.push(`2.7b actions=[${actions.join(',')}]`);
        audit.push(`2.7c challengeStats={USER:${userStat},OPP:${oppStat},challengeType:${challengeType},socialTactic:${socialTactic}}`);
        if (stealthOpposition) audit.push('2.7c.0 stealthStats=PHY vs MND');
        if (oppStat === 'ENV') audit.push(`2.7c.1 environmentDifficulty=${environmentDifficulty} (${envDifficultySource ?? 'none'})`);
        audit.push(`2.7d getUserCoreStats=${compact(userCore)}`);
        audit.push('2.7e targetCore=(none)');

        if (oppStat !== 'ENV') {
            audit.push('2.7f challengeStats.OPP!=ENV');
            audit.push(`2.7g OppTargets.NPC[0]=${oppTargetsNpcFirst || NONE}`);
            if (currentTargetCore) {
                targetCore = normalizeCore(currentTargetCore, { PHY: 1, MND: 1, CHA: 1 });
                audit.push(`2.7h getCurrentCoreStats(${oppTargetsNpcFirst})=${compact(targetCore)}`);
                audit.push(`2.7n targetCore=${compact(targetCore)}`);
            } else {
                const generatedCoreSource = chooseGeneratedCore(ledger, semantic, oppTargetsNpcFirst, dice, { context });
                targetCore = normalizeCore(generatedCoreSource.core, { PHY: 1, MND: 1, CHA: 1 });
                generatedNpcStats.push(generatedCoreAuditEntry(oppTargetsNpcFirst, generatedCoreSource));
                audit.push(`2.7h getCurrentCoreStats(${oppTargetsNpcFirst || NONE})=missing`);
                audit.push('2.7i missing -> deterministicCapabilityPoolRank(genStats seed) -> deterministicAssignStats');
                audit.push(`2.7i.1 genStats source=${generatedCoreSource.source}`);
                audit.push(`2.7j genStats.CapabilityPool=${generatedCoreSource.seed?.CapabilityPool || 'common'}`);
                audit.push(`2.7j.1 genStats.Percentile=${generatedCoreSource.percentile}`);
                audit.push(`2.7j.2 genStats.FinalRank=${generatedCoreSource.core?.Rank || 'none'}`);
                audit.push(`2.7k genStats.MainStat=${generatedCoreSource.seed?.MainStat || generatedCoreSource.core?.MainStat || 'none'}`);
                audit.push(`2.7l genStats=${compact(targetCore)}`);
                audit.push(`2.7m targetCore=${compact(targetCore)}`);
            }
        }

        const woundPenaltyApplies = woundPenaltyAppliesToResolution(challengeType, oppStat) || stealthOpposition;
        userImpairment = evaluateUserImpairment(ledger, context, semantic, goal, userStat, rollNeeded, { allowRollPenalty: woundPenaltyApplies });
        const impairmentPenalty = Number(userImpairment?.AppliedToRoll === 'Y' ? userImpairment.RollPenalty : 0);
        npcImpairment = oppStat !== 'ENV' && oppTargetsNpcFirst
            ? evaluateNpcImpairment(oppTargetsNpcFirst, ledger, trackerSnapshot, semantic, goal, oppStat, rollNeeded, { allowRollPenalty: isCombatChallengeType(challengeType) || stealthOpposition })
            : noNpcImpairment('no opposing NPC roll');
        const npcImpairmentPenalty = Number(npcImpairment?.AppliedToRoll === 'Y' ? npcImpairment.RollPenalty : 0);
        equipmentDefense = challengeType === 'mundane_combat' && oppStat === 'PHY' && oppTargetsNpcFirst
            ? resolveNpcEquipmentDefense(oppTargetsNpcFirst, null, trackerSnapshot, targetCore)
            : noEquipmentDefense('equipment defense applies only to a living defender in mundane physical combat');
        const equipmentDefenseBonus = appliedEquipmentDefenseBonus(equipmentDefense);
        const atkDie = rollPool[0];
        userAttackDie = atkDie;
        const defDie = healingStaticDc ? null : rollPool[1];
        const userStatValue = statValue(userCore, userStat);
        const atkTot = atkDie + userStatValue + impairmentPenalty;
        const defTot = healingStaticDc
            ? healingStaticDc
            : oppStat === 'ENV' ? defDie + environmentDifficulty : defDie + statValue(targetCore, oppStat) + npcImpairmentPenalty + equipmentDefenseBonus;
        const margin = atkTot - defTot;
        combatActionSequence = isCombatChallengeType(challengeType);

        if (combatActionSequence) {
            const actionLimit = Math.max(1, actions.length || 0);
            outcome = combatOutcome(margin, actionLimit);
        } else {
            outcome = nonHostileOutcome(margin);
        }
        if (userImpairment?.AutoFail === 'Y') {
            outcome = { OutcomeTier: 'Failure', LandedActions: 0, Outcome: 'failure', CounterPotential: 'none' };
        }

        audit.push(`2.7n.1 UserImpairmentEngine=${compact(userImpairment)}`);
        audit.push(`2.7n.2 NPCImpairmentEngine=${compact(npcImpairment)}`);
        audit.push(`2.7n.3 EquipmentDefenseEngine=${compact(equipmentDefense)}`);
        audit.push(`2.7o resolveOutcome=atkDie:${atkDie}, atkTot:${atkTot}, ${healingStaticDc ? `healingDC:${healingStaticDc}` : `defDie:${defDie}`}, defTot:${defTot}, margin:${margin}, classifyCombatActionSequence:${combatActionSequence ? 'Y' : 'N'} -> ${compact(outcome)}`);
        const impairmentText = impairmentPenalty ? ` + impairment(${impairmentPenalty})` : '';
        const npcImpairmentText = npcImpairmentPenalty ? ` + impairment(${npcImpairmentPenalty})` : '';
        const equipmentDefenseText = equipmentDefenseBonus ? ` + equipment(${equipmentDefense.Tier}:${equipmentDefenseBonus})` : '';
        const oppStatText = healingStaticDc
            ? `healingDC(${healingStaticDc})`
            : oppStat === 'ENV' ? `1d20(${defDie}) + ENV(${environmentDifficulty})` : `1d20(${defDie}) + ${oppStat}(${statValue(targetCore, oppStat)})${npcImpairmentText}${equipmentDefenseText}`;
        resultLine = userImpairment?.AutoFail === 'Y'
            ? `Automatic failure: ${userImpairment.Reason}`
            : `1d20(${atkDie}) + ${userStat}(${userStatValue})${impairmentText} = ${atkTot} vs ${oppStatText} = ${defTot} (${margin} - ${outcome.OutcomeTier})`;
        primaryOppTarget = oppStat !== 'ENV' ? oppTargetsNpcFirst : null;
    }

    const harmMode = normalizeResolutionHarmMode(semantic.harmMode, {
        ...semantic,
        challengeType,
        rollNeeded,
    });
    audit.push(`2.7o.1 harmMode=${harmMode} gate=downstream_damage_only`);

    const inflictedInjuries = deriveInflictedNpcInjuries({
        semantic,
        injuryEffectEngine: ledger.injuryEffectEngine,
        targets,
        outcome,
        rollNeeded,
        combatActionSequence,
        challengeType,
        userAttackDie,
        harmMode,
        primaryTarget: primaryOppTarget,
        primaryTargetCore: targetCore,
        trackerSnapshot,
        hiddenHealthSnapshot,
        audit,
    });

    const packet = {
        GOAL: goal,
        UserAbilityUse: normalizeUserAbilityUseForHandoff(semantic.userAbilityUse),
        ItemUse: itemUse,
        LootSearch: lootSearch,
        ClaimCheck: normalizeClaimCheckForHandoff(semantic.claimCheck),
        actions,
        actionUnits,
        intimacyAdvanceExplicit,
        restraintControl,
        boundaryPressure,
        boundaryBreak,
        BoundaryGate: boundaryGate.gate,
        harmMode,
        RollNeeded: rollNeeded,
        RollReason: rollReason,
        challengeType,
        challengeTypeEvidence: semantic.challengeTypeEvidence || NONE,
        socialTactic,
        ResolvedStats: {
            USER: resolvedUserStat || 'none',
            OPP: resolvedOppStat || 'none',
        },
        LandedActions: outcome.LandedActions,
        OutcomeTier: outcome.OutcomeTier,
        Outcome: outcome.Outcome,
        CounterPotential: outcome.CounterPotential,
        classifyCombatActionSequence: combatActionSequence ? 'Y' : 'N',
        activeHostileThreat: bool(semantic.activeHostileThreat) ? 'Y' : 'N',
        SafeAutomaticHealing: healingAttempt.isHealing && !healingHasActiveStakes ? 'Y' : 'N',
        CompanionCommand: companionCommandNoRollEvidence
            ? {
                Mode: 'REQUEST_ONLY',
                NPCs: companionCommandNoRollEvidence.companions,
                Commands: companionCommandNoRollEvidence.commands,
            }
            : null,
        hostilesInScene: { NPC: showNone(targets.hostilesInScene?.NPC) },
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: { NPC: showNone(targets.OppTargets.NPC), ENV: showNone(targets.OppTargets.ENV) },
        EnvironmentDifficultyTier: resolvedOppStat === 'ENV' ? (semantic.environmentDifficultyTier || 'none') : 'none',
        EnvironmentDifficulty: resolvedOppStat === 'ENV' ? environmentDifficulty : 0,
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
        NPCAwareOfUser: showNone(targets.NPCAwareOfUser),
        PowerActors: showNone(targets.PowerActors),
        NPCInScene: showNone(npcInScene),
        UserImpairment: userImpairment,
        NPCImpairment: npcImpairment,
        EquipmentDefense: equipmentDefense,
        InflictedInjuries: inflictedInjuries,
    };

    audit.push(`2.7q InflictedNpcInjuryEngine=${compact(inflictedInjuries)}`);
    audit.push(`2.7r UserAbilityUse=${compact(packet.UserAbilityUse)}`);
    audit.push(`2.7s ItemUse=${compact(packet.ItemUse)}`);
    audit.push(`2.7s.2 LootSearch=${compact(packet.LootSearch)}`);
    audit.push(`2.7t ClaimCheck=${compact(packet.ClaimCheck)}`);
    audit.push(`2.8 HANDOFF=${compact(packet)}`);
    audit.push('---');

    return { packet, resultLine, generatedNpcStats };
}

function runRelationships(ledger, trackerSnapshot, resolutionPacket, audit, refereeContext, context, rapportClock = normalizeRapportClock(), dice = null) {
    const resolutionSemantic = ledger.resolutionEngine || {};
    const semanticMap = new Map((ledger.relationshipEngine || []).filter(x => x?.NPC).map(x => [x.NPC, x]));
    const npcList = unique(toRealArray(resolutionPacket.NPCInScene));
    const handoffs = [];
    const trackerUpdate = {};
    const generatedNpcStats = [];
    const pendingOfferNpcs = npcList.filter(npc => isRomanceMemoryTag(normalizeTrackerEntry(trackerSnapshot[npc] || {}).proactivityMemory.pendingTag));
    const userReputation = buildUserReputationSnapshot(context);
    const currentWorldState = buildWorldStateSnapshot(context);
    const currentReputationLocation = normalizeReputationLocation(ledger?.engineContext?.userReputationContext?.location)
        || normalizeReputationLocation(currentWorldState.reputationLocation)
        || normalizeReputationLocation(currentWorldState.place);

    audit.push('STEP 3: EXECUTE RelationshipEngine(npc, resolutionPacket) USING SEMANTIC_LEDGER');
    audit.push(`3.1 NPC_LIST=[${npcList.join(',') || NONE}]`);

    for (const npc of npcList) {
        const sem = semanticMap.get(npc) || { NPC: npc, stakeChangeByOutcome: {}, overrideFlags: {} };
        const relevant = toRealArray(resolutionPacket.NPCInScene).some(name => sameName(name, npc)) ? 'Y' : 'N';
        audit.push(`3.2 ${npc}.relevant=${relevant}`);

        if (relevant === 'N') {
            const handoff = {
                NPC: npc,
                FinalState: 'UNINITIALIZED',
                Lock: 'None',
                Behavior: 'None',
                Target: 'No Change',
                NPC_STAKES: 'N',
                Override: 'NONE',
                EstablishedRelationship: 'N',
                IntimacyBoundary: 'SKIP',
                IntimacyBoundarySource: 'NONE',
                IntimacyRefusalStyle: 'NONE',
                Landed: landedBool(resolutionPacket.LandedActions) ? 'Y' : 'N',
                OutcomeTier: resolutionPacket.OutcomeTier || 'NONE',
                NarrationBand: resolutionPacket.Outcome || 'standard',
            };
            handoffs.push(handoff);
            audit.push(`3.2a NPC_HANDOFF=${compact(handoff)}`);
            continue;
        }

        const rawState = trackerSnapshot[npc] || {};
        const firstTrackedEncounter = !rawState.currentDisposition;
        const state = normalizeTrackerEntry(rawState);
        if (!cleanPersonalitySummary(state.personalitySummary) && !isActiveCardCharacterName(npc, context)) {
            state.personalitySummary = deterministicPersonalitySummaryForName(npc, 'deterministic-runner');
        }
        const globalActiveMs = Math.max(0, Math.floor(Number(rapportClock?.activeMs || 0)));
        let lastRapportGainActiveMs = state.lastRapportGainActiveMs;
        const rapportElapsedActiveMs = lastRapportGainActiveMs >= 0 ? Math.max(0, globalActiveMs - lastRapportGainActiveMs) : 0;
        const rapportEligible = firstTrackedEncounter || lastRapportGainActiveMs < 0 || rapportElapsedActiveMs >= RAPPORT_COOLDOWN_MS;
        let currentDisposition = state.currentDisposition;
        let currentRapport = state.currentRapport;
        let hostilePressure = state.hostilePressure;
        let hostileLandedPressure = state.hostileLandedPressure;
        let dominantLock = state.dominantLock;
        let pressureMode = state.pressureMode;
        let slowBondEvidence = state.slowBondEvidence;
        let proactivityMemory = beginProactivityMemoryTurn(state.proactivityMemory);
        let intimacyState = state.intimacyState;
        let socialResolutionMemory = state.socialResolutionMemory;
        let initMetadata = null;

        audit.push(`3.3 getCurrentRelationalState=${compact(state)}`);
        audit.push(`3.3a rapportTimer=${compact({
            globalActiveMs,
            lastRapportGainActiveMs,
            elapsedSinceLastGainMs: rapportElapsedActiveMs,
            cooldownMs: RAPPORT_COOLDOWN_MS,
        })}`);
        audit.push(`3.3b firstTrackedEncounter=${yn(firstTrackedEncounter)}`);
        audit.push(`3.3c rapportEligible=${yn(rapportEligible)}`);

        if (!currentDisposition) {
            const init = resolveDeterministicInitPreset(npc, state, sem, audit, `3.3 ${npc}.initPreset`, {
                userReputation,
                currentReputationLocation,
            });
            initMetadata = init;
            currentDisposition = init.disposition;
            audit.push(`3.3d initPreset.userHistory=${compact(init.userHistory)}`);
            audit.push(`3.3e initPreset.flags=${compact(init.flags)}`);
            audit.push(`3.3f initPreset.fearImmunity=${init.flags.fearImmunity ? 'Y' : 'N'}`);
            audit.push(`3.3i initPreset=${init.label}`);
            audit.push(`3.3j currentDisposition=${formatDisposition(currentDisposition)}`);
        } else {
            audit.push(`3.3d currentDisposition=${formatDisposition(currentDisposition)}`);
        }

        audit.push(`3.3k currentRapport=${currentRapport}`);

        const outcomeKey = String(resolutionPacket.Outcome || 'no_roll');
        const relationshipContext = {
            ...sem,
            identifyGoal: resolutionSemantic.identifyGoal,
            identifyChallenge: resolutionSemantic.identifyChallenge,
            explicitMeans: resolutionSemantic.explicitMeans,
        };
        const stakeReferee = resolveStakeChangeByOutcome(npc, relationshipContext, resolutionPacket);
        const benefitReferee = applyMeaningfulBenefitReferee(npc, resolutionPacket, stakeReferee.value, relationshipContext);
        const stakeChange = benefitReferee.value;
        const resolvedForRelationship = resolutionPacket.RollNeeded === 'Y'
            || (resolutionPacket.SafeAutomaticHealing === 'Y' && stakeChange === 'benefit');
        const npcStakes = resolvedForRelationship && ['benefit', 'harm'].includes(stakeChange) ? 'Y' : 'N';
        const auditInteraction = npcStakes === 'Y' && stakeChange === 'benefit' ? 'Y' : 'N';
        const routedTarget = routeDispositionTarget(npc, resolutionPacket, auditInteraction, relationshipContext);
        const relation = relationToUserAction(npc, resolutionPacket);
        const slowBondBlockersNow = toRealArray(relationshipContext.slowBondEvidence?.blockers);
        const boundaryPressureResult = applyPhysicalBoundaryPressure(npc, resolutionPacket, {
            currentDisposition,
        });
        const hostilePressureResult = applyHostilePhysicalPressure(npc, resolutionPacket, {
            currentDisposition,
            hostilePressure,
            hostileLandedPressure,
            dominantLock,
            pressureMode,
        });
        const target = hostilePressureResult?.target || boundaryPressureResult?.target || routedTarget;
        const rapport = updateRapport(currentRapport, target, rapportEligible, hostilePressureResult ? 'hostilePressure' : 'normal');
        const rapportConsumedCooldown = rapportEligible && consumesRapportCooldown(target, hostilePressureResult ? 'hostilePressure' : 'normal');
        currentRapport = rapport.currentRapport;
        if (rapportConsumedCooldown) {
            lastRapportGainActiveMs = globalActiveMs;
        }
        hostilePressure = hostilePressureResult?.hostilePressure ?? hostilePressure;
        hostileLandedPressure = hostilePressureResult?.hostileLandedPressure ?? hostileLandedPressure;
        dominantLock = hostilePressureResult?.dominantLock ?? dominantLock;
        pressureMode = hostilePressureResult?.pressureMode ?? pressureMode;

        audit.push(`3.4a auditInteraction=stakeChangeByOutcome[${outcomeKey}]=${stakeChange} -> ${auditInteraction}`);
        if (stakeReferee.referee) {
            audit.push(`3.4a.1 deterministicStakeChangeReferee=${compact(stakeReferee.referee)}`);
        }
        if (benefitReferee.referee) {
            audit.push(`3.4a.2 deterministicBenefitReferee=${compact(benefitReferee.referee)}`);
        }
        audit.push(`3.4b NPC_STAKES=${npcStakes}`);
        audit.push(`3.4c routeDispositionTarget=${routedTarget}`);
        if (boundaryPressureResult) {
            audit.push(`3.4c.0 physicalBoundaryPressure=${compact({
                target,
                deltas: boundaryPressureResult.deltas,
            })}`);
        }
        if (hostilePressureResult) {
            audit.push(`3.4c.1 harmfulAttackPressure=${compact({
                target,
                hostilePressure,
                hostileLandedPressure,
                dominantLock,
                pressureMode,
                deltas: hostilePressureResult.deltas,
            })}`);
        }
        audit.push(`3.4d updateRapport=${compact(rapport)}`);
        audit.push(`3.4e rapportCooldown=${compact({
            consumed: yn(rapportConsumedCooldown),
            cooldownMinutes: RAPPORT_COOLDOWN_MS / 60000,
            lastRapportGainActiveMs,
            globalActiveMs,
        })}`);

        const suppressFreshNonHumanNoChangeBond = firstTrackedEncounter
            && ['userNonHuman', 'userNonHumanFame5'].includes(initMetadata?.label || '')
            && target === 'No Change';
        if (suppressFreshNonHumanNoChangeBond) {
            audit.push(`3.4f suppressFreshNonHumanNoChangeBond=${initMetadata.label}`);
        }

        const deltas = hostilePressureResult?.deltas || boundaryPressureResult?.deltas || deriveDirection(target, currentDisposition, currentRapport, auditInteraction, resolutionPacket, {
            allowNoChangeEarlyBond: target === 'No Change'
                && (relation.isDirect || relation.isBenefited)
                && !relation.isOpp
                && !relation.isHarmed
                && !bool(relationshipContext.explicitIntimidationOrCoercion)
                && slowBondBlockersNow.length === 0
                && !suppressFreshNonHumanNoChangeBond,
        });
        const updatedDisposition = updateDisposition(currentDisposition, deltas);
        currentDisposition = updatedDisposition;
        if (hostilePressureResult?.dominatedFearBreak && currentDisposition.F >= 4 && currentDisposition.H >= 3) {
            currentDisposition = { ...currentDisposition, H: clamp(currentDisposition.H - 1, 1, 4) };
            audit.push(`3.5a.1 dominatedFearBreak lowers hostility -> ${formatDisposition(currentDisposition)}`);
        }
        currentRapport = deltas.rapportReset === 'Y' ? 0 : currentRapport;

        audit.push(`3.5 deriveDirection=${compact(deltas)}`);
        audit.push(`3.5a updateDisposition=${formatDisposition(updatedDisposition)}`);
        audit.push(`3.5e save currentRapport=${currentRapport} to sceneTracker`);

        const sceneKey = buildSlowBondSceneKey(resolutionPacket, npc);
        const slowBondMerge = mergeSlowBondEvidence(slowBondEvidence, sem.slowBondEvidence || {}, sceneKey);
        slowBondEvidence = slowBondMerge.evidence;
        const slowBondEligible = isSlowBondEligible(currentDisposition, currentRapport, slowBondEvidence) ? 'Y' : 'N';
        if (slowBondEligible === 'Y') {
            currentDisposition = { ...currentDisposition, B: 4 };
        }
        audit.push(`3.5g slowBondEvidence=${compact(slowBondEvidence)}`);
        audit.push(`3.5h slowBondEvidenceChanged=${compact(slowBondMerge.changed)}`);
        audit.push(`3.5i slowBondEligible=${slowBondEligible}`);
        if (slowBondEligible === 'Y') {
            audit.push(`3.5j slowBondPromotion=B4`);
        }
        proactivityMemory = resetRomanceMemoryOnB4Reentry(proactivityMemory, state.currentDisposition, currentDisposition);
        const memoryOutcome = resolveProactivityMemoryPending(proactivityMemory, context, {
            npc,
            allowGenericResponse: pendingOfferNpcs.length <= 1,
        });
        proactivityMemory = memoryOutcome.memory;
        if (memoryOutcome.result !== 'NONE') {
            audit.push(`3.5k proactivityMemoryPending=${compact(memoryOutcome)}`);
            if (shouldRegressB4Courtship(memoryOutcome) && currentDisposition.B >= 4) {
                currentDisposition = { ...currentDisposition, B: 3 };
                currentRapport = 0;
                proactivityMemory = {
                    ...normalizeProactivityMemory(proactivityMemory),
                    romanceBlocked: 'Y',
                    b4Courtship: {
                        ...normalizeProactivityMemory(proactivityMemory).b4Courtship,
                        blocked: 'Y',
                    },
                };
                audit.push(`3.5l B4 courtship blocked/refused -> Bond lowered to ${formatDisposition(currentDisposition)}`);
            }
        }

        const classified = classifyDisposition(currentDisposition);
        const threshold = checkThreshold(currentDisposition, sem.overrideFlags || {});
        const establishedRelationship = resolveEstablishedRelationshipState(
            state,
            currentDisposition,
            sem,
            npc,
            context,
            refereeContext,
            audit,
            `3.6a.1 establishedRelationship(${npc})`,
            resolutionPacket.ActionTargets,
        );

        audit.push(`3.6 classifyDisposition=${compact(classified)}`);
        audit.push(`3.6a checkThreshold=${compact(threshold)}`);
        audit.push(`3.6a.1 establishedRelationship=${establishedRelationship}`);
        const intimacyBoundary = resolveIntimacyBoundary({
            npc,
            currentDisposition,
            threshold,
            establishedRelationship,
            resolutionPacket,
            context,
            refereeContext,
            state,
            previousIntimacyState: intimacyState,
        });
        intimacyState = nextIntimacyState(intimacyBoundary, intimacyState);
        audit.push(`3.6b intimacyBoundary=${compact(intimacyBoundary)}`);
        audit.push(`3.6c intimacyState=${compact(intimacyState)}`);
        const socialMemoryUpdate = recordNegativeSocialResolutionMemory(socialResolutionMemory, npc, resolutionPacket, currentDisposition);
        socialResolutionMemory = socialMemoryUpdate.memory;
        if (socialMemoryUpdate.changed === 'Y') {
            audit.push(`3.6d socialResolutionMemory=${compact(socialMemoryUpdate.entry)}`);
        }

        const handoff = {
            NPC: npc,
            FinalState: `B${currentDisposition.B}/F${currentDisposition.F}/H${currentDisposition.H}`,
            InitPreset: initMetadata?.label || 'existing',
            Lock: classified.lock,
            Behavior: classified.behavior,
            Target: target,
            NPC_STAKES: npcStakes,
            Override: threshold.Override,
            EstablishedRelationship: establishedRelationship,
            IntimacyBoundary: intimacyBoundary.boundary,
            IntimacyBoundarySource: intimacyBoundary.source,
            IntimacyRefusalStyle: intimacyBoundary.refusalStyle,
            SlowBondEligible: slowBondEligible,
            SlowBondEvidenceCount: slowBondEvidenceCount(slowBondEvidence),
            PersonalitySummary: state.personalitySummary || 'none',
            Landed: landedBool(resolutionPacket.LandedActions) ? 'Y' : 'N',
            OutcomeTier: resolutionPacket.OutcomeTier || 'NONE',
            NarrationBand: resolutionPacket.Outcome || 'standard',
            RomanceStyle: normalizeRomanceStyle(sem.romanceStyle),
            HostilePressure: hostilePressure,
            HostileLandedPressure: hostileLandedPressure,
            BoundaryPressure: boundaryPressureResult ? 'Y' : 'N',
            DominantLock: dominantLock,
            PressureMode: pressureMode,
            Condition: state.condition || 'healthy',
            Wounds: state.wounds || [],
            StatusEffects: state.statusEffects || [],
            RelationToUserAction: relation,
            ProactivityMemory: proactivityMemory,
        };
        handoffs.push(handoff);

        const generatedCoreSource = state.currentCoreStats
            ? null
            : chooseGeneratedCore(ledger, resolutionSemantic, npc, dice, { preferRelationshipSeed: true, relationshipOnly: true, context });
        const coreStats = state.currentCoreStats || generatedCoreSource?.core || null;
        if (!state.currentCoreStats && generatedCoreSource) {
            generatedNpcStats.push(generatedCoreAuditEntry(npc, generatedCoreSource));
            audit.push(`3.7a currentCoreStats assigned for ${npc} from ${generatedCoreSource.source}: seed=${compact(generatedCoreSource.seed)} core=${compact(coreStats)}`);
        }
        trackerUpdate[npc] = {
            ...state,
            currentDisposition,
            currentRapport,
            lastRapportGainActiveMs,
            establishedRelationship,
            intimacyState,
            userHistory: initMetadata?.userHistory || state.userHistory,
            raceProfile: initMetadata?.raceProfile || state.raceProfile,
            socialResolutionMemory,
            slowBondEvidence,
            currentCoreStats: coreStats,
            hostilePressure,
            hostileLandedPressure,
            dominantLock,
            pressureMode,
            proactivityMemory,
        };

        audit.push(`3.7 NPC_HANDOFF=${compact(handoff)}`);
    }

    audit.push('---');
    return { handoffs, trackerUpdate, generatedNpcStats };
}

function buildSlowBondSceneKey(resolutionPacket, npc) {
    return [
        String(resolutionPacket.GOAL || 'none'),
        String(resolutionPacket.Outcome || 'none'),
        String(resolutionPacket.OutcomeTier || 'none'),
        String(resolutionPacket.LandedActions || 'none'),
        String(npc || 'none'),
        toRealArray(resolutionPacket.ActionTargets).join('|'),
        toRealArray(resolutionPacket.BenefitedObservers).join('|'),
        toRealArray(resolutionPacket.HarmedObservers).join('|'),
    ].join('::').slice(0, 120);
}

function recordNegativeSocialResolutionMemory(memory, npc, resolutionPacket, currentDisposition) {
    const normalized = normalizeSocialResolutionMemory(memory);
    const bucket = socialTacticMemoryBucket(resolutionPacket?.socialTactic);
    if (resolutionPacket?.RollNeeded !== 'Y' || resolutionPacket?.challengeType !== 'social' || !bucket) {
        return { memory: normalized, changed: 'N', entry: null };
    }
    const isTarget = toRealArray(resolutionPacket?.OppTargets?.NPC).some(name => sameName(name, npc));
    if (!isTarget) return { memory: normalized, changed: 'N', entry: null };
    const outcomeText = String(resolutionPacket?.Outcome || '').toLowerCase();
    const tierText = String(resolutionPacket?.OutcomeTier || '').toLowerCase();
    const outcome = outcomeText.includes('success') || tierText.includes('success') ? 'success' : 'failure';
    const entry = {
        resolved: 'Y',
        outcome,
        disposition: dispositionMemoryKey(currentDisposition),
        goal: String(resolutionPacket?.GOAL || '').slice(0, 80),
    };
    return {
        memory: {
            ...normalized,
            [bucket]: entry,
        },
        changed: 'Y',
        entry: { bucket, ...entry },
    };
}

const ROMANCE_MEMORY_TAGS = Object.freeze(['Thoughtful_Gift', 'Ask_Date', 'Date_And_Confess']);

function pendingProactivityResponseNpcNames(trackerSnapshot, context, alreadyInScene = []) {
    const userText = getLatestUserTextFromContext(context);
    const pending = Object.entries(trackerSnapshot || {})
        .map(([npc, value]) => ({
            npc,
            memory: normalizeTrackerEntry(value || {}).proactivityMemory,
        }))
        .filter(item => isReal(item.npc))
        .filter(item => !toRealArray(alreadyInScene).some(name => sameName(name, item.npc)))
        .filter(item => isRomanceMemoryTag(item.memory.pendingTag))
        .filter(item => ['ACCEPTED', 'REFUSED'].includes(classifyProactivityOfferResponse(item.memory.pendingTag, userText)));
    if (pending.length !== 1) return [];
    return [pending[0].npc];
}

function beginProactivityMemoryTurn(memory) {
    const normalized = normalizeProactivityMemory(memory);
    return {
        ...normalized,
        interchangeCount: clamp(normalized.interchangeCount + 1, 0, 1000000),
    };
}

function resetRomanceMemoryOnB4Reentry(memory, previousDisposition, currentDisposition) {
    const normalized = normalizeProactivityMemory(memory);
    const previousB = Number(previousDisposition?.B || 0);
    const currentB = Number(currentDisposition?.B || 0);
    if (previousB >= 4 || currentB < 4) return normalized;
    return {
        ...normalized,
        romanceCycle: clamp(normalized.romanceCycle + 1, 0, 1000000),
        romanceBlocked: 'N',
        pendingTag: 'NONE',
        pendingSince: 0,
        acceptedTags: [],
        refusedTags: [],
        b4Courtship: {
            askDateAttempts: 0,
            askDateAccepted: 0,
            askDateRefused: 0,
            askDateCooldownUntilActiveMs: 0,
            thoughtfulGiftAttempts: 0,
            thoughtfulGiftAccepted: 'N',
            thoughtfulGiftRefused: 'N',
            dateAndConfessRefused: 'N',
            blocked: 'N',
        },
    };
}

function resolveProactivityMemoryPending(memory, context, options = {}) {
    const normalized = normalizeProactivityMemory(memory);
    const pendingTag = normalized.pendingTag;
    if (!isRomanceMemoryTag(pendingTag)) {
        return { result: 'NONE', tag: 'NONE', memory: normalized };
    }

    const userText = getLatestUserTextFromContext(context);
    if (!proactivityOfferResponseTargetsNpc(options.npc, userText, options.allowGenericResponse)) {
        return { result: 'NONE', tag: pendingTag, memory: normalized };
    }

    const verdict = classifyProactivityOfferResponse(pendingTag, userText);
    if (verdict === 'ACCEPTED') {
        return {
            result: 'ACCEPTED',
            tag: pendingTag,
            memory: {
                ...normalized,
                pendingTag: 'NONE',
                pendingSince: 0,
                acceptedTags: addMemoryTag(normalized.acceptedTags, pendingTag),
                b4Courtship: updateB4CourtshipOnAcceptance(normalized.b4Courtship, pendingTag),
            },
        };
    }
    if (verdict === 'REFUSED') {
        return {
            result: 'REFUSED',
            tag: pendingTag,
            memory: {
                ...normalized,
                romanceBlocked: pendingTag === 'Date_And_Confess' ? 'Y' : normalized.romanceBlocked,
                pendingTag: 'NONE',
                pendingSince: 0,
                refusedTags: addMemoryTag(normalized.refusedTags, pendingTag),
                b4Courtship: updateB4CourtshipOnRefusal(normalized.b4Courtship, pendingTag),
            },
        };
    }

    const age = normalized.pendingSince > 0 ? normalized.interchangeCount - normalized.pendingSince : 0;
    if (age >= 3) {
        return {
            result: 'EXPIRED',
            tag: pendingTag,
            memory: {
                ...normalized,
                pendingTag: 'NONE',
                pendingSince: 0,
                b4Courtship: updateB4CourtshipOnExpiry(normalized.b4Courtship, pendingTag),
            },
        };
    }
    return { result: 'NONE', tag: pendingTag, memory: normalized };
}

function proactivityOfferResponseTargetsNpc(npc, text, allowGenericResponse) {
    if (allowGenericResponse) return true;
    return assistantMentionsNpc(npc, text);
}

function isRomanceMemoryTag(tag) {
    return ROMANCE_MEMORY_TAGS.includes(tag);
}

function addMemoryTag(list, tag) {
    if (!isRomanceMemoryTag(tag)) return Array.isArray(list) ? [...list] : [];
    const result = Array.isArray(list) ? [...list] : [];
    if (!result.includes(tag)) result.push(tag);
    return result.slice(0, ROMANCE_MEMORY_TAGS.length);
}

function normalizeB4Courtship(courtship) {
    const normalized = normalizeProactivityMemory({ b4Courtship: courtship }).b4Courtship;
    return normalized || {
        askDateAttempts: 0,
        askDateAccepted: 0,
        askDateRefused: 0,
        askDateCooldownUntilActiveMs: 0,
        thoughtfulGiftAttempts: 0,
        thoughtfulGiftAccepted: 'N',
        thoughtfulGiftRefused: 'N',
        dateAndConfessRefused: 'N',
        blocked: 'N',
    };
}

function updateB4CourtshipOnAcceptance(courtship, tag) {
    const normalized = normalizeB4Courtship(courtship);
    if (tag === 'Ask_Date') {
        return recomputeB4CourtshipState({
            ...normalized,
            askDateAccepted: clamp(normalized.askDateAccepted + 1, 0, 2),
        });
    }
    if (tag === 'Thoughtful_Gift') {
        return recomputeB4CourtshipState({
            ...normalized,
            thoughtfulGiftAccepted: 'Y',
        });
    }
    if (tag === 'Date_And_Confess') {
        return recomputeB4CourtshipState({
            ...normalized,
            dateAndConfessRefused: 'N',
        });
    }
    return normalized;
}

function updateB4CourtshipOnRefusal(courtship, tag) {
    const normalized = normalizeB4Courtship(courtship);
    if (tag === 'Ask_Date') {
        return recomputeB4CourtshipState({
            ...normalized,
            askDateRefused: clamp(normalized.askDateRefused + 1, 0, 2),
        });
    }
    if (tag === 'Thoughtful_Gift') {
        return recomputeB4CourtshipState({
            ...normalized,
            thoughtfulGiftRefused: 'Y',
        });
    }
    if (tag === 'Date_And_Confess') {
        return recomputeB4CourtshipState({
            ...normalized,
            dateAndConfessRefused: 'Y',
        });
    }
    return normalized;
}

function updateB4CourtshipOnExpiry(courtship, tag) {
    const normalized = normalizeB4Courtship(courtship);
    if (tag === 'Ask_Date') {
        return recomputeB4CourtshipState({
            ...normalized,
            askDateRefused: clamp(normalized.askDateRefused + 1, 0, 2),
        });
    }
    if (tag === 'Thoughtful_Gift') {
        return recomputeB4CourtshipState({
            ...normalized,
            thoughtfulGiftRefused: 'Y',
        });
    }
    return normalized;
}

function shouldRegressB4Courtship(memoryOutcome) {
    if (!memoryOutcome || !['ACCEPTED', 'REFUSED', 'EXPIRED'].includes(memoryOutcome.result)) return false;
    const memory = normalizeProactivityMemory(memoryOutcome.memory);
    if (memoryOutcome.tag === 'Date_And_Confess' && memoryOutcome.result !== 'ACCEPTED') return true;
    return memory.b4Courtship?.blocked === 'Y';
}

function updateB4CourtshipOnAskDate(courtship, activeMs = 0) {
    const normalized = normalizeB4Courtship(courtship);
    const askDateAttempts = clamp(normalized.askDateAttempts + 1, 0, 2);
    const updated = {
        ...normalized,
        askDateAttempts,
        askDateCooldownUntilActiveMs: askDateAttempts === 1
            ? clamp(Number(activeMs || 0) + (2 * PARTNER_MEANINGFUL_COOLDOWN_HOUR_MS), 0, 1000000000000)
            : normalized.askDateCooldownUntilActiveMs,
    };
    return recomputeB4CourtshipState(updated, 'Ask_Date');
}

function updateB4CourtshipOnThoughtfulGift(courtship) {
    const normalized = normalizeB4Courtship(courtship);
    return recomputeB4CourtshipState({
        ...normalized,
        thoughtfulGiftAttempts: 1,
    }, 'Thoughtful_Gift');
}

function recomputeB4CourtshipState(courtship, pendingTag = 'NONE') {
    const normalized = normalizeB4Courtship(courtship);
    const askDateAttempts = Number(normalized.askDateAttempts || 0);
    const askDateAccepted = Number(normalized.askDateAccepted || 0);
    const thoughtfulGiftAttempts = Number(normalized.thoughtfulGiftAttempts || 0);
    const thoughtfulGiftAccepted = normalized.thoughtfulGiftAccepted === 'Y';
    const thoughtfulGiftRefused = normalized.thoughtfulGiftRefused === 'Y';
    const permanentlyBlocked = normalized.dateAndConfessRefused === 'Y'
        || (askDateAttempts >= 2 && askDateAccepted === 0 && pendingTag !== 'Ask_Date')
        || (askDateAttempts >= 2 && askDateAccepted === 1 && thoughtfulGiftAttempts >= 1 && !thoughtfulGiftAccepted && thoughtfulGiftRefused && pendingTag !== 'Thoughtful_Gift');
    return {
        ...normalized,
        blocked: permanentlyBlocked ? 'Y' : 'N',
    };
}

function classifyProactivityOfferResponse(tag, text) {
    const source = relationshipText(text).toLowerCase();
    if (!source) return 'UNCLEAR';
    if (proactivityOfferRefused(tag, source)) return 'REFUSED';
    if (proactivityOfferAccepted(tag, source)) return 'ACCEPTED';
    return 'UNCLEAR';
}

function proactivityOfferAccepted(tag, source) {
    if (tag === 'Thoughtful_Gift') {
        return /\b(?:thank(?:s| you)?|appreciate|accept|take|keep|receive|love it|like it|that's sweet|that is sweet|smile)\b/.test(source)
            && !/\b(?:no thanks|no thank you|can't accept|cannot accept|won't accept|do not accept|don't accept)\b/.test(source);
    }
    if (tag === 'Ask_Date') {
        return /\b(?:yes|okay|ok|sure|alright|i'd love to|i would love to|sounds good|let's go|i accept|i agree|i want that|i want this|take me|go with you)\b/.test(source)
            || /\b(?:date|private time|spend time)\b.{0,60}\b(?:yes|okay|sure|accept|love to|want)\b/.test(source);
    }
    if (tag === 'Date_And_Confess') {
        return hasRelationshipAcceptance(source, { allowPhysical: true });
    }
    return false;
}

function proactivityOfferRefused(tag, source) {
    if (tag === 'Thoughtful_Gift') {
        return /\b(?:no thanks|no thank you|refuse|decline|reject|can't accept|cannot accept|won't accept|do not accept|don't accept|give it back|push (?:it|the gift) away|not want (?:it|that|the gift))\b/.test(source);
    }
    if (tag === 'Ask_Date') {
        return /\b(?:no|refuse|decline|reject|not interested|don't want|do not want|not now|can't|cannot|won't|stop)\b.{0,80}\b(?:date|private time|go with you|spend time|romantic|romance|you)\b/.test(source)
            || /\b(?:no|not now|not interested|i refuse|i decline)\b/.test(source);
    }
    if (tag === 'Date_And_Confess') {
        return hasRelationshipRefusal(source)
            || /\b(?:no|not interested|don't love you|do not love you|can't love you|cannot love you|won't love you|do not want this|don't want this|not like that)\b/.test(source);
    }
    return false;
}

function resolveEstablishedRelationshipState(state, currentDisposition, sem, npc, context, refereeContext, audit, label, actionTargets = []) {
    if (state?.establishedRelationship === 'Y') return 'Y';
    if (currentDisposition?.B !== 4) return 'N';
    if (sem?.establishedRelationship === true) return 'Y';
    if (!toRealArray(actionTargets).some(name => sameName(name, npc))) return 'N';

    const evidence = detectCurrentRelationshipAcceptance(npc, context, refereeContext, toRealArray(actionTargets).filter(isReal).length === 1);
    if (!evidence.accepted) return 'N';

    audit?.push(`${label}.deterministicAcceptance=Y source=${evidence.source}`);
    return 'Y';
}

function detectCurrentRelationshipAcceptance(npc, context, refereeContext = null, assumeSingleTarget = false) {
    const exchange = getLatestRelationshipExchange(context);
    const userText = relationshipText(exchange.user);
    const assistantText = relationshipText(exchange.assistant);
    const previousUserText = relationshipText(exchange.previousUser);
    if (!userText || !assistantText) return { accepted: false, source: 'none' };
    if (!assumeSingleTarget && !assistantMentionsNpc(npc, assistantText)) {
        return { accepted: false, source: 'npc_not_in_previous_assistant_message' };
    }

    if (hasRelationshipDeclarationOrRequest(assistantText, refereeContext) && hasRelationshipAcceptance(userText, { allowPhysical: true, refereeContext })) {
        return { accepted: true, source: 'npcDeclarationAcceptedByUser' };
    }
    if (hasRelationshipDeclarationOrRequest(previousUserText, refereeContext) && hasRelationshipAcceptance(assistantText, { allowPhysical: false, refereeContext })) {
        return { accepted: true, source: 'userDeclarationAcceptedByNpc' };
    }
    return { accepted: false, source: 'no_explicit_acceptance_pair' };
}

function getLatestRelationshipExchange(context) {
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    let user = null;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (isUserMessage(message)) {
            user = messageText(message);
            for (let prev = index - 1; prev >= 0; prev -= 1) {
                if (!isUserMessage(chat[prev])) {
                    const assistant = messageText(chat[prev]);
                    for (let priorUser = prev - 1; priorUser >= 0; priorUser -= 1) {
                        if (isUserMessage(chat[priorUser])) {
                            return { user, assistant, previousUser: messageText(chat[priorUser]) };
                        }
                    }
                    return { user, assistant, previousUser: '' };
                }
            }
            return { user, assistant: '', previousUser: '' };
        }
    }
    return { user: '', assistant: '', previousUser: '' };
}

function isUserMessage(message) {
    return Boolean(message?.is_user || message?.role === 'user');
}

function messageText(message) {
    if (!message) return '';
    if (typeof message.mes === 'string') return message.mes;
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
        return message.content.map(part => typeof part === 'string' ? part : part?.text).filter(Boolean).join('\n');
    }
    return '';
}

function relationshipText(value) {
    return String(value ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[\u2026.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function assistantMentionsNpc(npc, text) {
    const name = String(npc ?? '').trim();
    if (!name) return false;
    const lowerText = text.toLowerCase();
    const lowerName = name.toLowerCase();
    const firstName = lowerName.split(/\s+/)[0];
    return lowerText.includes(lowerName) || (firstName.length >= 3 && lowerText.includes(firstName));
}

function hasRelationshipDeclarationOrRequest(text, refereeContext = null) {
    const source = relationshipText(text);
    const userRef = userReferencePattern(refereeContext);
    return new RegExp(`\\bi\\s+love\\s+${userRef}(?:\\s+too)?`, 'i').test(source)
        || new RegExp(`\\bi['\\u2019]m\\s+in\\s+love\\s+with\\s+${userRef}`, 'i').test(source)
        || /\b(be|become)\s+(?:my|mine)\b/i.test(source)
        || new RegExp(`\\b(?:will|would)\\s+${userRef}\\s+(?:be|become)\\s+(?:my|mine)\\b`, 'i').test(source)
        || new RegExp(`\\b(?:will|would)\\s+${userRef}\\s+(?:date|court|marry)\\s+me\\b`, 'i').test(source)
        || /\b(?:be|become)\s+(?:lovers|partners|a couple)\b/i.test(source)
        || /\b(?:my|your)\s+(?:lover|beloved|partner|girlfriend|boyfriend|wife|husband)\b/i.test(source)
        || /\b(?:start|begin|have)\s+(?:a\s+)?(?:relationship|romance)\b/i.test(source);
}

function hasRelationshipAcceptance(text, options = {}) {
    const source = relationshipText(text);
    const refereeContext = options.refereeContext || null;
    const userRef = userReferencePattern(refereeContext);
    if (hasRelationshipRefusal(source, refereeContext)) return false;
    return /\b(?:yes|okay|ok|alright)\b/i.test(source)
        || new RegExp(`\\bi\\s+(?:accept|agree|want\\s+that|want\\s+this|choose\\s+${userRef})`, 'i').test(source)
        || /\bi\s+love\s+you\s+too\b/i.test(source)
        || /\bi\s+love\s+you\b/i.test(source)
        || /\bi\s+feel\s+(?:it|the\s+same|that\s+too|the\s+same\s+way)\b/i.test(source)
        || new RegExp(`\\bi\\s+want\\s+(?:${userRef}|this|us)`, 'i').test(source)
        || new RegExp(`\\b(?:kiss(?:es|ed|ing)?\\s+(?:${userRef}|him|her|them)|(?:wrap|put)\\s+my\\s+arms\\s+around|pull\\s+(?:${userRef}|him|her|them)\\s+(?:close|against)|hold\\s+(?:${userRef}|him|her|them)\\s+close|press\\s+my\\s+lips)`, 'i').test(source) && options.allowPhysical === true;
}

function hasRelationshipRefusal(text, refereeContext = null) {
    const userRef = userReferencePattern(refereeContext);
    return /\b(?:no|not|never|can['\u2019]t|cannot|won['\u2019]t|do\s+not|don['\u2019]t)\b[^.!?]{0,80}\b(?:love|want|accept|relationship|date|court|marry|lover|partner)\b/i.test(text)
        || new RegExp(`\\b(?:pull\\s+away|step\\s+back|push\\s+(?:${userRef}|him|her|them)\\s+away|refuse|reject|deny)\\b`, 'i').test(text);
}

function consumesRapportCooldown(target, mode = 'normal') {
    if (mode === 'hostilePressure' && target === 'No Change') return false;
    return ['Bond', 'No Change'].includes(target);
}

function resolveIntimacyBoundary({ npc, currentDisposition, threshold, establishedRelationship, resolutionPacket, context, refereeContext, state, previousIntimacyState }) {
    if (resolutionPacket?.intimacyAdvanceExplicit !== 'Y') {
        return { boundary: 'SKIP', source: 'NONE', refusalStyle: 'NONE' };
    }
    const directTarget = toRealArray(resolutionPacket.ActionTargets).some(name => sameName(name, npc));
    const opposingTarget = toRealArray(resolutionPacket.OppTargets?.NPC).some(name => sameName(name, npc));
    if (!directTarget && !opposingTarget) {
        return { boundary: 'SKIP', source: 'NONE', refusalStyle: 'NONE' };
    }
    if (currentDisposition?.F >= 3 || currentDisposition?.H >= 3) {
        return {
            boundary: 'DENY',
            source: 'LOCKED_DISPOSITION',
            refusalStyle: intimacyRefusalStyle(currentDisposition, state),
        };
    }
    if (establishedRelationship === 'Y') {
        return { boundary: 'ALLOW', source: 'ESTABLISHED_RELATIONSHIP', refusalStyle: 'NONE' };
    }
    const initiated = detectNpcInitiatedIntimacy(npc, context, refereeContext, toRealArray(resolutionPacket.ActionTargets).filter(isReal).length === 1);
    if (initiated.accepted) {
        return { boundary: 'ALLOW', source: 'NPC_INITIATED', refusalStyle: 'NONE' };
    }
    const willingness = detectNpcIntimacyWillingness(npc, context, refereeContext, toRealArray(resolutionPacket.ActionTargets).filter(isReal).length === 1);
    if (willingness.accepted) {
        return { boundary: 'ALLOW', source: 'NPC_WILLINGNESS', refusalStyle: 'NONE' };
    }
    if (threshold?.Override === 'CurrentInvitation') {
        return { boundary: 'ALLOW', source: 'OVERRIDE:CurrentInvitation', refusalStyle: 'NONE' };
    }
    const previous = normalizeIntimacyStateLocal(previousIntimacyState);
    if (previous.boundary === 'ALLOW') {
        return { boundary: 'ALLOW', source: persistedIntimacySource(previous.source, 'ALLOW'), refusalStyle: 'NONE' };
    }
    if (previous.boundary === 'DENY') {
        return {
            boundary: 'DENY',
            source: persistedIntimacySource(previous.source, 'DENY'),
            refusalStyle: previous.refusalStyle !== 'NONE' ? previous.refusalStyle : intimacyRefusalStyle(currentDisposition, state),
        };
    }
    if (b4RomanticContextAllowsIntimacy(currentDisposition, threshold)) {
        return { boundary: 'ALLOW', source: 'B4_ROMANTIC_CONTEXT', refusalStyle: 'NONE' };
    }
    if (threshold?.Override && threshold.Override !== 'NONE') {
        return { boundary: 'ALLOW', source: `OVERRIDE:${threshold.Override}`, refusalStyle: 'NONE' };
    }
    return {
        boundary: 'DENY',
        source: 'NONE',
        refusalStyle: intimacyRefusalStyle(currentDisposition, state),
    };
}

function nextIntimacyState(boundary, previous) {
    const normalized = normalizeIntimacyStateLocal(previous);
    if (boundary?.boundary === 'ALLOW') {
        return { boundary: 'ALLOW', source: boundary.source || 'ALLOW', refusalStyle: 'NONE' };
    }
    if (boundary?.boundary === 'DENY') {
        return { boundary: 'DENY', source: boundary.source || 'DENY', refusalStyle: boundary.refusalStyle || 'CLEAR' };
    }
    return normalized;
}

function persistedIntimacySource(source, fallback) {
    const text = String(source || 'NONE');
    if (text === 'PERSISTED') return `PERSISTED_${fallback}`;
    if (text !== 'NONE' && text.startsWith('PERSISTED')) return text;
    if (text === 'NONE') return `PERSISTED_${fallback}`;
    return `PERSISTED:${text}`;
}

function normalizeIntimacyStateLocal(value) {
    const source = value && typeof value === 'object' ? value : {};
    const boundary = ['ALLOW', 'DENY'].includes(source.boundary) ? source.boundary : 'NONE';
    const refusalStyle = ['NONE', 'PANIC', 'HOSTILE', 'FEARFUL', 'SOFT', 'CLEAR'].includes(source.refusalStyle)
        ? source.refusalStyle
        : 'NONE';
    return {
        boundary,
        source: boundary === 'NONE' ? 'NONE' : String(source.source || 'PERSISTED'),
        refusalStyle: boundary === 'DENY' ? refusalStyle : 'NONE',
    };
}

function intimacyRefusalStyle(disposition, state = {}) {
    const fin = disposition || {};
    const condition = String(state?.condition || 'healthy').toLowerCase();
    if (fin.F >= 4 || condition === 'critical') return 'PANIC';
    if (fin.H >= 3) return 'HOSTILE';
    if (fin.F >= 3) return 'FEARFUL';
    if (fin.B >= 3 && fin.H < 3 && fin.F < 3) return 'SOFT';
    return 'CLEAR';
}

function detectNpcInitiatedIntimacy(npc, context, refereeContext = null, assumeSingleTarget = false) {
    const exchange = getLatestRelationshipExchange(context);
    const userText = relationshipText(exchange.user);
    const assistantText = relationshipText(exchange.assistant);
    if (!userText || !assistantText) return { accepted: false, source: 'none' };
    if (!assumeSingleTarget && !assistantMentionsNpc(npc, assistantText)) return { accepted: false, source: 'npc_not_in_previous_assistant_message' };
    if (!hasNpcIntimacyInitiation(assistantText, refereeContext)) return { accepted: false, source: 'no_npc_intimacy_initiation' };
    if (!hasUserIntimacyAcceptance(userText, refereeContext)) return { accepted: false, source: 'no_user_acceptance' };
    return { accepted: true, source: 'previous_npc_initiation_accepted' };
}

function detectNpcIntimacyWillingness(npc, context, refereeContext = null, assumeSingleTarget = false) {
    const exchange = getLatestRelationshipExchange(context);
    const userText = relationshipText(exchange.user);
    const assistantText = relationshipText(exchange.assistant);
    if (!userText || !assistantText) return { accepted: false, source: 'none' };
    if (!assumeSingleTarget && !assistantMentionsNpc(npc, assistantText)) return { accepted: false, source: 'npc_not_in_previous_assistant_message' };
    if (!hasNpcIntimacyWillingness(assistantText, refereeContext)) return { accepted: false, source: 'no_npc_intimacy_willingness' };
    if (!hasUserIntimacyAcceptance(userText, refereeContext)) return { accepted: false, source: 'no_user_acceptance' };
    return { accepted: true, source: 'previous_npc_willingness_accepted' };
}

function hasNpcIntimacyInitiation(text, refereeContext = null) {
    const source = relationshipText(text).toLowerCase();
    const userRef = userReferencePattern(refereeContext);
    if (hasRelationshipRefusal(source, refereeContext)) return false;
    return new RegExp(`\\b(?:i\\s+want\\s+to\\s+kiss\\s+${userRef}|kiss\\s+me|let\\s+me\\s+kiss\\s+${userRef}|do\\s+${userRef}\\s+want\\s+(?:me\\s+)?to\\s+kiss\\s+${userRef}|can\\s+i\\s+kiss\\s+${userRef}|may\\s+i\\s+kiss\\s+${userRef})`, 'i').test(source)
        || new RegExp(`\\b(?:i\\s+want\\s+${userRef}|take\\s+me|come\\s+to\\s+bed|sleep\\s+with\\s+me|make\\s+love|have\\s+sex|touch\\s+me|let\\s+me\\s+touch\\s+${userRef})`, 'i').test(source)
        || new RegExp(`\\b(?:pulls?|leans?)\\s+(?:${userRef}\\s+)?(?:closer|in)\\b.{0,80}\\b(?:kiss|mouth|lips|bed|desire|want)\\b`, 'i').test(source)
        || /\b(?:kisses|kissed|presses?\s+(?:her|his|their)?\s*lips|mouth\s+meets)\b/.test(source)
        || new RegExp(`\\b(?:undresses?|removes?\\s+(?:her|his|their)\\s+clothes|lets?\\s+(?:her|his|their)\\s+clothes\\s+(?:fall|slip))\\b.{0,120}(?:${userRef}|\\b(?:bed|closer|kiss|desire|want)\\b)`, 'i').test(source);
}

function hasNpcIntimacyWillingness(text, refereeContext = null) {
    const source = relationshipText(text).toLowerCase();
    const userRef = userReferencePattern(refereeContext);
    if (hasRelationshipRefusal(source, refereeContext)) return false;
    return new RegExp(`\\b(?:i\\s*(?:am|'m)\\s+(?:yours|willing|ready|open)|i\\s*(?:will|'ll)\\s+(?:do|give|be|obey|submit)|let\\s+${userRef}\\s+(?:do|have|take|lead|guide))\\b.{0,90}\\b(?:anything|everything|whatever|want|wants|wish|wishes|ask|asks|command|commands|desire|desires|touch|kiss|bed|close|closer)\\b`, 'i').test(source)
        || /\b(?:anything\s+and\s+everything|anything\s+you\s+want|everything\s+you\s+want|whatever\s+you\s+want|whatever\s+you\s+ask|whatever\s+you\s+command)\b/.test(source)
        || new RegExp(`\\b(?:i\\s*(?:am|'m)\\s+all\\s+yours|i\\s+belong\\s+to\\s+${userRef}|do\\s+whatever\\s+${userRef}\\s+want)\\b`, 'i').test(source);
}

function hasUserIntimacyAcceptance(text, refereeContext = null) {
    const source = relationshipText(text).toLowerCase();
    const userRef = userReferencePattern(refereeContext);
    if (hasRelationshipRefusal(source, refereeContext)) return false;
    return new RegExp(`\\b(?:yes|okay|ok|alright|please|i\\s+want\\s+that|i\\s+want\\s+this|i\\s+want\\s+${userRef}|i\\s+let\\s+${userRef}|i\\s+accept|i\\s+nod)`, 'i').test(source)
        || new RegExp(`\\b(?:kiss(?:es|ed|ing)?\\s+(?:${userRef}|him|her|them)|kiss\\s+back|return\\s+(?:the\\s+)?kiss|press\\s+my\\s+lips|pull\\s+(?:${userRef}|him|her|them)\\s+(?:close|against)|hold\\s+(?:${userRef}|him|her|them)\\s+close|wrap\\s+my\\s+arms|touch\\s+(?:${userRef}|him|her|them)|take\\s+(?:${userRef}|him|her|them)\\s+to\\s+bed)`, 'i').test(source);
}

function b4RomanticContextAllowsIntimacy(currentDisposition, threshold) {
    if (Number(currentDisposition?.B || 0) < 4) return false;
    return threshold?.RomanticBuildup === 'Y';
}

function runChaos(ledger, handoffs, resolutionPacket, dice, audit) {
    const diceList = {
        A: dice.d20(),
        O: dice.d20(),
        I: dice.d20(),
        anchorIdx: dice.d20(),
        vectorIdx: dice.d20(),
    };
    const sceneSummary = ledger.chaosSemantic?.sceneSummary || '';
    const ctx = getChaosContext(handoffs, sceneSummary);

    audit.push('STEP 4: EXECUTE CHAOS_INTERRUPT');
    audit.push(`4.1a step_context={GOAL:${resolutionPacket.GOAL},ActionTargets:${compact(resolutionPacket.ActionTargets)}}`);
    audit.push(`4.1b step_handoffs=${compact(handoffs)}`);
    audit.push(`4.1c sceneSummary=${sceneSummary}`);
    audit.push(`4.1d diceList=${compact(diceList)}`);
    audit.push(`4.2 getCtx=${ctx}`);

    let handoff;
    if (diceList.A < 19) {
        handoff = { CHAOS: { triggered: false, band: 'None', magnitude: 'None', anchor: 'None', vector: 'None', personVector: false, fullText: null } };
        audit.push(`4.2b A=${diceList.A}<19 -> CHAOS_HANDOFF=${compact(handoff)}`);
    } else {
        const band = classifyBand(diceList.O);
        const magnitude = classifyMagnitude(diceList.O);
        const anchor = pickAnchor(diceList.anchorIdx);
        const vector = pickVector(ctx, diceList.I, diceList.vectorIdx);
        const personVector = vector === 'NPC' || vector === 'AUTHORITY';
        handoff = { CHAOS: { triggered: true, band, magnitude, anchor, vector, personVector, fullText: null } };
        audit.push(`4.3 classifyBand=${band}`);
        audit.push(`4.3c classifyMagnitude=${magnitude}`);
        audit.push(`4.3e pickAnchor=${anchor}`);
        audit.push(`4.3g pickVector=${vector}`);
        audit.push(`4.3h personVector=${personVector ? 'Y' : 'N'}`);
        audit.push(`4.3i CHAOS_HANDOFF=${compact(handoff)}`);
    }

    audit.push('---');
    return { handoff };
}

function runNameGeneration(ledger, audit, context, type) {
    const contextText = buildNameContext(ledger, context);
    const profile = profileFromNameContext(contextText);
    const style = resolveNameStyle(context);
    const styleProfile = NAME_STYLE_PROFILES[style] || NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE];
    const registry = getNameRegistry(context);
    const poolResult = buildNamePool({ profile, registry, contextText, style, styleProfile });
    const pool = poolResult.pool;
    registerGeneratedNamePool(context, pool, { profile, style, styleKey: styleProfile.key, source: 'deterministicNamePool' });

    const result = {
        nameRequired: 'POOL',
        isLocation: 'N/A',
        seed: 'pool',
        normalizeSeed: 'pool',
        detectMode: 'POOL',
        profile,
        style,
        styleKey: styleProfile.key,
        gender: 'POOL',
        deterministicCue: 'deterministic style profile',
        generatedName: NONE,
        namePool: pool,
    };
    audit.push('STEP 5: BUILD DETERMINISTIC NAME POOL');
    audit.push('5.1 nameRequired=POOL');
    audit.push('5.1a namePoolMode=deterministicStyleProfile');
    audit.push('5.1b isLocation=N/A');
    audit.push('5.1c seed=pool');
    audit.push('5.1d normalizeSeed=pool');
    audit.push('5.1e detectMode=POOL');
    audit.push(`5.1f profile=${result.profile}`);
    audit.push('5.1g gender=POOL');
    audit.push(`5.1h style=${style}`);
    audit.push(`5.1i namePool=${compact(pool)}`);
    audit.push('---');
    return result;
}

function resolveNameStyle(context) {
    const value = String(context?.extensionSettings?.nameStyle || context?.structuredPreflightSettings?.nameStyle || '').trim();
    return NAME_STYLE_PROFILES[value] ? value : DEFAULT_NAME_STYLE;
}

function buildNameContext(ledger, context) {
    const resolution = ledger.resolutionEngine || {};
    return [
        getLatestUserTextFromContext(context),
        ledger.chaosSemantic?.sceneSummary,
        resolution.identifyGoal,
        resolution.identifyChallenge,
        resolution.explicitMeans,
        ...(ledger.relationshipEngine || []).map(item => item?.NPC).filter(Boolean),
    ].filter(Boolean).join(' ').trim();
}

function getLatestUserTextFromContext(context) {
    const chat = context?.chat;
    if (!Array.isArray(chat)) return '';
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (!message?.is_user && message?.role !== 'user') continue;
        if (typeof message.mes === 'string') return unwrapStructuredUserInputText(message.mes);
        if (typeof message.content === 'string') return unwrapStructuredUserInputText(message.content);
        if (Array.isArray(message.content)) {
            return unwrapStructuredUserInputText(message.content.map(part => typeof part === 'string' ? part : part?.text).filter(Boolean).join('\n'));
        }
    }
    return '';
}

function unwrapStructuredUserInputText(text) {
    const trimmed = String(text ?? '').trim();
    if (trimmed.length >= 4 && trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
        return trimmed.slice(2, -2).trim();
    }
    if (trimmed.length >= 4 && trimmed.startsWith('((') && trimmed.endsWith('))')) {
        return trimmed.slice(2, -2).trim();
    }
    return trimmed
        .replace(/\[\[([\s\S]*?)\]\]/g, (_match, inner) => ` ${String(inner ?? '').trim()} `)
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeNameSeed(seed) {
    const source = String(seed ?? '').replace(/\(none\)/gi, '').replace(/[^a-z]/gi, '').slice(0, 24);
    if (source.length >= 3) return titleSeed(source.slice(0, 3));
    if (source.length > 0) return titleSeed((source + 'aka').slice(0, 3));
    return 'Aka';
}

function firstNameSeedHint(...values) {
    for (const value of values) {
        const text = String(value ?? '').trim();
        if (!text || text === NONE || /^\(?none\)?$/i.test(text)) continue;
        return text;
    }
    return 'Aka';
}

function titleSeed(seed) {
    const lower = String(seed || 'Aka').slice(0, 3).toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function detectNameMode(contextText, isLocation, semanticMode) {
    if (isLocation || semanticMode === 'LOCATION') return 'LOCATION';
    if (semanticMode === 'PERSON') return 'PERSON';
    if (/\b(?:place|town|city|ruin|mountain|river|forest|temple|keep|village|fort|harbor|port|island|lake|swamp|marsh|cavern|valley|peak|district|kingdom|province|outpost|bridge|gate|road|pass|tower|watchtower|camp|hideout)\b/i.test(contextText)) {
        return 'LOCATION';
    }
    return 'PERSON';
}

function profileFromNameContext(contextText) {
    if (/\b(?:harsh|hard|stone|iron|ash|cold|desert|steppe|war|border|fortress|raid|scar|volcanic|blade|blood|black|storm|frost)\b/i.test(contextText)) return 'HARD';
    if (/\b(?:soft|coast|island|harbor|reef|jungle|garden|ritual|temple|court|silk|trade|festival|rain|moon|river|flower|song)\b/i.test(contextText)) return 'SOFT';
    return 'BALANCED';
}

function detectNameGender(contextText) {
    if (/\b(?:woman|girl|female|queen|princess|lady|priestess|waitress|mother|sister|daughter|wife|widow|matron|maid|actress)\b/i.test(contextText)) return 'FEMALE';
    if (/\b(?:man|boy|male|king|prince|lord|priest|waiter|father|brother|son|husband|widower|patriarch|actor)\b/i.test(contextText)) return 'MALE';
    return 'NEUTRAL';
}

function buildNamePool({ profile, registry, contextText, style, styleProfile }) {
    const used = new Set([
        ...Array.from(registry.used || []),
        ...extractExistingProperNames(contextText),
    ].map(normalizeNameKey).filter(Boolean));
    const pool = { male: [], female: [], location: [] };
    const specs = [
        ['male', 'PERSON', 'MALE'],
        ['female', 'PERSON', 'FEMALE'],
        ['location', 'LOCATION', 'NEUTRAL'],
    ];

    for (const [bucket, mode, gender] of specs) {
        while (pool[bucket].length < NAME_POOL_SIZE) {
            const slot = pool[bucket].length + 1;
            const seed = `${bucket}-${slot}`;
            const name = buildDeterministicName({
                mode,
                profile,
                gender,
                seed,
                registry: { used },
                contextText,
                style,
                styleProfile,
            });
            if (name === NONE) break;
            pool[bucket].push(name);
            used.add(normalizeNameKey(name));
        }
    }

    return { pool };
}

function buildDeterministicName({ mode, profile, gender, seed, registry, contextText, style = DEFAULT_NAME_STYLE, styleProfile = NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE] }) {
    const used = new Set([
        ...Array.from(registry.used || []),
        ...extractExistingProperNames(contextText),
    ].map(normalizeNameKey).filter(Boolean));
    const baseSeed = normalizeNameSeed(seed);
    const rng = createNamePrng(`${baseSeed}|${style}|${mode}|${profile}|${gender}|${contextText}|${used.size}`);

    for (let attempt = 0; attempt < 96; attempt += 1) {
        const candidate = buildNameCandidate({ mode, profile, gender, rng, attempt, styleProfile });
        if (rejectName(candidate, mode, used, styleProfile)) continue;
        return candidate;
    }

    for (let attempt = 0; attempt < 96; attempt += 1) {
        const fallbackProfile = ['BALANCED', 'SOFT', 'HARD'][attempt % 3];
        const candidate = buildNameCandidate({ mode, profile: fallbackProfile, gender, rng, attempt, styleProfile });
        if (rejectName(candidate, mode, used, styleProfile)) continue;
        return candidate;
    }

    return buildUniqueFallbackName(mode, used, styleProfile);
}

function buildNameCandidate({ mode, profile, gender, rng, attempt, styleProfile }) {
    const safeStyle = styleProfile || NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE];
    const listed = pickStyleListName({ mode, gender, rng, attempt, styleProfile: safeStyle });
    if (listed) return titleName(listed);
    const rule = mode === 'LOCATION' ? safeStyle.rules.location : safeStyle.rules.person;
    const syllableCount = randomInt(rng, rule.min, rule.max);
    const syllables = [];
    for (let index = 0; index < syllableCount; index += 1) {
        syllables.push(styledSyllable(rng, safeStyle, rule, index, syllableCount));
    }
    const ending = pickStyledEnding(rng, safeStyle, mode, gender, rule);
    const raw = `${syllables.join('')}${ending}`;
    return titleName(smoothName(raw, mode));
}

function pickStyleListName({ mode, gender, rng, attempt, styleProfile }) {
    const rules = styleProfile?.rules || {};
    let list = [];
    if (mode === 'LOCATION') {
        list = rules.locationNames;
    } else if (gender === 'MALE') {
        list = rules.maleNames;
    } else if (gender === 'FEMALE') {
        list = rules.femaleNames;
    } else {
        list = rules.neutralNames || [...(rules.maleNames || []), ...(rules.femaleNames || [])];
    }
    if (!Array.isArray(list) || !list.length) return '';
    const offset = Math.floor(rng() * list.length);
    return list[(offset + attempt) % list.length];
}

function styledSyllable(rng, styleProfile, rule, index, count) {
    const sounds = styleProfile.sounds || NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE].sounds;
    const useCluster = index === 0 && rng() < Number(rule.clusterChance || 0);
    let onsetPool = useCluster ? sounds.clusters : sounds.onsets;
    if (index > 0) {
        onsetPool = onsetPool.filter(Boolean);
    }
    const onset = pickWeighted(rng, onsetPool);
    const vowel = pickWeighted(rng, sounds.vowels);
    const internalCodaChance = Number(rule.internalCodaChance || 0);
    const canUseCoda = index === count - 1
        ? rng() < Number(rule.codaChance || 0)
        : rng() < internalCodaChance;
    const coda = canUseCoda ? pickWeighted(rng, sounds.codas) : '';
    return `${onset}${vowel}${coda}`;
}

function pickStyledEnding(rng, styleProfile, mode, gender, rule) {
    if (mode === 'LOCATION' && rng() < Number(rule.suffixChance || 0)) {
        return pickWeighted(rng, styleProfile.rules.locationSuffixes);
    }
    if (mode === 'PERSON' && rng() < Number(rule.endingChance || 0)) {
        if (gender === 'MALE') return pickWeighted(rng, styleProfile.rules.maleEndings);
        if (gender === 'FEMALE') return pickWeighted(rng, styleProfile.rules.femaleEndings);
        return pickWeighted(rng, styleProfile.rules.neutralEndings);
    }
    return '';
}

function randomInt(rng, min, max) {
    const low = Math.max(1, Number(min || 1));
    const high = Math.max(low, Number(max || low));
    return low + Math.floor(rng() * (high - low + 1));
}

function smoothName(value, mode) {
    let text = String(value || '').toLowerCase();
    text = text
        .replace(/([aeiou])\1+/g, '$1')
        .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, '$1')
        .replace(/([aeiou])([aeiou])([aeiou]+)/g, '$1$2')
        .replace(/([bcdfghjklmnpqrstvwxyz])([bcdfghjklmnpqrstvwxyz])([bcdfghjklmnpqrstvwxyz]+)/g, '$1$2')
        .replace(/([a-z]{2,})\1+/g, '$1');
    if (mode === 'PERSON' && text.length > 9) {
        text = text.replace(/(?:shi|esh|ira|ren|un|an|ar|en|ir|ok|ul)$/i, match => match.slice(0, 1));
    }
    return text;
}

function pickWeighted(rng, list) {
    const values = Array.isArray(list) && list.length ? list : ['rin'];
    return values[Math.floor(rng() * values.length) % values.length];
}

function rejectName(name, mode, used, styleProfile = NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE]) {
    return Boolean(nameRejectionReason(name, mode, used, styleProfile));
}

function nameRejectionReason(name, mode, used, styleProfile = NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE]) {
    const text = String(name || '').trim();
    const lower = text.toLowerCase();
    const texture = nameTextureRules(styleProfile, mode);
    const vowels = countTextureVowels(lower, texture);
    const consonants = countTextureConsonants(lower, texture);
    const modern = isModernNameStyle(styleProfile);
    if (!text) return 'empty';
    if (mode === 'PERSON' && (text.length < texture.minLength || text.length > texture.maxLength)) return 'person_length';
    if (mode === 'LOCATION' && (text.length < texture.minLength || text.length > texture.maxLength)) return 'location_length';
    if (/[aeiou]{3,}/i.test(text)) return 'too_many_vowels_in_row';
    if (hasConsonantRun(lower, texture)) return 'too_many_consonants_in_row';
    if (/(.)\1\1/i.test(text)) return 'triple_repeated_letter';
    if ((!modern && vowels < 2) || (modern && vowels < 1)) return 'too_few_vowels';
    if (!modern && consonants > vowels + 4) return 'consonant_heavy';
    if (!modern && hasBadVowelTexture(lower, texture)) return 'bad_vowel_texture';
    if (!modern && hasAwkwardNameTexture(lower, mode, styleProfile)) return 'awkward_texture';
    if (used.has(normalizeNameKey(text))) return 'duplicate_or_reserved';
    if (mode === 'PERSON' && ROLE_NAME_PREFIXES.some(prefix => lower.startsWith(prefix))) return 'role_prefix';
    if (/\b(?:aragorn|legolas|gandalf|frodo|sauron|elden|hyrule|zelda|cloud|sephiroth|london|paris|tokyo|rome|aldric|borin|eldarion)\b/i.test(lower)) return 'famous_or_stock_name';
    if (!modern && /\b(?:john|michael|david|james|mary|sarah|anna|arthur|edward|william|robert|albert|alice|elizabeth|eleanor)\b/i.test(lower)) return 'famous_or_stock_name';
    if (!modern && /(?:mirror|river|stone|storm|shadow|silver|golden|crystal|dragon|demon|angel|dark|light|black|white|red|blue|green|wolf|rose|luna|nova)/i.test(lower)) return 'stock_word';
    if (modern && mode === 'PERSON' && /(?:dragon|demon|shadow|crystal|wolf|sauron|hyrule|zelda|sephiroth)/i.test(lower)) return 'stock_word';
    if (mode === 'LOCATION' && /\b(?:rin|len|taro|mira|naya|emi|dan|vek|iro)$/i.test(text)) return 'location_reads_like_person';
    return '';
}

function isModernNameStyle(styleProfile) {
    return Boolean(styleProfile?.modern || styleProfile?.key === 'modern');
}

function nameTextureRules(styleProfile = NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE], mode = 'PERSON') {
    const key = String(styleProfile?.key || 'balanced');
    const modern = isModernNameStyle(styleProfile);
    const profileRule = mode === 'LOCATION' ? styleProfile?.rules?.location : styleProfile?.rules?.person;
    const styleVowels = new Set(['a', 'e', 'i', 'o', 'u']);
    if (['norse', 'celtic'].includes(key)) styleVowels.add('y');
    const roughStyles = new Set(['norse', 'slavic', 'celtic', 'dark-low']);
    const fluidStyles = new Set(['lyrical', 'persian-byzantine', 'classical-romance', 'celtic']);
    const personMin = modern ? 4 : roughStyles.has(key) ? 4 : 5;
    const locationMin = 7;
    const allowedPairsByStyle = {
        balanced: mode === 'LOCATION' ? ['ai', 'ia', 'ei'] : ['ia'],
        lyrical: ['ae', 'ei', 'ia'],
        celtic: ['ae', 'ei'],
        norse: [],
        'persian-byzantine': ['aa', 'ei', 'ia'],
        slavic: [],
        'classical-romance': ['ia', 'io'],
        'dark-low': [],
    };
    return {
        key,
        vowels: styleVowels,
        minLength: mode === 'LOCATION' ? locationMin : personMin,
        maxLength: Number(profileRule?.maxLength || (mode === 'LOCATION' ? 14 : modern ? 10 : 10)),
        maxConsonantRun: modern ? 5 : roughStyles.has(key) ? (mode === 'LOCATION' ? 5 : 4) : 3,
        allowedVowelPairs: new Set(allowedPairsByStyle[key] || allowedPairsByStyle.balanced),
        maxVowelPairs: fluidStyles.has(key) ? 2 : 1,
    };
}

function isTextureVowel(char, texture) {
    return texture.vowels.has(String(char || '').toLowerCase());
}

function countTextureVowels(lower, texture) {
    return Array.from(String(lower || '')).filter(char => isTextureVowel(char, texture)).length;
}

function countTextureConsonants(lower, texture) {
    return Array.from(String(lower || '')).filter(char => /[a-z]/.test(char) && !isTextureVowel(char, texture)).length;
}

function hasConsonantRun(lower, texture) {
    let run = 0;
    for (const char of String(lower || '')) {
        if (/[a-z]/.test(char) && !isTextureVowel(char, texture)) {
            run += 1;
            if (run > texture.maxConsonantRun) return true;
        } else {
            run = 0;
        }
    }
    return false;
}

function hasBadVowelTexture(lower, texture) {
    const pairs = Array.from(lower.matchAll(/[aeiou]{2}/g)).map(match => match[0]);
    if (!pairs.length) return false;
    if (pairs.length > texture.maxVowelPairs) return true;
    if (pairs.some(pair => !texture.allowedVowelPairs.has(pair))) return true;
    if (/y[aeiou]{2}/.test(lower)) return true;
    return false;
}

function hasAwkwardNameTexture(lower, mode, styleProfile = NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE]) {
    const key = String(styleProfile?.key || 'balanced');
    const universalAwkward = key === 'norse' || key === 'dark-low'
        ? /(?:stai|biv|bom|sailn|lnok|ivun|aistu|rsob|kk|kg|gk|dt|td|bp|pb|sz|zs|zx|xz|q)/
        : /(?:stai|biv|bom|sailn|lnok|ivun|aistu|rsob|vr|kk|kg|gk|dt|td|bp|pb|sz|zs|zx|xz|q)/;
    if (universalAwkward.test(lower)) return true;
    if (/(?:sros|rler|lrer|nrer|mrer|rl|lr|sr|rsr|srs|rnr|nln|mnm|dmd|bmb)/.test(lower)) return true;
    if (/(?:ua|uo|oi|iu|ui|ao|ea|eo|oe|ou).*(?:ua|uo|oi|iu|ui|ao|ea|eo|oe|ou)/.test(lower)) return true;
    if (mode === 'PERSON' && /(?:uar|uara|oira|oire|eira|aira|zuar|loira|tunen)$/.test(lower)) return true;
    if (mode === 'PERSON' && /^(?:soto|titu|yuye|tuhi|yome|tuya|hovi|sezo|taze|shihu|modo|suzi|thisa)$/i.test(lower)) return true;
    if (mode === 'PERSON' && /^(?:this|that|then|than|them|there|when|what|with)/.test(lower)) return true;
    if (mode === 'PERSON' && /^(?:[bcdfghjklmnpqrstvwxyz][aeiou]){2}$/i.test(lower)) return true;
    if (mode === 'LOCATION' && /(?:tunen|zuar|loira|oira|uara)$/.test(lower)) return true;
    if (/(?:[aeiou][^aeiou]){3,}[aeiou]?$/i.test(lower) && mode === 'PERSON') return true;
    if (/(?:[bcdfghjklmnpqrstvwxyz][rlmn]){3,}/.test(lower)) return true;
    if (/(?:[aeiou][bcdfghjklmnpqrstvwxyz]){4,}$/.test(lower) && mode === 'PERSON') return true;
    if (mode === 'PERSON' && /(?:hold|watch|gate|ford|mere|vale|reach|hollow|heim|gard|grad|polis|barrow|scar)$/.test(lower)) return true;
    if (mode === 'LOCATION' && /(?:bom|vun|stu|tavo|mira|sena|vire|nira)$/.test(lower)) return true;
    return false;
}

function buildUniqueFallbackName(mode, used, styleProfile = NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE]) {
    const modern = isModernNameStyle(styleProfile);
    const bases = modern
        ? (mode === 'LOCATION'
            ? ['Riverton', 'Riverside', 'Fairview', 'Pinecrest', 'Redford', 'Eastvale', 'Northgate', 'Westhaven', 'Kingsport']
            : ['Marcus', 'Victor', 'Nolan', 'Ethan', 'Megan', 'Julia', 'Carmen', 'Monica', 'Sarah', 'Alice'])
        : mode === 'LOCATION'
        ? ['Morakora', 'Navarech', 'Suraesh', 'Tavahold', 'Koravale', 'Zanawatch', 'Davaresh', 'Ishmora', 'Navasai', 'Vorahold', 'Talanor', 'Kazhara']
        : ['Ruvan', 'Kano', 'Mavi', 'Sena', 'Tavo', 'Vira', 'Dara', 'Niro', 'Zani', 'Aruen', 'Luma', 'Ivo'];
    for (const base of bases) {
        if (!rejectName(base, mode, used, styleProfile)) return base;
    }
    const syllables = ['ka', 'na', 'ra', 'shi', 'vo', 'li', 'ma', 'ru', 'ta', 'zen', 'ko', 'sa', 'mi', 'yor', 'ven', 'alo'];
    for (const first of syllables) {
        for (const second of syllables) {
            const candidate = mode === 'LOCATION'
                ? titleName(`mora${first}${second}`)
                : titleName(`ruv${first}${second}`);
            if (!used.has(normalizeNameKey(candidate)) && !rejectName(candidate, mode, used, styleProfile)) return candidate;
        }
    }
    return modern ? (mode === 'LOCATION' ? 'Riverton' : 'Marcus') : (mode === 'LOCATION' ? 'Morakora' : 'Ruvan');
}

function titleName(value) {
    const compactName = String(value || '').replace(/[^a-z]/gi, '').toLowerCase();
    return compactName ? compactName.charAt(0).toUpperCase() + compactName.slice(1) : 'Akarin';
}

function extractExistingProperNames(text) {
    return Array.from(String(text || '').matchAll(/\b[A-Z][a-z]{2,}\b/g)).map(match => match[0]);
}

function createNamePrng(seedText) {
    let seed = 2166136261;
    for (const char of String(seedText || 'Aka')) {
        seed ^= char.charCodeAt(0);
        seed = Math.imul(seed, 16777619);
    }
    return () => {
        seed += 0x6D2B79F5;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function getNameRegistry(context) {
    const root = context?.chatMetadata?.[NAME_REGISTRY_KEY] || {};
    const used = new Set(Array.isArray(root.used) ? root.used : []);
    const trackerNames = Object.keys(context?.chatMetadata?.structuredPreflightTracker?.npcs || {});
    for (const name of trackerNames) {
        if (isReal(name)) used.add(name);
    }
    return { used };
}

function registerGeneratedNamePool(context, pool, meta) {
    if (!context?.chatMetadata || !pool) return;
    for (const [bucket, names] of Object.entries(pool)) {
        for (const name of Array.isArray(names) ? names : []) {
            registerGeneratedName(context, name, { ...meta, bucket });
        }
    }
}

function registerGeneratedName(context, name, meta) {
    if (!context?.chatMetadata || !isReal(name)) return;
    const root = context.chatMetadata[NAME_REGISTRY_KEY] || { used: [], entries: {} };
    root.used = Array.isArray(root.used) ? root.used : [];
    root.entries = root.entries || {};
    if (!root.used.some(item => sameName(item, name))) root.used.push(name);
    root.entries[name] = {
        ...(root.entries[name] || {}),
        ...meta,
        savedAt: Date.now(),
    };
    context.chatMetadata[NAME_REGISTRY_KEY] = root;
    saveMetadataDebounced(context, { warn: false });
}

function deriveInflictedNpcInjuries({ injuryEffectEngine, targets, outcome, rollNeeded, combatActionSequence = false, challengeType = 'none', userAttackDie = null, harmMode = 'none', primaryTarget = null, primaryTargetCore = null, trackerSnapshot = {}, hiddenHealthSnapshot = null, audit = null }) {
    if (rollNeeded !== 'Y') return [];
    if (!effectOutcomeLanded(outcome)) return [];
    const mode = normalizeResolutionHarmMode(harmMode, { challengeType: combatActionSequence ? 'mundane_combat' : challengeType, rollNeeded });
    if (mode === 'none') return [];
    if (mode === 'restraint_control') {
        return deriveRestraintControlNpcEffects({ injuryEffectEngine, targets, outcome, primaryTarget, audit });
    }

    const fatalInjury = deriveUserAttackFatalInjury({
        outcome,
        combatActionSequence,
        userAttackDie,
        harmMode: mode,
        primaryTarget,
        primaryTargetCore,
        trackerSnapshot,
        hiddenHealthSnapshot,
    });
    if (fatalInjury) {
        const label = fatalInjury.condition === 'dead'
            ? 'deterministicUserAttackFatality'
            : 'deterministicBossCriticalDamage';
        audit?.push(`2.7p ${label}=${compact(fatalInjury)}`);
        return [fatalInjury];
    }

    const landedCount = Number(outcome?.LandedActions ?? 0);
    const injuries = normalizeInjuryEffectCandidates(injuryEffectEngine)
        .filter(effect => injuryEffectTargetAllowed(effect, targets))
        .slice(0, Math.max(0, landedCount))
        .map(effect => buildInflictedInjuryFromSemanticEffect(effect, outcome))
        .filter(Boolean);
    if (!injuries.length) {
        const fallback = buildFallbackCombatInflictedInjury({ outcome, combatActionSequence, primaryTarget, harmMode: mode });
        if (fallback) {
            audit?.push(`2.7p.1 fallbackCombatInjury=${compact(fallback)}`);
            injuries.push(fallback);
        }
    }
    return mergeInflictedInjuries(injuries);
}

function deriveRestraintControlNpcEffects({ injuryEffectEngine, targets, outcome, primaryTarget = null, audit = null }) {
    const landedCount = Number(outcome?.LandedActions ?? 0);
    const effects = normalizeInjuryEffectCandidates(injuryEffectEngine)
        .filter(effect => injuryEffectTargetAllowed(effect, targets))
        .filter(effect => ['restraint', 'physical_injury', 'other_status'].includes(effect.effectType))
        .slice(0, Math.max(0, landedCount))
        .map(buildRestraintControlInflictedEffect)
        .filter(Boolean);
    if (effects.length) {
        audit?.push(`2.7p.0 restraintControlNoHpDamage=${compact(effects)}`);
        return mergeInflictedInjuries(effects);
    }
    if (isReal(primaryTarget)) {
        audit?.push(`2.7p.0 restraintControlNoHpDamage=${primaryTarget}/no lasting injury candidate`);
    }
    return [];
}

function buildRestraintControlInflictedEffect(effect) {
    if (!isReal(effect?.target)) return null;
    const status = restraintControlStatusFromEffect(effect);
    return {
        NPC: effect.target,
        condition: 'healthy',
        woundsAdd: [],
        statusAdd: status ? [status] : [],
        severity: 'minor',
        bodyPart: effect.bodyPart || 'body',
        effectType: 'restraint',
        sourceAction: compactAttackSource(effect.description),
        NoHpDamage: 'Y',
        HarmMode: 'restraint_control',
        NarrationRule: `${effect.target} is affected only by restraint/control from the landed user action. Do NOT narrate HP damage, serious injury, death, unconsciousness, or a damaging attack from this control. At most, render minor bruising/pressure and the listed control status.`,
    };
}

function restraintControlStatusFromEffect(effect = {}) {
    const text = `${effect.effectType || ''} ${effect.description || ''} ${effect.bodyPart || ''}`.toLowerCase();
    if (/\b(bound|bind|binds|binding|tied|ties|chain|chained|roped)\b/.test(text)) return 'bound';
    if (/\b(pin|pins|pinned|press(?:es|ed)? down|hold(?:s|ing)? down)\b/.test(text)) return 'pinned';
    if (/\b(immobiliz|immobilis|paralyz|paralys)\b/.test(text)) return 'immobilized';
    if (/\b(drag|drags|dragged|carry|carries|carried|force(?:s|d)? position)\b/.test(text)) return 'forced position';
    return 'restrained';
}

function effectOutcomeLanded(outcome) {
    const landedCount = Number(outcome?.LandedActions ?? 0);
    return Number.isFinite(landedCount) && landedCount > 0;
}

function deriveUserAttackFatalInjury({ outcome, combatActionSequence, userAttackDie, harmMode = 'none', primaryTarget, primaryTargetCore, trackerSnapshot, hiddenHealthSnapshot }) {
    if (!combatActionSequence) return null;
    if (!isReal(primaryTarget)) return null;
    if (normalizeResolutionHarmMode(harmMode, { challengeType: 'mundane_combat', rollNeeded: 'Y' }) !== 'lethal') return null;

    const existingCondition = normalizeTrackerCondition(trackerSnapshot?.[primaryTarget]?.condition);
    const targetRank = String(primaryTargetCore?.Rank || trackerSnapshot?.[primaryTarget]?.currentCoreStats?.Rank || 'none');
    const instantKill = Number(userAttackDie) === 20 && outcome?.OutcomeTier === 'Critical_Success';
    const finishOffKill = ['badly_wounded', 'critical'].includes(existingCondition);
    if (!instantKill && !finishOffKill) return null;
    if (instantKill && targetRank === 'Boss' && !bossAtOrBelowHalfHealth(primaryTarget, hiddenHealthSnapshot)) {
        return {
            NPC: primaryTarget,
            condition: 'critical',
            woundsAdd: [],
            statusAdd: [],
            severity: 'critical',
            bodyPart: 'body',
            effectType: 'boss_critical_damage',
            sourceAction: 'boss_nat20_critical_damage',
            DamageAmount: 18,
            FatalityTrigger: 'blocked_boss_above_half_hp',
            NarrationRule: `${primaryTarget} is a Boss-rank target above half hidden health, so this natural 20 Critical_Success cannot instantly kill them. Render the hit as an exceptional, concrete, non-fatal blow that deals massive damage and proves the attack mattered, but do not narrate death, collapse as final defeat, escape, or a trivialized encounter.`,
        };
    }

    const trigger = instantKill
        ? 'nat20_critical_success'
        : `finish_off_${existingCondition}`;

    return {
        NPC: primaryTarget,
        condition: 'dead',
        woundsAdd: [],
        statusAdd: [],
        severity: 'fatal',
        bodyPart: 'body',
        effectType: 'fatal_user_attack',
        sourceAction: trigger,
        FatalityTrigger: trigger,
        NarrationRule: instantKill
            ? `${primaryTarget} is killed by this exceptional user attack result: harmMode=lethal, natural 20, and Critical_Success. Render the kill as decisive, cinematic, concrete, and rewarding; do not soften it into a wound, near miss, survival, escape, or unresolved struggle. The target is dead.`
            : `${primaryTarget} was already ${existingCondition}; this landed combat hit deterministically finishes them. Render the result as a clear fatal finish, not another wound or continued fighting. The target is dead.`,
    };
}

function bossAtOrBelowHalfHealth(primaryTarget, hiddenHealthSnapshot) {
    const actor = getHealthActor(hiddenHealthSnapshot, { targetType: 'npc', name: primaryTarget });
    if (!actor) return false;
    const maxHp = Math.max(1, Math.floor(Number(actor.maxHp || 1)));
    const currentHp = Math.max(0, Math.floor(Number(actor.currentHp ?? maxHp)));
    return currentHp <= Math.floor(maxHp / 2);
}

function buildFallbackCombatInflictedInjury({ outcome, combatActionSequence, primaryTarget, harmMode = 'none' }) {
    if (!combatActionSequence || !isReal(primaryTarget) || !effectOutcomeLanded(outcome)) return null;
    const mode = normalizeResolutionHarmMode(harmMode, { challengeType: 'mundane_combat', rollNeeded: 'Y' });
    if (!harmModeAllowsHpDamage(mode)) return null;
    const severity = severityFromOutcomeAndText(outcome, '');
    const condition = conditionFromInflictedSeverity(severity);
    return {
        NPC: primaryTarget,
        condition,
        woundsAdd: [],
        statusAdd: [],
        severity,
        bodyPart: 'body',
        effectType: 'physical_injury',
        sourceAction: 'fallback_combat_damage',
        HarmMode: mode,
        InjuryDetailMode: 'narrator_contextual',
        InjurySeverityLimit: severity,
        NarrationRule: `${primaryTarget} takes deterministic combat damage from the landed user attack. Narrate a concrete physical hit and impairment appropriate to the attack context, but do not exceed ${severity} severity. ${mode === 'nonlethal' ? 'This is nonlethal damage; if the target drops, render defeat or incapacitation rather than death.' : 'This is lethal damage; if the target drops from this damage, death is allowed only when injuryOrDeath and hidden health establish it.'}`,
    };
}

function collectHiddenHealthEvents({ ledger, resolutionPacket, aggression, context, healthBefore }) {
    const events = [];
    const harmMode = normalizeResolutionHarmMode(resolutionPacket?.harmMode, resolutionPacket);
    const userActionDealsHpDamage = harmModeAllowsHpDamage(harmMode);
    const userActionNonlethalDamage = harmMode === 'nonlethal';

    for (const injury of resolutionPacket?.InflictedInjuries || []) {
        if (!isReal(injury?.NPC)) continue;
        if (!userActionDealsHpDamage || injury?.NoHpDamage === 'Y') continue;
        const fatal = harmMode === 'lethal' && (injury?.condition === 'dead' || injury?.severity === 'fatal');
        const damageOverride = Math.max(0, Math.floor(Number(injury?.DamageAmount || injury?.damageAmount || 0)));
        const amount = fatal
            ? 999
            : damageOverride || damageForOutcomeTier(resolutionPacket?.OutcomeTier) || damageForSeverity(injury?.severity);
        if (amount <= 0 && !fatal) continue;
        events.push({
            kind: 'damage',
            targetType: 'npc',
            target: injury.NPC,
            amount,
            fatal,
            nonlethal: userActionNonlethalDamage,
            defeatedCondition: 'incapacitated',
            source: 'user_action',
        });
    }

    const userInjury = aggression?.userTrackerDelta;
    if (shouldApplyDeterministicResultInjury(userInjury)) {
        const fatal = userInjury?.condition === 'dead' || userInjury?.severity === 'fatal';
        const amount = fatal ? 999 : damageForSeverity(userInjury?.severity);
        if (amount > 0 || fatal) {
            events.push({
                kind: 'damage',
                targetType: 'user',
                amount,
                fatal,
                nonlethal: false,
                source: 'npc_aggression',
            });
        }
    }

    for (const item of aggression?.npcTrackerDeltas || []) {
        const injury = item?.injury;
        const name = item?.NPC || injury?.target || injury?.NPC;
        if (!isReal(name) || !shouldApplyDeterministicResultInjury(injury)) continue;
        const fatal = injury?.condition === 'dead' || injury?.severity === 'fatal';
        const amount = fatal ? 999 : damageForSeverity(injury?.severity);
        if (amount <= 0 && !fatal) continue;
        events.push({
            kind: 'damage',
            targetType: 'npc',
            target: name,
            amount,
            fatal,
            nonlethal: false,
            source: 'npc_aggression',
        });
    }

    events.push(...collectHiddenHealingEvents({ ledger, resolutionPacket, context, healthBefore }));
    events.push(...collectHiddenNaturalRecoveryEvents({ ledger, resolutionPacket, context, healthBefore }));
    return events;
}

function collectHiddenHealingEvents({ ledger, resolutionPacket, context, healthBefore }) {
    const semantic = ledger?.resolutionEngine || {};
    const healing = classifyHealingAttempt(semantic, resolutionPacket?.GOAL, context);
    if (!healing.isHealing) return [];

    const targets = resolveHealingHealthTargets(semantic, resolutionPacket, healthBefore, context);
    if (!targets.length) return [];

    const activeStakes = healing.isHealing && resolutionPacket?.activeHostileThreat === 'Y';
    const landed = activeStakes
        ? ['Success', 'Minor_Success', 'Moderate_Success', 'Critical_Success'].includes(String(resolutionPacket?.OutcomeTier || ''))
        : true;
    if (!landed) return [];

    const amount = activeStakes
        ? healing.isMagic
            ? magicHealAmountForOutcomeTier(resolutionPacket?.OutcomeTier)
            : naturalHealAmountForOutcomeTier(resolutionPacket?.OutcomeTier)
        : safeSceneHealingAmount(healing.isMagic);
    if (amount <= 0) return [];

    return targets.map(target => ({
        kind: 'heal',
        targetType: target.targetType,
        target: target.name,
        amount,
        naturalTreatment: healing.isMagic ? 'N' : 'Y',
        treatmentKey: target.treatmentKey,
        source: healing.isMagic ? 'magic_healing' : 'natural_treatment',
    }));
}

function collectHiddenNaturalRecoveryEvents({ ledger, resolutionPacket, context, healthBefore }) {
    if (!isSafeRecoveryCompleteTurn(ledger, resolutionPacket, context)) return [];

    const health = normalizeHiddenHealth(healthBefore);
    const amount = naturalFullRecoveryAmount();
    const events = [];
    if (health.user.currentHp < health.user.maxHp && !health.user.dead) {
        events.push({ kind: 'recovery', targetType: 'user', amount, source: 'natural_recovery' });
    }
    for (const [name, actor] of Object.entries(health.npcs || {})) {
        if (!isReal(name) || actor.dead || actor.currentHp >= actor.maxHp) continue;
        events.push({ kind: 'recovery', targetType: 'npc', target: name, amount, source: 'natural_recovery' });
    }
    return events;
}

function classifyHealingAttempt(semantic, goal, context) {
    const source = [
        semanticSourceText({ ...semantic, identifyGoal: goal }),
        getLatestUserTextFromContext(context),
        semantic?.userAbilityUse?.AbilityName,
        semantic?.userAbilityUse?.NarrativeEffect,
        semantic?.userAbilityUse?.Evidence,
    ].filter(Boolean).join(' ').toLowerCase();
    const healingWords = /\b(?:heal|heals|healing|cure|cures|curing|mend|mends|mending|restore|restores|restoring|regenerate|regenerates|regenerating|close(?:s|d|ing)?\s+(?:the\s+)?wound|seal(?:s|ed|ing)?\s+(?:the\s+)?wound|treat|treats|treating|first[-\s]?aid|bandage|bandages|bandaged|bandaging|dress(?:es|ed|ing)?\s+(?:the\s+)?wound|stitch(?:es|ed|ing)?|splint|splints|splinted|splinting|medicine|medic|salve|ointment|poultice|stabili[sz](?:e|es|ed|ing))\b/;
    const isHealing = healingWords.test(source);
    const ability = semantic?.userAbilityUse || {};
    const abilityUsed = bool(ability.Used) || bool(ability.Available) || bool(ability.Attempted);
    const magicWords = /\b(?:magic|magical|spell|cast|casts|casting|mana|divine|holy|prayer|miracle|ritual|regeneration|regenerate|restoration|healing\s+light|healing\s+spell)\b/;
    const isMagic = isHealing && (abilityUsed || magicWords.test(source));
    return { isHealing, isMagic };
}

function resolveHealingHealthTargets(semantic, resolutionPacket, healthBefore, context) {
    const source = [
        semanticSourceText(semantic),
        getLatestUserTextFromContext(context),
    ].filter(Boolean).join(' ').toLowerCase();
    const targets = [];
    const addUser = () => targets.push({
        targetType: 'user',
        name: '',
        treatmentKey: healingTreatmentKeyForTarget(healthBefore, { targetType: 'user' }),
    });
    const addNpc = name => {
        if (!isReal(name)) return;
        if (targets.some(item => item.targetType === 'npc' && sameName(item.name, name))) return;
        targets.push({
            targetType: 'npc',
            name,
            treatmentKey: healingTreatmentKeyForTarget(healthBefore, { targetType: 'npc', name }),
        });
    };

    if (/\b(?:my|myself|me|own)\b.{0,80}\b(?:wound|injur|hurt|bleed|burn|poison|pain|bruise|cut|broken|fracture|sprain|heal|cure|treat|bandage|first[-\s]?aid)\b/.test(source)
        || /\b(?:heal|cure|treat|bandage|stabiliz|mend|restore)\b.{0,80}\b(?:my|myself|me|own)\b/.test(source)) {
        addUser();
    }

    for (const name of toRealArray(resolutionPacket?.ActionTargets)) {
        addNpc(name);
    }

    if (!targets.length) {
        const health = normalizeHiddenHealth(healthBefore);
        if (health.user.currentHp < health.user.maxHp || source.includes('{{user}}')) addUser();
    }

    return targets.slice(0, 3);
}

function healingTreatmentKeyForTarget(healthBefore, target) {
    const health = normalizeHiddenHealth(healthBefore);
    const actor = target?.targetType === 'user'
        ? health.user
        : health.npcs?.[target?.name];
    if (!actor) return 'unknown';
    return actor.lastDamageStateKey || 'no-damage';
}

function isSafeRecoveryCompleteTurn(ledger, resolutionPacket, context) {
    if (resolutionPacket?.activeHostileThreat === 'Y') return false;
    const targets = resolutionPacket || {};
    if (toRealArray(targets?.hostilesInScene?.NPC).length) return false;
    if (toRealArray(targets?.OppTargets?.NPC).length) return false;
    if (toRealArray(targets?.OppTargets?.ENV).length) return false;

    const source = [
        getLatestUserTextFromContext(context),
        ledger?.resolutionEngine?.identifyGoal,
        ledger?.resolutionEngine?.identifyChallenge,
        ledger?.resolutionEngine?.explicitMeans,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!source) return false;
    const completedRecoveryTransition = /\b(?:by\s+(?:the\s+)?(?:next\s+)?morning|the\s+next\s+(?:morning|day)|after\s+(?:a|one|the)\s+(?:safe\s+)?(?:night|day)|after\s+(?:several|a few|many)\s+(?:quiet\s+|safe\s+)?(?:hours|days)|overnight|through\s+the\s+night|night\s+passes|day\s+passes|time\s+skip|time\s+passes|safe\s+lodging|safe\s+rest|long\s+rest|full\s+rest|recovery\s+time|downtime|convalesc(?:e|es|ed|ing)|recuperat(?:e|es|ed|ing)|rest(?:s|ed|ing)?\s+(?:safely|undisturbed|without\s+interruption|for\s+the\s+night|until\s+morning)|sleep(?:s|ing)?\s+(?:safely|undisturbed|through\s+the\s+night|until\s+morning))\b/.test(source);
    if (!completedRecoveryTransition) return false;
    const unsafeContext = /\b(?:dungeon|battlefield|combat|fight|ambush|pursuit|chase|hostile|enemy|enemies|danger|dangerous|unsafe|threat|threatening|under\s+attack|siege|trap|trapped|monster|monsters|guarded|patrolled|wilderness\s+danger)\b/.test(source)
        && !/\b(?:safe|safely|secure|secured|protected|sheltered|inn|lodging|town|village|home|sanctuary|healer|clinic|temple|hospital|camp\s+is\s+secure|no\s+danger)\b/.test(source);
    return !unsafeContext;
}

function repairLivingOppositionTargets(targets, classifier, options = {}, audit) {
    const repaired = {
        hostilesInScene: {
            NPC: toRealArray(targets.hostilesInScene?.NPC),
        },
        ActionTargets: toRealArray(targets.ActionTargets),
        OppTargets: {
            NPC: toRealArray(targets.OppTargets?.NPC),
            ENV: toRealArray(targets.OppTargets?.ENV),
        },
        BenefitedObservers: toRealArray(targets.BenefitedObservers),
        HarmedObservers: toRealArray(targets.HarmedObservers),
        NPCAwareOfUser: toRealArray(targets.NPCAwareOfUser),
        PowerActors: toRealArray(targets.PowerActors),
    };
    if (options.rollNeeded !== 'Y') return repaired;
    if (firstReal(repaired.OppTargets.NPC)) return repaired;
    if (firstReal(repaired.OppTargets.ENV)) return repaired;

    const livingActionTarget = firstReal(repaired.ActionTargets.filter(name => classifier.isLiving(name)));
    if (!livingActionTarget) return repaired;
    if (isCooperativeAidAction(options.semantic, options.goal)) {
        audit?.push(`2.4f cooperativeAidNoLivingOppositionRepair=${compact({
            hardRule: 'stakes-bearing cooperative aid/treatment to a living ActionTarget does not make that helped NPC the opposition',
            target: livingActionTarget,
        })}`);
        return repaired;
    }
    if (isDirectedCompanionCommandAction(options.semantic, options.goal, repaired, options.context)) {
        audit?.push(`2.4f directedCompanionCommandNoLivingOppositionRepair=${compact({
            hardRule: 'a directed ally command does not make the commanded ally the opposition; hostile selection uses hostilesInScene',
            target: livingActionTarget,
        })}`);
        return repaired;
    }

    repaired.OppTargets.NPC = unique([...repaired.OppTargets.NPC, livingActionTarget]);
    audit?.push(`2.4f deterministicLivingOppositionRepair=${compact({
        hardRule: 'stakes-bearing living ActionTarget cannot resolve against ENV; use that target as OppTargets.NPC when semantic omitted living opposition',
        target: livingActionTarget,
    })}`);
    return repaired;
}

function repairStealthTargets(targets, classifier, semantic, options = {}, audit) {
    const repaired = {
        hostilesInScene: {
            NPC: toRealArray(targets.hostilesInScene?.NPC),
        },
        ActionTargets: toRealArray(targets.ActionTargets),
        OppTargets: {
            NPC: toRealArray(targets.OppTargets?.NPC),
            ENV: toRealArray(targets.OppTargets?.ENV),
        },
        BenefitedObservers: toRealArray(targets.BenefitedObservers),
        HarmedObservers: toRealArray(targets.HarmedObservers),
        NPCAwareOfUser: toRealArray(targets.NPCAwareOfUser),
        PowerActors: toRealArray(targets.PowerActors),
    };
    if (normalizeChallengeType(semantic?.challengeType, options.rollNeeded || 'Y') !== 'stealth') return { targets: repaired };

    const before = targetSummary(repaired);
    const target = firstReal(unique([
        ...toRealArray(repaired.OppTargets.NPC),
        ...toRealArray(repaired.ActionTargets),
    ]).filter(name => classifier.isLiving(name)));

    if (!target) {
        repaired.OppTargets.NPC = [];
        repaired.OppTargets.ENV = [];
        audit?.push(`2.4f.2 deterministicStealthNoVisibleDetectorNoRoll=${compact({
            hardRule: 'stealth requires a specific established living detector/opponent from semantic targets; terrain, darkness, cover, crowds, weather, distance, and noise are not stealth opposition',
            from: before,
            to: targetSummary(repaired),
        })}`);
        return {
            targets: repaired,
            rollNeeded: 'N',
            rule: 'deterministic_stealth_no_visible_detector',
            rollReason: 'stealth attempt has no established living detector/opponent; no stealth contest roll',
            challengeType: 'none',
            socialTactic: 'none',
        };
    }

    let changed = false;
    if (!repaired.ActionTargets.some(name => sameName(name, target))) {
        repaired.ActionTargets.push(target);
        changed = true;
    }
    if (!repaired.OppTargets.NPC.some(name => sameName(name, target))) {
        repaired.OppTargets.NPC.push(target);
        changed = true;
    }
    if (repaired.OppTargets.ENV.length) {
        repaired.OppTargets.ENV = [];
        changed = true;
    }
    repaired.BenefitedObservers = repaired.BenefitedObservers.filter(name => !sameName(name, target));
    repaired.HarmedObservers = repaired.HarmedObservers.filter(name => !sameName(name, target));
    if (changed || options.rollNeeded !== 'Y' || options.challengeType !== 'stealth') {
        audit?.push(`2.4f.2 deterministicStealthRepair=${compact({
            hardRule: 'stealth resolves against the specific living detector/opponent, not ENV',
            target,
            rollNeeded: `${options.rollNeeded || 'N'}->Y`,
            challengeType: `${options.challengeType || 'none'}->stealth`,
            from: before,
            to: targetSummary(repaired),
        })}`);
    }
    return {
        targets: repaired,
        rollNeeded: 'Y',
        rule: 'deterministic_stealth_contest_living_detector',
        rollReason: options.rollNeeded === 'Y'
            ? null
            : 'stealth contest against an established living detector/opponent',
        challengeType: 'stealth',
        socialTactic: 'none',
    };
}

function repairStakeBearingClaimTargets(targets, classifier, semantic, options = {}, audit) {
    const repaired = {
        hostilesInScene: {
            NPC: toRealArray(targets.hostilesInScene?.NPC),
        },
        ActionTargets: toRealArray(targets.ActionTargets),
        OppTargets: {
            NPC: toRealArray(targets.OppTargets?.NPC),
            ENV: toRealArray(targets.OppTargets?.ENV),
        },
        BenefitedObservers: toRealArray(targets.BenefitedObservers),
        HarmedObservers: toRealArray(targets.HarmedObservers),
        NPCAwareOfUser: toRealArray(targets.NPCAwareOfUser),
        PowerActors: toRealArray(targets.PowerActors),
    };
    if (options.rollNeeded !== 'Y' || !isStakeBearingUntrustedClaim(semantic?.claimCheck)) return repaired;

    const claim = normalizeClaimCheckForHandoff(semantic.claimCheck);
    const target = claim.TargetNPC;
    if (!isReal(target)) return repaired;
    if (!classifier.isLiving(target)) {
        audit?.push(`2.4f.1 stakeBearingClaimTargetRepairSkipped=${compact({
            hardRule: 'ResolutionEngine.claimCheck target must be a living NPC to create living social opposition',
            target,
            claim: claim.Claim,
        })}`);
        return repaired;
    }

    let changed = false;
    if (!repaired.ActionTargets.some(name => sameName(name, target))) {
        repaired.ActionTargets.push(target);
        changed = true;
    }
    if (!repaired.OppTargets.NPC.some(name => sameName(name, target))) {
        repaired.OppTargets.NPC.push(target);
        changed = true;
    }
    repaired.BenefitedObservers = repaired.BenefitedObservers.filter(name => !sameName(name, target));
    repaired.HarmedObservers = repaired.HarmedObservers.filter(name => !sameName(name, target));
    repaired.OppTargets.ENV = repaired.OppTargets.ENV.filter(name => !sameName(name, target));

    if (changed) {
        audit?.push(`2.4f.1 stakeBearingClaimTargetRepair=${compact({
            hardRule: 'ResolutionEngine.claimCheck: stakes-bearing untrusted factual claim targets the NPC as living social opposition',
            target,
            truthStatus: claim.TruthStatus,
            npcAccess: claim.NPCAccess,
        })}`);
    }
    return repaired;
}

function isDirectedCompanionCommandAction(semantic, goal, targets, context) {
    const latestUserText = relationshipText(getLatestUserTextFromContext(context));
    const actionTargets = toRealArray(targets?.ActionTargets);
    return actionTargets.some(name => {
        const command = directedCompanionCommandText(name, latestUserText);
        return command && (isDirectedCompanionAttackCommandText(command) || isDirectedCompanionDefensiveCommandText(command));
    });
}

function getDirectedCompanionCommandNoRollEvidence(semantic, targets, trackerSnapshot, classifier, context) {
    const latestUserText = relationshipText(getLatestUserTextFromContext(context));
    if (!latestUserText) return null;
    const commands = directedCompanionCommandItems(targets, trackerSnapshot, classifier, latestUserText);
    if (!commands.length) return null;

    const companionKeys = new Set(commands.map(item => normalizeNameKey(item.name)));
    const otherDirectTargets = toRealArray(targets?.ActionTargets).filter(name => !companionKeys.has(normalizeNameKey(name)));
    const commandSource = [
        ...commands.map(item => item.command),
        semanticSourceText(semantic),
    ].filter(Boolean).join(' ');
    const requestedHostileTargets = otherDirectTargets.filter(name =>
        isRequestedHostileCompanionTarget(name, commandSource, trackerSnapshot, classifier)
    );
    const unresolvedDirectTargets = otherDirectTargets.filter(name =>
        !requestedHostileTargets.some(hostile => sameName(hostile, name))
    );
    if (unresolvedDirectTargets.length || toRealArray(targets?.HarmedObservers).length) return null;

    const source = semanticSourceText(semantic);
    if (!looksLikeCompanionCommandGoal(source)
        && !looksLikeCompanionCommandGoal(commandSource)
        && !commands.some(item => source.includes(normalizeNameKey(item.name)))) {
        return null;
    }

    return {
        rollNeeded: 'N',
        rule: 'hard_override_companion_command_request_only',
        companions: commands.map(item => item.name),
        commands: commands.map(item => item.command),
        evidence: {
            hardRule: 'ResolutionEngine.rollNeeded: direct ally/companion commands are tactical requests, not user-resolved attempts to make the NPC act',
            from: bool(semantic?.rollNeeded) ? 'Y' : 'N',
            to: 'N',
            companions: commands.map(item => item.name),
            requestedHostiles: requestedHostileTargets,
            evidence: source.slice(0, 220),
        },
    };
}

function isRequestedHostileCompanionTarget(name, commandSource, trackerSnapshot, classifier) {
    if (!classifier?.isLiving?.(name)) return false;
    if (!sourceMentionsNpcOrAlias(commandSource, { NPC: name, ...normalizeTrackerEntry(trackerSnapshot?.[name] || {}) })) return false;
    return trackerEntryLooksHostile(trackerSnapshot?.[name]);
}

function directedCompanionCommandItems(targets, trackerSnapshot, classifier, latestUserText) {
    const actionTargets = toRealArray(targets?.ActionTargets);
    const trackerCompanions = Object.entries(trackerSnapshot || {})
        .filter(([name, entry]) => isLikelyCompanionCommandTarget(name, entry, classifier))
        .map(([name]) => name);
    const names = unique([...actionTargets, ...trackerCompanions]);
    return names
        .map(name => ({ name, command: directedCompanionCommandText(name, latestUserText) }))
        .filter(item => item.command && (
            isDirectedCompanionAttackCommandText(item.command)
            || isDirectedCompanionDefensiveCommandText(item.command)
        ));
}

function isLikelyCompanionCommandTarget(name, entry, classifier) {
    if (!classifier?.isLiving?.(name)) return false;
    const normalized = normalizeTrackerEntry(entry || {});
    const fin = normalized.currentDisposition || { B: 2, F: 2, H: 2 };
    return Number(fin.B || 0) >= 2
        && Number(fin.F || 0) <= 2
        && Number(fin.H || 0) <= 2
        && (normalized.dominantLock || 'None') === 'None';
}

function looksLikeCompanionCommandGoal(source) {
    const text = String(source || '').toLowerCase();
    return /\b(?:command|order|tell|ask|signal|gesture|call|shout|yell|snap)\b.{0,120}\b(?:ally|companion|partner|friend|seraphina|npc)\b/.test(text)
        || /\b(?:ally|companion|partner|friend|seraphina|npc)\b.{0,120}\b(?:attack|hit|strike|cover|protect|guard|block|intercept|help|save|stop)\b/.test(text)
        || /\b(?:orderallyattack|commandcompanionattack|orderally|commandcompanion|tactical request)\b/.test(text.replace(/\s+/g, ''));
}

function normalizeDirectedCompanionCommandTargets(targets, classifier, semantic, trackerSnapshot, context, audit) {
    const latestUserText = relationshipText(getLatestUserTextFromContext(context));
    const hostilesInScene = toRealArray(targets?.hostilesInScene?.NPC);
    const actionTargets = toRealArray(targets?.ActionTargets);
    const companionTargets = directedCompanionCommandItems(targets, trackerSnapshot, classifier, latestUserText).map(item => item.name);
    const companionKeys = new Set(companionTargets.map(normalizeNameKey));
    const commandSource = [
        ...companionTargets.map(name => directedCompanionCommandText(name, latestUserText)),
        semanticSourceText(semantic),
    ].filter(Boolean).join(' ').toLowerCase();
    const commandMentionedHostiles = [
        ...toRealArray(targets?.OppTargets?.NPC),
        ...actionTargets.filter(name => !companionKeys.has(normalizeNameKey(name))),
        ...toRealArray(targets?.HarmedObservers),
    ].filter(name => classifier.isLiving(name) && sourceMentionsNpcOrAlias(commandSource, { NPC: name }));
    const normalized = {
        hostilesInScene: { NPC: unique([...hostilesInScene, ...commandMentionedHostiles]) },
        ActionTargets: companionTargets,
        OppTargets: { NPC: [], ENV: toRealArray(targets?.OppTargets?.ENV) },
        BenefitedObservers: [],
        HarmedObservers: [],
        NPCAwareOfUser: toRealArray(targets?.NPCAwareOfUser),
        PowerActors: toRealArray(targets?.PowerActors),
    };
    audit?.push(`2.4c.1 directedCompanionCommandTargetNormalization=${compact({
        hardRule: 'ally commands are request-only; keep addressed companion as ActionTarget, preserve hostile pool, and remove requested victims/beneficiaries from resolution routing until companion proactivity actually acts',
        from: targetSummary(targets),
        to: targetSummary(normalized),
    })}`);
    return normalized;
}

function repairDirectedCompanionAttackHostilePool(targets, ledger, trackerSnapshot, semantic, context, audit) {
    const repaired = {
        hostilesInScene: {
            NPC: toRealArray(targets.hostilesInScene?.NPC),
        },
        ActionTargets: toRealArray(targets.ActionTargets),
        OppTargets: {
            NPC: toRealArray(targets.OppTargets?.NPC),
            ENV: toRealArray(targets.OppTargets?.ENV),
        },
        BenefitedObservers: toRealArray(targets.BenefitedObservers),
        HarmedObservers: toRealArray(targets.HarmedObservers),
        NPCAwareOfUser: toRealArray(targets.NPCAwareOfUser),
        PowerActors: toRealArray(targets.PowerActors),
    };
    const latestUserText = relationshipText(getLatestUserTextFromContext(context));
    const companionCommands = repaired.ActionTargets
        .map(name => ({ name, command: directedCompanionCommandText(name, latestUserText) }))
        .filter(item => item.command && isDirectedCompanionAttackCommandText(item.command));
    const companionTargets = companionCommands.map(item => item.name);
    if (!companionTargets.length) return repaired;

    const source = [
        ...companionCommands.map(item => item.command),
        semanticSourceText(semantic),
    ].filter(Boolean).join(' ').toLowerCase();
    const hostileTarget = resolveHostileKnownTargetFromText(source, ledger, trackerSnapshot, companionTargets);
    if (!hostileTarget) return repaired;
    if (toRealArray(repaired.hostilesInScene.NPC).some(name => sameName(name, hostileTarget))) return repaired;

    repaired.hostilesInScene.NPC = unique([...repaired.hostilesInScene.NPC, hostileTarget]);
    audit?.push(`2.4f.1 directedCompanionAttackHostilePoolRepair=${compact({
        hardRule: 'explicit companion attack command may choose only an already-established hostile target; this repairs hostilesInScene, not OppTargets.NPC',
        companionTargets,
        target: hostileTarget,
    })}`);
    return repaired;
}

function resolveHostileKnownTargetFromText(source, ledger, trackerSnapshot, excludedNames = []) {
    const excluded = new Set(toRealArray(excludedNames).map(normalizeNameKey));
    const candidates = new Map();
    for (const [name, entry] of Object.entries(trackerSnapshot || {})) {
        if (excluded.has(normalizeNameKey(name)) || !trackerEntryLooksHostile(entry)) continue;
        candidates.set(normalizeNameKey(name), { NPC: name, ...normalizeTrackerEntry(entry) });
    }

    const hostile = Array.from(candidates.values());
    const exact = hostile.find(item => sourceMentionsNpcOrAlias(source, item));
    if (exact) return exact.NPC;
    return hostile.length === 1 && hasGenericHostileCommandTarget(source) ? hostile[0].NPC : null;
}

function hasGenericHostileCommandTarget(source) {
    return /\b(?:enemy|foe|hostile|attacker|raider|bandit|guard|ogre|orc|bear|monster|creature|beast|threat|whoever|whatever|him|her|them|it)\b/.test(String(source || '').toLowerCase());
}

function trackerEntryLooksHostile(entry) {
    const normalized = normalizeTrackerEntry(entry || {});
    const fin = normalized.currentDisposition || { B: 2, F: 2, H: 2 };
    return Number(fin.H || 0) >= 3
        || normalized.dominantLock === 'HOSTILITY'
        || String(normalized.personalitySummary || '').toLowerCase().includes('hostile');
}

function isCooperativeAidAction(semantic, goal) {
    const source = semanticSourceText({ ...semantic, identifyGoal: goal });
    if (!source) return false;
    if (hasCombatActionLanguage(source) || hasDirectBodilyAggression(source) || isBodyBoundaryPressure(source) || isObjectBoundaryContest(source)) {
        return false;
    }
    if (/\b(?:ask|asks|asking|question|questions|questioning|interview|interviews|interviewing|persuad\w*|convinc\w*|haggl\w*|bargain\w*|negotiat\w*|press(?:es|ed|ing)?|pressure|intimidat\w*|threaten\w*|coerc\w*)\b/.test(source)) {
        return false;
    }
    return /\b(?:aid|aids|aiding|help|helps|helping|heal|heals|healing|cure|cures|curing|treat|treats|treating|first[-\s]?aid|bandage|bandages|bandaged|bandaging|binds?\s+(?:the\s+)?wound|dress(?:es|ed|ing)?\s+(?:the\s+)?wound|stabiliz(?:e|es|ed|ing)|medicine|medic|splint|splints|splinted|splinting|set\s+(?:the\s+)?bone|carry|carries|carried|rescue|rescues|rescued|rescuing|pull\s+(?:him|her|them|[a-z]+)\s+(?:clear|free|out)|drag\s+(?:him|her|them|[a-z]+)\s+(?:clear|free|out)|shield|protect|comfort|steady|steadies|support)\b/.test(source);
}

function hasCombatActionLanguage(source) {
    return /\b(attack|assault|strike|hit|punch|kick|slash|stab|cut|shoot|shot|fireball|lightning|blast|burn|poison|paraly[sz]e|blind|stun|curse|hex|bind|electrocut|sword|dagger|knife|axe|spear|arrow)\b/.test(String(source || '').toLowerCase());
}

function severityFromOutcomeAndText(outcome, text) {
    if (/\b(sever(?:e|ely)|shatter(?:s|ed|ing)?|crush(?:es|ed|ing)?|mangle(?:s|d|ing)?|maim(?:s|ed|ing)?|crippl(?:e|es|ed|ing)|paraly[sz](?:e|es|ed|ing)?|amputat(?:e|es|ed|ing)|sever(?:s|ed|ing)?|immobili[sz](?:e|es|ed|ing)|unconscious|life[-\s]?threatening)\b/.test(text)) {
        return outcome?.Outcome === 'light_impact' ? 'moderate' : 'severe';
    }
    if (/\b(break|breaks|broken|fractur(?:e|es|ed|ing)|dislocat(?:e|es|ed|ing)|electrocut(?:e|es|ed|ing)|lightning|poison(?:s|ed|ing)?|disease|curse|hex|blind(?:s|ed|ing)?|stun(?:s|ned|ning)?|terrif(?:y|ies|ied)|panic(?:s|ked|king)?)\b/.test(text)) {
        return outcome?.Outcome === 'light_impact' ? 'moderate' : 'severe';
    }
    if (outcome?.Outcome === 'dominant_impact') return 'severe';
    if (outcome?.Outcome === 'solid_impact') return 'moderate';
    return 'minor';
}

function normalizeInjuryEffectCandidates(value) {
    const rawItems = Array.isArray(value?.effects)
        ? value.effects
        : Array.isArray(value)
            ? value
            : [];
    return rawItems.map(item => {
        const target = cleanText(item?.target || item?.NPC || item?.name);
        const effectType = normalizeEffectType(item?.effectType || item?.type || item?.kind);
        return {
            target,
            targetRole: normalizeEffectTargetRole(item?.targetRole || item?.role),
            effectType,
            bodyPart: cleanText(item?.bodyPart || item?.body || item?.affectedArea) || defaultBodyPartForEffect(effectType),
            description: cleanText(item?.description || item?.effect || item?.injury || item?.status || effectType),
            semanticSeverity: normalizeSemanticEffectSeverity(item?.severity || item?.severityFloor),
            persistence: normalizeEffectPersistence(item?.persistence),
            affectsAction: bool(item?.affectsAction ?? item?.impairs ?? item?.ongoing),
        };
    }).filter(effect =>
        isReal(effect.target)
        && effect.effectType !== 'none'
        && effect.persistence === 'lasting'
        && effect.affectsAction);
}

function injuryEffectTargetAllowed(effect, targets) {
    const target = effect?.target;
    if (!isReal(target)) return false;
    const role = normalizeEffectTargetRole(effect?.targetRole);
    const roleTargets = {
        opptarget: toRealArray(targets?.OppTargets?.NPC),
        opp_target: toRealArray(targets?.OppTargets?.NPC),
        harmedobserver: toRealArray(targets?.HarmedObservers),
        harmed_observer: toRealArray(targets?.HarmedObservers),
        actiontarget: toRealArray(targets?.ActionTargets),
        action_target: toRealArray(targets?.ActionTargets),
    }[role];
    if (roleTargets) return roleTargets.some(name => sameName(name, target));
    return [
        ...toRealArray(targets?.OppTargets?.NPC),
        ...toRealArray(targets?.HarmedObservers),
        ...toRealArray(targets?.ActionTargets),
    ].some(name => sameName(name, target));
}

function buildInflictedInjuryFromSemanticEffect(effect, outcome) {
    if (!effect) return null;
    const severity = severityFromOutcomeAndSemanticFloor(outcome, effect.semanticSeverity);
    const condition = conditionFromInflictedSeverity(severity);
    const bodyPart = effect.bodyPart || defaultBodyPartForEffect(effect.effectType);
    const label = semanticEffectLabel(effect, severity, bodyPart);
    const status = statusFromSemanticEffect(effect, bodyPart, severity);
    const functionText = humanizeInjuryFunctions(functionsFromImpairmentText(`${label} ${status}`, status ? 'status' : 'wound'));
    return {
        NPC: effect.target,
        condition,
        woundsAdd: effect.effectType === 'physical_injury' || effect.effectType === 'burn' || effect.effectType === 'electrical' ? [label] : [],
        statusAdd: status ? [status] : [],
        severity,
        bodyPart,
        effectType: effect.effectType,
        sourceAction: compactAttackSource(effect.description),
        NarrationRule: `${effect.target} suffers ${label}; narrate this as a lasting ${effect.effectType.replace(/_/g, ' ')} from the landed user action, and let it impair later actions involving ${functionText}.`,
    };
}

function mergeInflictedInjuries(injuries) {
    const merged = [];
    for (const injury of injuries || []) {
        if (!isReal(injury?.NPC)) continue;
        const existing = merged.find(item => sameName(item.NPC, injury.NPC));
        if (!existing) {
            merged.push(injury);
            continue;
        }
        existing.condition = worseTrackerCondition(existing.condition, injury.condition);
        existing.woundsAdd = applyListDelta(existing.woundsAdd || [], injury.woundsAdd, []);
        existing.statusAdd = applyListDelta(existing.statusAdd || [], injury.statusAdd, []);
        existing.severity = maxSeverity(existing.severity, injury.severity);
        existing.NarrationRule = `${existing.NarrationRule} ${injury.NarrationRule}`;
    }
    return merged;
}

function severityFromOutcomeAndSemanticFloor(outcome, floor) {
    const outcomeSeverity = outcome?.Outcome === 'dominant_impact'
        ? 'severe'
        : outcome?.Outcome === 'solid_impact'
            ? 'moderate'
            : 'minor';
    return maxSeverity(outcomeSeverity, floor || 'minor');
}

function maxSeverity(a, b) {
    const order = ['minor', 'moderate', 'severe', 'critical'];
    return order[Math.max(order.indexOf(a), order.indexOf(b), 0)] || 'minor';
}

function conditionFromInflictedSeverity(severity) {
    if (severity === 'critical') return 'critical';
    if (severity === 'severe') return 'badly_wounded';
    if (severity === 'moderate') return 'wounded';
    if (severity === 'minor') return 'bruised';
    return 'unchanged';
}

function semanticEffectLabel(effect, severity, bodyPart) {
    const description = cleanText(effect?.description);
    if (description && description.toLowerCase() !== effect?.effectType) {
        return `${severity} ${description}`.replace(/\s+/g, ' ').trim();
    }
    const base = {
        physical_injury: `${bodyPart} injury`,
        burn: `${bodyPart} burn`,
        poison: 'poisoning',
        paralysis: 'paralysis',
        disease: 'sickness',
        blindness: 'vision impairment',
        stun: 'stunning',
        fear: 'fear response',
        restraint: 'restraint',
        curse: 'affliction',
        electrical: 'electrical injury',
        exhaustion: 'exhaustion',
        mental_status: 'mental status effect',
        other_status: 'status effect',
    }[effect?.effectType] || 'status effect';
    return `${severity} ${base}`.replace(/\s+/g, ' ').trim();
}

function statusFromSemanticEffect(effect, bodyPart, severity) {
    if (severity === 'minor') return '';
    if (/\b(knee|leg|ankle|foot|feet|hip|thigh|shin|calf|lower body)\b/.test(bodyPart)) return `${severity} mobility impairment`;
    if (/\b(arm|wrist|hand|elbow|shoulder|upper body)\b/.test(bodyPart)) return `${severity} grip/combat impairment`;
    if (/\b(rib|ribs|chest|lung|lungs)\b/.test(bodyPart)) return `${severity} breathing impairment`;
    if (/\b(head|skull|temple)\b/.test(bodyPart)) return `${severity} focus/balance impairment`;
    if (/\b(eye|eyes)\b/.test(bodyPart)) return `${severity} vision impairment`;
    const map = {
        poison: 'systemic impairment',
        disease: 'systemic impairment',
        curse: 'systemic impairment',
        electrical: 'systemic impairment',
        burn: 'systemic impairment',
        paralysis: 'mobility impairment',
        restraint: 'mobility impairment',
        blindness: 'vision impairment',
        stun: 'focus impairment',
        fear: 'focus impairment',
        exhaustion: 'stamina impairment',
        mental_status: 'focus impairment',
        other_status: 'systemic impairment',
    };
    return `${severity} ${map[effect?.effectType] || 'physical impairment'}`;
}

function normalizeEffectType(value) {
    const text = cleanText(value).toLowerCase().replace(/[\s-]+/g, '_');
    const aliases = {
        injury: 'physical_injury',
        wound: 'physical_injury',
        physical: 'physical_injury',
        physical_injury: 'physical_injury',
        burn: 'burn',
        poison: 'poison',
        poisoned: 'poison',
        paralysis: 'paralysis',
        paralyzed: 'paralysis',
        disease: 'disease',
        sickness: 'disease',
        blindness: 'blindness',
        blind: 'blindness',
        stun: 'stun',
        stunned: 'stun',
        fear: 'fear',
        panic: 'fear',
        terror: 'fear',
        restraint: 'restraint',
        restrained: 'restraint',
        immobilized: 'restraint',
        curse: 'curse',
        cursed: 'curse',
        affliction: 'curse',
        electrical: 'electrical',
        lightning: 'electrical',
        exhaustion: 'exhaustion',
        mental: 'mental_status',
        mental_status: 'mental_status',
        status: 'other_status',
        other_status: 'other_status',
    };
    return aliases[text] || 'none';
}

function normalizeEffectTargetRole(value) {
    const text = cleanText(value).toLowerCase().replace(/[\s-]+/g, '_');
    return ['opptarget', 'opp_target', 'harmedobserver', 'harmed_observer', 'actiontarget', 'action_target', 'user'].includes(text)
        ? text
        : 'unknown';
}

function normalizeSemanticEffectSeverity(value) {
    const text = cleanText(value).toLowerCase().replace(/[\s-]+/g, '_');
    return ['minor', 'moderate', 'severe', 'critical'].includes(text) ? text : 'minor';
}

function normalizeEffectPersistence(value) {
    const text = cleanText(value).toLowerCase().replace(/[\s-]+/g, '_');
    if (['lasting', 'persistent', 'ongoing', 'continuing', 'yes', 'y', 'true'].includes(text)) return 'lasting';
    return 'none';
}

function defaultBodyPartForEffect(effectType) {
    if (['poison', 'disease', 'curse', 'electrical', 'exhaustion', 'mental_status', 'other_status'].includes(effectType)) return 'body';
    if (effectType === 'blindness') return 'eyes';
    if (effectType === 'fear' || effectType === 'stun') return 'mind';
    if (effectType === 'paralysis' || effectType === 'restraint') return 'body';
    return 'body';
}

function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function compactAttackSource(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160) || NONE;
}

function uniqueTextParts(values) {
    const seen = new Set();
    const result = [];
    for (const value of values || []) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}

function uniqueRealNames(values) {
    const result = [];
    for (const value of values || []) {
        const name = String(value || '').trim();
        if (!isReal(name)) continue;
        if (result.some(existing => sameName(existing, name))) continue;
        result.push(name);
    }
    return result;
}

function humanizeInjuryFunctions(functions) {
    const labels = {
        lower_body: 'lower-body movement',
        upper_body: 'upper-body movement',
        whole_body: 'whole-body movement',
        physical_exertion: 'physical exertion',
        mobility: 'mobility',
        balance: 'balance',
        stamina: 'stamina',
        focus: 'focus',
        grip: 'grip',
        torso: 'torso movement',
        breath: 'breathing',
        head: 'head stability',
        vision: 'vision',
        aim: 'aim',
        combat: 'combat',
        systemic: 'overall stamina and focus',
    };
    return unique(functions || []).map(item => labels[item] || String(item).replace(/_/g, ' ')).join(', ') || 'physical action';
}

function applyInflictedNpcInjuriesToTrackerUpdate(resolutionPacket, relationshipTrackerUpdate, trackerSnapshot, audit) {
    const merged = {};
    for (const [name, value] of Object.entries(relationshipTrackerUpdate || {})) {
        merged[name] = normalizeTrackerEntry(value);
    }

    const injuries = Array.isArray(resolutionPacket?.InflictedInjuries) ? resolutionPacket.InflictedInjuries : [];
    applyInflictedNpcInjuriesToNpcMap(merged, trackerSnapshot, injuries);
    Object.defineProperty(merged, '__inflictedInjuries', {
        value: injuries,
        enumerable: false,
        configurable: true,
    });

    audit.push(`STEP 6.4: APPLY DETERMINISTIC INFLICTED NPC INJURIES=${compact(injuries)}`);
    return merged;
}

function applyProactivityMemoryResults(trackerUpdate, handoffs, proactivityResults, dice, audit, rapportClock = normalizeRapportClock()) {
    const handoffMap = new Map((handoffs || []).map(handoff => [String(handoff?.NPC || '').toLowerCase(), handoff]));
    const updates = [];
    for (const [npc, result] of Object.entries(proactivityResults || {})) {
        if (!isReal(npc) || result?.Proactive !== 'Y') continue;
        const before = normalizeTrackerEntry(trackerUpdate?.[npc] || {});
        let memory = normalizeProactivityMemory(before.proactivityMemory);
        const handoff = handoffMap.get(String(npc).toLowerCase()) || {};
        const tag = selectedMemoryTag(result);
        let changed = false;
        if (isRomanceMajorTag(tag)) {
            memory = {
                ...memory,
                pendingTag: tag,
                pendingSince: memory.interchangeCount,
            };
            changed = true;
            if (tag === 'Ask_Date') {
                memory = {
                    ...memory,
                    b4Courtship: updateB4CourtshipOnAskDate(memory.b4Courtship, rapportClock.activeMs),
                };
                updates.push(`${npc}.${tag}.attempt=${memory.b4Courtship.askDateAttempts}/2`);
                if (memory.b4Courtship.askDateAttempts === 1) {
                    updates.push(`${npc}.${tag}.secondAttemptCooldown=2h->${memory.b4Courtship.askDateCooldownUntilActiveMs}`);
                }
            } else if (tag === 'Thoughtful_Gift') {
                memory = {
                    ...memory,
                    b4Courtship: updateB4CourtshipOnThoughtfulGift(memory.b4Courtship),
                };
                updates.push(`${npc}.${tag}.attempt=1/1`);
            }
            updates.push(`${npc}.${tag}.pending`);
        }
        if (isPartnerCooldownTag(tag)) {
            const cooldown = rollCooldown(dice, 4);
            memory = {
                ...memory,
                partnerMeaningfulCooldownUntilActiveMs: cooldownAvailableAtActiveTime(rapportClock, cooldown),
                lastMeaningfulPartnerTag: tag,
            };
            changed = true;
            updates.push(`${npc}.${tag}.meaningfulCooldown=1d4h(${cooldown})->${memory.partnerMeaningfulCooldownUntilActiveMs}`);
        }
        if (changed && trackerUpdate?.[npc]) {
            trackerUpdate[npc] = normalizeTrackerEntry({
                ...before,
                proactivityMemory: memory,
            });
            handoff.ProactivityMemory = trackerUpdate[npc].proactivityMemory;
        }
    }
    if (updates.length) {
        audit.push(`STEP 6.3b APPLY PROACTIVITY_MEMORY=${compact(updates)}`);
    }
}

function selectedMemoryTag(result) {
    if (result?.RomanceInitiative === 'Y') return result.RomanceInitiativeTag;
    if (result?.PartnerInitiative === 'Y') return result.PartnerInitiativeTag;
    return result?.Intent;
}

function rollCooldown(dice, sides) {
    if (sides === 50 && typeof dice?.d50 === 'function') return dice.d50();
    if (sides === 20 && typeof dice?.d20 === 'function') return dice.d20();
    return Math.floor(Math.random() * sides) + 1;
}

function cooldownAvailableAt(memory, cooldown) {
    return clamp(Number(memory?.interchangeCount || 0) + Number(cooldown || 0) + 1, 0, 1000000);
}

function cooldownAvailableAtActiveTime(rapportClock, hours) {
    const activeMs = Number(rapportClock?.activeMs || 0);
    return clamp(activeMs + Number(hours || 0) * PARTNER_MEANINGFUL_COOLDOWN_HOUR_MS, 0, 1000000000000);
}

function applyInflictedNpcInjuriesToNpcMap(npcs, trackerSnapshot, injuries) {
    for (const injury of injuries || []) {
        const name = injury?.NPC;
        if (!isReal(name)) continue;
        const before = normalizeTrackerEntry(npcs[name] || trackerSnapshot?.[name] || {});
        npcs[name] = normalizeTrackerEntry({
            ...before,
            condition: worseTrackerCondition(before.condition, injury.condition),
            wounds: applyListDelta(before.wounds, injury.woundsAdd, []),
            statusEffects: applyListDelta(before.statusEffects, injury.statusAdd, []),
        });
    }
}

function mergeNpcResultInjuryDelta(npcs, trackerSnapshot, npcName, injury) {
    if (!isReal(npcName) || !injury) return;
    const before = normalizeTrackerEntry(npcs[npcName] || trackerSnapshot?.[npcName] || {});
    npcs[npcName] = normalizeTrackerEntry({
        ...before,
        condition: worseTrackerCondition(before.condition, injury.condition),
        wounds: applyListDelta(before.wounds, injury.woundsAdd, []),
        statusEffects: applyListDelta(before.statusEffects, injury.statusAdd, []),
    });
}

function worseTrackerCondition(current, next) {
    const order = ['healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'incapacitated', 'dead'];
    const currentIndex = Math.max(0, order.indexOf(normalizeTrackerCondition(current)));
    const nextIndex = Math.max(0, order.indexOf(normalizeTrackerCondition(next)));
    return order[Math.max(currentIndex, nextIndex)] || 'healthy';
}

function applyUserResultInjuryDeltaToState(before, delta) {
    const source = normalizeTrackerUserState(before || {});
    const result = {
        ...source,
        condition: worseTrackerCondition(source.condition, delta?.condition),
        wounds: applyListDelta(source.wounds, delta?.woundsAdd, []),
        statusEffects: applyListDelta(source.statusEffects, delta?.statusAdd, []),
    };
    return normalizeTrackerUserState(result);
}

function deriveInflictedTargetInjuryFromAggression({ npc, target, proactivityResult, attackType, reactionOutcome, margin, resolutionPacket, refereeContext }) {
    if (!['npc_overpowers', 'npc_succeeds'].includes(reactionOutcome)) return null;
    const severity = severityFromAggressionResult(reactionOutcome, margin, resolutionPacket?.CounterPotential);
    const targetName = normalizeProactivityTarget(target, refereeContext);
    const targetIsUser = isUserProactivityTarget({ ProactivityTarget: targetName }, refereeContext);
    const contextHint = [
        `${npc}'s ${attackType}`,
        proactivityResult?.Intent,
        proactivityResult?.Impulse,
    ].filter(Boolean).join(', ');

    return {
        sourceNpc: npc,
        target: targetName,
        targetType: targetIsUser ? 'user' : 'npc',
        attackType,
        reactionOutcome,
        severity,
        condition: conditionFromInflictedSeverity(severity),
        woundsAdd: [],
        statusAdd: [],
        InjuryDetailMode: 'narrator_contextual',
        InjurySeverityLimit: severity,
        InjuryContextHint: contextHint,
        NarrationRule: targetIsUser
            ? `${npc}'s ${attackType} causes a ${severity} persistent injury; choose the concrete wound and affected body area from the attack context, but do not exceed ${severity} severity.`
            : `${npc}'s ${attackType} causes a ${severity} persistent injury to ${targetName}; choose the concrete wound and affected body area from the attack context, but do not exceed ${severity} severity.`,
    };
}

function severityFromAggressionResult(reactionOutcome, margin, counterPotential) {
    if (reactionOutcome === 'npc_overpowers') {
        if (counterPotential === 'severe' || margin >= 8) return 'severe';
        return 'moderate';
    }
    if (counterPotential === 'severe' && margin >= 3) return 'moderate';
    return 'minor';
}

function mergeUserResultInjuryDelta(current, injury) {
    const source = current || {
        condition: 'unchanged',
        woundsAdd: [],
        woundsRemove: [],
        statusAdd: [],
        statusRemove: [],
        gearAdd: [],
        gearRemove: [],
        inventoryAdd: [],
        inventoryRemove: [],
        tasksAdd: [],
        tasksRemove: [],
        commitmentsAdd: [],
        commitmentsRemove: [],
    };
    const currentCondition = source.condition === 'unchanged' ? 'healthy' : source.condition;
    return {
        ...source,
        condition: worseTrackerCondition(currentCondition, injury.condition),
        woundsAdd: applyListDelta(source.woundsAdd, injury.woundsAdd, []),
        statusAdd: applyListDelta(source.statusAdd, injury.statusAdd, []),
    };
}

const USER_IMPAIRMENT_STAGE = Object.freeze({
    none: { rank: 0, penalty: 0 },
    minor: { rank: 1, penalty: -1 },
    moderate: { rank: 2, penalty: -2 },
    severe: { rank: 3, penalty: -4 },
    critical: { rank: 4, penalty: -6 },
});

function noUserImpairment(reason = 'no relevant tracked user condition, wound, or status effect') {
    return {
        Relevant: 'N',
        Stage: 'none',
        RollPenalty: 0,
        AppliedToRoll: 'N',
        Source: NONE,
        SourceType: 'none',
        AffectedFunction: NONE,
        MatchedActionFunction: NONE,
        Reason: reason,
        NarrationRule: 'No tracked user impairment changes this action.',
    };
}

function noNpcImpairment(reason = 'no relevant tracked NPC condition, wound, or status effect') {
    return {
        Relevant: 'N',
        NPC: NONE,
        Stage: 'none',
        RollPenalty: 0,
        AppliedToRoll: 'N',
        Source: NONE,
        SourceType: 'none',
        AffectedFunction: NONE,
        MatchedActionFunction: NONE,
        Reason: reason,
        NarrationRule: 'No tracked NPC impairment changes this action.',
    };
}

function actionBlockingUserImpairment(user, actionFunctions, rollNeeded) {
    const condition = normalizeBlockingCondition(user?.condition);
    if (!isActionBlockingCondition(condition)) return null;
    if (condition === 'incapacitated' && actionIsPermittedIncapacitatedSpeech(actionFunctions, user)) return null;
    return {
        Relevant: 'Y',
        Stage: 'critical',
        RollPenalty: rollNeeded === 'Y' ? -999 : 0,
        AppliedToRoll: rollNeeded === 'Y' ? 'Y' : 'N',
        AutoFail: 'Y',
        Source: condition,
        SourceType: 'condition',
        AffectedFunction: 'meaningful voluntary action',
        MatchedActionFunction: unique(actionFunctions).join(', ') || 'action',
        Reason: condition === 'dead'
            ? '{{user}} is dead and cannot act'
            : '{{user}} is incapacitated and cannot complete meaningful voluntary actions',
        NarrationRule: condition === 'dead'
            ? '{{user}} is dead; the attempted action cannot occur.'
            : '{{user}} is incapacitated; the attempted action cannot succeed or meaningfully progress unless it is limited permitted speech.',
    };
}

function actionBlockingNpcImpairment(npcName, state, actionFunctions, rollNeeded) {
    const condition = normalizeBlockingCondition(state?.condition);
    if (!isActionBlockingCondition(condition)) return null;
    if (condition === 'incapacitated' && actionIsPermittedIncapacitatedSpeech(actionFunctions, state)) return null;
    return {
        Relevant: 'Y',
        NPC: npcName || NONE,
        Stage: 'critical',
        RollPenalty: rollNeeded === 'Y' ? -999 : 0,
        AppliedToRoll: rollNeeded === 'Y' ? 'Y' : 'N',
        AutoFail: 'Y',
        Source: condition,
        SourceType: 'condition',
        AffectedFunction: 'meaningful voluntary action',
        MatchedActionFunction: unique(actionFunctions).join(', ') || 'action',
        Reason: condition === 'dead'
            ? `${npcName || 'NPC'} is dead and cannot act`
            : `${npcName || 'NPC'} is incapacitated and cannot complete meaningful voluntary actions`,
        NarrationRule: condition === 'dead'
            ? `${npcName || 'NPC'} is dead; their attempted action cannot occur.`
            : `${npcName || 'NPC'} is incapacitated; their attempted action cannot succeed or meaningfully progress unless it is limited permitted speech.`,
    };
}

function normalizeBlockingCondition(value) {
    const text = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (text === 'defeated') return 'incapacitated';
    return text;
}

function isActionBlockingCondition(condition) {
    return condition === 'dead' || condition === 'incapacitated';
}

function actionIsPermittedIncapacitatedSpeech(actionFunctions = [], state = {}) {
    const functions = unique(actionFunctions);
    if (!functions.length || !functions.every(item => item === 'speech')) return false;
    const text = [
        ...(Array.isArray(state?.wounds) ? state.wounds : []),
        ...(Array.isArray(state?.statusEffects) ? state.statusEffects : []),
    ].join(' ').toLowerCase();
    return !/\b(unconscious|knocked out|asleep|sedated|drugged|gagged|mouth covered|muzzled|silenced|mute|voiceless|paraly[sz]ed|paralysis|frozen|stasis)\b/.test(text);
}

function evaluateUserImpairment(ledger, context, semantic, goal, userStat, rollNeeded, options = {}) {
    const user = getEffectiveUserImpairmentState(ledger, context);
    const sources = collectImpairmentSources(user, true);
    if (!sources.length) return noUserImpairment();
    const allowRollPenalty = options?.allowRollPenalty !== false;

    const actionText = [
        semantic?.identifyGoal,
        semantic?.identifyChallenge,
        semantic?.explicitMeans,
        goal,
        getLatestUserTextFromContext(context),
    ].filter(Boolean).join(' ');
    const actionFunctions = classifyUserActionFunctions(actionText, userStat);
    const actionBlock = actionBlockingUserImpairment(user, actionFunctions, rollNeeded);
    if (actionBlock) return actionBlock;
    if (!actionFunctions.length) return noUserImpairment('current action has no classifiable injured function');

    const matches = sources
        .map(source => ({
            source,
            matched: matchedImpairmentFunctions(source.functions, actionFunctions),
        }))
        .filter(item => item.matched.length);
    if (!matches.length) return noUserImpairment('tracked impairments do not affect this action');

    matches.sort((a, b) => USER_IMPAIRMENT_STAGE[b.source.stage].rank - USER_IMPAIRMENT_STAGE[a.source.stage].rank);
    const best = matches[0];
    const penalty = best.source.type === 'condition'
        ? hiddenHealthPenaltyForCondition(best.source.label)
        : USER_IMPAIRMENT_STAGE[best.source.stage]?.penalty ?? 0;
    const applied = rollNeeded === 'Y' && allowRollPenalty && penalty < 0 ? 'Y' : 'N';
    const matchedText = unique(best.matched).join(', ');
    const affectedText = unique(best.source.functions).join(', ');

    return {
        Relevant: 'Y',
        Stage: best.source.stage,
        RollPenalty: applied === 'Y' ? penalty : 0,
        AppliedToRoll: applied,
        Source: best.source.label,
        SourceType: best.source.type,
        AffectedFunction: affectedText || NONE,
        MatchedActionFunction: matchedText || NONE,
        Reason: `${best.source.label} affects ${matchedText || 'the attempted action'}`,
        NarrationRule: `User may attempt the action, but ${best.source.label} makes clean or easy execution inappropriate; narrate pain, limitation, compensation, instability, reduced speed, partial execution, or cost according to the computed outcome.`,
    };
}

function evaluateNpcImpairment(npcName, ledger, trackerSnapshot, semantic, goal, npcStat, rollNeeded, options = {}) {
    if (!isReal(npcName)) return noNpcImpairment('no NPC named');
    const npc = getEffectiveNpcImpairmentState(npcName, ledger, trackerSnapshot);
    const sources = collectImpairmentSources(npc, false);
    if (!sources.length) return noNpcImpairment();
    const allowRollPenalty = options?.allowRollPenalty !== false;

    const actionText = [
        semantic?.identifyGoal,
        semantic?.identifyChallenge,
        semantic?.explicitMeans,
        goal,
        npcStat,
        npcStat === 'PHY' ? 'resist defend brace struggle physical exertion combat' : '',
        npcStat === 'MND' ? 'focus resist think mental discipline concentration' : '',
        npcStat === 'CHA' ? 'speak negotiate resist socially presence composure' : '',
    ].filter(Boolean).join(' ');
    const actionFunctions = classifyUserActionFunctions(actionText, npcStat);
    const actionBlock = actionBlockingNpcImpairment(npcName, npc, actionFunctions, rollNeeded);
    if (actionBlock) return actionBlock;
    if (!actionFunctions.length) return noNpcImpairment('current NPC opposition has no classifiable injured function');

    const matches = sources
        .map(source => ({
            source,
            matched: matchedImpairmentFunctions(source.functions, actionFunctions),
        }))
        .filter(item => item.matched.length);
    if (!matches.length) return noNpcImpairment('tracked NPC impairments do not affect this roll');

    matches.sort((a, b) => USER_IMPAIRMENT_STAGE[b.source.stage].rank - USER_IMPAIRMENT_STAGE[a.source.stage].rank);
    const best = matches[0];
    const penalty = best.source.type === 'condition'
        ? hiddenHealthPenaltyForCondition(best.source.label)
        : USER_IMPAIRMENT_STAGE[best.source.stage]?.penalty ?? 0;
    const applied = rollNeeded === 'Y' && allowRollPenalty && penalty < 0 ? 'Y' : 'N';
    const matchedText = unique(best.matched).join(', ');
    const affectedText = unique(best.source.functions).join(', ');

    return {
        Relevant: 'Y',
        NPC: npcName,
        Stage: best.source.stage,
        RollPenalty: applied === 'Y' ? penalty : 0,
        AppliedToRoll: applied,
        Source: best.source.label,
        SourceType: best.source.type,
        AffectedFunction: affectedText || NONE,
        MatchedActionFunction: matchedText || NONE,
        Reason: `${npcName}'s ${best.source.label} affects ${matchedText || 'their roll'}`,
        NarrationRule: `${npcName} may still act, but ${best.source.label} makes clean or easy execution inappropriate; narrate pain, limitation, compensation, instability, reduced speed, partial execution, or cost according to the computed outcome.`,
    };
}

function evaluateNpcAggressionImpairment(npcName, trackerUpdate, trackerSnapshot, proactivityResult, aggressionStat = 'PHY') {
    if (!isReal(npcName)) return noNpcImpairment('no NPC named');
    const state = normalizeTrackerEntry(trackerUpdate?.[npcName] || trackerSnapshot?.[npcName] || {});
    const sources = collectImpairmentSources(state, false);
    if (!sources.length) return noNpcImpairment();
    const stat = normalizeAggressionStat(aggressionStat);

    const actionText = [
        proactivityResult?.Intent,
        proactivityResult?.Impulse,
        stat === 'MND'
            ? 'attack focus magic spell supernatural mental psychic willpower concentration'
            : 'attack strike shove grab grapple weapon physical combat',
    ].filter(Boolean).join(' ');
    const actionFunctions = classifyUserActionFunctions(actionText, stat);
    const actionBlock = actionBlockingNpcImpairment(npcName, state, actionFunctions, 'Y');
    if (actionBlock) return actionBlock;

    const matches = sources
        .map(source => ({
            source,
            matched: matchedImpairmentFunctions(source.functions, actionFunctions),
        }))
        .filter(item => item.matched.length);
    if (!matches.length) return noNpcImpairment('tracked NPC impairments do not affect this attack');

    matches.sort((a, b) => USER_IMPAIRMENT_STAGE[b.source.stage].rank - USER_IMPAIRMENT_STAGE[a.source.stage].rank);
    const best = matches[0];
    const penalty = best.source.type === 'condition'
        ? hiddenHealthPenaltyForCondition(best.source.label)
        : USER_IMPAIRMENT_STAGE[best.source.stage]?.penalty ?? 0;
    const matchedText = unique(best.matched).join(', ');
    const affectedText = unique(best.source.functions).join(', ');

    return {
        Relevant: 'Y',
        NPC: npcName,
        Stage: best.source.stage,
        RollPenalty: penalty,
        AppliedToRoll: penalty < 0 ? 'Y' : 'N',
        Source: best.source.label,
        SourceType: best.source.type,
        AffectedFunction: affectedText || NONE,
        MatchedActionFunction: matchedText || NONE,
        Reason: `${npcName}'s ${best.source.label} affects ${matchedText || 'their attack'}`,
        NarrationRule: `${npcName} may still attack, but ${best.source.label} limits clean execution; narrate pain, compensation, instability, reduced force, partial execution, or cost according to the computed aggression result.`,
    };
}

function evaluateUserDefenseImpairment(ledger, context, resolutionPacket, proactivityResult, defenseStat = 'PHY') {
    const stat = normalizeAggressionStat(defenseStat);
    const semantic = {
        identifyGoal: resolutionPacket?.GOAL,
        identifyChallenge: [
            stat === 'MND'
                ? 'defend resist withstand focus willpower mental discipline magic supernatural pressure'
                : 'defend evade dodge block brace resist survive avoid counterattack retaliation proactive attack',
            proactivityResult?.Intent,
            proactivityResult?.Impulse,
        ].filter(Boolean).join(' '),
        explicitMeans: [
            'defensive reaction against NPC aggression',
            resolutionPacket?.CounterPotential && resolutionPacket.CounterPotential !== 'none'
                ? `counter potential ${resolutionPacket.CounterPotential}`
                : '',
        ].filter(Boolean).join(' '),
    };
    return evaluateUserImpairment(ledger, context, semantic, 'DefendAgainstNpcAggression', stat, 'Y');
}

function evaluateNpcDefenseImpairment(npcName, trackerUpdate, trackerSnapshot, proactivityResult, defenseStat = 'PHY') {
    if (!isReal(npcName)) return noNpcImpairment('no NPC defender named');
    const state = normalizeTrackerEntry(trackerUpdate?.[npcName] || trackerSnapshot?.[npcName] || {});
    const sources = collectImpairmentSources(state, false);
    if (!sources.length) return noNpcImpairment();
    const stat = normalizeAggressionStat(defenseStat);

    const actionText = [
        stat === 'MND'
            ? 'defend resist withstand focus willpower mental discipline magic supernatural pressure'
            : 'defend evade dodge block brace resist survive avoid NPC aggression',
        proactivityResult?.Intent,
        proactivityResult?.Impulse,
    ].filter(Boolean).join(' ');
    const actionFunctions = classifyUserActionFunctions(actionText, stat);
    const actionBlock = actionBlockingNpcImpairment(npcName, state, actionFunctions, 'Y');
    if (actionBlock) return actionBlock;

    const matches = sources
        .map(source => ({
            source,
            matched: matchedImpairmentFunctions(source.functions, actionFunctions),
        }))
        .filter(item => item.matched.length);
    if (!matches.length) return noNpcImpairment('tracked NPC impairments do not affect this defense');

    matches.sort((a, b) => USER_IMPAIRMENT_STAGE[b.source.stage].rank - USER_IMPAIRMENT_STAGE[a.source.stage].rank);
    const best = matches[0];
    const penalty = best.source.type === 'condition'
        ? hiddenHealthPenaltyForCondition(best.source.label)
        : USER_IMPAIRMENT_STAGE[best.source.stage]?.penalty ?? 0;
    const matchedText = unique(best.matched).join(', ');
    const affectedText = unique(best.source.functions).join(', ');

    return {
        Relevant: 'Y',
        NPC: npcName,
        Stage: best.source.stage,
        RollPenalty: penalty,
        AppliedToRoll: penalty < 0 ? 'Y' : 'N',
        Source: best.source.label,
        SourceType: best.source.type,
        AffectedFunction: affectedText || NONE,
        MatchedActionFunction: matchedText || NONE,
        Reason: `${npcName}'s ${best.source.label} affects ${matchedText || 'their defense'}`,
        NarrationRule: `${npcName} may still defend, but ${best.source.label} limits clean defense; narrate pain, compensation, instability, reduced speed, partial resistance, or cost according to the computed aggression result.`,
    };
}

function deriveNpcAggressionStat(core) {
    const normalized = normalizeCore(core, { PHY: 1, MND: 1, CHA: 1 });
    return Number(normalized.MND || 0) > Number(normalized.PHY || 0) ? 'MND' : 'PHY';
}

function normalizeAggressionStat(value) {
    return value === 'MND' ? 'MND' : 'PHY';
}

function aggressionStatStyle(stat) {
    return normalizeAggressionStat(stat) === 'MND'
        ? 'magical/mental/supernatural'
        : 'physical';
}

function getEffectiveUserImpairmentState(ledger, context) {
    const saved = buildPlayerTrackerSnapshot(context);
    const currentTurnDelta = ledger?.trackerUpdateEngine?.user;
    if (!currentTurnDelta || typeof currentTurnDelta !== 'object') return saved;
    return applyTrackerDeltaToState(saved, currentTurnDelta, true);
}

function getEffectiveNpcImpairmentState(npcName, ledger, trackerSnapshot) {
    const saved = normalizeTrackerEntry(trackerSnapshot?.[npcName] || {});
    const delta = (ledger?.trackerUpdateEngine?.npcs || []).find(item => sameName(item?.NPC, npcName));
    if (!delta || typeof delta !== 'object') return saved;
    return applyTrackerDeltaToState(saved, delta, false);
}

function noEquipmentDefense(reason = 'equipment defense does not apply') {
    return {
        Eligible: 'N',
        AppliedToRoll: 'N',
        Item: NONE,
        Tier: 'none',
        Bonus: 0,
        Reason: reason,
    };
}

function appliedEquipmentDefenseBonus(value) {
    return Number(value?.AppliedToRoll === 'Y' ? value.Bonus : 0) || 0;
}

function resolveUserEquipmentDefense(userState = {}) {
    const user = normalizeTrackerUserState(userState);
    return resolveEquipmentDefense({
        gear: user.gear,
        equipmentTiers: user.equipmentTiers,
        defaultTier: 'standard',
    });
}

function resolveNpcEquipmentDefense(npcName, trackerUpdate = null, trackerSnapshot = {}, coreOverride = null) {
    const updatedName = findTrackerEntryName(trackerUpdate || {}, npcName);
    const snapshotName = findTrackerEntryName(trackerSnapshot || {}, npcName);
    const state = normalizeTrackerEntry(
        (updatedName && trackerUpdate?.[updatedName])
        || (snapshotName && trackerSnapshot?.[snapshotName])
        || {},
    );
    const rank = coreOverride?.Rank || state.currentCoreStats?.Rank;
    const tier = getNpcLootRankProfile(rank).equipmentTier;
    return resolveEquipmentDefense({ gear: state.gear, defaultTier: tier });
}

function collectImpairmentSources(state, includePlayerFields) {
    const user = includePlayerFields
        ? normalizeTrackerUserState(state || {})
        : normalizeTrackerEntry(state || {});
    const sources = [];
    if (user.condition && user.condition !== 'healthy') {
        sources.push({
            type: 'condition',
            label: user.condition,
            stage: stageFromCondition(user.condition),
            functions: isActionBlockingCondition(user.condition)
                ? ['whole_body']
                : ['physical_exertion', 'stamina', 'mobility', 'combat', 'grip', 'balance', 'aim', 'breath'],
        });
    }
    for (const wound of user.wounds || []) {
        const text = String(wound || '').trim();
        if (!text) continue;
        sources.push({
            type: 'wound',
            label: text,
            stage: stageFromImpairmentText(text, 'wound'),
            functions: functionsFromImpairmentText(text, 'wound'),
        });
    }
    for (const status of user.statusEffects || []) {
        const text = String(status || '').trim();
        if (!text) continue;
        sources.push({
            type: 'status',
            label: text,
            stage: stageFromImpairmentText(text, 'status'),
            functions: functionsFromImpairmentText(text, 'status'),
        });
    }
    return sources.filter(source => source.stage !== 'none');
}

function stageFromCondition(condition) {
    if (condition === 'bruised') return 'minor';
    if (condition === 'wounded') return 'moderate';
    if (condition === 'badly_wounded') return 'severe';
    if (condition === 'critical' || condition === 'incapacitated' || condition === 'dead') return 'critical';
    return 'none';
}

function stageFromImpairmentText(value, type) {
    const text = String(value || '').toLowerCase();
    if (/\b(dead|dying|fatal|severed|amputated|missing|shattered|crushed|paraly[sz]ed|paralysis|unconscious|ruptured|spine broken|broken spine|neck broken|broken neck)\b/.test(text)) return 'critical';
    if (/\b(broken|fractured|dislocated|crippled|deep|heavy bleeding|bleeding heavily|gouged|impaled|stabbed|pierced|torn|mangled|burned badly|blinded)\b/.test(text)) return 'severe';
    if (/\b(bleeding|sprained|strained|gashed|cut|burned|poisoned|sickened|dazed|stunned|concussed|concussion|head injury|exhausted|numb|wounded)\b/.test(text)) return 'moderate';
    if (/\b(bruised|bruise|scratch|scratched|sore|shallow|minor|nick|aching|winded|fatigued)\b/.test(text)) return 'minor';
    return type === 'status' ? 'moderate' : 'minor';
}

function functionsFromImpairmentText(value, type) {
    const text = String(value || '').toLowerCase();
    const functions = [];
    const add = (...items) => items.forEach(item => functions.push(item));

    if (/\b(leg|knee|ankle|foot|feet|thigh|calf|hip|shin)\b/.test(text)) add('lower_body', 'mobility', 'balance', 'physical_exertion');
    if (/\b(arm|hand|wrist|elbow|shoulder|finger|thumb)\b/.test(text)) add('upper_body', 'grip', 'physical_exertion');
    if (/\b(rib|ribs|chest|lung|lungs|breath|breathing)\b/.test(text)) add('torso', 'breath', 'stamina', 'physical_exertion');
    if (/\b(back|spine|spinal|waist)\b/.test(text)) add('torso', 'mobility', 'balance', 'physical_exertion');
    if (/\b(stomach|abdomen|gut|side)\b/.test(text)) add('torso', 'stamina', 'physical_exertion');
    if (/\b(head|skull|brain|concussed|concussion|head injury|dazed|stunned|migraine|vertigo)\b/.test(text) || /\bconcuss/.test(text)) add('head', 'focus', 'balance');
    if (/\b(eye|eyes|vision|blind|blinded)\b/.test(text)) add('vision', 'aim', 'combat');
    if (/\b(ear|ears|hearing|deaf|deafened)\b/.test(text)) add('hearing');
    if (/\b(jaw|mouth|tongue|throat|voice|vocal)\b/.test(text)) add('speech');
    if (/\b(poison|poisoned|venom|sick|sickened|disease|fever|blood loss|bleeding|exhaust|fatigue|fatigued|drained)\b/.test(text)) add('systemic', 'stamina', 'focus');
    if (/\b(paraly[sz]ed|paralysis|numb|frozen|bound|restrained|pinned|immobilized)\b/.test(text)) add('whole_body', 'mobility', 'physical_exertion');
    if (!functions.length) add(type === 'status' ? 'systemic' : 'physical_exertion');
    return unique(functions);
}

function classifyUserActionFunctions(actionText, userStat) {
    const text = String(actionText || '').toLowerCase();
    const functions = [];
    const add = (...items) => items.forEach(item => functions.push(item));

    if (/\b(jump|leap|vault|hop|clear the fence|clear a fence)\b/.test(text)) add('mobility', 'lower_body', 'balance', 'physical_exertion');
    if (/\b(run|sprint|dash|chase|flee|dodge|evade|sidestep|lunge|charge|rush|walk|stand)\b/.test(text)) add('mobility', 'lower_body', 'balance', 'physical_exertion');
    if (/\b(climb|scale|scramble|crawl)\b/.test(text)) add('mobility', 'upper_body', 'lower_body', 'grip', 'physical_exertion');
    if (/\b(kick|knee|stomp)\b/.test(text)) add('lower_body', 'balance', 'combat', 'physical_exertion');
    if (/\b(punch|strike|slash|stab|cut|swing|elbow|grab|grapple|wrestle|shove|push|pull|lift|carry|throw|shield|parry|block)\b/.test(text)) add('upper_body', 'grip', 'combat', 'physical_exertion');
    if (/\b(aim|shoot|bow|crossbow|sling|throwing knife|firearm)\b/.test(text)) add('upper_body', 'grip', 'aim', 'vision', 'combat', 'physical_exertion');
    if (/\b(sword|axe|spear|dagger|knife|mace|staff|weapon)\b/.test(text)) add('upper_body', 'grip', 'combat', 'physical_exertion');
    if (/\b(cast|spell|magic|focus|concentrat|ritual|hex|curse|invoke|channel|enchant|mana|arcane|sigil|incantation)\b/.test(text)) add('focus');
    if (/\b(speak|talk|persuad|convince|lie|bluff|intimidat|negotiate|sing|shout|whisper|call out)\b/.test(text)) add('speech');
    if (/\b(look|see|watch|search|read|inspect|study|track)\b/.test(text)) add('vision', 'focus');
    if (/\b(swim|hold breath|breathe|breath)\b/.test(text)) add('breath', 'stamina', 'physical_exertion');

    if (!functions.length) {
        if (userStat === 'PHY') add('physical_exertion');
        else if (userStat === 'MND') add('focus');
        else if (userStat === 'CHA') add('speech');
    }

    return unique(functions);
}

function matchedImpairmentFunctions(sourceFunctions, actionFunctions) {
    const source = new Set(sourceFunctions || []);
    const action = new Set(actionFunctions || []);
    if (source.has('whole_body')) return Array.from(action);
    const matched = Array.from(action).filter(item => source.has(item));
    if (source.has('systemic')) {
        for (const item of ['stamina', 'focus', 'physical_exertion', 'mobility', 'combat']) {
            if (action.has(item) && !matched.includes(item)) matched.push(item);
        }
    }
    if (source.has('stamina') && (action.has('physical_exertion') || action.has('mobility') || action.has('breath'))) {
        if (!matched.includes('stamina')) matched.push('stamina');
    }
    if (source.has('vision') && (action.has('aim') || action.has('combat') || action.has('vision'))) {
        if (!matched.includes('vision')) matched.push('vision');
    }
    if (source.has('focus') && (action.has('focus') || action.has('combat'))) {
        if (!matched.includes('focus')) matched.push('focus');
    }
    if (source.has('speech') && action.has('speech')) {
        if (!matched.includes('speech')) matched.push('speech');
    }
    return unique(matched);
}

function runTrackerUpdates(ledger, trackerSnapshot, relationshipTrackerUpdate, context, audit, userResultDelta = null, npcResultDeltas = [], hiddenHealthAfter = null, playerTrackerSnapshot = null) {
    const semantic = ledger.trackerUpdateEngine || {};
    const userBefore = normalizeTrackerUserState(playerTrackerSnapshot || buildPlayerTrackerSnapshot(context));
    let user = applyTrackerDeltaToState(userBefore, semantic.user, true);
    if (shouldApplyDeterministicResultInjury(userResultDelta)) {
        user = applyUserResultInjuryDeltaToState(user, userResultDelta);
    }
    const npcs = {};

    for (const [name, value] of Object.entries({
        ...(trackerSnapshot || {}),
        ...(relationshipTrackerUpdate || {}),
    })) {
        npcs[name] = normalizeTrackerEntry(value);
    }

    assignMissingNpcPersonalitySummaries(npcs, Object.keys(relationshipTrackerUpdate || {}), 'deterministic-runner', context);

    for (const delta of semantic.npcs || []) {
        const name = delta?.NPC;
        if (!isReal(name)) continue;
        const before = normalizeTrackerEntry(npcs[name] || trackerSnapshot?.[name] || {});
        npcs[name] = normalizeTrackerEntry({
            ...before,
            ...applyTrackerDeltaToState(before, delta, false),
        });
    }
    assignMissingNpcPersonalitySummaries(npcs, (semantic.npcs || []).map(delta => delta?.NPC), 'deterministic-runner', context);
    applyInflictedNpcInjuriesToNpcMap(npcs, trackerSnapshot, relationshipTrackerUpdate?.__inflictedInjuries || []);
    for (const item of npcResultDeltas || []) {
        if (!shouldApplyDeterministicResultInjury(item?.injury)) continue;
        mergeNpcResultInjuryDelta(npcs, trackerSnapshot, item?.NPC, item?.injury);
    }
    if (hiddenHealthAfter) {
        const adjusted = applyHiddenHealthToTrackerState({ user, npcs }, hiddenHealthAfter);
        user = normalizeTrackerUserState({
            ...user,
            condition: adjusted.user?.condition || user.condition,
            wounds: Array.isArray(adjusted.user?.wounds) ? adjusted.user.wounds : user.wounds,
            statusEffects: Array.isArray(adjusted.user?.statusEffects) ? adjusted.user.statusEffects : user.statusEffects,
        });
        for (const [name, entry] of Object.entries(adjusted.npcs || {})) {
            npcs[name] = normalizeTrackerEntry({
                ...(npcs[name] || {}),
                condition: entry?.condition || npcs[name]?.condition,
                wounds: Array.isArray(entry?.wounds) ? entry.wounds : npcs[name]?.wounds,
                statusEffects: Array.isArray(entry?.statusEffects) ? entry.statusEffects : npcs[name]?.statusEffects,
            });
        }
    }

    audit.push('STEP 6.5: EXECUTE TrackerUpdateEngine EXPLICIT DELTAS');
    audit.push(`6.5a user=${compact(user)}`);
    audit.push(`6.5b npcDeltas=${compact((semantic.npcs || []).map(delta => delta.NPC || NONE))}`);
    if (userResultDelta) audit.push(`6.5c deterministicUserInjuryDelta=${compact(userResultDelta)}${shouldApplyDeterministicResultInjury(userResultDelta) ? '' : ' (deferred:narrator_contextual)'}`);
    if (npcResultDeltas?.length) audit.push(`6.5d deterministicNpcAggressionInjuryDeltas=${compact(npcResultDeltas)}`);
    audit.push('---');

    return { user, npcs };
}

function assignMissingNpcPersonalitySummaries(npcs, names = [], salt = '', context = null) {
    if (!npcs || typeof npcs !== 'object') return;
    const wanted = new Set((names || []).map(name => String(name || '').trim()).filter(isReal));
    for (const name of wanted) {
        const value = npcs[name];
        if (!isReal(name)) continue;
        const entry = normalizeTrackerEntry(value);
        if (cleanPersonalitySummary(entry.personalitySummary)) {
            npcs[name] = entry;
            continue;
        }
        if (isActiveCardCharacterName(name, context)) {
            npcs[name] = entry;
            continue;
        }
        entry.personalitySummary = deterministicPersonalitySummaryForName(name, salt);
        npcs[name] = normalizeTrackerEntry(entry);
    }
}

function isActiveCardCharacterName(name, context = null) {
    const wanted = String(name || '').trim().toLowerCase();
    if (!wanted) return false;
    return getActiveCardCharacterNames(context).some(candidate => candidate.toLowerCase() === wanted);
}

function getActiveCardCharacterNames(context = null) {
    const fields = getCardFields(context);
    return unique([
        context?.name2,
        context?.characterName,
        fields?.name2,
        fields?.characterName,
        fields?.name,
        fields?.char_name,
        fields?.avatarName,
    ].map(name => String(name || '').trim()).filter(isReal));
}

function shouldApplyDeterministicResultInjury(injury) {
    if (!injury || typeof injury !== 'object') return false;
    if (injury.InjuryDetailMode !== 'narrator_contextual') return true;
    return toRealArray(injury.woundsAdd).length > 0 || toRealArray(injury.statusAdd).length > 0;
}

function applyTrackerDeltaToState(before, delta, includePlayerFields) {
    const source = includePlayerFields
        ? normalizeTrackerUserState(before)
        : normalizeTrackerEntry(before);
    const result = {
        ...(!includePlayerFields ? { personalitySummary: source.personalitySummary || '' } : {}),
        condition: source.condition,
        wounds: [...source.wounds],
        statusEffects: [...source.statusEffects],
        gear: [...source.gear],
    };
    if (includePlayerFields) {
        result.inventory = [...source.inventory];
        result.equipmentTiers = source.equipmentTiers.map(entry => ({ ...entry }));
        result.currency = [...source.currency];
        result.tasks = [...source.tasks];
        result.commitments = [...source.commitments];
    }

    const condition = normalizeTrackerDeltaCondition(delta?.condition);
    if (condition !== 'unchanged') {
        result.condition = normalizeTrackerCondition(condition);
    }

    result.wounds = applyListDelta(result.wounds, delta?.woundsAdd, delta?.woundsRemove);
    result.statusEffects = applyListDelta(result.statusEffects, delta?.statusAdd, delta?.statusRemove);
    result.gear = applyListDelta(result.gear, delta?.gearAdd, delta?.gearRemove);
    if (!includePlayerFields) {
        const personalitySummary = cleanPersonalitySummary(delta?.personalitySummary);
        if (personalitySummary) {
            result.personalitySummary = personalitySummary;
        }
    }
    if (includePlayerFields) {
        result.inventory = applyListDelta(result.inventory, delta?.inventoryAdd, delta?.inventoryRemove);
        result.tasks = applyListDelta(result.tasks, delta?.tasksAdd, delta?.tasksRemove);
        result.commitments = applyListDelta(result.commitments, delta?.commitmentsAdd, delta?.commitmentsRemove);
    }

    return includePlayerFields ? normalizeTrackerUserState(result) : result;
}

function normalizeTrackerDeltaCondition(value) {
    const text = String(value ?? 'unchanged').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (text === 'defeated') return 'incapacitated';
    return ['unchanged', 'healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'incapacitated', 'dead'].includes(text) ? text : 'unchanged';
}

function applyListDelta(current, add, remove) {
    const result = [];
    const seen = new Set();
    const push = item => {
        const text = cleanTrackerText(item);
        if (!text) return;
        const key = text.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(text);
    };
    for (const item of current || []) push(item);
    const removeKeys = new Set((Array.isArray(remove) ? remove : [])
        .map(cleanTrackerText)
        .filter(Boolean)
        .map(text => text.toLowerCase()));
    const filtered = result.filter(item => !removeKeys.has(item.toLowerCase()));
    const filteredSeen = new Set(filtered.map(item => item.toLowerCase()));
    for (const item of add || []) {
        const text = cleanTrackerText(item);
        if (!text) continue;
        const key = text.toLowerCase();
        if (filteredSeen.has(key)) continue;
        filteredSeen.add(key);
        filtered.push(text);
    }
    return filtered.slice(0, 40);
}

function cleanTrackerText(value) {
    const text = String(value ?? '').trim().replace(/^\[/, '').replace(/\]$/, '').replace(/^["']|["']$/g, '').trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 140);
}

function cleanPersonalitySummary(value) {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 320);
}

function runProactivity(ledger, handoffs, resolutionPacket, chaosHandoff, dice, audit, refereeContext, context = {}, rapportClock = normalizeRapportClock()) {
    const kind = classifyAction(resolutionPacket);
    const chaosBand = chaosHandoff.CHAOS?.triggered ? chaosHandoff.CHAOS.band : 'None';
    const counterPotential = resolutionPacket.CounterPotential || 'none';
    const cap = NPC_PROACTIVITY_CAP;
    const candidates = [];
    const results = {};
    const latestUserText = relationshipText(getLatestUserTextFromContext(context));

    audit.push('STEP 6: EXECUTE NPCProactivityEngine');
    audit.push(`6.2 classifyAction=${kind}`);
    audit.push(`6.2a chaosBand=${chaosBand}`);
    audit.push(`6.2b counterPotential=${counterPotential}`);
    audit.push(`6.2c cap=${cap}`);

    for (const handoff of handoffs) {
        const fin = parseFinalState(handoff.FinalState);
        const lock = handoff.Lock && handoff.Lock !== 'None' ? handoff.Lock : deriveLock(fin);
        const impulse = deriveImpulse(kind, lock, fin, handoff.PressureMode, handoff.Target);
        const proactivityGuard = proactivityRefereeGuard(handoff, resolutionPacket);
        let tier = proactivityGuard
            ? 'DORMANT'
            : classifyProactivityTier(handoff, chaosBand, counterPotential, lock, fin);
        tier = adjustCompanionProactivityTier(tier, handoff, fin, { kind, resolutionPacket, chaosBand, counterPotential, handoffs, latestUserText });

        results[handoff.NPC] = {
            Proactive: 'N',
            Intent: 'NONE',
            Impulse: 'NONE',
            ProactivityTarget: NONE,
            TargetsUser: 'N',
            ProactivityTier: tier,
            RomanceInitiative: 'N',
            RomanceInitiativeTag: NONE,
            RomanceInitiativeDie: null,
            RomanceInitiativeContext: NONE,
            RomanceInitiativeRawTag: NONE,
            RomanceInitiativeMemoryGate: 'none',
            PartnerInitiative: 'N',
            PartnerInitiativeTag: NONE,
            PartnerInitiativeDie: null,
            PartnerInitiativeContext: NONE,
            PartnerInitiativeRawTag: NONE,
            PartnerInitiativeMemoryGate: 'none',
            CompanionInitiative: 'N',
            CompanionInitiativeTag: NONE,
            CompanionInitiativeDie: null,
            CompanionInitiativeContext: NONE,
            CompanionCrisisDire: 'N',
        };

        audit.push(`6.3 FOR ${handoff.NPC}`);
        audit.push(`6.4 parseFinalState=${compact(fin)}`);
        audit.push(`6.4b lock=${lock}`);
        audit.push(`6.4f deriveImpulse=${impulse}`);
        audit.push(`6.4g classifyProactivityTier=${tier}`);
        if (proactivityGuard) {
            audit.push(`6.4g.1 proactivityRefereeGuard=${proactivityGuard}`);
        }

        const directedCompanionCommand = directedCompanionCommandText(handoff.NPC, latestUserText);
        if (directedCompanionCommand) {
            audit.push(`6.4h directedCompanionCommandContext=${compact({
                NPC: handoff.NPC,
                hardRule: 'ally commands are tactical requests only; they do not force proactivity or resolve the companion action',
                command: directedCompanionCommand,
            })}`);
        }

        if (shouldBlockRelationshipOnlyProactivityForScene(handoff, fin, { kind, resolutionPacket, chaosBand, counterPotential, handoffs, latestUserText, rapportClock })) {
            audit.push('6.4h.1 relationshipInitiativeSceneGate=blocked:not calm or another active event is taking place');
            continue;
        }

        if (tier === 'FORCED') {
            const intent = selectIntent(impulse, kind, fin, handoff.Override, handoff.PressureMode);
            const proactivityTarget = proactivityGuard ? NONE : deriveProactivityTarget(handoff, resolutionPacket, intent);
            const targetsUser = isUserProactivityTarget({ ProactivityTarget: proactivityTarget }, refereeContext) ? 'Y' : 'N';
            candidates.push(applyInitiativeOverridesIfEligible({ NPC: handoff.NPC, die: 20, tier, intent, impulse, ProactivityTarget: proactivityTarget, TargetsUser: targetsUser, Threshold: 'AUTO', passes: 'Y' }, handoff, fin, dice, audit, { kind, resolutionPacket, chaosBand, counterPotential, handoffs, latestUserText, rapportClock }));
            audit.push('6.4i FORCED candidate');
            continue;
        }

        const die = dice.d20();
        const threshold = proactivityThresholdForCandidate(tier, handoff, fin, {
            kind,
            resolutionPacket,
            chaosBand,
            counterPotential,
            handoffs,
            latestUserText,
        });
        const passes = die >= threshold ? 'Y' : 'N';
        audit.push(`6.5 proactivityDie=${die}`);
        audit.push(`6.5a thresholdFromTier=${threshold}`);
        audit.push(`6.5b passes=${passes}`);

        results[handoff.NPC].ProactivityDie = die;
        results[handoff.NPC].Threshold = threshold;

        if (passes === 'Y') {
            const intent = selectIntent(impulse, kind, fin, handoff.Override, handoff.PressureMode);
            const proactivityTarget = proactivityGuard ? NONE : deriveProactivityTarget(handoff, resolutionPacket, intent);
            const targetsUser = isUserProactivityTarget({ ProactivityTarget: proactivityTarget }, refereeContext) ? 'Y' : 'N';
            candidates.push(applyInitiativeOverridesIfEligible({ NPC: handoff.NPC, die, tier, intent, impulse, ProactivityTarget: proactivityTarget, TargetsUser: targetsUser, Threshold: threshold, passes }, handoff, fin, dice, audit, { kind, resolutionPacket, chaosBand, counterPotential, handoffs, latestUserText, rapportClock }));
            audit.push(`6.5c selectIntent=${intent}`);
            audit.push(`6.5e ProactivityTarget=${proactivityTarget}; TargetsUser=${targetsUser}`);
        } else {
            audit.push('6.5c Proactive=N -> Intent=NONE, Impulse=NONE, ProactivityTarget=(none), TargetsUser=N');
        }
    }

    candidates.sort((a, b) => b.die - a.die);
    const selected = candidates.slice(0, cap);
    audit.push(`6.6 sortCandidates=${compact(candidates)}`);

    for (const candidate of selected) {
        results[candidate.NPC] = {
            Proactive: 'Y',
            Intent: candidate.intent,
            Impulse: candidate.impulse,
            ProactivityTarget: candidate.ProactivityTarget,
            TargetsUser: candidate.TargetsUser,
            ProactivityTier: candidate.tier,
            ProactivityDie: candidate.die,
            Threshold: candidate.Threshold,
            RomanceInitiative: candidate.RomanceInitiative || 'N',
            RomanceInitiativeTag: candidate.RomanceInitiativeTag || NONE,
            RomanceInitiativeDie: candidate.RomanceInitiativeDie ?? null,
            RomanceInitiativeContext: candidate.RomanceInitiativeContext || NONE,
            RomanceInitiativeRawTag: candidate.RomanceInitiativeRawTag || candidate.RomanceInitiativeTag || NONE,
            RomanceInitiativeMemoryGate: candidate.RomanceInitiativeMemoryGate || 'none',
            PartnerInitiative: candidate.PartnerInitiative || 'N',
            PartnerInitiativeTag: candidate.PartnerInitiativeTag || NONE,
            PartnerInitiativeDie: candidate.PartnerInitiativeDie ?? null,
            PartnerInitiativeContext: candidate.PartnerInitiativeContext || NONE,
            PartnerInitiativeRawTag: candidate.PartnerInitiativeRawTag || candidate.PartnerInitiativeTag || NONE,
            PartnerInitiativeMemoryGate: candidate.PartnerInitiativeMemoryGate || 'none',
            CompanionInitiative: candidate.CompanionInitiative || 'N',
            CompanionInitiativeTag: candidate.CompanionInitiativeTag || NONE,
            CompanionInitiativeDie: candidate.CompanionInitiativeDie ?? null,
            CompanionInitiativeContext: candidate.CompanionInitiativeContext || NONE,
            CompanionCrisisDire: candidate.CompanionCrisisDire || 'N',
        };
    }

    audit.push(`6.8 FINAL_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results };
}

function applyInitiativeOverridesIfEligible(candidate, handoff, fin, dice, audit, context) {
    const companionCandidate = applyCompanionCrisisInitiativeIfEligible(candidate, handoff, fin, dice, audit, context);
    if (companionCandidate !== candidate) return companionCandidate;
    const partnerCandidate = applyPartnerInitiativeIfEligible(candidate, handoff, fin, dice, audit, context);
    if (partnerCandidate !== candidate) return partnerCandidate;
    return applyRomanceInitiativeIfEligible(candidate, handoff, fin, dice, audit, context);
}

function isDirectedCompanionAttackEligible(handoff, fin) {
    const relation = handoff?.RelationToUserAction || {};
    return fin.B >= 2
        && fin.F <= 2
        && fin.H <= 2
        && (handoff?.Lock || 'None') === 'None'
        && !relation.isOpp
        && !relation.isHarmed;
}

function detectDirectedCompanionAttackTarget(handoff, resolutionPacket, latestUserText, handoffs = []) {
    const source = directedCompanionCommandText(handoff?.NPC, latestUserText);
    if (!source) return null;
    if (!isDirectedCompanionAttackCommandText(source)) return null;
    return resolveFriendlyCrisisAttackTarget(handoff, { resolutionPacket, handoffs, commandText: source });
}

function detectDirectedCompanionDefensiveCommand(handoff, latestUserText) {
    const source = directedCompanionCommandText(handoff?.NPC, latestUserText);
    if (!source) return false;
    return isDirectedCompanionDefensiveCommandText(source);
}

function directedCompanionCommandText(npc, text) {
    const name = String(npc ?? '').trim();
    const source = String(text ?? '').replace(/<[^>]+>/g, ' ').trim();
    if (!name || !source) return '';
    const escapedName = escapeRegExp(name);
    const firstName = name.split(/\s+/)[0] || '';
    const escapedFirstName = escapeRegExp(firstName);
    const namePattern = firstName.length >= 3
        ? `(?:${escapedName}|${escapedFirstName})`
        : escapedName;
    const quotePattern = /["“]([^"”]{0,700})["”]/g;
    let quoteMatch;
    while ((quoteMatch = quotePattern.exec(source)) !== null) {
        const quoted = quoteMatch[1] || '';
        if (segmentDirectlyAddressesNpc(quoted, namePattern)) {
            return relationshipText(quoted);
        }
    }
    const segments = source
        .split(/(?:[.!?]["'”’]?\s+|\n+)/)
        .map(item => item.trim())
        .filter(Boolean);
    const matches = [];
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segmentDirectlyAddressesNpc(segment, namePattern)) continue;
        matches.push(segment);
        const next = segments[index + 1] || '';
        if (/^\s*(?:if|when|should|stop|keep|cover|protect|guard|block|intercept|hit|attack|strike|shoot|rush|charge)\b/i.test(next)) {
            matches.push(next);
        }
    }
    if (!matches.length) return '';
    return relationshipText(matches.join(' '));
}

function segmentDirectlyAddressesNpc(segment, namePattern) {
    const source = relationshipText(segment);
    if (!source) return false;
    const commandCue = '(?:attack|attacks|attacked|attacking|hit|hits|hitting|strike|strikes|struck|striking|smash|smashes|smashed|smashing|slam|slams|slammed|slamming|stab|stabs|stabbed|stabbing|slash|slashes|slashed|slashing|punch|punches|punched|punching|kick|kicks|kicked|kicking|maul|mauls|mauled|mauling|flank|flanks|flanked|flanking|charge|charges|charged|charging|rush|rushes|rushed|rushing|cut|cuts|cutting|chop|chops|chopped|chopping|smite|smites|smited|smoting|shoot|shoots|shot|shooting|fire|fires|fired|firing|clobber|clobbers|clobbered|clobbering|bash|bashes|bashed|bashing|clamp|clamps|clamped|clamping|drive|drives|drove|driving|stop|stops|stopped|stopping|keep|hold|pin|force|cover|protect|guard|block|intercept|shield|help|save)';
    const directAddress = new RegExp(`^\\s*(?:hey\\s+|yo\\s+)?${namePattern}\\b\\s*(?:[,!:;]|\\s+).{0,160}\\b${commandCue}\\b`, 'i');
    if (directAddress.test(source)) return true;
    const speechCommand = new RegExp(`\\b(?:tell|tells|told|order|orders|ordered|command|commands|commanded|ask|asks|asked|signal|signals|signaled|gesture|gestures|gestured|shout|shouts|shouted|yell|yells|yelled|call|calls|called)\\s+(?:to\\s+)?${namePattern}\\b.{0,160}\\b(?:to\\s+)?${commandCue}\\b`, 'i');
    return speechCommand.test(source);
}

function isDirectedCompanionDefensiveCommandText(text) {
    const source = String(text || '').toLowerCase();
    if (!source) return false;
    return /\b(?:stop|block|guard|protect|cover|shield|intercept|hold|keep|watch|help|save)\b/.test(source)
        && /\b(?:if|when|before|from|away|off|back|move|moves|moving|threaten|threatens|attack|attacks|hurt|hurts|darai|him|her|them|me|us)\b/.test(source);
}

function isDirectedCompanionAttackCommandText(text) {
    const source = String(text || '').toLowerCase();
    if (!source) return false;
    const attackVerb = /\b(?:attack|attacks|attacked|attacking|hit|hits|hitting|strike|strikes|struck|striking|smash|smashes|smashed|smashing|slam|slams|slammed|slamming|stab|stabs|stabbed|stabbing|slash|slashes|slashed|slashing|punch|punches|punched|punching|kick|kicks|kicked|kicking|maul|mauls|mauled|mauling|flank|flanks|flanked|flanking|charge|charges|charged|charging|rush|rushes|rushed|rushing|cut|cuts|cutting|chop|chops|chopped|chopping|smite|smites|smited|smoting|shoot|shoots|shot|shooting|fire|fires|fired|firing|clobber|clobbers|clobbered|clobbering|bash|bashes|bashed|bashing|clamp|clamps|clamped|clamping|drive|drives|drove|driving)\b/;
    if (/\b(?:don't|do not|never|stop)\b.{0,40}\b(?:attack|hit|strike|smash|slam|stab|slash|punch|kick|maul|flank|charge|rush|cut|chop|smite|shoot|fire|clobber|bash|drive)\b/.test(source)) {
        return false;
    }
    return attackVerb.test(source)
        || /\bhit\b.{0,40}\b(?:the|him|her|them|it|flank|side|back|leg|arm|head|body|enemy|target|ogre|bear|orc|guard|monster|flank|rear|weak\s+point|open(?:ing)?|vital(?:s)?|wing|tail|knees?)\b/.test(source)
        || /\bdrive\b.{0,40}\b(?:knee|elbow|shoulder|blade|weapon|sword|staff|spear|axe|club)\b/.test(source)
        || /\b(?:keep|hold|stop|pin|drive|force)\b.{0,40}\b(?:it|him|her|them|the\s+ogre|the\s+orc|the\s+guard|the\s+enemy|the\s+monster)\b.{0,40}\b(?:off|back|down|away|from\s+me|from\s+us)\b/.test(source);
}

function applyCompanionCrisisInitiativeIfEligible(candidate, handoff, fin, dice, audit, context = {}) {
    if (!isCompanionCrisisInitiativeEligible(handoff, fin, context)) return candidate;

    const companionDie = typeof dice.d100 === 'function' ? dice.d100() : Math.floor(Math.random() * 100) + 1;
    const companionContext = classifyCompanionInitiativeContext(context);
    const commandText = directedCompanionCommandText(handoff?.NPC, context.latestUserText);
    const attackTarget = resolveFriendlyCrisisAttackTarget(handoff, { ...context, commandText });
    const crisisDire = isDireCompanionCrisis(context) ? 'Y' : 'N';
    const canRetreat = canCompanionRetreatInCrisis(handoff, fin, crisisDire);
    const tag = companionCrisisTagFromDie(companionDie, fin, handoff?.EstablishedRelationship === 'Y', crisisDire, canRetreat, attackTarget);
    const target = tag === 'Companion_Attack' ? attackTarget : USER_PROACTIVITY_TARGET;
    audit.push(`6.5c.1 ${handoff.NPC}.CompanionInitiativeDie=${companionDie}`);
    audit.push(`6.5c.2 ${handoff.NPC}.CompanionInitiativeContext=${companionContext}`);
    audit.push(`6.5c.3 ${handoff.NPC}.CompanionCrisisDire=${crisisDire}`);
    audit.push(`6.5c.4 ${handoff.NPC}.CompanionInitiativeTag=${tag}`);
    if (!attackTarget) {
        audit.push(`6.5c.5 ${handoff.NPC}.CompanionAttackTarget=${NONE}`);
    }
    return {
        ...candidate,
        intent: tag === 'Companion_Attack' ? 'ESCALATE_VIOLENCE' : 'SUPPORT_ACT',
        impulse: 'BOND',
        ProactivityTarget: target,
        TargetsUser: tag === 'Companion_Attack' ? 'N' : 'Y',
        CompanionInitiative: 'Y',
        CompanionInitiativeTag: tag,
        CompanionInitiativeDie: companionDie,
        CompanionInitiativeContext: companionContext,
        CompanionCrisisDire: crisisDire,
    };
}

function isCompanionCrisisInitiativeEligible(handoff, fin, context = {}) {
    const relation = handoff?.RelationToUserAction || {};
    const requestOnlyDirectCommand = context?.resolutionPacket?.CompanionCommand?.Mode === 'REQUEST_ONLY'
        && toRealArray(context.resolutionPacket.CompanionCommand.NPCs).some(name => sameName(name, handoff?.NPC));
    return fin.B >= 2
        && fin.F <= 2
        && fin.H <= 2
        && (handoff?.Lock || 'None') === 'None'
        && (!relation.isDirect || requestOnlyDirectCommand)
        && !relation.isOpp
        && !relation.isHarmed
        && classifyCompanionInitiativeContext(context) === 'crisis';
}

function applyRomanceInitiativeIfEligible(candidate, handoff, fin, dice, audit, context = {}) {
    if (!isRomanceInitiativeEligible(handoff, fin, context)) return candidate;
    if (candidate.intent === 'ESCALATE_VIOLENCE' || candidate.intent === 'BOUNDARY_PHYSICAL' || candidate.intent === 'THREAT_OR_POSTURE') return candidate;
    if (classifyCompanionInitiativeContext(context) === 'crisis') return candidate;

    const romanceDie = typeof dice.d100 === 'function' ? dice.d100() : Math.floor(Math.random() * 100) + 1;
    const rawTag = romanceInitiativeTagFromDie(romanceDie, handoff?.RomanceStyle);
    const romanceContext = classifyCompanionInitiativeContext(context);
    const remap = remapCompanionInitiativeForContext(rawTag, romanceContext, romanceDie, handoff, context);
    const gate = applyRomanceMemoryGate(remap.tag, romanceDie, handoff, romanceContext, context);
    const romanceTag = gate.tag;
    audit.push(`6.5f ${handoff.NPC}.RomanceInitiativeDie=${romanceDie}`);
    audit.push(`6.5f.1 ${handoff.NPC}.RomanceInitiativeContext=${romanceContext}`);
    audit.push(`6.5g ${handoff.NPC}.RomanceInitiativeTag=${romanceTag}${romanceTag !== rawTag ? ` (from ${rawTag})` : ''}`);
    audit.push(`6.5g.1 ${handoff.NPC}.RomanceStyle=${normalizeRomanceStyle(handoff?.RomanceStyle)}`);
    if (gate.reason !== 'none') {
        audit.push(`6.5g.2 ${handoff.NPC}.RomanceMemoryGate=${gate.reason}`);
    }
    return {
        ...candidate,
        intent: gate.intent || remap.intent || romanceTag,
        impulse: 'BOND',
        ProactivityTarget: gate.target || remap.target || USER_PROACTIVITY_TARGET,
        TargetsUser: (gate.target || remap.target) && (gate.target || remap.target) !== USER_PROACTIVITY_TARGET ? 'N' : 'Y',
        RomanceInitiative: 'Y',
        RomanceInitiativeTag: romanceTag,
        RomanceInitiativeDie: romanceDie,
        RomanceInitiativeContext: romanceContext,
        RomanceInitiativeRawTag: rawTag,
        RomanceInitiativeMemoryGate: gate.reason,
    };
}

function isRomanceInitiativeEligible(handoff, fin, context = {}) {
    return fin.B >= 4
        && fin.F < 3
        && fin.H < 3
        && handoff?.EstablishedRelationship !== 'Y'
        && handoff?.Lock === 'None'
        && isRomanceSceneSuitable(context);
}

function romanceInitiativeTagFromDie(die, romanceStyle = 'auto') {
    if (die >= 96) return 'Date_And_Confess';
    if (die >= 86) return 'Ask_Date';
    if (die >= 71) return 'Thoughtful_Gift';
    if (die >= 51) return 'Romantic_Attention';
    const style = normalizeRomanceStyle(romanceStyle);
    if (style === 'nervous') return 'Romantic_Nervous';
    if (style === 'flirt') return 'Romantic_Flirt';
    return die % 2 === 0 ? 'Romantic_Flirt' : 'Romantic_Nervous';
}

function applyRomanceMemoryGate(tag, die, handoff, context, engineContext = {}) {
    const memory = normalizeProactivityMemory(handoff?.ProactivityMemory);
    if (isRomanceMajorTag(tag) && isRomanceMemoryTag(memory.pendingTag)) {
        return romanceFallbackForBlockedTag(die, handoff, `${memory.pendingTag}.pending`);
    }
    if (memory.romanceBlocked === 'Y' && isRomanceMajorTag(tag)) {
        return romanceFallbackForBlockedTag(die, handoff, 'romanceBlocked');
    }
    if (tag === 'Date_And_Confess' && memory.refusedTags.includes(tag)) {
        return romanceFallbackForBlockedTag(die, handoff, `${tag}.refused`);
    }
    if (tag === 'Ask_Date' && !isAskDateAttemptAllowed(memory, engineContext)) {
        return romanceFallbackForBlockedTag(die, handoff, 'Ask_Date.secondAttemptCooldown');
    }
    if (tag === 'Thoughtful_Gift' && !isThoughtfulGiftAllowed(memory)) {
        return romanceFallbackForBlockedTag(die, handoff, 'Thoughtful_Gift.requiresTwoAskDatesAccepted');
    }
    if (tag === 'Date_And_Confess') {
        const courtship = memory.b4Courtship || {};
        const gate = romanceDateAndConfessGate(courtship, memory);
        if (!gate.allowed) {
            return romanceFallbackForBlockedTag(die, handoff, 'Date_And_Confess.requiresGiftAndDateAccepted');
        }
    }
    return { tag, intent: tag, target: USER_PROACTIVITY_TARGET, reason: 'none' };
}

function romanceFallbackForBlockedTag(die, handoff, reason) {
    const tag = romanceFallbackTag(die, handoff?.RomanceStyle);
    return { tag, intent: tag, target: USER_PROACTIVITY_TARGET, reason };
}

function romanceFallbackTag(die, romanceStyle = 'auto') {
    if (die % 5 === 0) return 'Romantic_Attention';
    const style = normalizeRomanceStyle(romanceStyle);
    if (style === 'nervous') return 'Romantic_Nervous';
    if (style === 'flirt') return 'Romantic_Flirt';
    return die % 2 === 0 ? 'Romantic_Flirt' : 'Romantic_Nervous';
}

function applyPartnerInitiativeIfEligible(candidate, handoff, fin, dice, audit, context) {
    if (!isPartnerInitiativeEligible(handoff, fin, context)) return candidate;
    if (isBlockedPartnerBaseIntent(candidate.intent)) return candidate;
    if (classifyCompanionInitiativeContext(context) === 'crisis') return candidate;

    const partnerDie = typeof dice.d100 === 'function' ? dice.d100() : Math.floor(Math.random() * 100) + 1;
    const rawTag = partnerInitiativeTagFromDie(partnerDie);
    const partnerContext = classifyCompanionInitiativeContext(context);
    const remap = remapPartnerInitiativeForContext(rawTag, partnerContext, partnerDie, handoff, context);
    const gate = applyPartnerMemoryGate(remap.tag, partnerDie, handoff, partnerContext, context);
    const partnerTag = gate.tag;
    audit.push(`6.5h ${handoff.NPC}.PartnerInitiativeDie=${partnerDie}`);
    audit.push(`6.5i ${handoff.NPC}.PartnerInitiativeContext=${partnerContext}`);
    audit.push(`6.5j ${handoff.NPC}.PartnerInitiativeTag=${partnerTag}${partnerTag !== rawTag ? ` (from ${rawTag})` : ''}`);
    if (gate.reason !== 'none') {
        audit.push(`6.5j.1 ${handoff.NPC}.PartnerMemoryGate=${gate.reason}`);
    }
    return {
        ...candidate,
        intent: gate.intent || remap.intent || partnerTag,
        impulse: 'BOND',
        ProactivityTarget: gate.target || remap.target || USER_PROACTIVITY_TARGET,
        TargetsUser: (gate.target || remap.target) && (gate.target || remap.target) !== USER_PROACTIVITY_TARGET ? 'N' : 'Y',
        PartnerInitiative: 'Y',
        PartnerInitiativeTag: partnerTag,
        PartnerInitiativeDie: partnerDie,
        PartnerInitiativeContext: partnerContext,
        PartnerInitiativeRawTag: rawTag,
        PartnerInitiativeMemoryGate: gate.reason,
    };
}

function isPartnerInitiativeEligible(handoff, fin, context = {}) {
    return fin.B >= 4
        && fin.F < 3
        && fin.H < 3
        && handoff?.EstablishedRelationship === 'Y'
        && handoff?.Lock === 'None'
        && isPartnerSceneSuitable(context);
}

function proactivityThresholdForCandidate(tier, handoff, fin, context = {}) {
    const base = thresholdFromTier(tier);
    if (base === 'AUTO') return base;
    if ((isPartnerInitiativeEligible(handoff, fin, context) || isRomanceInitiativeEligible(handoff, fin, context))
        && classifyCompanionInitiativeContext(context) === 'calm') {
        return 12;
    }
    return base;
}

function adjustCompanionProactivityTier(tier, handoff, fin, context) {
    const companionContext = classifyCompanionInitiativeContext(context);
    if (isCompanionCrisisInitiativeEligible(handoff, fin, context)) {
        return tier === 'FORCED' ? 'FORCED' : 'LOW';
    }
    if (!isPartnerInitiativeEligible(handoff, fin, context) && !isRomanceInitiativeEligible(handoff, fin, context)) return tier;
    if (companionContext === 'calm') return 'HIGH';
    if (companionContext === 'active') return tier === 'DORMANT' ? 'MEDIUM' : tier;
    return tier === 'FORCED' ? 'FORCED' : 'LOW';
}

function shouldBlockRelationshipOnlyProactivityForScene(handoff, fin, context = {}) {
    if (!hasRelationshipInitiativeProfile(handoff, fin)) return false;
    if (isCompanionCrisisInitiativeEligible(handoff, fin, context)) return false;
    if (bool(context?.resolutionPacket?.intimacyAdvanceExplicit)) return false;
    return handoff?.EstablishedRelationship === 'Y'
        ? !isPartnerSceneSuitable(context)
        : !isRomanceSceneSuitable(context);
}

function hasRelationshipInitiativeProfile(handoff, fin) {
    return fin.B >= 4
        && fin.F < 3
        && fin.H < 3
        && handoff?.Lock === 'None';
}

function isBlockedPartnerBaseIntent(intent) {
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE', 'CALL_HELP_OR_AUTHORITY', 'WITHDRAW_OR_BOUNDARY'].includes(intent);
}

function partnerInitiativeTagFromDie(die) {
    if (die >= 96) return 'Partner_Conflict';
    if (die >= 81) return 'Partner_Intimacy';
    if (die >= 71) return 'Partner_Gift';
    if (die >= 61) return 'Partner_Date';
    if (die >= 31) return 'Partner_Tease';
    return 'Partner_Flirt';
}

function applyPartnerMemoryGate(tag, die, handoff, context, engineContext = {}) {
    const memory = normalizeProactivityMemory(handoff?.ProactivityMemory);
    if (!isPartnerCooldownTag(tag)) {
        return { tag, intent: tag, target: USER_PROACTIVITY_TARGET, reason: 'none' };
    }

    const activeMs = Number(engineContext?.rapportClock?.activeMs || 0);
    if (memory.partnerMeaningfulCooldownUntilActiveMs > activeMs) {
        const fallback = partnerFallbackTag(die);
        return { tag: fallback, intent: fallback, target: USER_PROACTIVITY_TARGET, reason: `meaningfulPartner.cooldownUntil${memory.partnerMeaningfulCooldownUntilActiveMs}` };
    }

    const ordered = partnerMeaningfulTags();
    let selected = tag;
    const reasons = [];
    if (selected === memory.lastMeaningfulPartnerTag) {
        selected = nextPartnerMeaningfulTag(selected);
        reasons.push(`${tag}.repeatBlocked`);
    }
    let guard = partnerMeaningfulContextBlocker(selected, engineContext);
    while (guard) {
        reasons.push(`${selected}.${guard}`);
        selected = nextPartnerMeaningfulTag(selected);
        if (selected === tag || reasons.length > ordered.length) {
            const fallback = partnerFallbackTag(die);
            return { tag: fallback, intent: fallback, target: USER_PROACTIVITY_TARGET, reason: reasons.join('|') || 'meaningfulPartner.blocked' };
        }
        guard = partnerMeaningfulContextBlocker(selected, engineContext);
    }

    if (selected !== tag) {
        return { tag: selected, intent: selected, target: USER_PROACTIVITY_TARGET, reason: reasons.join('|') };
    }
    return { tag, intent: tag, target: USER_PROACTIVITY_TARGET, reason: 'none' };
}

function isRomanceSceneSuitable(context = {}) {
    return classifyCompanionInitiativeContext(context) === 'calm' && !sceneHasOtherActiveEvent(context);
}

function isPartnerSceneSuitable(context = {}) {
    return classifyCompanionInitiativeContext(context) === 'calm' && !sceneHasOtherActiveEvent(context);
}

function sceneHasOtherActiveEvent(context = {}) {
    const packet = context.resolutionPacket || {};
    const source = [
        context.latestUserText,
        packet.GOAL,
        packet.identifyGoal,
        packet.identifyChallenge,
        packet.explicitMeans,
        packet.Outcome,
        packet.OutcomeTier,
        packet.classifyCombatActionSequence,
        packet.activeHostileThreat,
        packet.harmMode,
        packet.restraintControl?.Present,
        packet.boundaryPressure?.Present,
        packet.boundaryBreak?.Present,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!source) return false;
    if (/\b(fight|combat|attack|strike|hit|slash|stab|shoot|charge|pursuit|chase|threat|danger|crisis|battle|duel|ambush|counterattack|retaliat\w*|boundary|refusal|pressure|force|grapple|restrain|pin|drag|hold down|intimacy|sexual|kiss|undress|exposed)\b/.test(source)) return true;
    return Boolean(packet.classifyCombatActionSequence === 'Y'
        || packetHarmfulAttackActive(packet)
        || packet.activeHostileThreat === 'Y'
        || packetBoundaryActivityActive(packet)
        || (context.chaosBand && context.chaosBand !== 'None'));
}

function romanceDateAndConfessGate(courtship = {}, memory = {}) {
    const askDateAttempts = Number(courtship.askDateAttempts || 0);
    const askDateAccepted = Number(courtship.askDateAccepted || 0);
    const thoughtfulGiftAttempts = Number(courtship.thoughtfulGiftAttempts || 0);
    const thoughtfulGiftAccepted = courtship.thoughtfulGiftAccepted === 'Y' ? 1 : 0;
    const thoughtfulGiftRefused = courtship.thoughtfulGiftRefused === 'Y';
    const dateAndConfessRefused = courtship.dateAndConfessRefused === 'Y' || memory.romanceBlocked === 'Y';
    const unlockedByTwoDates = askDateAccepted >= 2;
    const unlockedByDateAndGift = askDateAccepted >= 1 && thoughtfulGiftAccepted >= 1;
    const permanentlyBlocked = !dateAndConfessRefused && (
        (askDateAttempts >= 2 && askDateAccepted < 1)
        || (thoughtfulGiftAttempts >= 1 && thoughtfulGiftAccepted < 1 && thoughtfulGiftRefused && askDateAccepted < 2)
    );
    const allowed = !dateAndConfessRefused && (unlockedByTwoDates || unlockedByDateAndGift);
    return {
        allowed,
        permanentlyBlocked,
        unlockedByTwoDates,
        unlockedByDateAndGift,
        askDateAttempts,
        askDateAccepted,
        thoughtfulGiftAttempts,
        thoughtfulGiftAccepted,
        thoughtfulGiftRefused,
        dateAndConfessRefused,
    };
}

function isAskDateAttemptAllowed(memory = {}, context = {}) {
    const courtship = memory.b4Courtship || {};
    const attempts = Number(courtship.askDateAttempts || 0);
    if (attempts <= 0) return true;
    if (attempts >= 2) return false;
    const activeMs = Number(context?.rapportClock?.activeMs || 0);
    const availableAt = Number(courtship.askDateCooldownUntilActiveMs || 0);
    return activeMs >= availableAt;
}

function isThoughtfulGiftAllowed(memory = {}) {
    const courtship = memory.b4Courtship || {};
    const askDateAttempts = Number(courtship.askDateAttempts || 0);
    const askDateAccepted = Number(courtship.askDateAccepted || 0);
    const thoughtfulGiftAttempts = Number(courtship.thoughtfulGiftAttempts || 0);
    return askDateAttempts >= 2 && askDateAccepted >= 1 && thoughtfulGiftAttempts < 1;
}

function partnerFallbackTag(die) {
    return die % 2 === 0 ? 'Partner_Tease' : 'Partner_Flirt';
}

function isOnMemoryCooldown(memory, tag) {
    return Number(memory?.cooldowns?.[tag] || 0) > Number(memory?.interchangeCount || 0);
}

function isRomanceMajorTag(tag) {
    return ['Thoughtful_Gift', 'Ask_Date', 'Date_And_Confess'].includes(tag);
}

function isPartnerCooldownTag(tag) {
    return partnerMeaningfulTags().includes(tag);
}

function partnerMeaningfulTags() {
    return ['Partner_Date', 'Partner_Gift', 'Partner_Intimacy', 'Partner_Conflict'];
}

function nextPartnerMeaningfulTag(tag) {
    const ordered = partnerMeaningfulTags();
    const index = ordered.indexOf(tag);
    return ordered[(index + 1) % ordered.length] || ordered[0];
}

function partnerMeaningfulContextBlocker(tag, context = {}) {
    if (tag === 'Partner_Intimacy' && !partnerIntimacyContextAllowed(context)) return 'contextBlocked';
    if (tag === 'Partner_Conflict' && classifyCompanionInitiativeContext(context) !== 'calm') return 'contextBlocked';
    return '';
}

function partnerIntimacyContextAllowed(context = {}) {
    if (classifyCompanionInitiativeContext(context) !== 'calm') return false;
    const packet = context.resolutionPacket || {};
    const source = relationshipText([
        context.latestUserText,
        packet.GOAL,
        packet.identifyGoal,
        packet.identifyChallenge,
        packet.explicitMeans,
    ].filter(Boolean).join(' ')).toLowerCase();
    return /\b(private|alone|bedroom|room|chamber|tent|campfire|cabin|home|house|bath|after\s+sunset|night|quiet|safe|peace|rest|intimate|kiss|touch|hold|embrace|cuddle|desire|arousal|sex|sexual)\b/.test(source)
        && !/\b(public|crowd|market|street|tavern|battle|combat|danger|urgent|guard|witness|witnesses|children|audience|ceremony|court|council)\b/.test(source);
}

function companionCrisisTagFromDie(die, fin, establishedRelationship, dire, canRetreat, attackTarget) {
    const bond = Number(fin?.B ?? 1);
    const closeBond = bond >= 4 || establishedRelationship;
    const hasAttackTarget = Boolean(attackTarget);
    const normalized = clamp(Number(die || 1), 1, 100);
    const remapBlockedAttack = fallbackCompanionCrisisSupportTag(normalized, closeBond);

    if (closeBond) {
        if (dire === 'Y' && canRetreat && normalized === 100) return 'Companion_Retreat';
        if (normalized <= 5) return 'Companion_Warn';
        if (normalized <= 35) return 'Companion_Assist';
        if (normalized <= 75) return 'Companion_Cover';
        return hasAttackTarget ? 'Companion_Attack' : remapBlockedAttack;
    }

    if (bond >= 3) {
        if (dire === 'Y' && canRetreat && normalized >= 96) return 'Companion_Retreat';
        if (normalized <= (dire === 'Y' ? 15 : 20)) return 'Companion_Warn';
        if (normalized <= (dire === 'Y' ? 45 : 55)) return 'Companion_Assist';
        if (normalized <= (dire === 'Y' ? 75 : 80)) return 'Companion_Cover';
        return hasAttackTarget ? 'Companion_Attack' : remapBlockedAttack;
    }

    if (dire === 'Y') {
        if (canRetreat && normalized >= 81) return 'Companion_Retreat';
        if (normalized <= 25) return 'Companion_Warn';
        if (normalized <= 50) return 'Companion_Assist';
        if (normalized <= 65) return 'Companion_Cover';
        return hasAttackTarget ? 'Companion_Attack' : remapBlockedAttack;
    }

    if (normalized <= 35) return 'Companion_Warn';
    if (normalized <= 70) return 'Companion_Assist';
    if (normalized <= 85) return 'Companion_Cover';
    return hasAttackTarget ? 'Companion_Attack' : remapBlockedAttack;
}

function fallbackCompanionCrisisSupportTag(die, closeBond) {
    if (closeBond) return die % 2 === 0 ? 'Companion_Cover' : 'Companion_Assist';
    return die % 3 === 0 ? 'Companion_Warn' : die % 2 === 0 ? 'Companion_Cover' : 'Companion_Assist';
}

function isDireCompanionCrisis(context = {}) {
    const packet = context.resolutionPacket || {};
    if (context.counterPotential === 'severe') return true;
    if (packet.OutcomeTier === 'Critical_Failure') return true;
    if (packet.RollNeeded === 'Y' && packet.classifyCombatActionSequence === 'Y' && environmentThreatLooksUrgent(packet)) return true;
    if (packet.RollNeeded === 'Y' && packet.classifyCombatActionSequence === 'Y' && firstReal(packet.OppTargets?.NPC) && context.counterPotential && context.counterPotential !== 'none') return true;
    if (packet.RollNeeded === 'Y' && firstReal(packet.OppTargets?.ENV) && environmentThreatLooksUrgent(packet)) return true;
    return false;
}

function canCompanionRetreatInCrisis(handoff, fin, dire) {
    if (dire !== 'Y') return false;
    const closeBond = fin.B >= 4 || handoff?.EstablishedRelationship === 'Y';
    if (!closeBond) return true;
    return isNpcBadlyWoundedOrIncapacitated(handoff);
}

function isNpcBadlyWoundedOrIncapacitated(handoff) {
    const condition = String(handoff?.Condition || '').toLowerCase();
    if (['badly_wounded', 'critical', 'incapacitated', 'dead'].includes(condition)) return true;
    const text = [
        ...(Array.isArray(handoff?.Wounds) ? handoff.Wounds : []),
        ...(Array.isArray(handoff?.StatusEffects) ? handoff.StatusEffects : []),
    ].join(' ').toLowerCase();
    return /\b(badly wounded|critical|crippled|maimed|mangled|broken|bleeding out|incapacitated|unconscious|stunned|paralyzed|paralysed|restrained|pinned|immobilized|immobilised)\b/.test(text);
}

function classifyCompanionInitiativeContext(context = {}) {
    const packet = context.resolutionPacket || {};
    if (context.counterPotential && context.counterPotential !== 'none') return 'crisis';
    if (packet.classifyCombatActionSequence === 'Y' || packetHarmfulAttackActive(packet) || packet.activeHostileThreat === 'Y') return 'crisis';
    if (packet.CompanionCommand?.Mode === 'REQUEST_ONLY'
        && toRealArray(packet.CompanionCommand.NPCs).length
        && toRealArray(packet.hostilesInScene?.NPC).length === 1) {
        return 'crisis';
    }
    if (context.chaosBand && context.chaosBand !== 'None') return 'active';
    if (packet.RollNeeded === 'Y' && firstReal(packet.OppTargets?.ENV) && environmentThreatLooksUrgent(packet)) return 'crisis';
    if (packet.RollNeeded === 'Y') return context.kind === 'Skill' || context.kind === 'Social' ? 'active' : 'crisis';
    if (['Combat', 'Intimacy_Physical'].includes(context.kind)) return 'crisis';
    return 'calm';
}

function environmentThreatLooksUrgent(packet = {}) {
    const text = [
        packet.GOAL,
        ...(packet.actions || []),
        ...toRealArray(packet.OppTargets?.ENV),
    ].join(' ').toLowerCase();
    return /\b(fire|burn|burning|smoke|falling|collapse|collapsing|explosion|explosive|flood|drown|poison gas|acid|lava|trap|avalanche|landslide|storm|lightning|pursuit|chase|urgent|danger|hazard)\b/.test(text);
}

function remapCompanionInitiativeForContext(tag, context, die, handoff, engineContext = {}) {
    if (context === 'calm') return { tag, intent: tag, target: USER_PROACTIVITY_TARGET };
    if (context === 'active') {
        if (['Ask_Date', 'Date_And_Confess'].includes(tag)) {
            return { tag: 'Romantic_Attention', intent: 'Romantic_Attention', target: USER_PROACTIVITY_TARGET };
        }
        return { tag, intent: tag, target: USER_PROACTIVITY_TARGET };
    }
    return { tag: 'Companion_Cover', intent: 'SUPPORT_ACT', target: USER_PROACTIVITY_TARGET };
}

function remapPartnerInitiativeForContext(tag, context, die, handoff, engineContext = {}) {
    if (context === 'calm') return { tag, intent: tag, target: USER_PROACTIVITY_TARGET };
    if (context === 'active') {
        if (isPartnerCooldownTag(tag)) {
            const fallback = partnerFallbackTag(die);
            return { tag: fallback, intent: fallback, target: USER_PROACTIVITY_TARGET };
        }
        return { tag, intent: tag, target: USER_PROACTIVITY_TARGET };
    }
    return { tag: 'Companion_Cover', intent: 'SUPPORT_ACT', target: USER_PROACTIVITY_TARGET };
}

function resolveFriendlyCrisisAttackTarget(handoff, context = {}) {
    const packet = context.resolutionPacket || {};
    const actingNpc = handoff?.NPC;
    const commandTarget = resolveCommandTextHostileTarget(actingNpc, context);
    if (commandTarget) return commandTarget;
    const opposedTarget = toRealArray(packet.OppTargets?.NPC)
        .find(name => isValidFriendlyAttackTarget(name, actingNpc));
    if (opposedTarget) return opposedTarget;
    const actionTarget = toRealArray(packet.ActionTargets)
        .find(name => isValidHostileFriendlyAttackFallback(name, actingNpc, context));
    if (actionTarget) return actionTarget;
    const hostilePool = toRealArray(packet.hostilesInScene?.NPC)
        .filter(name => isValidFriendlyAttackTarget(name, actingNpc));
    if (hostilePool.length === 1) return hostilePool[0];
    return null;
}

function isValidFriendlyAttackTarget(name, actingNpc) {
    return isReal(name) && !sameName(name, actingNpc) && name !== USER_PROACTIVITY_TARGET;
}

function isValidHostileFriendlyAttackFallback(name, actingNpc, context = {}) {
    if (!isValidFriendlyAttackTarget(name, actingNpc)) return false;
    return isHostileHandoffTarget(name, context.handoffs);
}

function isHostileHandoffTarget(name, handoffs = []) {
    const handoff = (handoffs || []).find(item => sameName(item?.NPC, name));
    if (!handoff) return false;
    const fin = parseFinalState(handoff.FinalState);
    return fin.H >= 3
        || handoff.Lock === 'HATRED'
        || handoff.Behavior === 'HATRED'
        || handoff.DominantLock === 'HOSTILITY';
}

function resolveCommandTextHostileTarget(actingNpc, context = {}) {
    const hostile = getEstablishedHostileTargetCandidates(context, actingNpc);
    if (!hostile.length) return null;

    const source = relationshipText(context.commandText || '').toLowerCase();
    const exact = hostile.find(item => sourceMentionsNpcOrAlias(source, item));
    if (exact) return exact.NPC;
    return hostile.length === 1 ? hostile[0].NPC : null;
}

function getEstablishedHostileTargetCandidates(context = {}, actingNpc) {
    const packet = context.resolutionPacket || {};
    const candidates = new Map();
    const addCandidate = (name, details = {}) => {
        if (!isValidFriendlyAttackTarget(name, actingNpc)) return;
        const key = normalizeNameKey(name);
        if (!key || candidates.has(key)) return;
        candidates.set(key, { NPC: name, ...details });
    };

    for (const handoff of context.handoffs || []) {
        if (isHostileHandoffTarget(handoff?.NPC, context.handoffs)) {
            addCandidate(handoff.NPC, handoff);
        }
    }

    for (const name of toRealArray(packet.hostilesInScene?.NPC)) {
        const handoff = (context.handoffs || []).find(item => sameName(item?.NPC, name));
        addCandidate(name, handoff || { NPC: name });
    }

    return Array.from(candidates.values());
}

function sourceMentionsNpcOrAlias(source, handoff) {
    const text = String(source || '').toLowerCase();
    const npc = String(handoff?.NPC || '').trim();
    if (!text || !npc) return false;
    const aliases = [
        npc,
        npc.split(/\s+/)[0],
        ...trackerAliasTerms(handoff),
    ].filter(item => String(item || '').trim().length >= 3);
    if (/^raider\d+$/i.test(npc)) {
        const index = Number(String(npc).match(/\d+/)?.[0] || 0);
        if (index >= 1) aliases.push(`raider ${index}`, `raider${index}`);
        if (index === 1) aliases.push('knife raider', 'knife-raider', 'knife-wielder', 'knife wielder');
        if (index === 2) aliases.push('axe raider', 'axe-raider', 'axe-man', 'axe man', 'axeman');
    }
    return unique(aliases).some(alias => new RegExp(`\\b${escapeRegExp(String(alias).toLowerCase())}\\b`, 'i').test(text));
}

function trackerAliasTerms(handoff) {
    const text = [
        handoff?.PersonalitySummary,
        ...(Array.isArray(handoff?.Gear) ? handoff.Gear : []),
        ...(Array.isArray(handoff?.Wounds) ? handoff.Wounds : []),
        ...(Array.isArray(handoff?.StatusEffects) ? handoff.StatusEffects : []),
    ].filter(Boolean).join(' ').toLowerCase();
    const aliases = [];
    const patterns = [
        /\baxe[-\s]?man\b/g,
        /\baxe[-\s]?raider\b/g,
        /\bknife[-\s]?wielder\b/g,
        /\bknife[-\s]?raider\b/g,
        /\bblade[-\s]?wielder\b/g,
        /\bclub[-\s]?bearer\b/g,
        /\bspear[-\s]?carrier\b/g,
        /\bsword[-\s]?fighter\b/g,
        /\braider\b/g,
        /\bogre\b/g,
        /\borc\b/g,
        /\bguard\b/g,
        /\bmonster\b/g,
        /\bbear\b/g,
    ];
    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) aliases.push(match[0]);
    }
    for (const gear of Array.isArray(handoff?.Gear) ? handoff.Gear : []) {
        const item = String(gear || '').toLowerCase();
        if (/\baxe\b/.test(item)) aliases.push('axe-man', 'axe man', 'axeman', 'axe raider', 'axe-raider');
        if (/\bknife|dagger\b/.test(item)) aliases.push('knife-wielder', 'knife wielder', 'knife raider', 'knife-raider');
        if (/\bspear\b/.test(item)) aliases.push('spear-carrier', 'spear carrier');
        if (/\bclub|mace\b/.test(item)) aliases.push('club-bearer', 'club bearer');
    }
    return aliases;
}

function normalizeRomanceStyle(value) {
    const text = String(value || '').trim().toLowerCase();
    return ['nervous', 'flirt', 'auto'].includes(text) ? text : 'auto';
}

function normalizeProactivityTarget(value, refereeContext = null) {
    const text = String(value || '').trim();
    if (!text || ['none', '(none)', 'null', 'n/a'].includes(text.toLowerCase())) return NONE;
    if (isUserReference(text, refereeContext)) return USER_PROACTIVITY_TARGET;
    return text;
}

function isUserProactivityTarget(result, refereeContext = null) {
    return normalizeProactivityTarget(result?.ProactivityTarget, refereeContext) === USER_PROACTIVITY_TARGET
        || result?.TargetsUser === 'Y';
}

function isNpcProactivityTarget(result, refereeContext = null) {
    const target = normalizeProactivityTarget(result?.ProactivityTarget, refereeContext);
    return isReal(target) && target !== USER_PROACTIVITY_TARGET;
}

function hasAggressionProactivityTarget(result, refereeContext = null) {
    return isUserProactivityTarget(result, refereeContext) || isNpcProactivityTarget(result, refereeContext);
}

function deriveProactivityTarget(handoff, resolutionPacket, intent) {
    if (!isImmediateAttackIntent(intent)) return NONE;
    const relation = handoff?.RelationToUserAction || relationToUserAction(handoff?.NPC, resolutionPacket);
    if (relation?.isOpp || relation?.isDirect || relation?.isHarmed) return USER_PROACTIVITY_TARGET;
    const harmed = firstReal(resolutionPacket?.HarmedObservers);
    if (isReal(harmed) && !sameName(harmed, handoff?.NPC)) return harmed;
    const hostileNpc = firstReal(resolutionPacket?.OppTargets?.NPC);
    if (isReal(hostileNpc) && !sameName(hostileNpc, handoff?.NPC)) return hostileNpc;
    return USER_PROACTIVITY_TARGET;
}

function runAggression(ledger, trackerSnapshot, trackerUpdate, proactivityResults, resolutionPacket, dice, audit, context, refereeContext, playerTrackerSnapshot = null) {
    const userCore = getUserCoreStats(ledger);
    const userEquipmentState = normalizeTrackerUserState(playerTrackerSnapshot || buildPlayerTrackerSnapshot(context));
    const counterPotential = resolutionPacket?.CounterPotential || 'none';
    const counterAllowed = ['light', 'medium', 'severe'].includes(counterPotential);
    const counterBonus = counterBonusFromPotential(counterPotential);
    const criticalSuccess = resolutionPacket?.OutcomeTier === 'Critical_Success';
    const retaliationAllowed = packetHarmfulAttackActive(resolutionPacket);
    const proactivityEntries = Object.entries(proactivityResults || {});
    const isCompanionAttack = result => result?.RomanceInitiativeTag === 'Companion_Attack'
        || result?.PartnerInitiativeTag === 'Companion_Attack'
        || result?.CompanionInitiativeTag === 'Companion_Attack';
    const companionAggressive = proactivityEntries.filter(([, result]) =>
        result?.Proactive === 'Y'
        && hasAggressionProactivityTarget(result, refereeContext)
        && result?.Intent === 'ESCALATE_VIOLENCE'
        && isCompanionAttack(result));
    const proactiveAttackAllowed = proactivityEntries.some(([, result]) =>
        result?.Proactive === 'Y'
        && hasAggressionProactivityTarget(result, refereeContext)
        && result?.Intent === 'ESCALATE_VIOLENCE'
        && !isCompanionAttack(result));
    const companionAttackPresent = companionAggressive.length > 0;
    const baseAttackType = criticalSuccess
        ? 'None'
        : counterAllowed
            ? 'CounterAttack'
            : retaliationAllowed
                ? 'Retaliation'
                : proactiveAttackAllowed
                    ? 'ProactiveAttack'
                    : 'None';
    const proactiveAggressive = proactivityEntries.filter(([, result]) =>
        baseAttackType !== 'None'
        && result.Proactive === 'Y'
        && hasAggressionProactivityTarget(result, refereeContext)
        && !isCompanionAttack(result)
        && isImmediateAttackIntentForType(result.Intent, baseAttackType));
    const reactiveCounterTarget = counterAllowed ? firstReal(resolutionPacket?.OppTargets?.NPC) || firstReal(resolutionPacket?.ActionTargets) : null;
    const counterRecipient = resolveReactiveAggressionRecipient(reactiveCounterTarget, resolutionPacket, proactivityEntries, refereeContext);
    const aggressive = counterAllowed && !criticalSuccess && reactiveCounterTarget
        ? uniqueAggressionEntries([
            proactiveAggressive.find(([npc]) => sameName(npc, reactiveCounterTarget)) || [reactiveCounterTarget, {
                Proactive: 'Y',
                Intent: 'BOUNDARY_PHYSICAL',
                Impulse: 'ANGER',
                ProactivityTarget: counterRecipient,
                TargetsUser: isUserProactivityTarget({ ProactivityTarget: counterRecipient }, refereeContext) ? 'Y' : 'N',
                ProactivityTier: 'FORCED',
                ProactivityDie: 20,
                Threshold: 'AUTO',
            }],
            ...companionAggressive,
        ])
        : uniqueAggressionEntries([
            ...proactiveAggressive,
            ...companionAggressive,
        ]);
    const results = {};
    let userTrackerDelta = null;
    const npcTrackerDeltas = [];

    audit.push('STEP 7: EXECUTE NPCAggressionResolution');
    audit.push(`7.1 counterPotential=${counterPotential}`);
    audit.push(`7.1a counterBonus=${counterBonus}`);
    audit.push(`7.1b immediateAttackType=${baseAttackType}`);
    audit.push(`7.1c counterTarget=${reactiveCounterTarget || NONE}`);
    audit.push(`7.1c.1 counterRecipient=${counterRecipient || NONE}`);
    audit.push(`7.1d companionAttackPresent=${companionAttackPresent ? 'Y' : 'N'}`);
    audit.push(`7.2 AggressionPresent=${aggressive.length ? 'Y' : 'N'}`);

        if (!aggressive.length) {
            if (criticalSuccess) audit.push('7.2a Critical_Success -> no immediate NPC attack roll');
            else if (counterAllowed) audit.push('7.2a no qualifying proactive counterattack');
            else if (retaliationAllowed) audit.push('7.2a no qualifying proactive retaliation');
            else if (proactiveAttackAllowed) audit.push('7.2a no qualifying proactive attack');
            else audit.push('7.2a no immediate counterattack/retaliation trigger');
        audit.push('7.2a AGGRESSION_RESULTS={}');
        audit.push('---');
        return { results, userTrackerDelta, npcTrackerDeltas };
    }

    audit.push(`7.3 getUserCoreStats=${compact(userCore)}`);

    for (const [npc, proactivityResult] of aggressive) {
        const target = normalizeProactivityTarget(proactivityResult?.ProactivityTarget || USER_PROACTIVITY_TARGET, refereeContext);
        const targetIsUser = target === USER_PROACTIVITY_TARGET;
        const resultAttackType = isCompanionAttack(proactivityResult)
            ? 'CompanionAttack'
            : baseAttackType;
        const npcCore = normalizeCore(trackerUpdate[npc]?.currentCoreStats || trackerSnapshot[npc]?.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 });
        const attackStat = deriveNpcAggressionStat(npcCore);
        const defenseStat = attackStat;
        const npcImpairment = evaluateNpcAggressionImpairment(npc, trackerUpdate, trackerSnapshot, proactivityResult, attackStat);
        const npcImpairmentPenalty = Number(npcImpairment?.AppliedToRoll === 'Y' ? npcImpairment.RollPenalty : 0);
        const targetImpairment = targetIsUser
            ? evaluateUserDefenseImpairment(ledger, context, resolutionPacket, proactivityResult, defenseStat)
            : evaluateNpcDefenseImpairment(target, trackerUpdate, trackerSnapshot, proactivityResult, defenseStat);
        const targetImpairmentPenalty = Number(targetImpairment?.AppliedToRoll === 'Y' ? targetImpairment.RollPenalty : 0);
        const defenderCore = targetIsUser
            ? userCore
            : normalizeCore(trackerUpdate[target]?.currentCoreStats || trackerSnapshot[target]?.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 });
        const npcDie = dice.d20();
        const defenderDie = dice.d20();
        const npcStatValue = statValue(npcCore, attackStat);
        const defenderStatValue = statValue(defenderCore, defenseStat);
        const targetEquipmentDefense = attackStat === 'PHY'
            ? targetIsUser
                ? resolveUserEquipmentDefense(userEquipmentState)
                : resolveNpcEquipmentDefense(target, trackerUpdate, trackerSnapshot, defenderCore)
            : noEquipmentDefense('ordinary protective equipment does not defend against magical, mental, or supernatural aggression');
        const targetEquipmentDefenseBonus = appliedEquipmentDefenseBonus(targetEquipmentDefense);
        const npcTotal = npcDie + npcStatValue + counterBonus + npcImpairmentPenalty;
        const defenderTotal = defenderDie + defenderStatValue + targetImpairmentPenalty + targetEquipmentDefenseBonus;
        const margin = npcTotal - defenderTotal;
        const ReactionOutcome = aggressionReactionOutcome(margin);
        const inflictedTargetInjury = deriveInflictedTargetInjuryFromAggression({
            npc,
            target,
            proactivityResult,
            attackType: resultAttackType,
            reactionOutcome: ReactionOutcome,
            margin,
            resolutionPacket,
            refereeContext,
        });
        const inflictedUserInjury = inflictedTargetInjury?.targetType === 'user' ? inflictedTargetInjury : null;
        const inflictedNpcInjury = inflictedTargetInjury?.targetType === 'npc' && isReal(target)
            ? inflictedTargetInjury
            : null;
        if (inflictedUserInjury) {
            userTrackerDelta = mergeUserResultInjuryDelta(userTrackerDelta, inflictedUserInjury);
        }
        if (inflictedNpcInjury) {
            npcTrackerDeltas.push({ NPC: target, injury: inflictedNpcInjury });
        }
        results[npc] = { AttackType: resultAttackType, AttackIntent: proactivityResult.Intent, ProactivityTarget: target, AttackStat: attackStat, AttackStatValue: npcStatValue, DefenseStat: defenseStat, DefenseStatValue: defenderStatValue, AttackStyle: aggressionStatStyle(attackStat), CounterPotential: counterPotential, CounterBonus: counterBonus, ReactionOutcome, Margin: margin, NpcDie: npcDie, DefenderDie: defenderDie, NpcTotal: npcTotal, DefenderTotal: defenderTotal, NPCImpairment: npcImpairment, UserImpairment: targetIsUser ? targetImpairment : null, TargetImpairment: targetImpairment, TargetEquipmentDefense: targetEquipmentDefense, InflictedUserInjury: inflictedUserInjury || null, InflictedTargetInjury: inflictedTargetInjury || null };
        audit.push(`7.5 ${npc}.npcCore=${compact(npcCore)}`);
        audit.push(`7.5c ${npc}.AggressionStats=${compact({ AttackStat: attackStat, DefenseStat: defenseStat, AttackStyle: aggressionStatStyle(attackStat) })}`);
        audit.push(`7.5d ${npc}.NPCImpairmentEngine=${compact(npcImpairment)}`);
        audit.push(`7.5e npcTotal=${npcDie}+${attackStat}(${npcStatValue})+${counterBonus}${npcImpairmentPenalty ? `+impairment(${npcImpairmentPenalty})` : ''}=${npcTotal}`);
        audit.push(`7.5f ${npc}.TargetDefenseImpairmentEngine=${compact(targetImpairment)}`);
        audit.push(`7.5f.1 ${npc}.TargetEquipmentDefenseEngine=${compact(targetEquipmentDefense)}`);
        audit.push(`7.5g targetTotal=${defenderDie}+${defenseStat}(${defenderStatValue})${targetImpairmentPenalty ? `+impairment(${targetImpairmentPenalty})` : ''}${targetEquipmentDefenseBonus ? `+equipment(${targetEquipmentDefenseBonus})` : ''}=${defenderTotal}`);
        audit.push(`7.5h ${npc}.InflictedUserInjury=${compact(inflictedUserInjury || {})}`);
        audit.push(`7.5i ${npc}.InflictedTargetInjury=${compact(inflictedTargetInjury || {})}`);
        audit.push(`7.5j ${npc}.ProactivityTarget=${target}`);
        audit.push(`7.6 AGGRESSION_RESULT=${compact(results[npc])}`);

        const companionCounterPotential = resultAttackType === 'CompanionAttack' && !targetIsUser
            ? counterPotentialFromCompanionAttackMargin(margin)
            : 'none';
        if (companionCounterPotential !== 'none' && isReal(target) && !sameName(target, npc) && !results[target]) {
            const counterProactivity = {
                Proactive: 'Y',
                Intent: 'BOUNDARY_PHYSICAL',
                Impulse: 'ANGER',
                ProactivityTarget: npc,
                TargetsUser: 'N',
                ProactivityTier: 'FORCED',
                ProactivityDie: 20,
                Threshold: 'AUTO',
            };
            const counterBonus = counterBonusFromPotential(companionCounterPotential);
            const counterNpcCore = normalizeCore(trackerUpdate[target]?.currentCoreStats || trackerSnapshot[target]?.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 });
            const counterAttackStat = deriveNpcAggressionStat(counterNpcCore);
            const counterDefenseStat = counterAttackStat;
            const counterNpcImpairment = evaluateNpcAggressionImpairment(target, trackerUpdate, trackerSnapshot, counterProactivity, counterAttackStat);
            const counterNpcImpairmentPenalty = Number(counterNpcImpairment?.AppliedToRoll === 'Y' ? counterNpcImpairment.RollPenalty : 0);
            const counterTargetImpairment = evaluateNpcDefenseImpairment(npc, trackerUpdate, trackerSnapshot, counterProactivity, counterDefenseStat);
            const counterTargetImpairmentPenalty = Number(counterTargetImpairment?.AppliedToRoll === 'Y' ? counterTargetImpairment.RollPenalty : 0);
            const counterDefenderCore = normalizeCore(trackerUpdate[npc]?.currentCoreStats || trackerSnapshot[npc]?.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 });
            const counterNpcDie = dice.d20();
            const counterDefenderDie = dice.d20();
            const counterNpcStatValue = statValue(counterNpcCore, counterAttackStat);
            const counterDefenderStatValue = statValue(counterDefenderCore, counterDefenseStat);
            const counterTargetEquipmentDefense = counterAttackStat === 'PHY'
                ? resolveNpcEquipmentDefense(npc, trackerUpdate, trackerSnapshot, counterDefenderCore)
                : noEquipmentDefense('ordinary protective equipment does not defend against magical, mental, or supernatural aggression');
            const counterTargetEquipmentDefenseBonus = appliedEquipmentDefenseBonus(counterTargetEquipmentDefense);
            const counterNpcTotal = counterNpcDie + counterNpcStatValue + counterBonus + counterNpcImpairmentPenalty;
            const counterDefenderTotal = counterDefenderDie + counterDefenderStatValue + counterTargetImpairmentPenalty + counterTargetEquipmentDefenseBonus;
            const counterMargin = counterNpcTotal - counterDefenderTotal;
            const counterReactionOutcome = aggressionReactionOutcome(counterMargin);
            const counterPacket = { ...resolutionPacket, CounterPotential: companionCounterPotential };
            const counterInflictedTargetInjury = deriveInflictedTargetInjuryFromAggression({
                npc: target,
                target: npc,
                proactivityResult: counterProactivity,
                attackType: 'CounterAttack',
                reactionOutcome: counterReactionOutcome,
                margin: counterMargin,
                resolutionPacket: counterPacket,
                refereeContext,
            });
            if (counterInflictedTargetInjury?.targetType === 'npc') {
                npcTrackerDeltas.push({ NPC: npc, injury: counterInflictedTargetInjury });
            }
            results[target] = {
                AttackType: 'CounterAttack',
                AttackIntent: counterProactivity.Intent,
                ProactivityTarget: npc,
                AttackStat: counterAttackStat,
                AttackStatValue: counterNpcStatValue,
                DefenseStat: counterDefenseStat,
                DefenseStatValue: counterDefenderStatValue,
                AttackStyle: aggressionStatStyle(counterAttackStat),
                CounterPotential: companionCounterPotential,
                CounterBonus: counterBonus,
                ReactionOutcome: counterReactionOutcome,
                Margin: counterMargin,
                NpcDie: counterNpcDie,
                DefenderDie: counterDefenderDie,
                NpcTotal: counterNpcTotal,
                DefenderTotal: counterDefenderTotal,
                NPCImpairment: counterNpcImpairment,
                UserImpairment: null,
                TargetImpairment: counterTargetImpairment,
                TargetEquipmentDefense: counterTargetEquipmentDefense,
                InflictedUserInjury: null,
                InflictedTargetInjury: counterInflictedTargetInjury || null,
            };
            audit.push(`7.6a companionCounterPotential=${companionCounterPotential}`);
            audit.push(`7.6b ${target}.counterNpcCore=${compact(counterNpcCore)}`);
            audit.push(`7.6b.1 ${target}.CounterAggressionStats=${compact({ AttackStat: counterAttackStat, DefenseStat: counterDefenseStat, AttackStyle: aggressionStatStyle(counterAttackStat) })}`);
            audit.push(`7.6c ${target}.CounterTargetDefenseImpairmentEngine=${compact(counterTargetImpairment)}`);
            audit.push(`7.6c.1 ${target}.CounterTargetEquipmentDefenseEngine=${compact(counterTargetEquipmentDefense)}`);
            audit.push(`7.6d ${target}.counterTotal=${counterNpcDie}+${counterAttackStat}(${counterNpcStatValue})+${counterBonus}${counterNpcImpairmentPenalty ? `+impairment(${counterNpcImpairmentPenalty})` : ''}=${counterNpcTotal}`);
            audit.push(`7.6e ${npc}.counterDefenseTotal=${counterDefenderDie}+${counterDefenseStat}(${counterDefenderStatValue})${counterTargetImpairmentPenalty ? `+impairment(${counterTargetImpairmentPenalty})` : ''}${counterTargetEquipmentDefenseBonus ? `+equipment(${counterTargetEquipmentDefenseBonus})` : ''}=${counterDefenderTotal}`);
            audit.push(`7.6f COMPANION_COUNTER_RESULT=${compact(results[target])}`);
        }
    }

    audit.push(`7.7 AGGRESSION_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results, userTrackerDelta, npcTrackerDeltas };
}

function counterPotentialFromCompanionAttackMargin(margin) {
    if (margin >= 0) return 'none';
    if (margin >= -3) return 'light';
    if (margin >= -7) return 'medium';
    return 'severe';
}

function resolveReactiveAggressionRecipient(reactiveNpc, resolutionPacket, proactivityEntries, refereeContext = null) {
    if (!isReal(reactiveNpc)) return USER_PROACTIVITY_TARGET;
    const companionAttacker = (proactivityEntries || []).find(([npc, result]) =>
        !sameName(npc, reactiveNpc)
        && result?.Proactive === 'Y'
        && result?.Intent === 'ESCALATE_VIOLENCE'
        && normalizeProactivityTarget(result?.ProactivityTarget, refereeContext) !== USER_PROACTIVITY_TARGET
        && sameName(normalizeProactivityTarget(result?.ProactivityTarget, refereeContext), reactiveNpc));
    if (companionAttacker?.[0]) return companionAttacker[0];
    return USER_PROACTIVITY_TARGET;
}

function uniqueAggressionEntries(entries) {
    const result = [];
    const seen = new Set();
    for (const entry of entries || []) {
        const npc = entry?.[0];
        const key = String(npc || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(entry);
    }
    return result;
}






function chooseGeneratedCore(ledger, resolutionEngine, oppTargetsNpcFirst, dice = null, options = {}) {
    const npcKey = normalizeNameKey(oppTargetsNpcFirst);
    const cached = getGeneratedCoreCache(ledger)[npcKey];
    if (cached?.core) {
        return { ...cached, source: `${cached.source} (cached)` };
    }

    const profile = resolveGeneratedCoreProfile(ledger, resolutionEngine, oppTargetsNpcFirst, options);
    const core = assignGeneratedCoreStats({ Rank: profile.finalRank, MainStat: profile.seed.MainStat }, dice);
    const generated = { ...profile, core };
    if (npcKey) {
        getGeneratedCoreCache(ledger)[npcKey] = generated;
    }
    return generated;
}

function resolveGeneratedCoreProfile(ledger, resolutionEngine, npc, options = {}) {
    const resolutionSeed = normalizeGeneratedStatsSeed(resolutionEngine?.genStats);
    const relationshipSeed = normalizeGeneratedStatsSeed((ledger.relationshipEngine || [])
        .find(item => sameName(item?.NPC, npc))
        ?.genStats);
    const candidates = options.relationshipOnly
        ? [
            { seed: relationshipSeed, source: `relationshipEngine[${npc}].genStats` },
        ]
        : options.preferRelationshipSeed
        ? [
            { seed: relationshipSeed, source: `relationshipEngine[${npc}].genStats` },
            { seed: resolutionSeed, source: 'resolutionEngine.genStats' },
        ]
        : [
            { seed: resolutionSeed, source: 'resolutionEngine.genStats' },
            { seed: relationshipSeed, source: `relationshipEngine[${npc}].genStats` },
        ];
    const selected = candidates.find(item => hasGeneratedStatsSeed(item.seed));
    const specialization = candidates.find(item => item.seed?.MainStat !== 'none')?.seed?.MainStat || 'Balanced';
    const resolved = selected || {
        seed: { CapabilityPool: 'common', MainStat: specialization },
        source: 'deterministic common capability fallback',
    };
    const seed = {
        CapabilityPool: normalizeGeneratedCapabilityPool(resolved.seed?.CapabilityPool, 'common'),
        MainStat: normalizeGeneratedMainStat(resolved.seed?.MainStat) === 'none'
            ? specialization
            : normalizeGeneratedMainStat(resolved.seed?.MainStat),
    };
    const percentile = capabilityPercentileForNpc(npc, seed.CapabilityPool, options.context);
    const finalRank = rankForCapabilityPool(seed.CapabilityPool, percentile);
    return { seed, percentile, finalRank, source: resolved.source };
}

function getGeneratedCoreCache(ledger) {
    ledger.deterministicOverrides = ledger.deterministicOverrides || {};
    ledger.deterministicOverrides.generatedCoreStatsByNpc = ledger.deterministicOverrides.generatedCoreStatsByNpc || {};
    return ledger.deterministicOverrides.generatedCoreStatsByNpc;
}

function normalizeGeneratedStatsSeed(value) {
    return {
        CapabilityPool: normalizeGeneratedCapabilityPool(value?.CapabilityPool),
        MainStat: normalizeGeneratedMainStat(value?.MainStat),
    };
}

function hasGeneratedStatsSeed(seed) {
    return seed?.CapabilityPool !== 'none';
}

function normalizeGeneratedCapabilityPool(value, fallback = 'none') {
    const text = String(value ?? '').trim().toLowerCase();
    return ['common', 'trained', 'elite', 'boss', 'none'].includes(text) ? text : fallback;
}

function normalizeGeneratedMainStat(value) {
    const text = String(value ?? '').trim().toLowerCase();
    const map = { phy: 'PHY', mnd: 'MND', cha: 'CHA', balanced: 'Balanced', none: 'none' };
    return map[text] || 'none';
}

export function rankForCapabilityPool(value, percentile) {
    const pool = normalizeGeneratedCapabilityPool(value, 'common');
    const table = CAPABILITY_POOL_RANK_TABLES[pool] || CAPABILITY_POOL_RANK_TABLES.common;
    const roll = clamp(Math.floor(Number(percentile) || 1), 1, 100);
    return table.find(entry => roll <= entry.max)?.rank || table[table.length - 1].rank;
}

function capabilityPercentileForNpc(npc, pool, context = null) {
    const root = context?.chatMetadata?.structuredPreflightTracker || {};
    const campaignSeed = String(root?.health?.seed || root?.worldState?.reputationLocation || 'story-engine');
    const npcSeed = normalizeNameKey(npc) || String(npc || 'unknown').trim().toLowerCase() || 'unknown';
    return stablePercentile(`${campaignSeed}|${npcSeed}|${pool}`);
}

function stablePercentile(value) {
    let hash = 2166136261;
    for (const char of String(value || 'story-engine')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 100) + 1;
}

function generatedCoreAuditEntry(npc, generated = {}) {
    const core = generated?.core || {};
    return {
        NPC: npc || NONE,
        CapabilityPool: generated?.seed?.CapabilityPool || 'common',
        Percentile: generated?.percentile ?? 1,
        FinalRank: core.Rank || generated?.finalRank || 'none',
        MainStat: core.MainStat || generated?.seed?.MainStat || 'Balanced',
        PHY: core.PHY ?? 1,
        MND: core.MND ?? 1,
        CHA: core.CHA ?? 1,
        Source: generated?.source || 'deterministic capability pool',
    };
}

function mergeGeneratedNpcStats(entries = []) {
    const merged = new Map();
    for (const entry of entries) {
        const key = normalizeNameKey(entry?.NPC);
        if (!key || merged.has(key)) continue;
        merged.set(key, entry);
    }
    return [...merged.values()];
}

function assignGeneratedCoreStats(seed, dice = null) {
    const rank = Object.prototype.hasOwnProperty.call(GENERATED_CORE_RANGES, seed?.Rank) ? seed.Rank : 'Average';
    const mainStat = normalizeGeneratedMainStat(seed?.MainStat) === 'none' ? 'Balanced' : normalizeGeneratedMainStat(seed?.MainStat);
    const range = GENERATED_CORE_RANGES[rank] || GENERATED_CORE_RANGES.Average;
    const [min, max] = range;
    const stats = {
        PHY: rollGeneratedStat(min, max, dice),
        MND: rollGeneratedStat(min, max, dice),
        CHA: rollGeneratedStat(min, max, dice),
    };

    if (mainStat === 'Balanced') {
        const center = rollGeneratedStat(min, max, dice);
        for (const stat of ['PHY', 'MND', 'CHA']) {
            stats[stat] = clamp(center + rollGeneratedStat(-1, 1, dice), min, max);
        }
    } else if (['PHY', 'MND', 'CHA'].includes(mainStat)) {
        const others = ['PHY', 'MND', 'CHA'].filter(stat => stat !== mainStat);
        const otherMax = Math.max(...others.map(stat => stats[stat]));
        stats[mainStat] = Math.max(stats[mainStat], otherMax);
        if (max > min && stats[mainStat] <= otherMax) {
            stats[mainStat] = Math.min(max, otherMax + 1);
        }
        if (max > min) {
            for (const stat of others) {
                if (stats[stat] >= stats[mainStat]) {
                    stats[stat] = Math.max(min, stats[mainStat] - 1);
                }
            }
        }
    }

    return normalizeCore({
        Rank: rank,
        MainStat: mainStat,
        ...stats,
    }, { Rank: 'none', MainStat: 'none', PHY: 1, MND: 1, CHA: 1 });
}

function rollGeneratedStat(min, max, dice = null) {
    const low = Number(min);
    const high = Number(max);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return 1;
    if (high <= low) return low;
    const span = high - low + 1;
    const die = typeof dice?.d20 === 'function' ? dice.d20() : Math.floor(Math.random() * 20) + 1;
    return low + ((die - 1) % span);
}

function buildRefereeContext(context) {
    const fields = getCardFields(context);
    const userNames = buildUserReferenceNames(context, fields);
    const userReferencePattern = buildUserReferencePattern(userNames);

    return {
        userReferenceNames: userNames,
        userReferencePattern,
    };
}

function getCardFields(context) {
    try {
        return typeof context?.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function resolveDeterministicInitPreset(npc, state, sem, audit, label, options = {}) {
    const flags = normalizeSemanticInitPresetFlags(sem?.initPreset);
    const raceProfile = normalizeNpcRaceProfile(state?.raceProfile);
    const reputationApplication = resolveUserReputationInitApplication(options?.userReputation, {
        location: options?.currentReputationLocation,
        userNonHuman: flags.userNonHuman && !flags.fearImmunity,
    });

    let base = { label: 'neutralDefault', disposition: { B: 2, F: 2, H: 2 } };
    if (flags.romanticOpen) {
        base = { label: 'romanticOpen', disposition: { B: 4, F: 1, H: 1 } };
    } else if (flags.userBadRep) {
        base = { label: 'userBadRep', disposition: { B: 1, F: 2, H: 3 } };
    } else if (flags.priorUserGoodRep) {
        base = { label: 'priorUserGoodRep', disposition: { B: 3, F: 1, H: 1 } };
    } else if (reputationApplication?.label) {
        base = reputationApplication;
    } else if (flags.userNonHuman && !flags.fearImmunity) {
        base = { label: 'userNonHuman', disposition: { B: 1, F: 2, H: 2 } };
    }
    const userHistory = initUserHistoryFromFlags(flags, state?.userHistory);

    audit.push(`${label}.semantic=${compact({
        npc,
        flags: {
            romanticOpen: yn(flags.romanticOpen),
            userBadRep: yn(flags.userBadRep),
            priorUserGoodRep: yn(flags.priorUserGoodRep),
            userNonHuman: yn(flags.userNonHuman),
            fearImmunity: yn(flags.fearImmunity),
        },
        base: base.label,
        reputation: reputationApplication?.reputation || null,
    })}`);
    return {
        ...base,
        flags,
        userHistory,
        raceProfile,
    };
}

function resolveUserReputationInitApplication(userReputation, options = {}) {
    const reputation = selectApplicableUserReputationLocation(userReputation, options?.location);
    if (!reputation) return null;
    const fame = Math.max(0, Math.floor(Number(reputation.fame || 0)));
    const infamy = Math.max(0, Math.floor(Number(reputation.infamy || 0)));
    const userNonHuman = bool(options?.userNonHuman);
    const effectiveInfamy = userNonHuman && infamy > 0 ? infamy + 5 : infamy;
    const effectiveFame = userNonHuman ? Math.max(0, fame - 5) : fame;
    const labelPrefix = userNonHuman ? 'userNonHuman' : 'user';

    let label = '';
    let disposition = null;
    if (effectiveInfamy >= 25) {
        label = `${labelPrefix}Infamy${effectiveInfamy >= 25 ? 25 : effectiveInfamy}`;
        disposition = { B: 1, F: 4, H: 4 };
    } else if (effectiveInfamy >= 20) {
        label = `${labelPrefix}Infamy20`;
        disposition = { B: 1, F: 3, H: 4 };
    } else if (effectiveInfamy >= 15) {
        label = `${labelPrefix}Infamy15`;
        disposition = { B: 1, F: 3, H: 3 };
    } else if (effectiveInfamy >= 10) {
        label = `${labelPrefix}Infamy10`;
        disposition = { B: 1, F: 2, H: 3 };
    } else if (effectiveInfamy >= 5) {
        label = `${labelPrefix}Infamy5`;
        disposition = { B: 1, F: 2, H: 2 };
    }

    if (!disposition) {
        if (effectiveFame >= 10) {
            label = userNonHuman
                ? (fame >= 20 ? 'userNonHumanFame20' : 'userNonHumanFame15')
                : (fame >= 15 ? 'userFame15' : 'userFame10');
            disposition = { B: 3, F: 1, H: 1 };
        } else if (effectiveFame >= 5) {
            label = userNonHuman ? 'userNonHumanFame10' : 'userFame5';
            disposition = { B: 2, F: 1, H: 2 };
        } else if (userNonHuman && fame >= 5) {
            label = 'userNonHumanFame5';
            disposition = { B: 2, F: 2, H: 2 };
        }
    }

    if (!disposition) return null;
    return {
        label,
        disposition,
        reputation: {
            location: reputation.location,
            fame,
            infamy,
            effectiveFame,
            effectiveInfamy,
        },
    };
}

function selectApplicableUserReputationLocation(userReputation, currentLocation = '') {
    const ledger = normalizeUserReputation(userReputation || {});
    const locations = Object.values(ledger.locations || {}).map(normalizeUserReputationLocation).filter(entry => entry.location);
    if (!locations.length) return null;
    const wanted = normalizeReputationLocation(currentLocation);
    if (!wanted) return null;
    return locations.find(entry => entry.location.toLowerCase() === wanted.toLowerCase()) || null;
}

function normalizeSemanticInitPresetFlags(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        romanticOpen: bool(source.romanticOpen),
        userBadRep: bool(source.userBadRep),
        priorUserGoodRep: bool(source.priorUserGoodRep || source.userGoodRep),
        userNonHuman: bool(source.userNonHuman),
        fearImmunity: bool(source.fearImmunity || source.fearImmune),
    };
}

function initUserHistoryFromFlags(flags, stored) {
    const normalized = normalizeInitUserHistory(stored);
    if (flags.userBadRep) return { knowsUser: 'Y', standing: 'negative' };
    if (flags.romanticOpen || flags.priorUserGoodRep) return { knowsUser: 'Y', standing: 'positive' };
    if (normalized.knowsUser === 'Y' || normalized.standing !== 'neutral') return normalized;
    return { knowsUser: 'N', standing: 'neutral' };
}

function normalizeInitUserHistory(value) {
    const source = value && typeof value === 'object' ? value : {};
    const knowsUser = source.knowsUser === 'Y' ? 'Y' : 'N';
    const standing = ['positive', 'neutral', 'negative', 'fear'].includes(source.standing) ? source.standing : 'neutral';
    return { knowsUser, standing };
}

function buildUserReferenceNames(context, fields = {}) {
    return unique([
        context?.name1,
        context?.user,
        context?.userName,
        context?.personaName,
        fields.user,
        fields.userName,
        fields.personaName,
        parsePersonaName(fields.persona),
    ].map(cleanInitScalar).filter(isReal));
}

function defaultUserReferenceNames() {
    return ['{{user}}', 'user', 'the user', 'player', 'the player', 'protagonist', 'the protagonist', 'you', 'yourself'];
}

function buildUserReferencePattern(userNames = []) {
    const refs = unique([
        ...defaultUserReferenceNames(),
        ...userNames,
    ].map(cleanInitScalar).filter(isReal));
    const body = refs
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join('|');
    return `(?<![A-Za-z0-9_])(?:${body})(?![A-Za-z0-9_])`;
}

function userReferencePattern(refereeContext = null) {
    return refereeContext?.userReferencePattern || buildUserReferencePattern(refereeContext?.userReferenceNames || []);
}

function isUserReference(value, refereeContext = null) {
    const text = cleanInitScalar(value);
    if (!text) return false;
    if (/^\{\{\s*user\s*\}\}$/i.test(text)) return true;
    if (/^(?:user|the user|player|the player|protagonist|the protagonist|you|yourself)$/i.test(text)) return true;
    return toRealArray(refereeContext?.userReferenceNames)
        .some(name => sameName(name, text));
}

function removeUserReferencesFromTargets(targets, refereeContext = null) {
    const withoutUser = values => toRealArray(values).filter(name => !isUserReference(name, refereeContext));
    return {
        hostilesInScene: {
            NPC: withoutUser(targets?.hostilesInScene?.NPC),
        },
        ActionTargets: withoutUser(targets?.ActionTargets),
        OppTargets: {
            NPC: withoutUser(targets?.OppTargets?.NPC),
            ENV: toRealArray(targets?.OppTargets?.ENV),
        },
        BenefitedObservers: withoutUser(targets?.BenefitedObservers),
        HarmedObservers: withoutUser(targets?.HarmedObservers),
        NPCAwareOfUser: withoutUser(targets?.NPCAwareOfUser),
        PowerActors: withoutUser(targets?.PowerActors),
    };
}

function parsePersonaName(text) {
    const source = String(text || '');
    const match = source.match(/^\s*(?:[-*#]\s*)?(?:Name|Player\s*Name|Character\s*Name)\s*[:=]\s*([^\n\r]+)/im);
    if (!match) return '';
    return match[1].replace(/[`*_~]/g, '').trim();
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanInitScalar(value) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    return text.slice(0, 80);
}

function getPureLoveDeclarationNoRollEvidence(semantic, goal, refereeContext = null) {
    const source = semanticSourceText(semantic);
    if (!isPureLoveDeclarationOrReciprocation(source, refereeContext)) return null;
    return {
        rollNeeded: 'N',
        rule: 'hard_override_pure_love_declaration_no_roll',
        evidence: {
            hardRule: 'ResolutionEngine.rollNeeded: pure love declarations, confessions, or reciprocations are disposition responses, not dice challenges',
            from: bool(semantic?.rollNeeded) ? 'Y' : 'N',
            to: 'N',
            evidence: source.slice(0, 220),
        },
    };
}

function getRomanceNoRollOverrideEvidence(semantic, semanticRollNeeded, boundaryBreakPresent, intimacyAdvanceExplicit = 'N') {
    if (boundaryBreakPresent === 'Y' || semanticRollNeeded !== 'Y') return null;
    const source = semanticSourceText(semantic);
    if (isDirectedCompanionAttackCommandText(source) || hasCombatActionLanguage(source) || bool(semantic?.activeHostileThreat)) return null;
    if (!isRomanticOrIntimateConversation(source)) return null;
    if (hasBoundaryViolationLanguage(source)) return null;
    return {
        rollNeeded: 'N',
        rule: 'hard_override_romance_conversation_no_roll',
        evidence: {
            hardRule: 'ResolutionEngine.rollNeeded: flirting, teasing, romantic talk, intimacy proposals, permission asks, or reciprocation are not stakes unless boundaryBreak=Y or ordinary non-romantic stakes apply; intimacyAdvanceExplicit is handled by IntimacyBoundary without a roll',
            from: 'Y',
            to: 'N',
            intimacyAdvanceExplicit,
            evidence: source.slice(0, 220),
        },
    };
}

function semanticSourceText(semantic) {
    return [
        semantic?.identifyGoal,
        semantic?.identifyChallenge,
        semantic?.explicitMeans,
    ].filter(Boolean).join(' ').toLowerCase();
}

function isRomanticOrIntimateConversation(source) {
    const text = String(source || '').toLowerCase();
    return /\b(flirt|teas(?:e|es|ing)|banter|compliment|blush|romantic|romance|love|date|court|kiss|touch|hold|embrace|hug|cuddle|caress|intimacy|intimate|sex|sexual|desire|want you|want me|private time|alone together|distract(?:ion|ions)?|seduc(?:e|tion|tive)|suggestive|affection|affectionate)\b/.test(text)
        || /\b(can i|could i|may i|would you|will you|do you want|if you want|what .* in mind)\b.{0,100}\b(kiss|touch|hold|embrace|hug|caress|intimacy|intimate|sex|bed|date|distract)\b/.test(text);
}

function hasBoundaryViolationLanguage(source) {
    const text = String(source || '').toLowerCase();
    return /\b(after|despite|even though|ignoring|ignore|ignored|keeps?|continue(?:s|d)?|press(?:es|ed|ing)?|push(?:es|ed|ing)?|insist(?:s|ed|ing)?|force(?:s|d|ing)?|coerc(?:e|es|ed|ing|ion)|threat(?:en|ens|ened|ening)?|blackmail|grab(?:s|bed|bing)?|restrain(?:s|ed|ing)?|pin(?:s|ned|ning)?|won['’]?t stop|refus(?:e|es|ed|al)|said no|told me no|told .* stop|pull(?:s|ed|ing)? away|withdraw(?:s|n|ing)?|unwanted|without consent)\b/.test(text);
}

function isPureLoveDeclarationOrReciprocation(source, refereeContext = null) {
    const text = String(source || '').toLowerCase();
    const userRef = userReferencePattern(refereeContext);
    const hasLoveDeclaration = new RegExp(`\\b(?:i\\s+(?:think\\s+|know\\s+|realize\\s+|realise\\s+)?love\\s+${userRef}(?:\\s+too)?|love\\s+${userRef}\\s+too|i['\\u2019]m\\s+in\\s+love\\s+with\\s+${userRef}|i\\s+have\\s+feelings\\s+for\\s+${userRef}|i\\s+feel\\s+the\\s+same(?:\\s+way)?|i\\s+feel\\s+it\\s+too)`, 'i').test(text);
    if (!hasLoveDeclaration) return false;
    if (hasBoundaryViolationLanguage(text)) return false;
    if (hasDirectBodilyAggression(text) || isObjectBoundaryContest(text) || isBodyBoundaryPressure(text)) return false;
    if (/\b(?:threaten|blackmail|coerc(?:e|es|ed|ing|ion)|force(?:s|d|ing)?|demand(?:s|ed|ing)?|intimidat(?:e|es|ed|ing|ion)|manipulat(?:e|es|ed|ing|ion)|lie(?:s|d)?|deceiv(?:e|es|ed|ing)|trick(?:s|ed|ing)?|pressure(?:s|d|ing)?|ultimatum)\b/.test(text)) return false;
    if (/\b(?:if\s+you\s+do\s+not|if\s+you\s+don['’]t|or\s+else|you\s+(?:must|have\s+to|need\s+to)\s+(?:love|accept|date|be\s+with))\b/.test(text)) return false;
    if (/\b(?:can\s+i|could\s+i|may\s+i|would\s+you|will\s+you|do\s+you\s+want|if\s+you\s+want|kiss|touch|hold|embrace|hug|caress|cuddle|date|bed|sex|intimacy|intimate|private\s+time|alone\s+together|distract(?:ion|ions)?)\b/.test(text)) return false;
    return true;
}

function isObjectBoundaryContest(source) {
    const forcefulObject = /\b(snatch(?:es|ed|ing)?|grab(?:s|bed|bing)?|take(?:s|n)?|took|pull(?:s|ed|ing)?|yank(?:s|ed|ing)?|wrench(?:es|ed|ing)?|rip(?:s|ped|ping)?|steal(?:s|ing|stole|stolen)?|seize(?:s|d|ing)?|force(?:s|d|ing)? past|push(?:es|ed|ing)? past|shove(?:s|d)? past|barge(?:s|d|ing)?|open(?:s|ed|ing)?|unlock(?:s|ed|ing)?)\b/.test(source);
    const objectOrBoundary = /\b(scroll|book|letter|coin|purse|bag|pack|pouch|wallet|phone|cellphone|mobile|smartphone|laptop|tablet|camera|weapon|sword|dagger|knife|blade|key|door|gate|chest|box|object|item|thing|tool|staff|wand|ring|amulet|bottle|cup|glass|map|note|paper|gear|equipment|possession|path|passage|doorway|threshold|room|space|hand|table|desk|belt)\b/.test(source);
    return forcefulObject && objectOrBoundary;
}

function isBodyBoundaryPressure(source) {
    const gentleGrab = /\b(?:catch(?:es|ing|ed)?|grab(?:s|bed|bing)?|hold(?:s|ing|held)?|seize(?:s|d|ing)?|take(?:s|n)?|caught)\b.{0,50}\b(?:wrist|arm|forearm|hand|shoulder|sleeve|cloak|collar|clothing|shirt|coat)\b/.test(source)
        || /\b(?:wrist|arm|forearm|hand|shoulder|sleeve|cloak|collar|clothing|shirt|coat)\b.{0,50}\b(?:catch(?:es|ing|ed)?|grab(?:s|bed|bing)?|hold(?:s|ing|held)?|seize(?:s|d|ing)?|caught)\b/.test(source);
    const stopOrAttention = /\b(?:before|stop(?:s|ped|ping)?|keep(?:s|ing)?|prevent(?:s|ed|ing)?|delay(?:s|ed|ing)?|halt(?:s|ed|ing)?|wait|listen|attention|turn(?:s|ed|ing)? back|walk(?:s|ed|ing)? away|leave(?:s|ing)?|leaving|depart(?:s|ed|ing)?|go(?:es|ing)? away|run(?:s|ning)? away|block(?:s|ed|ing)? departure)\b/.test(source);
    return gentleGrab && stopOrAttention;
}

function hasDirectBodilyAggression(source) {
    return /\b(punch(?:es|ed|ing)?|kick(?:s|ed|ing)?|strike(?:s|struck|striking)?|hit(?:s|ting)?|slash(?:es|ed|ing)?|stab(?:s|bed|bing)?|cut(?:s|ting)?|injur(?:e|es|ed|ing)?|hurt(?:s|ing)?|choke(?:s|d|ing)?|tackle(?:s|d|ing)?|slam(?:s|med|ming)?|twist(?:s|ed|ing)?|crush(?:es|ed|ing)?|shove(?:s|d|ing)?\s+(?:him|her|them|npc|guard|bandit|woman|man)|grab(?:s|bed|bing)?\s+(?:him|her|them|npc|guard|bandit|woman|man|throat|neck|body|waist|hair|face|leg|ankle)\b|restrain(?:s|ed|ing)?|pin(?:s|ned|ning)?|immobiliz(?:e|es|ed|ing)|drag(?:s|ged|ging)?\s+(?:him|her|them|npc|guard|bandit|woman|man)|force(?:s|d|ing)?\s+(?:him|her|them|npc|guard|bandit|woman|man)\b|block(?:s|ed|ing)?\s+(?:his|her|their)?\s*(?:escape|movement)|violent(?:ly)?|rough(?:ly)?|hard enough|until it hurt|until it hurts)\b/.test(source);
}















































function buildTargetClassifier(ledger, trackerSnapshot, context, hiddenHealthSnapshot = null) {
    const livingNames = new Set();

    for (const name of Object.keys(trackerSnapshot || {})) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.hostilesInScene?.NPC)) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.ActionTargets)) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.BenefitedObservers)) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.HarmedObservers)) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.NPCAwareOfUser)) addLivingName(livingNames, name);
    for (const item of ledger.relationshipEngine || []) addLivingName(livingNames, item?.NPC);

    try {
        const fields = typeof context?.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
        addLivingName(livingNames, fields?.name);
    } catch {
        // Non-fatal; semantic/tracker names are still available.
    }

    addLivingName(livingNames, context?.name2);
    addLivingName(livingNames, context?.name1);

    for (const [name, entry] of Object.entries(trackerSnapshot || {})) {
        if (normalizeTrackerCondition(entry?.condition) === 'dead') {
            livingNames.delete(normalizeNameKey(name));
        }
    }
    for (const [name, actor] of Object.entries(hiddenHealthSnapshot?.npcs || {})) {
        if (actor?.dead === true || normalizeTrackerCondition(actor?.condition ?? actor?.defeatedCondition) === 'dead') {
            livingNames.delete(normalizeNameKey(name));
        }
    }

    return {
        isLiving(name) {
            const normalized = normalizeNameKey(name);
            if (!normalized) return false;
            return livingNames.has(normalized);
        },
    };
}

function addLivingName(set, name) {
    const normalized = normalizeNameKey(name);
    if (normalized) set.add(normalized);
}
