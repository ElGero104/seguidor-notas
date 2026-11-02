import { Nota, Materia, Config } from "./types";

// ==================== CÁLCULOS ACADÉMICOS ====================

/** Promedio ponderado de una materia, SOLO sobre las notas ya calificadas. */
export function promedio(notas: Nota[], materiaId: string) {
  const ns = notas.filter((n) => n.materiaId === materiaId && n.valor !== null);
  const totalPeso = ns.reduce((s, n) => s + n.porcentaje, 0);
  if (!ns.length || totalPeso === 0) return null;
  return ns.reduce((s, n) => s + (n.valor as number) * n.porcentaje, 0) / totalPeso;
}

/** Promedio ponderado por créditos de un semestre (materias con notas). */
export function promedioSemestre(data: any, sem: string) {
  const mats = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === sem);
  let suma = 0, peso = 0;
  mats.forEach((m) => {
    const p = promedio(data.notas, m.id);
    if (p !== null) { suma += p * m.creditos; peso += m.creditos; }
  });
  return peso ? suma / peso : null;
}

/**
 * Cálculo central de mínimos (usado por Notas y Simulador):
 *   acumulado = Σ(valor × peso) de las calificadas  -> puntos ganados /100
 *   restante  = 100 − peso calificado              -> % pendiente
 *   requerida = (objetivo×100 − acumulado)/restante -> nota mínima en lo pendiente
 *   maximo    = (acumulado + 5×restante)/100        -> mejor nota final posible
 */
export function calculo(notas: Nota[], objetivo: number) {
  const ev = notas.filter((n) => n.valor !== null);
  const acumulado = ev.reduce((s, n) => s + (n.valor as number) * n.porcentaje, 0);
  const pesoEval = ev.reduce((s, n) => s + n.porcentaje, 0);
  const restante = Math.max(0, 100 - pesoEval);
  const requerida = restante > 0 ? (objetivo * 100 - acumulado) / restante : null;
  const maximo = restante > 0 ? (acumulado + 5 * restante) / 100 : acumulado / 100;
  return { acumulado, pesoEval, restante, requerida, maximo };
}

/** Días que tiene un mes (0-11) en un año. */
export function diasMes(anio: number, mes: number): number {
  return new Date(anio, mes + 1, 0).getDate();
}

/** Días hasta una fecha "YYYY-MM-DD" (negativo = venció). null si no hay fecha. */
export function diasHasta(fecha?: string): number | null {
  if (!fecha) return null;
  const f = new Date(fecha + "T00:00:00");
  if (isNaN(f.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - hoy.getTime()) / 86400000);
}
