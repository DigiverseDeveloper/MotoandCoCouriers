import { useEffect, useRef, useState } from "react";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function loginCodePath(nextPath) {
  return `/.netlify/functions/login-code/${nextPath}`;
}

export default function SecureLoginBridge({ children }) {
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const resolverRef = useRef(null);

  const askForCode = (email, sent) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setCode("");
    setError("");
    setChallenge({ email, sent });
  });

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url;
      const method = String(init?.method || "GET").toUpperCase();
      const isLogin = method === "POST" && String(url || "").endsWith("/auth/login");
      if (!isLogin) return originalFetch(input, init);

      let payload = {};
      try { payload = JSON.parse(init.body || "{}"); } catch {}

      const requestRes = await originalFetch(loginCodePath("request-code"), {
        ...init,
        body: JSON.stringify({ role: payload.role, email: payload.email }),
      });

      if (!requestRes.ok) return requestRes;

      const requestBody = await requestRes.clone().json().catch(() => ({}));
      const loginCode = await askForCode(requestBody.email || payload.email, requestBody.sent);

      if (!loginCode) {
        return jsonResponse(401, { message: "Login cancelled." });
      }

      const verifyRes = await originalFetch(loginCodePath("verify-code"), {
        ...init,
        body: JSON.stringify({ role: payload.role, email: payload.email, code: loginCode }),
      });

      if (!verifyRes.ok) {
        const body = await verifyRes.clone().json().catch(() => ({}));
        setError(body.message || "That code did not work.");
      }

      return verifyRes;
    };

    return () => { window.fetch = originalFetch; };
  }, []);

  const confirm = () => {
    if (!code || code.length !== 6) {
      setError("Enter the 6 digit code from your email.");
      return;
    }
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setChallenge(null);
    resolve?.(code);
  };

  const cancel = () => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setChallenge(null);
    resolve?.(null);
  };

  return (
    <>
      {children}
      {challenge && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999, background: "rgba(26,21,16,.55)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #d5cfc3",
            borderTop: "5px solid #e11d48", borderRadius: 2, padding: 24,
            boxShadow: "0 18px 50px rgba(0,0,0,.25)", fontFamily: "Barlow, sans-serif",
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 900,
              letterSpacing: 1, textTransform: "uppercase", color: "#1A1510", marginBottom: 8,
            }}>Check Your Email</div>
            <p style={{ color: "#7A6E60", fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
              We sent a 6 digit login code to <strong>{challenge.email}</strong>. It expires in 10 minutes.
            </p>
            {!challenge.sent && (
              <div style={{ background: "rgba(225,29,72,.06)", border: "1px solid rgba(225,29,72,.2)", color: "#e11d48", padding: 10, fontSize: 13, marginBottom: 12 }}>
                Email sending is not configured yet. Add the mail settings in Netlify before using this publicly.
              </div>
            )}
            {error && <div style={{ background: "rgba(225,29,72,.06)", border: "1px solid rgba(225,29,72,.2)", color: "#e11d48", padding: 10, fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoFocus
              placeholder="6 digit code"
              style={{ width: "100%", padding: "12px 14px", border: "1px solid #d5cfc3", borderRadius: 2, fontSize: 18, letterSpacing: 4, marginBottom: 12 }}
            />
            <button onClick={confirm} style={{ width: "100%", padding: 12, border: 0, borderRadius: 2, background: "#e11d48", color: "#f3f3e8", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer" }}>
              Verify Code
            </button>
            <button onClick={cancel} style={{ width: "100%", padding: 10, marginTop: 8, border: "1px solid #d5cfc3", borderRadius: 2, background: "#f3f3e8", color: "#1A1510", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
