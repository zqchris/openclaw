import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "../runtime-api.js";

const saveMessageResourceFeishuMock = vi.hoisted(() => vi.fn());

vi.mock("./media.js", () => ({
  saveMessageResourceFeishu: saveMessageResourceFeishuMock,
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
    saveMessageResourceFeishuMock.mockResolvedValueOnce({
      saved: {
        path: "/media/inbound/uuid-1.png",
        contentType: "image/png",
        size: buf.byteLength,
      },
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
    expect(saveMessageResourceFeishuMock).toHaveBeenCalledTimes(1);
    expect(saveMessageResourceFeishuMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxBytes: 1024 * 1024 }),
    );
  });

  it("downloads every embedded post image and media resource within the shared budget", async () => {
    const imageBuffer = Buffer.from("img");
    const videoBuffer = Buffer.from("vid");
    saveMessageResourceFeishuMock
      .mockResolvedValueOnce({
        saved: {
          path: "/media/inbound/img.png",
          contentType: "image/png",
          size: imageBuffer.byteLength,
        },
        contentType: "image/png",
      })
      .mockResolvedValueOnce({
        saved: {
          path: "/media/inbound/clip.mp4",
          contentType: "video/mp4",
          size: videoBuffer.byteLength,
        },
        contentType: "video/mp4",
      });

    const out = await resolveFeishuReferencedMessageMedia({
      cfg: {} as ClawdbotConfig,
      messageId: "om_post_1",
      messageType: "post",
      mediaKeys: {
        imageKeys: ["img_post_1"],
        mediaKeys: [{ fileKey: "file_post_1", fileName: "clip.mp4" }],
      },
      maxBytes: 10,
      accountId: "acct_a",
    });

    expect(out.media).toEqual([
      {
        path: "/media/inbound/img.png",
        contentType: "image/png",
        placeholder: "<media:image>",
      },
      {
        path: "/media/inbound/clip.mp4",
        contentType: "video/mp4",
        placeholder: "<media:video>",
      },
    ]);
    expect(out.downloadedBytes).toBe(imageBuffer.byteLength + videoBuffer.byteLength);
    expect(saveMessageResourceFeishuMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileKey: "img_post_1",
        type: "image",
        maxBytes: 10,
      }),
    );
    expect(saveMessageResourceFeishuMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileKey: "file_post_1",
        type: "file",
        maxBytes: 7,
        originalFilename: "clip.mp4",
      }),
    );
  });

  it("returns the cached media on a repeat call for the same image_key without re-downloading", async () => {
    const buf = Buffer.from("img-bytes");
    saveMessageResourceFeishuMock.mockResolvedValueOnce({
      saved: {
        path: "/media/inbound/uuid-1.png",
        contentType: "image/png",
        size: buf.byteLength,
      },
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
    expect(saveMessageResourceFeishuMock).toHaveBeenCalledTimes(1);
  });

  it("scopes the cache by accountId so two accounts don't cross-pollute", async () => {
    saveMessageResourceFeishuMock
      .mockResolvedValueOnce({
        saved: { path: "/media/inbound/a.png", contentType: "image/png", size: 1 },
      })
      .mockResolvedValueOnce({
        saved: { path: "/media/inbound/b.png", contentType: "image/png", size: 1 },
      });

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

    expect(saveMessageResourceFeishuMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures so transient API errors can be retried", async () => {
    saveMessageResourceFeishuMock
      .mockRejectedValueOnce(new Error("transient 503"))
      .mockResolvedValueOnce({
        saved: { path: "/media/inbound/retry.png", contentType: "image/png", size: 1 },
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
    expect(saveMessageResourceFeishuMock).toHaveBeenCalledTimes(2);
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
    expect(saveMessageResourceFeishuMock).not.toHaveBeenCalled();
  });
});
