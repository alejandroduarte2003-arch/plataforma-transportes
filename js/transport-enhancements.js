import { supabase } from "./config.js";

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(n || 0));
const today = () => new Date().toLocaleDateString("en-CA");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
let userId = null, isAdmin = false, allowed = new Set();
let contracts = [], passengers = [], assignments = [], trips = [], tripBoardings = [];
let students = [], schoolCaps = {};
let employees = [], compensation = [], loans = [], payroll = [];
let fuel = [], vehicles = [], editingFuelId = null, editingTripId = null, renderingFuel = false;

function notify(message) { alert(message); }
function fail(action, error) { console.error(action, error); notify("No se pudo " + action + ": " + (error?.message || "Intenta nuevamente.")); }
function addStyle() {
  const style = document.createElement("style");
  style.textContent = ".ext-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:18px 0}.ext-card{background:#fff;border:1px solid #e5e7eb;border-radius:9px;padding:18px;min-width:0}.ext-card h3{font-size:14px;margin-bottom:12px}.ext-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ext-form label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:600}.ext-form input,.ext-form select,.ext-form textarea{width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:6px;font:inherit;font-size:12px;background:#fff;color:#111827}.ext-form .full{grid-column:1/-1}.ext-form button,.ext-action{background:#172554;color:#fff;border:0;border-radius:6px;padding:10px 13px;font-size:11px;font-weight:600;cursor:pointer}.ext-action.light{background:#fff;color:#172554;border:1px solid #e5e7eb}.ext-table{overflow:auto;margin-top:12px}.ext-table table{width:100%;border-collapse:collapse;min-width:600px}.ext-table th,.ext-table td{padding:11px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:11px}.ext-table th{background:#f9fafb;color:#6b7280}.ext-actions{display:flex;gap:6px;flex-wrap:wrap}.ext-note{font-size:11px;color:#6b7280;line-height:1.6;margin-top:8px}.ext-heading{margin:4px 0 16px}.ext-heading h1{font-size:23px;margin-bottom:6px}.ext-heading p{font-size:12px;color:#6b7280}.ext-hidden{display:none!important}@media(max-width:760px){.ext-grid{grid-template-columns:1fr}.ext-form{grid-template-columns:1fr}.ext-form .full{grid-column:auto}}";
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
    '<div class="ext-grid">' +
      '<div class="ext-card"><h3>Nuevo contrato</h3><form id="extContractForm" class="ext-form">' +
        '<label class="full">Nombre del contrato<input name="name" required maxlength="150"></label>' +
        '<label>Cliente<input name="client_name" maxlength="150"></label><label>Estado<select name="status"><option>Activo</option><option>Inactivo</option><option>Finalizado</option></select></label>' +
        '<label>Inicio<input name="start_date" type="date"></label><label>Finalización<input name="end_date" type="date"></label>' +
        '<label class="full">Observaciones<textarea name="notes"></textarea></label><button class="full" type="submit">Guardar contrato</button></form></div>' +
      '<div class="ext-card"><h3>Registrar pasajero</h3><form id="extPassengerForm" class="ext-form">' +
        '<label class="full">Nombre completo<input name="full_name" required maxlength="150"></label><label>Contacto<input name="contact" maxlength="80"></label>' +
        '<label class="full">Observaciones<textarea name="notes"></textarea></label><button class="full" type="submit">Guardar pasajero</button></form></div>' +
    '</div>' +
    '<div class="ext-grid">' +
      '<div class="ext-card"><h3>Asignar pasajero a contrato</h3><form id="extAssignForm" class="ext-form">' +
        '<label class="full">Contrato<select name="contract_id" id="extContractSelect" required></select></label>' +
        '<label class="full">Pasajero<select name="passenger_id" id="extPassengerSelect" required></select></label>' +
        '<label class="full">Punto de abordaje<input name="pickup_point" maxlength="180"></label><button class="full" type="submit">Agregar a la lista</button></form></div>' +
      '<div class="ext-card"><h3>Registrar abordaje por viaje</h3><form id="extTripBoardingForm" class="ext-form">' +
        '<label class="full">Viaje<select name="trip_id" id="extTripSelect" required></select></label>' +
        '<label class="full">Pasajero<select name="passenger_id" id="extTripPassengerSelect" required></select></label>' +
        '<label>Fecha y hora<input name="boarded_at" type="datetime-local" required></label><label>Punto de abordaje<input name="boarding_point" maxlength="180"></label>' +
        '<label class="full">Observaciones<textarea name="notes"></textarea></label><button class="full" type="submit">Registrar abordaje</button></form></div>' +
    '</div>' +
    '<div class="ext-card"><h3>Contratos y listas de pasajeros</h3><div id="extContractsTable" class="ext-table"></div></div>' +
    '<div class="ext-card"><h3>Pasajeros asignados a contratos</h3><div id="extAssignmentsTable" class="ext-table"></div></div>' +
    '<div class="ext-card"><h3>Abordajes por viaje</h3><div id="extTripBoardingsTable" class="ext-table"></div><p class="ext-note">Un pasajero puede aparecer en varios viajes. Cada registro queda asociado al viaje específico.</p></div>';
  $("extContractForm").addEventListener("submit", async e => {
    e.preventDefault(); const p = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (p.start_date === "") p.start_date = null; if (p.end_date === "") p.end_date = null;
    p.created_by = userId;
    const { error } = await supabase.from("transport_contracts").insert(p);
    if (error) return fail("guardar el contrato", error);
    e.currentTarget.reset(); await loadBoardingsData();
  });
  $("extPassengerForm").addEventListener("submit", async e => {
    e.preventDefault(); const p = Object.fromEntries(new FormData(e.currentTarget).entries()); p.created_by = userId;
    const { error } = await supabase.from("transport_passengers").insert(p);
    if (error) return fail("guardar el pasajero", error);
    e.currentTarget.reset(); await loadBoardingsData();
  });
  $("extAssignForm").addEventListener("submit", async e => {
    e.preventDefault(); const p = Object.fromEntries(new FormData(e.currentTarget).entries());
    const { error } = await supabase.from("contract_passengers").upsert(p, { onConflict:"contract_id,passenger_id" });
    if (error) return fail("asignar el pasajero al contrato", error);
    e.currentTarget.reset(); await loadBoardingsData();
  });
  $("extTripBoardingForm").addEventListener("submit", async e => {
    e.preventDefault(); const p = Object.fromEntries(new FormData(e.currentTarget).entries());
    p.boarded_at = new Date(p.boarded_at).toISOString(); p.created_by = userId;
    const { error } = await supabase.from("trip_passenger_boardings").insert(p);
    if (error) return fail("registrar el abordaje", error);
    e.currentTarget.reset(); await loadBoardingsData();
  });
  $("extContractsTable").addEventListener("click", async e => {
    const b = e.target.closest("[data-del-contract]"); if (!b) return;
    if (!confirm("¿Eliminar el contrato y sus asignaciones?")) return;
    const { error } = await supabase.from("transport_contracts").delete().eq("id", b.dataset.delContract);
    if (error) return fail("eliminar el contrato", error); await loadBoardingsData();
  });
  $("extAssignmentsTable").addEventListener("click", async e => {
    const b = e.target.closest("[data-del-assignment]"); if (!b) return;
    const [contract_id, passenger_id] = b.dataset.delAssignment.split("|");
    const { error } = await supabase.from("contract_passengers").delete().eq("contract_id", contract_id).eq("passenger_id", passenger_id);
    if (error) return fail("quitar el pasajero del contrato", error); await loadBoardingsData();
  });
  $("extTripBoardingsTable").addEventListener("click", async e => {
    const b = e.target.closest("[data-del-trip-boarding]"); if (!b) return;
    const { error } = await supabase.from("trip_passenger_boardings").delete().eq("id", b.dataset.delTripBoarding);
    if (error) return fail("eliminar el abordaje", error); await loadBoardingsData();
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
    '<div class="ext-grid">' +
      '<div class="ext-card"><h3>Nuevo expediente</h3><form id="extStudentForm" class="ext-form">' +
        '<label class="full">Nombre completo<input name="full_name" required maxlength="160"></label>' +
        '<label>Teléfono encargado<input name="guardian_phone" maxlength="40"></label><label>Relación<input name="guardian_relationship" maxlength="80"></label>' +
        '<label>Centro educativo<input name="school_name" maxlength="160"></label><label>Estado<select name="status"><option>Activo</option><option>Inactivo</option></select></label>' +
        '<label class="full">Dirección mañana<input name="address_am" maxlength="250"></label><label class="full">Dirección tarde<input name="address_pm" maxlength="250"></label>' +
        '<button class="full" type="submit">Guardar expediente</button></form></div>' +
      '<div class="ext-card"><h3>Nuevo seguimiento</h3><form id="extFollowupForm" class="ext-form">' +
        '<label class="full">Alumno<select name="student_id" id="extFollowupStudent" required></select></label>' +
        '<label class="full">Asunto<input name="subject" required maxlength="160"></label><label class="full">Detalle<textarea name="detail" required></textarea></label>' +
        '<button class="full" type="submit">Guardar seguimiento</button></form>' +
        '<div id="extSchoolPaymentBox"></div></div>' +
    '</div><div class="ext-card"><h3>Expedientes de estudiantes</h3><div id="extStudentsTable" class="ext-table"></div></div>' +
    '<div class="ext-card"><h3>Seguimientos</h3><div id="extFollowupsTable" class="ext-table"></div></div>' +
    '<div class="ext-card" id="extSchoolPaymentsHistory"></div>';
  const { data: caps, error: ce } = await supabase.from("school_user_permissions").select("can_edit_students,can_edit_followups,can_register_payments").eq("user_id",userId).maybeSingle();
  if (ce) throw ce;
  schoolCaps=caps||{};
  if (isAdmin) schoolCaps={can_edit_students:true,can_edit_followups:true,can_register_payments:true};
  if (!schoolCaps.can_edit_students) $("extStudentForm").classList.add("ext-hidden");
  if (!schoolCaps.can_edit_followups) $("extFollowupForm").classList.add("ext-hidden");
  if (schoolCaps.can_register_payments || allowed.has("finanzas")) {
    $("extSchoolPaymentBox").innerHTML='<h3 style="margin-top:16px">Registrar pago</h3><form id="extSchoolPaymentForm" class="ext-form"><label class="full">Alumno<select name="student_id" id="extPaymentStudent" required></select></label><label class="full">Monto (Q)<input name="amount" type="number" min=".01" step=".01" required></label><label class="full">Referencia<input name="reference" maxlength="160"></label><button class="full" type="submit">Registrar pago</button></form>';
    $("extSchoolPaymentForm").addEventListener("submit", async e=>{
      e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget).entries());
      const p={student_id:d.student_id,amount:Number(d.amount),reference:d.reference||"",paid_at:new Date().toISOString(),payment_status:"Realizado",enrollment_status:"Vigente",created_by:userId,request_key:crypto.randomUUID()};
      const {error}=await supabase.from("school_student_payments").insert(p);
      if(error)return fail("registrar el pago del alumno",error);
      e.currentTarget.reset();notify("Pago registrado. El detalle económico se consulta desde Finanzas.");
      if(allowed.has("finanzas")) await loadSchoolPayments();
    });
  } else $("extSchoolPaymentBox").innerHTML='<p class="ext-note">No tienes permiso para registrar pagos.</p>';
  $("extStudentForm").addEventListener("submit", async e=>{
    e.preventDefault();const p=Object.fromEntries(new FormData(e.currentTarget).entries());p.created_by=userId;
    const {error}=await supabase.from("school_students").insert(p);if(error)return fail("guardar el expediente",error);
    e.currentTarget.reset();await loadSchoolData();
  });
  $("extFollowupForm").addEventListener("submit", async e=>{
    e.preventDefault();const p=Object.fromEntries(new FormData(e.currentTarget).entries());p.created_by=userId;
    const {error}=await supabase.from("school_student_followups").insert(p);if(error)return fail("guardar el seguimiento",error);
    e.currentTarget.reset();await loadSchoolData();
  });
  $("extStudentsTable").addEventListener("click",async e=>{
    const b=e.target.closest("[data-del-student]");if(!b)return;
    if(!confirm("¿Eliminar este expediente?"))return;
    const {error}=await supabase.from("school_students").delete().eq("id",b.dataset.delStudent);
    if(error)return fail("eliminar el expediente",error);await loadSchoolData();
  });
  $("extFollowupsTable").addEventListener("click",async e=>{
    const b=e.target.closest("[data-del-followup]");if(!b)return;
    if(!confirm("¿Eliminar este seguimiento?"))return;
    const {error}=await supabase.from("school_student_followups").delete().eq("id",b.dataset.delFollowup);
    if(error)return fail("eliminar el seguimiento",error);await loadSchoolData();
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
  students=sr.data||[];const followups=fr.data||[];
  const options='<option value="">Seleccionar alumno</option>'+students.map(s=>'<option value="'+s.id+'">'+esc(s.student_code)+' · '+esc(s.full_name)+'</option>').join("");
  $("extFollowupStudent").innerHTML=options;
  if($("extPaymentStudent"))$("extPaymentStudent").innerHTML=options;
  $("extStudentsTable").innerHTML='<table><thead><tr><th>ID</th><th>Alumno</th><th>Centro educativo</th><th>Encargado</th><th>Estado</th><th></th></tr></thead><tbody>'+students.map(s=>'<tr><td>'+esc(s.student_code)+'</td><td>'+esc(s.full_name)+'</td><td>'+esc(s.school_name)+'</td><td>'+esc(s.guardian_phone)+'</td><td>'+esc(s.status)+'</td><td>'+(schoolCaps.can_edit_students||isAdmin?'<button class="ext-action light" data-del-student="'+s.id+'">Eliminar</button>':"")+'</td></tr>').join("")+'</tbody></table>';
  $("extFollowupsTable").innerHTML='<table><thead><tr><th>Fecha</th><th>Alumno</th><th>Asunto</th><th>Detalle</th><th></th></tr></thead><tbody>'+followups.map(f=>'<tr><td>'+esc(new Date(f.followup_date).toLocaleDateString("es-GT"))+'</td><td>'+esc(students.find(s=>s.id===f.student_id)?.full_name||"—")+'</td><td>'+esc(f.subject)+'</td><td>'+esc(f.detail)+'</td><td>'+(schoolCaps.can_edit_followups||isAdmin?'<button class="ext-action light" data-del-followup="'+f.id+'">Eliminar</button>':"")+'</td></tr>').join("")+'</tbody></table>';
}
async function loadSchoolPayments() {
  const {data,error}=await supabase.from("school_student_payments").select("*").order("paid_at",{ascending:false});
  if(error)throw error;
  $("extSchoolPaymentsHistory").innerHTML='<h3>Pagos escolares · Finanzas</h3><div class="ext-table"><table><thead><tr><th>Fecha</th><th>Alumno</th><th>Monto</th><th>Estado</th><th>Referencia</th></tr></thead><tbody>'+(data||[]).map(p=>'<tr><td>'+esc(new Date(p.paid_at).toLocaleDateString("es-GT"))+'</td><td>'+esc(students.find(s=>s.id===p.student_id)?.full_name||"—")+'</td><td>'+money(p.amount)+'</td><td>'+esc(p.payment_status)+'</td><td>'+esc(p.reference)+'</td></tr>').join("")+'</tbody></table></div>';
}

// ---------------- FINANZAS: COMPENSACIÓN, PRÉSTAMOS Y PLANILLA ----------------
async function initFinance() {
  const view=$("view-finanzas");
  const wrap=document.createElement("div");
  wrap.className="ext-card";
  wrap.innerHTML='<h3>Compensación individual por trabajador</h3><form id="extCompForm" class="ext-form">' +
    '<label class="full">Trabajador<select id="extCompEmployee" name="employee_id" required></select></label>' +
    '<label>Sueldo base mensual (Q)<input name="monthly_base_salary" type="number" min="0" step=".01" required></label>' +
    '<label>Bono KPI máximo mensual (Q)<input name="monthly_kpi_bonus_max" type="number" min="0" step=".01" value="0" required></label>' +
    '<button class="full" type="submit">Guardar compensación</button></form><p class="ext-note">El sistema divide el sueldo base y el bono KPI mensual en dos quincenas. El bono se calcula con el promedio de los tres KPI.</p>' +
    '<div id="extCompTable" class="ext-table"></div>';
  const loansCard=document.createElement("div");
  loansCard.className="ext-card";
  loansCard.innerHTML='<h3>Préstamos de trabajadores</h3><form id="extLoanForm" class="ext-form">' +
    '<label class="full">Trabajador<select name="employee_id" id="extLoanEmployee" required></select></label>' +
    '<label class="full">Motivo<input name="reason" maxlength="180"></label>' +
    '<label>Monto (Q)<input name="amount" type="number" min=".01" step=".01" required></label>' +
    '<label>Cuotas quincenales (máximo 12)<input name="installments_total" id="extLoanTerms" type="number" min="1" max="12" required></label>' +
    '<label>Cuota por quincena (Q)<input id="extLoanInstallment" readonly></label><label>Fecha de inicio<input name="start_date" type="date" value="'+today()+'" required></label>' +
    '<button class="full" type="submit">Registrar préstamo</button></form><div id="extLoansTable" class="ext-table"></div>';
  const payrollCard=document.createElement("div");
  payrollCard.className="ext-card";
  payrollCard.innerHTML='<h3>Planilla quincenal</h3><form id="extPayrollForm" class="ext-form">' +
    '<label class="full">Trabajador<select name="employee_id" id="extPayrollEmployee" required></select></label>' +
    '<label>Mes<input name="period" type="month" value="'+today().slice(0,7)+'" required></label><label>Quincena<select name="fortnight"><option value="1">Primera</option><option value="2">Segunda</option></select></label>' +
    '<label>Quejas (1–5)<select name="kpi_complaints"><option value="">Sin evaluar</option><option value="1">1 · 0%</option><option value="2">2 · 25%</option><option value="3">3 · 50%</option><option value="4">4 · 75%</option><option value="5">5 · 100%</option></select></label>' +
    '<label>Limpieza (1–5)<select name="kpi_cleanliness"><option value="">Sin evaluar</option><option value="1">1 · 0%</option><option value="2">2 · 25%</option><option value="3">3 · 50%</option><option value="4">4 · 75%</option><option value="5">5 · 100%</option></select></label>' +
    '<label>Retrasos (1–5)<select name="kpi_delays"><option value="">Sin evaluar</option><option value="1">1 · 0%</option><option value="2">2 · 25%</option><option value="3">3 · 50%</option><option value="4">4 · 75%</option><option value="5">5 · 100%</option></select></label>' +
    '<label>Otras deducciones (Q)<input name="other_deductions" type="number" min="0" step=".01" value="0"></label>' +
    '<button class="full" type="submit">Calcular y guardar quincena</button></form><p class="ext-note">KPI con ponderación igual: 1 = 0%, 2 = 25%, 3 = 50%, 4 = 75%, 5 = 100%. La bonificación mensual individual se divide entre dos y se ajusta al porcentaje alcanzado. El préstamo se descuenta automáticamente del sueldo base quincenal.</p>' +
    '<div id="extPayrollTable" class="ext-table"></div>';
  const grid=document.createElement("div");grid.className="ext-grid";grid.append(wrap,loansCard);
  view.appendChild(grid);view.appendChild(payrollCard);
  await loadFinanceDataExt();
  $("extCompForm").addEventListener("submit",async e=>{
    e.preventDefault();const p=Object.fromEntries(new FormData(e.currentTarget).entries());
    p.monthly_base_salary=Number(p.monthly_base_salary);p.monthly_kpi_bonus_max=Number(p.monthly_kpi_bonus_max);p.currency="GTQ";
    const {error}=await supabase.from("employee_compensation").upsert(p,{onConflict:"employee_id"});
    if(error)return fail("guardar la compensación",error);await loadFinanceDataExt();notify("Compensación guardada.");
  });
  $("extLoanTerms").addEventListener("input",calcLoanInstallment);
  $("extLoanForm").addEventListener("input",calcLoanInstallment);
  $("extLoanForm").addEventListener("submit",async e=>{
    e.preventDefault();const p=Object.fromEntries(new FormData(e.currentTarget).entries());
    p.amount=Number(p.amount);p.installments_total=Number(p.installments_total);
    if(p.installments_total<1||p.installments_total>12)return notify("El préstamo debe tener entre 1 y 12 cuotas quincenales.");
    p.balance=p.amount;p.installments_paid=0;p.installment_amount=Number((p.amount/p.installments_total).toFixed(2));p.status="Activo";p.notes="";p.created_by=userId;
    const {error}=await supabase.from("employee_loans").insert(p);
    if(error)return fail("registrar el préstamo",error);e.currentTarget.reset();$("extLoanForm").querySelector('[name="start_date"]').value=today();await loadFinanceDataExt();
  });
  $("extPayrollForm").addEventListener("submit",async e=>{
    e.preventDefault();const p=Object.fromEntries(new FormData(e.currentTarget).entries());
    const period=p.period+"-01",fortnight=Number(p.fortnight);
    const {data:dupe,error:de}=await supabase.from("payroll_records").select("id").eq("employee_id",p.employee_id).eq("period",period).eq("fortnight",fortnight).maybeSingle();
    if(de)return fail("verificar la quincena",de);
    if(dupe)return notify("Ya existe una planilla para ese trabajador y quincena.");
    const payload={employee_id:p.employee_id,period,fortnight,kpi_complaints:p.kpi_complaints?Number(p.kpi_complaints):null,kpi_cleanliness:p.kpi_cleanliness?Number(p.kpi_cleanliness):null,kpi_delays:p.kpi_delays?Number(p.kpi_delays):null,other_deductions:Number(p.other_deductions||0),base_salary:0,bonuses:0,loan_deduction:0,net_pay:0,status:"Pendiente",notes:"",created_by:userId};
    const {error}=await supabase.from("payroll_records").insert(payload);
    if(error)return fail("calcular y guardar la quincena",error);
    e.currentTarget.reset();$("extPayrollForm").querySelector('[name="period"]').value=today().slice(0,7);await loadFinanceDataExt();
  });
  $("extLoansTable").addEventListener("click",async e=>{
    const b=e.target.closest("[data-cancel-loan]");if(!b)return;
    if(!confirm("¿Cancelar este préstamo?"))return;
    const {error}=await supabase.from("employee_loans").update({status:"Cancelado"}).eq("id",b.dataset.cancelLoan);
    if(error)return fail("cancelar el préstamo",error);await loadFinanceDataExt();
  });
  $("extPayrollTable").addEventListener("click",async e=>{
    const b=e.target.closest("[data-payroll-paid]");if(!b)return;
    if(!confirm("¿Confirmas el pago de esta quincena? Se aplicarán los descuentos de préstamo."))return;
    const {error}=await supabase.from("payroll_records").update({status:"Pagada",payment_date:today()}).eq("id",b.dataset.payrollPaid);
    if(error)return fail("marcar la quincena como pagada",error);await loadFinanceDataExt();
  });
}
function calcLoanInstallment() {
  const amount=Number($("extLoanForm")?.querySelector('[name="amount"]')?.value||0);
  const terms=Number($("extLoanTerms")?.value||0);
  $("extLoanInstallment").value=terms>0?money(amount/terms):"";
}
async function loadFinanceDataExt() {
  const [er,cr,lr,pr]=await Promise.all([
    supabase.from("employees").select("id,full_name,position,status").order("full_name"),
    supabase.from("employee_compensation").select("*"),
    supabase.from("employee_loans").select("*").order("created_at",{ascending:false}),
    supabase.from("payroll_records").select("*").order("period",{ascending:false})
  ]);
  for(const r of [er,cr,lr,pr])if(r.error)throw r.error;
  employees=er.data||[];compensation=cr.data||[];loans=lr.data||[];payroll=pr.data||[];
  const opts='<option value="">Seleccionar trabajador</option>'+employees.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+'</option>').join("");
  $("extCompEmployee").innerHTML=opts;$("extLoanEmployee").innerHTML=opts;$("extPayrollEmployee").innerHTML=opts;
  $("extCompTable").innerHTML='<table><thead><tr><th>Trabajador</th><th>Sueldo mensual</th><th>Bono KPI mensual</th></tr></thead><tbody>'+compensation.map(x=>'<tr><td>'+esc(employees.find(e=>e.id===x.employee_id)?.full_name||"—")+'</td><td>'+money(x.monthly_base_salary)+'</td><td>'+money(x.monthly_kpi_bonus_max)+'</td></tr>').join("")+'</tbody></table>';
  $("extLoansTable").innerHTML='<table><thead><tr><th>Trabajador</th><th>Monto</th><th>Saldo</th><th>Cuota</th><th>Cuotas</th><th>Estado</th><th></th></tr></thead><tbody>'+loans.map(x=>'<tr><td>'+esc(employees.find(e=>e.id===x.employee_id)?.full_name||"—")+'</td><td>'+money(x.amount)+'</td><td>'+money(x.balance)+'</td><td>'+money(x.installment_amount)+'</td><td>'+x.installments_paid+'/'+x.installments_total+'</td><td>'+esc(x.status)+'</td><td>'+(x.status==="Activo"?'<button class="ext-action light" data-cancel-loan="'+x.id+'">Cancelar</button>':"")+'</td></tr>').join("")+'</tbody></table>';
  $("extPayrollTable").innerHTML='<table><thead><tr><th>Mes / quincena</th><th>Trabajador</th><th>Base</th><th>KPI</th><th>Bono</th><th>Préstamo</th><th>Neto</th><th>Estado</th><th></th></tr></thead><tbody>'+payroll.map(x=>'<tr><td>'+esc(String(x.period).slice(0,7))+' · '+(x.fortnight===1?"1.ª":"2.ª")+'</td><td>'+esc(employees.find(e=>e.id===x.employee_id)?.full_name||"—")+'</td><td>'+money(x.base_salary)+'</td><td>'+(x.kpi_percentage==null?"—":Number(x.kpi_percentage).toFixed(0)+"%")+'</td><td>'+money(x.bonuses)+'</td><td>'+money(x.loan_deduction)+'</td><td><strong>'+money(x.net_pay)+'</strong></td><td>'+esc(x.status)+'</td><td>'+(x.status==="Pendiente"?'<button class="ext-action" data-payroll-paid="'+x.id+'">Marcar pagada</button>':"")+'</td></tr>').join("")+'</tbody></table>';
  $("extCompEmployee").addEventListener("change",()=>{
    const x=compensation.find(c=>c.employee_id===$("extCompEmployee").value);
    $("extCompForm").querySelector('[name="monthly_base_salary"]').value=x?.monthly_base_salary??"";
    $("extCompForm").querySelector('[name="monthly_kpi_bonus_max"]').value=x?.monthly_kpi_bonus_max??0;
  },{once:true});
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
