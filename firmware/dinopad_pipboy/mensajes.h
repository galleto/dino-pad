// mensajes.h - Mensajes predeterminados de la pestana MENS.
// Solo ASCII (la fuente de la pantalla no tiene acentos ni enie) y max 24 caracteres
// para que quepan en una fila de tamano 2. Probado en test/verificar_vitales.sh.
//
// ENVIAR_MENSAJE = false: al elegir uno solo se muestra en pantalla; NO sale por radio.
#pragma once

static const char* const MENSAJES_PREDETERMINADOS[] = {
    "Estoy bien",
    "Recibido, entendido",
    "Voy en camino",
    "Regreso al habitat",
    "Espero instrucciones",
    "Bateria baja",
    "Suministros bajos",
    "Necesito ayuda medica",
};
static const int N_MENSAJES = sizeof(MENSAJES_PREDETERMINADOS) / sizeof(MENSAJES_PREDETERMINADOS[0]);
static const int MAX_CHARS_MENSAJE = 24;
