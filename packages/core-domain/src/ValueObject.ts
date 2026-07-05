// ValueObject.ts
/** Deep freeze utility to make objects immutable */
function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);
  // Recursively freeze properties that are objects
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = (obj as any)[prop];
    if (
      value &&
      (typeof value === 'object' || typeof value === 'function') &&
      !Object.isFrozen(value)
    ) {
      deepFreeze(value);
    }
  });
  return obj;
}

/** Abstract base class for Value Objects */
export abstract class ValueObject {
  protected constructor() {
    deepFreeze(this);
  }
}
