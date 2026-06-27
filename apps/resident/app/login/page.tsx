"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken, clearToken } from "../lib/api";

type Step = "mobile" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleMobileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.loginRequest(mobile);
      setStep("otp");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken } = await api.loginVerify(mobile, code);
      setToken(accessToken);
      router.push("/notices");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>mySociety</h1>

      {step === "mobile" && (
        <form onSubmit={handleMobileSubmit}>
          <p style={{ color: "#555", marginBottom: "1rem" }}>Enter your registered mobile number to receive an OTP.</p>
          <p>
            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
              Mobile number
            </label>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
              pattern="[6-9][0-9]{9}"
              placeholder="10-digit mobile"
              style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" }}
            />
          </p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            {loading ? "Sending OTP…" : "Send OTP"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleOtpSubmit}>
          <p style={{ color: "#555", marginBottom: "1rem" }}>
            OTP sent to <strong>{mobile}</strong>. In development, check the API server console.
          </p>
          <p>
            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
              OTP code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              inputMode="numeric"
              placeholder="6-digit OTP"
              style={{ width: "100%", padding: "0.75rem", fontSize: "1.5rem", letterSpacing: "0.3em", textAlign: "center", border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" }}
            />
          </p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: "0.5rem" }}
          >
            {loading ? "Verifying…" : "Verify OTP"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("mobile"); setCode(""); setError(null); }}
            style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", background: "none", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}
          >
            Back
          </button>
        </form>
      )}

      <div style={{ marginTop: "2rem", borderTop: "1px solid #eee", paddingTop: "1rem" }}>
        <button
          type="button"
          onClick={() => { clearToken(); setStep("mobile"); setMobile(""); setCode(""); setError(null); }}
          style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: "0.85rem" }}
        >
          Clear stored session
        </button>
      </div>
    </div>
  );
}
