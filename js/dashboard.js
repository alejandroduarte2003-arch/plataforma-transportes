
import { supabase } from "./config.js";

// =====================================
// DATOS DE PRUEBA
// =====================================

const dashboardData = {
    vehicles: 8,
    trips: 24,
    income: 18500,
    expenses: 7250
};

// =====================================
// ELEMENTOS
// =====================================

const elements = {
    activeVehicles: document.getElementById("activeVehicles"),
    totalTrips: document.getElementById("totalTrips"),
    totalIncome: document.getElementById("totalIncome"),
    totalExpenses: document.getElementById("totalExpenses"),

    financialIncome: document.getElementById("financialIncome"),
    financialExpenses: document.getElementById("financialExpenses"),
    financialBalance: document.getElementById("financialBalance"),

    currentDate: document.getElementById("currentDate"),
    sidebarUser: document.getElementById("sidebarUser"),
    welcomeUser: document.getElementById("welcomeUser"),

    logoutButton: document.getElementById("logoutButton")
};

// =====================================
// FORMATO DE MONEDA
// =====================================

function formatCurrency(value) {
    return new Intl.NumberFormat("es-GT", {
        style: "currency",
        currency: "GTQ",
        maximumFractionDigits: 2
    }).format(value);
}

// =====================================
// MOSTRAR FECHA
// =====================================

function showDate() {

    const date = new Date();

    elements.currentDate.textContent =
        date.toLocaleDateString("es-GT", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        });

}

// =====================================
// CARGAR INDICADORES
// =====================================

function loadDashboard() {

    const balance = dashboardData.income - dashboardData.expenses;

    elements.activeVehicles.textContent = dashboardData.vehicles;

    elements.totalTrips.textContent = dashboardData.trips;

    elements.totalIncome.textContent =
        formatCurrency(dashboardData.income);

    elements.totalExpenses.textContent =
        formatCurrency(dashboardData.expenses);

    elements.financialIncome.textContent =
        formatCurrency(dashboardData.income);

    elements.financialExpenses.textContent =
        formatCurrency(dashboardData.expenses);

    elements.financialBalance.textContent =
        formatCurrency(balance);

}

// =====================================
// GRÁFICO FINANCIERO
// =====================================

function loadFinancialChart() {

    const canvas = document.getElementById("financialChart");

    if (!canvas || typeof Chart === "undefined") return;

    new Chart(canvas, {
        type: "bar",

        data: {
            labels: ["Julio", "Agosto", "Septiembre", "Octubre", "Noviembre"],

            datasets: [
                {
                    label: "Ingresos",
                    data: [12000, 14500, 16000, 17500, 18500],
                    backgroundColor: "#F47721",
                    borderRadius: 5
                },

                {
                    label: "Gastos",
                    data: [6500, 7200, 6800, 8000, 7250],
                    backgroundColor: "#DDE1E7",
                    borderRadius: 5
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        boxWidth: 7,
                        font: {
                            family: "Inter",
                            size: 10
                        }
                    }
                }
            },

            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: "#F0F1F3"
                    },
                    ticks: {
                        font: {
                            size: 9
                        }
                    }
                },

                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 9
                        }
                    }
                }
            }
        }
    });

}

// =====================================
// USUARIO
// =====================================

async function loadUser() {

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        window.location.href = "login.html";
        return;
    }

    const user = data.user;

    const userName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "Administrador";

    elements.sidebarUser.textContent = userName;
    elements.welcomeUser.textContent = userName;

}

// =====================================
// CERRAR SESIÓN
// =====================================

elements.logoutButton.addEventListener("click", async () => {

    elements.logoutButton.disabled = true;

    const { error } = await supabase.auth.signOut();

    if (error) {
        alert("No fue posible cerrar la sesión.");
        elements.logoutButton.disabled = false;
        return;
    }

    window.location.href = "login.html";

});

// =====================================
// INICIALIZACIÓN
// =====================================

async function initDashboard() {

    showDate();

    loadDashboard();

    loadFinancialChart();

    await loadUser();

}

initDashboard();
