const GENERIC_NAME_ROLES = Object.freeze([
    'acolyte',
    'adventurer',
    'ally',
    'apprentice',
    'assailant',
    'attacker',
    'bandit',
    'baker',
    'beast',
    'bystander',
    'captive',
    'child',
    'commoner',
    'companion',
    'creature',
    'cultist',
    'customer',
    'elder',
    'enemy',
    'figure',
    'girl',
    'guard',
    'hostage',
    'innkeeper',
    'knight',
    'mage',
    'man',
    'merchant',
    'monster',
    'npc',
    'ogre',
    'patron',
    'person',
    'prisoner',
    'raider',
    'rider',
    'sailor',
    'shopkeeper',
    'soldier',
    'stranger',
    'student',
    'thug',
    'traveler',
    'villager',
    'warrior',
    'witness',
    'woman',
]);

const GENERIC_ROLE_SET = new Set(GENERIC_NAME_ROLES);

export function isPromotableTrackerName(value) {
    const original = String(value ?? '').trim();
    const text = normalizeSearchText(value);
    if (!text) return false;
    const originalCompact = original.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const compact = text.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(?:unknown|unnamed|unidentified|nameless|mysterious)\b/.test(compact)) return true;
    if (/^(?:npc|person|stranger|figure|enemy|attacker|assailant|bystander)\s*\d+$/.test(compact)) return true;
    const numbered = /^([a-z][a-z\s']*?)\s*\d+$/.exec(compact);
    const role = numbered?.[1]?.trim() || compact;
    if (GENERIC_ROLE_SET.has(role)) return true;
    const words = compact.split(/\s+/).filter(Boolean);
    const lastWord = words[words.length - 1] || '';
    if (words.length > 1 && GENERIC_ROLE_SET.has(lastWord)) return true;
    if (original.includes('_')) return true;
    return words.length > 1 && originalCompact === originalCompact.toLowerCase();
}

export function getExplicitNamePromotions(text, trackedNames) {
    const source = normalizeSearchText(text);
    const promotions = [];
    if (!source || !Array.isArray(trackedNames)) return promotions;

    for (const oldName of trackedNames) {
        if (!isPromotableTrackerName(oldName)) continue;
        const aliases = getPromotableNameAliases(oldName);
        for (const alias of aliases) {
            const escapedAlias = escapeRegExp(alias);
            const patterns = [
                new RegExp(`\\b(?:the|that|this|same)\\s+${escapedAlias}\\s*(?:'s)?\\s+name\\s+(?:is|was)\\s+([a-z][a-z'-]{1,30})\\b`, 'i'),
                new RegExp(`\\b${escapedAlias}\\s*(?:'s)?\\s+name\\s+(?:is|was)\\s+([a-z][a-z'-]{1,30})\\b`, 'i'),
                new RegExp(`\\b(?:the|that|this|same)\\s+${escapedAlias}\\s+(?:is|was)\\s+(?:named|called)\\s+([a-z][a-z'-]{1,30})\\b`, 'i'),
                new RegExp(`\\b${escapedAlias}\\s+(?:is|was)\\s+(?:named|called)\\s+([a-z][a-z'-]{1,30})\\b`, 'i'),
                new RegExp(`\\b(?:the|that|this|same)\\s+${escapedAlias}\\s*,?\\s+(?:named|called)\\s+([a-z][a-z'-]{1,30})\\b`, 'i'),
                new RegExp(`\\b${escapedAlias}\\s*,?\\s+(?:named|called)\\s+([a-z][a-z'-]{1,30})\\b`, 'i'),
                new RegExp(`\\b(?:the|that|this|same)\\s+${escapedAlias}\\b[\\s\\S]{0,220}["']([a-z][a-z'-]{1,30})[.!?,]?["']\\s*(?:he|she|they|the\\s+${escapedAlias}|${escapedAlias})?\\s*(?:said|says|answered|replied|muttered|grunted|nodded|offered)\\b`, 'i'),
                new RegExp(`\\b${escapedAlias}\\b[\\s\\S]{0,220}["']([a-z][a-z'-]{1,30})[.!?,]?["']\\s*(?:he|she|they|the\\s+${escapedAlias}|${escapedAlias})?\\s*(?:said|says|answered|replied|muttered|grunted|nodded|offered)\\b`, 'i'),
            ];
            for (const pattern of patterns) {
                const match = pattern.exec(source);
                if (!match?.[1]) continue;
                const newName = titleCaseName(match[1]);
                if (!newName || normalizeSearchText(newName) === normalizeSearchText(oldName)) continue;
                promotions.push({ oldName, newName });
                break;
            }
            if (promotions.some(item => item.oldName === oldName)) break;
        }
    }

    return promotions;
}

function getPromotableNameAliases(value) {
    const text = normalizeSearchText(value).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const aliases = [text];
    const numbered = /^([a-z][a-z\s']*?)\s*(\d+)$/.exec(text);
    if (numbered) {
        aliases.push(`${numbered[1].trim()} ${numbered[2]}`);
    }
    return [...new Set(aliases.filter(Boolean))];
}

function titleCaseName(value) {
    return String(value ?? '')
        .trim()
        .split(/[\s-]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSearchText(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
