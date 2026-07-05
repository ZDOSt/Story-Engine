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

function formatCurrencyValue(value, unit) {
    if (unit === '$') return `$${formatNumber(value)}`;
    return `${formatNumber(value)} ${unit}`;
}

function parseCurrencyAmount(value) {
    const text = cleanCurrencyText(value);
    if (!text) return null;
    let match = text.match(/^\$\s*(-?\d+(?:\.\d{1,2})?)$/);
    if (match) return parsedCurrency(Number(match[1]), '$');
    match = text.match(/^(-?\d+(?:\.\d{1,2})?)\s*(?:dollars?|usd)$/i);
    if (match) return parsedCurrency(Number(match[1]), '$');
    match = text.match(/^(-?\d+(?:\.\d{1,2})?)\s+([a-z][a-z0-9_-]*(?:\s+[a-z][a-z0-9_-]*){0,2})$/i);
    if (match) return parsedCurrency(Number(match[1]), canonicalCurrencyUnit(match[2]));
    match = text.match(/^([a-z][a-z0-9_-]*(?:\s+[a-z][a-z0-9_-]*){0,2})\s+(-?\d+(?:\.\d{1,2})?)$/i);
    if (match) return parsedCurrency(Number(match[2]), canonicalCurrencyUnit(match[1]));
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
