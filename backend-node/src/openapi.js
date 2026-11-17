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
  },
};
