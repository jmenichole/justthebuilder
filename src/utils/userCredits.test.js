import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { addPolishCredits, consumePolishCredit, getPolishCredits } from "./userCredits.js";
import { canApplyPolish } from "./entitlements.js";

const tracked = [];

afterEach(() => {
  for (const id of tracked) {
    const file = path.join("data", "users", `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  tracked.length = 0;
});

describe("userCredits", () => {
  it("adds and consumes polish credits", () => {
    const userId = "credit-user-1";
    tracked.push(userId);
    assert.equal(getPolishCredits(userId), 0);
    assert.equal(addPolishCredits(userId, 3), 3);
    assert.equal(consumePolishCredit(userId), 2);
    assert.equal(getPolishCredits(userId), 2);
  });
});

describe("canApplyPolish credits", () => {
  it("allows unlock when user has credits", () => {
    const userId = "credit-user-2";
    tracked.push(userId);
    addPolishCredits(userId, 1);
    const result = canApplyPolish({ user: { id: userId }, entitlements: [] }, { id: "g1" });
    assert.deepEqual(result, { allowed: true, reason: "credit" });
  });
});
