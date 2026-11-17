export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Portal de RRHH — Nubera Digital (Node.js + Express + Prisma)',
    version: '3.0.0',
    description:
      'API REST en JavaScript puro con Express, Prisma ORM sobre MySQL, validación Zod, LangGraph.js y sincronización con Google Drive.',
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Estado de salud del servidor y conexión MySQL',
        responses: { 200: { description: 'Servicio saludable' } },
      },
    },
    '/api/system/status': {
      get: {
        summary: 'Estado de integraciones activas (MySQL, Drive, LLM)',
        responses: { 200: { description: 'Resumen de estado del sistema' } },
      },
    },
    '/api/auth/login': {
      post: { summary: 'Iniciar sesión con correo y contraseña', responses: { 200: { description: 'Token JWT y sesión' } } },
    },
    '/api/auth/logout': {
      post: { summary: 'Cerrar sesión y revocar JWT actual', responses: { 200: { description: 'Sesión cerrada' } } },
    },
    '/api/auth/me': {
      get: { summary: 'Perfil del colaborador autenticado', responses: { 200: { description: 'Datos de sesión' } } },
    },
    '/api/me/data': {
      get: { summary: 'Resumen personal: saldos RH-01, solicitudes, incapacidades y próximo pago', responses: { 200: { description: 'Expediente personal del usuario' } } },
    },
    '/api/requests': {
      post: { summary: 'Crear solicitud de ausencia o home office', responses: { 200: { description: 'Solicitud registrada' } } },
      get: { summary: 'Listar solicitudes (solo RRHH)', responses: { 200: { description: 'Listado de solicitudes' } } },
    },
    '/api/requests/{id}': {
      patch: { summary: 'Aprobar, rechazar o cancelar solicitud con bloqueo transaccional', responses: { 200: { description: 'Solicitud actualizada' } } },
    },
    '/api/tickets': {
      post: { summary: 'Crear ticket de escalamiento con historial inicial', responses: { 200: { description: 'Ticket creado' } } },
      get: { summary: 'Listar todos los tickets (solo RRHH)', responses: { 200: { description: 'Listado de tickets' } } },
    },
    '/api/tickets/mine': {
      get: { summary: 'Listar mis tickets creados', responses: { 200: { description: 'Mis tickets' } } },
    },
    '/api/tickets/{id}': {
      patch: { summary: 'Actualizar estado e historial de ticket (solo RRHH)', responses: { 200: { description: 'Ticket actualizado' } } },
    },
  },
};
