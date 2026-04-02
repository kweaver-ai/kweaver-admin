import chalk from "chalk";

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printJsonLine(data: unknown): void {
  console.log(JSON.stringify(data));
}

export function formatColumns(
  head: string[],
  rows: (string | number)[][],
): string {
  const columnCount = head.length;
  const stringRows = rows.map((row) =>
    row.slice(0, columnCount).map((value) => String(value)),
  );
  const widths = head.map((header, index) => {
    const rowWidths = stringRows.map((row) => row[index]?.length ?? 0);
    return Math.max(header.length, ...rowWidths);
  });

  const formatRow = (cells: string[]): string =>
    widths
      .map((width, index) => {
        const cell = cells[index] ?? "";
        return cell.padEnd(width);
      })
      .join("  ")
      .trimEnd();

  const lines: string[] = [formatRow(head)];
  for (const row of stringRows) {
    lines.push(formatRow(row));
  }
  return lines.join("\n");
}

export function printColumns(head: string[], rows: (string | number)[][]): void {
  const output = formatColumns(head, rows);
  const [header, ...rest] = output.split("\n");
  const lines = [chalk.cyan(header), ...rest];
  console.log(lines.join("\n"));
}

export const printTable = printColumns;
