"""
Extrae comentarios de un post de Instagram y los guarda en un JSON.
Ese JSON se sube a la web del sorteo.

Uso:
  python extraer_comentarios.py
"""

import sys
import json
import time
from collections import OrderedDict

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from instagrapi import Client
from instagrapi.exceptions import TwoFactorRequired

POST_URL = "https://www.instagram.com/p/DWzm5E3CcUp/"

EMPRENDIMIENTOS = {
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
}


def main():
    print("=" * 50)
    print("EXTRACTOR DE COMENTARIOS INSTAGRAM")
    print("=" * 50)

    url = input(f"\nURL del post [{POST_URL}]: ").strip() or POST_URL
    user = input("Usuario de Instagram: ").strip()
    password = input("Contrasena: ").strip()

    if not user or not password:
        print("Usuario y contrasena requeridos.")
        return

    cl = Client()
    cl.delay_range = [0, 1]
    cl.set_locale("es_AR")
    cl.set_country("AR")
    cl.set_country_code(54)
    cl.set_timezone_offset(-3 * 3600)

    print("\nIniciando sesion...")
    try:
        cl.login(user, password)
    except TwoFactorRequired:
        code = input("Codigo 2FA: ").strip()
        cl.login(user, password, verification_code=code)

    print("Sesion OK!")

    print("\nCargando post...")
    media_pk = cl.media_pk_from_url(url)
    media_id = cl.media_id(media_pk)
    media_info = cl.media_info(media_pk)
    print(f"Post: {media_info.like_count} likes, {media_info.comment_count} comentarios")

    print("\nExtrayendo comentarios...")
    all_comments = []
    min_id = None
    retries = 0

    while True:
        try:
            chunk, min_id = cl.media_comments_chunk(media_id, max_amount=100, min_id=min_id)
        except Exception:
            retries += 1
            if retries > 8:
                break
            time.sleep(2)
            continue

        if not chunk:
            retries += 1
            if retries > 8:
                break
            time.sleep(1)
            continue

        retries = 0
        all_comments.extend(chunk)
        print(f"  ... {len(all_comments)} comentarios")
        if not min_id:
            break
        time.sleep(0.5)

    print(f"\nTotal: {len(all_comments)} comentarios extraidos")

    # Build JSON with filtering + dedup info
    comentarios = []
    for c in all_comments:
        username = c.user.username.lower()
        text = c.text or ""
        pic = str(c.user.profile_pic_url or "")
        is_emprendimiento = username in EMPRENDIMIENTOS
        has_mention = "@" in text

        comentarios.append({
            "username": username,
            "text": text,
            "pic": pic,
            "is_emprendimiento": is_emprendimiento,
            "has_mention": has_mention,
        })

    output = {
        "post_url": url,
        "extracted_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_comments": len(comentarios),
        "comments": comentarios,
    }

    filename = "comentarios_instagram.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # Stats
    validos = [c for c in comentarios if not c["is_emprendimiento"] and c["has_mention"]]
    seen = set()
    unicos = []
    for c in validos:
        if c["username"] not in seen:
            seen.add(c["username"])
            unicos.append(c)

    print(f"\n--- Estadisticas ---")
    print(f"  Total: {len(comentarios)}")
    print(f"  Validos: {len(validos)}")
    print(f"  Participantes unicos: {len(unicos)}")
    print(f"\nArchivo guardado: {filename}")
    print("Subi este archivo a la web del sorteo!")


if __name__ == "__main__":
    main()
