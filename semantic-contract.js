export const CHALLENGE_TYPES = Object.freeze([
    'none',
    'social',
    'mundane_combat',
    'supernatural_combat',
    'restraint',
    'stealth',
    'environment',
]);

export const SOCIAL_TACTICS = Object.freeze(['none', 'diplomacy', 'bluff', 'intimidate']);
export const HARM_MODES = Object.freeze(['lethal', 'nonlethal', 'restraint_control', 'none']);
export const BOUNDARY_PRESSURE_TYPES = Object.freeze(['none', 'object_access', 'space_access', 'departure']);
export const BOUNDARY_BREAK_TYPES = Object.freeze(['none', 'restraint', 'object_access', 'space_access', 'departure', 'intimacy']);
export const BOUNDARY_BREAK_RESPONSES = Object.freeze(['none', 'released', 'continued', 'escalated', 'unrelated', 'unclear']);
export const STANDING_INFLUENCES = Object.freeze(['none', 'aware', 'constrained']);
export const EXCEPTIONAL_BENEFIT_SCALES = Object.freeze(['ordinary', 'significant', 'exceptional']);
export const ROMANCE_STYLES = Object.freeze(['auto', 'nervous', 'flirt']);
export const AGGRESSION_METHODS = Object.freeze(['none', 'physical', 'supernatural']);

export const SLOW_BOND_KEYS = Object.freeze([
    'respectfulContact',
    'cooperation',
    'comfortInProximity',
    'boundaryRespect',
    'sharedRoutine',
    'playfulness',
    'teamwork',
    'personalAttention',
]);

// This preserves the established and tested B3-to-B4 mechanic.
export const SLOW_BOND_DISTINCT_CATEGORY_THRESHOLD = 2;

export const SLOW_BOND_CATEGORY_DESCRIPTIONS = Object.freeze({
    respectfulContact: 'True only for fresh, clearly welcome or respectful physical contact or physical help that preserves this NPC\'s comfort and agency. False for restraint, unwanted touch, fear-based compliance, incapacitation, or ambiguous consent.',
    cooperation: 'True only for fresh ordinary constructive cooperation toward a shared immediate purpose. Ordinary safe collaboration belongs here; coordinated effort under meaningful danger, conflict, crisis, or pressure is teamwork instead.',
    comfortInProximity: 'True only when this NPC voluntarily remains or settles close to the user with a safe practical choice, without fear, duty, coercion, confinement, dependency, or forced circumstance.',
    boundaryRespect: 'True only when the user actively respects an expressed refusal, hesitation, privacy need, space request, limit, consent condition, or stated boundary. Mere absence of a violation is false.',
    sharedRoutine: 'True only for fresh evidence of repeated or mundane voluntary togetherness such as eating, travel, work, rest, training, camp, or a recurring ritual. One novel pleasant activity is insufficient unless prior context establishes it as routine.',
    playfulness: 'True only for mutual light teasing, joking, banter, gamefulness, or relaxed warmth without cruelty, humiliation, pressure, or one-sided mockery.',
    teamwork: 'True only for coordinated effort together under meaningful pressure, danger, conflict, crisis, or difficulty. Ordinary safe collaboration is cooperation.',
    personalAttention: 'True only for specific attention to this NPC\'s needs, preferences, wellbeing, vulnerability, history, comfort, or expressed concerns. Generic politeness, compliments, or friendliness are false.',
});

export const SLOW_BOND_BLOCKERS_DESCRIPTION = 'Fresh explicit blockers that make closeness unsafe to count: coercion, intimidation, betrayal, humiliation, unwanted intimacy pressure, boundary violation, unresolved user-caused harm, exploitation, active fear or hostility, or trapped, dependent, or powerless circumstances. Empty when none is explicitly present.';

export const RELATIONSHIP_FIELD_DESCRIPTIONS = Object.freeze({
    aggressionMethod: 'Classify this NPC\'s context-supported method for ongoing or immediately possible aggression this turn, including a proactive attack, counterattack, retaliation, companion attack, or companion counter. physical means bodily force, natural weapons, ordinary weapons, tools, projectiles, or another material attack. supernatural means an established spell, psychic or mental attack, magical effect, divine/demonic power, or other supernatural attack. Use none when this NPC is not involved in ongoing or immediately possible aggression. Choose from established current action, equipment, natural weapons, abilities, background, and practiced skills; never choose from whichever numeric stat is higher. Use physical when the NPC is aggression-eligible but no supernatural method is established.',
    aggressionMethodEvidence: 'Concise established-context evidence for aggressionMethod, such as the current physical action, equipped or narrated weapon, natural weapon, established spell/ability, background, or practiced skill. Numeric stats are never evidence. Use (none) when aggressionMethod=none.',
    auditInteraction: 'True only when the successful outcome of the user\'s act clearly, substantially, and concretely improves this NPC\'s stakes through rescue, protection from an independent threat, meaningful resources, restored autonomy, prevention of real harm or loss, significant standing improvement, or explicit NPC goal advancement. For a pending roll, classify that successful outcome without predicting whether it occurs; deterministic resolution later applies the actual outcome. False for mood, politeness, flirting, ordinary cooperation, user self-advancement, choosing not to harm, or mere survival.',
    exceptionalBenefit: 'Strict subset of auditInteraction. True only when the latest user action, if it succeeds, would produce an exceptional, high-consequence improvement to this NPC\'s concrete life stakes: the possible result is unusually consequential, personally significant, and plausibly relationship-defining rather than merely helpful. Judge the whole established situation, the scale of what is at stake, the user\'s meaningful commitment or intervention, and the lasting significance of that successful outcome. Do not classify by keywords or by one fixed scenario. Must be false when auditInteraction is false or exceptionalBenefitScale is not exceptional. Deterministic resolution later decides whether the action actually succeeds.',
    exceptionalBenefitScale: 'Classify the benefit scale of the action\'s successful outcome from the complete established situation: ordinary for routine, expected, minor, or limited help; significant for a real and meaningful improvement that is not unusually consequential or relationship-defining; exceptional only for an unusually high-consequence, personally significant result likely to alter this NPC\'s lasting view of the user. This is an abstract judgment, not a keyword match; do not predict whether the action succeeds.',
    exceptionalBenefitEvidence: 'Concise evidence naming the NPC, the concrete stakes at issue, why a successful result would be exceptional in this established situation, and how the user\'s action would cause it. Do not claim that a pending action already succeeded. Use (none) when exceptionalBenefit=N.',
    establishedRelationship: 'True only for an already tracked established B4 romantic relationship, or an explicit current romantic relationship, partnership, lovers, dating, or courting declaration or request accepted by both sides. False for friendliness, attraction, flirting, affection, trust, sex, prior intimacy, or B4 alone.',
    romanceStyle: 'B4 pre-relationship initiative style only: nervous for explicitly shy, reserved, guarded, restrained, formal, awkward, timid, or emotionally cautious characterization; flirt for explicitly bold, outgoing, playful, teasing, direct, seductive, or socially confident characterization; auto when unclear or mixed.',
    explicitIntimidationOrCoercion: 'True only when the latest user goal, means, threat, demand, or conduct explicitly uses intimidation, coercion, fear pressure, menacing threat, or forced submission against this NPC. False for ordinary disagreement, authority, firmness, hostility without a coercive demand, or inferred fear.',
});
