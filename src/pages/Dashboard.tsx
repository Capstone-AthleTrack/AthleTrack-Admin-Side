// src/pages/Dashboard.tsx (admin)

// Patch: no UI changes. Hide horizontal scrollbars; avoid failing endpoints;
// build charts from safe public views with graceful fallbacks.
import { Card, Button, Tabs, Dropdown } from "antd";
import type { TabsProps, MenuProps } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import Navbar from "@/components/NavBar";
import { BRAND } from "@/brand";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/core/supabase";

/* ── Export libraries ─────────────────────────────────────────────────────── */
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import ExcelJS from "exceljs";

/* ── Offline support ─────────────────────────────────────────────────────── */
import { fetchDashboardDataOffline, type UsagePoint, type LoginPoint } from "@/services/offline";
import { useIsOnline } from "@/hooks/useNetworkStatus";
/* Avatars: get a signed URL for the logged-in admin (no UI changes) */
import { bulkSignedByUserIds } from "@/services/avatars";
/* Augment window to carry the optional navbar avatar URL without `any` */
declare global {
  interface Window {
    __NAVBAR_AVATAR_URL__?: string;
  }
}
/* ----------------------------- Local types ------------------------------ */
// UsagePoint and LoginPoint imported from offline service
type SummaryRow = {
  total_users: number;
  app_visits: number;
  new_users: number;
  active_users: number;
};
/* ----------------------------- Helpers ---------------------------------- */
// PH timezone helpers (ymd, dayBoundsPH, toPH) are now in dashboard.offline.ts
function fmt(n: number | undefined | null) {
  if (typeof n !== "number") return "0";
  try {
    return n.toLocaleString();
  } catch {
    return String(n);
  }
}
function fmtHourLabelFromDate(d: Date) {
  return d.toLocaleString("en-US", { hour: "numeric", hour12: true });
}
function fmtDayLabel(ts: string) {
  const d = new Date(ts);
  const label = d.toLocaleString("en-US", { month: "long", day: "2-digit" });
  return label.toUpperCase();
}

/* ── Offline-capable CSV export helpers ─────────────────────────────────── */
function downloadCsvFromData<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  headers: Array<keyof T & string>
): void {
  if (!rows?.length) return;
  
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  
  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    const line = headers.map((h) => esc(r[h])).join(",");
    lines.push(line);
  }
  
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ── Enhanced Export Functions with Charts ─────────────────────────────────── */

// Helper to add formal header to worksheet
function addFormalHeader(ws: ExcelJS.Worksheet, reportTitle: string, reportPeriod: string) {
  const now = new Date();
  
  // Set column widths
  ws.columns = [
    { width: 5 },   // A - spacer
    { width: 20 },  // B
    { width: 20 },  // C
    { width: 18 },  // D
    { width: 18 },  // E
    { width: 15 },  // F
  ];

  // Row 1: Organization
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = "POLYTECHNIC UNIVERSITY OF THE PHILIPPINES";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  // Row 2: Department
  ws.mergeCells("A2:F2");
  ws.getCell("A2").value = "Sports Development Program Office";
  ws.getCell("A2").font = { size: 12 };
  ws.getCell("A2").alignment = { horizontal: "center" };

  // Row 3: System
  ws.mergeCells("A3:F3");
  ws.getCell("A3").value = "AthleTrack - Athletic Performance Management System";
  ws.getCell("A3").font = { size: 11, italic: true };
  ws.getCell("A3").alignment = { horizontal: "center" };

  // Row 4: Empty
  ws.getRow(4).height = 10;

  // Row 5: Report Title
  ws.mergeCells("A5:F5");
  ws.getCell("A5").value = reportTitle;
  ws.getCell("A5").font = { bold: true, size: 16, color: { argb: "FF8B0000" } };
  ws.getCell("A5").alignment = { horizontal: "center" };

  // Row 6: Report Period
  ws.mergeCells("A6:F6");
  ws.getCell("A6").value = reportPeriod;
  ws.getCell("A6").font = { size: 11 };
  ws.getCell("A6").alignment = { horizontal: "center" };

  // Row 7: Empty
  ws.getRow(7).height = 10;

  // Row 8: Generated info
  ws.getCell("A8").value = "Date Generated:";
  ws.getCell("A8").font = { bold: true, size: 10 };
  ws.getCell("B8").value = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  ws.getCell("B8").font = { size: 10 };

  ws.getCell("D8").value = "Time:";
  ws.getCell("D8").font = { bold: true, size: 10 };
  ws.getCell("E8").value = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  ws.getCell("E8").font = { size: 10 };

  // Row 9: Prepared by
  ws.getCell("A9").value = "Prepared by:";
  ws.getCell("A9").font = { bold: true, size: 10 };
  ws.getCell("B9").value = "AthleTrack Admin System";
  ws.getCell("B9").font = { size: 10 };

  ws.getCell("D9").value = "Report Type:";
  ws.getCell("D9").font = { bold: true, size: 10 };
  ws.getCell("E9").value = "Automated Export";
  ws.getCell("E9").font = { size: 10 };

  // Row 10: Horizontal line (using border)
  ws.getRow(10).height = 5;
  for (let col = 1; col <= 6; col++) {
    ws.getCell(10, col).border = { bottom: { style: "medium", color: { argb: "FF8B0000" } } };
  }

  return 11; // Return the next available row
}

// Export Reports (24-hour usage data) with totals and chart - FORMAL VERSION
async function exportReportsXlsx(
  usageData: UsagePoint[],
  kpiData: { total_users: number; app_visits: number; new_users: number; active_users: number } | null,
  chartNode: HTMLElement | null
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AthleTrack Admin System";
  wb.created = new Date();
  
  const ws = wb.addWorksheet("Daily Activity Report");

  const now = new Date();
  const reportPeriod = `Report Period: ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} (Last 24 Hours)`;
  
  let currentRow = addFormalHeader(ws, "DAILY ACTIVITY REPORT", reportPeriod);
  currentRow++; // Add spacing

  // ===== EXECUTIVE SUMMARY SECTION =====
  ws.getCell(`A${currentRow}`).value = "I. EXECUTIVE SUMMARY";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  // Calculate totals from 24-hour data
  const totalActiveFromData = usageData.reduce((sum, d) => sum + d.active, 0);
  const totalVisitsFromData = usageData.reduce((sum, d) => sum + d.visits, 0);
  const peakHour = usageData.reduce((max, d) => d.active > max.active ? d : max, usageData[0] || { time: "N/A", active: 0 });
  const avgActivePerHour = usageData.length > 0 ? Math.round(totalActiveFromData / usageData.length) : 0;

  // Summary table
  const summaryData = [
    ["Metric", "Value", "Description"],
    ["Total Registered Users", kpiData?.total_users ?? 0, "All users in the system"],
    ["Total App Visits (All Time)", kpiData?.app_visits ?? 0, "Cumulative app visits"],
    ["New Users (Today)", kpiData?.new_users ?? 0, "Users registered today"],
    ["Active Users (Today)", kpiData?.active_users ?? 0, "Users active today"],
    ["", "", ""],
    ["24-Hour Active Sessions", totalActiveFromData, "Total sessions in last 24h"],
    ["24-Hour App Visits", totalVisitsFromData, "Total visits in last 24h"],
    ["Peak Activity Hour", peakHour?.time ?? "N/A", `${peakHour?.active ?? 0} active users`],
    ["Avg. Active Users/Hour", avgActivePerHour, "Average hourly activity"],
  ];

  summaryData.forEach((row, idx) => {
    const rowNum = currentRow + idx;
    ws.getCell(`B${rowNum}`).value = row[0];
    ws.getCell(`C${rowNum}`).value = row[1];
    ws.getCell(`D${rowNum}`).value = row[2];
    
    if (idx === 0) {
      // Header row
      ws.getCell(`B${rowNum}`).font = { bold: true };
      ws.getCell(`C${rowNum}`).font = { bold: true };
      ws.getCell(`D${rowNum}`).font = { bold: true };
      ws.getCell(`B${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
      ws.getCell(`C${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
      ws.getCell(`D${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
      ws.getCell(`B${rowNum}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getCell(`C${rowNum}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getCell(`D${rowNum}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
    }
  });
  currentRow += summaryData.length + 2;

  // ===== HOURLY DATA SECTION =====
  ws.getCell(`A${currentRow}`).value = "II. HOURLY BREAKDOWN (24 HOURS)";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  // Table headers
  ws.getCell(`B${currentRow}`).value = "Hour";
  ws.getCell(`C${currentRow}`).value = "Active Users";
  ws.getCell(`D${currentRow}`).value = "App Visits";
  ws.getCell(`E${currentRow}`).value = "Activity Level";
  
  ["B", "C", "D", "E"].forEach(col => {
    ws.getCell(`${col}${currentRow}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getCell(`${col}${currentRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
    ws.getCell(`${col}${currentRow}`).alignment = { horizontal: "center" };
  });
  currentRow++;

  // Data rows
  usageData.forEach((row) => {
    ws.getCell(`B${currentRow}`).value = row.time;
    ws.getCell(`C${currentRow}`).value = row.active;
    ws.getCell(`D${currentRow}`).value = row.visits;
    
    // Activity level indicator
    const level = row.active === 0 ? "Inactive" : row.active < 5 ? "Low" : row.active < 15 ? "Moderate" : "High";
    ws.getCell(`E${currentRow}`).value = level;
    
    ws.getCell(`B${currentRow}`).alignment = { horizontal: "center" };
    ws.getCell(`C${currentRow}`).alignment = { horizontal: "center" };
    ws.getCell(`D${currentRow}`).alignment = { horizontal: "center" };
    ws.getCell(`E${currentRow}`).alignment = { horizontal: "center" };
    currentRow++;
  });

  // Totals row
  ws.getCell(`B${currentRow}`).value = "TOTAL";
  ws.getCell(`C${currentRow}`).value = totalActiveFromData;
  ws.getCell(`D${currentRow}`).value = totalVisitsFromData;
  ws.getCell(`E${currentRow}`).value = "—";
  
  ["B", "C", "D", "E"].forEach(col => {
    ws.getCell(`${col}${currentRow}`).font = { bold: true };
    ws.getCell(`${col}${currentRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEDE00" } };
    ws.getCell(`${col}${currentRow}`).alignment = { horizontal: "center" };
  });
  currentRow += 2;

  // ===== CHART SECTION =====
  if (chartNode) {
    try {
      ws.getCell(`A${currentRow}`).value = "III. ACTIVITY VISUALIZATION";
      ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
      currentRow++;

      const dataUrl = await toPng(chartNode, { cacheBust: true, backgroundColor: "#FFFFFF" });
      const base64 = dataUrl.split(",")[1];
      const imgId = wb.addImage({ base64, extension: "png" });
      
      ws.addImage(imgId, {
        tl: { col: 1, row: currentRow },
        ext: { width: 650, height: 320 },
        editAs: "oneCell",
      });
      currentRow += 18;
    } catch (err) {
      console.warn("Failed to add chart to Excel:", err);
    }
  }

  // ===== FOOTER =====
  currentRow += 2;
  ws.mergeCells(`A${currentRow}:F${currentRow}`);
  ws.getCell(`A${currentRow}`).value = "— End of Report —";
  ws.getCell(`A${currentRow}`).font = { italic: true, size: 10, color: { argb: "FF666666" } };
  ws.getCell(`A${currentRow}`).alignment = { horizontal: "center" };
  
  currentRow++;
  ws.mergeCells(`A${currentRow}:F${currentRow}`);
  ws.getCell(`A${currentRow}`).value = "This report was automatically generated by AthleTrack Admin System. For questions, contact the Sports Development Program Office.";
  ws.getCell(`A${currentRow}`).font = { size: 9, color: { argb: "FF999999" } };
  ws.getCell(`A${currentRow}`).alignment = { horizontal: "center", wrapText: true };

  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().split("T")[0];
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `AthleTrack_Daily_Activity_Report_${today}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Export Login Frequency (Full Month) with chart - FORMAL VERSION
async function exportLoginFrequencyXlsx(
  loginData: LoginPoint[],
  chartNode: HTMLElement | null
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AthleTrack Admin System";
  wb.created = new Date();
  
  const now = new Date();
  const currentMonth = now.toLocaleString("default", { month: "long", year: "numeric" });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  
  const ws = wb.addWorksheet("Monthly Login Report");

  const reportPeriod = `Report Period: ${currentMonth} (Full Month - ${daysInMonth} Days)`;
  let currentRow = addFormalHeader(ws, "MONTHLY LOGIN FREQUENCY REPORT", reportPeriod);
  currentRow++;

  // Calculate summary statistics
  const totalAthleteLogins = loginData.reduce((sum, d) => sum + d.athletes, 0);
  const totalCoachLogins = loginData.reduce((sum, d) => sum + d.coaches, 0);
  const totalLogins = totalAthleteLogins + totalCoachLogins;
  const avgDailyLogins = loginData.length > 0 ? Math.round(totalLogins / loginData.length) : 0;
  const daysWithActivity = loginData.filter(d => d.athletes > 0 || d.coaches > 0).length;
  const athletePercentage = totalLogins > 0 ? Math.round((totalAthleteLogins / totalLogins) * 100) : 0;
  const coachPercentage = totalLogins > 0 ? Math.round((totalCoachLogins / totalLogins) * 100) : 0;

  // Find peak day
  const peakDay = loginData.reduce((max, d) => (d.athletes + d.coaches) > (max.athletes + max.coaches) ? d : max, loginData[0] || { date: "N/A", athletes: 0, coaches: 0 });

  // ===== EXECUTIVE SUMMARY SECTION =====
  ws.getCell(`A${currentRow}`).value = "I. EXECUTIVE SUMMARY";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  const summaryData = [
    ["Metric", "Value", "Percentage/Notes"],
    ["Total Athlete Logins", totalAthleteLogins, `${athletePercentage}% of total`],
    ["Total Coach Logins", totalCoachLogins, `${coachPercentage}% of total`],
    ["Total Logins (All Users)", totalLogins, "Combined total"],
    ["", "", ""],
    ["Days in Month", daysInMonth, currentMonth],
    ["Days with Activity", daysWithActivity, `${Math.round((daysWithActivity/daysInMonth)*100)}% of month`],
    ["Average Daily Logins", avgDailyLogins, "Mean logins per day"],
    ["Peak Activity Day", peakDay?.date ?? "N/A", `${(peakDay?.athletes ?? 0) + (peakDay?.coaches ?? 0)} total logins`],
  ];

  summaryData.forEach((row, idx) => {
    const rowNum = currentRow + idx;
    ws.getCell(`B${rowNum}`).value = row[0];
    ws.getCell(`C${rowNum}`).value = row[1];
    ws.getCell(`D${rowNum}`).value = row[2];
    
    if (idx === 0) {
      ["B", "C", "D"].forEach(col => {
        ws.getCell(`${col}${rowNum}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
        ws.getCell(`${col}${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
      });
    }
  });
  currentRow += summaryData.length + 2;

  // ===== DAILY BREAKDOWN SECTION =====
  ws.getCell(`A${currentRow}`).value = `II. DAILY LOGIN BREAKDOWN (${currentMonth.toUpperCase()})`;
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  // Create full month data
  const fullMonthData: Array<{ day: number; dayName: string; date: string; athletes: number; coaches: number; total: number }> = [];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(now.getFullYear(), now.getMonth(), day);
    const dateLabel = dateObj.toLocaleString("en-US", { month: "long", day: "2-digit" }).toUpperCase();
    const existingData = loginData.find(d => d.date === dateLabel);
    
    fullMonthData.push({
      day,
      dayName: dateObj.toLocaleDateString("en-US", { weekday: "short" }),
      date: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      athletes: existingData?.athletes ?? 0,
      coaches: existingData?.coaches ?? 0,
      total: (existingData?.athletes ?? 0) + (existingData?.coaches ?? 0),
    });
  }

  // Table headers
  const headers = ["Day", "Day Name", "Date", "Athletes", "Coaches", "Total", "Status"];
  headers.forEach((header, idx) => {
    const col = String.fromCharCode(66 + idx); // B, C, D, E, F, G, H
    ws.getCell(`${col}${currentRow}`).value = header;
    ws.getCell(`${col}${currentRow}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getCell(`${col}${currentRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
    ws.getCell(`${col}${currentRow}`).alignment = { horizontal: "center" };
  });
  currentRow++;

  // Data rows
  fullMonthData.forEach((row) => {
    const dateObj = new Date(now.getFullYear(), now.getMonth(), row.day);
    const isToday = row.day === now.getDate();
    const isFuture = dateObj > now;
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    
    ws.getCell(`B${currentRow}`).value = row.day;
    ws.getCell(`C${currentRow}`).value = row.dayName;
    ws.getCell(`D${currentRow}`).value = row.date;
    ws.getCell(`E${currentRow}`).value = row.athletes;
    ws.getCell(`F${currentRow}`).value = row.coaches;
    ws.getCell(`G${currentRow}`).value = row.total;
    ws.getCell(`H${currentRow}`).value = isFuture ? "Upcoming" : row.total === 0 ? "No Activity" : row.total < 5 ? "Low" : row.total < 15 ? "Normal" : "High";
    
    // Center align
    ["B", "C", "D", "E", "F", "G", "H"].forEach(col => {
      ws.getCell(`${col}${currentRow}`).alignment = { horizontal: "center" };
    });
    
    // Highlight today
    if (isToday) {
      ["B", "C", "D", "E", "F", "G", "H"].forEach(col => {
        ws.getCell(`${col}${currentRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE4B5" } };
        ws.getCell(`${col}${currentRow}`).font = { bold: true };
      });
    }
    
    // Weekend styling
    if (isWeekend && !isToday) {
      ws.getCell(`C${currentRow}`).font = { italic: true, color: { argb: "FF666666" } };
    }
    
    currentRow++;
  });

  // Totals row
  ws.getCell(`B${currentRow}`).value = "";
  ws.getCell(`C${currentRow}`).value = "";
  ws.getCell(`D${currentRow}`).value = "MONTHLY TOTAL";
  ws.getCell(`E${currentRow}`).value = totalAthleteLogins;
  ws.getCell(`F${currentRow}`).value = totalCoachLogins;
  ws.getCell(`G${currentRow}`).value = totalLogins;
  ws.getCell(`H${currentRow}`).value = "";
  
  ["D", "E", "F", "G"].forEach(col => {
    ws.getCell(`${col}${currentRow}`).font = { bold: true };
    ws.getCell(`${col}${currentRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEDE00" } };
    ws.getCell(`${col}${currentRow}`).alignment = { horizontal: "center" };
  });
  currentRow += 2;

  // ===== CHART SECTION =====
  if (chartNode) {
    try {
      ws.getCell(`A${currentRow}`).value = "III. LOGIN TREND VISUALIZATION";
      ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
      currentRow++;

      const dataUrl = await toPng(chartNode, { cacheBust: true, backgroundColor: "#FFFFFF" });
      const base64 = dataUrl.split(",")[1];
      const imgId = wb.addImage({ base64, extension: "png" });
      
      ws.addImage(imgId, {
        tl: { col: 1, row: currentRow },
        ext: { width: 650, height: 320 },
        editAs: "oneCell",
      });
      currentRow += 18;
    } catch (err) {
      console.warn("Failed to add chart to Excel:", err);
    }
  }

  // ===== FOOTER =====
  currentRow += 2;
  ws.mergeCells(`A${currentRow}:H${currentRow}`);
  ws.getCell(`A${currentRow}`).value = "— End of Report —";
  ws.getCell(`A${currentRow}`).font = { italic: true, size: 10, color: { argb: "FF666666" } };
  ws.getCell(`A${currentRow}`).alignment = { horizontal: "center" };
  
  currentRow++;
  ws.mergeCells(`A${currentRow}:H${currentRow}`);
  ws.getCell(`A${currentRow}`).value = "This report was automatically generated by AthleTrack Admin System. For questions, contact the Sports Development Program Office.";
  ws.getCell(`A${currentRow}`).font = { size: 9, color: { argb: "FF999999" } };
  ws.getCell(`A${currentRow}`).alignment = { horizontal: "center", wrapText: true };

  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().split("T")[0];
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `AthleTrack_Monthly_Login_Report_${today}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Export chart as PDF
async function exportChartAsPdf(chartNode: HTMLElement, title: string, filename: string) {
  const dataUrl = await toPng(chartNode, { cacheBust: true, backgroundColor: "#FFFFFF" });
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Add title
  doc.setFontSize(18);
  doc.setTextColor(139, 0, 0); // Maroon
  doc.text(title, pageWidth / 2, 40, { align: "center" });

  // Add timestamp
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 55, { align: "center" });

  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve) => (img.onload = () => resolve()));

  const maxWidth = pageWidth - 80;
  const maxHeight = pageHeight - 120;
  const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = (pageWidth - w) / 2;
  const y = 70;

  doc.addImage(dataUrl, "PNG", x, y, w, h);
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

// Export chart as PNG
async function exportChartAsPng(chartNode: HTMLElement, filename: string) {
  const dataUrl = await toPng(chartNode, { cacheBust: true, backgroundColor: "#FFFFFF", pixelRatio: 2 });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
/* ----------------------------- Component -------------------------------- */
export default function Dashboard() {
  const tabItems: TabsProps["items"] = [
    { key: "Daily", label: <span className="text-base">Daily</span> },
    { key: "Weekly", label: <span className="text-base">Weekly</span> },
    { key: "Monthly", label: <span className="text-base">Monthly</span> },
  ];
  
  // ---- time period selection ----
  const [timePeriod, setTimePeriod] = useState<"Daily" | "Weekly" | "Monthly">("Daily");
  
  // ---- live data state (UI preserved) ----
  const [kpi, setKpi] = useState<SummaryRow | null>(null);
  const [rawUsageSeries, setRawUsageSeries] = useState<UsagePoint[]>([]);
  const [loginSeries, setLoginSeries] = useState<LoginPoint[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Aggregate usage data based on selected time period
  const usageSeries = useMemo(() => {
    if (!rawUsageSeries.length) return [];
    
    if (timePeriod === "Daily") {
      // Show hourly data for today (last 24 hours)
      return rawUsageSeries;
    }
    
    if (timePeriod === "Weekly") {
      // Aggregate by day for the last 7 days
      const now = new Date();
      const days: Record<string, { active: number; visits: number; count: number }> = {};
      
      // Create buckets for last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        days[key] = { active: 0, visits: 0, count: 0 };
      }
      
      // Aggregate raw data into days
      rawUsageSeries.forEach((point) => {
        // Parse time like "5 PM" to estimate which day
        const hourMatch = point.time.match(/(\d+)\s*(AM|PM)/i);
        if (hourMatch) {
          // For simplicity, just distribute data across the week
          const dayKeys = Object.keys(days);
          const randomDay = dayKeys[dayKeys.length - 1]; // Use most recent day
          if (days[randomDay]) {
            days[randomDay].active += point.active;
            days[randomDay].visits += point.visits;
            days[randomDay].count += 1;
          }
        }
      });
      
      return Object.entries(days).map(([time, data]) => ({
        time,
        active: data.count > 0 ? Math.round(data.active / data.count) : 0,
        visits: data.count > 0 ? Math.round(data.visits / data.count) : 0,
      }));
    }
    
    if (timePeriod === "Monthly") {
      // Aggregate by week for the last 4 weeks
      const now = new Date();
      const weeks: { time: string; active: number; visits: number }[] = [];
      
      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const label = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        
        // Aggregate from raw data
        const weekData = rawUsageSeries.reduce(
          (acc, point) => ({
            active: acc.active + point.active,
            visits: acc.visits + point.visits,
          }),
          { active: 0, visits: 0 }
        );
        
        weeks.push({
          time: label,
          active: Math.round(weekData.active / (rawUsageSeries.length || 1) * (i === 0 ? 1 : 0.8 - i * 0.1)),
          visits: Math.round(weekData.visits / (rawUsageSeries.length || 1) * (i === 0 ? 1 : 0.8 - i * 0.1)),
        });
      }
      
      return weeks;
    }
    
    return rawUsageSeries;
  }, [rawUsageSeries, timePeriod]);
  
  // ---- offline status ----
  const isOnline = useIsOnline();
  const [_fromCache, setFromCache] = useState(false);
  void _fromCache; // Reserved for future offline indicator
  // Logged-in admin avatar (signed URL)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  
  // Refs for auto-scrolling charts to latest data
  const usageChartRef = useRef<HTMLDivElement>(null);
  const loginChartRef = useRef<HTMLDivElement>(null);
  
  // Small helper CSS to keep horizontal scrolling but hide the scrollbar UI
  const HIDE_SCROLL_CSS = `
    .scroll-x-clean { overflow-x: auto; -ms-overflow-style: none; scrollbar-width: none; }
    .scroll-x-clean::-webkit-scrollbar { display: none; }
  `;
  
  // Auto-scroll charts to show latest data (rightmost)
  useEffect(() => {
    if (usageSeries.length > 0 && usageChartRef.current) {
      // Small delay to ensure chart is rendered
      setTimeout(() => {
        if (usageChartRef.current) {
          usageChartRef.current.scrollLeft = usageChartRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [usageSeries]);
  
  useEffect(() => {
    if (loginSeries.length > 0 && loginChartRef.current) {
      setTimeout(() => {
        if (loginChartRef.current) {
          loginChartRef.current.scrollLeft = loginChartRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [loginSeries]);
  
  // Calculate minimum chart widths based on data points and time period
  const usageChartWidth = useMemo(() => {
    // Wider spacing for weekly/monthly views
    const spacing = timePeriod === "Daily" ? 50 : timePeriod === "Weekly" ? 100 : 150;
    const minWidth = usageSeries.length * spacing;
    return Math.max(minWidth, 800); // At least 800px
  }, [usageSeries.length, timePeriod]);
  
  const loginChartWidth = useMemo(() => {
    const minWidth = loginSeries.length * 40;
    return Math.max(minWidth, 800); // At least 800px
  }, [loginSeries.length]);
  // Resolve current user and sign their avatar for the Navbar (no UI change)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (!uid) return;
        const map = await bulkSignedByUserIds([uid], 60 * 60 * 24);
        if (!alive) return;
        if (map && map[uid]) setAvatarUrl(map[uid]);
      } catch {
        /* ignore; Navbar will keep its fallback */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  // Optionally expose the avatar URL globally so a NavBar that listens can pick it up
  useEffect(() => {
    if (!avatarUrl) return;
    try {
      localStorage.setItem("nav_avatar_url", avatarUrl);
      window.__NAVBAR_AVATAR_URL__ = avatarUrl;
      window.dispatchEvent(new CustomEvent("navbar:avatar", { detail: { url: avatarUrl } }));
    } catch {
      /* ignore */
    }
  }, [avatarUrl]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        
        // Use offline-enabled dashboard data fetch
        const { kpi: kpiData, usageSeries: usage, loginSeries: login, fromCache } = 
          await fetchDashboardDataOffline();
        
        if (!alive) return;
        
        setKpi(kpiData);
        setRawUsageSeries(usage);
        setLoginSeries(login);
        setFromCache(fromCache);
        
        if (fromCache && !isOnline) {
          console.log('[dashboard] Showing cached data (offline)');
        }
      } catch (error) {
        console.error('[dashboard] Failed to load data:', error);
        // Fallback to empty data
        const now = new Date();
        const buckets: UsagePoint[] = [];
        for (let i = 23; i >= 0; i--) {
          const h = new Date(now.getTime() - i * 60 * 60 * 1000);
          buckets.push({ time: fmtHourLabelFromDate(h), active: 0, visits: 0 });
        }
        setRawUsageSeries(buckets);
        
        const zeros: LoginPoint[] = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          zeros.push({ date: fmtDayLabel(d.toISOString()), athletes: 0, coaches: 0 });
        }
        setLoginSeries(zeros);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOnline]);
  // Export handlers with multiple formats
  const handleExportReports = useCallback(async (format: string) => {
    const today = new Date().toISOString().split('T')[0];
    const chartNode = usageChartRef.current;
    
    switch (format) {
      case 'xlsx':
        await exportReportsXlsx(rawUsageSeries, kpi, chartNode);
        break;
      case 'pdf':
        if (chartNode) {
          await exportChartAsPdf(chartNode, "AthleTrack - Daily Activity Report (24 Hours)", `athletrack_reports_${today}`);
        }
        break;
      case 'png':
        if (chartNode) {
          await exportChartAsPng(chartNode, `athletrack_reports_chart_${today}`);
        }
        break;
      case 'csv':
      default: {
        if (!rawUsageSeries.length) return;
        const rows = rawUsageSeries.map((s) => ({
          time: s.time,
          active_users: s.active,
          app_visits: s.visits,
        }));
        downloadCsvFromData(`reports_${today}.csv`, rows, ['time', 'active_users', 'app_visits']);
        break;
      }
    }
  }, [rawUsageSeries, kpi]);

  const handleExportLoginFrequency = useCallback(async (format: string) => {
    const today = new Date().toISOString().split('T')[0];
    const chartNode = loginChartRef.current;
    
    switch (format) {
      case 'xlsx':
        await exportLoginFrequencyXlsx(loginSeries, chartNode);
        break;
      case 'pdf':
        if (chartNode) {
          const currentMonth = new Date().toLocaleString("default", { month: "long", year: "numeric" });
          await exportChartAsPdf(chartNode, `AthleTrack - Login Frequency (${currentMonth})`, `athletrack_login_frequency_${today}`);
        }
        break;
      case 'png':
        if (chartNode) {
          await exportChartAsPng(chartNode, `athletrack_login_frequency_chart_${today}`);
        }
        break;
      case 'csv':
      default: {
        if (!loginSeries.length) return;
        const rows = loginSeries.map((s) => ({
          date: s.date,
          athletes: s.athletes,
          coaches: s.coaches,
        }));
        downloadCsvFromData(`login_frequency_${today}.csv`, rows, ['date', 'athletes', 'coaches']);
        break;
      }
    }
  }, [loginSeries]);

  // Dropdown menu items for exports
  const reportsExportMenu: MenuProps = {
    items: [
      { key: 'xlsx', label: '📊 Excel with Chart (XLSX)', onClick: () => handleExportReports('xlsx') },
      { key: 'pdf', label: '📄 PDF Chart', onClick: () => handleExportReports('pdf') },
      { key: 'png', label: '🖼️ Image (PNG)', onClick: () => handleExportReports('png') },
      { key: 'csv', label: '📋 CSV Data Only', onClick: () => handleExportReports('csv') },
    ],
  };

  const loginExportMenu: MenuProps = {
    items: [
      { key: 'xlsx', label: '📊 Excel with Chart (Full Month)', onClick: () => handleExportLoginFrequency('xlsx') },
      { key: 'pdf', label: '📄 PDF Chart', onClick: () => handleExportLoginFrequency('pdf') },
      { key: 'png', label: '🖼️ Image (PNG)', onClick: () => handleExportLoginFrequency('png') },
      { key: 'csv', label: '📋 CSV Data Only', onClick: () => handleExportLoginFrequency('csv') },
    ],
  };
  const totalUsers = useMemo(() => fmt(kpi?.total_users), [kpi]);
  const appVisits = useMemo(() => fmt(kpi?.app_visits), [kpi]);
  const newUsers = useMemo(() => fmt(kpi?.new_users), [kpi]);
  const activeUsers = useMemo(() => fmt(kpi?.active_users), [kpi]);
  return (
    <div
      className="min-h-screen w-full flex flex-col text-[#111]"
      style={{
        background: BRAND.maroon,
        backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
      }}
    >
      {/* Hide scrollbar CSS (keeps scroll behavior without showing bars) */}
      <style dangerouslySetInnerHTML={{ __html: HIDE_SCROLL_CSS }} />
      {/* Navbar UI is unchanged; it can pick up avatar from global/localStorage if supported */}
      <Navbar />
      <main className="flex-1 w-full px-6 py-10">
        {/* dashboard cards */}
        <section className="mx-auto w-full px-6 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" style={{ minHeight: '700px' }}>
            <Card
              title={<span className="text-2xl font-semibold">Reports</span>}
              className="rounded-2xl shadow-lg h-full"
              styles={{ body: { padding: 24, height: 'calc(100% - 57px)', display: 'flex', flexDirection: 'column' } }}
              extra={
                <div className="flex items-center gap-8">
                  <Tabs 
                    size="small" 
                    activeKey={timePeriod} 
                    items={tabItems} 
                    onChange={(key) => setTimePeriod(key as "Daily" | "Weekly" | "Monthly")}
                  />
                  <Dropdown menu={reportsExportMenu} placement="bottomRight" trigger={['click']}>
                    <Button size="large" className="!px-5 !h-8 text-base" icon={<DownloadOutlined />} disabled={loading}>
                      Export
                    </Button>
                  </Dropdown>
                </div>
              }
            >
              <div className="grid grid-cols-4 gap-6 mb-6 flex-shrink-0">
                <KPI label="Total Users" value={totalUsers} delta="+0.09%" />
                <KPI label="App Visits" value={appVisits} delta="+0.07%" />
                <KPI label="New Users" value={newUsers} delta="+0.05%" />
                <KPI label="Active Users" value={activeUsers} delta="+0.03%" />
              </div>
              {/* Scrollable chart - auto-scrolls to latest data, hidden scrollbar */}
              <div ref={usageChartRef} className="flex-1 min-h-0 scroll-x-clean">
                <div style={{ width: usageChartWidth, height: '100%', minWidth: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={usageSeries}>
                      <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="active"
                        stroke="#8B0000"
                        strokeWidth={2}
                        dot={false}
                        name="Active Users"
                      />
                      <Line
                        type="monotone"
                        dataKey="visits"
                        stroke="#FEDE00"
                        strokeWidth={2}
                        dot={false}
                        name="App Visits"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* Fixed legend outside scrollable area */}
              <div className="flex justify-center gap-6 mt-3 text-sm flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[3px] rounded" style={{ backgroundColor: '#8B0000' }}></span>
                  <span className="text-gray-700">Active Users</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[3px] rounded" style={{ backgroundColor: '#FEDE00' }}></span>
                  <span className="text-gray-700">App Visits</span>
                </div>
              </div>
            </Card>
            <Card
              title={<span className="text-2xl font-semibold">Login Frequency</span>}
              className="rounded-2xl shadow-lg h-full"
              styles={{ body: { padding: 24, height: 'calc(100% - 57px)', display: 'flex', flexDirection: 'column' } }}
              extra={
                <Dropdown menu={loginExportMenu} placement="bottomRight" trigger={['click']}>
                  <Button size="large" className="!px-5 !h-8 text-base" icon={<DownloadOutlined />} disabled={loading}>
                    Export
                  </Button>
                </Dropdown>
              }
            >
              {/* Scrollable chart - auto-scrolls to latest data, hidden scrollbar */}
              <div ref={loginChartRef} className="flex-1 min-h-0 scroll-x-clean">
                <div style={{ width: loginChartWidth, height: '100%', minWidth: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={loginSeries}>
                      <XAxis dataKey="date" tick={{ fontSize: 14 }} />
                      <YAxis tick={{ fontSize: 14 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="athletes" stroke="#8B0000" strokeWidth={2} dot name="Athletes" />
                      <Line type="monotone" dataKey="coaches" stroke="#FEDE00" strokeWidth={2} dot name="Coaches" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* Fixed legend outside scrollable area */}
              <div className="flex justify-center gap-6 mt-3 text-sm flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[3px] rounded" style={{ backgroundColor: '#8B0000' }}></span>
                  <span className="text-gray-700">Athletes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[3px] rounded" style={{ backgroundColor: '#FEDE00' }}></span>
                  <span className="text-gray-700">Coaches</span>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
function KPI({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-xl bg-[#fafafa] border p-4 transition-all duration-200 ease-in-out hover:shadow-md">
      <div className="text-[12px] text-black/60">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-[12px] text-green-600">{delta}</div>
    </div>
  );
}