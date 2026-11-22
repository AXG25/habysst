# Imagen para compartir la constancia

## Por qué
Que el usuario presuma su constancia y disciplina en redes: no un buen día, sino que lleva tiempo sin aflojar.

## Objetivos
- Un botón en Progreso que genera una imagen vertical 1080×1920 (historias de Instagram, estados de WhatsApp, TikTok).
- Lleva el logo de HabyssT (el sello inclinado con borde, igual que en la app).
- El usuario decide si se ven los nombres de sus hábitos (interruptor, apagado por defecto).
- Funciona en iPhone, Android y escritorio.

## No objetivos
- Subir la imagen a ningún servidor: se genera y se comparte desde el teléfono.
- Plantillas o estilos a elegir. Una sola imagen, bien hecha.
- Compartir un mes suelto o un solo hábito (se puede añadir después).

## Anti-objetivos
- Que parezca una captura de pantalla o un gráfico de oficina.
- Que muestre datos que el usuario no eligió mostrar.

## Contenido de la imagen (de arriba abajo)
1. Sello HabyssT arriba a la izquierda; la máxima latina del día en gótica arriba a la derecha.
2. Número grande: la racha activa más larga, «82 días» + «sin fallar». Si no hay racha activa, los días cumplidos del año.
3. El año en trazos, como la vista Año de Progreso, con los mismos patrones de trama.
4. Datos: % de días cumplidos del año, número de hábitos, año.
5. Con nombres activados: leyenda patrón + nombre de cada hábito. Sin nombres: solo los patrones.
6. Pie discreto con la dirección de la app.

Siempre en papel blanco y tinta (aunque el móvil esté en modo oscuro): se lee bien en cualquier red.

## Enfoques considerados
- **Dibujar con canvas desde los datos (elegido).** Control total del diseño, nítido a 1080×1920, sin dependencias, igual en los tres sistemas. Las fuentes de la app ya están cargadas y canvas las usa.
- **Foto del HTML (html2canvas o SVG foreignObject).** Descartado: añade ~200 KB o falla con fuentes e imágenes en Safari de iPhone.
- **Generarla en un servidor.** Descartado: los datos saldrían del teléfono.

## Cómo se comparte
- Hoja con la vista previa, el interruptor «Mostrar nombres de los hábitos» y el botón «Compartir».
- Si el navegador puede compartir archivos (iPhone, Android): menú de compartir del sistema.
- Si no (escritorio): se descarga el PNG.

## Decisiones del constructor
- Ubicación exacta del botón en Progreso, tipografías y espaciados dentro de la imagen, siguiendo el estilo de la app.
- Racha y porcentajes salen de las funciones que ya usa Progreso (logic.js / core.js).
