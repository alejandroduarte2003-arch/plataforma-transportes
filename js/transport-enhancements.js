import { supabase } from "./config.js";

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(n || 0));
const today = () => new Date().toLocaleDateString("en-CA");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
let userId = null, isAdmin = false, allowed = new Set();
let contracts = [], passengers = [], assignments = [], trips = [], tripBoardings = [];
let students = [], schoolFollowups = [], schoolCaps = {}, editingStudentId = null, selectedSchoolStudentId = null;
let employees = [], compensation = [], loans = [], payroll = [];
let fuel = [], vehicles = [], editingFuelId = null, editingTripId = null, renderingFuel = false;

function notify(message) { alert(message); }
function fail(action, error) { console.error(action, error); notify("No se pudo " + action + ": " + (error?.message || "Intenta nuevamente.")); }
function addStyle() {
  const style = document.createElement("style");
  style.textContent = ".ext-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:18px 0}.ext-card{background:#fff;border:1px solid #e5e7eb;border-radius:9px;padding:18px;min-width:0}.ext-card h3{font-size:14px;margin-bottom:12px}.ext-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ext-form label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:600}.ext-form input,.ext-form select,.ext-form textarea{width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:6px;font:inherit;font-size:12px;background:#fff;color:#111827}.ext-form .full{grid-column:1/-1}.ext-form button,.ext-action{background:#172554;color:#fff;border:0;border-radius:6px;padding:10px 13px;font-size:11px;font-weight:600;cursor:pointer}.ext-action.light{background:#fff;color:#172554;border:1px solid #e5e7eb}.ext-table{overflow:auto;margin-top:12px}.ext-table table{width:100%;border-collapse:collapse;min-width:600px}.ext-table th,.ext-table td{padding:11px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:11px}.ext-table th{background:#f9fafb;color:#6b7280}.ext-actions{display:flex;gap:6px;flex-wrap:wrap}.ext-note{font-size:11px;color:#6b7280;line-height:1.6;margin-top:8px}.ext-finance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.ext-finance-grid .ext-card{margin:0}.ext-finance-card-wide{grid-column:1/-1}.ext-payroll-preview{border:1px solid #dce2e9;border-radius:8px;background:#f9fafb;padding:14px;margin:14px 0}.ext-payroll-preview h4{font-size:12px;color:#172554;margin-bottom:10px}.ext-payroll-breakdown{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.ext-payroll-line{background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px;min-width:0}.ext-payroll-line span{display:block;font-size:10px;color:#6b7280;margin-bottom:5px}.ext-payroll-line strong{font-size:13px;color:#111827}.ext-payroll-total{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #dce2e9;margin-top:12px;padding-top:12px}.ext-payroll-total span{font-size:12px;font-weight:700;color:#172554}.ext-payroll-total strong{font-size:21px;color:#172554}.ext-school-accordions{display:grid;gap:10px;margin:18px 0}.ext-school-accordion{background:#fff;border:1px solid #dce2e9;border-radius:9px;overflow:hidden}.ext-school-accordion summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 19px;cursor:pointer;list-style:none;font-size:13px;font-weight:700;color:#172554}.ext-school-accordion summary::-webkit-details-marker{display:none}.ext-school-accordion summary:after{content:'+';font-size:20px;font-weight:400;color:#64748b}.ext-school-accordion[open] summary{border-bottom:1px solid #e5e7eb}.ext-school-accordion[open] summary:after{content:'−'}.ext-school-accordion summary small{font-size:11px;font-weight:400;color:#6b7280;margin-left:auto}.ext-school-accordion-body{padding:18px}.ext-student-followups{margin-top:18px;padding:18px;border:1px solid #e5e7eb;border-radius:8px;background:#fff}.ext-student-followups h3{font-size:14px;margin-bottom:12px}.ext-followup-item{padding:12px 0;border-bottom:1px solid #edf0f4}.ext-followup-item:last-child{border-bottom:0}.ext-followup-item strong{font-size:12px}.ext-followup-item p{font-size:12px;color:#475569;margin-top:5px;white-space:pre-wrap}.ext-heading{margin:4px 0 16px}.ext-heading h1{font-size:23px;margin-bottom:6px}.ext-heading p{font-size:12px;color:#6b7280}.ext-hidden{display:none!important}@media(max-width:760px){.ext-grid,.ext-finance-grid{grid-template-columns:1fr}.ext-finance-card-wide{grid-column:auto}.ext-form{grid-template-columns:1fr}.ext-form .full{grid-column:auto}.ext-payroll-breakdown{grid-template-columns:repeat(2,minmax(0,1fr))}.ext-payroll-total strong{font-size:18px}}";
  document.head.appendChild(style);
}
function makePage(id, title, subtitle) {
  const section = document.createElement("section");
  section.className = "view";
  section.id = "view-" + id;
  section.innerHTML = '<div class="ext-heading"><h1>' + title + '</h1><p>' + subtitle + '</p></div><div id="ext-' + id + '"></div>';
  document.querySelector(".content").appendChild(section);
  return section;
}
function showPage(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + id));
  document.querySelectorAll(".nav-button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  $("pageTitle").textContent = ({ abordajes:"Abordajes", escolares:"Transporte escolares", finanzas:"Finanzas" })[id] || id;
  $("sidebar")?.classList.remove("open");
}
function nav(id, label) {
  const b = $("nav" + (id === "abordajes" ? "Abordajes" : "Escolares"));
  if (!b) return;
  b.hidden = !allowed.has(id);
  b.addEventListener("click", () => showPage(id));
}
async function init() {
  try {
    const { data: sd, error: se } = await supabase.auth.getSession();
    if (se) throw se;
    if (!sd.session) return;
    userId = sd.session.user.id;
    const { data: profile, error: pe } = await supabase.from("profiles").select("role,status").eq("id", userId).single();
    if (pe) throw pe;
    if (!profile || profile.status !== "active") return;
    isAdmin = profile.role === "superadmin";
    if (isAdmin) allowed = new Set(["operaciones","personal","flota","finanzas","abordajes","escolares","administracion"]);
    else {
      const { data, error } = await supabase.from("user_module_permissions").select("module_code,can_access").eq("user_id", userId);
      if (error) throw error;
      (data || []).forEach(x => { if (x.can_access) allowed.add(x.module_code); });
    }
    addStyle();
    if (allowed.has("abordajes")) {
      nav("abordajes", "Abordajes");
      makePage("abordajes", "Abordajes", "Contratos, listas de pasajeros y registro de cada abordaje por viaje.");
      await initBoardings();
    }
    if (allowed.has("escolares")) {
      nav("escolares", "Transporte escolares");
      makePage("escolares", "Transporte escolares", "Expedientes de alumnos, seguimientos y registro de pagos.");
      await initSchool();
    }
    if (allowed.has("finanzas")) await initFinance();
    if (allowed.has("operaciones") && isAdmin) enableTripEditing();
    if (allowed.has("flota")) enableGallonsFuel();
    securePersonalView();
  } catch (e) { console.error("Inicialización de módulos:", e); }
}
function securePersonalView() {
  const finance = allowed.has("finanzas");
  if (!finance) {
    document.querySelectorAll('[data-personal-tab="loans"],[data-personal-tab="payroll"]').forEach(x => x.classList.add("ext-hidden"));
    $("personal-loans")?.classList.add("ext-hidden");
    $("personal-payroll")?.classList.add("ext-hidden");
  } else {
    // La información económica se consulta desde Finanzas, no desde Personal.
    $("personal-loans")?.classList.add("ext-hidden");
    $("personal-payroll")?.classList.add("ext-hidden");
    document.querySelectorAll('[data-personal-tab="loans"],[data-personal-tab="payroll"]').forEach(x => x.classList.add("ext-hidden"));
  }
  const salaryHead = document.querySelector("#personal-employees th:nth-child(4)");
  if (salaryHead) salaryHead.classList.add("ext-hidden");
  document.querySelectorAll("#personal-employees td:nth-child(4)").forEach(x => x.classList.add("ext-hidden"));
  const salaryField = $("employeeBaseSalary")?.closest(".form-field");
  if (salaryField) salaryField.classList.add("ext-hidden");
  if (!finance) {
    const style = document.createElement("style");
    style.textContent = "#view-flota .stats-grid{display:none!important}#view-flota #fuelTableBody td:nth-child(4),#view-flota #fuelTableBody td:nth-child(5),#view-flota #fleet-fuel table th:nth-child(4),#view-flota #fleet-fuel table th:nth-child(5),#view-flota #fleet-maintenance table th:nth-child(5),#view-flota #fleet-maintenance table td:nth-child(5),#view-flota #fleet-parts table th:nth-child(6),#view-flota #fleet-parts table td:nth-child(6),#view-flota #maintenanceTableBody td:nth-child(5),#view-flota #partsTableBody td:nth-child(6),#view-viajes #tripIncome{display:none!important}";
    document.head.appendChild(style);
    const tripIncome = $("tripIncome")?.closest(".stat-card");
    if (tripIncome) tripIncome.classList.add("ext-hidden");
    const tripTable = $("tripsTableBody")?.closest("table");
    if (tripTable) tripTable.querySelectorAll("th:nth-child(7),td:nth-child(7)").forEach(x => x.classList.add("ext-hidden"));
    document.querySelectorAll("#view-flota .stats-grid .stat-card").forEach(x => x.classList.add("ext-hidden"));
    ["fuelPrice","fuelCost","maintenanceCost","partsUnitCost","partsTotalCost","partsCalculatedTotal","tripIncomeInput"].forEach(id=>{
      const field=$(id);if(field){const box=field.closest(".form-field");if(box)box.classList.add("ext-hidden");field.value="0";}
    });
    if($("fuelPrice"))$("fuelPrice").required=false;
  }
}

// ---------------- ABORDAJES ----------------
async function initBoardings() {
  $("ext-abordajes").innerHTML =
    '<div class="ext-school-accordions">' +
      '<details class="ext-school-accordion"><summary>Nuevo contrato<small>Crear y administrar un contrato</small></summary><div class="ext-school-accordion-body"><form id="extContractForm" class="ext-form">' +
        '<label class="full">Nombre del contrato<input name="name" required maxlength="150"></label>' +
        '<label>Cliente<input name="client_name" maxlength="150"></label><label>Estado<select name="status"><option>Activo</option><option>Inactivo</option><option>Finalizado</option></select></label>' +
        '<label>Inicio<input name="start_date" type="date"></label><label>Finalización<input name="end_date" type="date"></label>' +
        '<label class="full">Observaciones<textarea name="notes"></textarea></label><button class="full" type="submit">Guardar contrato</button></form></div></details>' +
      '<details class="ext-school-accordion"><summary>Registrar pasajero<small>Agregar una persona al registro</small></summary><div class="ext-school-accordion-body"><form id="extPassengerForm" class="ext-form">' +
        '<label class="full">Nombre completo<input name="full_name" required maxlength="150"></label><label>Contacto<input name="contact" maxlength="80"></label>' +
        '<label class="full">Observaciones<textarea name="notes"></textarea></label><button class="full" type="submit">Guardar pasajero</button></form></div></details>' +
      '<details class="ext-school-accordion"><summary>Asignar pasajero a contrato<small>Agregar un pasajero a una lista</small></summary><div class="ext-school-accordion-body"><form id="extAssignForm" class="ext-form">' +
        '<label class="full">Contrato<select name="contract_id" id="extContractSelect" required></select></label>' +
        '<label class="full">Pasajero<select name="passenger_id" id="extPassengerSelect" required></select></label>' +
        '<label class="full">Punto de abordaje<input name="pickup_point" maxlength="180"></label><button class="full" type="submit">Agregar a la lista</button></form></div></details>' +
      '<details class="ext-school-accordion"><summary>Registrar abordaje por viaje<small>Guardar la asistencia de un pasajero en un viaje</small></summary><div class="ext-school-accordion-body"><form id="extTripBoardingForm" class="ext-form">' +
        '<label class="full">Viaje<select name="trip_id" id="extTripSelect" required></select></label>' +
        '<label class="full">Pasajero<select name="passenger_id" id="extTripPassengerSelect" required></select></label>' +
        '<label>Fecha y hora<input name="boarded_at" type="datetime-local" required></label><label>Punto de abordaje<input name="boarding_point" maxlength="180"></label>' +
        '<label class="full">Observaciones<textarea name="notes"></textarea></label><button class="full" type="submit">Registrar abordaje</button></form></div></details>' +
      '<details class="ext-school-accordion"><summary>Contratos y listas de pasajeros<small>Consultar o eliminar contratos</small></summary><div class="ext-school-accordion-body"><div id="extContractsTable" class="ext-table"></div></div></details>' +
      '<details class="ext-school-accordion"><summary>Pasajeros asignados a contratos<small>Consultar o quitar asignaciones</small></summary><div class="ext-school-accordion-body"><div id="extAssignmentsTable" class="ext-table"></div></div></details>' +
      '<details class="ext-school-accordion"><summary>Abordajes por viaje<small>Consultar los abordajes registrados</small></summary><div class="ext-school-accordion-body"><div id="extTripBoardingsTable" class="ext-table"></div><p class="ext-note">Un pasajero puede aparecer en varios viajes. Cada registro queda asociado al viaje específico.</p></div></details>' +
    '</div>';

  const saveForm = async (form, action, success, save) => {
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "Guardando...";
    try {
      await save();
      form.reset();
      button.textContent = "Actualizando lista...";
      await loadBoardingsData();
      notify(success);
    } catch (error) {
      fail(action, error);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  };

  $("extContractForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    await saveForm(form, "guardar el contrato", "Contrato guardado correctamente.", async () => {
      const p = Object.fromEntries(new FormData(form).entries());
      if (p.start_date === "") p.start_date = null;
      if (p.end_date === "") p.end_date = null;
      p.created_by = userId;
      const { error } = await supabase.from("transport_contracts").insert(p);
      if (error) throw error;
    });
  });

  $("extPassengerForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    await saveForm(form, "guardar el pasajero", "Pasajero guardado correctamente.", async () => {
      const p = Object.fromEntries(new FormData(form).entries());
      p.created_by = userId;
      const { error } = await supabase.from("transport_passengers").insert(p);
      if (error) throw error;
    });
  });

  $("extAssignForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    await saveForm(form, "asignar el pasajero al contrato", "Pasajero asignado correctamente.", async () => {
      const p = Object.fromEntries(new FormData(form).entries());
      const { error } = await supabase.from("contract_passengers").upsert(p, { onConflict:"contract_id,passenger_id" });
      if (error) throw error;
    });
  });

  $("extTripBoardingForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    if (button.disabled) return;
    const p = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    button.textContent = "Verificando...";
    try {
      const { data: existing, error: checkError } = await supabase
        .from("trip_passenger_boardings")
        .select("id,boarded_at,boarding_point")
        .eq("trip_id", p.trip_id)
        .eq("passenger_id", p.passenger_id)
        .maybeSingle();
      if (checkError) throw checkError;
      if (existing) {
        const when = existing.boarded_at ? new Date(existing.boarded_at).toLocaleString("es-GT") : "fecha no disponible";
        await loadBoardingsData();
        notify("Este pasajero ya tiene un abordaje registrado para este viaje (" + when + "). No se creó un duplicado.");
        return;
      }
      p.boarded_at = new Date(p.boarded_at).toISOString();
      p.created_by = userId;
      button.textContent = "Guardando...";
      const { error } = await supabase.from("trip_passenger_boardings").insert(p);
      if (error) {
        if (error.code === "23505") {
          await loadBoardingsData();
          notify("Este pasajero ya fue registrado en este viaje. La lista fue actualizada.");
          return;
        }
        throw error;
      }
      form.reset();
      button.textContent = "Actualizando lista...";
      await loadBoardingsData();
      notify("Abordaje registrado correctamente.");
    } catch (error) {
      fail("registrar el abordaje", error);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  $("extContractsTable").addEventListener("click", async e => {
    const b = e.target.closest("[data-del-contract]");
    if (!b) return;
    if (!confirm("¿Eliminar el contrato y sus asignaciones?")) return;
    const { error } = await supabase.from("transport_contracts").delete().eq("id", b.dataset.delContract);
    if (error) return fail("eliminar el contrato", error);
    await loadBoardingsData();
    notify("Contrato eliminado correctamente.");
  });
  $("extAssignmentsTable").addEventListener("click", async e => {
    const b = e.target.closest("[data-del-assignment]");
    if (!b) return;
    const [contract_id, passenger_id] = b.dataset.delAssignment.split("|");
    const { error } = await supabase.from("contract_passengers").delete().eq("contract_id", contract_id).eq("passenger_id", passenger_id);
    if (error) return fail("quitar el pasajero del contrato", error);
    await loadBoardingsData();
    notify("Pasajero retirado de la lista correctamente.");
  });
  $("extTripBoardingsTable").addEventListener("click", async e => {
    const b = e.target.closest("[data-del-trip-boarding]");
    if (!b) return;
    if (!confirm("¿Eliminar este registro de abordaje?")) return;
    const { error } = await supabase.from("trip_passenger_boardings").delete().eq("id", b.dataset.delTripBoarding);
    if (error) return fail("eliminar el abordaje", error);
    await loadBoardingsData();
    notify("Registro de abordaje eliminado correctamente.");
  });
  await loadBoardingsData();
}
async function loadBoardingsData() {
  const [c,p,a,t,b] = await Promise.all([
    supabase.from("transport_contracts").select("*").order("created_at",{ascending:false}),
    supabase.from("transport_passengers").select("*").order("full_name"),
    supabase.from("contract_passengers").select("*"),
    supabase.from("trips").select(allowed.has("finanzas")?"id,date,vehicle_id,origin,destination,responsible,service_type,income,status,notes":"id,date,vehicle_id,origin,destination,responsible,service_type,status,notes").order("date",{ascending:false}),
    supabase.from("trip_passenger_boardings").select("*").order("boarded_at",{ascending:false})
  ]);
  for (const r of [c,p,a,t,b]) if (r.error) throw r.error;
  contracts=c.data||[]; passengers=p.data||[]; assignments=a.data||[]; trips=t.data||[]; tripBoardings=b.data||[];
  $("extContractSelect").innerHTML='<option value="">Seleccionar contrato</option>'+contracts.map(x=>'<option value="'+x.id+'">'+esc(x.name)+' · '+esc(x.client_name)+'</option>').join("");
  $("extPassengerSelect").innerHTML='<option value="">Seleccionar pasajero</option>'+passengers.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+'</option>').join("");
  $("extTripSelect").innerHTML='<option value="">Seleccionar viaje</option>'+trips.map(x=>'<option value="'+x.id+'">'+esc(x.date)+' · '+esc(x.origin)+' → '+esc(x.destination)+'</option>').join("");
  $("extTripPassengerSelect").innerHTML='<option value="">Seleccionar pasajero</option>'+passengers.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+'</option>').join("");
  $("extContractsTable").innerHTML='<table><thead><tr><th>Contrato</th><th>Cliente</th><th>Estado</th><th>Pasajeros</th><th></th></tr></thead><tbody>'+contracts.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.client_name)+'</td><td>'+esc(x.status)+'</td><td>'+assignments.filter(a=>a.contract_id===x.id&&a.active).length+'</td><td><button class="ext-action light" data-del-contract="'+x.id+'">Eliminar</button></td></tr>').join("")+'</tbody></table>';
  $("extAssignmentsTable").innerHTML='<table><thead><tr><th>Contrato</th><th>Pasajero</th><th>Punto</th><th></th></tr></thead><tbody>'+assignments.map(x=>'<tr><td>'+esc(contracts.find(c=>c.id===x.contract_id)?.name||"—")+'</td><td>'+esc(passengers.find(p=>p.id===x.passenger_id)?.full_name||"—")+'</td><td>'+esc(x.pickup_point)+'</td><td><button class="ext-action light" data-del-assignment="'+x.contract_id+'|'+x.passenger_id+'">Quitar</button></td></tr>').join("")+'</tbody></table>';
  $("extTripBoardingsTable").innerHTML='<table><thead><tr><th>Fecha</th><th>Viaje</th><th>Pasajero</th><th>Punto</th><th></th></tr></thead><tbody>'+tripBoardings.map(x=>{const t=trips.find(t=>t.id===x.trip_id);return '<tr><td>'+esc(new Date(x.boarded_at).toLocaleString("es-GT"))+'</td><td>'+esc(t?(t.origin+" → "+t.destination):"—")+'</td><td>'+esc(passengers.find(p=>p.id===x.passenger_id)?.full_name||"—")+'</td><td>'+esc(x.boarding_point)+'</td><td><button class="ext-action light" data-del-trip-boarding="'+x.id+'">Eliminar</button></td></tr>';}).join("")+'</tbody></table>';
}

// ---------------- TRANSPORTE ESCOLARES ----------------
async function initSchool() {
  $("ext-escolares").innerHTML =
    '<div class="ext-school-accordions">' +
      '<details class="ext-school-accordion"><summary>Nuevo alumno<small>Información del estudiante y su encargado</small></summary><div class="ext-school-accordion-body"><form id="extStudentForm" class="ext-form">' +
        '<label class="full">Nombre completo del alumno<input name="full_name" required maxlength="160"></label>' +
        '<label>Nombre del encargado<input name="guardian_name" required maxlength="160"></label><label>Teléfono del encargado<input name="guardian_phone" maxlength="40"></label>' +
        '<label>Parentesco<input name="guardian_relationship" maxlength="80"></label><label>Centro educativo<input name="school_name" maxlength="160"></label><label>Estado<select name="status"><option>Activo</option><option>Inactivo</option></select></label>' +
        '<label class="full">Dirección mañana<input name="address_am" maxlength="250"></label><label class="full">Dirección tarde<input name="address_pm" maxlength="250"></label>' +
        '<button class="full" type="submit">Guardar alumno</button></form></div></details>' +
      '<details class="ext-school-accordion"><summary>Nuevo seguimiento<small>Registrar una nota para un alumno</small></summary><div class="ext-school-accordion-body"><form id="extFollowupForm" class="ext-form">' +
        '<label class="full">Alumno<select name="student_id" id="extFollowupStudent" required></select></label>' +
        '<label class="full">Asunto<input name="subject" required maxlength="160"></label><label class="full">Detalle<textarea name="detail" required></textarea></label>' +
        '<button class="full" type="submit">Guardar seguimiento</button></form></div></details>' +
      '<details class="ext-school-accordion"><summary>Registrar pago<small>Registrar un pago escolar</small></summary><div class="ext-school-accordion-body"><div id="extSchoolPaymentBox"></div></div></details>' +
    '</div>' +
    '<div class="ext-card"><h3>Alumnos registrados</h3><div id="extStudentsTable" class="ext-table"></div><div id="extStudentFollowupsPanel" class="ext-student-followups"><p class="ext-note">Selecciona “Seguimientos” en un alumno para consultar su historial individual.</p></div></div>' +
    '<div class="ext-card" id="extSchoolPaymentsHistory"></div>';

  const { data: caps, error: ce } = await supabase.from("school_user_permissions").select("can_edit_students,can_edit_followups,can_register_payments").eq("user_id",userId).maybeSingle();
  if (ce) throw ce;
  schoolCaps = caps || {};
  if (isAdmin) schoolCaps = {can_edit_students:true,can_edit_followups:true,can_register_payments:true};
  if (!schoolCaps.can_edit_students) $("extStudentForm").closest("details").classList.add("ext-hidden");
  if (!schoolCaps.can_edit_followups) $("extFollowupForm").closest("details").classList.add("ext-hidden");

  if (schoolCaps.can_register_payments || allowed.has("finanzas")) {
    $("extSchoolPaymentBox").innerHTML = '<form id="extSchoolPaymentForm" class="ext-form"><label class="full">Alumno<select name="student_id" id="extPaymentStudent" required></select></label><label class="full">Monto (Q)<input name="amount" type="number" min=".01" step=".01" required></label><label class="full">Referencia<input name="reference" maxlength="160"></label><button class="full" type="submit">Registrar pago</button></form>';
    $("extSchoolPaymentForm").addEventListener("submit",async e=>{
      e.preventDefault();
      const d=Object.fromEntries(new FormData(e.currentTarget).entries());
      const p={student_id:d.student_id,amount:Number(d.amount),reference:d.reference||"",paid_at:new Date().toISOString(),payment_status:"Realizado",enrollment_status:"Vigente",created_by:userId,request_key:crypto.randomUUID()};
      const {error}=await supabase.from("school_student_payments").insert(p);
      if(error)return fail("registrar el pago del alumno",error);
      e.currentTarget.reset();
      if ($("extFinanceSchoolPayments")) await loadFinanceDataExt();
      if ($("extSchoolPaymentsHistory")) await loadSchoolPayments();
      notify("Pago registrado y actualizado en Finanzas.");
    });
  } else {
    $("extSchoolPaymentBox").innerHTML = '<p class="ext-note">No tienes permiso para registrar pagos.</p>';
    $("extSchoolPaymentBox").closest("details").classList.add("ext-hidden");
  }

  $("extStudentForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('button[type="submit"]');
    if(button.disabled)return;
    button.disabled=true;button.textContent="Guardando...";
    try{
      const p=Object.fromEntries(new FormData(form).entries());p.created_by=userId;
      const q=editingStudentId ? supabase.from("school_students").update(p).eq("id",editingStudentId) : supabase.from("school_students").insert(p);
      const {error}=await q;
      if(error)throw error;
      editingStudentId=null;form.reset();button.textContent="Actualizando lista...";
      await loadSchoolData();
      button.textContent="Guardar alumno";
      form.closest("details").open=false;
      notify("Alumno guardado correctamente.");
    }catch(error){fail("guardar el alumno",error);button.textContent=editingStudentId?"Actualizar alumno":"Guardar alumno";}
    finally{button.disabled=false;}
  });

  $("extFollowupForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('button[type="submit"]');
    if(button.disabled)return;
    button.disabled=true;button.textContent="Guardando...";
    try{
      const p=Object.fromEntries(new FormData(form).entries());p.created_by=userId;
      const {error}=await supabase.from("school_student_followups").insert(p);
      if(error)throw error;
      selectedSchoolStudentId=p.student_id;
      form.reset();await loadSchoolData();
      $("extFollowupStudent").value=selectedSchoolStudentId;
      notify("Seguimiento guardado correctamente.");
    }catch(error){fail("guardar el seguimiento",error);}
    finally{button.disabled=false;button.textContent="Guardar seguimiento";}
  });

  $("extStudentsTable").addEventListener("click",async e=>{
    const edit=e.target.closest("[data-edit-student]");
    const follow=e.target.closest("[data-student-followups]");
    const del=e.target.closest("[data-del-student]");
    if(follow){
      selectedSchoolStudentId=follow.dataset.studentFollowups;
      $("extFollowupStudent").value=selectedSchoolStudentId;
      renderSchoolStudentFollowups();
      $("extStudentFollowupsPanel").scrollIntoView({behavior:"smooth",block:"center"});
      return;
    }
    if(edit){
      const x=students.find(s=>s.id===edit.dataset.editStudent);if(!x)return;
      editingStudentId=x.id;
      const form=$("extStudentForm");
      Object.entries({full_name:x.full_name,guardian_name:x.guardian_name,guardian_phone:x.guardian_phone,guardian_relationship:x.guardian_relationship,school_name:x.school_name,status:x.status,address_am:x.address_am,address_pm:x.address_pm}).forEach(([k,v])=>{if(form.elements[k])form.elements[k].value=v||"";});
      form.querySelector("button[type=submit]").textContent="Actualizar alumno";
      form.closest("details").open=true;
      form.scrollIntoView({behavior:"smooth",block:"center"});
      return;
    }
    if(!del)return;
    if(!confirm("¿Eliminar este alumno?"))return;
    const {error}=await supabase.from("school_students").delete().eq("id",del.dataset.delStudent);
    if(error)return fail("eliminar el alumno",error);
    if(selectedSchoolStudentId===del.dataset.delStudent)selectedSchoolStudentId=null;
    await loadSchoolData();
  });

  $("extStudentFollowupsPanel").addEventListener("click",async e=>{
    const edit=e.target.closest("[data-edit-followup]");
    const del=e.target.closest("[data-del-followup]");
    if(edit){
      const {data,error}=await supabase.from("school_student_followups").select("*").eq("id",edit.dataset.editFollowup).single();
      if(error)return fail("consultar el seguimiento",error);
      const subject=prompt("Asunto del seguimiento",data.subject);if(subject===null)return;
      const detail=prompt("Detalle del seguimiento",data.detail);if(detail===null)return;
      const {error:saveError}=await supabase.from("school_student_followups").update({subject,detail}).eq("id",data.id);
      if(saveError)return fail("actualizar el seguimiento",saveError);
      await loadSchoolData();return;
    }
    if(!del)return;
    if(!confirm("¿Eliminar este seguimiento?"))return;
    const {error}=await supabase.from("school_student_followups").delete().eq("id",del.dataset.delFollowup);
    if(error)return fail("eliminar el seguimiento",error);
    await loadSchoolData();
  });

  await loadSchoolData();
  if (allowed.has("finanzas")) await loadSchoolPayments();
}

async function loadSchoolData() {
  const [sr,fr]=await Promise.all([
    supabase.from("school_students").select("*").order("student_code",{ascending:false}),
    supabase.from("school_student_followups").select("*").order("followup_date",{ascending:false})
  ]);
  if(sr.error)throw sr.error;if(fr.error)throw fr.error;
  students=sr.data||[];
  schoolFollowups=fr.data||[];
  const options='<option value="">Seleccionar alumno</option>'+students.map(s=>'<option value="'+s.id+'">'+esc(s.student_code)+' · '+esc(s.full_name)+'</option>').join("");
  $("extFollowupStudent").innerHTML=options;
  if($("extPaymentStudent"))$("extPaymentStudent").innerHTML=options;
  $("extStudentsTable").innerHTML='<table><thead><tr><th>ID</th><th>Alumno</th><th>Centro educativo</th><th>Encargado</th><th>Estado</th><th></th></tr></thead><tbody>'+students.map(s=>'<tr><td>'+esc(s.student_code)+'</td><td>'+esc(s.full_name)+'</td><td>'+esc(s.school_name)+'</td><td>'+esc(s.guardian_name)+'<br>'+esc(s.guardian_phone)+'<br>'+esc(s.guardian_relationship)+'</td><td>'+esc(s.status)+'</td><td><div class="ext-actions"><button class="ext-action light" data-student-followups="'+s.id+'">Seguimientos</button>'+(schoolCaps.can_edit_students||isAdmin?'<button class="ext-action light" data-edit-student="'+s.id+'">Editar</button><button class="ext-action light" data-del-student="'+s.id+'">Eliminar</button>':"")+'</div></td></tr>').join("")+'</tbody></table>';
  if(selectedSchoolStudentId&&!students.some(s=>s.id===selectedSchoolStudentId))selectedSchoolStudentId=null;
  renderSchoolStudentFollowups();
}

function renderSchoolStudentFollowups() {
  const panel=$("extStudentFollowupsPanel");
  const student=students.find(s=>s.id===selectedSchoolStudentId);
  if(!student){
    panel.innerHTML='<p class="ext-note">Selecciona “Seguimientos” en un alumno para consultar su historial individual.</p>';
    return;
  }
  const items=schoolFollowups.filter(f=>f.student_id===student.id);
  panel.innerHTML='<h3>Seguimientos · '+esc(student.full_name)+'</h3>'+(items.length?items.map(f=>'<div class="ext-followup-item"><strong>'+esc(new Date(f.followup_date).toLocaleString("es-GT"))+' · '+esc(f.subject)+'</strong><p>'+esc(f.detail)+'</p>'+(schoolCaps.can_edit_followups||isAdmin?'<div class="ext-actions"><button class="ext-action light" data-edit-followup="'+f.id+'">Editar</button><button class="ext-action light" data-del-followup="'+f.id+'">Eliminar</button></div>':'')+'</div>').join(""):'<p class="ext-note">Este alumno todavía no tiene seguimientos registrados.</p>');
}
async function loadSchoolPayments() {
  const {data,error}=await supabase.from("school_student_payments").select("*").order("paid_at",{ascending:false});
  if(error)throw error;
  $("extSchoolPaymentsHistory").innerHTML='<h3>Pagos escolares · Finanzas</h3><div class="ext-table"><table><thead><tr><th>Fecha</th><th>Alumno</th><th>Monto</th><th>Estado</th><th>Referencia</th></tr></thead><tbody>'+(data||[]).map(p=>'<tr><td>'+esc(new Date(p.paid_at).toLocaleDateString("es-GT"))+'</td><td>'+esc(students.find(s=>s.id===p.student_id)?.full_name||"—")+'</td><td>'+money(p.amount)+'</td><td>'+esc(p.payment_status)+'</td><td>'+esc(p.reference)+'</td></tr>').join("")+'</tbody></table></div>';
}

// ---------------- FINANZAS: COMPENSACIÓN, PRÉSTAMOS Y PLANILLA ----------------
async function initFinance() {
  const workspace=$("extFinanceWorkspace");
  if(!workspace)return;
  const compensationCard=document.createElement("div");
  compensationCard.className="ext-card";
  compensationCard.innerHTML='<h3>Compensación por trabajador</h3><p class="ext-note">Configura el sueldo y el bono KPI mensual de cada persona. Ambos se distribuyen en dos quincenas.</p><form id="extCompForm" class="ext-form">' +
    '<label class="full">Trabajador<select id="extCompEmployee" name="employee_id" required></select></label>' +
    '<label>Sueldo base mensual (Q)<input name="monthly_base_salary" type="number" min="0" step=".01" required></label>' +
    '<label>Bono KPI máximo mensual (Q)<input name="monthly_kpi_bonus_max" type="number" min="0" step=".01" value="0" required></label>' +
    '<button class="full" type="submit">Guardar compensación</button></form><div id="extCompTable" class="ext-table"></div>';
  const loansCard=document.createElement("div");
  loansCard.className="ext-card";
  loansCard.innerHTML='<h3>Préstamos de trabajadores</h3><p class="ext-note">Registra préstamos y consulta el saldo pendiente. La cuota se descuenta al marcar la quincena como pagada.</p><form id="extLoanForm" class="ext-form">' +
    '<label class="full">Trabajador<select name="employee_id" id="extLoanEmployee" required></select></label>' +
    '<label class="full">Motivo<input name="reason" maxlength="180"></label>' +
    '<label>Monto (Q)<input name="amount" type="number" min=".01" step=".01" required></label>' +
    '<label>Cuotas quincenales (máximo 12)<input name="installments_total" id="extLoanTerms" type="number" min="1" max="12" required></label>' +
    '<label>Cuota por quincena (Q)<input id="extLoanInstallment" readonly></label><label>Fecha de inicio<input name="start_date" type="date" value="'+today()+'" required></label>' +
    '<button class="full" type="submit">Registrar préstamo</button></form><div id="extLoansTable" class="ext-table"></div>';
  const payrollCard=document.createElement("div");
  payrollCard.className="ext-card ext-finance-card-wide";
  payrollCard.innerHTML='<h3>Planilla quincenal</h3><p class="ext-note">Selecciona al trabajador y evalúa sus indicadores. El resultado se calcula automáticamente antes de guardar.</p><form id="extPayrollForm" class="ext-form">' +
    '<label class="full">Trabajador<select name="employee_id" id="extPayrollEmployee" required></select></label>' +
    '<label>Mes<input name="period" type="month" value="'+today().slice(0,7)+'" required></label><label>Quincena<select name="fortnight"><option value="1">Primera</option><option value="2">Segunda</option></select></label>' +
    '<label>Quejas (1–5)<select name="kpi_complaints"><option value="">Sin evaluar</option><option value="1">1 · 0%</option><option value="2">2 · 25%</option><option value="3">3 · 50%</option><option value="4">4 · 75%</option><option value="5">5 · 100%</option></select></label>' +
    '<label>Limpieza (1–5)<select name="kpi_cleanliness"><option value="">Sin evaluar</option><option value="1">1 · 0%</option><option value="2">2 · 25%</option><option value="3">3 · 50%</option><option value="4">4 · 75%</option><option value="5">5 · 100%</option></select></label>' +
    '<label>Retrasos (1–5)<select name="kpi_delays"><option value="">Sin evaluar</option><option value="1">1 · 0%</option><option value="2">2 · 25%</option><option value="3">3 · 50%</option><option value="4">4 · 75%</option><option value="5">5 · 100%</option></select></label>' +
    '<label>Otras deducciones (Q)<input name="other_deductions" type="number" min="0" step=".01" value="0"></label>' +
    '<div class="full" id="extPayrollPreview" aria-live="polite"></div>' +
    '<button class="full" type="submit">Guardar planilla quincenal</button></form><div id="extPayrollTable" class="ext-table"></div>';
  const schoolPaymentsCard=document.createElement("div");
  schoolPaymentsCard.className="ext-card ext-finance-card-wide";
  schoolPaymentsCard.innerHTML='<h3>Ingresos de transporte escolar</h3><p class="ext-note">Consulta aquí los pagos registrados desde el módulo de Transporte escolares.</p><div id="extFinanceSchoolPayments" class="ext-table"></div>';
  const grid=document.createElement("div");
  grid.className="ext-finance-grid";
  grid.append(compensationCard,loansCard,payrollCard,schoolPaymentsCard);
  workspace.replaceChildren(grid);
  await loadFinanceDataExt();
  $("extCompForm").addEventListener("submit",async e=>{
    e.preventDefault();const p=Object.fromEntries(new FormData(e.currentTarget).entries());
    p.monthly_base_salary=Number(p.monthly_base_salary);p.monthly_kpi_bonus_max=Number(p.monthly_kpi_bonus_max);p.currency="GTQ";
    const {error}=await supabase.from("employee_compensation").upsert(p,{onConflict:"employee_id"});
    if(error)return fail("guardar la compensación",error);await loadFinanceDataExt();renderPayrollPreview();notify("Compensación guardada.");
  });
  $("extLoanTerms").addEventListener("input",calcLoanInstallment);
  $("extLoanForm").addEventListener("input",calcLoanInstallment);
  $("extLoanForm").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]');
    if(button.disabled)return;button.disabled=true;
    try{
      const p=Object.fromEntries(new FormData(form).entries());
      p.amount=Number(p.amount);p.installments_total=Number(p.installments_total);
      if(p.installments_total<1||p.installments_total>12)return notify("El préstamo debe tener entre 1 y 12 cuotas quincenales.");
      p.balance=p.amount;p.installments_paid=0;p.installment_amount=Number((p.amount/p.installments_total).toFixed(2));p.status="Activo";p.notes="";p.created_by=userId;
      const {error}=await supabase.from("employee_loans").insert(p);
      if(error)return fail("registrar el préstamo",error);
      form.reset();form.querySelector('[name="start_date"]').value=today();await loadFinanceDataExt();renderPayrollPreview();notify("Préstamo registrado.");
    }finally{button.disabled=false;}
  });
  const payrollForm=$("extPayrollForm");
  payrollForm.addEventListener("input",renderPayrollPreview);
  payrollForm.addEventListener("change",renderPayrollPreview);
  payrollForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('button[type="submit"]');
    if(button.disabled)return;
    const p=Object.fromEntries(new FormData(form).entries());
    const calc=calculatePayrollPreview(p);
    if(!calc)return notify("Selecciona un trabajador con compensación configurada.");
    if(calc.totalDeductions>calc.baseSalary+calc.bonus+0.009)return notify("Las deducciones no pueden superar el ingreso quincenal.");
    const period=p.period+"-01",fortnight=Number(p.fortnight);
    const {data:dupe,error:de}=await supabase.from("payroll_records").select("id").eq("employee_id",p.employee_id).eq("period",period).eq("fortnight",fortnight).maybeSingle();
    if(de)return fail("verificar la quincena",de);
    if(dupe)return notify("Ya existe una planilla para ese trabajador y quincena. No se modificó el registro existente.");
    const payload={employee_id:p.employee_id,period,fortnight,kpi_complaints:p.kpi_complaints?Number(p.kpi_complaints):null,kpi_cleanliness:p.kpi_cleanliness?Number(p.kpi_cleanliness):null,kpi_delays:p.kpi_delays?Number(p.kpi_delays):null,kpi_percentage:calc.kpiPercentage,other_deductions:calc.otherDeductions,base_salary:calc.baseSalary,bonuses:calc.bonus,loan_deduction:calc.loanDeduction,net_pay:calc.netPay,status:"Pendiente",notes:"",created_by:userId};
    button.disabled=true;button.textContent="Guardando...";
    try{
      const {data:saved,error}=await supabase.from("payroll_records").insert(payload).select("*").single();
      if(error){
        if(error.code==="23505"){await loadFinanceDataExt();return notify("Ya existe una planilla para ese trabajador y quincena. No se creó ni modificó ningún registro.");}
        return fail("calcular y guardar la quincena",error);
      }
      await loadFinanceDataExt();
      renderPayrollPreview();
      notify("Planilla guardada. Neto a pagar: "+money(saved.net_pay)+".");
      window.dispatchEvent(new CustomEvent("transport-payroll-saved",{detail:{employeeId:p.employee_id}}));
    }finally{button.disabled=false;button.textContent="Guardar planilla quincenal";}
  });
  $("extLoansTable").addEventListener("click",async e=>{
    const b=e.target.closest("[data-cancel-loan]");if(!b)return;
    if(!confirm("¿Cancelar este préstamo?"))return;
    const {error}=await supabase.from("employee_loans").update({status:"Cancelado"}).eq("id",b.dataset.cancelLoan);
    if(error)return fail("cancelar el préstamo",error);await loadFinanceDataExt();renderPayrollPreview();
  });
  $("extPayrollTable").addEventListener("click",async e=>{
    const b=e.target.closest("[data-payroll-paid]");if(!b)return;
    if(!confirm("¿Confirmas el pago de esta quincena? Se aplicarán los descuentos de préstamo."))return;
    const {error}=await supabase.from("payroll_records").update({status:"Pagada",payment_date:today()}).eq("id",b.dataset.payrollPaid);
    if(error)return fail("marcar la quincena como pagada",error);await loadFinanceDataExt();renderPayrollPreview();
  });
}
function calculatePayrollPreview(p) {
  const comp=compensation.find(x=>x.employee_id===p.employee_id);
  if(!comp)return null;
  const baseSalary=Number((Number(comp.monthly_base_salary||0)/2).toFixed(2));
  const values=[p.kpi_complaints,p.kpi_cleanliness,p.kpi_delays].map(v=>v===""?null:Number(v));
  const hasAllKpis=values.every(v=>v!==null&&v>=1&&v<=5);
  const kpiPercentage=hasAllKpis?Number((((values[0]-1)*25+(values[1]-1)*25+(values[2]-1)*25)/3).toFixed(2)):null;
  const bonus=Number((Number(comp.monthly_kpi_bonus_max||0)*(kpiPercentage||0)/100/2).toFixed(2));
  const activeLoans=loans.filter(x=>x.employee_id===p.employee_id&&x.status==="Activo"&&Number(x.balance)>0&&(x.installments_total==null||Number(x.installments_paid)<Number(x.installments_total)));
  const loanDeduction=Number(activeLoans.reduce((sum,x)=>{
    const remaining=Number(x.balance||0),installment=Number(x.installment_amount||0);
    const next= x.installments_total!=null&&Number(x.installments_paid)+1>=Number(x.installments_total)?remaining:Math.min(installment,remaining);
    return sum+Math.max(0,next);
  },0).toFixed(2));
  const otherDeductions=Number(p.other_deductions||0);
  const totalDeductions=Number((loanDeduction+otherDeductions).toFixed(2));
  const netPay=Number((baseSalary+bonus-totalDeductions).toFixed(2));
  return {baseSalary,kpiPercentage,bonus,loanDeduction,otherDeductions,totalDeductions,netPay};
}
function renderPayrollPreview() {
  const target=$("extPayrollPreview"),form=$("extPayrollForm");
  if(!target||!form)return;
  const p=Object.fromEntries(new FormData(form).entries());
  const employee=employees.find(x=>x.id===p.employee_id);
  const comp=compensation.find(x=>x.employee_id===p.employee_id);
  if(!p.employee_id){target.innerHTML='<div class="ext-payroll-preview"><h4>Resultado de la quincena</h4><p class="ext-note">Selecciona un trabajador para ver el cálculo.</p></div>';return;}
  if(!comp){target.innerHTML='<div class="ext-payroll-preview"><h4>Resultado de la quincena</h4><p class="ext-note">'+esc(employee?.full_name||"Este trabajador")+' no tiene una compensación configurada. Guarda primero su sueldo y bono mensual.</p></div>';return;}
  const c=calculatePayrollPreview(p);
  target.innerHTML='<div class="ext-payroll-preview"><h4>Resultado estimado · '+esc(employee?.full_name||"Trabajador")+'</h4><div class="ext-payroll-breakdown">'+
    '<div class="ext-payroll-line"><span>Sueldo base</span><strong>'+money(c.baseSalary)+'</strong></div>'+
    '<div class="ext-payroll-line"><span>KPI alcanzado</span><strong>'+(c.kpiPercentage===null?"Sin evaluar":c.kpiPercentage.toFixed(2)+"%")+'</strong></div>'+
    '<div class="ext-payroll-line"><span>Bono KPI</span><strong>'+money(c.bonus)+'</strong></div>'+
    '<div class="ext-payroll-line"><span>Descuento préstamo</span><strong>'+money(c.loanDeduction)+'</strong></div>'+
    '<div class="ext-payroll-line"><span>Otras deducciones</span><strong>'+money(c.otherDeductions)+'</strong></div>'+
    '<div class="ext-payroll-line"><span>Total deducciones</span><strong>'+money(c.totalDeductions)+'</strong></div>'+
    '</div><div class="ext-payroll-total"><span>NETO A PAGAR</span><strong>'+money(c.netPay)+'</strong></div></div>';
}

function calcLoanInstallment() {
  const amount=Number($("extLoanForm")?.querySelector('[name="amount"]')?.value||0);
  const terms=Number($("extLoanTerms")?.value||0);
  $("extLoanInstallment").value=terms>0?money(amount/terms):"";
}
async function loadFinanceDataExt() {
  const [er,cr,lr,pr,spr,ssr]=await Promise.all([
    supabase.from("employees").select("id,full_name,position,status").order("full_name"),
    supabase.from("employee_compensation").select("*"),
    supabase.from("employee_loans").select("*").order("created_at",{ascending:false}),
    supabase.from("payroll_records").select("*").order("period",{ascending:false}),
    supabase.from("school_student_payments").select("*").order("paid_at",{ascending:false}),
    supabase.from("school_students").select("id,student_code,full_name").order("full_name")
  ]);
  for(const r of [er,cr,lr,pr,spr,ssr])if(r.error)throw r.error;
  employees=er.data||[];compensation=cr.data||[];loans=lr.data||[];payroll=pr.data||[];
  const schoolPayments=spr.data||[],schoolPeople=ssr.data||[];
  $("extFinanceSchoolPayments").innerHTML='<table><thead><tr><th>Fecha</th><th>ID alumno</th><th>Estudiante</th><th>Referencia</th><th>Ingreso</th><th>Estado</th></tr></thead><tbody>'+schoolPayments.map(p=>'<tr><td>'+esc(new Date(p.paid_at).toLocaleDateString("es-GT"))+'</td><td>'+esc(schoolPeople.find(x=>x.id===p.student_id)?.student_code||"—")+'</td><td>'+esc(schoolPeople.find(x=>x.id===p.student_id)?.full_name||"—")+'</td><td>'+esc(p.reference||"—")+'</td><td>'+money(p.amount)+'</td><td>'+esc(p.payment_status)+'</td></tr>').join("")+'</tbody></table>';
  const opts='<option value="">Seleccionar trabajador</option>'+employees.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+'</option>').join("");
  $("extCompEmployee").innerHTML=opts;$("extLoanEmployee").innerHTML=opts;$("extPayrollEmployee").innerHTML=opts;
  $("extCompTable").innerHTML='<table><thead><tr><th>Trabajador</th><th>Sueldo mensual</th><th>Bono KPI mensual</th></tr></thead><tbody>'+compensation.map(x=>'<tr><td>'+esc(employees.find(e=>e.id===x.employee_id)?.full_name||"—")+'</td><td>'+money(x.monthly_base_salary)+'</td><td>'+money(x.monthly_kpi_bonus_max)+'</td></tr>').join("")+'</tbody></table>';
  $("extLoansTable").innerHTML='<table><thead><tr><th>Trabajador</th><th>Monto</th><th>Saldo</th><th>Cuota</th><th>Cuotas</th><th>Estado</th><th></th></tr></thead><tbody>'+loans.map(x=>'<tr><td>'+esc(employees.find(e=>e.id===x.employee_id)?.full_name||"—")+'</td><td>'+money(x.amount)+'</td><td>'+money(x.balance)+'</td><td>'+money(x.installment_amount)+'</td><td>'+x.installments_paid+'/'+x.installments_total+'</td><td>'+esc(x.status)+'</td><td>'+(x.status==="Activo"?'<button class="ext-action light" data-cancel-loan="'+x.id+'">Cancelar</button>':"")+'</td></tr>').join("")+'</tbody></table>';
  $("extPayrollTable").innerHTML='<table><thead><tr><th>Mes / quincena</th><th>Trabajador</th><th>Base</th><th>KPI</th><th>Bono</th><th>Préstamo</th><th>Neto</th><th>Estado</th><th></th></tr></thead><tbody>'+payroll.map(x=>'<tr><td>'+esc(String(x.period).slice(0,7))+' · '+(x.fortnight===1?"1.ª":"2.ª")+'</td><td>'+esc(employees.find(e=>e.id===x.employee_id)?.full_name||"—")+'</td><td>'+money(x.base_salary)+'</td><td>'+(x.kpi_percentage==null?"—":Number(x.kpi_percentage).toFixed(0)+"%")+'</td><td>'+money(x.bonuses)+'</td><td>'+money(x.loan_deduction)+'</td><td><strong>'+money(x.net_pay)+'</strong></td><td>'+esc(x.status)+'</td><td>'+(x.status==="Pendiente"?'<button class="ext-action" data-payroll-paid="'+x.id+'">Marcar pagada</button>':"")+'</td></tr>').join("")+'</tbody></table>';
  $("extCompEmployee").onchange=()=>{
    const x=compensation.find(c=>c.employee_id===$("extCompEmployee").value);
    $("extCompForm").querySelector('[name="monthly_base_salary"]').value=x?.monthly_base_salary??"";
    $("extCompForm").querySelector('[name="monthly_kpi_bonus_max"]').value=x?.monthly_kpi_bonus_max??0;
  };
  renderPayrollPreview();
}

// ---------------- EDICIÓN DE VIAJES ----------------
function enableTripEditing() {
  const tbody=$("tripsTableBody"),form=$("tripForm");
  if(!tbody||!form)return;
  const render=()=>{
    tbody.querySelectorAll("tr").forEach(row=>{
      const del=row.querySelector("[data-delete-trip]");
      if(del && !row.querySelector("[data-ext-edit-trip]")){
        const id=del.dataset.deleteTrip;
        const btn=document.createElement("button");btn.type="button";btn.className="table-action";btn.dataset.extEditTrip=id;btn.textContent="Editar";
        del.parentElement.insertBefore(btn,del);
      }
    });
  };
  new MutationObserver(render).observe(tbody,{childList:true,subtree:true});
  render();
  tbody.addEventListener("click",e=>{
    const b=e.target.closest("[data-ext-edit-trip]");if(!b)return;
    const row=b.closest("tr"),id=b.dataset.extEditTrip;
    const cells=row.querySelectorAll("td");
    const trip=trips.find(x=>x.id===id);
    const date=cells[0]?.textContent.trim()||"",vehicleText=cells[1]?.textContent.trim()||"";
    const vehicle=vehicles.find(v=>(v.code+" · "+v.plate)===vehicleText);
    editingTripId=id;
    $("tripDate").value=date;$("tripVehicle").value=vehicle?.id||"";
    $("tripOrigin").value=cells[2]?.textContent.trim()||"";
    $("tripDestination").value=cells[3]?.textContent.trim()||"";
    $("tripResponsible").value=cells[4]?.textContent.trim()||"";
    $("tripServiceType").value=cells[5]?.textContent.trim()||"";
    $("tripIncomeInput").value=trip?.income||0;
    $("tripStatus").value=cells[7]?.textContent.trim()||"Programado";
    $("tripNotes").value=trip?.notes||"";
    $("tripModalTitle").textContent="Editar viaje";
    $("tripModal").classList.add("open");
  },true);
  $("addTripButton")?.addEventListener("click",()=>{editingTripId=null;});
  $("cancelTrip")?.addEventListener("click",()=>{editingTripId=null;});
  $("closeTripModal")?.addEventListener("click",()=>{editingTripId=null;});
  form.addEventListener("submit",async e=>{
    if(!editingTripId)return;
    e.preventDefault();e.stopImmediatePropagation();
    const id=editingTripId,fd=new FormData(form);
    const p={date:String(fd.get("date")),vehicle_id:String(fd.get("vehicleId")),origin:String(fd.get("origin")).trim(),destination:String(fd.get("destination")).trim(),responsible:String(fd.get("responsible")).trim(),service_type:String(fd.get("serviceType")),income:Number(fd.get("income")||0),status:String(fd.get("status")),notes:String(fd.get("notes")||"").trim()};
    const {error}=await supabase.from("trips").update(p).eq("id",id);
    if(error)return fail("actualizar el viaje",error);
    editingTripId=null;$("tripModal").classList.remove("open");$("tripForm").reset();notify("Viaje actualizado.");location.reload();
  },true);
}

// ---------------- COMBUSTIBLE EN GALONES ----------------
async function enableGallonsFuel() {
  const form=$("fuelForm"),tbody=$("fuelTableBody");
  if(!form||!tbody)return;
  const labels=form.querySelectorAll("label");
  labels.forEach(l=>{if(l.textContent.includes("Litros"))l.childNodes[0].textContent="Galones *";if(l.textContent.includes("Precio por litro"))l.childNodes[0].textContent="Precio por galón (Q) *";});
  const head=tbody.closest("table")?.querySelector("thead");
  if(head)head.innerHTML="<tr><th>Fecha</th><th>Vehículo</th><th>Galones</th><th>Precio / galón</th><th>Total</th><th>Odómetro</th><th>Km recorridos</th><th>Proveedor</th><th>Acciones</th></tr>";
  const load=async()=>{
    const fuelColumns=allowed.has("finanzas")?"*":"id,vehicle_id,entry_date,gallons,odometer,kilometers_driven,supplier,notes,created_by,created_at,updated_at,previous_odometer";
    const [fr,vr]=await Promise.all([supabase.from("fuel_entries").select(fuelColumns).order("entry_date",{ascending:false}),supabase.from("vehicles").select("id,code,plate")]);
    if(fr.error)throw fr.error;if(vr.error)throw vr.error;
    fuel=fr.data||[];vehicles=vr.data||[];
    renderingFuel=true;
    tbody.innerHTML=fuel.length?fuel.map(x=>'<tr><td>'+esc(x.entry_date)+'</td><td>'+esc(vehicles.find(v=>v.id===x.vehicle_id)?.code||"—")+'</td><td>'+Number(x.gallons||0).toFixed(2)+'</td><td>'+(allowed.has("finanzas")?money(x.price_per_gallon):"—")+'</td><td><strong>'+(allowed.has("finanzas")?money(x.total_cost):"—")+'</strong></td><td>'+(x.odometer??"—")+'</td><td>'+(x.kilometers_driven==null?"—":Number(x.kilometers_driven).toLocaleString("es-GT")+" km")+'</td><td>'+esc(x.supplier||"—")+'</td><td><div class="ext-actions"><button class="ext-action light" data-ext-edit-fuel="'+x.id+'">Editar</button><button class="ext-action light" data-ext-del-fuel="'+x.id+'">Eliminar</button></div></td></tr>').join(""):'<tr><td colspan="9" class="empty-state">No hay cargas registradas.</td></tr>';
  };
  const obs=new MutationObserver(()=>{
    if(renderingFuel){renderingFuel=false;return;}
    load().catch(e=>console.error(e));
  });
  obs.observe(tbody,{childList:true});
  await load();
  tbody.addEventListener("click",async e=>{
    const ed=e.target.closest("[data-ext-edit-fuel]"),del=e.target.closest("[data-ext-del-fuel]");
    if(!ed&&!del)return;e.stopImmediatePropagation();
    if(del){
      if(!confirm("¿Eliminar este registro de combustible?"))return;
      const {error}=await supabase.from("fuel_entries").delete().eq("id",del.dataset.extDelFuel);
      if(error)return fail("eliminar el combustible",error);await load();return;
    }
    const x=fuel.find(x=>x.id===ed.dataset.extEditFuel);if(!x)return;
    editingFuelId=x.id;
    $("fuelVehicle").value=x.vehicle_id;$("fuelDate").value=x.entry_date;$("fuelLiters").value=x.gallons;$("fuelPrice").value=x.price_per_gallon;$("fuelCost").value=x.total_cost;$("fuelOdometer").value=x.odometer??"";$("fuelSupplier").value=x.supplier||"";$("fuelNotes").value=x.notes||"";
    $("fuelModalTitle").textContent="Editar combustible";$("fuelModal").classList.add("open");
  },true);
  form.addEventListener("submit",async e=>{
    e.preventDefault();e.stopImmediatePropagation();
    const gallons=Number($("fuelLiters").value),price=Number($("fuelPrice").value),odo=$("fuelOdometer").value?Number($("fuelOdometer").value):null;
    if(gallons<=0||price<0)return notify("Ingresa galones y precio válidos.");
    const financeAccess=allowed.has("finanzas");
    const safePrice=financeAccess?price:0;
    const p={vehicle_id:$("fuelVehicle").value,entry_date:$("fuelDate").value,gallons,price_per_gallon:safePrice,liters:Number((gallons*3.785411784).toFixed(3)),price_per_liter:Number((safePrice/3.785411784).toFixed(4)),total_cost:Number((gallons*safePrice).toFixed(2)),odometer:odo,supplier:$("fuelSupplier").value.trim(),notes:$("fuelNotes").value.trim(),created_by:userId};
    const q=editingFuelId?supabase.from("fuel_entries").update(p).eq("id",editingFuelId):supabase.from("fuel_entries").insert(p);
    const {error}=await q;if(error)return fail("guardar el combustible",error);
    editingFuelId=null;$("fuelModal").classList.remove("open");form.reset();await load();
  },true);
}
init();
