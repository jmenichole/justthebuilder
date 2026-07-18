import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStyledEmbed, formatEmbedBody } from "./embedFactory.js";

describe("formatEmbedBody", () => {
  it("splits a dense paragraph into shorter lines", () => {
    const dense =
      "Welcome to EarnCord, the official Discord server for https://jmenichole.github.io/earncord/. Please read our #rules and #about channels for more information. If you have any questions, feel free to ask in #general. You can also find our privacy policy at https://jmenichole.github.io/earncord/privacy.html, terms at https://jmenichole.github.io/earncord/terms.html, and contact our support team at jmenichole007@outlook.com.";
    const { description, fields } = formatEmbedBody(dense);
    assert.ok(description.includes("\n\n"));
    assert.ok(description.length < dense.length);
    assert.ok(fields.some((f) => /link/i.test(f.name)));
    assert.ok(fields.some((f) => /support|contact/i.test(f.name)));
  });

  it("keeps already-spaced bodies", () => {
    const spaced = "Line one.\n\nLine two.";
    const { description } = formatEmbedBody(spaced);
    assert.match(description, /Line one\.\n\nLine two\./);
  });
});

describe("buildStyledEmbed", () => {
  it("uses sections as fields and formats body", () => {
    const embed = buildStyledEmbed(
      {
        title: "Welcome to EarnCord",
        body: "Surveys that come to you. Match, verify, payout in USDT.",
        sections: [
          {
            header: "Start here",
            bullets: ["Read #rules", "Check #how-it-works", "Say hi in #general"]
          }
        ]
      },
      { theme: "neon-gold" },
      { color: "#5ef2a8", emoji: "💸" }
    );
    const data = embed.toJSON();
    assert.match(data.title, /Welcome to EarnCord/);
    assert.ok(data.fields?.length >= 1);
    assert.equal(data.color, 0x5ef2a8);
  });
});
