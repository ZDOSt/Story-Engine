const ECONOMY_PROFILES = Object.freeze({
    Fantasy: { currencyName: 'silver', currencyUnit: 'sv' },
    'Sci-fi': { currencyName: 'credits', currencyUnit: 'cr' },
    Modern: { currencyName: 'dollars', currencyUnit: '$' },
    'Slice of Life': { currencyName: 'dollars', currencyUnit: '$' },
    Isekai: { currencyName: 'silver', currencyUnit: 'sv' },
    'Urban Fantasy': { currencyName: 'dollars', currencyUnit: '$' },
    Cyberpunk: { currencyName: 'credits', currencyUnit: 'cr' },
    'Post-Apocalyptic': { currencyName: 'salvage scrip', currencyUnit: 'scrip' },
    Horror: { currencyName: 'dollars', currencyUnit: '$' },
    Supernatural: { currencyName: 'dollars', currencyUnit: '$' },
    Superhero: { currencyName: 'dollars', currencyUnit: '$' },
    Steampunk: { currencyName: 'crowns', currencyUnit: 'crn' },
    Historical: { currencyName: 'silver', currencyUnit: 'sv' },
    'Wuxia / Xianxia': { currencyName: 'spirit stones', currencyUnit: 'ss' },
});

const VALUE_TIER_BASES = Object.freeze([
    { name: 'trivial', range: [1, 5], examples: 'bread, ale, candles, cheap street food, tiny supplies' },
    { name: 'cheap', range: [10, 25], examples: 'meals, rope, torches, basic tools, common travel supplies' },
    { name: 'standard', range: [50, 150], examples: 'lodging, basic weapons, simple armor, common services, guild fees' },
    { name: 'expensive', range: [300, 800], examples: 'quality gear, mounts, professional services, skilled craftwork' },
    { name: 'luxury', range: [1000, 3000], examples: 'masterwork equipment, rare potions, noble goods, war mounts' },
    { name: 'elite', range: [5000, null], examples: 'magic items, property, ships, expeditions, major bribes, rare artifacts' },
]);

const EQUIPMENT_DEFENSE_BONUSES = Object.freeze({
    trivial: 0,
    cheap: 0,
    standard: 1,
    expensive: 2,
    luxury: 3,
    elite: 4,
});

const PROTECTIVE_EQUIPMENT_PATTERN = /\b(?:armor|armour|body\s+armor|body\s+armour|mail|chainmail|chain\s+mail|ring\s+mail|scale\s+mail|plate\s+(?:armor|armour|mail|carrier)|coat\s+of\s+plates|hauberk|cuirass|breastplate|brigandine|gambeson|lamellar|shield|buckler|helmet|helm|gauntlets?|bracers?|greaves?|ballistic\s+vest|bulletproof\s+vest|armou?red\s+vest|flak\s+(?:vest|jacket)|riot\s+(?:armor|armour|shield|gear)|combat\s+(?:armor|armour|suit)|power(?:ed)?\s+(?:armor|armour)|armou?red\s+(?:suit|exoskeleton)|protective\s+suit|hardsuit|exosuit)\b/i;
const DISABLED_PROTECTIVE_EQUIPMENT_PATTERN = /\b(?:broken|destroyed|ruined|shattered|unusable)\b/i;
const NON_PROTECTIVE_EQUIPMENT_CONTEXT_PATTERN = /\b(?:anti[-\s]+armou?r|armou?r[-\s]+piercing|armou?r\s+(?:repair|maintenance|cleaning|crafting|smithing)|(?:armou?r|shield|helmet)\s+(?:manual|guide|handbook|blueprint|schematic|diagram|pattern|kit|tools?|parts?|scraps?|stand|rack|generator|emitter|projector))\b/i;

const NPC_LOOT_RANK_PROFILES = Object.freeze({
    Weak: Object.freeze({ equipmentTier: 'cheap', currencyTier: 'trivial', currencyChance: 40 }),
    Average: Object.freeze({ equipmentTier: 'standard', currencyTier: 'cheap', currencyChance: 55 }),
    Trained: Object.freeze({ equipmentTier: 'expensive', currencyTier: 'standard', currencyChance: 70 }),
    Elite: Object.freeze({ equipmentTier: 'luxury', currencyTier: 'expensive', currencyChance: 85 }),
    Boss: Object.freeze({ equipmentTier: 'elite', currencyTier: 'luxury', currencyChance: 100 }),
});

const NPC_EQUIPMENT_MATERIAL_GUIDANCE = Object.freeze({
    Weak: 'Crude or heavily worn common materials and rough workmanship: damaged wood, bone, patched leather, poor iron, or the setting-equivalent.',
    Average: 'Serviceable common materials and ordinary workmanship: iron, leather, ordinary steel, or the setting-equivalent.',
    Trained: 'Quality common materials and professional workmanship: tempered steel, reinforced leather, fitted components, or the setting-equivalent.',
    Elite: 'Masterwork construction using excellent common materials or a setting-valid rare material appropriate to an exceptional individual.',
    Boss: 'The finest setting-valid materials and exceptional craftsmanship appropriate to a singular major threat; quality is physical, not a magical property.',
});

const MAGIC_STONE_PHYSICAL_GUIDANCE = Object.freeze({
    Weak: 'small and cloudy',
    Average: 'solid and clear',
    Trained: 'dense and brightly colored',
    Elite: 'large, clear, and strongly luminous',
    Boss: 'massive, exceptionally clear, and intensely luminous',
});

export function getEconomyProfileForGenre(genre = 'Fantasy') {
    const genreName = Object.prototype.hasOwnProperty.call(ECONOMY_PROFILES, genre) ? genre : 'Fantasy';
    const base = ECONOMY_PROFILES[genreName];
    return {
        genre: genreName,
        currencyName: base.currencyName,
        currencyUnit: base.currencyUnit,
        currencyLabel: `${base.currencyName} (${base.currencyUnit})`,
        valueTiers: VALUE_TIER_BASES.map(tier => ({
            name: tier.name,
            range: formatTierRange(tier.range, base.currencyUnit),
            examples: tier.examples,
        })),
    };
}

export function getNpcLootRankProfile(rank = 'Average', genre = 'Fantasy') {
    const normalizedRank = normalizeLootRank(rank);
    const profile = NPC_LOOT_RANK_PROFILES[normalizedRank];
    const economy = getEconomyProfileForGenre(genre);
    const equipmentTier = getValueTierDefinition(profile.equipmentTier, economy.currencyUnit);
    const currencyTier = getValueTierDefinition(profile.currencyTier, economy.currencyUnit);
    return {
        rank: normalizedRank,
        equipmentTier: equipmentTier.name,
        equipmentValueRange: equipmentTier.range,
        currencyTier: currencyTier.name,
        currencyValueRange: currencyTier.range,
        currencyChance: profile.currencyChance,
        materialGuidance: NPC_EQUIPMENT_MATERIAL_GUIDANCE[normalizedRank],
    };
}

export function normalizeEquipmentValueTier(value, fallback = 'standard') {
    const normalizedFallback = Object.prototype.hasOwnProperty.call(EQUIPMENT_DEFENSE_BONUSES, fallback)
        ? fallback
        : 'standard';
    const tier = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(EQUIPMENT_DEFENSE_BONUSES, tier)
        ? tier
        : normalizedFallback;
}

export function equipmentDefenseBonusForTier(value) {
    return EQUIPMENT_DEFENSE_BONUSES[normalizeEquipmentValueTier(value)] || 0;
}

export function equipmentTierForCurrencyAmount(value) {
    const parsed = parseCurrencyAmount(value);
    if (!parsed) return 'standard';
    let matched = VALUE_TIER_BASES[0];
    for (const tier of VALUE_TIER_BASES) {
        if (parsed.amount < Number(tier.range[0] || 0)) break;
        matched = tier;
    }
    return matched.name;
}

export function isProtectiveEquipmentItem(value) {
    const item = cleanEquipmentItem(value);
    return Boolean(item
        && PROTECTIVE_EQUIPMENT_PATTERN.test(item)
        && !DISABLED_PROTECTIVE_EQUIPMENT_PATTERN.test(item)
        && !NON_PROTECTIVE_EQUIPMENT_CONTEXT_PATTERN.test(item));
}

export function normalizeEquipmentTierAssignments(value, ownedItems = [], defaultTier = 'standard') {
    const owned = normalizeEquipmentItems(ownedItems);
    const fallbackTier = normalizeEquipmentValueTier(defaultTier);
    const ownedByKey = new Map(owned.map(item => [equipmentItemKey(item), item]));
    const supplied = new Map();
    const source = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
            ? Object.entries(value).map(([item, tier]) => ({ item, tier }))
            : [];
    for (const entry of source) {
        const item = cleanEquipmentItem(entry?.item ?? entry?.Item);
        const key = equipmentItemKey(item);
        if (!key || !ownedByKey.has(key) || supplied.has(key)) continue;
        supplied.set(key, normalizeEquipmentValueTier(entry?.tier ?? entry?.Tier));
    }
    return owned.map(item => ({
        item,
        tier: supplied.get(equipmentItemKey(item)) || fallbackTier,
    }));
}

export function assignEquipmentTier(assignments, item, tier, ownedItems = []) {
    const owned = normalizeEquipmentItems(ownedItems);
    const wantedKey = equipmentItemKey(item);
    if (!wantedKey || !owned.some(candidate => equipmentItemKey(candidate) === wantedKey)) {
        return normalizeEquipmentTierAssignments(assignments, owned);
    }
    const current = normalizeEquipmentTierAssignments(assignments, owned);
    return current.map(entry => equipmentItemKey(entry.item) === wantedKey
        ? { ...entry, tier: normalizeEquipmentValueTier(tier) }
        : entry);
}

export function resolveEquipmentDefense({ gear = [], equipmentTiers = [], defaultTier = 'standard' } = {}) {
    const equipped = normalizeEquipmentItems(gear);
    const fallbackTier = normalizeEquipmentValueTier(defaultTier);
    const assignments = new Map(normalizeEquipmentTierAssignments(equipmentTiers, equipped, fallbackTier)
        .map(entry => [equipmentItemKey(entry.item), entry.tier]));
    const candidates = equipped
        .filter(isProtectiveEquipmentItem)
        .map(item => {
            const tier = assignments.get(equipmentItemKey(item)) || fallbackTier;
            return { item, tier, bonus: equipmentDefenseBonusForTier(tier) };
        })
        .sort((left, right) => right.bonus - left.bonus);
    const best = candidates[0];
    if (!best) {
        return {
            Eligible: 'N',
            AppliedToRoll: 'N',
            Item: '(none)',
            Tier: 'none',
            Bonus: 0,
            Reason: 'no equipped protective gear',
        };
    }
    return {
        Eligible: 'Y',
        AppliedToRoll: best.bonus > 0 ? 'Y' : 'N',
        Item: best.item,
        Tier: best.tier,
        Bonus: best.bonus,
        Reason: best.bonus > 0
            ? 'highest-tier equipped protective item'
            : 'equipped protective gear has no defense bonus at this tier',
    };
}

export function buildDeterministicLootEnvelope(options = {}) {
    const genre = options?.genre || options?.adventureGenre || 'Fantasy';
    const target = cleanLootSeedPart(options?.target) || 'unknown-target';
    const seed = cleanLootSeedPart(options?.seed) || 'story-engine-loot';
    const targetKind = normalizeLootTargetKind(options?.targetKind);
    const profile = getNpcLootRankProfile(options?.rank, genre);
    const economy = getEconomyProfileForGenre(genre);
    const currencyPresent = targetKind === 'humanoid'
        && stableLootPercent(`${seed}|${target}|currency-present`) <= profile.currencyChance;
    const currencyAmount = currencyPresent
        ? deterministicCurrencyAmount(profile.currencyTier, economy.currencyUnit, `${seed}|${target}|currency-amount`)
        : '';
    const magicStone = targetKind === 'monster'
        ? {
            item: 'magic stone',
            valueTier: profile.equipmentTier,
            valueRange: profile.equipmentValueRange,
            physicalGuidance: MAGIC_STONE_PHYSICAL_GUIDANCE[profile.rank],
        }
        : null;
    return {
        ...profile,
        targetKind,
        currencyAmount,
        magicStone,
        maxNewMundaneItems: targetKind === 'humanoid' ? 2 : 0,
    };
}

export function renderEconomyAndValueLens(options = {}) {
    const profile = getEconomyProfileForGenre(options?.adventureGenre || 'Fantasy');
    const tiers = profile.valueTiers
        .map(tier => `${tier.name}: ${tier.range}`)
        .join('; ');
    return `ECONOMY AND VALUE:
Default genre currency: ${profile.currencyLabel}.
Use a tier-based economy, not exact accounting, unless the scene is directly about buying, selling, bargaining, being paid, being robbed, looting, debts, contract rewards, or checking inventory.
Value tiers: ${tiers}.
Scale prices, pay, loot, bribes, and rewards by danger, scarcity, location, reputation, employer wealth, risk, and world logic. Lower-risk scenes should produce modest value; dangerous or high-status challenges can justify better rewards.
Do not invent {{user}}'s current balance or pause the story for accounting. When money is explicitly gained, spent, lost, stolen, paid, or awarded, state the amount and currency clearly enough for tracker updates.
This economy guidance never overrides narrativeFacts(input), {{user}} agency, established tracker state, genre logic, or prose rules.`;
}

export function renderEconomyTrackerContext(options = {}) {
    const profile = getEconomyProfileForGenre(options?.adventureGenre || 'Fantasy');
    const economyState = normalizeEconomyState(options?.economyState || {});
    return {
        defaultCurrency: profile.currencyLabel,
        valueTiers: profile.valueTiers,
        userCurrency: normalizeCurrencyList(options?.userCurrency || []),
        pendingPrice: economyState.pendingPrice,
        trackerRule: 'Track completed money changes from FINAL_NARRATION. If a pendingPrice exists, semantic payment confirmation may spend that stored amount even when the narration says coins/payment without restating the number.',
    };
}

export function normalizeEconomyState(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        pendingPrice: normalizePendingPrice(source.pendingPrice),
    };
}

export function normalizeEconomyDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        payPendingPrice: toBoolean(source.payPendingPrice),
        clearPendingPrice: toBoolean(source.clearPendingPrice),
        pendingPrice: normalizePendingPrice(source.pendingPrice),
    };
}

export function applyEconomyDelta(current = {}, delta = {}, options = {}) {
    const state = normalizeEconomyState(current);
    const normalized = normalizeEconomyDelta(delta);
    if (normalized.clearPendingPrice || normalized.payPendingPrice) {
        state.pendingPrice = null;
    }
    if (normalized.pendingPrice && !normalized.payPendingPrice) {
        state.pendingPrice = {
            ...normalized.pendingPrice,
            messageKey: cleanEconomyText(options?.messageKey, 140),
            updatedAt: Number.isFinite(Number(options?.updatedAt)) ? Math.floor(Number(options.updatedAt)) : Date.now(),
        };
    }
    return normalizeEconomyState(state);
}

export function normalizeCurrencyList(value) {
    const source = Array.isArray(value)
        ? value
        : String(value ?? '').split(/[;\n]/);
    const result = [];
    const seen = new Set();
    for (const item of source) {
        const text = cleanCurrencyText(item);
        if (!text || isNoneCurrencyValue(text)) continue;
        const parsed = parseCurrencyAmount(text);
        const normalized = parsed ? formatCurrencyAmount(parsed) : text;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized.slice(0, 80));
        if (result.length >= 20) break;
    }
    return result;
}

export function applyCurrencyDelta(current, add, remove) {
    const balances = new Map();
    const loose = [];
    const pushBalance = parsed => {
        if (!parsed) return false;
        const key = parsed.unit.toLowerCase();
        const existing = balances.get(key) || { unit: parsed.unit, amount: 0 };
        existing.amount += parsed.amount;
        balances.set(key, existing);
        return true;
    };

    for (const item of normalizeCurrencyList(current)) {
        const parsed = parseCurrencyAmount(item);
        if (parsed) {
            pushBalance(parsed);
        } else {
            loose.push(item);
        }
    }

    for (const item of normalizeCurrencyList(add)) {
        const parsed = parseCurrencyAmount(item);
        if (parsed) {
            pushBalance(parsed);
        } else if (!loose.some(existing => existing.toLowerCase() === item.toLowerCase())) {
            loose.push(item);
        }
    }

    for (const item of normalizeCurrencyList(remove)) {
        const parsed = parseCurrencyAmount(item);
        if (parsed) {
            const key = parsed.unit.toLowerCase();
            const existing = balances.get(key);
            if (existing) {
                existing.amount = Math.max(0, existing.amount - parsed.amount);
                balances.set(key, existing);
            }
            continue;
        }
        const removeKey = item.toLowerCase();
        const index = loose.findIndex(existing => existing.toLowerCase() === removeKey);
        if (index >= 0) loose.splice(index, 1);
    }

    const normalizedBalances = [...balances.values()]
        .filter(entry => entry.amount > 0)
        .map(formatCurrencyAmount);
    return normalizeCurrencyList([...normalizedBalances, ...loose]);
}

export function mergePendingPricePaymentCurrencyRemove(remove = [], economyState = {}, economyDelta = {}) {
    const currentRemove = normalizeCurrencyList(remove);
    const normalizedState = normalizeEconomyState(economyState);
    const normalizedDelta = normalizeEconomyDelta(economyDelta);
    const amount = normalizedState.pendingPrice?.amount || '';
    if (!normalizedDelta.payPendingPrice || !amount) return currentRemove;
    return normalizeCurrencyList([...currentRemove, amount]);
}

function formatTierRange(range, unit) {
    const [low, high] = range;
    if (high == null) return `${formatCurrencyValue(low, unit)}+`;
    return `${formatCurrencyValue(low, unit)}-${formatCurrencyValue(high, unit)}`;
}

function getValueTierDefinition(name, unit) {
    const tier = VALUE_TIER_BASES.find(item => item.name === name) || VALUE_TIER_BASES[0];
    return {
        name: tier.name,
        range: formatTierRange(tier.range, unit),
        numericRange: [...tier.range],
    };
}

function deterministicCurrencyAmount(tierName, unit, seed) {
    const tier = VALUE_TIER_BASES.find(item => item.name === tierName) || VALUE_TIER_BASES[0];
    const low = Math.max(1, Math.floor(Number(tier.range[0]) || 1));
    const high = tier.range[1] == null
        ? Math.max(low, low * 2)
        : Math.max(low, Math.floor(Number(tier.range[1]) || low));
    const amount = low + (stableLootHash(seed) % (high - low + 1));
    return formatCurrencyValue(amount, unit);
}

function normalizeLootRank(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'weak') return 'Weak';
    if (text === 'trained') return 'Trained';
    if (text === 'elite') return 'Elite';
    if (text === 'boss') return 'Boss';
    return 'Average';
}

function normalizeLootTargetKind(value) {
    const text = String(value || '').trim().toLowerCase();
    return ['humanoid', 'monster', 'other'].includes(text) ? text : 'other';
}

function cleanLootSeedPart(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 180);
}

function normalizeEquipmentItems(value) {
    const source = Array.isArray(value) ? value : [value];
    const result = [];
    const seen = new Set();
    for (const raw of source) {
        const item = cleanEquipmentItem(raw);
        const key = equipmentItemKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result.slice(-80);
}

function cleanEquipmentItem(value) {
    const text = String(value ?? '')
        .trim()
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 140);
}

function equipmentItemKey(value) {
    return cleanEquipmentItem(value)
        .toLowerCase()
        .replace(/[`*_~]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function stableLootPercent(seed) {
    return (stableLootHash(seed) % 100) + 1;
}

function stableLootHash(seed) {
    let hash = 2166136261;
    for (const char of String(seed || 'story-engine-loot')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function formatCurrencyValue(value, unit) {
    if (unit === '$') return `$${formatNumber(value)}`;
    return `${formatNumber(value)} ${unit}`;
}

function parseCurrencyAmount(value) {
    const text = cleanCurrencyText(value);
    if (!text) return null;
    const amountPattern = '-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
    const parseAmount = amount => Number(String(amount).replace(/,/g, ''));
    let match = text.match(new RegExp(`^\\$\\s*(${amountPattern})$`));
    if (match) return parsedCurrency(parseAmount(match[1]), '$');
    match = text.match(new RegExp(`^(${amountPattern})\\s*(?:dollars?|usd)$`, 'i'));
    if (match) return parsedCurrency(parseAmount(match[1]), '$');
    match = text.match(new RegExp(`^(${amountPattern})\\s+([a-z][a-z0-9_-]*(?:\\s+[a-z][a-z0-9_-]*){0,2})$`, 'i'));
    if (match) return parsedCurrency(parseAmount(match[1]), canonicalCurrencyUnit(match[2]));
    match = text.match(new RegExp(`^([a-z][a-z0-9_-]*(?:\\s+[a-z][a-z0-9_-]*){0,2})\\s+(${amountPattern})$`, 'i'));
    if (match) return parsedCurrency(parseAmount(match[2]), canonicalCurrencyUnit(match[1]));
    return null;
}

function parsedCurrency(amount, unit) {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { amount, unit: String(unit || '').trim() || '$' };
}

function formatCurrencyAmount(entry) {
    const amount = formatNumber(entry.amount);
    return entry.unit === '$' ? `$${amount}` : `${amount} ${entry.unit}`;
}

function formatNumber(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return '0';
    if (Math.abs(number - Math.round(number)) < 0.001) return String(Math.round(number));
    return number.toFixed(2).replace(/\.?0+$/, '');
}

function cleanCurrencyText(value) {
    return String(value ?? '')
        .trim()
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isNoneCurrencyValue(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return !text || ['(none)', 'none', 'null', 'n/a', 'unchanged'].includes(text);
}

function normalizePendingPrice(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const amount = normalizeCurrencyList([source.amount ?? source.Amount ?? source.pendingPriceAmount])[0] || '';
    if (!amount) return null;
    return {
        amount,
        item: cleanEconomyText(source.item ?? source.Item ?? source.pendingPriceItem, 120) || '(none)',
        payee: cleanEconomyText(source.payee ?? source.Payee ?? source.pendingPricePayee, 120) || '(none)',
        evidence: cleanEconomyText(source.evidence ?? source.Evidence ?? source.pendingPriceEvidence, 220) || '(none)',
    };
}

function cleanEconomyText(value, maxLength = 160) {
    const text = String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ');
    if (!text || isNoneCurrencyValue(text)) return '';
    return text.slice(0, maxLength);
}

function toBoolean(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return ['y', 'yes', 'true', '1'].includes(text);
}

function canonicalCurrencyUnit(unit) {
    const text = String(unit ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (['silver', 'silvers', 'silver coin', 'silver coins'].includes(text)) return 'sv';
    if (['credit', 'credits'].includes(text)) return 'cr';
    if (['crown', 'crowns'].includes(text)) return 'crn';
    if (['dollar', 'dollars', 'usd'].includes(text)) return '$';
    return String(unit ?? '').trim();
}
