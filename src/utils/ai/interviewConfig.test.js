import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseYes } from "./interviewConfig.js";

describe("parseYes", () => {
  it("accepts clear yes answers", () => {
    assert.equal(parseYes("yes"), true);
    assert.equal(parseYes("Y"), true);
    assert.equal(parseYes("Yeah"), true);
    assert.equal(parseYes("yes (recommended)"), true);
    assert.equal(parseYes("Both"), true);
  });

  it("rejects clear no answers", () => {
    assert.equal(parseYes("no"), false);
    assert.equal(parseYes("n"), false);
    assert.equal(parseYes("nope"), false);
    assert.equal(parseYes("No thanks"), false);
  });

  it("does not treat arbitrary y letters as yes", () => {
    assert.equal(parseYes("community"), false);
    assert.equal(parseYes("maybe later"), false);
    assert.equal(parseYes(""), false);
  });
});
