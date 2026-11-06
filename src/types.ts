// ==================== TIPOS DE DATOS ====================

// Una materia: identificada por id único, con datos académicos y color visual
export type Materia = {
  id: string;
  nombre: string;
  profesor: string;
  creditos: number;
  color: string;
  semestre: string; // carpeta de agrupación, ej: "2026-2"
};

// Una nota/evaluación. valor === null significa PENDIENTE (aún sin calificar):
// no cuenta como 0 en los promedios, solo su peso queda "por evaluar".
export type Nota = {
  id: string;
  materiaId: string;
  nombre: string;
  valor: number | null; // calificación 0-5, o null si está pendiente
  porcentaje: number; // peso en la nota final (ej: 30 = 30%)
  fecha?: string; // fecha de entrega opcional "YYYY-MM-DD"
  avisos?: string[]; // recordatorios extra ej: ["-3d", "0d"] además del de -1d
};

// Una clase dentro del horario semanal
export type Clase = {
  id: string;
  materiaId: string;
  dia: number; // 0 = Lunes
  inicio: string;
  fin: string;
  salon: string;
};

// Un evento importado de un calendario externo (ej: Google Calendar vía .ics)
export type Evento = {
  id: string;
  titulo: string;
  fecha: string; // "YYYY-MM-DD"
  hora?: string;  // "HH:MM" (opcional)
  lugar?: string; // opcional
};

// Recurso de una materia: link de Zoom/Meet, carpeta de Drive, syllabus, etc.
export type Recurso = {
  id: string;
  materiaId: string;
  titulo: string;
  url: string;
  tipo: "link" | "zoom" | "drive" | "pdf" | "otro";
};

// Tarea pendiente de una materia (trabajo, lectura, proyecto, etc.)
export type Tarea = {
  id: string;
  materiaId: string;
  titulo: string;
  descripcion?: string;
  fecha?: string; // fecha límite opcional "YYYY-MM-DD"
  completada: boolean;
  creada: string; // ISO timestamp de creación
};

// Configuración global (tabla singleton, fila 0)
export type Config = {
  dark: boolean; // tema oscuro
  nota_minima: number; // para "ganar" la materia (ej: 3.0)
  nota_ok: number; // rango de color ámbar->verde (ej: 4.0)
  archivados: string[]; // semestres archivados
  activo: string; // semestre activo (el único que se muestra)
  semestres: string[]; // lista de semestres registrados
  fechasSemestre: Record<string, { inicio: string; fin: string }>; // rango de fechas por semestre
};

// Paleta de colores cíclica por materia
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];
// Días del horario semanal
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Meses del calendario
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
