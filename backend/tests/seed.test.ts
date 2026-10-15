import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSeedData } from '../src/seed/generate.js';
import { validateSeedData } from '../src/seed/validate.js';

test('Hirenova seed is deterministic and structurally valid', () => {
  const first = generateSeedData('2026-01-01');
  const second = generateSeedData('2026-01-01');
  assert.deepEqual(first, second);
  assert.equal(first.nodes.filter((node) => node.type === 'Employee').length, 56);
  const employees = first.nodes.filter((node) => node.type === 'Employee');
  const former = employees.filter((employee) => employee.properties.employmentStatus !== 'active');
  assert.equal(former.length, 5);
  assert.deepEqual(new Set(former.map((employee) => employee.properties.employmentStatus)), new Set(['RESIGNED', 'OFFBOARDED']));
  for (const employee of former) {
    assert.equal(typeof employee.properties.leftAt, 'string');
    assert.equal(typeof employee.properties.departureReason, 'string');
    assert.ok(String(employee.properties.leftAt) > String(employee.properties.joinedAt));
    assert.ok(String(employee.properties.leftAt) <= first.companyStartDate);
  }
  assert.deepEqual(validateSeedData(first), []);
});
