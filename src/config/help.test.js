import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGrantFreeBuildOwnerDm,
  buildHelpMessage,
  buildSurpriseGrantOwnerDm,
  buildUnlockDeniedMessage
} from "./help.js";

describe("help copy", () => {
  it("buildHelpMessage includes core flows", () => {
    const text = buildHelpMessage();
    assert.match(text, /\/setup run/);
    assert.match(text, /\/setup redeem/);
    assert.match(text, /\/setup unlock/);
    assert.match(text, /\/help/);
  });

  it("grant DM with saved blueprint points to unlock", () => {
    const text = buildGrantFreeBuildOwnerDm({
      guildName: "Test Guild",
      hasBlueprint: true,
      structureApplied: true
    });
    assert.match(text, /\/setup unlock/);
    assert.doesNotMatch(text, /\/setup run.*interview/s);
  });

  it("grant DM without blueprint points to run then unlock", () => {
    const text = buildGrantFreeBuildOwnerDm({
      guildName: "Test Guild",
      hasBlueprint: false
    });
    assert.match(text, /\/setup run/);
    assert.match(text, /\/setup unlock/);
  });

  it("unlock denied mentions help and redeem path", () => {
    const text = buildUnlockDeniedMessage();
    assert.match(text, /\/setup redeem/);
    assert.match(text, /\/help/);
  });

  it("surprise grant DM points to unlock path", () => {
    const text = buildSurpriseGrantOwnerDm({ guildName: "Lucky Guild", hasBlueprint: true });
    assert.match(text, /Surprise/i);
    assert.match(text, /\/setup unlock/);
  });
});
