# 🎓 Seguidor de Notas

Mini app de React para el seguimiento académico universitario.

## Características

- **📚 Materias**: crea materias con profesor, créditos y **semestre** (agrupación por semestres). Eliminación en cascada de notas y clases.
- **📝 Notas**: configura la estructura de evaluación de cada materia (cantidad de notas y peso de cada una, generando pesos iguales que suman 100%). Edición inline de nombre, peso y valor (0–5). Promedios ponderados con alerta de umbral.
- **🗓️ Horarios**: clases por día, hora y salón, organizadas en un horario semanal visual.
- **🗄️ MiniDB**: capa de base de datos embebida (API CRUD: `insert`, `find`, `update`, `remove`, `removeWhere`) con persistencia automática en `localStorage`. Diseñada para poder intercambiarse por un backend real (Firebase/Supabase/REST) sin cambiar la UI.

## Stack

- React + TypeScript
- Tailwind CSS (clases utilitarias)
- `nucleo-sharp` (íconos)
- `localStorage` como motor de persistencia

> Nota: `src/App.tsx` fue desarrollado para el runtime de Canvas de Vibe (que provee Tailwind y `nucleo-sharp` en tiempo de build). Para ejecutarlo de forma independiente, crea un proyecto Vite + React + TS, instala `tailwindcss` y `nucleo-sharp`, y copia `src/App.tsx`.

## Uso

1. Crea tus materias indicando el semestre.
2. En la pestaña Notas, define la estructura de evaluación (cantidad y pesos).
3. Registra las calificaciones y sigue tus promedios ponderados en tiempo real.

---

Hecho por [Geronimo Patiño Valencia](https://github.com/ElGero104)
