import {
    createDice,
    combatOutcome,
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
    isImmediateAttackIntent,
    isImmediateAttackIntentForType,
    buildNarrationGuidance,
    buildPersistencePolicy,
    trackerSummary,
    normalizeTrackerEntry,
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

const PHONOTACTIC_ONSETS = ['', 'b', 'd', 'g', 'h', 'k', 'l', 'm', 'n', 'r', 's', 't', 'v', 'y', 'z', 'kh', 'sh'];
const PHONOTACTIC_VOWELS = ['a', 'e', 'i', 'o', 'u', 'ai', 'ei', 'ao'];
const PHONOTACTIC_CODAS = ['', 'n', 'r', 'l', 'm', 's', 'v', 'k'];

const NAME_PARTS = {
    PERSON: {
        HARD: {
            start: ['Az', 'Dar', 'Esh', 'Kav', 'Khaz', 'Ruk', 'Sark', 'Taz', 'Vark', 'Zor'],
            middle: ['', '', 'a', 'e', 'i', 'ka', 'ra', 'un', 'or', 'ul', 'ir'],
            ending: ['an', 'ar', 'ek', 'en', 'ir', 'ok', 'or', 'un', 'ash', 'ul'],
        },
        SOFT: {
            start: ['Ama', 'Eli', 'Ira', 'Lio', 'Mira', 'Naya', 'Omi', 'Sae', 'Tali', 'Vela', 'Yuna', 'Zira'],
            middle: ['', '', 'la', 'mi', 'na', 'ra', 'si', 'va', 'ri'],
            ending: ['a', 'e', 'ia', 'in', 'ri', 'sa', 'shi', 'ya'],
        },
        BALANCED: {
            start: ['Aru', 'Dara', 'Ivo', 'Kano', 'Luma', 'Mavi', 'Niro', 'Ruva', 'Sena', 'Tavo', 'Vira', 'Zani'],
            middle: ['', '', 'ka', 'li', 'mo', 'ra', 'ta', 've', 'yu'],
            ending: ['an', 'ar', 'en', 'i', 'is', 'o', 'ra', 'ren', 'shi', 'un'],
        },
    },
    LOCATION: {
        HARD: {
            start: ['Akra', 'Darak', 'Eshkar', 'Kaz', 'Khor', 'Marak', 'Rath', 'Tark', 'Vark', 'Zhad'],
            middle: ['', 'dur', 'kar', 'mor', 'nar', 'tav', 'ul', 'zan'],
            ending: ['ak', 'an', 'esh', 'or', 'un', 'var', 'zar', 'gate', 'hold'],
        },
        SOFT: {
            start: ['Amai', 'Ivara', 'Luma', 'Mirai', 'Nara', 'Oshai', 'Sava', 'Tala', 'Velai', 'Yura'],
            middle: ['', 'dara', 'luma', 'mori', 'nara', 'sai', 'tala'],
            ending: ['na', 'ra', 'ri', 'sa', 'ya', 'mere', 'vale', 'hara'],
        },
        BALANCED: {
            start: ['Aru', 'Dava', 'Ish', 'Kora', 'Mora', 'Nava', 'Sura', 'Tava', 'Vora', 'Zana'],
            middle: ['', 'dara', 'kesh', 'mora', 'nara', 'sai', 'tala'],
            ending: ['an', 'esh', 'or', 'ra', 'un', 'reach', 'hollow', 'watch'],
        },
    },
};

const GENDER_ENDINGS = {
    FEMALE: ['a', 'e', 'ia', 'ira', 'ri', 'sa', 'ya'],
    MALE: ['an', 'ar', 'en', 'ir', 'o', 'ok', 'un'],
    NEUTRAL: ['a', 'an', 'e', 'i', 'in', 'o', 'ra', 'un'],
};

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

    const root = context.chatMetadata.structuredPreflightTracker || { npcs: {}, user: {} };
    root.npcs = root.npcs || {};
    root.user = normalizeTrackerUserState(root.user || {});

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

export function runDeterministicEngines(ledger, trackerSnapshot, context, type) {
    const audit = [];
    const dice = createDice();
    const refereeContext = buildRefereeContext(context);
    const resolution = runResolution(ledger, trackerSnapshot, dice, audit, context, refereeContext);
    const relationships = runRelationships(ledger, trackerSnapshot, resolution.packet, audit, refereeContext);
    const chaos = runChaos(ledger, relationships.handoffs, resolution.packet, dice, audit);
    const name = runNameGeneration(ledger, audit, context, type);
    const injuryTrackerUpdate = applyInflictedNpcInjuriesToTrackerUpdate(resolution.packet, relationships.trackerUpdate, trackerSnapshot, audit);
    const proactivity = runProactivity(ledger, relationships.handoffs, resolution.packet, chaos.handoff, dice, audit);
    const aggression = runAggression(ledger, trackerSnapshot, injuryTrackerUpdate, proactivity.results, resolution.packet, dice, audit, context);
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
    const preliminaryState = targetState
        ? {
            ...targetState,
            establishedRelationship: targetState.establishedRelationship === 'Y' || (preliminaryDisposition.B === 4 && semanticRelationship.establishedRelationship === true) ? 'Y' : 'N',
        }
        : {
            establishedRelationship: preliminaryDisposition.B === 4 && semanticRelationship.establishedRelationship === true ? 'Y' : 'N',
        };
    const intimacyAllowance = currentIntimacyGateAllows(preliminaryState, preliminaryDisposition, preliminaryThreshold);
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
    let combatActionSequence = false;
    let userImpairment = noUserImpairment();
    let npcImpairment = noNpcImpairment();

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

        userImpairment = evaluateUserImpairment(ledger, context, semantic, goal, userStat, hasStakes);
        const impairmentPenalty = Number(userImpairment?.AppliedToRoll === 'Y' ? userImpairment.RollPenalty : 0);
        npcImpairment = oppStat !== 'ENV' && oppTargetsNpcFirst
            ? evaluateNpcImpairment(oppTargetsNpcFirst, ledger, trackerSnapshot, semantic, goal, oppStat, hasStakes)
            : noNpcImpairment('no opposing NPC roll');
        const npcImpairmentPenalty = Number(npcImpairment?.AppliedToRoll === 'Y' ? npcImpairment.RollPenalty : 0);
        const atkDie = rollPool[0];
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
        resultLine = `1d20(${atkDie}) + ${userStat}(${userStatValue})${impairmentText} = ${atkTot} vs 1d20(${defDie})${oppStat === 'ENV' ? '' : ` + ${oppStat}(${statValue(targetCore, oppStat)})${npcImpairmentText}`} = ${defTot} -> ${outcome.OutcomeTier}`;
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
    });

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
        classifyCombatActionSequence: combatActionSequence ? 'Y' : 'N',
        classifyPhysicalBoundaryPressure: boundaryReferee.value ? 'Y' : 'N',
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
            audit.push(`3.3g initPreset.priorUserGoodRep=${yn(effectiveInitFlags.priorUserGoodRep)}`);
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
        const establishedRelationship = state.establishedRelationship === 'Y' || (currentDisposition.B === 4 && sem.establishedRelationship === true) ? 'Y' : 'N';
        const relationshipStateForGate = { ...state, establishedRelationship };
        const resolvedGate = resolveIntimacyGate(relationshipStateForGate, threshold, currentDisposition, isAllowed, resolutionPacket.GOAL);
        const intimacyGate = resolvedGate.IntimacyGate;
        const intimacyGateSource = resolvedGate.IntimacyGateSource;
        const persistedGate = intimacyGate !== 'SKIP' && intimacyGateSource !== 'CURRENT_DENIED'
            ? intimacyGate
            : 'SKIP';
        const persistedGateSource = persistedGate === 'SKIP' ? 'NONE' : intimacyGateSource;

        audit.push(`3.6 classifyDisposition=${compact(classified)}`);
        audit.push(`3.6a checkThreshold=${compact(threshold)}`);
        audit.push(`3.6a.1 establishedRelationship=${establishedRelationship}`);
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
            EstablishedRelationship: establishedRelationship,
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
            establishedRelationship,
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
        const candidate = buildNameCandidate({ mode, profile, gender, rng, attempt });
        if (rejectName(candidate, mode, used)) continue;
        return candidate;
    }

    for (let attempt = 0; attempt < 96; attempt += 1) {
        const fallbackProfile = ['BALANCED', 'SOFT', 'HARD'][attempt % 3];
        const candidate = buildNameCandidate({ mode, profile: fallbackProfile, gender, rng, attempt });
        if (rejectName(candidate, mode, used)) continue;
        return candidate;
    }

    return buildUniqueFallbackName(mode, used);
}

function buildNameCandidate({ mode, profile, gender, rng, attempt }) {
    const pools = NAME_PARTS[mode]?.[profile] || NAME_PARTS[mode].BALANCED;
    const start = pickWeighted(rng, pools.start);
    const middle = pickWeighted(rng, pools.middle);
    const endingPool = mode === 'PERSON' && gender !== 'NEUTRAL'
        ? [...GENDER_ENDINGS[gender], ...pools.ending]
        : pools.ending;
    const ending = pickWeighted(rng, endingPool);
    const useMiddle = Boolean(middle) && (mode === 'LOCATION' || rng() < 0.45);
    const phoneticExtra = attempt > 0 && attempt % 11 === 0 ? phonotacticSyllable(rng) : '';
    const raw = `${start}${useMiddle ? middle : ''}${phoneticExtra}${ending}`;
    return titleName(smoothName(raw, mode));
}

function smoothName(value, mode) {
    let text = String(value || '').toLowerCase();
    text = text
        .replace(/([aeiou])\1+/g, '$1')
        .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, '$1')
        .replace(/([aeiou])([aeiou])([aeiou]+)/g, '$1$2')
        .replace(/([bcdfghjklmnpqrstvwxyz])([bcdfghjklmnpqrstvwxyz])([bcdfghjklmnpqrstvwxyz]+)/g, '$1$2');
    if (mode === 'PERSON' && text.length > 9) {
        text = text.replace(/(?:shi|esh|ira|ren|un|an|ar|en|ir|ok|ul)$/i, match => match.slice(0, 1));
    }
    return text;
}

function phonotacticSyllable(rng) {
    return `${pickWeighted(rng, PHONOTACTIC_ONSETS)}${pickWeighted(rng, PHONOTACTIC_VOWELS)}${pickWeighted(rng, PHONOTACTIC_CODAS)}`;
}

function pickWeighted(rng, list) {
    const values = Array.isArray(list) && list.length ? list : ['rin'];
    return values[Math.floor(rng() * values.length) % values.length];
}

function rejectName(name, mode, used) {
    const text = String(name || '').trim();
    const lower = text.toLowerCase();
    if (mode === 'PERSON' && (text.length < 4 || text.length > 9)) return true;
    if (mode === 'LOCATION' && (text.length < 7 || text.length > 14)) return true;
    if (/[aeiou]{3,}/i.test(text)) return true;
    if (/[^aeiou\s-]{3,}/i.test(text)) return true;
    if (/(.)\1\1/i.test(text)) return true;
    if (used.has(normalizeNameKey(text))) return true;
    if (mode === 'PERSON' && ROLE_NAME_PREFIXES.some(prefix => lower.startsWith(prefix))) return true;
    if (/\b(?:aragorn|legolas|gandalf|frodo|sauron|elden|hyrule|zelda|cloud|sephiroth|john|michael|david|james|mary|sarah|anna|london|paris|tokyo|rome|arthur|edward|william|robert|albert|alice|elizabeth|eleanor|aldric|borin|eldarion)\b/i.test(lower)) return true;
    if (/(?:mirror|river|stone|storm|shadow|silver|golden|crystal|dragon|demon|angel|dark|light|black|white|red|blue|green|wolf|rose|luna|nova)/i.test(lower)) return true;
    if (mode === 'LOCATION' && /\b(?:rin|len|taro|mira|naya|emi|dan|vek|iro)$/i.test(text)) return true;
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

function deriveInflictedNpcInjuries({ injuryEffectEngine, targets, outcome, hasStakes }) {
    if (hasStakes !== 'Y') return [];
    if (!effectOutcomeLanded(outcome)) return [];

    const injuries = normalizeInjuryEffectCandidates(injuryEffectEngine)
        .filter(effect => injuryEffectTargetAllowed(effect, targets))
        .map(effect => buildInflictedInjuryFromSemanticEffect(effect, outcome))
        .filter(Boolean);
    return mergeInflictedInjuries(injuries);
}

function effectOutcomeLanded(outcome) {
    const landedCount = Number(outcome?.LandedActions ?? 0);
    return Number.isFinite(landedCount) && landedCount > 0;
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

function statusFromInflictedInjury(source, bodyPart, severity) {
    const effect = {
        effectType: normalizeEffectType(aggressionEffectTypeFromSource(source)),
    };
    return statusFromSemanticEffect(effect, String(bodyPart || 'body').toLowerCase(), severity);
}

function aggressionEffectTypeFromSource(source) {
    const text = String(source || '').toLowerCase();
    if (/\b(poison|venom|toxin|numb(?:ing)?|sick(?:en|ness)|disease|plague)\b/.test(text)) return 'poison';
    if (/\b(paraly[sz]e|paraly[sz]ed|paralysis|freeze|frozen|lock(?:s|ed)?\s+(?:up|limbs?|body))\b/.test(text)) return 'paralysis';
    if (/\b(bind(?:ing)?|restrain|grapple|pin|immobili[sz]e|snare|net|chain|hold)\b/.test(text)) return 'restraint';
    if (/\b(burn|fire|flame|scorch|sear)\b/.test(text)) return 'burn';
    if (/\b(lightning|shock|electrocut|electric|thunderbolt)\b/.test(text)) return 'electrical';
    if (/\b(blind|darken(?:s)?\s+vision|sight)\b/.test(text)) return 'blindness';
    if (/\b(stun|daze|concuss|ring(?:ing)?\s+ears?)\b/.test(text)) return 'stun';
    if (/\b(fear|panic|terror|horror|terrify)\b/.test(text)) return 'fear';
    if (/\b(curse|hex|afflict)\b/.test(text)) return 'curse';
    if (/\b(exhaust|drain|fatigue|weaken)\b/.test(text)) return 'exhaustion';
    if (/\b(mind|mental|confus|disorient)\b/.test(text)) return 'mental_status';
    return 'physical_injury';
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

function deriveInflictedTargetInjuryFromAggression({ npc, target, proactivityResult, attackType, reactionOutcome, margin, resolutionPacket }) {
    if (!['npc_overpowers', 'npc_succeeds'].includes(reactionOutcome)) return null;
    const source = [
        attackType,
        proactivityResult?.Intent,
        proactivityResult?.Impulse,
        resolutionPacket?.CounterPotential && resolutionPacket.CounterPotential !== 'none'
            ? `counter potential ${resolutionPacket.CounterPotential}`
            : '',
    ].filter(Boolean).join(' ');
    const severity = severityFromAggressionResult(reactionOutcome, margin, resolutionPacket?.CounterPotential);
    const bodyPart = inferAggressionBodyPart(source);
    const injuryKind = aggressionInjuryKind(source);
    const wound = `${severity} ${bodyPart} ${injuryKind}`.replace(/\s+/g, ' ').trim();
    const status = statusFromInflictedInjury(source, bodyPart, severity);
    const targetName = normalizeProactivityTarget(target);
    const targetIsUser = isUserProactivityTarget({ ProactivityTarget: targetName });

    return {
        sourceNpc: npc,
        target: targetName,
        targetType: targetIsUser ? 'user' : 'npc',
        attackType,
        reactionOutcome,
        severity,
        condition: conditionFromInflictedSeverity(severity),
        woundsAdd: [wound],
        statusAdd: status ? [status] : [],
        NarrationRule: targetIsUser
            ? `${npc}'s ${attackType} causes ${wound}; narrate it as a lasting user injury when describing the NPC attack result, and apply later impairment by severity and affected body function.`
            : `${npc}'s ${attackType} causes ${wound} to ${targetName}; narrate it as a lasting NPC injury when describing the NPC attack result, and apply later impairment by severity and affected body function.`,
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

function inferAggressionBodyPart(source) {
    const text = String(source || '').toLowerCase();
    if (/\b(grab|grapple|restrain|boundary_physical)\b/.test(text)) return 'upper body';
    if (/\b(kick|trip|sweep)\b/.test(text)) return 'lower body';
    return 'body';
}

function aggressionInjuryKind(source) {
    const text = String(source || '').toLowerCase();
    if (/\b(grab|grapple|restrain|boundary_physical)\b/.test(text)) return 'strain';
    if (/\b(counter|retaliation|violence|attack)\b/.test(text)) return 'injury';
    return 'bruise';
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

function evaluateNpcAggressionImpairment(npcName, trackerUpdate, trackerSnapshot, proactivityResult) {
    if (!isReal(npcName)) return noNpcImpairment('no NPC named');
    const state = normalizeTrackerEntry(trackerUpdate?.[npcName] || trackerSnapshot?.[npcName] || {});
    const sources = collectImpairmentSources(state, false);
    if (!sources.length) return noNpcImpairment();

    const actionText = [
        proactivityResult?.Intent,
        proactivityResult?.Impulse,
        'attack strike shove grab grapple weapon physical combat',
    ].filter(Boolean).join(' ');
    const actionFunctions = classifyUserActionFunctions(actionText, 'PHY');

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

function evaluateUserDefenseImpairment(ledger, context, resolutionPacket, proactivityResult) {
    const semantic = {
        identifyGoal: resolutionPacket?.GOAL,
        identifyChallenge: [
            'defend evade dodge block brace resist survive avoid counterattack retaliation proactive attack',
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
    return evaluateUserImpairment(ledger, context, semantic, 'DefendAgainstNpcAggression', 'PHY', 'Y');
}

function evaluateNpcDefenseImpairment(npcName, trackerUpdate, trackerSnapshot, proactivityResult) {
    if (!isReal(npcName)) return noNpcImpairment('no NPC defender named');
    const state = normalizeTrackerEntry(trackerUpdate?.[npcName] || trackerSnapshot?.[npcName] || {});
    const sources = collectImpairmentSources(state, false);
    if (!sources.length) return noNpcImpairment();

    const actionText = [
        'defend evade dodge block brace resist survive avoid NPC aggression',
        proactivityResult?.Intent,
        proactivityResult?.Impulse,
    ].filter(Boolean).join(' ');
    const actionFunctions = classifyUserActionFunctions(actionText, 'PHY');

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
    if (userResultDelta) {
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
        mergeNpcResultInjuryDelta(npcs, trackerSnapshot, item?.NPC, item?.injury);
    }

    audit.push('STEP 6.5: EXECUTE TrackerUpdateEngine EXPLICIT DELTAS');
    audit.push(`6.5a user=${compact(user)}`);
    audit.push(`6.5b npcDeltas=${compact((semantic.npcs || []).map(delta => delta.NPC || NONE))}`);
    if (userResultDelta) audit.push(`6.5c deterministicUserInjuryDelta=${compact(userResultDelta)}`);
    if (npcResultDeltas?.length) audit.push(`6.5d deterministicNpcAggressionInjuryDeltas=${compact(npcResultDeltas)}`);
    audit.push('---');

    return { user, npcs };
}

function applyTrackerDeltaToState(before, delta, includePlayerFields) {
    const source = includePlayerFields
        ? normalizeTrackerUserState(before)
        : normalizeTrackerEntry(before);
    const result = {
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
            ProactivityTarget: NONE,
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
            const proactivityTarget = proactivityGuard ? NONE : deriveProactivityTarget(handoff, resolutionPacket, intent);
            const targetsUser = isUserProactivityTarget({ ProactivityTarget: proactivityTarget }) ? 'Y' : 'N';
            candidates.push({ NPC: handoff.NPC, die: 20, tier, intent, impulse, ProactivityTarget: proactivityTarget, TargetsUser: targetsUser, Threshold: 'AUTO', passes: 'Y' });
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
            const proactivityTarget = proactivityGuard ? NONE : deriveProactivityTarget(handoff, resolutionPacket, intent);
            const targetsUser = isUserProactivityTarget({ ProactivityTarget: proactivityTarget }) ? 'Y' : 'N';
            candidates.push({ NPC: handoff.NPC, die, tier, intent, impulse, ProactivityTarget: proactivityTarget, TargetsUser: targetsUser, Threshold: threshold, passes });
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
        };
    }

    audit.push(`6.8 FINAL_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results };
}

function normalizeProactivityTarget(value) {
    const text = String(value || '').trim();
    if (!text || ['none', '(none)', 'null', 'n/a'].includes(text.toLowerCase())) return NONE;
    if (text === USER_PROACTIVITY_TARGET) return USER_PROACTIVITY_TARGET;
    if (/^\{\{\s*user\s*\}\}$/i.test(text)) return USER_PROACTIVITY_TARGET;
    if (/^(?:user|player|protagonist|you|yourself)$/i.test(text)) return USER_PROACTIVITY_TARGET;
    return text;
}

function isUserProactivityTarget(result) {
    return normalizeProactivityTarget(result?.ProactivityTarget) === USER_PROACTIVITY_TARGET
        || result?.TargetsUser === 'Y';
}

function isNpcProactivityTarget(result) {
    const target = normalizeProactivityTarget(result?.ProactivityTarget);
    return isReal(target) && target !== USER_PROACTIVITY_TARGET;
}

function hasAggressionProactivityTarget(result) {
    return isUserProactivityTarget(result) || isNpcProactivityTarget(result);
}

function deriveProactivityTarget(handoff, resolutionPacket, intent) {
    if (!isImmediateAttackIntent(intent)) return NONE;
    const relation = handoff?.RelationToUserAction || relationToUserAction(handoff?.NPC, resolutionPacket);
    if (relation?.isOpp || relation?.isDirect || relation?.isHarmed) return USER_PROACTIVITY_TARGET;
    const harmed = firstReal(resolutionPacket?.HarmedObservers);
    if (isReal(harmed) && !sameName(harmed, handoff?.NPC)) return harmed;
    return USER_PROACTIVITY_TARGET;
}

function runAggression(ledger, trackerSnapshot, trackerUpdate, proactivityResults, resolutionPacket, dice, audit, context) {
    const userCore = getUserCoreStats(ledger);
    const counterPotential = resolutionPacket?.CounterPotential || 'none';
    const counterAllowed = ['light', 'medium', 'severe'].includes(counterPotential);
    const counterBonus = counterBonusFromPotential(counterPotential);
    const criticalSuccess = resolutionPacket?.OutcomeTier === 'Critical_Success';
    const retaliationAllowed = resolutionPacket?.classifyHostilePhysicalIntent === 'Y';
    const proactiveAttackAllowed = Object.values(proactivityResults || {}).some(result =>
        result?.Proactive === 'Y'
        && hasAggressionProactivityTarget(result)
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
        && hasAggressionProactivityTarget(result)
        && isImmediateAttackIntentForType(result.Intent, attackType));
    const counterTarget = counterAllowed ? firstReal(resolutionPacket?.OppTargets?.NPC) || firstReal(resolutionPacket?.ActionTargets) : null;
    const aggressive = counterAllowed && !criticalSuccess && counterTarget
        ? [proactiveAggressive.find(([npc]) => sameName(npc, counterTarget)) || [counterTarget, {
            Proactive: 'Y',
            Intent: 'BOUNDARY_PHYSICAL',
            Impulse: 'ANGER',
            ProactivityTarget: USER_PROACTIVITY_TARGET,
            TargetsUser: 'Y',
            ProactivityTier: 'FORCED',
            ProactivityDie: 20,
            Threshold: 'AUTO',
        }]]
        : proactiveAggressive;
    const results = {};
    let userTrackerDelta = null;
    const npcTrackerDeltas = [];

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
        return { results, userTrackerDelta, npcTrackerDeltas };
    }

    audit.push(`7.3 getUserCoreStats=${compact(userCore)}`);

    for (const [npc, proactivityResult] of aggressive) {
        const target = normalizeProactivityTarget(proactivityResult?.ProactivityTarget || USER_PROACTIVITY_TARGET);
        const targetIsUser = target === USER_PROACTIVITY_TARGET;
        const npcCore = normalizeCore(trackerUpdate[npc]?.currentCoreStats || trackerSnapshot[npc]?.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 });
        const npcImpairment = evaluateNpcAggressionImpairment(npc, trackerUpdate, trackerSnapshot, proactivityResult);
        const npcImpairmentPenalty = Number(npcImpairment?.AppliedToRoll === 'Y' ? npcImpairment.RollPenalty : 0);
        const targetImpairment = targetIsUser
            ? evaluateUserDefenseImpairment(ledger, context, resolutionPacket, proactivityResult)
            : evaluateNpcDefenseImpairment(target, trackerUpdate, trackerSnapshot, proactivityResult);
        const targetImpairmentPenalty = Number(targetImpairment?.AppliedToRoll === 'Y' ? targetImpairment.RollPenalty : 0);
        const defenderCore = targetIsUser
            ? userCore
            : normalizeCore(trackerUpdate[target]?.currentCoreStats || trackerSnapshot[target]?.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 });
        const npcDie = dice.d20();
        const defenderDie = dice.d20();
        const npcTotal = npcDie + npcCore.PHY + counterBonus + npcImpairmentPenalty;
        const defenderTotal = defenderDie + statValue(defenderCore, 'PHY') + targetImpairmentPenalty;
        const margin = npcTotal - defenderTotal;
        const ReactionOutcome = aggressionReactionOutcome(margin);
        const inflictedTargetInjury = deriveInflictedTargetInjuryFromAggression({
            npc,
            target,
            proactivityResult,
            attackType,
            reactionOutcome: ReactionOutcome,
            margin,
            resolutionPacket,
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
        results[npc] = { AttackType: attackType, AttackIntent: proactivityResult.Intent, ProactivityTarget: target, CounterPotential: counterPotential, CounterBonus: counterBonus, ReactionOutcome, Margin: margin, NPCImpairment: npcImpairment, UserImpairment: targetIsUser ? targetImpairment : null, TargetImpairment: targetImpairment, InflictedUserInjury: inflictedUserInjury || null, InflictedTargetInjury: inflictedTargetInjury || null };
        audit.push(`7.5 ${npc}.npcCore=${compact(npcCore)}`);
        audit.push(`7.5d ${npc}.NPCImpairmentEngine=${compact(npcImpairment)}`);
        audit.push(`7.5e npcTotal=${npcDie}+${npcCore.PHY}+${counterBonus}${npcImpairmentPenalty ? `+impairment(${npcImpairmentPenalty})` : ''}=${npcTotal}`);
        audit.push(`7.5f ${npc}.TargetDefenseImpairmentEngine=${compact(targetImpairment)}`);
        audit.push(`7.5g targetTotal=${defenderDie}+${statValue(defenderCore, 'PHY')}${targetImpairmentPenalty ? `+impairment(${targetImpairmentPenalty})` : ''}=${defenderTotal}`);
        audit.push(`7.5h ${npc}.InflictedUserInjury=${compact(inflictedUserInjury || {})}`);
        audit.push(`7.5i ${npc}.InflictedTargetInjury=${compact(inflictedTargetInjury || {})}`);
        audit.push(`7.5j ${npc}.ProactivityTarget=${target}`);
        audit.push(`7.6 AGGRESSION_RESULT=${compact(results[npc])}`);
    }

    audit.push(`7.7 AGGRESSION_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results, userTrackerDelta, npcTrackerDeltas };
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
    if (isPureVerbalIntimacyPermissionRequest(source)) return false;
    return /\b(i|user|{{user}})\s+(?:try|tries|tried|attempt|attempts|attempted|lean|leans|leaned|move|moves|moved|reach|reaches|reached|press|presses|pressed|pull|pulls|pulled|grab|grabs|grabbed|touch|touches|touched|kiss|kisses|kissed|cup|cups|cupped|caress|caresses|caressed|grope|gropes|groped)\b/.test(source)
        && /\b(kiss|lips|mouth|touch|hold|embrace|body|waist|chin|face|cheek|neck|hair|hand|caress|grope|undress|clothes|shirt|dress|skirt|underwear)\b/.test(source);
}

function isPureVerbalIntimacyPermissionRequest(source) {
    const text = String(source || '').toLowerCase();
    const hasContactAction = /\b(i|user|{{user}})\s+(?:try|tries|tried|attempt|attempts|attempted|lean|leans|leaned|move|moves|moved|reach|reaches|reached|press|presses|pressed|pull|pulls|pulled|grab|grabs|grabbed|touch|touches|touched|kiss|kisses|kissed|cup|cups|cupped|caress|caresses|caressed|grope|gropes|groped)\b/.test(text)
        && !/\b(?:can|could|may|might|would)\s+i\s+(?:kiss|touch|hold|embrace|sleep with|caress|grope)\b/.test(text);
    const hasPermissionRequest = /\b(?:i\s+ask|i\s+request|i\s+say|i\s+whisper|i\s+tell|can\s+i|could\s+i|may\s+i|would\s+you\s+let\s+me|will\s+you\s+let\s+me|do\s+you\s+want\s+me\s+to|would\s+you\s+like\s+me\s+to)\b.{0,120}\b(?:kiss|touch|hold|embrace|sleep with|sex|intimacy|intimate|bed|caress)\b/.test(text);
    return hasPermissionRequest && !hasContactAction;
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
