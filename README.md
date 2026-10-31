# 🎓 Seguidor de Notas

Mini app de React para el seguimiento académico universitario.

## Características

- **📚 Materias**: crea materias con profesor, créditos y **semestre**. Búsqueda por nombre/profesor/semestre. Eliminación en cascada de notas y clases.
- **📁 Carpetas por semestre**: las materias se agrupan en carpetas plegables, cada una con su **promedio ponderado por semestre** (por créditos).
- **📝 Notas**: estructura de evaluación por materia (cantidad de notas y pesos iguales que suman 100%). Edición inline de nombre, peso, valor (0–5) y **fecha de entrega**, con badges de vencimiento (venció / vence hoy / en X días).
- **🎯 Simulador**: define tu nota objetivo por materia y calcula qué necesitas en el % restante por evaluar; avisa si el objetivo ya está asegurado o es matemáticamente imposible (muestra el máximo alcanzable).
- **🌙 Tema oscuro**: conmutable y persistente.
- **🗓️ Horarios**: clases por día, hora y salón en un horario semanal visual.
- **🗄️ MiniDB**: capa de base de datos embebida (CRUD: `insert`, `find`, `update`, `remove`, `removeWhere`) con persistencia automática en `localStorage`, intercambiable por un backend real.
- **🔔 Notificaciones push**: activa desde el encabezado (botón 🔔). Recibe avisos 1 día antes de cada entrega y 10 min antes de cada clase, incluso con la app cerrada. Backend en Supabase (Edge Functions + pg_cron + Web Push/VAPID); la clave privada VAPID nunca sale del servidor.
- **🔐 Login por usuario**: acceso con usuario (ej: `geronimo.patino`) y clave vía Supabase Auth; datos sincronizados por usuario con RLS.

## Demo en vivo

[elgero104.github.io/seguidor-notas](https://elgero104.github.io/seguidor-notas/)

## Stack

- React 18 + TypeScript
- Tailwind CSS
- Supabase (Auth + Postgres + Edge Functions + pg_cron + Web Push)
- `localStorage` como caché local con sincronización a la nube

> `src/App.tsx` es la fuente canónica. `docs/index.html` es la versión standalone para GitHub Pages (React/Babel/Tailwind por CDN).

---

Hecho por [Geronimo Patiño Valencia](https://github.com/ElGero104)
