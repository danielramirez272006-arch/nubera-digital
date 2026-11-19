# Guiones de Demostración — Portal de RRHH Nubera Digital

## A. Guion para Demo en Vivo (15 minutos)

1. **Introducción y Arquitectura (2 min):**
   - Presentar la estructura del repositorio (`frontend/`, `backend/`, `prompts/`, `evaluation/`, `docs/`).
   - Explicar la arquitectura en **JavaScript puro (ESM)**: **React + Vite + Recharts** en el frontend, **Node.js + Express + Prisma ORM + MySQL 8 + LangGraph.js** en el backend, Google Drive API y DeepSeek (`deepseek-chat`).
2. **Inicio de Sesión y Roles (2 min):**
   - Iniciar sesión como colaboradora (`ana.garcia@nubera.mx` / `Colaborador123!`) y mostrar la redirección automática a **Consultas**.
3. **Consultas del Colaborador — 5 casos clave (5 min):**
   - Pregunta de política: *«¿Con cuánta anticipación debo solicitar vacaciones?»* -> mostrar cita `RH-01`, sección, versión `1.1`, vigencia, fragmento y enlace a Drive.
   - Pregunta personal: *«¿Cuántos días de vacaciones me quedan disponibles?»* -> mostrar saldo de **10 días disponibles** (`15` asignados, `2` disfrutados, `3` reservados en solicitud pendiente).
   - Pregunta mixta: *«¿Cuántos días me quedan y puedo usarlos el próximo año?»* -> combinación de saldo propio + regla de **6 meses** posteriores al aniversario (`RH-01`) y derivación a Operaciones de RRHH por plazo vencido.
   - Pregunta restringida: *«¿Cuántos días de vacaciones tiene mi compañero Juan?»* -> bloqueo inmediato sin fuga de datos.
   - Pregunta sin respaldo: *«¿La empresa da bono por mascotas?»* -> aviso de ausencia de política y confirmación para crear ticket con RRHH.
4. **Mis Datos y Mis Tickets (2 min):**
   - Navegar a **Mis datos** (saldo por periodo, próxima fecha de pago, evaluación, creación idempotente y botón **Cancelar** para solicitudes pendientes) y **Mis tickets** (folio e historial).
5. **Dashboard Privado de RRHH y Administración (4 min):**
   - Intentar abrir `/dashboard` como colaborador (redirección y `403` en API).
   - Iniciar sesión como RRHH (`laura.mendoza@nubera.mx` / `Rrhh123!`).
   - Revisar **Dashboard** (selector de fecha de corte, filtros por departamento, gráficas de 30 días, tabla de pendientes >3 días, resumen ejecutivo validado y exportación).
   - Mostrar **Solicitudes** (aprobación transaccional `FOR UPDATE`), **Tickets** (con caso sensible restringido) y **Documentos** (`11` activos: `RH-01` a `RH-10` + Google Sheet `RH-12` con pestañas `Pagos 2026` y `Feriados 2026`).

---

## B. Guion para Video de Respaldo (5 minutos)

1. **0:00 – 0:45:** Presentación de Nubera Digital y arquitectura real: **LangGraph.js + Express + Prisma/MySQL 8 + React/Vite + Google Drive API + DeepSeek**.
2. **0:45 – 2:30:** Demo rápida de login como colaboradora y 4 consultas en vivo (`RH-01`, saldo propio de 10 días / 3 reservados, consulta mixta con plazo de 6 meses y bloqueo de terceros / ticket).
3. **2:30 – 3:15:** Vista **Mis datos** (crear/cancelar solicitud) y **Mis tickets**.
4. **3:15 – 4:30:** Login como RRHH, **Dashboard** con fecha de corte, gráficas, pendientes >3 días y **Documentos** (Google Docs, PDF `RH-09` y Sheets `RH-12`).
5. **4:30 – 5:00:** Resumen de resultados de evaluación oficial (`45` preguntas: `40/45 = 88.9 %` con DeepSeek real, `100 % < 8 s`, `p90 = 3203 ms`, `0` datos personales filtrados).
