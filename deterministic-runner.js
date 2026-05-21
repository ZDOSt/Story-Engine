import {
    createDice,
    combatOutcome,
    nonHostileOutcome,
    counterBonusFromPotential,
    aggressionReactionOutcome,
    isDefaultGeneratedCore,
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
    normalizeTrackerCondition,
    normalizeTargets,
    sanitizeTargets,
    sameTargets,
    targetSummary,
    normalizeNameKey,
    normalizeActionMarkers,
    normalizeCore,
    getUserCoreStats,
    statValue,
    normalizeMapStats,
    applyMapStatsHardRules,
    isBodyAffectingMagic,
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

const NONE = '(none)';
const NAME_REGISTRY_KEY = 'structuredPreflightNameRegistry';
const USER_PROACTIVITY_TARGET = '{{user}}';
const RAPPORT_ACTIVE_IDLE_LIMIT_MS = 10 * 60 * 1000;
const RAPPORT_COOLDOWN_MS = 90 * 60 * 1000;
const PARTNER_MEANINGFUL_COOLDOWN_HOUR_MS = 60 * 60 * 1000;
const NPC_PROACTIVITY_CAP = 3;
const NAME_POOL_SIZE = 3;
const DEFAULT_NAME_STYLE = 'Balanced Fantasy';

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

export async function saveTrackerUpdate(context, trackerUpdate, options = {}) {
    if (!context?.chatMetadata || !trackerUpdate) return;

    const root = context.chatMetadata.structuredPreflightTracker || { npcs: {}, user: {}, rapportClock: normalizeRapportClock() };
    root.npcs = root.npcs || {};
    root.user = normalizeTrackerUserState(root.user || {});
    root.rapportClock = normalizeRapportClock(root.rapportClock);

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

    context.chatMetadata.structuredPreflightTracker = root;

    if (options.save === false) return;

    if (typeof context.saveMetadataDebounced === 'function') {
        context.saveMetadataDebounced();
    } else if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata();
    }
}

export function normalizeRapportClockState(value = {}) {
    return normalizeRapportClock(value);
}

export function runDeterministicEngines(ledger, trackerSnapshot, context, type) {
    const audit = [];
    const dice = createDice();
    const refereeContext = buildRefereeContext(context);
    const rapportClock = advanceRapportClock(context, audit);
    const resolution = runResolution(ledger, trackerSnapshot, dice, audit, context, refereeContext);
    const relationships = runRelationships(ledger, trackerSnapshot, resolution.packet, audit, refereeContext, context, rapportClock);
    const chaos = runChaos(ledger, relationships.handoffs, resolution.packet, dice, audit);
    const name = runNameGeneration(ledger, audit, context, type);
    const injuryTrackerUpdate = applyInflictedNpcInjuriesToTrackerUpdate(resolution.packet, relationships.trackerUpdate, trackerSnapshot, audit);
    const proactivity = runProactivity(ledger, relationships.handoffs, resolution.packet, chaos.handoff, dice, audit, refereeContext, context, rapportClock);
    applyProactivityMemoryResults(injuryTrackerUpdate, relationships.handoffs, proactivity.results, dice, audit, rapportClock);
    const aggression = runAggression(ledger, trackerSnapshot, injuryTrackerUpdate, proactivity.results, resolution.packet, dice, audit, context, refereeContext);
    const trackerDeltas = runTrackerUpdates(ledger, trackerSnapshot, injuryTrackerUpdate, context, audit, aggression.userTrackerDelta, aggression.npcTrackerDeltas);

    const trackerUpdate = {
        npcs: trackerDeltas.npcs,
        user: trackerDeltas.user,
    };
    const finalNarrativeHandoff = {
        generationType: type || 'normal',
        resolutionPacket: resolution.packet,
        npcHandoffs: relationships.handoffs,
        chaosHandoff: chaos.handoff,
        nameGeneration: name,
        proactivityResults: proactivity.results,
        aggressionResults: aggression.results,
        persistencePolicy: buildPersistencePolicy(),
        resultLine: resolution.resultLine,
        narrationGuidance: buildNarrationGuidance(resolution.packet, relationships.handoffs, chaos.handoff, proactivity.results, aggression.results),
        sceneTrackerUpdate: trackerUpdate,
    };

    audit.push(`TRACKER_UPDATE_SAVED=${trackerSummary(trackerUpdate)}`);
    audit.push('RESULT_LINE=' + resolution.resultLine);

    return {
        auditLines: audit,
        semanticLedger: ledger,
        finalNarrativeHandoff,
        trackerUpdate,
    };
}

function normalizeRapportClock(value = {}) {
    return {
        activeMs: Math.max(0, Math.floor(Number(value?.activeMs || 0))),
        lastActivityAt: Math.max(0, Math.floor(Number(value?.lastActivityAt || 0))),
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
    };

    root.npcs = root.npcs || {};
    root.user = root.user || {};
    root.rapportClock = clock;
    context.chatMetadata.structuredPreflightTracker = root;
    audit.push(`RAPPORT_CLOCK=${compact({ ...clock, elapsedMs, activeDeltaMs, idleGapIgnored })}`);
    return clock;
}

function runResolution(ledger, trackerSnapshot, dice, audit, context, refereeContext) {
    const semantic = ledger.resolutionEngine || {};
    const targetClassifier = buildTargetClassifier(ledger, trackerSnapshot, context, refereeContext);
    const rawTargets = normalizeTargets(semantic.identifyTargets);
    const identityTargets = removeUserReferencesFromTargets(rawTargets, refereeContext);
    const goal = String(semantic.identifyGoal || 'Normal_Interaction');
    const semanticHasStakes = bool(semantic.hasStakes) ? 'Y' : 'N';
    const intimacyAdvanceExplicit = bool(semantic.intimacyAdvanceExplicit) ? 'Y' : 'N';
    const boundaryViolationExplicit = bool(semantic.boundaryViolationExplicit) ? 'Y' : 'N';

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
    audit.push(`2.3a boundaryViolationExplicit=${boundaryViolationExplicit}`);
    const pureLoveDeclarationEvidence = getPureLoveDeclarationNoRollEvidence(semantic, goal, refereeContext);
    const companionCommandNoRollEvidence = getDirectedCompanionCommandNoRollEvidence(semantic, identityTargets, trackerSnapshot, targetClassifier, context);
    const stakesOverrideEvidence = companionCommandNoRollEvidence
        || pureLoveDeclarationEvidence
        || getRomanceNoRollOverrideEvidence(semantic, semanticHasStakes, boundaryViolationExplicit, intimacyAdvanceExplicit);
    const hasStakes = stakesOverrideEvidence?.hasStakes || semanticHasStakes;
    const stakesRule = stakesOverrideEvidence?.rule || 'semantic_final';
    audit.push(`2.4a semanticHasStakes=${semanticHasStakes}`);
    audit.push(`2.4b deterministicStakesRule=${stakesRule}`);
    if (stakesOverrideEvidence) {
        audit.push(`2.4c deterministicStakesEvidence=${compact(stakesOverrideEvidence.evidence)}`);
    }
    audit.push(`2.4 hasStakes=${hasStakes}`);

    const semanticTargetsForResolution = companionCommandNoRollEvidence
        ? normalizeDirectedCompanionCommandTargets(identityTargets, targetClassifier, semantic, trackerSnapshot, context, audit)
        : identityTargets;
    const sanitizedTargets = sanitizeTargets(semanticTargetsForResolution, targetClassifier, { hasStakes, goal, boundaryViolationExplicit });
    const directedCompanionTargets = repairDirectedCompanionAttackHostilePool(sanitizedTargets, ledger, trackerSnapshot, semantic, context, audit);
    const targets = repairLivingOppositionTargets(directedCompanionTargets, targetClassifier, { hasStakes, semantic, goal, boundaryViolationExplicit, context }, audit);
    audit.push(`2.4d identifyTargets.final=${formatTargets(targets)}`);
    if (!sameTargets(rawTargets, targets)) {
        audit.push(`2.4e deterministicTargetSanitizer=${compact({
            reason: hasStakes === 'N'
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
    ].filter(name => isReal(name) && targetClassifier.isLiving(name)));
    const pendingNpcInScene = pendingProactivityResponseNpcNames(trackerSnapshot, context, targetNpcInScene);
    const npcInScene = unique([...targetNpcInScene, ...pendingNpcInScene]);
    audit.push(`2.5 NPCInScene=[${npcInScene.join(',') || NONE}]`);
    if (pendingNpcInScene.length) {
        audit.push(`2.5a pendingProactivityResponseNpc=[${pendingNpcInScene.join(',')}]`);
    }

    let actions = ['a1'];
    let outcome = {
        OutcomeTier: 'NONE',
        LandedActions: '(none)',
        Outcome: 'no_roll',
        CounterPotential: 'none',
    };
    let resultLine = 'No roll';
    let hostilePhysical = false;
    let combatActionSequence = false;
    let userImpairment = noUserImpairment();
    let npcImpairment = noNpcImpairment();
    let userAttackDie = null;
    let primaryOppTarget = null;

    if (hasStakes === 'N') {
        userImpairment = evaluateUserImpairment(ledger, context, semantic, goal, null, hasStakes);
        audit.push('2.6 hasStakes=N');
        audit.push('2.6a actions=[a1]');
        audit.push(`2.6a.1 UserImpairmentEngine=${compact(userImpairment)}`);
        audit.push(`2.6a.2 NPCImpairmentEngine=${compact(npcImpairment)}`);
        audit.push(`2.6b resolveOutcome=${compact(outcome)}`);
    } else {
        actions = normalizeActionMarkers(semantic.actionCount);
        const semanticMapStats = normalizeMapStats(semantic.mapStats);
        let { userStat, oppStat } = applyMapStatsHardRules(semantic, goal, targets, semanticMapStats, audit, { boundaryViolationExplicit });
        const userCore = getUserCoreStats(ledger);
        let targetCore = null;
        let oppTargetsNpcFirst = firstReal(targets.OppTargets.NPC);
        if (oppStat === 'ENV' && oppTargetsNpcFirst) {
            const repairedOppStat = defaultLivingOppStatForChallenge(semantic, goal);
            audit.push(`2.7c.2 deterministicLivingOppStatRepair=${compact({
                hardRule: 'OPP=ENV is only valid for non-living opposition; living OppTargets.NPC require a living stat',
                from: { OPP: oppStat, OppTargetsNPC: oppTargetsNpcFirst },
                to: { OPP: repairedOppStat },
            })}`);
            oppStat = repairedOppStat;
        }
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
        const currentTargetCore = oppTargetsNpcFirst ? trackerSnapshot[oppTargetsNpcFirst]?.currentCoreStats : null;

        audit.push('2.7 hasStakes=Y');
        audit.push(`2.7a actionCount=[${actions.join(',')}]`);
        audit.push(`2.7b actions=[${actions.join(',')}]`);
        audit.push(`2.7c mapStats={USER:${userStat},OPP:${oppStat}}`);
        audit.push(`2.7d getUserCoreStats=${compact(userCore)}`);
        audit.push('2.7e targetCore=(none)');

        if (oppStat !== 'ENV') {
            audit.push('2.7f mapStats.OPP!=ENV');
            audit.push(`2.7g OppTargets.NPC[0]=${oppTargetsNpcFirst || NONE}`);
            if (currentTargetCore) {
                targetCore = normalizeCore(currentTargetCore, { PHY: 1, MND: 1, CHA: 1 });
                audit.push(`2.7h getCurrentCoreStats(${oppTargetsNpcFirst})=${compact(targetCore)}`);
                audit.push(`2.7n targetCore=${compact(targetCore)}`);
            } else {
                const generatedCoreSource = chooseGeneratedCore(ledger, semantic, oppTargetsNpcFirst);
                targetCore = normalizeCore(generatedCoreSource.core, { PHY: 1, MND: 1, CHA: 1 });
                audit.push(`2.7h getCurrentCoreStats(${oppTargetsNpcFirst || NONE})=missing`);
                audit.push('2.7i missing -> genStats');
                if (generatedCoreSource.source !== 'resolutionEngine.genStats') {
                    audit.push(`2.7i.1 genStats source=${generatedCoreSource.source}`);
                }
                audit.push(`2.7j genStats.Rank=${generatedCoreSource.core?.Rank || 'none'}`);
                audit.push(`2.7k genStats.MainStat=${generatedCoreSource.core?.MainStat || 'none'}`);
                audit.push(`2.7l genStats=${compact(targetCore)}`);
                audit.push(`2.7m targetCore=${compact(targetCore)}`);
                if (generatedCoreSource.defaultFallback) {
                audit.push('2.7m.1 genStatsDefaultFallback=not persisted as explicit NPC stats');
                }
            }
        }

        userImpairment = evaluateUserImpairment(ledger, context, semantic, goal, userStat, hasStakes);
        const impairmentPenalty = Number(userImpairment?.AppliedToRoll === 'Y' ? userImpairment.RollPenalty : 0);
        npcImpairment = oppStat !== 'ENV' && oppTargetsNpcFirst
            ? evaluateNpcImpairment(oppTargetsNpcFirst, ledger, trackerSnapshot, semantic, goal, oppStat, hasStakes)
            : noNpcImpairment('no opposing NPC roll');
        const npcImpairmentPenalty = Number(npcImpairment?.AppliedToRoll === 'Y' ? npcImpairment.RollPenalty : 0);
        const atkDie = rollPool[0];
        userAttackDie = atkDie;
        const defDie = rollPool[1];
        const userStatValue = statValue(userCore, userStat);
        const atkTot = atkDie + userStatValue + impairmentPenalty;
        const defTot = oppStat === 'ENV' ? defDie : defDie + statValue(targetCore, oppStat) + npcImpairmentPenalty;
        const margin = atkTot - defTot;
        const hostileReferee = applyHostilePhysicalIntentHardRules(semantic, audit);
        const hostilePhysicalIntent = hostileReferee.value;
        hostilePhysical = userStat === 'PHY' && hostilePhysicalIntent;
        combatActionSequence = classifyCombatActionSequence({
            semantic,
            goal,
            targets,
            actions,
            hostilePhysical,
            userStat,
            oppStat,
            injuryEffectEngine: ledger.injuryEffectEngine,
        });

        if (combatActionSequence) {
            const actionLimit = Math.max(1, actions.length || 0);
            outcome = combatOutcome(margin, actionLimit);
        } else {
            outcome = nonHostileOutcome(margin);
        }

        audit.push(`2.7n.1 UserImpairmentEngine=${compact(userImpairment)}`);
        audit.push(`2.7n.2 NPCImpairmentEngine=${compact(npcImpairment)}`);
        audit.push(`2.7o resolveOutcome=atkDie:${atkDie}, atkTot:${atkTot}, defDie:${defDie}, defTot:${defTot}, margin:${margin}, classifyHostilePhysicalIntent:${hostilePhysical ? 'Y' : 'N'}, classifyCombatActionSequence:${combatActionSequence ? 'Y' : 'N'} -> ${compact(outcome)}`);
        const impairmentText = impairmentPenalty ? ` + impairment(${impairmentPenalty})` : '';
        const npcImpairmentText = npcImpairmentPenalty ? ` + impairment(${npcImpairmentPenalty})` : '';
        const oppStatText = oppStat === 'ENV' ? ' + ENV(0)' : ` + ${oppStat}(${statValue(targetCore, oppStat)})${npcImpairmentText}`;
        resultLine = `1d20(${atkDie}) + ${userStat}(${userStatValue})${impairmentText} = ${atkTot} vs 1d20(${defDie})${oppStatText} = ${defTot} (${margin} - ${outcome.OutcomeTier})`;
        primaryOppTarget = oppStat !== 'ENV' ? oppTargetsNpcFirst : null;
    }

    const boundaryReferee = applyPhysicalBoundaryPressureHardRules(semantic, targets, {
        hasStakes,
        hostilePhysical,
        goal,
    }, audit);

    const inflictedInjuries = deriveInflictedNpcInjuries({
        semantic,
        injuryEffectEngine: ledger.injuryEffectEngine,
        targets,
        outcome,
        hasStakes,
        combatActionSequence,
        userAttackDie,
        nonLethal: bool(semantic.nonLethal) ? 'Y' : 'N',
        primaryTarget: primaryOppTarget,
        trackerSnapshot,
        audit,
    });

    const packet = {
        GOAL: goal,
        actions,
        intimacyAdvanceExplicit,
        boundaryViolationExplicit,
        nonLethal: bool(semantic.nonLethal) ? 'Y' : 'N',
        STAKES: hasStakes,
        LandedActions: outcome.LandedActions,
        OutcomeTier: outcome.OutcomeTier,
        Outcome: outcome.Outcome,
        CounterPotential: outcome.CounterPotential,
        classifyHostilePhysicalIntent: hostilePhysical ? 'Y' : 'N',
        classifyCombatActionSequence: combatActionSequence ? 'Y' : 'N',
        activeHostileThreat: bool(semantic.activeHostileThreat) ? 'Y' : 'N',
        classifyPhysicalBoundaryPressure: boundaryReferee.value ? 'Y' : 'N',
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
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
        NPCInScene: showNone(npcInScene),
        UserImpairment: userImpairment,
        NPCImpairment: npcImpairment,
        InflictedInjuries: inflictedInjuries,
    };

    audit.push(`2.7q InflictedNpcInjuryEngine=${compact(inflictedInjuries)}`);
    audit.push(`2.8 HANDOFF=${compact(packet)}`);
    audit.push('---');

    return { packet, resultLine };
}

function runRelationships(ledger, trackerSnapshot, resolutionPacket, audit, refereeContext, context, rapportClock = normalizeRapportClock()) {
    const resolutionSemantic = ledger.resolutionEngine || {};
    const semanticMap = new Map((ledger.relationshipEngine || []).filter(x => x?.NPC).map(x => [x.NPC, x]));
    const npcList = unique(toRealArray(resolutionPacket.NPCInScene));
    const handoffs = [];
    const trackerUpdate = {};
    const pendingOfferNpcs = npcList.filter(npc => isRomanceMemoryTag(normalizeTrackerEntry(trackerSnapshot[npc] || {}).proactivityMemory.pendingTag));

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
        let rapportCooldownUntilActiveMs = state.rapportCooldownUntilActiveMs;
        const rapportEligible = firstTrackedEncounter || rapportClock.activeMs >= rapportCooldownUntilActiveMs;
        let currentDisposition = state.currentDisposition;
        let currentRapport = state.currentRapport;
        let hostilePressure = state.hostilePressure;
        let hostileLandedPressure = state.hostileLandedPressure;
        let dominantLock = state.dominantLock;
        let pressureMode = state.pressureMode;
        let slowBondEvidence = state.slowBondEvidence;
        let proactivityMemory = beginProactivityMemoryTurn(state.proactivityMemory);
        let initMetadata = null;

        audit.push(`3.3 getCurrentRelationalState=${compact(state)}`);
        audit.push(`3.3a rapportClock=${compact({ activeMs: rapportClock.activeMs, cooldownUntilActiveMs: rapportCooldownUntilActiveMs })}`);
        audit.push(`3.3b firstTrackedEncounter=${yn(firstTrackedEncounter)}`);
        audit.push(`3.3c rapportEligible=${yn(rapportEligible)}`);

        if (!currentDisposition) {
            const init = resolveDeterministicInitPreset(npc, state, sem, audit, `3.3 ${npc}.initPreset`);
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
        const npcStakes = resolutionPacket.STAKES === 'Y' && ['benefit', 'harm'].includes(stakeChange) ? 'Y' : 'N';
        const auditInteraction = npcStakes === 'Y' && stakeChange === 'benefit' ? 'Y' : 'N';
        const routedTarget = routeDispositionTarget(npc, resolutionPacket, auditInteraction, relationshipContext);
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
            rapportCooldownUntilActiveMs = rapportClock.activeMs + RAPPORT_COOLDOWN_MS;
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
            audit.push(`3.4c.1 hostilePhysicalPressure=${compact({
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
            untilActiveMs: rapportCooldownUntilActiveMs,
        })}`);

        const deltas = hostilePressureResult?.deltas || boundaryPressureResult?.deltas || deriveDirection(target, currentDisposition, currentRapport, auditInteraction, resolutionPacket);
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
        });
        audit.push(`3.6b intimacyBoundary=${compact(intimacyBoundary)}`);

        const handoff = {
            NPC: npc,
            FinalState: `B${currentDisposition.B}/F${currentDisposition.F}/H${currentDisposition.H}`,
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
            RelationToUserAction: relationToUserAction(npc, resolutionPacket),
            ProactivityMemory: proactivityMemory,
        };
        handoffs.push(handoff);

        const generatedCore = normalizeCore(sem.genStats, { PHY: 1, MND: 1, CHA: 1 });
        const coreStats = state.currentCoreStats || (isDefaultGeneratedCore(generatedCore) ? null : generatedCore);
        if (!state.currentCoreStats && !coreStats) {
            audit.push(`3.7a currentCoreStats not persisted for ${npc}: semantic genStats was default 1/1/1`);
        }
        trackerUpdate[npc] = {
            ...state,
            currentDisposition,
            currentRapport,
            rapportCooldownUntilActiveMs,
            establishedRelationship,
            userHistory: initMetadata?.userHistory || state.userHistory,
            raceProfile: initMetadata?.raceProfile || state.raceProfile,
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
    return { handoffs, trackerUpdate };
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

function resolveIntimacyBoundary({ npc, currentDisposition, threshold, establishedRelationship, resolutionPacket, context, refereeContext, state }) {
    if (resolutionPacket?.intimacyAdvanceExplicit !== 'Y') {
        return { boundary: 'SKIP', source: 'NONE', refusalStyle: 'NONE' };
    }
    const directTarget = toRealArray(resolutionPacket.ActionTargets).some(name => sameName(name, npc));
    const opposingTarget = toRealArray(resolutionPacket.OppTargets?.NPC).some(name => sameName(name, npc));
    if (!directTarget && !opposingTarget) {
        return { boundary: 'SKIP', source: 'NONE', refusalStyle: 'NONE' };
    }
    if (establishedRelationship === 'Y') {
        return { boundary: 'ALLOW', source: 'ESTABLISHED_RELATIONSHIP', refusalStyle: 'NONE' };
    }
    if (threshold?.Override && threshold.Override !== 'NONE') {
        return { boundary: 'ALLOW', source: `OVERRIDE:${threshold.Override}`, refusalStyle: 'NONE' };
    }
    const initiated = detectNpcInitiatedIntimacy(npc, context, refereeContext, toRealArray(resolutionPacket.ActionTargets).filter(isReal).length === 1);
    if (initiated.accepted) {
        return { boundary: 'ALLOW', source: 'NPC_INITIATED', refusalStyle: 'NONE' };
    }
    return {
        boundary: 'DENY',
        source: 'NONE',
        refusalStyle: intimacyRefusalStyle(currentDisposition, state),
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

function hasUserIntimacyAcceptance(text, refereeContext = null) {
    const source = relationshipText(text).toLowerCase();
    const userRef = userReferencePattern(refereeContext);
    if (hasRelationshipRefusal(source, refereeContext)) return false;
    return new RegExp(`\\b(?:yes|okay|ok|alright|please|i\\s+want\\s+that|i\\s+want\\s+this|i\\s+want\\s+${userRef}|i\\s+let\\s+${userRef}|i\\s+accept|i\\s+nod)`, 'i').test(source)
        || new RegExp(`\\b(?:kiss(?:es|ed|ing)?\\s+(?:${userRef}|him|her|them)|kiss\\s+back|return\\s+(?:the\\s+)?kiss|press\\s+my\\s+lips|pull\\s+(?:${userRef}|him|her|them)\\s+(?:close|against)|hold\\s+(?:${userRef}|him|her|them)\\s+close|wrap\\s+my\\s+arms|touch\\s+(?:${userRef}|him|her|them)|take\\s+(?:${userRef}|him|her|them)\\s+to\\s+bed)`, 'i').test(source);
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
    if (diceList.A < 17) {
        handoff = { CHAOS: { triggered: false, band: 'None', magnitude: 'None', anchor: 'None', vector: 'None', personVector: false, fullText: null } };
        audit.push(`4.2b A=${diceList.A}<17 -> CHAOS_HANDOFF=${compact(handoff)}`);
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
    const semanticCandidates = normalizeSemanticNameCandidates(ledger.nameSemantic);
    const poolResult = buildNamePool({ profile, registry, contextText, style, styleProfile, semanticCandidates });
    const pool = poolResult.pool;
    registerGeneratedNamePool(context, pool, { profile, style, styleKey: styleProfile.key, source: 'validatedNamePool' });

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
        deterministicCue: 'semantic candidates with deterministic validation',
        generatedName: NONE,
        semanticCandidates: poolResult.semanticCandidates,
        semanticAccepted: poolResult.semanticAccepted,
        semanticRejected: poolResult.semanticRejected,
        replacements: poolResult.replacements,
        namePool: pool,
    };
    audit.push('STEP 5: EXECUTE NameGenerationEngine');
    audit.push('5.1 nameRequired=POOL');
    audit.push('5.1a namePoolMode=semanticCandidates+deterministicValidation');
    audit.push('5.1b isLocation=N/A');
    audit.push('5.1c seed=pool');
    audit.push('5.1d normalizeSeed=pool');
    audit.push('5.1e detectMode=POOL');
    audit.push(`5.1f profile=${result.profile}`);
    audit.push('5.1g gender=POOL');
    audit.push(`5.1h style=${style}`);
    audit.push(`5.1i semanticCandidates=${compact(result.semanticCandidates)}`);
    audit.push(`5.1j semanticAccepted=${compact(result.semanticAccepted)}`);
    audit.push(`5.1k semanticRejected=${compact(result.semanticRejected)}`);
    audit.push(`5.1l replacements=${compact(result.replacements)}`);
    audit.push(`5.1m namePool=${compact(pool)}`);
    audit.push('---');
    return result;
}

function resolveNameStyle(context) {
    const value = String(context?.extensionSettings?.nameStyle || context?.structuredPreflightSettings?.nameStyle || '').trim();
    return NAME_STYLE_PROFILES[value] ? value : DEFAULT_NAME_STYLE;
}

function buildNameContext(ledger, context) {
    const sem = ledger.nameSemantic || {};
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
    if (trimmed.length >= 6 && trimmed.startsWith('(((') && trimmed.endsWith(')))')) {
        return trimmed.slice(3, -3).trim();
    }
    if (trimmed.length >= 4 && trimmed.startsWith('((') && trimmed.endsWith('))')) {
        return trimmed.slice(2, -2).trim();
    }
    return trimmed;
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

function normalizeSemanticNameCandidates(nameSemantic) {
    return {
        male: normalizeSemanticNameCandidateList(nameSemantic?.maleCandidates),
        female: normalizeSemanticNameCandidateList(nameSemantic?.femaleCandidates),
        location: normalizeSemanticNameCandidateList(nameSemantic?.locationCandidates),
        selectedStyle: isReal(nameSemantic?.selectedStyle) ? String(nameSemantic.selectedStyle).trim() : DEFAULT_NAME_STYLE,
    };
}

function normalizeSemanticNameCandidateList(value) {
    const raw = Array.isArray(value) ? value : [];
    const result = [];
    const seen = new Set();
    for (const item of raw) {
        const rawText = String(item ?? '').trim();
        if (!rawText || /^\(?none\)?$/i.test(rawText)) continue;
        const title = titleName(item);
        if (!isReal(title)) continue;
        const key = normalizeNameKey(title);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(title);
        if (result.length >= NAME_POOL_SIZE) break;
    }
    return result;
}

function buildNamePool({ profile, registry, contextText, style, styleProfile, semanticCandidates }) {
    const used = new Set([
        ...Array.from(registry.used || []),
        ...extractExistingProperNames(contextText),
    ].map(normalizeNameKey).filter(Boolean));
    const pool = { male: [], female: [], location: [] };
    const semanticAccepted = { male: [], female: [], location: [] };
    const semanticRejected = [];
    const replacements = [];
    const specs = [
        ['male', 'PERSON', 'MALE'],
        ['female', 'PERSON', 'FEMALE'],
        ['location', 'LOCATION', 'NEUTRAL'],
    ];

    for (const [bucket, mode] of specs) {
        for (const name of semanticCandidates?.[bucket] || []) {
            if (pool[bucket].length >= NAME_POOL_SIZE) break;
            const reason = nameRejectionReason(name, mode, used);
            if (reason) {
                semanticRejected.push({ bucket, name, reason });
                continue;
            }
            pool[bucket].push(name);
            semanticAccepted[bucket].push(name);
            used.add(normalizeNameKey(name));
        }
    }

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
            replacements.push({ bucket, name, slot });
        }
    }

    return {
        pool,
        semanticCandidates: {
            male: semanticCandidates?.male || [],
            female: semanticCandidates?.female || [],
            location: semanticCandidates?.location || [],
            selectedStyle: semanticCandidates?.selectedStyle || DEFAULT_NAME_STYLE,
        },
        semanticAccepted,
        semanticRejected,
        replacements,
    };
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
        if (rejectName(candidate, mode, used)) continue;
        return candidate;
    }

    for (let attempt = 0; attempt < 96; attempt += 1) {
        const fallbackProfile = ['BALANCED', 'SOFT', 'HARD'][attempt % 3];
        const candidate = buildNameCandidate({ mode, profile: fallbackProfile, gender, rng, attempt, styleProfile });
        if (rejectName(candidate, mode, used)) continue;
        return candidate;
    }

    return buildUniqueFallbackName(mode, used);
}

function buildNameCandidate({ mode, profile, gender, rng, attempt, styleProfile }) {
    const safeStyle = styleProfile || NAME_STYLE_PROFILES[DEFAULT_NAME_STYLE];
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

function rejectName(name, mode, used) {
    return Boolean(nameRejectionReason(name, mode, used));
}

function nameRejectionReason(name, mode, used) {
    const text = String(name || '').trim();
    const lower = text.toLowerCase();
    const vowels = (lower.match(/[aeiou]/g) || []).length;
    const consonants = (lower.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
    if (!text) return 'empty';
    if (mode === 'PERSON' && (text.length < 5 || text.length > 9)) return 'person_length';
    if (mode === 'LOCATION' && (text.length < 7 || text.length > 14)) return 'location_length';
    if (/[aeiou]{3,}/i.test(text)) return 'too_many_vowels_in_row';
    if (/[^aeiou\s-]{3,}/i.test(text)) return 'too_many_consonants_in_row';
    if (/(.)\1\1/i.test(text)) return 'triple_repeated_letter';
    if (vowels < 2) return 'too_few_vowels';
    if (consonants > vowels + 4) return 'consonant_heavy';
    if (hasBadVowelTexture(lower, mode)) return 'bad_vowel_texture';
    if (hasAwkwardNameTexture(lower, mode)) return 'awkward_texture';
    if (used.has(normalizeNameKey(text))) return 'duplicate_or_reserved';
    if (mode === 'PERSON' && ROLE_NAME_PREFIXES.some(prefix => lower.startsWith(prefix))) return 'role_prefix';
    if (/\b(?:aragorn|legolas|gandalf|frodo|sauron|elden|hyrule|zelda|cloud|sephiroth|john|michael|david|james|mary|sarah|anna|london|paris|tokyo|rome|arthur|edward|william|robert|albert|alice|elizabeth|eleanor|aldric|borin|eldarion)\b/i.test(lower)) return 'famous_or_stock_name';
    if (/(?:mirror|river|stone|storm|shadow|silver|golden|crystal|dragon|demon|angel|dark|light|black|white|red|blue|green|wolf|rose|luna|nova)/i.test(lower)) return 'stock_word';
    if (mode === 'LOCATION' && /\b(?:rin|len|taro|mira|naya|emi|dan|vek|iro)$/i.test(text)) return 'location_reads_like_person';
    return '';
}

function hasBadVowelTexture(lower, mode) {
    const pairs = Array.from(lower.matchAll(/[aeiou]{2}/g)).map(match => match[0]);
    if (!pairs.length) return false;
    const allowed = mode === 'LOCATION' ? new Set(['ai', 'ia', 'ei']) : new Set(['ia']);
    if (pairs.length > 1) return true;
    if (!allowed.has(pairs[0])) return true;
    if (/y[aeiou]{2}/.test(lower)) return true;
    return false;
}

function hasAwkwardNameTexture(lower, mode) {
    if (/(?:stai|biv|bom|sailn|lnok|ivun|aistu|rsob|vr|kk|kg|gk|dt|td|bp|pb|sz|zs|zx|xz|q)/.test(lower)) return true;
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

function buildUniqueFallbackName(mode, used) {
    const bases = mode === 'LOCATION'
        ? ['Morakora', 'Navarech', 'Suraesh', 'Tavahold', 'Koravale', 'Zanawatch', 'Davaresh', 'Ishmora', 'Navasai', 'Vorahold', 'Talanor', 'Kazhara']
        : ['Ruvan', 'Kano', 'Mavi', 'Sena', 'Tavo', 'Vira', 'Dara', 'Niro', 'Zani', 'Aruen', 'Luma', 'Ivo'];
    for (const base of bases) {
        if (!rejectName(base, mode, used)) return base;
    }
    const syllables = ['ka', 'na', 'ra', 'shi', 'vo', 'li', 'ma', 'ru', 'ta', 'zen', 'ko', 'sa', 'mi', 'yor', 'ven', 'alo'];
    for (const first of syllables) {
        for (const second of syllables) {
            const candidate = mode === 'LOCATION'
                ? titleName(`mora${first}${second}`)
                : titleName(`ruv${first}${second}`);
            if (!used.has(normalizeNameKey(candidate)) && !rejectName(candidate, mode, used)) return candidate;
        }
    }
    return mode === 'LOCATION' ? 'Morakora' : 'Ruvan';
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
    if (typeof context.saveMetadataDebounced === 'function') context.saveMetadataDebounced();
}

function deriveInflictedNpcInjuries({ injuryEffectEngine, targets, outcome, hasStakes, combatActionSequence = false, userAttackDie = null, nonLethal = 'N', primaryTarget = null, trackerSnapshot = {}, audit = null }) {
    if (hasStakes !== 'Y') return [];
    if (!effectOutcomeLanded(outcome)) return [];

    const fatalInjury = deriveUserAttackFatalInjury({
        outcome,
        combatActionSequence,
        userAttackDie,
        nonLethal,
        primaryTarget,
        trackerSnapshot,
    });
    if (fatalInjury) {
        audit?.push(`2.7p deterministicUserAttackFatality=${compact(fatalInjury)}`);
        return [fatalInjury];
    }

    const landedCount = Number(outcome?.LandedActions ?? 0);
    const injuries = normalizeInjuryEffectCandidates(injuryEffectEngine)
        .filter(effect => injuryEffectTargetAllowed(effect, targets))
        .slice(0, Math.max(0, landedCount))
        .map(effect => buildInflictedInjuryFromSemanticEffect(effect, outcome))
        .filter(Boolean);
    return mergeInflictedInjuries(injuries);
}

function effectOutcomeLanded(outcome) {
    const landedCount = Number(outcome?.LandedActions ?? 0);
    return Number.isFinite(landedCount) && landedCount > 0;
}

function deriveUserAttackFatalInjury({ outcome, combatActionSequence, userAttackDie, nonLethal, primaryTarget, trackerSnapshot }) {
    if (!combatActionSequence) return null;
    if (!isReal(primaryTarget)) return null;
    const nonlethal = String(nonLethal ?? 'N').trim().toUpperCase() === 'Y';
    if (nonlethal) return null;

    const existingCondition = normalizeTrackerCondition(trackerSnapshot?.[primaryTarget]?.condition);
    const instantKill = Number(userAttackDie) === 20 && outcome?.OutcomeTier === 'Critical_Success';
    const finishOffKill = ['badly_wounded', 'critical'].includes(existingCondition);
    if (!instantKill && !finishOffKill) return null;

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
            ? `${primaryTarget} is killed by this exceptional user attack result: nonLethal=N, natural 20, and Critical_Success. Render the kill as decisive, cinematic, concrete, and rewarding; do not soften it into a wound, near miss, survival, escape, or unresolved struggle. The target is dead.`
            : `${primaryTarget} was already ${existingCondition}; this landed combat hit deterministically finishes them. Render the result as a clear fatal finish, not another wound or continued fighting. The target is dead.`,
    };
}

function classifyCombatActionSequence({ semantic, goal, targets, actions, hostilePhysical, userStat, oppStat, injuryEffectEngine }) {
    if (hostilePhysical) return true;
    const actionCount = Array.isArray(actions) ? actions.length : 1;
    if (actionCount > 1 && userStat !== 'CHA') return true;
    const hasLivingTarget = Boolean(firstReal(targets?.OppTargets?.NPC) || firstReal(targets?.ActionTargets));
    if (!hasLivingTarget) return false;
    if (userStat === 'MND' && isBodyAffectingMagic(semantic, goal, targets)) return true;
    const hasSemanticInjuryEffect = normalizeInjuryEffectCandidates(injuryEffectEngine)
        .some(effect => injuryEffectTargetAllowed(effect, targets));
    if (hasSemanticInjuryEffect && userStat !== 'CHA') return true;
    if (userStat === 'PHY' && oppStat !== 'ENV' && hasCombatActionLanguage(semanticSourceText(semantic))) return true;
    return false;
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
    };
    if (options.hasStakes !== 'Y') return repaired;
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
        hasStakes: 'N',
        rule: 'hard_override_companion_command_request_only',
        companions: commands.map(item => item.name),
        commands: commands.map(item => item.command),
        evidence: {
            hardRule: 'ResolutionEngine.hasStakes: direct ally/companion commands are tactical requests, not user-resolved attempts to make the NPC act',
            from: bool(semantic?.hasStakes) ? 'Y' : 'N',
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

function defaultLivingOppStatForChallenge(semantic, goal) {
    const source = semanticSourceText({ ...semantic, identifyGoal: goal }).toLowerCase();
    if (/\b(bluff(?:s|ed|ing)?|lie|lying|lied|deceiv\w*|deception|trick(?:s|ed|ing)?|mislead\w*|intimidat\w*|coerc\w*|threat\w*|blackmail\w*|manipulat\w*|interrogat\w*|humiliat\w*|terroriz\w*|menac\w*|force(?:d)? submission|forced submission)\b/.test(source)) {
        return 'MND';
    }
    if (/\b(persuad\w*|persuasion|negotiat\w*|negotiation|diplomac\w*|diplomacy|bargain\w*|reassur\w*|reconciliation|reconcile\w*|good-faith|appeal\w*|convinc\w*|reason with|mediat\w*|ask\w*|request\w*)\b/.test(source)) {
        return 'CHA';
    }
    if (isBodyAffectingMagic(semantic, goal, { ActionTargets: [], OppTargets: { NPC: ['living target'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] })) {
        return 'PHY';
    }
    return 'CHA';
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
    const order = ['healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'dead'];
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

function evaluateUserImpairment(ledger, context, semantic, goal, userStat, hasStakes) {
    const user = getEffectiveUserImpairmentState(ledger, context);
    const sources = collectImpairmentSources(user, true);
    if (!sources.length) return noUserImpairment();

    const actionText = [
        semantic?.identifyGoal,
        semantic?.identifyChallenge,
        semantic?.explicitMeans,
        goal,
        getLatestUserTextFromContext(context),
    ].filter(Boolean).join(' ');
    const actionFunctions = classifyUserActionFunctions(actionText, userStat);
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
    const penalty = USER_IMPAIRMENT_STAGE[best.source.stage]?.penalty ?? 0;
    const applied = hasStakes === 'Y' && penalty < 0 ? 'Y' : 'N';
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

function evaluateNpcImpairment(npcName, ledger, trackerSnapshot, semantic, goal, npcStat, hasStakes) {
    if (!isReal(npcName)) return noNpcImpairment('no NPC named');
    const npc = getEffectiveNpcImpairmentState(npcName, ledger, trackerSnapshot);
    const sources = collectImpairmentSources(npc, false);
    if (!sources.length) return noNpcImpairment();

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
    const penalty = USER_IMPAIRMENT_STAGE[best.source.stage]?.penalty ?? 0;
    const applied = hasStakes === 'Y' && penalty < 0 ? 'Y' : 'N';
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

    const matches = sources
        .map(source => ({
            source,
            matched: matchedImpairmentFunctions(source.functions, actionFunctions),
        }))
        .filter(item => item.matched.length);
    if (!matches.length) return noNpcImpairment('tracked NPC impairments do not affect this attack');

    matches.sort((a, b) => USER_IMPAIRMENT_STAGE[b.source.stage].rank - USER_IMPAIRMENT_STAGE[a.source.stage].rank);
    const best = matches[0];
    const penalty = USER_IMPAIRMENT_STAGE[best.source.stage]?.penalty ?? 0;
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

    const matches = sources
        .map(source => ({
            source,
            matched: matchedImpairmentFunctions(source.functions, actionFunctions),
        }))
        .filter(item => item.matched.length);
    if (!matches.length) return noNpcImpairment('tracked NPC impairments do not affect this defense');

    matches.sort((a, b) => USER_IMPAIRMENT_STAGE[b.source.stage].rank - USER_IMPAIRMENT_STAGE[a.source.stage].rank);
    const best = matches[0];
    const penalty = USER_IMPAIRMENT_STAGE[best.source.stage]?.penalty ?? 0;
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
            functions: user.condition === 'critical' || user.condition === 'dead'
                ? ['whole_body', 'physical_exertion', 'stamina', 'focus']
                : ['physical_exertion', 'stamina'],
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
    if (condition === 'critical' || condition === 'dead') return 'critical';
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

function runTrackerUpdates(ledger, trackerSnapshot, relationshipTrackerUpdate, context, audit, userResultDelta = null, npcResultDeltas = []) {
    const semantic = ledger.trackerUpdateEngine || {};
    const userBefore = buildPlayerTrackerSnapshot(context);
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

    for (const delta of semantic.npcs || []) {
        const name = delta?.NPC;
        if (!isReal(name)) continue;
        const before = normalizeTrackerEntry(npcs[name] || trackerSnapshot?.[name] || {});
        npcs[name] = normalizeTrackerEntry({
            ...before,
            ...applyTrackerDeltaToState(before, delta, false),
        });
    }
    applyInflictedNpcInjuriesToNpcMap(npcs, trackerSnapshot, relationshipTrackerUpdate?.__inflictedInjuries || []);
    for (const item of npcResultDeltas || []) {
        if (!shouldApplyDeterministicResultInjury(item?.injury)) continue;
        mergeNpcResultInjuryDelta(npcs, trackerSnapshot, item?.NPC, item?.injury);
    }

    audit.push('STEP 6.5: EXECUTE TrackerUpdateEngine EXPLICIT DELTAS');
    audit.push(`6.5a user=${compact(user)}`);
    audit.push(`6.5b npcDeltas=${compact((semantic.npcs || []).map(delta => delta.NPC || NONE))}`);
    if (userResultDelta) audit.push(`6.5c deterministicUserInjuryDelta=${compact(userResultDelta)}${shouldApplyDeterministicResultInjury(userResultDelta) ? '' : ' (deferred:narrator_contextual)'}`);
    if (npcResultDeltas?.length) audit.push(`6.5d deterministicNpcAggressionInjuryDeltas=${compact(npcResultDeltas)}`);
    audit.push('---');

    return { user, npcs };
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
    return ['unchanged', 'healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'dead'].includes(text) ? text : 'unchanged';
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
    return text.slice(0, 160);
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
        packet.classifyHostilePhysicalIntent,
        packet.activeHostileThreat,
        packet.classifyPhysicalBoundaryPressure,
        packet.boundaryViolationExplicit,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!source) return false;
    if (/\b(fight|combat|attack|strike|hit|slash|stab|shoot|charge|pursuit|chase|threat|danger|crisis|battle|duel|ambush|counterattack|retaliat\w*|boundary|refusal|pressure|force|grapple|restrain|pin|drag|hold down|intimacy|sexual|kiss|undress|exposed)\b/.test(source)) return true;
    return Boolean(packet.classifyCombatActionSequence === 'Y'
        || packet.classifyHostilePhysicalIntent === 'Y'
        || packet.activeHostileThreat === 'Y'
        || packet.classifyPhysicalBoundaryPressure === 'Y'
        || packet.boundaryViolationExplicit === true
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
    if (packet.STAKES === 'Y' && packet.classifyCombatActionSequence === 'Y' && environmentThreatLooksUrgent(packet)) return true;
    if (packet.STAKES === 'Y' && packet.classifyCombatActionSequence === 'Y' && firstReal(packet.OppTargets?.NPC) && context.counterPotential && context.counterPotential !== 'none') return true;
    if (packet.STAKES === 'Y' && firstReal(packet.OppTargets?.ENV) && environmentThreatLooksUrgent(packet)) return true;
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
    if (['badly_wounded', 'critical', 'dead'].includes(condition)) return true;
    const text = [
        ...(Array.isArray(handoff?.Wounds) ? handoff.Wounds : []),
        ...(Array.isArray(handoff?.StatusEffects) ? handoff.StatusEffects : []),
    ].join(' ').toLowerCase();
    return /\b(badly wounded|critical|crippled|maimed|mangled|broken|bleeding out|incapacitated|unconscious|stunned|paralyzed|paralysed|restrained|pinned|immobilized|immobilised)\b/.test(text);
}

function classifyCompanionInitiativeContext(context = {}) {
    const packet = context.resolutionPacket || {};
    if (context.counterPotential && context.counterPotential !== 'none') return 'crisis';
    if (packet.classifyCombatActionSequence === 'Y' || packet.classifyHostilePhysicalIntent === 'Y' || packet.activeHostileThreat === 'Y') return 'crisis';
    if (packet.CompanionCommand?.Mode === 'REQUEST_ONLY'
        && toRealArray(packet.CompanionCommand.NPCs).length
        && toRealArray(packet.hostilesInScene?.NPC).length === 1) {
        return 'crisis';
    }
    if (context.chaosBand && context.chaosBand !== 'None') return 'active';
    if (packet.STAKES === 'Y' && firstReal(packet.OppTargets?.ENV) && environmentThreatLooksUrgent(packet)) return 'crisis';
    if (packet.STAKES === 'Y') return context.kind === 'Skill' || context.kind === 'Social' ? 'active' : 'crisis';
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

function runAggression(ledger, trackerSnapshot, trackerUpdate, proactivityResults, resolutionPacket, dice, audit, context, refereeContext) {
    const userCore = getUserCoreStats(ledger);
    const counterPotential = resolutionPacket?.CounterPotential || 'none';
    const counterAllowed = ['light', 'medium', 'severe'].includes(counterPotential);
    const counterBonus = counterBonusFromPotential(counterPotential);
    const criticalSuccess = resolutionPacket?.OutcomeTier === 'Critical_Success';
    const retaliationAllowed = resolutionPacket?.classifyHostilePhysicalIntent === 'Y';
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
        const npcTotal = npcDie + npcStatValue + counterBonus + npcImpairmentPenalty;
        const defenderTotal = defenderDie + defenderStatValue + targetImpairmentPenalty;
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
        results[npc] = { AttackType: resultAttackType, AttackIntent: proactivityResult.Intent, ProactivityTarget: target, AttackStat: attackStat, AttackStatValue: npcStatValue, DefenseStat: defenseStat, DefenseStatValue: defenderStatValue, AttackStyle: aggressionStatStyle(attackStat), CounterPotential: counterPotential, CounterBonus: counterBonus, ReactionOutcome, Margin: margin, NpcDie: npcDie, DefenderDie: defenderDie, NpcTotal: npcTotal, DefenderTotal: defenderTotal, NPCImpairment: npcImpairment, UserImpairment: targetIsUser ? targetImpairment : null, TargetImpairment: targetImpairment, InflictedUserInjury: inflictedUserInjury || null, InflictedTargetInjury: inflictedTargetInjury || null };
        audit.push(`7.5 ${npc}.npcCore=${compact(npcCore)}`);
        audit.push(`7.5c ${npc}.AggressionStats=${compact({ AttackStat: attackStat, DefenseStat: defenseStat, AttackStyle: aggressionStatStyle(attackStat) })}`);
        audit.push(`7.5d ${npc}.NPCImpairmentEngine=${compact(npcImpairment)}`);
        audit.push(`7.5e npcTotal=${npcDie}+${attackStat}(${npcStatValue})+${counterBonus}${npcImpairmentPenalty ? `+impairment(${npcImpairmentPenalty})` : ''}=${npcTotal}`);
        audit.push(`7.5f ${npc}.TargetDefenseImpairmentEngine=${compact(targetImpairment)}`);
        audit.push(`7.5g targetTotal=${defenderDie}+${defenseStat}(${defenderStatValue})${targetImpairmentPenalty ? `+impairment(${targetImpairmentPenalty})` : ''}=${defenderTotal}`);
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
            const counterNpcTotal = counterNpcDie + counterNpcStatValue + counterBonus + counterNpcImpairmentPenalty;
            const counterDefenderTotal = counterDefenderDie + counterDefenderStatValue + counterTargetImpairmentPenalty;
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
                InflictedUserInjury: null,
                InflictedTargetInjury: counterInflictedTargetInjury || null,
            };
            audit.push(`7.6a companionCounterPotential=${companionCounterPotential}`);
            audit.push(`7.6b ${target}.counterNpcCore=${compact(counterNpcCore)}`);
            audit.push(`7.6b.1 ${target}.CounterAggressionStats=${compact({ AttackStat: counterAttackStat, DefenseStat: counterDefenseStat, AttackStyle: aggressionStatStyle(counterAttackStat) })}`);
            audit.push(`7.6c ${target}.CounterTargetDefenseImpairmentEngine=${compact(counterTargetImpairment)}`);
            audit.push(`7.6d ${target}.counterTotal=${counterNpcDie}+${counterAttackStat}(${counterNpcStatValue})+${counterBonus}${counterNpcImpairmentPenalty ? `+impairment(${counterNpcImpairmentPenalty})` : ''}=${counterNpcTotal}`);
            audit.push(`7.6e ${npc}.counterDefenseTotal=${counterDefenderDie}+${counterDefenseStat}(${counterDefenderStatValue})${counterTargetImpairmentPenalty ? `+impairment(${counterTargetImpairmentPenalty})` : ''}=${counterDefenderTotal}`);
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






function chooseGeneratedCore(ledger, resolutionEngine, oppTargetsNpcFirst) {
    const resolutionCore = resolutionEngine?.genStats;
    if (!isDefaultGeneratedCore(resolutionCore)) {
        return { core: resolutionCore, source: 'resolutionEngine.genStats' };
    }

    const relationshipCore = (ledger.relationshipEngine || [])
        .find(item => sameName(item?.NPC, oppTargetsNpcFirst))
        ?.genStats;

    if (!isDefaultGeneratedCore(relationshipCore)) {
        return { core: relationshipCore, source: `relationshipEngine[${oppTargetsNpcFirst}].genStats` };
    }

    return { core: { Rank: 'none', MainStat: 'none', PHY: 1, MND: 1, CHA: 1 }, source: 'engine default core fallback', defaultFallback: true };
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

function resolveDeterministicInitPreset(npc, state, sem, audit, label) {
    const flags = normalizeSemanticInitPresetFlags(sem?.initPreset);
    const userHistory = initUserHistoryFromFlags(flags, state?.userHistory);
    const raceProfile = normalizeNpcRaceProfile(state?.raceProfile);

    let base = { label: 'neutralDefault', disposition: { B: 2, F: 2, H: 2 } };
    if (flags.romanticOpen) {
        base = { label: 'romanticOpen', disposition: { B: 4, F: 1, H: 1 } };
    } else if (flags.userBadRep) {
        base = { label: 'userBadRep', disposition: { B: 1, F: 2, H: 3 } };
    } else if (flags.priorUserGoodRep) {
        base = { label: 'priorUserGoodRep', disposition: { B: 3, F: 1, H: 2 } };
    } else if (flags.userNonHuman && !flags.fearImmunity) {
        base = { label: 'userNonHuman', disposition: { B: 1, F: 3, H: 2 } };
    }

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
    })}`);
    return {
        ...base,
        flags,
        userHistory,
        raceProfile,
    };
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
    const standing = ['positive', 'neutral', 'negative'].includes(source.standing) ? source.standing : 'neutral';
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

function applyHostilePhysicalIntentHardRules(semantic, audit) {
    const semanticValue = bool(semantic.classifyHostilePhysicalIntent);
    const source = semanticSourceText(semantic);

    if (semanticValue && isBodyBoundaryPressure(source) && !hasDirectBodilyAggression(source)) {
        audit.push(`2.7o.1 deterministicHostilePhysicalIntentReferee=${compact({
            hardRule: 'ResolutionEngine.classifyHostilePhysicalIntent: grabbing/catching/holding a wrist/arm/clothing only to stop, delay, or force attention is boundary pressure, not hostile physical intent',
            from: 'Y',
            to: 'N',
            evidence: source.slice(0, 220),
        })}`);
        return { value: false };
    }

    if (semanticValue && isObjectBoundaryContest(source) && !hasDirectBodilyAggression(source)) {
        audit.push(`2.7o.1 deterministicHostilePhysicalIntentReferee=${compact({
            hardRule: 'ResolutionEngine.classifyHostilePhysicalIntent: forceful object/possession/space contest is not hostile physical intent unless the NPC body is attacked/restrained/controlled',
            from: 'Y',
            to: 'N',
            evidence: source.slice(0, 220),
        })}`);
        return { value: false };
    }

    return { value: semanticValue };
}

function applyPhysicalBoundaryPressureHardRules(semantic, targets, options, audit) {
    const source = semanticSourceText(semantic);
    const hasLivingOpposition = firstReal(targets.OppTargets?.NPC);
    let value = bool(semantic.classifyPhysicalBoundaryPressure);
    const hardBoundary = options.hasStakes === 'Y'
        && !options.hostilePhysical
        && hasLivingOpposition
        && (isObjectBoundaryContest(source) || isBodyBoundaryPressure(source))
        && !hasDirectBodilyAggression(source);

    if (value && (options.hasStakes !== 'Y' || options.hostilePhysical || !hasLivingOpposition)) {
        audit.push(`2.7p deterministicPhysicalBoundaryPressureReferee=${compact({
            hardRule: 'ResolutionEngine.classifyPhysicalBoundaryPressure requires stakes-bearing living opposition and no hostilePhysicalIntent',
            from: 'Y',
            to: 'N',
            hasStakes: options.hasStakes,
            hostilePhysical: options.hostilePhysical ? 'Y' : 'N',
            hasLivingOpposition: hasLivingOpposition ? 'Y' : 'N',
        })}`);
        value = false;
    } else if (!value && hardBoundary) {
        audit.push(`2.7p deterministicPhysicalBoundaryPressureReferee=${compact({
            hardRule: 'ResolutionEngine.classifyPhysicalBoundaryPressure: forceful object/space/departure/body-boundary contest against resisting NPC applies boundary pressure',
            from: 'N',
            to: 'Y',
            evidence: source.slice(0, 220),
        })}`);
        value = true;
    }

    return { value };
}

function getPureLoveDeclarationNoRollEvidence(semantic, goal, refereeContext = null) {
    const source = semanticSourceText(semantic);
    if (!isPureLoveDeclarationOrReciprocation(source, refereeContext)) return null;
    return {
        hasStakes: 'N',
        rule: 'hard_override_pure_love_declaration_no_roll',
        evidence: {
            hardRule: 'ResolutionEngine.hasStakes: pure love declarations, confessions, or reciprocations are disposition responses, not dice challenges',
            from: bool(semantic?.hasStakes) ? 'Y' : 'N',
            to: 'N',
            evidence: source.slice(0, 220),
        },
    };
}

function getRomanceNoRollOverrideEvidence(semantic, semanticHasStakes, boundaryViolationExplicit, intimacyAdvanceExplicit = 'N') {
    if (boundaryViolationExplicit === 'Y' || semanticHasStakes !== 'Y') return null;
    const source = semanticSourceText(semantic);
    if (isDirectedCompanionAttackCommandText(source) || hasCombatActionLanguage(source) || bool(semantic?.activeHostileThreat)) return null;
    if (!isRomanticOrIntimateConversation(source)) return null;
    if (hasBoundaryViolationLanguage(source)) return null;
    return {
        hasStakes: 'N',
        rule: 'hard_override_romance_conversation_no_roll',
        evidence: {
            hardRule: 'ResolutionEngine.hasStakes: flirting, teasing, romantic talk, intimacy proposals, permission asks, or reciprocation are not stakes unless boundaryViolationExplicit=Y or ordinary non-romantic stakes apply; intimacyAdvanceExplicit is handled by IntimacyBoundary without a roll',
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
    const objectOrBoundary = /\b(scroll|book|letter|coin|purse|bag|weapon|sword|dagger|key|door|gate|chest|box|object|item|possession|path|passage|doorway|threshold|room|space|hand|table|desk|belt|pouch)\b/.test(source);
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















































function buildTargetClassifier(ledger, trackerSnapshot, context) {
    const livingNames = new Set();

    for (const name of Object.keys(trackerSnapshot || {})) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.hostilesInScene?.NPC)) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.ActionTargets)) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.BenefitedObservers)) addLivingName(livingNames, name);
    for (const name of toRealArray(ledger?.resolutionEngine?.identifyTargets?.HarmedObservers)) addLivingName(livingNames, name);
    for (const item of ledger.relationshipEngine || []) addLivingName(livingNames, item?.NPC);

    try {
        const fields = typeof context?.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
        addLivingName(livingNames, fields?.name);
    } catch {
        // Non-fatal; semantic/tracker names are still available.
    }

    addLivingName(livingNames, context?.name2);
    addLivingName(livingNames, context?.name1);

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
