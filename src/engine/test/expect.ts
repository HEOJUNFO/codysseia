// node:test 용 최소 expect. 테스트에서 쓰는 matcher 만 둔다.
import assert from "node:assert/strict";

function matchers(actual: unknown, negate: boolean) {
  const check = (pass: boolean, message: string) => assert.ok(negate ? !pass : pass, negate ? `not: ${message}` : message);
  const deepEqual = (a: unknown, b: unknown) => {
    try {
      assert.deepStrictEqual(a, b);
      return true;
    } catch {
      return false;
    }
  };
  return {
    toBe: (expected: unknown) => check(Object.is(actual, expected), `${String(actual)} === ${String(expected)}`),
    toBeNull: () => check(actual === null, `${String(actual)} === null`),
    toEqual: (expected: unknown) =>
      negate ? check(deepEqual(actual, expected), "deepEqual") : assert.deepStrictEqual(actual, expected),
    toContain: (item: unknown) => check((actual as unknown[]).includes(item), `${JSON.stringify(actual)} contains ${String(item)}`),
    toMatch: (re: RegExp) => check(re.test(String(actual)), `${String(actual)} matches ${re}`),
    toMatchObject: (expected: object) => assert.partialDeepStrictEqual(actual, expected),
  };
}

export function expect(actual: unknown) {
  return { ...matchers(actual, false), not: matchers(actual, true) };
}
