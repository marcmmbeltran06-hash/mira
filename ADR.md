# ADR — Architecture Decision Record — AutoWP

> Documento vivo. Cada decisión se numera y no se borra aunque quede obsoleta:
> si una decisión se revierte, se añade una ADR nueva que la sustituye y se
> referencia la anterior como "Deprecada por ADR-XXX".

---

## ADR-001 — Motor de renderizado: Playwright

**Estado:** Aceptada

**Contexto:** Necesitamos rastrear sitios que pueden usar JS pesado, lazy
loading, infinite scroll, frameworks SPA.

**Decisión:** Usamos Playwright (no Puppeteer, no scraping estático puro).

**Motivo:**
- Soporta Chromium, Firefox y WebKit con la misma API.
- Manejo nativo de múltiples contextos de navegador aislados (cookies, sesión).
- API de auto-espera (`waitForSelector`, `waitForLoadState`) más robusta que
  Puppeteer para contenido cargado de forma asíncrona.
- Mejor soporte para interceptar y mockear network requests.

**Alternativas descartadas:**
- *Puppeteer*: solo Chromium, API de espera menos robusta.
- *Scraping estático (cheerio + fetch)*: no ejecuta JS, inválido para SPAs y
  lazy loading.

**Consecuencias:** El crawler es más pesado en recursos (RAM/CPU por instancia
de navegador). Necesitamos un `BrowserPool` con límite de contextos concurrentes.

---

## ADR-002 — Persistencia interna: SQLite

**Estado:** Aceptada

**Contexto:** Necesitamos guardar snapshots de rastreo, historial de análisis
y estado del pipeline.

**Decisión:** SQLite como única base de datos interna del propio AutoWP (no
confundir con la base de datos MySQL final del WordPress generado).

**Motivo:**
- El proyecto debe ser autocontenido: sin servidor de base de datos externo
  que instalar para usar la herramienta.
- Volumen de datos esperado (snapshots de un sitio, historial de análisis) es
  perfectamente manejable por SQLite.
- Facilita distribución: un solo fichero `.sqlite` portable.

**Alternativas descartadas:**
- *PostgreSQL/MySQL externo*: añade una dependencia de infraestructura
  innecesaria para una herramienta que corre principalmente en local/CLI.

**Consecuencias:** Sin escritura concurrente pesada — aceptable porque el
pipeline es mayormente secuencial por sitio analizado.

---

## ADR-003 — IA como módulo opcional y desacoplado (Gemini)

**Estado:** Aceptada

**Contexto:** Parte de la clasificación de bloques y detección de productos es
ambigua y se beneficia de un LLM, pero no queremos que el proyecto dependa de
tener una API key para funcionar.

**Decisión:** Gemini se integra detrás de una interfaz `AIEngine` con modo
`fallback` obligatorio basado en heurísticas. Todo módulo que llame a IA debe
poder ejecutarse en modo degradado sin ella.

**Motivo:**
- Coste y disponibilidad de la API no deben ser un punto único de fallo.
- Permite testear el pipeline completo sin gastar cuota de API.

**Consecuencias:** Cada módulo que use IA necesita definir explícitamente cuál
es su comportamiento heurístico equivalente, documentado en su propia spec.

---

## ADR-004 — Entrega final: Docker / docker-compose

**Estado:** Aceptada

**Contexto:** El resultado final debe ser un WordPress + WooCommerce operativo.

**Decisión:** Se entrega vía `docker-compose.yml` (WordPress + MySQL), no como
build manual ni como servicio propietario independiente.

**Motivo:** El cliente final gestiona su sitio desde el panel de WordPress que
ya conoce; Docker garantiza reproducibilidad del entorno sin depender de un
hosting concreto.

**Alternativas descartadas:** Generar una web standalone (Next.js, etc.) —
descartada porque el objetivo explícito es WordPress, no un sitio nuevo.

---

## ADR-005 — Detección de productos en cascada

**Estado:** Aceptada

**Contexto:** Los sitios de origen exponen productos de formas muy distintas
(microdatos, HTML repetitivo, texto libre, APIs internas).

**Decisión:** Cascada de estrategias en orden de fiabilidad:
1. Datos estructurados (schema.org / JSON-LD)
2. Patrones HTML repetitivos
3. Análisis de texto
4. APIs internas detectadas (fetch/XHR)
5. IA (último recurso)

**Motivo:** Siempre se prioriza la señal más fiable y barata computacionalmente
antes de recurrir a heurísticas más caras o a IA.

**Consecuencias:** Cada estrategia debe devolver un `confidence score`
normalizado para poder compararse entre sí y decidir cuándo pasar a la
siguiente.

---

## Plantilla para nuevas ADR

```
## ADR-XXX — <título corto>

**Estado:** Propuesta / Aceptada / Deprecada por ADR-YYY

**Contexto:** ¿Qué problema obliga a decidir esto?

**Decisión:** ¿Qué se decide, en una frase?

**Motivo:** ¿Por qué esta opción y no otra?

**Alternativas descartadas:** ¿Qué se consideró y por qué se rechazó?

**Consecuencias:** ¿Qué implica esta decisión para el resto del sistema?
```
