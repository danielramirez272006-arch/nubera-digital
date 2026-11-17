# Guiones de Demostración — Portal de RRHH Nubera Digital

## A. Guion para Demo en Vivo (15 minutos)

1. **Introducción y Arquitectura (2 min):**
   - Presentar la estructura del repositorio (`frontend/`, `backend/`, `database/`, `prompts/`, `evaluation/`, `docs/`).
   - Mostrar el banner de entorno activo y las integraciones configuradas.
2. **Inicio de Sesión y Roles (2 min):**
   - Iniciar sesión como colaboradora (`ana.garcia@nubera.mx`) y mostrar la redirección automática a **Consultas**.
3. **Consultas del Colaborador — 5 casos clave (5 min):**
   - Pregunta de política: *«¿Con cuánta anticipación pido vacaciones?»* -> mostrar cita `RH-01`, sección, versión, vigencia, fragmento y enlace a Drive.
   - Pregunta personal: *«¿Cuántos días me quedan?»* -> mostrar saldo de 14 días.
   - Pregunta mixta: *«¿Cuántos días me quedan y puedo usarlos el próximo año?»* -> combinación de saldo + regla de 18 meses.
   - Pregunta restringida: *«¿Cuántos días le quedan a mi compañero?»* -> bloqueo sin fuga de datos.
   - Pregunta sin respaldo: *«¿La empresa da bono por mascotas?»* -> mostrar resumen previo y confirmación para crear un ticket.
4. **Mis Datos y Mis Tickets (2 min):**
   - Navegar a **Mis datos** (saldo, próxima fecha de pago, evaluación) y **Mis tickets** (folio e historial).
5. **Dashboard Privado de RRHH y Administración (4 min):**
   - Intentar abrir `/dashboard` como colaborador (mostrar **Acceso denegado** + 403).
   - Iniciar sesión como RRHH (`laura.mendoza@nubera.mx`).
   - Revisar **Dashboard** (selector de fecha de corte, filtros por departamento/periodo, gráficas, tabla de pendientes >3 días, resumen ejecutivo y exportación JSON).
   - Mostrar **Solicitudes**, **Tickets** (con caso sensible restringido) y **Documentos** (10 políticas y alertas de auditoría).

---

## B. Guion para Video de Respaldo (5 minutos)

1. **0:00 – 0:45:** Presentación de Nubera Digital, arquitectura LangGraph + FastAPI + React/TypeScript + pgvector.
2. **0:45 – 2:30:** Demo rápida de login como colaboradora y 4 consultas en vivo (política `RH-01`, saldo propio, mixta y bloqueo de terceros / ticket).
3. **2:30 – 3:15:** Vista **Mis datos** y **Mis tickets**.
4. **3:15 – 4:30:** Login como RRHH, **Dashboard** con fecha de corte, gráficas, pendientes >3 días y **Documentos**.
5. **4:30 – 5:00:** Resumen de resultados de evaluación (`45` preguntas, `>=80%` aciertos, `<8s`, `0` fugas).
