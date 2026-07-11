export function createEphemeralStopController({ add, flush } = {}) {
    if (typeof add !== 'function' || typeof flush !== 'function') {
        throw new TypeError('Ephemeral stop controller requires add and flush functions.');
    }

    let currentOwner = null;
    let operationTail = Promise.resolve();

    const enqueue = operation => {
        const result = operationTail.catch(() => undefined).then(operation);
        operationTail = result.catch(() => undefined);
        return result;
    };

    const claim = (ownerId, value) => {
        const owner = String(ownerId || '').trim();
        if (!owner) throw new TypeError('Ephemeral stop owner ID is required.');

        currentOwner = owner;
        return enqueue(async () => {
            if (currentOwner !== owner) return false;
            await add(value);
            return currentOwner === owner;
        });
    };

    const release = ownerId => {
        const owner = String(ownerId || '').trim();
        if (!owner) return Promise.resolve(false);

        return enqueue(async () => {
            if (currentOwner !== owner) return false;
            currentOwner = null;
            await flush();
            return true;
        });
    };

    const invalidate = () => {
        const owner = currentOwner;
        return owner ? release(owner) : Promise.resolve(false);
    };

    return Object.freeze({
        claim,
        release,
        invalidate,
        getOwner: () => currentOwner,
    });
}

export function createAsyncTokenGate() {
    const tokens = new Set();

    return Object.freeze({
        acquire() {
            const token = Symbol('async-token-gate');
            tokens.add(token);
            return token;
        },
        release(token) {
            return tokens.delete(token);
        },
        clear() {
            tokens.clear();
        },
        isActive() {
            return tokens.size > 0;
        },
        size() {
            return tokens.size;
        },
    });
}
