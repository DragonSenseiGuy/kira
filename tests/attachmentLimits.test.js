/**
 * Tests for the per-message attachment limits in useAttachments: the count
 * cap and the total encoded size that keeps requests under the Hack Club
 * proxy's 20 MiB body limit.
 */

import { describe, it, expect } from "vitest";
import { useAttachments } from "../app/composables/useAttachments.js";

function textFile(name, bytes) {
  return new File(["a".repeat(bytes)], name, { type: "text/plain" });
}

describe("useAttachments limits", () => {
  it("accepts up to 100 attachments and rejects the 101st", async () => {
    const { addFile, attachments, error, MAX_ATTACHMENTS } = useAttachments();
    expect(MAX_ATTACHMENTS).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect((await addFile(textFile(`f${i}.txt`, 10), false)).success).toBe(true);
    }
    const result = await addFile(textFile("extra.txt", 10), false);
    expect(result.success).toBe(false);
    expect(error.value).toBe("Maximum of 100 attachments allowed.");
    expect(attachments.value).toHaveLength(100);
  });

  it("rejects a file that would push the encoded total past 19MB", async () => {
    const { addFile, attachments, error, MAX_TOTAL_ATTACHMENT_SIZE } = useAttachments();
    const fileBytes = 4 * 1024 * 1024;
    for (let i = 0; i < 3; i++) {
      expect((await addFile(textFile(`big${i}.txt`, fileBytes), false)).success).toBe(true);
    }
    const result = await addFile(textFile("big3.txt", fileBytes), false);
    expect(result.success).toBe(false);
    expect(error.value).toContain('"big3.txt" doesn\'t fit');
    expect(attachments.value).toHaveLength(3);
    const total = attachments.value.reduce((sum, a) => sum + a.dataUrl.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_ATTACHMENT_SIZE);

    expect((await addFile(textFile("small.txt", 1024), false)).success).toBe(true);
  });

  it("frees budget when an attachment is removed", async () => {
    const { addFile, removeAttachment, attachments } = useAttachments();
    const fileBytes = 4 * 1024 * 1024;
    for (let i = 0; i < 3; i++) await addFile(textFile(`big${i}.txt`, fileBytes), false);
    expect((await addFile(textFile("big3.txt", fileBytes), false)).success).toBe(false);
    removeAttachment(attachments.value[0].id);
    expect((await addFile(textFile("big3.txt", fileBytes), false)).success).toBe(true);
  });

  it("keeps a rejection visible when a later file in the batch fits", async () => {
    const { addFiles, attachments, error } = useAttachments();
    const fileBytes = 4 * 1024 * 1024;
    await addFiles([
      ...Array.from({ length: 4 }, (_, i) => textFile(`big${i}.txt`, fileBytes)),
      textFile("small.txt", 10),
    ], false);
    expect(attachments.value.map((a) => a.filename)).toEqual(["big0.txt", "big1.txt", "big2.txt", "small.txt"]);
    expect(error.value).toContain('"big3.txt" doesn\'t fit');
  });

  it("summarises several rejections in one batch", async () => {
    const { addFiles, attachments, error } = useAttachments();
    await addFiles(Array.from({ length: 103 }, (_, i) => textFile(`f${i}.txt`, 10)), false);
    expect(attachments.value).toHaveLength(100);
    expect(error.value).toBe("Maximum of 100 attachments allowed. 2 more file(s) were not attached.");
  });

  it("clears the error after a fully successful batch", async () => {
    const { addFiles, error } = useAttachments();
    error.value = "old";
    await addFiles([textFile("a.txt", 10)], false);
    expect(error.value).toBe(null);
  });
});
