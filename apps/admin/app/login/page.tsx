"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken, clearToken } from "../lib/api";

type Step = "email" | "otp" | "done";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.adminLoginRequest(email);
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
      const { accessToken } = await api.adminLoginVerify(email, code);
      setToken(accessToken);
      router.push("/units");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearToken();
    setStep("email");
    setEmail("");
    setCode("");
    setError(null);
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <h1>Admin Login</h1>

      {step === "email" && (
        <form onSubmit={handleEmailSubmit}>
          <p>
            <label>Email address<br />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: "100%", padding: "0.4rem", marginTop: "0.25rem" }}
              />
            </label>
          </p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send OTP"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleOtpSubmit}>
          <p style={{ color: "#555" }}>
            OTP sent for <strong>{email}</strong>. In development, check the API
            server console output for the code.
          </p>
          <p>
            <label>OTP code<br />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                inputMode="numeric"
                style={{ width: "100%", padding: "0.4rem", marginTop: "0.25rem", fontSize: "1.25rem", letterSpacing: "0.2em" }}
              />
            </label>
          </p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Verifying…" : "Verify"}
          </button>{" "}
          <button type="button" onClick={() => setStep("email")}>Back</button>
        </form>
      )}

      <hr style={{ marginTop: "2rem" }} />
      <button type="button" onClick={handleLogout} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 0 }}>
        Clear stored token / logout
      </button>
    </div>
  );
}
