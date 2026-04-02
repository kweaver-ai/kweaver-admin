import { describe, expect, it } from "vitest";

import { formatColumns } from "../../utils/output";

describe("formatColumns", () => {
  it("formats headers and rows into aligned plain columns", () => {
    const output = formatColumns(
      ["Name", "Age", "Role"],
      [
        ["Alice", 9, "admin"],
        ["Bob", 12, "operator"],
      ],
    );

    expect(output).toBe(
      ["Name   Age  Role", "Alice  9    admin", "Bob    12   operator"].join(
        "\n",
      ),
    );
  });

  it("pads missing row values as empty cells", () => {
    const output = formatColumns(
      ["Name", "Status", "Region"],
      [["svc-a", "active"], ["svc-b"]],
    );

    expect(output).toBe(
      ["Name   Status  Region", "svc-a  active", "svc-b"].join("\n"),
    );
  });
});
