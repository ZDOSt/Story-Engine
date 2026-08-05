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
export const ROMANCE_STYLES = Object.freeze(['auto', 'nervous', 'flirt']);

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
    auditInteraction: 'True only when the user\'s act clearly, substantially, and concretely improves this NPC\'s stakes through rescue, protection from an independent threat, meaningful resources, restored autonomy, prevention of real harm or loss, significant standing improvement, or explicit NPC goal advancement. False for mood, politeness, flirting, ordinary cooperation, user self-advancement, choosing not to harm, or mere survival.',
    establishedRelationship: 'True only for an already tracked established B4 romantic relationship, or an explicit current romantic relationship, partnership, lovers, dating, or courting declaration or request accepted by both sides. False for friendliness, attraction, flirting, affection, trust, sex, prior intimacy, or B4 alone.',
    romanceStyle: 'B4 pre-relationship initiative style only: nervous for explicitly shy, reserved, guarded, restrained, formal, awkward, timid, or emotionally cautious characterization; flirt for explicitly bold, outgoing, playful, teasing, direct, seductive, or socially confident characterization; auto when unclear or mixed.',
    explicitIntimidationOrCoercion: 'True only when the latest user goal, means, threat, demand, or conduct explicitly uses intimidation, coercion, fear pressure, menacing threat, or forced submission against this NPC. False for ordinary disagreement, authority, firmness, hostility without a coercive demand, or inferred fear.',
});
