"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type ImportReport } from "../lib/api";

type Step = "upload" | "preview" | "done";

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [result, setResult] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function requireAuth() {
    if (!getToken()) {
      router.replace("/login");
      return false;
    }
    return true;
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!requireAuth() || !file) return;
    setError(null);
    setLoading(true);
    try {
      const report = await api.importPreview(file);
      setPreview(report);
      setStep("preview");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!requireAuth() || !file) return;
    setError(null);
    setLoading(true);
    try {
      const report = await api.importApply(file);
      setResult(report);
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <h1>Import Resident Directory (CSV)</h1>
      <p>
        <Link href="/units">← Back to units</Link>
        {" · "}
        <a href="/api/admin/residents/import/template" download="import-template.csv">
          Download template CSV
        </a>
      </p>

      {step === "upload" && (
        <form onSubmit={handlePreview}>
          <p>Select a CSV file to preview before applying changes.</p>
          <p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" disabled={loading || !file}>
            {loading ? "Validating…" : "Preview"}
          </button>
        </form>
      )}

      {step === "preview" && preview && (
        <div>
          <h2>Preview</h2>
          <ReportSummary report={preview} />

          {preview.errors.length > 0 && (
            <div>
              <h3>Errors ({preview.errors.length})</h3>
              <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "1rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ccc" }}>
                    <th style={th}>Row</th>
                    <th style={th}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.errors.map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee", color: "#c00" }}>
                      <td style={td}>{e.row}</td>
                      <td style={td}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: "#c00" }}>
                Fix the errors above and re-upload. No data will be written when errors exist.
              </p>
              <button onClick={handleReset}>Upload a new file</button>
            </div>
          )}

          {preview.errors.length === 0 && (
            <div>
              <p style={{ color: "green" }}>No errors — safe to apply.</p>
              {error && <p style={{ color: "red" }}>{error}</p>}
              <button onClick={handleApply} disabled={loading} style={{ marginRight: "0.5rem" }}>
                {loading ? "Applying…" : "Apply import"}
              </button>
              <button onClick={handleReset}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {step === "done" && result && (
        <div>
          <h2>Import {result.applied ? "applied ✓" : "not applied"}</h2>
          <ReportSummary report={result} />
          {result.applied && (
            <p style={{ color: "green" }}>
              All rows written successfully.{" "}
              <Link href="/units">View units →</Link>
            </p>
          )}
          <button onClick={handleReset} style={{ marginTop: "1rem" }}>
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}

function ReportSummary({ report }: { report: ImportReport }) {
  return (
    <table style={{ borderCollapse: "collapse", marginBottom: "1rem" }}>
      <tbody>
        <tr>
          <td style={td}>Total rows in file</td>
          <td style={td}><strong>{report.totalRows}</strong></td>
        </tr>
        <tr>
          <td style={td}>Units to create</td>
          <td style={td}><strong>{report.wouldCreateUnits}</strong></td>
        </tr>
        <tr>
          <td style={td}>Residents to create</td>
          <td style={td}><strong>{report.wouldCreateResidents}</strong></td>
        </tr>
        <tr>
          <td style={td}>Resident-unit links to create</td>
          <td style={td}><strong>{report.wouldCreateUnitResidents}</strong></td>
        </tr>
        <tr>
          <td style={td}>Parking spots to create</td>
          <td style={td}><strong>{report.wouldCreateParkingSpots}</strong></td>
        </tr>
        <tr>
          <td style={td}>Validation errors</td>
          <td style={td}><strong style={{ color: report.errors.length > 0 ? "#c00" : "inherit" }}>
            {report.errors.length}
          </strong></td>
        </tr>
      </tbody>
    </table>
  );
}

const th: React.CSSProperties = { padding: "0.5rem", textAlign: "left" };
const td: React.CSSProperties = { padding: "0.5rem" };
