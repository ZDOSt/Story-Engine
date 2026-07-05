const NONE_VALUES = new Set(['', '(none)', 'none', 'null', 'n/a']);
const UNCHANGED_VALUES = new Set(['unchanged', '(unchanged)', 'same', 'no change']);

export const WORLD_TIME_SLOTS = Object.freeze(['morning', 'afternoon', 'evening', 'night']);
export const WORLD_WEATHER_CONDITIONS = Object.freeze([
    'clear',
    'partly_cloudy',
    'cloudy',
    'overcast',
    'light_rain',
    'heavy_rain',
    'storm',
]);

export const DEFAULT_WORLD_STATE = Object.freeze({
    reputationLocation: '',
    place: '',
    area: '',
    indoors: false,
    dayIndex: 1,
    timeOfDay: 'afternoon',
    weather: Object.freeze({
        condition: 'clear',
        remainingSlots: 2,
    }),
});

export function normalizeWorldState(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const weather = source.weather && typeof source.weather === 'object' ? source.weather : {};
    return {
        reputationLocation: cleanWorldText(source.reputationLocation, 120),
        place: cleanWorldText(source.place, 120),
        area: cleanWorldText(source.area, 120),
        indoors: normalizeWorldBool(source.indoors, DEFAULT_WORLD_STATE.indoors),
        dayIndex: clampInt(source.dayIndex, 1, 9999, DEFAULT_WORLD_STATE.dayIndex),
        timeOfDay: normalizeTimeOfDay(source.timeOfDay) || DEFAULT_WORLD_STATE.timeOfDay,
        weather: {
            condition: normalizeWeatherCondition(weather.condition ?? source.weatherCondition) || DEFAULT_WORLD_STATE.weather.condition,
            remainingSlots: clampInt(weather.remainingSlots ?? source.weatherRemainingSlots, 0, 8, DEFAULT_WORLD_STATE.weather.remainingSlots),
        },
    };
}

export function normalizeWorldStateDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        reputationLocation: cleanWorldDeltaText(source.reputationLocation, 120),
        place: cleanWorldDeltaText(source.place, 120),
        area: cleanWorldDeltaText(source.area, 120),
        indoors: normalizeWorldDeltaBool(source.indoors),
        timeAdvance: normalizeTimeAdvance(source.timeAdvance),
        timeOfDay: normalizeTimeOfDay(source.timeOfDay ?? source.explicitTimeOfDay),
        weatherTick: normalizeWeatherTick(source.weatherTick),
    };
}

export function applyWorldStateDelta(before = {}, delta = {}, options = {}) {
    const base = normalizeWorldState(before);
    const patch = normalizeWorldStateDelta(delta);
    const next = normalizeWorldState(base);

    const changedPlace = patch.place !== null && patch.place !== next.place;
    const changedReputationLocation = patch.reputationLocation !== null && patch.reputationLocation !== next.reputationLocation;

    if (patch.reputationLocation !== null) next.reputationLocation = patch.reputationLocation;
    if (patch.place !== null) next.place = patch.place;
    if (patch.area !== null) next.area = patch.area;
    if (patch.indoors !== null) next.indoors = patch.indoors;

    const beforeTimeOfDay = next.timeOfDay;
    applyTimeAdvance(next, patch);
    const timeChanged = beforeTimeOfDay !== next.timeOfDay || patch.timeAdvance !== 'none';

    const shouldTickWeather = patch.weatherTick === 'tick'
        || (patch.weatherTick === 'auto' && (timeChanged || changedPlace || changedReputationLocation));
    if (shouldTickWeather) {
        next.weather = advanceWeatherState(next.weather, {
            seed: [
                options.seed || '',
                next.dayIndex,
                next.timeOfDay,
                next.reputationLocation,
                next.place,
                next.weather.condition,
                next.weather.remainingSlots,
            ].join('|'),
        });
    }

    return normalizeWorldState(next);
}

export function worldStateHasMeaningfulValue(value = {}) {
    const state = normalizeWorldState(value);
    return Boolean(
        state.reputationLocation
        || state.place
        || state.area
        || state.timeOfDay !== DEFAULT_WORLD_STATE.timeOfDay
        || state.weather.condition !== DEFAULT_WORLD_STATE.weather.condition
    );
}

export function formatWorldStateForDisplay(value = {}) {
    const state = normalizeWorldState(value);
    return {
        reputationLocation: state.reputationLocation || 'Unknown',
        place: state.place || 'Unknown',
        area: state.area || 'Unknown',
        indoors: state.indoors ? 'Indoors' : 'Outdoors',
        day: `Day ${state.dayIndex}`,
        timeOfDay: titleCase(state.timeOfDay),
        weather: titleCase(state.weather.condition.replace(/_/g, ' ')),
    };
}

export function summarizeWorldStateForNarration(value = {}) {
    const state = normalizeWorldState(value);
    const parts = [
        state.reputationLocation ? `reputationLocation=${state.reputationLocation}` : '',
        state.place ? `place=${state.place}` : '',
        state.area ? `area=${state.area}` : '',
        `position=${state.indoors ? 'indoors' : 'outdoors'}`,
        `day=${state.dayIndex}`,
        `timeOfDay=${state.timeOfDay}`,
        `weather=${state.weather.condition}`,
    ].filter(Boolean);
    return parts.join('; ');
}

export function cleanWorldText(value, maxLength = 120) {
    const text = String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^["']|["']$/g, '')
        .trim();
    if (NONE_VALUES.has(text.toLowerCase())) return '';
    if (UNCHANGED_VALUES.has(text.toLowerCase())) return '';
    return text.slice(0, maxLength);
}

function cleanWorldDeltaText(value, maxLength = 120) {
    const text = String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^["']|["']$/g, '')
        .trim();
    const lower = text.toLowerCase();
    if (!text || UNCHANGED_VALUES.has(lower)) return null;
    if (NONE_VALUES.has(lower) || lower === 'unknown') return '';
    return text.slice(0, maxLength);
}

function normalizeWorldBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    const text = String(value ?? '').trim().toLowerCase();
    if (['y', 'yes', 'true', '1', 'indoors', 'indoor', 'inside'].includes(text)) return true;
    if (['n', 'no', 'false', '0', 'outdoors', 'outdoor', 'outside'].includes(text)) return false;
    return Boolean(fallback);
}

function normalizeWorldDeltaBool(value) {
    const text = String(value ?? '').trim().toLowerCase();
    if (!text || UNCHANGED_VALUES.has(text)) return null;
    if (['y', 'yes', 'true', '1', 'indoors', 'indoor', 'inside'].includes(text)) return true;
    if (['n', 'no', 'false', '0', 'outdoors', 'outdoor', 'outside'].includes(text)) return false;
    return null;
}

function normalizeTimeOfDay(value) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!text || UNCHANGED_VALUES.has(text)) return '';
    if (WORLD_TIME_SLOTS.includes(text)) return text;
    if (['dawn', 'sunrise', 'early_morning'].includes(text)) return 'morning';
    if (['midday', 'noon', 'day', 'daytime'].includes(text)) return 'afternoon';
    if (['dusk', 'sunset', 'late_day'].includes(text)) return 'evening';
    if (['midnight', 'late_night', 'overnight'].includes(text)) return 'night';
    return '';
}

function normalizeTimeAdvance(value) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!text || NONE_VALUES.has(text) || UNCHANGED_VALUES.has(text)) return 'none';
    if (['slot', 'time_slot', 'next_slot', 'later', 'later_that_day'].includes(text)) return 'slot';
    if (['overnight', 'sleep', 'rest_overnight', 'next_morning'].includes(text)) return 'overnight';
    if (['day', 'full_day', 'days', 'long_rest', 'time_skip'].includes(text)) return 'day';
    if (['explicit', 'set'].includes(text)) return 'explicit';
    return 'none';
}

function normalizeWeatherCondition(value) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!text || NONE_VALUES.has(text) || UNCHANGED_VALUES.has(text)) return '';
    if (WORLD_WEATHER_CONDITIONS.includes(text)) return text;
    if (['sunny', 'fair', 'bright'].includes(text)) return 'clear';
    if (['partly_cloudy', 'partly', 'mixed_clouds'].includes(text)) return 'partly_cloudy';
    if (['gray', 'grey'].includes(text)) return 'cloudy';
    if (['drizzle', 'misty_rain', 'showers', 'rain'].includes(text)) return 'light_rain';
    if (['downpour', 'rainstorm'].includes(text)) return 'heavy_rain';
    if (['thunderstorm', 'violent_storm'].includes(text)) return 'storm';
    return '';
}

function normalizeWeatherTick(value) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!text || text === 'auto') return 'auto';
    if (['n', 'no', 'none', 'false', '0', 'unchanged'].includes(text)) return 'none';
    if (['y', 'yes', 'tick', 'true', '1', 'advance'].includes(text)) return 'tick';
    return 'auto';
}

function applyTimeAdvance(next, patch) {
    switch (patch.timeAdvance) {
        case 'slot':
            advanceTimeSlot(next);
            break;
        case 'overnight':
            next.dayIndex = clampInt(next.dayIndex + 1, 1, 9999, next.dayIndex);
            next.timeOfDay = 'morning';
            break;
        case 'day':
            next.dayIndex = clampInt(next.dayIndex + 1, 1, 9999, next.dayIndex);
            next.timeOfDay = patch.timeOfDay || 'morning';
            return;
        case 'explicit':
        case 'none':
        default:
            break;
    }
    if (patch.timeOfDay) next.timeOfDay = patch.timeOfDay;
}

function advanceTimeSlot(state) {
    const index = WORLD_TIME_SLOTS.indexOf(state.timeOfDay);
    const current = index >= 0 ? index : WORLD_TIME_SLOTS.indexOf(DEFAULT_WORLD_STATE.timeOfDay);
    const nextIndex = (current + 1) % WORLD_TIME_SLOTS.length;
    if (WORLD_TIME_SLOTS[current] === 'night' && WORLD_TIME_SLOTS[nextIndex] === 'morning') {
        state.dayIndex = clampInt(state.dayIndex + 1, 1, 9999, state.dayIndex);
    }
    state.timeOfDay = WORLD_TIME_SLOTS[nextIndex];
}

function advanceWeatherState(weather = {}, options = {}) {
    const current = normalizeWeatherCondition(weather.condition) || DEFAULT_WORLD_STATE.weather.condition;
    const remaining = clampInt(weather.remainingSlots, 0, 8, DEFAULT_WORLD_STATE.weather.remainingSlots);
    if (remaining > 1) {
        return { condition: current, remainingSlots: remaining - 1 };
    }

    const roll = stableRoll(options.seed || current);
    const currentIndex = WORLD_WEATHER_CONDITIONS.indexOf(current);
    const index = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = chooseNextWeatherIndex(index, roll);
    const condition = WORLD_WEATHER_CONDITIONS[nextIndex] || DEFAULT_WORLD_STATE.weather.condition;
    return {
        condition,
        remainingSlots: weatherDurationSlots(condition, roll),
    };
}

function chooseNextWeatherIndex(index, roll) {
    const wetOrWorse = index >= WORLD_WEATHER_CONDITIONS.indexOf('light_rain');
    let step = 0;
    if (wetOrWorse) {
        if (roll <= 45) step = 0;
        else if (roll <= 70) step = -1;
        else if (roll <= 84) step = 1;
        else if (roll <= 95) step = -2;
        else step = 2;
    } else {
        if (roll <= 58) step = 0;
        else if (roll <= 78) step = 1;
        else if (roll <= 91) step = -1;
        else if (roll <= 97) step = 2;
        else step = -2;
    }
    return clampInt(index + step, 0, WORLD_WEATHER_CONDITIONS.length - 1, index);
}

function weatherDurationSlots(condition, roll) {
    switch (condition) {
        case 'storm':
            return 1;
        case 'heavy_rain':
            return roll % 2 === 0 ? 1 : 2;
        case 'light_rain':
            return 1 + (roll % 3);
        case 'overcast':
        case 'cloudy':
            return 2 + (roll % 3);
        case 'partly_cloudy':
            return 2 + (roll % 2);
        case 'clear':
        default:
            return 2 + (roll % 3);
    }
}

function stableRoll(seed) {
    const text = String(seed || 'world-weather');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (Math.abs(hash >>> 0) % 100) + 1;
}

function titleCase(value) {
    return String(value ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function clampInt(value, min, max, fallback) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}
