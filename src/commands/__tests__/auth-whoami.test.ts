import { describe, expect, it } from "vitest";

import { resolveWhoamiPlatform } from "../auth";

describe("resolveWhoamiPlatform", () => {
  it("prefers env credentials over saved currentPlatform when no url arg is provided", () => {
    expect(
      resolveWhoamiPlatform({
        urlArg: undefined,
        currentPlatform: "https://saved.example.com",
        envBaseUrl: "https://env.example.com",
        envToken: "env-token",
      }),
    ).toEqual({
      platform: "https://env.example.com",
      fromEnvOnly: true,
    });
  });

  it("prefers explicit url over env credentials", () => {
    expect(
      resolveWhoamiPlatform({
        urlArg: "https://arg.example.com",
        currentPlatform: "https://saved.example.com",
        envBaseUrl: "https://env.example.com",
        envToken: "env-token",
      }),
    ).toEqual({
      platform: "https://arg.example.com",
      fromEnvOnly: false,
    });
  });

  it("uses saved currentPlatform when env credentials are absent", () => {
    expect(
      resolveWhoamiPlatform({
        urlArg: undefined,
        currentPlatform: "https://saved.example.com",
        envBaseUrl: undefined,
        envToken: undefined,
      }),
    ).toEqual({
      platform: "https://saved.example.com",
      fromEnvOnly: false,
    });
  });

  it("falls back to saved currentPlatform when only env base url is set (no token pair)", () => {
    expect(
      resolveWhoamiPlatform({
        urlArg: undefined,
        currentPlatform: "https://saved.example.com",
        envBaseUrl: "https://env.example.com",
        envToken: undefined,
      }),
    ).toEqual({
      platform: "https://saved.example.com",
      fromEnvOnly: false,
    });
  });

  it("falls back to saved currentPlatform when only env token is set (no base url pair)", () => {
    expect(
      resolveWhoamiPlatform({
        urlArg: undefined,
        currentPlatform: "https://saved.example.com",
        envBaseUrl: undefined,
        envToken: "env-token",
      }),
    ).toEqual({
      platform: "https://saved.example.com",
      fromEnvOnly: false,
    });
  });

  it("normalizes trailing slashes and trims explicit url", () => {
    expect(
      resolveWhoamiPlatform({
        urlArg: "  https://arg.example.com/  ",
        currentPlatform: "https://saved.example.com",
        envBaseUrl: "https://env.example.com",
        envToken: "t",
      }),
    ).toEqual({
      platform: "https://arg.example.com",
      fromEnvOnly: false,
    });
  });

  it("normalizes trailing slash on env base url in env-only mode", () => {
    expect(
      resolveWhoamiPlatform({
        urlArg: undefined,
        currentPlatform: "https://saved.example.com",
        envBaseUrl: "https://env.example.com/",
        envToken: "tok",
      }),
    ).toEqual({
      platform: "https://env.example.com",
      fromEnvOnly: true,
    });
  });

  it("returns no platform when nothing is available", () => {
    expect(
      resolveWhoamiPlatform({
        urlArg: undefined,
        currentPlatform: undefined,
        envBaseUrl: undefined,
        envToken: undefined,
      }),
    ).toEqual({ platform: null, fromEnvOnly: false });
  });
});
