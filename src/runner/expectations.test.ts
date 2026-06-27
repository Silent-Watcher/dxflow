import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateExpectations } from "./expectations.js";
import type { HttpResponseOutput } from "./http-client.js";

function makeResponse(overrides: Partial<HttpResponseOutput> = {}): HttpResponseOutput {
  return {
    status: 200,
    statusText: "OK",
    headers: {},
    body: { id: 1, name: "Ada" },
    isJson: true,
    ...overrides,
  };
}

describe("evaluateExpectations", () => {
  test("returns an empty array when no expect block is given", () => {
    assert.deepEqual(evaluateExpectations(undefined, makeResponse()), []);
  });

  test("passes a matching single status expectation", () => {
    const results = evaluateExpectations({ status: 200 }, makeResponse({ status: 200 }));
    assert.equal(results.length, 1);
    assert.equal(results[0]?.passed, true);
  });

  test("fails a non-matching single status expectation", () => {
    const results = evaluateExpectations({ status: 201 }, makeResponse({ status: 200 }));
    assert.equal(results[0]?.passed, false);
    assert.match(results[0]?.details ?? "", /200/);
  });

  test("passes when status matches one of several acceptable codes", () => {
    const results = evaluateExpectations({ status: [200, 201, 204] }, makeResponse({ status: 201 }));
    assert.equal(results[0]?.passed, true);
  });

  test("fails the status expectation when there is no response at all", () => {
    const results = evaluateExpectations({ status: 200 }, undefined);
    assert.equal(results[0]?.passed, false);
    assert.match(results[0]?.details ?? "", /no response/);
  });

  test("passes a bodyContains expectation when the field matches exactly", () => {
    const results = evaluateExpectations(
      { bodyContains: { name: "Ada" } },
      makeResponse({ body: { name: "Ada" }, isJson: true }),
    );
    assert.equal(results[0]?.passed, true);
  });

  test("fails a bodyContains expectation when the field value differs", () => {
    const results = evaluateExpectations(
      { bodyContains: { name: "Ada" } },
      makeResponse({ body: { name: "Bob" }, isJson: true }),
    );
    assert.equal(results[0]?.passed, false);
  });

  test("fails bodyContains when the response body is not JSON", () => {
    const results = evaluateExpectations(
      { bodyContains: { name: "Ada" } },
      makeResponse({ body: "plain text", isJson: false }),
    );
    assert.equal(results[0]?.passed, false);
    assert.match(results[0]?.details ?? "", /not a JSON object/);
  });

  test("fails bodyContains when the response body is JSON but not an object (e.g. a bare JSON number or array)", () => {
    const results = evaluateExpectations(
      { bodyContains: { name: "Ada" } },
      makeResponse({ body: 42, isJson: true }),
    );
    assert.equal(results[0]?.passed, false);
    assert.match(results[0]?.details ?? "", /not a JSON object/);
  });

  test("fails bodyContains when the response body is a JSON null", () => {
    const results = evaluateExpectations(
      { bodyContains: { name: "Ada" } },
      makeResponse({ body: null, isJson: true }),
    );
    assert.equal(results[0]?.passed, false);
    assert.match(results[0]?.details ?? "", /not a JSON object/);
  });

  test("fails bodyContains when there is no response", () => {
    const results = evaluateExpectations({ bodyContains: { name: "Ada" } }, undefined);
    assert.equal(results[0]?.passed, false);
  });

  test("checks multiple bodyContains keys independently", () => {
    const results = evaluateExpectations(
      { bodyContains: { name: "Ada", age: 30 } },
      makeResponse({ body: { name: "Ada", age: 99 }, isJson: true }),
    );
    assert.equal(results.length, 2);
    const byDescription = Object.fromEntries(results.map((r) => [r.description, r.passed]));
    assert.equal(byDescription["body.name should equal \"Ada\""], true);
    assert.equal(byDescription["body.age should equal 30"], false);
  });

  test("deep-equals nested objects and arrays in bodyContains", () => {
    const results = evaluateExpectations(
      { bodyContains: { items: [{ id: 1 }, { id: 2 }] } },
      makeResponse({ body: { items: [{ id: 1 }, { id: 2 }] }, isJson: true }),
    );
    assert.equal(results[0]?.passed, true);
  });

  test("detects a mismatch in nested array order", () => {
    const results = evaluateExpectations(
      { bodyContains: { items: [{ id: 1 }, { id: 2 }] } },
      makeResponse({ body: { items: [{ id: 2 }, { id: 1 }] }, isJson: true }),
    );
    assert.equal(results[0]?.passed, false);
  });

  test("combines status and bodyContains checks in one expect block", () => {
    const results = evaluateExpectations(
      { status: 200, bodyContains: { name: "Ada" } },
      makeResponse({ status: 200, body: { name: "Ada" }, isJson: true }),
    );
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.passed));
  });
});
