import assert from 'node:assert/strict';
import fs from 'node:fs';
import { consumeLatentFavorById, latentFavorIds, latentGrievanceIds, mergeLatentFavorArchive, mergeLatentGrievanceArchive, mergeUserReputationLedger, pruneLatentFavorArchive, rankForCapabilityPool, renameLatentFavorTargets, renameLatentGrievanceTargets, resolveLatentFavorIds, resolveLatentGrievanceIds, runDeterministicEngines, saveTrackerUpdate, verifyLatentFavorPresentation } from './deterministic-runner.js';
import { ENGINE_PROMPT_TEXT, aggressionReactionOutcome, applyPendingBoundaryDelta, buildPersistencePolicy, deriveDirection, finalizeLootSearchCompletion, hasMagicStoneEntry, normalizeDisposition, normalizePendingBoundaryState, normalizeTrackerUserState, reconcileLootPossessionTransfers, reconcileUserEquipmentTiers, sanitizeAggressionResultsForTrackerModel, sanitizeTrackerUserStateForModel, standingConstrainedAttackGuard, updateDisposition } from './engines.js';
import { buildIsekaiOpeningSeed, formatAdventureIntroNarratorModelPromptContext, formatNarratorModelPromptContext, formatNarratorPromptContext } from './pre-flight.js';
import { deterministicPersonalitySummaryForName, stripPersonalityMannerismFields, TRACKER_DELTA_CONTRACT, TRACKER_DELTA_TEMPLATE } from './tracker-delta-contract.js';
import { applyContextualInjuryCapsToTrackerDelta, collectContextualInjuryCaps, formatContextualInjuryCapsForPrompt } from './tracker-injury-caps.js';
import { applyStreamingArtifactDisplayRegex, buildStreamingArtifactRegexScript } from './streaming-artifact-regex.js';
import { getExplicitNamePromotions, isPromotableTrackerName } from './tracker-name-promotions.js';
import { sanitizeAssistantNarration, stripComputedDebugPrefix } from './narration-sanitizer.js';
import { applySemanticThinkingPayload, applyStoryEngineThinkingDisabledPayload, buildSemanticToolChoice, buildSemanticToolPrompt, normalizeSemanticReasoningEffort, parseNarratorTrackerDelta, sanitizeSemanticAssembledText } from './semantic-extractor.js';
import { applyWorldStateDelta, formatWorldStateForDisplay, normalizeWorldState } from './world-state.js';
import { applyCurrencyDelta, applyEconomyDelta, buildDeterministicLootEnvelope, equipmentDefenseBonusForTier, equipmentTierForCurrencyAmount, getNpcLootRankProfile, isProtectiveEquipmentItem, mergePendingPricePaymentCurrencyRemove, getEconomyProfileForGenre, normalizeCurrencyList, normalizeEconomyDelta, normalizeEconomyState, resolveEquipmentDefense } from './economy.js';
import { applyHiddenHealthEvents } from './health-state.js';
import { assertValidCharacterSheet, CHARACTER_SHEET_HEADINGS } from './character-sheet-validation.js';
import { appendCharacterSheetOutputInstruction, buildCharacterSheetJsonSchema, buildCharacterSheetSchema, buildCharacterSheetTool, buildCharacterSheetToolChoice, extractCharacterSheetToolPayload, getCharacterSheetPowerProfile, normalizeCharacterSheetPayload, parseCharacterSheetJsonPayload, renderCharacterSheet, shouldRetryCharacterSheetToolFailure } from './character-sheet-generation.js';
import { createAsyncTokenGate, createEphemeralStopController } from './ephemeral-stop-controller.js';
import { applyProseGuardSentenceRepairs, collectProseGuardSentenceFindings, parseProseGuardRepairPayload, PROSE_GUARD_EDITS_END, PROSE_GUARD_EDITS_START } from './prose-guard-edits.js';

const stakeKeys = [
  'no_roll',
  'success',
  'failure',
  'dominant_impact',
  'solid_impact',
  'light_impact',
  'struggle',
  'checked',
  'deflected',
  'avoided',
];

const emptyUserDelta = () => ({
  condition: 'unchanged',
  woundsAdd: [],
  woundsRemove: [],
  statusAdd: [],
  statusRemove: [],
  gearAdd: [],
  gearRemove: [],
  inventoryAdd: [],
  inventoryRemove: [],
  currencyAdd: [],
  currencyRemove: [],
  tasksAdd: [],
  tasksRemove: [],
  commitmentsAdd: [],
  commitmentsRemove: [],
});

const emptyStakeMap = value => Object.fromEntries(stakeKeys.map(key => [key, value ?? 'none']));

function validCharacterSheet({ stats = { PHY: 8, MND: 7, CHA: 9 }, race = 'Elf', premise = 'The character died on Earth and was reincarnated in another world.' } = {}) {
  const bodies = {
    'BASIC INFO': `**Name:** {{user}}\n**Race:** ${race}\n**Age:** 18`,
    APPEARANCE: '**Build:** Athletic',
    STATS: `**PHY:** ${stats.PHY}\n**MND:** ${stats.MND}\n**CHA:** ${stats.CHA}`,
    'NATURAL WEAPONS': '- None',
    ABILITIES: '- **Focused Step:** Cross a short unstable surface with deliberate balance.',
    SPELLS: '- None',
    INVENTORY: '- Rope',
    CURRENCY: '- 12 sv',
    GEAR: '- Travel clothes',
    'CHARACTER ANCHORS': `- ${premise}`,
  };
  return CHARACTER_SHEET_HEADINGS.map(heading => `# ${heading}\n${bodies[heading]}`).join('\n\n');
}

function structuredCharacterSheetPayload(overrides = {}) {
  return {
    basicInfo: {
      race: 'Elf',
      userNonHuman: 'Y',
      gender: 'Woman',
      age: 24,
      bloodline: '',
      origin: 'A mountain trade town',
      priorRoleOrTraining: 'Courier training',
      ...(overrides.basicInfo || {}),
    },
    appearance: [{ label: 'Build', detail: 'Broad-shouldered and athletic' }],
    naturalWeapons: [],
    abilities: [{ name: 'Wayfold', description: 'Opens a temporary passage between two visible doorways.' }],
    spells: [{ name: 'Mend Flesh', description: 'Closes a fresh wound beneath the caster\'s hand.' }],
    inventory: ['Rope', 'Travel rations'],
    currency: ['12 sv'],
    gear: ['Travel clothes', 'Walking boots'],
    characterAnchors: ['Worked as a courier before the adventure began.'],
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'basicInfo')),
  };
}

const emptySlowBondEvidence = () => ({
  respectfulContact: false,
  cooperation: false,
  comfortInProximity: false,
  boundaryRespect: false,
  sharedRoutine: false,
  playfulness: false,
  teamwork: false,
  personalAttention: false,
  blockers: [],
});

function relationship(NPC, extra = {}) {
  return {
    NPC,
    initPreset: {
      romanticOpen: false,
      userBadRep: false,
      priorUserGoodRep: false,
      userNonHuman: false,
      fearImmunity: false,
      ...(extra.initPreset || {}),
    },
    auditInteraction: false,
    establishedRelationship: false,
    romanceStyle: 'auto',
    slowBondEvidence: {
      ...emptySlowBondEvidence(),
      ...(extra.slowBondEvidence || {}),
    },
    explicitIntimidationOrCoercion: false,
    standingInfluence: 'none',
    standingBasis: '(none)',
    stakeChangeByOutcome: emptyStakeMap('none'),
    overrideFlags: {
      CurrentInvitation: false,
      Exploitation: false,
      Hedonist: false,
      Transactional: false,
      Established: false,
      RomanticBuildup: false,
      ...(extra.overrideFlags || {}),
    },
    genStats: {
      CapabilityPool: 'common',
      MainStat: 'Balanced',
      ...(extra.genStats || {}),
    },
    ...extra,
  };
}

function actionUnitsForTest(actionCount = ['a1']) {
  const markers = Array.isArray(actionCount) && actionCount.length ? actionCount : ['a1'];
  return markers.slice(0, 3).map((marker, index) => ({
    id: `A${index + 1}`,
    action: String(marker || `a${index + 1}`),
    evidence: '(none)',
  }));
}

function baseLedger(overrides = {}) {
  const resolutionOverrides = overrides.resolutionEngine || {};
  const defaultActionCount = Array.isArray(resolutionOverrides.actionCount)
    ? resolutionOverrides.actionCount
    : ['a1'];
  const defaultActionUnits = Array.isArray(resolutionOverrides.actionUnits)
    ? resolutionOverrides.actionUnits
    : actionUnitsForTest(defaultActionCount);
  return {
    engineContext: {
      userCoreStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 6, MND: 6, CHA: 6 },
      trackerRelevantNPCs: [],
      ...(overrides.engineContext || {}),
    },
    resolutionEngine: {
      identifyGoal: 'Normal_Interaction',
      identifyChallenge: 'ordinary conversation',
      explicitMeans: 'ordinary conversation',
      userAbilityUse: {
        used: false,
        attempted: false,
        available: false,
        abilityName: '(none)',
        evidence: '(none)',
        narrativeEffect: '(none)',
        noEffectReason: '(none)',
        mechanicalScope: 'flavor_only_no_bonus',
      },
      itemUse: {
        attempted: false,
        available: false,
        item: '(none)',
        source: 'none',
        evidence: '(none)',
        noEffectReason: '(none)',
      },
      lootSearch: {
        attempted: false,
        target: '(none)',
        targetKind: 'other',
        evidence: '(none)',
      },
      claimCheck: {
        present: false,
        claim: '(none)',
        targetNPC: '(none)',
        truthStatus: 'none',
        npcAccess: 'none',
        stakesImpact: false,
        reason: '(none)',
      },
      identifyTargets: {
        hostilesInScene: { NPC: [] },
        ActionTargets: [],
        OppTargets: { NPC: [], ENV: [] },
        BenefitedObservers: [],
        HarmedObservers: [],
        NPCAwareOfUser: [],
        PowerActors: [],
      },
      intimacyAdvanceExplicit: false,
      restraintControl: {
        present: false,
        targetNPC: '(none)',
        evidence: '(none)',
      },
      boundaryPressure: {
        present: false,
        type: 'none',
        targetNPC: '(none)',
        objectOrAccess: '(none)',
        evidence: '(none)',
      },
      boundaryBreak: {
        present: false,
        targetNPC: '(none)',
        type: 'none',
        response: 'none',
        evidence: '(none)',
      },
      rollNeeded: false,
      rollReason: '(none)',
      challengeType: 'none',
      challengeTypeEvidence: 'test fixture',
      socialTactic: 'none',
      actionCount: defaultActionCount,
      actionUnits: defaultActionUnits,
      environmentDifficulty: 0,
      environmentDifficultyTier: 'none',
      activeHostileThreat: false,
      genStats: { CapabilityPool: 'common', MainStat: 'Balanced' },
      ...resolutionOverrides,
    },
    relationshipEngine: overrides.relationshipEngine || [],
    injuryEffectEngine: {
      effects: [],
      ...(overrides.injuryEffectEngine || {}),
    },
    userKnowledgeApplication: {
      applications: [],
      ...(overrides.userKnowledgeApplication || {}),
    },
    powerActorEnmity: {
      assessments: [],
      effects: [],
      latentGrievances: [],
      affiliationLinks: [],
      latentFavors: [],
      favorAffiliationLinks: [],
      ...(overrides.powerActorEnmity || {}),
    },
    powerEventShape: {
      events: [],
      ...(overrides.powerEventShape || {}),
    },
    trackerUpdateEngine: {
      user: emptyUserDelta(),
      npcs: [],
      boundCompanion: {
        status: 'unchanged',
        name: null,
        type: null,
        vessel: null,
        voice: null,
        evidence: null,
      },
      pendingBoundary: {
        status: 'unchanged',
        targetNPC: null,
        type: null,
        objectOrAccess: null,
        evidence: null,
      },
      ...(overrides.trackerUpdateEngine || {}),
    },
    chaosSemantic: { sceneSummary: overrides.sceneSummary || '' },
    ...(overrides.nameSemantic ? { nameSemantic: overrides.nameSemantic } : {}),
    proactivitySemantic: {},
  };
}

function trackerEntry(overrides = {}) {
  return {
    currentDisposition: { B: 2, F: 2, H: 2 },
    currentRapport: 0,
    lastRapportGainActiveMs: -1,
    establishedRelationship: 'N',
    userHistory: { knowsUser: 'N', standing: 'neutral' },
    raceProfile: { race: '', category: 'unknown', fearProfile: 'normal' },
    personalitySummary: '',
    slowBondEvidence: {
      respectfulContact: 0,
      cooperation: 0,
      comfortInProximity: 0,
      boundaryRespect: 0,
      sharedRoutine: 0,
      playfulness: 0,
      teamwork: 0,
      personalAttention: 0,
      blockers: [],
      lastUpdatedScene: '',
    },
    proactivityMemory: {
      interchangeCount: 0,
      romanceCycle: 0,
      romanceBlocked: 'N',
      pendingTag: 'NONE',
      pendingSince: 0,
      acceptedTags: [],
      refusedTags: [],
      partnerMeaningfulCooldownUntilActiveMs: 0,
      lastMeaningfulPartnerTag: 'NONE',
      cooldowns: {
        Thoughtful_Gift: 0,
        Ask_Date: 0,
        Partner_Date: 0,
        Partner_Gift: 0,
        Partner_Conflict: 0,
      },
    },
    currentCoreStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 5, MND: 5, CHA: 5 },
    hostilePressure: 0,
    hostileLandedPressure: 0,
    dominantLock: 'None',
    pressureMode: 'none',
    intimacyState: { boundary: 'NONE', source: 'NONE', refusalStyle: 'NONE' },
    lifecycle: 'Active',
    condition: 'healthy',
    wounds: [],
    statusEffects: [],
    gear: [],
    inventory: [],
    currency: [],
    lootSearchCompleted: false,
    ...overrides,
  };
}

function latentGrievance(overrides = {}) {
  return {
    version: 1,
    id: 'lg_test_cale_cart',
    target: 'Cale',
    actionUnitId: 'A1',
    explicitlyCompleted: true,
    effect: 'harm_assets',
    severity: 'meaningful',
    reason: 'User destroyed Cale\'s trade cart and stock',
    evidence: 'The user smashed the cart and burned its stock',
    attributionPath: 'Cale witnessed the destruction',
    createdAt: 100,
    ...overrides,
  };
}

function latentFavor(overrides = {}) {
  return {
    version: 1,
    id: 'lf_test_cale_rescue',
    target: 'Cale',
    actionUnitId: 'A1',
    explicitlyCompleted: true,
    benefit: 'rescue_or_protect',
    severity: 'meaningful',
    reason: 'User rescued Cale from the flooded ford without asking payment',
    evidence: 'The user pulled Cale from the flood and refused compensation',
    uncompensated: true,
    beyondExpectedDuty: true,
    attributionPath: 'Cale witnessed and can report the rescue',
    createdAt: 100,
    ...overrides,
  };
}

function ordinaryPowerAssessment(actor = 'Cale') {
  return {
    actor,
    scope: 'individual',
    isPowerActor: false,
    actorType: 'ordinary trader',
    reach: [],
    evidence: `${actor} is presented only as an ordinary local trader`,
    assessmentReason: 'no established reach beyond personal action',
  };
}

function linkedPowerAssessment(actor = 'Ash Gate Company') {
  return {
    actor,
    scope: 'organization',
    isPowerActor: true,
    actorType: 'merchant company',
    reach: ['caravan guards', 'regional trade contacts'],
    evidence: `${actor} is an established regional merchant company`,
    assessmentReason: 'the company has agents and resources beyond personal action',
  };
}

function affiliationLink(overrides = {}) {
  return {
    grievanceId: 'lg_test_cale_cart',
    target: 'Cale',
    powerActor: 'Ash Gate Company',
    actorType: 'merchant company',
    hasReach: true,
    affiliationEvidence: 'Cale is explicitly identified as an Ash Gate Company factor',
    knownToActor: true,
    knowledgeEvidence: 'Cale filed a named loss report with the company',
    ...overrides,
  };
}

function favorAffiliationLink(overrides = {}) {
  return {
    favorId: 'lf_test_cale_rescue',
    target: 'Cale',
    powerActor: 'Ash Gate Company',
    actorType: 'merchant company',
    hasReach: true,
    affiliationEvidence: 'Cale is explicitly identified as an Ash Gate Company factor',
    knownToActor: true,
    knowledgeEvidence: 'Cale reported the rescue to the company',
    knownToUser: true,
    userKnowledgeEvidence: 'Cale previously introduced himself to the user as an Ash Gate Company factor',
    fit: 'use_now',
    fitEvidence: 'The current calm conversation can naturally receive a company message',
    ...overrides,
  };
}

function context(latestUserText = '', tracker = {}, user = {}, persona = 'PHY: 6\nMND: 6\nCHA: 6', chat = null, rapportClock = {}, cardFields = {}, powerActors = {}, latentGrievances = [], latentFavors = []) {
  return {
    chat: chat || (latestUserText ? [{ is_user: true, mes: latestUserText }] : []),
    name1: cardFields.name1 || 'Aelemar',
    structuredPreflightSettings: cardFields.structuredPreflightSettings || {},
    extensionSettings: cardFields.extensionSettings || {},
    chatMetadata: {
      structuredPreflightTracker: {
        npcs: tracker,
        user,
        health: cardFields.health || { seed: 'test-health-seed' },
        rapportClock,
        powerActors,
        latentGrievances,
        latentFavors,
        boundCompanion: cardFields.boundCompanion || {},
        pendingBoundary: cardFields.pendingBoundary || {},
        snapshots: {},
        userReputation: cardFields.userReputation || {},
      },
    },
    getCharacterCardFields() {
      return { persona, ...cardFields };
    },
  };
}

function withDice(dice, fn) {
  const oldRandom = Math.random;
  let index = 0;
  Math.random = () => {
    const die = dice[index++] ?? 10;
    return (Math.max(1, Math.min(20, die)) - 0.5) / 20;
  };
  try {
    return fn();
  } finally {
    Math.random = oldRandom;
  }
}

function runCase(config) {
  return withDice(config.dice || [10, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], () =>
    runDeterministicEngines(
      config.ledger,
      config.tracker || {},
      context(config.userText || '', config.tracker || {}, config.userState || {}, config.persona, config.chat || null, config.rapportClock || {}, config.cardFields || {}, config.powerActors || {}, config.latentGrievances || [], config.latentFavors || []),
      'normal',
    ),
  );
}

function prompt(report) {
  return formatNarratorModelPromptContext(report);
}

function auditPrompt(report) {
  return formatNarratorPromptContext(report);
}

function auditIncludes(report, text) {
  return report.auditLines.some(line => line.includes(text));
}

function nthRandomForDie(die, sides) {
  return (Math.max(1, Math.min(sides, die)) - 0.5) / sides;
}

function runCaseWithRandoms(config, randoms) {
  const oldRandom = Math.random;
  let index = 0;
  Math.random = () => randoms[index++] ?? nthRandomForDie(10, 20);
  try {
    return runDeterministicEngines(
      config.ledger,
      config.tracker || {},
      context(config.userText || '', config.tracker || {}, config.userState || {}, config.persona, null, config.rapportClock || {}, config.cardFields || {}, config.powerActors || {}, config.latentGrievances || [], config.latentFavors || []),
      'normal',
    );
  } finally {
    Math.random = oldRandom;
  }
}

const tests = [
  {
    name: '00 relationship disposition invariants normalize trust and locks',
    run() {
      assert.deepEqual(updateDisposition({ B: 2, F: 2, H: 2 }, { b: 1, f: 0, h: 0 }), { B: 3, F: 2, H: 2 });
      assert.deepEqual(updateDisposition({ B: 3, F: 1, H: 1 }, { b: 1, f: 1, h: 1 }), { B: 4, F: 2, H: 2 });
      assert.deepEqual(normalizeDisposition({ B: 3, F: 2, H: 2 }), { B: 3, F: 2, H: 2 });
      assert.deepEqual(normalizeDisposition({ B: 4, F: 2, H: 2 }), { B: 4, F: 2, H: 2 });
      assert.deepEqual(normalizeDisposition({ B: 3, F: 3, H: 2 }), { B: 1, F: 3, H: 2 });
      assert.deepEqual(normalizeDisposition('B4/F2/H2'), { B: 4, F: 2, H: 2 });
    },
  },
  {
    name: '00a unknown standing has no behavioral effect',
    run() {
      const tracker = { Servant: trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 } }) };
      const report = runCase({
        userText: 'I greet the servant.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'greet the servant',
            identifyChallenge: 'ordinary greeting',
            explicitMeans: 'greet the servant',
            identifyTargets: { ActionTargets: ['Servant'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Servant')],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(handoff.StandingInfluence, 'none');
      assert.equal(handoff.StandingBasis, '(none)');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Servant.Proactive, 'Y');
      assert.doesNotMatch(prompt(report), /The standing this NPC recognizes in \{\{user\}\}/);
    },
  },
  {
    name: '00b constrained hostile servant cannot spontaneously attack user',
    run() {
      const tracker = { Servant: trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 } }) };
      const report = runCase({
        userText: 'I greet the servant.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'greet the servant',
            identifyChallenge: 'ordinary greeting',
            explicitMeans: 'greet the servant',
            identifyTargets: { ActionTargets: ['Servant'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Servant', {
            standingInfluence: 'constrained',
            standingBasis: 'The servant recognizes {{user}} as the reigning monarch and their employer.',
          })],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      const modelPrompt = prompt(report);
      const mechanicsAudit = auditPrompt(report);
      assert.equal(handoff.StandingInfluence, 'constrained');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Servant.Proactive, 'N');
      assert.deepEqual(report.finalNarrativeHandoff.aggressionResults, {});
      assert.equal(auditIncludes(report, 'standing_constrained_unsolicited_user_attack'), true);
      assert.match(modelPrompt, /The standing this NPC recognizes in \{\{user\}\} limits reckless action/);
      assert.doesNotMatch(modelPrompt, /StandingInfluence|standingInfluence/);
      assert.match(mechanicsAudit, /standingInfluence=constrained/);
      assert.match(mechanicsAudit, /StandingInfluence=constrained/);
    },
  },
  {
    name: '00c affectionate NPC receives standing-aware behavior guidance',
    run() {
      const tracker = {
        Consort: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 }, establishedRelationship: 'Y' }),
      };
      const report = runCase({
        userText: 'I ask the consort how the council meeting went.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask about the council meeting',
            identifyChallenge: 'ordinary conversation',
            explicitMeans: 'ask the consort about the council meeting',
            identifyTargets: { ActionTargets: ['Consort'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Consort', {
            establishedRelationship: true,
            standingInfluence: 'aware',
            standingBasis: 'The consort recognizes {{user}} as sovereign during official council business.',
          })],
        }),
      });
      const modelPrompt = prompt(report);
      assert.match(modelPrompt, /close or deeply trusting/);
      assert.match(modelPrompt, /The standing this NPC recognizes in \{\{user\}\} should affect etiquette, caution, risk, or openness/);
      assert.doesNotMatch(modelPrompt, /standingInfluence/);
    },
  },
  {
    name: '00d B3 familiarity softens standing protocol',
    run() {
      const tracker = { Captain: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I ask the captain about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask about the road ahead',
            identifyChallenge: 'ordinary conversation',
            explicitMeans: 'ask the captain',
            identifyTargets: { ActionTargets: ['Captain'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Captain', {
            standingInfluence: 'aware',
            standingBasis: 'The captain knows {{user}} commands the expedition.',
          })],
        }),
      });
      assert.match(prompt(report), /Familiarity softens protocol; use stronger formality mainly in public, official, or consequential moments/);
    },
  },
  {
    name: '00e B4 standing guidance prevents routine stiffness',
    run() {
      const tracker = { Queen: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I ask the queen whether she wants breakfast.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask the queen about breakfast',
            identifyChallenge: 'ordinary private conversation',
            explicitMeans: 'ask about breakfast',
            identifyTargets: { ActionTargets: ['Queen'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Queen', {
            standingInfluence: 'constrained',
            standingBasis: 'The queen recognizes {{user}} as king and co-ruler.',
          })],
        }),
      });
      assert.match(prompt(report), /Deep familiarity prevents routine stiffness; keep duty, authority, or public protocol only where it materially matters/);
    },
  },
  {
    name: '00f constrained standing preserves defensive and established-combat responses',
    run() {
      const handoff = {
        NPC: 'Servant',
        StandingInfluence: 'constrained',
        RelationToUserAction: { isDirect: true, isOpp: true, isHarmed: false },
      };
      const candidate = {
        intent: 'ESCALATE_VIOLENCE',
        ProactivityTarget: '{{user}}',
        TargetsUser: 'Y',
      };
      const basePacket = {
        RollNeeded: 'N',
        challengeType: 'none',
        harmMode: 'none',
        CounterPotential: 'none',
        classifyCombatActionSequence: 'N',
        activeHostileThreat: 'N',
        ActionTargets: ['Servant'],
        OppTargets: { NPC: [], ENV: [] },
        HarmedObservers: [],
        hostilesInScene: { NPC: [] },
        restraintControl: { Present: 'N', TargetNPC: '(none)' },
        boundaryPressure: { Present: 'N', TargetNPC: '(none)' },
        boundaryBreak: { Present: 'N', TargetNPC: '(none)' },
      };
      assert.equal(standingConstrainedAttackGuard(handoff, {
        ...basePacket,
        RollNeeded: 'Y',
        challengeType: 'mundane_combat',
        harmMode: 'nonlethal',
        classifyCombatActionSequence: 'Y',
        OppTargets: { NPC: ['Servant'], ENV: [] },
      }, candidate), null);
      assert.equal(standingConstrainedAttackGuard(handoff, {
        ...basePacket,
        CounterPotential: 'light',
        OppTargets: { NPC: ['Servant'], ENV: [] },
      }, candidate), null);
      assert.equal(standingConstrainedAttackGuard(handoff, {
        ...basePacket,
        restraintControl: { Present: 'Y', TargetNPC: 'Servant' },
      }, candidate), null);
      assert.equal(standingConstrainedAttackGuard({
        ...handoff,
        RelationToUserAction: { isDirect: false, isOpp: false, isHarmed: false },
      }, {
        ...basePacket,
        classifyCombatActionSequence: 'Y',
        activeHostileThreat: 'Y',
        ActionTargets: [],
        hostilesInScene: { NPC: ['Servant'] },
      }, candidate), null);
    },
  },
  {
    name: '00g constrained standing never suppresses NPC-versus-NPC attacks',
    run() {
      const result = standingConstrainedAttackGuard({
        NPC: 'Guard',
        StandingInfluence: 'constrained',
        RelationToUserAction: {},
      }, {
        RollNeeded: 'N',
        CounterPotential: 'none',
        classifyCombatActionSequence: 'N',
        activeHostileThreat: 'N',
        ActionTargets: [],
        OppTargets: { NPC: [], ENV: [] },
        HarmedObservers: [],
        hostilesInScene: { NPC: [] },
      }, {
        intent: 'ESCALATE_VIOLENCE',
        ProactivityTarget: 'Assassin',
        TargetsUser: 'N',
      });
      assert.equal(result, null);
    },
  },
  {
    name: '01 I love you stays no-stakes social',
    run() {
      const report = runCase({
        userText: 'I look at Seraphina and say, "I love you."',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'I say I love you',
            explicitMeans: 'I say I love you',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.GOAL, 'Normal_Interaction');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
    },
  },
  {
    name: '01a pure love declaration is hard-forced no-roll even when semantic marks stakes',
    run() {
      const tracker = { Valerie: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: '"I love you too" I say, without looking at her.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'Express love to Valerie verbally',
            explicitMeans: 'I love you too',
            identifyTargets: { ActionTargets: ['Valerie'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Valerie', {
            stakeChangeByOutcome: {
              ...emptyStakeMap('none'),
              success: 'harm',
              light_impact: 'harm',
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.Outcome, 'no_roll');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LandedActions, '(none)');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].FinalState, 'B4/F1/H1');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(auditIncludes(report, 'hard_override_pure_love_declaration_no_roll'), true);
    },
  },
  {
    name: '01b asking to kiss is no-roll when no boundary was violated',
    run() {
      const tracker = { Valerie: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I say, "I love you. Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Valerie for a kiss',
            identifyChallenge: 'I love you and ask if I can kiss Valerie',
            explicitMeans: 'I love you. Can I kiss you?',
            identifyTargets: { ActionTargets: ['Valerie'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Valerie')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.intimacyAdvanceExplicit, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyRefusalStyle, 'SOFT');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.Outcome, 'no_roll');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.match(prompt(report), /Valerie: Intimacy: DENIED/);
      assert.match(prompt(report), /This denial is a boundary for later turns, not a relationship punishment by itself/);
      assert.equal(auditIncludes(report, 'hard_override_romance_conversation_no_roll'), true);
    },
  },
  {
    name: '02 flirt response to NPC tease is ordinary scene continuity',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: '"What distractions did you have in mind?" I ask Seraphina with a teasing smile.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'tease Seraphina back',
            identifyChallenge: 'ask what distractions Seraphina had in mind',
            explicitMeans: 'teasing question',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: false,
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'SKIP');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].FinalState, 'B3/F1/H1');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
    },
  },
  {
    name: '02b B4 suggestive banter is capped below intimacy without allow path',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCaseWithRandoms({
        userText: 'I keep my voice low and say, "I wonder how tight it is."',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'suggestive banter with Seraphina',
            explicitMeans: 'suggestive innuendo',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: false,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
      ]);
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      const modelPrompt = prompt(report);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.intimacyAdvanceExplicit, 'N');
      assert.equal(handoff.EstablishedRelationship, 'N');
      assert.equal(handoff.IntimacyBoundary, 'SKIP');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Seraphina.Proactive, 'N');
      assert.match(modelPrompt, /Conversation alone is NOT permission for intimate escalation/);
      assert.match(modelPrompt, /Seraphina: Intimacy: NOT ALLOWED/);
      assert.match(modelPrompt, /secluded-intimacy setup/);
      assert.match(modelPrompt, /undressing or exposure/);
    },
  },
  {
    name: '02c proactivity cannot bypass no-permission intimacy guard',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'ask Naomi what she wants to show',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '',
          resolutionPacket: {
            GOAL: 'Normal_Interaction',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            RollNeeded: 'N',
            LandedActions: '(none)',
            OutcomeTier: 'No_Roll',
            Outcome: 'no_roll',
            CounterPotential: 'none',
            activeHostileThreat: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: [] },
            ActionTargets: ['Naomi'],
            OppTargets: { NPC: [], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Naomi'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Naomi',
            FinalState: 'B3/F1/H1',
            Behavior: 'FRIENDLY',
            Target: 'No Change',
            NPC_STAKES: 'N',
            Landed: 'N',
            IntimacyBoundary: 'SKIP',
            IntimacyBoundarySource: 'NONE',
            IntimacyRefusalStyle: 'NONE',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Naomi: {
              Proactive: 'Y',
              Intent: 'PLAN_OR_BANTER',
              Impulse: 'BOND',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {},
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const modelPrompt = prompt(report);
      assert.match(modelPrompt, /include this NPC initiative/i);
      assert.match(modelPrompt, /Naomi: Intimacy: NOT ALLOWED/);
      assert.match(modelPrompt, /Conversation alone is NOT permission for intimate escalation/);
      assert.match(modelPrompt, /sexual contact/);
      assert.match(modelPrompt, /undressing or exposure/);
      assert.match(modelPrompt, /consent-by-momentum/);
      assert.match(modelPrompt, /romantic\/intimate relationship acceptance/);
    },
  },
  {
    name: '02a persona-name pure love declaration is hard-forced no-roll',
    run() {
      const tracker = { Valerie: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: '"I love Aelemar too" I say, without looking at her.',
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'Express love to Valerie verbally by saying I love Aelemar too',
            explicitMeans: 'I love Aelemar too',
            identifyTargets: { ActionTargets: ['Valerie'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Valerie')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.Outcome, 'no_roll');
      assert.equal(auditIncludes(report, 'hard_override_pure_love_declaration_no_roll'), true);
    },
  },
  {
    name: '03 physical affection without refusal is not converted into a roll',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I put my arms around Seraphina and kiss her softly.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'kiss Seraphina softly',
            identifyChallenge: 'kiss Seraphina softly',
            explicitMeans: 'put arms around Seraphina and kiss her softly',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LandedActions, '(none)');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyRefusalStyle, 'SOFT');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].FinalState, 'B4/F1/H1');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
    },
  },
  {
    name: '04 established relationship permits intimacy without a roll',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 }, establishedRelationship: 'Y' }) };
      const report = runCase({
        userText: 'I kiss Seraphina good morning and ask how she slept.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'kiss Seraphina good morning',
            identifyChallenge: 'kiss Seraphina good morning',
            explicitMeans: 'kiss Seraphina good morning',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'ESTABLISHED_RELATIONSHIP');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
    },
  },
  {
    name: '04a fear or hostility lock denies intimacy despite established relationship',
    run() {
      for (const [label, disposition, style] of [
        ['fear', { B: 1, F: 3, H: 1 }, 'FEARFUL'],
        ['hostility', { B: 1, F: 1, H: 3 }, 'HOSTILE'],
      ]) {
        const tracker = { Seraphina: trackerEntry({ currentDisposition: disposition, establishedRelationship: 'Y' }) };
        const report = runCase({
          userText: `I try to kiss Seraphina despite the ${label} between us.`,
          tracker,
          ledger: baseLedger({
            resolutionEngine: {
              identifyGoal: 'kiss Seraphina',
              identifyChallenge: 'kiss Seraphina',
              explicitMeans: 'try to kiss Seraphina',
              identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
              intimacyAdvanceExplicit: true,
              rollNeeded: false,
            },
            relationshipEngine: [relationship('Seraphina')],
          }),
        });
        assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
        assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
        assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'LOCKED_DISPOSITION');
        assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyRefusalStyle, style);
        assert.match(prompt(report), /Existing relationship history does not grant intimacy while the NPC is currently fear-led or hostility-led/);
      }
    },
  },
  {
    name: '05 NPC confession accepted by user establishes relationship at B4',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit beside Seraphina and wait.' },
          { is_user: false, mes: 'Seraphina takes your hand. "I love you. I want us to be together."' },
          { is_user: true, mes: 'I put my arms around her waist, pull her against me, and kiss her.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Seraphina confession with a kiss',
            identifyChallenge: 'accept Seraphina confession with a kiss',
            explicitMeans: 'put arms around Seraphina, pull her against me, and kiss her',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'ESTABLISHED_RELATIONSHIP');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
    },
  },
  {
    name: '06 user confession accepted by NPC establishes relationship at B4',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I tell Seraphina, "I love you. I want us to be together."' },
          { is_user: false, mes: 'Seraphina grips your hands. "Yes. I love you too."' },
          { is_user: true, mes: 'I ask Seraphina how she wants to spend the evening.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Seraphina about the evening',
            identifyChallenge: 'ask Seraphina about the evening',
            explicitMeans: 'ask Seraphina how she wants to spend the evening',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: false,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
    },
  },
  {
    name: '06a macro-expanded persona name in NPC confession establishes relationship',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit beside Seraphina and wait.' },
          { is_user: false, mes: 'Seraphina takes your hand. "Aelemar, I love you. Will Aelemar be mine?"' },
          { is_user: true, mes: 'I put my arms around her waist, pull her against me, and kiss her.' },
        ],
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Seraphina confession with a kiss',
            identifyChallenge: 'accept Seraphina confession with a kiss',
            explicitMeans: 'put arms around Seraphina, pull her against me, and kiss her',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
    },
  },
  {
    name: '06b macro-expanded persona name in user confession accepted by NPC establishes relationship',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I tell Seraphina, "I love Aelemar? No. I mean I love you, and I want us together."' },
          { is_user: false, mes: 'Seraphina grips your hands. "Yes. I choose Aelemar too."' },
          { is_user: true, mes: 'I ask Seraphina how she wants to spend the evening.' },
        ],
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Seraphina about the evening',
            identifyChallenge: 'ask Seraphina about the evening',
            explicitMeans: 'ask Seraphina how she wants to spend the evening',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: false,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
    },
  },
  {
    name: '07 B4 romantic context permits natural physical affection without establishing relationship',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit beside Seraphina and smile.' },
          { is_user: false, mes: 'Seraphina smiles back and stays close by the fire.' },
          { is_user: true, mes: 'I put my arms around her waist, pull her against me, and kiss her.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'kiss Seraphina without established relationship',
            identifyChallenge: 'kiss Seraphina without established relationship',
            explicitMeans: 'put arms around Seraphina, pull her against me, and kiss her',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            overrideFlags: { RomanticBuildup: true },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'B4_ROMANTIC_CONTEXT');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
    },
  },
  {
    name: '07a.0 B4 warmth alone does not permit intimacy without semantic romantic buildup',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit beside Seraphina and smile.' },
          { is_user: false, mes: 'Seraphina smiles back and stays close by the fire.' },
          { is_user: true, mes: 'I put my arms around her waist, pull her against me, and kiss her.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'kiss Seraphina without established relationship',
            identifyChallenge: 'kiss Seraphina without established relationship',
            explicitMeans: 'put arms around Seraphina, pull her against me, and kiss her',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'NONE');
    },
  },
  {
    name: '07a pushing after refusal triggers boundary violation and hostility',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'After Seraphina says no and pulls away, I keep pressuring her to kiss me anyway.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'pressure Seraphina after refusal',
            identifyChallenge: 'keep pressuring Seraphina to kiss me after she said no',
            explicitMeans: 'pressure after refusal',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: ['Seraphina'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryBreak: {
              present: true,
              boundaryId: 'pb_test_seraphina_refusal',
              targetNPC: 'Seraphina',
              type: 'intimacy',
              response: 'continued',
              evidence: 'Seraphina says no and the user keeps pressuring her',
            },
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'intimidate',
          },
          relationshipEngine: [relationship('Seraphina', {
            stakeChangeByOutcome: {
              ...emptyStakeMap('none'),
              success: 'harm',
              light_impact: 'harm',
              solid_impact: 'harm',
              dominant_impact: 'harm',
            },
          })],
        }),
        cardFields: {
          pendingBoundary: {
            active: true,
            boundaryId: 'pb_test_seraphina_refusal',
            targetNPC: 'Seraphina',
            type: 'intimacy',
            objectOrAccess: 'kiss refusal',
            evidence: 'Seraphina says no and pulls away',
            warnings: 2,
          },
        },
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.boundaryBreak.Present, 'Y');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Hostility');
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 3, F: 1, H: 2 });
    },
  },
  {
    name: '07a.1 B2 intimacy ask is denied clearly without relationship penalty',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }) };
      const report = runCase({
        userText: 'I ask Mira, "Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyRefusalStyle, 'CLEAR');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Mira.currentDisposition.B, 2);
      assert.match(prompt(report), /clear, direct, practical, or reserved/);
    },
  },
  {
    name: '07a.2 hostility tunes intimacy denial hostile without a roll',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 2, F: 1, H: 3 } }) };
      const report = runCase({
        userText: 'I ask Mira, "Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyRefusalStyle, 'HOSTILE');
      assert.match(prompt(report), /firm, angry, suspicious, contemptuous, or openly resistant/);
    },
  },
  {
    name: '07a.3 override permits intimacy without established relationship',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 2, F: 1, H: 2 } }) };
      const report = runCase({
        userText: 'I ask Mira if she wants to come to bed with me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira to come to bed',
            identifyChallenge: 'ask Mira to come to bed',
            explicitMeans: 'ask Mira if she wants to come to bed with me',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira', {
            overrideFlags: { Hedonist: true },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'OVERRIDE:Hedonist');
      assert.match(prompt(report), /the NPC has the Hedonist override/);
    },
  },
  {
    name: '07a.3a current invitation override permits explicit NPC offer follow-through',
    run() {
      const tracker = { Naomi: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I say yes and move closer to Naomi.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Naomi sexual invitation',
            identifyChallenge: 'accept Naomi sexual invitation',
            explicitMeans: 'say yes and move closer to Naomi',
            identifyTargets: { ActionTargets: ['Naomi'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Naomi', {
            overrideFlags: { CurrentInvitation: true },
          })],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(handoff.Override, 'CurrentInvitation');
      assert.equal(handoff.IntimacyBoundary, 'ALLOW');
      assert.equal(handoff.IntimacyBoundarySource, 'OVERRIDE:CurrentInvitation');
      assert.match(prompt(report), /clearly offered, requested, invited, strongly implied, or physically initiated/);
      assert.match(prompt(report), /Do not block, reverse, panic, or deny intimate follow-through/);
      assert.doesNotMatch(prompt(report), /no intimacy permission is active for Naomi/);
    },
  },
  {
    name: '07a.3b exploitation override permits intimacy without established relationship',
    run() {
      const tracker = { Naomi: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I ask Naomi if she wants to come to bed with me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Naomi to come to bed',
            identifyChallenge: 'ask Naomi to come to bed',
            explicitMeans: 'ask Naomi if she wants to come to bed with me',
            identifyTargets: { ActionTargets: ['Naomi'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Naomi', {
            overrideFlags: { Exploitation: true },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Override, 'Exploitation');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'OVERRIDE:Exploitation');
      assert.match(prompt(report), /the NPC has the Exploitation override/);
      assert.doesNotMatch(prompt(report), /no intimacy permission is active for Naomi/);
    },
  },
  {
    name: '07a.3bb current invitation has priority over background override flags',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I accept Mira and pull her closer.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Mira intimate invitation',
            identifyChallenge: 'accept Mira intimate invitation',
            explicitMeans: 'accept Mira and pull her closer',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira', {
            overrideFlags: { CurrentInvitation: true, Hedonist: true, Established: true },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Override, 'CurrentInvitation');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'OVERRIDE:CurrentInvitation');
    },
  },
  {
    name: '07a.3c established override permits receptive prior intimacy without relationship',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 }, establishedRelationship: 'N' }) };
      const report = runCase({
        userText: 'I ask Mira if she wants to come to bed with me again.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira to come to bed again',
            identifyChallenge: 'ask Mira to come to bed again',
            explicitMeans: 'ask Mira if she wants to come to bed with me again',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira', {
            overrideFlags: { Established: true },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Override, 'Established');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'OVERRIDE:Established');
      assert.match(prompt(report), /the NPC has the Established override/);
      assert.doesNotMatch(prompt(report), /no intimacy permission is active for Mira/);
    },
  },
  {
    name: '07a.3d prior intimacy without current receptivity remains denied',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 }, establishedRelationship: 'N' }) };
      const report = runCase({
        userText: 'I ask Mira if she wants to come to bed with me again.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira to come to bed again',
            identifyChallenge: 'ask Mira to come to bed again',
            explicitMeans: 'ask Mira if she wants to come to bed with me again',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Override, 'NONE');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.match(prompt(report), /Mira: Intimacy: DENIED/);
      assert.match(prompt(report), /This denial is a boundary for later turns/);
    },
  },
  {
    name: '07a.3e withdrawn invitation remains denied without active override',
    run() {
      const tracker = { Naomi: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 }, establishedRelationship: 'N' }) };
      const report = runCase({
        userText: 'I move closer to Naomi anyway.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'move closer to Naomi after withdrawal',
            identifyChallenge: 'move closer to Naomi after withdrawal',
            explicitMeans: 'move closer to Naomi anyway',
            identifyTargets: { ActionTargets: ['Naomi'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Naomi')],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(handoff.Override, 'NONE');
      assert.equal(handoff.IntimacyBoundary, 'DENY');
      assert.match(prompt(report), /Naomi: Intimacy: DENIED/);
      assert.match(prompt(report), /This denial is a boundary for later turns/);
    },
  },
  {
    name: '07a.4 NPC-initiated intimacy permits user reciprocation',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit with Seraphina by the fire.' },
          { is_user: false, mes: 'Seraphina leans closer, cheeks pink. "Can I kiss you?"' },
          { is_user: true, mes: 'I nod and kiss her back softly.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Seraphina kiss',
            identifyChallenge: 'kiss Seraphina back softly',
            explicitMeans: 'nod and kiss her back softly',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'NPC_INITIATED');
    },
  },
  {
    name: '07a.4b NPC-initiated intimacy toward persona name permits user reciprocation',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit with Seraphina by the fire.' },
          { is_user: false, mes: 'Seraphina leans closer, cheeks pink. "Can I kiss Aelemar?"' },
          { is_user: true, mes: 'I nod and kiss her back softly.' },
        ],
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Seraphina kiss',
            identifyChallenge: 'kiss Seraphina back softly',
            explicitMeans: 'nod and kiss her back softly',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'NPC_INITIATED');
    },
  },
  {
    name: '07a.4b.1 explicit NPC willingness permits user follow-through',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit with Mira in the quiet room.' },
          { is_user: false, mes: 'Mira stays close. "I am willing to do anything and everything you want."' },
          { is_user: true, mes: 'I kiss Mira and pull her closer.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'kiss Mira after her explicit willingness',
            identifyChallenge: 'kiss Mira after her explicit willingness',
            explicitMeans: 'kiss Mira and pull her closer',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(handoff.IntimacyBoundary, 'ALLOW');
      assert.equal(handoff.IntimacyBoundarySource, 'NPC_WILLINGNESS');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.intimacyState, { boundary: 'ALLOW', source: 'NPC_WILLINGNESS', refusalStyle: 'NONE' });
    },
  },
  {
    name: '07a.4c stored intimacy allow persists until a material boundary change',
    run() {
      const tracker = {
        Mira: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          intimacyState: { boundary: 'ALLOW', source: 'NPC_INITIATED', refusalStyle: 'NONE' },
        }),
      };
      const report = runCase({
        userText: 'I kiss Mira again.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'kiss Mira again',
            identifyChallenge: 'kiss Mira again',
            explicitMeans: 'kiss Mira again',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: true,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(handoff.IntimacyBoundary, 'ALLOW');
      assert.equal(handoff.IntimacyBoundarySource, 'PERSISTED:NPC_INITIATED');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.intimacyState, { boundary: 'ALLOW', source: 'PERSISTED:NPC_INITIATED', refusalStyle: 'NONE' });
      assert.match(prompt(report), /intimacy permission was already established/);
    },
  },
  {
    name: '07a.4d stored intimacy denial persists without active NPC change',
    run() {
      const tracker = {
        Mira: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          intimacyState: { boundary: 'DENY', source: 'NONE', refusalStyle: 'SOFT' },
        }),
      };
      const report = runCase({
        userText: 'I ask Mira if I can kiss her again.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss again',
            identifyChallenge: 'ask Mira for a kiss again',
            explicitMeans: 'ask Mira if I can kiss her again',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: true,
          },
          relationshipEngine: [relationship('Mira', {
            overrideFlags: { Hedonist: true },
          })],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(handoff.IntimacyBoundary, 'DENY');
      assert.equal(handoff.IntimacyBoundarySource, 'PERSISTED_DENY');
      assert.equal(handoff.IntimacyRefusalStyle, 'SOFT');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.intimacyState, { boundary: 'DENY', source: 'PERSISTED_DENY', refusalStyle: 'SOFT' });
      assert.match(prompt(report), /This denial is a boundary for later turns/);
    },
  },
  {
    name: '07a.4d.1 current accepted invitation overrides stored intimacy denial',
    run() {
      const tracker = {
        Mira: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          intimacyState: { boundary: 'DENY', source: 'NONE', refusalStyle: 'SOFT' },
        }),
      };
      const report = runCase({
        userText: 'Mira says yes and agrees to come to bed with me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Mira current intimate agreement',
            identifyChallenge: 'Mira agrees to come to bed',
            explicitMeans: 'Mira says yes and agrees to come to bed with me',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira', {
            overrideFlags: { CurrentInvitation: true },
          })],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(handoff.Override, 'CurrentInvitation');
      assert.equal(handoff.IntimacyBoundary, 'ALLOW');
      assert.equal(handoff.IntimacyBoundarySource, 'OVERRIDE:CurrentInvitation');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.intimacyState, { boundary: 'ALLOW', source: 'OVERRIDE:CurrentInvitation', refusalStyle: 'NONE' });
    },
  },
  {
    name: '07a.4e persona name in target list is removed as player not NPC',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I ask Seraphina to help me.',
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Seraphina for help',
            identifyChallenge: 'ask Seraphina for help',
            explicitMeans: 'ask Seraphina for help',
            identifyTargets: {
              ActionTargets: ['Seraphina', 'Aelemar'],
              OppTargets: { NPC: ['Aelemar'], ENV: [] },
              BenefitedObservers: ['Aelemar'],
              HarmedObservers: [],
            },
            intimacyAdvanceExplicit: false,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Aelemar')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.ActionTargets, ['Seraphina']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.BenefitedObservers, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs.some(item => item.NPC === 'Aelemar'), false);
      assert.equal(auditIncludes(report, 'deterministicUserTargetNormalization'), true);
    },
  },
  {
    name: '07a.5 multi-target intimacy narrator includes every boundary',
    run() {
      const tracker = {
        Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 }, establishedRelationship: 'Y' }),
        Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
      };
      const report = runCase({
        userText: 'I ask Seraphina and Mira, "Can I kiss both of you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Seraphina and Mira for a kiss',
            identifyChallenge: 'ask Seraphina and Mira for a kiss',
            explicitMeans: 'Can I kiss both of you?',
            identifyTargets: { ActionTargets: ['Seraphina', 'Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
        }),
      });
      const seraphina = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Seraphina');
      const mira = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Mira');
      const modelPrompt = prompt(report);
      assert.equal(seraphina?.IntimacyBoundary, 'ALLOW');
      assert.equal(mira?.IntimacyBoundary, 'DENY');
      assert.match(modelPrompt, /Seraphina: Intimacy: ALLOWED/);
      assert.match(modelPrompt, /Mira: Intimacy: DENIED/);
    },
  },
  {
    name: '07a.6 denied intimacy does not force B4 flirt proactivity',
    run() {
      const tracker = {
        Mira: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(22, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I ask Mira, "Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Mira', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Mira;
      const modelPrompt = prompt(report);
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(proactive.RomanceInitiativeTag, '(none)');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.match(modelPrompt, /Mira: Intimacy: DENIED/);
      assert.match(modelPrompt, /Keep this fully compatible with the intimacy denial/);
      assert.doesNotMatch(modelPrompt, /Mira is flirtatious toward/);
    },
  },
  {
    name: '07a.7 denied intimacy blocks date-and-confess proactivity',
    run() {
      const tracker = {
        Mira: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          proactivityMemory: {
            acceptedTags: ['Thoughtful_Gift', 'Ask_Date'],
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I ask Mira, "Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Mira;
      const modelPrompt = prompt(report);
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(proactive.RomanceInitiativeTag, '(none)');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.match(modelPrompt, /Mira: Intimacy: DENIED/);
      assert.doesNotMatch(modelPrompt, /special date|relationship-oriented confession|Date_And_Confess/);
    },
  },
  {
    name: '07a.8 denied intimacy keeps other NPC proactivity guidance',
    run() {
      const tracker = {
        Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }),
      };
      const report = runCase({
        userText: 'I ask Mira, "Can I kiss you?" while Seraphina watches nearby.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira'), relationship('Seraphina')],
        }),
      });
      report.finalNarrativeHandoff.proactivityResults.Seraphina = {
        Proactive: 'Y',
        Intent: 'Thoughtful_Gift',
        Impulse: 'BOND',
        ProactivityTarget: '{{user}}',
        TargetsUser: 'Y',
        RomanceInitiative: 'Y',
        RomanceInitiativeTag: 'Thoughtful_Gift',
        RomanceInitiativeDie: 72,
        RomanceInitiativeContext: 'calm',
      };
      const modelPrompt = prompt(report);
      assert.match(modelPrompt, /Mira: Intimacy: DENIED/);
      assert.match(modelPrompt, /Seraphina offers or prepares a small thoughtful gift/);
    },
  },
  {
    name: '07b bystander does not receive boundary harm from another NPC target',
    run() {
      const tracker = {
        Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }),
        Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
      };
      const report = runCase({
        userText: 'After Seraphina says no, I keep pressuring Seraphina while Mira watches nearby.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'pressure Seraphina after refusal',
            identifyChallenge: 'keep pressuring Seraphina after she said no',
            explicitMeans: 'pressure after refusal',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Seraphina'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            intimacyAdvanceExplicit: true,
            boundaryBreak: {
              present: true,
              boundaryId: 'pb_test_seraphina_bystander',
              targetNPC: 'Seraphina',
              type: 'intimacy',
              response: 'continued',
              evidence: 'Seraphina says no and the user keeps pressuring her',
            },
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'intimidate',
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
        }),
        cardFields: {
          pendingBoundary: {
            active: true,
            boundaryId: 'pb_test_seraphina_bystander',
            targetNPC: 'Seraphina',
            type: 'intimacy',
            objectOrAccess: 'continued pressure after refusal',
            evidence: 'Seraphina says no',
            warnings: 2,
          },
        },
      });
      const seraphina = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Seraphina');
      const mira = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Mira');
      assert.equal(seraphina?.Target, 'Hostility');
      assert.equal(mira, undefined);
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 3, F: 1, H: 2 });
      assert.equal(report.trackerUpdate.npcs.Mira.currentDisposition.H, 2);
    },
  },
  {
    name: '08 slow bond promotes B3 to B4 with two evidence categories',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I settle beside Seraphina by the fire, help mend the strap on her bracer, and keep my hands careful when she shifts closer.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'share quiet care beside the fire',
            identifyChallenge: 'share quiet care beside the fire',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              respectfulContact: true,
              cooperation: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 4);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEvidenceCount, 2);
    },
  },
  {
    name: '09 slow bond does not promote with only one evidence category',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I help Seraphina pack the camp and keep respectful distance.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'help pack camp',
            identifyChallenge: 'help pack camp',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEvidenceCount, 1);
    },
  },
  {
    name: '09a no-stakes friendly interaction can promote B1 to B2 with rapport one',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 1, H: 1 },
          currentRapport: 1,
        }),
      };
      const report = runCase({
        userText: 'I sit with Seraphina and help her sort the camp supplies.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'help Seraphina sort camp supplies',
            identifyChallenge: 'help Seraphina sort camp supplies',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 2);
    },
  },
  {
    name: '09a.1 no-stakes friendly No Change can promote B1 to B2 with rapport one',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 1, H: 1 },
          currentRapport: 1,
        }),
      };
      const report = runCase({
        userText: 'I spend a quiet evening talking with Seraphina about ordinary things.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'talk with Seraphina',
            identifyChallenge: 'talk with Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              blockers: [''],
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 2);
    },
  },
  {
    name: '09b no-stakes friendly interaction can promote B2 to B3 with rapport three',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
          currentRapport: 3,
        }),
      };
      const report = runCase({
        userText: 'I walk beside Seraphina and trade easy jokes while we repair the fence.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'repair the fence with Seraphina',
            identifyChallenge: 'repair the fence with Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
              playfulness: true,
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
    },
  },
  {
    name: '09b.1 no-stakes friendly No Change can promote B2 to B3 with rapport three',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
          currentRapport: 3,
        }),
      };
      const report = runCase({
        userText: 'I keep Seraphina company during the slow watch.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'keep Seraphina company',
            identifyChallenge: 'keep Seraphina company',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              blockers: [''],
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
    },
  },
  {
    name: '09c no-stakes friendly interaction alone does not promote B3 to B4',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I share a quiet meal with Seraphina at the edge of camp.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'share a quiet meal with Seraphina',
            identifyChallenge: 'share a quiet meal with Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              sharedRoutine: true,
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
    },
  },
  {
    name: '09c.1 no-stakes friendly No Change does not promote B3 to B4',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I sit with Seraphina during a quiet stretch of travel.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'sit with Seraphina',
            identifyChallenge: 'sit with Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              blockers: [''],
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
    },
  },
  {
    name: '09d no-stakes friendly interaction is blocked by slow-bond blockers',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 1, H: 1 },
          currentRapport: 1,
        }),
      };
      const report = runCase({
        userText: 'I sit near Seraphina and try to chat after ignoring her boundary.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'chat with Seraphina after ignoring her boundary',
            identifyChallenge: 'chat with Seraphina after ignoring her boundary',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              personalAttention: true,
              blockers: ['boundary violation'],
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 1);
    },
  },
  {
    name: '10 slow bond blocker prevents B4 promotion',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
          slowBondEvidence: {
            respectfulContact: 1,
            cooperation: 1,
            comfortInProximity: 1,
            boundaryRespect: 0,
            sharedRoutine: 0,
            playfulness: 0,
            teamwork: 0,
            personalAttention: 0,
            blockers: ['unresolved harm'],
            lastUpdatedScene: 'previous',
          },
        }),
      };
      const report = runCase({
        userText: 'I sit near Seraphina and apologize, but the wound between us is not resolved.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'sit near Seraphina and apologize',
            identifyChallenge: 'sit near Seraphina and apologize',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              comfortInProximity: true,
              personalAttention: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
    },
  },
  {
    name: '11 slow bond lock prevents B4 promotion',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 3, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I help Seraphina work through the ruined camp quietly.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'help Seraphina work through the ruined camp',
            identifyChallenge: 'help Seraphina work through the ruined camp',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
              teamwork: true,
              personalAttention: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 1);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
    },
  },
  {
    name: '12a per-NPC rapport cooldown blocks before 30 active minutes',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 1,
          lastRapportGainActiveMs: 20 * 60 * 1000,
        }),
      };
      const report = runCase({
        userText: 'I stay beside Seraphina in the same room and ask what she needs help with next.',
        rapportClock: { activeMs: 40 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'ask what Seraphina needs help with first',
            explicitMeans: 'ask what Seraphina needs help with first',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
              boundaryRespect: true,
              personalAttention: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
      assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 20 * 60 * 1000);
      assert.equal(auditIncludes(report, 'rapportEligible=N'), true);
    },
  },
  {
    name: '12b per-NPC rapport cooldown expiry increases rapport on next qualifying interaction',
    run() {
      const realDateNow = Date.now;
      const now = 1700000000000;
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 1,
          lastRapportGainActiveMs: 30 * 60 * 1000,
        }),
      };
      try {
        Date.now = () => now;
        const report = runCase({
          userText: 'I find Seraphina at the edge of camp and ask what she needs help with first.',
          rapportClock: { activeMs: 60 * 60 * 1000, lastActivityAt: now },
          tracker,
          ledger: baseLedger({
            resolutionEngine: {
              identifyGoal: 'Normal_Interaction',
              identifyChallenge: 'ask what Seraphina needs help with first',
              explicitMeans: 'ask what Seraphina needs help with first',
              identifyTargets: {
                ActionTargets: ['Seraphina'],
                OppTargets: { NPC: [], ENV: [] },
                BenefitedObservers: [],
                HarmedObservers: [],
              },
            },
            relationshipEngine: [relationship('Seraphina', {
              slowBondEvidence: {
                cooperation: true,
                boundaryRespect: true,
                personalAttention: true,
              },
            })],
          }),
        });
        assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 2);
        assert.equal(auditIncludes(report, 'rapportEligible=Y'), true);
        assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 60 * 60 * 1000);
      } finally {
        Date.now = realDateNow;
      }
    },
  },
  {
    name: '12c first tracked encounter increases rapport and starts cooldown',
    run() {
      const realDateNow = Date.now;
      const now = 1700000000000;
      try {
        Date.now = () => now;
        const report = runCase({
          userText: 'I step into the glade and greet Seraphina for the first time.',
          rapportClock: { activeMs: 10 * 60 * 1000, lastActivityAt: now },
          ledger: baseLedger({
            resolutionEngine: {
              identifyGoal: 'Normal_Interaction',
              identifyChallenge: 'greet Seraphina for the first time',
              explicitMeans: 'greet Seraphina for the first time',
              identifyTargets: {
                ActionTargets: ['Seraphina'],
                OppTargets: { NPC: [], ENV: [] },
                BenefitedObservers: [],
                HarmedObservers: [],
              },
            },
            relationshipEngine: [relationship('Seraphina')],
          }),
        });
        assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
        assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 10 * 60 * 1000);
        assert.equal(auditIncludes(report, 'firstTrackedEncounter=Y'), true);
        assert.equal(auditIncludes(report, 'rapportEligible=Y'), true);
      } finally {
        Date.now = realDateNow;
      }
    },
  },
  {
    name: '12c.1 rapport gain at zero active time still starts cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 0,
        }),
      };
      const report = runCase({
        userText: 'I greet Seraphina warmly and ask about her morning.',
        rapportClock: { activeMs: 0, lastActivityAt: 0 },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'greet Seraphina warmly',
            explicitMeans: 'greet Seraphina warmly',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
      assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 0);

      const second = runCase({
        userText: 'I keep chatting with Seraphina about the road ahead.',
        rapportClock: { activeMs: 10 * 60 * 1000, lastActivityAt: Date.now() },
        tracker: report.trackerUpdate.npcs,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'chat with Seraphina',
            explicitMeans: 'chat with Seraphina',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(second.trackerUpdate.npcs.Seraphina.currentRapport, 1);
      assert.equal(auditIncludes(second, 'rapportEligible=N'), true);
    },
  },
  {
    name: '12d time-skip wording does not bypass active-play cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 1,
          lastRapportGainActiveMs: 20 * 60 * 1000,
        }),
      };
      const report = runCase({
        userText: 'I tell Seraphina, "I will come back tomorrow morning and help you then."',
        rapportClock: { activeMs: 40 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'promise to return tomorrow morning',
            explicitMeans: 'promise to return tomorrow morning',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
      assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 20 * 60 * 1000);
      assert.equal(auditIncludes(report, 'rapportEligible=N'), true);
    },
  },
  {
    name: '12d.1 active play with another NPC can expire an absent NPC rapport cooldown',
    run() {
      const realDateNow = Date.now;
      const now = 1_700_000_000_000;
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 1,
          lastRapportGainActiveMs: 20 * 60 * 1000,
        }),
        Mara: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 0,
        }),
      };
      Date.now = () => now;
      try {
        const report = runCase({
          userText: 'I leave Seraphina at camp and help Mara sort the supply crates.',
          rapportClock: { activeMs: 50 * 60 * 1000, lastActivityAt: now },
          tracker,
          ledger: baseLedger({
            resolutionEngine: {
              identifyGoal: 'Normal_Interaction',
              identifyChallenge: 'help Mara sort supply crates',
              explicitMeans: 'help Mara sort supply crates',
              identifyTargets: {
                ActionTargets: ['Mara'],
                OppTargets: { NPC: [], ENV: [] },
                BenefitedObservers: [],
                HarmedObservers: [],
              },
            },
            relationshipEngine: [relationship('Mara')],
          }),
        });
        assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
        assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 20 * 60 * 1000);
        assert.equal(report.trackerUpdate.npcs.Mara.lastRapportGainActiveMs, 50 * 60 * 1000);
      } finally {
        Date.now = realDateNow;
      }
    },
  },
  {
    name: '12e F3 rapport recovery works on No Change when rapport reaches five',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 3, H: 2 },
          currentRapport: 4,
          lastRapportGainActiveMs: 30 * 60 * 1000,
        }),
      };
      const report = runCase({
        userText: 'The next morning, I sit near Seraphina and keep quiet company without pushing her.',
        rapportClock: { activeMs: 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'keep quiet company with Seraphina',
            explicitMeans: 'keep quiet company with Seraphina',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 5);
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 1, F: 2, H: 2 });
      assert.equal(auditIncludes(report, '3.4c routeDispositionTarget=No Change'), true);
      assert.equal(auditIncludes(report, '3.5 deriveDirection={"b":0,"f":-1,"h":0}'), true);
    },
  },
  {
    name: '12f F4 rapport recovery helper allows No Change with meaningful benefit',
    run() {
      const deltas = deriveDirection('No Change', { B: 1, F: 4, H: 2 }, 5, 'Y', {
        GOAL: 'Normal_Interaction',
        LandedActions: 0,
      });
      assert.deepEqual(deltas, { b: 0, f: -1, h: 0, rapportReset: 'Y' });
      assert.deepEqual(updateDisposition({ B: 1, F: 4, H: 2 }, deltas), { B: 1, F: 3, H: 2 });
    },
  },
  {
    name: '12g F4 No Change does not recover without meaningful benefit',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 4, H: 2 },
          currentRapport: 5,
          lastRapportGainActiveMs: 30 * 60 * 1000,
        }),
      };
      const report = runCase({
        userText: 'The next morning, I sit near Seraphina and say nothing for a while.',
        rapportClock: { activeMs: 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'sit near Seraphina quietly',
            explicitMeans: 'sit near Seraphina quietly',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 5);
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 1, F: 4, H: 2 });
      assert.equal(auditIncludes(report, '3.4c routeDispositionTarget=No Change'), true);
      assert.equal(auditIncludes(report, '3.5 deriveDirection={"b":0,"f":0,"h":0}'), true);
    },
  },
  {
    name: '12g.1 F4 compliance request is state continuity not a rerolled intimidation contest',
    run() {
      const tracker = {
        Bandit: trackerEntry({
          currentDisposition: { B: 1, F: 4, H: 2 },
          currentRapport: 0,
          dominantLock: 'FEAR',
          pressureMode: 'none',
        }),
      };
      const report = runCase({
        userText: '"Leave now and let the caravan pass," I tell the terrified bandit.',
        dice: [2, 18, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'get the bandit to leave and let the caravan pass',
            identifyChallenge: 'tell the terrified bandit to leave and let the caravan pass',
            explicitMeans: '"Leave now and let the caravan pass"',
            identifyTargets: {
              ActionTargets: ['Bandit'],
              OppTargets: { NPC: ['Bandit'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
            rollReason: 'Bandit is already terrified; leaving/passage follows saved fear state.',
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'intimidate',
          },
          relationshipEngine: [relationship('Bandit', {
            explicitIntimidationOrCoercion: true,
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.Outcome, 'no_roll');
      assert.equal(report.finalNarrativeHandoff.resultLine, 'No roll');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].FinalState, 'B1/F4/H2');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(Object.prototype.hasOwnProperty.call(report.finalNarrativeHandoff.resolutionPacket, 'Stakes' + 'Decision'), false);
      assert.equal(auditIncludes(report, 'semanticRollNeeded=N'), true);
      assert.equal(auditIncludes(report, 'semanticRollReason=Bandit is already terrified'), true);
      assert.equal(auditIncludes(report, 'hard_override_disposition_continuity_no_roll'), false);
    },
  },
  {
    name: '12g.2 F4 pursuit or cornering remains stakes-bearing pressure',
    run() {
      const tracker = {
        Bandit: trackerEntry({
          currentDisposition: { B: 1, F: 4, H: 2 },
          currentRapport: 0,
          dominantLock: 'FEAR',
          pressureMode: 'none',
        }),
      };
      const report = runCase({
        userText: 'I chase the terrified bandit down and cut off his escape so he cannot leave.',
        dice: [2, 18, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'corner the terrified bandit',
            identifyChallenge: 'chase the terrified bandit and cut off his escape',
            explicitMeans: 'chase the terrified bandit down and cut off his escape',
            identifyTargets: {
              ActionTargets: ['Bandit'],
              OppTargets: { NPC: ['Bandit'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Pursuit and blocking escape are new pressure.',
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Bandit')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'Y');
      assert.match(report.finalNarrativeHandoff.resolutionPacket.OutcomeTier, /Failure/);
      assert.notEqual(report.finalNarrativeHandoff.resultLine, 'No roll');
      assert.equal(auditIncludes(report, 'hard_override_disposition_continuity_no_roll'), false);
    },
  },
  {
    name: '12g.2a failed intimidation does not escalate existing fear into terror',
    run() {
      const tracker = {
        Bandit: trackerEntry({
          currentDisposition: { B: 1, F: 3, H: 2 },
          currentRapport: 0,
          dominantLock: 'None',
          pressureMode: 'none',
          currentCoreStats: { Rank: 'Average', MainStat: 'MND', PHY: 3, MND: 5, CHA: 3 },
        }),
      };
      const report = runCase({
        userText: 'I call lightning down beside the bandits and ask if they really want to keep blocking the pass.',
        dice: [1, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'intimidate the bandits into letting the caravan pass',
            identifyChallenge: 'call lightning near the bandits as intimidation',
            explicitMeans: 'call lightning beside the bandits',
            identifyTargets: {
              ActionTargets: ['Bandit'],
              OppTargets: { NPC: ['Bandit'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Fresh unresolved intimidation attempt.',
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'intimidate',
          },
          relationshipEngine: [relationship('Bandit', {
            explicitIntimidationOrCoercion: true,
          })],
        }),
      });

      assert.equal(report.finalNarrativeHandoff.resolutionPacket.Outcome, 'failure');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].FinalState, 'B1/F3/H2');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Lock, 'FREEZE');
      assert.deepEqual(report.trackerUpdate.npcs.Bandit.currentDisposition, { B: 1, F: 3, H: 2 });
      assert.equal(auditIncludes(report, '3.4c routeDispositionTarget=No Change'), true);
      assert.doesNotMatch(prompt(report), /Terror-led|prioritize escape, surrender/);
      assert.match(prompt(report), /attemptedActionResults:\nA1: FAILURE - This action FAILS\. It does NOT land, does NOT take hold, and does NOT produce a completed effect\./);
    },
  },
  {
    name: '12g.3 negative social memory is bucket-specific',
    run() {
      const tracker = {
        Bandit: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          socialResolutionMemory: {
            Bluff: {
              resolved: 'Y',
              outcome: 'failure',
              disposition: 'B2/F2/H2',
              goal: 'talk past the toll',
            },
          },
        }),
      };
      const intimidateReport = runCase({
        userText: '"Drop the toll or bleed," I tell the bandit.',
        dice: [18, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'intimidate the bandit into dropping the toll',
            identifyChallenge: 'threaten the bandit into dropping the toll',
            explicitMeans: '"Drop the toll or bleed"',
            identifyTargets: {
              ActionTargets: ['Bandit'],
              OppTargets: { NPC: ['Bandit'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Fresh intimidation pressure separate from the prior failed bluff.',
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'intimidate',
          },
          relationshipEngine: [relationship('Bandit', { explicitIntimidationOrCoercion: true })],
        }),
      });
      assert.equal(intimidateReport.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'Y');
      assert.equal(intimidateReport.finalNarrativeHandoff.resolutionPacket.socialTactic, 'intimidate');
      assert.equal(auditIncludes(intimidateReport, 'deterministicNegativeSocialRepeat'), false);

      const repeatBluffReport = runCase({
        userText: '"The duke sent me, I swear," I tell the bandit again.',
        dice: [18, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'bluff the bandit into dropping the toll',
            identifyChallenge: 'repeat the duke-sent-me bluff',
            explicitMeans: '"The duke sent me, I swear"',
            identifyTargets: {
              ActionTargets: ['Bandit'],
              OppTargets: { NPC: ['Bandit'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Repeated bluff against the same target.',
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'bluff',
          },
          relationshipEngine: [relationship('Bandit')],
        }),
      });
      assert.equal(repeatBluffReport.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(repeatBluffReport.finalNarrativeHandoff.resolutionPacket.socialTactic, 'none');
      assert.match(repeatBluffReport.finalNarrativeHandoff.resolutionPacket.RollReason, /Bluff already failed/);
      assert.equal(auditIncludes(repeatBluffReport, 'deterministicNegativeSocialRepeat'), true);
    },
  },
  {
    name: '12h B4 calm romance initiative uses style and new ranges',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(22, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.RomanceInitiative, 'Y');
      assert.equal(proactive.Intent, 'Romantic_Flirt');
      assert.equal(proactive.RomanceInitiativeTag, 'Romantic_Flirt');
      assert.equal(proactive.RomanceInitiativeDie, 22);
      assert.equal(proactive.RomanceInitiativeContext, 'calm');
      assert.match(prompt(report), /flirtatious toward/);
      assert.doesNotMatch(prompt(report), /Proactivity Guide|Romantic_Flirt|Seraphina\/Romantic_Flirt/);
    },
  },
  {
    name: '12h.0 B4 calm romance initiative requires 12+ proactivity',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(11, 20),
      ]);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.ProactivityTier, 'HIGH');
      assert.equal(proactive.Threshold, 12);
      assert.equal(proactive.ProactivityDie, 11);
      assert.equal(proactive.Proactive, 'N');
    },
  },
  {
    name: '12h.1 B4 first ask date sets pending and 2h active-time cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(proactive.RomanceInitiativeTag, 'Ask_Date');
      assert.equal(memory.interchangeCount, 1);
      assert.equal(memory.pendingTag, 'Ask_Date');
      assert.equal(memory.pendingSince, 1);
      assert.equal(memory.b4Courtship.askDateAttempts, 1);
      assert.equal(memory.b4Courtship.askDateCooldownUntilActiveMs, 2 * 60 * 60 * 1000);
      assert.equal(auditIncludes(report, 'Seraphina.Ask_Date.secondAttemptCooldown=2h->7200000'), true);
    },
  },
  {
    name: '12h.2 B4 thoughtful gift refusal after one accepted ask date drops bond to B3',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Thoughtful_Gift',
            pendingSince: 1,
            acceptedTags: ['Ask_Date'],
            b4Courtship: {
              askDateAttempts: 2,
              askDateAccepted: 1,
              askDateRefused: 1,
              thoughtfulGiftAttempts: 1,
            },
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(72, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'No thank you, I cannot accept that gift.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'decline Seraphina gift',
            explicitMeans: 'decline the gift',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(memory.pendingTag, 'NONE');
      assert.deepEqual(memory.refusedTags, ['Thoughtful_Gift']);
      assert.equal(memory.b4Courtship.blocked, 'Y');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(auditIncludes(report, 'B4 courtship blocked/refused -> Bond lowered to B3/F1/H1'), true);
    },
  },
  {
    name: '12h.3 B4 date and confess requires accepted gift and date first',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            acceptedTags: ['Thoughtful_Gift'],
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.RomanceInitiativeRawTag, 'Date_And_Confess');
      assert.equal(proactive.RomanceInitiativeTag, 'Romantic_Flirt');
      assert.equal(proactive.RomanceInitiativeMemoryGate, 'Date_And_Confess.requiresGiftAndDateAccepted');
    },
  },
  {
    name: '12h.4 B4 date and confess can fire after one accepted ask date and accepted gift',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            acceptedTags: ['Thoughtful_Gift', 'Ask_Date'],
            b4Courtship: {
              askDateAttempts: 2,
              askDateAccepted: 1,
              askDateRefused: 1,
              thoughtfulGiftAttempts: 1,
              thoughtfulGiftAccepted: 'Y',
            },
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(proactive.RomanceInitiativeTag, 'Date_And_Confess');
      assert.equal(memory.pendingTag, 'Date_And_Confess');
      assert.equal(memory.pendingSince, 1);
    },
  },
  {
    name: '12h.5 refused date and confess lowers B4 to B3 and blocks branch until rebuilt',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          currentRapport: 4,
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 2,
            pendingTag: 'Date_And_Confess',
            pendingSince: 2,
            acceptedTags: ['Thoughtful_Gift', 'Ask_Date'],
            b4Courtship: {
              askDateAttempts: 2,
              askDateAccepted: 1,
              askDateRefused: 1,
              thoughtfulGiftAttempts: 1,
              thoughtfulGiftAccepted: 'Y',
            },
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(72, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'No. I do not want a relationship with you like that.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'refuse Seraphina confession',
            explicitMeans: 'refuse the relationship confession',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const state = report.trackerUpdate.npcs.Seraphina;
      assert.equal(state.currentDisposition.B, 3);
      assert.equal(state.currentRapport, 0);
      assert.equal(state.proactivityMemory.romanceBlocked, 'Y');
      assert.deepEqual(state.proactivityMemory.refusedTags, ['Date_And_Confess']);
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(auditIncludes(report, 'B4 courtship blocked/refused -> Bond lowered to B3/F1/H1'), true);
    },
  },
  {
    name: '12h.6 B4 first ask date refusal allows second ask after cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Ask_Date',
            pendingSince: 1,
            b4Courtship: {
              askDateAttempts: 1,
              askDateCooldownUntilActiveMs: 2 * 60 * 60 * 1000,
            },
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'No, I do not want to go on a date with you.',
        rapportClock: { activeMs: 3 * 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'refuse Seraphina date invitation',
            explicitMeans: 'refuse the date',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(memory.pendingTag, 'Ask_Date');
      assert.deepEqual(memory.refusedTags, ['Ask_Date']);
      assert.equal(memory.b4Courtship.askDateAttempts, 2);
      assert.equal(memory.b4Courtship.askDateRefused, 1);
      assert.equal(proactive.RomanceInitiativeRawTag, 'Ask_Date');
      assert.equal(proactive.RomanceInitiativeTag, 'Ask_Date');
    },
  },
  {
    name: '12h.6a B4 thoughtful gift cannot fire before two ask dates and one acceptance',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            b4Courtship: {
              askDateAttempts: 1,
              askDateAccepted: 1,
            },
          },
        }),
      };
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(72, 100),
      ]);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.RomanceInitiativeRawTag, 'Thoughtful_Gift');
      assert.equal(proactive.RomanceInitiativeTag, 'Romantic_Flirt');
      assert.equal(proactive.RomanceInitiativeMemoryGate, 'Thoughtful_Gift.requiresTwoAskDatesAccepted');
    },
  },
  {
    name: '12h.6b B4 date and confess can fire after two accepted ask dates',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            b4Courtship: {
              askDateAttempts: 2,
              askDateAccepted: 2,
            },
          },
        }),
      };
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ]);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.RomanceInitiativeTag, 'Date_And_Confess');
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.pendingTag, 'Date_And_Confess');
    },
  },
  {
    name: '12h.7 generic refusal does not resolve multiple pending NPC offers',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Ask_Date',
            pendingSince: 1,
          },
        }),
        Mira: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Thoughtful_Gift',
            pendingSince: 1,
          },
        }),
      };
      const report = runCase({
        userText: 'No thank you.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'give a generic refusal',
            explicitMeans: 'No thank you.',
            identifyTargets: {
              ActionTargets: ['Seraphina', 'Mira'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.pendingTag, 'Ask_Date');
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.proactivityMemory.refusedTags, []);
      assert.equal(report.trackerUpdate.npcs.Mira.proactivityMemory.pendingTag, 'Thoughtful_Gift');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.proactivityMemory.refusedTags, []);
    },
  },
  {
    name: '12h.7a ask date guidance stays non-intimate',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(7, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const modelPrompt = prompt(report);
      assert.equal(proactive.RomanceInitiativeTag, 'Ask_Date');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
      assert.match(modelPrompt, /non-intimate romantic date/);
      assert.match(modelPrompt, /public or ordinary plan/);
      assert.match(modelPrompt, /Do not frame this as secluded sexual privacy/);
    },
  },
  {
    name: '12h.8 named refusal resolves only that NPC pending offer',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Ask_Date',
            pendingSince: 1,
          },
        }),
        Mira: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Thoughtful_Gift',
            pendingSince: 1,
          },
        }),
      };
      const report = runCase({
        userText: 'No, Seraphina, I do not want to go on a date with you.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'refuse Seraphina date invitation',
            explicitMeans: 'No, Seraphina, I do not want to go on a date with you.',
            identifyTargets: {
              ActionTargets: ['Seraphina', 'Mira'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.pendingTag, 'NONE');
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.proactivityMemory.refusedTags, ['Ask_Date']);
      assert.equal(report.trackerUpdate.npcs.Mira.proactivityMemory.pendingTag, 'Thoughtful_Gift');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.proactivityMemory.refusedTags, []);
    },
  },
  {
    name: '12i B4 active scene blocks romance initiative',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I work with Seraphina to force open the sealed gate.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OpenGate',
            identifyChallenge: 'force open the sealed gate',
            explicitMeans: 'force open the sealed gate',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['sealed gate'] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'N');
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(proactive.RomanceInitiativeTag, '(none)');
      assert.doesNotMatch(prompt(report), /focused romantic attention/);
      assert.doesNotMatch(prompt(report), /Romantic_Attention|Proactivity Guide/);
    },
  },
  {
    name: '12i.1 ENV difficulty adds to environmental opposition roll and narrator branch',
    run() {
      const report = runCase({
        userText: 'I force open the reinforced sealed gate.',
        dice: [10, 10, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OpenGate',
            identifyChallenge: 'force open the reinforced sealed gate',
            explicitMeans: 'force open the reinforced sealed gate',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['reinforced sealed gate'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            environmentDifficulty: 8,
          },
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.EnvironmentDifficulty, 8);
      assert.equal(packet.Outcome, 'failure');
      assert.match(report.finalNarrativeHandoff.resultLine, /1d20\(10\) \+ PHY\(6\) = 16 vs 1d20\(10\) \+ ENV\(8\) = 18/);
      assert.match(prompt(report), /The relevant environmental obstacle is reinforced sealed gate\. Treat it as a hard obstacle/);
      assert.match(auditPrompt(report), /resolution\.EnvironmentDifficulty: OppTargets\.ENV=reinforced sealed gate; difficulty=Hard\/8/);
    },
  },
  {
    name: '12i.2 ENV difficulty zero keeps ordinary environmental roll readable',
    run() {
      const report = runCase({
        userText: 'I shove the loose gate open.',
        dice: [10, 10, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OpenGate',
            identifyChallenge: 'shove the loose gate open',
            explicitMeans: 'shove the loose gate open',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['loose gate'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            environmentDifficulty: 0,
          },
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.EnvironmentDifficulty, 0);
      assert.equal(packet.Outcome, 'success');
      assert.match(report.finalNarrativeHandoff.resultLine, /1d20\(10\) \+ PHY\(6\) = 16 vs 1d20\(10\) \+ ENV\(0\) = 10/);
      assert.match(prompt(report), /The relevant environmental obstacle is loose gate\. Treat it as a simple or low-resistance obstacle/);
    },
  },
  {
    name: '12i.3 ENV difficulty is ignored for living opposition rolls',
    run() {
      const report = runCase({
        userText: 'I shove past the guard.',
        dice: [10, 10, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry({ currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 3, CHA: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'GetPastGuard',
            identifyChallenge: 'shove past the guard',
            explicitMeans: 'shove past the guard',
            identifyTargets: {
              ActionTargets: ['Guard'],
              OppTargets: { NPC: ['Guard'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            environmentDifficulty: 12,
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.EnvironmentDifficulty, 0);
      assert.doesNotMatch(report.finalNarrativeHandoff.resultLine, /ENV\(12\)/);
      assert.match(report.finalNarrativeHandoff.resultLine, /vs 1d20\(10\) \+ PHY\(5\) = 15/);
      assert.doesNotMatch(prompt(report), /Environment branch:/);
    },
  },
  {
    name: '12i.4 stealth contest rolls against followed NPC awareness, not ENV',
    run() {
      const report = runCase({
        userText: 'I follow Phoebe quietly through the woods.',
        dice: [12, 7, 1, 1, 1, 1],
        tracker: {
          Phoebe: trackerEntry({ currentCoreStats: { Rank: 'Trained', MainStat: 'MND', PHY: 4, MND: 8, CHA: 5 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FollowPhoebeQuietly',
            identifyChallenge: 'follow Phoebe quietly through the woods',
            explicitMeans: 'follow Phoebe quietly through the woods',
            identifyTargets: {
              ActionTargets: ['Phoebe'],
              OppTargets: { NPC: [], ENV: ['woods'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Following Phoebe quietly creates risk of being detected by Phoebe.',
            challengeType: 'stealth',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            environmentDifficulty: 8,
          },
          relationshipEngine: [relationship('Phoebe')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(packet.ActionTargets, ['Phoebe']);
      assert.deepEqual(packet.OppTargets.NPC, ['Phoebe']);
      assert.deepEqual(packet.OppTargets.ENV, ['(none)']);
      assert.equal(packet.EnvironmentDifficulty, 0);
      assert.match(report.finalNarrativeHandoff.resultLine, /1d20\(12\) \+ PHY\(6\) = 18 vs 1d20\(7\) \+ MND\(8\) = 15/);
      assert.equal(auditIncludes(report, 'deterministicStealthRepair'), true);
      assert.equal(auditIncludes(report, 'stealthStats=PHY vs MND'), true);
      assert.doesNotMatch(prompt(report), /Environment branch:/);
    },
  },
  {
    name: '12i.5 stealth contest without semantic living detector cancels roll instead of recovering by keyword',
    run() {
      const report = runCase({
        userText: 'I follow Phoebe quietly through the woods.',
        dice: [12, 7, 1, 1, 1, 1],
        tracker: {
          Phoebe: trackerEntry({ currentCoreStats: { Rank: 'Trained', MainStat: 'MND', PHY: 4, MND: 8, CHA: 5 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FollowPhoebeQuietly',
            identifyChallenge: 'follow Phoebe quietly through the woods',
            explicitMeans: 'follow Phoebe quietly through the woods',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['woods'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Following Phoebe quietly creates risk of being detected by Phoebe.',
            challengeType: 'stealth',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            environmentDifficulty: 8,
          },
          relationshipEngine: [relationship('Phoebe')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'N');
      assert.equal(packet.challengeType, 'none');
      assert.deepEqual(packet.ActionTargets, ['(none)']);
      assert.deepEqual(packet.OppTargets.NPC, ['(none)']);
      assert.deepEqual(packet.OppTargets.ENV, ['(none)']);
      assert.equal(packet.EnvironmentDifficulty, 0);
      assert.equal(auditIncludes(report, 'deterministicStealthNoVisibleDetectorNoRoll'), true);
      assert.doesNotMatch(report.finalNarrativeHandoff.resultLine, /MND\(8\)|ENV/);
    },
  },
  {
    name: '12i.5a semantic stealth contest target repairs to NPC awareness',
    run() {
      const report = runCase({
        userText: 'I move quietly behind Phoebe through the woods.',
        dice: [12, 7, 1, 1, 1, 1],
        tracker: {
          Phoebe: trackerEntry({ currentCoreStats: { Rank: 'Trained', MainStat: 'MND', PHY: 4, MND: 8, CHA: 5 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'MoveQuietlyBehindPhoebe',
            identifyChallenge: 'move quietly behind Phoebe through the woods',
            explicitMeans: 'move quietly behind Phoebe through the woods',
            identifyTargets: {
              ActionTargets: ['Phoebe'],
              OppTargets: { NPC: [], ENV: ['woods'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Moving quietly behind Phoebe creates risk of being noticed by Phoebe.',
            challengeType: 'stealth',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            environmentDifficulty: 8,
          },
          relationshipEngine: [relationship('Phoebe')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(packet.ActionTargets, ['Phoebe']);
      assert.deepEqual(packet.OppTargets.NPC, ['Phoebe']);
      assert.deepEqual(packet.OppTargets.ENV, ['(none)']);
      assert.match(report.finalNarrativeHandoff.resultLine, /vs 1d20\(7\) \+ MND\(8\) = 15/);
      assert.equal(auditIncludes(report, 'stealthStats=PHY vs MND'), true);
    },
  },
  {
    name: '12i.6 stealth-style movement without a specific living detector is no roll, not ENV',
    run() {
      const report = runCase({
        userText: 'I sneak through the dark woods.',
        dice: [12, 7, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'SneakThroughWoods',
            identifyChallenge: 'sneak through the dark woods',
            explicitMeans: 'sneak through the dark woods',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['dark woods'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Sneaking through the dark woods creates environmental detection risk.',
            challengeType: 'stealth',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            environmentDifficulty: 4,
          },
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'N');
      assert.equal(packet.challengeType, 'none');
      assert.deepEqual(packet.OppTargets.NPC, ['(none)']);
      assert.deepEqual(packet.OppTargets.ENV, ['(none)']);
      assert.equal(packet.EnvironmentDifficulty, 0);
      assert.equal(auditIncludes(report, 'stealthStats=PHY vs MND'), false);
      assert.equal(auditIncludes(report, 'deterministicStealthNoVisibleDetectorNoRoll'), true);
      assert.doesNotMatch(prompt(report), /The relevant environmental obstacle is dark woods/);
    },
  },
  {
    name: '12j1 explicit ally attack command is request-only but can guide autonomous companion aggression',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({ currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 1 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I shout, "Seraphina, hit the ogre\'s flank and keep it off me while I hold its attention!"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'tell Seraphina to hit the ogre',
            explicitMeans: 'Seraphina, hit the ogre\'s flank and keep it off me while I hold its attention!',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['command'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Ogre');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Ogre');
      const companionInjury = report.finalNarrativeHandoff.aggressionResults.Seraphina.InflictedTargetInjury;
      assert.equal(Boolean(companionInjury), true);
      assert.equal(companionInjury.InjuryDetailMode, 'narrator_contextual');
      assert.equal(companionInjury.woundsAdd.length, 0);
      assert.match(prompt(report), /choose the concrete wound and affected body area from the attack context/i);
      assert.match(auditPrompt(report), /detailMode:narrator_contextual/i);
      assert.match(prompt(report), /spoken tactical input only/i);
      assert.match(prompt(report), /Seraphina/);
      assert.match(prompt(report), /companion attack against Ogre/);
      assert.equal(/companion attack against Seraphina|companion attack against Mira/i.test(prompt(report)), false);
    },
  },
  {
    name: '12j1.1 contextual companion injury caps preserve narrated wound details',
    run() {
      const report = {
        finalNarrativeHandoff: {
          aggressionResults: {
            Seraphina: {
              InflictedTargetInjury: {
                sourceNpc: 'Seraphina',
                target: 'Ogre',
                targetType: 'npc',
                severity: 'minor',
                InjuryDetailMode: 'narrator_contextual',
                InjurySeverityLimit: 'minor',
                InjuryContextHint: "Seraphina's CompanionAttack, hit the ogre's flank",
              },
            },
          },
        },
      };
      const caps = collectContextualInjuryCaps(report);
      assert.equal(caps.length, 1);
      assert.match(formatContextualInjuryCapsForPrompt(caps), /target:Ogre/);
      assert.match(formatContextualInjuryCapsForPrompt(caps), /severityLimit:minor/);
      const delta = applyContextualInjuryCapsToTrackerDelta({
        user: emptyUserDelta(),
        npcs: [{
          NPC: 'Ogre',
          personalitySummary: '',
          condition: 'bruised',
          woundsAdd: ['shallow cut across the left flank'],
          woundsRemove: [],
          statusAdd: [],
          statusRemove: [],
          gearAdd: [],
          gearRemove: [],
        }],
      }, caps);
      assert.deepEqual(delta.npcs[0].woundsAdd, ['shallow cut across the left flank']);
      assert.equal(delta.npcs[0].condition, 'bruised');
    },
  },
  {
    name: '12j1.2 contextual companion injury caps reject over-severe narrated wound details',
    run() {
      const caps = [{
        source: 'Seraphina',
        target: 'Ogre',
        targetType: 'npc',
        severityLimit: 'minor',
        condition: 'bruised',
        context: "Seraphina's CompanionAttack",
      }];
      const delta = applyContextualInjuryCapsToTrackerDelta({
        user: emptyUserDelta(),
        npcs: [{
          NPC: 'Ogre',
          personalitySummary: '',
          condition: 'badly_wounded',
          woundsAdd: ['deep broken rib wound'],
          woundsRemove: [],
          statusAdd: ['paralyzed by the blow'],
          statusRemove: [],
          gearAdd: [],
          gearRemove: [],
        }],
      }, caps);
      assert.deepEqual(delta.npcs, []);
    },
  },
  {
    name: '12j1.3 contextual companion injury cap does not create condition without narrated wound',
    run() {
      const caps = [{
        source: 'Seraphina',
        target: 'Raider1',
        targetType: 'npc',
        severityLimit: 'severe',
        condition: 'badly_wounded',
        context: "Seraphina's CompanionAttack",
      }];
      const delta = applyContextualInjuryCapsToTrackerDelta({
        user: emptyUserDelta(),
        npcs: [{
          NPC: 'Raider1',
          personalitySummary: '',
          condition: 'badly_wounded',
          woundsAdd: [],
          woundsRemove: [],
          statusAdd: [],
          statusRemove: [],
          gearAdd: [],
          gearRemove: [],
        }],
      }, caps);
      assert.deepEqual(delta.npcs, []);
    },
  },
  {
    name: '12j1a casual hit wording stays request-only and can guide autonomous companion attack',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({ currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 1 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'Seraphina, hit the ogre in the flank and keep it off me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'tell Seraphina to hit the ogre',
            explicitMeans: 'Seraphina, hit the ogre in the flank and keep it off me.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['command'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Ogre');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Ogre');
      assert.match(prompt(report), /spoken tactical input only/i);
      assert.match(prompt(report), /Seraphina/);
      assert.match(prompt(report), /companion attack against Ogre/);
      assert.match(prompt(report), /Target: Ogre only/i);
    },
  },
  {
    name: '12j1a.1 directed ally attack request resolves named hostile fallback only after autonomous companion attack',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Raider2: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
          personalitySummary: 'axe-man raider carrying a heavy axe',
          gear: ['heavy axe'],
        }),
        Darai: trackerEntry({ currentDisposition: { B: 2, F: 3, H: 2 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I do not attack. I point at the axe-man and shout, "Seraphina, take the axe-man down now. Hit him before he can move."',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'command Seraphina to attack the axe-man threatening Darai',
            explicitMeans: 'Seraphina, take the axe-man down now. Hit him before he can move.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: ['Darai'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['command'],
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Raider2'), relationship('Darai')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Raider2');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Raider2');
      assert.match(prompt(report), /Seraphina: NPC ATTACKS Raider2\. Attack: companion attack against Raider2/);
    },
  },
  {
    name: '12j1a.2 directed ally attack command target overrides unrelated semantic OppTarget',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({
          currentDisposition: { B: 1, F: 3, H: 3 },
          currentCoreStats: { Rank: 'Elite', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 2 },
          personalitySummary: 'scarred ogre pressing Darai against the pillar',
        }),
        Raider2: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
          personalitySummary: 'axe raider carrying a heavy axe',
          gear: ['heavy axe'],
        }),
        Darai: trackerEntry({ currentDisposition: { B: 1, F: 3, H: 2 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I do not attack. I back toward Darai and shout, "Seraphina, take the axe raider down now. Hit him before he can move."',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'shout a command to Seraphina to take down the axe raider',
            explicitMeans: 'Seraphina, take the axe raider down now. Hit him before he can move.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Darai'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['command'],
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre'), relationship('Raider2'), relationship('Darai')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.hostilesInScene.NPC, ['Raider2']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Raider2');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Raider2');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.match(prompt(report), /Seraphina: NPC ATTACKS Raider2\. Attack: companion attack against Raider2/);
      assert.match(prompt(report), /Target: Raider2 only/i);
      assert.equal(auditIncludes(report, 'directedCompanionAttackHostilePoolRepair'), true);
    },
  },
  {
    name: '12j1a.3 directed ally attack hostile fallback preserves narrow OppTargets',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Raider2: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
          personalitySummary: 'axe-man raider carrying a heavy axe',
          gear: ['heavy axe'],
        }),
        Darai: trackerEntry({ currentDisposition: { B: 2, F: 3, H: 2 } }),
      };
      const report = runCaseWithRandoms({
        userText: 'I do not attack. I point at the axe-man and shout, "Seraphina, take the axe-man down now. Hit him before he can move."',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'command Seraphina to attack the axe-man threatening Darai',
            explicitMeans: 'Seraphina, take the axe-man down now. Hit him before he can move.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: ['Darai'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['command'],
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Raider2'), relationship('Darai')],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ]);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.hostilesInScene.NPC, ['Raider2']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Seraphina.ProactivityTarget, 'Raider2');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Raider2');
    },
  },
  {
    name: '12j1b companion stop command does not borrow later user attack wording',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Raider1: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 3, MND: 2, CHA: 2 },
        }),
        Darai: trackerEntry({ currentDisposition: { B: 1, F: 3, H: 2 } }),
      };
      const randoms = [
        nthRandomForDie(4, 20),
        nthRandomForDie(8, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I keep my blade low and say, "Seraphina, Darai can\'t run. If they move on him, stop them." Then I lunge toward the raider with the knife, trying to slam my shoulder into her chest and drive her back before she can flank me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ShoulderSlamRaider',
            identifyChallenge: 'slam shoulder into the knife-wielding raider chest and drive her back',
            explicitMeans: 'slam shoulder into Raider1 and drive her back',
            identifyTargets: {
              ActionTargets: ['Raider1'],
              OppTargets: { NPC: ['Raider1'], ENV: [] },
              BenefitedObservers: ['Darai', 'Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['shoulder_slam'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Raider1'), relationship('Darai'), relationship('Seraphina')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.notEqual(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina, undefined);
      assert.doesNotMatch(prompt(report), /Seraphina: companion attack/i);
    },
  },
  {
    name: '12j B4 crisis companion attack targets enemy and rolls aggression',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Bear: trackerEntry({ currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 1 } }),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(15, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(4, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I swing my sword at the bear as it charges us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'swing my sword at the bear',
            explicitMeans: 'swing my sword at the bear',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['sword swing'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.Intent, 'ESCALATE_VIOLENCE');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Bear');
      assert.equal(proactive.TargetsUser, 'N');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Bear');
      assert.match(prompt(report), /companion attack against Bear/);
    },
  },
  {
    name: '12c established partner initiative can produce intimacy in calm context',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(2, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(proactive.PartnerInitiative, 'Y');
      assert.equal(proactive.Intent, 'Partner_Intimacy');
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Intimacy');
      assert.equal(proactive.PartnerInitiativeDie, 88);
      assert.equal(proactive.PartnerInitiativeContext, 'calm');
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.lastMeaningfulPartnerTag, 'Partner_Intimacy');
      assert.match(prompt(report), /romantic or sexual closeness/);
    },
  },
  {
    name: '12c.0 established partner calm initiative requires 12+ proactivity',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(11, 20),
      ]);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.ProactivityTier, 'HIGH');
      assert.equal(proactive.Threshold, 12);
      assert.equal(proactive.ProactivityDie, 11);
      assert.equal(proactive.Proactive, 'N');
    },
  },
  {
    name: '12c.1 established partner gift sets shared 1d4h active-time cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(75, 100),
        nthRandomForDie(2, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Gift');
      assert.equal(memory.interchangeCount, 1);
      assert.equal(memory.lastMeaningfulPartnerTag, 'Partner_Gift');
      assert.equal(memory.partnerMeaningfulCooldownUntilActiveMs, 2 * 60 * 60 * 1000);
      assert.equal(auditIncludes(report, 'Seraphina.Partner_Gift.meaningfulCooldown=1d4h(2)->7200000'), true);
    },
  },
  {
    name: '12c.2 shared meaningful partner cooldown remaps to light partner beat',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          proactivityMemory: {
            interchangeCount: 3,
            partnerMeaningfulCooldownUntilActiveMs: 10 * 60 * 60 * 1000,
            lastMeaningfulPartnerTag: 'Partner_Date',
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(75, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        rapportClock: { activeMs: 2 * 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.PartnerInitiativeRawTag, 'Partner_Gift');
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Flirt');
      assert.equal(proactive.PartnerInitiativeMemoryGate, 'meaningfulPartner.cooldownUntil36000000');
    },
  },
  {
    name: '12c.3 established partner conflict sets shared 1d4h active-time cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(98, 100),
        nthRandomForDie(3, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Conflict');
      assert.equal(memory.lastMeaningfulPartnerTag, 'Partner_Conflict');
      assert.equal(memory.partnerMeaningfulCooldownUntilActiveMs, 3 * 60 * 60 * 1000);
      assert.equal(auditIncludes(report, 'Seraphina.Partner_Conflict.meaningfulCooldown=1d4h(3)->10800000'), true);
    },
  },
  {
    name: '12c.4 established partner date cannot repeat as next meaningful event',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          proactivityMemory: {
            lastMeaningfulPartnerTag: 'Partner_Date',
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(65, 100),
        nthRandomForDie(1, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        rapportClock: { activeMs: 6 * 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.PartnerInitiativeRawTag, 'Partner_Date');
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Gift');
      assert.equal(proactive.PartnerInitiativeMemoryGate, 'Partner_Date.repeatBlocked');
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.lastMeaningfulPartnerTag, 'Partner_Gift');
    },
  },
  {
    name: '12c.5 partner intimacy requires privacy or contextual suitability',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(1, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I talk with Seraphina in the crowded market while guards stand nearby.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'crowded market conversation',
            explicitMeans: 'talk in the crowded market near guards',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.PartnerInitiativeRawTag, 'Partner_Intimacy');
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Conflict');
      assert.equal(proactive.PartnerInitiativeMemoryGate, 'Partner_Intimacy.contextBlocked');
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.lastMeaningfulPartnerTag, 'Partner_Conflict');
    },
  },
  {
    name: '12d established partner crisis initiative becomes companion attack with enemy target',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(20, 20),
        nthRandomForDie(20, 20),
        nthRandomForDie(20, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(14, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I swing my sword at the bear as it charges us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'swing my sword at the bear',
            explicitMeans: 'swing my sword at the bear',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['sword swing'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.Intent, 'ESCALATE_VIOLENCE');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Bear');
      assert.equal(proactive.TargetsUser, 'N');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Bear');
      assert.match(prompt(report), /companion attack against Bear/);
    },
  },
  {
    name: '12e narrator translates relationship tags into guidance',
    run() {
      const report = runCase({
        userText: 'I sit near Seraphina by the low fire and share comfortable quiet with her.',
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 2, F: 3, H: 2 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'sit near Seraphina by the low fire and share comfortable quiet',
            explicitMeans: 'quiet companionship',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const text = prompt(report);
      assert.doesNotMatch(text, /consistent with FREEZE\/No Change/);
      assert.match(text, /npcDispositionAndStyle:/);
      assert.match(text, /Behavior toward \{\{user\}\}:/);
      assert.match(text, /guarded, tense, wary, hesitant/);
      assert.match(text, /relationshipState:\s+No relationship change occurs in this beat/i);
    },
  },
  {
    name: '12k established partner crisis without enemy target downgrades to support',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(136, 150),
      ];
      const report = runCaseWithRandoms({
        userText: 'A burning beam falls toward us and I try to shove through the smoke.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'EscapeFire',
            identifyChallenge: 'shove through the smoke under a falling beam',
            explicitMeans: 'shove through the smoke',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['burning beam', 'smoke'] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['escape'],
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Cover');
      assert.equal(proactive.Intent, 'SUPPORT_ACT');
      assert.equal(proactive.ProactivityTarget, '{{user}}');
      assert.equal(proactive.TargetsUser, 'Y');
      assert.deepEqual(report.finalNarrativeHandoff.aggressionResults, {});
      assert.match(prompt(report), /covers, shields, intercepts/);
    },
  },
  {
    name: '12l B2 crisis companion can assist without relationship',
    run() {
      const tracker = {
        Mira: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(50, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I brace as the bear charges toward us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'HoldGround',
            identifyChallenge: 'brace as the bear charges',
            explicitMeans: 'brace against the charge',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Mira'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['brace'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Mira'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Mira;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Assist');
      assert.equal(proactive.Intent, 'SUPPORT_ACT');
      assert.match(prompt(report), /tactical help under immediate pressure/);
      assert.match(prompt(report), /do not use comfort-touch/);
    },
  },
  {
    name: '12m B2 dire crisis can retreat',
    run() {
      const tracker = {
        Mira: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(1, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(90, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I slash at the bear with my sword, miss badly, and stumble as it barrels through our guard.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'sword slash misses badly against the bear',
            explicitMeans: 'slash at the bear with a sword and miss',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Mira'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['swing'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Mira'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Mira;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Retreat');
      assert.equal(proactive.CompanionCrisisDire, 'Y');
      assert.match(prompt(report), /tries to retreat/);
    },
  },
  {
    name: '12n B4 dire crisis does not retreat unless badly wounded',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          condition: 'healthy',
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(1, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(100, 100),
        nthRandomForDie(12, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I slash at the bear with my sword, miss badly, and stumble as it barrels through our guard.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'sword slash misses badly against the bear',
            explicitMeans: 'slash at the bear with a sword and miss',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['swing'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.notEqual(proactive.CompanionInitiativeTag, 'Companion_Retreat');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
    },
  },
  {
    name: '12o B4 badly wounded dire crisis can reluctantly retreat',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          condition: 'badly_wounded',
          wounds: ['mangled leg'],
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(1, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(100, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I slash at the bear with my sword, miss badly, and stumble as it barrels through our guard.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'sword slash misses badly against the bear',
            explicitMeans: 'slash at the bear with a sword and miss',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['swing'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Retreat');
      assert.match(prompt(report), /strong hesitation, conflict, reluctance, guilt/);
    },
  },
  {
    name: '12p companion attack never targets friendly action target',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
        Mira: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
        }),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(100, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I drag Mira out from under the collapsing beam while Seraphina watches the smoke.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'RescueMira',
            identifyChallenge: 'drag Mira away from a collapsing beam',
            explicitMeans: 'drag Mira clear',
            identifyTargets: {
              ActionTargets: ['Mira'],
              OppTargets: { NPC: [], ENV: ['collapsing beam'] },
              BenefitedObservers: ['Mira', 'Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['rescue'],
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.notEqual(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.notEqual(proactive.ProactivityTarget, 'Mira');
      assert.deepEqual(report.finalNarrativeHandoff.aggressionResults, {});
    },
  },
  {
    name: '12p1 hostile counter can target attacking companion instead of user',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 1, MND: 1, CHA: 5 },
        }),
        Ogre: trackerEntry({
          currentDisposition: { B: 1, F: 4, H: 4 },
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 10, MND: 2, CHA: 1 },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(4, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(6, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'Seraphina, hit the ogre in the flank while I distract it.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'CommandSeraphinaToAttack',
            identifyChallenge: 'tell Seraphina to hit the ogre',
            explicitMeans: 'Seraphina, hit the ogre in the flank while I distract it.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['command'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const seraphinaAttack = report.finalNarrativeHandoff.aggressionResults.Seraphina;
      const ogreCounter = report.finalNarrativeHandoff.aggressionResults.Ogre;
      assert.equal(seraphinaAttack.AttackType, 'CompanionAttack');
      assert.equal(seraphinaAttack.ProactivityTarget, 'Ogre');
      assert.equal(seraphinaAttack.AttackStat, 'PHY');
      assert.equal(seraphinaAttack.DefenseStat, 'PHY');
      assert.equal(ogreCounter.AttackType, 'CounterAttack');
      assert.equal(ogreCounter.ProactivityTarget, 'Seraphina');
      assert.equal(ogreCounter.AttackStat, 'PHY');
      assert.equal(ogreCounter.DefenseStat, 'PHY');
      assert.equal(Boolean(ogreCounter.InflictedTargetInjury), true);
      assert.equal(ogreCounter.InflictedTargetInjury.InjuryDetailMode, 'narrator_contextual');
      assert.equal(ogreCounter.InflictedTargetInjury.woundsAdd.length, 0);
      assert.match(prompt(report), /choose the concrete wound and affected body area from the attack context/i);
      assert.match(auditPrompt(report), /detailMode:narrator_contextual/i);
      assert.equal(report.trackerUpdate.npcs.Seraphina.condition, 'healthy');
      assert.match(prompt(report), /companion attack against Ogre/i);
      assert.match(prompt(report), /Ogre: NPC ATTACKS Seraphina\. Attack: counterattack exploiting the opening against Seraphina/i);
      assert.match(prompt(report), /Seraphina receives .* condition from Ogre/i);
    },
  },
  {
    name: '12p2 explicit ally attack can target hostile ActionTarget when semantic omits OppTargets',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          dominantLock: 'HOSTILITY',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I shout, "Seraphina, hit the ogre\'s flank and keep it off me while I hold its attention!"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'HoldOgreAttention',
            identifyChallenge: 'raise shield and brace against the ogre\'s club swing',
            explicitMeans: 'raise shield and brace against the ogre\'s club swing',
            identifyTargets: {
              ActionTargets: ['Ogre'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: false,
            actionCount: ['brace'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const aggression = report.finalNarrativeHandoff.aggressionResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.ProactivityTarget, 'Ogre');
      assert.equal(aggression.AttackType, 'CompanionAttack');
      assert.equal(aggression.ProactivityTarget, 'Ogre');
      assert.match(prompt(report), /companion attack against Ogre/i);
      assert.match(prompt(report), /Seraphina/i);
    },
  },
  {
    name: '12p3 autonomous companion attack can target hostile ActionTarget when semantic omits OppTargets',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          dominantLock: 'HOSTILITY',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
        }),
      };
      const randoms = [
        nthRandomForDie(16, 20),
        ...Array(10).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I raise my shield and brace as the ogre comes at us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BraceAgainstOgre',
            identifyChallenge: 'raise shield and brace against the ogre',
            explicitMeans: 'raise shield and brace',
            identifyTargets: {
              ActionTargets: ['Ogre'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['brace'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const aggression = report.finalNarrativeHandoff.aggressionResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.ProactivityTarget, 'Ogre');
      assert.equal(aggression.AttackType, 'CompanionAttack');
      assert.equal(aggression.ProactivityTarget, 'Ogre');
      assert.match(prompt(report), /companion attack against Ogre/i);
      assert.match(prompt(report), /This must target only the listed hostile target/i);
    },
  },
  {
    name: '12q social OppTarget does not trigger companion crisis',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
        Clerk: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(16, 20),
        nthRandomForDie(16, 20),
        ...Array(5).fill(nthRandomForDie(1, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I bargain with the clerk for a better price while Seraphina stands beside me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'NegotiatePrice',
            identifyChallenge: 'bargain with the clerk for a better price',
            explicitMeans: 'bargaining',
            identifyTargets: {
              ActionTargets: ['Clerk'],
              OppTargets: { NPC: ['Clerk'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['bargain'],
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
            activeHostileThreat: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Clerk')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.activeHostileThreat, 'N');
      assert.equal(proactive.Proactive, 'N');
      assert.equal(proactive.CompanionInitiative ?? 'N', 'N');
      assert.notEqual(proactive.CompanionInitiativeContext ?? 'none', 'crisis');
      assert.notEqual(proactive.CompanionInitiativeTag ?? 'NONE', 'Companion_Attack');
      assert.deepEqual(report.finalNarrativeHandoff.aggressionResults, {});
    },
  },
  {
    name: '12r companion attack does not re-enable enemy attack on user critical success',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Bear: trackerEntry({
          currentDisposition: { B: 1, F: 1, H: 4 },
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 1 },
        }),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        nthRandomForDie(1, 20),
        ...Array(4).fill(nthRandomForDie(1, 20)),
        ...Array(5).fill(nthRandomForDie(1, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(90, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I drive my sword into the bear as it tries to maul us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'drive my sword into the bear',
            explicitMeans: 'drive my sword into the bear',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['sword thrust'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactiveSeraphina = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.OutcomeTier, 'Critical_Success');
      assert.equal(proactiveSeraphina.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Bear');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Bear, undefined);
    },
  },
  {
    name: '12q1 explicit ally attack does not target friendly ActionTarget fallback',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
        }),
        Mira: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
        }),
      };
      const randoms = [
        ...Array(6).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'Seraphina, hit whatever is threatening Mira while I drag Mira out of the beam.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'RescueMira',
            identifyChallenge: 'drag Mira away from a collapsing beam',
            explicitMeans: 'drag Mira clear',
            identifyTargets: {
              ActionTargets: ['Mira'],
              OppTargets: { NPC: [], ENV: ['collapsing beam'] },
              BenefitedObservers: ['Mira', 'Seraphina'],
              HarmedObservers: [],
            },
            rollNeeded: false,
            actionCount: ['rescue'],
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.notEqual(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.notEqual(proactive.ProactivityTarget, 'Mira');
      assert.deepEqual(report.finalNarrativeHandoff.aggressionResults, {});
    },
  },
  {
    name: '12 wrist grab is restraint control, not damaging combat',
    run() {
      const report = runCase({
        userText: 'I catch Seraphina by the wrist to stop her leaving.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'StopDeparture',
            identifyChallenge: 'catch Seraphina by the wrist to stop her leaving',
            explicitMeans: 'catch Seraphina by the wrist to stop her leaving',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: ['Seraphina'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
            restraintControl: {
              present: true,
              targetNPC: 'Seraphina',
              evidence: 'catch Seraphina by the wrist to stop her leaving',
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.restraintControl.Present, 'Y');
      assert.equal(packet.RollNeeded, 'N');
      assert.equal(packet.harmMode, 'restraint_control');
      assert.equal(packet.BoundaryGate.action, 'grace_no_roll');
    },
  },
  {
    name: '06 twisting grabbed wrist routes to damaging combat',
    run() {
      const report = runCase({
        userText: 'I grab Seraphina by the wrist and twist until it hurts.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'HurtTarget',
            identifyChallenge: 'grab wrist and twist until it hurts',
            explicitMeans: 'grab Seraphina by the wrist and twist until it hurts',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: ['Seraphina'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.challengeType, 'mundane_combat');
    },
  },
  {
    name: '07 snatching object is boundary pressure, not combat',
    run() {
      const report = runCase({
        userText: 'I snatch the sealed scroll from under the guard\'s hand.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TakeScroll',
            identifyChallenge: 'snatch the sealed scroll from under the guard hand',
            explicitMeans: 'snatch the sealed scroll from under the guard hand',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: true,
              type: 'object_access',
              targetNPC: 'Guard',
              objectOrAccess: 'sealed scroll',
              evidence: 'snatch the sealed scroll from under the guard hand',
            },
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.boundaryPressure.Present, 'Y');
      assert.equal(packet.challengeType, 'none');
      assert.equal(packet.RollNeeded, 'N');
    },
  },
  {
    name: '07b accepted NPC-offered object is ordinary transfer, not boundary pressure',
    run() {
      const report = runCase({
        chat: [
          { is_user: false, mes: 'Alice holds her phone out toward you. "Here, use mine."' },
          { is_user: true, mes: 'I grab it.' },
        ],
        tracker: {
          Alice: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
            currentCoreStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 5, MND: 5, CHA: 5 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Accept_Offered_Item',
            identifyChallenge: 'grab Alice offered phone from her hand',
            explicitMeans: 'grab the offered phone from Alice hand',
            itemUse: {
              attempted: false,
              available: false,
              item: '(none)',
              source: 'none',
              evidence: '(none)',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: ['Alice'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Taking the phone creates a possession contest.',
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: false,
              type: 'none',
              targetNPC: '(none)',
              objectOrAccess: '(none)',
              evidence: '(none)',
            },
          },
          relationshipEngine: [relationship('Alice')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'N');
      assert.equal(packet.Outcome, 'no_roll');
      assert.equal(packet.boundaryPressure.Present, 'N');
      assert.deepEqual(packet.OppTargets.NPC, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.resultLine, 'No roll');
      assert.equal(auditIncludes(report, 'hard_override_accepted_offered_object_no_roll'), true);
      assert.doesNotMatch(prompt(report), /Treat this as physical boundary pressure/i);
      assert.doesNotMatch(prompt(report), /contested possession/i);
    },
  },
  {
    name: '07c B3 friendly ordinary item access is no immediate opposition',
    run() {
      const report = runCase({
        userText: "I grab Alice's phone.",
        tracker: {
          Alice: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BorrowPhone',
            identifyChallenge: "grab Alice's phone",
            explicitMeans: "grab Alice's phone",
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: ['Alice'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Taking Alice phone creates a possession contest.',
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: true,
              type: 'object_access',
              targetNPC: 'Alice',
              objectOrAccess: 'Alice phone',
              evidence: "grab Alice's phone",
            },
          },
          relationshipEngine: [relationship('Alice')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'N');
      assert.equal(packet.Outcome, 'no_roll');
      assert.equal(packet.boundaryPressure.Present, 'Y');
      assert.deepEqual(packet.OppTargets.NPC, ['(none)']);
      assert.equal(packet.BoundaryGate.action, 'grace_no_roll');
    },
  },
  {
    name: '07d B2 non-offered item grab gets boundary grace first',
    run() {
      const report = runCase({
        userText: "I grab Alice's phone.",
        tracker: {
          Alice: trackerEntry({
            currentDisposition: { B: 2, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TakePhone',
            identifyChallenge: "grab Alice's phone",
            explicitMeans: "grab Alice's phone",
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: ['Alice'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Taking Alice phone creates a possession contest.',
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: true,
              type: 'object_access',
              targetNPC: 'Alice',
              objectOrAccess: 'Alice phone',
              evidence: "grab Alice's phone",
            },
          },
          relationshipEngine: [relationship('Alice')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'N');
      assert.deepEqual(packet.OppTargets.NPC, ['(none)']);
      assert.equal(packet.boundaryPressure.Present, 'Y');
      assert.equal(packet.BoundaryGate.action, 'grace_no_roll');
      assert.equal(auditIncludes(report, 'hard_override_friendly_object_access_no_roll'), false);
    },
  },
  {
    name: '07e B3 forceful item wording is narrator-managed scene friction',
    run() {
      const report = runCase({
        userText: "I snatch Alice's phone.",
        tracker: {
          Alice: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'SnatchPhone',
            identifyChallenge: "snatch Alice's phone",
            explicitMeans: "snatch Alice's phone",
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: ['Alice'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Snatching Alice phone creates a possession contest.',
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: true,
              type: 'object_access',
              targetNPC: 'Alice',
              objectOrAccess: 'Alice phone',
              evidence: "snatch Alice's phone",
            },
          },
          relationshipEngine: [relationship('Alice')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'N');
      assert.equal(packet.Outcome, 'no_roll');
      assert.equal(packet.boundaryPressure.Present, 'Y');
      assert.deepEqual(packet.OppTargets.NPC, ['(none)']);
      assert.equal(packet.BoundaryGate.action, 'grace_no_roll');
    },
  },
  {
    name: '07f B3 return-request item boundary break rolls',
    run() {
      const report = runCase({
        chat: [
          { is_user: false, mes: 'Alice holds out her hand. "Give my phone back."' },
          { is_user: true, mes: "I keep Alice's phone and keep using it." },
        ],
        tracker: {
          Alice: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'KeepPhoneAfterReturnRequest',
            identifyChallenge: "keep Alice's phone after she asks for it back",
            explicitMeans: "keep Alice's phone and keep using it",
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: ['Alice'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Keeping Alice phone after a return request creates a possession contest.',
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: true,
              type: 'object_access',
              targetNPC: 'Alice',
              objectOrAccess: 'Alice phone',
              evidence: "keep Alice's phone after return request",
            },
            boundaryBreak: {
              present: true,
              boundaryId: 'pb_test_phone_return',
              targetNPC: 'Alice',
              type: 'object_access',
              response: 'continued',
              evidence: 'Alice asks for her phone back and the user keeps it',
            },
          },
          relationshipEngine: [relationship('Alice')],
        }),
        cardFields: {
          pendingBoundary: {
            active: true,
            boundaryId: 'pb_test_phone_return',
            targetNPC: 'Alice',
            type: 'object_access',
            objectOrAccess: 'Alice phone',
            evidence: 'Give my phone back',
            warnings: 1,
          },
        },
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'Y');
      assert.equal(packet.boundaryBreak.Present, 'Y');
      assert.deepEqual(packet.OppTargets.NPC, ['Alice']);
      assert.equal(packet.BoundaryGate.action, 'force_roll');
    },
  },
  {
    name: '07g B3 explicit item-access refusal break rolls',
    run() {
      const report = runCase({
        chat: [
          { is_user: false, mes: 'Alice pulls her phone back. "Don\'t take my phone."' },
          { is_user: true, mes: "I grab Alice's phone." },
        ],
        tracker: {
          Alice: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TakePhoneAfterRefusal',
            identifyChallenge: "grab Alice's phone after she refuses",
            explicitMeans: "grab Alice's phone",
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: ['Alice'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Taking Alice phone after refusal creates a possession contest.',
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: true,
              type: 'object_access',
              targetNPC: 'Alice',
              objectOrAccess: 'Alice phone',
              evidence: "grab Alice's phone after refusal",
            },
            boundaryBreak: {
              present: true,
              boundaryId: 'pb_test_phone_refusal',
              targetNPC: 'Alice',
              type: 'object_access',
              response: 'continued',
              evidence: 'Alice says do not take my phone and the user grabs it',
            },
          },
          relationshipEngine: [relationship('Alice')],
        }),
        cardFields: {
          pendingBoundary: {
            active: true,
            boundaryId: 'pb_test_phone_refusal',
            targetNPC: 'Alice',
            type: 'object_access',
            objectOrAccess: 'Alice phone',
            evidence: "Don't take my phone",
            warnings: 1,
          },
        },
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'Y');
      assert.equal(packet.boundaryBreak.Present, 'Y');
      assert.deepEqual(packet.OppTargets.NPC, ['Alice']);
      assert.equal(packet.BoundaryGate.action, 'force_roll');
    },
  },
  {
    name: '07h B4 first boundary break gets trusted warning grace',
    run() {
      const report = runCase({
        chat: [
          { is_user: false, mes: 'Alice pulls her phone back. "Don\'t take my phone."' },
          { is_user: true, mes: "I grab Alice's phone anyway." },
        ],
        tracker: {
          Alice: trackerEntry({
            currentDisposition: { B: 4, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TakePhoneAfterRefusal',
            identifyChallenge: "grab Alice's phone after she refuses",
            explicitMeans: "grab Alice's phone anyway",
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: ['Alice'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Taking Alice phone after refusal creates a possession contest.',
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: true,
              type: 'object_access',
              targetNPC: 'Alice',
              objectOrAccess: 'Alice phone',
              evidence: "grab Alice's phone after refusal",
            },
            boundaryBreak: {
              present: true,
              boundaryId: 'pb_test_phone_b4_first',
              targetNPC: 'Alice',
              type: 'object_access',
              response: 'continued',
              evidence: 'Alice says do not take my phone and the user grabs it',
            },
          },
          relationshipEngine: [relationship('Alice')],
        }),
        cardFields: {
          pendingBoundary: {
            active: true,
            boundaryId: 'pb_test_phone_b4_first',
            targetNPC: 'Alice',
            type: 'object_access',
            objectOrAccess: 'Alice phone',
            evidence: "Don't take my phone",
            warnings: 1,
          },
        },
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'N');
      assert.equal(packet.boundaryBreak.Present, 'Y');
      assert.deepEqual(packet.OppTargets.NPC, ['(none)']);
      assert.equal(packet.BoundaryGate.action, 'second_warning_no_roll');
    },
  },
  {
    name: '07i B4 repeated boundary break rolls after trusted warning',
    run() {
      const report = runCase({
        chat: [
          { is_user: false, mes: 'Alice pulls her phone back. "Don\'t take my phone."' },
          { is_user: true, mes: "I grab Alice's phone again." },
        ],
        tracker: {
          Alice: trackerEntry({
            currentDisposition: { B: 4, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TakePhoneAfterRepeatedRefusal',
            identifyChallenge: "grab Alice's phone again after repeated refusal",
            explicitMeans: "grab Alice's phone again",
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: ['Alice'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'Taking Alice phone after repeated refusal creates a possession contest.',
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: true,
              type: 'object_access',
              targetNPC: 'Alice',
              objectOrAccess: 'Alice phone',
              evidence: "grab Alice's phone after repeated refusal",
            },
            boundaryBreak: {
              present: true,
              boundaryId: 'pb_test_phone_b4_repeat',
              targetNPC: 'Alice',
              type: 'object_access',
              response: 'continued',
              evidence: 'Alice says do not take my phone and the user grabs it again',
            },
          },
          relationshipEngine: [relationship('Alice')],
        }),
        cardFields: {
          pendingBoundary: {
            active: true,
            boundaryId: 'pb_test_phone_b4_repeat',
            targetNPC: 'Alice',
            type: 'object_access',
            objectOrAccess: 'Alice phone',
            evidence: "Don't take my phone",
            warnings: 2,
          },
        },
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'Y');
      assert.equal(packet.boundaryBreak.Present, 'Y');
      assert.deepEqual(packet.OppTargets.NPC, ['Alice']);
      assert.equal(packet.BoundaryGate.action, 'force_roll');
    },
  },
  {
    name: '08 active hostile threat alone does not initialize relationship state as active enemy',
    run() {
      const report = runCase({
        userText: 'A bandit lunges from the hideout with a knife.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'SurviveAmbush',
            identifyChallenge: 'bandit lunges with a knife',
            explicitMeans: 'bandit lunges with a knife',
            identifyTargets: { hostilesInScene: { NPC: ['Bandit'] }, ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
            activeHostileThreat: true,
            challengeType: 'none',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Bandit, undefined);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.hostilesInScene.NPC, ['Bandit']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.NPCInScene, ['(none)']);
    },
  },
  {
    name: '08a NPCAwareOfUser initializes individual present NPC without direct user action',
    run() {
      const report = runCase({
        userText: 'I enter the tavern.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'EnterTavern',
            identifyChallenge: 'enter the tavern',
            explicitMeans: 'enter the tavern',
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: ['Innkeeper'],
            },
            rollNeeded: false,
            challengeType: 'none',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Innkeeper', { initPreset: { priorUserGoodRep: true } })],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.NPCAwareOfUser, ['Innkeeper']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.NPCInScene, ['Innkeeper']);
      assert.equal(report.trackerUpdate.npcs.Innkeeper.currentDisposition.B, 3);
      assert.ok(auditIncludes(report, '2.5 NPCInScene=[Innkeeper]'));
    },
  },
  {
    name: '09 bandit label alone does not initialize active enemy',
    run() {
      const report = runCase({
        userText: 'I approach a bandit at the campfire and talk.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'talk to bandit',
            explicitMeans: 'talk to bandit',
            identifyTargets: { ActionTargets: ['Bandit'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Bandit')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Bandit.currentDisposition.H, 2);
    },
  },
  {
    name: '09a semantic userBadRep initializes B1/F2/H3',
    run() {
      const tracker = {
        Val: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I sit across from Val and say hello.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'talk to Val',
            explicitMeans: 'say hello',
            identifyTargets: { ActionTargets: ['Val'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Val', { initPreset: { userBadRep: true } })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Val.currentDisposition, { B: 1, F: 2, H: 3 });
      assert.deepEqual(report.trackerUpdate.npcs.Val.userHistory, { knowsUser: 'Y', standing: 'negative' });
      assert.equal(auditIncludes(report, 'initPreset=userBadRep'), true);
    },
  },
  {
    name: '09b semantic priorUserGoodRep initializes B3/F1/H1',
    run() {
      const tracker = {
        Mira: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I greet Mira at the guild hall.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'greet Mira',
            explicitMeans: 'greet Mira',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira', { initPreset: { priorUserGoodRep: true } })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Mira.currentDisposition, { B: 3, F: 1, H: 1 });
      assert.deepEqual(report.trackerUpdate.npcs.Mira.userHistory, { knowsUser: 'Y', standing: 'positive' });
      assert.equal(auditIncludes(report, 'initPreset=priorUserGoodRep'), true);
    },
  },
  {
    name: '09c semantic userNonHuman initializes low-trust caution unless fearImmune',
    run() {
      const tracker = {
        Villager: trackerEntry({ currentDisposition: null }),
        DemonPeer: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I speak to the villager and DemonPeer.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'speak to the group',
            explicitMeans: 'speak to the group',
            identifyTargets: { ActionTargets: ['Villager', 'DemonPeer'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [
            relationship('Villager', { initPreset: { userNonHuman: true } }),
            relationship('DemonPeer', { initPreset: { userNonHuman: true, fearImmunity: true } }),
          ],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Villager.currentDisposition, { B: 1, F: 2, H: 2 });
      assert.deepEqual(report.trackerUpdate.npcs.DemonPeer.currentDisposition, { B: 2, F: 2, H: 2 });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].InitPreset, 'userNonHuman');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[1].InitPreset, 'neutralDefault');
      assert.equal(auditIncludes(report, 'initPreset=userNonHuman'), true);
      assert.equal(auditIncludes(report, 'fearImmunity=Y'), true);
      assert.match(prompt(report), /Visible-nonhuman caution: low trust because \{\{user\}\} appears inhuman/);
      assert.match(prompt(report), /wary distance, professional caution, prejudice, religious suspicion, curiosity, fascination, social avoidance, quiet resentment, guarded politeness, or mild fear/);
      assert.match(prompt(report), /not default panic, open hatred, violence, or automatic refusal/);
    },
  },
  {
    name: '09c.1 local fame gives normal NPCs mild trust at threshold 5',
    run() {
      const tracker = {
        Receptionist: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I speak with the receptionist.',
        tracker,
        cardFields: {
          userReputation: {
            locations: {
              'Urakami Village': { location: 'Urakami Village', fame: 5, infamy: 0, updatedAt: 100 },
            },
          },
        },
        ledger: baseLedger({
          engineContext: {
            userReputationContext: { location: 'Urakami Village' },
          },
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'speak with receptionist',
            explicitMeans: 'speak with receptionist',
            identifyTargets: { ActionTargets: ['Receptionist'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Receptionist')],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Receptionist.currentDisposition, { B: 2, F: 1, H: 2 });
      assert.equal(auditIncludes(report, 'initPreset=userFame5'), true);
    },
  },
  {
    name: '09c.2 normal fame initializes NPCs friendly at threshold 10',
    run() {
      const tracker = {
        Receptionist: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I speak with the receptionist.',
        tracker,
        cardFields: {
          userReputation: {
            locations: {
              'Urakami Village': { location: 'Urakami Village', fame: 10, infamy: 0, updatedAt: 100 },
            },
          },
        },
        ledger: baseLedger({
          engineContext: {
            userReputationContext: { location: 'Urakami Village' },
          },
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'speak with receptionist',
            explicitMeans: 'speak with receptionist',
            identifyTargets: { ActionTargets: ['Receptionist'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Receptionist')],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Receptionist.currentDisposition, { B: 3, F: 1, H: 1 });
      assert.equal(auditIncludes(report, 'initPreset=userFame10'), true);
    },
  },
  {
    name: '09c.2a nonhuman fame 5 normalizes to neutral',
    run() {
      const tracker = {
        Guard: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I speak with the guard.',
        tracker,
        cardFields: {
          userReputation: {
            locations: {
              'Urakami Village': { location: 'Urakami Village', fame: 5, infamy: 0, updatedAt: 100 },
            },
          },
        },
        ledger: baseLedger({
          engineContext: {
            userReputationContext: { location: 'Urakami Village' },
          },
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'speak with guard',
            explicitMeans: 'speak with guard',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Guard', { initPreset: { userNonHuman: true } })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Guard.currentDisposition, { B: 2, F: 2, H: 2 });
      assert.equal(auditIncludes(report, 'initPreset=userNonHumanFame5'), true);
    },
  },
  {
    name: '09c.2b nonhuman fame 10 gets normal fame 5 effect',
    run() {
      const tracker = {
        Guard: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I speak with the guard.',
        tracker,
        cardFields: {
          userReputation: {
            locations: {
              'Urakami Village': { location: 'Urakami Village', fame: 10, infamy: 0, updatedAt: 100 },
            },
          },
        },
        ledger: baseLedger({
          engineContext: {
            userReputationContext: { location: 'Urakami Village' },
          },
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'speak with guard',
            explicitMeans: 'speak with guard',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Guard', { initPreset: { userNonHuman: true } })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Guard.currentDisposition, { B: 2, F: 1, H: 2 });
      assert.equal(auditIncludes(report, 'initPreset=userNonHumanFame10'), true);
    },
  },
  {
    name: '09c.3 infamy routes to hostility before fear threshold',
    run() {
      const tracker = {
        Merchant: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I approach the merchant.',
        tracker,
        cardFields: {
          userReputation: {
            locations: {
              'Urakami Village': { location: 'Urakami Village', fame: 0, infamy: 10, updatedAt: 100 },
            },
          },
        },
        ledger: baseLedger({
          engineContext: {
            userReputationContext: { location: 'Urakami Village' },
          },
          resolutionEngine: {
            identifyGoal: 'Approach',
            identifyChallenge: 'approach merchant',
            explicitMeans: 'approach merchant',
            identifyTargets: { NPCAwareOfUser: ['Merchant'], ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Merchant')],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Merchant.currentDisposition, { B: 1, F: 2, H: 3 });
      assert.equal(auditIncludes(report, 'initPreset=userInfamy10'), true);
    },
  },
  {
    name: '09c.3a nonhuman infamy applies one tier early',
    run() {
      const tracker = {
        Merchant: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I approach the merchant.',
        tracker,
        cardFields: {
          userReputation: {
            locations: {
              'Urakami Village': { location: 'Urakami Village', fame: 0, infamy: 5, updatedAt: 100 },
            },
          },
        },
        ledger: baseLedger({
          engineContext: {
            userReputationContext: { location: 'Urakami Village' },
          },
          resolutionEngine: {
            identifyGoal: 'Approach',
            identifyChallenge: 'approach merchant',
            explicitMeans: 'approach merchant',
            identifyTargets: { NPCAwareOfUser: ['Merchant'], ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Merchant', { initPreset: { userNonHuman: true } })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Merchant.currentDisposition, { B: 1, F: 2, H: 3 });
      assert.equal(auditIncludes(report, 'initPreset=userNonHumanInfamy10'), true);
    },
  },
  {
    name: '09c.4 high infamy adds fear',
    run() {
      const tracker = {
        Villager: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I approach the villager.',
        tracker,
        cardFields: {
          userReputation: {
            locations: {
              'Urakami Village': { location: 'Urakami Village', fame: 0, infamy: 15, updatedAt: 100 },
            },
          },
        },
        ledger: baseLedger({
          engineContext: {
            userReputationContext: { location: 'Urakami Village' },
          },
          resolutionEngine: {
            identifyGoal: 'Approach',
            identifyChallenge: 'approach villager',
            explicitMeans: 'approach villager',
            identifyTargets: { NPCAwareOfUser: ['Villager'], ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Villager')],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Villager.currentDisposition, { B: 1, F: 3, H: 3 });
      assert.equal(auditIncludes(report, 'initPreset=userInfamy15'), true);
    },
  },
  {
    name: '09c.5 local fame does not leak into unrelated locations',
    run() {
      const tracker = {
        Receptionist: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I speak with the receptionist.',
        tracker,
        cardFields: {
          userReputation: {
            locations: {
              'Urakami Village': { location: 'Urakami Village', fame: 20, infamy: 0, updatedAt: 100 },
            },
          },
        },
        ledger: baseLedger({
          engineContext: {
            userReputationContext: { location: 'Kuroda City' },
          },
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'speak with receptionist',
            explicitMeans: 'speak with receptionist',
            identifyTargets: { ActionTargets: ['Receptionist'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Receptionist')],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Receptionist.currentDisposition, { B: 2, F: 2, H: 2 });
      assert.equal(auditIncludes(report, 'initPreset=neutralDefault'), true);
    },
  },
  {
    name: '09d semantic romanticOpen initializes B4/F1/H1 without forcing establishedRelationship',
    run() {
      const tracker = {
        Seraphina: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I approach Seraphina and say hello.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'talk to Seraphina',
            explicitMeans: 'say hello',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { initPreset: { romanticOpen: true }, establishedRelationship: false })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 4, F: 1, H: 1 });
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'N');
      assert.equal(auditIncludes(report, 'initPreset=romanticOpen'), true);
    },
  },
  {
    name: '09d.0 romanticOpen overrides visible nonhuman fear init',
    run() {
      const tracker = {
        Hyacinthe: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I approach Hyacinthe and say hello.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'talk to Hyacinthe',
            explicitMeans: 'say hello',
            identifyTargets: { ActionTargets: ['Hyacinthe'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Hyacinthe', { initPreset: { romanticOpen: true, userNonHuman: true }, establishedRelationship: false })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Hyacinthe.currentDisposition, { B: 4, F: 1, H: 1 });
      assert.equal(report.trackerUpdate.npcs.Hyacinthe.establishedRelationship, 'N');
      assert.equal(auditIncludes(report, 'initPreset=romanticOpen'), true);
      assert.equal(auditIncludes(report, 'userNonHuman":"Y'), true);
    },
  },
  {
    name: '09d.1 establishedRelationship semantic flag remains separate from initPreset',
    run() {
      const tracker = {
        Seraphina: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I approach Seraphina and accept her confession.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AcceptConfession',
            identifyChallenge: 'accept confession',
            explicitMeans: 'accept confession',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina', { initPreset: { romanticOpen: true }, establishedRelationship: true })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 4, F: 1, H: 1 });
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
      assert.equal(auditIncludes(report, 'initPreset=romanticOpen'), true);
    },
  },
  {
    name: '10 failed hostile action still adds hostile pressure',
    run() {
      const report = runCase({
        userText: 'I punch the guard.',
        dice: [2, 18, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'PunchGuard',
            identifyChallenge: 'punch the guard',
            explicitMeans: 'punch the guard',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Guard.hostilePressure >= 1, true);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target !== 'No Change', true);
    },
  },
  {
    name: '11 multi-attack caps landed actions at three',
    run() {
      const report = runCase({
        userText: 'I punch twice and kick twice.',
        dice: [20, 1, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'MultiAttack',
            identifyChallenge: 'punch twice and kick twice',
            explicitMeans: 'punch twice and kick twice',
            identifyTargets: { ActionTargets: ['Raider'], OppTargets: { NPC: ['Raider'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            actionCount: ['a1', 'a2', 'a3', 'a4'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Raider')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.actions, ['a1', 'a2', 'a3']);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LandedActions, 3);
    },
  },
  {
    name: '12 nuanced three-strike sequence preserves three actions',
    run() {
      const report = runCase({
        userText: 'I slash, turn the momentum into a backhand cut, then drive an elbow into him.',
        dice: [20, 10, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackSequence',
            identifyChallenge: 'slash, backhand cut, elbow strike',
            explicitMeans: 'slash, backhand cut, elbow strike',
            identifyTargets: { ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            actionCount: ['slash', 'backhand cut', 'elbow strike'],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Duelist')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.actions, ['a1', 'a2', 'a3']);
    },
  },
  {
    name: '12a partial multi-hit injury only narrates landed action count',
    run() {
      const tracker = {
        Val: trackerEntry({ currentCoreStats: { Rank: 'Weak', MainStat: 'PHY', PHY: 1, MND: 1, CHA: 1 } }),
      };
      const report = runCase({
        userText: 'I slap her, pivot on my foot, drive my knee into her stomach, and finally headbutt her.',
        tracker,
        dice: [12, 18, 1, 1, 1, 1],
        ledger: baseLedger({
          engineContext: {
            userCoreStats: { Rank: 'Strong', MainStat: 'PHY', PHY: 10, MND: 5, CHA: 5 },
          },
          resolutionEngine: {
            identifyGoal: 'AttackVal',
            identifyChallenge: 'slap Val, knee her stomach, headbutt her',
            explicitMeans: 'slap Val, knee strike, headbutt',
            identifyTargets: { ActionTargets: ['Val'], OppTargets: { NPC: ['Val'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            actionCount: ['slap', 'knee strike', 'headbutt'],
            actionUnits: [
              { id: 'A1', action: '{{user}} slaps Val across the face', evidence: 'evidence-a1-raw' },
              { id: 'A2', action: '{{user}} knees Val in the stomach', evidence: 'evidence-a2-raw' },
              { id: 'A3', action: '{{user}} headbutts Val', evidence: 'evidence-a3-raw' },
            ],
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Val')],
          injuryEffectEngine: {
            effects: [
              { target: 'Val', targetRole: 'oppTarget', effectType: 'physical_injury', bodyPart: 'face', description: 'slap to the face', severity: 'minor', persistence: 'lasting', affectsAction: true },
              { target: 'Val', targetRole: 'oppTarget', effectType: 'physical_injury', bodyPart: 'stomach', description: 'knee strike to the stomach', severity: 'moderate', persistence: 'lasting', affectsAction: true },
              { target: 'Val', targetRole: 'oppTarget', effectType: 'physical_injury', bodyPart: 'head', description: 'headbutt to the head', severity: 'moderate', persistence: 'lasting', affectsAction: true },
            ],
          },
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(resolution.LandedActions, 1);
      assert.equal(resolution.InflictedInjuries.length, 1);
      assert.equal(report.trackerUpdate.npcs.Val.wounds.length, 1);
      assert.match(report.auditLines.join('\n'), /actionUnits=\[A1: \{\{user\}\} slaps Val across the face \| evidence="evidence-a1-raw"; A2: \{\{user\}\} knees Val in the stomach \| evidence="evidence-a2-raw"; A3: \{\{user\}\} headbutts Val \| evidence="evidence-a3-raw"\]/);
      const text = prompt(report);
      assert.match(text, /attemptedActions:\nA1: \{\{user\}\} slaps Val across the face\.\nA2: \{\{user\}\} knees Val in the stomach\.\nA3: \{\{user\}\} headbutts Val\./);
      assert.match(text, /attemptedActionResults:\nA1: SUCCESS - This action SUCCEEDS narrowly\. It lands or takes hold with limited visible impact\./);
      assert.match(text, /A2: FAILURE - This action FAILS\. It does NOT land, does NOT take hold, and does NOT produce a completed effect\./);
      assert.match(text, /A3: FAILURE - This action FAILS\. It does NOT land, does NOT take hold, and does NOT produce a completed effect\./);
      assert.doesNotMatch(text, /evidence-a[123]-raw/);
      assert.doesNotMatch(text, /knee strike to the stomach.*headbutt to the head/s);
    },
  },
  {
    name: '13 failed paralyze does not become NPC benefit',
    run() {
      const stakes = emptyStakeMap('none');
      stakes.avoided = 'benefit';
      const report = runCase({
        userText: 'I try to paralyze the duelist.',
        dice: [2, 18, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ParalyzeTarget',
            identifyChallenge: 'paralyze the duelist',
            explicitMeans: 'paralyze the duelist',
            identifyTargets: { ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'supernatural_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Duelist', { auditInteraction: true, stakeChangeByOutcome: stakes })],
        }),
      });
      assert.equal(auditIncludes(report, 'deterministicBenefitReferee'), true);
      assert.notEqual(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
    },
  },
  {
    name: '14 concrete rescue can produce Bond',
    run() {
      const stakes = emptyStakeMap('none');
      stakes.success = 'benefit';
      const report = runCase({
        userText: 'I shove the falling beam away before it crushes Mara.',
        dice: [18, 5, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'RescueMara',
            identifyChallenge: 'shove falling beam away',
            explicitMeans: 'rescue Mara from falling beam',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: ['falling beam'] }, BenefitedObservers: ['Mara'], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Mara', { auditInteraction: true, stakeChangeByOutcome: stakes })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
    },
  },
  {
    name: '14a hostile direct/opposed target cannot receive Bond from generic success benefit',
    run() {
      const stakes = emptyStakeMap('none');
      stakes.success = 'benefit';
      const report = runCase({
        userText: 'I step between Darai and the ogre, forcing the ogre back long enough for Darai to move.',
        dice: [18, 8, 1, 1, 1, 1, 1, 1],
        tracker: {
          Ogre: trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, dominantLock: 'HOSTILITY' }),
          Darai: trackerEntry({ currentDisposition: { B: 2, F: 3, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ProtectDaraiFromOgre',
            identifyChallenge: 'step between Darai and the ogre and force the ogre back',
            explicitMeans: 'interpose against the ogre to protect Darai',
            identifyTargets: {
              ActionTargets: ['Ogre'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Darai'],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['interpose'],
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            boundaryPressure: {
              present: true,
              type: 'space_access',
              targetNPC: 'Ogre',
              objectOrAccess: 'space between Darai and the ogre',
              evidence: 'step between Darai and the ogre and force the ogre back',
            },
          },
          relationshipEngine: [
            relationship('Ogre', { auditInteraction: true, stakeChangeByOutcome: stakes }),
            relationship('Darai', { auditInteraction: true, stakeChangeByOutcome: stakes }),
          ],
        }),
      });
      const ogre = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Ogre');
      const darai = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Darai');
      assert.notEqual(ogre.Target, 'Bond');
      assert.equal(ogre.Target, 'Hostility');
      assert.equal(ogre.NPC_STAKES, 'Y');
      assert.equal(darai.Target, 'Bond');
      assert.equal(auditIncludes(report, 'deterministicStakeChangeReferee'), true);
    },
  },
  {
    name: '14b cooperative first aid remains direct aid, not living opposition',
    run() {
      const stakes = emptyStakeMap('none');
      stakes.success = 'benefit';
      const report = runCase({
        userText: 'I kneel beside Darai and bandage the cut across his thigh.',
        dice: [16, 5, 1, 1, 1, 1, 1, 1],
        tracker: {
          Darai: trackerEntry({
            currentDisposition: { B: 2, F: 2, H: 2 },
            condition: 'wounded',
            wounds: ['bleeding cut across the thigh'],
          }),
          Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TreatDaraiWound',
            identifyChallenge: 'bandage Darai thigh wound',
            explicitMeans: 'first aid bandage for Darai',
            identifyTargets: {
              ActionTargets: ['Darai'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            actionCount: ['bandage wound'],
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [
            relationship('Darai', { auditInteraction: true, stakeChangeByOutcome: stakes }),
            relationship('Seraphina'),
          ],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.ActionTargets, ['Darai']);
      const darai = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Darai');
      assert.equal(darai.Target, 'Bond');
      assert.equal(darai.NPC_STAKES, 'Y');
      assert.equal(auditIncludes(report, 'cooperativeAidNoLivingOppositionRepair'), true);
    },
  },
  {
    name: '14c natural treatment cannot repeat after HP changes for the same wound state',
    run() {
      const health = {
        seed: 'test-health-seed',
        user: {
          maxHp: 10,
          currentHp: 7,
          lastDamageStateKey: '7:10:wounded',
          naturalTreatmentKey: '',
        },
      };
      const first = runCase({
        userText: 'I bandage my wound.',
        cardFields: { health },
        userState: { condition: 'wounded', wounds: ['cut arm'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TreatOwnWound',
            identifyChallenge: 'bandage my wound',
            explicitMeans: 'bandage my wound with first aid',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
        }),
      });
      assert.equal(first.hiddenHealth.after.user.currentHp, 10);
      assert.equal(first.hiddenHealth.events[0].treatmentKey, '7:10:wounded');

      const second = runCase({
        userText: 'I bandage the same wound again.',
        cardFields: {
          health: {
            seed: 'test-health-seed',
            user: {
              maxHp: 10,
              currentHp: 8,
              lastDamageStateKey: '7:10:wounded',
              naturalTreatmentKey: '7:10:wounded',
            },
          },
        },
        userState: { condition: 'wounded', wounds: ['cut arm'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TreatOwnWound',
            identifyChallenge: 'bandage the same wound again',
            explicitMeans: 'bandage the same wound again with first aid',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
        }),
      });
      assert.equal(second.hiddenHealth.after.user.currentHp, 8);
    },
  },
  {
    name: '14d completed safe recovery transition restores hidden HP to full',
    run() {
      const report = runCase({
        userText: 'By morning at the inn, I recover after a safe night of lodging.',
        cardFields: {
          health: {
            seed: 'test-health-seed',
            user: { maxHp: 10, currentHp: 4, lastDamageStateKey: '4:10:badly_wounded' },
          },
        },
        userState: { condition: 'badly_wounded', wounds: ['deep cut'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'RecoverAtInn',
            identifyChallenge: 'safe overnight recovery at the inn',
            explicitMeans: 'by morning after safe lodging',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
        }),
      });
      assert.equal(report.hiddenHealth.after.user.currentHp, 10);
      assert.equal(report.trackerUpdate.user.condition, 'healthy');
      assert.deepEqual(report.trackerUpdate.user.wounds, []);
    },
  },
  {
    name: '14e dungeon rest does not trigger full natural recovery',
    run() {
      const report = runCase({
        userText: 'I sleep until morning in the dungeon corridor.',
        cardFields: {
          health: {
            seed: 'test-health-seed',
            user: { maxHp: 10, currentHp: 4, lastDamageStateKey: '4:10:badly_wounded' },
          },
        },
        userState: { condition: 'badly_wounded', wounds: ['deep cut'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'RestInDungeon',
            identifyChallenge: 'sleep in the dungeon corridor until morning',
            explicitMeans: 'sleep in the dungeon corridor until morning',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
        }),
      });
      assert.equal(report.hiddenHealth.after.user.currentHp, 4);
      assert.equal(report.trackerUpdate.user.condition, 'badly_wounded');
    },
  },
  {
    name: '15 user broken leg impairs mobility roll',
    run() {
      const report = runCase({
        userText: 'I try to jump over the fence.',
        userState: { condition: 'badly_wounded', wounds: ['broken left leg'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'JumpFence',
            identifyChallenge: 'jump over the fence',
            explicitMeans: 'jump over the fence',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: ['fence'] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
        }),
      });
      const impairment = report.finalNarrativeHandoff.resolutionPacket.UserImpairment;
      assert.equal(impairment.Relevant, 'Y');
      assert.equal(impairment.AppliedToRoll, 'Y');
      assert.equal(impairment.Stage, 'severe');
    },
  },
  {
    name: '15a speech wound does not mechanically penalize social roll',
    run() {
      const report = runCase({
        userText: 'I speak carefully and try to persuade the merchant.',
        userState: { condition: 'healthy', wounds: ['broken jaw'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'PersuadeMerchant',
            identifyChallenge: 'persuade the merchant',
            explicitMeans: 'speak carefully and persuade the merchant',
            identifyTargets: { ActionTargets: ['Merchant'], OppTargets: { NPC: ['Merchant'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Merchant')],
        }),
      });
      const impairment = report.finalNarrativeHandoff.resolutionPacket.UserImpairment;
      assert.equal(impairment.Relevant, 'Y');
      assert.equal(impairment.MatchedActionFunction, 'speech');
      assert.equal(impairment.AppliedToRoll, 'N');
      assert.equal(impairment.RollPenalty, 0);
    },
  },
  {
    name: '16 user broken leg impairs defense against counterattack',
    run() {
      const report = runCase({
        userText: 'I swing at the guard.',
        dice: [1, 20, 1, 20, 1, 1, 15, 10],
        userState: { condition: 'badly_wounded', wounds: ['broken left leg'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackGuard',
            identifyChallenge: 'swing at the guard',
            explicitMeans: 'swing at the guard',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      const aggro = report.finalNarrativeHandoff.aggressionResults.Guard;
      assert.equal(aggro.AttackType, 'CounterAttack');
      assert.equal(aggro.AttackStat, 'PHY');
      assert.equal(aggro.DefenseStat, 'PHY');
      assert.equal(aggro.UserImpairment.Relevant, 'Y');
      assert.equal(aggro.UserImpairment.AppliedToRoll, 'Y');
    },
  },
  {
    name: '16a MND-dominant NPC aggression uses MND against user defense',
    run() {
      const tracker = {
        Witch: trackerEntry({
          currentCoreStats: { Rank: 'Elite', MainStat: 'MND', PHY: 3, MND: 9, CHA: 4 },
        }),
      };
      const report = runCase({
        userText: 'I strike at the witch and leave myself open.',
        tracker,
        dice: [1, 20, 1, 20, 1, 1, 10, 10],
        userState: { condition: 'healthy', wounds: ['splitting headache'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackWitch',
            identifyChallenge: 'strike at the witch and leave myself open',
            explicitMeans: 'strike at the witch and leave myself open',
            identifyTargets: { ActionTargets: ['Witch'], OppTargets: { NPC: ['Witch'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Witch')],
        }),
      });
      const aggro = report.finalNarrativeHandoff.aggressionResults.Witch;
      assert.equal(aggro.AttackType, 'CounterAttack');
      assert.equal(aggro.AttackStat, 'MND');
      assert.equal(aggro.DefenseStat, 'MND');
      assert.equal(aggro.UserImpairment.Relevant, 'Y');
      assert.match(auditPrompt(report), /Witch\/CounterAttack\/.*attackStat:MND\/defenseStat:MND\/style:magical\/mental\/supernatural/);
      assert.match(auditPrompt(report), /- aggression\.roll\.Witch:/);
      assert.match(prompt(report), /context-appropriate magic, mental force, supernatural pressure, will, focus, or other non-social power/);
      assert.match(prompt(report), /magic, mental force, supernatural pressure/);
    },
  },
  {
    name: '16b CHA-dominant NPC aggression ignores CHA and uses stronger PHY or MND',
    run() {
      const tracker = {
        Siren: trackerEntry({
          currentCoreStats: { Rank: 'Elite', MainStat: 'CHA', PHY: 4, MND: 6, CHA: 10 },
        }),
      };
      const report = runCase({
        userText: 'I attack the siren and overextend.',
        tracker,
        dice: [1, 20, 1, 20, 1, 1, 10, 10],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackSiren',
            identifyChallenge: 'attack the siren and overextend',
            explicitMeans: 'attack the siren and overextend',
            identifyTargets: { ActionTargets: ['Siren'], OppTargets: { NPC: ['Siren'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Siren')],
        }),
      });
      const aggro = report.finalNarrativeHandoff.aggressionResults.Siren;
      assert.equal(aggro.AttackType, 'CounterAttack');
      assert.equal(aggro.AttackStat, 'MND');
      assert.equal(aggro.DefenseStat, 'MND');
      assert.notEqual(aggro.AttackStat, 'CHA');
      assert.match(auditPrompt(report), /attackStat:MND\/defenseStat:MND/);
    },
  },
  {
    name: '17 NPC broken arm impairs NPC defense',
    run() {
      const tracker = { Guard: trackerEntry({ wounds: ['broken sword arm'] }) };
      const report = runCase({
        userText: 'I attack the guard with my blade.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackGuard',
            identifyChallenge: 'attack the guard with my blade',
            explicitMeans: 'attack the guard with my blade',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.NPCImpairment.Relevant, 'Y');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.NPCImpairment.AppliedToRoll, 'Y');
    },
  },
  {
    name: '18 NPC broken arm impairs counterattack offense',
    run() {
      const tracker = { Guard: trackerEntry({ wounds: ['broken sword arm'] }) };
      const report = runCase({
        userText: 'I slash at the guard and overextend.',
        tracker,
        dice: [1, 20, 1, 20, 1, 1, 15, 10],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackGuard',
            identifyChallenge: 'slash at the guard and overextend',
            explicitMeans: 'slash at the guard and overextend',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      const aggro = report.finalNarrativeHandoff.aggressionResults.Guard;
      assert.equal(aggro.AttackType, 'CounterAttack');
      assert.equal(aggro.NPCImpairment.Relevant, 'Y');
      assert.equal(aggro.NPCImpairment.AppliedToRoll, 'Y');
    },
  },
  {
    name: '19 landed knee-break creates persistent NPC injury',
    run() {
      const report = runCase({
        userText: 'I kick at Seraphina\'s knee as hard as possible, hoping to break her leg.',
        dice: [19, 10, 1, 1, 1, 1],
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 1, F: 4, H: 3 },
            currentCoreStats: { Rank: 'Average', MainStat: 'MND', PHY: 3, MND: 6, CHA: 5 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BreakSeraphinaLeg',
            identifyChallenge: 'kick Seraphina\'s knee as hard as possible',
            explicitMeans: 'kick Seraphina\'s knee as hard as possible',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: ['Seraphina'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            actionCount: [],
          },
          relationshipEngine: [relationship('Seraphina', {
            genStats: { CapabilityPool: 'common', MainStat: 'MND' },
          })],
          injuryEffectEngine: {
            effects: [{
              target: 'Seraphina',
              targetRole: 'OppTarget',
              effectType: 'physical_injury',
              bodyPart: 'knee',
              description: 'knee injury',
              severityFloor: 'severe',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Seraphina');
      assert.equal(injuries[0].condition, 'critical');
      assert.match(injuries[0].woundsAdd[0], /knee/);
      assert.equal(report.trackerUpdate.npcs.Seraphina.condition, 'critical');
      assert.equal(report.trackerUpdate.npcs.Seraphina.statusEffects.some(item => /mobility impairment/i.test(item)), true);
      assert.match(auditPrompt(report), /- injury\.inflictedNpc: npc:Seraphina\/condition:critical/);
      assert.match(prompt(report), /Seraphina receives critical condition/);
    },
  },
  {
    name: '20 harmed observer receives user-inflicted injury without ActionTargets fallback',
    run() {
      const report = runCase({
        userText: 'I swing the crate into the guard beside him, trying to break his ribs.',
        dice: [19, 10, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry({
            currentDisposition: { B: 1, F: 2, H: 3 },
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 4, CHA: 4 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BreakGuardRibs',
            identifyChallenge: 'swing the crate into the guard to break his ribs',
            explicitMeans: 'swing the crate into the guard to break his ribs',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: ['heavy crate'] }, BenefitedObservers: [], HarmedObservers: ['Guard'] },
            harmMode: 'lethal',
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            actionCount: ['swing crate'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
          injuryEffectEngine: {
            effects: [{
              target: 'Guard',
              targetRole: 'HarmedObserver',
              effectType: 'physical_injury',
              bodyPart: 'ribs',
              description: 'rib injury',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Guard');
      assert.match(injuries[0].woundsAdd[0], /rib|body|chest/i);
      assert.equal(report.trackerUpdate.npcs.Guard.condition !== 'healthy', true);
    },
  },
  {
    name: '21 emotional harmed observer does not receive physical injury',
    run() {
      const report = runCase({
        userText: 'I slash the guard across the ribs while his father watches in horror.',
        dice: [19, 10, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry(),
          Father: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'WoundGuard',
            identifyChallenge: 'slash the guard across the ribs',
            explicitMeans: 'slash the guard across the ribs while his father watches',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: ['Father'] },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            actionCount: ['slash'],
          },
          relationshipEngine: [relationship('Guard'), relationship('Father')],
          injuryEffectEngine: {
            effects: [{
              target: 'Guard',
              targetRole: 'OppTarget',
              effectType: 'physical_injury',
              bodyPart: 'ribs',
              description: 'rib injury',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.some(injury => injury.NPC === 'Guard'), true);
      assert.equal(injuries.some(injury => injury.NPC === 'Father'), false);
      assert.equal(report.trackerUpdate.npcs.Guard.condition, 'critical');
      assert.equal(report.trackerUpdate.npcs.Father.condition, 'healthy');
    },
  },
  {
    name: '21a lethal nat20 critical user attack kills primary target',
    run() {
      const report = runCase({
        userText: 'I drive my sword through the guard.',
        dice: [20, 1, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'KillGuard',
            identifyChallenge: 'drive a sword through the guard',
            explicitMeans: 'drive a sword through the guard',
            identifyTargets: { hostilesInScene: { NPC: ['Guard'] }, ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            harmMode: 'lethal',
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
            actionCount: ['sword thrust'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      const injuries = resolution.InflictedInjuries;
      assert.equal(resolution.harmMode, 'lethal');
      assert.equal(resolution.OutcomeTier, 'Critical_Success');
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Guard');
      assert.equal(injuries[0].condition, 'dead');
      assert.equal(injuries[0].FatalityTrigger, 'nat20_critical_success');
      assert.equal(report.trackerUpdate.npcs.Guard.condition, 'dead');
      assert.match(auditPrompt(report), /injury\.inflictedNpc: npc:Guard\/condition:dead/);
      assert.match(prompt(report), /Guard dies\. Narrate death clearly in final prose\./);
      assert.match(prompt(report), /natural 20, and Critical_Success/);
    },
  },
  {
    name: '21b nonlethal nat20 critical user attack does not kill target',
    run() {
      const report = runCase({
        userText: 'I land a clean training strike on the duelist during sparring.',
        dice: [20, 1, 1, 1, 1, 1],
        tracker: {
          Duelist: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 4 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'WinSparringExchange',
            identifyChallenge: 'land a clean training strike during sparring',
            explicitMeans: 'land a clean training strike during sparring',
            identifyTargets: { hostilesInScene: { NPC: [] }, ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            harmMode: 'nonlethal',
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            actionCount: ['training strike'],
          },
          relationshipEngine: [relationship('Duelist', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      const injuries = resolution.InflictedInjuries;
      assert.equal(resolution.harmMode, 'nonlethal');
      assert.equal(resolution.OutcomeTier, 'Critical_Success');
      assert.equal(resolution.LandedActions, 1);
      assert.match(prompt(report), /attemptedActionResults:\nA1: SUCCESS - This action SUCCEEDS decisively\. It lands or takes hold with major visible impact according to the action and scene\./);
      assert.doesNotMatch(prompt(report), /LIMITED SUCCESS|COMPLETE SUCCESS/);
      assert.equal(injuries.some(injury => injury.condition === 'dead'), false);
      assert.notEqual(report.trackerUpdate.npcs.Duelist.condition, 'dead');
      assert.doesNotMatch(prompt(report), /receives dead condition/);
    },
  },
  {
    name: '21c landed lethal hit finishes badly wounded target',
    run() {
      const report = runCase({
        userText: 'I cut the badly wounded guard again.',
        dice: [10, 10, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry({
            condition: 'badly_wounded',
            wounds: ['deep thigh wound'],
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FinishGuard',
            identifyChallenge: 'cut the badly wounded guard again',
            explicitMeans: 'cut the badly wounded guard again',
            identifyTargets: { hostilesInScene: { NPC: ['Guard'] }, ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            harmMode: 'lethal',
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
            actionCount: ['cut'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      const injuries = resolution.InflictedInjuries;
      assert.equal(resolution.LandedActions > 0, true);
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Guard');
      assert.equal(injuries[0].condition, 'dead');
      assert.equal(injuries[0].FatalityTrigger, 'finish_off_badly_wounded');
      assert.equal(report.trackerUpdate.npcs.Guard.condition, 'dead');
      assert.match(prompt(report), /Guard dies\. Narrate death clearly in final prose\./);
      assert.match(prompt(report), /already badly_wounded/);
    },
  },
  {
    name: '21d landed lethal hit finishes critical target',
    run() {
      const report = runCase({
        userText: 'I stab the critical raider before he can raise the axe.',
        dice: [10, 10, 1, 1, 1, 1],
        tracker: {
          Raider: trackerEntry({
            condition: 'critical',
            wounds: ['punctured lung'],
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 3, CHA: 2 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FinishRaider',
            identifyChallenge: 'stab the critical raider',
            explicitMeans: 'stab the critical raider',
            identifyTargets: { hostilesInScene: { NPC: ['Raider'] }, ActionTargets: ['Raider'], OppTargets: { NPC: ['Raider'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            harmMode: 'lethal',
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
            actionCount: ['stab'],
          },
          relationshipEngine: [relationship('Raider', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Raider');
      assert.equal(injuries[0].condition, 'dead');
      assert.equal(injuries[0].FatalityTrigger, 'finish_off_critical');
      assert.equal(report.trackerUpdate.npcs.Raider.condition, 'dead');
      assert.match(prompt(report), /Raider dies/);
    },
  },
  {
    name: '21e ordinary landed lethal hit against healthy target does not auto-kill',
    run() {
      const report = runCase({
        userText: 'I slash the guard with my sword.',
        dice: [10, 10, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'SlashGuard',
            identifyChallenge: 'slash the guard with a sword',
            explicitMeans: 'slash the guard with a sword',
            identifyTargets: { hostilesInScene: { NPC: ['Guard'] }, ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            harmMode: 'lethal',
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
            actionCount: ['slash'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      const injuries = resolution.InflictedInjuries;
      assert.equal(resolution.OutcomeTier, 'Minor_Success');
      assert.equal(injuries.some(injury => injury.condition === 'dead'), false);
      assert.notEqual(report.trackerUpdate.npcs.Guard.condition, 'dead');
      assert.doesNotMatch(prompt(report), /receives dead condition/);
    },
  },
  {
    name: '21f lethal HP-zero user hit kills target',
    run() {
      const report = runCase({
        userText: 'I slash the weakened guard with my sword.',
        dice: [10, 10, 1, 1, 1, 1],
        cardFields: {
          health: {
            seed: 'test-health-seed',
            npcs: { Guard: { maxHp: 10, currentHp: 3 } },
          },
        },
        tracker: {
          Guard: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'SlashGuard',
            identifyChallenge: 'slash the weakened guard with a sword',
            explicitMeans: 'slash the weakened guard with a sword',
            identifyTargets: { hostilesInScene: { NPC: ['Guard'] }, ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            harmMode: 'lethal',
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
            actionCount: ['sword slash'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(resolution.harmMode, 'lethal');
      assert.equal(report.hiddenHealth.after.npcs.Guard.dead, true);
      assert.equal(report.trackerUpdate.npcs.Guard.condition, 'dead');
      assert.equal(resolution.InflictedInjuries[0].condition, 'dead');
      assert.match(prompt(report), /harmful method is LETHAL/);
      assert.match(prompt(report), /Guard dies/);
    },
  },
  {
    name: '21g nonlethal HP-zero user hit incapacitates target instead of killing',
    run() {
      const report = runCase({
        userText: 'I punch the weakened brawler until he drops.',
        dice: [10, 10, 1, 1, 1, 1],
        cardFields: {
          health: {
            seed: 'test-health-seed',
            npcs: { Brawler: { maxHp: 10, currentHp: 3 } },
          },
        },
        tracker: {
          Brawler: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'DropBrawler',
            identifyChallenge: 'punch the weakened brawler until he drops',
            explicitMeans: 'punch the weakened brawler with bare hands',
            identifyTargets: { hostilesInScene: { NPC: ['Brawler'] }, ActionTargets: ['Brawler'], OppTargets: { NPC: ['Brawler'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            harmMode: 'nonlethal',
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            activeHostileThreat: true,
            actionCount: ['punch'],
          },
          relationshipEngine: [relationship('Brawler', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(resolution.harmMode, 'nonlethal');
      assert.equal(report.hiddenHealth.after.npcs.Brawler.dead, false);
      assert.equal(report.hiddenHealth.after.npcs.Brawler.nonlethalDefeat, true);
      assert.equal(report.trackerUpdate.npcs.Brawler.condition, 'incapacitated');
      assert.equal(resolution.InflictedInjuries[0].condition, 'incapacitated');
      assert.match(prompt(report), /harmful method is NONLETHAL/);
      assert.doesNotMatch(prompt(report), /Brawler dies/);
    },
  },
  {
    name: '21h restraint control does not create HP damage or hostile combat by itself',
    run() {
      const report = runCase({
        userText: 'I grab Mira by the wrists to stop her from leaving.',
        dice: [10, 10, 1, 1, 1, 1],
        cardFields: {
          health: {
            seed: 'test-health-seed',
            npcs: { Mira: { maxHp: 10, currentHp: 10 } },
          },
        },
        tracker: {
          Mira: trackerEntry({
            currentDisposition: { B: 1, F: 2, H: 3 },
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 4 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'StopMiraLeaving',
            identifyChallenge: 'grab Mira by the wrists to stop her from leaving',
            explicitMeans: 'grab wrists and prevent movement',
            identifyTargets: { hostilesInScene: { NPC: ['Mira'] }, ActionTargets: ['Mira'], OppTargets: { NPC: ['Mira'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            harmMode: 'restraint_control',
            rollNeeded: true,
            rollReason: 'fresh restraint/autonomy stake',
            challengeType: 'restraint',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            restraintControl: {
              present: true,
              targetNPC: 'Mira',
              evidence: 'grab Mira by the wrists to stop her from leaving',
            },
            actionCount: ['wrist grab'],
          },
          relationshipEngine: [relationship('Mira', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
          injuryEffectEngine: {
            effects: [{
              target: 'Mira',
              targetRole: 'OppTarget',
              effectType: 'restraint',
              bodyPart: 'wrists',
              description: 'wrists pinned',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(resolution.harmMode, 'restraint_control');
      assert.equal(resolution.restraintControl.Present, 'Y');
      assert.equal(resolution.challengeType, 'restraint');
      assert.equal(report.hiddenHealth.after.npcs.Mira.currentHp, 10);
      assert.equal(report.trackerUpdate.npcs.Mira.condition, 'healthy');
      assert.deepEqual(report.hiddenHealth.events.filter(event => event.source === 'user_action'), []);
      assert.match(report.trackerUpdate.npcs.Mira.statusEffects.join(', '), /pinned/);
      assert.match(prompt(report), /RESTRAINT\/CONTROL, not a damaging attack/);
      assert.doesNotMatch(prompt(report), /Mira dies/);
    },
  },
  {
    name: '22 name generation is deterministic and prompt offers approved pool',
    run() {
      const ctx = context('The butcher smiles and says his name is...');
      const report = withDice([10, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], () => runDeterministicEngines(
        baseLedger({
          resolutionEngine: {
            identifyGoal: 'LearnName',
            identifyChallenge: 'butcher says his name is',
            explicitMeans: 'butcher says his name is',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          nameSemantic: {
            selectedStyle: 'Balanced Fantasy',
            maleCandidates: ['Ravon', 'Versobom', 'Talor'],
            femaleCandidates: ['Nulira', 'Staistu', 'Shavira'],
            locationCandidates: ['Koravalen', 'Vaisailnok', 'Navarosh'],
          },
        }),
        {},
        ctx,
        'normal',
      ));
      const pool = report.finalNarrativeHandoff.nameGeneration.namePool;
      assert.equal(report.finalNarrativeHandoff.nameGeneration.style, 'Balanced Fantasy');
      assert.equal(pool.male.length, 3);
      assert.equal(pool.female.length, 3);
      assert.equal(pool.location.length, 3);
      assert.equal('semanticCandidates' in report.finalNarrativeHandoff.nameGeneration, false);
      assert.equal('semanticAccepted' in report.finalNarrativeHandoff.nameGeneration, false);
      assert.equal('semanticRejected' in report.finalNarrativeHandoff.nameGeneration, false);
      assert.equal('replacements' in report.finalNarrativeHandoff.nameGeneration, false);
      assert.equal(report.finalNarrativeHandoff.nameGeneration.deterministicCue, 'deterministic style profile');
      for (const name of [...pool.male, ...pool.female, ...pool.location]) {
        assert.match(name, /^[A-Z][a-z]{4,13}$/);
        assert.doesNotMatch(name, /(?:Ravon|Talor|Nulira|Shavira|Koravalen|Navarosh|Versobom|Maibivun|Staistu|Vaisailnok|stai|biv|bom|sailn|lnok|ivun)/i);
      }
      const modelPrompt = prompt(report);
      assert.match(modelPrompt, /Reveal a NEW person, entity, or location name ONLY when it is revealed in the current scene/);
      assert.match(modelPrompt, /IF you are about to introduce a NEW name, you MUST use EXACTLY ONE UNUSED name from the appropriate pool below:/);
      assert.match(modelPrompt, /FEMALE: /);
      assert.match(modelPrompt, /MALE: /);
      assert.match(modelPrompt, /LOCATION: /);
      assert.match(modelPrompt, /Previously revealed names MUST remain unchanged\./);
      assert.match(modelPrompt, /Using the provided names for EVERY NEW name is MANDATORY and NON-NEGOTIABLE\./);
      assert.match(modelPrompt, /Any unauthorized NEW name renders the response INVALID\./);
      assert.match(modelPrompt, /DO NOT invent, modify, combine, translate, or derive names\./);
      assert.match(modelPrompt, /DO NOT use ANY NEW name outside the appropriate pool\./);
      assert.doesNotMatch(modelPrompt, /Name reveal is LOCKED and GATED|If no name is revealed in-scene|Do NOT create a name reveal just because someone or somewhere appears/);
      assert.match(modelPrompt, /Follow nameReveal strictly: do NOT reveal new names unless gated by NAME REVEAL; when a name is revealed, use only the listed generated names\./);
      assert.doesNotMatch(modelPrompt, /rejected semantic candidates/i);
      assert.doesNotMatch(modelPrompt, /Name branch:/);
      assert.doesNotMatch(modelPrompt, /approved generated name pool in ACTIVE_BRANCH_FACTS/);
      for (const name of [...pool.male, ...pool.female, ...pool.location]) {
        assert.equal(modelPrompt.includes(name), true);
      }
      assert.doesNotMatch(modelPrompt, /Ravon|Talor|Nulira|Shavira|Koravalen|Navarosh|Versobom|Staistu|Vaisailnok/);
      assert.match(auditPrompt(report), /nameGeneration\.result: style: Balanced Fantasy; final: Male:/);
      assert.equal(auditIncludes(report, 'namePoolMode=deterministicStyleProfile'), true);
      assert.equal(auditIncludes(report, 'STEP 5: BUILD DETERMINISTIC NAME POOL'), true);
      assert.equal(auditIncludes(report, 'STEP 5: EXECUTE NameGenerationEngine'), false);
      assert.doesNotMatch(auditPrompt(report), /semanticCandidates|rejected:|replacements:|Ravon|Talor|Nulira|Shavira|Koravalen|Navarosh|Versobom|Staistu|Vaisailnok/);
      assert.match(auditPrompt(report), /final: Male:/);
      const reserved = ctx.chatMetadata.structuredPreflightNameRegistry?.used || [];
      assert.equal(pool.male.every(name => reserved.includes(name)), true);
      assert.equal(pool.female.every(name => reserved.includes(name)), true);
      assert.equal(pool.location.every(name => reserved.includes(name)), true);
      const engineSource = fs.readFileSync(extensionFile('engines.js'), 'utf8');
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      assert.doesNotMatch(engineSource, /function NameGenerationEngine/);
      assert.doesNotMatch(semanticSource, /NameGenerationEngine/);
    },
  },
  {
    name: '22a narrator prompt exposes person and location name pools distinctly',
    run() {
      const report = runCase({
        userText: 'Introduce two unnamed travelers and a nearby ruined shrine.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'IntroduceScene',
            identifyChallenge: 'introduce two unnamed travelers and a nearby ruined shrine',
            explicitMeans: 'introduce two unnamed travelers and a nearby ruined shrine',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
        }),
      });
      const text = prompt(report);
      assert.match(text, /Reveal a NEW person, entity, or location name ONLY when it is revealed in the current scene/);
      assert.match(text, /IF you are about to introduce a NEW name, you MUST use EXACTLY ONE UNUSED name from the appropriate pool below:/);
      assert.match(text, /FEMALE: [A-Z]/);
      assert.match(text, /MALE: [A-Z]/);
      assert.match(text, /LOCATION: [A-Z]/);
      assert.match(text, /Previously revealed names MUST remain unchanged\./);
      assert.match(text, /Using the provided names for EVERY NEW name is MANDATORY and NON-NEGOTIABLE\./);
      assert.match(text, /Any unauthorized NEW name renders the response INVALID\./);
      assert.match(text, /DO NOT use ANY NEW name outside the appropriate pool\./);
      assert.doesNotMatch(text, /Name reveal is LOCKED and GATED|If no name is revealed in-scene|Do NOT name background, incidental, unseen, or merely described figures/);
      assert.doesNotMatch(text, /Name branch:/);
      assert.doesNotMatch(text, /approved generated name pool in ACTIVE_BRANCH_FACTS/);
      assert.doesNotMatch(text, /semanticCandidates|rejected:|replacements:|rejected semantic candidates/i);
    },
  },
  {
    name: '22a.1 name style setting deterministically changes generated pool',
    run() {
      const base = {
        userText: 'The old map says the ruined harbor is called...',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'LearnPlaceName',
            identifyChallenge: 'ruined harbor is called',
            explicitMeans: 'ruined harbor is called',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
        }),
      };
      const balanced = runCase(base);
      const norse = runCase({
        ...base,
        cardFields: {
          structuredPreflightSettings: { nameStyle: 'Norse / Old Germanic Fantasy' },
        },
      });
      assert.equal(norse.finalNarrativeHandoff.nameGeneration.style, 'Norse / Old Germanic Fantasy');
      assert.notDeepEqual(norse.finalNarrativeHandoff.nameGeneration.namePool, balanced.finalNarrativeHandoff.nameGeneration.namePool);
      assert.match(auditPrompt(norse), /nameGeneration\.result: style: Norse \/ Old Germanic Fantasy;/);
    },
  },
  {
    name: '22a.2 modern name style deterministically uses contemporary single-token names',
    run() {
      const baseResolution = {
        identifyGoal: 'LearnModernNames',
        identifyChallenge: 'the new neighbors introduce themselves near the apartment lobby',
        explicitMeans: 'new neighbors introduce themselves',
        identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
        rollNeeded: false,
      };
      const modern = runCase({
        userText: 'The new neighbors introduce themselves near the apartment lobby.',
        cardFields: {
          structuredPreflightSettings: { nameStyle: 'Modern' },
        },
        ledger: baseLedger({
          resolutionEngine: baseResolution,
        }),
      });
      const fantasy = runCase({
        userText: 'The new neighbors introduce themselves near the apartment lobby.',
        ledger: baseLedger({
          resolutionEngine: baseResolution,
        }),
      });
      const modernPool = modern.finalNarrativeHandoff.nameGeneration.namePool;
      assert.equal(modern.finalNarrativeHandoff.nameGeneration.style, 'Modern');
      assert.equal(modernPool.male.length, 3);
      assert.equal(modernPool.female.length, 3);
      assert.equal(modernPool.location.length, 3);
      assert.equal(modern.finalNarrativeHandoff.nameGeneration.deterministicCue, 'deterministic style profile');
      const modernMale = ['Adrian', 'Marcus', 'Victor', 'Nolan', 'Ethan', 'Kevin', 'Brian', 'Simon', 'Lucas', 'Caleb', 'Julian', 'Martin', 'Wesley', 'Carter', 'David', 'James', 'Robert', 'Michael'];
      const modernFemale = ['Olivia', 'Sophia', 'Amelia', 'Elena', 'Rachel', 'Hannah', 'Megan', 'Julia', 'Carmen', 'Monica', 'Isabel', 'Vanessa', 'Serena', 'Denise', 'Sarah', 'Alice', 'Eleanor', 'Natalie'];
      const modernLocations = ['Riverton', 'Riverside', 'Brookfield', 'Fairview', 'Westbridge', 'Oakmont', 'Hillcrest', 'Pinecrest', 'Lakewood', 'Redford', 'Ashfield', 'Eastvale', 'Millhaven', 'Briarwood', 'Clearwater', 'Northgate', 'Westhaven', 'Kingsport'];
      assert.equal(modernPool.male.every(name => modernMale.includes(name)), true);
      assert.equal(modernPool.female.every(name => modernFemale.includes(name)), true);
      assert.equal(modernPool.location.every(name => modernLocations.includes(name)), true);
      assert.match(auditPrompt(modern), /nameGeneration\.result: style: Modern;/);
      assert.notDeepEqual(fantasy.finalNarrativeHandoff.nameGeneration.namePool, modernPool);
    },
  },
  {
    name: '22b non-coercive social opposition success does not damage relationship',
    run() {
      const report = runCase({
        userText: 'I haggle with Orlan over rope, keeping my tone civil.',
        dice: [19, 16, 1, 1, 1, 1],
        tracker: {
          Orlan: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Haggle',
            identifyChallenge: 'haggle civilly over rope price',
            explicitMeans: 'civil haggling',
            identifyTargets: { ActionTargets: ['Orlan'], OppTargets: { NPC: ['Orlan'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Orlan')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Orlan.currentDisposition.H, 2);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(auditIncludes(report, '3.4c routeDispositionTarget=No Change'), true);
    },
  },
  {
    name: '22b.1 living social target omitted from OppTargets is repaired away from ENV',
    run() {
      const report = runCase({
        userText: 'I ask Darai what she knows about her missing husband.',
        dice: [8, 16, 1, 1, 1, 1],
        tracker: {
          Darai: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'CHA', PHY: 1, MND: 2, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AskDarai',
            identifyChallenge: 'ask Darai for information about her missing husband to help find him',
            explicitMeans: 'ask Darai calmly',
            identifyTargets: { ActionTargets: ['Darai'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Darai')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['Darai']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.ENV, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.OutcomeTier, 'Failure');
      assert.equal(auditIncludes(report, 'deterministicLivingOppositionRepair'), true);
      assert.equal(auditIncludes(report, 'challengeStats={USER:CHA,OPP:CHA'), true);
      assert.match(auditPrompt(report), /resolution\.rollFull: 1d20\(8\) \+ CHA\(6\) = 14 vs 1d20\(16\) \+ CHA\(3\) = 19 \(-5 - Failure\)/);
    },
  },
  {
    name: '22c threat posture without aggression omits triggersAggressionRoll N',
    run() {
      const report = runCase({
        userText: 'I pressure Mira to guide me through the ridge immediately despite the risk.',
        dice: [10, 20, 20, 1, 20, 1, 1, 1],
        tracker: {
          Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 3 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'PersuadeMira',
            identifyChallenge: 'persuade Mira to guide me through the dangerous ridge immediately',
            explicitMeans: 'pressure Mira verbally',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: ['Mira'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      const auditText = auditPrompt(report);
      assert.match(auditText, /proactivity\.result: Mira: THREAT_OR_POSTURE/);
      assert.doesNotMatch(auditText, /triggersAggressionRoll:N/);
    },
  },
  {
    name: '23 semantic status effect creates impairment when landed',
    run() {
      const report = runCase({
        userText: 'I channel a binding spell at the duelist to lock his limbs in place.',
        dice: [18, 8, 1, 1, 1, 1],
        tracker: {
          Duelist: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BindDuelist',
            identifyChallenge: 'bind the duelist with magic',
            explicitMeans: 'binding spell locks the duelist limbs',
            identifyTargets: { ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'supernatural_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            actionCount: ['binding spell'],
          },
          relationshipEngine: [relationship('Duelist')],
          injuryEffectEngine: {
            effects: [{
              target: 'Duelist',
              targetRole: 'OppTarget',
              effectType: 'restraint',
              bodyPart: 'body',
              description: 'magical limb binding',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Duelist');
      assert.equal(injuries[0].woundsAdd.length, 0);
      assert.equal(injuries[0].statusAdd.some(item => /mobility impairment/i.test(item)), true);
      assert.equal(report.trackerUpdate.npcs.Duelist.statusEffects.some(item => /mobility impairment/i.test(item)), true);
    },
  },
  {
    name: '24 semantic status effect is ignored when roll fails',
    run() {
      const report = runCase({
        userText: 'I try to poison the guard with a numbing hex.',
        dice: [1, 20, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'PoisonGuard',
            identifyChallenge: 'poison the guard with a hex',
            explicitMeans: 'numbing poison hex',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'supernatural_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            actionCount: ['poison hex'],
          },
          relationshipEngine: [relationship('Guard')],
          injuryEffectEngine: {
            effects: [{
              target: 'Guard',
              targetRole: 'OppTarget',
              effectType: 'poison',
              bodyPart: 'body',
              description: 'numbing poison',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 0);
      assert.equal(report.trackerUpdate.npcs.Guard.statusEffects.length, 0);
    },
  },
  {
    name: '25 name generation produces location-like name pool entries',
    run() {
      const report = runCase({
        userText: 'The old map says the ruined harbor is called...',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'LearnPlaceName',
            identifyChallenge: 'ruined harbor is called',
            explicitMeans: 'ruined harbor is called',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
        }),
      });
      const locations = report.finalNarrativeHandoff.nameGeneration.namePool.location;
      assert.equal(locations.length, 3);
      assert.match(locations[0], /^[A-Z][a-z]{6,13}$/);
    },
  },
  {
    name: '26 non-combat success lands one action without becoming combat',
    run() {
      const report = runCase({
        userText: 'I politely persuade the clerk to let me see the old ledger.',
        dice: [18, 8, 1, 1, 1, 1],
        tracker: {
          Clerk: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'PersuadeClerk',
            identifyChallenge: 'politely persuade the clerk',
            explicitMeans: 'polite persuasion',
            identifyTargets: { ActionTargets: ['Clerk'], OppTargets: { NPC: ['Clerk'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            actionCount: ['a1'],
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Clerk')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.LandedActions, 1);
      assert.equal(packet.classifyCombatActionSequence, 'N');
      assert.equal(packet.CounterPotential, 'none');
    },
  },
  {
    name: '27 mixed combat sequence can land up to action count',
    run() {
      const report = runCase({
        userText: 'I cast a fireball at the raider, then rush in and swing my sword.',
        dice: [20, 1, 1, 1, 1, 1],
        tracker: {
          Raider: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'DefeatRaider',
            identifyChallenge: 'cast a fireball and swing a sword',
            explicitMeans: 'fireball then sword swing',
            identifyTargets: { ActionTargets: ['Raider'], OppTargets: { NPC: ['Raider'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            actionCount: ['fireball', 'sword swing'],
            challengeType: 'supernatural_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Raider')],
          injuryEffectEngine: {
            effects: [{
              target: 'Raider',
              targetRole: 'OppTarget',
              effectType: 'burn',
              bodyPart: 'body',
              description: 'fire burns',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(packet.actions, ['a1', 'a2']);
      assert.equal(packet.classifyCombatActionSequence, 'Y');
      assert.equal(packet.LandedActions, 2);
    },
  },
  {
    name: '28 narrator translates chaos tags into concise guidance',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            identifyChallenge: 'search the ruined shrine for a hidden record',
            explicitMeans: 'careful search',
          },
        },
        finalNarrativeHandoff: {
          generationType: 'normal',
          resolutionPacket: {
            GOAL: 'SearchShrine',
            RollNeeded: 'Y',
            OutcomeTier: 'Success',
            Outcome: 'solid_impact',
            LandedActions: 1,
            CounterPotential: 'none',
            ActionTargets: ['Seraphina'],
            OppTargets: { NPC: [], ENV: ['ruined shrine'] },
            BenefitedObservers: [],
            HarmedObservers: [],
          },
          npcHandoffs: [{
            NPC: 'Seraphina',
            FinalState: 'B3/F1/H1',
            Behavior: 'FRIENDLY',
            Target: 'No Change',
            NPC_STAKES: 'N',
            Landed: 'Y',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: {
            CHAOS: {
              triggered: true,
              band: 'BENEFICIAL',
              magnitude: 'MODERATE',
              anchor: 'CLUE',
              vector: 'ENVIRONMENT',
            },
          },
          proactivityResults: {},
          aggressionResults: {},
          nameGeneration: {},
          resultLine: 'RESULT solid_impact: 18 vs 1d20(9) = 9',
        },
      };
      const text = prompt(report);
      const audit = auditPrompt(report);
      assert.match(audit, /- chaos\.result: BENEFICIAL\/MODERATE\/CLUE\/ENVIRONMENT/);
      assert.doesNotMatch(text, /MECHANICS_RESULTS/);
      assert.doesNotMatch(text, /- chaos\.result:/);
      assert.match(text, /brief unexpected scene beat/);
      assert.match(text, /creates a useful opening, information, or advantage/);
      assert.match(text, /Make it noticeable but brief/);
      assert.match(text, /information, evidence, a sign, or an overheard detail/);
      assert.match(text, /Choose the concrete implementation freely/);
      assert.match(text, /do not override the main result, consent limits, attacks, injuries, or relationship facts/);
      assert.doesNotMatch(text, /Chaos Guide|\bBENEFICIAL\b|\bMODERATE\b|\bCLUE\b|\bENVIRONMENT\b/);
    },
  },
  {
    name: '28a narrator omits worldEvent when no chaos or power event fires',
    run() {
      const report = runCase({
        userText: 'I greet Seraphina at the campfire.',
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'greet Seraphina',
            identifyChallenge: 'greet Seraphina at the campfire',
            explicitMeans: 'greet Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const text = prompt(report);
      assert.doesNotMatch(text, /\nworldEvent:\n/);
      assert.doesNotMatch(text, /No extra world event is required/);
    },
  },
  {
    name: '29 NPC personality summary persists and informs narration softly',
    run() {
      const report = runCase({
        userText: 'I greet Seraphina at the campfire.',
        tracker: {
          Seraphina: trackerEntry({
            personalitySummary: 'Gentle, observant, and cautious with new trust.',
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'greet Seraphina at the campfire',
            explicitMeans: 'greet Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(handoff.PersonalitySummary, 'Gentle, observant, and cautious with new trust.');
      assert.equal(report.trackerUpdate.npcs.Seraphina.personalitySummary, 'Gentle, observant, and cautious with new trust.');
      assert.match(prompt(report), /npcDispositionAndStyle:/);
      assert.match(prompt(report), /Personality: Gentle, observant, and cautious with new trust\./);
      assert.match(prompt(report), /Use this only for speech style, demeanor, and interaction flavor/);
      assert.match(prompt(report), /Gentle, observant, and cautious with new trust/);
    },
  },
  {
    name: '29b active card character does not receive deterministic personality fallback',
    run() {
      const report = runCase({
        userText: 'I greet Seraphina in her glade.',
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        cardFields: { name2: 'Seraphina' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'greet Seraphina in her glade',
            identifyChallenge: 'greet Seraphina in her glade',
            explicitMeans: 'greet Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const fallback = deterministicPersonalitySummaryForName('Seraphina', 'deterministic-runner');
      assert.equal(report.trackerUpdate.npcs.Seraphina.personalitySummary, '');
      assert.notEqual(report.finalNarrativeHandoff.npcHandoffs[0].PersonalitySummary, fallback);
    },
  },
  {
    name: '29d unprofiled active NPC receives deterministic grounded personality fallback',
    run() {
      const report = runCase({
        userText: 'I ask the gate guard for directions.',
        tracker: {
          'Gate Guard': trackerEntry({
            currentDisposition: { B: 2, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask the gate guard for directions',
            identifyChallenge: 'ask the gate guard for directions',
            explicitMeans: 'ask directions',
            identifyTargets: { ActionTargets: ['Gate Guard'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Gate Guard')],
        }),
      });
      const expected = deterministicPersonalitySummaryForName('Gate Guard', 'deterministic-runner');
      assert.equal(report.trackerUpdate.npcs['Gate Guard'].personalitySummary, expected);
      assert.match(expected, /^temperament: /);
      assert.match(expected, /speech: /);
      assert.match(expected, /interaction: /);
      assert.match(expected, /intensity:medium$/);
      assert.doesNotMatch(expected, /mannerisms?: /);
      assert.doesNotMatch(expected, /tsundere|kuudere|deredere|yandere|dandere/i);
      assert.match(prompt(report), /npcDispositionAndStyle:/);
      assert.match(prompt(report), /Personality: temperament: /);
      assert.match(prompt(report), /Use this only for speech style, demeanor, and interaction flavor/i);
    },
  },
  {
    name: '29e legacy personality mannerisms are stripped before tracker and narration use',
    run() {
      const legacySummary = 'temperament: gentle, reserved; speech: careful and direct; interaction: acknowledges concerns before replying; mannerism: tucks a strand of hair behind her ear; intensity:medium';
      const expected = 'temperament: gentle, reserved; speech: careful and direct; interaction: acknowledges concerns before replying; intensity:medium';
      assert.equal(stripPersonalityMannerismFields(legacySummary), expected);
      assert.equal(
        stripPersonalityMannerismFields('Gentle, observant, and cautious with new trust.'),
        'Gentle, observant, and cautious with new trust.',
      );

      const report = runCase({
        userText: 'I greet Seraphina at the campfire.',
        tracker: {
          Seraphina: trackerEntry({
            personalitySummary: legacySummary,
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'greet Seraphina at the campfire',
            explicitMeans: 'greet Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.personalitySummary, expected);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].PersonalitySummary, expected);

      report.finalNarrativeHandoff.npcHandoffs[0].PersonalitySummary = legacySummary;
      assert.ok(prompt(report).includes(expected));
      assert.doesNotMatch(prompt(report), /tucks a strand of hair behind her ear/i);
      assert.doesNotMatch(auditPrompt(report), /tucks a strand of hair behind her ear/i);

      const parsed = parseNarratorTrackerDelta(TRACKER_DELTA_TEMPLATE
        .replace('TrackerUpdateEngine.NPC.count=0', 'TrackerUpdateEngine.NPC.count=1')
        .replace('TrackerUpdateEngine.NPC[0].NPC=(none)', 'TrackerUpdateEngine.NPC[0].NPC=Seraphina')
        .replace('TrackerUpdateEngine.NPC[0].personalitySummary=unchanged', `TrackerUpdateEngine.NPC[0].personalitySummary=${legacySummary}`));
      assert.equal(parsed.npcs[0].personalitySummary, expected);
    },
  },
  {
    name: '29c personality contract keeps internal archetype labels out of visible summaries',
    run() {
      assert.match(TRACKER_DELTA_CONTRACT, /Do not output raw internal labels/i);
      assert.match(TRACKER_DELTA_CONTRACT, /Preferred format: "temperament: \.\.\.; speech: \.\.\.; interaction: \.\.\.; intensity:low\|medium\|high"/);
      assert.match(TRACKER_DELTA_CONTRACT, /Speech and interaction should carry most uniqueness/);
      assert.doesNotMatch(TRACKER_DELTA_CONTRACT, /mannerisms?|visible physical habits?/i);
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const preflightSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      assert.doesNotMatch(semanticSource, /A mannerism is|visible physical tell or habit|mannerism is flexible/i);
      assert.doesNotMatch(preflightSource, /occasional visible physical habits|A mannerism is|Do not force mannerisms/i);
      assert.doesNotMatch(TRACKER_DELTA_CONTRACT, /e\.g\. "tsundere/);
    },
  },
  {
    name: '29c.1 tracker delta inventory contract uses semantic possession state',
    run() {
      assert.match(TRACKER_DELTA_CONTRACT, /semantic possession state established by FINAL_NARRATION, not from a fixed verb list/i);
      assert.match(TRACKER_DELTA_CONTRACT, /hands, pocket, pouch, bag, pack, belt, clothing, stowed equipment/i);
      assert.match(TRACKER_DELTA_CONTRACT, /Verbs such as pick up, take, receive, pocket, tuck away, keep, accept, sling, holster, stow, equip, or carry are examples only/i);
      assert.match(TRACKER_DELTA_CONTRACT, /visible, nearby, mentioned, reachable, desired, attempted, requested, or offered/i);
      assert.match(TRACKER_DELTA_CONTRACT, /Add it only when FINAL_NARRATION confirms possession\/control/i);
      assert.match(TRACKER_DELTA_CONTRACT, /Do not remove inventory merely because an item is drawn, held, inspected, used, shown, referenced, or briefly handled/i);
      assert.match(TRACKER_DELTA_CONTRACT, /Use User\.gearAdd\/gearRemove for visible worn\/equipped gear changes/i);
    },
  },
  {
    name: '29c.2 tracker delta currency contract supports pending semantic payments',
    run() {
      assert.match(TRACKER_DELTA_CONTRACT, /USER CURRENCY DELTA/i);
      assert.match(TRACKER_DELTA_CONTRACT, /receives, earns, is paid, loots, finds, pockets, wins/i);
      assert.match(TRACKER_DELTA_CONTRACT, /pays, spends, gives, loses, is robbed of, has seized/i);
      assert.match(TRACKER_DELTA_CONTRACT, /pendingPrice may also supply the amount/i);
      assert.match(TRACKER_DELTA_CONTRACT, /semantic payment confirmation, not keyword matching/i);
      assert.match(TRACKER_DELTA_CONTRACT, /Do not infer prices, wages, fees, rewards, loot value, balances, conversions, debt, or change/i);
      assert.match(TRACKER_DELTA_TEMPLATE, /TrackerUpdateEngine\.User\.currencyAdd=\(none\)/);
      assert.match(TRACKER_DELTA_TEMPLATE, /TrackerUpdateEngine\.User\.currencyRemove=\(none\)/);
      assert.match(TRACKER_DELTA_TEMPLATE, /EconomyState\.payPendingPrice=N/);
      assert.match(TRACKER_DELTA_TEMPLATE, /EconomyState\.pendingPriceAmount=\(none\)/);
      assert.match(TRACKER_DELTA_TEMPLATE, /EconomyState\.clearPendingPrice=N/);
    },
  },
  {
    name: '29c.3 economy profile and currency delta math are deterministic',
    run() {
      assert.equal(getEconomyProfileForGenre('Isekai').currencyLabel, 'silver (sv)');
      assert.equal(getEconomyProfileForGenre('Cyberpunk').currencyLabel, 'credits (cr)');
      assert.deepEqual(applyCurrencyDelta(['50 sv'], ['25 sv'], ['10 sv']), ['65 sv']);
      assert.deepEqual(applyCurrencyDelta(['3 spirit stones'], ['2 spirit stones'], ['1 spirit stones']), ['4 spirit stones']);
      assert.deepEqual(applyCurrencyDelta(['two ration chits'], ['one ration chit'], []), ['two ration chits', 'one ration chit']);
      assert.deepEqual(applyCurrencyDelta(['50 sv'], [], ['5 silver']), ['45 sv']);
      assert.deepEqual(applyCurrencyDelta(['10 dollars'], ['$5'], ['3 dollars']), ['$12']);
      assert.deepEqual(normalizeCurrencyList(['12 silver coins']), ['12 sv']);
    },
  },
  {
    name: '29c.4 preflight tracker deltas never spend or award currency',
    run() {
      const report = runCase({
        userText: 'I pay the innkeeper.',
        userState: { currency: ['50 sv'] },
        ledger: baseLedger({
          trackerUpdateEngine: {
            user: {
              ...emptyUserDelta(),
              currencyAdd: ['100 sv'],
              currencyRemove: ['10 sv'],
            },
            npcs: [],
          },
        }),
      });
      assert.deepEqual(report.trackerUpdate.user.currency, ['50 sv']);
    },
  },
  {
    name: '29c.5 pending price state supports semantic payment confirmation',
    run() {
      const quoteDelta = normalizeEconomyDelta({
        pendingPrice: {
          amount: '5 silver',
          item: 'one night at the inn',
          payee: 'the innkeeper',
          evidence: '"Five silver for the room."',
        },
      });
      const quoted = applyEconomyDelta({}, quoteDelta, { messageKey: 'chat:1' });
      assert.deepEqual(quoted.pendingPrice, {
        amount: '5 sv',
        item: 'one night at the inn',
        payee: 'the innkeeper',
        evidence: '"Five silver for the room."',
      });

      const paymentDelta = normalizeEconomyDelta({
        payPendingPrice: 'Y',
        clearPendingPrice: 'Y',
        pendingPrice: {
          amount: '5 silver',
          item: 'one night at the inn',
          payee: 'the innkeeper',
          evidence: '"Five silver for the room."',
        },
      });
      assert.deepEqual(mergePendingPricePaymentCurrencyRemove([], quoted, paymentDelta), ['5 sv']);
      assert.deepEqual(applyCurrencyDelta(['50 sv'], [], mergePendingPricePaymentCurrencyRemove([], quoted, paymentDelta)), ['45 sv']);
      assert.deepEqual(applyEconomyDelta(quoted, paymentDelta), normalizeEconomyState({}));
    },
  },
  {
    name: '29c.6 NPC loot rank mapping uses deterministic economy value tiers',
    run() {
      const expected = {
        Weak: ['cheap', '10 sv-25 sv', 'trivial', '1 sv-5 sv', 40],
        Average: ['standard', '50 sv-150 sv', 'cheap', '10 sv-25 sv', 55],
        Trained: ['expensive', '300 sv-800 sv', 'standard', '50 sv-150 sv', 70],
        Elite: ['luxury', '1000 sv-3000 sv', 'expensive', '300 sv-800 sv', 85],
        Boss: ['elite', '5000 sv+', 'luxury', '1000 sv-3000 sv', 100],
      };
      for (const [rank, values] of Object.entries(expected)) {
        const profile = getNpcLootRankProfile(rank, 'Isekai');
        assert.deepEqual([
          profile.equipmentTier,
          profile.equipmentValueRange,
          profile.currencyTier,
          profile.currencyValueRange,
          profile.currencyChance,
        ], values);
        assert.match(profile.materialGuidance, /material|wood|bone|leather|iron|steel|craft/i);
      }

      const first = buildDeterministicLootEnvelope({
        rank: 'Boss',
        target: 'Blackguard Captain',
        targetKind: 'humanoid',
        genre: 'Isekai',
        seed: 'loot-test-seed',
      });
      const second = buildDeterministicLootEnvelope({
        rank: 'Boss',
        target: 'Blackguard Captain',
        targetKind: 'humanoid',
        genre: 'Isekai',
        seed: 'loot-test-seed',
      });
      assert.deepEqual(first, second);
      assert.match(first.currencyAmount, /^(?:1\d{3}|2\d{3}|3000) sv$/);
      assert.equal(first.maxNewMundaneItems, 2);
      assert.equal(first.magicStone, null);

      const other = buildDeterministicLootEnvelope({
        rank: 'Average',
        target: 'Ancient Automaton',
        targetKind: 'other',
        genre: 'Isekai',
        seed: 'loot-test-seed',
      });
      assert.equal(other.maxNewMundaneItems, 0);
      assert.equal(other.currencyAmount, '');
      assert.equal(other.magicStone, null);
    },
  },
  {
    name: '29c.6a equipment defense tiers and protective classification are deterministic',
    run() {
      assert.deepEqual(
        ['trivial', 'cheap', 'standard', 'expensive', 'luxury', 'elite'].map(equipmentDefenseBonusForTier),
        [0, 0, 1, 2, 3, 4],
      );
      assert.equal(equipmentTierForCurrencyAmount('1 sv'), 'trivial');
      assert.equal(equipmentTierForCurrencyAmount('25 sv'), 'cheap');
      assert.equal(equipmentTierForCurrencyAmount('150 sv'), 'standard');
      assert.equal(equipmentTierForCurrencyAmount('800 sv'), 'expensive');
      assert.equal(equipmentTierForCurrencyAmount('3000 sv'), 'luxury');
      assert.equal(equipmentTierForCurrencyAmount('5000 sv'), 'elite');
      assert.equal(equipmentTierForCurrencyAmount('5,000 cr'), 'elite');
      assert.equal(equipmentTierForCurrencyAmount('$5,000'), 'elite');
      assert.equal(equipmentTierForCurrencyAmount('credits 5,000'), 'elite');

      for (const item of ['fitted steel breastplate', 'iron shield', 'ballistic vest', 'powered armor', 'lamellar cuirass']) {
        assert.equal(isProtectiveEquipmentItem(item), true, `${item} should count as protective equipment`);
      }
      for (const item of ['steel sword', 'travel clothes', 'brass locket', 'broken plate armor', 'armor-piercing rifle', 'anti-armor launcher', 'armor repair kit', 'shield generator manual']) {
        assert.equal(isProtectiveEquipmentItem(item), false, `${item} should not count as usable protective equipment`);
      }

      const defense = resolveEquipmentDefense({
        gear: ['cheap buckler', 'orichalcum helmet', 'steel sword'],
        equipmentTiers: [
          { item: 'cheap buckler', tier: 'cheap' },
          { item: 'orichalcum helmet', tier: 'elite' },
          { item: 'steel sword', tier: 'elite' },
        ],
      });
      assert.deepEqual(defense, {
        Eligible: 'Y',
        AppliedToRoll: 'Y',
        Item: 'orichalcum helmet',
        Tier: 'elite',
        Bonus: 4,
        Reason: 'highest-tier equipped protective item',
      });
      assert.equal(resolveEquipmentDefense({
        gear: [],
        equipmentTiers: [{ item: 'orichalcum plate armor', tier: 'elite' }],
      }).AppliedToRoll, 'N');
    },
  },
  {
    name: '29c.6b user equipment tiers persist privately and normalize with ownership',
    run() {
      const state = normalizeTrackerUserState({
        gear: ['steel breastplate'],
        inventory: ['folded riot armor'],
        equipmentTiers: [{ item: 'steel breastplate', tier: 'luxury' }],
      });
      assert.deepEqual(state.equipmentTiers, [
        { item: 'steel breastplate', tier: 'luxury' },
        { item: 'folded riot armor', tier: 'standard' },
      ]);

      const afterRemoval = normalizeTrackerUserState({
        ...state,
        gear: [],
        inventory: ['folded riot armor'],
      });
      assert.deepEqual(afterRemoval.equipmentTiers, [
        { item: 'folded riot armor', tier: 'standard' },
      ]);
      const modelState = sanitizeTrackerUserStateForModel(state);
      assert.equal(Object.hasOwn(modelState, 'equipmentTiers'), false);
      assert.deepEqual(modelState.gear, ['steel breastplate']);
      assert.deepEqual(modelState.inventory, ['folded riot armor']);
      assert.ok(buildPersistencePolicy().playerPersistentRuleMutated.includes('equipmentTiers'));
    },
  },
  {
    name: '29c.6c transferred and purchased equipment inherit deterministic value tiers',
    run() {
      const transferred = reconcileUserEquipmentTiers({
        beforeUser: { gear: [], inventory: [] },
        afterUser: { gear: ['captain breastplate'], inventory: [] },
        userDelta: { gearAdd: ['captain breastplate'] },
        npcsBefore: {
          Captain: trackerEntry({
            currentCoreStats: { Rank: 'Elite', MainStat: 'PHY', PHY: 10, MND: 7, CHA: 8 },
            gear: ['captain breastplate'],
          }),
        },
        npcDeltas: [{
          NPC: 'Captain',
          gearRemove: ['captain breastplate'],
          inventoryRemove: ['captain breastplate'],
        }],
      });
      assert.deepEqual(transferred.equipmentTiers, [
        { item: 'captain breastplate', tier: 'luxury' },
      ]);

      const purchased = reconcileUserEquipmentTiers({
        beforeUser: { gear: [], inventory: [] },
        afterUser: { gear: ['riot armor'], inventory: [] },
        userDelta: { gearAdd: ['riot armor'] },
        economyBefore: {
          pendingPrice: {
            amount: '5000 cr',
            item: 'riot armor',
            payee: 'armorer',
            evidence: 'The suit costs 5000 credits.',
          },
        },
        economyDelta: { payPendingPrice: true },
        npcsBefore: {
          Armorer: trackerEntry({
            currentCoreStats: { Rank: 'Weak', MainStat: 'CHA', PHY: 2, MND: 4, CHA: 5 },
            inventory: ['riot armor'],
          }),
        },
        npcDeltas: [{ NPC: 'Armorer', inventoryRemove: ['riot armor'] }],
      });
      assert.deepEqual(purchased.equipmentTiers, [
        { item: 'riot armor', tier: 'elite' },
      ]);
    },
  },
  {
    name: '29c.6d equipped armor modifies only mundane user attacks against physical NPC defense',
    run() {
      const tracker = {
        Sentinel: trackerEntry({
          currentCoreStats: { Rank: 'Boss', MainStat: 'PHY', PHY: 5, MND: 5, CHA: 4 },
          gear: ['orichalcum plate armor'],
        }),
      };
      const attackLedger = challengeType => baseLedger({
        resolutionEngine: {
          identifyGoal: 'StrikeSentinel',
          identifyChallenge: 'strike the sentinel',
          explicitMeans: 'strike the sentinel',
          identifyTargets: {
            hostilesInScene: { NPC: ['Sentinel'] },
            ActionTargets: ['Sentinel'],
            OppTargets: { NPC: ['Sentinel'], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
          },
          rollNeeded: true,
          rollReason: 'The sentinel actively resists.',
          challengeType,
          socialTactic: challengeType === 'social' ? 'diplomacy' : 'none',
          harmMode: challengeType.includes('combat') ? 'nonlethal' : 'none',
          actionCount: ['strike'],
        },
        relationshipEngine: [relationship('Sentinel')],
      });

      const mundane = runCase({
        userText: 'I strike the sentinel.',
        tracker,
        dice: [10, 10, 1, 1, 1, 1],
        ledger: attackLedger('mundane_combat'),
      });
      assert.deepEqual(mundane.finalNarrativeHandoff.resolutionPacket.EquipmentDefense, {
        Eligible: 'Y',
        AppliedToRoll: 'Y',
        Item: 'orichalcum plate armor',
        Tier: 'elite',
        Bonus: 4,
        Reason: 'highest-tier equipped protective item',
      });
      assert.match(mundane.finalNarrativeHandoff.resultLine, /equipment\(elite:4\)/);
      assert.match(auditPrompt(mundane), /equipmentDefense\.target: .*"Tier":"elite".*"Bonus":4/);
      assert.doesNotMatch(prompt(mundane), /EquipmentDefense|TargetEquipmentDefense|equipment\(elite:4\)/);

      const supernatural = runCase({
        userText: 'I strike the sentinel with supernatural force.',
        tracker,
        dice: [10, 10, 1, 1, 1, 1],
        ledger: attackLedger('supernatural_combat'),
      });
      assert.equal(supernatural.finalNarrativeHandoff.resolutionPacket.EquipmentDefense.AppliedToRoll, 'N');
      assert.doesNotMatch(supernatural.finalNarrativeHandoff.resultLine, /equipment\(/);

      for (const challengeType of ['social', 'stealth', 'restraint']) {
        const report = runCase({
          userText: 'I test the sentinel.',
          tracker,
          dice: [10, 10, 1, 1, 1, 1],
          ledger: attackLedger(challengeType),
        });
        assert.equal(report.finalNarrativeHandoff.resolutionPacket.EquipmentDefense.AppliedToRoll, 'N');
        assert.doesNotMatch(report.finalNarrativeHandoff.resultLine, /equipment\(/);
      }

      const environment = runCase({
        userText: 'I force open the barred door.',
        tracker,
        dice: [10, 10, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OpenDoor',
            identifyChallenge: 'force open the barred door',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['barred door'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            rollReason: 'The barred door resists.',
            challengeType: 'environment',
            environmentDifficulty: 4,
            environmentDifficultyTier: 'hard',
          },
        }),
      });
      assert.equal(environment.finalNarrativeHandoff.resolutionPacket.EquipmentDefense.AppliedToRoll, 'N');
      assert.doesNotMatch(environment.finalNarrativeHandoff.resultLine, /equipment\(/);
    },
  },
  {
    name: '29c.6e equipped user armor applies to PHY aggression and MND aggression bypasses it',
    run() {
      const userState = {
        condition: 'healthy',
        wounds: [],
        statusEffects: [],
        gear: ['fitted plate armor'],
        inventory: [],
        equipmentTiers: [{ item: 'fitted plate armor', tier: 'luxury' }],
        tasks: [],
        commitments: [],
      };
      const physical = runCase({
        userText: 'I swing at the guard and leave myself open.',
        tracker: {
          Guard: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 6, MND: 3, CHA: 3 },
          }),
        },
        userState,
        dice: [1, 20, 1, 20, 1, 1, 15, 10],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackGuard',
            identifyChallenge: 'swing at the guard',
            identifyTargets: {
              ActionTargets: ['Guard'],
              OppTargets: { NPC: ['Guard'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            harmMode: 'nonlethal',
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      const physicalAggression = physical.finalNarrativeHandoff.aggressionResults.Guard;
      assert.equal(physicalAggression.AttackStat, 'PHY');
      assert.deepEqual(physicalAggression.TargetEquipmentDefense, {
        Eligible: 'Y',
        AppliedToRoll: 'Y',
        Item: 'fitted plate armor',
        Tier: 'luxury',
        Bonus: 3,
        Reason: 'highest-tier equipped protective item',
      });
      assert.match(auditPrompt(physical), /aggression\.roll\.Guard: .*equipment\(luxury:3\)/);
      assert.deepEqual(physical.trackerUpdate.user.equipmentTiers, userState.equipmentTiers);

      const mental = runCase({
        userText: 'I strike at the witch and leave myself open.',
        tracker: {
          Witch: trackerEntry({
            currentCoreStats: { Rank: 'Elite', MainStat: 'MND', PHY: 3, MND: 9, CHA: 4 },
          }),
        },
        userState,
        dice: [1, 20, 1, 20, 1, 1, 10, 10],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackWitch',
            identifyChallenge: 'strike at the witch',
            identifyTargets: {
              ActionTargets: ['Witch'],
              OppTargets: { NPC: ['Witch'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            harmMode: 'nonlethal',
          },
          relationshipEngine: [relationship('Witch')],
        }),
      });
      const mentalAggression = mental.finalNarrativeHandoff.aggressionResults.Witch;
      assert.equal(mentalAggression.AttackStat, 'MND');
      assert.equal(mentalAggression.TargetEquipmentDefense.AppliedToRoll, 'N');
      assert.equal(mentalAggression.TargetEquipmentDefense.Bonus, 0);
      assert.doesNotMatch(auditPrompt(mental), /aggression\.roll\.Witch: .*equipment\(/);
    },
  },
  {
    name: '29c.6f physical NPC-versus-NPC aggression uses target equipment without stacking',
    run() {
      const report = runCase({
        userText: 'Seraphina, hit the axe raider hard.',
        dice: [
          10, 10, 10, 10, 10, 10,
          10, 10, 10, 10, 10,
          18, 100,
          18, 4,
        ],
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 6, MND: 4, CHA: 4 },
          }),
          'axe raider': trackerEntry({
            currentDisposition: { B: 1, F: 2, H: 4 },
            currentCoreStats: { Rank: 'Elite', MainStat: 'PHY', PHY: 5, MND: 3, CHA: 2 },
            gear: ['fitted steel breastplate', 'iron shield', 'axe'],
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'CommandCompanionAttack',
            identifyChallenge: 'command Seraphina to hit the axe raider',
            explicitMeans: 'command Seraphina to hit the axe raider',
            identifyTargets: {
              hostilesInScene: { NPC: ['axe raider'] },
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            activeHostileThreat: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const aggression = report.finalNarrativeHandoff.aggressionResults.Seraphina;
      assert.equal(aggression.AttackType, 'CompanionAttack');
      assert.equal(aggression.ProactivityTarget, 'axe raider');
      assert.equal(aggression.TargetEquipmentDefense.Item, 'fitted steel breastplate');
      assert.equal(aggression.TargetEquipmentDefense.Tier, 'luxury');
      assert.equal(aggression.TargetEquipmentDefense.Bonus, 3);
      assert.match(auditPrompt(report), /aggression\.roll\.Seraphina: .*equipment\(luxury:3\)/);
      assert.doesNotMatch(prompt(report), /TargetEquipmentDefense|equipment\(luxury:3\)/);
    },
  },
  {
    name: '29c.6g deterministic equipment metadata is excluded from every model handoff',
    run() {
      assert.doesNotMatch(ENGINE_PROMPT_TEXT, /equipmentTiers|EquipmentDefense|TargetEquipmentDefense/);
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      const indexSource = fs.readFileSync(extensionFile('index.js'), 'utf8');
      const aggressionResults = {
        Guard: {
          ReactionOutcome: 'npc_succeeds',
          TargetEquipmentDefense: { Item: 'fitted plate armor', Tier: 'luxury', Bonus: 3 },
          InflictedUserInjury: { severity: 'minor' },
        },
      };
      const trackerModelResults = sanitizeAggressionResultsForTrackerModel(aggressionResults);
      assert.equal(Object.hasOwn(trackerModelResults.Guard, 'TargetEquipmentDefense'), false);
      assert.deepEqual(trackerModelResults.Guard.InflictedUserInjury, { severity: 'minor' });
      assert.equal(Object.hasOwn(aggressionResults.Guard, 'TargetEquipmentDefense'), true);
      assert.match(semanticSource, /const semanticPlayerTrackerSnapshot = sanitizeTrackerUserStateForModel\(playerTrackerSnapshot\)/);
      assert.match(semanticSource, /JSON\.stringify\(semanticPlayerTrackerSnapshot, null, 2\)/);
      assert.match(indexSource, /user: sanitizeTrackerUserStateForModel\(pendingRun\?\.userBefore \|\| \{\}\)/);
      assert.match(indexSource, /user: sanitizeTrackerUserStateForModel\(pendingRun\?\.userAfter \|\| \{\}\)/);
      assert.match(indexSource, /aggressionResults: sanitizeAggressionResultsForTrackerModel\(handoff\.aggressionResults\)/);
      assert.match(indexSource, /function buildPostNarrationTrackerPrompt\(\{ pendingRun, messageKey, narrationText, trackerDisplaySnapshot \}\)/);
      assert.match(indexSource, /beforeUser: clone\(pendingRun\.userBefore\)/);
      assert.match(indexSource, /afterUser: clone\(trackerDisplaySnapshot\.user\)/);
      assert.match(indexSource, /root\.user = normalizeTrackerUserState\(restoreCandidate\.beforeUser \|\| root\.user \|\| \{\}\)/);
    },
  },
  {
    name: '29c.7 explicit dead-target search reveals a one-time humanoid loot envelope',
    run() {
      const report = runCase({
        userText: 'I search the dead bandit for anything he was carrying.',
        tracker: {
          Bandit: trackerEntry({
            condition: 'dead',
            gear: ['worn iron sword'],
            inventory: ['brass locket'],
            currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 8, MND: 5, CHA: 4 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Search the dead bandit for possessions',
            identifyChallenge: 'search the dead bandit',
            lootSearch: {
              attempted: true,
              target: 'Bandit',
              targetKind: 'humanoid',
              evidence: 'search the dead bandit for anything he was carrying',
            },
          },
        }),
      });

      const discovery = report.finalNarrativeHandoff.resolutionPacket.LootDiscovery;
      assert.equal(discovery.Status, 'reveal_once');
      assert.equal(discovery.Target, 'Bandit');
      assert.equal(discovery.Rank, 'Trained');
      assert.equal(discovery.EquipmentTier, 'expensive');
      assert.equal(discovery.MaxNewMundaneItems, 2);
      assert.deepEqual(discovery.ExistingGear, ['worn iron sword']);
      assert.deepEqual(discovery.ExistingInventory, ['brass locket']);
      assert.equal(report.trackerUpdate.npcs.Bandit.lootSearchCompleted, false);
      assert.deepEqual(report.trackerUpdate.npcs.Bandit.inventory, ['brass locket']);
      assert.deepEqual(report.finalNarrativeHandoff.npcEquipmentProfiles, []);
      assert.match(prompt(report), /REVEAL LOOT ONCE/);
      assert.match(prompt(report), /Discovery does NOT place anything in \{\{user\}\} possession/);
    },
  },
  {
    name: '29c.7.1 loot target matching accepts corpse wording and promoted tracker aliases',
    run() {
      const report = runCase({
        userText: "I search the dead bandit's body.",
        tracker: {
          Garrick: trackerEntry({
            aliases: ['Bandit'],
            condition: 'dead',
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            lootSearch: {
              attempted: true,
              target: "the dead Bandit's body",
              targetKind: 'humanoid',
              evidence: "search the dead bandit's body",
            },
          },
        }),
      });

      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LootDiscovery.Status, 'reveal_once');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LootDiscovery.Target, 'Garrick');
      assert.match(ENGINE_PROMPT_TEXT, /Target MUST copy that NPC's exact current tracker key/i);
    },
  },
  {
    name: '29c.7a present NPC equipment guidance follows saved strength without forcing gear',
    run() {
      const report = runCase({
        userText: 'I greet Captain Mira at the gate.',
        tracker: {
          'Captain Mira': trackerEntry({
            currentCoreStats: { Rank: 'Elite', MainStat: 'PHY', PHY: 12, MND: 8, CHA: 9 },
            gear: ['fitted steel breastplate'],
            inventory: ['engraved officer seal'],
            currency: ['40 sv'],
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Greet Captain Mira',
            identifyChallenge: 'greet Captain Mira',
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Captain Mira'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: ['Captain Mira'],
              PowerActors: [],
            },
          },
          relationshipEngine: [relationship('Captain Mira')],
        }),
      });

      const profile = report.finalNarrativeHandoff.npcEquipmentProfiles.find(item => item.NPC === 'Captain Mira');
      assert.equal(profile.Rank, 'Elite');
      assert.equal(profile.EquipmentTier, 'luxury');
      assert.deepEqual(profile.EstablishedGear, ['fitted steel breastplate']);
      assert.deepEqual(profile.EstablishedInventory, ['engraved officer seal']);
      assert.deepEqual(profile.EstablishedCurrency, ['40 sv']);
      assert.deepEqual(report.trackerUpdate.npcs['Captain Mira'].gear, ['fitted steel breastplate']);
      assert.match(prompt(report), /if new visible equipment is described/i);
      assert.match(prompt(report), /established revealed possessions=engraved officer seal/i);
      assert.match(prompt(report), /established revealed currency=40 sv/i);
      assert.match(prompt(report), /continuity only and does not establish presence or require mentioning possessions/i);
    },
  },
  {
    name: '29c.7b same-turn lethal resolution checks finalized health before revealing loot',
    run() {
      const report = runCase({
        userText: 'I cut down the weakened guard, then search his body.',
        dice: [10, 10, 1, 1, 1, 1],
        cardFields: {
          health: {
            seed: 'test-health-seed',
            npcs: { Guard: { maxHp: 10, currentHp: 3 } },
          },
        },
        tracker: {
          Guard: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Kill the guard and search the body',
            identifyChallenge: 'cut down the weakened guard',
            explicitMeans: 'cut down the weakened guard, then search his body',
            identifyTargets: {
              hostilesInScene: { NPC: ['Guard'] },
              ActionTargets: ['Guard'],
              OppTargets: { NPC: ['Guard'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: [],
              PowerActors: [],
            },
            lootSearch: {
              attempted: true,
              target: 'Guard',
              targetKind: 'humanoid',
              evidence: 'then search his body',
            },
            harmMode: 'lethal',
            rollNeeded: true,
            rollReason: 'The guard resists the lethal attack.',
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'cut down the weakened guard',
            socialTactic: 'none',
            activeHostileThreat: true,
            actionCount: ['sword cut'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { CapabilityPool: 'common', MainStat: 'PHY' },
          })],
        }),
      });

      assert.equal(report.hiddenHealth.after.npcs.Guard.dead, true);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LootDiscovery.Status, 'reveal_once');
      assert.equal(report.trackerUpdate.npcs.Guard.lootSearchCompleted, false);
    },
  },
  {
    name: '29c.7b.1 later NPC aggression cannot retroactively make a living search loot-eligible',
    run() {
      const source = fs.readFileSync(extensionFile('deterministic-runner.js'), 'utf8');
      assert.match(source, /healthEvents\.filter\(event => event\?\.source === 'user_action'\)/);
      assert.match(source, /hiddenHealth: healthAfterUserAction/);
    },
  },
  {
    name: '29c.7c same-turn generated NPC rank controls the loot envelope',
    run() {
      const report = runCase({
        userText: 'I finish the weakened warlord, then search his body.',
        dice: [20, 1, 1, 1, 1, 1],
        cardFields: {
          health: {
            seed: 'test-health-seed',
            npcs: { Warlord: { maxHp: 10, currentHp: 3 } },
          },
        },
        tracker: {
          Warlord: trackerEntry({ currentCoreStats: null }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Kill the warlord and search the body',
            identifyChallenge: 'finish the weakened warlord',
            explicitMeans: 'finish the weakened warlord, then search his body',
            identifyTargets: {
              hostilesInScene: { NPC: ['Warlord'] },
              ActionTargets: ['Warlord'],
              OppTargets: { NPC: ['Warlord'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: [],
              PowerActors: [],
            },
            lootSearch: {
              attempted: true,
              target: 'Warlord',
              targetKind: 'humanoid',
              evidence: 'then search his body',
            },
            harmMode: 'lethal',
            rollNeeded: true,
            rollReason: 'The warlord resists the lethal attack.',
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'finish the weakened warlord',
            socialTactic: 'none',
            activeHostileThreat: true,
            actionCount: ['finishing strike'],
            genStats: { CapabilityPool: 'boss', MainStat: 'PHY' },
          },
          relationshipEngine: [relationship('Warlord', {
            genStats: { CapabilityPool: 'boss', MainStat: 'PHY' },
          })],
        }),
      });

      const generated = report.finalNarrativeHandoff.generatedNpcStats.find(item => item.NPC === 'Warlord');
      assert.equal(generated.FinalRank, 'Boss');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LootDiscovery.Rank, 'Boss');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LootDiscovery.EquipmentTier, 'elite');
      assert.equal(report.trackerUpdate.npcs.Warlord.currentCoreStats.Rank, 'Boss');
    },
  },
  {
    name: '29c.8 living and unknown loot targets cannot generate corpse loot',
    run() {
      const living = runCase({
        userText: 'I search Mira for valuables.',
        tracker: { Mira: trackerEntry({ condition: 'healthy' }) },
        ledger: baseLedger({
          resolutionEngine: {
            lootSearch: {
              attempted: true,
              target: 'Mira',
              targetKind: 'humanoid',
              evidence: 'search Mira for valuables',
            },
          },
        }),
      });
      assert.equal(living.finalNarrativeHandoff.resolutionPacket.LootDiscovery.Status, 'target_not_dead');
      assert.equal(living.trackerUpdate.npcs.Mira.lootSearchCompleted, false);
      assert.match(prompt(living), /not deterministically dead/i);
      assert.match(prompt(living), /ordinary scene, boundary, and resolved-action facts/i);

      const unknown = runCase({
        userText: 'I search the stranger\'s corpse.',
        tracker: {
          Bandit: trackerEntry({ condition: 'dead' }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            lootSearch: {
              attempted: true,
              target: 'Unknown Stranger',
              targetKind: 'humanoid',
              evidence: "search the stranger's corpse",
            },
          },
        }),
      });
      assert.equal(unknown.finalNarrativeHandoff.resolutionPacket.LootDiscovery.Status, 'unknown_target');
      assert.equal(unknown.trackerUpdate.npcs['Unknown Stranger'], undefined);
      assert.match(prompt(unknown), /not a tracked body\/remains/i);
      assert.doesNotMatch(prompt(unknown), /Unknown Stranger: established gear/i);
    },
  },
  {
    name: '29c.9 completed loot searches suppress all newly generated loot',
    run() {
      const report = runCase({
        userText: 'I search the bandit again.',
        tracker: {
          Bandit: trackerEntry({
            condition: 'dead',
            gear: ['worn iron sword'],
            inventory: ['brass locket'],
            currency: ['12 sv'],
            lootSearchCompleted: true,
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            lootSearch: {
              attempted: true,
              target: 'Bandit',
              targetKind: 'humanoid',
              evidence: 'search the bandit again',
            },
          },
        }),
      });

      const discovery = report.finalNarrativeHandoff.resolutionPacket.LootDiscovery;
      assert.equal(discovery.Status, 'already_searched');
      assert.deepEqual(discovery.ExistingInventory, ['brass locket']);
      assert.deepEqual(discovery.ExistingCurrency, ['12 sv']);
      assert.equal(discovery.CurrencyAmount, undefined);
      assert.equal(discovery.MagicStone, undefined);
      assert.match(prompt(report), /Reveal NO new possessions, currency, equipment, magic stones/i);
    },
  },
  {
    name: '29c.10 dead monsters yield exactly one rank-scaled mundane commodity stone',
    run() {
      const report = runCase({
        userText: 'I cut open the dead hydra and search its remains for a magic stone.',
        tracker: {
          Hydra: trackerEntry({
            condition: 'dead',
            currentCoreStats: { Rank: 'Boss', MainStat: 'PHY', PHY: 14, MND: 9, CHA: 4 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            lootSearch: {
              attempted: true,
              target: 'Hydra',
              targetKind: 'monster',
              evidence: 'search its remains for a magic stone',
            },
          },
        }),
      });

      const discovery = report.finalNarrativeHandoff.resolutionPacket.LootDiscovery;
      assert.equal(discovery.Status, 'reveal_once');
      assert.equal(discovery.TargetKind, 'monster');
      assert.equal(discovery.MaxNewMundaneItems, 0);
      assert.equal(discovery.CurrencyAmount, '(none)');
      assert.deepEqual(discovery.MagicStone, {
        item: 'magic stone',
        valueTier: 'elite',
        valueRange: '5000 sv+',
        physicalGuidance: 'massive, exceptionally clear, and intensely luminous',
      });
      assert.match(prompt(report), /reveal exactly one magic stone/i);
      assert.match(prompt(report), /recoverable commodity only/i);
      assert.match(prompt(report), /do not give it powers, bonuses, abilities, or system effects/i);
      assert.equal(hasMagicStoneEntry(['two magic stones']), true);
      assert.equal(hasMagicStoneEntry(['a magic-stone shard']), true);

      const establishedStone = runCase({
        userText: 'I search the dead hydra again.',
        tracker: {
          Hydra: trackerEntry({
            condition: 'dead',
            inventory: ['two magic stones'],
            currentCoreStats: { Rank: 'Boss', MainStat: 'PHY', PHY: 14, MND: 9, CHA: 4 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            lootSearch: {
              attempted: true,
              target: 'Hydra',
              targetKind: 'monster',
              evidence: 'search the dead hydra again',
            },
          },
        }),
      });
      assert.equal(establishedStone.finalNarrativeHandoff.resolutionPacket.LootDiscovery.MagicStone, null);
    },
  },
  {
    name: '29c.11 ordinary turns preserve NPC possessions without activating loot',
    run() {
      const report = runCase({
        userText: 'I look down the road.',
        tracker: {
          Bandit: trackerEntry({
            condition: 'dead',
            gear: ['worn iron sword'],
            inventory: ['brass locket'],
            currency: ['12 sv'],
          }),
        },
        ledger: baseLedger(),
      });

      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LootSearch.Attempted, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LootDiscovery, undefined);
      assert.deepEqual(report.trackerUpdate.npcs.Bandit.inventory, ['brass locket']);
      assert.deepEqual(report.trackerUpdate.npcs.Bandit.currency, ['12 sv']);
      assert.equal(report.trackerUpdate.npcs.Bandit.lootSearchCompleted, false);
      assert.doesNotMatch(prompt(report), /REVEAL LOOT ONCE/);
    },
  },
  {
    name: '29c.11a.1 active searched remains retain narrator possession continuity',
    run() {
      const report = runCase({
        userText: 'I take the brass locket from the body.',
        tracker: {
          Bandit: trackerEntry({
            condition: 'dead',
            inventory: ['brass locket'],
            currency: ['12 sv'],
            lootSearchCompleted: true,
          }),
          'Old Raider': trackerEntry({
            condition: 'dead',
            inventory: ['copper ring'],
            lootSearchCompleted: true,
          }),
        },
        ledger: baseLedger(),
      });

      const profile = report.finalNarrativeHandoff.npcEquipmentProfiles.find(item => item.NPC === 'Bandit');
      assert.deepEqual(profile.EstablishedInventory, ['brass locket']);
      assert.deepEqual(profile.EstablishedCurrency, ['12 sv']);
      assert.equal(report.finalNarrativeHandoff.npcEquipmentProfiles.some(item => item.NPC === 'Old Raider'), false);
      assert.match(prompt(report), /established revealed possessions=brass locket/i);
      assert.doesNotMatch(prompt(report), /copper ring/i);
      assert.match(prompt(report), /does not establish presence or require mentioning possessions/i);
    },
  },
  {
    name: '29c.11a other remains authorize no newly generated loot',
    run() {
      const report = runCase({
        userText: 'I search the destroyed automaton for anything recoverable.',
        tracker: {
          'Ancient Automaton': trackerEntry({
            condition: 'dead',
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 2, CHA: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            lootSearch: {
              attempted: true,
              target: 'Ancient Automaton',
              targetKind: 'other',
              evidence: 'search the destroyed automaton',
            },
          },
        }),
      });

      const discovery = report.finalNarrativeHandoff.resolutionPacket.LootDiscovery;
      assert.equal(discovery.Status, 'reveal_once');
      assert.equal(discovery.MaxNewMundaneItems, 0);
      assert.equal(discovery.CurrencyAmount, '(none)');
      assert.equal(discovery.MagicStone, null);
      assert.match(prompt(report), /No newly generated possessions are authorized/i);
      assert.match(prompt(report), /reveal no newly generated currency/i);
      assert.doesNotMatch(prompt(report), /reveal exactly one magic stone/i);
    },
  },
  {
    name: '29c.12 post-narration loot transfer records both sides without duplicate ownership',
    run() {
      const transfer = parseNarratorTrackerDelta(TRACKER_DELTA_TEMPLATE
        .replace('TrackerUpdateEngine.User.inventoryAdd=(none)', 'TrackerUpdateEngine.User.inventoryAdd=brass locket')
        .replace('TrackerUpdateEngine.User.currencyAdd=(none)', 'TrackerUpdateEngine.User.currencyAdd=12 sv')
        .replace('TrackerUpdateEngine.NPC.count=0', 'TrackerUpdateEngine.NPC.count=1')
        .replace('TrackerUpdateEngine.NPC[0].NPC=(none)', 'TrackerUpdateEngine.NPC[0].NPC=Bandit')
        .replace('TrackerUpdateEngine.NPC[0].inventoryRemove=(none)', 'TrackerUpdateEngine.NPC[0].inventoryRemove=brass locket')
        .replace('TrackerUpdateEngine.NPC[0].currencyRemove=(none)', 'TrackerUpdateEngine.NPC[0].currencyRemove=12 sv'),
      "Aelemar takes the brass locket and 12 sv from the bandit's corpse and secures both among his possessions.");

      assert.deepEqual(transfer.user.inventoryAdd, ['brass locket']);
      assert.deepEqual(transfer.user.currencyAdd, ['12 sv']);
      assert.equal(transfer.npcs[0].NPC, 'Bandit');
      assert.deepEqual(transfer.npcs[0].inventoryRemove, ['brass locket']);
      assert.deepEqual(transfer.npcs[0].currencyRemove, ['12 sv']);

      const revealedOnly = parseNarratorTrackerDelta(TRACKER_DELTA_TEMPLATE
        .replace('TrackerUpdateEngine.NPC.count=0', 'TrackerUpdateEngine.NPC.count=1')
        .replace('TrackerUpdateEngine.NPC[0].NPC=(none)', 'TrackerUpdateEngine.NPC[0].NPC=Bandit')
        .replace('TrackerUpdateEngine.NPC[0].inventoryAdd=(none)', 'TrackerUpdateEngine.NPC[0].inventoryAdd=brass locket')
        .replace('TrackerUpdateEngine.NPC[0].currencyAdd=(none)', 'TrackerUpdateEngine.NPC[0].currencyAdd=12 sv'),
      "A brass locket and a pouch holding 12 sv remain inside the dead bandit's coat.");
      assert.deepEqual(revealedOnly.npcs[0].inventoryAdd, ['brass locket']);
      assert.deepEqual(revealedOnly.npcs[0].currencyAdd, ['12 sv']);
      assert.deepEqual(revealedOnly.user.inventoryAdd, []);
      assert.deepEqual(revealedOnly.user.currencyAdd, []);
    },
  },
  {
    name: '29c.12a unambiguous searched-corpse transfers are reconciled on both sides',
    run() {
      const reconciled = reconcileLootPossessionTransfers({
        user: {},
        npcs: {
          Bandit: trackerEntry({
            condition: 'dead',
            inventory: ['brass locket'],
            currency: ['12 sv'],
            lootSearchCompleted: true,
          }),
        },
      }, {
        user: {
          ...emptyUserDelta(),
          inventoryAdd: ['brass locket'],
          currencyAdd: ['12 sv'],
        },
        npcs: [],
      });

      assert.equal(reconciled.npcs.length, 1);
      assert.equal(reconciled.npcs[0].NPC, 'Bandit');
      assert.deepEqual(reconciled.npcs[0].inventoryRemove, ['brass locket']);
      assert.deepEqual(reconciled.npcs[0].currencyRemove, ['12 sv']);
    },
  },
  {
    name: '29c.12b loot completion commits only after required tracking succeeds',
    run() {
      const discovery = {
        Status: 'reveal_once',
        Target: 'Bandit',
        ExistingGear: ['worn iron sword'],
        ExistingInventory: ['brass locket'],
        ExistingCurrency: ['(none)'],
        CurrencyAmount: '12 sv',
        MagicStone: null,
      };
      const incomplete = finalizeLootSearchCompletion({
        Bandit: trackerEntry({
          condition: 'dead',
          gear: ['worn iron sword'],
          inventory: ['brass locket'],
        }),
      }, discovery);
      assert.equal(incomplete.required, true);
      assert.equal(incomplete.completed, false);
      assert.match(incomplete.reason, /currency was not recorded/i);
      assert.equal(incomplete.npcs.Bandit.lootSearchCompleted, false);

      const complete = finalizeLootSearchCompletion({
        Bandit: trackerEntry({
          condition: 'dead',
          gear: ['worn iron sword'],
          inventory: ['brass locket'],
          currency: ['12 sv'],
        }),
      }, discovery);
      assert.equal(complete.completed, true);
      assert.equal(complete.npcs.Bandit.lootSearchCompleted, true);

      const promoted = finalizeLootSearchCompletion({
        Garrick: trackerEntry({
          aliases: ['Bandit'],
          condition: 'dead',
          gear: ['worn iron sword'],
          inventory: ['brass locket'],
          currency: ['12 sv'],
        }),
      }, discovery);
      assert.equal(promoted.completed, true);
      assert.equal(promoted.target, 'Garrick');
      assert.equal(promoted.npcs.Garrick.lootSearchCompleted, true);

      const monsterIncomplete = finalizeLootSearchCompletion({
        Hydra: trackerEntry({ condition: 'dead' }),
      }, {
        Status: 'reveal_once',
        Target: 'Hydra',
        ExistingGear: ['(none)'],
        ExistingInventory: ['(none)'],
        ExistingCurrency: ['(none)'],
        CurrencyAmount: '(none)',
        MagicStone: { item: 'magic stone' },
      });
      assert.equal(monsterIncomplete.completed, false);
      assert.match(monsterIncomplete.reason, /magic stone was not recorded/i);
    },
  },
  {
    name: '29c.13 loot handoff forbids mechanical and invented escalation',
    run() {
      assert.match(TRACKER_DELTA_CONTRACT, /Do not move revealed loot to \{\{user\}\} merely because it is visible, found, reachable, or searched/i);
      assert.match(TRACKER_DELTA_CONTRACT, /remove the exact item\/currency from that NPC and add it to \{\{user\}\} in the same delta/i);
      assert.match(TRACKER_DELTA_CONTRACT, /never duplicate ownership or regenerate removed loot/i);
      assert.match(TRACKER_DELTA_TEMPLATE, /TrackerUpdateEngine\.NPC\[0\]\.inventoryAdd=\(none\)/);
      assert.match(TRACKER_DELTA_TEMPLATE, /TrackerUpdateEngine\.NPC\[0\]\.currencyRemove=\(none\)/);

      const source = fs.readFileSync(extensionFile('pre-flight.js'), 'utf8');
      assert.match(source, /Do NOT create magical equipment, powers, bonuses, rarity labels, plot-critical clues, secret documents, or keys unless already established/);
      assert.match(source, /Do NOT mention ranks, tiers, value-band labels, mechanics, or this instruction/);
      assert.match(source, /Discovery does NOT place anything in \{\{user\}\} possession/);
    },
  },
  {
    name: '29a narrator relationship guide uses refined fear and trust state wording',
    run() {
      const fearReport = runCase({
        userText: 'I speak calmly to Seraphina.',
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 1, F: 3, H: 2 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'speak calmly to Seraphina',
            explicitMeans: 'speak calmly',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.match(prompt(fearReport), /Fear-led: wants distance, safety, witnesses, or an exit/);
      assert.match(prompt(fearReport), /not comfort, attraction, trust, or willingness/);
      assert.doesNotMatch(prompt(fearReport), /submissive/i);

      const trustReport = runCase({
        userText: 'I talk with Mira by the fire.',
        tracker: {
          Mira: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'talk with Mira',
            explicitMeans: 'talk with Mira',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      assert.match(prompt(trustReport), /Behavior toward \{\{user\}\}: Friendly comfort: cooperative, relaxed, warm/);
      assert.match(prompt(trustReport), /not automatic romance or intimacy/);
    },
  },
  {
    name: '30 tracker delta updates NPC personality summary without touching mechanics',
    run() {
      const report = runCase({
        userText: 'I listen while Mira calmly negotiates with the innkeeper.',
        tracker: {
          Mira: trackerEntry({
            personalitySummary: 'Reserved and practical.',
          }),
        },
        ledger: baseLedger({
          trackerUpdateEngine: {
            user: emptyUserDelta(),
            npcs: [{
              NPC: 'Mira',
              personalitySummary: 'Patient, diplomatic, and quietly protective.',
              condition: 'unchanged',
              woundsAdd: [],
              woundsRemove: [],
              statusAdd: [],
              statusRemove: [],
              gearAdd: [],
              gearRemove: [],
            }],
          },
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Mira.personalitySummary, 'Patient, diplomatic, and quietly protective.');
      assert.equal(report.trackerUpdate.npcs.Mira.condition, 'healthy');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.wounds, []);
    },
  },
  {
    name: '31 relationship engine entry alone does not make NPC in scene',
    run() {
      const report = runCase({
        userText: 'I look around the empty road.',
        tracker: {
          Bystander: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
        },
        ledger: baseLedger({
          relationshipEngine: [relationship('Bystander', {
            slowBondEvidence: { cooperation: true, personalAttention: true, playfulness: true },
          })],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.NPCInScene, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs.length, 0);
      assert.equal(report.trackerUpdate.npcs.Bystander.currentRapport, 0);
    },
  },
  {
    name: '32 deterministic proactivity cap allows up to three NPCs',
    run() {
      const tracker = {
        Asha: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
        Bira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
        Cira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
        Dava: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
      };
      const report = runCase({
        userText: 'I ask the group what they think of the route ahead.',
        dice: [
          ...Array(11).fill(10),
          20, 19, 18, 17,
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'GroupDiscussion',
            identifyChallenge: 'ask the group what they think',
            explicitMeans: 'ask the group what they think',
            identifyTargets: {
              ActionTargets: ['Asha', 'Bira', 'Cira', 'Dava'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [
            relationship('Asha'),
            relationship('Bira'),
            relationship('Cira'),
            relationship('Dava'),
          ],
          proactivitySemantic: { cap: 1 },
        }),
      });
      const active = Object.values(report.finalNarrativeHandoff.proactivityResults)
        .filter(value => value.Proactive === 'Y');
      assert.equal(active.length, 3);
      assert.equal(auditIncludes(report, '6.2c cap=3'), true);
    },
  },
  {
    name: '33 post-narration tracker delta uses fenced prefix block and narrator omits it',
    run() {
      assert.match(TRACKER_DELTA_TEMPLATE, /```story_engine_tracker_delta\s*BEGIN_TRACKER_DELTA/i);
      assert.match(TRACKER_DELTA_TEMPLATE, /END_TRACKER_DELTA\s*```/i);
      assert.match(TRACKER_DELTA_TEMPLATE, /TrackerUpdateEngine\.NPC\[0\]\.revealedName=\(none\)/i);
      const prompt = formatNarratorModelPromptContext(runCase({
        userText: 'I take a key.',
        ledger: baseLedger({
          trackerUpdateEngine: {
            user: {
              ...emptyUserDelta(),
              inventoryAdd: ['small iron key'],
            },
            npcs: [],
          },
        }),
      }));
      assert.doesNotMatch(prompt, /```story_engine_tracker_delta/i);
      assert.doesNotMatch(prompt, /BEGIN_TRACKER_DELTA/i);
      assert.match(prompt, /Do not output tracker updates/i);
    },
  },
  {
    name: '33.1 post-narration FameInfamyLedger parses hidden reputation deltas',
    run() {
      const delta = parseNarratorTrackerDelta(TRACKER_DELTA_TEMPLATE
        .replace('FameInfamyLedger.count=0', 'FameInfamyLedger.count=1')
        .replace('FameInfamyLedger[0].location=(none)', 'FameInfamyLedger[0].location=Urakami Village')
        .replace('FameInfamyLedger[0].fameDelta=0', 'FameInfamyLedger[0].fameDelta=1')
        .replace('FameInfamyLedger[0].reason=(none)', 'FameInfamyLedger[0].reason=Protected villagers from raiders')
        .replace('FameInfamyLedger[0].evidence=(none)', 'FameInfamyLedger[0].evidence=The village elder publicly thanks Aelemar'),
      'The village elder publicly thanks Aelemar for protecting the villagers.');
      assert.deepEqual(delta.userReputation.events, [{
        location: 'Urakami Village',
        fameDelta: 1,
        infamyDelta: 0,
        reason: 'Protected villagers from raiders',
        evidence: 'The village elder publicly thanks Aelemar',
      }]);
    },
  },
  {
    name: '33.1c post-narration tracker delta parses currency and economy changes',
    run() {
      const delta = parseNarratorTrackerDelta(TRACKER_DELTA_TEMPLATE
        .replace('TrackerUpdateEngine.User.currencyAdd=(none)', 'TrackerUpdateEngine.User.currencyAdd=50 sv')
        .replace('TrackerUpdateEngine.User.currencyRemove=(none)', 'TrackerUpdateEngine.User.currencyRemove=10 sv')
        .replace('EconomyState.payPendingPrice=N', 'EconomyState.payPendingPrice=Y')
        .replace('EconomyState.pendingPriceAmount=(none)', 'EconomyState.pendingPriceAmount=5 silver')
        .replace('EconomyState.pendingPriceItem=(none)', 'EconomyState.pendingPriceItem=room')
        .replace('EconomyState.pendingPricePayee=(none)', 'EconomyState.pendingPricePayee=innkeeper')
        .replace('EconomyState.pendingPriceEvidence=(none)', 'EconomyState.pendingPriceEvidence=The room is five silver.')
        .replace('EconomyState.clearPendingPrice=N', 'EconomyState.clearPendingPrice=Y'), 'The guild clerk pays over 50 sv, then the room costs 10 sv.');
      assert.deepEqual(delta.user.currencyAdd, ['50 sv']);
      assert.deepEqual(delta.user.currencyRemove, ['10 sv']);
      assert.equal(delta.economy.payPendingPrice, true);
      assert.equal(delta.economy.clearPendingPrice, true);
      assert.deepEqual(delta.economy.pendingPrice, {
        amount: '5 sv',
        item: 'room',
        payee: 'innkeeper',
        evidence: 'The room is five silver.',
      });
    },
  },
  {
    name: '33.1d tracker delta rejects omitted world economy and indexed fields',
    run() {
      assert.throws(
        () => parseNarratorTrackerDelta(TRACKER_DELTA_TEMPLATE.replace(/^WorldStateDelta\.place=.*\r?\n/m, '')),
        /WorldStateDelta\.place/,
      );
      const indexed = TRACKER_DELTA_TEMPLATE
        .replace('TrackerUpdateEngine.NPC.count=0', 'TrackerUpdateEngine.NPC.count=1')
        .replace(/^TrackerUpdateEngine\.NPC\[0\]\.gearRemove=.*\r?\n/m, '');
      assert.throws(() => parseNarratorTrackerDelta(indexed), /TrackerUpdateEngine\.NPC\[0\]\.gearRemove/);
      const missingNpcInventory = TRACKER_DELTA_TEMPLATE
        .replace('TrackerUpdateEngine.NPC.count=0', 'TrackerUpdateEngine.NPC.count=1')
        .replace(/^TrackerUpdateEngine\.NPC\[0\]\.inventoryAdd=.*\r?\n/m, '');
      assert.throws(() => parseNarratorTrackerDelta(missingNpcInventory), /TrackerUpdateEngine\.NPC\[0\]\.inventoryAdd/);
    },
  },
  {
    name: '33.1e tracker delta preserves commas inside pipe-delimited list entries',
    run() {
      const delta = parseNarratorTrackerDelta(TRACKER_DELTA_TEMPLATE
        .replace('TrackerUpdateEngine.User.inventoryAdd=(none)', 'TrackerUpdateEngine.User.inventoryAdd=letter, sealed with red wax | iron key'));
      assert.deepEqual(delta.user.inventoryAdd, ['letter, sealed with red wax', 'iron key']);
    },
  },
  {
    name: '33.1a fame/infamy merge caps each stat to one point per narration',
    run() {
      const merged = mergeUserReputationLedger({}, {
        events: [
          { location: 'Urakami Village', fameDelta: 1, infamyDelta: 0, reason: 'Helped publicly', evidence: 'Villagers saw it' },
          { location: 'Urakami Village', fameDelta: 1, infamyDelta: 0, reason: 'More praise', evidence: 'More witnesses' },
          { location: 'Kuroda City', fameDelta: 0, infamyDelta: 1, reason: 'Public threat', evidence: 'Crowd saw it' },
          { location: 'Kuroda City', fameDelta: 0, infamyDelta: 1, reason: 'More threat', evidence: 'Guard heard it' },
        ],
      });
      assert.equal(merged.locations['Urakami Village'].fame, 1);
      assert.equal(merged.locations['Kuroda City'].infamy, 1);
      assert.equal(merged.history.length, 2);
    },
  },
  {
    name: '33.1b fame/infamy merge reuses existing location casing',
    run() {
      const merged = mergeUserReputationLedger({
        locations: {
          'Urakami Village': { location: 'Urakami Village', fame: 4, infamy: 0, updatedAt: 100 },
        },
      }, {
        events: [
          { location: 'urakami village', fameDelta: 1, infamyDelta: 0, reason: 'Helped publicly', evidence: 'Villagers saw it' },
        ],
      });
      assert.equal(merged.locations['Urakami Village'].fame, 5);
      assert.equal(merged.locations['urakami village'], undefined);
      assert.equal(merged.history[0].location, 'Urakami Village');
    },
  },
  {
    name: '33a hidden power actor enmity records meaningful known setbacks',
    run() {
      const report = runCase({
        userText: 'I burn the Red Glass Syndicate ledger in front of their dock crew.',
        ledger: baseLedger({
          powerActorEnmity: {
            effects: [{
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              sourceTarget: 'Red Glass Syndicate',
              actionUnitId: 'A1',
              explicitlyCompleted: true,
              hasReach: true,
              effect: 'disrupt_operation',
              severity: 'meaningful',
              reason: 'User destroyed their smuggling ledger',
              knownToActor: true,
            }],
          },
        }),
      });
      const actor = report.trackerUpdate.powerActors['Red Glass Syndicate'];
      assert.equal(actor.enmity, 2);
      assert.equal(actor.tier, 'Obstructive');
      assert.equal(actor.type, 'criminal syndicate');
      assert.deepEqual(actor.reasons, ['User destroyed their smuggling ledger']);
      assert.equal(actor.lastEffect.effect, 'disrupt_operation');
      assert.equal(actor.lastEffect.severity, 'meaningful');
      assert.equal(actor.lastEffect.delta, 2);
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.entries[0].Actor, 'Red Glass Syndicate');
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.entries[0].Tier, 'Obstructive');
      assert.match(auditPrompt(report), /- powerActor\.pressure: Red Glass Syndicate \(criminal syndicate\): enmity 2, tier Obstructive/);
      assert.doesNotMatch(prompt(report), /Power actor pressure:/);
      assert.doesNotMatch(prompt(report), /Red Glass Syndicate \(criminal syndicate\): enmity 2/);
      assert.doesNotMatch(prompt(report), /Red Glass Syndicate \(criminal syndicate\): enmity 2/);
      assert.equal(auditIncludes(report, 'STEP 3P: EXECUTE PowerActorEnmity USING SEMANTIC_LEDGER'), true);
      assert.equal(auditIncludes(report, 'powerActorEnmityUpdate='), true);
    },
  },
  {
    name: '33a.0 rolled power actor setbacks require a successful resolved action',
    run() {
      const ledger = () => baseLedger({
        resolutionEngine: {
          identifyGoal: 'destroy the syndicate payment ledger',
          identifyChallenge: 'burn through the protected payment ledger',
          explicitMeans: 'set the protected ledger on fire',
          identifyTargets: {
            hostilesInScene: { NPC: [] },
            ActionTargets: [],
            OppTargets: { NPC: [], ENV: ['protected payment ledger'] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCAwareOfUser: [],
            PowerActors: ['Red Glass Syndicate'],
          },
          rollNeeded: true,
          rollReason: 'the protected ledger may resist destruction',
          challengeType: 'environment',
          challengeTypeEvidence: 'destroying a protected object',
          environmentDifficultyTier: 'hard',
        },
        powerActorEnmity: {
          effects: [{
            actor: 'Red Glass Syndicate',
            actorType: 'criminal syndicate',
            sourceTarget: 'Red Glass Syndicate',
            actionUnitId: 'A1',
            explicitlyCompleted: false,
            hasReach: true,
            effect: 'disrupt_operation',
            severity: 'meaningful',
            reason: 'User destroyed their payment ledger',
            knownToActor: true,
          }],
        },
      });

      const failed = runCase({
        userText: 'I try to burn the protected Red Glass Syndicate ledger.',
        dice: [1, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        ledger: ledger(),
      });
      assert.equal(failed.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'Y');
      assert.equal(failed.finalNarrativeHandoff.resolutionPacket.LandedActions, 0);
      assert.deepEqual(failed.trackerUpdate.powerActors, {});
      assert.equal(auditIncludes(failed, 'resolved action did not succeed or land'), true);

      const succeeded = runCase({
        userText: 'I try to burn the protected Red Glass Syndicate ledger.',
        dice: [20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        ledger: ledger(),
      });
      assert.equal(succeeded.finalNarrativeHandoff.resolutionPacket.LandedActions, 1);
      assert.equal(succeeded.trackerUpdate.powerActors['Red Glass Syndicate'].enmity, 2);
      assert.equal(auditIncludes(succeeded, 'powerActorEnmityUpdate='), true);
    },
  },
  {
    name: '33a.1 power actor assessment is audit-only without enmity pressure',
    run() {
      const report = runCase({
        userText: 'I greet the prominent merchant in the capital as I walk by.',
        tracker: {
          shopkeeper: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'greet the prominent merchant in the capital',
            identifyChallenge: 'greet the prominent merchant in the capital',
            explicitMeans: 'greet the merchant',
            identifyTargets: {
              ActionTargets: ['shopkeeper'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              PowerActors: ['shopkeeper'],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('shopkeeper')],
          powerActorEnmity: {
            assessments: [{
              actor: 'shopkeeper',
              scope: 'individual',
              isPowerActor: true,
              actorType: 'prominent merchant',
              reach: ['capital trade network', 'money', 'reputation'],
              evidence: 'character card says prominent merchant in the capital',
              assessmentReason: 'has influence and trade reach beyond personal reaction',
            }],
            effects: [],
          },
        }),
      });
      const audit = auditPrompt(report);
      const modelPrompt = prompt(report);
      assert.match(audit, /- powerActor\.assessment: shopkeeper\/Y\/individual\/prominent merchant\/reach:capital trade network,money,reputation/);
      assert.match(audit, /- powerActor\.enmityEffect: none/);
      assert.match(audit, /- powerActor\.pressure: none/);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.PowerActors, ['shopkeeper']);
      assert.match(audit, /- resolution\.targets: action:shopkeeper; power:shopkeeper/);
      assert.match(audit, /npc\.state: shopkeeper/);
      assert.doesNotMatch(modelPrompt, /Power actor pressure:/);
      assert.doesNotMatch(modelPrompt, /powerActor\.assessment/);
      assert.doesNotMatch(modelPrompt, /prominent merchant\/reach/);
    },
  },
  {
    name: '33a.2 power actor target bucket does not create relationship by itself',
    run() {
      const report = runCase({
        userText: 'I pass under banners belonging to House Veyra without speaking to anyone.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'pass under House Veyra banners',
            identifyChallenge: 'walk through the street',
            explicitMeans: 'walking',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              PowerActors: ['House Veyra'],
            },
            rollNeeded: false,
          },
          relationshipEngine: [],
          powerActorEnmity: {
            assessments: [{
              actor: 'House Veyra',
              scope: 'organization',
              isPowerActor: true,
              actorType: 'noble house',
              reach: ['guards', 'political leverage'],
              evidence: 'banners identify the house controlling the street',
              assessmentReason: 'noble house has resources and authority',
            }],
            effects: [],
          },
        }),
      });
      const audit = auditPrompt(report);
      assert.deepEqual(report.trackerUpdate.npcs, {});
      assert.deepEqual(report.finalNarrativeHandoff.npcHandoffs, []);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.PowerActors, ['House Veyra']);
      assert.match(audit, /- resolution\.targets: power:House Veyra/);
      assert.match(audit, /- npc\.state: none/);
      assert.match(audit, /- powerActor\.assessment: House Veyra\/Y\/organization\/noble house/);
      assert.doesNotMatch(prompt(report), /Power actor pressure:/);
    },
  },
  {
    name: '33a.3 harmed observer can also be power actor',
    run() {
      const report = runCase({
        userText: 'I publicly shame Lady Veyra by exposing her brother as a fraud.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'publicly shame Lady Veyra through her brother',
            identifyChallenge: 'expose her brother as a fraud in public',
            explicitMeans: 'public accusation',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: ['Lady Veyra'],
              PowerActors: ['Lady Veyra', 'House Veyra'],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Lady Veyra', {
            stakeChangeByOutcome: emptyStakeMap('harm'),
          })],
          powerActorEnmity: {
            assessments: [{
              actor: 'Lady Veyra',
              scope: 'individual',
              isPowerActor: true,
              actorType: 'noblewoman',
              reach: ['family guards', 'social reputation'],
              evidence: 'publicly shamed noblewoman',
              assessmentReason: 'individual has noble-house reach beyond personal reaction',
            }, {
              actor: 'House Veyra',
              scope: 'organization',
              isPowerActor: true,
              actorType: 'noble house',
              reach: ['guards', 'political leverage'],
              evidence: 'her house reputation is implicated',
              assessmentReason: 'house has institutional reach',
            }],
            effects: [{
              actor: 'House Veyra',
              actorType: 'noble house',
              sourceTarget: 'Lady Veyra',
              actionUnitId: 'A1',
              explicitlyCompleted: true,
              hasReach: true,
              effect: 'damage_reputation_or_income',
              severity: 'meaningful',
              reason: 'User publicly exposed a family fraud',
              knownToActor: true,
            }],
          },
        }),
      });
      const audit = auditPrompt(report);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.HarmedObservers, ['Lady Veyra']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.PowerActors, ['Lady Veyra', 'House Veyra']);
      assert.match(audit, /- resolution\.targets: harms:Lady Veyra; power:Lady Veyra,House Veyra/);
      assert.match(audit, /- npc\.state: Lady Veyra/);
      assert.match(audit, /- powerActor\.assessment: Lady Veyra\/Y\/individual\/noblewoman/);
      assert.match(audit, /- powerActor\.enmityEffect: House Veyra\/noble house\/damage_reputation_or_income\/meaningful\/known:Y/);
      assert.match(audit, /- powerActor\.pressure: House Veyra \(noble house\): enmity 2, tier Obstructive/);
      assert.doesNotMatch(prompt(report), /Power actor pressure:/);
      assert.doesNotMatch(prompt(report), /House Veyra \(noble house\): enmity 2/);
    },
  },
  {
    name: '33b hidden power actor enmity ignores ordinary or unknown actors',
    run() {
      const report = runCase({
        userText: 'I insult a random dockhand and quietly steal from a distant baron no one can trace.',
        ledger: baseLedger({
          powerActorEnmity: {
            effects: [
              {
                actor: 'angry dockhand',
                actorType: 'ordinary individual',
                hasReach: false,
                effect: 'humiliate',
                severity: 'minor',
                reason: 'User insulted one ordinary person',
                knownToActor: true,
              },
              {
                actor: 'House Veyr',
                actorType: 'noble house',
                hasReach: true,
                effect: 'steal',
                severity: 'meaningful',
                reason: 'User stole a sealed coin purse without witnesses',
                knownToActor: false,
              },
            ],
          },
        }),
      });
      assert.deepEqual(report.trackerUpdate.powerActors, {});
      assert.deepEqual(report.finalNarrativeHandoff.powerActorPressure.entries, []);
      assert.equal(auditIncludes(report, 'ignoredPowerActorEffect'), true);
      assert.doesNotMatch(prompt(report), /Power actor pressure:/);
    },
  },
  {
    name: '33c hidden power actor enmity escalates existing state without visible NPC tracker exposure',
    run() {
      const report = runCase({
        userText: 'I publicly expose the Red Glass Syndicate captain and hand over their route maps.',
        powerActors: {
          'red glass syndicate': {
            name: 'red glass syndicate',
            type: 'criminal syndicate',
            enmity: 2,
            reasons: ['User destroyed their smuggling ledger'],
            responseHistory: ['paid street toughs to watch the docks'],
            lastEffect: {
              effect: 'disrupt_operation',
              severity: 'meaningful',
              reason: 'User destroyed their smuggling ledger',
              delta: 2,
              at: 100,
            },
          },
        },
        ledger: baseLedger({
          powerActorEnmity: {
            effects: [{
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              sourceTarget: 'Red Glass Syndicate',
              actionUnitId: 'A1',
              explicitlyCompleted: true,
              hasReach: true,
              effect: 'expose',
              severity: 'major',
              reason: 'User publicly exposed their smuggling route maps',
              knownToActor: true,
            }],
          },
        }),
      });
      const actor = report.trackerUpdate.powerActors['red glass syndicate'];
      assert.equal(actor.enmity, 5);
      assert.equal(actor.tier, 'Strategic Campaign');
      assert.deepEqual(actor.reasons, [
        'User destroyed their smuggling ledger',
        'User publicly exposed their smuggling route maps',
      ]);
      assert.equal(actor.responseHistory[0], 'paid street toughs to watch the docks');
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.entries[0].Actor, 'red glass syndicate');
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.entries[0].Tier, 'Strategic Campaign');

      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const displaySource = source.slice(
        source.indexOf('function buildTrackerDisplayHtml'),
        source.indexOf('function cleanTrackerDisplayName'),
      );
      assert.doesNotMatch(displaySource, /powerActors/);
      assert.doesNotMatch(displaySource, /Power actor/i);
      assert.doesNotMatch(displaySource, /enmity/i);
    },
  },
  {
    name: '33c.0 duplicate historical power actor effect is ignored',
    run() {
      const report = runCase({
        userText: 'I keep walking through the market.',
        powerActors: {
          'Red Glass Syndicate': {
            name: 'Red Glass Syndicate',
            type: 'criminal syndicate',
            enmity: 2,
            reasons: ['User destroyed their smuggling ledger'],
            responseHistory: [],
            lastEffect: {
              effect: 'disrupt_operation',
              severity: 'meaningful',
              reason: 'User destroyed their smuggling ledger',
              delta: 2,
              at: 100,
            },
          },
        },
        ledger: baseLedger({
          powerActorEnmity: {
            effects: [{
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              sourceTarget: 'Red Glass Syndicate',
              actionUnitId: 'A1',
              explicitlyCompleted: true,
              hasReach: true,
              effect: 'disrupt_operation',
              severity: 'meaningful',
              reason: 'User destroyed their smuggling ledger',
              knownToActor: true,
            }],
          },
        }),
      });
      assert.equal(report.trackerUpdate.powerActors['Red Glass Syndicate'], undefined);
      const entry = report.finalNarrativeHandoff.powerActorPressure.entries.find(item => item.Actor === 'Red Glass Syndicate');
      assert.equal(entry.Enmity, 2);
      assert.deepEqual(entry.Reasons, ['User destroyed their smuggling ledger']);
      assert.equal(auditIncludes(report, 'duplicate historical/stored power actor effect'), true);
    },
  },
  {
    name: '33c.0a current-scene power actor candidate overrides stale actor ownership',
    run() {
      const report = runCase({
        userText: 'I expose the prominent merchant\'s false books to the crowd.',
        tracker: {
          shopkeeper: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        powerActors: {
          'City Watch': {
            name: 'City Watch',
            type: 'city guard institution',
            enmity: 1,
            reasons: ['User embarrassed a patrol captain'],
            responseHistory: [],
          },
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Expose_Fraud',
            identifyChallenge: 'expose the merchant ledger fraud in public',
            explicitMeans: 'show the merchant ledger to the crowd',
            identifyTargets: {
              ActionTargets: ['shopkeeper'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: ['shopkeeper'],
              PowerActors: ['shopkeeper'],
            },
            rollNeeded: true,
          },
          relationshipEngine: [relationship('shopkeeper', {
            stakeChangeByOutcome: emptyStakeMap('harm'),
          })],
          powerActorEnmity: {
            assessments: [{
              actor: 'shopkeeper',
              scope: 'individual',
              isPowerActor: true,
              actorType: 'prominent merchant',
              reach: ['money', 'capital trade contacts'],
              evidence: 'character card says prominent merchant in the capital',
              assessmentReason: 'merchant has influence and resources beyond personal reaction',
            }],
            effects: [{
              actor: 'City Watch',
              actorType: 'city guard institution',
              sourceTarget: 'shopkeeper',
              actionUnitId: 'A1',
              explicitlyCompleted: false,
              hasReach: true,
              effect: 'damage_reputation_or_income',
              severity: 'meaningful',
              reason: 'User exposed the merchant ledger fraud',
              knownToActor: true,
            }],
          },
        }),
      });
      const merchant = report.trackerUpdate.powerActors.shopkeeper;
      assert.equal(merchant.enmity, 2);
      assert.equal(merchant.type, 'prominent merchant');
      assert.equal(auditIncludes(report, 'powerActorEffectRetargeted='), true);
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.entries.some(entry => entry.Actor === 'shopkeeper'), true);
    },
  },
  {
    name: '33c.0b power actor asset harm fallback creates effect when semantic misses it',
    run() {
      const report = runCase({
        userText: 'I burn the Red Glass Syndicate payment ledger in front of their dock crew.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Destroy_Ledger',
            identifyChallenge: 'burn the syndicate payment ledger',
            explicitMeans: 'burn the Red Glass Syndicate payment ledger',
            itemUse: {
              attempted: false,
              available: false,
              item: '(none)',
              source: 'none',
              evidence: '(none)',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              PowerActors: ['Red Glass Syndicate'],
            },
            rollNeeded: true,
          },
          powerActorEnmity: {
            assessments: [{
              actor: 'Red Glass Syndicate',
              scope: 'organization',
              isPowerActor: true,
              actorType: 'criminal syndicate',
              reach: ['dock crew', 'smuggling network'],
              evidence: 'payment ledger belongs to their operation',
              assessmentReason: 'organization has recurring reach and assets',
            }],
            effects: [],
          },
        }),
      });
      assert.equal(report.trackerUpdate.powerActors['Red Glass Syndicate'], undefined);
      assert.equal(auditIncludes(report, 'powerActorAssetFallbackEffect='), false);
    },
  },
  {
    name: '33c.0c substantial harm against an ordinary NPC records a hidden latent grievance',
    run() {
      const report = runCase({
        userText: 'I smash Cale\'s trade cart and burn its stock while he watches.',
        tracker: { Cale: trackerEntry() },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'destroy Cale\'s trade stock',
            identifyChallenge: 'smash the cart and burn its stock',
            explicitMeans: 'smash and burn the trade cart',
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Cale'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: ['Cale'],
              NPCAwareOfUser: ['Cale'],
              PowerActors: [],
            },
            rollNeeded: false,
            rollReason: 'the destruction is explicitly completed',
          },
          relationshipEngine: [relationship('Cale')],
          powerActorEnmity: {
            assessments: [ordinaryPowerAssessment()],
            latentGrievances: [{
              target: 'Cale',
              actionUnitId: 'A1',
              explicitlyCompleted: true,
              effect: 'harm_assets',
              severity: 'meaningful',
              reason: 'User destroyed Cale\'s trade cart and stock',
              evidence: 'The user smashed the cart and burned its stock',
              attributionPath: 'Cale witnessed the destruction',
            }],
          },
        }),
      });

      assert.equal(report.trackerUpdate.latentGrievances.length, 1);
      assert.match(report.trackerUpdate.latentGrievances[0].id, /^lg_/);
      assert.equal(report.trackerUpdate.latentGrievances[0].target, 'Cale');
      assert.equal(report.trackerUpdate.latentGrievances[0].severity, 'meaningful');
      assert.deepEqual(report.latentGrievances.before, []);
      assert.deepEqual(report.latentGrievances.after, report.trackerUpdate.latentGrievances);
      assert.equal(auditIncludes(report, 'latentGrievanceRecorded='), true);
    },
  },
  {
    name: '33c.0d failed rolled harm and minor friction do not record latent grievances',
    run() {
      const failed = runCase({
        userText: 'I try to smash Cale\'s reinforced trade cart.',
        dice: [1, 20, 1, 1, 1, 1, 1, 1],
        tracker: { Cale: trackerEntry() },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'destroy Cale\'s reinforced trade cart',
            identifyChallenge: 'break the reinforced cart',
            explicitMeans: 'strike the reinforced cart',
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Cale'],
              OppTargets: { NPC: [], ENV: ['reinforced trade cart'] },
              BenefitedObservers: [],
              HarmedObservers: ['Cale'],
              NPCAwareOfUser: ['Cale'],
              PowerActors: [],
            },
            rollNeeded: true,
            rollReason: 'the reinforced cart resists destruction',
            challengeType: 'environment',
            challengeTypeEvidence: 'breaking a reinforced object',
            environmentDifficultyTier: 'extreme',
          },
          relationshipEngine: [relationship('Cale')],
          powerActorEnmity: {
            assessments: [ordinaryPowerAssessment()],
            latentGrievances: [{
              target: 'Cale',
              actionUnitId: 'A1',
              explicitlyCompleted: false,
              effect: 'harm_assets',
              severity: 'meaningful',
              reason: 'User destroyed Cale\'s reinforced trade cart',
              evidence: 'The user tried to smash the reinforced cart',
              attributionPath: 'Cale witnessed the attempt',
            }],
          },
        }),
      });
      assert.equal(failed.finalNarrativeHandoff.resolutionPacket.LandedActions, 0);
      assert.deepEqual(failed.trackerUpdate.latentGrievances, []);

      const minor = runCase({
        userText: 'I mock Cale\'s hat once.',
        tracker: { Cale: trackerEntry() },
        ledger: baseLedger({
          resolutionEngine: {
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Cale'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: ['Cale'],
              NPCAwareOfUser: ['Cale'],
              PowerActors: [],
            },
          },
          relationshipEngine: [relationship('Cale')],
          powerActorEnmity: {
            assessments: [ordinaryPowerAssessment()],
            latentGrievances: [{
              target: 'Cale',
              actionUnitId: 'A1',
              explicitlyCompleted: true,
              effect: 'humiliate',
              severity: 'minor',
              reason: 'User mocked Cale\'s hat',
              evidence: 'one mocking comment',
              attributionPath: 'Cale heard it',
            }],
          },
        }),
      });
      assert.deepEqual(minor.trackerUpdate.latentGrievances, []);
      assert.equal(auditIncludes(minor, 'invalid, non-substantial, or incomplete candidate'), true);
    },
  },
  {
    name: '33c.0e explicit later affiliation links and consumes one latent grievance exactly once',
    run() {
      const stored = latentGrievance();
      const ledger = baseLedger({
        powerActorEnmity: {
          assessments: [linkedPowerAssessment(), linkedPowerAssessment('North Road Consortium')],
          affiliationLinks: [
            affiliationLink(),
            affiliationLink({
              powerActor: 'North Road Consortium',
              affiliationEvidence: 'A second record also claims Cale worked for the North Road Consortium',
              knowledgeEvidence: 'The consortium received a copied loss report',
            }),
          ],
        },
      });
      const first = runCase({
        userText: 'The posted company roster identifies Cale as an Ash Gate Company factor.',
        latentGrievances: [stored],
        ledger,
      });

      assert.equal(first.trackerUpdate.powerActors['Ash Gate Company'].enmity, 2);
      assert.equal(first.trackerUpdate.powerActors['North Road Consortium'], undefined);
      assert.deepEqual(first.trackerUpdate.latentGrievances, []);
      assert.equal(auditIncludes(first, 'latentGrievanceLinked='), true);
      assert.equal(auditIncludes(first, 'latent grievance was already consumed this turn'), true);
      const mechanicsAudit = auditPrompt(first);
      assert.match(mechanicsAudit, /powerActor\.affiliationLinks:/);
      assert.match(mechanicsAudit, /lg_test_cale_cart/);
      const narratorPrompt = prompt(first);
      assert.doesNotMatch(narratorPrompt, /lg_test_cale_cart/);
      assert.doesNotMatch(narratorPrompt, /Cale filed a named loss report/);
      assert.doesNotMatch(narratorPrompt, /latent grievance/i);

      const second = runCase({
        userText: 'I read the roster again.',
        powerActors: first.trackerUpdate.powerActors,
        latentGrievances: first.trackerUpdate.latentGrievances,
        ledger,
      });
      assert.deepEqual(second.trackerUpdate.latentGrievances, []);
      assert.equal(auditIncludes(second, 'latentGrievanceLinked='), false);
      assert.equal(auditIncludes(second, 'no exact latent grievance match'), true);
    },
  },
  {
    name: '33c.0f latent links require explicit affiliation, independent reach, and a knowledge path',
    run() {
      const stored = latentGrievance();
      const runLink = ({ assessments = [linkedPowerAssessment()], link = affiliationLink() } = {}) => runCase({
        userText: 'New records mention Cale and the Ash Gate Company.',
        latentGrievances: [stored],
        ledger: baseLedger({
          powerActorEnmity: {
            assessments,
            affiliationLinks: [link],
          },
        }),
      });

      const noAffiliation = runLink({ link: affiliationLink({ affiliationEvidence: '(none)' }) });
      assert.deepEqual(noAffiliation.trackerUpdate.latentGrievances, [stored]);
      assert.equal(noAffiliation.trackerUpdate.powerActors['Ash Gate Company'], undefined);

      const noAssessment = runLink({ assessments: [] });
      assert.deepEqual(noAssessment.trackerUpdate.latentGrievances, [stored]);
      assert.equal(auditIncludes(noAssessment, 'not independently assessed as a power actor with reach'), true);

      const noReach = runLink({ assessments: [linkedPowerAssessment('Ash Gate Company')].map(item => ({ ...item, reach: [] })) });
      assert.deepEqual(noReach.trackerUpdate.latentGrievances, [stored]);
      assert.equal(auditIncludes(noReach, 'not independently assessed as a power actor with reach'), true);

      const noKnowledge = runLink({
        link: affiliationLink({ knownToActor: false, knowledgeEvidence: '(none)' }),
      });
      assert.deepEqual(noKnowledge.trackerUpdate.latentGrievances, [stored]);
      assert.equal(auditIncludes(noKnowledge, 'no knowledge or discovery path yet'), true);
    },
  },
  {
    name: '33c.0g duplicate linked effects consume latent memory without double enmity',
    run() {
      const existingActor = {
        name: 'Ash Gate Company',
        type: 'merchant company',
        enmity: 2,
        reasons: ['User destroyed Cale\'s trade cart and stock'],
        responseHistory: [],
        lastEffect: {
          effect: 'harm_assets',
          severity: 'meaningful',
          reason: 'User destroyed Cale\'s trade cart and stock',
          delta: 2,
          at: 100,
        },
      };
      const report = runCase({
        userText: 'The company confirms Cale\'s old report.',
        powerActors: { 'Ash Gate Company': existingActor },
        latentGrievances: [latentGrievance()],
        ledger: baseLedger({
          powerActorEnmity: {
            assessments: [linkedPowerAssessment()],
            affiliationLinks: [affiliationLink()],
          },
        }),
      });

      const actor = report.trackerUpdate.powerActors['Ash Gate Company'] || existingActor;
      assert.equal(actor.enmity, 2);
      assert.deepEqual(report.trackerUpdate.latentGrievances, []);
      assert.equal(auditIncludes(report, 'latentGrievanceConsumedAsDuplicate='), true);
      assert.equal(auditIncludes(report, 'latentGrievanceLinked='), false);
    },
  },
  {
    name: '33c.0h latent grievance state is persisted and restored but excluded from narrator facts',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const preflightSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');

      assert.match(indexSource, /latentGrievanceSnapshot: buildLatentGrievanceSnapshot\(context\)/);
      assert.match(indexSource, /latentGrievanceArchive = mergeLatentGrievanceArchive/);
      assert.match(indexSource, /latentGrievanceIds: latentGrievanceIds\(latentGrievances\)/);
      assert.match(indexSource, /beforeLatentGrievanceIds: latentGrievanceIds\(pendingRun\.latentGrievancesBefore/);
      assert.match(indexSource, /afterLatentGrievanceIds: latentGrievanceIds\(pendingRun\.latentGrievancesAfter/);
      assert.match(indexSource, /resolveStoredLatentGrievances\(root, restoreCandidate\.beforeLatentGrievanceIds\)/);
      assert.doesNotMatch(indexSource, /beforeLatentGrievances:/);
      assert.doesNotMatch(indexSource, /afterLatentGrievances:/);
      assert.match(semanticSource, /Latent grievance snapshot JSON \(hidden unresolved grievance memory/);
      assert.match(semanticSource, /required: \['assessments', 'effects', 'latentGrievances', 'affiliationLinks', 'latentFavors', 'favorAffiliationLinks'\]/);
      const semanticSnapshotSanitizer = semanticSource.slice(
        semanticSource.indexOf('function sanitizeLatentGrievanceSnapshotForSemantic'),
        semanticSource.indexOf('function sanitizeUserKnowledgeSnapshotForSemantic'),
      );
      assert.match(semanticSnapshotSanitizer, /id,/);
      assert.match(semanticSnapshotSanitizer, /target,/);
      assert.match(semanticSnapshotSanitizer, /effect,/);
      assert.match(semanticSnapshotSanitizer, /severity,/);
      assert.match(semanticSnapshotSanitizer, /reason:/);
      assert.doesNotMatch(semanticSnapshotSanitizer, /evidence|attributionPath/);

      const narratorFactsSource = preflightSource.slice(
        preflightSource.indexOf('function formatNarrativeFacts'),
        preflightSource.indexOf('function buildNarratorSummary'),
      );
      assert.doesNotMatch(narratorFactsSource, /latentGrievance|affiliationLinks/);
    },
  },
  {
    name: '33c.0i latent grievances reject known power actors and already-dead targets',
    run() {
      const makeLedger = () => baseLedger({
        resolutionEngine: {
          identifyGoal: 'destroy Cale\'s trade stock',
          identifyChallenge: 'destroy the trade stock',
          explicitMeans: 'smash the trade stock',
          identifyTargets: {
            hostilesInScene: { NPC: [] },
            ActionTargets: ['Cale'],
            OppTargets: { NPC: [], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: ['Cale'],
            NPCAwareOfUser: ['Cale'],
            PowerActors: [],
          },
          rollNeeded: false,
        },
        relationshipEngine: [relationship('Cale')],
        powerActorEnmity: {
          assessments: [ordinaryPowerAssessment()],
          latentGrievances: [latentGrievance()],
        },
      });

      const knownActor = runCase({
        userText: 'I smash Cale\'s trade stock while he watches.',
        tracker: { Cale: trackerEntry() },
        powerActors: {
          Cale: {
            name: 'Cale',
            type: 'merchant power actor',
            enmity: 1,
            reasons: ['Prior conflict'],
            responseHistory: [],
          },
        },
        ledger: makeLedger(),
      });
      assert.deepEqual(knownActor.trackerUpdate.latentGrievances, []);
      assert.equal(auditIncludes(knownActor, 'target is already or contradictorily identified as a power actor'), true);

      const deadTarget = runCase({
        userText: 'I smash Cale\'s abandoned trade stock.',
        tracker: { Cale: trackerEntry({ condition: 'dead' }) },
        ledger: makeLedger(),
      });
      assert.deepEqual(deadTarget.trackerUpdate.latentGrievances, []);
      assert.equal(auditIncludes(deadTarget, 'target is not a current affected living target'), true);
    },
  },
  {
    name: '33c.0j direct and newly linked power effects cannot leave duplicate latent records',
    run() {
      const linked = runCase({
        userText: 'The company roster identifies Cale as an Ash Gate factor and the company receives his report.',
        tracker: { Cale: trackerEntry() },
        latentGrievances: [latentGrievance()],
        ledger: baseLedger({
          resolutionEngine: {
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Cale'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: ['Cale'],
              NPCAwareOfUser: ['Cale'],
              PowerActors: ['Ash Gate Company'],
            },
          },
          relationshipEngine: [relationship('Cale')],
          powerActorEnmity: {
            assessments: [ordinaryPowerAssessment(), linkedPowerAssessment()],
            affiliationLinks: [affiliationLink()],
            latentGrievances: [latentGrievance()],
          },
        }),
      });
      assert.equal(linked.trackerUpdate.powerActors['Ash Gate Company'].enmity, 2);
      assert.deepEqual(linked.trackerUpdate.latentGrievances, []);
      assert.equal(auditIncludes(linked, 'target received an explicit power-actor affiliation link this turn'), true);

      const direct = runCase({
        userText: 'I destroy Cale\'s company cart while he watches.',
        tracker: { Cale: trackerEntry() },
        ledger: baseLedger({
          resolutionEngine: {
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Cale'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: ['Cale'],
              NPCAwareOfUser: ['Cale'],
              PowerActors: ['Ash Gate Company'],
            },
          },
          relationshipEngine: [relationship('Cale')],
          powerActorEnmity: {
            assessments: [ordinaryPowerAssessment()],
            effects: [{
              actor: 'Ash Gate Company',
              actorType: 'merchant company',
              sourceTarget: 'Cale',
              actionUnitId: 'A1',
              explicitlyCompleted: true,
              hasReach: true,
              effect: 'harm_assets',
              severity: 'meaningful',
              reason: 'User destroyed Cale\'s company cart',
              knownToActor: true,
            }],
            latentGrievances: [latentGrievance({
              reason: 'User destroyed Cale\'s company cart',
              evidence: 'The company cart was destroyed while Cale watched',
            })],
          },
        }),
      });
      assert.equal(direct.trackerUpdate.powerActors['Ash Gate Company'].enmity, 2);
      assert.deepEqual(direct.trackerUpdate.latentGrievances, []);
      assert.equal(auditIncludes(direct, 'same action and affected target already produced a direct power-actor effect'), true);
    },
  },
  {
    name: '33c.0k latent grievance outcome gates are action-specific and require completed no-roll effects',
    run() {
      const partial = runCase({
        userText: 'I smash Cale\'s cart, then try to burn his wagon.',
        dice: [12, 18, 1, 1, 1, 1],
        tracker: { Cale: trackerEntry({ currentCoreStats: { Rank: 'Weak', MainStat: 'PHY', PHY: 1, MND: 1, CHA: 1 } }) },
        ledger: baseLedger({
          engineContext: {
            userCoreStats: { Rank: 'Strong', MainStat: 'PHY', PHY: 10, MND: 5, CHA: 5 },
          },
          resolutionEngine: {
            identifyGoal: 'damage Cale\'s property',
            identifyChallenge: 'smash the cart and burn the wagon',
            explicitMeans: 'two attacks against Cale\'s property',
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Cale'],
              OppTargets: { NPC: ['Cale'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: ['Cale'],
              NPCAwareOfUser: ['Cale'],
              PowerActors: [],
            },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'two resisted attacks',
            actionCount: ['smash cart', 'burn wagon'],
            actionUnits: [
              { id: 'A1', action: 'smash Cale\'s cart', evidence: 'first action' },
              { id: 'A2', action: 'burn Cale\'s wagon', evidence: 'second action' },
            ],
          },
          relationshipEngine: [relationship('Cale')],
          powerActorEnmity: {
            assessments: [ordinaryPowerAssessment()],
            latentGrievances: [
              latentGrievance({ actionUnitId: 'A1', explicitlyCompleted: false, reason: 'User smashed Cale\'s cart' }),
              latentGrievance({ actionUnitId: 'A2', explicitlyCompleted: false, effect: 'disrupt_operation', reason: 'User burned Cale\'s wagon' }),
            ],
          },
        }),
      });
      assert.equal(partial.finalNarrativeHandoff.resolutionPacket.LandedActions, 1);
      assert.equal(partial.trackerUpdate.latentGrievances.length, 1);
      assert.equal(partial.trackerUpdate.latentGrievances[0].actionUnitId, 'A1');
      assert.equal(auditIncludes(partial, 'resolved action did not succeed or land'), true);

      const incomplete = runCase({
        userText: 'I try to damage Cale\'s unattended cart.',
        tracker: { Cale: trackerEntry() },
        ledger: baseLedger({
          resolutionEngine: {
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Cale'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: ['Cale'],
              NPCAwareOfUser: ['Cale'],
              PowerActors: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Cale')],
          powerActorEnmity: {
            assessments: [ordinaryPowerAssessment()],
            latentGrievances: [latentGrievance({ explicitlyCompleted: false })],
          },
        }),
      });
      assert.deepEqual(incomplete.trackerUpdate.latentGrievances, []);
      assert.equal(auditIncludes(incomplete, 'resolved action did not succeed or land'), true);
    },
  },
  {
    name: '33c.0l revealed names migrate only current latent state and preserve rollback identity',
    async run() {
      const before = [latentGrievance({ target: 'hooded trader', id: 'lg_old_identity' })];
      const after = renameLatentGrievanceTargets(before, [{ oldName: 'hooded trader', newName: 'Cale' }]);
      assert.equal(before[0].target, 'hooded trader');
      assert.equal(before[0].id, 'lg_old_identity');
      assert.equal(after[0].target, 'Cale');
      assert.notEqual(after[0].id, before[0].id);

      const archive = mergeLatentGrievanceArchive({}, before, after);
      assert.deepEqual(resolveLatentGrievanceIds(latentGrievanceIds(before), archive), before);
      assert.deepEqual(resolveLatentGrievanceIds(latentGrievanceIds(after), archive), after);

      const trackerContext = context('', {}, {}, undefined, null, {}, {}, {}, before);
      await saveTrackerUpdate(trackerContext, { latentGrievances: after }, { save: false });
      const savedRoot = trackerContext.chatMetadata.structuredPreflightTracker;
      assert.equal(savedRoot.latentGrievances[0].target, 'Cale');
      assert.equal(savedRoot.latentGrievanceArchive[before[0].id].target, 'hooded trader');
      assert.equal(savedRoot.latentGrievanceArchive[after[0].id].target, 'Cale');

      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const promotionSync = indexSource.slice(
        indexSource.indexOf('function syncPendingRunLatentGrievanceNamePromotions'),
        indexSource.indexOf('function promoteTrackerEntry'),
      );
      assert.match(promotionSync, /pendingRun\.latentGrievancesAfter = renameLatentGrievanceTargets/);
      assert.doesNotMatch(promotionSync, /pendingRun\.latentGrievancesBefore\s*=/);
    },
  },
  {
    name: '33c.0m grievance archive resolves compact snapshot IDs without duplicating records',
    run() {
      const first = latentGrievance();
      const second = latentGrievance({
        id: 'lg_test_second',
        target: 'Mira',
        effect: 'humiliate',
        reason: 'User publicly humiliated Mira',
        evidence: 'Mira and the crowd witnessed it',
      });
      const active = [first, second];
      const archive = mergeLatentGrievanceArchive({}, active);
      const ids = latentGrievanceIds(active);
      assert.deepEqual(ids, ['lg_test_cale_cart', 'lg_test_second']);
      assert.deepEqual(resolveLatentGrievanceIds(ids, archive), active);
      assert.ok(JSON.stringify(ids).length < JSON.stringify(active).length);
      assert.equal(Object.keys(archive).length, 2);
    },
  },
  {
    name: '33c.0n substantial uncompensated help records one hidden latent favor',
    run() {
      const report = runCase({
        userText: 'I pull Cale out of the flooded ford and refuse his offered money.',
        tracker: { Cale: trackerEntry() },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'rescue Cale without compensation',
            identifyChallenge: 'pull Cale from the flooded ford',
            explicitMeans: 'drag him onto stable ground',
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Cale'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: ['Cale'],
              PowerActors: [],
            },
            rollNeeded: false,
            actionCount: ['rescue Cale'],
            actionUnits: [{ id: 'A1', action: 'rescue Cale', evidence: 'pull Cale from the ford' }],
          },
          relationshipEngine: [relationship('Cale')],
          powerActorEnmity: {
            assessments: [ordinaryPowerAssessment()],
            latentFavors: [latentFavor()],
          },
        }),
      });

      assert.equal(report.trackerUpdate.latentFavors.length, 1);
      assert.match(report.trackerUpdate.latentFavors[0].id, /^lf_/);
      assert.equal(report.trackerUpdate.latentFavors[0].target, 'Cale');
      assert.equal(report.trackerUpdate.latentFavors[0].benefit, 'rescue_or_protect');
      assert.deepEqual(report.latentFavors.before, []);
      assert.deepEqual(report.latentFavors.after, report.trackerUpdate.latentFavors);
      assert.equal(report.finalNarrativeHandoff.powerActorFavor, null);
      assert.equal(auditIncludes(report, 'latentFavorRecorded='), true);
      assert.doesNotMatch(prompt(report), /latent favor|uncompensated|beyond expected duty/i);
    },
  },
  {
    name: '33c.0o paid routine or incomplete help never records latent favor',
    run() {
      const buildReport = candidate => runCase({
        userText: 'I perform the assigned guild work for the posted reward.',
        tracker: { Cale: trackerEntry() },
        ledger: baseLedger({
          resolutionEngine: {
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Cale'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: ['Cale'],
              PowerActors: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Cale')],
          powerActorEnmity: {
            assessments: [ordinaryPowerAssessment()],
            latentFavors: [candidate],
          },
        }),
      });

      const paid = buildReport(latentFavor({ uncompensated: false }));
      const routine = buildReport(latentFavor({ beyondExpectedDuty: false }));
      const incomplete = buildReport(latentFavor({ explicitlyCompleted: false }));
      assert.deepEqual(paid.trackerUpdate.latentFavors, []);
      assert.deepEqual(routine.trackerUpdate.latentFavors, []);
      assert.deepEqual(incomplete.trackerUpdate.latentFavors, []);
      assert.equal(auditIncludes(paid, 'compensated, expected-duty'), true);
      assert.equal(auditIncludes(incomplete, 'resolved action did not succeed or complete'), true);
    },
  },
  {
    name: '33c.0p eligible affiliation authorizes one bounded opportunity and waits for visible presentation',
    run() {
      const stored = latentFavor();
      const report = runCase({
        userText: 'Cale reports the rescue to the Ash Gate Company.',
        latentFavors: [stored],
        ledger: baseLedger({
          powerActorEnmity: {
            assessments: [linkedPowerAssessment()],
            favorAffiliationLinks: [favorAffiliationLink(), favorAffiliationLink()],
          },
        }),
      });

      assert.deepEqual(report.trackerUpdate.latentFavors, [stored]);
      assert.equal(report.finalNarrativeHandoff.powerActorFavor.FavorId, stored.id);
      assert.equal(report.finalNarrativeHandoff.powerActorFavor.Actor, 'Ash Gate Company');
      assert.equal(report.finalNarrativeHandoff.powerActorFavor.Beneficiary, 'Cale');
      assert.equal(report.finalNarrativeHandoff.powerActorFavor.Benefit, 'rescue_or_protect');
      assert.equal(report.trackerUpdate.powerActors['Ash Gate Company'], undefined);
      assert.equal(auditIncludes(report, 'latentFavorOpportunityAuthorized='), true);
      assert.equal(auditIncludes(report, 'latent favor already linked this turn'), true);
      const narratorPrompt = prompt(report);
      assert.match(narratorPrompt, /favorable response opportunity/i);
      assert.match(narratorPrompt, /Do not grant allegiance, permanent loyalty, or a new relationship/i);
      assert.doesNotMatch(narratorPrompt, /latent favor|affiliationEvidence|knowledgeEvidence|uncompensated/i);

      const narration = 'An Ash Gate Company courier stops at the table. "Cale told us you pulled him from the ford. The company owes you thanks."';
      const postDelta = parseNarratorTrackerDelta(TRACKER_DELTA_TEMPLATE
        .replace('LatentFavorPresentation.favorId=(none)', `LatentFavorPresentation.favorId=${stored.id}`)
        .replace('LatentFavorPresentation.evidence=(none)', 'LatentFavorPresentation.evidence=Cale told us you pulled him from the ford'), narration);
      assert.equal(postDelta.latentFavorPresentation.favorId, stored.id);
      const verifiedId = verifyLatentFavorPresentation(
        postDelta,
        report.finalNarrativeHandoff.powerActorFavor,
        report.trackerUpdate.latentFavors,
        narration,
      );
      assert.equal(verifiedId, stored.id);
      assert.equal(verifyLatentFavorPresentation(
        { latentFavorPresentation: { favorId: 'lf_wrong', evidence: 'Cale told us you pulled him from the ford' } },
        report.finalNarrativeHandoff.powerActorFavor,
        report.trackerUpdate.latentFavors,
        narration,
      ), '');
      assert.equal(verifyLatentFavorPresentation(
        { latentFavorPresentation: { favorId: stored.id, evidence: 'This evidence does not appear' } },
        report.finalNarrativeHandoff.powerActorFavor,
        report.trackerUpdate.latentFavors,
        narration,
      ), '');
      const consumed = consumeLatentFavorById(report.trackerUpdate.latentFavors, verifiedId);
      assert.deepEqual(consumed, []);

      const second = runCase({
        userText: 'Time passes.',
        latentFavors: consumed,
        ledger: baseLedger({
          powerActorEnmity: {
            assessments: [linkedPowerAssessment()],
            favorAffiliationLinks: [favorAffiliationLink()],
          },
        }),
      });
      assert.equal(second.finalNarrativeHandoff.powerActorFavor, null);
      assert.equal(auditIncludes(second, 'no exact latent favor match'), true);
    },
  },
  {
    name: '33c.0q latent favor waits for knowledge and does not contradict active enmity',
    run() {
      const stored = latentFavor();
      const noKnowledge = runCase({
        latentFavors: [stored],
        ledger: baseLedger({
          powerActorEnmity: {
            assessments: [linkedPowerAssessment()],
            favorAffiliationLinks: [favorAffiliationLink({ knownToActor: false, knowledgeEvidence: '(none)' })],
          },
        }),
      });
      assert.deepEqual(noKnowledge.trackerUpdate.latentFavors, [stored]);
      assert.equal(noKnowledge.finalNarrativeHandoff.powerActorFavor, null);
      assert.equal(auditIncludes(noKnowledge, 'no knowledge or discovery path yet'), true);

      const hiddenFromUser = runCase({
        latentFavors: [stored],
        ledger: baseLedger({
          powerActorEnmity: {
            assessments: [linkedPowerAssessment()],
            favorAffiliationLinks: [favorAffiliationLink({ knownToUser: false, userKnowledgeEvidence: '(none)' })],
          },
        }),
      });
      assert.deepEqual(hiddenFromUser.trackerUpdate.latentFavors, [stored]);
      assert.equal(hiddenFromUser.finalNarrativeHandoff.powerActorFavor, null);
      assert.equal(auditIncludes(hiddenFromUser, 'affiliation is not yet established to user'), true);

      const badSceneFit = runCase({
        latentFavors: [stored],
        ledger: baseLedger({
          powerActorEnmity: {
            assessments: [linkedPowerAssessment()],
            favorAffiliationLinks: [favorAffiliationLink({ fit: 'defer', fitEvidence: 'Active combat cannot support a company approach' })],
          },
        }),
      });
      assert.deepEqual(badSceneFit.trackerUpdate.latentFavors, [stored]);
      assert.equal(badSceneFit.finalNarrativeHandoff.powerActorFavor, null);
      assert.equal(auditIncludes(badSceneFit, 'does not fit the current scene'), true);

      const hostileActor = {
        name: 'Ash Gate Company',
        type: 'merchant company',
        enmity: 2,
        reasons: ['Prior conflict'],
        responseHistory: [],
      };
      const hostile = runCase({
        powerActors: { 'Ash Gate Company': hostileActor },
        latentFavors: [stored],
        ledger: baseLedger({
          powerActorEnmity: {
            assessments: [linkedPowerAssessment()],
            favorAffiliationLinks: [favorAffiliationLink()],
          },
        }),
      });
      assert.deepEqual(hostile.trackerUpdate.latentFavors, [stored]);
      assert.equal(hostile.finalNarrativeHandoff.powerActorFavor, null);
      assert.equal(auditIncludes(hostile, 'currently has active enmity'), true);
    },
  },
  {
    name: '33c.0r latent favor archive, rollback IDs, and name promotion preserve identity',
    async run() {
      const before = [latentFavor({ target: 'hooded trader', id: 'lf_old_identity' })];
      const after = renameLatentFavorTargets(before, [{ oldName: 'hooded trader', newName: 'Cale' }]);
      assert.equal(before[0].target, 'hooded trader');
      assert.equal(after[0].target, 'Cale');
      assert.notEqual(after[0].id, before[0].id);

      const archive = mergeLatentFavorArchive({}, before, after);
      assert.deepEqual(resolveLatentFavorIds(latentFavorIds(before), archive), before);
      assert.deepEqual(resolveLatentFavorIds(latentFavorIds(after), archive), after);
      assert.ok(JSON.stringify(latentFavorIds(after)).length < JSON.stringify(after).length);

      const trackerContext = context('', {}, {}, undefined, null, {}, {}, {}, [], before);
      await saveTrackerUpdate(trackerContext, { latentFavors: after }, { save: false });
      const savedRoot = trackerContext.chatMetadata.structuredPreflightTracker;
      assert.equal(savedRoot.latentFavors[0].target, 'Cale');
      assert.equal(savedRoot.latentFavorArchive[before[0].id].target, 'hooded trader');
      assert.equal(savedRoot.latentFavorArchive[after[0].id].target, 'Cale');

      const oversizedArchive = Object.fromEntries(Array.from({ length: 600 }, (_, index) => {
        const favor = latentFavor({
          id: `lf_archive_${index}`,
          target: `Beneficiary ${index}`,
          reason: `Distinct substantial help ${index}`,
          evidence: `Explicit completed help ${index}`,
          createdAt: index,
        });
        return [favor.id, favor];
      }));
      const prunedArchive = pruneLatentFavorArchive(
        oversizedArchive,
        [oversizedArchive.lf_archive_0],
        {
          newest: {
            savedAt: 999,
            beforeLatentFavorIds: ['lf_archive_1'],
            afterLatentFavorIds: ['lf_archive_2'],
          },
        },
        64,
      );
      assert.equal(Object.keys(prunedArchive).length, 64);
      assert.ok(prunedArchive.lf_archive_0);
      assert.ok(prunedArchive.lf_archive_1);
      assert.ok(prunedArchive.lf_archive_2);

      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      assert.match(indexSource, /latentFavorSnapshot: buildLatentFavorSnapshot\(context\)/);
      assert.match(indexSource, /beforeLatentFavorIds: latentFavorIds\(pendingRun\.latentFavorsBefore/);
      assert.match(indexSource, /afterLatentFavorIds: latentFavorIds\(pendingRun\.latentFavorsAfter/);
      assert.match(indexSource, /verifyLatentFavorPresentation\(/);
      assert.match(indexSource, /pendingRun\.latentFavorsAfter = consumeLatentFavorById/);
      const promotionSync = indexSource.slice(
        indexSource.indexOf('function syncPendingRunLatentFavorNamePromotions'),
        indexSource.indexOf('function promoteTrackerEntry'),
      );
      assert.match(promotionSync, /pendingRun\.latentFavorsAfter = renameLatentFavorTargets/);
      assert.doesNotMatch(promotionSync, /pendingRun\.latentFavorsBefore\s*=/);
    },
  },
  {
    name: '33c.1 visible tracker uses scene-first tabs and compact item rows',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const displaySource = source.slice(
        source.indexOf('function buildTrackerDisplayHtml'),
        source.indexOf('function cleanTrackerDisplayName'),
      );
      const styleSource = source.slice(
        source.indexOf('function ensureTrackerDisplayStyles'),
        source.indexOf('function getMessageElement'),
      );

      assert.match(source, /function trackerDetailLine/);
      assert.match(source, /function trackerDetailTone/);
      assert.match(source, /function trackerChipLabelTone/);
      assert.match(source, /function trackerChip/);
      assert.match(source, /function trackerStatPills/);
      assert.match(source, /function trackerStatCluster/);
      assert.match(source, /function trackerDisplayItemList/);
      assert.match(source, /function trackerTabNav/);
      assert.match(source, /function trackerConditionTone/);
      assert.match(source, /function trackerDispositionTone/);
      assert.match(source, /function formatBoundCompanionVessel/);
      assert.match(source, /return '\{\{user\}\}'/);
      assert.match(source, /userVesselPattern/);
      assert.match(source, /trackerWidgetActiveTab: 'scene'/);
      assert.match(displaySource, /structured-preflight-tracker-card/);
      assert.match(displaySource, /structured-preflight-tracker-player-card/);
      assert.match(displaySource, /structured-preflight-tracker-name-player/);
      assert.match(displaySource, /structured-preflight-tracker-name-npc/);
      assert.match(displaySource, /structured-preflight-tracker-role/);
      assert.match(displaySource, /trackerTabNav\(activeTab, counts\)/);
      assert.match(displaySource, /data-spe-tracker-panel="scene"/);
      assert.match(displaySource, /data-spe-tracker-panel="inventory"/);
      assert.match(displaySource, /data-spe-tracker-panel="tasks"/);
      assert.doesNotMatch(displaySource, /data-spe-tracker-panel="player"/);
      assert.match(displaySource, /const renderPlayerCard = \(\) =>/);
      assert.match(displaySource, /const renderBoundCompanionSection = \(\) =>/);
      assert.match(displaySource, /if \(!boundCompanion\.active\) return ''/);
      assert.match(displaySource, /structured-preflight-tracker-bound-companion/);
      assert.match(displaySource, /Bound Companion/);
      assert.match(displaySource, /trackerChip\('Type'/);
      assert.match(displaySource, /trackerChip\('Vessel'/);
      assert.match(displaySource, /trackerChip\('State', 'Present, internal'\)/);
      assert.doesNotMatch(displaySource, /boundCompanionNpc\?\.condition/);
      assert.doesNotMatch(displaySource, /boundCompanionNpc\.wounds/);
      assert.doesNotMatch(displaySource, /boundCompanionNpc\.statusEffects/);
      assert.match(displaySource, /trackerDisplaySnapshot\.boundCompanion|snapshot\?\.boundCompanion/);
      assert.match(displaySource, /boundCompanionExcludedName/);
      assert.match(displaySource, /name\.toLowerCase\(\) !== boundCompanionExcludedName/);
      assert.match(displaySource, /Present NPCs/);
      assert.match(displaySource, /structured-preflight-tracker-npc-scroll/);
      assert.match(displaySource, /structured-preflight-tracker-chip-row/);
      assert.match(displaySource, /structured-preflight-tracker-card-top-row/);
      assert.match(displaySource, /structured-preflight-tracker-npc-rows/);
      assert.match(displaySource, /structured-preflight-tracker-npc-row/);
      assert.match(displaySource, /structured-preflight-tracker-detail-grid/);
      assert.match(displaySource, /structured-preflight-tracker-detail-grid-compact/);
      assert.match(displaySource, /structured-preflight-tracker-detail-wide/);
      assert.match(displaySource, /structured-preflight-tracker-item-list-grid/);
      assert.match(displaySource, /trackerChip\('Toward User'/);
      assert.match(displaySource, /trackerChip\('Condition'/);
      assert.match(displaySource, /trackerChip\('B\/F\/H'/);
      assert.match(displaySource, /trackerChip\('Lock'/);
      assert.match(displaySource, /trackerChip\('Behavior'/);
      assert.match(displaySource, /trackerChip\('Rapport'/);
      assert.match(displaySource, /trackerChip\('Relationship'/);
      assert.match(displaySource, /boundCompanionNpc\?\.personalitySummary \|\| 'Developing'/);
      assert.match(displaySource, /trackerStatCluster\(entry\.currentCoreStats\)/);
      assert.match(displaySource, /trackerStatCluster\(userCore\)/);
      assert.match(displaySource, /structured-preflight-tracker-detail-label-personality/);
      assert.match(displaySource, /trackerDetailLine\('Wounds'/);
      assert.match(displaySource, /trackerDetailLine\('Status'/);
      assert.match(displaySource, /trackerDisplayItemList\('Gear', user\.gear, \{ empty: 'No equipped gear' \}\)/);
      assert.match(displaySource, /trackerDisplayItemList\('Gear', entry\.gear, \{ empty: 'No gear' \}\)/);
      assert.match(displaySource, /trackerListCount\(entry\.inventory\)/);
      assert.match(displaySource, /trackerDisplayItemList\('Inventory', entry\.inventory, \{ empty: 'No revealed possessions' \}\)/);
      assert.match(displaySource, /trackerListCount\(entry\.currency\)/);
      assert.match(displaySource, /trackerDisplayItemList\('Currency', entry\.currency, \{ empty: 'No revealed currency' \}\)/);
      assert.match(displaySource, /trackerListCount\(entry\.statusEffects\)/);
      assert.match(displaySource, /trackerListCount\(user\.statusEffects\)/);
      assert.match(displaySource, /trackerDisplayItemList\('Inventory'/);
      assert.match(displaySource, /trackerDisplayItemList\('Gear'/);
      assert.match(displaySource, /trackerDisplayItemList\('Tasks'/);
      assert.match(displaySource, /trackerDisplayItemList\('Commitments'/);
      assert.doesNotMatch(displaySource, /Inactive NPCs/);
      assert.doesNotMatch(displaySource, /const inactive/);
      assert.doesNotMatch(source, /trackerTabButton\('player'/);
      assert.doesNotMatch(source, /renderPlayerPanel/);
      assert.match(source, /target\.matches\('\[data-spe-tracker-tab\]'\)/);
      assert.match(styleSource, /structured-preflight-tracker-chip-good/);
      assert.match(styleSource, /structured-preflight-tracker-chip-warn/);
      assert.match(styleSource, /structured-preflight-tracker-chip-danger/);
      assert.match(styleSource, /structured-preflight-tracker-tabs/);
      assert.match(styleSource, /structured-preflight-tracker-tab-active/);
      assert.match(styleSource, /structured-preflight-tracker-scene-strip/);
      assert.match(styleSource, /structured-preflight-tracker-bound-companion/);
      assert.match(styleSource, /structured-preflight-tracker-bound-companion > summary/);
      assert.match(styleSource, /structured-preflight-tracker-bound-body/);
      assert.match(styleSource, /structured-preflight-tracker-bound-row/);
      assert.match(styleSource, /structured-preflight-tracker-item-list-grid/);
      assert.match(styleSource, /structured-preflight-tracker-item-row/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-toward-user/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-condition/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-b-f-h/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-lock/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-behavior/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-rapport/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-relationship/);
      assert.match(styleSource, /width: min\(540px, calc\(100vw - 36px\)\)/);
      assert.match(styleSource, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
      assert.match(styleSource, /structured-preflight-tracker-card-top-row/);
      assert.match(styleSource, /structured-preflight-tracker-npc-rows/);
      assert.match(styleSource, /structured-preflight-tracker-npc-row/);
      assert.match(styleSource, /structured-preflight-tracker-npc-scroll/);
      assert.match(styleSource, /max-height: clamp\(13rem, 42vh, 24rem\)/);
      assert.match(styleSource, /structured-preflight-tracker-stat-cluster/);
      assert.match(styleSource, /structured-preflight-tracker-stat-cluster-label/);
      assert.match(styleSource, /structured-preflight-tracker-stat-pill-row/);
      assert.match(styleSource, /structured-preflight-tracker-stat-pill/);
      assert.match(styleSource, /structured-preflight-tracker-stat-label/);
      assert.match(styleSource, /structured-preflight-tracker-stat-pill code \{[\s\S]*font-weight: 900/);
      assert.match(styleSource, /structured-preflight-tracker-stat-phy/);
      assert.match(styleSource, /structured-preflight-tracker-stat-mnd/);
      assert.match(styleSource, /structured-preflight-tracker-stat-cha/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-wounds/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-status/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-gear/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-inventory/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-tasks/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-commitments/);
      assert.match(styleSource, /structured-preflight-tracker-name-player/);
      assert.match(styleSource, /structured-preflight-tracker-name-npc/);
      assert.match(styleSource, /grid-template-columns: repeat\(auto-fit/);
      assert.match(styleSource, /@media \(max-width: 520px\)/);
    },
  },
  {
    name: '33c.2 world state tracks location time and deterministic weather through metadata',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const deterministicSource = fs.readFileSync(new URL('deterministic-runner.js', import.meta.url), 'utf8');
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const preflightSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      const contractSource = fs.readFileSync(new URL('tracker-delta-contract.js', import.meta.url), 'utf8');

      assert.match(indexSource, /root\.worldState = normalizeWorldState\(root\.worldState \|\| \{\}\)/);
      assert.match(indexSource, /worldStateBefore: pendingGeneration\.worldStateSnapshot/);
      assert.match(indexSource, /worldStateAfter: report\.trackerUpdate\?\.worldState/);
      assert.match(indexSource, /beforeWorldState: clone\(pendingRun\.worldStateBefore/);
      assert.match(indexSource, /afterWorldState: clone\(trackerDisplaySnapshot\.worldState/);
      assert.match(indexSource, /restoreCandidate[\s\S]*beforeWorldState/);
      assert.match(indexSource, /root\.worldState = normalizeWorldState\(restoreCandidate\.beforeWorldState/);
      assert.match(indexSource, /formatWorldStateForDisplay\(snapshot\?\.worldState/);
      assert.match(indexSource, /trackerScenePill\('Place'/);
      assert.match(indexSource, /trackerScenePill\('Area'/);
      assert.match(indexSource, /trackerScenePill\('Time'/);
      assert.match(indexSource, /trackerScenePill\('Weather'/);
      assert.match(indexSource, /applyWorldStateDelta\(merged\.worldState/);

      assert.match(deterministicSource, /export function buildWorldStateSnapshot/);
      assert.match(deterministicSource, /sceneState: worldState/);
      assert.match(deterministicSource, /worldState,/);
      assert.match(deterministicSource, /currentWorldState\.reputationLocation/);
      assert.match(semanticSource, /World state snapshot JSON/);
      assert.match(semanticSource, /normalizeWorldStateDelta/);
      assert.match(preflightSource, /sceneState', narrativeSceneStateFact/);
      assert.match(preflightSource, /do not choose new weather or time changes on your own/);
      assert.match(contractSource, /WORLD_STATE_DELTA/);
      assert.match(contractSource, /WorldStateDelta\.reputationLocation=unchanged/);
      assert.match(contractSource, /WorldStateDelta\.weatherTick=auto/);

      const deltaText = TRACKER_DELTA_TEMPLATE
        .replace('WorldStateDelta.reputationLocation=unchanged', 'WorldStateDelta.reputationLocation=Urakami Village')
        .replace('WorldStateDelta.place=unchanged', "WorldStateDelta.place=Adventurer's Guild")
        .replace('WorldStateDelta.area=unchanged', 'WorldStateDelta.area=reception hall')
        .replace('WorldStateDelta.indoors=unchanged', 'WorldStateDelta.indoors=true')
        .replace('WorldStateDelta.timeAdvance=none', 'WorldStateDelta.timeAdvance=slot')
        .replace('WorldStateDelta.timeOfDay=unchanged', 'WorldStateDelta.timeOfDay=evening')
        .replace('WorldStateDelta.weatherTick=auto', 'WorldStateDelta.weatherTick=tick');
      const parsed = parseNarratorTrackerDelta(deltaText, 'The group reaches the guild reception hall as evening comes on.');
      assert.equal(parsed.worldState.reputationLocation, 'Urakami Village');
      assert.equal(parsed.worldState.place, "Adventurer's Guild");
      assert.equal(parsed.worldState.area, 'reception hall');
      assert.equal(parsed.worldState.indoors, true);
      assert.equal(parsed.worldState.timeAdvance, 'slot');
      assert.equal(parsed.worldState.timeOfDay, 'evening');
      assert.equal(parsed.worldState.weatherTick, 'tick');

      const before = normalizeWorldState({
        dayIndex: 1,
        timeOfDay: 'afternoon',
        weather: { condition: 'clear', remainingSlots: 2 },
        weatherEstablished: true,
      });
      const after = applyWorldStateDelta(before, parsed.worldState, { seed: 'world-state-test' });
      assert.equal(after.reputationLocation, 'Urakami Village');
      assert.equal(after.place, "Adventurer's Guild");
      assert.equal(after.area, 'reception hall');
      assert.equal(after.indoors, true);
      assert.equal(after.dayIndex, 1);
      assert.equal(after.timeOfDay, 'evening');
      assert.equal(after.weather.condition, 'clear');
      assert.equal(after.weather.remainingSlots, 1);
    },
  },
  {
    name: '33d persona inventory seed parser accepts creator bullet lists',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const parserSource = source.slice(
        source.indexOf('function parsePersonaListItem'),
        source.indexOf('function stripMarkdownFormatting'),
      );
      assert.match(parserSource, /\\u2022/);
      assert.match(parserSource, /\\u2023/);
      assert.match(parserSource, /\\u2043/);
      assert.match(parserSource, /\\u2013/);
      assert.match(parserSource, /\\u2014/);
      assert.match(source, /const explicitCurrency = extractPersonaListSection\(personaText, \['currency', 'money', 'coins', 'coin purse', 'funds'\]\)/);
      assert.match(source, /currency: seed\.currency/);
      assert.match(source, /currencyCount: seed\.currency\.length/);
      assert.match(source, /return \{ gear, inventory, currency: normalizeCurrencyList\(currency\) \}/);
      const stripMarkdownFormatting = value => String(value ?? '').replace(/[`*_~]/g, '').trim();
      const parsePersonaListItem = line => {
        const text = stripMarkdownFormatting(line)
          .replace(/^\s*(?:[-*+\u2022\u2023\u2043\u2013\u2014]|[0-9]+[.)])\s+/, '')
          .trim();
        if (!text || text === stripMarkdownFormatting(line).trim()) return '';
        if (/^(?:none|not specified|n\/a|null|empty)$/i.test(text)) return '';
        return text;
      };
      assert.equal(parsePersonaListItem('\u2022 Waterskin  '), 'Waterskin');
      assert.equal(parsePersonaListItem('\u2023 Small belt pouch'), 'Small belt pouch');
      assert.equal(parsePersonaListItem('\u2043 Coiled rope'), 'Coiled rope');
      assert.equal(parsePersonaListItem('\u2013 Traveler cloak'), 'Traveler cloak');
      assert.equal(parsePersonaListItem('\u2014 Utility knife'), 'Utility knife');
    },
  },
  {
    name: '33d semantic contract includes hidden power actor enmity and no spy lifecycle',
    run() {
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const deterministicSource = fs.readFileSync(new URL('deterministic-runner.js', import.meta.url), 'utf8');
      const preflightSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');

      assert.match(semanticSource, /PowerActorEnmity\.count=0/);
      assert.match(semanticSource, /PowerActorAssessment\.count=0/);
      assert.match(semanticSource, /ResolutionEngine\.identifyTargets\.NPCAwareOfUser=\(none\)/);
      assert.match(semanticSource, /ResolutionEngine\.identifyTargets\.NPCAwareOfUser is the individual-awareness list/);
      assert.match(semanticSource, /NPCAwareOfUser is individual-only/);
      assert.match(semanticSource, /ActionTargets, OppTargets\.NPC, BenefitedObservers, HarmedObservers, or NPCAwareOfUser/);
      assert.match(semanticSource, /ResolutionEngine\.identifyTargets\.PowerActors=\(none\)/);
      assert.match(semanticSource, /ResolutionEngine\.identifyTargets\.PowerActors is strategic-only/);
      assert.match(semanticSource, /Identify ResolutionEngine\.identifyTargets\.PowerActors during target discovery/);
      assert.match(semanticSource, /PowerActorEnmity\.assessments is audit-only diagnosis/);
      assert.match(semanticSource, /Assess semantically, not by keywords or titles/);
      assert.match(semanticSource, /credible means to affect \{\{user\}\} beyond acting alone in the moment/);
      assert.match(semanticSource, /the active character\/card actor when relevant/);
      assert.match(semanticSource, /Do this even when PowerActorEnmity\.effects count is 0/);
      assert.match(semanticSource, /A prominent local figure should be assessed as a potential power actor/);
      assert.match(semanticSource, /concrete ordinary discovery\/attribution path to \{\{user\}\}/);
      assert.match(semanticSource, /Offscreen asset harm with no witness, report, evidence, confession, attribution, or discovery path creates no enmity this turn/);
      assert.match(semanticSource, /PowerActors and PowerActorEnmity never replace RelationshipEngine/);
      assert.match(semanticSource, /PowerActors and PowerActorEnmity never replace RelationshipEngine/);
      assert.match(semanticSource, /powerActorEnmity/);
      assert.match(semanticSource, /Ordinary people with only personal reaction are not power actors/);
      assert.match(semanticSource, /Do not create power-actor enmity for ordinary individuals who can only personally react/);
      assert.match(semanticSource, /This semantic section is hidden memory only, not visible tracker text/);
      assert.match(semanticSource, /PowerEventShape\.count=0/);
      assert.match(semanticSource, /Power actor snapshot JSON/);
      assert.match(semanticSource, /visibleInstruction must be narrator-safe surface instruction only/);
      assert.match(deterministicSource, /STEP 3P: EXECUTE PowerActorEnmity USING SEMANTIC_LEDGER/);
      assert.match(deterministicSource, /powerActorTier\(enmity\)/);
      assert.match(deterministicSource, /runPowerActorProactivity/);
      assert.match(deterministicSource, /isSafePowerEventVisibleInstruction/);
      assert.doesNotMatch(deterministicSource, /powerActorAssetFallbackEffect=/);
      assert.match(deterministicSource, /powerActorEffectRetargeted=/);
      assert.match(preflightSource, /visible surface event only/);
      assert.match(preflightSource, /Do not explain why it happens, who benefits, unseen causes, or hidden pressure behind it/);
      assert.match(indexSource, /beforePowerActors/);
      assert.match(indexSource, /afterPowerActors/);
      assert.match(indexSource, /root\.powerActors/);

      const combined = [semanticSource, deterministicSource, preflightSource, indexSource].join('\n');
      assert.doesNotMatch(combined, /spyStatus|fakeFriend|betrayalLifecycle|suspicionScore|evidenceScore/);
    },
  },
  {
    name: '33d.1 power actor proactivity schedules hidden pending event without narrator leakage',
    run() {
      const report = runCase({
        userText: 'I keep moving through the market.',
        dice: [10, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 20, 19],
        ledger: baseLedger(),
        powerActors: {
          'Red Glass Syndicate': {
            name: 'Red Glass Syndicate',
            type: 'criminal syndicate',
            enmity: 5,
            reasons: ['User burned their ledger'],
            responseHistory: [],
          },
        },
      });
      const actor = report.trackerUpdate.powerActors['Red Glass Syndicate'];
      assert.equal(actor.enmity, 5);
      assert.equal(actor.pendingEvent.eventType, 'plant_contact');
      assert.equal(actor.pendingEvent.status, 'pending');
      assert.equal(actor.pendingEvent.contactName, report.finalNarrativeHandoff.nameGeneration.namePool.male[0]);
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.event, null);
      assert.equal(auditIncludes(report, 'powerActorPendingEventCreated='), true);
      assert.doesNotMatch(prompt(report), /World pressure event:/);
      assert.doesNotMatch(prompt(report), /spy|agent|infiltrat|hidden allegiance|sponsor|betray/i);
    },
  },
  {
    name: '33d.1a planted contacts respect cooldown without starving other power actors',
    run() {
      const report = runCase({
        userText: 'I continue through the market.',
        dice: Array(24).fill(20),
        rapportClock: { activeMs: 100, lastActivityAt: 0 },
        ledger: baseLedger(),
        powerActors: {
          'Red Glass Syndicate': {
            name: 'Red Glass Syndicate',
            type: 'criminal syndicate',
            enmity: 5,
            cooldownUntilActiveMs: 10_000,
            activeAgent: {
              name: 'Torven',
              gender: 'male',
              coverRole: 'caravan clerk',
              plantedAtActiveMs: 0,
              lastActionAtActiveMs: 0,
              actionCount: 0,
            },
          },
          'Ash Gate Company': {
            name: 'Ash Gate Company',
            type: 'mercenary company',
            enmity: 5,
            cooldownUntilActiveMs: 0,
          },
        },
      });
      assert.equal(report.trackerUpdate.powerActors['Red Glass Syndicate'], undefined);
      assert.equal(report.trackerUpdate.powerActors['Ash Gate Company'].pendingEvent.status, 'pending');
      const rolls = report.auditLines.find(line => line.includes('powerActorProactivityRolls=')) || '';
      assert.match(rolls, /Ash Gate Company/);
      assert.doesNotMatch(rolls, /Red Glass Syndicate/);
    },
  },
  {
    name: '33d.2 semantic-shaped power event reaches narrator as surface fact only and records hidden contact',
    run() {
      const report = runCase({
        userText: 'I ask around the market for work.',
        powerActors: {
          'Red Glass Syndicate': {
            name: 'Red Glass Syndicate',
            type: 'criminal syndicate',
            enmity: 5,
            reasons: ['User burned their ledger'],
            pendingEvent: {
              id: 'red-glass-100-plant_contact-95',
              eventType: 'plant_contact',
              severityBand: 'strategic',
              createdAtActiveMs: 100,
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              reason: 'User burned their ledger',
              premise: 'A plausible new contact enters through ordinary market work.',
              contactName: 'Torven',
              contactGender: 'male',
              status: 'pending',
              attempts: 0,
            },
          },
        },
        ledger: baseLedger({
          powerEventShape: {
            events: [{
              eventId: 'red-glass-100-plant_contact-95',
              actor: 'Red Glass Syndicate',
              fit: 'use_now',
              visibleInstruction: 'Introduce Torven as a caravan clerk offering paid unloading work at the west gate.',
              contactName: 'Torven',
              contactGender: 'male',
              surfaceRole: 'caravan clerk',
              deferReason: '(none)',
            }],
          },
        }),
      });
      const actor = report.trackerUpdate.powerActors['Red Glass Syndicate'];
      assert.equal(actor.pendingEvent.id, '');
      assert.equal(actor.activeAgent.name, 'Torven');
      assert.equal(actor.activeAgent.coverRole, 'caravan clerk');
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.event.VisibleInstruction, 'Introduce Torven as a caravan clerk offering paid unloading work at the west gate.');
      const modelPrompt = prompt(report);
      const eventLines = modelPrompt.split('\n').filter(line => /visible surface event/i.test(line)).join('\n');
      assert.match(eventLines, /visible surface event only: Introduce Torven as a caravan clerk offering paid unloading work at the west gate/);
      assert.doesNotMatch(eventLines, /Red Glass Syndicate|criminal syndicate|plant_contact/i);
      assert.doesNotMatch(eventLines, /(?:\bspy\b|\bagent\b|infiltrat|sponsor|betray)/i);
      assert.match(auditPrompt(report), /- powerActor\.event: plant_contact\/contact:Torven\/role:caravan clerk\/visible:Introduce Torven/);
    },
  },
  {
    name: '33d.2a semantic shaping cannot replace the deterministic pending event type',
    run() {
      const report = runCase({
        userText: 'I remain at the inn.',
        rapportClock: { activeMs: 100, lastActivityAt: 0 },
        powerActors: {
          'Red Glass Syndicate': {
            name: 'Red Glass Syndicate',
            type: 'criminal syndicate',
            enmity: 3,
            pendingEvent: {
              id: 'red-glass-100-warning-70',
              eventType: 'warning',
              severityBand: 'retaliation',
              createdAtActiveMs: 100,
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              premise: 'A warning reaches the current location.',
              status: 'pending',
              attempts: 0,
            },
          },
        },
        ledger: baseLedger({
          powerEventShape: {
            events: [{
              eventId: 'red-glass-100-warning-70',
              actor: 'Red Glass Syndicate',
              eventType: 'ambush',
              fit: 'use_now',
              visibleInstruction: 'A courier delivers a sealed warning at the inn.',
              contactName: '(none)',
              contactGender: 'none',
              surfaceRole: 'courier',
              deferReason: '(none)',
            }],
          },
        }),
      });
      const actor = report.trackerUpdate.powerActors['Red Glass Syndicate'];
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.event.EventType, 'warning');
      assert.match(actor.responseHistory.at(-1), /^warning:/);
      assert.equal(actor.cooldownUntilActiveMs, 100 + (2 * 60 * 60 * 1000));
    },
  },
  {
    name: '33d.3 unsafe covert event wording is held back from narrator',
    run() {
      const report = runCase({
        userText: 'I ask around the market for work.',
        powerActors: {
          'Red Glass Syndicate': {
            name: 'Red Glass Syndicate',
            type: 'criminal syndicate',
            enmity: 5,
            pendingEvent: {
              id: 'red-glass-100-plant_contact-95',
              eventType: 'plant_contact',
              severityBand: 'strategic',
              createdAtActiveMs: 100,
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              premise: 'A plausible new contact enters.',
              contactName: 'Torven',
              contactGender: 'male',
              status: 'pending',
              attempts: 0,
            },
          },
        },
        ledger: baseLedger({
          powerEventShape: {
            events: [{
              eventId: 'red-glass-100-plant_contact-95',
              actor: 'Red Glass Syndicate',
              fit: 'use_now',
              visibleInstruction: 'Torven is a spy planted by the Red Glass Syndicate.',
              contactName: 'Torven',
              contactGender: 'male',
              surfaceRole: 'caravan clerk',
              deferReason: '(none)',
            }],
          },
        }),
      });
      const actor = report.trackerUpdate.powerActors['Red Glass Syndicate'];
      assert.equal(actor.pendingEvent.id, 'red-glass-100-plant_contact-95');
      assert.equal(actor.pendingEvent.attempts, 1);
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.event, null);
      assert.doesNotMatch(prompt(report), /World pressure event:|spy|agent|Red Glass Syndicate/);
      assert.equal(auditIncludes(report, 'unsafe_instruction_deferred'), true);
    },
  },
  {
    name: '33e semantic coverage repair prevents missing relationship aborts',
    run() {
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const deterministicSource = fs.readFileSync(new URL('deterministic-runner.js', import.meta.url), 'utf8');

      assert.match(semanticSource, /function repairRelationshipCoverage/);
      assert.match(semanticSource, /function createFallbackRelationshipEntry/);
      assert.match(semanticSource, /missing RelationshipEngine entry for target\/observer\/awareness living NPC/);
      assert.match(semanticSource, /repairRelationshipCoverage\(resolutionEngine, relationshipEngine, 'compact_ledger_parse'\)/);
      assert.match(semanticSource, /repairRelationshipCoverage\(ledger\.resolutionEngine, ledger\.relationshipEngine, 'normalized_ledger'\)/);
      assert.match(semanticSource, /semanticLedgerRepair: mergeSemanticLedgerRepair/);
      assert.match(deterministicSource, /SEMANTIC_LEDGER_REPAIR/);
    },
  },
  {
    name: '33e.1 semantic action counting preserves repeated attacks and prose combos',
    run() {
      const enginesSource = fs.readFileSync(new URL('engines.js', import.meta.url), 'utf8');
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');

      assert.match(enginesSource, /actionUnits is the ONLY semantic source for mechanically counted actions/);
      assert.match(enginesSource, /return one unit per explicit discrete attack\/effect/);
      assert.match(enginesSource, /could separately land, miss, be blocked, dodged, deflected, or apply an effect/);
      assert.match(enginesSource, /count separate attacks\/effects even when they share target, goal, sentence, ability name, or combo/);
      assert.match(enginesSource, /count repeated uses of the same attack, spell, projectile/);
      assert.match(enginesSource, /do not count setup, aiming, drawing, focusing, chanting, movement, pivoting/);

      assert.match(semanticSource, /ResolutionEngine\.actionUnits is the only semantic source for mechanically counted actions/);
      assert.match(semanticSource, /Combat returns one unit per explicit discrete attack\/effect/);
      assert.match(semanticSource, /Count separate attacks\/effects even when they share one target, one goal, one sentence, one ability name, or one combo/);
      assert.match(semanticSource, /do not count setup, aiming, focusing, movement, pivoting, defense, or flavor/);
    },
  },
  {
    name: '33e.2 semantic classification separates introspection from external action',
    run() {
      const enginesSource = fs.readFileSync(new URL('engines.js', import.meta.url), 'utf8');
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');

      assert.match(enginesSource, /First-person introspection, internal monologue, memories, metaphors, self-questions, subjective sensations/);
      assert.match(enginesSource, /thought-only prose are context only/);
      assert.match(enginesSource, /extract only concrete present external action\/dialogue\/object use\/ability use\/movement\/attack\/interaction/);
      assert.match(enginesSource, /internal prose is never the challenge unless the same input declares a present external action\/objective/);

      assert.match(semanticSource, /ResolutionEngine must separate user-authored internal prose from external action/);
      assert.match(semanticSource, /First-person introspection, internal monologue, memories, metaphors, self-questions, subjective sensations/);
      assert.match(semanticSource, /They do not create actions, targets, rolls, wounds\/status\/condition, inventory\/gear changes, location changes, or scene facts/);
      assert.match(semanticSource, /When mixed, extract only concrete present external actions and spoken dialogue for identifyGoal, identifyChallenge, targets, challengeType, and actionUnits/);
      assert.match(semanticSource, /Do not mark wounds\/status\/condition from requested, intended, commanded, allowed, promised, predicted, pending attempted actions, remembered events, metaphors, internal sensations/);
      assert.match(semanticSource, /"I remember being gutted", or "my brain tries to breathe" is not woundsAdd\/statusAdd\/condition by itself/);
    },
  },
  {
    name: '33e.3 semantic roll gate separates positive stakes from no-stakes exclusions',
    run() {
      const enginesSource = fs.readFileSync(new URL('engines.js', import.meta.url), 'utf8');
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');

      assert.match(enginesSource, /STAKES/);
      assert.match(enginesSource, /NO_STAKES/);
      assert.match(enginesSource, /challengeType\(input, finalGoal, challenge, rollNeeded, context\)/);
      assert.match(enginesSource, /specific established living detector/);
      assert.match(enginesSource, /STAKES wins unless that exact stake is already resolved\/suppressed/);
      assert.match(enginesSource, /if challengeType=stealth, the specific living detector must be in ActionTargets and OppTargets\.NPC/);
      assert.match(enginesSource, /stealth-style action requires a specific established living detector; without one, return N unless a separate non-stealth obstacle creates stakes/);
      assert.match(enginesSource, /rule: apply DEF\.STAKES and DEF\.NO_STAKES/);

      assert.match(semanticSource, /Apply DEF\.STAKES and DEF\.NO_STAKES/);
      assert.match(semanticSource, /ResolutionEngine\.challengeType/);
      assert.match(semanticSource, /specific established living detector\/opponent/);
      assert.match(semanticSource, /Terrain, darkness, cover, distance, crowds, weather, and noise are scene conditions, not stealth opposition/);
      assert.match(semanticSource, /non-living obstacle or condition that makes the current goal fail-able/);
      assert.match(semanticSource, /stakes and ordinary continuity\/no-stakes wording both seem relevant, stakes win unless already resolved/);
      assert.match(semanticSource, /rollReason must be a concise explanation that agrees with rollNeeded/);
    },
  },
  {
    name: '34 streaming artifact display regex hides fenced tracker block only',
    run() {
      const script = buildStreamingArtifactRegexScript();
      assert.deepEqual(script.placement, [2]);
      assert.equal(script.markdownOnly, true);
      assert.equal(script.promptOnly, true);
      const streamed = [
        '```story_engine_tracker_delta',
        'BEGIN_TRACKER_DELTA',
        'TrackerUpdateEngine.user.condition=unchanged',
        'END_TRACKER_DELTA',
        '```',
        'BEGIN_FINAL_NARRATION',
        'Val steps back, hand tight on the rail.',
        'END_FINAL_NARRATION',
      ].join('\n');
      assert.equal(applyStreamingArtifactDisplayRegex(streamed).trim(), 'Val steps back, hand tight on the rail.');
      assert.equal(applyStreamingArtifactDisplayRegex('```story_engine_tracker_delta\nBEGIN_TRACKER_DELTA\nTrackerUpdateEngine.user.condition=unchanged').trim(), '');
      assert.equal(applyStreamingArtifactDisplayRegex('Val steps back.\nBEGIN_TRACKER_DELTA\nTrackerUpdateEngine.user.condition=unchanged').trim(), 'Val steps back.');
      assert.equal(applyStreamingArtifactDisplayRegex('Val says, "This is not a tracker delta."'), 'Val says, "This is not a tracker delta."');
      for (const stage of ['activeHandoff', 'dialogueTurn', 'inputChronology', 'agencySeparation', 'strictBehaviorism', 'strictEpistemology', 'diegeticPhysicality', 'embodiedPerception', 'denotativePhysicality', 'cohesiveSceneBeats']) {
        const narration = 'Val steps back.';
        assert.equal(applyStreamingArtifactDisplayRegex(`${stage}: complete\n${narration}`).trim(), narration);
        assert.equal(applyStreamingArtifactDisplayRegex(`function ${stage}(response, context): complete\n${narration}`).trim(), narration);
        assert.equal(sanitizeAssistantNarration(`${stage}: complete\n${narration}`), narration);
      }
    },
  },
  {
    name: '34a sanitizer strips narrator directive and scratchpad leakage',
    run() {
      const directiveLeak = [
        'STORY_ENGINE_NARRATOR_DIRECTIVE',
        'You are the final scene narrator.',
        'Use the NARRATOR_HANDOFF below as final authority for mechanics, outcomes, constraints, and narration instructions. Use recent visible chat only for continuity of already-established visible scene state. This handoff is mandatory, non-negotiable, and private.',
        'NARRATOR_AUTHORITY:',
        'These rules are mandatory.',
        '',
        'BEGIN_FINAL_NARRATION',
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
        'END_FINAL_NARRATION',
      ].join('\n');
      assert.equal(
        sanitizeAssistantNarration(directiveLeak),
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      );

      const scratchpadLeak = [
        'PRE-FLIGHT CHECK:',
        '',
        '1. olfactoryGate: No explicit sniff/smell/taste from user. -> SMELL/TASTE BANNED.',
        '2. abilityIntegration: No abilities activated.',
        '3. epistemicRender: Direct observation available.',
        'NO IntimacyBoundary permission active - Naomi is friendly but no sexual escalation permitted.',
        'Name: Naomi already revealed through self-introduction in prior beat. Use Naomi.',
        'Tense check: STRICT PRESENT TENSE.',
        'Perspective check: STRICT SECOND PERSON for Aelemar.',
        'Draft narration:',
        '- Naomi reaction to compliment',
        '- Her response to spin request',
        '</think>Naomi looks down at her skirt, pinches the hem between thumb and forefinger, and steps back from the doorway.',
        '"A ballerina? Like this?"',
      ].join('\n');
      assert.equal(
        stripComputedDebugPrefix(scratchpadLeak),
        'Naomi looks down at her skirt, pinches the hem between thumb and forefinger, and steps back from the doorway.\n"A ballerina? Like this?"',
      );

      const renderControlLeak = [
        '1. **activeHandoff:** End on an active beat that immediately requires a user response.',
        '',
        '2. **dialogueTurn:** Keep dialogue to one conversational contribution per character.',
        '',
        '3. **inputChronology:** Narrate what follows the user input.',
        '',
        '4. **agencySeparation:** Do not write user action.',
        '',
        '5. **strictBehaviorism:** No body-tell shorthand.',
        '',
        '6. **strictEpistemology:** Direct visual scene only.',
        '',
        '7. **diegeticPhysicality:** No active abilities or supernatural traits are being used.',
        '',
        '8. **embodiedPerception:** No explicit smell/taste invocation. No overpowering close-range source. -> LOCKED. No smell/taste.',
        '',
        '9. **denotativePhysicality:** Keep narration literal and objects physically objective.',
        '',
        '10. **cohesiveSceneBeats:** Connect only closely related physical events already in the scene.',
        '',
        'CONCLUSION: Valid to proceed with narration of Naomi entering and responding to the spin request.',
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      ].join('\n');
      assert.equal(
        sanitizeAssistantNarration(renderControlLeak),
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      );

      const taggedWithLeak = [
        '1. **olfactoryGate:** No smell/taste.',
        'CONCLUSION: Valid to proceed.',
        'BEGIN_FINAL_NARRATION',
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
        'END_FINAL_NARRATION',
        'post-generation note',
      ].join('\n');
      assert.equal(
        sanitizeAssistantNarration(taggedWithLeak),
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      );

      const partialTagLeak = [
        'BEGIN_FINAL_NARRATION',
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      ].join('\n');
      assert.equal(
        sanitizeAssistantNarration(partialTagLeak),
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      );

      const proseGuardLeak = [
        'Naomi steps into the entryway and turns once.',
        'STORY_ENGINE_TARGETED_PROSE_BAN_REPAIR',
        'BEGIN_PROSE_GUARD_EDITS',
        '{"sentenceRepairs":[]}',
        'END_PROSE_GUARD_EDITS',
      ].join('\n');
      assert.equal(
        sanitizeAssistantNarration(proseGuardLeak),
        'Naomi steps into the entryway and turns once.',
      );
    },
  },
  {
    name: '34b proxy mode uses square brackets and keeps normal engine handoff',
    run() {
      const indexSource = fs.readFileSync(extensionFile('index.js'), 'utf8');
      const runnerSource = fs.readFileSync(extensionFile('deterministic-runner.js'), 'utf8');
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      assert.match(indexSource, /startsWith\('\[\['\) && trimmed\.endsWith\('\]\]'\)/);
      assert.match(indexSource, /return \{ mode: 'proxy', innerText: trimmed\.slice\(2, -2\)\.trim\(\) \}/);
      assert.match(indexSource, /startsWith\('\(\('\) && trimmed\.endsWith\('\)\)'\)/);
      assert.ok(indexSource.includes('/^ooc\\s*:?\\s*$/i.test(trimmed)'));
      assert.ok(indexSource.includes("trimmed.match(/^ooc(?:\\s*:\\s*|\\s+)([\\s\\S]*)$/i)"));
      assert.match(indexSource, /return \{ mode: 'ooc', innerText: oocPrefix\[1\]\.trim\(\) \}/);
      assert.match(indexSource, /inlineProxyInstructions: extractInlineProxyInstructions\(trimmed\)/);
      assert.match(indexSource, /inlineProxyInstructions: userInputMode\.inlineProxyInstructions \|\| \[\]/);
      assert.match(indexSource, /inlineProxyInstructions: pendingGeneration\?\.inlineProxyInstructions \|\| \[\]/);
      assert.doesNotMatch(indexSource, /mode: 'proxy'[\s\S]{0,120}startsWith\('\(\(\('\)/);
      assert.match(indexSource, /userInputMode\.mode === 'ooc'[\s\S]*runSemanticPassWithPromptReadyBypass/);
      assert.match(indexSource, /\[STRUCTURED_PREFLIGHT_OOC\]/);
      assert.match(indexSource, /Answer the user\\'s OOC question directly as an assistant\./);
      assert.match(indexSource, /Use the visible prompt stack, chat history, character\/persona\/lore context, Prose Rules, and any visible handoff reminder as reference if relevant\./);
      assert.match(indexSource, /Do not run, imply, or update mechanics, rolls, tracker state, scene consequences, relationship state, or memory\./);
      const oocInterceptStart = indexSource.indexOf("if (userInputMode.mode === 'ooc')");
      const oocInterceptEnd = indexSource.indexOf("return false;", oocInterceptStart) + "return false;".length;
      const oocInterceptBranch = indexSource.slice(oocInterceptStart, oocInterceptEnd);
      assert.match(oocInterceptBranch, /clearRuntimePrompts\(\)/);
      assert.match(oocInterceptBranch, /injectPromptOptionPrompts\(\)/);
      assert.doesNotMatch(oocInterceptBranch, /clearPromptOptionPrompts/);
      const oocPromptReadyStart = indexSource.indexOf("if (generationMode === 'ooc')");
      const oocPromptReadyEnd = indexSource.indexOf("if (isNarratorGenerationPromptPass())", oocPromptReadyStart);
      const oocPromptReadyBranch = indexSource.slice(oocPromptReadyStart, oocPromptReadyEnd);
      assert.match(oocPromptReadyBranch, /buildOocResponsePrompt/);
      assert.doesNotMatch(oocPromptReadyBranch, /clearPromptOptionPrompts/);
      assert.match(runnerSource, /startsWith\('\[\['\) && trimmed\.endsWith\('\]\]'\)/);
      assert.match(runnerSource, /\.replace\(/);
      assert.match(runnerSource, /\\\[\\\[\(\[\\s\\S\]\*\?\)\\\]\\\]/);
      assert.match(semanticSource, /double square brackets for proxy action mode/);
      assert.match(semanticSource, /inline double square bracket proxy instructions/);
      assert.match(semanticSource, /prepared conditional action/);

      const report = runCase({
        userText: '[[I walk to Mira and offer her the sealed letter.]]',
        tracker: {
          Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Deliver_Letter',
            identifyChallenge: 'offer Mira the sealed letter',
            explicitMeans: 'walk to Mira and offer her the sealed letter',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      const text = formatNarratorModelPromptContext(report, {
        mode: 'proxy',
        latestUserText: 'I walk to Mira and offer her the sealed letter.',
      });
      assert.match(text, /Proxy action mode for \{\{user\}\} is active/);
      assert.match(text, /double square brackets/);
      assert.match(text, /narrativeFacts\(input\)/);
      assert.match(text, /sealed letter/);

      const inlineText = formatNarratorModelPromptContext(report, {
        mode: 'normal',
        latestUserText: 'I extend my hand, and prepare a spell. [[If he attacks, I unleash the spell immediately after.]]',
        inlineProxyInstructions: ['If he attacks, I unleash the spell immediately after.'],
      });
      assert.match(inlineText, /Inline proxy instructions from double square brackets are active/);
      assert.match(inlineText, /Conditional instructions resolve only if their condition actually occurs/);
      assert.match(inlineText, /unleash the spell immediately after/);
    },
  },
  {
    name: '34c user ability use is semantic-only and carried into narrator handoff',
    run() {
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      const runnerSource = fs.readFileSync(extensionFile('deterministic-runner.js'), 'utf8');
      const preflightSource = fs.readFileSync(extensionFile('pre-flight.js'), 'utf8');

      assert.match(semanticSource, /ResolutionEngine\.userAbilityUse\.Used=N/);
      assert.match(semanticSource, /ResolutionEngine\.userAbilityUse\.Attempted=N/);
      assert.match(semanticSource, /ResolutionEngine\.userAbilityUse\.Available=N/);
      assert.match(semanticSource, /ResolutionEngine\.userAbilityUse\.NoEffectReason=\(none\)/);
      assert.match(semanticSource, /compare the latest user input against active \{\{user\}\}\/persona abilities and spells/i);
      assert.match(semanticSource, /trigger, delivery method, or desired effect/i);
      assert.match(semanticSource, /including the # ABILITIES and # SPELLS character sheet sections/i);
      assert.match(semanticSource, /attempted ability\/spell exists in active \{\{user\}\} abilities or spells/i);
      assert.match(semanticSource, /Mark Attempted=Y when the input explicitly names an ability\/spell or implicitly describes attempting one/i);
      assert.match(semanticSource, /meant only for X/);
      assert.match(semanticSource, /only X can hear/);
      assert.match(semanticSource, /Mark Available=Y only if/i);
      assert.match(semanticSource, /MechanicalScope must always be flavor_only_no_bonus/i);
      assert.match(semanticSource, /never a bonus, never a dice modifier, never a separate roll/i);
      assert.match(semanticSource, /userAbilityUse:\s*normalizeUserAbilityUse/);
      assert.match(runnerSource, /UserAbilityUse:\s*normalizeUserAbilityUseForHandoff\(semantic\.userAbilityUse\)/);
      assert.doesNotMatch(runnerSource, /UserAbilityUse[\s\S]{0,200}(?:atkTot|defTot|margin|RollPenalty|CounterBonus)\s*[+\-=]/);
      assert.match(preflightSource, /When an ability, spell, power, trait, or supernatural effect is activated by \{\{user\}\} or a character\/NPC, narrate ONLY its OBSERVABLE effects and consequences\./i);
      assert.match(preflightSource, /DO NOT label, announce, name, or explain abilities or supernatural effects outside explicitly spoken dialogue\./i);
      assert.match(preflightSource, /DO NOT explain activation, casting, or system mechanics\./i);

      const report = runCase({
        userText: 'I whisper under my breath, meant only for Alice: "Leave him alone."',
        tracker: {
          Alice: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Private_Warning',
            identifyChallenge: 'privately warn Alice',
            explicitMeans: 'whisper under my breath meant only for Alice',
            userAbilityUse: {
              used: true,
              attempted: true,
              available: true,
              abilityName: 'Resonant Voice',
              evidence: 'meant only for Alice',
              narrativeEffect: 'Alice alone hears the whispered words',
              noEffectReason: '(none)',
              mechanicalScope: 'flavor_only_no_bonus',
            },
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Alice')],
        }),
      });

      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(packet.UserAbilityUse, {
        Used: 'Y',
        Attempted: 'Y',
        Available: 'Y',
        AbilityName: 'Resonant Voice',
        Evidence: 'meant only for Alice',
        NarrativeEffect: 'Alice alone hears the whispered words',
        NoEffectReason: '(none)',
        MechanicalScope: 'flavor_only_no_bonus',
      });
      assert.equal(packet.RollNeeded, 'N');

      const prompt = formatNarratorModelPromptContext(report);
      assert.match(prompt, /\{\{user\}\}'s ability can produce this direct scene effect: Alice alone hears the whispered words/i);
      assert.match(prompt, /Do not announce, label, explain, activate, focus, channel, charge, or name the ability/i);
      assert.match(prompt, /Do not add extra success, extra impact, or bypassed consequences/i);
      assert.doesNotMatch(prompt, /UserAbilityUse:/);

      const unavailableReport = runCase({
        userText: 'I extend my hand and picture a small ball of fire forming at my fingertip.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Attempt_Fire_Spell',
            identifyChallenge: 'attempt to create a small ball of fire',
            explicitMeans: 'picture a small ball of fire forming at fingertip',
            userAbilityUse: {
              used: false,
              attempted: true,
              available: false,
              abilityName: 'fire spell',
              evidence: 'small ball of fire forming at my fingertip',
              narrativeEffect: 'a small ball of fire forms at the fingertip',
              noEffectReason: 'not in known user abilities',
              mechanicalScope: 'flavor_only_no_bonus',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
      });

      const unavailablePacket = unavailableReport.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(unavailablePacket.UserAbilityUse, {
        Used: 'N',
        Attempted: 'Y',
        Available: 'N',
        AbilityName: 'fire spell',
        Evidence: 'small ball of fire forming at my fingertip',
        NarrativeEffect: 'a small ball of fire forms at the fingertip',
        NoEffectReason: 'not in known user abilities',
        MechanicalScope: 'flavor_only_no_bonus',
      });
      const unavailablePrompt = formatNarratorModelPromptContext(unavailableReport);
      assert.match(unavailablePrompt, /unavailable supernatural or special ability: fire spell/i);
      assert.match(unavailablePrompt, /The attempted effect does not occur/i);
      assert.match(unavailablePrompt, /Do not create the attempted effect: a small ball of fire forms at the fingertip/i);
      assert.match(unavailablePrompt, /Render only the lack of effect and visible reactions/i);
      assert.doesNotMatch(unavailablePrompt, /can produce this direct scene effect: a small ball of fire forms at the fingertip/i);
      assert.doesNotMatch(unavailablePrompt, /\(none\)'s response|Use the listed NPC state naturally: none/i);
    },
  },
  {
    name: '34c2 item use availability is semantic-only and carried into narrator handoff',
    run() {
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      const runnerSource = fs.readFileSync(extensionFile('deterministic-runner.js'), 'utf8');
      const preflightSource = fs.readFileSync(extensionFile('pre-flight.js'), 'utf8');

      assert.match(semanticSource, /ITEM_USE_SOURCES/);
      assert.match(semanticSource, /ResolutionEngine\.itemUse\.Attempted=N/);
      assert.match(semanticSource, /ResolutionEngine\.itemUse\.Available=N/);
      assert.match(semanticSource, /ResolutionEngine\.itemUse\.NoEffectReason=\(none\)/);
      assert.match(semanticSource, /strict semantic-only personal gear\/inventory verification/i);
      assert.match(semanticSource, /Mark Attempted=N for ordinary interaction with environmental, scene, or NPC-offered objects/i);
      assert.match(semanticSource, /The latest user input cannot create possession, carried state, equipment, inventory, or evidence of availability/i);
      assert.match(semanticSource, /Personal carried-item signals include "my X", "from my belt"/i);
      assert.doesNotMatch(semanticSource, /setting_affordance/);
      assert.doesNotMatch(semanticSource, /consequence_affordance/);
      assert.match(runnerSource, /USER_OWNED_ITEM_SOURCES/);
      assert.match(runnerSource, /user-owned item sources require saved user gear\/inventory/i);
      assert.match(runnerSource, /scene, environmental, or NPC-offered objects are not personal gear\/inventory itemUse/i);
      assert.match(runnerSource, /const itemUse = normalizeItemUseForHandoff\(semantic\.itemUse,\s*context,\s*itemUseAudit,\s*playerTrackerSnapshot\)/);
      assert.match(runnerSource, /getUnavailablePersonalItemNoRollEvidence\(itemUse\)/);
      assert.match(runnerSource, /saved user gear\/inventory overrides semantic false unavailable result/i);
      assert.doesNotMatch(runnerSource, /ItemUse[\s\S]{0,240}(?:atkTot|defTot|margin|RollPenalty|CounterBonus)\s*[+\-=]/);
      assert.doesNotMatch(preflightSource, /itemAvailability:/i);
      assert.match(preflightSource, /\['itemUse', narrativeItemFact\(resolution\.ItemUse\)\]/);
      assert.match(preflightSource, /The item must not appear, be drawn, be wielded, be consumed, unlock anything, or enter \{\{user\}\} possession\./i);
      assert.doesNotMatch(preflightSource, /setting_affordance|consequence_affordance|Contested item branch/);

      const unavailableReport = runCase({
        userText: 'I smile at Alice, then draw my sword.',
        tracker: {
          Alice: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Draw_Weapon',
            identifyChallenge: 'draw a sword while facing Alice',
            explicitMeans: 'draw my sword',
            itemUse: {
              attempted: true,
              available: false,
              item: 'sword',
              source: 'unavailable',
              evidence: 'draw my sword',
              noEffectReason: 'not in saved user gear/inventory',
            },
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Alice')],
        }),
      });

      const unavailablePacket = unavailableReport.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(unavailablePacket.ItemUse, {
        Attempted: 'Y',
        Available: 'N',
        Item: 'sword',
        Source: 'unavailable',
        Evidence: 'draw my sword',
        NoEffectReason: 'not in saved user gear/inventory',
      });
      assert.equal(unavailablePacket.RollNeeded, 'N');
      const unavailablePrompt = prompt(unavailableReport);
      assert.match(unavailablePrompt, /\{\{user\}\} attempts to use\/draw\/produce\/consume: sword/i);
      assert.match(unavailablePrompt, /Availability: unavailable/i);
      assert.match(unavailablePrompt, /The item must not appear, be drawn, be wielded, be consumed/i);
      assert.match(unavailablePrompt, /Do not skip, gloss over, or replace the attempt/i);
      assert.doesNotMatch(unavailablePrompt, /sword is available to the user in the scene from gear/i);
      assert.doesNotMatch(unavailablePrompt, /ItemUse:/);

      const unavailableCombatReport = runCase({
        userText: 'I reach for the longsword at my belt and try to draw it, saying, "I gave you a chance."',
        tracker: {
          Valerie: trackerEntry({ currentDisposition: { B: 1, F: 2, H: 2 }, currentCoreStats: { PHY: 3, MND: 2, CHA: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Draw a longsword and attack Valerie',
            identifyChallenge: 'Drawing a longsword and attacking Valerie',
            explicitMeans: 'I reach for the longsword at my belt and try to draw it',
            itemUse: {
              attempted: true,
              available: false,
              item: 'longsword',
              source: 'unavailable',
              evidence: 'I reach for the longsword at my belt and try to draw it',
              noEffectReason: 'not in saved user gear/inventory',
            },
            identifyTargets: {
              ActionTargets: ['Valerie'],
              OppTargets: { NPC: ['Valerie'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          injuryEffectEngine: {
            effects: [
              {
                target: 'Valerie',
                effectType: 'physical_injury',
                description: 'minor Slash or stab wound from a longsword attack',
                severity: 'minor',
              },
            ],
          },
          relationshipEngine: [relationship('Valerie')],
        }),
      });
      assert.equal(unavailableCombatReport.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(unavailableCombatReport.finalNarrativeHandoff.resolutionPacket.challengeType, 'none');
      assert.equal(unavailableCombatReport.finalNarrativeHandoff.resolutionPacket.challengeType, 'none');
      assert.equal(unavailableCombatReport.finalNarrativeHandoff.resolutionPacket.LandedActions, '(none)');
      assert.deepEqual(unavailableCombatReport.finalNarrativeHandoff.resolutionPacket.InflictedInjuries, []);
      assert.match(unavailableCombatReport.finalNarrativeHandoff.resolutionPacket.RollReason, /unavailable personal item: longsword/i);
      assert.match(unavailableCombatReport.auditLines.join('\n'), /deterministicUnavailableItem/);

      const falseWornReport = runCase({
        userText: 'I draw the sword at my belt.',
        userState: { gear: [], inventory: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Draw_Weapon',
            identifyChallenge: 'draw the sword at my belt',
            explicitMeans: 'draw the sword at my belt',
            itemUse: {
              attempted: true,
              available: true,
              item: 'sword',
              source: 'gear',
              evidence: 'at my belt',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
      });
      assert.deepEqual(falseWornReport.finalNarrativeHandoff.resolutionPacket.ItemUse, {
        Attempted: 'Y',
        Available: 'N',
        Item: 'sword',
        Source: 'unavailable',
        Evidence: 'at my belt',
        NoEffectReason: 'not in saved user gear/inventory',
      });
      assert.match(prompt(falseWornReport), /Availability: unavailable/i);
      assert.match(falseWornReport.auditLines.join('\n'), /deterministicItemAvailability/);
      assert.match(falseWornReport.auditLines.join('\n'), /latest user wording cannot create possession/);

      const falseCarriedReport = runCase({
        userText: 'I pull the waterskin from my pack and drink.',
        userState: { gear: [], inventory: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Drink_Water',
            identifyChallenge: 'drink from a waterskin',
            explicitMeans: 'pull the waterskin from my pack',
            itemUse: {
              attempted: true,
              available: true,
              item: 'waterskin',
              source: 'inventory',
              evidence: 'from my pack',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
      });
      assert.deepEqual(falseCarriedReport.finalNarrativeHandoff.resolutionPacket.ItemUse, {
        Attempted: 'Y',
        Available: 'N',
        Item: 'waterskin',
        Source: 'unavailable',
        Evidence: 'from my pack',
        NoEffectReason: 'not in saved user gear/inventory',
      });
      assert.match(prompt(falseCarriedReport), /Availability: unavailable/i);

      const repairedInventoryReport = withDice([10, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], () => runDeterministicEngines(
        baseLedger({
          resolutionEngine: {
            identifyGoal: 'Drink_Water',
            identifyChallenge: 'drink from waterskin',
            explicitMeans: 'take a swig off of my waterskin',
            itemUse: {
              attempted: true,
              available: false,
              item: 'waterskin',
              source: 'unavailable',
              evidence: 'take a swig off of my waterskin',
              noEffectReason: 'not in saved user gear/inventory',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
        {},
        context('I smile and take a swig off of my waterskin.', {}, {}),
        'normal',
        { playerTrackerSnapshot: { gear: [], inventory: ['waterskin'] } },
      ));
      assert.deepEqual(repairedInventoryReport.finalNarrativeHandoff.resolutionPacket.ItemUse, {
        Attempted: 'Y',
        Available: 'Y',
        Item: 'waterskin',
        Source: 'inventory',
        Evidence: 'take a swig off of my waterskin',
        NoEffectReason: '(none)',
      });
      assert.match(prompt(repairedInventoryReport), /Availability: available from inventory/i);
      assert.match(repairedInventoryReport.auditLines.join('\n'), /deterministicItemAvailabilityRepair/);

      const describedInventoryReport = withDice([10, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], () => runDeterministicEngines(
        baseLedger({
          resolutionEngine: {
            identifyGoal: 'Drink_Water',
            identifyChallenge: 'drink from waterskin',
            explicitMeans: 'take a swig off of my waterskin',
            itemUse: {
              attempted: true,
              available: false,
              item: 'waterskin',
              source: 'unavailable',
              evidence: 'take a swig off of my waterskin',
              noEffectReason: 'not in saved user gear/inventory',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
        {},
        context('I smile and take a swig off of my waterskin.', {}, {}),
        'normal',
        { playerTrackerSnapshot: { gear: [], inventory: ['Waterskin (empty)'] } },
      ));
      assert.equal(describedInventoryReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Available, 'Y');
      assert.equal(describedInventoryReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Source, 'inventory');
      assert.equal(describedInventoryReport.finalNarrativeHandoff.resolutionPacket.ItemUse.SavedItem, 'Waterskin (empty)');
      assert.match(prompt(describedInventoryReport), /Saved item state: Waterskin \(empty\)/i);
      assert.match(prompt(describedInventoryReport), /if it limits use, the limitation must affect the scene/i);
      assert.match(prompt(describedInventoryReport), /Narrate the attempt and its immediate result/i);

      const gearReport = runCase({
        userText: 'I draw the sword from my belt.',
        userState: { gear: ['sword'], inventory: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Draw_Weapon',
            identifyChallenge: 'draw the sword from my belt',
            explicitMeans: 'draw the sword from my belt',
            itemUse: {
              attempted: true,
              available: true,
              item: 'sword',
              source: 'gear',
              evidence: 'sword in user gear',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
      });
      assert.equal(gearReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Available, 'Y');
      assert.equal(gearReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Source, 'gear');
      assert.match(prompt(gearReport), /Availability: available from gear/i);
      assert.match(prompt(gearReport), /Item availability is not automatic success, extra impact, or bypassed consequence/i);

      const inventoryReport = runCase({
        userText: 'I unlock the door with my small iron key.',
        userState: { gear: [], inventory: ['small iron key'] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Unlock_Door',
            identifyChallenge: 'unlock the door with the small iron key',
            explicitMeans: 'use small iron key',
            itemUse: {
              attempted: true,
              available: true,
              item: 'iron key',
              source: 'inventory',
              evidence: 'small iron key in inventory',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['locked door'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            environmentDifficulty: 4,
          },
        }),
      });
      assert.equal(inventoryReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Available, 'Y');
      assert.equal(inventoryReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Source, 'inventory');

      const describedKnifeReport = runCase({
        userText: 'I draw my knife.',
        userState: { gear: [], inventory: ['Small belt knife (utility, not combat)'] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Draw_Knife',
            identifyChallenge: 'draw a knife',
            explicitMeans: 'draw my knife',
            itemUse: {
              attempted: true,
              available: true,
              item: 'knife',
              source: 'inventory',
              evidence: 'small belt knife in inventory',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
      });
      assert.equal(describedKnifeReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Available, 'Y');
      assert.equal(describedKnifeReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Source, 'inventory');
      assert.equal(describedKnifeReport.finalNarrativeHandoff.resolutionPacket.ItemUse.SavedItem, 'Small belt knife (utility, not combat)');

      const tooSpecificReport = runCase({
        userText: 'I unlock the vault with my vault key.',
        userState: { gear: [], inventory: ['key'] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Unlock_Vault',
            identifyChallenge: 'unlock the vault with the vault key',
            explicitMeans: 'use vault key',
            itemUse: {
              attempted: true,
              available: true,
              item: 'vault key',
              source: 'inventory',
              evidence: 'my vault key',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['vault door'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: true,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            environmentDifficulty: 8,
          },
        }),
      });
      assert.equal(tooSpecificReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Available, 'N');
      assert.equal(tooSpecificReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Source, 'unavailable');
      assert.match(prompt(tooSpecificReport), /Availability: unavailable/i);

      const environmentalReport = runCase({
        userText: 'I grab a bottle from the tavern table.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Grab_Object',
            identifyChallenge: 'grab a bottle from the tavern table',
            explicitMeans: 'grab a bottle from the tavern table',
            itemUse: {
              attempted: false,
              available: false,
              item: '(none)',
              source: 'none',
              evidence: '(none)',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
      });
      assert.deepEqual(environmentalReport.finalNarrativeHandoff.resolutionPacket.ItemUse, {
        Attempted: 'N',
        Available: 'N',
        Item: '(none)',
        Source: 'none',
        Evidence: '(none)',
        NoEffectReason: '(none)',
      });
      assert.doesNotMatch(prompt(environmentalReport), /bottle is available to the user/i);

      const consequenceObjectReport = runCase({
        userText: 'I grab the fallen bandit\'s sword.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Grab_Object',
            identifyChallenge: 'grab the fallen bandit\'s sword',
            explicitMeans: 'grab the fallen bandit\'s sword',
            itemUse: {
              attempted: false,
              available: false,
              item: '(none)',
              source: 'none',
              evidence: '(none)',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
      });
      assert.equal(consequenceObjectReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Attempted, 'N');
      assert.doesNotMatch(prompt(consequenceObjectReport), /fallen bandit sword is available to the user/i);

      const misclassifiedTablePickupReport = runCase({
        userText: 'I grab the phone from the nearby table.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Grab_Object',
            identifyChallenge: 'grab the phone from the nearby table',
            explicitMeans: 'grab the phone from the nearby table',
            itemUse: {
              attempted: true,
              available: false,
              item: 'phone',
              source: 'unavailable',
              evidence: 'grab the phone from the nearby table',
              noEffectReason: 'not in saved user gear/inventory',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
        }),
      });
      assert.deepEqual(misclassifiedTablePickupReport.finalNarrativeHandoff.resolutionPacket.ItemUse, {
        Attempted: 'N',
        Available: 'N',
        Item: '(none)',
        Source: 'none',
        Evidence: '(none)',
        NoEffectReason: '(none)',
      });
      assert(auditIncludes(misclassifiedTablePickupReport, 'deterministicSceneObjectItemUseRepair'));
      assert.doesNotMatch(prompt(misclassifiedTablePickupReport), /Availability: unavailable/i);
      assert.doesNotMatch(prompt(misclassifiedTablePickupReport), /The item must not appear/i);

      const misclassifiedNpcTransferReport = runCase({
        userText: 'Alice hands me a key and I take it.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Receive_Object',
            identifyChallenge: 'take the key Alice hands me',
            explicitMeans: 'Alice hands me a key and I take it',
            itemUse: {
              attempted: true,
              available: false,
              item: 'key',
              source: 'unavailable',
              evidence: 'Alice hands me a key and I take it',
              noEffectReason: 'not in saved user gear/inventory',
            },
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Alice')],
        }),
      });
      assert.deepEqual(misclassifiedNpcTransferReport.finalNarrativeHandoff.resolutionPacket.ItemUse, {
        Attempted: 'N',
        Available: 'N',
        Item: '(none)',
        Source: 'none',
        Evidence: '(none)',
        NoEffectReason: '(none)',
      });
      assert(auditIncludes(misclassifiedNpcTransferReport, 'deterministicSceneObjectItemUseRepair'));
      assert.doesNotMatch(prompt(misclassifiedNpcTransferReport), /Availability: unavailable/i);
    },
  },
  {
    name: '34d stake-bearing false or unsupported factual claim forces a belief contest',
    run() {
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      const runnerSource = fs.readFileSync(extensionFile('deterministic-runner.js'), 'utf8');
      const enginesSource = fs.readFileSync(extensionFile('engines.js'), 'utf8');
      const preflightSource = fs.readFileSync(extensionFile('pre-flight.js'), 'utf8');

      assert.match(semanticSource, /ResolutionEngine\.claimCheck\.Present=N/);
      assert.match(semanticSource, /stakes-bearing claim check, not a truth engine/i);
      assert.match(semanticSource, /known_false or unsupported claim has StakesImpact=Y/i);
      assert.match(runnerSource, /ClaimCheck:\s*normalizeClaimCheckForHandoff\(semantic\.claimCheck\)/);
      assert.match(runnerSource, /hard_override_stake_bearing_claim_roll/);
      assert.match(enginesSource, /bluff = deception, lying, false claims, misleading, tricking/i);
      assert.match(enginesSource, /socialTactic === 'diplomacy'[\s\S]*\{ userStat: 'CHA', oppStat: 'CHA' \}/);
      assert.match(preflightSource, /Claim branch:/);
      assert.match(preflightSource, /NPC access is not direct; failed claim means doubt, distrust, inconsistency, proof demand, refusal, or testing, not omniscient certainty/);

      const report = runCase({
        userText: 'I tell Seraphina, "I am the queen\'s envoy. Open the sealed gate."',
        dice: [15, 6, 10, 10, 10, 10],
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 2, F: 2, H: 2 },
            genStats: { CapabilityPool: 'common', MainStat: 'Balanced' },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Gain_Access',
            identifyChallenge: 'convince Seraphina to open the sealed gate through claimed royal authority',
            explicitMeans: 'claim to be the queen\'s envoy',
            claimCheck: {
              present: true,
              claim: 'I am the queen\'s envoy',
              targetNPC: 'Seraphina',
              truthStatus: 'unsupported',
              npcAccess: 'partial',
              stakesImpact: true,
              reason: 'Claimed royal authority would affect Seraphina opening the sealed gate',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['sealed gate access'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
            challengeType: 'environment',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
          },
          relationshipEngine: [relationship('Seraphina', {
            genStats: { CapabilityPool: 'common', MainStat: 'Balanced' },
          })],
        }),
      });

      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'Y');
      assert.deepEqual(packet.ClaimCheck, {
        Present: 'Y',
        Claim: 'I am the queen\'s envoy',
        TargetNPC: 'Seraphina',
        TruthStatus: 'unsupported',
        NPCAccess: 'partial',
        StakesImpact: 'Y',
        Reason: 'Claimed royal authority would affect Seraphina opening the sealed gate',
      });
      assert.ok(packet.ActionTargets.includes('Seraphina'));
      assert.ok(packet.OppTargets.NPC.includes('Seraphina'));
      assert.match(report.finalNarrativeHandoff.resultLine, /\+\s*CHA\(/);
      assert.match(report.finalNarrativeHandoff.resultLine, /vs\s+1d20\(\d+\)\s*\+\s*MND\(/);
      assert.ok(auditIncludes(report, 'hard_override_stake_bearing_claim_roll'));
      assert.ok(auditIncludes(report, 'known-false or unsupported factual claim with material NPC stakes requires a belief contest'));

      const text = prompt(report);
      assert.match(text, /belief contest for Seraphina: "I am the queen's envoy"/i);
      assert.match(text, /belief contest/i);
      assert.match(text, /Seraphina has partial access to judge the claim/i);
      assert.match(text, /not omniscient certainty/i);
    },
  },
  {
    name: '34e no-stakes factual claim does not force a roll or narrator claim branch',
    run() {
      const report = runCase({
        userText: 'I tell Seraphina, "The rain followed me all morning."',
        tracker: {
          Seraphina: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Small_Talk',
            identifyChallenge: 'ordinary conversation about weather',
            explicitMeans: 'mention the rain',
            claimCheck: {
              present: true,
              claim: 'The rain followed me all morning',
              targetNPC: 'Seraphina',
              truthStatus: 'unsupported',
              npcAccess: 'unknown',
              stakesImpact: false,
              reason: 'Harmless small talk with no material NPC stakes',
            },
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
            challengeType: 'social',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'diplomacy',
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });

      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.RollNeeded, 'N');
      assert.equal(packet.ClaimCheck.Present, 'Y');
      assert.equal(packet.ClaimCheck.StakesImpact, 'N');
      assert.equal(packet.ClaimCheck.TruthStatus, 'unsupported');
      assert.equal(auditIncludes(report, 'hard_override_stake_bearing_claim_roll'), false);

      const text = prompt(report);
      assert.doesNotMatch(text, /Claim branch:/);
      assert.doesNotMatch(text, /belief contest/i);
    },
  },
  {
    name: '34f semantic stakes require explicit user intent and direct NPC targeting',
    run() {
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      assert.match(semanticSource, /ResolutionEngine user intent is explicit-only/);
      assert.match(semanticSource, /identifyGoal and identifyChallenge, use only the latest user-declared action, request, target, and explicit objective/);
      assert.match(semanticSource, /do not infer an unstated goal from NPC fear, hostility, suspicion, likely reaction, context, or what an NPC might assume/);
      assert.match(semanticSource, /For NPC-targeted stakes and OppTargets\.NPC, the latest user input must directly target that NPC with a stakes-bearing action/);
      assert.match(semanticSource, /Ambiguous, preparatory, self-directed, atmospheric, or scene-state actions remain exactly that/);
      assert.match(semanticSource, /Drawing, readying, revealing, holding, sheathing, or repositioning a weapon is scene state, not intimidation or coercion by itself/);
      assert.match(semanticSource, /classify it as stakes only when the user also declares a demand, threat, attack, aim\/pointing at a target/);
      assert.match(semanticSource, /rollNeeded is the sole semantic roll gate/);
      assert.match(semanticSource, /repeated resolved same-tactic negative social attempt/);
      assert.match(semanticSource, /Failed\/resolved bluff blocks repeated bluff; failed\/resolved intimidate blocks repeated intimidate/);
      assert.match(semanticSource, /Bluff does not block a later intimidate, and intimidate does not block a later bluff/);
      assert.match(semanticSource, /Do not carry forward a prior social goal as the current goal after it already failed or resolved/);
      assert.match(semanticSource, /post-failure phrases such as accepting refusal, declaring consequence, or escalating toward violence are aftermath\/escalation/);
      assert.match(semanticSource, /Do not treat repeated same-tactic threats, stronger insults, rephrased same-tactic bluffs, renewed same-tactic coercion, or dramatic display after refusal\/failure as a fresh social contest/);
    },
  },
  {
    name: '35 name promotion does not retire established named NPCs',
    run() {
      const text = 'Seraphina and I enter a ruined roadside shrine at dusk. A wounded merchant named Darai is pinned behind a broken pillar.';
      const promotions = getExplicitNamePromotions(text, ['Seraphina', 'Ogre', 'Raider1']);
      assert.equal(isPromotableTrackerName('Seraphina'), false);
      assert.equal(promotions.some(item => item.oldName === 'Seraphina'), false);
      assert.equal(promotions.some(item => item.newName === 'Darai'), false);
    },
  },
  {
    name: '36 name promotion still supports explicit generic placeholder naming',
    run() {
      assert.equal(isPromotableTrackerName('Raider1'), true);
      assert.equal(isPromotableTrackerName('convocation_leader'), true);
      assert.equal(isPromotableTrackerName('convocation leader'), false);
      assert.equal(isPromotableTrackerName('Unknown Woman'), true);
      assert.equal(isPromotableTrackerName('Lavender-haired girl'), true);
      assert.equal(isPromotableTrackerName('silver haired student'), true);
      assert.equal(isPromotableTrackerName('Yotiara'), false);
      const promotions = getExplicitNamePromotions('The Raider1 name is Mora.', ['Raider1']);
      assert.deepEqual(promotions, [{ oldName: 'Raider1', newName: 'Mora' }]);
    },
  },
  {
    name: '36a name promotion supports assistant-side terse introductions',
    run() {
      const text = 'The bystander looked at Aelemar properly for the first time. "Torvinash." He nodded once. "You traveling far?"';
      const promotions = getExplicitNamePromotions(text, ['bystander']);
      assert.deepEqual(promotions, [{ oldName: 'bystander', newName: 'Torvinash' }]);
    },
  },
  {
    name: '36b user-side name claims do not promote tracker names',
    run() {
      const userText = "The bystander's name is Torvinash.";
      const assistantText = 'The bystander watched Aelemar without offering a name.';
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const promotionFunction = indexSource.match(/function applyExplicitNamePromotions[\s\S]*?\n}\n/)?.[0] || '';
      assert.deepEqual(getExplicitNamePromotions(userText, ['bystander']), [{ oldName: 'bystander', newName: 'Torvinash' }]);
      assert.deepEqual(getExplicitNamePromotions(assistantText, ['bystander']), []);
      assert.equal(/getExplicitNamePromotions\s*\(\s*latestUserText\b/.test(promotionFunction), false);
      assert.equal(/getExplicitNamePromotions\s*\(\s*assistantText\b/.test(promotionFunction), true);
    },
  },
  {
    name: '36c post-narration tracker reconciles named duplicate with single descriptive placeholder',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      assert.match(source, /function reconcileNamedNpcDuplicates/);
      assert.match(source, /previousActivePromotable\.length !== 1/);
      assert.match(source, /isPromotableTrackerName\(name\)/);
      assert.match(source, /promoteTrackerEntry\(normalized, placeholder, candidates\[0\]\)/);
      assert.match(source, /beforeNpcs: pendingRun\.trackerBefore/);
    },
  },
  {
    name: '36d semantic revealedName promotes existing tracked NPCs without whitelist gate',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const mergeSource = source.slice(
        source.indexOf('function mergePostNarrationTrackerDelta'),
        source.indexOf('function assignMissingDisplayNpcPersonalitySummaries'),
      );
      assert.match(mergeSource, /const revealedName = cleanRevealedTrackerName\(npcDelta\?\.revealedName\)/);
      assert.match(mergeSource, /if \(revealedName\) \{\s*promoteTrackerEntry\(npcs, name, revealedName\);/);
      assert.doesNotMatch(mergeSource, /revealedName && isPromotableTrackerName\(name\)/);
    },
  },
  {
    name: '37 hostilesInScene is carried without relationship routing',
    run() {
      const report = runCase({
        userText: 'I keep my shield raised beside Seraphina.',
        tracker: {
          Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
          Ogre: trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ProtectSeraphina',
            identifyChallenge: 'keep a shield raised beside Seraphina',
            explicitMeans: 'shield raised beside Seraphina',
            identifyTargets: {
              hostilesInScene: { NPC: ['Ogre'] },
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            activeHostileThreat: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.hostilesInScene.NPC, ['Ogre']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.NPCInScene, ['Seraphina']);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs.some(item => item.NPC === 'Ogre'), false);
      assert.match(auditPrompt(report), /hostiles:Ogre; action:Seraphina/);
    },
  },
  {
    name: '38 directed companion attack request uses hostilesInScene without mutating OppTargets',
    run() {
      const report = runCase({
        userText: 'Seraphina, hit the axe raider hard.',
        dice: [
          10, 10, 10, 10, 10, 10,
          10, 10, 10, 10, 10,
          18, 100,
          18, 4,
        ],
        tracker: {
          Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 }, currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 6, MND: 4, CHA: 4 } }),
          'axe raider': trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 3, CHA: 2 }, gear: ['axe'] }),
          'knife raider': trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 3, CHA: 2 }, gear: ['knife'] }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'CommandCompanionAttack',
            identifyChallenge: 'command Seraphina to hit the axe raider',
            explicitMeans: 'command Seraphina to hit the axe raider',
            identifyTargets: {
              hostilesInScene: { NPC: ['axe raider', 'knife raider'] },
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            activeHostileThreat: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(packet.hostilesInScene.NPC, ['axe raider', 'knife raider']);
      assert.deepEqual(packet.OppTargets.NPC, ['(none)']);
      assert.equal(packet.RollNeeded, 'N');
      assert.equal(packet.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Seraphina.ProactivityTarget, 'axe raider');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Seraphina.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'axe raider');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs.some(item => item.NPC === 'axe raider'), false);
    },
  },
  {
    name: '39 ambiguous companion attack does not guess among multiple hostiles',
    run() {
      const report = runCase({
        userText: 'Seraphina, hit them hard.',
        dice: [
          10, 10, 10, 10, 10, 10,
          100,
        ],
        tracker: {
          Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
          'axe raider': trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, gear: ['axe'] }),
          'knife raider': trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, gear: ['knife'] }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'CommandCompanionAttack',
            identifyChallenge: 'command Seraphina to hit the enemies',
            explicitMeans: 'command Seraphina to hit them',
            identifyTargets: {
              hostilesInScene: { NPC: ['axe raider', 'knife raider'] },
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            activeHostileThreat: true,
            rollNeeded: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.RollNeeded, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.notEqual(report.finalNarrativeHandoff.proactivityResults.Seraphina.ProactivityTarget, 'axe raider');
      assert.notEqual(report.finalNarrativeHandoff.proactivityResults.Seraphina.ProactivityTarget, 'knife raider');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina, undefined);
    },
  },
  {
    name: '40 narrator keeps chaos guidance when proactivity also fires',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'search the ruined shrine',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '1d20(14) + MND(6) = 20 vs 1d20(8) + ENV(0) = 8 (12 - Success)',
          resolutionPacket: {
            GOAL: 'SearchShrine',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            RollNeeded: 'Y',
            LandedActions: 1,
            OutcomeTier: 'Success',
            Outcome: 'success',
            CounterPotential: 'none',
            activeHostileThreat: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: [] },
            ActionTargets: ['Seraphina'],
            OppTargets: { NPC: [], ENV: ['ruined shrine'] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Seraphina'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Seraphina',
            FinalState: 'B3/F1/H1',
            Behavior: 'FRIENDLY',
            Target: 'Bond',
            NPC_STAKES: 'N',
            Landed: 'Y',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: {
            CHAOS: {
              triggered: true,
              band: 'BENEFICIAL',
              magnitude: 'MODERATE',
              anchor: 'CLUE',
              vector: 'ENVIRONMENT',
            },
          },
          proactivityResults: {
            Seraphina: {
              Proactive: 'Y',
              Intent: 'PLAN_OR_BANTER',
              Impulse: 'BOND',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {},
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /include this NPC initiative/i);
      assert.match(text, /brief unexpected scene beat/i);
      assert.match(text, /creates a useful opening, information, or advantage/i);
    },
  },
  {
    name: '40a narrator default branch includes no-permission intimacy guard',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'talk with Naomi',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '',
          resolutionPacket: {
            GOAL: 'Normal_Interaction',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            RollNeeded: 'N',
            LandedActions: '(none)',
            OutcomeTier: 'No_Roll',
            Outcome: 'no_roll',
            CounterPotential: 'none',
            activeHostileThreat: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: [] },
            ActionTargets: ['Naomi'],
            OppTargets: { NPC: [], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Naomi'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Naomi',
            FinalState: 'B3/F1/H1',
            Behavior: 'FRIENDLY',
            Target: 'No Change',
            NPC_STAKES: 'N',
            Landed: 'N',
            IntimacyBoundary: 'SKIP',
            IntimacyBoundarySource: 'NONE',
            IntimacyRefusalStyle: 'NONE',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {},
          aggressionResults: {},
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      assert.match(prompt(report), /Naomi: Intimacy: NOT ALLOWED/);
      assert.match(prompt(report), /Conversation alone is NOT permission for intimate escalation/);
    },
  },
  {
    name: '40b narrator handoff treats current scene cast as closed-world',
    run() {
      const report = runCase({
        userText: 'I address the room and ask who wants to join me.',
        tracker: {
          Chandra: trackerEntry(),
          "T'Sha": trackerEntry(),
          Medli: trackerEntry(),
          Marianne: trackerEntry(),
          Kefka: trackerEntry(),
          Rem: trackerEntry(),
          Harmony: trackerEntry(),
          Jessie: trackerEntry(),
          'Lady Void': trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AddressRoom',
            identifyChallenge: 'address the present room',
            explicitMeans: 'ask the room who wants to join me',
            identifyTargets: {
              ActionTargets: ['Chandra', "T'Sha", 'Medli', 'Marianne', 'Kefka'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            rollNeeded: false,
          },
          relationshipEngine: [
            relationship('Chandra'),
            relationship("T'Sha"),
            relationship('Medli'),
            relationship('Marianne'),
            relationship('Kefka'),
          ],
        }),
      });
      const text = prompt(report);
      const castLine = text.split('\n').find(line => line.includes('Current scene cast:')) || '';
      assert.match(castLine, /Current scene cast: Chandra,T'Sha,Medli,Marianne,Kefka/);
      assert.doesNotMatch(castLine, /Rem|Harmony|Jessie|Lady Void/);
      assert.match(text, /Only these listed NPCs may speak, react, gesture, move, or be treated as physically present this turn/);
      assert.match(text, /Only these listed NPCs may speak, react, gesture, move, or be treated as physically present this turn/);
      assert.match(text, /Known\/lore\/example\/tracker\/card characters not listed are offscreen and must not participate/);
    },
  },
  {
    name: '41 narrator keeps chaos guidance when aggression also fires',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'duck behind the broken pillar',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '1d20(4) + PHY(6) = 10 vs 1d20(16) + PHY(5) = 21 (-11 - Critical_Failure)',
          resolutionPacket: {
            GOAL: 'TakeCover',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            RollNeeded: 'Y',
            LandedActions: 0,
            OutcomeTier: 'Critical_Failure',
            Outcome: 'avoided',
            CounterPotential: 'severe',
            activeHostileThreat: 'Y',
            CompanionCommand: null,
            hostilesInScene: { NPC: ['Ogre'] },
            ActionTargets: [],
            OppTargets: { NPC: ['Ogre'], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Ogre'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Ogre',
            FinalState: 'B1/F2/H4',
            Behavior: 'HATRED',
            Target: 'Hostility',
            NPC_STAKES: 'N',
            Landed: 'N',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: {
            CHAOS: {
              triggered: true,
              band: 'HOSTILE',
              magnitude: 'MAJOR',
              anchor: 'KNOWN_NPC',
              vector: 'NPC',
            },
          },
          proactivityResults: {
            Ogre: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'ANGER',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {
            Ogre: {
              AttackType: 'CounterAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: '{{user}}',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'severe',
              CounterBonus: 6,
              ReactionOutcome: 'npc_succeeds',
              Margin: 3,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: { Relevant: 'N' },
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: {
                targetType: 'user',
                condition: 'wounded',
                severity: 'moderate',
                woundsAdd: [],
                statusAdd: [],
                InjuryDetailMode: 'narrator_contextual',
                InjurySeverityLimit: 'moderate',
              },
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /Ogre: NPC ATTACKS \{\{user\}\}\. Attack: counterattack exploiting the opening against \{\{user\}\}/i);
      assert.match(text, /brief unexpected scene beat/i);
      assert.match(text, /worsens danger or opposition/i);
    },
  },
  {
    name: '42 narrator uses target-aware NPC-vs-NPC aggression stop rule',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'Seraphina moves between Darai and the ogre',
          },
        },
        finalNarrativeHandoff: {
          resultLine: 'No roll',
          resolutionPacket: {
            GOAL: 'ProtectDarai',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            RollNeeded: 'N',
            LandedActions: '(none)',
            OutcomeTier: 'NONE',
            Outcome: 'no_roll',
            CounterPotential: 'none',
            activeHostileThreat: 'Y',
            CompanionCommand: null,
            hostilesInScene: { NPC: ['Ogre'] },
            ActionTargets: ['Seraphina'],
            OppTargets: { NPC: [], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Ogre', 'Seraphina'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Ogre',
            FinalState: 'B1/F2/H4',
            Behavior: 'HATRED',
            Target: 'Hostility',
            NPC_STAKES: 'N',
            Landed: 'N',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Ogre: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'ANGER',
              ProactivityTarget: 'Seraphina',
              TargetsUser: 'N',
            },
          },
          aggressionResults: {
            Ogre: {
              AttackType: 'ProactiveAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: 'Seraphina',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'none',
              CounterBonus: 0,
              ReactionOutcome: 'npc_fails',
              Margin: -2,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: null,
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: null,
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /npcAggressionResult:/);
      assert.match(text, /Ogre: NPC ATTACKS Seraphina\. Attack: proactive attack from current hostile state against Seraphina\. Force type: .* Result: FAILURE\./i);
      assert.match(text, /This attack FAILS\. It does NOT land, does NOT connect, does NOT injure, does NOT restrain, does NOT shove, does NOT control, does NOT produce a completed spell effect, and does NOT create any completed forceful effect/i);
      assert.match(text, /Agency lock: Do NOT narrate Seraphina's counterattack, follow-up action/i);
      assert.doesNotMatch(text, /Agency lock: Do NOT narrate \{\{user\}\}'s counterattack/i);
    },
  },
  {
    name: '43 narrator describes non-physical user effects as landed action or effect',
    run() {
      const report = runCase({
        userText: 'I channel a binding spell at the duelist to lock his limbs in place.',
        dice: [18, 8, 1, 1, 1, 1],
        tracker: {
          Duelist: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BindDuelist',
            identifyChallenge: 'bind the duelist with magic',
            explicitMeans: 'binding spell locks the duelist limbs',
            identifyTargets: { ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            rollNeeded: true,
            challengeType: 'supernatural_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            actionCount: ['binding spell'],
          },
          relationshipEngine: [relationship('Duelist')],
          injuryEffectEngine: {
            effects: [{
              target: 'Duelist',
              targetRole: 'OppTarget',
              effectType: 'restraint',
              bodyPart: 'body',
              description: 'magical limb binding',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const text = prompt(report);
      assert.match(text, /Duelist receives .* condition/i);
      assert.match(text, /restrained/i);
      assert.doesNotMatch(text, /landed user attack/i);
    },
  },
  {
    name: '43a aggression roll margin zero stalemates and negative fails for NPCs',
    run() {
      assert.equal(aggressionReactionOutcome(0), 'stalemate');
      assert.equal(aggressionReactionOutcome(-3), 'npc_fails');
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'Valerie tries to headbutt and shove the user away',
          },
        },
        finalNarrativeHandoff: {
          resultLine: 'No roll',
          resolutionPacket: {
            GOAL: 'ResistValerie',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            RollNeeded: 'Y',
            LandedActions: 0,
            OutcomeTier: 'Failure',
            Outcome: 'failure',
            CounterPotential: 'none',
            activeHostileThreat: 'Y',
            CompanionCommand: null,
            hostilesInScene: { NPC: ['Valerie'] },
            ActionTargets: [],
            OppTargets: { NPC: ['Valerie'], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Valerie'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Valerie',
            FinalState: 'B1/F2/H4',
            Behavior: 'HATRED',
            Target: 'Hostility',
            NPC_STAKES: 'Y',
            Landed: 'N',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Valerie: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'ANGER',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {
            Valerie: {
              AttackType: 'ProactiveAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: '{{user}}',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'none',
              CounterBonus: 0,
              ReactionOutcome: 'npc_fails',
              Margin: -3,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: { Relevant: 'N' },
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: null,
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /npcAggressionResult:/);
      assert.match(text, /Valerie: NPC ATTACKS \{\{user\}\}\. Attack: proactive attack from current hostile state against \{\{user\}\}\. Force type: .* Result: FAILURE\./i);
      assert.match(text, /This attack FAILS\. It does NOT land, does NOT connect, does NOT injure, does NOT restrain, does NOT shove, does NOT control, does NOT produce a completed spell effect, and does NOT create any completed forceful effect/i);
    },
  },
  {
    name: '43b aggression roll margin zero gives narrator stalemate handoff',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'Valerie tries to shove the user back',
          },
        },
        finalNarrativeHandoff: {
          resultLine: 'No roll',
          resolutionPacket: {
            GOAL: 'ResistValerie',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            RollNeeded: 'Y',
            LandedActions: 0,
            OutcomeTier: 'Stalemate',
            Outcome: 'struggle',
            CounterPotential: 'none',
            activeHostileThreat: 'Y',
            CompanionCommand: null,
            hostilesInScene: { NPC: ['Valerie'] },
            ActionTargets: [],
            OppTargets: { NPC: ['Valerie'], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Valerie'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Valerie',
            FinalState: 'B1/F2/H4',
            Behavior: 'HATRED',
            Target: 'Hostility',
            NPC_STAKES: 'Y',
            Landed: 'N',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Valerie: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'ANGER',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {
            Valerie: {
              AttackType: 'ProactiveAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: '{{user}}',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'none',
              CounterBonus: 0,
              ReactionOutcome: 'stalemate',
              Margin: 0,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: { Relevant: 'N' },
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: null,
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /npcAggressionResult:/);
      assert.match(text, /Valerie: NPC ATTACKS \{\{user\}\}\. Attack: proactive attack from current hostile state against \{\{user\}\}\. Force type: .* Result: STALEMATE\./i);
      assert.match(text, /This attack remains unresolved\. It does NOT land, does NOT take hold, and does NOT produce a completed hit, injury, restraint, shove, control, spell effect, or forceful effect/i);
    },
  },
  {
    name: '44 narrator keeps boundary violation guidance when aggression also fires',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'push past Mira after she refuses',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '1d20(6) + PHY(6) = 12 vs 1d20(16) + PHY(5) = 21 (-9 - Critical_Failure)',
          resolutionPacket: {
            GOAL: 'ForcePastRefusal',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            restraintControl: { Present: 'N', TargetNPC: '(none)', Evidence: '(none)' },
            boundaryPressure: { Present: 'N', Type: 'none', TargetNPC: '(none)', ObjectOrAccess: '(none)', Evidence: '(none)' },
            boundaryBreak: {
              Present: 'Y',
              TargetNPC: 'Mira',
              Type: 'space_access',
              Response: 'continued',
              Evidence: 'push past Mira after she refuses',
            },
            BoundaryGate: { action: 'force_roll', boundaryBreak: 'Y', pendingBoundary: 'Y' },
            RollNeeded: 'Y',
            LandedActions: 0,
            OutcomeTier: 'Critical_Failure',
            Outcome: 'avoided',
            CounterPotential: 'severe',
            activeHostileThreat: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: [] },
            ActionTargets: ['Mira'],
            OppTargets: { NPC: ['Mira'], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Mira'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Mira',
            FinalState: 'B1/F3/H4',
            Behavior: 'FEAR',
            Target: 'Fear',
            NPC_STAKES: 'Y',
            Landed: 'N',
            BoundaryPressure: 'Y',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Mira: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'FEAR',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {
            Mira: {
              AttackType: 'CounterAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: '{{user}}',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'severe',
              CounterBonus: 6,
              ReactionOutcome: 'npc_succeeds',
              Margin: 2,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: { Relevant: 'N' },
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: {
                targetType: 'user',
                condition: 'wounded',
                severity: 'moderate',
                woundsAdd: [],
                statusAdd: [],
                InjuryDetailMode: 'narrator_contextual',
                InjurySeverityLimit: 'moderate',
              },
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /stored NPC boundary is being continued or escalated/i);
      assert.match(text, /Mira: NPC ATTACKS \{\{user\}\}\. Attack: counterattack exploiting the opening against \{\{user\}\}/i);
      assert.match(text, /Active boundary pressure is present; show it through physical space, refusal, guarded movement, or physical protection/i);
    },
  },
  {
    name: '45 writing style remains narrator-only without dialogue or a handoff reminder',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const handoffSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      assert.doesNotMatch(source, /â†|Ã¢/);
      assert.match(source, /const WRITING_STYLE_PROMPT_KEY = 'structured_preflight_30_scene_style'/);
      assert.match(source, /const LEGACY_ORDERED_WRITING_STYLE_PROMPT_KEY = 'structured_preflight_10_writing_style'/);
      assert.doesNotMatch(source, /const DEFAULT_WRITING_STYLE_PROMPT/);
      assert.doesNotMatch(source, /writingStylePlacement:\s*'before_prompt'/);
      assert.doesNotMatch(source, /writingStyleDepth:\s*0/);
      assert.doesNotMatch(source, /writingStylePrompt ===/);
      assert.match(source, /writingStyleExplorationPrompt: DEFAULT_EXPLORATION_STYLE_PROMPT/);
      assert.match(source, /writingStyleActionPrompt: DEFAULT_ACTION_STYLE_PROMPT/);
      assert.match(source, /writingStyleIntimacyPrompt: DEFAULT_INTIMACY_STYLE_PROMPT/);
      assert.doesNotMatch(source, /writingStyleDialoguePrompt:\s*DEFAULT_DIALOGUE_STYLE_PROMPT/);
      assert.doesNotMatch(source, /writingStyleReminderPrompt:\s*DEFAULT_WRITING_STYLE_REMINDER_PROMPT/);
      assert.match(source, /delete extension_settings\[SETTINGS_KEY\]\.writingStylePrompt/);
      assert.match(source, /delete extension_settings\[SETTINGS_KEY\]\.writingStyleDialoguePrompt/);
      assert.match(source, /delete extension_settings\[SETTINGS_KEY\]\.writingStyleReminderPrompt/);
      assert.match(source, /Notice the details that matter/);
      const sectionDefaults = source.slice(
        source.indexOf('const DEFAULT_EXPLORATION_STYLE_PROMPT'),
        source.indexOf('const DEFAULT_PROSE_GUARD_STRICT_BEHAVIORISM_BANNED_PHRASES'),
      );
      assert.doesNotMatch(sectionDefaults, /ACTION-BEAT DIALOGUE:|FINAL WRITING STYLE REMINDER:/);
      assert.doesNotMatch(source, /const (?:PREVIOUS_)?DEFAULT_DIALOGUE_STYLE_PROMPT/);
      assert.doesNotMatch(source, /const DEFAULT_WRITING_STYLE_REMINDER_PROMPT/);
      const profileBuilder = source.slice(
        source.indexOf('function buildSceneStyleProfilePrompt'),
        source.indexOf('function injectWritingStylePrompt'),
      );
      assert.match(profileBuilder, /function sceneStyleProfile\(response, context\) \{/);
      assert.match(profileBuilder, /Shape narration by scene type while obeying every renderControlEngine rule above/);
      assert.match(profileBuilder, /explorationStyle:/);
      assert.match(profileBuilder, /actionStyle:/);
      assert.match(profileBuilder, /intimacyStyle:/);
      assert.doesNotMatch(profileBuilder, /dialogueStyle:|writingStyleDialoguePrompt|writingStyleReminderPrompt/);
      assert.match(source, /injectMovablePrompt\(\s*WRITING_STYLE_PROMPT_KEY,\s*promptText,\s*'in_prompt',\s*0,\s*EXTENSION_PROMPT_ROLES\.SYSTEM,\s*\)/);
      assert.match(source, /injectMovablePrompt\(\s*PROSE_RULES_PROMPT_KEY,\s*DEFAULT_PROSE_RULES_PROMPT,\s*'in_prompt',\s*0,\s*EXTENSION_PROMPT_ROLES\.SYSTEM,\s*\)/);
      assert.doesNotMatch(source, /injectMovablePrompt\(\s*(?:WRITING_STYLE_PROMPT_KEY|PROSE_RULES_PROMPT_KEY),[\s\S]{0,120}'before_prompt'/);
      const promptInjection = source.slice(
        source.indexOf('function injectPromptOptionPrompts'),
        source.indexOf('function clearLegacyFinalReminderPrompt'),
      );
      assert.ok(
        promptInjection.indexOf('injectProseRulesPrompt();') < promptInjection.indexOf('injectWritingStylePrompt();'),
        'Prose Rules should be injected before sceneStyleProfile.',
      );
      assert.doesNotMatch(handoffSource, /DEFAULT_FINAL_WRITING_STYLE_REMINDER|renderFinalWritingStyleReminder|writingStyleReminderPrompt|FINAL WRITING STYLE REMINDER/);
      assert.match(source, /const LEGACY_FINAL_REMINDER_PROMPT_KEY = 'structured_preflight_30_final_reminder'/);
      assert.match(source, /delete context\.extensionPrompts\[LEGACY_FINAL_REMINDER_PROMPT_KEY\]/);
      assert.doesNotMatch(source, /density and clarity of a skilled novelist/);
      assert.match(source, /context\.setExtensionPrompt\(\s*key,\s*text,\s*position,\s*normalizePromptDepth\(depth\),\s*false,\s*normalizePromptRole\(role\),\s*\)/);
    },
  },
  {
    name: '45a semantic assembled prompt strips narrator-only prompt blocks',
    run() {
      const assembledText = [
        'Main Prompt: You are an excellent Narrator.',
        'function RenderControlEngine(response, input, context) {',
        '  function strictBehaviorism(response, context): {',
        '    mandate: Render {{user}} only through observable behavior.',
        '  }',
        '}',
        'Character: Mira keeps the gate ledger.',
        'function sceneStyleProfile(response, context) {',
        '  mandate:',
        '    Decorative narrator-only style instructions.',
        '}',
        'function finalResponseElements() {',
        '  Narrate Using:',
        '  - TENSE={{getvar::tense}}',
        '}',
        'function fanService() {',
        '  narrator-only fanservice instruction.',
        '}',
        'function adultContent() {',
        '  narrator-only adult content instruction.',
        '}',
        'Chat History: USER opens the gate.',
      ].join('\n');

      const cleaned = sanitizeSemanticAssembledText(assembledText);

      assert.match(cleaned, /Main Prompt: You are an excellent Narrator\./);
      assert.match(cleaned, /Character: Mira keeps the gate ledger\./);
      assert.match(cleaned, /Chat History: USER opens the gate\./);
      assert.doesNotMatch(cleaned, /function RenderControlEngine/);
      assert.doesNotMatch(cleaned, /function sceneStyleProfile/);
      assert.doesNotMatch(cleaned, /function finalResponseElements/);
      assert.doesNotMatch(cleaned, /function fanService/);
      assert.doesNotMatch(cleaned, /function adultContent/);
      assert.doesNotMatch(cleaned, /Decorative narrator-only style instructions/);
      assert.doesNotMatch(cleaned, /Narrate Using:/);

      const unclear = sanitizeSemanticAssembledText([
        'World Info: the gate is locked.',
        'function sceneStyleProfile(response, context) {',
        '  missing closing brace.',
        'Character: Mira remains present.',
      ].join('\n'));

      assert.match(unclear, /function sceneStyleProfile\(response, context\) \{/);
      assert.match(unclear, /Character: Mira remains present\./);
    },
  },
  {
    name: '46 prose rules enforce the revised render-control boundaries',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const mainRulesSource = indexSource.slice(
        indexSource.indexOf('const DEFAULT_PROSE_RULES_PROMPT'),
        indexSource.indexOf('const DEFAULT_SETTINGS'),
      );

      assert.match(mainRulesSource, /Your final response MUST STRICTLY follow the constraints below/);
      assert.match(mainRulesSource, /function activeHandoff\(response, context\):/);
      assert.match(mainRulesSource, /When a character\/NPC actively participates in the current exchange, you MUST end your response on ONE of the following/);
      assert.match(mainRulesSource, /ENVIRONMENTAL:[\s\S]*A visible environmental or scene change that requires \{\{user\}\}'s input/);
      assert.match(mainRulesSource, /CONVERSATIONAL:[\s\S]*A statement or question to which \{\{user\}\} can naturally respond/);
      assert.match(mainRulesSource, /It does not need to be phrased as a question/);
      assert.match(mainRulesSource, /ACTION\/GESTURE:[\s\S]*A concrete action or gesture directed at \{\{user\}\} or materially affecting the immediate exchange/);
      assert.match(mainRulesSource, /These are alternative ending types, not a checklist/);
      assert.match(mainRulesSource, /DO NOT ask \{\{user\}\} meta questions/);
      assert.match(mainRulesSource, /DO NOT describe a character waiting for or expecting \{\{user\}\}'s response/);
      assert.match(mainRulesSource, /DO NOT manufacture a question, statement, gesture, interruption, or scene change solely to create a handoff/);
      assert.match(mainRulesSource, /DO NOT apply these rules when \{\{user\}\} is alone/);
      assert.doesNotMatch(mainRulesSource, /You MUST end every response on ONE of the following|Dialogue directed at \{\{user\}\}/);

      assert.match(mainRulesSource, /function dialogueTurn\(response, context\):/);
      assert.match(mainRulesSource, /Dialogue MUST follow a natural back-and-forth exchange/);
      assert.match(mainRulesSource, /Each character\/NPC may make only ONE conversational contribution per response/);
      assert.match(mainRulesSource, /That contribution MUST account for the FULL input directed at them, NOT merely the final sentence or question/);
      assert.match(mainRulesSource, /Related points may be addressed together in one natural response/);
      assert.match(mainRulesSource, /Intentional refusal, deflection, avoidance, or withholding is allowed/);
      assert.match(mainRulesSource, /Once that single contribution is complete, their turn ENDS/);
      assert.match(mainRulesSource, /DO NOT ignore earlier parts of the input merely to answer its final sentence or question/);
      assert.match(mainRulesSource, /DO NOT disguise a monologue as one turn/);
      assert.doesNotMatch(mainRulesSource, /The contribution MUST leave the current exchange active|ONE brief continuation tied to the SAME exchange|response-seeking continuation/);
      assert.doesNotMatch(mainRulesSource, /A dialogue turn MAY contain AT MOST ONE of each component|Reaction Beat:|Action Beat:|These components are LIMITS, not a checklist/);

      assert.match(mainRulesSource, /function inputChronology\(response, input, context\):/);
      assert.match(mainRulesSource, /\{\{user\}\}'s input is IN THE PAST/);
      assert.match(mainRulesSource, /Previously narrated actions and dialogue have already occurred\. Continue from the scene state they established/);
      assert.match(mainRulesSource, /DO NOT repeat, paraphrase, echo, summarize, re-stage, or narrate ANY part of \{\{user\}\}'s input/);
      assert.match(mainRulesSource, /DO NOT repeat, paraphrase, or re-stage previously narrated actions or dialogue/);

      assert.match(mainRulesSource, /function agencySeparation\(response, input, context\):/);
      assert.match(mainRulesSource, /The human player EXCLUSIVELY controls \{\{user\}\}/);
      assert.match(mainRulesSource, /You MAY narrate ONLY immediate involuntary or reflexive physical reactions directly caused by external stimuli or scene effects/);
      assert.match(mainRulesSource, /Any action that can be voluntarily chosen is EXCLUSIVELY controlled by \{\{user\}\}/);
      assert.match(mainRulesSource, /DO NOT narrate \{\{user\}\}'s thoughts, feelings, choices, decisions, voluntary actions, or dialogue/);

      assert.match(mainRulesSource, /function strictBehaviorism\(response, context\):/);
      assert.match(mainRulesSource, /When character\/NPC state or emotion is conveyed, you MUST convey it ONLY through directly observable behavior, action, or dialogue/);
      assert.match(mainRulesSource, /Dialogue does NOT require an accompanying gesture, action, or physical cue/);
      assert.match(mainRulesSource, /DO NOT add behavior, actions, or gestures merely to signal emotion/);
      assert.match(mainRulesSource, /ABSOLUTELY NO flushing, reddening/);
      assert.match(mainRulesSource, /ABSOLUTELY NO breath or voice hitching\/catching/);
      assert.match(mainRulesSource, /ABSOLUTELY NO interpretive, figurative, or invisible eye-language/);

      assert.match(mainRulesSource, /function strictEpistemology\(response, context\):/);
      assert.match(mainRulesSource, /You MUST reveal information ONLY through DIRECT sensory evidence available in the scene/);
      assert.match(mainRulesSource, /DO NOT reveal unknown names, identities, roles, hidden causes, private thoughts, unseen actions, background lore/);

      assert.match(mainRulesSource, /function diegeticPhysicality\(response, context\):/);
      assert.match(mainRulesSource, /narrate ONLY its OBSERVABLE effects and consequences/);
      assert.match(mainRulesSource, /A name may appear ONLY when explicitly spoken in dialogue/);

      assert.match(mainRulesSource, /function embodiedPerception\(response, context\):/);
      assert.match(mainRulesSource, /PRIORITIZE sight, hearing, and touch/);
      assert.match(mainRulesSource, /A CLOSE-RANGE physical source is overpowering and unavoidable/);
      assert.doesNotMatch(mainRulesSource, /SPATIAL CONTINUITY|relative positions|perceive, reach, or interact through/);

      assert.match(mainRulesSource, /function denotativePhysicality\(response, context\):/);
      assert.match(mainRulesSource, /You MUST use LITERAL, PHYSICALLY CLEAR prose grounded ONLY in what can be DIRECTLY perceived in the scene/);
      assert.match(mainRulesSource, /Objects, weather, architecture, atmosphere, and abstract concepts may ONLY be described through their physical state, movement, or concrete effects/);
      assert.match(mainRulesSource, /NEVER attribute agency, intention, awareness, memory, or emotion to inanimate things or abstract concepts/);
      assert.match(mainRulesSource, /Rooms DO NOT breathe/);
      assert.match(mainRulesSource, /Words DO NOT hang/);
      assert.match(mainRulesSource, /Silence DOES NOT stretch/);

      assert.match(mainRulesSource, /function cohesiveSceneBeats\(response, context\):/);
      assert.match(mainRulesSource, /When the scene already contains closely related physical events, narrate them as one clear, connected sequence/);
      assert.match(mainRulesSource, /DO NOT invent movement, gestures, object handling, or reactions merely to make prose feel active/);
      assert.match(mainRulesSource, /DO NOT split one physical event into staccato sentences, micro-reaction loops, or body-cue pileups/);

      assert.doesNotMatch(mainRulesSource, /function linearChronology\(/);
      assert.doesNotMatch(mainRulesSource, /function inanimateObjectivity\(/);
      assert.doesNotMatch(mainRulesSource, /function realisticConversation|function npcRambleGuard|dialoguePacing|characterTurnPacing|DIALOGUE-TURN-LIMITS/);
      assert.doesNotMatch(mainRulesSource, /hypotacticSceneBeats|COHESIVE-ACTION-RESULT|PARATACTIC NARRATION/);
      assert.match(indexSource, /barely above a whisper/);
      assert.match(indexSource, /barely above a breath/);
      assert.match(indexSource, /knuckle whitening/);
    },
  },
  {
    name: '46a narrator reminder mirrors mandates in reverse execution order',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const handoffSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      const mainRulesSource = indexSource.slice(
        indexSource.indexOf('const DEFAULT_PROSE_RULES_PROMPT'),
        indexSource.indexOf('const DEFAULT_SETTINGS'),
      );
      const handoffRulesSource = handoffSource.slice(
        handoffSource.indexOf('function renderControlEngineNarrativeContract()'),
        handoffSource.indexOf('function formatNarrativeFacts'),
      );
      const mainRuleOrder = [
        'activeHandoff',
        'dialogueTurn',
        'inputChronology',
        'agencySeparation',
        'strictBehaviorism',
        'strictEpistemology',
        'diegeticPhysicality',
        'embodiedPerception',
        'denotativePhysicality',
        'cohesiveSceneBeats',
      ];
      const handoffRuleOrder = [...mainRuleOrder].reverse();
      const assertRuleOrder = (source, order, label) => {
        for (let i = 1; i < order.length; i++) {
          const previous = 'function ' + order[i - 1] + '(';
          const current = 'function ' + order[i] + '(';
          assert.ok(
            source.indexOf(previous) < source.indexOf(current),
            previous + ' should appear before ' + current + ' in ' + label + '.',
          );
        }
      };
      const extractRuleBlock = (source, name) => {
        const start = source.indexOf('function ' + name + '(');
        assert.ok(start >= 0, name + ' should exist.');
        const end = source.indexOf('\n  }', start);
        assert.ok(end > start, name + ' should have a closing block.');
        return source.slice(start, end + 4);
      };
      const extractMandate = (source, name) => {
        const block = extractRuleBlock(source, name);
        const start = block.indexOf('MANDATE:');
        const end = block.indexOf('FORBIDDEN:', start);
        assert.ok(start >= 0 && end > start, name + ' should contain MANDATE before FORBIDDEN.');
        return block
          .slice(start + 'MANDATE:'.length, end)
          .replace(/\r/g, '')
          .split('\n')
          .map(line => line.trim())
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      };

      assertRuleOrder(mainRulesSource, mainRuleOrder, 'the full prose rules');
      assertRuleOrder(handoffRulesSource, handoffRuleOrder, 'the narrator reminder');

      for (const name of mainRuleOrder) {
        assert.equal(
          (mainRulesSource.match(new RegExp('function ' + name + '\\(', 'g')) || []).length,
          1,
          name + ' should appear exactly once in the full prose rules.',
        );
        assert.equal(
          (handoffRulesSource.match(new RegExp('function ' + name + '\\(', 'g')) || []).length,
          1,
          name + ' should appear exactly once in the narrator reminder.',
        );
        assert.equal(
          extractMandate(handoffRulesSource, name),
          extractMandate(mainRulesSource, name),
          name + ' MANDATE must mirror the full rule exactly.',
        );
      }

      assert.match(handoffRulesSource, /EXECUTE RenderControlEngine\(response, input, context\) PRIVATELY BEFORE PRODUCING THE FINAL RESPONSE/);
      assert.match(handoffRulesSource, /DO NOT output function names, validation notes, rule summaries, analysis, or intermediate drafts/);
      assert.doesNotMatch(handoffRulesSource, /function linearChronology\(/);
      assert.doesNotMatch(handoffRulesSource, /function inanimateObjectivity\(/);
      assert.doesNotMatch(handoffRulesSource, /function realisticConversation|function npcRambleGuard|characterTurnPacing|DIALOGUE-TURN-LIMITS/);
      assert.doesNotMatch(handoffRulesSource, /itemAvailability:|applicationContract:/);

      assert.match(handoffSource, /narrativeContract\(input\): \{/);
      assert.match(handoffSource, /MANDATE: The following instructions are BINDING and NON-NEGOTIABLE/);
      assert.match(handoffSource, /#1 - PROSE RULES/);
      assert.match(handoffSource, /Execute renderControlEngine\(input\) as a hard constraint on the response/);
      assert.match(handoffSource, /#2 - RESOLVED FACTS/);
      assert.match(handoffSource, /narrativeFacts\(input\) below is the AUTHORITATIVE SCENE RESOLUTION FOR THIS RESPONSE/);
      assert.match(handoffSource, /#3 - OUTPUT/);
      assert.match(handoffSource, /Your response MUST begin with BEGIN_FINAL_NARRATION and end with END_FINAL_NARRATION/);
      assert.match(handoffSource, /Output only final in-character narration between those tags/);

      const narrativeContractSource = handoffSource.slice(
        handoffSource.indexOf('function formatNarrativeContract'),
        handoffSource.indexOf('function renderGenreLensSection'),
      );
      assert.ok(
        narrativeContractSource.indexOf('renderControlEngineNarrativeContract()') < narrativeContractSource.indexOf('renderGenreLensSection(options)'),
        'RenderControlEngine reminder should appear before the genre lens.',
      );
      assert.ok(
        narrativeContractSource.indexOf('renderGenreLensSection(options)') < narrativeContractSource.indexOf('renderEconomyLensSection(options)'),
        'Genre lens should appear before the economy lens.',
      );
      assert.ok(
        narrativeContractSource.indexOf('renderEconomyLensSection(options)') < narrativeContractSource.indexOf('formatNarrativeFacts({ summary, handoff, resolution, ledger, options })'),
        'Economy lens should appear immediately before narrativeFacts.',
      );
      assert.ok(
        narrativeContractSource.indexOf('formatNarrativeFacts({ summary, handoff, resolution, ledger, options })') < narrativeContractSource.indexOf("'#3 - OUTPUT'"),
        'narrativeFacts should appear directly before the output contract.',
      );
      assert.doesNotMatch(handoffSource, /DEFAULT_FINAL_WRITING_STYLE_REMINDER|renderFinalWritingStyleReminder|FINAL WRITING STYLE REMINDER/);
      assert.doesNotMatch(handoffSource, /==NARRATOR_AUTHORITY==|==RENDER_CONTRACT==|==NARRATION_CRAFT_DIRECTIVE==|==RESOLVED_SCENE_FACTS==|==NARRATOR_HANDOFF==|==MODEL_INSTRUCTION==/);
    },
  },
  {
    name: '46b isekai genre lens is conditional and ordered before facts',
    run() {
      const handoffSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      assert.match(handoffSource, /function renderGenreLensSection\(options = \{\}\)/);
      assert.match(handoffSource, /function renderEconomyLensSection\(options = \{\}\)/);
      assert.match(handoffSource, /#1\.5 - GENRE LENS/);
      assert.match(handoffSource, /#1\.6 - ECONOMY AND VALUE/);
      assert.match(handoffSource, /This campaign remains anime isekai, not generic fantasy/);
      assert.match(handoffSource, /ONE-TIME AESTHETIC RULE:/);
      assert.match(handoffSource, /This genre lens never overrides narrativeFacts\(input\), \{\{user\}\} agency, relationship state, consent, mechanics, or prose rules/);

      const genreLensSource = handoffSource.slice(
        handoffSource.indexOf('function renderGenreLens'),
        handoffSource.indexOf('function isIsekaiGenre'),
      );
      assert.doesNotMatch(genreLensSource, /One-Time Aesthetic Rule:/);
      assert.doesNotMatch(genreLensSource, /anime aesthetic may be described directly only once/i);

      const report = runCase({
        userText: 'I look around.',
        ledger: baseLedger(),
      });
      const isekaiPrompt = formatNarratorModelPromptContext(report, { adventureGenre: 'Isekai' });
      const fantasyPrompt = formatNarratorModelPromptContext(report, { adventureGenre: 'Fantasy' });
      const cyberpunkPrompt = formatNarratorModelPromptContext(report, { adventureGenre: 'Cyberpunk' });
      assert.match(isekaiPrompt, /#1\.5 - GENRE LENS/);
      assert.match(isekaiPrompt, /ISEKAI GENRE LENS:/);
      assert.match(isekaiPrompt, /ECONOMY AND VALUE:/);
      assert.match(isekaiPrompt, /Default genre currency: silver \(sv\)/);
      assert.match(isekaiPrompt, /This campaign remains anime isekai, not generic fantasy/);
      assert.match(isekaiPrompt, /Do not force tropes, instant devotion, harem dynamics/);
      assert.doesNotMatch(isekaiPrompt, /One-Time Aesthetic Rule:/);
      assert.doesNotMatch(isekaiPrompt, /anime aesthetic may be described directly only once/i);
      assert.doesNotMatch(fantasyPrompt, /ISEKAI GENRE LENS/);
      assert.match(fantasyPrompt, /ECONOMY AND VALUE:/);
      assert.match(fantasyPrompt, /Default genre currency: silver \(sv\)/);
      assert.match(cyberpunkPrompt, /Default genre currency: credits \(cr\)/);
      assert.ok(
        isekaiPrompt.indexOf('#1 - PROSE RULES') < isekaiPrompt.indexOf('#1.5 - GENRE LENS'),
        'Isekai lens should appear after Prose Rules.',
      );
      assert.ok(
        isekaiPrompt.indexOf('#1.5 - GENRE LENS') < isekaiPrompt.indexOf('#1.6 - ECONOMY AND VALUE'),
        'Isekai lens should appear before the economy lens.',
      );
      assert.ok(
        isekaiPrompt.indexOf('#1.6 - ECONOMY AND VALUE') < isekaiPrompt.indexOf('#2 - RESOLVED FACTS'),
        'Economy lens should appear before narrativeFacts.',
      );
      assert.doesNotMatch(isekaiPrompt, /FINAL WRITING STYLE REMINDER/);

      const openingSeedRolls = [0, 0.53];
      const openingSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterAge: 19,
        rng: () => openingSeedRolls.shift() ?? 0,
      });
      assert.equal(openingSeed.earthTransition.label, 'Traffic Fatality / Rescue Accident');
      assert.equal(openingSeed.newWorldOpening.label, 'Liminal Deity Audience');
      assert.equal(openingSeed.earthTransition.label.includes('Divine Selection'), false);
      assert.equal(buildIsekaiOpeningSeed({ adventureGenre: 'Fantasy', rng: () => 0 }), null);

      const gameSeedRolls = [0.36, 0];
      const gameOpeningSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterAge: 19,
        rng: () => gameSeedRolls.shift() ?? 0,
      });
      assert.equal(gameOpeningSeed.earthTransition.label, 'Gaming / VR Entrapment');
      assert.equal(gameOpeningSeed.newWorldOpening.label, 'Game-Trapped Avatar Body');

      const digitalSeedRolls = [0.4, 0.99];
      const digitalOpeningSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterAge: 19,
        rng: () => digitalSeedRolls.shift() ?? 0,
      });
      assert.equal(digitalOpeningSeed.earthTransition.label, 'Digital / System Glitch');
      assert.equal(digitalOpeningSeed.newWorldOpening.label, 'Administrator or Cosmic Clerk Chamber');

      const normalDeathSeedRolls = [0, 0.99];
      const normalDeathOpeningSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterAge: 19,
        rng: () => normalDeathSeedRolls.shift() ?? 0,
      });
      assert.equal(normalDeathOpeningSeed.earthTransition.label, 'Traffic Fatality / Rescue Accident');
      assert.doesNotMatch(normalDeathOpeningSeed.newWorldOpening.label, /^Game-/);

      const schoolExhaustionRolls = [0.27, 0];
      const schoolExhaustionSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterText: '# BASIC INFO\n**Age:** 18',
        rng: () => schoolExhaustionRolls.shift() ?? 0,
      });
      assert.equal(schoolExhaustionSeed.characterAge, 18);
      assert.equal(schoolExhaustionSeed.ageGroup, 'school_age');
      assert.equal(schoolExhaustionSeed.earthTransition.label, 'Study / Exhaustion Collapse');
      assert.match(schoolExhaustionSeed.earthTransition.guidance, /schoolwork, exam pressure, late-night studying/);
      assert.match(schoolExhaustionSeed.earthTransition.guidance, /Keep \{\{user\}\} out of workplaces and adult professional roles/);

      const tableAgeSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterText: '# BASIC INFO\n| Age | 18 |',
        rng: () => 0,
      });
      assert.equal(tableAgeSeed.characterAge, 18);
      assert.equal(tableAgeSeed.ageGroup, 'school_age');

      const adultExhaustionRolls = [0.26, 0];
      const adultExhaustionSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterText: '# BASIC INFO\n**Age:** 19',
        rng: () => adultExhaustionRolls.shift() ?? 0,
      });
      assert.equal(adultExhaustionSeed.characterAge, 19);
      assert.equal(adultExhaustionSeed.ageGroup, 'adult_context');
      assert.equal(adultExhaustionSeed.earthTransition.label, 'Work / Exhaustion Collapse');
      assert.match(adultExhaustionSeed.earthTransition.guidance, /workplace exhaustion, an office collapse, a punishing shift/);
      assert.match(adultExhaustionSeed.earthTransition.guidance, /Do not place \{\{user\}\} in a high-school classroom or high-school student role/);

      const schoolGroupRolls = [0.75, 0];
      const schoolGroupSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterAge: 18,
        rng: () => schoolGroupRolls.shift() ?? 0,
      });
      assert.equal(schoolGroupSeed.earthTransition.label, 'Class / School Group Transfer');
      assert.equal(schoolGroupSeed.newWorldOpening.label, 'Pulled With Classmates');

      const adultGroupRolls = [0.71, 0];
      const adultGroupSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterAge: 19,
        rng: () => adultGroupRolls.shift() ?? 0,
      });
      assert.equal(adultGroupSeed.earthTransition.label, 'Adult Group Transfer');
      assert.equal(adultGroupSeed.newWorldOpening.label, 'Pulled With Coworkers or Strangers');

      for (const characterAge of [18, null]) {
        for (let index = 0; index < 19; index += 1) {
          const seed = buildIsekaiOpeningSeed({
            adventureGenre: 'Isekai',
            ...(characterAge === null ? { characterText: '**Age:** Not specified' } : { characterAge }),
            rng: (() => {
              const rolls = [(index + 0.1) / 19, 0];
              return () => rolls.shift() ?? 0;
            })(),
          });
          assert.notEqual(seed.earthTransition.key, 'scientific_experiment');
        }
      }

      const scientificRolls = [0.86, 0];
      const adultScientificSeed = buildIsekaiOpeningSeed({
        adventureGenre: 'Isekai',
        characterAge: 19,
        rng: () => scientificRolls.shift() ?? 0,
      });
      assert.equal(adultScientificSeed.earthTransition.key, 'scientific_experiment');

      const introPrompt = formatAdventureIntroNarratorModelPromptContext(
        [
          'START ADVENTURE REMINDER:',
          'Begin the Earth last moment, then continue directly into the Isekai opening.',
          'Do NOT skip the required isekai beats. Do NOT choose a different Earth last moment or Isekai opening.',
        ].join('\n'),
        {
          adventureGenre: 'Isekai',
          worldState: {
            position: 'outdoors',
            day: 1,
            timeOfDay: 'afternoon',
            weather: 'clear',
          },
          nameGeneration: {
            namePool: {
              female: ['Ariana', 'Mira'],
              male: ['Darin', 'Kell'],
              location: ['Veyra', 'Orinth Gate'],
            },
          },
          isekaiOpeningSeed: openingSeed,
        },
      );
      assert.match(introPrompt, /START_ADVENTURE_PROMPT: ISEKAI/);
      assert.match(introPrompt, /This is the opening turn of a new isekai adventure\./);
      assert.doesNotMatch(introPrompt, /Narrate the opening immediately\./);
      assert.doesNotMatch(introPrompt, /Use the established character\/context and the required seeds below\./);
      assert.doesNotMatch(introPrompt, /Current broad scene state:/);
      assert.doesNotMatch(introPrompt, /ISEKAI GENRE LENS:/);
      assert.doesNotMatch(introPrompt, /ISEKAI TRANSITION AND OPENING SEED:/);
      assert.doesNotMatch(introPrompt, /ISEKAI OPENING SEED:/);
      assert.match(introPrompt, /You MUST narrate BOTH required beats below, in order\./);
      assert.match(introPrompt, /Do NOT skip either beat\. Do NOT choose a different Earth last moment or Isekai opening\./);
      assert.match(introPrompt, /AGE COMPATIBILITY:/);
      assert.match(introPrompt, /\{\{user\}\} is 19 or older/);
      assert.match(introPrompt, /NEVER place \{\{user\}\} in a high-school classroom or high-school student role/);
      assert.match(introPrompt, /BEAT #1: EARTH LAST MOMENTS/);
      assert.match(introPrompt, /BEAT #2: ISEKAI OPENING/);
      assert.match(introPrompt, /ONE-TIME AESTHETIC RULE:/);
      assert.match(introPrompt, /first visible glimpse of the new world, or the first clearly seen person from it/);
      assert.match(introPrompt, /After that, keep the aesthetic implicit/);
      assert.match(introPrompt, /Selected Earth Last Moment: Traffic Fatality \/ Rescue Accident\./);
      assert.match(introPrompt, /Selected Isekai Opening: Liminal Deity Audience\./);
      assert.match(introPrompt, /PRESERVE \{\{user\}\}'s existing race, body, abilities, gear, identity, backstory/);
      assert.match(introPrompt, /must not rebuild, reroll, overwrite, infantize, or replace them/);
      assert.doesNotMatch(introPrompt, /ECONOMY AND VALUE:/);
      assert.match(introPrompt, /NAME REVEAL:/);
      assert.match(introPrompt, /Reveal a NEW person, entity, or location name ONLY when it is revealed in the current scene/);
      assert.match(introPrompt, /IF you are about to introduce a NEW name, you MUST use EXACTLY ONE UNUSED name from the appropriate pool below:/);
      assert.match(introPrompt, /FEMALE: Ariana, Mira\./);
      assert.match(introPrompt, /MALE: Darin, Kell\./);
      assert.match(introPrompt, /LOCATION: Veyra, Orinth Gate\./);
      assert.match(introPrompt, /Using the provided names for EVERY NEW name is MANDATORY and NON-NEGOTIABLE\./);
      assert.match(introPrompt, /DO NOT invent, modify, combine, translate, or derive names\./);
      assert.ok(
        introPrompt.indexOf('START_ADVENTURE_PROMPT: ISEKAI') < introPrompt.indexOf('BEAT #1: EARTH LAST MOMENTS'),
        'Isekai transition/opening seed should appear after the Start Adventure mandate.',
      );
      assert.ok(
        introPrompt.indexOf('BEAT #2: ISEKAI OPENING') < introPrompt.indexOf('NAME REVEAL:'),
        'Isekai transition/opening seed should appear before name reveal.',
      );
      assert.ok(
        introPrompt.indexOf('NAME REVEAL:') < introPrompt.indexOf('START ADVENTURE REMINDER:'),
        'Intro name pool should appear before the adventure prompt body.',
      );
      assert.doesNotMatch(
        formatAdventureIntroNarratorModelPromptContext('Begin the adventure for this character in the selected genre: Fantasy.', {
          adventureGenre: 'Fantasy',
          worldState: {
            position: 'outdoors',
            day: 1,
            timeOfDay: 'afternoon',
            weather: 'clear',
          },
        }),
        /ISEKAI GENRE LENS|ISEKAI TRANSITION AND OPENING SEED|ISEKAI OPENING SEED|ECONOMY AND VALUE|Current broad scene state/,
      );
      const extensionSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      assert.match(extensionSource, /characterText: getPersonaText\(context\) \|\| getPlayerRoot\(context\)\?\.sheet\?\.text/);
      const fantasyIntroPrompt = formatAdventureIntroNarratorModelPromptContext(
        [
          'GENRE OPENING:',
          'You MUST begin in the selected genre: Fantasy.',
          'Use the genre guidance below as the concrete Start Adventure structure. Do NOT choose a different genre, premise, or opening setup for convenience.',
          '',
          'Guidance:',
          'Genre flavor: show fantasy through magic, myth, wilderness, old ruins, factions, faith, monsters, danger, opportunity, or social context when scene-valid.',
          '',
          'PREMADE CHARACTER RULE:',
          'PRESERVE {{user}}\'s existing race, body, abilities, gear, identity, backstory, and character-card/lorebook facts.',
          '',
          'START ADVENTURE REMINDER:',
          'Begin the selected-genre opening scene now. Do not explain the setup, instructions, process, or reasoning.',
          'Do NOT choose a different genre, premise, or opening setup.',
        ].join('\n'),
        {
          adventureGenre: 'Fantasy',
          nameGeneration: {
            namePool: {
              female: ['Ariana'],
              male: ['Darin'],
              location: ['Veyra'],
            },
          },
        },
      );
      assert.match(fantasyIntroPrompt, /START_ADVENTURE_PROMPT: FANTASY/);
      assert.match(fantasyIntroPrompt, /This is the opening turn of a new Fantasy adventure\./);
      assert.match(fantasyIntroPrompt, /GENRE OPENING:/);
      assert.match(fantasyIntroPrompt, /You MUST begin in the selected genre: Fantasy\./);
      assert.match(fantasyIntroPrompt, /Do NOT choose a different genre, premise, or opening setup/);
      assert.match(fantasyIntroPrompt, /PREMADE CHARACTER RULE:/);
      assert.match(fantasyIntroPrompt, /PRESERVE \{\{user\}\}'s existing race, body, abilities, gear, identity, backstory/);
      assert.match(fantasyIntroPrompt, /NAME REVEAL:/);
      assert.ok(
        fantasyIntroPrompt.indexOf('GENRE OPENING:') < fantasyIntroPrompt.indexOf('NAME REVEAL:'),
        'Non-isekai genre opening should appear before name reveal.',
      );
      assert.ok(
        fantasyIntroPrompt.indexOf('NAME REVEAL:') < fantasyIntroPrompt.indexOf('START ADVENTURE REMINDER:'),
        'Non-isekai name reveal should appear before the reminder.',
      );
      assert.doesNotMatch(fantasyIntroPrompt, /You MUST narrate BOTH required beats below|BEAT #1: EARTH LAST MOMENTS/);
    },
  },
  {
    name: '47 Prose Guard uses only three targeted phrase fields and exact rule blocks',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const editSource = fs.readFileSync(new URL('prose-guard-edits.js', import.meta.url), 'utf8');
      const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', import.meta.url), 'utf8'));

      assert.equal(manifest.version, '0.9.18');
      assert.match(source, /proseGuardStrictBehaviorismBannedPhrases:\s*DEFAULT_PROSE_GUARD_STRICT_BEHAVIORISM_BANNED_PHRASES/);
      assert.match(source, /proseGuardDenotativePhysicalityBannedPhrases:\s*DEFAULT_PROSE_GUARD_DENOTATIVE_PHYSICALITY_BANNED_PHRASES/);
      assert.match(source, /proseGuardEmbodiedPerceptionBannedPhrases:\s*DEFAULT_PROSE_GUARD_EMBODIED_PERCEPTION_BANNED_PHRASES/);
      assert.doesNotMatch(source, /proseGuardInanimateObjectivityBannedPhrases/);
      assert.doesNotMatch(source, /ruleName:\s*'inanimateObjectivity'/);
      assert.match(source, /rulePrompt:\s*getProseRuleBlock\(field\.ruleName\)/);
      assert.match(source, /function getProseRuleBlock\(ruleName\)/);
      assert.match(source, /function strictBehaviorism\(response, context\)/);
      assert.match(source, /function denotativePhysicality\(response, context\)/);
      assert.match(source, /function embodiedPerception\(response, context\)/);
      assert.match(source, /if \(extension_settings\[SETTINGS_KEY\]\[key\] === undefined\)/);
      assert.match(source, /data-structured-preflight-reset-prose-guard-bans/);

      assert.match(editSource, /export function collectProseGuardSentenceFindings/);
      assert.match(editSource, /export function applyProseGuardSentenceRepairs/);
      assert.match(editSource, /export function parseProseGuardRepairPayload/);
      assert.match(source, /includeSentenceRepairs/);
      assert.doesNotMatch(source, /includeProseEdits|proseEdits/);
      assert.doesNotMatch(source, /buildProseGuardPrompt|requestProseGuardCorrection|requestCombinedPostNarrationPass|STORY_ENGINE_COMBINED_POST_NARRATION_PASS/);
    },
  },
  {
    name: '47a deterministic phrase findings ignore dialogue and group one sentence',
    run() {
      const rules = [
        { ruleName: 'strictBehaviorism', phrases: ['breath catches'] },
        { ruleName: 'denotativePhysicality', phrases: ['silence stretches'] },
        { ruleName: 'embodiedPerception', phrases: ['room smells'] },
      ];
      const source = 'Maria says, "Her breath catches." Outside, her breath catches while silence stretches and the room smells of smoke.';
      const findings = collectProseGuardSentenceFindings(source, rules);

      assert.equal(findings.length, 1);
      assert.equal(findings[0].id, 'PG_SENTENCE_1');
      assert.equal(findings[0].sentence, 'Outside, her breath catches while silence stretches and the room smells of smoke.');
      assert.deepEqual(findings[0].ruleNames, ['strictBehaviorism', 'denotativePhysicality', 'embodiedPerception']);
      assert.equal(findings[0].matches.length, 3);
      assert.equal(findings[0].matches.filter(match => match.ruleName === 'strictBehaviorism').length, 1);

      assert.deepEqual(
        collectProseGuardSentenceFindings('Maria says, "Her breath catches."', rules),
        [],
      );
      assert.deepEqual(
        collectProseGuardSentenceFindings("Maria says, 'Her breath catches.'", rules),
        [],
      );
      assert.deepEqual(
        collectProseGuardSentenceFindings('Maria says, \u2018Her breath catches.\u2019', rules),
        [],
      );
      assert.deepEqual(
        collectProseGuardSentenceFindings('Maria says, \u2018I don\u2019t think her breath catches.\u2019', rules),
        [],
      );
      assert.deepEqual(
        collectProseGuardSentenceFindings("Maria says, 'I don't think her breath catches.'", rules),
        [],
      );
      assert.equal(collectProseGuardSentenceFindings("Maria's breath catches.", rules).length, 1);

      const quotedContinuation = collectProseGuardSentenceFindings(
        'Maria asks, "Are you sure?" while her breath catches.',
        rules,
      );
      assert.equal(quotedContinuation[0].sentence, 'Maria asks, "Are you sure?" while her breath catches.');

      const separateSentence = collectProseGuardSentenceFindings(
        'Maria asks, "Are you sure?" Her breath catches.',
        rules,
      );
      assert.equal(separateSentence[0].sentence, 'Her breath catches.');
    },
  },
  {
    name: '47b sentence repairs are code-owned, non-deleting, and quote-preserving',
    run() {
      const rules = [{ ruleName: 'strictBehaviorism', phrases: ['breath catches', 'breath hitches'] }];
      const source = 'Maria says, "Stay here," while her breath catches.';
      const findings = collectProseGuardSentenceFindings(source, rules);
      assert.equal(findings.length, 1);
      const findingId = findings[0].id;

      const validPayload = parseProseGuardRepairPayload([
        PROSE_GUARD_EDITS_START,
        JSON.stringify({
          sentenceRepairs: [{
            findingId,
            replacementSentence: 'Maria says, "Stay here," while her breathing remains steady.',
          }],
        }),
        PROSE_GUARD_EDITS_END,
      ].join('\n'));
      const repaired = applyProseGuardSentenceRepairs(source, findings, validPayload, { rules });
      assert.equal(repaired.narrationText, 'Maria says, "Stay here," while her breathing remains steady.');
      assert.equal(repaired.appliedRepairs.length, 1);

      const unknownFinding = applyProseGuardSentenceRepairs(source, findings, {
        sentenceRepairs: [{
          findingId: 'PG_SENTENCE_999',
          replacementSentence: 'Maria says, "Stay here," while her breathing remains steady.',
        }],
      }, { rules });
      assert.equal(unknownFinding.narrationText, source);
      assert.match(unknownFinding.rejectedRepairs[0].reason, /unknown findingId/);

      const unsafeReplacement = applyProseGuardSentenceRepairs(source, findings, {
        sentenceRepairs: [{
          findingId,
          replacementSentence: 'Maria says, "Leave now," while her breathing remains steady.',
        }],
      }, { rules });
      assert.equal(unsafeReplacement.narrationText, source);
      assert.match(unsafeReplacement.rejectedRepairs[0].reason, /changed quoted dialogue/);

      const replacementWithViolation = applyProseGuardSentenceRepairs(source, findings, {
        sentenceRepairs: [{
          findingId,
          replacementSentence: 'Maria says, "Stay here," while her breath hitches.',
        }],
      }, { rules });
      assert.equal(replacementWithViolation.narrationText, source);
      assert.match(replacementWithViolation.rejectedRepairs[0].reason, /targeted phrase violation/);

      const destructiveReplacement = applyProseGuardSentenceRepairs(
        'Maria lifts the cup by the window while her breath catches.',
        collectProseGuardSentenceFindings(
          'Maria lifts the cup by the window while her breath catches.',
          rules,
        ),
        {
          sentenceRepairs: [{
            findingId: 'PG_SENTENCE_1',
            replacementSentence: 'Maria steps away from the window.',
          }],
        },
        { rules },
      );
      assert.equal(destructiveReplacement.narrationText, 'Maria lifts the cup by the window while her breath catches.');
      assert.match(destructiveReplacement.rejectedRepairs[0].reason, /outside the targeted phrase span/);

      for (const [factSource, factReplacement] of [
        ['Maria lifts the cup while her breath catches.', 'Maria drops the cup while her breathing remains steady.'],
        ["The guard grips Maria's wrist while his breath catches.", "The guard releases Maria's wrist while his breathing remains steady."],
        ['Maria lifts the cup while her breath catches.', 'Maria lifts the cup while her breathing remains steady and then leaves the room.'],
        ['Maria lifts the cup while her breath catches.', 'Maria lifts the cup while her breathing remains steady and she leaves.'],
        ['Maria lifts the cup while her breath catches.', 'Maria lifts the cup while her steps move away.'],
      ]) {
        const factFindings = collectProseGuardSentenceFindings(factSource, rules);
        const factMutation = applyProseGuardSentenceRepairs(factSource, factFindings, {
          sentenceRepairs: [{ findingId: factFindings[0].id, replacementSentence: factReplacement }],
        }, { rules });
        assert.equal(factMutation.narrationText, factSource);
        assert.match(factMutation.rejectedRepairs[0].reason, /outside the targeted phrase span|excessive content inside a targeted phrase span|new actor reference|another action or clause|lacked a lexical anchor/);
      }

      assert.throws(
        () => parseProseGuardRepairPayload({
          sentenceRepairs: [],
          commentary: 'rewrite complete',
        }),
        /unauthorized field/,
      );

      const duplicateSource = 'Her eyes narrow. Her eyes soften.';
      const duplicateFindings = collectProseGuardSentenceFindings(duplicateSource, [
        { ruleName: 'strictBehaviorism', phrases: ['eyes soften'] },
      ]);
      const duplicateRepair = applyProseGuardSentenceRepairs(duplicateSource, duplicateFindings, {
        sentenceRepairs: [{
          findingId: duplicateFindings[0].id,
          replacementSentence: 'Her eyes narrow.',
        }],
      }, { rules: [{ ruleName: 'strictBehaviorism', phrases: ['eyes soften'] }] });
      assert.equal(duplicateRepair.narrationText, duplicateSource);
      assert.match(duplicateRepair.rejectedRepairs[0].reason, /duplicated existing narration/);

      const repeatedRepairSource = 'The silence stretches. The silence stretches.';
      const repeatedRepairRules = [
        { ruleName: 'denotativePhysicality', phrases: ['silence stretches'] },
      ];
      const repeatedRepairFindings = collectProseGuardSentenceFindings(repeatedRepairSource, repeatedRepairRules);
      const repeatedRepair = applyProseGuardSentenceRepairs(repeatedRepairSource, repeatedRepairFindings, {
        sentenceRepairs: repeatedRepairFindings.map(finding => ({
          findingId: finding.id,
          replacementSentence: 'The silence continues.',
        })),
      }, { rules: repeatedRepairRules });
      assert.equal(repeatedRepair.appliedRepairs.length, 1);
      assert.equal(repeatedRepair.rejectedRepairs.length, 1);
      assert.match(repeatedRepair.rejectedRepairs[0].reason, /repeated the same narration/);

      assert.throws(
        () => parseProseGuardRepairPayload({
          sentenceRepairs: [{ findingId, replacementSentence: '' }],
        }),
        /attempted to delete narration/,
      );
      assert.throws(
        () => parseProseGuardRepairPayload({
          sentenceRepairs: [{ findingId, replacementSentence: 'First sentence.\nSecond sentence.' }],
        }),
        /crossed a line boundary/,
      );
      assert.throws(
        () => parseProseGuardRepairPayload({
          sentenceRepairs: [{ findingId, replacementSentence: 'BEGIN_FINAL_NARRATION Maria steps back.' }],
        }),
        /structured-output artifact/,
      );
    },
  },
  {
    name: '48 targeted Prose Guard runs before one separate tracker call',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const editSource = fs.readFileSync(new URL('prose-guard-edits.js', import.meta.url), 'utf8');
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const adapterSource = fs.readFileSync(new URL('st-adapter.js', import.meta.url), 'utf8');

      const targetedIndex = source.indexOf('const targetedRepair = await applyTargetedProseBanRepairIfNeeded(narrationText, requestOptions);');
      const trackerRequestIndex = source.indexOf('const trackerRaw = await requestPostNarrationTrackerDeltaWithTimeout({', targetedIndex);
      const trackerParseIndex = source.indexOf('const postNarrationDelta = parsePostNarrationTrackerResponse(trackerRaw, narrationText);', trackerRequestIndex);
      const displayIndex = source.indexOf('message.extra.display_text = narrationText', trackerParseIndex);

      assert.ok(targetedIndex > 0, 'Targeted Prose Guard call is missing.');
      assert.ok(trackerRequestIndex > targetedIndex, 'Tracker call must follow targeted Prose Guard.');
      assert.ok(trackerParseIndex > trackerRequestIndex, 'Tracker response must be parsed after its request.');
      assert.ok(displayIndex > trackerParseIndex, 'Final display must follow the tracker call.');
      assert.match(source, /if \(proseGuardEnabled && narrationText\)/);
      assert.match(source, /const trackerRaw = await requestPostNarrationTrackerDeltaWithTimeout\(\{/);
      assert.match(source, /narrationText,\s*\n\s*trackerDisplaySnapshot/);
      assert.match(source, /function requestPostNarrationUtility/);
      assert.match(source, /requestPostNarrationUtility\([\s\S]*?requestOptions = \{\}/);
      assert.match(source, /catch \(error\) \{\s*assertStoryEngineModelRequestCurrent\(requestOptions\);/);
      assert.match(source, /abortController\?\.abort\(\)/);
      assert.match(source, /sendDeepSeekProfileStructuredRequest/);
      assert.match(source, /official DeepSeek \$\{purpose\} tool call failed; falling back to validated text output/);
      assert.match(source, /function applyTargetedProseBanRepairIfNeeded[\s\S]*if \(!findings\.length\)/);
      assert.doesNotMatch(source, /buildProseGuardPrompt|requestProseGuardCorrection|requestCombinedPostNarrationPass|parseCombinedPostNarrationResponse|combinedTrackerDelta|broadProseGuardAlreadyApplied|STORY_ENGINE_COMBINED_POST_NARRATION_PASS/);
      assert.doesNotMatch(source, /includeProseEdits|proseEdits/);
      assert.match(semanticSource, /signal: options\.signal/);
      assert.match(adapterSource, /processRequest\(\s*requestPayload,\s*\{\},\s*extractData,\s*signal,/);
    },
  },
  {
    name: '48a private Story Engine profile requests do not rotate active API secrets',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const adapterSource = fs.readFileSync(new URL('st-adapter.js', import.meta.url), 'utf8');
      assert.doesNotMatch(source, /rotateSecret/);
      assert.doesNotMatch(source, /secret_state/);
      assert.doesNotMatch(source, /withConnectionProfileSecret/);
      assert.doesNotMatch(source, /CHAT_COMPLETION_SECRET_KEYS/);
      assert.doesNotMatch(semanticSource, /secret_id:\s*profile\['secret-id'\]/);
      assert.match(adapterSource, /secret_id:\s*profile\['secret-id'\]/);
      assert.match(adapterSource, /chat_completion_source:\s*chatCompletionSource/);
      assert.match(source, /using direct semantic connection profile request/);
      assert.match(source, /semanticReasoningEffort: 'medium'/);
      assert.match(source, /semanticReasoningEffort: normalizeSemanticReasoningEffort\(settings\.semanticReasoningEffort\)/);
      assert.doesNotMatch(source, /using direct tracker connection profile request/);
      assert.doesNotMatch(source, /using direct Prose Guard connection profile request/);
      assert.doesNotMatch(source, /using direct Progression connection profile request/);
      const deepSeekSemanticPayload = {
        chat_completion_source: 'deepseek',
        include_reasoning: false,
        reasoning_effort: 'min',
        max_tokens: 4096,
        custom_include_body: 'thinking:\n  type: disabled\nprovider_option: true',
      };
      applySemanticThinkingPayload(deepSeekSemanticPayload);
      assert.equal(deepSeekSemanticPayload.include_reasoning, true);
      assert.equal(deepSeekSemanticPayload.reasoning_effort, 'high');
      assert.equal(deepSeekSemanticPayload.max_tokens, 16384);
      assert.equal(deepSeekSemanticPayload.custom_include_body, 'provider_option: true');
      assert.equal(normalizeSemanticReasoningEffort('LOW'), 'low');
      assert.equal(normalizeSemanticReasoningEffort('medium'), 'medium');
      assert.equal(normalizeSemanticReasoningEffort('HIGH'), 'high');
      assert.equal(normalizeSemanticReasoningEffort('unsupported'), 'medium');

      const deepSeekLowPayload = {
        chat_completion_source: 'deepseek',
        include_reasoning: true,
        reasoning_effort: 'max',
        max_tokens: 4096,
      };
      applySemanticThinkingPayload(deepSeekLowPayload, 'low');
      assert.equal(deepSeekLowPayload.include_reasoning, false);
      assert.equal('reasoning_effort' in deepSeekLowPayload, false);
      assert.equal(deepSeekLowPayload.max_tokens, 4096);

      const deepSeekHighPayload = {
        chat_completion_source: 'deepseek',
        include_reasoning: false,
        reasoning_effort: 'high',
        max_tokens: 4096,
      };
      applySemanticThinkingPayload(deepSeekHighPayload, 'high');
      assert.equal(deepSeekHighPayload.include_reasoning, true);
      assert.equal(deepSeekHighPayload.reasoning_effort, 'max');
      assert.equal(deepSeekHighPayload.max_tokens, 16384);
      assert.equal(buildSemanticToolChoice('deepseek'), undefined);
      assert.deepEqual(buildSemanticToolChoice('openai'), {
        type: 'function',
        function: { name: 'submit_semantic_preflight' },
      });

      const nanoGptSemanticPayload = {
        chat_completion_source: 'nanogpt',
        include_reasoning: true,
        reasoning_effort: 'max',
        max_tokens: 4096,
      };
      applySemanticThinkingPayload(nanoGptSemanticPayload, 'high');
      assert.equal(nanoGptSemanticPayload.include_reasoning, false);
      assert.equal('reasoning_effort' in nanoGptSemanticPayload, false);
      assert.equal(nanoGptSemanticPayload.max_tokens, 4096);

      const deepSeekNonSemanticPayload = {
        chat_completion_source: 'deepseek',
        include_reasoning: true,
        reasoning_effort: 'high',
        max_tokens: 2048,
      };
      applyStoryEngineThinkingDisabledPayload(deepSeekNonSemanticPayload);
      assert.equal(deepSeekNonSemanticPayload.include_reasoning, false);
      assert.equal('reasoning_effort' in deepSeekNonSemanticPayload, false);
      assert.equal(deepSeekNonSemanticPayload.max_tokens, 2048);

      assert.match(semanticSource, /\['openai', 'azure_openai', DEEPSEEK_CHAT_COMPLETION_SOURCE\]/);
      assert.match(semanticSource, /const COMPACT_LEDGER_OUTPUT_CONTRACT = \[/);
      assert.match(semanticSource, /const SEMANTIC_FIELD_GUIDANCE = \[/);
      assert.doesNotMatch(semanticSource, /compact ledger wording elsewhere in the prompt/);
      const semanticEngineGuidance = 'ENGINE REFERENCE: ResolutionEngine and semantic field guidance remain authoritative.';
      const toolPrompt = buildSemanticToolPrompt([
        { role: 'system', content: semanticEngineGuidance },
        {
          role: 'user',
          content: 'STRICT COMPACT PREFLIGHT LEDGER CONTRACT:\nBEGIN_SEMANTIC_PREFLIGHT\nResolutionEngine.identifyGoal: test\nEND_SEMANTIC_PREFLIGHT',
        },
      ]);
      assert.equal(toolPrompt.length, 2);
      assert.equal(toolPrompt[0].content, semanticEngineGuidance);
      assert.match(toolPrompt[1].content, /Call the function tool submit_semantic_preflight exactly once/);
      assert.doesNotMatch(toolPrompt[1].content, /STRICT COMPACT PREFLIGHT LEDGER CONTRACT|BEGIN_SEMANTIC_PREFLIGHT|ResolutionEngine\.identifyGoal: test/);
      assert.match(semanticSource, /removeTopLevelYamlKey\(payload\.custom_include_body, 'thinking'\)/);
      assert.doesNotMatch(semanticSource, /DISABLE_THINKING_INCLUDE_BODY/);
      assert.match(semanticSource, /generateSemanticRawWithProfile[\s\S]*?preparePayload: applyStoryEngineThinkingDisabledPayload/);
      assert.match(semanticSource, /export function isOfficialDeepSeekProfile/);
      assert.match(adapterSource, /export function getChatCompletionProfileRoute/);
      assert.match(semanticSource, /getChatCompletionProfileRoute/);
      assert.match(semanticSource, /route\.usesCustomUrl !== true/);
      assert.match(semanticSource, /route\.usesReverseProxy !== true/);
      assert.match(semanticSource, /export async function sendDeepSeekProfileStructuredRequest/);
      assert.match(semanticSource, /sendDeepSeekProfileStructuredRequest[\s\S]*tool_choice: undefined[\s\S]*preparePayload: payload => applySemanticThinkingPayload\(payload, options\.semanticReasoningEffort\)/);
      assert.match(semanticSource, /generateSemanticToolCallWithProfile[\s\S]*isOfficialDeepSeekProfile\(options\)[\s\S]*: applyStoryEngineThinkingDisabledPayload/);
      assert.match(source, /applyStoryEngineThinkingDisabledPayload\(generateData\)/);
      const adapterToolRequest = adapterSource.slice(
        adapterSource.indexOf('export async function sendDefaultChatCompletionToolRequest'),
        adapterSource.indexOf('export function getChatCompletionSourceForProfile'),
      );
      assert.match(adapterToolRequest, /else if \(typeof options\?\.buildToolChoice === 'function'\) \{\s*delete generateData\.tool_choice;/);
      assert.ok(
        adapterToolRequest.indexOf("generateData.max_tokens = responseLength") < adapterToolRequest.indexOf('options?.preparePayload?.(generateData)'),
        'Provider-aware semantic payload preparation must run after the base response budget is assigned.',
      );
      assert.match(source, /async function withTrackerGenerationSettings\(callback\)[\s\S]*return await withSemanticGenerationSettings\(callback\);/);
      assert.match(source, /async function withProseGuardGenerationSettings\(callback\)[\s\S]*return await withSemanticGenerationSettings\(callback\);/);
    },
  },
  {
    name: '48b old text completion hook is removed',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      assert.doesNotMatch(source, /TEXT_COMPLETION_SETTINGS_READY/);
      assert.doesNotMatch(source, /handleTextCompletionSettingsReady/);
      assert.doesNotMatch(source, /generateData\.include_reasoning\s*=\s*false/);
      assert.doesNotMatch(source, /delete generateData\.reasoning_effort/);
    },
  },
  {
    name: '49 player creator supports compact identity fields, custom details, and alphabetical race choices',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const generationSource = fs.readFileSync(new URL('character-sheet-generation.js', import.meta.url), 'utf8');
      const raceBlock = source.match(/const PLAYER_RACE_CHOICES = Object\.freeze\(\[\n([\s\S]*?)\n\]\);/)?.[1] || '';
      const races = [...raceBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
      assert.ok(races.length > 10, 'Race choices should be present.');
      assert.deepEqual(races, [...races].sort((a, b) => a.localeCompare(b)));
      assert.doesNotMatch(raceBlock, /'Random'/);
      assert.match(source, /const PLAYER_GENRE_CHOICES = Object\.freeze/);
      assert.match(source, /const PLAYER_CREATION_STAT_POINTS = 24/);
      assert.match(source, /const PLAYER_CREATION_MAX_STAT = 9/);
      assert.match(source, /function buildNewCharacterPointBuyState/);
      assert.match(source, /function buildPersonaPointBuyState/);
      assert.match(source, /function buildPlayerStatsHtml/);
      assert.match(source, /function adjustPlayerCreationStat/);
      assert.match(source, /function resetPlayerCreationStats/);
      assert.match(source, /function normalizePlayerCreatorSetupState/);
      assert.match(source, /function isValidPlayerCreationStatsDraft/);
      assert.match(source, /const isStatsStage = next\.stage === 'stats'/);
      assert.match(source, /if \(!hasUsableDraft \|\| \(!isStatsStage && !hasCompleteStats\)\)/);
      assert.match(source, /stage === 'reroll' \|\| stage === 'swap'/);
      assert.match(source, /data-spe-player-action="stat-plus"/);
      assert.match(source, /data-spe-player-action="stat-minus"/);
      assert.match(source, /data-spe-player-action="continue-stats"/);
      assert.match(source, /data-spe-player-action="reset-stats"/);
      assert.match(source, /data-spe-player-action="back-to-stats"/);
      assert.match(source, /Distribute \$\{PLAYER_CREATION_STAT_POINTS\} points across PHY, MND, and CHA/);
      assert.match(source, /Starting stats cannot exceed \$\{PLAYER_CREATION_MAX_STAT\}/);
      assert.doesNotMatch(source, /function buildNewCharacterRollState/);
      assert.doesNotMatch(source, /function buildPersonaRollState/);
      assert.doesNotMatch(source, /function rollD10/);
      assert.doesNotMatch(source, /function rollStatPair/);
      assert.doesNotMatch(source, /function buildPlayerRerollHtml/);
      assert.doesNotMatch(source, /function buildPlayerSwapHtml/);
      assert.doesNotMatch(source, /data-spe-player-action="reroll"/);
      assert.doesNotMatch(source, /data-spe-player-action="apply-swap"/);
      assert.doesNotMatch(source, /data-spe-player-action="skip-swap"/);
      assert.doesNotMatch(source, /id="spe_player_swap_/);
      assert.doesNotMatch(source, /statPools/);
      assert.doesNotMatch(source, /rolls:/);
      assert.doesNotMatch(source, /id="spe_player_character_name"/);
      assert.doesNotMatch(source, /characterName: ''/);
      assert.match(source, /<input id="spe_player_sex"/);
      assert.match(source, /id="spe_player_genre"/);
      assert.match(source, /id="spe_player_race"/);
      assert.match(source, /<option value="random"/);
      assert.match(source, /<option value="custom"/);
      assert.match(source, /data-spe-player-custom-race/);
      assert.match(source, /data-spe-player-race-description/);
      assert.match(source, /id="spe_player_additional_details_mode"/);
      assert.match(source, /id="spe_player_additional_details"/);
      assert.match(source, /Use my notes \+ fill the rest/);
      assert.match(source, /data-spe-player-additional-details/);
      assert.match(source, /function updatePlayerIdentityOptionalFields/);
      assert.match(source, /\[hidden\]\s*\{\s*display: none !important;/);
      assert.doesNotMatch(source, /max-height: min\(74vh, 42rem\)/);
      assert.doesNotMatch(source, /max-height: 72vh;/);
      assert.match(source, /#\$\{PLAYER_SETUP_CARD_ID\} textarea \{\s*min-height: 5\.5rem;\s*max-height: 90vh;\s*max-height: 90dvh;\s*overflow-y: auto;\s*resize: vertical;/);
      assert.match(source, /#\$\{PLAYER_SETUP_CARD_ID\} pre \{\s*white-space: pre-wrap;\s*height: min\(26rem, 70vh\);\s*height: min\(26rem, 70dvh\);\s*max-height: 90vh;\s*max-height: 90dvh;\s*overflow: auto;\s*resize: vertical;/);
      assert.doesNotMatch(source, /id="spe_player_race_mode"/);
      assert.doesNotMatch(source, /id="spe_player_race_pick"/);
      assert.doesNotMatch(source, /id="spe_player_appearance"/);
      assert.match(source, /delete creator\.identity\.characterName/);
      assert.match(source, /creator\.identity\.sex = String\(document\.getElementById\('spe_player_sex'\)/);
      assert.match(source, /creator\.identity\.genre = normalizePlayerAdventureGenre\(genre\)/);
      assert.match(source, /const additionalDetailsMode = document\.getElementById\('spe_player_additional_details_mode'\)/);
      assert.match(source, /creator\.identity\.additionalDetailsMode = additionalDetailsMode === 'user' \? 'user' : 'system'/);
      assert.match(source, /creator\.identity\.additionalDetails = String\(document\.getElementById\('spe_player_additional_details'\)/);
      assert.match(source, /buildNewCharacterNameInstruction\(\)/);
      assert.match(source, /buildNewCharacterSexInstruction\(identity\)/);
      assert.match(source, /buildNewCharacterGenreInstruction\(identity\)/);
      assert.match(source, /buildNewCharacterStatInstruction\(stats\)/);
      assert.match(source, /buildNewCharacterAdditionalDetailsInstruction\(identity\)/);
      assert.match(source, /explicitAnchorSource: getNewCharacterExplicitAnchorSource\(identity\)/);
      assert.match(source, /explicitAppearanceSource: getNewCharacterExplicitAppearanceSource\(identity\)/);
      assert.match(source, /function getNewCharacterExplicitAnchorSource\(identity = \{\}\)/);
      assert.match(source, /function getNewCharacterExplicitAppearanceSource\(identity = \{\}\)/);
      assert.match(source, /function getPlayerSetupPersonaName\(\)/);
      assert.match(source, /return '\{\{user\}\}'/);
      assert.match(source, /Deterministic rendering uses \{\{user\}\} exactly as the character name/);
      assert.match(source, /\{\{user\}\} resolves to the current SillyTavern persona name/);
      assert.doesNotMatch(source, /Generate a fitting character name/);
      assert.match(source, /Use this character sex exactly/);
      assert.match(source, /Generate a fitting character sex or leave it unspecified/);
      assert.match(source, /All races are valid in all genres/);
      assert.match(source, /If race is Random, choose any playable race first/);
      assert.match(source, /For Isekai, the sheet must establish only the premise/);
      assert.match(source, /died on Earth and was reincarnated in another world/);
      assert.match(source, /Do not establish time since crossing, prior new-world life, adaptation, local knowledge, previous-life memory state/);
      assert.match(source, /The user-provided additional character details are locked starting facts/);
      assert.match(source, /Use them to shape background, Earth life, arrival\/origin, appearance, clothing/);
      assert.doesNotMatch(source, /placeholder="Optional background,[^"]*scars/);
      assert.match(source, /Because the selected genre is Isekai, any Earth-life details/);
      assert.match(source, /before death and reincarnation/);
      assert.match(source, /LOCKED USER ADDITIONAL DETAILS/);
      assert.match(source, /You generate a SillyTavern user persona character sheet for roleplay/);
      assert.match(source, /This is a playable user character shell, not an authored protagonist/);
      assert.match(source, /Do not decide future choices, personality, habits, emotional reactions/);
      assert.match(source, /Generate flavorful, concrete details with enough specificity to use as a full persona sheet/);
      assert.match(source, /Abilities and spells must follow the selected genre power direction/);
      assert.match(source, /Produce the complete character-sheet data through the required structured output/);
      assert.match(source, /deterministic code owns the final headings, order, labels, name, and locked stats/);
      assert.match(generationSource, /\['BASIC INFO', basicLines\.join\('\\n'\)\]/);
      assert.match(generationSource, /\['CHARACTER ANCHORS', renderBulletList\(anchors/);
      assert.match(source, /STAT SHAPE: strongest stats are/);
      assert.match(source, /relative weak point/);
      assert.match(source, /Do not contradict the locked stats/);
      assert.match(source, /Appearance must reflect PHY when relevant/);
      assert.match(source, /Do not invent scars or permanent marks; preserve them only when explicitly supplied by the user/);
      assert.match(source, /Do not soften high PHY into a default lean, wiry, fragile, noncombatant, or untrained description/);
      assert.match(source, /const PLAYER_CREATION_MAX_STARTING_SPELLS = 1/);
      assert.match(source, /NATURAL WEAPONS: concrete offensive body parts only, if any/);
      assert.match(source, /Use an empty array when the race\/body has no clear natural weapon/);
      assert.match(source, /Natural weapons are body facts, not racial traits, gear, inventory, equipment, held objects, abilities, or spells/);
      assert.match(source, /Do not write passive traits, resistance, immunity, durability, damage reduction, harder to injure, harder to exhaust/);
      assert.match(source, /const PROGRESSION_REQUIRED_ABILITIES = 1/);
      assert.match(source, /ABILITIES: exactly \$\{PROGRESSION_REQUIRED_ABILITIES\} simple, deliberately activated protagonist ability/);
      assert.match(source, /\$\{powerProfile\.abilityContract\}/);
      assert.match(source, /\$\{powerProfile\.ability\}/);
      assert.match(source, /State what \{\{user\}\} can do and what directly happens/);
      assert.match(source, /do not turn any stat into an amplified ordinary action/);
      assert.match(source, /Choose a varied concept rather than copying a stock template or example/);
      assert.match(source, /Do not include permission, attempt, numerical, mechanical, measurement/);
      assert.match(source, /Do not make it a spell, passive trait, broad ordinary skill, cosmetic or lore-only detail/);
      assert.match(source, /On retry, avoid every item in PRIOR IDEAS TO AVOID and create a genuinely different concept/);
      assert.match(source, /SPELLS: exactly \$\{PLAYER_CREATION_MAX_STARTING_SPELLS\} starting spell entry when MND is 7 or higher/);
      assert.match(source, /\$\{powerProfile\.spell\}/);
      assert.match(source, /exactly one primary purpose: offensive, healing, or utilitarian/);
      assert.match(source, /Do not combine purposes or generate barriers/);
      assert.doesNotMatch(source, /genre-native activated spell or equivalent/);
      assert.match(source, /INVENTORY: carried or stowed items only/);
      assert.match(source, /Do not list clothing worn on the body, armor, weapons worn ready, currency/);
      assert.match(source, /CURRENCY: money only, using the genre currency when possible/);
      assert.match(source, /For fantasy and isekai use silver \(sv\), for modern use dollars \(\$\), for cyberpunk use credits \(cr\)/);
      assert.match(source, /Do not put currency in INVENTORY or GEAR/);
      assert.match(source, /GEAR: worn, equipped, or immediately ready items only/);
      assert.match(source, /Do not list currency, carried supplies, pack contents, natural weapons, or body anatomy here/);
      assert.match(source, /Preserve explicit facts exactly in meaning while sorting possessions into the matching tracker-aligned structured fields/);
      assert.match(source, /CURRENCY: preserve explicit money only/);
      assert.match(source, /12 silver coins -> 12 sv/);
      assert.match(source, /GEAR: preserve explicit worn, equipped, or immediately ready items only/);
      assert.match(source, /CHARACTER ANCHORS: include only explicit user-provided durable facts that cannot fit BASIC INFO/);
      assert.match(source, /Otherwise return an empty array/);
      assert.match(source, /Do not invent anchor content, summarize or repeat another section, interpret stats, add meta-disclaimers, invent unresolved hooks/);
      assert.match(source, /CHARACTER ANCHORS: preserve only explicit durable persona facts that cannot fit another structured field/);
      assert.doesNotMatch(source, /PLAYER_SEX_CHOICES/);
    },
  },
  {
    name: '49a player creator exposes genre-aware start adventure after approval',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const handoffSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      const existingPersonaGeneration = source.slice(
        source.indexOf('async function generateExistingPersonaCharacterSheet'),
        source.indexOf('function validatePlayerCreatorSheet'),
      );
      const genreBlock = source.match(/const PLAYER_GENRE_CHOICES = Object\.freeze\(\[\n([\s\S]*?)\n\]\);/)?.[1] || '';
      const genres = [...genreBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
      const frameBlock = source.match(/const PLAYER_ADVENTURE_GENRE_FRAMES = Object\.freeze\(\{\n([\s\S]*?)\n\}\);/)?.[1] || '';
      assert.ok(genres.length > 5, 'Genre choices should be present.');
      for (const genre of genres) {
        assert.match(frameBlock, new RegExp(`${genre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:|'${genre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':`));
      }
      assert.doesNotMatch(frameBlock, /Start with a short playable opening scene/);
      assert.match(frameBlock, /Fantasy: 'Genre flavor: show fantasy/);
      assert.match(frameBlock, /Isekai: 'Genre flavor: show anime isekai through progression/);
      assert.match(frameBlock, /Superhero: 'Genre flavor: show superhero fiction/);
      assert.match(frameBlock, /Do not narrate \{\{user\}\} using powers unless \{\{user\}\} chooses to/);
      assert.match(source, /function playerAdventureStartPending/);
      assert.match(source, /root\?\.ready && root\?\.adventureStartPending && !root\?\.adventureStarted/);
      assert.match(source, /stage === 'approved'\s*\?\s*buildPlayerAdventureStartHtml\(root\)/);
      assert.match(source, /data-spe-player-action="start-adventure"/);
      assert.match(source, /data-spe-player-action="dismiss-adventure-start"/);
      assert.match(source, /function buildPersonaPointBuyState\(analysis, genre = 'Fantasy'\)/);
      assert.match(source, /root\.creator = buildPersonaPointBuyState\(analysis, getActiveAdventureGenre\(context\)\)/);
      assert.match(source, /function buildPlayerPersonaSheetHtml[\s\S]*?<select id="spe_player_genre"/);
      assert.match(source, /syncPlayerGenreInput\(root\.creator\);\s*\n\s*state\.playerSetupBusy = true/);
      assert.match(existingPersonaGeneration, /const genre = normalizePlayerAdventureGenre\(creator\.identity\?\.genre \|\| 'Fantasy'\)/);
      assert.match(existingPersonaGeneration, /genre,/);
      assert.match(existingPersonaGeneration, /SELECTED GENRE: \$\{genre\}/);
      assert.doesNotMatch(existingPersonaGeneration, /genre: 'Fantasy'/);
      assert.match(source, /function buildPlayerAdventureStartPrompt/);
      assert.match(source, /GENRE OPENING:/);
      assert.match(source, /You MUST begin in the selected genre: \$\{genre\}\./);
      assert.match(source, /Use the genre guidance below as the concrete Start Adventure structure\. Do NOT choose a different genre, premise, or opening setup for convenience\./);
      assert.match(source, /PLAYER_ISEKAI_ADVENTURE_START_REMINDER/);
      assert.match(source, /if \(genre === 'Isekai'\) \{\s*return PLAYER_ISEKAI_ADVENTURE_START_REMINDER;\s*\}/);
      assert.match(source, /'GENRE OPENING:',[\s\S]*`You MUST begin in the selected genre: \$\{genre\}\.`,[\s\S]*'Guidance:',[\s\S]*genreFrame,[\s\S]*'PREMADE CHARACTER RULE:',[\s\S]*PLAYER_ADVENTURE_START_REMINDER/);
      assert.doesNotMatch(source, /PLAYER_ADVENTURE_START_REMINDER,[\s\S]{0,80}genreFrame/);
      assert.match(source, /Begin the selected-genre opening scene now\. Do not explain the setup, instructions, process, or reasoning\./);
      assert.match(source, /Begin the Earth last moment, then continue directly into the Isekai opening\./);
      assert.match(source, /Do NOT skip the required isekai beats/);
      assert.match(source, /Do NOT choose a different Earth last moment or Isekai opening/);
      assert.match(source, /Do NOT choose a different genre, premise, or opening setup\./);
      assert.match(source, /If NAME REVEAL is present, follow it strictly: do NOT reveal new names unless gated by NAME REVEAL; when a name is revealed, use only the listed generated names\./);
      assert.doesNotMatch(source, /If an Isekai Opening Seed is present, use that seed as the concrete opening structure/);
      assert.match(source, /PLAYER_ADVENTURE_OPENING_CONTRACT/);
      assert.match(source, /Keep the opening short: 150-200 words/);
      assert.match(source, /Narrate ONLY what surrounds \{\{user\}\}/);
      assert.match(source, /Narrate ONLY what \{\{user\}\} can perceive externally/);
      assert.match(source, /\{\{user\}\}'s body, features, clothing, equipment, inventory, abilities, actions, reactions, thoughts, feelings, memories, decisions, or self-inspection/);
      assert.match(source, /\{\{user\}\} actions such as "you push yourself up" or "you open your eyes\."/);
      assert.match(source, /Do not summarize the character sheet, biography, skills, past, goals, personality, inventory, powers, or private history/);
      assert.match(source, /Do not explain the world\. Do not summarize lore/);
      assert.doesNotMatch(source, /retains previous-life memories/);
      assert.doesNotMatch(source, /Start with a short playable opening scene that clearly belongs to anime isekai, not generic fantasy\./);
      assert.match(source, /show anime isekai through progression, guilds, ranks, skills, dungeons/);
      assert.doesNotMatch(handoffSource, /openingBeat:/);
      assert.doesNotMatch(source, /USE a car crash, dying on a road, hitting asphalt, or hitting the curb, or ANYTHING that would imply that \{\{user\}\} died in a car accident\./);
      assert.doesNotMatch(source, /This is NON-NEGOTIABLE\. The opening MUST BE UNIQUE\./);
      assert.match(handoffSource, /const ISEKAI_EARTH_TRANSITIONS = Object\.freeze/);
      assert.match(handoffSource, /const ISEKAI_NEW_WORLD_OPENINGS = Object\.freeze/);
      assert.match(handoffSource, /BEAT #1: EARTH LAST MOMENTS/);
      assert.match(handoffSource, /BEAT #2: ISEKAI OPENING/);
      assert.match(handoffSource, /You MUST narrate BOTH required beats below, in order/);
      assert.match(handoffSource, /Traffic Fatality \/ Rescue Accident/);
      assert.doesNotMatch(handoffSource, /label: 'Divine Selection'/);
      assert.match(handoffSource, /Unexplained Death \/ Blackout/);
      assert.match(handoffSource, /requiredOpeningTags: \['game'\]/);
      assert.match(handoffSource, /compatibleIsekaiOpeningsForEarthSeed/);
      assert.match(handoffSource, /Game-Trapped Avatar Body/);
      assert.match(handoffSource, /Battlefield Arrival Between Factions/);
      assert.match(handoffSource, /ONE-TIME AESTHETIC RULE:/);
      assert.match(handoffSource, /The first visible glimpse of the new world, or the first clearly seen person from it/);
      assert.match(handoffSource, /PREMADE CHARACTER RULE:/);
      assert.match(handoffSource, /PRESERVE \{\{user\}\}\\'s existing race, body, abilities, gear, identity, backstory/);
      assert.doesNotMatch(source, /discovers themselves through play/);
      assert.doesNotMatch(source, /hooded figures chanting|throne room with exposition|white void/i);
      assert.match(source, /const genre = normalizePlayerAdventureGenre\(creator\.identity\?\.genre \|\| 'Fantasy'\)/);
      assert.match(source, /root\.adventureStartPending = true/);
      assert.match(source, /delete root\.adventureStartPrompt/);
      assert.match(source, /data-spe-player-action="back-from-adventure-start"/);
      assert.match(source, /root\.creator = \{\s*\.\.\.clone\(creator\),\s*stage: 'approved'/);
      assert.match(source, /reseedPlayerTrackerFromPersona\(trackerRoot, context\)/);
      assert.match(source, /function submitPlayerAdventureStartPrompt/);
      assert.match(source, /quiet_prompt: text/);
      assert.match(source, /quietToLoud: true/);
      assert.doesNotMatch(source, /sendButton\.click\(\)/);
      assert.match(source, /root\.adventureStartPrompt = prompt/);
      assert.match(source, /root\.adventureStartPromptCreatedAt = root\.adventureStartedAt/);
      assert.match(source, /function hasVisibleUserMessage/);
      assert.match(source, /function buildCurrentAdventureStartPrompt/);
      assert.match(source, /return buildPlayerAdventureStartPrompt\(root\);/);
      assert.match(source, /function getBeginningAdventureStartPrompt/);
      assert.match(source, /'swipe', 'regenerate'/);
      assert.match(source, /if \(hasVisibleUserMessage\(context\)\) return ''/);
      assert.match(source, /return buildCurrentAdventureStartPrompt\(context\);/);
      assert.match(source, /function getActiveAdventureIntroPrompt/);
      assert.match(source, /buildCurrentAdventureStartPrompt\(context\) \|\| pendingGeneration\?\.adventureStartPrompt/);
      assert.match(source, /function isBeginningAdventureIntroGeneration/);
      assert.match(source, /if \(!\['normal', 'swipe', 'regenerate'\]\.includes\(type\)\) return false/);
      assert.match(source, /return Boolean\(getActiveAdventureIntroPrompt\(pendingGeneration, context\)\)/);
      assert.match(source, /adventureGenre: getActiveAdventureGenre\(context\)/);
      assert.match(source, /adventureStartPrompt: getBeginningAdventureStartPrompt\(context, type\)/);
      assert.doesNotMatch(source, /writingStyleReminderPrompt: getWritingStyleReminderPrompt\(\)/);
      const promptReadySource = source.slice(
        source.indexOf('async function handleChatCompletionPromptReady'),
        source.indexOf('async function runSemanticPassWithPromptReadyBypass'),
      );
      const introBypassSource = promptReadySource.slice(
        promptReadySource.indexOf('if (isBeginningAdventureIntroGeneration(pendingGeneration, context))'),
        promptReadySource.indexOf('state.runningSemanticPass = true'),
      );
      assert.ok(introBypassSource.length > 0, 'Adventure intro bypass should happen before the semantic pass.');
      assert.match(introBypassSource, /const adventurePrompt = getActiveAdventureIntroPrompt\(pendingGeneration, context\);/);
      assert.match(introBypassSource, /const nameGeneration = buildAdventureIntroNameGeneration\(context, adventurePrompt\);/);
      assert.match(introBypassSource, /pendingGeneration\.nameGenerationSnapshot = nameGeneration;/);
      assert.match(introBypassSource, /const adventureGenre = pendingGeneration\.adventureGenre \|\| getActiveAdventureGenre\(context\);/);
      assert.match(introBypassSource, /const isekaiOpeningSeed = pendingGeneration\.isekaiOpeningSeed \|\| buildIsekaiOpeningSeed\(\{/);
      assert.match(introBypassSource, /pendingGeneration\.isekaiOpeningSeed = isekaiOpeningSeed;/);
      assert.match(introBypassSource, /const introOptions = \{[\s\S]*adventureGenre,[\s\S]*worldState: pendingGeneration\.worldStateSnapshot \|\| buildWorldStateSnapshot\(context\),[\s\S]*nameGeneration,[\s\S]*isekaiOpeningSeed,[\s\S]*\};/);
      assert.match(introBypassSource, /const narratorContext = formatAdventureIntroNarratorPromptContext\(adventurePrompt, introOptions\);/);
      assert.match(introBypassSource, /const narratorModelContext = formatAdventureIntroNarratorModelPromptContext\(adventurePrompt, introOptions\);/);
      assert.match(introBypassSource, /state\.pendingRun = buildAdventureIntroPendingRun\(context, pendingGeneration, narratorModelContext\);/);
      assert.match(introBypassSource, /state\.lastNarratorHandoff = narratorContext;/);
      assert.match(introBypassSource, /beginProseGuardDisplayIntercept\(pendingGeneration\.type \|\| 'normal'\)/);
      assert.match(introBypassSource, /sanitizeFinalPromptHistory\(eventData\.chat\)/);
      assert.match(introBypassSource, /appendNarratorContextToPrompt\(eventData\.chat, narratorModelContext\)/);
      assert.match(introBypassSource, /markNextStartAdventureRequestReasoningCleanup\(\)/);
      assert.doesNotMatch(introBypassSource, /setNarratorDepthPrompt\(context, narratorModelContext, EXTENSION_PROMPT_ROLES\.USER\)/);
      assert.doesNotMatch(introBypassSource, /markNextNarratorRequestThinkingDisabled\(\)/);
      assert.match(introBypassSource, /waitForStoryEngineModelCallSpacing\('adventure intro model call'\)/);
      assert.match(introBypassSource, /return;/);
      assert.doesNotMatch(introBypassSource, /runSemanticPassWithPromptReadyBypass|runDeterministicEngines|formatNarratorModelPromptContext|armNarratorGeneration|runPreflightDryRun|scheduleNarratorGeneration/);
      assert.doesNotMatch(source, /if \(pendingRun\?\.adventureIntro\) return true;/);
    },
  },
  {
    name: '50 character progression settings, gating, and persona edits are wired',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      assert.match(source, /const PROGRESSION_MILESTONE_XP = 100/);
      assert.match(source, /Minor_Success: 10/);
      assert.match(source, /Moderate_Success: 20/);
      assert.match(source, /Critical_Success: 30/);
      assert.match(source, /Success: 10/);
      assert.match(source, /const PROGRESSION_MAX_STAT = 10/);
      assert.match(source, /const PROGRESSION_SPELL_OPTIONS = 3/);
      assert.match(source, /const PROGRESSION_MAX_SPELLS = 5/);
      assert.match(source, /characterProgressionEnabled: true/);
      assert.match(source, /id="structured_preflight_progression_enabled"/);
      assert.doesNotMatch(source, /progressionConnectionProfile/);
      assert.doesNotMatch(source, /structured_preflight_progression_profile/);
      assert.doesNotMatch(source, /async function withProgressionGenerationSettings/);
      assert.doesNotMatch(source, /PROGRESSION_PROFILE_CURRENT/);
      assert.doesNotMatch(source, /LEGACY_PROGRESSION_PROFILE_CURRENT/);
      assert.doesNotMatch(source, /function normalizeProgressionProfileSetting/);
      assert.match(source, /Generated ability and spell options use the current narrator profile/);
      assert.equal((source.match(/const genre = getActiveAdventureGenre\(context\);/g) || []).length >= 2, true);
      assert.equal((source.match(/const powerProfile = getCharacterSheetPowerProfile\(genre\);/g) || []).length >= 3, true);
      assert.equal((source.match(/`SELECTED GENRE: \$\{genre\}\\n`/g) || []).length, 3);
      assert.match(source, /Stats may inform flavor but must never become a stat boost or an amplified ordinary action/);
      assert.match(source, /async function requestProgressionText[\s\S]*return await generateRawData\(\{ prompt: textPrompt, responseLength, \.\.\.overridePayload \}, context, \{ purpose: 'progression generation' \}\)/);
      assert.match(source, /function getProgressionRoot/);
      assert.match(source, /function progressionPending/);
      assert.match(source, /renderProgressionCard\(context\)/);
      assert.match(source, /Complete Character Progression before roleplay generation can continue/);
      assert.match(source, /Character Milestone Reached/);
      assert.match(source, /Advancement progress is hidden/);
      assert.doesNotMatch(source, /critical accomplishments reached/);
      assert.match(source, /function maybeRecordProgressionAccomplishment/);
      assert.match(source, /function progressionXpAwardFromPendingRun/);
      assert.match(source, /progressionXpAwardFromPendingRun\(pendingRun\) <= 0/);
      const progressionRecordStart = source.indexOf('function maybeRecordProgressionAccomplishment');
      const progressionRecordEnd = source.indexOf('function buildProgressionAccomplishmentRecord', progressionRecordStart);
      assert.ok(progressionRecordStart >= 0 && progressionRecordEnd > progressionRecordStart);
      const progressionRecordSource = source.slice(progressionRecordStart, progressionRecordEnd);
      assert.match(progressionRecordSource, /const existing = root\.accomplishments\.filter\(record => record\.messageKey === messageKey\)/);
      assert.match(progressionRecordSource, /existing\.some\(record => progressionRecordXpSpent\(record\) > 0\)/);
      assert.match(progressionRecordSource, /root\.accomplishments = root\.accomplishments\.filter\(record => record\.messageKey !== messageKey\)/);
      assert.match(progressionRecordSource, /progressionXpAwardFromPendingRun\(pendingRun\) <= 0\) return existing\.length > 0/);
      assert.match(source, /function selectProgressionMilestoneSourceRecords/);
      assert.match(source, /sourceRecordXp: sourceRecords/);
      assert.match(source, /xpSpent/);
      assert.match(source, /spellOptions: \[\]/);
      assert.match(source, /maybeRecordProgressionAccomplishment\(\{ pendingRun, messageKey, context \}\)/);
      assert.match(source, /removeProgressionRecordsForMessage\(key, context\)/);
      assert.match(source, /targets:\s*uniqueNames\(\[/);
      assert.doesNotMatch(source, /choose-gain-ability/);
      assert.doesNotMatch(source, /Gain Ability/);
      assert.doesNotMatch(source, /gainAbility/);
      assert.match(source, /Choose the existing ability to replace, then choose one generated replacement\. Ability options cannot be rerolled/);
      assert.match(source, /options\.length \? '' : '<button class="menu_button" data-spe-progression-action="generate-abilities">Generate Ability Options<\/button>'/);
      assert.match(source, /<button class="menu_button" data-spe-progression-action="back">Back<\/button>/);
      assert.doesNotMatch(source, /Ability options are already generated\. Choose one of the presented abilities/);
      assert.match(source, /id="spe_progression_swap_ability" class="text_pole" \$\{options\.length \? 'disabled' : ''\}/);
      assert.match(source, /canLearnSpell = Number\(stats\?\.MND \|\| 0\) >= 7 && spellCount < PROGRESSION_MAX_SPELLS/);
      assert.match(source, /data-spe-progression-action="choose-learn-spell"/);
      assert.match(source, /data-spe-progression-action="generate-spells"/);
      assert.match(source, /data-spe-progression-action="choose-spell"/);
      assert.match(source, /Learning spells requires MND 7 or higher/);
      assert.match(source, /spells\.length >= PROGRESSION_MAX_SPELLS/);
      assert.match(source, /root\.pendingAdvancement\.choice = 'choose'/);
      assert.doesNotMatch(source, /delete root\.pendingAdvancement\.abilityOptions/);
      assert.doesNotMatch(source, /delete root\.pendingAdvancement\.spellOptions/);
      assert.match(source, /stats cannot go above|Stats cannot go above/);
      assert.match(source, /value >= PROGRESSION_MAX_STAT \? 'disabled'/);
      assert.match(source, /extractPersonaAbilities/);
      assert.match(source, /extractPersonaSpells/);
      assert.match(source, /function isEmptyAbilityPlaceholder/);
      assert.match(source, /not specified\|no ability\|no abilities/);
      assert.match(source, /replaceAbilityInPersona/);
      assert.match(source, /appendSpellToPersona/);
      assert.match(source, /updatePersonaStatText/);
      assert.match(source, /writePlayerSheetToPersona\(nextText, context, actionIdentity\)/);
      assert.match(source, /Each option must have exactly one primary purpose: offensive, healing, or utilitarian/);
      assert.match(source, /Do not combine purposes, and do not generate barriers/);
      assert.match(source, /Return exactly three meaningfully different replacement options without forcing a fixed category coverage/);
      assert.match(source, /Return exactly three meaningfully different learnable options without forcing one purpose per option/);
      assert.match(source, /Return exactly three meaningfully different replacement options/);
      assert.match(source, /Return exactly three meaningfully different learnable options/);
      assert.match(source, /Progression ability generation did not return three valid options/);
      assert.match(source, /Progression spell generation did not return three valid options/);
      assert.match(source, /Generated ability ".+" included mechanical language/);
      assert.match(source, /Generated spell ".+" included mechanical language/);
      assert.match(source, /if \(Array\.isArray\(pending\?\.spellOptions\) && pending\.spellOptions\.length === PROGRESSION_SPELL_OPTIONS\) \{\s*return pending\.spellOptions;\s*\}/);
      assert.match(source, /function hasProgressionMechanicalLanguage/);
      assert.match(source, /\[-\+\]\?\\d\+\\s\*\(\?:to\|bonus\|modifier/);
      assert.match(source, /feet\|foot\|ft\|yards\?\|meters\?/);
      assert.match(source, /uses\?\\s\+per\|times\?\\s\+per\|per\\s\+\(\?:day\|scene\|turn\|round\|rest\)/);
    },
  },
  {
    name: '51 settings panel is grouped by execution order and preserves existing controls',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const renderStart = source.indexOf('function renderSettingsPanel()');
      const renderEnd = source.indexOf('const settings = getSettings();', renderStart);
      assert.ok(renderStart > 0, 'renderSettingsPanel should exist.');
      assert.ok(renderEnd > renderStart, 'renderSettingsPanel setup markup should be readable.');
      const renderSource = source.slice(renderStart, renderEnd);

      assert.match(source, /const SETTINGS_STYLE_ID = 'structured_preflight_settings_styles'/);
      assert.match(source, /function ensureSettingsPanelStyles\(\)/);
      assert.ok(renderSource.includes('ensureSettingsPanelStyles();'));
      assert.ok(renderSource.includes('spe-settings-shell'));
      assert.ok(renderSource.includes('spe-settings-section'));

      const sections = [
        ['data-spe-settings-step="master"', 'Master switch', 'Story Engine'],
        ['data-spe-settings-step="setup"', '0. Setup', 'Player Setup'],
        ['data-spe-settings-step="semantic"', '1. First model call', 'Story Engine Profile'],
        ['data-spe-settings-step="narrator-inputs"', '2. Narrator inputs', 'Narrator Context'],
        ['data-spe-settings-step="prose-guard"', '3. After narration', 'Prose Guard'],
        ['data-spe-settings-step="tracker"', '4. After final prose', 'Visible Tracker'],
        ['data-spe-settings-step="progression"', '5. Advancement', 'Character Progression'],
      ];
      let previousIndex = -1;
      for (const [step, kicker, title] of sections) {
        const stepIndex = renderSource.indexOf(step);
        assert.ok(stepIndex > previousIndex, `${step} should appear in execution order.`);
        assert.ok(renderSource.indexOf(kicker, stepIndex) > stepIndex, `${kicker} label should be inside ${step}.`);
        assert.ok(renderSource.indexOf(title, stepIndex) > stepIndex, `${title} title should be inside ${step}.`);
        previousIndex = stepIndex;
      }

      const controlIds = [
        'structured_preflight_story_engine_enabled',
        'structured_preflight_use_separate_semantic_settings',
        'structured_preflight_semantic_profile',
        'structured_preflight_semantic_reasoning_effort',
        'structured_preflight_refresh_semantic_settings',
        'structured_preflight_post_tracker_enabled',
        'structured_preflight_prose_guard_enabled',
        'structured_preflight_progression_enabled',
        'structured_preflight_name_style',
        'structured_preflight_writing_style_enabled',
        'structured_preflight_writing_style_drawer',
        'structured_preflight_writing_style_exploration_prompt',
        'structured_preflight_writing_style_action_prompt',
        'structured_preflight_writing_style_intimacy_prompt',
        'structured_preflight_player_setup_status',
        'structured_preflight_show_player_setup',
        'structured_preflight_force_player_setup',
        'structured_preflight_reset_player_setup',
      ];
      for (const id of controlIds) {
        const count = renderSource.split(`id="${id}"`).length - 1;
        assert.equal(count, 1, `${id} should remain present exactly once in the settings markup.`);
      }

      assert.doesNotMatch(renderSource, /id="structured_preflight_tracker_profile"/);
      assert.doesNotMatch(renderSource, /id="structured_preflight_prose_guard_profile"/);
      assert.doesNotMatch(renderSource, /id="structured_preflight_prose_guard_formatting_enabled"/);
      assert.doesNotMatch(renderSource, /id="structured_preflight_prose_guard_formatting_drawer"/);
      assert.doesNotMatch(renderSource, /id="structured_preflight_reset_prose_guard_formatting"/);
      assert.doesNotMatch(renderSource, /id="structured_preflight_prose_guard_formatting_prompt"/);
      assert.doesNotMatch(renderSource, /structured_preflight_writingStyle_placement/);
      assert.doesNotMatch(renderSource, /structured_preflight_writing_style_prompt/);
      assert.match(renderSource, /data-structured-preflight-reset-writing-style="all"/);
      assert.match(renderSource, /data-structured-preflight-reset-writing-style="writingStyleExplorationPrompt"/);
      assert.match(renderSource, /data-structured-preflight-reset-writing-style="writingStyleActionPrompt"/);
      assert.match(renderSource, /data-structured-preflight-reset-writing-style="writingStyleIntimacyPrompt"/);
      assert.doesNotMatch(renderSource, /structured_preflight_writing_style_(?:dialogue|reminder)_prompt/);
      assert.doesNotMatch(renderSource, /data-structured-preflight-reset-writing-style="writingStyle(?:Dialogue|Reminder)Prompt"/);
      assert.match(renderSource, /Injected after Prose Rules as sceneStyleProfile/);
      assert.match(renderSource, /Use private Story Engine connection profile/);
      assert.match(renderSource, /Story Engine profile/);
      assert.match(renderSource, /<option value="low">Low<\/option>/);
      assert.match(renderSource, /<option value="medium">Medium<\/option>/);
      assert.match(renderSource, /<option value="high">High<\/option>/);
      assert.match(renderSource, /Official direct DeepSeek only/);
      assert.match(renderSource, /Used for semantic preflight and post-narration Story Engine utility calls/);
      assert.match(renderSource, /Narration, adventure openings, character creation, and character progression use the current SillyTavern profile/);
      assert.doesNotMatch(renderSource, /id="structured_preflight_disable_semantic_thinking"/);
      assert.doesNotMatch(source, /\bdisableThinkingCheckbox\b/);
      assert.match(source, /delete extension_settings\[SETTINGS_KEY\]\.disableSemanticThinking/);
      assert.doesNotMatch(renderSource, /<hr>/);
    },
  },
  {
    name: '52 master Story Engine switch disables runtime paths without hiding settings',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const settingsSource = source.slice(
        source.indexOf('function renderSettingsPanel()'),
        source.indexOf('function closeExtensionsDrawer()'),
      );
      const runtimeSource = source.slice(
        source.indexOf('function disableStoryEngineRuntime()'),
        source.indexOf('function showProgress'),
      );
      const generationSource = source.slice(
        source.indexOf('globalThis.StructuredPreflightEngines_generationInterceptor'),
        source.indexOf('async function handleChatCompletionPromptReady'),
      );
      const promptReadySource = source.slice(
        source.indexOf('async function handleChatCompletionPromptReady'),
        source.indexOf('async function runSemanticPassWithPromptReadyBypass'),
      );
      const startupSource = source.slice(source.lastIndexOf('subscribeMessageHandler();'));

      assert.match(source, /storyEngineEnabled:\s*true/);
      assert.match(source, /function isStoryEngineEnabled\(\) \{\s*return getSettings\(\)\.storyEngineEnabled !== false;\s*\}/);
      assert.match(settingsSource, /data-spe-settings-step="master"/);
      assert.match(settingsSource, /id="structured_preflight_story_engine_enabled"/);
      assert.match(settingsSource, /Enable Story Engine/);
      assert.match(settingsSource, /When disabled, Story Engine skips semantic preflight, mechanics, narrator handoff, Prose Guard, tracker updates, character progression, and prompt injection/);
      assert.match(settingsSource, /settings\.storyEngineEnabled = Boolean\(event\.target\?\.checked\)/);
      assert.match(settingsSource, /if \(settings\.storyEngineEnabled === false\) \{\s*disableStoryEngineRuntime\(\);/);
      assert.match(settingsSource, /else \{\s*const context = getContext\(\);\s*ensureStreamingArtifactRegex\(\);\s*injectPromptOptionPrompts\(\);/);
      assert.match(settingsSource, /restoreTrackerFromLatestDisplaySnapshot\(context\);\s*cleanVisibleDebugDisplays\(context\);\s*renderAllTrackerDisplayBlocks\(context\);/);
      assert.match(source, /if \(storyEngineCheckbox\) storyEngineCheckbox\.checked = engineEnabled/);
      assert.match(source, /if \(control\) control\.disabled = !engineEnabled/);
      assert.match(source, /Story Engine disabled\./);

      assert.match(runtimeSource, /invalidateStoryEnginePipeline\(\)/);
      const invalidationSource = source.slice(
        source.indexOf('function invalidateStoryEnginePipeline()'),
        source.indexOf('function disableStoryEngineRuntime()'),
      );
      assert.match(invalidationSource, /state\.runEpoch \+= 1/);
      assert.match(invalidationSource, /clearPostNarrationFinalizerTimers\(\)/);
      assert.match(invalidationSource, /clearPendingRunCleanupTimer\(\)/);
      assert.match(invalidationSource, /clearRuntimePrompts\(\)/);
      assert.match(runtimeSource, /clearPromptOptionPrompts\(\)/);
      assert.match(invalidationSource, /setChatInputLocked\(false\)/);
      assert.match(invalidationSource, /releaseProseGuardDisplayIntercept\(\{ restore: true \}\)/);
      assert.match(runtimeSource, /removeStreamingArtifactRegex\(\)/);
      assert.match(runtimeSource, /document\.getElementById\(TRACKER_WIDGET_ID\)\?\.remove\(\)/);
      assert.match(runtimeSource, /document\.getElementById\(PLAYER_SETUP_CARD_ID\)\?\.remove\(\)/);
      assert.match(runtimeSource, /document\.getElementById\(PROGRESSION_CARD_ID\)\?\.remove\(\)/);

      assert.match(source, /function ensureStreamingArtifactRegex\(\) \{\s*if \(!isStoryEngineEnabled\(\)\) \{\s*return removeStreamingArtifactRegex\(\);/);
      assert.match(source, /function injectPromptOptionPrompts\(\) \{\s*if \(!isStoryEngineEnabled\(\)\) \{\s*clearPromptOptionPrompts\(\);/);
      assert.match(source, /function injectWritingStylePrompt\(\)[\s\S]*if \(!isStoryEngineEnabled\(\) \|\| settings\.writingStyleEnabled === false\)/);
      assert.match(source, /function injectProseRulesPrompt\(\)[\s\S]*if \(!isStoryEngineEnabled\(\)\)/);
      assert.match(source, /function getTrackerRoot\(context = getContext\(\)\) \{\s*if \(!isStoryEngineEnabled\(\)\) return null;/);
      assert.match(source, /function getPlayerRoot\(context = getContext\(\)\) \{\s*if \(!isStoryEngineEnabled\(\)\) return null;/);
      assert.match(source, /function getProgressionRoot\(context = getContext\(\)\) \{\s*if \(!isStoryEngineEnabled\(\)\) return null;/);
      assert.match(source, /function progressionPending\(context = getContext\(\)\) \{\s*if \(!isStoryEngineEnabled\(\)\) return false;/);

      assert.match(generationSource, /if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return false;\s*\}/);
      assert.match(promptReadySource, /if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;\s*\}/);
      assert.match(source, /function ensureProseGuardDisplayInterceptor\(\)[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;\s*\}/);
      assert.match(source, /function shouldUseProseGuardDisplayIntercept\(type\)[\s\S]*return isStoryEngineEnabled\(\)/);
      assert.match(source, /function renderTrackerWidget\(context = getContext\(\)\)[\s\S]*if \(!isStoryEngineEnabled\(\) \|\| settings\.postNarrationTrackerEnabled === false\)/);
      assert.match(source, /<span>Show visible tracker<\/span>/);
      assert.match(source, /function renderPlayerSetupCard\(context = getContext\(\)\)[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*existing\?\.remove\(\);\s*return;/);
      assert.match(source, /function renderProgressionCard\(context = getContext\(\)\)[\s\S]*if \(!isStoryEngineEnabled\(\) \|\| getSettings\(\)\.characterProgressionEnabled === false/);
      assert.match(source, /function maybeRecordProgressionAccomplishment[\s\S]*if \(!isStoryEngineEnabled\(\)\) return false;/);
      assert.match(source, /async function finalizePostNarrationMessage[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*clearRuntimePrompts\(\);\s*releaseProseGuardDisplayIntercept\(\{ restore: true, messageId \}\);\s*return;/);
      assert.match(source, /async function requestTargetedProseBanRepair[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*throw new Error\('Story Engine is disabled\.'\);/);
      assert.match(source, /async function requestPostNarrationTrackerDelta[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*throw new Error\('Story Engine is disabled\.'\);/);
      assert.match(source, /async function requestPlayerSetupText[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*throw new Error\('Story Engine is disabled\.'\);/);
      assert.match(source, /async function requestProgressionText[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*throw new Error\('Story Engine is disabled\.'\);/);
      assert.match(source, /async function handlePlayerSetupAction[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;/);
      assert.match(source, /async function handleProgressionAction[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;/);
      assert.match(source, /async function handleMessageDeleted[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);/);
      assert.match(source, /async function handleMessageSwiped[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);/);
      assert.match(source, /function handleChatChanged\(\)[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);/);

      assert.match(startupSource, /onDomReady\(\(\) => \{\s*renderSettingsPanel\(\);\s*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;\s*\}/);
      assert.match(startupSource, /ensureStreamingArtifactRegex\(\);\s*ensureProseGuardDisplayInterceptor\(\);\s*injectPromptOptionPrompts\(\);/);
      assert.match(startupSource, /setTimeout\(\(\) => \{\s*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;/);
    },
  },
  {
    name: '53 metadata and chat persistence routes through st-adapter wrappers',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const runnerSource = fs.readFileSync(new URL('deterministic-runner.js', import.meta.url), 'utf8');
      const adapterSource = fs.readFileSync(new URL('st-adapter.js', import.meta.url), 'utf8');

      assert.match(adapterSource, /export function saveMetadataDebounced\(context = getContext\(\), options = \{\}\)/);
      assert.match(adapterSource, /export async function saveMetadata\(context = getContext\(\)\)/);
      assert.match(adapterSource, /export async function persistMetadata\(context = getContext\(\)\)/);
      assert.match(adapterSource, /export async function saveChat\(context = getContext\(\), options = \{\}\)/);
      assert.match(indexSource, /persistMetadata as persistAdapterMetadata/);
      assert.match(indexSource, /saveChat,\s*\n\s*saveMetadataDebounced,/);
      assert.match(indexSource, /async function persistMetadata\(context = getContext\(\)\) \{\s*return await persistAdapterMetadata\(context\);\s*\}/);
      assert.match(runnerSource, /import \{ persistMetadata, saveMetadataDebounced \} from '\.\/st-adapter\.js';/);
      assert.match(runnerSource, /await persistMetadata\(context\);/);
      assert.match(runnerSource, /saveMetadataDebounced\(context, \{ warn: false \}\);/);
      assert.doesNotMatch(indexSource, /context(?:\?\.)?\.saveMetadata(?:Debounced)?\s*\(/);
      assert.doesNotMatch(indexSource, /context(?:\?\.)?\.saveChat\s*\(/);
      assert.doesNotMatch(runnerSource, /context(?:\?\.)?\.saveMetadata(?:Debounced)?\s*\(/);
      assert.doesNotMatch(runnerSource, /context(?:\?\.)?\.saveChat\s*\(/);
    },
  },
  {
    name: '54 generation requests route through st-adapter wrappers',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const adapterSource = fs.readFileSync(new URL('st-adapter.js', import.meta.url), 'utf8');

      assert.match(adapterSource, /export function canGenerateRawData\(context = getContext\(\)\)/);
      assert.match(adapterSource, /export async function generateRawData\(request = \{\}, context = getContext\(\), options = \{\}\)/);
      assert.match(adapterSource, /export function canGenerate\(context = getContext\(\)\)/);
      assert.match(adapterSource, /export async function generate\(type = 'normal', options = \{\}, dryRun = false, context = getContext\(\)\)/);
      assert.match(indexSource, /generateRawData,/);
      assert.match(indexSource, /generate as generateSillyTavern,/);
      assert.match(indexSource, /generateRawData\(\{ prompt: textPrompt, responseLength, \.\.\.overridePayload \}, context, \{ purpose: 'player setup' \}\)/);
      assert.match(indexSource, /generateRawData\(\{ prompt, responseLength \}, getContext\(\), \{ purpose: 'targeted Prose Guard repair' \}\)/);
      assert.doesNotMatch(indexSource, /purpose: 'Prose Guard'/);
      assert.match(indexSource, /generateRawData\(\{ prompt, responseLength \}, getContext\(\), \{ purpose: 'post-narration tracker update' \}\)/);
      assert.match(semanticSource, /generateRawData\(options, context, \{ purpose: 'semantic preflight' \}\)/);
      assert.doesNotMatch(indexSource, /context(?:\?\.|\.)generateRawData\s*\(/);
      assert.doesNotMatch(semanticSource, /context(?:\?\.|\.)generateRawData\s*\(/);
      assert.doesNotMatch(indexSource, /context(?:\?\.|\.)generate\s*\(/);
    },
  },
  {
    name: '55 event lifecycle routes through st-adapter wrappers',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const adapterSource = fs.readFileSync(new URL('st-adapter.js', import.meta.url), 'utf8');

      assert.match(adapterSource, /export function canSubscribeToEvent\(eventType, context = getContext\(\)\)/);
      assert.match(adapterSource, /export function onEvent\(eventType, handler, context = getContext\(\), options = \{\}\)/);
      assert.match(adapterSource, /export function offEvent\(eventType, handler, context = getContext\(\), options = \{\}\)/);
      assert.match(adapterSource, /export function emitEvent\(eventType, context = getContext\(\), \.\.\.args\)/);
      assert.match(adapterSource, /export function stopGeneration\(context = getContext\(\)\)/);
      assert.match(indexSource, /canSubscribeToEvent\('MESSAGE_RECEIVED', context\)/);
      assert.match(indexSource, /onEvent\(requiredEvent, requiredHandler, context, \{ warn: false \}\)/);
      assert.match(indexSource, /onEvent\(eventType, handler, context, \{ warn: false \}\)/);
      assert.match(indexSource, /offEvent\(eventType, handler, context, \{ warn: false \}\)/);
      assert.match(indexSource, /stopGeneration\(context\)/);
      assert.doesNotMatch(indexSource, /context(?:\?\.|\.)eventSource/);
      assert.doesNotMatch(indexSource, /context(?:\?\.|\.)eventTypes/);
      assert.doesNotMatch(indexSource, /context(?:\?\.|\.)stopGeneration/);
      assert.doesNotMatch(indexSource, /removeEventHandler/);
    },
  },
  {
    name: '56 UI notifications and startup readiness route through st-adapter wrappers',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const adapterSource = fs.readFileSync(new URL('st-adapter.js', import.meta.url), 'utf8');

      assert.match(adapterSource, /export function notifyInfo\(message, title = '', options = \{\}\)/);
      assert.match(adapterSource, /export function notifySuccess\(message, title = '', options = \{\}\)/);
      assert.match(adapterSource, /export function notifyError\(message, title = '', options = \{\}\)/);
      assert.match(adapterSource, /export function clearNotification\(notification\)/);
      assert.match(adapterSource, /export function onDomReady\(callback\)/);
      assert.match(indexSource, /notifyInfo\(message, EXTENSION_NAME, \{ timeOut: 0, extendedTimeOut: 0 \}\)/);
      assert.match(indexSource, /clearNotification\(toast\)/);
      assert.match(indexSource, /notifyError\(message, `\$\{EXTENSION_NAME\}: generation aborted`, \{ timeOut: 15000, extendedTimeOut: 15000 \}\)/);
      assert.match(indexSource, /notifySuccess\('Player sheet inserted into the active persona\.', EXTENSION_NAME, \{ timeOut: 6000 \}\)/);
      assert.match(indexSource, /onDomReady\(\(\) => \{/);
      assert.doesNotMatch(indexSource, /globalThis\.toastr/);
      assert.doesNotMatch(indexSource, /\bjQuery\b/);
    },
  },
  {
    name: '57 absent bound companion stays hidden from narrator handoff',
    run() {
      const report = runCase({
        ledger: baseLedger(),
      });
      const modelPrompt = prompt(report);

      assert.equal(report.finalNarrativeHandoff.boundCompanion, null);
      assert.equal(report.trackerUpdate.boundCompanion.active, false);
      assert.doesNotMatch(modelPrompt, /boundCompanion:/);
      assert.doesNotMatch(modelPrompt, /BOUND COMPANION/);
    },
  },
  {
    name: '58 explicit bound companion delta activates hidden state without inventing visible tracker text',
    run() {
      const report = runCase({
        ledger: baseLedger({
          trackerUpdateEngine: {
            boundCompanion: {
              status: 'active',
              name: 'Surel',
              type: 'shared_vessel',
              vessel: '{{user}}',
              voice: 'dry, precise, faintly amused',
              evidence: 'The pact is accepted and Surel now shares the vessel.',
            },
          },
        }),
      });
      const handoff = report.finalNarrativeHandoff.boundCompanion;
      const modelPrompt = prompt(report);

      assert.equal(report.trackerUpdate.boundCompanion.active, true);
      assert.equal(report.trackerUpdate.boundCompanion.name, 'Surel');
      assert.equal(handoff.mode, 'silence');
      assert.match(modelPrompt, /Surel: BOUND COMPANION SILENCE/);
      assert.match(modelPrompt, /does NOT initiate dialogue this beat/);
    },
  },
  {
    name: '59 directly addressing active bound companion allows a private response',
    run() {
      const report = runCase({
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Ask Surel what she thinks about the room.',
            explicitMeans: 'I ask Surel, "What do you make of this place?"',
            actionUnits: [
              {
                id: 'A1',
                action: 'I ask Surel, "What do you make of this place?"',
                evidence: 'directly addressed Surel',
              },
            ],
          },
        }),
        cardFields: {
          boundCompanion: {
            active: true,
            name: 'Surel',
            type: 'shared_vessel',
            vessel: '{{user}}',
            voice: 'dry, precise',
            evidence: 'established shared vessel companion',
          },
        },
      });
      const handoff = report.finalNarrativeHandoff.boundCompanion;
      const modelPrompt = prompt(report);

      assert.equal(handoff.mode, 'direct_response');
      assert.deepEqual(handoff.triggers, ['direct_address']);
      assert.match(modelPrompt, /Surel: DIRECT RESPONSE ALLOWED/);
      assert.match(modelPrompt, /Keep it distinct from \{\{user\}\}/);
    },
  },
  {
    name: '60 active bound companion can make a gated unsolicited interjection on safe triggers',
    run() {
      const randoms = Array.from({ length: 80 }, () => 0.01);
      const report = runCaseWithRandoms({
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Face a hostile raider in the temple.',
            explicitMeans: 'I watch the hostile raider raise his blade.',
            activeHostileThreat: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            socialTactic: 'none',
            identifyTargets: {
              hostilesInScene: { NPC: ['Raider'] },
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: ['Raider'],
              PowerActors: [],
            },
          },
        }),
        tracker: {
          Raider: trackerEntry(),
        },
        cardFields: {
          boundCompanion: {
            active: true,
            name: 'Surel',
            type: 'shared_vessel',
            vessel: '{{user}}',
            voice: 'dry, precise',
            evidence: 'established shared vessel companion',
          },
        },
        rapportClock: { activeMs: 45 * 60 * 1000, lastActivityAt: Date.now() },
      }, randoms);
      const handoff = report.finalNarrativeHandoff.boundCompanion;
      const modelPrompt = prompt(report);

      assert.equal(handoff.mode, 'interjection');
      assert.equal(handoff.triggers.includes('danger_or_combat'), true);
      assert.equal(report.trackerUpdate.boundCompanion.lastInterjectionAtActiveMs >= 45 * 60 * 1000, true);
      assert.match(modelPrompt, /Surel: ONE UNSOLICITED PRIVATE INTERJECTION ALLOWED/);
      assert.match(modelPrompt, /established visible facts only/);
    },
  },
  {
    name: '61 dead actors ignore ordinary damage healing and recovery',
    run() {
      const dead = {
        seed: 'dead-invariant-test',
        npcs: {
          Guard: {
            actorType: 'npc',
            maxHp: 10,
            currentHp: 0,
            dead: true,
            nonlethalDefeat: false,
            defeatedCondition: 'dead',
          },
        },
      };
      const after = applyHiddenHealthEvents(dead, [
        { kind: 'damage', targetType: 'npc', target: 'Guard', amount: 3, nonlethal: true },
        { kind: 'heal', targetType: 'npc', target: 'Guard', amount: 10 },
        { kind: 'recovery', targetType: 'npc', target: 'Guard', amount: 10 },
      ]);

      assert.equal(after.npcs.Guard.dead, true);
      assert.equal(after.npcs.Guard.currentHp, 0);
      assert.equal(after.npcs.Guard.nonlethalDefeat, false);
      assert.equal(after.npcs.Guard.defeatedCondition, 'dead');
    },
  },
  {
    name: '61a dead tracker targets are excluded from living resolution targets',
    run() {
      const report = runCase({
        userText: 'I strike the dead guard with my sword.',
        tracker: {
          Guard: trackerEntry({ condition: 'dead' }),
        },
        cardFields: {
          health: {
            seed: 'dead-target-test',
            npcs: {
              Guard: { maxHp: 10, currentHp: 0, dead: true, defeatedCondition: 'dead' },
            },
          },
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'strike the dead guard',
            identifyChallenge: 'sword strike against Guard',
            explicitMeans: 'strike Guard with a sword',
            rollNeeded: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            harmMode: 'lethal',
            identifyTargets: {
              ActionTargets: ['Guard'],
              OppTargets: { NPC: ['Guard'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: [],
            },
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.ActionTargets.includes('Guard'), false);
      assert.equal(packet.OppTargets.NPC.includes('Guard'), false);
    },
  },
  {
    name: '62 character sheets require exact structure stats selected race and Isekai premise',
    run() {
      const stats = { PHY: 8, MND: 7, CHA: 9 };
      const valid = validCharacterSheet({ stats, race: 'Half-Elf' });
      assert.equal(assertValidCharacterSheet(valid, { stats, expectedRace: 'Half-Elf', genre: 'Isekai' }), valid);
      assert.equal(assertValidCharacterSheet(valid, { stats, genre: 'Isekai', requireNumericAge: true }), valid);
      assert.throws(
        () => assertValidCharacterSheet(valid.replace('**Age:** 18', '**Age:** Young adult'), { stats, genre: 'Isekai', requireNumericAge: true }),
        /numeric Age entry/,
      );

      const reversed = valid.split(/\n\n(?=# )/).reverse().join('\n\n');
      assert.throws(() => assertValidCharacterSheet(reversed, { stats }), /out of order/);
      assert.throws(() => assertValidCharacterSheet(`Here is the character sheet:\n${valid}`, { stats }), /content appears before # BASIC INFO/);
      const emptySpells = valid.replace(/# SPELLS\n[\s\S]*?(?=\n\n# INVENTORY)/, '# SPELLS');
      assert.throws(() => assertValidCharacterSheet(emptySpells, { stats }), /# SPELLS is empty/);
      const wrongStats = valid.replace('**MND:** 7', '**MND:** 6');
      assert.throws(() => assertValidCharacterSheet(wrongStats, { stats }), /MND: 7/);
      assert.throws(() => assertValidCharacterSheet(valid, { stats, expectedRace: 'Dwarf' }), /selected race "Dwarf"/);
      const noIsekaiPremise = valid.replace('The character died on Earth and was reincarnated in another world.', 'The character trained as a village guard.');
      assert.throws(() => assertValidCharacterSheet(noIsekaiPremise, { stats, genre: 'Isekai' }), /ended Earth life/);

      for (const premise of [
        'The character lost their life on Earth and was reincarnated in another world.',
        'The character passed away on Earth and was reborn in another world.',
        "The character's final moments on Earth ended before awakening in a new world.",
      ]) {
        const paraphrased = valid.replace('The character died on Earth and was reincarnated in another world.', premise);
        assert.equal(assertValidCharacterSheet(paraphrased, { stats, genre: 'Isekai' }), paraphrased);
      }
    },
  },
  {
    name: '62a generated sheets are validated again immediately before persona mutation',
    run() {
      const source = fs.readFileSync(extensionFile('index.js'), 'utf8');
      const approval = source.slice(source.indexOf('async function approvePlayerSheet'), source.indexOf('async function applyProgressionStatChoice'));
      assert.match(source, /validatePlayerCreatorSheet\(sheetText, creator\);\s*return sheetText;/);
      assert.match(approval, /validatePlayerCreatorSheet\(sheetText, creator\);\s*\n\s*const personaWrite = await writePlayerSheetToPersona/);
      assert.match(source, /Age as one integer/);
      assert.match(source, /requireNumericAge: creator\.flow === 'new' && genre === 'Isekai'/);
    },
  },
  {
    name: '62b character-sheet generation uses strict structured data and deterministic rendering',
    run() {
      const stats = { PHY: 9, MND: 7, CHA: 8 };
      const options = {
        mode: 'new',
        stats,
        fixedRace: 'Half-Elf',
        fixedUserNonHuman: 'Y',
        genre: 'Isekai',
        explicitAnchorSource: 'The character is the secret heir to the fallen House Valen.',
        explicitAppearanceSource: '',
      };
      const schema = buildCharacterSheetSchema(options);
      const fantasyProfile = getCharacterSheetPowerProfile('Fantasy');
      assert.strictEqual(getCharacterSheetPowerProfile('Isekai'), fantasyProfile);
      assert.match(fantasyProfile.ability, /simple, unmistakably supernatural fantasy power/);
      assert.match(fantasyProfile.spell, /unmistakably magical in both name and effect/);
      assert.match(fantasyProfile.ability, /never scientific, clinical, technological, bureaucratic, pseudo-technical, or game-system framing/);
      assert.equal(fantasyProfile.grounded, false);
      assert.equal(getCharacterSheetPowerProfile('Modern').grounded, true);
      assert.equal(getCharacterSheetPowerProfile('Slice of Life').grounded, true);
      assert.equal(getCharacterSheetPowerProfile('Historical').grounded, true);
      assert.match(getCharacterSheetPowerProfile('Modern').abilityContract, /signature technique grounded in exceptional training/);
      assert.match(getCharacterSheetPowerProfile('Fantasy').abilityContract, /qualitatively new capability/);
      for (const genre of [
        'Fantasy',
        'Sci-fi',
        'Modern',
        'Slice of Life',
        'Isekai',
        'Urban Fantasy',
        'Cyberpunk',
        'Post-Apocalyptic',
        'Horror',
        'Supernatural',
        'Superhero',
        'Steampunk',
        'Historical',
        'Wuxia / Xianxia',
      ]) {
        const profile = getCharacterSheetPowerProfile(genre);
        assert.ok(profile.ability.length > 40, `${genre} needs an explicit ability profile.`);
        assert.ok(profile.spell.length > 40, `${genre} needs an explicit spell profile.`);
      }
      assert.notStrictEqual(getCharacterSheetPowerProfile('Sci-fi'), fantasyProfile);
      assert.deepEqual(schema.properties.basicInfo.properties.race.enum, ['Half-Elf']);
      assert.deepEqual(schema.properties.basicInfo.properties.userNonHuman.enum, ['Y']);
      assert.equal(schema.properties.abilities.minItems, 1);
      assert.equal(schema.properties.abilities.maxItems, 1);
      assert.match(schema.properties.abilities.description, /unmistakably supernatural fantasy power/);
      assert.equal(schema.properties.spells.minItems, 1);
      assert.equal(schema.properties.spells.maxItems, 1);
      assert.match(schema.properties.spells.description, /unmistakably magical in both name and effect/);
      assert.equal(schema.properties.characterAnchors.minItems, 0);
      assert.equal(schema.properties.characterAnchors.maxItems, 3);
      assert.match(schema.properties.appearance.description, /Do not include scars, tattoos, birthmarks, brands, or other permanent marks/);
      assert.equal(buildCharacterSheetJsonSchema(options).strict, true);

      const deepSeekTool = buildCharacterSheetTool('deepseek', options);
      assert.equal(deepSeekTool.function.strict, true);
      assert.equal('minItems' in deepSeekTool.function.parameters.properties.abilities, false);
      assert.equal('maxItems' in deepSeekTool.function.parameters.properties.abilities, false);
      assert.equal(deepSeekTool.function.parameters.additionalProperties, false);
      assert.equal(buildCharacterSheetToolChoice('deepseek'), undefined);
      assert.deepEqual(buildCharacterSheetToolChoice('openai'), {
        type: 'function',
        function: { name: 'submit_character_sheet' },
      });

      const payload = structuredCharacterSheetPayload();
      const raw = {
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'submit_character_sheet',
                arguments: JSON.stringify(payload),
              },
            }],
          },
        }],
      };
      assert.deepEqual(extractCharacterSheetToolPayload(raw), payload);
      assert.deepEqual(parseCharacterSheetJsonPayload(JSON.stringify(payload)), payload);
      assert.throws(() => parseCharacterSheetJsonPayload(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``), /not valid object JSON/);
      let missingToolError;
      assert.throws(() => extractCharacterSheetToolPayload({ choices: [{ message: { content: '# BASIC INFO' } }] }), error => {
        missingToolError = error;
        return /did not call submit_character_sheet/.test(error.message);
      });
      assert.equal(shouldRetryCharacterSheetToolFailure(missingToolError), true);
      assert.equal(shouldRetryCharacterSheetToolFailure({
        name: 'StoryEngineSTAdapterTransportError',
        stage: 'response',
        status: 400,
        body: 'This provider does not support tools.',
      }), true);
      assert.equal(shouldRetryCharacterSheetToolFailure({
        name: 'StoryEngineSTAdapterTransportError',
        stage: 'response',
        status: 500,
        body: 'Upstream provider reports that function calling is unsupported.',
      }), true);
      assert.equal(shouldRetryCharacterSheetToolFailure({
        name: 'StoryEngineSTAdapterTransportError',
        stage: 'response',
        status: 500,
        body: 'Internal server error.',
      }), false);
      assert.equal(shouldRetryCharacterSheetToolFailure({
        name: 'StoryEngineSTAdapterTransportError',
        stage: 'response',
        status: 401,
        body: 'Invalid API key.',
      }), false);
      assert.equal(shouldRetryCharacterSheetToolFailure({
        name: 'StoryEngineSTAdapterTransportError',
        stage: 'response',
        status: 429,
        body: 'Rate limit exceeded.',
      }), false);
      assert.equal(shouldRetryCharacterSheetToolFailure({
        name: 'StoryEngineSTAdapterTransportError',
        stage: 'fetch',
        body: 'Network request failed.',
      }), false);

      const normalized = normalizeCharacterSheetPayload(payload, options);
      assert.equal(normalized.basicInfo.race, 'Half-Elf');
      assert.equal(normalized.basicInfo.userNonHuman, 'Y');
      const wrongSelectedClassification = structuredCharacterSheetPayload({ basicInfo: { userNonHuman: 'N' } });
      assert.equal(normalizeCharacterSheetPayload(wrongSelectedClassification, options).basicInfo.userNonHuman, 'Y');
      const rendered = renderCharacterSheet(payload, options);
      assert.equal((rendered.match(/^# /gm) || []).length, CHARACTER_SHEET_HEADINGS.length);
      assert.match(rendered, /^# BASIC INFO\n\*\*Name:\*\* \{\{user\}\}/);
      assert.match(rendered, /\*\*Race:\*\* Half-Elf/);
      assert.match(rendered, /\*\*PHY:\*\* 9/);
      assert.match(rendered, /The character died on Earth and was reincarnated in another world\./);
      assert.equal(assertValidCharacterSheet(rendered, { stats, expectedRace: 'Half-Elf', genre: 'Isekai', requireNumericAge: true }), rendered);

      const noGeneratedAnchorsPayload = structuredCharacterSheetPayload({ characterAnchors: [] });
      assert.deepEqual(normalizeCharacterSheetPayload(noGeneratedAnchorsPayload, options).characterAnchors, []);
      const noGeneratedAnchorsRendered = renderCharacterSheet(noGeneratedAnchorsPayload, options);
      assert.equal((noGeneratedAnchorsRendered.match(/The character died on Earth and was reincarnated in another world\./g) || []).length, 1);
      const anchorsDisabledOptions = { ...options, explicitAnchorSource: '' };
      assert.equal(buildCharacterSheetSchema(anchorsDisabledOptions).properties.characterAnchors.maxItems, 0);
      assert.match(buildCharacterSheetSchema(anchorsDisabledOptions).properties.characterAnchors.description, /Must be empty because the user supplied no custom facts/);
      assert.deepEqual(normalizeCharacterSheetPayload(payload, anchorsDisabledOptions).characterAnchors, []);
      const anchorsDisabledRendered = renderCharacterSheet(payload, anchorsDisabledOptions);
      assert.equal((anchorsDisabledRendered.match(/The character died on Earth and was reincarnated in another world\./g) || []).length, 1);
      assert.doesNotMatch(anchorsDisabledRendered, /Worked as a courier before the adventure began/);
      assert.throws(
        () => normalizeCharacterSheetPayload(structuredCharacterSheetPayload({ characterAnchors: ['One', 'Two', 'Three', 'Four'] }), options),
        /characterAnchors may contain at most 3 entries/,
      );

      const groundedAnchor = 'The character is the secret heir to the fallen House Valen.';
      const groundedAnchorPayload = structuredCharacterSheetPayload({ characterAnchors: [groundedAnchor] });
      assert.deepEqual(normalizeCharacterSheetPayload(groundedAnchorPayload, options).characterAnchors, [groundedAnchor]);
      const inventedAnchorPayload = structuredCharacterSheetPayload({ characterAnchors: ['A royal assassin is hunting the character.'] });
      assert.deepEqual(normalizeCharacterSheetPayload(inventedAnchorPayload, options).characterAnchors, []);
      const duplicateAnchorOptions = { ...options, explicitAnchorSource: 'The character has broad shoulders and an athletic build.' };
      const duplicateAnchorPayload = structuredCharacterSheetPayload({ characterAnchors: ['Broad-shouldered and athletic.'] });
      assert.deepEqual(normalizeCharacterSheetPayload(duplicateAnchorPayload, duplicateAnchorOptions).characterAnchors, []);

      const unrequestedScarPayload = structuredCharacterSheetPayload({
        appearance: [
          { label: 'Build', detail: 'Broad-shouldered and athletic' },
          { label: 'Scar', detail: 'A pale scar crosses the left cheek' },
        ],
      });
      assert.deepEqual(normalizeCharacterSheetPayload(unrequestedScarPayload, options).appearance, [
        { label: 'Build', detail: 'Broad-shouldered and athletic' },
      ]);
      const requestedScarOptions = { ...options, explicitAppearanceSource: 'A pale scar crosses the left cheek.' };
      assert.match(buildCharacterSheetSchema(requestedScarOptions).properties.appearance.description, /Preserve only scars or other permanent marks explicitly supplied by the user/);
      assert.equal(normalizeCharacterSheetPayload(unrequestedScarPayload, requestedScarOptions).appearance.length, 2);

      const randomOptions = { mode: 'new', stats, fixedRace: '', fixedUserNonHuman: '', genre: 'Fantasy' };
      assert.deepEqual(buildCharacterSheetSchema(randomOptions).properties.basicInfo.properties.userNonHuman.enum, ['Y', 'N']);
      const unspecifiedRandomRace = structuredCharacterSheetPayload({
        basicInfo: { race: 'Vampire', userNonHuman: 'Not specified' },
      });
      assert.throws(() => normalizeCharacterSheetPayload(unspecifiedRandomRace, randomOptions), /must be one of: Y, N/);

      const customHumanOptions = { mode: 'new', stats, fixedRace: 'Terran', fixedUserNonHuman: '', genre: 'Sci-fi' };
      const customHumanPayload = structuredCharacterSheetPayload({
        basicInfo: { race: 'Terran', userNonHuman: 'N' },
      });
      assert.equal(normalizeCharacterSheetPayload(customHumanPayload, customHumanOptions).basicInfo.userNonHuman, 'N');

      const lowMindOptions = { mode: 'new', stats: { PHY: 9, MND: 6, CHA: 9 }, fixedRace: 'Human', fixedUserNonHuman: 'N', genre: 'Modern' };
      assert.equal(buildCharacterSheetSchema(lowMindOptions).properties.spells.maxItems, 0);
      assert.throws(() => normalizeCharacterSheetPayload(payload, lowMindOptions), /spells must contain exactly 0 entries/);
      const noSpellPayload = structuredCharacterSheetPayload({ spells: [] });
      assert.equal(normalizeCharacterSheetPayload(noSpellPayload, lowMindOptions).basicInfo.userNonHuman, 'N');

      const existingPayload = structuredCharacterSheetPayload({
        basicInfo: { age: 'Several centuries', race: 'Vampire' },
        abilities: [
          { name: 'Mist Form', description: 'Turns the body into mist.' },
          { name: 'Night Step', description: 'Crosses one patch of darkness instantly.' },
        ],
        spells: Array.from({ length: 5 }, (_, index) => ({ name: `Spell ${index + 1}`, description: 'An explicit persona spell.' })),
      });
      const existing = normalizeCharacterSheetPayload(existingPayload, { mode: 'existing', stats });
      assert.equal(existing.abilities.length, 2);
      assert.equal(existing.spells.length, 5);
      const existingSchema = buildCharacterSheetSchema({ mode: 'existing', stats });
      assert.deepEqual(existingSchema.properties.basicInfo.properties.userNonHuman.enum, ['Y', 'N', 'Not specified']);
      assert.equal(existingSchema.properties.characterAnchors.maxItems, 48);

      const toolPrompt = appendCharacterSheetOutputInstruction([{ role: 'user', content: 'Build it.' }], 'tool');
      assert.match(toolPrompt.at(-1).content, /Call submit_character_sheet exactly once/);
      const jsonPrompt = appendCharacterSheetOutputInstruction([{ role: 'user', content: 'Build it.' }], 'json', schema);
      assert.match(jsonPrompt.at(-1).content, /CHARACTER-SHEET JSON SCHEMA/);
      assert.match(jsonPrompt.at(-1).content, /"basicInfo"/);
    },
  },
  {
    name: '62c character-sheet wiring uses the active narrator transport with one structured retry',
    run() {
      const source = fs.readFileSync(extensionFile('index.js'), 'utf8');
      const adapterSource = fs.readFileSync(extensionFile('st-adapter.js'), 'utf8');
      const generationSource = fs.readFileSync(extensionFile('character-sheet-generation.js'), 'utf8');
      const requestBlock = source.slice(
        source.indexOf('async function requestPlayerSetupStructured'),
        source.indexOf('function summarizePlayerSetupError'),
      );
      assert.match(source, /sendDefaultChatCompletionToolRequest/);
      assert.match(source, /String\(context\.mainApi \|\| ''\)\.toLowerCase\(\) === 'openai'/);
      assert.match(source, /buildTool: source => buildCharacterSheetTool\(source, generationOptions\)/);
      assert.match(source, /buildToolChoice: buildCharacterSheetToolChoice/);
      assert.match(source, /preparePayload: applyStoryEngineThinkingDisabledPayload/);
      assert.match(source, /generateRawData\(\{[\s\S]*?jsonSchema/);
      assert.match(source, /retrying once with JSON schema/);
      assert.match(requestBlock, /const runStructuredModelRequest = callback => withStoryEngineModelRequest\(callback, modelRequestOptions\)/);
      assert.equal((requestBlock.match(/await runStructuredModelRequest\(/g) || []).length, 2);
      assert.match(requestBlock, /assertStoryEngineModelRequestCurrent\(modelRequestOptions\);\s*if \(!shouldRetryCharacterSheetToolFailure\(error\)\)/);
      assert.doesNotMatch(source, /sanitizeGeneratedSheet/);
      assert.doesNotMatch(source, /Return only the finished character sheet in markdown/);
      assert.match(adapterSource, /purpose = String\(options\?\.purpose \|\| 'semantic tool call'\)/);
      assert.match(adapterSource, /Number\(options\?\.temperature\)/);
      assert.match(generationSource, /\*\*Name:\*\* \{\{user\}\}/);
      assert.match(generationSource, /\['BASIC INFO', basicLines\.join\('\\n'\)\]/);
      assert.match(generationSource, /\['STATS', `\*\*PHY:\*\* \$\{stats\.PHY\}/);
    },
  },
  {
    name: '63 pending boundary IDs reject mismatches and preserve valid renewals',
    run() {
      const active = normalizePendingBoundaryState({
        active: true,
        boundaryId: 'pb_test_active',
        targetNPC: 'Alice',
        type: 'object_access',
        objectOrAccess: 'Alice phone',
        evidence: 'Give my phone back.',
        warnings: 1,
      });
      const rejectedRenewal = applyPendingBoundaryDelta(active, {
        status: 'set',
        boundaryId: 'pb_model_mismatch',
        targetNPC: 'Alice',
        type: 'object_access',
        objectOrAccess: 'Alice phone',
        evidence: 'Alice repeats that the device must be returned.',
      });
      assert.deepEqual(rejectedRenewal, active);

      const renewed = applyPendingBoundaryDelta(active, {
        status: 'set',
        boundaryId: 'pb_test_active',
        targetNPC: 'Alice',
        type: 'object_access',
        objectOrAccess: 'Alice phone',
        evidence: 'Alice repeats that the device must be returned.',
      });
      assert.equal(renewed.boundaryId, 'pb_test_active');
      assert.equal(renewed.objectOrAccess, 'Alice phone');
      assert.equal(renewed.warnings, 2);
      assert.match(renewed.evidence, /repeats/);
      assert.deepEqual(applyPendingBoundaryDelta(active, {
        status: 'set',
        targetNPC: 'Alice',
        type: 'object_access',
        objectOrAccess: 'Alice phone',
        evidence: 'Alice repeats the request without an ID.',
      }), active);

      const legacyBoundary = {
        active: true,
        targetNPC: 'Alice',
        type: 'object_access',
        objectOrAccess: 'Alice phone',
        evidence: 'Give my phone back.',
      };
      const firstLegacyRead = normalizePendingBoundaryState(legacyBoundary);
      const secondLegacyRead = normalizePendingBoundaryState(legacyBoundary);
      assert.match(firstLegacyRead.boundaryId, /^pb_legacy_/);
      assert.equal(secondLegacyRead.boundaryId, firstLegacyRead.boundaryId);

      const differentObject = applyPendingBoundaryDelta(active, {
        status: 'set',
        boundaryId: 'pb_model_reused',
        targetNPC: 'Alice',
        type: 'object_access',
        objectOrAccess: 'Alice laptop',
        evidence: 'Alice says to leave her laptop alone.',
      });
      assert.notEqual(differentObject.boundaryId, active.boundaryId);
      assert.equal(differentObject.objectOrAccess, 'Alice laptop');
      assert.equal(differentObject.warnings, 1);

      const malformed = applyPendingBoundaryDelta({}, {
        status: 'set',
        targetNPC: '(none)',
        type: 'none',
        evidence: '(none)',
      });
      assert.equal(malformed.active, false);
      assert.equal(applyPendingBoundaryDelta(active, { status: 'clear', boundaryId: 'pb_wrong' }).active, true);
      assert.equal(applyPendingBoundaryDelta(active, { status: 'clear', boundaryId: 'pb_test_active' }).active, false);
    },
  },
  {
    name: '63a semantic boundary breaks require matching ID target and type',
    run() {
      const variants = [
        { boundaryId: 'pb_wrong', targetNPC: 'Alice', type: 'object_access' },
        { boundaryId: 'pb_test_active', targetNPC: 'Mira', type: 'object_access' },
        { boundaryId: 'pb_test_active', targetNPC: 'Alice', type: 'departure' },
      ];
      for (const variant of variants) {
        const report = runCase({
          userText: "I keep Alice's phone after she asks for it back.",
          tracker: { Alice: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) },
          cardFields: {
            pendingBoundary: {
              active: true,
              boundaryId: 'pb_test_active',
              targetNPC: 'Alice',
              type: 'object_access',
              objectOrAccess: 'Alice phone',
              evidence: 'Give my phone back.',
              warnings: 1,
            },
          },
          ledger: baseLedger({
            resolutionEngine: {
              identifyGoal: 'keep the phone',
              identifyChallenge: 'keep the phone after a return request',
              explicitMeans: 'keep using the phone',
              rollNeeded: true,
              challengeType: 'environment',
              challengeTypeEvidence: 'test fixture',
              boundaryPressure: {
                present: true,
                type: 'object_access',
                targetNPC: 'Alice',
                objectOrAccess: 'Alice phone',
                evidence: 'keep the phone',
              },
              boundaryBreak: {
                present: true,
                ...variant,
                response: 'continued',
                evidence: 'continued after the return request',
              },
              identifyTargets: {
                ActionTargets: ['Alice'],
                OppTargets: { NPC: ['Alice'], ENV: [] },
                BenefitedObservers: [],
                HarmedObservers: [],
              },
            },
            relationshipEngine: [relationship('Alice')],
          }),
        });
        assert.equal(report.finalNarrativeHandoff.resolutionPacket.boundaryBreak.Present, 'N');
      }
    },
  },
  {
    name: '63b message deletion restoration includes pending boundary state',
    run() {
      const source = fs.readFileSync(extensionFile('index.js'), 'utf8');
      assert.match(source, /beforePendingBoundary: clone\(pendingRun\.pendingBoundaryBefore \|\| \{\}\)/);
      assert.match(source, /beforePendingBoundary: snapshot\.beforePendingBoundary/);
      assert.match(source, /root\.pendingBoundary = normalizePendingBoundaryState\(restoreCandidate\.beforePendingBoundary/);
    },
  },
  {
    name: '64 unestablished scene defaults stay unknown and only intros may establish explicit weather',
    run() {
      const initial = normalizeWorldState({});
      const display = formatWorldStateForDisplay(initial);
      assert.equal(display.indoors, 'Unknown');
      assert.equal(display.timeOfDay, 'Unknown');
      assert.equal(display.weather, 'Unknown');

      const ordinary = applyWorldStateDelta(initial, { weatherCondition: 'storm' }, { allowExplicitWeather: false });
      assert.equal(ordinary.weather.condition, 'clear');
      assert.equal(ordinary.weatherEstablished, false);

      const relocated = applyWorldStateDelta(initial, { place: 'Guild Hall', weatherTick: 'auto' });
      assert.equal(relocated.weather.condition, 'clear');
      assert.equal(relocated.weatherEstablished, false);

      const intro = applyWorldStateDelta(initial, { weatherCondition: 'storm', weatherTick: 'tick' }, {
        adventureIntro: true,
        allowExplicitWeather: true,
      });
      assert.equal(intro.weather.condition, 'storm');
      assert.equal(intro.weatherEstablished, true);
    },
  },
  {
    name: '65 first bound companion interjection at active time zero starts cooldown',
    run() {
      const companion = {
        active: true,
        name: 'Surel',
        type: 'shared_vessel',
        vessel: '{{user}}',
        evidence: 'established shared vessel companion',
      };
      const config = {
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'face the raider',
            identifyChallenge: 'hostile raider threat',
            explicitMeans: 'watch the raider raise a blade',
            activeHostileThreat: true,
            challengeType: 'mundane_combat',
            challengeTypeEvidence: 'test fixture',
            identifyTargets: {
              hostilesInScene: { NPC: ['Raider'] },
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: ['Raider'],
            },
          },
        }),
        tracker: { Raider: trackerEntry() },
        cardFields: { boundCompanion: companion },
        rapportClock: { activeMs: 0, lastActivityAt: 0 },
      };
      const first = runCaseWithRandoms(config, Array.from({ length: 80 }, () => 0.01));
      assert.equal(first.finalNarrativeHandoff.boundCompanion.mode, 'interjection');
      assert.equal(first.trackerUpdate.boundCompanion.hasInterjected, true);
      assert.equal(first.trackerUpdate.boundCompanion.lastInterjectionAtActiveMs, 0);

      const second = runCaseWithRandoms({
        ...config,
        cardFields: { boundCompanion: first.trackerUpdate.boundCompanion },
      }, Array.from({ length: 80 }, () => 0.01));
      assert.equal(second.finalNarrativeHandoff.boundCompanion.mode, 'silence');
      assert.match(second.finalNarrativeHandoff.boundCompanion.reason, /cooldown/);
    },
  },
  {
    name: '65a existing aware NPCs do not repeatedly trigger bound companion commentary',
    run() {
      const report = runCaseWithRandoms({
        userText: 'I nod to Alice during the ordinary conversation.',
        tracker: { Alice: trackerEntry() },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'acknowledge Alice',
            identifyChallenge: 'ordinary conversation',
            explicitMeans: 'nod to Alice',
            rollNeeded: false,
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: ['Alice'],
            },
          },
          relationshipEngine: [relationship('Alice')],
        }),
        cardFields: {
          boundCompanion: {
            active: true,
            name: 'Surel',
            type: 'shared_vessel',
            vessel: '{{user}}',
            evidence: 'established shared vessel companion',
          },
        },
      }, Array.from({ length: 80 }, () => 0.01));
      assert.equal(report.finalNarrativeHandoff.boundCompanion.mode, 'silence');
      assert.deepEqual(report.finalNarrativeHandoff.boundCompanion.triggers, []);
      assert.match(report.finalNarrativeHandoff.boundCompanion.reason, /No safe scene trigger/);
    },
  },
  {
    name: '66 every DEF reference in an engine prompt resolves within that engine',
    run() {
      const blocks = ENGINE_PROMPT_TEXT.split(/^function /m).slice(1);
      for (const block of blocks) {
        const engineName = block.match(/^(\w+)/)?.[1] || '(unknown)';
        const defBody = block.match(/const DEF = Object\.freeze\(\{([\s\S]*?)\n\s*\}\);/)?.[1] || '';
        const defined = new Set([...defBody.matchAll(/^\s{4}([A-Z_]+):/gm)].map(match => match[1]));
        const referenced = [...block.matchAll(/DEF\.([A-Z_]+)/g)].map(match => match[1]);
        for (const key of referenced) {
          assert.equal(defined.has(key), true, `${engineName} references unresolved DEF.${key}`);
        }
      }
    },
  },
  {
    name: '67 async lifecycle invalidation guards stale run and chat work',
    run() {
      const source = fs.readFileSync(extensionFile('index.js'), 'utf8');
      assert.match(source, /runEpoch: 0/);
      assert.match(source, /function createStoryEngineEpochIdentity[\s\S]*runEpoch: state\.runEpoch[\s\S]*chatId: String\(getChatId\(context\)[\s\S]*personaId: String\(getActiveUserAvatar\(\)/);
      assert.match(source, /function isCurrentStoryEngineEpoch[\s\S]*expectedPersonaId[\s\S]*getActiveUserAvatar\(\)/);
      assert.match(source, /function invalidateStoryEnginePipeline\(\) \{[\s\S]*state\.runEpoch \+= 1[\s\S]*state\.pendingGeneration = null/);
      assert.match(source, /function handleGenerationLifecycleStart[\s\S]*if \(dryRun === true\) return;[\s\S]*state\.generationActive = isStoryEngineEnabled\(\)/);
      assert.match(source, /\['GENERATION_STARTED', handleGenerationLifecycleStart\]/);
      assert.match(source, /function handleChatChanged[\s\S]*generationActive = state\.generationActive[\s\S]*invalidateStoryEnginePipeline\(\)[\s\S]*abortActiveGeneration\(context\)/);
      assert.match(source, /function handlePersonaChanged[\s\S]*generationActive = state\.generationActive[\s\S]*invalidateStoryEnginePipeline\(\)[\s\S]*abortActiveGeneration\(context\)[\s\S]*createStoryEngineEpochIdentity\(context\)[\s\S]*isCurrentStoryEngineEpoch\(renderIdentity, context\)/);
      assert.match(source, /\['PERSONA_CHANGED', handlePersonaChanged\]/);
      assert.match(source, /function handleGenerationLifecycleStopped[\s\S]*cancelStoryEnginePipeline/);
      assert.match(source, /function disableStoryEngineRuntime[\s\S]*generationActive = state\.generationActive[\s\S]*invalidateStoryEnginePipeline\(\)[\s\S]*abortActiveGeneration\(context\)/);
      assert.match(source, /export function onDisable\(\) \{[\s\S]*disableStoryEngineRuntime\(\)/);
      assert.match(source, /const cleanupIdentity = \{\s*runEpoch: pendingRun\.runEpoch,\s*chatId: pendingRun\.chatId,\s*personaId: pendingRun\.personaId,/);
      assert.match(source, /if \(!isCurrentStoryEngineRun\(runIdentity, context\)\) return/);
      assert.match(source, /function isPostNarrationFinalizerCurrent[\s\S]*isCurrentStoryEngineEpoch\(captured, context\)/);
      assert.match(source, /if \(!isPostNarrationFinalizerCurrent\(context, messageId, messageKey, captured\)\) return/);
      assert.doesNotMatch(source, /if \(!isPostNarrationFinalizerCurrent\(context, messageId, messageKey, captured\)\) \{\s*clearRuntimePrompts\(\)/);
      assert.match(source, /semanticStopController\.claim\(stopOwnerId, SEMANTIC_PREFLIGHT_STOP_SENTINEL\)/);
      assert.match(source, /semanticStopController\.release\(stopOwnerId\)/);
      assert.match(source, /function invalidateStoryEnginePipeline\(\) \{[\s\S]*semanticStopController\.invalidate\(\)/);
      assert.match(source, /function withStoryEngineModelRequest\(callback, options = \{\}\)[\s\S]*assertStoryEngineModelRequestCurrent\(options\)[\s\S]*await callback\(\)[\s\S]*assertStoryEngineModelRequestCurrent\(options\)/);
      assert.match(source, /promptReadyBypassGate\.clear\(\)/);
      assert.match(source, /function invalidateStoryEnginePipeline\(\) \{[\s\S]*state\.preflightDryRun = null/);
      assert.doesNotMatch(source, /bypassPromptReady/);
      assert.match(source, /storyEngineModelRequestGate\.acquire\(\)/);
      assert.match(source, /storyEngineModelRequestGate\.release\(requestToken\)/);
      assert.match(source, /function clearThinkingDisableRuntimeState\(\) \{[\s\S]*storyEngineModelRequestGate\.clear\(\)/);
      assert.doesNotMatch(source, /storyEngineModelRequestDepth/);
      assert.match(source, /function createTimedInternalRequestControl[\s\S]*isCurrent: \(\) => !cancelled && parentIsCurrent\(\)[\s\S]*cancel\(\) \{[\s\S]*release\(\)/);
      assert.match(source, /function createTimedInternalRequestControl[\s\S]*registerCancellation\(handler\)[\s\S]*for \(const handler of cancellationHandlers\) handler\(\)/);
      assert.match(source, /function requestTargetedProseBanRepairWithTimeout[\s\S]*requestControl\.cancel\(\)[\s\S]*requestControl\.release\(\)/);
      assert.match(source, /function withStoryEngineModelRequest[\s\S]*options\?\.registerCancellation[\s\S]*unregisterCancellation\?\.\(\)[\s\S]*releaseRequestToken\(\)/);
      assert.match(source, /submitPlayerAdventureStartPrompt\(prompt, context, actionIdentity\)/);
      assert.match(source, /function submitPlayerAdventureStartPrompt[\s\S]*isCurrentStoryEngineEpoch\(requestIdentity, context\)[\s\S]*await generateSillyTavern/);
      assert.match(source, /postNarrationFinalizers: new Map\(\)/);
      assert.match(source, /state\.postNarrationFinalizers\.get\(messageKey\) === finalizerOwner/);
      assert.match(source, /function failPreflightDryRun[\s\S]*state\.generationActive = false[\s\S]*state\.pendingGeneration = null[\s\S]*state\.activeRunId = null/);
      assert.match(source, /function failNarratorGeneration[\s\S]*setChatInputLocked\(false\)[\s\S]*state\.pendingGeneration = null[\s\S]*state\.activeRunId = null/);
      assert.match(source, /Promise\.resolve\(generateSillyTavern\(generation\.type \|\| 'normal', generateOptions, false, narratorContext\)\)[\s\S]*\.catch\(error => failNarratorGeneration\(generation, error\)\)/);
      assert.match(source, /function handleMessageDeleted[\s\S]*invalidateStoryEnginePipeline\(\)/);
      assert.match(source, /function handleMessageSwiped[\s\S]*invalidateStoryEnginePipeline\(\)/);
      assert.match(source, /function handleMessageDeleted[\s\S]*operationIdentity[\s\S]*isCurrentStoryEngineEpoch\(operationIdentity, context\)/);
      assert.match(source, /function handleMessageSwiped[\s\S]*operationIdentity[\s\S]*isCurrentStoryEngineEpoch\(operationIdentity, context\)/);
      assert.match(source, /function invalidateStoryEnginePipeline[\s\S]*state\.playerSetupBusy = false[\s\S]*state\.progressionBusy = false/);
      assert.match(source, /function handlePlayerSetupAction[\s\S]*actionIdentity[\s\S]*isCurrentStoryEngineEpoch\(actionIdentity\)/);
      assert.match(source, /function handleProgressionAction[\s\S]*actionIdentity[\s\S]*isCurrentStoryEngineEpoch\(actionIdentity\)/);
      assert.match(source, /structured_preflight_force_player_setup[\s\S]*operationIdentity = createStoryEngineEpochIdentity\(context\)[\s\S]*isCurrentStoryEngineEpoch\(operationIdentity, context\)/);
      assert.match(source, /structured_preflight_reset_player_setup[\s\S]*operationIdentity = createStoryEngineEpochIdentity\(context\)[\s\S]*isCurrentStoryEngineEpoch\(operationIdentity, context\)/);
      assert.match(source, /function saveManualUserTrackerItems[\s\S]*operationIdentity = createStoryEngineEpochIdentity\(context\)[\s\S]*isCurrentStoryEngineEpoch\(operationIdentity, context\)/);
      assert.match(source, /saveManualUserTrackerItems\([\s\S]*context, operationIdentity\)[\s\S]*isCurrentStoryEngineEpoch\(operationIdentity, context\)/);
    },
  },
  {
    name: '67c stale persona writes roll back instead of mutating a newly selected persona',
    run() {
      const indexSource = fs.readFileSync(extensionFile('index.js'), 'utf8');
      const adapterSource = fs.readFileSync(extensionFile('st-adapter.js'), 'utf8');
      assert.match(indexSource, /writePersonaDescription\(sheetText, context, actionIdentity \? \{/);
      assert.match(indexSource, /avatarId: actionIdentity\.personaId/);
      assert.match(indexSource, /isCurrent: \(\) => isCurrentStoryEngineEpoch\(actionIdentity, context\)/);
      assert.match(adapterSource, /assertPersonaWriteCurrent\(expectedAvatarId, options\)/);
      assert.match(adapterSource, /if \(descriptor\.description === nextDescription\) descriptor\.description = current/);
      assert.match(adapterSource, /if \(getActiveUserAvatar\(\) === expectedAvatarId && powerUser\.persona_description === nextDescription\)/);
    },
  },
  {
    name: '67a stale semantic cleanup cannot flush a newer run stop sentinel',
    async run() {
      const events = [];
      const controller = createEphemeralStopController({
        add: async value => events.push(`add:${value}`),
        flush: async () => events.push('flush'),
      });

      assert.equal(await controller.claim('old-run', 'STOP'), true);
      const staleRelease = controller.release('old-run');
      const currentClaim = controller.claim('new-run', 'STOP');

      assert.equal(await staleRelease, false);
      assert.equal(await currentClaim, true);
      assert.equal(controller.getOwner(), 'new-run');
      assert.deepEqual(events, ['add:STOP', 'add:STOP']);

      assert.equal(await controller.release('new-run'), true);
      assert.deepEqual(events, ['add:STOP', 'add:STOP', 'flush']);
      assert.equal(controller.getOwner(), null);
    },
  },
  {
    name: '67b stale async bypass cleanup cannot release a newer owner',
    run() {
      const gate = createAsyncTokenGate();
      const expired = gate.acquire();
      assert.equal(gate.isActive(), true);

      gate.clear();
      const current = gate.acquire();
      assert.equal(gate.release(expired), false);
      assert.equal(gate.isActive(), true);
      assert.equal(gate.size(), 1);

      assert.equal(gate.release(current), true);
      assert.equal(gate.isActive(), false);
      assert.equal(gate.size(), 0);
    },
  },
  {
    name: '68a capability pools map percentile boundaries to deterministic ranks',
    run() {
      assert.equal(rankForCapabilityPool('common', 1), 'Weak');
      assert.equal(rankForCapabilityPool('common', 15), 'Weak');
      assert.equal(rankForCapabilityPool('common', 16), 'Average');
      assert.equal(rankForCapabilityPool('common', 95), 'Average');
      assert.equal(rankForCapabilityPool('common', 96), 'Trained');
      assert.equal(rankForCapabilityPool('common', 99), 'Trained');
      assert.equal(rankForCapabilityPool('common', 100), 'Elite');

      assert.equal(rankForCapabilityPool('trained', 20), 'Average');
      assert.equal(rankForCapabilityPool('trained', 21), 'Trained');
      assert.equal(rankForCapabilityPool('trained', 90), 'Trained');
      assert.equal(rankForCapabilityPool('trained', 91), 'Elite');

      assert.equal(rankForCapabilityPool('elite', 20), 'Trained');
      assert.equal(rankForCapabilityPool('elite', 21), 'Elite');
      assert.equal(rankForCapabilityPool('boss', 1), 'Boss');
      assert.equal(rankForCapabilityPool('boss', 100), 'Boss');
    },
  },
  {
    name: '68b missing capability evidence falls back to common and persists final stats',
    run() {
      const report = runCase({
        userText: 'I try to convince the traveler to let me pass.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Gain_Passage',
            identifyChallenge: 'convince the traveler to allow passage',
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Traveler'],
              OppTargets: { NPC: ['Traveler'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: [],
              PowerActors: [],
            },
            rollNeeded: true,
            rollReason: 'The traveler may refuse passage.',
            challengeType: 'social',
            socialTactic: 'diplomacy',
            genStats: { CapabilityPool: 'none', MainStat: 'none' },
          },
          relationshipEngine: [relationship('Traveler', {
            genStats: { CapabilityPool: 'none', MainStat: 'none' },
          })],
        }),
      });

      const generated = report.finalNarrativeHandoff.generatedNpcStats.find(entry => entry.NPC === 'Traveler');
      const persisted = report.trackerUpdate.npcs.Traveler.currentCoreStats;
      assert.equal(generated.CapabilityPool, 'common');
      assert.equal(generated.MainStat, 'Balanced');
      assert.equal(['Weak', 'Average', 'Trained', 'Elite'].includes(generated.FinalRank), true);
      assert.deepEqual(persisted, {
        Rank: generated.FinalRank,
        MainStat: generated.MainStat,
        PHY: generated.PHY,
        MND: generated.MND,
        CHA: generated.CHA,
      });
      assert.match(auditPrompt(report), /npc\.generatedStats:.*"CapabilityPool":"common"/);
      assert.doesNotMatch(prompt(report), /CapabilityPool|Percentile|FinalRank/);
    },
  },
  {
    name: '68c semantic genStats contract delegates final rank selection to code',
    run() {
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      assert.match(ENGINE_PROMPT_TEXT, /return \{CapabilityPool, MainStat\}/);
      assert.match(ENGINE_PROMPT_TEXT, /deterministic code rolls final Rank from CapabilityPool percentiles/);
      assert.match(semanticSource, /ResolutionEngine\.genStats\.CapabilityPool=none/);
      assert.doesNotMatch(semanticSource, /ResolutionEngine\.genStats\.Rank/);
    },
  },
  {
    name: '68d generated Boss stats retain their full range and initialize Boss-rank health',
    run() {
      const report = runCase({
        userText: 'I try to convince the warlord to stand down.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Convince_Warlord',
            identifyChallenge: 'convince the warlord to stand down',
            identifyTargets: {
              hostilesInScene: { NPC: ['Warlord'] },
              ActionTargets: ['Warlord'],
              OppTargets: { NPC: ['Warlord'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: [],
              PowerActors: [],
            },
            rollNeeded: true,
            rollReason: 'The warlord may refuse.',
            challengeType: 'social',
            socialTactic: 'diplomacy',
            genStats: { CapabilityPool: 'boss', MainStat: 'Balanced' },
          },
          relationshipEngine: [relationship('Warlord', {
            genStats: { CapabilityPool: 'boss', MainStat: 'Balanced' },
          })],
        }),
      });

      const generated = report.finalNarrativeHandoff.generatedNpcStats.find(entry => entry.NPC === 'Warlord');
      const health = report.hiddenHealth.after.npcs.Warlord;
      assert.equal(generated.FinalRank, 'Boss');
      for (const stat of ['PHY', 'MND', 'CHA']) {
        assert.equal(generated[stat] >= 11 && generated[stat] <= 14, true);
      }
      assert.equal(health.maxHp >= 50 && health.maxHp <= 70, true);
      assert.equal(health.currentHp, health.maxHp);
    },
  },
  {
    name: '68e capability generation preserves an existing hidden-health actor',
    run() {
      const report = runCase({
        userText: 'I try to convince the warlord to stand down.',
        cardFields: {
          health: {
            seed: 'test-health-seed',
            npcs: { Warlord: { maxHp: 37, currentHp: 19 } },
          },
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Convince_Warlord',
            identifyChallenge: 'convince the warlord to stand down',
            identifyTargets: {
              hostilesInScene: { NPC: ['Warlord'] },
              ActionTargets: ['Warlord'],
              OppTargets: { NPC: ['Warlord'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: [],
              PowerActors: [],
            },
            rollNeeded: true,
            rollReason: 'The warlord may refuse.',
            challengeType: 'social',
            socialTactic: 'diplomacy',
            genStats: { CapabilityPool: 'boss', MainStat: 'Balanced' },
          },
          relationshipEngine: [relationship('Warlord', {
            genStats: { CapabilityPool: 'boss', MainStat: 'Balanced' },
          })],
        }),
      });

      assert.equal(report.finalNarrativeHandoff.generatedNpcStats[0].FinalRank, 'Boss');
      assert.equal(report.hiddenHealth.after.npcs.Warlord.maxHp, 37);
      assert.equal(report.hiddenHealth.after.npcs.Warlord.currentHp, 19);
    },
  },
  {
    name: '68f capability seed reconciliation preserves a valid secondary specialization',
    run() {
      const report = runCase({
        userText: 'I challenge the guard to a wrestling match.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Challenge_Guard',
            identifyChallenge: 'challenge the guard to a wrestling match',
            identifyTargets: {
              hostilesInScene: { NPC: [] },
              ActionTargets: ['Guard'],
              OppTargets: { NPC: ['Guard'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              NPCAwareOfUser: [],
              PowerActors: [],
            },
            rollNeeded: true,
            rollReason: 'The guard opposes the challenge.',
            challengeType: 'social',
            socialTactic: 'diplomacy',
            genStats: { CapabilityPool: 'trained', MainStat: 'none' },
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { CapabilityPool: 'trained', MainStat: 'PHY' },
          })],
        }),
      });

      const generated = report.finalNarrativeHandoff.generatedNpcStats.find(entry => entry.NPC === 'Guard');
      assert.equal(generated.CapabilityPool, 'trained');
      assert.equal(generated.MainStat, 'PHY');
      assert.equal(report.trackerUpdate.npcs.Guard.currentCoreStats.MainStat, 'PHY');
    },
  },
  {
    name: '69 tracker rollback state is swipe-specific and bounded',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      assert.match(source, /const PROGRESSION_SWIPE_EXTRA_KEY = 'structured_preflight_progression_swipe'/);
      assert.match(source, /const TRACKER_ROOT_SNAPSHOT_LIMIT = 120/);
      assert.match(source, /hiddenHealth: cloneHiddenHealth\(pendingRun\?\.healthAfter \|\| pendingRun\?\.healthBefore\)/);
      assert.match(source, /normalizeHiddenHealth\(snapshot\.hiddenHealth \|\| root\.snapshots\?\.\[snapshot\.messageKey\]\?\.afterHealth/);
      assert.match(source, /function restoreProgressionFromMessageSwipe/);
      assert.match(source, /current\.some\(record => progressionRecordXpSpent\(record\) > 0\)/);
      assert.match(source, /setMessageProgressionSwipeSnapshot\(message, buildProgressionSwipeSnapshot\(messageKey, context\)\)/);
      assert.match(source, /restoreProgressionFromMessageSwipe\(resolvedMessageId, context\)/);
      assert.match(source, /pruneRootTrackerSnapshots\(root\)/);
      assert.match(source, /removeProgressionRecordsAtOrAfterMessageId\(chatId, firstAffectedMessageId, context\)/);
      assert.match(source, /before: clone\(pendingRun\.trackerBefore\)/);
      assert.match(source, /after: clone\(trackerDisplaySnapshot\.npcs\)/);
      assert.match(source, /root\.npcs = normalizeDisplayTrackerNpcs\(snapshot\.npcs\)/);
      const engineSource = fs.readFileSync(new URL('engines.js', import.meta.url), 'utf8');
      assert.match(engineSource, /inventory: normalizeTrackerStringList\(value\?\.inventory\)/);
      assert.match(engineSource, /currency: normalizeCurrencyList\(value\?\.currency\)/);
      assert.match(engineSource, /lootSearchCompleted: value\?\.lootSearchCompleted === true \|\| value\?\.lootSearchCompleted === 'Y'/);
    },
  },
];

const EXTENSION_DIR = new URL('.', import.meta.url);
const extensionFile = (name) => new URL(name, EXTENSION_DIR);

const results = [];
for (const test of tests) {
  try {
    await test.run();
    results.push({ name: test.name, status: 'PASS' });
  } catch (error) {
    results.push({ name: test.name, status: 'FAIL', error: error?.stack || String(error) });
  }
}

for (const result of results) {
  console.log(`${result.status} ${result.name}`);
  if (result.error) console.log(result.error);
}

const failures = results.filter(result => result.status === 'FAIL');
console.log(`SUMMARY ${results.length - failures.length}/${results.length} passed`);
if (failures.length) process.exitCode = 1;


