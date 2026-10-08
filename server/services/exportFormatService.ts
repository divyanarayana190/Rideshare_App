import type { Response } from "express";
import PDFDocument from "pdfkit";

export type ExportFormat = "csv" | "json" | "tsv" | "pdf";

export function escapeCsvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))].join("\n");
}

export function toTsv(headers: string[], rows: unknown[][]): string {
  const escape = (v: unknown) => String(v ?? "").replace(/\t/g, " ");
  return ["\uFEFF" + headers.join("\t"), ...rows.map((r) => r.map(escape).join("\t"))].join("\n");
}

export async function toPdfBuffer(title: string, headers: string[], rows: unknown[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).text(title, { underline: true });
    doc.fontSize(8).fillColor("#666").text(`Generated ${new Date().toISOString()}`, { lineGap: 4 });
    doc.moveDown(0.5);
    doc.fillColor("#000");

    const colCount = headers.length;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / colCount;

    let y = doc.y;
    const rowHeight = 14;

    doc.font("Helvetica-Bold").fontSize(7);
    headers.forEach((h, i) => {
      doc.text(String(h), doc.page.margins.left + i * colWidth, y, { width: colWidth - 4, lineBreak: false });
    });
    y += rowHeight;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke("#ccc");
    y += 4;

    doc.font("Helvetica").fontSize(6);
    for (const row of rows) {
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage({ layout: "landscape" });
        y = doc.page.margins.top;
      }
      row.forEach((cell, i) => {
        const text = cell == null ? "" : String(cell).slice(0, 80);
        doc.text(text, doc.page.margins.left + i * colWidth, y, { width: colWidth - 4, lineBreak: false });
      });
      y += rowHeight;
    }

    doc.end();
  });
}

export async function sendExport(
  res: Response,
  format: ExportFormat,
  filename: string,
  headers: string[],
  rows: unknown[][],
  jsonData?: unknown,
) {
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}_${stamp}.json"`);
    res.send(JSON.stringify(jsonData ?? rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))), null, 2));
    return;
  }

  if (format === "pdf") {
    const buf = await toPdfBuffer(filename.replace(/_/g, " "), headers, rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}_${stamp}.pdf"`);
    res.send(buf);
    return;
  }

  if (format === "tsv") {
    res.setHeader("Content-Type", "text/tab-separated-values; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}_${stamp}.tsv"`);
    res.send(toTsv(headers, rows));
    return;
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}_${stamp}.csv"`);
  res.send(toCsv(headers, rows));
}

export function parseExportFormat(raw: unknown): ExportFormat {
  const f = String(raw || "csv").toLowerCase();
  if (f === "json" || f === "tsv" || f === "pdf") return f;
  return "csv";
}
