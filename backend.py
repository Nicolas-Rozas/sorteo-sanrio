"""
FastAPI backend for Sorteo Instagram. Fast + streaming.
"""

import sys
import time
import random
import json
import logging
from collections import OrderedDict
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sorteo")

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from instagrapi import Client
from instagrapi.exceptions import TwoFactorRequired, BadCredentials, PleaseWaitFewMinutes

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

POST_URL = "https://www.instagram.com/p/DWzm5E3CcUp/"
NUM_GANADORES = 63

EMPRENDIMIENTOS_ORDEN = [
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
]
EMPRENDIMIENTOS_SET = set(EMPRENDIMIENTOS_ORDEN)

# In-memory store
pending_clients: dict[str, Client] = {}


class LoginRequest(BaseModel):
    username: str
    password: str

class TwoFARequest(BaseModel):
    username: str
    password: str
    code: str

class SorteoRequest(BaseModel):
    username: str
    post_url: str = POST_URL
    num_ganadores: int = NUM_GANADORES
    seed: Optional[int] = None


def create_ig_client():
    cl = Client()
    cl.delay_range = [0, 1]  # minimal delay
    cl.set_locale("es_AR")
    cl.set_country("AR")
    cl.set_country_code(54)
    cl.set_timezone_offset(-3 * 3600)
    return cl


@app.post("/api/login")
async def login(req: LoginRequest):
    cl = create_ig_client()
    try:
        cl.login(req.username, req.password)
        pending_clients[req.username] = cl
        return {"status": "ok"}
    except TwoFactorRequired:
        pending_clients[req.username] = cl
        return {"status": "2fa_required"}
    except BadCredentials:
        raise HTTPException(400, "Usuario o contrasena incorrectos.")
    except PleaseWaitFewMinutes:
        raise HTTPException(429, "Instagram dice que esperes unos minutos.")
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/login-2fa")
async def login_2fa(req: TwoFARequest):
    cl = pending_clients.get(req.username)
    if not cl:
        cl = create_ig_client()
    try:
        cl.login(req.username, req.password, verification_code=req.code)
        pending_clients[req.username] = cl
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, f"Error 2FA: {e}")


@app.post("/api/sorteo")
async def sorteo(req: SorteoRequest):
    cl = pending_clients.get(req.username)
    if not cl:
        raise HTTPException(401, "No hay sesion activa. Hace login primero.")

    def generate():
        try:
            post_url = req.post_url or POST_URL
            num_gan = req.num_ganadores or NUM_GANADORES
            yield sse("progress", {"message": "Cargando post...", "step": "post"})
            media_pk = cl.media_pk_from_url(post_url)
            media_id = cl.media_id(media_pk)
            media_info = cl.media_info(media_pk)
            likes = media_info.like_count
            total_comments = media_info.comment_count
            yield sse("progress", {"message": f"Post: {likes} likes, {total_comments} comentarios", "step": "post_ok"})

            # STREAM COMMENTS - send each batch as it arrives
            yield sse("progress", {"message": "Extrayendo comentarios...", "step": "comments"})
            all_comments = []
            min_id = None
            retries = 0
            max_retries = 8  # more tolerance for empty chunks

            while True:
                try:
                    chunk, min_id = cl.media_comments_chunk(media_id, max_amount=100, min_id=min_id)
                except Exception as e:
                    logger.info(f"[CHUNK ERROR] retry {retries}: {e}")
                    retries += 1
                    if retries > max_retries:
                        logger.info(f"[DONE] max retries hit at {len(all_comments)} comments")
                        break
                    time.sleep(2)
                    continue

                if not chunk:
                    retries += 1
                    logger.info(f"[EMPTY CHUNK] retry {retries}/{max_retries}, have {len(all_comments)} so far, min_id={min_id}")
                    if retries > max_retries:
                        logger.info(f"[DONE] empty chunks, stopping at {len(all_comments)}")
                        break
                    time.sleep(1)
                    continue

                retries = 0
                logger.info(f"[CHUNK] got {len(chunk)} comments, total: {len(all_comments) + len(chunk)}, min_id={min_id}")
                batch = []
                for c in chunk:
                    entry = {
                        "username": c.user.username.lower(),
                        "text": c.text or "",
                        "pic": str(c.user.profile_pic_url or ""),
                    }
                    all_comments.append(entry)
                    batch.append({"username": entry["username"], "pic": entry["pic"]})

                # Stream this batch to frontend in real-time
                yield sse("comments_batch", {
                    "batch": batch,
                    "total": len(all_comments),
                    "message": f"Extrayendo... {len(all_comments)} comentarios",
                })

                if not min_id:
                    break
                time.sleep(0.5)  # small delay, just enough

            yield sse("progress", {"message": f"{len(all_comments)} comentarios extraidos!", "step": "comments_ok"})

            # FILTER + DEDUPLICATE
            yield sse("progress", {"message": "Filtrando y deduplicando...", "step": "filter"})
            validos = []
            excl_emp = 0
            excl_noat = 0
            for c in all_comments:
                if c["username"] in EMPRENDIMIENTOS_SET:
                    excl_emp += 1
                elif "@" not in c["text"]:
                    excl_noat += 1
                else:
                    validos.append(c)

            vistos = OrderedDict()
            for c in validos:
                if c["username"] not in vistos:
                    vistos[c["username"]] = c
            participantes = list(vistos.values())

            stats = {
                "total": len(all_comments),
                "validos": len(validos),
                "unicos": len(participantes),
                "exclEmp": excl_emp,
                "exclNoAt": excl_noat,
            }
            yield sse("progress", {"message": f"{len(participantes)} participantes unicos!", "step": "filter_ok", "stats": stats})

            # DRAW
            seed_final = req.seed if req.seed else int(time.time())
            n = min(num_gan, len(participantes))
            random.seed(seed_final)
            # Shuffle first to eliminate any ordering bias
            random.shuffle(participantes)
            ganadores_list = random.sample(participantes, n)

            result = []
            for i, g in enumerate(ganadores_list):
                result.append({
                    "number": i + 1,
                    "username": g["username"],
                    "comment": g["text"],
                    "pic": g.get("pic", ""),
                    "emprendimiento": EMPRENDIMIENTOS_ORDEN[i] if i < len(EMPRENDIMIENTOS_ORDEN) else "???",
                })

            yield sse("result", {
                "ganadores": result,
                "seed": seed_final,
                "stats": {**stats, "ganadores": n},
            })

        except Exception as e:
            yield sse("error", {"message": str(e)})

    return StreamingResponse(generate(), media_type="text/event-stream")


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
