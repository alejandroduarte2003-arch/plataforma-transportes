# Reestructuración funcional y financiera — INCOROVA Transportes

Rama de trabajo: `changes/transport-school-finance-restructure`

## Criterios confirmados

- Sueldo base mensual; la planilla genera dos pagos por mes.
- Cada quincena parte del 50% del sueldo mensual.
- Bono KPI individual mensual: cada trabajador tiene un máximo propio mensual. Tres evaluaciones iguales (quejas, limpieza y retrasos), escala 1–5 convertida a 0%, 25%, 50%, 75% y 100%. El porcentaje KPI se aplica al máximo mensual individual y el bono mensual obtenido se divide entre dos para pagarse en las dos quincenas.
- Préstamos: máximo 12 cuotas; descuento en cada pago quincenal hasta cancelar el saldo.
- Los montos y movimientos económicos deben residir en Finanzas y estar protegidos en la base de datos, no solamente ocultos en la interfaz.
- Viajes: edición exclusiva del superadministrador.
- Abordajes: módulo independiente, con pasajeros por contrato y registros de abordaje por viaje.
- Transporte escolar: expediente individual por alumno, seguimiento y pagos asociados al alumno.
- Combustible se registra en galones. Kilómetros recorridos = odómetro final − odómetro inicial.
- Mantener identidad visual azul marino, blanco y negro.

## Diagnóstico confirmado del código y la base

- La aplicación principal está implementada dentro de `dashboard.html`; `js/dashboard.js` contiene indicadores de demostración y no es la fuente de datos integrada.
- `finanzas.html` no es la pantalla financiera integrada. Finanzas funcional está dentro de `dashboard.html`.
- `trips.income` contiene importes en la tabla operativa de viajes.
- `fuel_entries`, `maintenance_records` y `vehicle_parts` guardan importes junto con datos de flota.
- `employees.base_salary`, `employee_loans.amount/balance/installment_amount` y todos los importes de `payroll_records` están en tablas de Personal.
- Las políticas actuales permiten acceso a tablas completas por permiso de módulo. Por tanto, un usuario con acceso a Personal/Flota/Operaciones puede leer columnas monetarias de esas tablas si la política lo autoriza.
- `payroll_records` tiene una restricción única por trabajador y mes y una validación que obliga a que `period` sea el primer día del mes. No admite dos registros quincenales en su estado actual.
- `boardings` solo permite asociar un nombre directamente a un viaje. No existe todavía un catálogo de pasajeros por contrato.
- Las migraciones existentes están registradas en Supabase, pero no hay carpeta `supabase/migrations` en el repositorio actual.

## Modelo objetivo propuesto

### 1. Operación y abordajes

- Mantener `trips` para fechas, vehículo, origen, destino, responsable, tipo de servicio, estado y notas. El ingreso monetario se trasladará al registro financiero relacionado.
- Añadir un catálogo de contratos de transporte y sus pasajeros, con relación de pasajeros a contrato.
- Separar la persona/pasajero del evento de abordaje. El mismo pasajero podrá aparecer en muchos viajes.
- El abordaje por viaje referenciará pasajero y viaje. El abordaje de un pasajero de contrato podrá sugerir la lista del contrato, pero cada registro quedará vinculado al viaje concreto.
- La UI de Abordajes tendrá su propia entrada de navegación, sin depender de la pantalla Operaciones.
- La edición de viajes se mostrará únicamente al superadministrador y se validará también en la base de datos/RPC. No basta con ocultar el botón.

### 2. Personal y planilla

- `employees` conservará datos laborales no financieros.
- Los datos de remuneración (sueldo mensual y bono máximo individual) estarán en una estructura financiera protegida.
- Cada registro de planilla representará una quincena: mes de referencia + número de quincena (1 o 2). La unicidad será trabajador + mes + quincena.
- Guardar las tres notas KPI y el porcentaje resultante en cada quincena para mantener trazabilidad del cálculo.
- Calcular sueldo base quincenal como sueldo mensual / 2.
- El bono mensual ganado se calcula como máximo individual mensual × porcentaje KPI; cada quincena recibe la mitad del bono mensual ganado.
- Cada descuento de préstamo se registra una sola vez por pago de planilla. La cuota efectiva será el menor valor entre la cuota programada y el saldo pendiente.
- Los préstamos y su saldo serán datos financieros protegidos. La pantalla Personal puede presentar el estado operativo del préstamo sin exponer importes a usuarios sin permiso de Finanzas.

### 3. Finanzas como libro central

Crear un libro de movimientos financieros con, como mínimo:
- dirección: ingreso o egreso;
- fecha y estado;
- categoría y concepto;
- monto en quetzales;
- referencia al origen (viaje, combustible, mantenimiento, repuesto, nómina, préstamo o pago escolar);
- identificador del registro de origen y, cuando aplique, trabajador o alumno;
- usuario que registró el movimiento y marcas de tiempo.

Los módulos operativos no volverán a guardar copias independientes de importes. La interfaz de Finanzas será la única que lea y presente importes. La creación de registros operativos que impliquen dinero debe usar operaciones transaccionales/RPC para que el registro operativo y el movimiento financiero se creen o actualicen juntos.

### 4. Transporte escolar

- Tabla de alumnos con ID UUID generado por la base de datos, nombre, dirección AM, dirección PM, teléfono del encargado, parentesco y colegio.
- Tabla de expedientes/seguimientos relacionada al alumno.
- Permisos específicos para consultar y editar expedientes, configurables por superadministrador.
- Pago escolar con fecha/hora automática del servidor, monto, moneda fija GTQ, estado de vigencia (vigente/no vigente) y estado de pago.
- Cada pago generará un ingreso financiero vinculado al alumno. Evitar duplicar el mismo pago si se reintenta una solicitud.

## Secuencia segura de implementación

1. **Esquema y permisos:** diseñar migraciones aditivas, revisar constraints, índices, triggers y políticas existentes. No eliminar columnas monetarias ni cambiar políticas permisivas hasta que exista una ruta de lectura/escritura probada.
2. **Libro financiero:** crear estructura financiera central y funciones transaccionales idempotentes. Migrar los importes históricos existentes conservando referencias y fechas.
3. **Seguridad:** cerrar acceso a importes en tablas operativas mediante separación de datos y políticas RLS. Probar con usuarios de cada rol; el superadministrador conserva acceso completo.
4. **Planilla quincenal:** migrar registros actuales sin alterar su importe ni estado; asignar la quincena de forma explícita y evitar generar pagos duplicados. Añadir KPI y cálculo de cuotas.
5. **Operaciones y abordajes:** edición exclusiva de viajes, catálogo de contratos/pasajeros y módulo independiente de abordajes.
6. **Flota:** galones y odómetro inicial/final; retirar montos de la interfaz operativa y consultar gastos únicamente en Finanzas.
7. **Transporte escolar:** alumnos, expedientes, permisos, pagos y vínculo al libro financiero.
8. **Pruebas:** validar RLS, cálculos, doble quincena, pagos duplicados, reintentos, integridad referencial, formularios y navegación antes de considerar despliegue.

## Reglas de seguridad y despliegue

- No aplicar cambios directamente a `main` ni desplegar producción durante esta etapa.
- No aplicar migraciones a la base activa hasta completar revisión del SQL, confirmar la estrategia de respaldo y validar compatibilidad con los datos existentes.
- No usar políticas RLS permisivas adicionales como parche: las políticas permisivas se combinan con OR.
- No considerar la ocultación de elementos HTML como autorización.
- No crear otro proyecto, rama de Supabase o servicio externo de pago.
- Cada cambio debe quedar en esta rama de GitHub y ser verificable antes de pasar a producción.

## Regla confirmada del bono KPI

El monto máximo del bono es mensual y diferente para cada trabajador. El porcentaje KPI se aplica al máximo mensual individual y el bono mensual obtenido se divide entre dos para pagar la mitad en cada quincena. Ejemplo: máximo mensual Q500 con KPI 75% = bono mensual ganado Q375; cada quincena recibe Q187.50. El sueldo base mensual también se divide entre dos. Los descuentos de préstamos se aplican en cada quincena.


## Estado de implementación en la rama

### Viajes — edición superadmin incorporada en la interfaz
- La tabla muestra la acción Editar únicamente a perfiles con rol `superadmin`.
- El formulario reutiliza el modal de viaje para cargar y guardar los datos existentes.
- La lógica vuelve a validar el rol antes de enviar el UPDATE.
- La protección definitiva depende de aplicar la política RLS restrictiva incluida en la migración; mientras la migración no esté aplicada, no se debe considerar cerrada la autorización en base de datos.

### Interfaz — cambios incorporados en la rama
- Se agregó el módulo independiente **Abordajes**, con pestañas para contratos y viajes, catálogo de pasajeros, asignación de pasajeros a contratos y registro de abordajes por viaje.
- Se agregó **Transporte escolares**, con listado de estudiantes, expediente individual, seguimientos y formulario para pagos vinculados al alumno.
- La edición de viajes aparece solo para superadministrador y la interfaz valida el rol antes de guardar.
- La administración de usuarios permite asignar permisos individuales para editar estudiantes, agregar seguimientos y registrar pagos escolares.
- El registro de combustible ahora captura galones, odómetro anterior y odómetro actual; presenta la diferencia de kilómetros recorridos.

### Base de datos — migraciones creadas, no aplicadas
- `supabase/migrations/20261114000100_transport_restructure_foundation.sql`
  - Módulos nuevos, estructura de planilla quincenal con valor histórico 0, campos KPI, compensación individual, libro financiero, contratos/pasajeros/abordajes y expedientes escolares.
  - RLS para tablas nuevas y política restrictiva para edición de viajes solo por superadministrador.
- `supabase/migrations/20261114000200_finance_permissions_phase_two.sql`
  - Permisos de edición escolar separados del permiso de acceso al módulo.
  - Cálculo de porcentaje KPI en base de datos.
  - RPC transaccional para registrar un pago escolar y generar el ingreso financiero relacionado al estudiante.
  - Clave idempotente para evitar duplicados incluso ante reintentos concurrentes.
  - Restricción de préstamos a un máximo de 12 cuotas.
  - Conversión histórica de litros a galones, precio por galón y cálculo de kilómetros recorridos por diferencia de odómetro.

### Finanzas — capa de seguridad y libro central preparados
Archivo: `supabase/migrations/20261114000300_financial_data_access_and_ledger.sql`

- Vistas de Finanzas con filtro explícito de permiso para viajes, combustible, mantenimiento, repuestos, empleados/compensación, préstamos, planilla y movimientos.
- Se retiró el permiso general de lectura de las tablas operativas y se concedió lectura por columnas, excluyendo importes, sueldos, saldos y costos.
- Los usuarios de Flota pueden registrar una operación, pero no consultar los importes históricos ni modificarlos después; esos cambios quedan reservados a Finanzas.
- Los importes de sueldos, préstamos y planilla se consultan mediante vistas de Finanzas. Los usuarios sin ese permiso ven los datos operativos, no las cantidades monetarias.
- El libro central se sincroniza mediante triggers con combustible, mantenimiento, repuestos, préstamos, planilla, cobros y gastos. Las claves deterministas evitan duplicar movimientos al reintentar o repetir el backfill.
- Las cuentas por cobrar y los ingresos de viajes no se cuentan como efectivo recibido; el ingreso efectivo se registra al crear el cobro.
- El cobro de una cuenta por cobrar usa un RPC transaccional con bloqueo de la cuenta, validación del saldo, clave idempotente, actualización de estado y movimiento financiero en la misma transacción.
- Los pagos escolares generan su movimiento desde su propio RPC transaccional.
- El panel de Finanzas consulta el libro central para los totales, reportes y una nueva pestaña de movimientos, identificando también al estudiante cuando el movimiento corresponde a transporte escolar.
- El libro central, los cobros recibidos y los pagos escolares no admiten edición directa desde la sesión cliente; se escriben mediante triggers o RPCs autorizados. Las planillas y gastos pagados quedan bloqueados para edición/eliminación.
- Se impide borrar una cuenta por cobrar que ya tenga cobros, para no perder su historial financiero.
- Se añadieron permisos explícitos de Data API para las tablas nuevas y la secuencia del código de estudiante. RLS sigue controlando qué filas puede utilizar cada usuario.

### Planilla quincenal y préstamos — cálculo preparado
- El sueldo mensual se divide automáticamente entre dos para cada quincena.
- La evaluación KPI solicita Quejas, Limpieza y Retrasos con escala 1–5: 0%, 25%, 50%, 75% y 100%.
- El porcentaje KPI es el promedio de los tres resultados. El bono se calcula a partir del máximo mensual individual, dividido entre dos para cada quincena.
- El descuento de préstamos se calcula con la menor cantidad entre la cuota programada y el saldo pendiente.
- La cuota programada se calcula automáticamente como monto del préstamo dividido entre 1–12 cuotas. La última cuota absorbe diferencias de redondeo.
- Al marcar una quincena como pagada, la base de datos descuenta las cuotas, actualiza saldos y cuenta de cuotas pagadas en una sola transacción. La marca de aplicación evita repetir el descuento.
- Una planilla pagada queda bloqueada para edición o eliminación. Los registros históricos con quincena 0 no se recalculan ni se usan para aplicar descuentos.

### Cambios de interfaz relacionados
- Operaciones muestra el ingreso del viaje solo a usuarios con Finanzas.
- Personal oculta sueldos, montos de préstamos y planilla a usuarios sin Finanzas.
- Flota muestra galones y kilometraje a sus usuarios; costos y precios quedan reservados a Finanzas.
- Finanzas utiliza las vistas protegidas para consultar importes y el libro central para reportes.

### Validaciones realizadas sobre la rama
- Sintaxis JavaScript de los scripts de `dashboard.html` y `administracion.html`: comprobada mediante compilación sintáctica.
- IDs HTML duplicados en `dashboard.html`: no se encontraron.
- Referencias literales a elementos DOM inexistentes en el script principal: no se encontraron.
- Restricciones y columnas actuales de planilla, préstamos, combustible y módulos consultadas en Supabase para ajustar las migraciones. La restricción real de planilla mensual se elimina por su nombre verificado y se reemplaza por la clave quincenal.
- Scripts de `dashboard.html` y `administracion.html`: sintaxis verificada, IDs duplicados no encontrados y referencias literales al DOM revisadas.
- Las funciones SQL nuevas de la tercera migración tienen delimitadores balanceados; la migración contiene 8 vistas protegidas y triggers de sincronización financiera.
- Se confirmó que las tres migraciones nuevas siguen fuera del proyecto Supabase activo: no existen aún sus tablas ni columnas nuevas.

### Pendiente antes de activar
**Ninguna migración se ha aplicado al proyecto Supabase activo y no se ha desplegado producción.** La base financiera central todavía es una estructura inicial: falta migrar ingresos y egresos históricos de viajes, combustible, mantenimiento, repuestos, préstamos y planilla; mover o proteger los importes que hoy siguen expuestos en tablas operativas; y completar RPC transaccionales para esas operaciones.

También falta terminar la interfaz de KPI y planilla quincenal, automatizar el descuento de préstamos en cada quincena y conectar todos los ingresos/egresos a Finanzas. El cambio de galones ya está reflejado en el formulario y requiere aplicar primero la migración 2 para que existan las columnas nuevas.

Por lo anterior, esta rama representa una implementación parcial en desarrollo, no una versión lista para activar ni entregar.
