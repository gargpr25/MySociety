import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type InvoiceData = {
  societyName: string;
  flatNo: string;
  period: string;
  dueDate: string;
  lineItems: Array<{
    description: string;
    qty: number;
    rate: number;
    amount: number;
    taxAmount: number;
  }>;
  subtotal: number;
  taxTotal: number;
  arrearsCarryForward: number;
  totalDue: number;
  paidAmount: number;
  status: string;
};

export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - margin;

  function text(str: string, x: number, yPos: number, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 11;
    const f = opts.bold ? fontBold : font;
    const [r, g, b] = opts.color ?? [0, 0, 0];
    page.drawText(str, { x, y: yPos, size, font: f, color: rgb(r, g, b) });
  }

  function line(yPos: number) {
    page.drawLine({ start: { x: margin, y: yPos }, end: { x: width - margin, y: yPos }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  }

  // Header
  text("mySociety", margin, y, { size: 20, bold: true, color: [0.1, 0.45, 0.91] });
  text("TAX INVOICE", width - margin - 100, y, { size: 14, bold: true });
  y -= 20;
  text(data.societyName, margin, y, { size: 11, color: [0.3, 0.3, 0.3] });
  y -= 30;
  line(y);
  y -= 20;

  // Bill details
  text("Flat / Unit:", margin, y, { bold: true });
  text(data.flatNo, margin + 100, y);
  text("Period:", margin + 280, y, { bold: true });
  text(data.period, margin + 340, y);
  y -= 18;
  text("Due Date:", margin, y, { bold: true });
  text(data.dueDate, margin + 100, y);
  text("Status:", margin + 280, y, { bold: true });
  const statusColor: [number, number, number] =
    data.status === "paid" ? [0, 0.6, 0] : data.status === "overdue" ? [0.8, 0, 0] : [0, 0, 0];
  text(data.status.toUpperCase(), margin + 340, y, { color: statusColor, bold: true });
  y -= 30;
  line(y);
  y -= 20;

  // Line items header
  const colDesc = margin;
  const colQty = margin + 230;
  const colRate = margin + 290;
  const colAmt = margin + 360;
  const colTax = margin + 420;
  const colTotal = margin + 460;

  text("Description", colDesc, y, { bold: true, size: 10 });
  text("Qty", colQty, y, { bold: true, size: 10 });
  text("Rate", colRate, y, { bold: true, size: 10 });
  text("Amount", colAmt, y, { bold: true, size: 10 });
  text("Tax", colTax, y, { bold: true, size: 10 });
  text("Total", colTotal, y, { bold: true, size: 10 });
  y -= 6;
  line(y);
  y -= 14;

  for (const item of data.lineItems) {
    const total = item.amount + item.taxAmount;
    text(item.description.slice(0, 30), colDesc, y, { size: 10 });
    text(String(item.qty), colQty, y, { size: 10 });
    text(`₹${item.rate.toFixed(2)}`, colRate, y, { size: 10 });
    text(`₹${item.amount.toFixed(2)}`, colAmt, y, { size: 10 });
    text(`₹${item.taxAmount.toFixed(2)}`, colTax, y, { size: 10 });
    text(`₹${total.toFixed(2)}`, colTotal, y, { size: 10 });
    y -= 18;
  }

  y -= 10;
  line(y);
  y -= 20;

  // Totals
  const colLabel = width - margin - 200;
  const colValue = width - margin - 60;
  function totRow(label: string, value: string, bold = false) {
    text(label, colLabel, y, { bold, size: 11 });
    text(value, colValue, y, { bold, size: 11 });
    y -= 18;
  }

  totRow("Subtotal", `₹${data.subtotal.toFixed(2)}`);
  totRow("Tax", `₹${data.taxTotal.toFixed(2)}`);
  if (data.arrearsCarryForward > 0) {
    totRow("Arrears carried forward", `₹${data.arrearsCarryForward.toFixed(2)}`);
  }
  y -= 4;
  line(y);
  y -= 18;
  totRow("Total Due", `₹${data.totalDue.toFixed(2)}`, true);
  if (data.paidAmount > 0) {
    totRow("Paid", `₹${data.paidAmount.toFixed(2)}`);
    totRow("Balance", `₹${(data.totalDue - data.paidAmount).toFixed(2)}`, true);
  }

  return doc.save();
}
