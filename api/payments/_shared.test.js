import { describe, expect, it } from "vitest";

import { buildEnvErrorMessage, createAlipaySignContent, getMissingEnv } from "./_shared.js";

describe("payment shared helpers", () => {
  it("collects missing environment variables", () => {
    expect(getMissingEnv({ A: "1", B: "", C: "   ", D: "ok" })).toEqual(["B", "C"]);
    expect(buildEnvErrorMessage(["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY"])).toBe(
      "缺少关键环境变量：ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY",
    );
  });

  it("builds alipay sign content in sorted order without sign fields", () => {
    expect(
      createAlipaySignContent({
        sign: "abc",
        b: "2",
        a: "1",
        empty: "",
        sign_type: "RSA2",
      }),
    ).toBe("a=1&b=2&sign_type=RSA2");
    expect(
      createAlipaySignContent(
        {
          sign: "abc",
          b: "2",
          a: "1",
          sign_type: "RSA2",
        },
        { excludeSignType: true },
      ),
    ).toBe("a=1&b=2");
  });
});
