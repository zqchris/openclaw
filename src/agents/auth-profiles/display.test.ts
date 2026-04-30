import { describe, expect, it } from "vitest";
import { resolveAuthProfileDisplayLabel } from "./display.js";

describe("resolveAuthProfileDisplayLabel", () => {
  it("prefers displayName over email metadata", () => {
    const label = resolveAuthProfileDisplayLabel({
      cfg: {
        auth: {
          profiles: {
            "openai-codex:id-abc": {
              provider: "openai-codex",
              mode: "oauth",
              displayName: "Work account",
              email: "work@example.com",
            },
          },
        },
      },
      store: { version: 1, profiles: {} },
      profileId: "openai-codex:id-abc",
    });

    expect(label).toBe("openai-codex:id-abc (Work account)");
  });

  it("does not synthesize bogus labels when no human metadata exists", () => {
    const label = resolveAuthProfileDisplayLabel({
      store: {
        version: 1,
        profiles: {
          "openai-codex:id-abc": {
            type: "oauth",
            provider: "openai-codex",
            access: "token",
            refresh: "refresh-token",
            expires: Date.now() + 60_000,
          },
        },
      },
      profileId: "openai-codex:id-abc",
    });

    expect(label).toBe("openai-codex:id-abc");
  });

  it("masks email metadata to keep /status from leaking the full address", () => {
    const label = resolveAuthProfileDisplayLabel({
      store: {
        version: 1,
        profiles: {
          "openai-codex:id-abc": {
            type: "oauth",
            provider: "openai-codex",
            access: "token",
            refresh: "refresh-token",
            expires: Date.now() + 60_000,
            email: "zkyohk@gmail.com",
          },
        },
      },
      profileId: "openai-codex:id-abc",
    });

    expect(label).toBe("openai-codex:id-abc (z***@gmail.com)");
  });

  it("masks email-shaped profileIds (OAuth flow names profile after the email)", () => {
    const label = resolveAuthProfileDisplayLabel({
      store: { version: 1, profiles: {} },
      profileId: "openai-codex:zkyohk@gmail.com",
    });

    expect(label).toBe("openai-codex:z***@gmail.com");
  });

  it("also masks emails leaked into a configured displayName", () => {
    const label = resolveAuthProfileDisplayLabel({
      cfg: {
        auth: {
          profiles: {
            "openai-codex:zkyohk@gmail.com": {
              provider: "openai-codex",
              mode: "oauth",
              displayName: "primary zkyohk@gmail.com",
            },
          },
        },
      },
      store: { version: 1, profiles: {} },
      profileId: "openai-codex:zkyohk@gmail.com",
    });

    expect(label).toBe("openai-codex:z***@gmail.com (primary z***@gmail.com)");
  });
});
