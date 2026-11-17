"""
10 documentos de políticas internas de Nubera Digital (México) para indexación en pgvector / Drive.
No contiene datos personales de ningún colaborador.
"""

DEMO_DRIVE_POLICIES = [
    {
        "drive_file_id": "1NuberaRH01VacacionesDoc",
        "policy_code": "RH-01",
        "title": "RH-01 Política de Vacaciones y Descanso Anual",
        "mime_type": "application/vnd.google-apps.document",
        "version": "v2.4",
        "effective_date": "2026-01-01",
        "owner": "Laura Patricia Mendoza Ortega (Talento y Cultura)",
        "drive_url": "https://drive.google.com/file/d/1NuberaRH01VacacionesDoc/view",
        "sections": [
            {
                "section": "Sección 1. Días de vacaciones por antigüedad y prima vacacional",
                "content": (
                    "Conforme a la Ley Federal del Trabajo en México (arts. 74 a 81) y la política RH-01 de Nubera Digital, "
                    "Nubera otorga 15 días laborables al primer y segundo aniversario (o el mínimo legal si es mayor: "
                    "16 días al tercer año, 18 días al cuarto, 20 días al quinto y +2 días cada cinco años). "
                    "La prima vacacional interna en Nubera Digital es del 30%."
                ),
            },
            {
                "section": "Sección 2. Anticipación mínima y proceso de solicitud",
                "content": (
                    "Regla administrativa de solicitud (RH-01): Toda solicitud de vacaciones debe registrarse "
                    "en el Portal de RRHH con al menos 10 días hábiles de anticipación respecto a la fecha de inicio. "
                    "La solicitud requiere aprobación del líder directo y validación del equipo de RRHH."
                ),
            },
            {
                "section": "Sección 3. Plazo de disfrute, vigencia y uso en el próximo año",
                "content": (
                    "El periodo se determina por aniversario laboral, puede abarcar dos años calendario (cruzar diciembre) "
                    "y debe programarse dentro de los 6 meses posteriores al aniversario conforme al artículo 81 de la LFT. "
                    "Operaciones de RRHH revisa el caso cuando existen días pendientes. Las vacaciones se disfrutan y no se "
                    "pagan en efectivo salvo en la terminación de la relación laboral."
                ),
            },
        ],
    },
    {
        "drive_file_id": "1NuberaRH02PermisosDoc",
        "policy_code": "RH-02",
        "title": "RH-02 Política de Permisos y Licencias",
        "mime_type": "application/vnd.google-apps.document",
        "version": "v1.8",
        "effective_date": "2026-01-15",
        "owner": "Laura Patricia Mendoza Ortega (Talento y Cultura)",
        "drive_url": "https://drive.google.com/file/d/1NuberaRH02PermisosDoc/view",
        "sections": [
            {
                "section": "Sección 1. Permisos con goce de sueldo",
                "content": (
                    "Nubera Digital otorga permisos con goce de sueldo en los siguientes supuestos: "
                    "1) Licencia de paternidad o adopción: 10 días hábiles pagados (5 días por ley más 5 días adicionales Nubera). "
                    "2) Matrimonio civil o religioso: 5 días hábiles por única ocasión. "
                    "3) Fallecimiento de familiar en primer grado (cónyuge, hijos, padres, hermanos): 5 días hábiles. "
                    "4) Citas médicas o trámites personales urgentes: hasta 4 horas con aviso previo al líder directo."
                ),
            },
            {
                "section": "Sección 2. Permisos sin goce de sueldo",
                "content": (
                    "Los colaboradores con más de 6 meses de antigüedad pueden solicitar un permiso sin goce de sueldo "
                    "de hasta 30 días naturales por motivos personales o académicos. Debe solicitarse con al menos 15 días "
                    "naturales de anticipación y contar con autorización por escrito de Dirección de área y RRHH."
                ),
            },
        ],
    },
    {
        "drive_file_id": "1NuberaRH03IncapacidadesPDF",
        "policy_code": "RH-03",
        "title": "RH-03 Lineamientos de Incapacidades IMSS y Salud",
        "mime_type": "application/pdf",
        "version": "v2.1",
        "effective_date": "2026-02-01",
        "owner": "Diego Alejandro Santos Rivera (Nómina y Bienestar)",
        "drive_url": "https://drive.google.com/file/d/1NuberaRH03IncapacidadesPDF/view",
        "sections": [
            {
                "section": "Sección 1. Incapacidad por enfermedad general",
                "content": (
                    "En caso de enfermedad general, el colaborador debe acudir a su Unidad de Medicina Familiar del IMSS "
                    "y enviar el certificado oficial de incapacidad a RRHH dentro de las primeras 48 horas. "
                    "El IMSS subsidia el 60% del salario registrado a partir del cuarto día de incapacidad; como prestación "
                    "interna, Nubera Digital cubre el 100% del salario durante los primeros 3 días de incapacidad avalada por el IMSS."
                ),
            },
            {
                "section": "Sección 2. Maternidad y riesgo de trabajo",
                "content": (
                    "La incapacidad por maternidad comprende 84 días naturales (42 días antes y 42 días después del parto, "
                    "transferibles según autorización médica del IMSS) con subsidio del 100%. Los accidentes o riesgos de "
                    "trabajo se cubren al 100% desde el primer día conforme al dictamen del IMSS y deben reportarse el mismo día."
                ),
            },
        ],
    },
    {
        "drive_file_id": "1NuberaRH04NominaSheet",
        "policy_code": "RH-04",
        "title": "RH-04 Política de Nómina, Pagos y Prestaciones",
        "mime_type": "application/vnd.google-apps.spreadsheet",
        "version": "v3.0",
        "effective_date": "2026-01-01",
        "owner": "Diego Alejandro Santos Rivera (Nómina y Bienestar)",
        "drive_url": "https://drive.google.com/spreadsheets/d/1NuberaRH04NominaSheet/edit",
        "sections": [
            {
                "section": "Sección 1. Calendario de pagos semanal y recibos CFDI",
                "content": (
                    "El pago de nómina en Nubera Digital se realiza de forma semanal todos los días viernes "
                    "mediante transferencia SPEI (52 pagos semanales al año). Si el viernes coincide con un día inhábil "
                    "o cierre bancario, Nómina valida el adelanto al día hábil anterior y registra la fecha efectiva."
                ),
            },
            {
                "section": "Sección 2. Aguinaldo, vales de despensa, fondo de ahorro y SGMM",
                "content": (
                    "Las prestaciones vigentes de Nubera Digital incluyen: Aguinaldo equivalente a 30 días de salario "
                    "(pagado a más tardar el 18 de diciembre), Vales de despensa mensuales por $2,200 MXN, Fondo de ahorro "
                    "del 8% aportado por el colaborador más 8% aportado por la empresa (liquidado en diciembre), y Seguro "
                    "de Gastos Médicos Mayores (SGMM) para el colaborador, cónyuge e hijos menores de 25 años."
                ),
            },
        ],
    },
    {
        "drive_file_id": "1NuberaRH05RemotoDoc",
        "policy_code": "RH-05",
        "title": "RH-05 Política de Trabajo Remoto y Horarios",
        "mime_type": "application/vnd.google-apps.document",
        "version": "v1.5",
        "effective_date": "2026-01-10",
        "owner": "Laura Patricia Mendoza Ortega (Talento y Cultura)",
        "drive_url": "https://drive.google.com/file/d/1NuberaRH05RemotoDoc/view",
        "sections": [
            {
                "section": "Sección 1. Esquema híbrido y horario flexible",
                "content": (
                    "Nubera Digital opera bajo un esquema híbrido estándar de 3 días presenciales y 2 días de trabajo "
                    "remoto (home office) a la semana, salvo puestos contratados bajo modalidad 100% remota. "
                    "El horario de entrada es flexible entre 8:00 a. m. y 10:00 a. m. (hora del centro), cumpliendo una "
                    "jornada de 8 horas diarias más 1 hora de comida. Los días de home office deben registrarse en el portal."
                ),
            },
        ],
    },
    {
        "drive_file_id": "1NuberaRH06EvaluacionDoc",
        "policy_code": "RH-06",
        "title": "RH-06 Política de Evaluación de Desempeño y Crecimiento",
        "mime_type": "application/vnd.google-apps.document",
        "version": "v1.3",
        "effective_date": "2026-03-01",
        "owner": "Laura Patricia Mendoza Ortega (Talento y Cultura)",
        "drive_url": "https://drive.google.com/file/d/1NuberaRH06EvaluacionDoc/view",
        "sections": [
            {
                "section": "Sección 1. Ciclos semestrales de evaluación",
                "content": (
                    "Nubera Digital realiza evaluaciones de desempeño de manera semestral en los meses de junio y diciembre. "
                    "Cada colaborador recibe retroalimentación 360°, revisión de objetivos OKR y plan de desarrollo individual. "
                    "Las promociones y ajustes salariales por mérito se revisan tras el cierre del ciclo de diciembre."
                ),
            },
        ],
    },
    {
        "drive_file_id": "1NuberaRH07CapacitacionPDF",
        "policy_code": "RH-07",
        "title": "RH-07 Política de Capacitación y Certificaciones Técnicas",
        "mime_type": "application/pdf",
        "version": "v1.4",
        "effective_date": "2026-02-15",
        "owner": "Laura Patricia Mendoza Ortega (Talento y Cultura)",
        "drive_url": "https://drive.google.com/file/d/1NuberaRH07CapacitacionPDF/view",
        "sections": [
            {
                "section": "Sección 1. Presupuesto anual de aprendizaje y certificaciones",
                "content": (
                    "Cada colaborador con al menos 3 meses de antigüedad dispone de un presupuesto anual de hasta $18,000 MXN "
                    "para cursos, conferencias o certificaciones técnicas (AWS, GCP, Azure, Scrum o idiomas). "
                    "El reembolso del examen de certificación aplica al 100% una vez acreditada la aprobación."
                ),
            },
        ],
    },
    {
        "drive_file_id": "1NuberaRH08EticaNOM035PDF",
        "policy_code": "RH-08",
        "title": "RH-08 Código de Ética, Conducta y Prevención NOM-035",
        "mime_type": "application/pdf",
        "version": "v2.0",
        "effective_date": "2026-01-01",
        "owner": "Comité de Ética y Cumplimiento",
        "drive_url": "https://drive.google.com/file/d/1NuberaRH08EticaNOM035PDF/view",
        "sections": [
            {
                "section": "Sección 1. Cero tolerancia al acoso y canal confidencial",
                "content": (
                    "En cumplimiento con la NOM-035-STPS, Nubera Digital mantiene cero tolerancia ante cualquier forma de "
                    "acoso laboral, hostigamiento o discriminación. Los reportes pueden levantarse de forma confidencial "
                    "como ticket sensible en el portal o al correo etica@nubera.mx, garantizando atención en máximo 24 horas hábiles."
                ),
            },
        ],
    },
    {
        "drive_file_id": "1NuberaRH09ViaticosSheet",
        "policy_code": "RH-09",
        "title": "RH-09 Política de Viáticos, Gastos de Viaje y Reembolsos",
        "mime_type": "application/vnd.google-apps.spreadsheet",
        "version": "v1.7",
        "effective_date": "2026-01-20",
        "owner": "Finanzas y Administración",
        "drive_url": "https://drive.google.com/spreadsheets/d/1NuberaRH09ViaticosSheet/edit",
        "sections": [
            {
                "section": "Sección 1. Topes de alimentos, hospedaje y comprobación CFDI",
                "content": (
                    "Para viajes de trabajo autorizados, el tope diario de alimentos es de $850 MXN en territorio nacional "
                    "y el hospedaje máximo es de $2,800 MXN por noche. Todo gasto debe comprobarse mediante factura CFDI "
                    "a nombre de Nubera Digital S.A. de C.V. dentro de los 5 días hábiles posteriores al regreso."
                ),
            },
        ],
    },
    {
        "drive_file_id": "1NuberaRH10SeguridadEquipoDoc",
        "policy_code": "RH-10",
        "title": "RH-10 Política de Seguridad de la Información y Equipo de Cómputo",
        "mime_type": "application/vnd.google-apps.document",
        "version": "v2.2",
        "effective_date": "2026-02-01",
        "owner": "Dirección de Seguridad de la Información",
        "drive_url": "https://drive.google.com/file/d/1NuberaRH10SeguridadEquipoDoc/view",
        "sections": [
            {
                "section": "Sección 1. Uso de equipo asignado y resguardo de información",
                "content": (
                    "Nubera Digital asigna equipo de cómputo corporativo con cifrado de disco completo y autenticación "
                    "multifactor (MFA) obligatoria. Queda prohibido instalar software no autorizado o almacenar datos "
                    "personales de clientes o colaboradores en dispositivos personales."
                ),
            },
        ],
    },
]
