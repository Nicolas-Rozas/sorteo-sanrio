"use client";

import { useState } from "react";
import Image from "next/image";

interface Winner {
  number: number;
  username: string;
  comment: string;
  pic: string;
  emprendimiento: string;
}

interface Stats {
  total: number;
  validos: number;
  unicos: number;
  ganadores: number;
  exclEmp: number;
  exclNoAt: number;
}

type AppState = "idle" | "logging_in" | "2fa" | "loading" | "done" | "error";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [state, setState] = useState<AppState>("idle");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code2fa, setCode2fa] = useState("");
  const [progress, setProgress] = useState("");
  const [commentCount, setCommentCount] = useState(0);
  const [expectedComments, setExpectedComments] = useState(0);
  const [liveComments, setLiveComments] = useState<{username: string; pic: string}[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [postUrl, setPostUrl] = useState("https://www.instagram.com/p/DWzm5E3CcUp/");
  const [numGanadores, setNumGanadores] = useState("63");
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!username || !password) return;
    setState("logging_in");
    setError("");
    setProgress("Conectando a Instagram...");

    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const err = JSON.parse(text);
          setError(err.detail || "Error de login");
        } catch {
          setError(text || `Error ${res.status}`);
        }
        setState("error");
        return;
      }

      const data = await res.json();
      if (data.status === "2fa_required") {
        setState("2fa");
        return;
      }

      // Login OK, run sorteo
      runSorteo();
    } catch (err: unknown) {
      setError((err as Error).message);
      setState("error");
    }
  }

  async function handle2FA() {
    if (!code2fa) return;
    setState("logging_in");
    setProgress("Verificando codigo...");
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/login-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, code: code2fa }),
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const err = JSON.parse(text);
          setError(err.detail || "Codigo incorrecto");
        } catch {
          setError(text || `Error ${res.status}`);
        }
        setState("2fa");
        return;
      }

      // 2FA OK, run sorteo
      runSorteo();
    } catch (err: unknown) {
      setError((err as Error).message);
      setState("error");
    }
  }

  async function runSorteo() {
    setState("loading");
    setProgress("Cargando post...");
    setCommentCount(0);
    setLiveComments([]);
    setWinners([]);
    setStats(null);

    try {
      const res = await fetch(`${API_URL}/api/sorteo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          post_url: postUrl || undefined,
          num_ganadores: numGanadores ? parseInt(numGanadores) : 63,
          seed: seedInput ? parseInt(seedInput) : undefined,
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ") && eventType) {
            const data = JSON.parse(line.slice(6));
            if (eventType === "progress") {
              setProgress(data.message);
              if (data.count) setCommentCount(data.count);
              if (data.stats) setStats(data.stats);
              // Capture expected total from post info message
              const match = data.message?.match?.(/(\d+)\s*comentarios/);
              if (match && data.step === "post_ok") setExpectedComments(parseInt(match[1]));
            } else if (eventType === "comments_batch") {
              setCommentCount(data.total);
              setProgress(data.message);
              setLiveComments(prev => {
                const seen = new Set(prev.map(c => c.username));
                const newOnes = data.batch.filter((c: {username: string}) => !seen.has(c.username));
                const next = [...prev, ...newOnes];
                return next.slice(-50);
              });
            } else if (eventType === "result") {
              setWinners(data.ganadores);
              setSeed(data.seed);
              setStats(data.stats);
              setState("done");
              return;
            } else if (eventType === "error") {
              setError(data.message);
              setState("error");
              return;
            }
            eventType = "";
          }
        }
      }
    } catch (err: unknown) {
      setError((err as Error).message);
      setState("error");
    }
  }

  function downloadResults() {
    if (!winners.length) return;
    let txt = `${"=".repeat(60)}\n`;
    txt += `MEGA SORTEO FERIA SANRIO - ${winners.length} GANADORES\n`;
    txt += `Fecha: ${new Date().toLocaleString("es-AR")}\n`;
    txt += `Post: https://www.instagram.com/p/DWzm5E3CcUp/\n`;
    txt += `Seed: ${seed}\n`;
    txt += `${"=".repeat(60)}\n\n`;

    if (stats) {
      txt += "ESTADISTICAS:\n";
      txt += `  Total comentarios: ${stats.total}\n`;
      txt += `  Comentarios validos: ${stats.validos}\n`;
      txt += `  Participantes unicos: ${stats.unicos}\n`;
      txt += `  Ganadores seleccionados: ${stats.ganadores}\n\n`;
    }

    txt += `${"=".repeat(60)}\nLISTA DE GANADORES:\n${"=".repeat(60)}\n\n`;

    for (const w of winners) {
      txt += `#${String(w.number).padStart(2, " ")}  |  Ganador: @${w.username}\n`;
      txt += `      |  Premio de: @${w.emprendimiento}\n`;
      txt += `      |  Comentario: ${w.comment.slice(0, 100)}\n\n`;
    }

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sorteo_feria_sanrio.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen py-8 px-4 relative overflow-hidden">
      {/* Floating decorations */}
      <div className="fixed top-4 left-4 w-20 h-20 opacity-20 float-animation pointer-events-none">
        <Image src="/images/my-melody-strawberry.png" alt="" width={80} height={80} />
      </div>
      <div className="fixed bottom-4 right-4 w-24 h-24 opacity-20 float-animation pointer-events-none" style={{ animationDelay: "1.5s" }}>
        <Image src="/images/hello-kitty.png" alt="" width={96} height={96} />
      </div>
      <div className="fixed top-1/3 right-8 w-16 h-16 opacity-15 float-animation pointer-events-none" style={{ animationDelay: "0.8s" }}>
        <Image src="/images/my-melody-heart.png" alt="" width={64} height={64} />
      </div>

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block float-animation">
            <Image src="/images/my-melody.png" alt="My Melody" width={100} height={133} className="mx-auto drop-shadow-lg" priority />
          </div>
          <h1 className="text-3xl font-bold text-[#D63B6F] drop-shadow-sm mt-3">Mega Sorteo Feria Sanrio</h1>
          <p className="text-[#8C3A5A] mt-1 text-sm tracking-wide">63 ganadores</p>
        </div>

        {/* Login Card */}
        {(state === "idle" || state === "error") && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border-2 border-pink-300 slide-up">
            <div className="flex items-center gap-3 mb-4">
              <Image src="/images/hello-kitty.png" alt="" width={32} height={32} />
              <h2 className="text-lg font-bold text-[#D63B6F]">Login de Instagram</h2>
            </div>
            <p className="text-sm text-[#8C3A5A] mb-4">Se necesita una cuenta de Instagram para leer los comentarios del post.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-[#5C1A33] mb-1">Usuario</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="tu_usuario" autoComplete="off"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-pink-200 bg-pink-50/50 text-[#5C1A33] placeholder-pink-300 focus:outline-none focus:border-[#FF5C8D] focus:ring-2 focus:ring-pink-200 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5C1A33] mb-1">Contrasena</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="tu contrasena" autoComplete="off"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-pink-200 bg-pink-50/50 text-[#5C1A33] placeholder-pink-300 focus:outline-none focus:border-[#FF5C8D] focus:ring-2 focus:ring-pink-200 transition-all" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-[#5C1A33] mb-1">Link del post de Instagram</label>
                <input type="text" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://www.instagram.com/p/..." autoComplete="off"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-pink-200 bg-pink-50/50 text-[#5C1A33] placeholder-pink-300 focus:outline-none focus:border-[#FF5C8D] focus:ring-2 focus:ring-pink-200 transition-all text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5C1A33] mb-1">Cantidad de ganadores</label>
                <input type="number" value={numGanadores} onChange={(e) => setNumGanadores(e.target.value)} placeholder="63" min="1" autoComplete="off"
                  className="w-32 px-4 py-2.5 rounded-xl border-2 border-pink-200 bg-pink-50/50 text-[#5C1A33] placeholder-pink-300 focus:outline-none focus:border-[#FF5C8D] focus:ring-2 focus:ring-pink-200 transition-all" />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-[#8C3A5A] mb-1">Seed (opcional - para reproducir un sorteo)</label>
              <input type="text" value={seedInput} onChange={(e) => setSeedInput(e.target.value)} placeholder="Dejar vacio para generar nueva" autoComplete="off"
                className="w-48 px-4 py-2 rounded-xl border-2 border-pink-100 bg-white text-[#5C1A33] placeholder-pink-300 focus:outline-none focus:border-[#FF5C8D] text-sm transition-all" />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <span className="font-bold">Error:</span> {error}
              </div>
            )}

            <button onClick={handleLogin} disabled={!username || !password}
              className="w-full sm:w-auto px-10 py-3.5 bg-gradient-to-r from-[#FF5C8D] to-[#FF8FAB] text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 text-lg cursor-pointer">
              SORTEAR
            </button>
          </div>
        )}

        {/* 2FA Card */}
        {state === "2fa" && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border-2 border-pink-300 slide-up">
            <div className="flex items-center gap-3 mb-3">
              <Image src="/images/my-melody-heart.png" alt="" width={32} height={32} />
              <h2 className="text-lg font-bold text-[#D63B6F]">Codigo de verificacion</h2>
            </div>
            <p className="text-sm text-[#8C3A5A] mb-4">Instagram envio un codigo a tu telefono. Ingresalo aca:</p>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <span className="font-bold">Error:</span> {error}
              </div>
            )}
            <div className="flex gap-3 items-end">
              <input type="text" value={code2fa} onChange={(e) => setCode2fa(e.target.value)} placeholder="123456" maxLength={6} autoFocus
                className="w-40 px-4 py-2.5 rounded-xl border-2 border-pink-200 bg-pink-50/50 text-[#5C1A33] text-center text-xl tracking-widest font-mono focus:outline-none focus:border-[#FF5C8D] focus:ring-2 focus:ring-pink-200 transition-all"
                onKeyDown={(e) => e.key === "Enter" && handle2FA()} />
              <button onClick={handle2FA} disabled={!code2fa}
                className="px-6 py-2.5 bg-gradient-to-r from-[#FF5C8D] to-[#FF8FAB] text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer">
                Verificar
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {(state === "logging_in" || state === "loading") && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6 border-2 border-pink-300 text-center slide-up">
            {/* Bouncing characters */}
            <div className="flex items-end justify-center gap-4 mb-5">
              <div className="float-animation" style={{ animationDelay: "0s" }}>
                <Image src="/images/my-melody.png" alt="" width={50} height={66} className="drop-shadow-md" />
              </div>
              <div className="float-animation" style={{ animationDelay: "0.4s" }}>
                <Image src="/images/hello-kitty.png" alt="" width={46} height={55} className="drop-shadow-md" />
              </div>
              <div className="float-animation" style={{ animationDelay: "0.8s" }}>
                <Image src="/images/my-melody-heart.png" alt="" width={48} height={52} className="drop-shadow-md" />
              </div>
              <div className="float-animation" style={{ animationDelay: "1.2s" }}>
                <Image src="/images/my-melody-strawberry.png" alt="" width={40} height={60} className="drop-shadow-md" />
              </div>
            </div>

            {/* Step indicators */}
            <div className="flex justify-center gap-2 mb-4">
              <StepDot active={state === "logging_in"} done={state === "loading"} label="Login" />
              <div className="w-6 h-0.5 bg-pink-200 self-center" />
              <StepDot active={state === "loading" && commentCount === 0} done={commentCount > 0} label="Post" />
              <div className="w-6 h-0.5 bg-pink-200 self-center" />
              <StepDot active={commentCount > 0} done={false} label="Comentarios" />
            </div>

            <h2 className="text-lg font-bold text-[#D63B6F] mb-2">{progress}</h2>

            {commentCount > 0 && (
              <div className="mt-4 max-w-md mx-auto">
                <div className="w-full bg-pink-100 rounded-full h-4 overflow-hidden shadow-inner">
                  <div className="h-full bg-gradient-to-r from-[#FF5C8D] via-[#FF8FAB] to-[#FF5C8D] rounded-full transition-all duration-700 relative"
                    style={{
                      width: `${Math.min((commentCount / Math.max(expectedComments, 1)) * 100, 100)}%`,
                      backgroundSize: "200% 100%",
                      animation: "shimmer 1.5s ease-in-out infinite",
                    }} />
                </div>
                <p className="text-sm text-[#8C3A5A] mt-2 font-medium">{commentCount}{expectedComments > 0 ? ` de ~${expectedComments}` : ""} comentarios</p>
              </div>
            )}

            <p className="text-xs text-pink-400 mt-5">Esto puede tardar 1-2 minutos, no cierres la pagina</p>

            {/* Live comments feed */}
            {liveComments.length > 0 && (
              <div className="mt-5 max-w-md mx-auto">
                <p className="text-xs text-[#8C3A5A] mb-2 font-medium">Comentarios extraidos:</p>
                <div className="bg-pink-50 rounded-xl p-3 max-h-52 overflow-y-auto">
                  <div className="space-y-1.5">
                    {liveComments.map((c, i) => (
                      <div key={`${c.username}-${i}`} className="flex items-center gap-2 slide-up" style={{animationDelay: `${i * 20}ms`}}>
                        {c.pic ? (
                          <img src={c.pic} alt="" className="w-6 h-6 rounded-full border border-pink-200 flex-shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-pink-200 flex-shrink-0" />
                        )}
                        <span className="text-xs text-[#5C1A33] truncate">@{c.username}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {state === "done" && winners.length > 0 && (
          <>
            <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border-2 border-pink-300 slide-up">
              <div className="flex items-center gap-3 mb-4">
                <Image src="/images/my-melody-heart.png" alt="" width={28} height={28} />
                <h2 className="text-lg font-bold text-[#D63B6F]">Estadisticas</h2>
              </div>
              {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBox label="Comentarios" value={stats.total} color="bg-pink-50" />
                  <StatBox label="Validos" value={stats.validos} color="bg-green-50" />
                  <StatBox label="Participantes" value={stats.unicos} color="bg-purple-50" />
                  <StatBox label="Ganadores" value={stats.ganadores} color="bg-amber-50" />
                </div>
              )}
              <p className="text-xs text-[#8C3A5A] mt-3">
                Seed: <span className="font-mono bg-pink-50 px-2 py-0.5 rounded">{seed}</span>
                <span className="ml-2 text-pink-400">(guardar para reproducir el sorteo)</span>
              </p>
            </div>

            <div className="flex gap-3 mb-6 slide-up">
              <button onClick={downloadResults}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                Descargar resultados (.txt)
              </button>
              <button onClick={() => { setState("idle"); setWinners([]); setStats(null); setError(""); }}
                className="px-6 py-3 bg-white text-[#D63B6F] font-bold rounded-xl shadow-lg border-2 border-pink-200 hover:bg-pink-50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                Nuevo sorteo
              </button>
            </div>

            <div className="space-y-3">
              {winners.map((w, idx) => (
                <div key={w.number} className="winner-card bg-white/90 backdrop-blur-sm rounded-xl shadow-md p-4 border border-pink-100 hover:border-pink-300 hover:shadow-lg transition-all"
                  style={{ animationDelay: `${idx * 50}ms` }}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 relative">
                      {w.pic ? (
                        <img src={w.pic} alt={w.username} className="w-11 h-11 rounded-full object-cover border-2 border-pink-300 shadow-md" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FF5C8D] to-[#FF8FAB] flex items-center justify-center text-white font-bold text-sm shadow-md">
                          {w.number}
                        </div>
                      )}
                      <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-[#D63B6F] text-white text-[10px] font-bold flex items-center justify-center shadow">{w.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-bold text-[#5C1A33]">@{w.username}</span>
                        <Image src="/images/my-melody-heart.png" alt="" width={16} height={16} className="inline-block" />
                        <span className="text-sm font-semibold text-[#FF5C8D]">Premio de @{w.emprendimiento}</span>
                      </div>
                      <p className="text-sm text-[#8C3A5A] mt-1 truncate">{w.comment}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-8 mb-4">
              <button onClick={downloadResults}
                className="px-8 py-3 bg-gradient-to-r from-[#FF5C8D] to-[#FF8FAB] text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                Descargar todos los resultados
              </button>
            </div>
          </>
        )}

        <div className="text-center mt-8 flex items-center justify-center gap-2">
          <Image src="/images/my-melody-strawberry.png" alt="" width={20} height={20} className="opacity-50" />
          <span className="text-xs text-pink-400">Sorteo Feria Sanrio 2026</span>
          <Image src="/images/my-melody-strawberry.png" alt="" width={20} height={20} className="opacity-50" />
        </div>
      </div>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-3 h-3 rounded-full transition-all duration-500 ${
        done ? "bg-green-400 scale-110" : active ? "bg-[#FF5C8D] pulse-pink scale-110" : "bg-pink-200"
      }`} />
      <span className={`text-[10px] ${done ? "text-green-500" : active ? "text-[#D63B6F] font-bold" : "text-pink-300"}`}>{label}</span>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`${color} rounded-xl p-3 text-center`}>
      <div className="text-2xl font-bold text-[#D63B6F]">{value}</div>
      <div className="text-xs text-[#8C3A5A]">{label}</div>
    </div>
  );
}
