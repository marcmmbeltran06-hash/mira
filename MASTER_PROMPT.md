# MASTER_PROMPT.md — AutoWP

> Este documento se carga SIEMPRE, en cada sesión de trabajo con Claude Code,
> junto con la spec del módulo concreto que se esté implementando.
> Si algo en la spec de un módulo contradice este documento, este documento gana,
> salvo que el equipo decida explícitamente lo contrario y lo deje escrito en el ADR.

## 1. Reglas de comportamiento no negociables

1. **Nunca asumas comportamiento no especificado.** Si la spec del módulo no dice
   qué hacer ante un caso concreto (error, input vacío, formato inesperado), DETENTE
   y pregunta antes de implementar una solución inventada. No relleves huecos por
   tu cuenta "porque tiene sentido".
2. **Nunca elimines funcionalidad existente** al modificar un módulo, salvo que se
   pida explícitamente. Si detectas que algo debería eliminarse, propón el cambio,
   no lo ejecutes de forma silenciosa.
3. **Nunca rompas la interfaz pública de un módulo** (nombres de funciones, tipos de
   entrada/salida, eventos emitidos) sin señalarlo explícitamente como "breaking change"
   y sin actualizar todos los módulos que dependen de ella.
4. **No hay dependencias circulares entre módulos.** Si al implementar algo detectas
   que necesitas importar de un módulo que a su vez depende del actual, para y avisa.
5. **No hay código duplicado entre módulos.** Si dos módulos necesitan la misma lógica,
   esa lógica va en `core/` o en una utilidad compartida, no copiada.
6. **Todo módulo nuevo necesita tests** (unitarios como mínimo) antes de considerarse
   terminado. No se entrega código "para testear después".
7. **Cada módulo es independiente y sustituible.** Debe poder testearse y, en teoría,
   reemplazarse sin tocar el resto del sistema, comunicándose solo a través de sus
   interfaces documentadas.
8. **La IA (Gemini) es siempre opcional.** Cualquier funcionalidad que dependa de IA
   necesita un camino de fallback basado en heurísticas/reglas. El pipeline debe
   poder correr sin API key, con menor calidad pero sin romperse.
9. **Sigue la spec del módulo al pie de la letra.** Si la spec especifica una firma
   de función, un nombre de tabla, un formato de evento, ese es el contrato. No lo
   "mejores" por iniciativa propia.
10. **Si hay contradicción entre este documento, una ADR y la spec de un módulo:**
    orden de prioridad = ADR > MASTER_PROMPT > spec de módulo > diagrama de flujo
    original. Si la contradicción es real (no aparente), detente y pregunta.

## 2. Estilo de código

- TypeScript estricto (`strict: true`), sin `any` salvo justificación explícita en
  comentario.
- Arquitectura por capas: `core/` (dominio, sin dependencias externas) →
  `services/` (orquestación) → `adapters/` (Playwright, Gemini, SQLite, filesystem)
  → `cli/` (entrada de usuario). Las dependencias solo pueden apuntar hacia dentro
  (cli → services → core), nunca al revés.
- Cada módulo expone un único punto de entrada (`index.ts`) con la interfaz pública;
  todo lo demás es privado al módulo.
- Errores: usar clases de error tipadas y específicas (ver `34-Errors.md` cuando
  exista), nunca `throw new Error("algo falló")` genérico.
- Logging estructurado (nivel, módulo, contexto), nunca `console.log` suelto en
  código de producción.

## 3. Proceso ante ambigüedad o contradicción

Cuando Claude Code detecte que la spec no cubre un caso:

1. Señala explícitamente: "La spec de `<módulo>` no define qué pasar cuando `<caso>`."
2. Propón 1-2 opciones razonadas, sin implementarlas todavía.
3. Espera confirmación antes de escribir código para ese caso.
4. Una vez confirmado, dicha decisión debe añadirse a la spec del módulo (o a una
   ADR si es una decisión de arquitectura, no de detalle local).

## 4. Qué NO hacer nunca

- No inventar endpoints, tablas, columnas o nombres de campo que no estén en la spec.
- No añadir dependencias npm nuevas sin señalarlo y justificar por qué.
- No "arreglar" código de otro módulo al pasar por él, salvo que se pida explícitamente.
- No generar migraciones de base de datos destructivas sin confirmación expresa.
