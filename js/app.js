import { supabase } from "./config.js";

// =====================================
// ELEMENTOS
// =====================================

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const buttonText = document.getElementById("buttonText");
const loginMessage = document.getElementById("loginMessage");

// =====================================
// MOSTRAR MENSAJES
// =====================================

function showMessage(message, type) {
    loginMessage.textContent = message;
    loginMessage.className = "login-message " + type;
}

// =====================================
// COMPROBAR SESIÓN EXISTENTE
// =====================================

async function checkExistingSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
        console.error("Error verificando sesión:", error.message);
        return;
    }

    if (data.session) {
        window.location.replace("./dashboard.html");
    }
}

// =====================================
// INICIO DE SESIÓN
// =====================================

loginForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginButton.disabled = true;
    buttonText.textContent = "Verificando acceso...";

    loginMessage.className = "login-message";

    try {

        const { error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            throw error;
        }

        showMessage(
            "Acceso correcto. Entrando a la plataforma...",
            "success"
        );

        window.location.replace("./dashboard.html");

    } catch (error) {

        showMessage(
            "No fue posible iniciar sesión. Verifica tus credenciales.",
            "error"
        );

        console.error("Error de autenticación:", error.message);

        loginButton.disabled = false;
        buttonText.textContent = "Ingresar a la plataforma";

    }

});

// =====================================
// INICIAR COMPROBACIÓN
// =====================================

checkExistingSession();
