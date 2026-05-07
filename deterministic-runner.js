import {
    createDice,
    hostilePhysicalOutcome,
    nonHostileOutcome,
    counterBonusFromPotential,
    aggressionReactionOutcome,
    classifyUserNonHuman,
    isDefaultGeneratedCore,
    initPreset,
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
    currentIntimacyGateAllows,
    getStakesOverrideEvidence,
    resolveIntimacyGate,
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
    targetsUserFromIntent,
    isImmediateAttackIntent,
    isImmediateAttackIntentForType,
    buildNarrationGuidance,
    buildPersistencePolicy,
    trackerSummary,
    normalizeTrackerEntry,
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

const CURATED_NAME_SEEDS = [
    'Aka', 'Aki', 'Aro', 'Ena', 'Iru', 'Omi', 'Uma', 'Sen', 'Tor', 'Mir', 'Vey', 'Kha',
    'Ral', 'Zai', 'Niv', 'Sol', 'Dar', 'Lio', 'Tav', 'Yul', 'Kao', 'Mav', 'Ren', 'Vos',
    'Sae', 'Kio', 'Nai', 'Ruo', 'Tao', 'Vel', 'Mar', 'Zun', 'Oru', 'Ira', 'Kav', 'Sov',
];

const PHONOTACTIC_ONSETS = ['', 'b', 'd', 'g', 'h', 'k', 'l', 'm', 'n', 'r', 's', 't', 'v', 'y', 'z', 'kh', 'sh'];
const PHONOTACTIC_VOWELS = ['a', 'e', 'i', 'o', 'u', 'ai', 'ei', 'ao'];
const PHONOTACTIC_CODAS = ['', 'n', 'r', 'l', 'm', 's', 'v', 'k'];

const NAME_PARTS = {
    PERSON: {
        HARD: {
            middle: ['ka', 'tor', 'vek', 'dar', 'zan', 'kor', 'ruk', 'var', 'tek', 'sul', 'mar', 'dur'],
            ending: ['vek', 'dan', 'tor', 'kar', 'un', 'ar', 'ro', 'kan', 'vek', 'sul', 'dan', 'rik'],
        },
        SOFT: {
            middle: ['la', 'mi', 'sai', 'naya', 'lira', 'emi', 'valo', 'sora', 'tali', 'rima', 'ayo', 'leni'],
            ending: ['a', 'ia', 'aya', 'emi', 'sai', 'lira', 'naya', 'ani', 'ora', 'ei', 'ira', 'una'],
        },
        BALANCED: {
            middle: ['ra', 'ka', 'ven', 'sai', 'mori', 'taro', 'len', 'vaji', 'naro', 'suri', 'lian', 'kemi'],
            ending: ['rin', 'vo', 'sai', 'len', 'mira', 'taro', 'ka', 'ren', 'vani', 'o', 'in', 'ari'],
        },
    },
    LOCATION: {
        HARD: {
            middle: ['kar', 'dor', 'morn', 'kesh', 'rath', 'tavar', 'dur', 'koru', 'zan', 'thar'],
            ending: ['kesh', 'rath', 'daru', 'kor', 'mora', 'tavar', 'dorn', 'kora', 'sath', 'rak'],
        },
        SOFT: {
            middle: ['moru', 'sai', 'nara', 'luma', 'kavai', 'tala', 'sura', 'vara', 'leni', 'mara'],
            ending: ['nara', 'tala', 'moru', 'sai', 'luma', 'vara', 'kora', 'dara', 'mara', 'vani'],
        },
        BALANCED: {
            middle: ['moru', 'dara', 'kora', 'vani', 'sura', 'tala', 'rath', 'kesh', 'nara', 'mora', 'val', 'daru'],
            ending: ['moru', 'kesh', 'dara', 'nara', 'rath', 'mora', 'tala', 'sai', 'ven', 'kora', 'daru', 'sura'],
        },
    },
};

const GENDER_ENDINGS = {
    FEMALE: ['a', 'ia', 'aya', 'emi', 'sai', 'lira', 'naya', 'ani', 'ora', 'ei', 'ira', 'una'],
    MALE: ['o', 'en', 'ar', 'un', 'iro', 'vek', 'dan', 'taro', 'kor', 'rik', 'an', 'ul'],
    NEUTRAL: ['i', 'e', 'ai', 'in', 'ra', 'ka', 'ren', 'sul', 'ari', 'vo', 'len', 'sa'],
};

export function buildTrackerSnapshot(context) {
    const source = context?.chatMetadata?.structuredPreflightTracker?.npcs || {};
    const snapshot = {};

    for (const [name, value] of Object.entries(source)) {
        snapshot[name] = normalizeTrackerEntry(value);
    }

    return snapshot;
}

export async function saveTrackerUpdate(context, trackerUpdate) {
    if (!context?.chatMetadata || !trackerUpdate?.npcs) return;

    const root = context.chatMetadata.structuredPreflightTracker || { npcs: {} };
    root.npcs = root.npcs || {};

    for (const [name, value] of Object.entries(trackerUpdate.npcs)) {
        root.npcs[name] = normalizeTrackerEntry({
            ...(root.npcs[name] || {}),
            ...(value || {}),
        });
    }

    context.chatMetadata.structuredPreflightTracker = root;

    if (typeof context.saveMetadataDebounced === 'function') {
        context.saveMetadataDebounced();
    } else if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata();
    }
}

export function runDeterministicEngines(ledger, trackerSnapshot, context, type) {
    const audit = [];
    const dice = createDice();
    const refereeContext = buildRefereeContext(context);
    const resolution = runResolution(ledger, trackerSnapshot, dice, audit, context, refereeContext);
    const relationships = runRelationships(ledger, trackerSnapshot, resolution.packet, audit, refereeContext);
    const chaos = runChaos(ledger, relationships.handoffs, resolution.packet, dice, audit);
    const name = runNameGeneration(ledger, audit, context, type);
    const proactivity = runProactivity(ledger, relationships.handoffs, resolution.packet, chaos.handoff, dice, audit);
    const aggression = runAggression(ledger, trackerSnapshot, relationships.trackerUpdate, proactivity.results, resolution.packet, dice, audit);

    const trackerUpdate = { npcs: relationships.trackerUpdate };
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

function runResolution(ledger, trackerSnapshot, dice, audit, context, refereeContext) {
    const semantic = ledger.resolutionEngine || {};
    const targetClassifier = buildTargetClassifier(ledger, trackerSnapshot, context);
    const rawTargets = normalizeTargets(semantic.identifyTargets);
    const intimacyReferee = applyIntimacyAdvanceHardRules(semantic, audit);
    const intimacyAdvance = String(intimacyReferee.value || 'none').toLowerCase();
    let goal = intimacyAdvance === 'physical'
        ? 'IntimacyAdvancePhysical'
        : intimacyAdvance === 'verbal'
            ? 'IntimacyAdvanceVerbal'
            : String(semantic.identifyGoal || 'Normal_Interaction');
    if (goal === 'IntimacyAdvancePhysical' && intimacyReferee.value === 'verbal') {
        goal = 'IntimacyAdvanceVerbal';
    }
    const semanticHasStakes = bool(semantic.hasStakes) ? 'Y' : 'N';
    const preliminaryTargets = sanitizeTargets(rawTargets, targetClassifier, { hasStakes: 'Y', goal, intimacyConsent: 'N' });

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

    const intimacyTarget = firstReal(preliminaryTargets.ActionTargets);
    const semanticRelationship = (ledger.relationshipEngine || []).find(item => sameName(item?.NPC, intimacyTarget)) || {};
    const targetState = trackerSnapshot[intimacyTarget] || null;
    const preliminaryInitFlags = applyInitFlagReferee(semanticRelationship.initFlags || {}, refereeContext, audit, `2.3 checkIntimacyGate.initPreset(${intimacyTarget || NONE})`);
    const preliminaryDisposition = targetState?.currentDisposition || initPreset(preliminaryInitFlags).disposition;
    const preliminaryThreshold = checkThreshold(preliminaryDisposition, semanticRelationship.overrideFlags || {});
    const intimacyAllowance = currentIntimacyGateAllows(targetState, preliminaryDisposition, preliminaryThreshold);
    const intimacyConsent = ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal)
        && intimacyAllowance.allows
        ? 'Y'
        : 'N';
    audit.push(`2.3 checkIntimacyGate=${intimacyConsent}`);
    if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal)) {
        audit.push(`2.3a checkIntimacyGate.threshold=${compact(preliminaryThreshold)}`);
        audit.push(`2.3b checkIntimacyGate.evidence=${compact(intimacyAllowance)}`);
    }

    const isIntimacyAdvance = ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal);
    const stakesOverrideEvidence = getStakesOverrideEvidence(goal, intimacyTarget, targetState, preliminaryDisposition, preliminaryThreshold, intimacyAllowance, semanticHasStakes, intimacyConsent);
    const hasStakes = stakesOverrideEvidence?.hasStakes || semanticHasStakes;
    const stakesRule = stakesOverrideEvidence?.rule || (isIntimacyAdvance ? 'semantic_final_intimacy_no_hard_override' : 'semantic_final');
    audit.push(`2.4a semanticHasStakes=${semanticHasStakes}`);
    audit.push(`2.4b deterministicStakesRule=${stakesRule}`);
    if (stakesOverrideEvidence) {
        audit.push(`2.4c deterministicStakesEvidence=${compact(stakesOverrideEvidence.evidence)}`);
    }
    audit.push(`2.4 hasStakes=${hasStakes}`);

    const targets = sanitizeTargets(rawTargets, targetClassifier, { hasStakes, goal, intimacyConsent });
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

    const npcInScene = unique([
        ...targets.ActionTargets,
        ...targets.OppTargets.NPC,
        ...targets.BenefitedObservers,
        ...targets.HarmedObservers,
        ...ledger.relationshipEngine.map(x => x.NPC).filter(name => targetClassifier.isLiving(name)),
    ].filter(name => isReal(name) && targetClassifier.isLiving(name)));
    audit.push(`2.5 NPCInScene=[${npcInScene.join(',') || NONE}]`);

    let actions = ['a1'];
    let outcome = {
        OutcomeTier: 'NONE',
        LandedActions: '(none)',
        Outcome: 'no_roll',
        CounterPotential: 'none',
    };
    let resultLine = 'No roll';
    let hostilePhysical = false;

    if (hasStakes === 'N') {
        audit.push('2.6 hasStakes=N');
        audit.push('2.6a actions=[a1]');
        audit.push(`2.6b resolveOutcome=${compact(outcome)}`);
    } else {
        actions = normalizeActionMarkers(semantic.actionCount);
        const semanticMapStats = normalizeMapStats(semantic.mapStats);
        let { userStat, oppStat } = applyMapStatsHardRules(semantic, goal, targets, semanticMapStats, audit, { intimacyConsent });
        const userCore = getUserCoreStats(ledger);
        let targetCore = null;
        const oppTargetsNpcFirst = firstReal(targets.OppTargets.NPC);
        const currentTargetCore = oppTargetsNpcFirst ? trackerSnapshot[oppTargetsNpcFirst]?.currentCoreStats : null;
        if (oppStat !== 'ENV' && !oppTargetsNpcFirst) {
            oppStat = 'ENV';
        }

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

        const atkDie = rollPool[0];
        const defDie = rollPool[1];
        const atkTot = atkDie + statValue(userCore, userStat);
        const defTot = oppStat === 'ENV' ? defDie : defDie + statValue(targetCore, oppStat);
        const margin = atkTot - defTot;
        const hostileReferee = applyHostilePhysicalIntentHardRules(semantic, audit);
        const hostilePhysicalIntent = hostileReferee.value;
        hostilePhysical = userStat === 'PHY' && hostilePhysicalIntent;

        if (hostilePhysical) {
            outcome = hostilePhysicalOutcome(margin, actions.length);
        } else {
            outcome = nonHostileOutcome(margin);
        }

        audit.push(`2.7o resolveOutcome=atkDie:${atkDie}, atkTot:${atkTot}, defDie:${defDie}, defTot:${defTot}, margin:${margin}, classifyHostilePhysicalIntent:${hostilePhysical ? 'Y' : 'N'} -> ${compact(outcome)}`);
        resultLine = `1d20(${atkDie}) + ${userStat}(${statValue(userCore, userStat)}) = ${atkTot} vs 1d20(${defDie})${oppStat === 'ENV' ? '' : ` + ${oppStat}(${statValue(targetCore, oppStat)})`} = ${defTot} -> ${outcome.OutcomeTier}`;
    }

    const boundaryReferee = applyPhysicalBoundaryPressureHardRules(semantic, targets, {
        hasStakes,
        hostilePhysical,
        goal,
    }, audit);

    const packet = {
        GOAL: goal,
        actions,
        IntimacyConsent: intimacyConsent,
        STAKES: hasStakes,
        LandedActions: outcome.LandedActions,
        OutcomeTier: outcome.OutcomeTier,
        Outcome: outcome.Outcome,
        CounterPotential: outcome.CounterPotential,
        classifyHostilePhysicalIntent: hostilePhysical ? 'Y' : 'N',
        classifyPhysicalBoundaryPressure: boundaryReferee.value ? 'Y' : 'N',
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: { NPC: showNone(targets.OppTargets.NPC), ENV: showNone(targets.OppTargets.ENV) },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
        NPCInScene: showNone(npcInScene),
    };

    audit.push(`2.8 HANDOFF=${compact(packet)}`);
    audit.push('---');

    return { packet, resultLine };
}

function runRelationships(ledger, trackerSnapshot, resolutionPacket, audit, refereeContext) {
    const resolutionSemantic = ledger.resolutionEngine || {};
    const semanticMap = new Map((ledger.relationshipEngine || []).filter(x => x?.NPC).map(x => [x.NPC, x]));
    const npcList = toRealArray(resolutionPacket.NPCInScene);
    const handoffs = [];
    const trackerUpdate = {};

    audit.push('STEP 3: EXECUTE RelationshipEngine(npc, resolutionPacket) USING SEMANTIC_LEDGER');
    audit.push(`3.1 NPC_LIST=[${npcList.join(',') || NONE}]`);

    for (const npc of npcList) {
        const sem = semanticMap.get(npc) || { NPC: npc, relevant: false, initFlags: {}, stakeChangeByOutcome: {}, overrideFlags: {} };
        const relevant = bool(sem.relevant) ? 'Y' : 'N';
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
                Landed: landedBool(resolutionPacket.LandedActions) ? 'Y' : 'N',
                OutcomeTier: resolutionPacket.OutcomeTier || 'NONE',
                NarrationBand: resolutionPacket.Outcome || 'standard',
                IntimacyGate: 'SKIP',
            };
            handoffs.push(handoff);
            audit.push(`3.2a NPC_HANDOFF=${compact(handoff)}`);
            continue;
        }

        const state = normalizeTrackerEntry(trackerSnapshot[npc] || {});
        const newEncounter = bool(sem.newEncounterExplicit) ? 'Y' : 'N';
        let rapportEncounterLock = newEncounter === 'Y' ? 'N' : state.rapportEncounterLock;
        let currentDisposition = state.currentDisposition;
        let currentRapport = state.currentRapport;
        let hostilePressure = state.hostilePressure;
        let hostileLandedPressure = state.hostileLandedPressure;
        let dominantLock = state.dominantLock;
        let pressureMode = state.pressureMode;

        audit.push(`3.3 getCurrentRelationalState=${compact(state)}`);
        audit.push(`3.3a newEncounterExplicit=${newEncounter}`);
        audit.push(`3.3b rapportEncounterLock=${rapportEncounterLock}`);

        if (!currentDisposition) {
            const effectiveInitFlags = applyInitFlagReferee(sem.initFlags || {}, refereeContext, audit, `3.3 ${npc}.initPreset`);
            const init = initPreset(effectiveInitFlags);
            currentDisposition = init.disposition;
            audit.push(`3.3d initPreset.activeEnemy=${yn(effectiveInitFlags.activeEnemy)}`);
            audit.push(`3.3e initPreset.romanticOpen=${yn(effectiveInitFlags.romanticOpen)}`);
            audit.push(`3.3f initPreset.userBadRep=${yn(effectiveInitFlags.userBadRep)}`);
            audit.push(`3.3g initPreset.userGoodRep=${yn(effectiveInitFlags.userGoodRep)}`);
            audit.push(`3.3h initPreset.userNonHuman=${yn(effectiveInitFlags.userNonHuman)} fearImmunity=${yn(effectiveInitFlags.fearImmunity)}`);
            audit.push(`3.3i initPreset=${init.label}`);
            audit.push(`3.3j currentDisposition=${formatDisposition(currentDisposition)}`);
        } else {
            audit.push(`3.3c currentDisposition=${formatDisposition(currentDisposition)}`);
        }

        audit.push(`3.3k currentRapport=${currentRapport}`);

        const isAllowed = resolutionPacket.IntimacyConsent;
        const outcomeKey = String(resolutionPacket.Outcome || 'no_roll');
        const stakeReferee = resolveStakeChangeByOutcome(npc, sem, resolutionPacket);
        const benefitReferee = applyMeaningfulBenefitReferee(npc, resolutionPacket, stakeReferee.value, {
            ...sem,
            identifyGoal: resolutionSemantic.identifyGoal,
            identifyChallenge: resolutionSemantic.identifyChallenge,
            explicitMeans: resolutionSemantic.explicitMeans,
        });
        const stakeChange = benefitReferee.value;
        const npcStakes = resolutionPacket.STAKES === 'Y' && ['benefit', 'harm'].includes(stakeChange) ? 'Y' : 'N';
        const auditInteraction = npcStakes === 'Y' && stakeChange === 'benefit' ? 'Y' : 'N';
        const routedTarget = routeDispositionTarget(npc, resolutionPacket, auditInteraction, isAllowed, sem);
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
        const rapport = updateRapport(currentRapport, target, rapportEncounterLock, hostilePressureResult ? 'hostilePressure' : 'normal');
        currentRapport = rapport.currentRapport;
        rapportEncounterLock = rapport.rapportEncounterLock;
        hostilePressure = hostilePressureResult?.hostilePressure ?? hostilePressure;
        hostileLandedPressure = hostilePressureResult?.hostileLandedPressure ?? hostileLandedPressure;
        dominantLock = hostilePressureResult?.dominantLock ?? dominantLock;
        pressureMode = hostilePressureResult?.pressureMode ?? pressureMode;

        audit.push(`3.4 isAllowed=${isAllowed}`);
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
        audit.push(`3.5f save rapportEncounterLock=${rapportEncounterLock} to sceneTracker`);

        const classified = classifyDisposition(currentDisposition);
        const threshold = checkThreshold(currentDisposition, sem.overrideFlags || {});
        const resolvedGate = resolveIntimacyGate(state, threshold, currentDisposition, isAllowed, resolutionPacket.GOAL);
        const intimacyGate = resolvedGate.IntimacyGate;
        const intimacyGateSource = resolvedGate.IntimacyGateSource;
        const persistedGate = intimacyGate !== 'SKIP' && intimacyGateSource !== 'CURRENT_DENIED'
            ? intimacyGate
            : 'SKIP';
        const persistedGateSource = persistedGate === 'SKIP' ? 'NONE' : intimacyGateSource;

        audit.push(`3.6 classifyDisposition=${compact(classified)}`);
        audit.push(`3.6a checkThreshold=${compact(threshold)}`);
        audit.push(`3.6b IntimacyGate=${intimacyGate}`);
        audit.push(`3.6c IntimacyGateSource=${intimacyGateSource}`);
        audit.push(`3.6d persistedIntimacyGate=${persistedGate}`);
        audit.push(`3.6e persistedIntimacyGateSource=${persistedGateSource}`);

        const handoff = {
            NPC: npc,
            FinalState: `B${currentDisposition.B}/F${currentDisposition.F}/H${currentDisposition.H}`,
            Lock: classified.lock,
            Behavior: classified.behavior,
            Target: target,
            NPC_STAKES: npcStakes,
            Override: threshold.Override,
            Landed: landedBool(resolutionPacket.LandedActions) ? 'Y' : 'N',
            OutcomeTier: resolutionPacket.OutcomeTier || 'NONE',
            NarrationBand: resolutionPacket.Outcome || 'standard',
            IntimacyGate: intimacyGate,
            IntimacyGateSource: intimacyGateSource,
            HostilePressure: hostilePressure,
            HostileLandedPressure: hostileLandedPressure,
            BoundaryPressure: boundaryPressureResult ? 'Y' : 'N',
            DominantLock: dominantLock,
            PressureMode: pressureMode,
            RelationToUserAction: relationToUserAction(npc, resolutionPacket),
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
            rapportEncounterLock,
            intimacyGate: persistedGate,
            intimacyGateSource: persistedGateSource,
            currentCoreStats: coreStats,
            hostilePressure,
            hostileLandedPressure,
            dominantLock,
            pressureMode,
        };

        audit.push(`3.7 NPC_HANDOFF=${compact(handoff)}`);
    }

    audit.push('---');
    return { handoffs, trackerUpdate };
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
    const sem = ledger.nameSemantic || {};
    const contextText = buildNameContext(ledger, context);
    const cue = detectNameCue(contextText);
    const nameRequired = resolveNameRequired(sem, contextText, cue);
    const explicitNameKnown = bool(sem.explicitNameKnown);
    const isLocation = bool(sem.isLocation) || cue.mode === 'LOCATION';
    const normalizedSeed = normalizeNameSeed(firstNameSeedHint(cue.seedHint, sem.seed, sem.normalizeSeed, contextText));
    const mode = detectNameMode(contextText, isLocation, cue.mode || sem.detectMode);
    const profile = profileFromNameContext(contextText);
    const gender = detectNameGender(contextText);
    const registry = getNameRegistry(context);
    const generatedName = nameRequired
        ? buildDeterministicName({
            mode,
            profile,
            gender,
            seed: normalizedSeed,
            registry,
            contextText,
        })
        : NONE;

    if (nameRequired && generatedName !== NONE) {
        registerGeneratedName(context, generatedName, {
            mode,
            profile,
            gender,
            seed: normalizedSeed,
        });
    }

    const result = {
        nameRequired: yn(nameRequired),
        explicitNameKnown: yn(explicitNameKnown),
        isLocation: yn(isLocation),
        seed: sem.seed || NONE,
        normalizeSeed: normalizedSeed,
        detectMode: nameRequired ? mode : 'none',
        profile,
        gender: mode === 'PERSON' ? gender : 'NEUTRAL',
        modelGeneratedName: sem.generatedName || NONE,
        deterministicCue: cue.required ? cue.reason : 'none',
        generatedName,
    };
    audit.push('STEP 5: EXECUTE NameGenerationEngine');
    audit.push(`5.1 nameRequired=${result.nameRequired}`);
    audit.push(`5.1a explicitNameKnown=${result.explicitNameKnown}`);
    audit.push(`5.1b isLocation=${result.isLocation}`);
    audit.push(`5.1c seed=${result.seed}`);
    audit.push(`5.1d normalizeSeed=${result.normalizeSeed}`);
    audit.push(`5.1e detectMode=${result.detectMode}`);
    audit.push(`5.1f profile=${result.profile}`);
    audit.push(`5.1g gender=${result.gender}`);
    audit.push(`5.1h generatedName=${result.generatedName}`);
    if (cue.required) {
        audit.push(`5.1h.1 deterministicNameCue=${compact(cue)}`);
    }
    if (sem.generatedName && sem.generatedName !== NONE) {
        audit.push(`5.1i ignoredModelGeneratedName=${sem.generatedName}`);
    }
    audit.push('---');
    return result;
}

function buildNameContext(ledger, context) {
    const sem = ledger.nameSemantic || {};
    const resolution = ledger.resolutionEngine || {};
    return [
        sem.context,
        sem.seed,
        sem.normalizeSeed,
        sem.detectMode,
        getLatestUserTextFromContext(context),
        ledger.chaosSemantic?.sceneSummary,
        resolution.identifyGoal,
        resolution.identifyChallenge,
        resolution.explicitMeans,
        ...(ledger.relationshipEngine || []).map(item => item?.NPC).filter(Boolean),
    ].filter(Boolean).join(' ').trim();
}

function resolveNameRequired(sem, contextText, cue = { required: false }) {
    if (cue.required) return true;
    if (bool(sem.explicitNameKnown)) return false;
    if (bool(sem.nameRequired)) return true;
    if (bool(sem.isLocation)) return true;
    return /\b(?:will be mentioned|about to be mentioned|introduced|present|enters|arrives|appears|queen|king|prince|princess|lord|lady|captain|guard|priest|priestess|innkeeper|messenger|hunter|ruler|mage|witch|healer|merchant|bandit|assassin|knight|soldier|scout|stranger|witness|place|town|city|ruin|mountain|river|forest|temple|keep|village|fort|harbor|port|island|lake|swamp|marsh|cavern|valley|peak|district|kingdom|province|outpost|bridge|gate)\b/i.test(contextText);
}

function detectNameCue(contextText) {
    const text = String(contextText || '').replace(/\s+/g, ' ').trim();
    const personCue = /\b(?:his|her|their|the|that|this)?\s*(?:name|proper name)\s+(?:is|was|will be|would be|should be)\s*(?:[.:;,-]*)?\s*$/i
        .test(text)
        || /\b(?:named|called|known as|goes by|they call (?:him|her|them)|people call (?:him|her|them))\s*(?:[.:;,-]*)?\s*$/i.test(text);
    const locationCue = /\b(?:the|this|that)?\s*(?:place|town|city|village|ruin|temple|keep|fort|harbor|port|island|forest|river|mountain|cavern|district|kingdom|outpost|bridge|gate)\s+(?:is|was|will be|would be)?\s*(?:called|named|known as)\s*(?:[.:;,-]*)?\s*$/i
        .test(text)
        || /\b(?:called|named|known as)\s*(?:[.:;,-]*)?\s*$/i.test(text)
            && /\b(?:place|town|city|village|ruin|temple|keep|fort|harbor|port|island|forest|river|mountain|cavern|district|kingdom|outpost|bridge|gate)\b/i.test(text);
    if (locationCue) {
        return {
            required: true,
            mode: 'LOCATION',
            seedHint: locationSeedHint(text),
            reason: 'explicit location naming cue',
        };
    }
    if (personCue) {
        return {
            required: true,
            mode: 'PERSON',
            seedHint: personSeedHint(text),
            reason: 'explicit person/entity naming cue',
        };
    }
    return { required: false, mode: null, seedHint: '', reason: 'none' };
}

function personSeedHint(text) {
    const roleMatch = /\b(?:butcher|guard|priestess|priest|merchant|hunter|ruler|mage|witch|healer|bandit|assassin|knight|soldier|scout|stranger|witness|captain|lord|lady|queen|king|prince|princess|innkeeper|messenger)\b/i.exec(text);
    return roleMatch?.[0] || text;
}

function locationSeedHint(text) {
    const placeMatch = /\b(?:place|town|city|village|ruin|temple|keep|fort|harbor|port|island|forest|river|mountain|cavern|district|kingdom|outpost|bridge|gate)\b/i.exec(text);
    return placeMatch?.[0] || text;
}

function getLatestUserTextFromContext(context) {
    const chat = context?.chat;
    if (!Array.isArray(chat)) return '';
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (!message?.is_user && message?.role !== 'user') continue;
        if (typeof message.mes === 'string') return message.mes;
        if (typeof message.content === 'string') return message.content;
        if (Array.isArray(message.content)) {
            return message.content.map(part => typeof part === 'string' ? part : part?.text).filter(Boolean).join('\n');
        }
    }
    return '';
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

function buildDeterministicName({ mode, profile, gender, seed, registry, contextText }) {
    const used = new Set([
        ...Array.from(registry.used || []),
        ...extractExistingProperNames(contextText),
    ].map(normalizeNameKey).filter(Boolean));
    const baseSeed = normalizeNameSeed(seed);
    const rng = createNamePrng(`${baseSeed}|${mode}|${profile}|${gender}|${contextText}|${used.size}`);

    for (let attempt = 0; attempt < 96; attempt += 1) {
        const candidateSeed = attempt > 0 && attempt % 8 === 0
            ? pickSeed(rng, baseSeed)
            : baseSeed;
        const candidate = buildNameCandidate({ mode, profile, gender, seed: candidateSeed, rng, attempt });
        if (rejectName(candidate, mode, candidateSeed, used)) continue;
        return candidate;
    }

    for (let attempt = 0; attempt < 96; attempt += 1) {
        const candidateSeed = pickSeed(rng, baseSeed);
        const candidate = buildNameCandidate({ mode, profile, gender, seed: candidateSeed, rng, attempt });
        if (rejectName(candidate, mode, candidateSeed, used)) continue;
        return candidate;
    }

    return mode === 'LOCATION' ? `${baseSeed}mora` : `${baseSeed}rin`;
}

function buildNameCandidate({ mode, profile, gender, seed, rng, attempt }) {
    const pools = NAME_PARTS[mode]?.[profile] || NAME_PARTS[mode].BALANCED;
    const middle = pickWeighted(rng, pools.middle);
    const endingPool = mode === 'PERSON' && gender !== 'NEUTRAL'
        ? [...GENDER_ENDINGS[gender], ...pools.ending]
        : pools.ending;
    const ending = pickWeighted(rng, endingPool);
    const useMiddle = mode === 'LOCATION' || attempt % 3 !== 0;
    const phoneticExtra = attempt % 7 === 0 ? phonotacticSyllable(rng) : '';
    return titleName(`${seed}${useMiddle ? middle : ''}${phoneticExtra}${ending}`);
}

function pickSeed(rng, baseSeed) {
    if (rng() < 0.8) return pickWeighted(rng, CURATED_NAME_SEEDS);
    const generated = `${phonotacticSyllable(rng)}${phonotacticSyllable(rng)}`.replace(/[^a-z]/gi, '').slice(0, 3);
    return normalizeNameSeed(generated || baseSeed);
}

function phonotacticSyllable(rng) {
    return `${pickWeighted(rng, PHONOTACTIC_ONSETS)}${pickWeighted(rng, PHONOTACTIC_VOWELS)}${pickWeighted(rng, PHONOTACTIC_CODAS)}`;
}

function pickWeighted(rng, list) {
    const values = Array.isArray(list) && list.length ? list : ['rin'];
    return values[Math.floor(rng() * values.length) % values.length];
}

function rejectName(name, mode, seed, used) {
    const text = String(name || '').trim();
    const lower = text.toLowerCase();
    if (!text.toLowerCase().startsWith(String(seed || '').toLowerCase())) return true;
    if (mode === 'PERSON' && (text.length < 5 || text.length > 10)) return true;
    if (mode === 'LOCATION' && (text.length < 7 || text.length > 14)) return true;
    if (/[aeiou]{3,}/i.test(text)) return true;
    if (/[^aeiou\s-]{3,}/i.test(text)) return true;
    if (/(.)\1\1/i.test(text)) return true;
    if (used.has(normalizeNameKey(text))) return true;
    if (/\b(?:aragorn|legolas|gandalf|frodo|sauron|elden|hyrule|zelda|cloud|sephiroth|john|michael|david|james|mary|sarah|anna|london|paris|tokyo|rome)\b/i.test(lower)) return true;
    if (/(?:mirror|river|stone|storm|shadow|silver|golden|crystal|dragon|demon|angel|dark|light|black|white|red|blue|green|wolf|rose|luna|nova)/i.test(lower)) return true;
    if (mode === 'LOCATION' && /\b(?:rin|len|taro|mira|naya|emi|dan|vek|iro)$/i.test(text)) return true;
    return false;
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

function runProactivity(ledger, handoffs, resolutionPacket, chaosHandoff, dice, audit) {
    const kind = classifyAction(resolutionPacket);
    const chaosBand = chaosHandoff.CHAOS?.triggered ? chaosHandoff.CHAOS.band : 'None';
    const counterPotential = resolutionPacket.CounterPotential || 'none';
    const cap = clamp(Number(ledger.proactivitySemantic?.cap || 1), 1, 3);
    const candidates = [];
    const results = {};

    audit.push('STEP 6: EXECUTE NPCProactivityEngine');
    audit.push(`6.2 classifyAction=${kind}`);
    audit.push(`6.2a chaosBand=${chaosBand}`);
    audit.push(`6.2b counterPotential=${counterPotential}`);
    audit.push(`6.2c cap=${cap}`);

    for (const handoff of handoffs) {
        const fin = parseFinalState(handoff.FinalState);
        const lock = handoff.Lock && handoff.Lock !== 'None' ? handoff.Lock : deriveLock(fin);
        const impulse = deriveImpulse(kind, lock, fin, handoff.IntimacyGate, handoff.PressureMode, handoff.Target);
        const proactivityGuard = proactivityRefereeGuard(handoff, resolutionPacket);
        const tier = proactivityGuard
            ? 'DORMANT'
            : classifyProactivityTier(handoff, chaosBand, counterPotential, lock, fin);

        results[handoff.NPC] = {
            Proactive: 'N',
            Intent: 'NONE',
            Impulse: 'NONE',
            TargetsUser: 'N',
            ProactivityTier: tier,
        };

        audit.push(`6.3 FOR ${handoff.NPC}`);
        audit.push(`6.4 parseFinalState=${compact(fin)}`);
        audit.push(`6.4b lock=${lock}`);
        audit.push(`6.4f deriveImpulse=${impulse}`);
        audit.push(`6.4g classifyProactivityTier=${tier}`);
        if (proactivityGuard) {
            audit.push(`6.4g.1 proactivityRefereeGuard=${proactivityGuard}`);
        }

        if (tier === 'FORCED') {
            const intent = selectIntent(impulse, kind, fin, handoff.IntimacyGate, handoff.Override, handoff.PressureMode);
            const targetsUser = proactivityGuard ? 'N' : targetsUserFromIntent(intent);
            candidates.push({ NPC: handoff.NPC, die: 20, tier, intent, impulse, TargetsUser: targetsUser, Threshold: 'AUTO', passes: 'Y' });
            audit.push('6.4i FORCED candidate');
            continue;
        }

        const die = dice.d20();
        const threshold = thresholdFromTier(tier);
        const passes = die >= threshold ? 'Y' : 'N';
        audit.push(`6.5 proactivityDie=${die}`);
        audit.push(`6.5a thresholdFromTier=${threshold}`);
        audit.push(`6.5b passes=${passes}`);

        results[handoff.NPC].ProactivityDie = die;
        results[handoff.NPC].Threshold = threshold;

        if (passes === 'Y') {
            const intent = selectIntent(impulse, kind, fin, handoff.IntimacyGate, handoff.Override, handoff.PressureMode);
            const targetsUser = proactivityGuard ? 'N' : targetsUserFromIntent(intent);
            candidates.push({ NPC: handoff.NPC, die, tier, intent, impulse, TargetsUser: targetsUser, Threshold: threshold, passes });
            audit.push(`6.5c selectIntent=${intent}`);
            audit.push(`6.5e targetsUserFromIntent=${targetsUser}`);
        } else {
            audit.push('6.5c Proactive=N -> Intent=NONE, Impulse=NONE, TargetsUser=N');
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
            TargetsUser: candidate.TargetsUser,
            ProactivityTier: candidate.tier,
            ProactivityDie: candidate.die,
            Threshold: candidate.Threshold,
        };
    }

    audit.push(`6.8 FINAL_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results };
}

function runAggression(ledger, trackerSnapshot, trackerUpdate, proactivityResults, resolutionPacket, dice, audit) {
    const userCore = getUserCoreStats(ledger);
    const counterPotential = resolutionPacket?.CounterPotential || 'none';
    const counterAllowed = ['light', 'medium', 'severe'].includes(counterPotential);
    const counterBonus = counterBonusFromPotential(counterPotential);
    const criticalSuccess = resolutionPacket?.OutcomeTier === 'Critical_Success';
    const retaliationAllowed = resolutionPacket?.classifyHostilePhysicalIntent === 'Y';
    const proactiveAttackAllowed = Object.values(proactivityResults || {}).some(result =>
        result?.Proactive === 'Y'
        && result?.TargetsUser === 'Y'
        && result?.Intent === 'ESCALATE_VIOLENCE');
    const attackType = criticalSuccess
        ? 'None'
        : counterAllowed
            ? 'CounterAttack'
            : retaliationAllowed
                ? 'Retaliation'
                : proactiveAttackAllowed
                    ? 'ProactiveAttack'
                    : 'None';
    const proactiveAggressive = Object.entries(proactivityResults).filter(([, result]) =>
        attackType !== 'None'
        &&
        result.Proactive === 'Y'
        && result.TargetsUser === 'Y'
        && isImmediateAttackIntentForType(result.Intent, attackType));
    const counterTarget = counterAllowed ? firstReal(resolutionPacket?.OppTargets?.NPC) || firstReal(resolutionPacket?.ActionTargets) : null;
    const aggressive = counterAllowed && !criticalSuccess && counterTarget
        ? [proactiveAggressive.find(([npc]) => sameName(npc, counterTarget)) || [counterTarget, {
            Proactive: 'Y',
            Intent: 'BOUNDARY_PHYSICAL',
            Impulse: 'ANGER',
            TargetsUser: 'Y',
            ProactivityTier: 'FORCED',
            ProactivityDie: 20,
            Threshold: 'AUTO',
        }]]
        : proactiveAggressive;
    const results = {};

    audit.push('STEP 7: EXECUTE NPCAggressionResolution');
    audit.push(`7.1 counterPotential=${counterPotential}`);
    audit.push(`7.1a counterBonus=${counterBonus}`);
    audit.push(`7.1b immediateAttackType=${attackType}`);
    audit.push(`7.1c counterTarget=${counterTarget || NONE}`);
    audit.push(`7.2 AggressionPresent=${aggressive.length ? 'Y' : 'N'}`);

        if (!aggressive.length) {
            if (criticalSuccess) audit.push('7.2a Critical_Success -> no immediate NPC attack roll');
            else if (counterAllowed) audit.push('7.2a no qualifying proactive counterattack');
            else if (retaliationAllowed) audit.push('7.2a no qualifying proactive retaliation');
            else if (proactiveAttackAllowed) audit.push('7.2a no qualifying proactive attack');
            else audit.push('7.2a no immediate counterattack/retaliation trigger');
        audit.push('7.2a AGGRESSION_RESULTS={}');
        audit.push('---');
        return { results };
    }

    audit.push(`7.3 getUserCoreStats=${compact(userCore)}`);

    for (const [npc, proactivityResult] of aggressive) {
        const npcCore = normalizeCore(trackerUpdate[npc]?.currentCoreStats || trackerSnapshot[npc]?.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 });
        const npcDie = dice.d20();
        const userDie = dice.d20();
        const npcTotal = npcDie + npcCore.PHY + counterBonus;
        const userTotal = userDie + userCore.PHY;
        const margin = npcTotal - userTotal;
        const ReactionOutcome = aggressionReactionOutcome(margin);
        results[npc] = { AttackType: attackType, AttackIntent: proactivityResult.Intent, CounterPotential: counterPotential, CounterBonus: counterBonus, ReactionOutcome, Margin: margin };
        audit.push(`7.5 ${npc}.npcCore=${compact(npcCore)}`);
        audit.push(`7.5e npcTotal=${npcDie}+${npcCore.PHY}+${counterBonus}=${npcTotal}`);
        audit.push(`7.5f userTotal=${userDie}+${userCore.PHY}=${userTotal}`);
        audit.push(`7.6 AGGRESSION_RESULT=${compact(results[npc])}`);
    }

    audit.push(`7.7 AGGRESSION_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results };
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
    const userText = String(fields.persona ?? '');

    return {
        userNonHuman: classifyUserNonHuman(userText),
    };
}

function getCardFields(context) {
    try {
        return typeof context?.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function applyInitFlagReferee(flags, refereeContext, audit, label) {
    const effective = { ...flags };
    const classification = refereeContext?.userNonHuman;
    if (bool(effective.activeEnemy)) {
        audit.push(`${label}.activeEnemy=Y`);
    }
    if (!classification || classification.value == null) return effective;

    const current = bool(effective.userNonHuman);
    if (current === classification.value) return effective;

    effective.userNonHuman = classification.value;
    audit.push(`${label}.userNonHumanReferee=${compact({
        hardRule: 'RelationshipEngine.initPreset: explicit user race/species evidence determines monster/non-typical userNonHuman flag',
        from: current,
        to: classification.value,
        source: classification.source,
        evidence: classification.evidence,
    })}`);
    return effective;
}

function applyIntimacyAdvanceHardRules(semantic, audit) {
    let value = ['physical', 'verbal', 'none'].includes(String(semantic.intimacyAdvance || '').toLowerCase())
        ? String(semantic.intimacyAdvance || '').toLowerCase()
        : 'none';
    const source = semanticSourceText(semantic);
    if (value === 'none' && semantic?.identifyGoal === 'IntimacyAdvancePhysical') value = 'physical';
    if (value === 'none' && semantic?.identifyGoal === 'IntimacyAdvanceVerbal') value = 'verbal';

    if (value === 'physical' && isVerbalIntimacyRequest(source) && !hasUserInitiatedIntimateContact(source)) {
        audit.push(`2.1b deterministicIntimacyAdvanceReferee=${compact({
            hardRule: 'ResolutionEngine.identifyGoal: asking/requesting/proposing intimacy is verbal unless the user attempts physical contact',
            from: 'physical',
            to: 'verbal',
            evidence: source.slice(0, 220),
        })}`);
        value = 'verbal';
    }

    return { value };
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

function semanticSourceText(semantic) {
    return [
        semantic?.identifyGoal,
        semantic?.identifyChallenge,
        semantic?.explicitMeans,
    ].filter(Boolean).join(' ').toLowerCase();
}

function isVerbalIntimacyRequest(source) {
    return /\b(will you|would you|could you|can you|may i|can i|could i|let me|please|ask(?:s|ed|ing)?|request(?:s|ed|ing)?|invite(?:s|d)?|propos(?:e|es|ed|ing)|want you to)\b.{0,80}\b(kiss|touch|hold|embrace|sleep with|sex|intimacy|intimate|bed|caress)\b/.test(source)
        || /\b(kiss|touch|hold|embrace|sleep with|sex|intimacy|intimate|bed|caress)\b.{0,80}\b(me|you|permission|allow|let)\b/.test(source);
}

function hasUserInitiatedIntimateContact(source) {
    return /\b(i|user|{{user}})\s+(?:try|tries|tried|attempt|attempts|attempted|lean|leans|leaned|move|moves|moved|reach|reaches|reached|press|presses|pressed|pull|pulls|pulled|grab|grabs|grabbed|touch|touches|touched|kiss|kisses|kissed|cup|cups|cupped|caress|caresses|caressed|grope|gropes|groped)\b/.test(source)
        && /\b(kiss|lips|mouth|touch|hold|embrace|body|waist|chin|face|cheek|neck|hair|hand|caress|grope|undress|clothes|shirt|dress|skirt|underwear)\b/.test(source);
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






