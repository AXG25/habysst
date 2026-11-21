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
| `seed.js` | Primer arranque: hábitos, metas, métricas y listas iniciales, y un historial de 90 días que se puede borrar desde Ajustes |
| `tutorial.js` | Tutorial guiado con [Driver.js](https://driverjs.com) (incluido en `vendor/driver`, licencia MIT) |
| `store.js` | Guardado, validación de datos, copia interna y recuperación |

Cada módulo exporta un objeto `actions` con lo que hacen sus botones.
