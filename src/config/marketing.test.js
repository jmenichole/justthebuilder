import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getJustTheHelperInviteUrl,
  justTheHelperUpsell
} from "./marketing.js";

const envBackup = {};

afterEach(() => {
  for (const key of Object.keys(envBackup)) {
    if (envBackup[key] === undefined) delete process.env[key];
    else process.env[key] = envBackup[key];
  }
});

function saveEnv(key) {
  envBackup[key] = process.env[key];
}

describe("justTheHelperUpsell", () => {
  it("builds invite URL from client id", () => {
    saveEnv("JUSTTHEHELPER_CLIENT_ID");
    saveEnv("JUSTTHEHELPER_INVITE_URL");
    process.env.JUSTTHEHELPER_CLIENT_ID = "123456789012345678";
    delete process.env.JUSTTHEHELPER_INVITE_URL;
    assert.match(getJustTheHelperInviteUrl(), /client_id=123456789012345678/);
  });

  it("returns upsell copy by default", () => {
    saveEnv("JUSTTHEHELPER_UPSELL");
    delete process.env.JUSTTHEHELPER_UPSELL;
    const text = justTheHelperUpsell({ variant: "structure" });
    assert.match(text, /JustTheHelper/);
    assert.match(text, /welcome \+ verify/i);
  });

  it("can be disabled via env", () => {
    saveEnv("JUSTTHEHELPER_UPSELL");
    process.env.JUSTTHEHELPER_UPSELL = "false";
    assert.equal(justTheHelperUpsell(), "");
  });
});
