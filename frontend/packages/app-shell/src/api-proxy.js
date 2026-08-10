// @ts-check

/**
 * @template T
 * @param {T} api
 * @param {(error: unknown) => void} onError
 * @returns {T}
 */
export function createApiErrorWrappingProxy(api, onError) {
  return /** @type {T} */ (new Proxy(/** @type {object} */ (api), {
    get(target, property, receiver) {
      const descriptor = Object.getOwnPropertyDescriptor(target, property);
      if (descriptor && !descriptor.configurable && !descriptor.writable && 'value' in descriptor) {
        return Reflect.get(target, property, receiver);
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args) => {
        try {
          return Promise.resolve(Reflect.apply(value, target, args)).catch((caught) => {
            onError(caught);
            throw caught;
          });
        } catch (caught) {
          onError(caught);
          throw caught;
        }
      };
    },
  }));
}
