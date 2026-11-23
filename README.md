# HabyssT

Seguimiento de hábitos con calendario mensual y anual de rachas. Funciona sin conexión y se instala como app desde el navegador.

Los datos se guardan solo en el teléfono (`localStorage`). Para pasarlos a otro teléfono: **Hábitos → Exportar respaldo**, y en el nuevo **Importar respaldo**.

Sin dependencias ni paso de compilación. Para probar en local:

```bash
python3 -m http.server
```

Pruebas:

- `npm test`: lógica (rachas, fechas, validación de datos). Sin dependencias.
- `npm run test:e2e`: en un navegador real, que los datos no se pierdan (datos dañados o borrados, copias, dos pestañas, cerrar escribiendo) y que un respaldo manipulado no ejecute código. Necesita Playwright con Chromium.

## Estructura

| Archivo | Qué hace |
|---|---|
| `app.js` | Arranque, `render` y el despacho de toques (`data-act`) |
| `core.js` | Estado de la app y cálculos de hábitos compartidos |
| `ui.js` | Textos, formato, encabezados, secciones plegables, sello |
| `motion.js` | Transiciones entre páginas, deslizamiento de filas, gesto de las hojas |
| `hoy.js` | Pantalla Hoy, editor de hábitos, hoja del día |
| `progreso.js` | Calendario del mes y del año, análisis y gráficas |
| `registro.js` | Ánimo, energía, sueño, métricas y diario |
| `revisiones.js` | Revisiones de semana, mes, trimestre y año |
| `metas.js` | Metas, valores y visión, listas |
| `enfoque.js` | Sesiones de enfoque, Pomodoro y modo zen |
| `ajustes.js` | Ajustes, tema, respaldo, copias automáticas |
| `logic.js` | Cálculos puros (fechas, rachas, periodos) |
| `mottos.js` | La frase en latín del día en Hoy, con su traducción y sentido |
| `seed.js` | Primer arranque: hábitos, metas, métricas y listas iniciales, y un historial de 90 días que se puede borrar desde Ajustes |
| `tutorial.js` | Tutorial guiado con [Driver.js](https://driverjs.com) (incluido en `vendor/driver`, licencia MIT) |
| `avisos.js` | Recordatorios de los hábitos: permiso, suscripción y envío de los horarios al servidor |
| `worker/` | Servidor de avisos (Cloudflare Worker): guarda los horarios y envía cada aviso a su hora |
| `store.js` | Guardado, validación de datos, copia interna y recuperación |

Cada módulo exporta un objeto `actions` con lo que hacen sus botones.

## Avisos (recordatorios)

Cada hábito puede tener hasta 6 recordatorios, cada uno con su hora y sus días. Los avisos los envía un servidor gratuito en Cloudflare (`worker/`). El servidor solo guarda la dirección de avisos del teléfono, su zona horaria y la hora, los días y el nombre de cada recordatorio.

En iPhone solo llegan con la app instalada en la pantalla de inicio (iOS 16.4 o posterior). En Android llegan aunque la app esté cerrada.

### Activarlos (una vez)

Necesitas una cuenta gratuita de Cloudflare. Desde la carpeta `worker/`:

1. Entra en tu cuenta:
   ```bash
   npx wrangler login
   ```
2. Crea la base de datos y copia el `database_id` que imprime en `wrangler.toml`:
   ```bash
   npx wrangler d1 create habysst-push
   ```
3. Crea la tabla:
   ```bash
   npx wrangler d1 execute habysst-push --remote --file=schema.sql
   ```
4. Genera las claves. La pública va en `wrangler.toml` (`VAPID_PUBLIC`) y en `avisos.js`; la privada solo en Cloudflare:
   ```bash
   node claves.mjs
   ```
   ```bash
   npx wrangler secret put VAPID_PRIVATE
   ```
5. Publica el servidor y copia la dirección que imprime (`https://habysst-push.<tu-usuario>.workers.dev`) en `API` dentro de `avisos.js`:
   ```bash
   npx wrangler deploy
   ```
6. Sube los cambios de `avisos.js`. Al guardar un hábito con recordatorios, la app pide permiso y llega un aviso «Avisos activados».

No cambies las claves después: los teléfonos ya suscritos dejarían de recibir avisos hasta volver a abrir la app.

Límite del plan gratuito: se envían avisos a 25 teléfonos por minuto. Si coinciden más a la misma hora, el resto llega uno o dos minutos después.
