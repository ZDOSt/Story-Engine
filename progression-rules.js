export const PROGRESSION_NORMAL_STAT_CAP = 10;
export const PROGRESSION_BREAKTHROUGH_STAT_CAP = 15;
export const PROGRESSION_BREAKTHROUGH_SACRIFICE = 3;
export const PROGRESSION_ABSOLUTE_SPELL_CAP = 7;

const PLAYER_STATS = Object.freeze(['PHY', 'MND', 'CHA']);

export function normalizeBreakthroughStat(value) {
    const stat = String(value || '').trim().toUpperCase();
    return PLAYER_STATS.includes(stat) ? stat : null;
}

export function spellCapacityForMnd(value) {
    const mnd = Math.max(1, Math.min(PROGRESSION_BREAKTHROUGH_STAT_CAP, Math.floor(Number(value) || 1)));
    if (mnd < 7) return 0;
    if (mnd <= 10) return mnd - 6;
    return Math.min(PROGRESSION_ABSOLUTE_SPELL_CAP, 5 + Math.floor((mnd - 11) / 2));
}

export function spellCastCapacityForMnd(value) {
    const mnd = Math.max(1, Math.min(PROGRESSION_BREAKTHROUGH_STAT_CAP, Math.floor(Number(value) || 1)));
    if (mnd <= 6) return 0;
    if (mnd <= 8) return 2;
    return Math.min(7, mnd - 6);
}

export function minimumMndForSpellCount(value) {
    const spellCount = Math.max(0, Math.floor(Number(value) || 0));
    if (spellCount <= 0) return 1;
    if (spellCount <= 4) return spellCount + 6;
    if (spellCount === 5) return 11;
    if (spellCount === 6) return 13;
    if (spellCount === 7) return 15;
    return Number.POSITIVE_INFINITY;
}

export function breakthroughSacrificeReason(stats, breakthroughStat, sacrificeStat, spellCount = 0) {
    const target = normalizeBreakthroughStat(breakthroughStat);
    const sacrifice = normalizeBreakthroughStat(sacrificeStat);
    if (!target || !sacrifice) return 'Choose valid breakthrough and sacrifice stats.';
    if (target === sacrifice) return 'The breakthrough stat cannot also be sacrificed.';
    const current = Number(stats?.[sacrifice]);
    if (!Number.isInteger(current) || current < PROGRESSION_NORMAL_STAT_CAP) {
        return `${sacrifice} must be restored to ${PROGRESSION_NORMAL_STAT_CAP} before it can be sacrificed.`;
    }
    const next = current - PROGRESSION_BREAKTHROUGH_SACRIFICE;
    if (sacrifice === 'MND') {
        const required = minimumMndForSpellCount(spellCount);
        if (next < required) {
            return `MND cannot fall below ${required} while the character knows ${spellCount} spell${spellCount === 1 ? '' : 's'}.`;
        }
    }
    return '';
}

export function applyBreakthroughStatChange(stats, breakthroughStat, sacrificeStat, options = {}) {
    const target = normalizeBreakthroughStat(breakthroughStat);
    const sacrifice = normalizeBreakthroughStat(sacrificeStat);
    const lockedTarget = normalizeBreakthroughStat(options.existingBreakthroughStat);
    const normalized = Object.fromEntries(PLAYER_STATS.map(stat => [stat, Number(stats?.[stat])]));
    if (!PLAYER_STATS.every(stat => Number.isInteger(normalized[stat]) && normalized[stat] >= PROGRESSION_NORMAL_STAT_CAP && normalized[stat] <= PROGRESSION_BREAKTHROUGH_STAT_CAP)) {
        throw new Error(`All stats must be at least ${PROGRESSION_NORMAL_STAT_CAP} before a breakthrough.`);
    }
    if (!target || !sacrifice) throw new Error('Choose valid breakthrough and sacrifice stats.');
    if (lockedTarget && target !== lockedTarget) {
        throw new Error(`Only the permanent ${lockedTarget} breakthrough can advance above ${PROGRESSION_NORMAL_STAT_CAP}.`);
    }
    const otherElevatedStat = PLAYER_STATS.find(stat => stat !== target && normalized[stat] > PROGRESSION_NORMAL_STAT_CAP);
    if (otherElevatedStat) {
        throw new Error(`Only ${target} may exceed ${PROGRESSION_NORMAL_STAT_CAP}; ${otherElevatedStat} is already above the normal cap.`);
    }
    if (normalized[target] >= PROGRESSION_BREAKTHROUGH_STAT_CAP) {
        throw new Error(`${target} has reached the absolute breakthrough cap of ${PROGRESSION_BREAKTHROUGH_STAT_CAP}.`);
    }
    const sacrificeReason = breakthroughSacrificeReason(normalized, target, sacrifice, options.spellCount);
    if (sacrificeReason) throw new Error(sacrificeReason);
    return {
        ...normalized,
        [target]: normalized[target] + 1,
        [sacrifice]: normalized[sacrifice] - PROGRESSION_BREAKTHROUGH_SACRIFICE,
    };
}
