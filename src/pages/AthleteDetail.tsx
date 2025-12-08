import { useMemo, useState, useEffect, useRef } from "react";  
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeftOutlined } from "@ant-design/icons";
import NavBar from "@/components/NavBar";
import { BRAND } from "@/brand";
import {
  type ProfileLite,
  type ChartAthletePrePost,
  type ChartAthletePerf,
  shapeAthletePrePost,
  shapeAthletePerf,
  downloadCsv, // same helper used by SportsDetail.tsx
} from "@/services/sports";

/* ── Offline-enabled service wrapper ─────────────────────────────────────── */
import { loadAthleteBundleOffline, trackRecentAthlete } from "@/services/offline";
import supabase from "@/core/supabase";
/* ── Avatars (signed URLs; no UI changes) ─────────────────────────────────── */
import { bulkSignedByUserIds } from "@/services/avatars";

/* ── Export helpers copied from SportsDetail (adjusted for Athlete) ──────── */
import { toPng } from "html-to-image";
import { saveAs } from "file-saver";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";

/* simple slug for filenames */
const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Local shape that tolerates both `id` and `user_id` and optional fields we render. */
type ExtendedProfile = ProfileLite & {
  id?: string;
  user_id?: string;
  email?: string | null;
  pup_webmail?: string | null;
  pup_id?: string | number | null;
  birthdate?: string | null;
  phone?: string | null;
  role?: string | null;
  full_name?: string | null;
};

// Helper to add formal header to worksheet
function addFormalHeaderAthlete(ws: ExcelJS.Worksheet, reportTitle: string, reportPeriod: string, athleteName: string, sportName: string) {
  const now = new Date();

  // Row 1: Organization
  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = "POLYTECHNIC UNIVERSITY OF THE PHILIPPINES";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  // Row 2: Department
  ws.mergeCells("A2:J2");
  ws.getCell("A2").value = "Sports Development Program Office";
  ws.getCell("A2").font = { size: 12 };
  ws.getCell("A2").alignment = { horizontal: "center" };

  // Row 3: System
  ws.mergeCells("A3:J3");
  ws.getCell("A3").value = "AthleTrack - Athletic Performance Management System";
  ws.getCell("A3").font = { size: 11, italic: true };
  ws.getCell("A3").alignment = { horizontal: "center" };

  // Row 4: Empty
  ws.getRow(4).height = 10;

  // Row 5: Report Title
  ws.mergeCells("A5:J5");
  ws.getCell("A5").value = reportTitle;
  ws.getCell("A5").font = { bold: true, size: 16, color: { argb: "FF8B0000" } };
  ws.getCell("A5").alignment = { horizontal: "center" };

  // Row 6: Athlete Name
  ws.mergeCells("A6:J6");
  ws.getCell("A6").value = `Athlete: ${athleteName}`;
  ws.getCell("A6").font = { bold: true, size: 12 };
  ws.getCell("A6").alignment = { horizontal: "center" };

  // Row 7: Sport
  ws.mergeCells("A7:J7");
  ws.getCell("A7").value = `Sport: ${sportName} | ${reportPeriod}`;
  ws.getCell("A7").font = { size: 11 };
  ws.getCell("A7").alignment = { horizontal: "center" };

  // Row 8: Empty
  ws.getRow(8).height = 10;

  // Row 9: Generated info
  ws.getCell("A9").value = "Date Generated:";
  ws.getCell("A9").font = { bold: true, size: 10 };
  ws.getCell("B9").value = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  ws.getCell("B9").font = { size: 10 };

  ws.getCell("E9").value = "Time:";
  ws.getCell("E9").font = { bold: true, size: 10 };
  ws.getCell("F9").value = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  ws.getCell("F9").font = { size: 10 };

  // Row 10: Prepared by
  ws.getCell("A10").value = "Prepared by:";
  ws.getCell("A10").font = { bold: true, size: 10 };
  ws.getCell("B10").value = "AthleTrack Admin System";
  ws.getCell("B10").font = { size: 10 };

  ws.getCell("E10").value = "Report Type:";
  ws.getCell("E10").font = { bold: true, size: 10 };
  ws.getCell("F10").value = "Individual Athlete Report";
  ws.getCell("F10").font = { size: 10 };

  // Row 11: Horizontal line (using border)
  ws.getRow(11).height = 5;
  for (let col = 1; col <= 10; col++) {
    ws.getCell(11, col).border = { bottom: { style: "medium", color: { argb: "FF8B0000" } } };
  }

  return 12; // Return the next available row
}

// Formal PDF export with header for athlete
async function exportChartAsPdf(node: HTMLElement, filename: string, athleteName: string, sportName: string, reportTitle: string) {
  const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: "#FFFFFF" });
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const now = new Date();

  // Add formal header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("POLYTECHNIC UNIVERSITY OF THE PHILIPPINES", pageWidth / 2, 30, { align: "center" });
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Sports Development Program Office", pageWidth / 2, 45, { align: "center" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  doc.text("AthleTrack - Athletic Performance Management System", pageWidth / 2, 58, { align: "center" });

  // Horizontal line
  doc.setDrawColor(139, 0, 0); // Maroon
  doc.setLineWidth(1.5);
  doc.line(40, 68, pageWidth - 40, 68);

  // Report title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(139, 0, 0);
  doc.text(reportTitle, pageWidth / 2, 88, { align: "center" });
  
  // Athlete and sport info
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Athlete: ${athleteName} | Sport: ${sportName}`, pageWidth / 2, 105, { align: "center" });

  // Date generated
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`, pageWidth / 2, 120, { align: "center" });

  // Add chart image
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve) => (img.onload = () => resolve()));

  const availableHeight = pageHeight - 180;
  const availableWidth = pageWidth - 80;
  const ratio = Math.min(availableWidth / img.width, availableHeight / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = (pageWidth - w) / 2;
  const y = 135;

  doc.addImage(dataUrl, "PNG", x, y, w, h);

  // Footer
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(100, 100, 100);
  doc.text("This report was automatically generated by AthleTrack Admin System.", pageWidth / 2, pageHeight - 30, { align: "center" });
  doc.text("For questions, contact the Sports Development Program Office.", pageWidth / 2, pageHeight - 20, { align: "center" });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

// Formal Pre/Post Test XLSX export for athlete
async function exportPrepostXlsxWithChartForAthlete(
  athleteSlug: string,
  athleteName: string,
  sportName: string,
  rows: Array<{
    "Athlete Name": string;
    "Email": string;
    "PUP ID": string;
    "Pre Test": number | string;
    "Post Test": number | string;
  }>,
  chartNode: HTMLElement
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AthleTrack Admin System";
  wb.created = new Date();
  
  const ws = wb.addWorksheet("Athlete Pre-Post Test Report");
  const today = new Date().toISOString().split("T")[0];
  const reportPeriod = `Generated: ${today}`;
  
  let currentRow = addFormalHeaderAthlete(ws, "INDIVIDUAL ATHLETE PRE-TEST VS POST-TEST REPORT", reportPeriod, athleteName, sportName);
  currentRow++;

  // Calculate summary for single athlete
  const row = rows[0];
  const preVal = typeof row?.["Pre Test"] === "number" ? row["Pre Test"] : 0;
  const postVal = typeof row?.["Post Test"] === "number" ? row["Post Test"] : 0;
  const diff = postVal - preVal;
  const percentChange = preVal > 0 ? ((diff / preVal) * 100).toFixed(1) : "N/A";
  const status = diff > 0 ? "Improved" : diff < 0 ? "Declined" : "No Change";

  // ===== ATHLETE INFO SECTION =====
  ws.getCell(`A${currentRow}`).value = "I. ATHLETE INFORMATION";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  const infoData = [
    ["Field", "Value"],
    ["Full Name", row?.["Athlete Name"] || athleteName],
    ["Email", row?.["Email"] || "—"],
    ["PUP ID", row?.["PUP ID"] || "—"],
    ["Sport", sportName],
  ];

  infoData.forEach((r, idx) => {
    const rowNum = currentRow + idx;
    ws.getCell(`B${rowNum}`).value = r[0];
    ws.getCell(`C${rowNum}`).value = r[1];
    
    if (idx === 0) {
      ["B", "C"].forEach(col => {
        ws.getCell(`${col}${rowNum}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
        ws.getCell(`${col}${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
      });
    }
  });
  currentRow += infoData.length + 2;

  // ===== TEST RESULTS SECTION =====
  ws.getCell(`A${currentRow}`).value = "II. TEST RESULTS SUMMARY";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  const resultsData = [
    ["Metric", "Value", "Analysis"],
    ["Pre-Test Score", preVal, "Initial assessment score"],
    ["Post-Test Score", postVal, "Final assessment score"],
    ["Score Difference", diff, `${typeof percentChange === "string" ? percentChange : percentChange}% change`],
    ["Status", status, status === "Improved" ? "Athlete showed improvement" : status === "Declined" ? "Needs attention" : "Maintained level"],
  ];

  resultsData.forEach((r, idx) => {
    const rowNum = currentRow + idx;
    ws.getCell(`B${rowNum}`).value = r[0];
    ws.getCell(`C${rowNum}`).value = r[1];
    ws.getCell(`D${rowNum}`).value = r[2];
    
    if (idx === 0) {
      ["B", "C", "D"].forEach(col => {
        ws.getCell(`${col}${rowNum}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
        ws.getCell(`${col}${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
      });
    }
    
    // Color code status row
    if (r[0] === "Status") {
      if (r[1] === "Improved") {
        ws.getCell(`C${rowNum}`).font = { bold: true, color: { argb: "FF228B22" } };
      } else if (r[1] === "Declined") {
        ws.getCell(`C${rowNum}`).font = { bold: true, color: { argb: "FFDC143C" } };
      }
    }
  });
  currentRow += resultsData.length + 2;

  // ===== CHART SECTION =====
  ws.getCell(`A${currentRow}`).value = "III. VISUAL COMPARISON";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  const dataUrl = await toPng(chartNode, { cacheBust: true, backgroundColor: "#FFFFFF" });
  const base64 = dataUrl.split(",")[1];
  const imgId = wb.addImage({ base64, extension: "png" });

  ws.addImage(imgId, {
    tl: { col: 0, row: currentRow },
    ext: { width: 850, height: 400 },
    editAs: "oneCell",
  });
  currentRow += 22;

  // ===== FOOTER =====
  ws.mergeCells(`A${currentRow}:H${currentRow}`);
  ws.getCell(`A${currentRow}`).value = "— End of Report —";
  ws.getCell(`A${currentRow}`).font = { italic: true, size: 10, color: { argb: "FF666666" } };
  ws.getCell(`A${currentRow}`).alignment = { horizontal: "center" };
  
  currentRow++;
  ws.mergeCells(`A${currentRow}:H${currentRow}`);
  ws.getCell(`A${currentRow}`).value = "This report was automatically generated by AthleTrack Admin System. For questions, contact the Sports Development Program Office.";
  ws.getCell(`A${currentRow}`).font = { size: 9, color: { argb: "FF999999" } };
  ws.getCell(`A${currentRow}`).alignment = { horizontal: "center", wrapText: true };

  // Set column widths
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 32;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `AthleTrack_Athlete_PrePost_${athleteSlug}_${today}.xlsx`);
}

// Formal Performance Metrics XLSX export for athlete
async function exportPerformanceXlsxWithChartForAthlete(
  athleteSlug: string,
  athleteName: string,
  sportName: string,
  rows: Array<{
    "Athlete Name": string;
    "Email": string;
    "PUP ID": string;
    "Week": string;
    "Agility": number;
    "Strength": number;
    "Power": number;
    "Flexibility": number;
    "Reaction Time": number;
    "Coordination": number;
  }>,
  chartNode: HTMLElement
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AthleTrack Admin System";
  wb.created = new Date();
  
  const ws = wb.addWorksheet("Athlete Performance Report");
  const today = new Date().toISOString().split("T")[0];
  const reportPeriod = `Generated: ${today}`;
  
  let currentRow = addFormalHeaderAthlete(ws, "INDIVIDUAL ATHLETE PERFORMANCE METRICS REPORT", reportPeriod, athleteName, sportName);
  currentRow++;

  // Calculate summary statistics
  const totalWeeks = rows.length;
  const avgAgility = rows.length > 0 ? (rows.reduce((s, r) => s + r["Agility"], 0) / rows.length).toFixed(1) : "N/A";
  const avgStrength = rows.length > 0 ? (rows.reduce((s, r) => s + r["Strength"], 0) / rows.length).toFixed(1) : "N/A";
  const avgPower = rows.length > 0 ? (rows.reduce((s, r) => s + r["Power"], 0) / rows.length).toFixed(1) : "N/A";
  const avgFlexibility = rows.length > 0 ? (rows.reduce((s, r) => s + r["Flexibility"], 0) / rows.length).toFixed(1) : "N/A";
  const avgReaction = rows.length > 0 ? (rows.reduce((s, r) => s + r["Reaction Time"], 0) / rows.length).toFixed(1) : "N/A";
  const avgCoordination = rows.length > 0 ? (rows.reduce((s, r) => s + r["Coordination"], 0) / rows.length).toFixed(1) : "N/A";

  // ===== ATHLETE INFO SECTION =====
  const athleteInfo = rows[0];
  ws.getCell(`A${currentRow}`).value = "I. ATHLETE INFORMATION";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  const infoData = [
    ["Field", "Value"],
    ["Full Name", athleteInfo?.["Athlete Name"] || athleteName],
    ["Email", athleteInfo?.["Email"] || "—"],
    ["PUP ID", athleteInfo?.["PUP ID"] || "—"],
    ["Sport", sportName],
    ["Weeks of Data", totalWeeks],
  ];

  infoData.forEach((r, idx) => {
    const rowNum = currentRow + idx;
    ws.getCell(`B${rowNum}`).value = r[0];
    ws.getCell(`C${rowNum}`).value = r[1];
    
    if (idx === 0) {
      ["B", "C"].forEach(col => {
        ws.getCell(`${col}${rowNum}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
        ws.getCell(`${col}${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
      });
    }
  });
  currentRow += infoData.length + 2;

  // ===== AVERAGE METRICS SECTION =====
  ws.getCell(`A${currentRow}`).value = "II. AVERAGE PERFORMANCE METRICS";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  const metricsData = [
    ["Metric", "Average Score", "Rating"],
    ["Agility", avgAgility, getPerformanceRating(parseFloat(avgAgility as string))],
    ["Strength", avgStrength, getPerformanceRating(parseFloat(avgStrength as string))],
    ["Power", avgPower, getPerformanceRating(parseFloat(avgPower as string))],
    ["Flexibility", avgFlexibility, getPerformanceRating(parseFloat(avgFlexibility as string))],
    ["Reaction Time", avgReaction, getPerformanceRating(parseFloat(avgReaction as string))],
    ["Coordination", avgCoordination, getPerformanceRating(parseFloat(avgCoordination as string))],
  ];

  metricsData.forEach((r, idx) => {
    const rowNum = currentRow + idx;
    ws.getCell(`B${rowNum}`).value = r[0];
    ws.getCell(`C${rowNum}`).value = r[1];
    ws.getCell(`D${rowNum}`).value = r[2];
    ws.getCell(`C${rowNum}`).alignment = { horizontal: "center" };
    ws.getCell(`D${rowNum}`).alignment = { horizontal: "center" };
    
    if (idx === 0) {
      ["B", "C", "D"].forEach(col => {
        ws.getCell(`${col}${rowNum}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
        ws.getCell(`${col}${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
      });
    }
  });
  currentRow += metricsData.length + 2;

  // ===== WEEKLY DATA SECTION =====
  ws.getCell(`A${currentRow}`).value = "III. WEEKLY PERFORMANCE DATA";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  // Table headers
  const headers = ["#", "Week", "Agility", "Strength", "Power", "Flexibility", "Reaction", "Coordination"];
  headers.forEach((header, idx) => {
    const col = String.fromCharCode(65 + idx);
    ws.getCell(`${col}${currentRow}`).value = header;
    ws.getCell(`${col}${currentRow}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getCell(`${col}${currentRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B0000" } };
    ws.getCell(`${col}${currentRow}`).alignment = { horizontal: "center" };
  });
  currentRow++;

  // Data rows
  rows.forEach((r, idx) => {
    ws.getCell(`A${currentRow}`).value = idx + 1;
    ws.getCell(`B${currentRow}`).value = r["Week"];
    ws.getCell(`C${currentRow}`).value = r["Agility"];
    ws.getCell(`D${currentRow}`).value = r["Strength"];
    ws.getCell(`E${currentRow}`).value = r["Power"];
    ws.getCell(`F${currentRow}`).value = r["Flexibility"];
    ws.getCell(`G${currentRow}`).value = r["Reaction Time"];
    ws.getCell(`H${currentRow}`).value = r["Coordination"];
    
    ["A", "B", "C", "D", "E", "F", "G", "H"].forEach(col => {
      ws.getCell(`${col}${currentRow}`).alignment = { horizontal: "center" };
    });
    currentRow++;
  });
  currentRow += 2;

  // ===== CHART SECTION =====
  ws.getCell(`A${currentRow}`).value = "IV. PERFORMANCE TREND VISUALIZATION";
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF8B0000" } };
  currentRow++;

  const dataUrl = await toPng(chartNode, { cacheBust: true, backgroundColor: "#FFFFFF" });
  const base64 = dataUrl.split(",")[1];
  const imgId = wb.addImage({ base64, extension: "png" });

  ws.addImage(imgId, {
    tl: { col: 0, row: currentRow },
    ext: { width: 900, height: 420 },
    editAs: "oneCell",
  });
  currentRow += 24;

  // ===== FOOTER =====
  ws.mergeCells(`A${currentRow}:H${currentRow}`);
  ws.getCell(`A${currentRow}`).value = "— End of Report —";
  ws.getCell(`A${currentRow}`).font = { italic: true, size: 10, color: { argb: "FF666666" } };
  ws.getCell(`A${currentRow}`).alignment = { horizontal: "center" };
  
  currentRow++;
  ws.mergeCells(`A${currentRow}:H${currentRow}`);
  ws.getCell(`A${currentRow}`).value = "This report was automatically generated by AthleTrack Admin System. For questions, contact the Sports Development Program Office.";
  ws.getCell(`A${currentRow}`).font = { size: 9, color: { argb: "FF999999" } };
  ws.getCell(`A${currentRow}`).alignment = { horizontal: "center", wrapText: true };

  // Set column widths
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 12;
  ws.getColumn(8).width = 14;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `AthleTrack_Athlete_Performance_${athleteSlug}_${today}.xlsx`);
}

// Helper function to get performance rating
function getPerformanceRating(score: number): string {
  if (isNaN(score)) return "N/A";
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Very Good";
  if (score >= 70) return "Good";
  if (score >= 60) return "Average";
  if (score >= 50) return "Below Average";
  return "Needs Improvement";
}

/* ── View component (UI unchanged; just wired export like SportsDetail) ───── */

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUNE", "JULY", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default function AthleteDetail() {
  const navigate = useNavigate();
  const { sportName = "", athleteName = "" } = useParams<{ sportName?: string; athleteName?: string }>();

  // Live state
  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [prepostRows, setPrepostRows] = useState<ChartAthletePrePost[]>([]);
  const [perfRows, setPerfRows] = useState<ChartAthletePerf[]>([]);

  // Avatar (signed URL)
  const [avatarSrc, setAvatarSrc] = useState<string | undefined>(undefined);
  
  // Offline status (tracks cache usage for potential UI indicators)
  const [_fromCache, setFromCache] = useState(false);
  void _fromCache; // Reserved for future offline indicator

  // Refs for chart export (same pattern as SportsDetail)
  const prepostChartRef = useRef<HTMLDivElement>(null);
  const performanceChartRef = useRef<HTMLDivElement>(null);

  // Resolve athlete then load bundle (guards added; no UI changes)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = decodeURIComponent(athleteName || "").replace(/\+/g, " ").trim();
        if (!q) return;

        // Try the view first
        let row: ExtendedProfile | null = null;
        {
          const { data, error } = await supabase
            .from("v_profile_lite")
            .select("*")
            .ilike("full_name", `%${q}%`)
            .limit(1)
            .maybeSingle<ExtendedProfile>();
          if (!error && data) row = data;
        }

        // Fallback to base table if needed
        if (!row) {
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .ilike("full_name", `%${q}%`)
            .limit(1)
            .maybeSingle<ExtendedProfile>();
          if (data) row = data;
        }

        if (!row || !alive) return;

        setProfile(row);

        // Prefer user_id; fall back to id (never pass undefined)
        const athleteKey: string | null = row.user_id ?? row.id ?? null;
        if (!athleteKey) return;

        // Use offline-enabled fetch
        const result = await loadAthleteBundleOffline(athleteKey);
        const bundle = result.data;
        setFromCache(result.fromCache);
        
        // Track for progressive prefetching
        trackRecentAthlete(athleteKey);
        
        if (!alive) return;

        // 🔧 Merge to preserve `pup_id`/email coming from the view/base table.
        const merged: ExtendedProfile = {
          ...row,
          ...((bundle as { profile?: ExtendedProfile }).profile ?? {}),
        };
        setProfile(merged);

        setPrepostRows(shapeAthletePrePost(bundle.prepost));
        setPerfRows(shapeAthletePerf(bundle.performance));
      } catch {
        // silent fallback to placeholders
      }
    })();
    return () => {
      alive = false;
    };
  }, [athleteName]);

  // Derive a single stable key for avatar fetching to satisfy exhaustive-deps
  const avatarKey = useMemo<string | null>(() => {
    if (!profile) return null;
    return profile.user_id ?? profile.id ?? null;
  }, [profile]);

  // Fetch a signed avatar URL for the resolved profile (no UI changes)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!avatarKey) return;
        const map = await bulkSignedByUserIds([avatarKey], 60 * 60 * 24);
        if (!alive) return;
        if (map && map[avatarKey]) setAvatarSrc(map[avatarKey]);
      } catch {
        /* ignore; fallback to placeholder */
      }
    })();
    return () => {
      alive = false;
    };
  }, [avatarKey]);

  // Fallback adapters for charts
  const prePostData = useMemo(
    () =>
      (prepostRows.length
        ? prepostRows.map((r, i) => ({
            month: String(r.label ?? i + 1),
            pre: r.preTest ?? 0,
            post: r.postTest ?? 0,
          }))
        : months.slice(0, 9).map((m, i) => ({
            month: m,
            pre: [750, 520, 830, 510, 600, 250, 300, 800, 420][i] ?? 500,
            post: [900, 610, 880, 1000, 650, 450, 560, 920, 480][i] ?? 600,
          })) ),
    [prepostRows]
  );

  const performanceData = useMemo(
    () =>
      (perfRows.length
        ? perfRows.map((r) => {
            let label = r.day;
            try {
              const d = new Date(r.day);
              const mm = months[d.getMonth()] ?? r.day;
              label = mm;
            } catch {
              /* keep ISO */
            }
            return {
              month: label,
              agility: r.agility ?? 0,
              strength: r.strength ?? 0,
              power: r.power ?? 0,
              flexibility: 0,
              reactionTime: 0,
              coordination: 0,
            };
          })
        : months.slice(0, 9).map((m, i) => ({
            month: m,
            agility: [500, 600, 700, 800, 650, 720, 660, 705, 690][i] ?? 500,
            strength: [400, 500, 600, 700, 580, 640, 590, 630, 610][i] ?? 400,
            power: [350, 420, 480, 550, 500, 520, 510, 530, 515][i] ?? 350,
            flexibility: [300, 360, 400, 450, 380, 390, 395, 405, 410][i] ?? 300,
            reactionTime: [450, 500, 550, 600, 520, 530, 540, 560, 570][i] ?? 450,
            coordination: [380, 420, 460, 500, 430, 440, 450, 470, 480][i] ?? 380,
          })) ),
    [perfRows]
  );

  // Build export rows like SportsDetail (with athlete metadata) — now using real email + PUP ID
  const athleteFull = profile?.full_name ?? athleteName;
  const athleteEmail = profile?.email ?? profile?.pup_webmail ?? "";
  const athletePUP = profile?.pup_id != null ? String(profile.pup_id) : "";

  const prepostExportRows = useMemo(
    () =>
      prePostData.map((d) => ({
        "Athlete Name": athleteFull,
        "Email": athleteEmail,
        "PUP ID": athletePUP,
        "Pre Test": d.pre,
        "Post Test": d.post,
      })),
    [prePostData, athleteFull, athleteEmail, athletePUP]
  );

  const performanceExportRows = useMemo(
    () =>
      performanceData.map((w) => ({
        "Athlete Name": athleteFull,
        "Email": athleteEmail,
        "PUP ID": athletePUP,
        "Week": String(w.month),
        "Agility": w.agility,
        "Strength": w.strength,
        "Power": w.power,
        "Flexibility": w.flexibility,
        "Reaction Time": w.reactionTime,
        "Coordination": w.coordination,
      })),
    [performanceData, athleteFull, athleteEmail, athletePUP]
  );

  const [showConfirm, setShowConfirm] = useState(false);
  async function handleConfirmDelete() {
    // TODO hook up deletion
    setShowConfirm(false);
  }

  return (
    <div className="min-h-screen bg-white">
      <NavBar />

      {/* Header with sport ribbon */}
      <header className="sticky top-0 z-30 shadow-md">
        <div
          className="flex items-center w-full py-2 px-4"
          style={{ background: `linear-gradient(90deg, ${BRAND.maroon} 0%, #5a0c0c 100%)`, color: "white" }}
        >
          <button
            onClick={() => navigate(`/sports/${encodeURIComponent(sportName)}`)}
            aria-label="Back to Sport"
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow hover:scale-110 transition-transform mr-3"
            style={{ color: BRAND.maroon }}
          >
            <ArrowLeftOutlined className="text-lg" />
          </button>

          <span className="text-lg sm:text-xl font-bold tracking-wide uppercase">{sportName}</span>
        </div>
      </header>

      <div className="flex flex-col md:flex-row w-full">
        {/* Left profile column */}
        <aside className="w-full md:w-1/4 p-8 md:min-h-screen" style={{ backgroundColor: BRAND.maroon }}>
          <div className="flex flex-col items-center text-white">
            <div className="w-40 h-40 rounded-full bg-white/20 grid place-items-center mb-6 overflow-hidden">
              <img src={avatarSrc || "/images/coach_photo.jpg"} alt={athleteName} className="w-full h-full object-cover" />
            </div>
            <h2 className="text-xl font-semibold">{athleteName}</h2>
            <p className="text-sm opacity-80 mb-6">{profile?.pup_id ?? ""}</p>
          </div>

          {/* Form card – view-only */}
          <div className="space-y-4">
            <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
              {profile?.full_name ?? athleteName}
            </div>

            {/* Use real email from profiles (fall back to pup_webmail, else empty string) */}
            <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
              {profile?.email ?? profile?.pup_webmail ?? ""}
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-2 rounded-md bg-white text-gray-900">+63</span>
              <div className="flex-1 rounded-md bg-white px-4 py-2 text-gray-900">
                {(profile?.phone ?? "9123456789").replace(/^\+?63/, "").replace(/^0/, "")}
              </div>
            </div>

            <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">{profile?.role ?? "Athlete"}</div>

            <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
              {profile?.birthdate ?? "2024-08-20"}
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-6">
            <button
              className="w-full rounded-lg bg-white/10 text-white py-2 border border-white/40 hover:bg-white/20"
              onClick={() => setShowConfirm(true)}
            >
              Delete Profile
            </button>
          </div>

          {/* ───── Delete-confirmation modal ───── */}
          {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />

              {/* Modal card */}
              <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 animate-fadeIn">
                <h3 className="text-xl font-bold mb-2 text-center" style={{ color: BRAND.maroon }}>
                  Confirm Delete
                </h3>
                <p className="text-gray-700 text-sm text-center mb-6">
                  Are you sure you want to permanently delete this profile?
                  <br />
                  <span className="text-red-500 font-medium">This action cannot be undone.</span>
                </p>

                <div className="flex justify-center gap-4">
                  <button
                    className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                    onClick={() => setShowConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-5 py-2 rounded-lg text-white shadow-md hover:scale-105 transition"
                    style={{ backgroundColor: BRAND.maroon }}
                    onClick={handleConfirmDelete}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Right charts column */}
        <main className="w-full md:w-3/4 p-8 space-y-8">
          {/* Bar chart: Pre vs Post */}
          <section className="p-6 rounded-2xl shadow-md bg-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold" style={{ color: BRAND.maroon }}>
                Pre-Test vs. Post Test
              </h3>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={() => downloadCsv("pre-vs-post.csv", prepostExportRows)}
                >
                  Export CSV
                </button>
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={async () => {
                    const node = prepostChartRef.current;
                    if (!node) return;
                    await exportChartAsPdf(node, `AthleTrack_Athlete_PrePost_${slugify(athleteFull)}.pdf`, athleteFull, sportName, "PRE-TEST VS POST-TEST COMPARISON");
                  }}
                >
                  Export PDF
                </button>
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={async () => {
                    const node = prepostChartRef.current;
                    if (!node) return;
                    await exportPrepostXlsxWithChartForAthlete(slugify(athleteFull), athleteFull, sportName, prepostExportRows, node);
                  }}
                >
                  Export XLSX
                </button>
              </div>
            </div>

            <div ref={prepostChartRef}>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={prePostData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="pre" name="Pre-Test" fill={BRAND.maroon} barSize={40} />
                  <Bar dataKey="post" name="Post Test" fill={BRAND.yellow} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Line chart: Performance Metrics */}
          <section className="p-6 rounded-2xl shadow-md bg-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold" style={{ color: BRAND.maroon }}>
                Performance Metrics
              </h3>
            <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={() => downloadCsv("performance-metrics.csv", performanceExportRows)}
                >
                  Export CSV
                </button>
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={async () => {
                    const node = performanceChartRef.current;
                    if (!node) return;
                    await exportChartAsPdf(node, `AthleTrack_Athlete_Performance_${slugify(athleteFull)}.pdf`, athleteFull, sportName, "WEEKLY PERFORMANCE METRICS");
                  }}
                >
                  Export PDF
                </button>
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={async () => {
                    const node = performanceChartRef.current;
                    if (!node) return;
                    await exportPerformanceXlsxWithChartForAthlete(
                      slugify(athleteFull),
                      athleteFull,
                      sportName,
                      performanceExportRows,
                      node
                    );
                  }}
                >
                  Export XLSX
                </button>
              </div>
            </div>

            <div ref={performanceChartRef}>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="agility" stroke="#008000" />
                  <Line type="monotone" dataKey="strength" stroke={BRAND.maroon} />
                  <Line type="monotone" dataKey="power" stroke="#1E90FF" />
                  <Line type="monotone" dataKey="flexibility" stroke="#FF69B4" />
                  <Line type="monotone" dataKey="reactionTime" stroke="#FFA500" />
                  <Line type="monotone" dataKey="coordination" stroke="#800080" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
