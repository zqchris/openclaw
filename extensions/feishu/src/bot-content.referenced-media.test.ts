import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "../runtime-api.js";

const downloadMessageResourceFeishuMock = vi.hoisted(() => vi.fn());
const saveMediaBufferMock = vi.hoisted(() => vi.fn());
const detectMimeMock = vi.hoisted(() => vi.fn(async () => "image/png"));

vi.mock("./media.js", () => ({
  downloadMessageResourceFeishu: downloadMessageResourceFeishuMock,
}));

vi.mock("./runtime.js", () => ({
  getFeishuRuntime: () => ({
    channel: {
      media: {
        saveMediaBuffer: saveMediaBufferMock,
      },
    },
    media: {
      detectMime: detectMimeMock,
    },
  }),
}));

let resolveFeishuReferencedMessageMedia: typeof import("./bot-content.js").resolveFeishuReferencedMessageMedia;
let clearFeishuReferencedMediaCacheForTests: typeof import("./bot-content.js").clearFeishuReferencedMediaCacheForTests;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ resolveFeishuReferencedMessageMedia, clearFeishuReferencedMediaCacheForTests } =
    await import("./bot-content.js"));
  clearFeishuReferencedMediaCacheForTests();
});

afterEach(() => {
  clearFeishuReferencedMediaCacheForTests();
});

describe("resolveFeishuReferencedMessageMedia", () => {
  it("downloads, saves, and reports byte count for a fresh image_key", async () => {
    const buf = Buffer.from("img-bytes");
    downloadMessageResourceFeishuMock.mockResolvedValueOnce({
      buffer: buf,
      contentType: "image/png",
    });
    saveMediaBufferMock.mockResolvedValueOnce({
      path: "/media/inbound/uuid-1.png",
      contentType: "image/png",
    });

    const out = await resolveFeishuReferencedMessageMedia({
      cfg: {} as ClawdbotConfig,
      messageId: "om_quoted_1",
      messageType: "image",
      mediaKeys: { imageKey: "img_v2_abc" },
      maxBytes: 1024 * 1024,
      accountId: "acct_a",
    });

    expect(out.media).toEqual([
      {
        path: "/media/inbound/uuid-1.png",
        contentType: "image/png",
        placeholder: "<media:image>",
      },
    ]);
    expect(out.downloadedBytes).toBe(buf.byteLength);
    expect(downloadMessageResourceFeishuMock).toHaveBeenCalledTimes(1);
    expect(saveMediaBufferMock).toHaveBeenCalledTimes(1);
  });

  it("returns the cached media on a repeat call for the same image_key without re-downloading", async () => {
    const buf = Buffer.from("img-bytes");
    downloadMessageResourceFeishuMock.mockResolvedValueOnce({
      buffer: buf,
      contentType: "image/png",
    });
    saveMediaBufferMock.mockResolvedValueOnce({
      path: "/media/inbound/uuid-1.png",
      contentType: "image/png",
    });

    const first = await resolveFeishuReferencedMessageMedia({
      cfg: {} as ClawdbotConfig,
      messageId: "om_quoted_1",
      messageType: "image",
      mediaKeys: { imageKey: "img_shared" },
      maxBytes: 1024 * 1024,
      accountId: "acct_a",
    });
    const second = await resolveFeishuReferencedMessageMedia({
      cfg: {} as ClawdbotConfig,
      // Same key referenced from a different message later in the topic.
      messageId: "om_history_2",
      messageType: "image",
      mediaKeys: { imageKey: "img_shared" },
      maxBytes: 1024 * 1024,
      accountId: "acct_a",
    });

    expect(first.media).toEqual(second.media);
    expect(first.downloadedBytes).toBe(buf.byteLength);
    expect(second.downloadedBytes).toBe(0);
    expect(downloadMessageResourceFeishuMock).toHaveBeenCalledTimes(1);
    expect(saveMediaBufferMock).toHaveBeenCalledTimes(1);
  });

  it("scopes the cache by accountId so two accounts don't cross-pollute", async () => {
    downloadMessageResourceFeishuMock.mockResolvedValue({
      buffer: Buffer.from("x"),
      contentType: "image/png",
    });
    saveMediaBufferMock
      .mockResolvedValueOnce({ path: "/media/inbound/a.png", contentType: "image/png" })
      .mockResolvedValueOnce({ path: "/media/inbound/b.png", contentType: "image/png" });

    await resolveFeishuReferencedMessageMedia({
      cfg: {} as ClawdbotConfig,
      messageId: "om_1",
      messageType: "image",
      mediaKeys: { imageKey: "shared_key" },
      maxBytes: 1024 * 1024,
      accountId: "acct_a",
    });
    await resolveFeishuReferencedMessageMedia({
      cfg: {} as ClawdbotConfig,
      messageId: "om_2",
      messageType: "image",
      mediaKeys: { imageKey: "shared_key" },
      maxBytes: 1024 * 1024,
      accountId: "acct_b",
    });

    expect(downloadMessageResourceFeishuMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures so transient API errors can be retried", async () => {
    downloadMessageResourceFeishuMock
      .mockRejectedValueOnce(new Error("transient 503"))
      .mockResolvedValueOnce({ buffer: Buffer.from("x"), contentType: "image/png" });
    saveMediaBufferMock.mockResolvedValueOnce({
      path: "/media/inbound/retry.png",
      contentType: "image/png",
    });

    const failed = await resolveFeishuReferencedMessageMedia({
      cfg: {} as ClawdbotConfig,
      messageId: "om_1",
      messageType: "image",
      mediaKeys: { imageKey: "k" },
      maxBytes: 1024 * 1024,
      accountId: "acct_a",
    });
    const recovered = await resolveFeishuReferencedMessageMedia({
      cfg: {} as ClawdbotConfig,
      messageId: "om_1",
      messageType: "image",
      mediaKeys: { imageKey: "k" },
      maxBytes: 1024 * 1024,
      accountId: "acct_a",
    });

    expect(failed.media).toEqual([]);
    expect(recovered.media).toHaveLength(1);
    expect(downloadMessageResourceFeishuMock).toHaveBeenCalledTimes(2);
  });

  it("returns empty when neither image_key nor file_key is present", async () => {
    const out = await resolveFeishuReferencedMessageMedia({
      cfg: {} as ClawdbotConfig,
      messageId: "om_1",
      messageType: "text",
      mediaKeys: {},
      maxBytes: 1024 * 1024,
    });

    expect(out.media).toEqual([]);
    expect(out.downloadedBytes).toBe(0);
    expect(downloadMessageResourceFeishuMock).not.toHaveBeenCalled();
  });
});
