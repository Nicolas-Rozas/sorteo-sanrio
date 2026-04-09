"use client";

import { useState, useRef } from "react";
import Image from "next/image";

interface Comment {
  username: string;
  text: string;
  pic: string;
  is_emprendimiento: boolean;
  has_mention: boolean;
}

interface JsonData {
  post_url: string;
  extracted_at: string;
  total_comments: number;
  comments: Comment[];
}

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

const EMPRENDIMIENTOS_ORDEN = [
  "herse.accesorios", "pushilol", "akihabara.shop.arg", "pitsuki.atelier",
  "universopola", "dubu.dubu.shop", "blanca.aurora.lenceria", "nagareboshistore",
  "yubistore.ros", "pinkmonster_makeup", "__duckstore__", "gg.forge",
  "merci.verse", "pinktulip.store", "cerezaa_store", "sweet.ros.crochet",
  "michis2d", "pepones.juguetesdetela", "michi_magico_store", "sukisukiregalos",
  "pusscat.store", "star.tiendaderegalos", "nerisanart", "sublimando.ideas.ok",
  "diario_foto.grafico", "_encandelarte", "mysoftystore", "amikittyshop",
  "shadowww_porcelana", "anara.made", "gauchapowerdesign", "amikoru_crochet",
  "layover.crochet", "_nekoluli", "puchistore.ok", "mkmrelax",
  "enciassangrantesok", "wagashirosario", "ilusiones_3drosario",
  "la_mazmorra_lvl_24", "bufon_negro_", "sailorcrisis_", "soyfan.creaciones",
  "memi_.crochet", "thiago3d_", "kitty.tienda_arg", "espacio_lv97",
  "rinascita.gian", "xiaomao.cat_", "pinsland.ok", "puntos_y_detalles._",
  "kiki.berry.mouse", "kinoko.jew", "lautaro.estudio.030", "envuelveme2021",
  "by.pam.papeleria", "dragon_fly_store7894", "flaviafernandespasteleria",
  "kuma_draw26", "anyaobjetoscreativos", "decorando_sonrisa", "fuwapasteleria",
  "sabor_a_mi_siempre", "okami.snacksrosario", "proyecto.kumi", "fuegomacetas",
  "partyart_official",
];

const EMPRENDIMIENTOS_SET = new Set(EMPRENDIMIENTOS_ORDEN);

// Seeded random for reproducibility
function seededRng(seed: number) {
  let t = seed + 0x6D2B79F5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type AppState = "upload" | "preview" | "rolling" | "done";

export default function Home() {
  const [state, setState] = useState<AppState>("upload");
  const [jsonData, setJsonData] = useState<JsonData | null>(null);
  const [numGanadores, setNumGanadores] = useState("63");
  const [seedInput, setSeedInput] = useState("");
  const [winners, setWinners] = useState<Winner[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function parseCSV(text: string): Comment[] {
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];

    // Detect delimiter (comma or semicolon)
    const header = lines[0].toLowerCase();
    const delim = header.includes("\t") ? "\t" : header.includes(";") ? ";" : ",";
    const cols = header.split(delim).map(c => c.trim().replace(/"/g, ""));

    // Find column indices - flexible matching
    const usernameIdx = cols.findIndex(c => c.includes("username") || c.includes("user") || c.includes("usuario"));
    const textIdx = cols.findIndex(c => c.includes("text") || c.includes("comment") || c.includes("comentario") || c.includes("mensaje"));
    const picIdx = cols.findIndex(c => c.includes("pic") || c.includes("photo") || c.includes("avatar") || c.includes("profile pic"));

    if (usernameIdx === -1 || textIdx === -1) return [];

    const comments: Comment[] = [];
    for (let i = 1; i < lines.length; i++) {
      // Handle quoted CSV fields
      const row = lines[i].match(/(".*?"|[^,\t;]+)/g)?.map(f => f.replace(/^"|"$/g, "").trim()) || lines[i].split(delim).map(f => f.trim().replace(/^"|"$/g, ""));

      const username = (row[usernameIdx] || "").toLowerCase().replace(/^@/, "");
      const text = row[textIdx] || "";
      const pic = picIdx >= 0 ? (row[picIdx] || "") : "";

      if (!username) continue;

      comments.push({
        username,
        text,
        pic,
        is_emprendimiento: EMPRENDIMIENTOS_SET.has(username),
        has_mention: text.includes("@"),
      });
    }
    return comments;
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;

      // Detect if JSON or CSV
      const trimmed = content.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        // JSON
        try {
          const raw = JSON.parse(trimmed);
          let data: JsonData;
          if (raw.comments && Array.isArray(raw.comments)) {
            data = raw as JsonData;
          } else if (Array.isArray(raw)) {
            // Array of comments directly
            data = {
              post_url: "",
              extracted_at: "",
              total_comments: raw.length,
              comments: raw.map((c: Record<string, string>) => ({
                username: (c.username || c.user || "").toLowerCase(),
                text: c.text || c.comment || "",
                pic: c.pic || c.profile_pic_url || "",
                is_emprendimiento: EMPRENDIMIENTOS_SET.has((c.username || c.user || "").toLowerCase()),
                has_mention: (c.text || c.comment || "").includes("@"),
              })),
            };
          } else {
            setError("Formato JSON no reconocido.");
            return;
          }
          setJsonData(data);
          setState("preview");
        } catch {
          setError("No se pudo leer el archivo JSON.");
        }
      } else {
        // CSV
        const comments = parseCSV(content);
        if (comments.length === 0) {
          setError("No se encontraron comentarios en el CSV. Verifica que tenga columnas 'username' y 'text'.");
          return;
        }
        setJsonData({
          post_url: "",
          extracted_at: "",
          total_comments: comments.length,
          comments,
        });
        setState("preview");
      }
    };
    reader.readAsText(file);
  }

  function runSorteo() {
    if (!jsonData) return;
    setState("rolling");

    const num = parseInt(numGanadores) || 63;

    // Filter
    const validos = jsonData.comments.filter(c => !c.is_emprendimiento && c.has_mention);
    const exclEmp = jsonData.comments.filter(c => c.is_emprendimiento).length;
    const exclNoAt = jsonData.comments.filter(c => !c.is_emprendimiento && !c.has_mention).length;

    // Deduplicate
    const seen = new Set<string>();
    const participantes: Comment[] = [];
    for (const c of validos) {
      if (!seen.has(c.username)) {
        seen.add(c.username);
        participantes.push(c);
      }
    }

    // Draw with seed
    const seedFinal = seedInput ? parseInt(seedInput) : Math.floor(Date.now() / 1000);
    const rng = seededRng(seedFinal);
    const n = Math.min(num, participantes.length);

    // Shuffle with seeded RNG
    const shuffled = [...participantes];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const ganadores = shuffled.slice(0, n);

    const result = ganadores.map((g, i) => ({
      number: i + 1,
      username: g.username,
      comment: g.text,
      pic: g.pic,
      emprendimiento: EMPRENDIMIENTOS_ORDEN[i] || "---",
    }));

    // Animate: show winners one by one
    setStats({
      total: jsonData.comments.length,
      validos: validos.length,
      unicos: participantes.length,
      ganadores: n,
      exclEmp,
      exclNoAt,
    });
    setSeed(seedFinal);

    // Stagger reveal
    let i = 0;
    const interval = setInterval(() => {
      i += 3;
      setWinners(result.slice(0, i));
      if (i >= result.length) {
        clearInterval(interval);
        setWinners(result);
        setState("done");
      }
    }, 100);
  }

  function downloadResults() {
    if (!winners.length) return;
    let txt = `${"=".repeat(60)}\n`;
    txt += `MEGA SORTEO FERIA SANRIO - ${winners.length} GANADORES\n`;
    txt += `Fecha: ${new Date().toLocaleString("es-AR")}\n`;
    txt += `Post: ${jsonData?.post_url || ""}\n`;
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

  function reset() {
    setState("upload");
    setJsonData(null);
    setWinners([]);
    setStats(null);
    setSeed(null);
    setError("");
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
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
          <p className="text-[#8C3A5A] mt-1 text-sm tracking-wide">Sorteo de ganadores desde comentarios de Instagram</p>
        </div>

        {/* Upload Card */}
        {state === "upload" && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border-2 border-pink-300 slide-up">
            <div className="flex items-center gap-3 mb-4">
              <Image src="/images/hello-kitty.png" alt="" width={32} height={32} />
              <h2 className="text-lg font-bold text-[#D63B6F]">Cargar comentarios</h2>
            </div>
            <p className="text-sm text-[#8C3A5A] mb-5">
              Subi el archivo CSV (de la extension de Chrome) o JSON con los comentarios del post.
            </p>

            <div
              className="border-2 border-dashed border-pink-300 rounded-xl p-8 text-center hover:bg-pink-50/50 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <Image src="/images/my-melody-heart.png" alt="" width={48} height={48} className="mx-auto mb-3 opacity-60" />
              <p className="text-[#D63B6F] font-medium">
                {fileName || "Click aca para subir el archivo (CSV o JSON)"}
              </p>
              <p className="text-xs text-pink-400 mt-1">o arrastralo aca</p>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.csv,.tsv,.txt,.xlsx"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <span className="font-bold">Error:</span> {error}
              </div>
            )}
          </div>
        )}

        {/* Preview Card - after upload, before sorteo */}
        {(state === "preview" || state === "rolling") && jsonData && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border-2 border-pink-300 slide-up">
            <div className="flex items-center gap-3 mb-4">
              <Image src="/images/my-melody-strawberry.png" alt="" width={28} height={28} />
              <h2 className="text-lg font-bold text-[#D63B6F]">Datos cargados</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              <div className="bg-pink-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-[#D63B6F]">{jsonData.total_comments}</div>
                <div className="text-xs text-[#8C3A5A]">Comentarios</div>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-[#D63B6F]">
                  {jsonData.comments.filter(c => !c.is_emprendimiento && c.has_mention).length}
                </div>
                <div className="text-xs text-[#8C3A5A]">Validos</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-[#D63B6F]">
                  {new Set(jsonData.comments.filter(c => !c.is_emprendimiento && c.has_mention).map(c => c.username)).size}
                </div>
                <div className="text-xs text-[#8C3A5A]">Participantes unicos</div>
              </div>
            </div>

            <p className="text-xs text-[#8C3A5A] mb-4">
              Post: <span className="font-mono">{jsonData.post_url}</span> | Extraido: {jsonData.extracted_at}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-[#5C1A33] mb-1">Cantidad de ganadores</label>
                <input type="number" value={numGanadores} onChange={(e) => setNumGanadores(e.target.value)} min="1" autoComplete="off"
                  className="w-32 px-4 py-2.5 rounded-xl border-2 border-pink-200 bg-pink-50/50 text-[#5C1A33] focus:outline-none focus:border-[#FF5C8D] focus:ring-2 focus:ring-pink-200 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#8C3A5A] mb-1">Seed (opcional)</label>
                <input type="text" value={seedInput} onChange={(e) => setSeedInput(e.target.value)} placeholder="Auto-generada" autoComplete="off"
                  className="w-48 px-4 py-2 rounded-xl border-2 border-pink-100 bg-white text-[#5C1A33] placeholder-pink-300 focus:outline-none focus:border-[#FF5C8D] text-sm transition-all" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={runSorteo} disabled={state === "rolling"}
                className="px-10 py-3.5 bg-gradient-to-r from-[#FF5C8D] to-[#FF8FAB] text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 text-lg cursor-pointer">
                {state === "rolling" ? "Sorteando..." : "SORTEAR"}
              </button>
              <button onClick={reset}
                className="px-6 py-3 bg-white text-[#D63B6F] font-bold rounded-xl shadow border-2 border-pink-200 hover:bg-pink-50 transition-all cursor-pointer">
                Cambiar archivo
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {winners.length > 0 && (
          <>
            {/* Stats */}
            {stats && state === "done" && (
              <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border-2 border-pink-300 slide-up">
                <div className="flex items-center gap-3 mb-4">
                  <Image src="/images/my-melody-heart.png" alt="" width={28} height={28} />
                  <h2 className="text-lg font-bold text-[#D63B6F]">Resultado del sorteo</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBox label="Comentarios" value={stats.total} color="bg-pink-50" />
                  <StatBox label="Validos" value={stats.validos} color="bg-green-50" />
                  <StatBox label="Participantes" value={stats.unicos} color="bg-purple-50" />
                  <StatBox label="Ganadores" value={stats.ganadores} color="bg-amber-50" />
                </div>
                <p className="text-xs text-[#8C3A5A] mt-3">
                  Seed: <span className="font-mono bg-pink-50 px-2 py-0.5 rounded">{seed}</span>
                  <span className="ml-2 text-pink-400">(guardar para reproducir el sorteo)</span>
                </p>
              </div>
            )}

            {/* Actions */}
            {state === "done" && (
              <div className="flex gap-3 mb-6 slide-up">
                <button onClick={downloadResults}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                  Descargar resultados (.txt)
                </button>
                <button onClick={reset}
                  className="px-6 py-3 bg-white text-[#D63B6F] font-bold rounded-xl shadow-lg border-2 border-pink-200 hover:bg-pink-50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                  Nuevo sorteo
                </button>
              </div>
            )}

            {/* Winners list */}
            <div className="space-y-3">
              {winners.map((w, idx) => (
                <div key={w.number}
                  className="winner-card bg-white rounded-xl shadow-md p-4 border border-pink-100 hover:border-pink-300 hover:shadow-lg transition-all"
                  style={{ animationDelay: `${idx * 30}ms` }}>
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

            {/* Footer download */}
            {state === "done" && (
              <div className="text-center mt-8 mb-4">
                <button onClick={downloadResults}
                  className="px-8 py-3 bg-gradient-to-r from-[#FF5C8D] to-[#FF8FAB] text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                  Descargar todos los resultados
                </button>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="text-center mt-8 flex items-center justify-center gap-2">
          <Image src="/images/my-melody-strawberry.png" alt="" width={20} height={20} className="opacity-50" />
          <span className="text-xs text-pink-400">Sorteo Feria Sanrio 2026</span>
          <Image src="/images/my-melody-strawberry.png" alt="" width={20} height={20} className="opacity-50" />
        </div>
      </div>
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
