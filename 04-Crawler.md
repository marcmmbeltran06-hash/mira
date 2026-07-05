# 04 — Crawler

> Referencias obligatorias: `MASTER_PROMPT.md`, `ADR-001` (Playwright).

## 1. Responsabilidad

Recorrer el sitio de origen y producir, para cada URL visitada, un snapshot del
DOM ya renderizado, listo para que `Analyzer` (spec 14) lo procese. El Crawler
NO clasifica contenido ni detecta productos: solo obtiene y persiste el DOM.

## 2. Interfaz pública

```typescript
interface CrawlOptions {
  entryUrl: string;
  maxPages?: number;          // default 200
  maxDepth?: number;          // default 5
  concurrency?: number;       // default 3 (contextos de navegador simultáneos)
  respectRobotsTxt?: boolean; // default true
  rateLimitMs?: number;       // default 500ms entre requests al mismo dominio
  timeoutMs?: number;         // default 30000 por página
  userAgent?: string;
}

interface CrawlSnapshot {
  url: string;
  finalUrl: string;           // tras redirecciones
  statusCode: number;
  html: string;               // DOM ya renderizado (post-JS)
  screenshotPath?: string;
  depth: number;
  discoveredAt: Date;
  links: string[];            // URLs internas descubiertas en esta página
  crawlDurationMs: number;
  errors: CrawlPageError[];   // errores no fatales (ver sección 5)
}

interface CrawlResult {
  snapshots: CrawlSnapshot[];
  siteMapUsed: boolean;
  totalPagesVisited: number;
  totalPagesSkipped: number;
  fatalError?: CrawlFatalError;
}

// Punto de entrada único del módulo
function crawlSite(options: CrawlOptions): Promise<CrawlResult>;
```

## 3. Flujo interno

1. **Descubrimiento inicial**
   - Intentar leer `sitemap.xml` en la raíz. Si existe, extraer todas las URLs
     internas de ahí como semillas de la cola.
   - Leer `robots.txt`. Si `respectRobotsTxt = true`, filtrar rutas
     `Disallow` antes de encolar nada.
   - Si no hay `sitemap.xml`, encolar únicamente `entryUrl`.

2. **Cola de rastreo (Queue, spec 06)**
   - Cola con prioridad: páginas con más enlaces entrantes descubiertos se
     procesan antes.
   - Deduplicación por URL normalizada (sin fragmento `#`, sin parámetros de
     tracking conocidos: `utm_*`, `fbclid`, etc.).

3. **BrowserPool (spec 05)**
   - Pool de contextos Playwright, tamaño = `concurrency`.
   - Cada contexto es aislado (cookies/sesión independientes) para evitar
     contaminación entre páginas.

4. **Por cada URL de la cola:**
   a. Adquirir contexto del pool.
   b. Navegar con `page.goto(url, { waitUntil: 'networkidle', timeout })`.
   c. **Resolver lazy loading**: hacer scroll incremental hasta el final del
      documento o hasta que la altura del `document.body` deje de crecer
      durante 2 scrolls consecutivos (máx. 15 scrolls).
   d. **Resolver infinite scroll**: si tras el paso (c) aparecen nuevos
      elementos con selectores típicos de paginación infinita (`[data-page]`,
      botones "cargar más" detectados por texto), hacer click y repetir scroll
      hasta 3 iteraciones adicionales o hasta que no cambie el conteo de nodos.
   e. Capturar `page.content()` como HTML final.
   f. Extraer todos los `<a href>` internos (mismo dominio) para la cola.
   g. Liberar el contexto (limpiar cookies si se reutiliza).
   h. Guardar `CrawlSnapshot` vía `Storage` (spec 12).

5. **Rate limiting:** esperar `rateLimitMs` entre peticiones al mismo dominio,
   incluso con concurrencia > 1 (el límite es por dominio, no global).

6. **Reintentos:** ante timeout o error 5xx, reintentar hasta 2 veces con
   backoff exponencial (1s, 4s). Tras 2 fallos, registrar en `errors` y
   continuar con la siguiente URL — nunca abortar todo el crawl por un fallo
   puntual.

## 4. Casos límite

| Caso | Comportamiento esperado |
|---|---|
| `sitemap.xml` devuelve 404 | Continuar solo con `entryUrl`, sin error fatal |
| `sitemap.xml` mal formado (XML inválido) | Loguear warning, tratar como si no existiera |
| Página redirige fuera del dominio original | No seguir la redirección para descubrimiento de enlaces; sí registrar el snapshot con `finalUrl` externa y no encolar nada nuevo desde ahí |
| Página protegida por login / muro de pago | Registrar snapshot con el HTML que se obtenga (probablemente la pantalla de login) y marcar `errors: ['auth_wall_suspected']`; no intentar credenciales |
| Contenido dentro de `<iframe>` de otro origen | No renderizar cross-origin iframes (política de Playwright lo impide igualmente); registrar en `errors: ['cross_origin_iframe_skipped']` con la URL del iframe si es legible |
| Shadow DOM (Web Components) | `page.content()` no captura shadow DOM cerrado. Para shadow DOM abierto, usar `page.evaluate` con recorrido manual del árbol antes de serializar. Documentar en el snapshot si se detectó shadow DOM |
| Service Worker que cachea agresivamente | Navegar siempre con `bypassCSP: true` y limpiar cache del contexto antes de cada página nueva |
| Se alcanza `maxPages` o `maxDepth` | Detener la cola de forma ordenada, devolver `CrawlResult` con lo acumulado hasta ese punto, `totalPagesSkipped` refleja lo que quedó sin visitar |
| El dominio bloquea por rate limit (429) | Backoff exponencial específico para 429 (más agresivo: 5s, 20s, 60s), máximo 3 intentos, luego marcar la URL como fallida y continuar |
| Sitio completo caído (no responde ninguna URL) | Tras 5 fallos consecutivos de red (no HTTP, sino de conexión), abortar con `CrawlFatalError` — no tiene sentido seguir reintentando el resto |

## 5. Errores

```typescript
type CrawlPageErrorType =
  | 'timeout'
  | 'http_error'
  | 'auth_wall_suspected'
  | 'cross_origin_iframe_skipped'
  | 'network_error';

interface CrawlPageError {
  type: CrawlPageErrorType;
  message: string;
  statusCode?: number;
}

interface CrawlFatalError {
  reason: 'site_unreachable' | 'invalid_entry_url';
  message: string;
}
```

Regla general (heredada de `MASTER_PROMPT.md`): un error en UNA página nunca
debe abortar el crawl completo. Solo abortan errores que indiquen que el sitio
entero es inalcanzable.

## 6. Eventos emitidos

Para permitir progreso en CLI en tiempo real:

```typescript
type CrawlEvent =
  | { type: 'page_started'; url: string; depth: number }
  | { type: 'page_completed'; url: string; durationMs: number }
  | { type: 'page_failed'; url: string; error: CrawlPageError }
  | { type: 'queue_updated'; pending: number; visited: number };
```

## 7. Tests requeridos (mínimo)

- Sitio con `sitemap.xml` válido → todas las URLs del sitemap se encolan.
- Sitio sin `sitemap.xml` → solo se encola `entryUrl` y sus enlaces internos.
- Página con scroll infinito simulado → se detectan más elementos tras scroll.
- Página que devuelve 500 dos veces y 200 a la tercera → reintentos funcionan.
- Página con `robots.txt` que bloquea una ruta → esa ruta nunca se visita.
- `maxPages` alcanzado con cola aún no vacía → `totalPagesSkipped > 0`.
- Dominio inalcanzable desde el inicio → `CrawlFatalError` con reason correcto.

## 8. Dependencias

- `services/browser-pool` (spec 05)
- `services/queue` (spec 06)
- `services/storage` (spec 12) — para persistir snapshots
- Ninguna dependencia de `Analyzer`, `ProductDetection` ni ningún módulo
  posterior del pipeline (regla de independencia de módulos).
