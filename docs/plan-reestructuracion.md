# Reestructuración funcional y financiera — INCOROVA Transportes

Rama de trabajo: `changes/transport-school-finance-restructure`

## Criterios confirmados

- Sueldo base mensual; la planilla genera dos pagos por mes.
- Cada quincena parte del 50% del sueldo mensual.
- Bono KPI individual: cada trabajador tiene un máximo propio. Tres evaluaciones iguales (quejas, limpieza y retrasos), escala 1–5 convertida a 0%, 25%, 50%, 75% y 100%. El bono de la quincena se calcula sobre el máximo definido para esa quincena, salvo que se defina expresamente otro período.
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
- El bono ganado se calcula como máximo individual × porcentaje KPI.
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

## Decisión que requiere validación antes de automatizar el bono

La definición confirmada establece el monto máximo individual del bono, pero aún hay que decidir si ese máximo corresponde a **cada quincena** o al **mes completo**. La implementación debe conservar esa distinción; no asumirla silenciosamente.
