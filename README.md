# HabyssT

Seguimiento de hábitos con calendario mensual y anual de rachas. Funciona sin conexión y se instala como app desde el navegador.

Los datos se guardan solo en el teléfono (`localStorage`). Para pasarlos a otro teléfono: **Hábitos → Exportar respaldo**, y en el nuevo **Importar respaldo**.

Sin dependencias ni paso de compilación. Para probar en local:

```bash
python3 -m http.server
```

Tests de la lógica: `npm test`.
