import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DEMO_EMAIL, DEMO_SESSION_KEY, clearDemoSession, getDemoSession, isDemoAccountEmail, setDemoSession } from "./demo-auth";

function installStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } } });
  return values;
}

test("accepts only the supported demo account emails", () => {
  assert.equal(isDemoAccountEmail(DEFAULT_DEMO_EMAIL), true);
  assert.equal(isDemoAccountEmail("nickhil@hirenova.com"), true);
  assert.equal(isDemoAccountEmail(""), false);
  assert.equal(isDemoAccountEmail("person@example.com"), false);
  assert.equal(isDemoAccountEmail(null), false);
});

test("reads, writes, normalizes, and clears the demo session", () => {
  const values = installStorage();
  assert.equal(getDemoSession(), null);
  assert.equal(setDemoSession(" NICKHIL@HIRENOVA.COM "), true);
  assert.equal(values.get(DEMO_SESSION_KEY), "nickhil@hirenova.com");
  assert.equal(getDemoSession(), "nickhil@hirenova.com");
  assert.equal(setDemoSession("not-supported@example.com"), false);
  assert.equal(values.get(DEMO_SESSION_KEY), "nickhil@hirenova.com");
  clearDemoSession();
  assert.equal(getDemoSession(), null);
});
