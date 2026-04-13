import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

import { generateImage } from "@/lib/ai-generator";

describe("generateImage cancellation", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns canceled immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await generateImage({
      prompt: "测试商品图",
      imageBase64: "data:image/png;base64,ZmFrZQ==",
      aspectRatio: "1:1",
      n: 1,
      imageType: "主图",
      textLanguage: "CN 中文",
      signal: controller.signal,
    });

    expect(result).toEqual({
      images: [],
      error: "任务已取消",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
